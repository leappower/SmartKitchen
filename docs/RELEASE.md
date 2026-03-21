# 发布流程与版本管理

## 版本提交规范（日常开发）

### 提交前必须通过 lint

**所有分支，任何提交前，必须先通过 lint 检查：**

```bash
# 检查 JS + CSS（无报错才能提交）
npm run lint:all

# 有可自动修复的问题时
npm run lint:all:fix

# lint 通过后正常提交
git add .
git commit -m "feat: 添加新功能"
```

> lint 有 **error** 级别报错时，必须修复后再提交。**warning** 可以提交，但建议后续跟进。  
> 禁止使用 `--no-verify` 跳过 hooks。

### Commit Message 规范

推荐使用语义化前缀（Conventional Commits）：

```
feat: 新功能
fix: 修复 bug
refactor: 重构（不影响功能）
docs: 文档变更
style: 格式/样式调整（不影响逻辑）
test: 测试相关
chore: 构建/工具链变更
```

示例：
```bash
git commit -m "fix: 修复产品图片无法显示的 bug"
git commit -m "feat: 新增越南语支持"
git commit -m "chore: 更新飞书产品数据"
git commit -m "docs: 更新 BUILD.md 构建说明"
```

---

## 推送前强制检查（pre-push hook）

**向任意远端推送时，Git hook 会自动执行以下检查，任一失败则推送被阻止：**

```
[1/2] npm run lint:all     → JS + CSS 全量检查
[2/2] npm run test:ci      → Jest 完整测试套件（含覆盖率）
```

Hook 位于 `.githooks/pre-push`，已纳入版本管理。  
`npm install` 后自动通过 `prepare` 脚本激活（`git config core.hooksPath .githooks`）。

**绕过 hook（紧急情况，需谨慎）：**
```bash
# 不推荐，除非紧急
git push --no-verify
```

---

## 版本发布（release.js）

日常发布使用 `scripts/release.js` 脚本，一条命令完成全流程。

### 完整发布流程

```
Step 1  读取远端 release 分支，解析当前版本号
Step 2  计算新版本号
Step 3  lint 检查（--skip-lint 可跳过）
Step 4  飞书数据同步（--skip-feishu 可跳过）
Step 5  i18n 提取 + 产品翻译（--skip-translate 可跳过）
Step 6  图片下载（增量）（--skip-download 可跳过）
Step 7  图片压缩（增量）+ webpack 打包 + 产物验证
Step 8  创建 release/vX.Y.Z 孤立分支（仅含 dist/ 产物）
Step 9  提交产物并推送到远端
Step 10 打印发布摘要
```

### 推荐发布命令

**日常 patch 发布（最常用）：**
```bash
npm run release
```
版本从 `1.2.3` 递增为 `1.2.4`，执行完整飞书+增量翻译流程。

---

**功能更新（minor 版本）：**
```bash
npm run release:minor
```
版本从 `1.2.3` 递增为 `1.3.0`。

---

**大版本更新：**
```bash
npm run release:major
```
版本从 `1.2.3` 递增为 `2.0.0`。

---

**产品数据有变但跳过翻译（快速发布）：**
```bash
npm run release:no-translate
```
拉取飞书数据，跳过 Gemini 翻译（使用已有翻译数据），其余流程正常。

---

**仅打包推送（代码改动，数据/翻译/图片无变化）：**
```bash
npm run release:pack-only
```
跳过飞书 + 跳过翻译，最快完成打包推送。

---

**全量翻译（翻译有大范围变更时）：**
```bash
npm run release:full-translate
```
全量重新翻译所有键（耗时较长，一般不需要）。

---

**图片已全部本地化，跳过下载：**
```bash
npm run release:skip-download
```

---

### 发布命令对照表

| 命令 | 飞书 | 翻译 | 图片下载 | 版本递增 | 适用场景 |
|------|:---:|:---:|:---:|:---:|------|
| `release` | ✅ | 增量 | ✅ | patch | **日常发布** |
| `release:minor` | ✅ | 增量 | ✅ | minor | 新功能发布 |
| `release:major` | ✅ | 增量 | ✅ | major | 重大更新 |
| `release:no-translate` | ✅ | ❌ | ✅ | patch | 快速发布（跳过翻译） |
| `release:no-feishu` | ❌ | 增量 | ✅ | patch | 无产品数据变更 |
| `release:pack-only` | ❌ | ❌ | ✅ | patch | **纯代码改动，最快** |
| `release:full-translate` | ✅ | 全量 | ✅ | patch | 翻译大范围变更 |
| `release:skip-download` | ✅ | 增量 | ❌ | patch | 图片已本地化 |
| `release:dry` | — | — | — | — | 预演，不执行任何操作 |

---

### 版本号规范

遵循语义版本（Semantic Versioning）：

```
X.Y.Z
│ │ └── patch：bug 修复、文档更新、小改动
│ └──── minor：新功能、新语言、向后兼容的变更
└────── major：破坏性变更、架构重构
```

**版本号读取规则：** `release.js` 从远端最新 `release/vX.Y.Z` 分支名解析当前版本，无需手动维护 `package.json` 版本号（两者独立）。

---

### 发布前检查清单

```
[ ] npm run lint:all          → 0 errors
[ ] npm test                  → 全部通过
[ ] 产品数据已同步（如有变更）→ npm run sync:feishu
[ ] 翻译文件已更新（如有变更）→ npm run translate:products:incremental
[ ] 图片已优化（如有新增）    → npm run optimize:images
[ ] 本地预览无异常            → npm start / build:pack 后检查
```

---

### release 产物说明

发布后创建的分支为**孤立分支**（`git checkout --orphan`），与 `main` 分支无共同祖先：

```
release/v1.2.4              ← 孤立分支，只含 dist/ 产物
  └── dist/
      ├── index.html
      ├── bundle.[hash].js
      ├── styles.[hash].css
      ├── sw.js
      ├── images/
      └── assets/lang/
```

- 此分支**不包含**源代码，只用于静态部署
- 每次发布都是全新提交，历史不叠加

---

## GitHub Actions CI 双重防护

`.github/workflows/ci.yml` 中的 `CI Gate` job 对**所有分支**推送/PR 触发：

```
lint → test → build → docker
         ↓
      CI Gate（必须全绿才允许合并）
```

可在 GitHub 仓库设置 → Branch Protection Rules 中将 `CI Gate` 设为**必须通过的 status check**，在服务端彻底拦截未通过检查的代码。

**双重防护机制：**
1. 本地 `pre-push` hook：在推送前拦截（快速反馈）
2. GitHub CI Gate：在服务端再次验证（防绕过）
