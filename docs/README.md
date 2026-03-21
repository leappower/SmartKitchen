# bakery-tech-pro 文档中心

商用厨房设备多语言专业网站，支持 25 种语言、模块化前端架构、飞书数据同步和一键发布流程。

---

## 快速开始

**环境要求：** Node.js ≥ 16.0.0，npm ≥ 8.0.0

```bash
# 克隆后安装依赖（同时自动激活 Git Hooks）
npm install

# 启动开发服务器（端口 3000）
npm start
```

浏览器打开 http://localhost:3000 即可。

---

## 目录结构

```
bakery-tech-pro/
├── src/
│   ├── index.html               # HTML 模板（webpack 注入 bundle/css）
│   ├── index.js                 # webpack 入口
│   ├── lang-registry.js         # 语言注册表（25 种语言统一管理）
│   ├── sw.js                    # Service Worker
│   └── assets/
│       ├── main.js              # App 核心 + 模块注册
│       ├── utils.js             # 业务工具函数库（IIFE，挂载到 window）
│       ├── translations.js      # 多语言管理（TranslationManager 类）
│       ├── init.js              # SW 注册 + 用户行为追踪
│       ├── image-assets.js      # 图片路径映射（从 manifest 静态构建）
│       ├── product-list.js      # 产品数据处理（normalize + assemble）
│       ├── product-data-table.js# 产品数据表（飞书同步自动生成，勿手动编辑）
│       ├── common.js            # 公共逻辑
│       ├── images/              # 图片资产（.webp，由 optimize-images.js 管理）
│       ├── lang/                # 语言文件（{lang}-ui.json + {lang}-product.json）
│       └── css/                 # 样式文件
├── scripts/                     # 构建/数据/翻译工具脚本
├── docs/                        # 项目文档（本目录）
├── tests/                       # 单元测试
├── .githooks/                   # Git Hooks（pre-push 强制检查）
├── .github/workflows/           # GitHub Actions CI
├── webpack.config.js
├── server.js                    # Express 开发服务器
├── Dockerfile
└── package.json
```

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、各模块原理、数据流 |
| [BUILD.md](./BUILD.md) | 日常开发、构建打包、部署、Docker |
| [RELEASE.md](./RELEASE.md) | 版本发布流程、release.js 使用、CI/CD |
| [I18N.md](./I18N.md) | 多语言体系、翻译工具链、新增语言 |
| [PRODUCT_DATA.md](./PRODUCT_DATA.md) | 产品数据流：飞书同步→代码→渲染 |
| [IMAGES.md](./IMAGES.md) | 图片资产管理、WebP 转换、懒加载 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 代码贡献规范 |
| [CHANGELOG.md](./CHANGELOG.md) | 版本变更记录 |
| [SECURITY.md](./SECURITY.md) | 安全漏洞上报策略 |
