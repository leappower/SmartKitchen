# 图片资产管理

## 图片命名规范

所有图片文件名遵循 `snake_case` 小写规则，与产品型号转换结果保持一致：

| 原文件名 / 产品型号 | 标准文件名 |
|---------------------|-----------|
| `ESL-GB60` | `esl_gb60_1.webp` |
| `ESL-GB60_1` | `esl_gb60_1.webp`（已有 `_1`，不重复）|
| `ESL-TGD36/9` | `esl_tgd369_1.webp`（斜杠删除）|
| `M4DAD+1` | `m4dad_p1_1.webp`（`+` → `_p`）|
| `LOGO_HTML` | `logo_html.webp` |
| `hero_main` | `hero_main.webp` |

**规则：**
- 所有字母转小写
- 连字符 `-` → `_`
- 加号 `+` → `_p`
- 斜杠 `/` → 删除
- 其他特殊字符 → `_`
- 连续 `__` → `_`
- 首尾 `_` → 去除
- 产品图末尾追加 `_1`（非产品图不追加）

> **重要：** 文件名必须与 `IMAGE_ASSETS` 中的 key 完全一致，否则图片无法显示。  
> 产品图的 key 由 `modelToImageKey()` 自动生成，详见 [PRODUCT_DATA.md](./PRODUCT_DATA.md)。

---

## 图片格式

- **全部使用 WebP**（IE 已于 2022 年停止支持，WebP 全球支持率 97%+）
- PNG/JPG 会在优化阶段自动转换为 WebP
- 无需维护 PNG/JPG 源文件，WebP 即为最终格式

---

## optimize-images.js 脚本

所有图片处理通过 `scripts/optimize-images.js`（基于 `sharp` 库）完成。

### 常用命令

```bash
# 增量压缩（跳过未变动图片）— 日常构建使用
npm run optimize:images

# 强制全量重压（忽略缓存，图片质量有问题时使用）
npm run optimize:images:force

# 下载 image-assets.js 中的外部 HTTP URL 并本地化（增量）
npm run download:images

# 强制重新下载所有外部图片
npm run download:images:force

# 为已压缩图片初始化缓存（新成员 clone 后运行，避免无谓重压缩）
npm run init:cache

# 仅重新生成 image-manifest.json，不处理图片
node scripts/optimize-images.js --gen-manifest

# 模拟运行，只打印计划，不执行文件操作
node scripts/optimize-images.js --dry-run

# 仅统计当前 images 目录，不处理任何文件
node scripts/optimize-images.js --stats
```

### 增量压缩机制

脚本通过 `.image-cache.json` 实现增量处理，避免有损图片被反复压缩而越来越模糊：

```
图片处理前：计算源文件 SHA-256 哈希
        ↓
与 .image-cache.json 中的记录对比
  ├── 哈希未变（图片未修改）→ 直接复制上次产物，跳过压缩
  ├── 哈希已变（图片被替换）→ 重新压缩，更新缓存记录
  └── 无缓存记录（首次）   → 首次压缩，写入缓存
```

`.image-cache.json` 已纳入 git 版本管理，多人协作共享缓存，避免每个人 clone 后都重新压缩全量图片。

### 标准压缩流程（内部实现）

```
1. src/assets/images/ → 重命名为 src/assets/imagesCopy/（原图备份）
2. 创建新的 src/assets/images/
3. 遍历 imagesCopy/ 中所有文件：
   ├── WebP ≤ 1MB  → 直接复制（已是最优格式）
   ├── WebP > 1MB  → 重新压缩（有损，防文件过大）
   ├── PNG/JPG     → 转换为 WebP
   └── 其他文件    → 直接复制（如 JSON）
4. 删除 imagesCopy/ 备份目录
```

> **注意：** 脚本是幂等的。若上次执行中断导致 `imagesCopy/` 残留，下次执行会直接从 `imagesCopy/` 继续，不会重复备份。

---

## image-manifest.json

`src/assets/images/image-manifest.json` 是 `image-assets.js` 的数据源，由脚本自动生成。

**结构：**
```json
{
  "version": 1,
  "generated": "2026-03-15T06:01:45.335Z",
  "images": [
    "esl_gb60_1",
    "esl_tgd369_1",
    "hero_main",
    "logo_html",
    "cert_1",
    ...
  ]
}
```

- 所有 key 均为不带扩展名的 snake_case 字符串
- 运行时在 `image-assets.js` 中拼上 `.webp` 即为完整文件名
- `image-assets.js` 在构建时静态 `import` manifest，运行时同步可用（无 fetch）

**手动重新生成：**
```bash
node scripts/optimize-images.js --gen-manifest
```

---

## IMAGE_ASSETS 映射表

`src/assets/image-assets.js` 基于 manifest 构建完整的图片路径映射：

```javascript
// 非产品图（固定路径，硬编码）
IMAGE_ASSETS['logo']                // → 'images/logo_html.webp'
IMAGE_ASSETS['hero_bg']             // → 'images/workshop_bgm.webp'
IMAGE_ASSETS['cert_1']              // → 'images/cert_1.webp'
IMAGE_ASSETS['factory_gallery_1']   // → 'images/factory_gallery_1.webp'

// 产品图（从 manifest 自动展开，新增图片无需手动维护）
IMAGE_ASSETS['esl_gb60_1']          // → 'images/esl_gb60_1.webp'
IMAGE_ASSETS['esl_tgd369_1']        // → 'images/esl_tgd369_1.webp'
```

**非产品图 key 列表（`NON_PRODUCT_KEYS`）：**
```
logo_html, logo_html_2, workshop_bgm, hero_main,
factory_video_poster, factory_gallery_1~4,
cert_1~6, product_compact, product_professional, product_industrial
```

**对外 API：**
```javascript
import { IMAGE_ASSETS, resolveImage, imgTag } from './image-assets.js';

IMAGE_ASSETS['esl_gb60_1']            // 直接取路径
resolveImage('esl_gb60_1')            // 同上，函数形式
imgTag('esl_gb60_1', '产品名', 'class') // 生成完整 <img> 标签（带 loading="lazy"）
```

---

## 图片加载链路（懒加载）

产品卡片图片采用懒加载，避免首屏加载大量图片：

```
renderProducts() 生成产品卡片 HTML
        ↓
<img data-src="images/esl_gb60_1.webp"
     src="data:image/svg+xml,..."    ← 1×1 SVG 占位符（防 CLS）
     class="lazy-img">
        ↓ MutationObserver 检测到 DOM 新增
        ↓ LazyLoadingModule._observeImages()
        ↓ IntersectionObserver.observe(img)
        ↓ 图片进入视口（rootMargin 100px 提前触发）
        ↓ loadImage(img)
              ├── img.src = img.dataset.src    ← 触发实际图片加载
              ├── img.classList.remove('lazy-img')
              ├── img.classList.add('loaded')
              └── 加载完成 → 添加 'fade-in' 类（渐入动画）
```

**加载失败降级策略：**
```
WebP 加载失败
        ↓
尝试同名 PNG（img.src = src.replace('.webp', '.png')）
        ↓ PNG 也失败
内联 SVG 占位图（灰底 + "暂无图片"文字，无需额外请求）
```

---

## 新增产品图片的完整操作步骤

1. **准备图片文件**
   - 将图片放入 `src/assets/images/` 目录
   - 文件名遵循 `snake_case` 规范（脚本会自动转换大小写，但建议提前规范命名）
   - 支持格式：WebP（推荐）、PNG、JPG

2. **运行图片优化**
   ```bash
   npm run optimize:images
   ```
   PNG/JPG 会自动转换为 WebP，并更新 `.image-cache.json`

3. **重新生成 manifest**（如果没有自动更新）
   ```bash
   node scripts/optimize-images.js --gen-manifest
   ```

4. **验证 IMAGE_ASSETS**
   ```bash
   npm start
   # 在浏览器控制台执行：
   # IMAGE_ASSETS['your_image_key']  → 应返回路径字符串
   ```

5. **对应产品的型号/imageRecognitionKey**
   - 确保飞书产品数据中的 `imageRecognitionKey` 或 `model` 经 `modelToImageKey()` 转换后与图片文件名一致
   - 详见 [PRODUCT_DATA.md](./PRODUCT_DATA.md) 的命名转换规则

---

## 常见问题

**Q：新添加的图片不显示**

1. 检查 `image-manifest.json` 中是否有该图片的 key
2. 确认文件名是 snake_case 小写格式
3. 确认运行了 `npm run optimize:images`（生成 WebP 并更新 manifest）

**Q：图片显示模糊**

反复有损压缩导致。用以下方式从原始清晰图片重新处理：
```bash
# 将高质量原图替换进 src/assets/images/
# 然后强制重新压缩（忽略缓存）
npm run optimize:images:force
```

**Q：构建后图片丢失**

检查 `webpack.config.js` 中 `CopyWebpackPlugin` 是否包含 `src/assets/images → dist/images` 规则（已有，一般不会缺失）。
