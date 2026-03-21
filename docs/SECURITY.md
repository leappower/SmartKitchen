# Security Policy

## Supported Versions

We actively support the following versions with security updates:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it to us as follows:

1. **Do not** create a public GitHub issue
2. Email security concerns to: [your-email@example.com]
3. Include detailed information about the vulnerability
4. Allow reasonable time for us to respond and fix the issue

## Security Measures

This project implements several security measures:

- **Helmet**: Security headers for Express.js
- **Rate Limiting**: Prevents abuse and DoS attacks
- **Input Validation**: Sanitizes user inputs
- **CORS**: Configurable cross-origin resource sharing
- **Compression**: Reduces attack surface with smaller responses

### Content Security Policy (CSP)

Helmet 强制启用了以下关键 CSP 指令：

| 指令 | 值 | 说明 |
|------|-----|------|
| `script-src` | `'self'` `cdn.tailwindcss.com` | 只允许同源脚本和 Tailwind CDN |
| `script-src-attr` | `'none'` | **完全禁止**内联事件属性（`onclick`、`onsubmit` 等） |
| `style-src` | `'self'` `'unsafe-inline'` `fonts.googleapis.com` | 允许同源样式和 Google Fonts |

#### 内联事件处理器消除（Inline Event Handler Removal）

由于 `script-src-attr 'none'`，全站所有 HTML（包括 JS 动态生成的 `innerHTML`）均不得使用内联事件属性。本项目通过以下方式合规：

**静态 HTML 元素**（`src/index.html`）：
- 所有 `onclick`/`onsubmit`/`onkeyup` 已从 HTML 中移除
- 改由 `utils.js` 中的 `bindAllEvents()` 函数在 `DOMContentLoaded` 时统一用 `addEventListener` 绑定

**动态生成 HTML**（`utils.js` 内 `innerHTML` 注入）：
- filter 按钮使用 `data-filter` 属性，渲染后委托绑定
- 分页按钮使用 `data-page` 属性，渲染后委托绑定
- 产品卡片弹窗按钮使用 `data-action="show-popup"` 属性，渲染后委托绑定
- 移动端轮播按钮渲染后通过 `id` 直接绑定

> ⚠️ **维护注意事项：** 新增或修改任何向 DOM 注入 HTML 的代码时，**严禁**在模板字符串中使用 `onclick=`、`onsubmit=` 等内联事件属性。必须使用 `data-*` 属性 + `addEventListener` 模式，否则 CSP 会在运行时静默阻断所有点击。

## Best Practices

When deploying this application:

1. Use HTTPS in production
2. Set strong environment variables
3. Keep dependencies updated
4. Use a reverse proxy (nginx) in production
5. Monitor logs for suspicious activity
6. Regularly backup data

## Responsible Disclosure

We kindly ask that you:

- Give us reasonable time to fix the issue before public disclosure
- Avoid accessing or modifying user data
- Don't perform DoS attacks or degrade service performance
- Don't spam our systems with automated vulnerability scanners

Thank you for helping keep HTML-YuQL and our users safe!