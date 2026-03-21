# 构建与部署指南

## 日常开发

### 推荐开发命令

```bash
# 标准启动（自动运行 prestart: init-dev.js 初始化开发环境）
npm start
```

> **`npm start` 是日常开发的首选命令**，它会先执行 `scripts/init-dev.js`（检查产品数据表是否存在），再启动 webpack-dev-server。

**其他开发场景：**

```bash
# 产品数据有更新时（先拉取飞书再启动）
npm run dev:webpack

# 跳过 prestart 直接启动 webpack（产品数据已是最新时）
npm run dev:fast

# 启动 Express 服务端（需要调试服务端逻辑时）
npm run dev
```

**开发服务器说明：**
- 地址：http://localhost:3000
- 支持 HMR（热模块替换），修改 CSS/JS 即时生效
- 语言文件：优先读 `dist/assets/lang/`，其次 `src/assets/lang/`
- 图片文件：优先读 `dist/images/`，其次 `src/assets/images/`

---

### 代码质量检查

提交前**必须**通过 lint，推送前**必须**通过 lint + test（详见 [RELEASE.md](./RELEASE.md)）。

```bash
# 同时检查 JS + CSS（日常使用这一条）
npm run lint:all

# 只检查 JS
npm run lint

# 只检查 CSS
npm run lint:css

# 自动修复可修复的问题
npm run lint:all:fix

# 运行单元测试
npm test

# 带覆盖率报告
npm run test:coverage
```

---

### 产品数据同步

产品数据来自飞书，本地开发前需确保数据最新：

```bash
# 从飞书同步最新产品数据（更新 src/assets/product-data-table.js）
npm run sync:feishu
```

> 详见 [PRODUCT_DATA.md](./PRODUCT_DATA.md)

---

## 打包构建

### 推荐打包命令

**日常迭代（代码改动，产品数据/图片/翻译无变化）：**

```bash
npm run build:pack
```

跳过图片下载，从图片压缩开始，最快完成打包。适合只改了前端代码的场景。

---

**产品/翻译有更新（含飞书同步 + 增量翻译）：**

```bash
npm run build:withFeishu
```

完整流程：飞书拉取 → i18n 提取 → 产品同步 → 合并 → 增量翻译 → 图片下载 → 图片压缩 → webpack → 复制翻译文件 → 构建 i18n。

---

**发布前完整验证（推荐）：**

```bash
npm run build:production
```

等同于 `build:withFeishu`，额外在最后执行 `verify-static-build.js` 验证产物完整性。

---

### 所有构建命令一览

| 命令 | 图片下载 | 飞书同步 | 翻译 | 验证 | 适用场景 |
|------|:---:|:---:|:---:|:---:|------|
| `build` / `build:fast` | ✅ | ❌ | ❌ | ❌ | 仅代码改动，图片可能有更新 |
| `build:static` | ✅ | ❌ | ❌ | ✅ | 同上，带产物验证 |
| `build:pack` | ❌ | ❌ | ❌ | ✅ | **图片已是最新，纯代码打包（最快）** |
| `build:withFeishu` | ✅ | ✅ | 增量 | ❌ | 产品/翻译有变化 |
| `build:static:withFeishu` | ✅ | ✅ | 增量 | ✅ | 同上，带验证 |
| `build:production` | ✅ | ✅ | 增量 | ✅ | **发布前推荐** |
| `build:production:full` | ✅ | ✅ | 全量 | ✅ | 翻译有大范围变更时 |

---

### 构建产物结构

```
dist/
├── index.html                       # 注入了 bundle/css 路径的 HTML
├── bundle.[contenthash:8].js        # 所有 JS 模块打包产物
├── styles.[contenthash:8].css       # 所有 CSS 编译产物
├── sw.js                            # Service Worker
├── factory-tour.mp4                 # 工厂视频（如存在）
├── images/
│   ├── esl_gb60_1.webp              # 产品图（WebP，snake_case 命名）
│   ├── hero_main.webp
│   └── ...                          # 全部 ~126 张图片
└── assets/
    └── lang/
        ├── languages.json           # 语言列表
        ├── zh-CN-ui.json            # 中文 UI 翻译
        ├── zh-CN-product.json       # 中文产品翻译
        ├── en-ui.json
        ├── en-product.json
        └── ...                      # 其余 23 种语言，每种 2 个文件
```

**重要：** `contenthash` 保证每次代码变更后浏览器自动破除缓存，无需手动清缓存。

---

### 构建常见问题

**Q：webpack 报找不到 `product-data-table.js`**

```bash
# 先同步飞书数据
npm run sync:feishu
```

**Q：构建时图片压缩报错**

```bash
# 重建图片缓存
npm run init:cache:force
```

**Q：翻译文件 404 / 语言切换无效**

确认 `dist/assets/lang/` 下存在对应语言的 `-ui.json` 和 `-product.json` 文件：
```bash
ls dist/assets/lang/ | grep zh-CN
# 应输出：zh-CN-ui.json  zh-CN-product.json
```

如果不存在，手动执行翻译文件复制：
```bash
node scripts/copy-translations.js && node scripts/build-i18n.js
```

---

## 静态部署

### dist/ 目录说明

生产构建产物完全静态（无服务端逻辑），可直接托管到任何静态服务：
- Nginx
- CDN（Cloudflare Pages、Vercel、Netlify 等）
- 对象存储（OSS、S3 + CloudFront）

### Nginx 配置要点

```nginx
server {
    root /path/to/dist;
    index index.html;

    # 静态资源长缓存（带 contenthash 的文件永不过期）
    location ~* \.(js|css|webp|mp4)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # 语言文件短缓存（内容可能更新）
    location /assets/lang/ {
        expires 1h;
        add_header Cache-Control "public";
    }

    # SPA 路由支持（如有）
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### 验证静态构建

```bash
# 构建后验证产物完整性
node scripts/verify-static-build.js
```

验证内容：
- HTML 中 bundle/css 引用是否存在对应文件
- 所有语言文件是否齐全（ui + product）
- 图片目录是否非空

---

## Docker

### 构建与运行

```bash
# 构建镜像
npm run docker:build
# 等同于：docker build -t html-yuql .

# 运行容器（端口 3000）
npm run docker:run
# 等同于：docker run -p 3000:3000 html-yuql
```

### Dockerfile 说明

项目根目录的 `Dockerfile` 基于 Node.js 镜像，复制 `dist/` 产物并用 Express 服务端提供服务。

> **注意：** Docker 镜像打包的是当前 `dist/` 目录内容。确保在 `docker:build` 前已执行过构建命令。

推荐流程：
```bash
npm run build:production   # 先构建
npm run docker:build       # 再打镜像
npm run docker:run         # 本地验证
```

---

## 版本发布

发布使用专门的 `release.js` 脚本，自动化处理版本号递增、飞书同步、翻译、打包、推送全流程。

详见 [RELEASE.md](./RELEASE.md)。
