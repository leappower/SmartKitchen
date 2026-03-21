# 贡献指南

感谢你对本项目的关注！欢迎通过 Issue 或 Pull Request 参与贡献。

---

## 开发环境准备

**环境要求：** Node.js ≥ 16.0.0，npm ≥ 8.0.0

```bash
# 克隆仓库
git clone https://github.com/your-username/html-yuql.git
cd html-yuql

# 安装依赖（自动激活 Git Hooks）
npm install

# 启动开发服务器
npm start
```

---

## 开发工作流

1. **创建功能分支**
   ```bash
   git checkout -b feat/your-feature-name
   # 或
   git checkout -b fix/your-bugfix-name
   ```

2. **编写代码，确保 lint 通过**
   ```bash
   # 提交前必须执行，0 errors 才能提交
   npm run lint:all

   # 自动修复可修复的问题
   npm run lint:all:fix
   ```

3. **确保测试通过**
   ```bash
   npm test
   ```

4. **提交代码（遵循 Commit Message 规范）**
   ```bash
   git commit -m "feat: 描述你的改动"
   ```

5. **推送分支**（推送时 pre-push hook 会自动执行 lint + test）
   ```bash
   git push origin feat/your-feature-name
   ```

6. **创建 Pull Request**，描述改动内容和测试情况

---

## Commit Message 规范

使用语义化前缀：

| 前缀 | 用途 |
|------|------|
| `feat:` | 新功能 |
| `fix:` | Bug 修复 |
| `refactor:` | 重构（不影响功能） |
| `docs:` | 文档变更 |
| `style:` | 格式/样式（不影响逻辑） |
| `test:` | 测试相关 |
| `chore:` | 构建/工具链/依赖变更 |

---

## 代码风格

- 使用 `.eslintrc` 配置（ESLint）
- 2 个空格缩进
- 单引号字符串
- 语句末尾加分号
- CSS 使用 Stylelint 检查

---

## 测试规范

- 新功能应添加对应的单元测试，测试文件放在 `tests/` 目录
- 运行测试：`npm test`
- 带覆盖率报告：`npm run test:coverage`
- CI 模式（限制并发，适合本地验证 CI 行为）：`npm run test:ci`

---

## 新增翻译语言

详细步骤见 [I18N.md](./I18N.md#新增语言)。简要：

1. 在 `src/lang-registry.js` 注册新语言
2. 在 `src/assets/lang/` 创建对应的 `{lang}-ui.json`
3. 运行 `npm run product:sync:source && npm run translate:products:incremental`
4. 启动开发服务器验证语言切换效果

---

## 提交 Issue

报告 Bug 时请提供：
- 复现步骤
- 期望行为
- 实际行为
- 浏览器和操作系统信息
- Node.js 版本

---

## License

提交贡献即表示你同意你的代码以 MIT License 授权。
