/**
 * 产品多语言适配器脚本
 *
 * 工作流程：
 * 1. 从Feishu/Excel读取多语言列（如 name_en, name_zh-CN, usage_en 等）
 * 2. 提取多语言值，生成翻译key：category_subCategory_model_fieldName
 * 3. 填充到 src/assets/lang/*.json 中
 * 4. 修改产品表，将多语言字段改为对应的i18n key
 * 5. 前端通过 tr(key) 获取翻译值
 *
 * 使用方法：
 *   node scripts/product-i18n-adapter.js --action generate
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getSupportedCodes, getAllCodes } = require(path.join(__dirname, '../src/lang-registry'));

const TRANSLATIONS_DIR = path.join(process.cwd(), 'src/assets/lang');
const PRODUCT_TABLE_PATH = path.join(process.cwd(), 'src/assets/product-data-table.js');
const PRODUCT_I18N_PATH = path.join(process.cwd(), 'scripts/producti18n.json');

/**
 * 支持的语言集合 — 由 src/lang-registry.js 统一管理（hasTranslation: true）
 * 飞书只提供中文内容，翻译由翻译引擎完成，此处仅用于过滤写入目标
 */
const LANGUAGE_MAP = getSupportedCodes().reduce(function(acc, code) {
  acc[code] = code;
  return acc;
}, {});

/**
 * i18n字段列表 - 这些字段需要做多语言适配
 * 对应的Feishu列会是：字段名_语言code (如 name_en, name_zh-CN)
 */
const I18N_FIELDS = [
  'name',           // 产品名称
  'highlights',     // 卖点
  'scenarios',      // 应用场景
  'usage'           // 用法/用途
];

/**
 * 生成i18n key的通用方法
 * @param {string} category - 大类
 * @param {string} subCategory - 小类
 * @param {string} model - 型号
 * @param {string} field - 字段名 (name/highlights/scenarios/usage)
 * @returns {string} key如：category_subCategory_model_name
 */
function generateI18nKey(category, subCategory, model, field) {
  const baseParts = [
    String(category || '').trim().replace(/\s+/g, '_'),
    String(subCategory || '').trim().replace(/\s+/g, '_'),
    String(model || '').trim().replace(/\s+/g, '_')
  ].filter(Boolean);
  const base = baseParts.join('_').toLowerCase();
  const hash = base
    ? crypto.createHash('sha1').update(base, 'utf8').digest('hex').slice(0, 8)
    : 'unknown';
  return `${hash}_${String(field || '').trim()}`.toLowerCase();
}

/**
 * 从产品数据表提取多语言数据
 * 假设产品对象包含 nameEN, nameZH_CN 等属性（由parseRowsToSeries扩展）
 * 
 * @param {Array} productSeries - PRODUCT_DATA_TABLE
 * @returns {Object} { key: { en: '...', zh-CN: '...', ... }, ... }
 */
function extractI18nDataFromProducts(productSeries) {
  // 返回按语言分组的 i18n 数据：{ lang: { i18nId: { field: value, ... } } }
  const byLang = {};

  for (const series of productSeries || []) {
    const category = series.category;
    for (const product of series.products || []) {
      const subCategory = product.subCategory;
      const model = product.model;

      // 生成 i18nId（保持与 generate-products-data-table.js 一致）
      const baseParts = [
        String(category || '').trim().replace(/\s+/g, '_'),
        String(subCategory || '').trim().replace(/\s+/g, '_'),
        String(model || '').trim().replace(/\s+/g, '_')
      ].filter(Boolean);
      const base = baseParts.join('_').toLowerCase();
      const i18nId = base ? crypto.createHash('sha1').update(base, 'utf8').digest('hex').slice(0, 8) : 'unknown';

      // 原来字段以 *I18n 存在，现在统一为 product.i18n 子结构
      const i18nObj = product.i18n || {};
      // 如果存在顶层 legacy *I18n 字段，也一并兼容处理
      for (const prop of Object.keys(product || {})) {
        if (prop.endsWith('I18n') && prop !== 'i18n') {
          const field = prop.slice(0, -4);
          const map = product[prop];
          if (map && typeof map === 'object') i18nObj[field] = Object.assign({}, i18nObj[field] || {}, map);
        }
      }

      for (const [field, map] of Object.entries(i18nObj || {})) {
        if (field === 'id') continue;
        if (!map || typeof map !== 'object') continue;
        for (const [lang, value] of Object.entries(map)) {
          if (!value) continue;
          // 使用平铺 key：i18nId_field（使用先前计算的 i18nId）
          const key = `${i18nId}_${String(field || '').trim().toLowerCase()}`;

          if (!byLang[lang]) byLang[lang] = {};
          byLang[lang][key] = value;
        }
      }
    }
  }

  return byLang;
}

/**
 * 加载所有翻译文件
 * @returns {Object} { en: {...}, zh-CN: {...}, ... }
 */
function loadAllTranslations() {
  const translations = {};
  
  if (!fs.existsSync(TRANSLATIONS_DIR)) {
    console.warn(`⚠️  Translations dir not found: ${TRANSLATIONS_DIR}`);
    return translations;
  }

  // Only read split UI files (-ui.json) to avoid mixing old and new formats
  const files = fs.readdirSync(TRANSLATIONS_DIR).filter(f => f.endsWith('-ui.json'));
  
  for (const file of files) {
    // Strip -ui.json suffix to get the lang code (e.g. zh-CN-ui.json → zh-CN)
    const lang = file.replace(/-ui\.json$/, '');
    const filePath = path.join(TRANSLATIONS_DIR, file);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      translations[lang] = JSON.parse(content);
    } catch (err) {
      console.error(`❌ Error loading translation ${lang}: ${err.message}`);
    }
  }

  return translations;
}

/**
 * 保存产品 i18n 数据到独立文件
 * @param {Object} productI18nData - { key: value, ... }
 */
function saveProductI18n(productI18nData) {
  try {
    // producti18n.json 永远保持平铺中文结构：{ key: "中文值" }
    const normalized = normalizeProductI18n(productI18nData);
    const sorted = Object.fromEntries(
      Object.entries(normalized).sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    );
    fs.writeFileSync(PRODUCT_I18N_PATH, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    console.log(`✅ Saved product i18n: ${PRODUCT_I18N_PATH}`);
    return true;
  } catch (err) {
    console.error(`❌ Error saving product i18n: ${err.message}`);
    return false;
  }
}

/**
 * 加载现有的产品 i18n 文件
 */
function loadProductI18n() {
  if (!fs.existsSync(PRODUCT_I18N_PATH)) {
    return {};
  }
  try {
    const content = fs.readFileSync(PRODUCT_I18N_PATH, 'utf-8');
    const parsed = JSON.parse(content);
    return normalizeProductI18n(parsed);
  } catch (err) {
    console.error(`❌ Error loading product i18n: ${err.message}`);
    return {};
  }
}

/**
 * 保存翻译文件
 * @param {string} lang - 语言代码
 * @param {Object} translationData - 翻译数据
 */
function saveTranslation(lang, translationData) {
  const filePath = path.join(TRANSLATIONS_DIR, `${lang}-ui.json`);
  
  try {
    const sorted = Object.fromEntries(
      Object.entries(translationData).sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
    );
    fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    console.log(`✅ Saved translation: ${lang}`);
  } catch (err) {
    console.error(`❌ Error saving translation ${lang}: ${err.message}`);
  }
}

/**
 * 合并i18n数据到现有翻译文件
 * @param {Object} i18nData - 提取的i18n数据
 * @param {Object} existingTranslations - 现有翻译
 */
function mergeI18nToTranslations(i18nByLang, existingTranslations) {
  // i18nByLang: { lang: { key: text } }
  for (const [lang, entries] of Object.entries(i18nByLang)) {
    if (!existingTranslations[lang]) existingTranslations[lang] = {};
    for (const [key, value] of Object.entries(entries)) {
      existingTranslations[lang][key] = value;
    }
  }
  return existingTranslations;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function isCharacterIndexObject(value) {
  if (!isPlainObject(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every(k => /^\d+$/.test(k));
}

function reconstructCharacterObject(value) {
  return Object.keys(value)
    .map(k => Number(k))
    .sort((a, b) => a - b)
    .map(i => String(value[String(i)] ?? ''))
    .join('');
}

/**
 * 规范化 producti18n：输出平铺中文 { key: "中文值" }
 * 兼容输入：
 * 1) 正常平铺字符串
 * 2) 字符索引对象（"0":"a", ...）
 * 3) 旧版多语言嵌套 { "zh-CN": { key: value }, ... }
 */
function normalizeProductI18n(rawData) {
  if (!isPlainObject(rawData)) return {};

  const topKeys = Object.keys(rawData);
  // langLikeKeys 由注册表派生，包含 zh 用于兼容识别历史数据结构
  const langLikeKeys = new Set([...getAllCodes(), 'zh']);
  const values = Object.values(rawData);
  const objectValueCount = values.filter(v => isPlainObject(v)).length;
  const hasFlatStringEntries = values.some(v => typeof v === 'string');
  const looksLikeByLang = (topKeys.includes('zh-CN') || topKeys.includes('zh')) && objectValueCount >= Math.ceil(topKeys.length * 0.6);

  // 仅当文件整体是按语言分组结构时，才按 zh-CN/zh 入口展开。
  if (!hasFlatStringEntries && looksLikeByLang && isPlainObject(rawData['zh-CN'] || rawData.zh)) {
    const zhData = rawData['zh-CN'] || rawData.zh || {};
    return normalizeProductI18n(zhData);
  }

  const normalized = {};
  for (const [key, value] of Object.entries(rawData)) {
    // 旧版语言包装键（例如 "zh" / "zh-CN"）直接丢弃。
    if (langLikeKeys.has(key)) {
      continue;
    }

    if (typeof value === 'string') {
      normalized[key] = value;
      continue;
    }

    if (isCharacterIndexObject(value)) {
      normalized[key] = reconstructCharacterObject(value);
      continue;
    }

    if (value == null) {
      normalized[key] = '';
      continue;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      normalized[key] = String(value);
      continue;
    }

    // 非预期对象类型，防止写回嵌套结构导致再次污染。
    normalized[key] = '';
  }

  return normalized;
}

/**
 * 从产品表中读取数据并转换为多语言格式
 * 
 * 这是演示函数 - 实际工作流程：
 * 1. parseRowsToSeries扩展：识别 field_en, field_zh-CN 等列
 * 2. 将这些值放入 fieldI18n: { en: '...', zh-CN: '...', ... }
 * 3. 该脚本提取这些fieldI18n对象
 * 4. 生成key并填充到translations
 * 5. 最后将product.name等改为product.nameKey
 */
function readProductDataTable() {
  if (!fs.existsSync(PRODUCT_TABLE_PATH)) {
    console.warn(`⚠️  Product table not found: ${PRODUCT_TABLE_PATH}`);
    return [];
  }

  try {
    const content = fs.readFileSync(PRODUCT_TABLE_PATH, 'utf-8');
    const match = content.match(/export const PRODUCT_DATA_TABLE\s*=\s*(\[.*\])\s*;/s);
    if (!match) {
      console.error('❌ Cannot parse PRODUCT_DATA_TABLE from product-data-table.js');
      return [];
    }
    return JSON.parse(match[1]);
  } catch (err) {
    console.error(`❌ Error reading product data table: ${err.message}`);
    return [];
  }
}

/**
 * 生成产品数据表转换脚本片段
 * 这是给parseRowsToSeries的参考实现
 */
function generateParseRowsExtension() {
  const extension = `
/**
 * 可直接复制到 parseRowsToSeries 的实现片段（与当前 pipeline 对齐）
 * - 使用已有的 SUPPORTED_LANGS 列表作为语言来源
 * - 将每个字段的多语言值收集到 product.i18n[field][lang]
 * - 生成统一的 product.i18nId（sha1.slice(0,8)）
 * - 可选写入兼容字段 fieldKey = \`{i18nId}_{field}\` 以兼容旧前端
 */

// 初始化 i18n 容器
product.i18n = product.i18n || {};

for (const field of ['name', 'highlights', 'scenarios', 'usage']) {
  product.i18n[field] = product.i18n[field] || {};
  // 从行中按语言列读取，例如 name_zh-CN / highlights_en
  for (const lang of SUPPORTED_LANGS) {
    const langKey = \`\${field}_\${lang}\`; // e.g. name_zh-CN
    const val = toNullableString(n[langKey]);
    if (val) product.i18n[field][lang] = val;
  }
  // 清空单语字段，使用 translations 提供文本
  product[field] = null;
}

// 生成 i18nId（与 adapter 保持一致）
product.i18nId = (function(cat, sub, mod) {
    const baseParts = [
    String(cat || '').trim().replace(/\\s+/g, '_'),
    String(sub || '').trim().replace(/\\s+/g, '_'),
    String(mod || '').trim().replace(/\\s+/g, '_')
  ].filter(Boolean);
  const base = baseParts.join('_').toLowerCase();
  const hash = base ? crypto.createHash('sha1').update(base, 'utf8').digest('hex').slice(0, 8) : 'unknown';
  return hash;
})(product.category, product.subCategory, product.model);

// 可选：兼容旧前端，设置每字段的 key
for (const field of ['name', 'highlights', 'scenarios', 'usage']) {
  product[\`\${field}Key\`] = \`\${product.i18nId}_\${field}\`;
}
`;
  return extension;
}

/**
 * 主工作流程演示
 */
function displayImplementationPlan() {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📋 产品多语言适配 - 实现方案演示');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('🔄 工作流程：\n');
  
  console.log('【第1步】Feishu/Excel数据源设计');
  console.log('────────────────────────────────');
  console.log('在Feishu中，将多语言字段这样命名：\n');
  console.log('  产品名称_EN      name_en');
  console.log('  产品名称_ZH-CN   name_zh-CN');
  console.log('  产品名称_DE      name_de');
  console.log('  卖点_EN          highlights_en');
  console.log('  卖点_ZH-CN       highlights_zh-CN');
  console.log('  用法_EN          usage_en');
  console.log('  应用场景_EN      scenarios_en\n');
  
  console.log('【第2步】扩展 scripts/generate-products-data-table.js');
  console.log('────────────────────────────────────────────────');
  console.log('在 parseRowsToSeries 中识别这些多语言列，并组装为：');
  console.log(`
  product.nameI18n = {
    en: "Product Name from Feishu",
    "zh-CN": "飞书中的产品名称"
  }
  product.name = null;  // 不存储文本，改用key
  product.nameKey = "category_subCategory_model_name";  // i18n key
  `);
  
  console.log('【第3步】运行本脚本提取多语言数据到translations');
  console.log('────────────────────────────────────────');
  console.log(`
  node scripts/product-i18n-adapter.js --action generate
  
  该脚本会：
  ✓ 读取product-data-table.js中的nameI18n/highlightsI18n等
  ✓ 为每条多语言数据生成key
  ✓ 并入到src/assets/lang/*.json

  生成的lang/en.json会包含：
  {
    "existing_keys": "...",
    "category_subcategory_model_name": "Product Name",
    "category_subcategory_model_highlights": "Feature 1; Feature 2",
    ...
  }
  `);

  console.log('【第4步】修改前端渲染逻辑');
  console.log('────────────────────');
  console.log(`
  在src/assets/utils.js中的renderProducts()函数，修改字段访问：
  
  原来：
    product.name
    product.highlights.join('; ')
  
  改为：
    tr(product.nameKey)
    tr(product.highlightsKey)
  
  由于 languageChanged 事件已经触发scheduleRenderProducts()，
  所以用户切换语言时会自动重新渲染，无需额外改动。
  `);

  console.log('\n【第5步】Webpack打包');
  console.log('────────────────');
  console.log(`
  npm run build

  Webpack会：
  ✓ 将所有lang/*.json打包到dist/
  ✓ bundle.js中的tr()函数按需查询对应语言的key
  ✓ 没有增加bundle体积（lang已经分离）
  `);

  console.log('\n\n📊 数据示例对比：\n');
  
  console.log('【改造前】- 单语言产品表（103个产品）');
  console.log('──────────────────────────');
  console.log(`
PRODUCT_DATA_TABLE = [
  {
    category: "Commercial Ovens",
    products: [
      {
        name: "Deck Oven 1000",
        highlights: "Large capacity; Fast heating; Energy efficient",
        usage: "Bakery production",
        scenarios: "Professional kitchens",
        ...
      }
    ]
  }
]

产品表体积：~150KB JSON
  `);

  console.log('【改造后】- 多语言key版本');
  console.log('────────────────');
  console.log(`
PRODUCT_DATA_TABLE = [
  {
    category: "Commercial Ovens",
    products: [
      {
        nameKey: "commercial_ovens_deck_oven_1000_name",
        highlightsKey: "commercial_ovens_deck_oven_1000_highlights",
        usageKey: "commercial_ovens_deck_oven_1000_usage",
        scenariosKey: "commercial_ovens_deck_oven_1000_scenarios",
        ...
      }
    ]
  }
]

产品表体积：~20KB JSON （减少87%！）

translations/en.json:
{
  "commercial_ovens_deck_oven_1000_name": "Deck Oven 1000",
  "commercial_ovens_deck_oven_1000_highlights": "Large capacity; Fast heating; Energy efficient",
  "commercial_ovens_deck_oven_1000_usage": "Bakery production",
  "commercial_ovens_deck_oven_1000_scenarios": "Professional kitchens",
  ...
}

translations/zh-CN.json:
{
  "commercial_ovens_deck_oven_1000_name": "甲板烤箱1000",
  "commercial_ovens_deck_oven_1000_highlights": "大容量；加热快；节能",
  "commercial_ovens_deck_oven_1000_usage": "面包房生产",
  "commercial_ovens_deck_oven_1000_scenarios": "专业厨房",
  ...
}
  `);

  console.log('\n📈 性能分析：\n');
  console.log('当前：');
  console.log('  • bundle.js: 156 KiB');
  console.log('  • styles.css: 82.1 KiB');
  console.log('  • product-data-table.js: ~150 KiB (改造后 ~20 KiB)');
  console.log('  • translations: 22个JSON文件共 ~500 KiB');
  console.log('  • Total: 888 KiB\n');
  
  console.log('改造后：');
  console.log('  • bundle.js: 156 KiB (不变)');
  console.log('  • styles.css: 82.1 KiB (不变)');
  console.log('  • product-data-table.js: ~20 KiB (减少130 KiB) ✓');
  console.log('  • translations: 22个JSON，每个增加~5-10KB (产品多语言数据)');
  console.log('  • Total: ~750-850 KiB (减少20-40 KiB，整体优化)');

  console.log('\n\n💡 关键优势：');
  console.log('─────────');
  console.log('  ✓ 产品表缩小87%');
  console.log('  ✓ 复用现有translations架构，无需新增系统');
  console.log('  ✓ 解耦合：产品数据 ⊥ 翻译内容');
  console.log('  ✓ 添加新语言只需上传JSON，无需重新生成产品表');
  console.log('  ✓ 翻译可以实时更新（不需要rebuild产品表）');
  console.log('  ✓ SEO友好：对应语言的key在HTML/meta中，搜索引擎可识别');

  console.log('\n\n🛠️  实现核心代码（待集成）：\n');
  console.log(generateParseRowsExtension());

  console.log('\n═══════════════════════════════════════════════════════════════\n');
}

// 命令行入口
const action = process.argv[2] || '--help';

if (action === '--help' || action === '-h') {
  console.log('Usage: node scripts/product-i18n-adapter.js [action]\n');
  console.log('Actions:');
  console.log('  --help          Show this help');
  console.log('  --plan          Display full implementation plan (default)');
  console.log('  --generate      Extract i18n data and merge into translations\n');
} else if (action === '--plan') {
  displayImplementationPlan();
} else if (action === '--generate') {
  console.log('\n🔄 Extracting i18n data from products to producti18n.json...\n');
  
  const products = readProductDataTable();
  if (products.length === 0) {
    console.log('❌ No products found. Make sure product-data-table.js exists and has data.\n');
    process.exit(1);
  }

  console.log(`✓ Loaded ${products.length} series from product-data-table.js`);
  
  const i18nData = extractI18nDataFromProducts(products);
  const generatedZh = i18nData['zh-CN'] || i18nData.zh || {};
  const generatedTotal = Object.keys(generatedZh).length;
  console.log(`✓ Extracted ${generatedTotal} zh-CN product key/value pairs\n`);
  console.log('🧾 Generated product i18n key/value list (zh-CN source):');
  for (const [key, value] of Object.entries(generatedZh)) {
    console.log(`[generated][zh-CN] ${key} = ${value}`);
  }
  console.log('');

  // 加载现有的 producti18n.json
  const existingProductI18n = loadProductI18n();
  console.log(`✓ Loaded existing product i18n (${Object.keys(existingProductI18n).length} keys)\n`);

  // 合并新数据到现有平铺中文 i18n
  const mergedProductI18n = { ...existingProductI18n, ...generatedZh };

  // 统计更改（平铺 key）
  const writtenChanges = {};
  for (const [key, value] of Object.entries(mergedProductI18n)) {
    if (existingProductI18n[key] !== value) {
      writtenChanges[key] = value;
    }
  }

  const writtenTotal = Object.keys(writtenChanges).length;
  console.log(`📝 To be written ${writtenTotal} changed product keys:`);
  for (const [key, value] of Object.entries(writtenChanges)) {
    console.log(`[write][zh-CN] ${key} = ${value}`);
  }
  console.log('');
  
  // 保存到 producti18n.json
  const saved = saveProductI18n(mergedProductI18n);

  if (saved) {
    // 统计摘要
    console.log('\n📊 Summary:');
    console.log(`  • zh-CN source keys: ${Object.keys(mergedProductI18n).length}`);
    console.log(`  • newly added/updated: ${writtenTotal}`);
    console.log('\n✅ Done! Product i18n merged.\n');
  }
} else {
  displayImplementationPlan();
}

module.exports = {
  generateI18nKey,
  extractI18nDataFromProducts,
  loadAllTranslations,
  saveTranslation,
  mergeI18nToTranslations,
  LANGUAGE_MAP,
  I18N_FIELDS
};
