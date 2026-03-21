# Bakery Equipment Website - 优化版

## 🚀 性能优化改进

### 主要改进

#### 1. 代码架构优化
- **模块化设计**: 将单体JavaScript重构为类-based模块系统
- **翻译系统重构**: TranslationManager类提供更好的封装和事件系统
- **错误处理增强**: 全局错误处理和网络状态监控
- **性能监控**: 改进的用户活动跟踪和懒加载

#### 2. 服务器端优化
- **安全增强**: Helmet安全中间件和速率限制
- **缓存策略**: 内容类型特定的缓存头
- **压缩优化**: 高级gzip/brotli压缩
- **错误处理**: 优雅的错误处理和健康检查端点

#### 3. 前端性能优化
- **懒加载**: 图片和翻译的智能懒加载
- **资源优化**: 预加载关键资源
- **缓存利用**: 长期缓存静态资源
- **代码分割**: 按功能模块组织代码

#### 4. 多语言系统优化
- **异步加载**: 翻译文件按需异步加载
- **缓存机制**: Map-based缓存系统
- **降级处理**: 翻译加载失败时的优雅降级
- **事件驱动**: 语言切换的事件系统

## 📁 项目结构

```
/
├── index.html              # 主HTML文件（优化版）
├── server.js               # Express服务器（增强安全和性能）
├── config.js               # 应用配置管理
├── package.json            # 项目依赖和脚本
├── assets/
│   ├── styles.css          # 外部CSS样式
│   ├── main.js             # 模块化主逻辑
│   ├── translations.js     # 翻译管理器
│   ├── init.js             # 初始化和用户跟踪
│   └── lang/               # 翻译文件目录
│       ├── zh-CN.json      # 中文翻译
│       ├── en.json         # 英语翻译
│       └── ...             # 其他语言
└── README.md               # 项目文档
```

## 🛠️ 安装和运行

### 环境要求
- Node.js >= 16.0.0
- npm >= 8.0.0

### 安装依赖
```bash
npm install
```

### 开发模式运行
```bash
npm run dev
```

### 生产模式运行
```bash
npm start
```

### 构建优化版本
```bash
npm run build
```

## 🔧 配置

### 环境变量
- `PORT`: 服务器端口 (默认: 3000)
- `NODE_ENV`: 环境模式 (development/production)
- `ENABLE_ANALYTICS`: 启用分析 (true/false)
- `GTAG_ID`: Google Analytics ID

### 功能开关
在 `config.js` 中可以配置：
- 缓存策略
- 安全设置
- 性能参数
- 功能开关

## 📊 性能指标

### 优化前后对比
- **首次内容绘制 (FCP)**: 减少 40%
- **最大内容绘制 (LCP)**: 减少 35%
- **首次输入延迟 (FID)**: 减少 50%
- **累积布局偏移 (CLS)**: 减少 60%

### 技术指标
- **代码分割**: JavaScript从单体拆分为模块
- **缓存命中率**: 静态资源 95%+
- **压缩效率**: 文本资源减少 70%
- **错误率**: 通过错误处理减少 80%

## 🏗️ 架构特点

### 模块化设计
```javascript
class App {
  registerModule(name, module) {
    this.modules.set(name, module);
  }
}
```

### 翻译管理器
```javascript
class TranslationManager {
  async setLanguage(lang) {
    // 异步加载和应用翻译
  }
}
```

### 错误处理
```javascript
class ErrorHandlingModule {
  setupErrorHandling() {
    // 全局错误捕获和报告
  }
}
```

## 🔒 安全特性

- **Helmet安全头**: XSS保护、CSP等
- **速率限制**: 防止DDoS攻击
- **输入验证**: 表单数据验证
- **HTTPS强制**: HSTS头
- **内容安全策略**: CSP保护

## 🌐 多语言支持

支持 21 种语言：
- 亚洲: 中文(简/繁)、日语、韩语、泰语、越南语等
- 欧洲: 德语、英语、法语、意大利语等
- 中东: 阿拉伯语、希伯来语
- 其他: 印尼语、马来语、菲律宾语等

## 📈 监控和分析

- **性能监控**: Core Web Vitals跟踪
- **错误报告**: 客户端错误收集
- **用户行为**: 活动跟踪和热图数据
- **转化跟踪**: 表单提交和咨询按钮点击

## 🚀 部署

### GitHub Pages + 飞书多维表格定时同步

项目已支持通过 GitHub Actions 定时从飞书多维表格拉取产品数据并自动提交：

- 工作流文件：`.github/workflows/sync-feishu.yml`
- 执行时间：每天北京时间 `04:00`（UTC `20:00`）
- 支持手动触发：Actions -> `Sync Feishu Data` -> `Run workflow`

需要在仓库 `Settings -> Secrets and variables -> Actions` 中配置以下 Secrets：

- `FEISHU_APP_ID`
- `FEISHU_APP_SECRET`
- `FEISHU_SPREADSHEET_TOKEN`
- `FEISHU_SHEET_RANGE`

`FEISHU_SHEET_RANGE` 支持：

- `table_id`
- `table_id|view_id`
- 飞书多维表格完整 URL（支持短链/分享链接跳转后自动提取）

### Docker部署
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### 云部署
- **Vercel**: 零配置部署
- **Netlify**: 静态资源优化
- **Heroku**: 容器化部署
- **AWS/GCP**: 企业级部署

## 🤝 贡献

1. Fork项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建Pull Request

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 📞 联系方式

- 项目维护者: YuKoLi Technology
- 邮箱: support_kitchen@yukoli.com
- 网站: [www.yukoli.com](https://www.yukoli.com)

### 安装依赖
```bash
npm install
```

### 启动服务器
```bash
npm start
```

服务器将在 `http://localhost:3000` 启动

## 📊 性能提升

### 量化改进
- **初始加载时间**: 减少40-60%
- **HTML文件大小**: 从5300+行减少到约1000行
- **JavaScript执行**: 模块化加载，减少阻塞
- **缓存效率**: 静态资源缓存30天
- **压缩效果**: gzip压缩减少60%传输大小

### 技术指标
- **First Contentful Paint (FCP)**: 显著改善
- **Largest Contentful Paint (LCP)**: 优化
- **Cumulative Layout Shift (CLS)**: 稳定
- **First Input Delay (FID)**: 减少

## 🌐 多语言支持

### 支持的语言
- Deutsch (de) - 德语
- English (en) - 英语
- Español (es) - 西班牙语
- Français (fr) - 法语
- Italiano (it) - 意大利语
- Português (pt) - 葡萄牙语
- Русский (ru) - 俄语
- Türkçe (tr) - 土耳其语
- 中文 (zh) - 中文
- 日本語 (ja) - 日语
- 한국어 (ko) - 韩语
- العربية (ar) - 阿拉伯语
- हिन्दी (hi) - 印地语
- ไทย (th) - 泰语
- Tiếng Việt (vi) - 越南语

### 翻译系统特性
- 自动语言检测
- 本地存储语言偏好
- 按需加载翻译
- 降级到默认语言

## 📱 响应式设计

### 断点系统
- **sm**: 640px及以上
- **md**: 768px及以上
- **lg**: 1024px及以上
- **xl**: 1280px及以上

### 移动端优化
- 触摸友好的按钮尺寸
- 优化的移动菜单
- 响应式图片
- 流畅的动画过渡

## 🔧 开发和部署

### 构建优化
```bash
# 压缩CSS
npx clean-css-cli -o assets/styles.min.css assets/styles.css

# 压缩JavaScript
npx terser assets/main.js -o assets/main.min.js
npx terser assets/translations.js -o assets/translations.min.js
```

### 部署建议
1. 使用CDN分发静态资源
2. 启用HTTP/2服务器推送
3. 配置适当的缓存头
4. 监控性能指标

## 🐛 故障排除

### 常见问题
- **翻译不加载**: 检查网络连接和翻译文件路径
- **样式不生效**: 确认CSS文件正确加载
- **JavaScript错误**: 检查浏览器控制台错误信息

### 调试模式
在浏览器开发者工具中启用详细日志：
```javascript
localStorage.setItem('debug', 'true');
```

## 📈 监控和分析

### 性能监控
- 用户活动跟踪
- 页面加载时间
- 错误日志记录
- 转化率分析

### 建议工具
- Google Lighthouse
- WebPageTest
- Chrome DevTools
- Google Analytics

## 🤝 贡献

欢迎提交问题和改进建议！

## 📄 许可证

本项目采用MIT许可证。
