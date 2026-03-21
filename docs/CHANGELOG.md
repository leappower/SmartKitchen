# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

---

## [0.0.3] — 2026-03-15

### Fixed
- 修复全站按钮点击无响应：服务端 CSP `script-src-attr 'none'` 阻断了所有内联事件属性（`onclick`、`onsubmit` 等），导致页面所有交互静默失效

### Changed
- **`src/index.html`**：移除全部 **54 处**内联事件属性（onclick × 52、onsubmit × 2、onkeyup × 1），改为零内联事件；给三个静态弹窗触发按钮（`jump-btn-1`、`hero-btn-primary`、`custom-cta-btn`）补加 `data-action="show-popup"` 属性
- **`src/assets/utils.js`**：
  - 新增 `bindAllEvents()` 函数，`DOMContentLoaded` 时统一用 `addEventListener` 绑定所有静态 HTML 元素事件（语言切换、弹窗开关、移动菜单、联系按钮、表单提交等）
  - `renderProductFilters()`：移除 filter 按钮模板中的 `onclick`，改用 `data-filter` 委托，渲染后重新绑定
  - `renderMobileProductSideControls()`：移除轮播按钮 `onclick`，innerHTML 设置后立即按 id 绑定
  - `renderProducts()` / meta 区域：移除分页上下页按钮 `onclick`，改用 `data-page` 属性委托绑定；产品卡片弹窗按钮改用 `data-action="show-popup"` 委托绑定
  - `renderPagination()`：移除所有分页按钮 `onclick`，改用 `data-page` 属性委托，渲染后重新绑定
  - 用户意图检测 `closest()` 选择器：将 `[onclick="showSmartPopupManual()"]` 改为 `[data-action="show-popup"]`
  - 恢复 `clearCache()` 的统计日志输出（测试套件依赖该输出）

### Docs
- `ARCHITECTURE.md`：更新 utils.js 模块描述，补充 CSP 兼容事件绑定机制、数据属性约定；更新服务端 CSP 配置表，加入 `script-src-attr 'none'` 说明
- `SECURITY.md`：新增"内联事件处理器消除"章节，详述合规方案和维护注意事项

---

## [0.0.2] — 2026-03-15

### Fixed
- 修复产品图片无法显示的 bug：`imageRecognitionKey` 来自飞书 i18n 数据时为原始型号格式（如 `ESL-GB60_1`），未经 `modelToImageKey()` 转换直接使用，导致 `IMAGE_ASSETS` 查找失败、图片 404。现统一经 `modelToImageKey()` 转为 `snake_case` 小写格式
- 修复 Service Worker 更新通知防重逻辑漏洞（原 `Date.now()` 比较永不匹配）

### Changed
- 清理源码无效代码、重复逻辑和旧遗留（净减 166 行）：
  - 删除 `MobileMenuModule`（函数体为空的死代码）
  - 删除 `BackToTopModule`（与 `utils.js` 中 `setupBackToTopButton` 功能重复）
  - 删除 `detectRuntimeEnv()`（从未调用的废弃函数）
  - 删除 `image-assets.js` 中两个 `@deprecated` 且无调用的函数
  - 删除 `product-list.js` 中 `assembleProductSeries` 无用的 `options` 参数
  - 删除 `utils.js` 中 `submitViaMailto` 重复的字段
  - 清理全部调试日志

### Added
- 所有分支推送前强制执行 `lint:all` + `test:ci` 检查（`.githooks/pre-push`）
- GitHub Actions `CI Gate` job，对所有分支推送/PR 自动触发 lint → test → build → docker
- 重组 `docs/` 文档目录，删除 28 个过时文档，新增 7 个规范化文档

---

## [0.0.1] — 2026-03-01

### Added
- 多语言支持：25 种语言，分离式文件格式（`{lang}-ui.json` + `{lang}-product.json`）
- 飞书多维表格数据同步（`scripts/generate-products-data-table.js`）
- Gemini API 批量翻译引擎（`scripts/unified-translator.js`），支持增量翻译
- 品牌词保护机制（`scripts/product-translation-handler.js`）
- 图片资产管理：WebP 转换 + 增量压缩缓存（`scripts/optimize-images.js`）
- 产品懒加载（`IntersectionObserver` + `MutationObserver`）
- Service Worker（PWA 支持，版本更新提示）
- 一键发布脚本（`scripts/release.js`）：版本管理 → 飞书 → 翻译 → 打包 → 孤立分支推送
- Express 服务端：Helmet 安全头、rate limiting、compression
- Docker 容器化支持
- webpack 5 构建：contenthash 缓存破坏、PostCSS/Tailwind CSS
- ESLint + Stylelint 代码质量检查
- Jest 单元测试框架
