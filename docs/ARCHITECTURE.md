# 系统架构与模块原理

## 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      浏览器（客户端）                             │
│                                                                   │
│  src/index.html ──────────────────────────────────────────────  │
│  ├── bundle.[hash].js  ← webpack 打包所有 JS 模块                 │
│  │   ├── init.js          SW 注册 + 用户行为追踪（立即执行）        │
│  │   ├── main.js          App 容器 + 模块注册（DOM ready 后初始化） │
│  │   ├── utils.js         业务函数库（IIFE，挂载到 window）         │
│  │   ├── translations.js  TranslationManager（i18n 核心）         │
│  │   ├── image-assets.js  IMAGE_ASSETS 映射表                     │
│  │   └── product-list.js  PRODUCT_SERIES 产品数据                 │
│  └── styles.[hash].css ← PostCSS + Tailwind 编译产物              │
│                                                                   │
│  运行时按需 fetch：                                                │
│  └── /assets/lang/{lang}-ui.json      UI 文本（约 16KB/语言）     │
│  └── /assets/lang/{lang}-product.json 产品文本（约 200KB/语言）   │
└─────────────────────────────────────────────────────────────────┘
                             ↑ 静态资产服务
┌──────────────────────────────────────────────────────────────────┐
│              服务端 / 静态托管                                     │
│  开发：Express (server.js)   生产：Nginx / 静态 CDN              │
└──────────────────────────────────────────────────────────────────┘
                             ↑ 数据/翻译写入
┌──────────────────────────────────────────────────────────────────┐
│              构建时数据层                                          │
│  飞书多维表格 → generate-products-data-table.js                   │
│               → src/assets/product-data-table.js（自动生成）      │
│  Gemini API   → unified-translator.js → {lang}-product.json      │
└──────────────────────────────────────────────────────────────────┘
```

---

## 前端模块详解

### 1. `init.js` — 立即执行层

**职责：** 页面加载时第一批执行的代码，不等待 DOM ready。

**Service Worker 注册流程：**
```
navigator.serviceWorker.register('./sw.js')
  ├── updatefound 事件 → 新 SW 安装中
  │     └── statechange === 'installed' + controller 存在
  │           → showServiceWorkerUpdateNotification()（弹出"有新版本"提示）
  ├── controllerchange 事件 → 新 SW 已激活 → window.location.reload()
  └── registration.waiting 存在 → 直接弹出更新提示（页面刷新前已有等待中的 SW）
```

**更新通知机制：**
- 通过 `document.getElementById('sw-update-notification')` 判断是否已弹出，避免重复
- 用户点击"立即更新" → 向 waiting SW 发送 `{ type: 'SKIP_WAITING' }` → 触发 `controllerchange` → 自动刷新
- 用户点击关闭 → 仅移除通知 DOM，不触发更新（下次加载页面时再次提示）

**用户行为追踪（`userActivity` 对象）：**
- 每秒递增 `timeOnPage`、`timeOnProductSection`
- 监听 scroll / mousemove / click 更新 `lastActivityTime` 和 `scrollDepth`
- `inProductSection` 通过 `#produkten` 区域的 IntersectionObserver 维护
- 追踪数据供 `utils.js` 的弹窗系统（Smart Popup）使用，控制弹出时机

---

### 2. `main.js` — App 容器与模块注册

**架构模式：** `App` 类持有所有功能模块，统一初始化，单点管理。

```javascript
// 注册顺序决定初始化顺序
app.registerModule('formValidation', new FormValidationModule());
app.registerModule('lazyLoading',    new LazyLoadingModule());
app.registerModule('errorHandling',  new ErrorHandlingModule());
```

**初始化流程：**
1. DOM ready（`DOMContentLoaded` 或已加载）时调用 `app.initialize()`
2. 遍历所有注册模块，依次调用 `module.init()`
3. 全部无错误 → `<main>` 元素添加 `.loaded` 类（消除 FOUC）
4. 设置 `this.initialized = true`，防止重复初始化

**三个内置模块：**

| 模块 | 类名 | 职责 |
|------|------|------|
| formValidation | `FormValidationModule` | 拦截 `<form>` submit，校验 `required` 字段 |
| lazyLoading | `LazyLoadingModule` | `IntersectionObserver` 管理 `img[data-src]` 懒加载 |
| errorHandling | `ErrorHandlingModule` | 全局 JS 错误、未处理 Promise rejection、网络状态监听 |

**LazyLoadingModule 详细机制：**
- `rootMargin: '100px'`：图片进入视口前 100px 即开始加载
- 使用 `data-lazyObserved='1'` 标记已被 Observer 观察的图片，避免重复注册
- `MutationObserver` 监听 `#product-grid`（或 `#products`），自动处理动态渲染的产品卡片图片
- 加载失败降级：WebP → PNG（同名）→ 内联 SVG 占位图

---

### 3. `utils.js` — 业务函数库

**加载方式：** IIFE（立即执行函数表达式），所有函数挂载到 `window` 对象，供其他模块调用。

```javascript
(function attachAppUtils(global) {
  // 所有函数定义在此闭包内
  global.tr = tr;
  global.renderProducts = renderProducts;
  global.goToPage = goToPage;
  // ...
})(window);
```

**事件绑定机制（CSP 兼容）：**

服务端 CSP 配置了 `script-src-attr 'none'`，**全站禁止内联事件属性**（`onclick="..."`、`onsubmit="..."` 等）。所有事件通过以下两种方式绑定：

1. **静态 HTML 元素** — 由 `bindAllEvents()` 函数在 `DOMContentLoaded` 时统一用 `addEventListener` 绑定。该函数在 IIFE 末尾定义并自动调用。

2. **动态渲染的 HTML**（`innerHTML` 方式注入）— 每次渲染后立即在容器内用 `querySelectorAll` + `addEventListener` 重新绑定。涉及函数：
   - `renderProductFilters()` — filter 按钮，通过 `data-filter` 属性委托绑定
   - `renderMobileProductSideControls()` — 移动端轮播导航，通过 `id` 直接绑定
   - `renderProducts()` — 产品卡片按钮，通过 `data-action="show-popup"` 委托绑定；同时重新绑定 filter 按钮
   - `renderPagination()` — 分页按钮，通过 `data-page` 属性委托绑定
   - meta 区域分页上/下页按钮，通过 `data-page` 属性委托绑定（随 `renderProducts` 内调用的 meta 渲染一并处理）

**数据属性约定：**

| 属性 | 用途 |
|------|------|
| `data-filter="<key>"` | 产品系列过滤按钮标识 |
| `data-page="<n>"` | 分页按钮目标页码 |
| `data-action="show-popup"` | 触发 Smart Popup 弹窗的按钮（静态 HTML 与动态卡片统一） |
| `data-code="<lang>"` | 语言切换按钮语言代码 |
| `data-i18n="<key>"` | 需要国际化翻译的元素 |

**函数分类：**

| 分类 | 主要函数 |
|------|---------|
| 翻译 | `tr(key, fallback)` — 翻译快捷函数 |
| 产品展示 | `renderProducts()` `renderProductFilters()` `renderPagination()` |
| 分页 | `goToPage(page)` `getItemsPerPage()` |
| 移动端适配 | `isMobileProductCarousel()` `scrollMobileProducts()` |
| 图片 | `resolveImage(key)` `applyImageAssets(root)` |
| 联系方式 | `startWhatsApp()` `startEmail()` `startPhone()` 等 |
| 暗色模式 | `initDarkMode()` |
| 弹窗 | `applyPopupVisibility()` `showSmartPopupManual()` `closeSmartPopup()` |
| 表单 | `submitViaMailto(formData, formType)` |
| 状态追踪 | `loadUserState()` `saveUserState()` `trackScrollDepth()` |
| 事件绑定 | `bindAllEvents()` — DOMContentLoaded 时统一绑定所有静态 HTML 事件 |

---

### 4. `translations.js` — 国际化核心

**TranslationManager 类结构：**

```
currentLanguage      当前语言（localStorage 优先，默认 zh-CN）
translationsCache    Map<lang, mergedTranslations>  已加载缓存
pendingLoads         Map<lang, Promise>             防并发重复加载
keyPathCache         Map<key, path>                 键路径缓存（性能优化）
domObserver          MutationObserver               DOM 变化自动翻译
cachedElements       已缓存的 DOM 元素引用（减少 querySelectorAll 开销）
```

**翻译加载流程：**
```
loadTranslations(lang)
  ├── 命中 translationsCache → 直接返回
  ├── 命中 pendingLoads → 等待已有 Promise（防重复请求）
  └── fetchTranslations(lang)
        ├── loadUITranslations(lang)     → fetch /assets/lang/{lang}-ui.json
        ├── loadProductTranslations(lang) → fetch /assets/lang/{lang}-product.json
        ├── mergeTranslations(ui, product)
        ├── 写入 translationsCache
        └── 失败时 fallback 到 zh-CN
```

**文件分离策略（UI 优先）：**
- `{lang}-ui.json`：约 16KB，页面文本、导航、标签等，首屏必需
- `{lang}-product.json`：约 200KB，产品名称、参数描述等，按需加载

**DOM 自动翻译：**  
通过 `data-i18n="key"` 属性标记需要翻译的元素，`TranslationManager` 在语言切换时批量更新。

---

### 5. `image-assets.js` — 图片路径映射

**构建时静态 import manifest：**
```javascript
import manifest from './images/image-manifest.json';
// → IMAGE_ASSETS 在模块加载时同步可用，无运行时 fetch
```

**分类规则：**
- `NON_PRODUCT_KEYS`：logo、背景、证书、工厂图等固定资产（硬编码路径）
- `productImages`：从 manifest 自动展开，过滤 NON_PRODUCT_KEYS 后动态生成

**对外 API：**
```javascript
IMAGE_ASSETS['esl_gb60_1']   // → 'images/esl_gb60_1.webp'
resolveImage('esl_gb60_1')   // → 'images/esl_gb60_1.webp'
imgTag('esl_gb60_1', 'alt')  // → '<img src="images/esl_gb60_1.webp" ...>'
```

---

### 6. `product-list.js` — 产品数据处理

见 [PRODUCT_DATA.md](./PRODUCT_DATA.md) 的详细说明。

---

## 服务端（`server.js`）

**技术栈：** Express + Helmet + express-rate-limit + compression

**安全配置（Helmet）：**

| 策略 | 值 |
|------|-----|
| CSP defaultSrc | `'self'` |
| CSP styleSrc | `'self'` `'unsafe-inline'` `fonts.googleapis.com` |
| CSP scriptSrc | `'self'` `cdn.tailwindcss.com` |
| CSP scriptSrcAttr | `'none'`（禁止所有内联事件属性，如 `onclick="..."`） |
| CSP imgSrc | `'self'` `data:` `https:` `http:` |
| HSTS | maxAge=31536000，includeSubDomains，preload |

> **注意：** `script-src-attr 'none'` 要求全站 HTML（包括 JS 动态生成的 innerHTML）不得使用内联事件属性。所有事件必须通过 `addEventListener` 绑定。详见 [utils.js 事件绑定机制](#3-utilsjs--业务函数库)。

**限流：** 15 分钟窗口，每 IP 最多 100 次请求。

**用途区分：**
- 开发环境：运行 Express 提供 webpack-dev-server 的代理
- 生产环境：推荐使用 Nginx 直接托管 `dist/`，Express 仅在需要服务端逻辑（如定时飞书同步）时使用

---

## webpack 构建配置

**入口/出口：**
```
入口：  src/index.js
输出：  dist/bundle.[contenthash:8].js    （生产，带哈希用于缓存破坏）
        dist/bundle.js                    （开发，无哈希）
        dist/styles.[contenthash:8].css   （生产）
publicPath: '/'（固定根路径，避免 Nginx/Docker 子路径误检测）
clean: true（每次重建自动清空 dist/）
```

**CSS 处理链：**
```
开发：  style-loader → css-loader → postcss-loader（热更新）
生产：  MiniCssExtractPlugin → css-loader → postcss-loader（提取为独立 CSS 文件）
```

**生产额外复制（CopyWebpackPlugin）：**
```
src/assets/lang/         → dist/assets/lang/    （仅 *-ui.json、*-product.json、languages.json）
src/assets/images/       → dist/images/
src/sw.js                → dist/sw.js
factory-tour.mp4         → dist/factory-tour.mp4（如存在）
```

**开发服务器（devServer）：**
- 端口 3000
- 静态目录优先级：`dist/assets/lang` > `src/assets/lang`（支持构建后预览）
- 图片目录：`dist/images` > `src/assets/images`
- `Service-Worker-Allowed: /`（允许 SW 在根路径注册）
