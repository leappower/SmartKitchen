# 产品数据流：飞书 → 代码 → 渲染

## 整体数据流

```
飞书多维表格（产品数据源）
        ↓ npm run sync:feishu
        ↓ scripts/generate-products-data-table.js
        ↓
src/assets/product-data-table.js     ← 自动生成，勿手动编辑
        ↓ import PRODUCT_DATA_TABLE
        ↓
product-list.js：normalizeProduct()  ← 数据清洗与标准化
        ↓
GENERATED_PRODUCT_SERIES             ← 规范化产品系列数组
        ↓ mergeSeriesByIdentity()
        ↓ withImageUrl()             ← 注入图片路径
        ↓
PRODUCT_SERIES（最终导出）            ← 全局产品数据
        ↓ import
        ↓
utils.js：renderProducts()           ← 渲染产品卡片到 #product-grid
```

---

## 飞书数据同步

### 同步命令

```bash
# 从飞书拉取最新产品数据
npm run sync:feishu
```

等同于执行 `scripts/ensure-product-data-table.js`，该脚本：
1. 读取 `scripts/feishu-config.json` 中的飞书 API 配置
2. 调用 `scripts/generate-products-data-table.js` 连接飞书多维表格
3. 拉取全部产品记录，生成/覆写 `src/assets/product-data-table.js`

> **注意：** `product-data-table.js` 由脚本自动生成，不要手动编辑，下次同步会被覆盖。

### 飞书配置

飞书 API 凭证通过环境变量注入（不要提交到版本库）：
```bash
FEISHU_APP_ID=xxx
FEISHU_APP_SECRET=xxx
FEISHU_TABLE_TOKEN=xxx
```

---

## 产品数据字段说明

`product-data-table.js` 中每条产品记录的字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `category` | string | 产品大类（如"大型商用炒菜机"） |
| `subCategory` | string | 子类（如"P_ESL"） |
| `model` | string | **产品型号（唯一标识，如"ESL-GB60"）** |
| `name` | string \| null | 产品名称（可为 null，由 i18n 提供） |
| `power` | string | 功率（如"25kW"） |
| `throughput` | string | 产能（如"10-20kg/锅次"） |
| `averageTime` | string | 平均耗时 |
| `launchTime` | string | 上市时间 |
| `status` | string | 销售状态（如"在售"） |
| `isActive` | boolean | 是否在产品列表中展示 |
| `badge` | string | 角标文字（如"座地式"） |
| `badgeColor` | string | 角标颜色（Tailwind 类，如"bg-indigo-500"） |
| `voltage` | string | 电压（如"380V"） |
| `frequency` | string | 频率（如"50Hz"） |
| `material` | string | 材质 |
| `productDimensions` | string | 产品尺寸 |
| `color` | string | 颜色/材料 |
| `imageRecognitionKey` | string \| null | **图片识别键（优先级最高）** |
| `i18n` | object | 多语言字段（飞书同步格式，见下文） |

---

## `normalizeProduct` 数据清洗规则

每条产品数据经 `normalizeProduct()` 清洗后才进入 `PRODUCT_SERIES`。

### imageRecognitionKey 提取（重要）

图片 key 的确定遵循严格优先级：

```
优先级 1：product.imageRecognitionKey（主字段有值）
优先级 2：product.i18n.imageRecognitionKey['zh-CN']（飞书同步格式）
优先级 3：modelToImageKey(product.model)（由型号自动推导）
```

**⚠️ 关键规则：** 无论 key 来自哪个优先级，都必须经过 `modelToImageKey()` 转换为 `snake_case` 小写格式，才能匹配 `IMAGE_ASSETS` 中的键。

### `modelToImageKey` 转换规则

```javascript
modelToImageKey('ESL-GB60')      // → 'esl_gb60_1'
modelToImageKey('ESL-GB60_1')    // → 'esl_gb60_1'（末尾已有 _1，不重复追加）
modelToImageKey('ESL-TGD36/9')   // → 'esl_tgd369_1'（斜杠直接删除）
modelToImageKey('M4DAD+1')       // → 'm4dad_p1_1'（+ 号转为 _p）
```

转换步骤：
1. `toLowerCase()`
2. `/` → 删除（直接去掉斜杠）
3. `+` → `_p`
4. `-` → `_`
5. 其他特殊字符 → `_`
6. 连续 `__` → `_`
7. 首尾 `_` → 去除
8. 末尾不是 `_1` → 追加 `_1`

### 字段清洗函数

| 函数 | 用途 |
|------|------|
| `toNullableString(v)` | 空字符串/空白 → `null`，其余转 string |
| `toArrayValue(v)` | 逗号/分号分隔字符串 → 数组，过滤空元素（支持中文分号 `；`） |
| `toBooleanOrDefault(v, default)` | `'false'`/`'否'` → `false`，其他有值 → `true` |

### i18n 字段兼容

飞书同步的数据中，多语言字段包裹在 `i18n` 对象里：

```json
{
  "model": "ESL-GB60",
  "i18n": {
    "name": { "zh-CN": "座地式600电磁炒菜机" },
    "imageRecognitionKey": { "zh-CN": "ESL-GB60_1" }
  }
}
```

`normalizeProduct` 的 `getFieldWithI18nKey()` 函数处理两种格式：
1. 标准字段名 key：`i18n.name`
2. 编码型 key：`i18n.xxxx_name`（以 `_fieldName` 结尾匹配）

---

## `withImageUrl` 图片注入

所有产品数据经 `normalizeProduct` 清洗后，再经 `withImageUrl()` 注入图片路径：

```javascript
const imageKey = product.imageRecognitionKey || '';
const imageUrl = IMAGE_ASSETS[imageKey] || '';
// imageUrl 为空字符串时，渲染层会 fallback 到 resolveImage(imageKey)
```

最终产品对象上有两个图片字段（内容相同，兼容历史代码）：
- `product.imageUrl`
- `product.productImage`

---

## `mergeSeriesByIdentity` 去重合并

`GENERATED_PRODUCT_SERIES`（来自飞书）和 `APPENDED_PRODUCT_SERIES`（手动追加）会合并，相同产品按 **身份键** 去重：

```
身份键 = "${category}::${subCategory}::${model}"
```

- 身份键相同的产品：后者字段覆盖前者（`Object.assign` 合并）
- 身份键不同：作为新产品追加
- 无法构成有效身份键（category/model 均为空）：直接追加，不去重

---

## `APPENDED_PRODUCT_SERIES` 手动追加

`product-list.js` 中有一段手动追加区域（由飞书同步脚本维护边界标记）：

```javascript
// FEISHU_SYNC_APPEND_START
export const APPENDED_PRODUCT_SERIES = [];
// FEISHU_SYNC_APPEND_END
```

如需在飞书数据外手动补充产品，在此数组中添加，格式与 `PRODUCT_DATA_TABLE` 相同。

---

## 产品渲染流程

```
PRODUCT_SERIES（全局导出）
        ↓ utils.js buildProductCatalog()
        ↓ 展平为一维产品数组，过滤 isActive=false
        ↓ getProducts()
        ↓ renderProducts()（核心渲染函数）
              ├── 应用 currentFilter（系列筛选）
              ├── 计算分页（getItemsPerPage，桌面/移动不同逻辑）
              ├── 生成产品卡片 HTML（含 data-src 懒加载图片）
              └── 写入 #product-grid innerHTML
                        ↓ MutationObserver 触发
                        ↓ LazyLoadingModule._observeImages()
                        ↓ IntersectionObserver 进入视口时加载图片
```

---

## 常见问题

**Q：飞书同步后产品数据为空 / 产品列表空白**

1. 检查 `src/assets/product-data-table.js` 是否存在且非空
2. 检查 `PRODUCT_DATA_TABLE` 导出是否为有效数组
3. 检查飞书 API 凭证是否有效

**Q：产品图片不显示**

最常见原因：`imageRecognitionKey` 与 `IMAGE_ASSETS` 中的 key 不匹配（大小写/格式问题）。

`normalizeProduct` 已在 `imageRecognitionKey` 提取阶段统一经过 `modelToImageKey()` 转换，若仍不显示，在浏览器控制台检查：
```javascript
// 查看某产品的 imageRecognitionKey
window.PRODUCT_SERIES[0].products[0].imageRecognitionKey

// 验证 IMAGE_ASSETS 中是否存在该键
window.IMAGE_ASSETS['esl_gb60_1']
```

**Q：产品卡片显示的名称是中文**

该产品对应语言的 `-product.json` 中没有该产品的 `name` 翻译，属于正常 fallback。执行增量翻译即可：
```bash
npm run translate:products:incremental
```
