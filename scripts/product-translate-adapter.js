/**
 * product-translate-adapter.js
 *
 * 产品中文数据多语言翻译适配脚本
 *
 * ── 翻译引擎 ─────────────────────────────────────────────────────────────────
 *  主引擎  ：SiliconFlow Hunyuan-MT-7B（腾讯混元专用翻译模型）
 *            速度约是 scnet 的 2×，质量更优（WMT2025 30 项冠军）
 *  降级引擎：scnet Qwen3-30B
 *            用于 Hunyuan 不支持的语言（he 希伯来语、ms 马来语）
 *
 * ── 两种翻译模式 ─────────────────────────────────────────────────────────────
 *  全量模式（translateProducts）：
 *    翻译所有产品的所有字段；已存在且合法的译文不覆盖
 *    适用场景：初始化、清理翻译文件、语言规模大幅变化
 *
 *  增量模式（translateProductsIncremental）：
 *    对比"当前产品快照"与"上次快照"，只翻译新增/变更的产品 key
 *    核心逻辑：
 *      1. 读取 .translation-snapshot.json（上次全量翻译的产品指纹）
 *      2. 计算每条产品字段的内容哈希（sha1 前16位）
 *      3. 仅对哈希发生变化的 key 触发翻译
 *      4. 翻译完成后更新快照
 *    适用场景：日常产品数据更新（新增产品、修改描述）
 *
 * ── 使用方法 ─────────────────────────────────────────────────────────────────
 *  npm run translate:products              # 全量翻译
 *  npm run translate:products:incremental  # 增量翻译（只处理变化）
 *  node scripts/product-translate-adapter.js --incremental
 *  node scripts/product-translate-adapter.js --demo
 *  node scripts/product-translate-adapter.js --mock
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const { getSupportedCodes } = require(path.join(__dirname, '../src/lang-registry'));
const { prepareForTranslation, postprocessText } = require('./product-translation-handler');
const {
  translateHunyuan,
  translateJsonObjectHunyuan,
  isHunyuanSupported,
  translateWithRetry,
  translateJsonObject,
} = require('./unified-translator');

// ─────────────────────────────────────────────
// 常量 & 配置
// ─────────────────────────────────────────────

const TRANSLATIONS_DIR    = path.join(process.cwd(), 'src/assets/lang');
const PRODUCT_TABLE_PATH  = path.join(process.cwd(), 'src/assets/product-data-table.js');
// 增量翻译快照：记录上次翻译时每个产品字段的内容哈希
const SNAPSHOT_PATH       = path.join(process.cwd(), '.translation-snapshot.json');

// 日志配置：设置为 true 可查看详细的 key/value 翻译过程
const VERBOSE_LOGGING = false;

// 支持的语言映射（由 src/lang-registry.js 统一管理）
const LANGUAGE_MAP   = getSupportedCodes().reduce((acc, code) => { acc[code] = code; return acc; }, {});
const SUPPORTED_LANGS = Object.keys(LANGUAGE_MAP);

// 需要翻译的产品字段（排除代码类字段）
const I18N_FIELDS = [
  'name', 'highlights', 'scenarios', 'usage', 'badge', 'category', 'color',
  'controlmethod', 'frequency', 'material', 'power', 'productdimensions',
  'status', 'throughput', 'averagetime', 'netweight', 'outerboxdimensions',
  'packagedimensions', 'temperaturerange', 'voltage',
];

const FIELD_SOURCE_ALIASES = {
  averagetime:      ['averageTime'],
  controlmethod:    ['controlMethod'],
  imagerecognitionkey: ['imageRecognitionKey'],
  netweight:        ['netWeight'],
  outerboxdimensions: ['outerBoxDimensions'],
  packagedimensions: ['packageDimensions'],
  productdimensions: ['productDimensions'],
  subcategory:      ['subCategory'],
  temperaturerange: ['temperatureRange'],
};

// ─────────────────────────────────────────────
// Key / 字段工具
// ─────────────────────────────────────────────

function generateI18nKey(category, subCategory, model, field) {
  const baseParts = [
    String(category   || '').trim().replace(/\s+/g, '_'),
    String(subCategory || '').trim().replace(/\s+/g, '_'),
    String(model      || '').trim().replace(/\s+/g, '_'),
  ].filter(Boolean);
  const base = baseParts.join('_').toLowerCase();
  const hash = base
    ? crypto.createHash('sha1').update(base, 'utf8').digest('hex').slice(0, 8)
    : 'unknown';
  return `${hash}_${String(field || '').trim()}`.toLowerCase();
}

function normalizeSourceText(v) {
  if (!v && v !== 0) return null;
  if (typeof v !== 'string') v = String(v);
  const s = v.trim();
  if (!s) return null;
  const low = s.toLowerCase();
  if (low === 'null' || low === 'undefined') return null;
  return s;
}

function getProductFieldSource(series, product, field) {
  const fieldI18n = (product.i18n && product.i18n[field]) || {};
  const i18nCandidate =
    fieldI18n['zh-CN'] || fieldI18n.zh || fieldI18n.zh_CN ||
    fieldI18n['zh-cn'] || Object.values(fieldI18n)[0];
  const fromI18n = normalizeSourceText(i18nCandidate);
  if (fromI18n) return fromI18n;

  if (field === 'category')    return normalizeSourceText(product.category || (series && series.category));
  if (field === 'subcategory') return normalizeSourceText(product.subCategory || product.subcategory);

  const aliases = [field, ...(FIELD_SOURCE_ALIASES[field] || [])];
  for (const k of aliases) {
    const val = normalizeSourceText(product[k]);
    if (val) return val;
  }
  return null;
}

function isLikelyChineseText(value) {
  if (value == null) return false;
  return /[\u4e00-\u9fff]/.test(String(value).trim());
}

/**
 * 判断是否应该写入翻译值
 *
 * @param {string}  lang           - 目标语言代码
 * @param {string}  existingValue  - 当前文件中已有的译文（可能为空）
 * @param {string}  sourceChinese  - 中文原文
 * @param {boolean} [isChanged]    - 该 key 的内容指纹是否已变化（增量/全量均可传入）
 *                                   为 true 时强制覆盖，避免原文改了但旧译文残留
 */
function shouldWriteTranslation(lang, existingValue, sourceChinese, isChanged = false) {
  // 原文已变化 → 任何语言都必须重新写入
  if (isChanged) return true;
  // zh-CN：直接写原文；只有在没有已有值时才写（避免全量模式重复覆盖未变化的中文）
  if (lang === 'zh-CN') return !existingValue;
  if (!existingValue) return true;
  const existing = String(existingValue).trim();
  const source   = String(sourceChinese || '').trim();
  // 现有值等于中文原文（说明之前从未成功翻译过）→ 重新翻译
  if (existing && source && existing === source) return true;
  // 现有值本身是中文（翻译引擎上次输出了中文）→ 重新翻译
  if (isLikelyChineseText(existing)) return true;
  // 已有合法译文且原文未变 → 保留，避免覆盖人工校对过的内容
  return false;
}

function shouldAcceptTranslatedText(lang, sourceChinese, translatedText) {
  if (lang === 'zh-CN' || lang === 'zh-TW') return true;
  const source     = String(sourceChinese  || '').trim();
  const translated = String(translatedText || '').trim();
  if (!translated) return false;
  if (source && translated === source) return false;
  if (isLikelyChineseText(source) && isLikelyChineseText(translated)) return false;
  return true;
}

function logTranslationKeyValue(stage, lang, key, value, source) {
  if (!VERBOSE_LOGGING) return;
  const sourcePart = source ? ` | source=${source}` : '';
  console.log(`[${stage}][${lang}] ${key} = ${value}${sourcePart}`);
}

// ─────────────────────────────────────────────
// 翻译引擎路由
//   主引擎：Hunyuan-MT-7B（SiliconFlow）
//   降级：  he/ms → scnet Qwen3-30B
// ─────────────────────────────────────────────

/**
 * 单条文本翻译（含引擎路由）
 */
async function translateText(text, targetLang) {
  if (!text || typeof text !== 'string' || !text.trim()) return text || '';
  if (targetLang === 'zh-CN') return text;
  try {
    if (isHunyuanSupported(targetLang)) {
      return await translateHunyuan(text.trim(), targetLang);
    } else {
      // 降级到 scnet（he/ms）
      return await translateWithRetry(text.trim(), targetLang);
    }
  } catch (error) {
    console.warn(`⚠️  Translation failed [${targetLang}]: "${text.substring(0, 50)}" - ${error.message}`);
    return text;
  }
}

/**
 * 批量翻译（打包为 JSON，大幅减少请求次数）
 *   - Hunyuan 支持的语言 → translateJsonObjectHunyuan
 *   - he/ms 降级 → translateJsonObject (scnet)
 */
async function translateTexts(texts, targetLang) {
  if (!texts || !Array.isArray(texts) || texts.length === 0) {
    console.log(`📝 No texts to translate for ${targetLang}`);
    return {};
  }

  const validTexts = texts.filter(t => t && typeof t === 'string' && t.trim().length > 0);
  if (validTexts.length === 0) {
    console.warn(`⚠️  No valid texts for ${targetLang}`);
    return {};
  }

  const engine = isHunyuanSupported(targetLang) ? 'Hunyuan' : 'scnet↓';
  console.log(`🔤 [${targetLang}][${engine}] 批量翻译 ${validTexts.length} 条文本...`);

  // 构建 索引 → 原文 的对象，便于批量翻译
  const indexedInput = {};
  validTexts.forEach((t, i) => { indexedInput[`__t${i}`] = t; });

  let indexedOutput;
  try {
    if (isHunyuanSupported(targetLang)) {
      indexedOutput = await translateJsonObjectHunyuan(indexedInput, targetLang);
    } else {
      indexedOutput = await translateJsonObject(indexedInput, targetLang);
    }
  } catch (err) {
    console.error(`❌ [${targetLang}] 批量翻译失败: ${err.message}，降级为逐条翻译`);
    // 降级：逐条翻译
    indexedOutput = {};
    for (let i = 0; i < validTexts.length; i++) {
      try {
        indexedOutput[`__t${i}`] = await translateText(validTexts[i], targetLang);
      } catch {
        indexedOutput[`__t${i}`] = validTexts[i];
      }
    }
  }

  // 还原为 原文 → 译文 的映射
  const results = {};
  validTexts.forEach((t, i) => {
    const key = `__t${i}`;
    results[t] = indexedOutput[key] || t;
  });

  const successCount = validTexts.filter((t) => results[t] !== t).length;
  console.log(`✅ [${targetLang}] 完成: ${successCount}/${validTexts.length} 条翻译成功`);
  return results;
}

// ─────────────────────────────────────────────
// 文件读写工具
// ─────────────────────────────────────────────

function extractChineseProductData() {
  if (!fs.existsSync(PRODUCT_TABLE_PATH)) {
    console.error(`❌ Product data table not found: ${PRODUCT_TABLE_PATH}`);
    return [];
  }
  try {
    const content = fs.readFileSync(PRODUCT_TABLE_PATH, 'utf-8');
    const match = content.match(/export const PRODUCT_DATA_TABLE\s*=\s*(\[.*\])\s*;/s);
    if (!match) { console.error('❌ Cannot parse PRODUCT_DATA_TABLE'); return []; }
    return JSON.parse(match[1]);
  } catch (err) {
    console.error(`❌ Error reading product table: ${err.message}`);
    return [];
  }
}

function loadTranslations() {
  const translations = {};
  if (!fs.existsSync(TRANSLATIONS_DIR)) {
    console.warn(`⚠️  Translations dir not found: ${TRANSLATIONS_DIR}`);
    return translations;
  }
  // Only load product files (-product.json) — product translations are isolated
  // from UI translations (-ui.json) to prevent key namespace collisions
  for (const file of fs.readdirSync(TRANSLATIONS_DIR).filter(f => f.endsWith('-product.json'))) {
    const lang = file.replace(/-product\.json$/, '');
    try {
      translations[lang] = JSON.parse(fs.readFileSync(path.join(TRANSLATIONS_DIR, file), 'utf-8'));
    } catch (err) {
      console.error(`❌ Error loading product translation ${lang}: ${err.message}`);
    }
  }
  return translations;
}

function saveTranslationFiles(translationsByLang) {
  let saved = 0;
  for (const [lang, data] of Object.entries(translationsByLang)) {
    // Write to {lang}-product.json — product translations are stored separately
    // from UI translations and later aggregated into src/assets/product-i18n.json
    const filePath = path.join(TRANSLATIONS_DIR, `${lang}-product.json`);
    try {
      let existing = {};
      if (fs.existsSync(filePath)) {
        existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
      const merged = { ...existing, ...data };
      const sorted = {};
      Object.keys(merged).sort().forEach(k => { sorted[k] = merged[k]; });
      fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
      saved++;
    } catch (err) {
      console.error(`❌ Error saving ${lang}-product.json: ${err.message}`);
    }
  }
  console.log(`✅ Saved ${saved} product translation files to ${TRANSLATIONS_DIR}`);
  return saved > 0;
}

// ─────────────────────────────────────────────
// 增量翻译：快照管理
// ─────────────────────────────────────────────

/**
 * 计算单个产品字段的内容指纹
 * key: i18n key，source: 中文原文
 */
function fieldFingerprint(key, source) {
  return crypto.createHash('sha1').update(`${key}::${source}`, 'utf8').digest('hex').slice(0, 16);
}

/** 加载上次翻译快照（不存在时返回空对象） */
function loadSnapshot() {
  try {
    if (fs.existsSync(SNAPSHOT_PATH)) {
      return JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}

/** 保存翻译快照 */
function saveSnapshot(snapshot) {
  try {
    fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
  } catch (err) {
    console.warn(`⚠️  无法保存翻译快照: ${err.message}`);
  }
}

/**
 * 从产品数据构建完整的 key → { source, fingerprint } 映射
 * （用于和快照对比，找出新增/变更的条目）
 */
function buildCurrentKeyMap(productSeries) {
  const map = {}; // key → { source, fingerprint }
  for (const series of productSeries) {
    for (const product of series.products || []) {
      for (const field of I18N_FIELDS) {
        const source = getProductFieldSource(series, product, field);
        if (!source) continue;
        const key = generateI18nKey(series.category, product.subCategory, product.model, field);
        map[key] = { source, fingerprint: fieldFingerprint(key, source) };
      }
    }
  }
  return map;
}

// ─────────────────────────────────────────────
// 核心翻译工作流（单语言，两模式共用）
// ─────────────────────────────────────────────

/**
 * 翻译单个语言，仅处理 pendingKeys 中指定的 key 集合
 * pendingKeys: Set<string>（要翻译的 i18n key），为 null 时翻译全部
 *
 * 返回 { lang, writes: {key→value}, langStats }
 */
async function translateOneLang(lang, li, totalLangs, productSeries, translations, pendingKeys = null) {
  const targetLang    = LANGUAGE_MAP[lang];
  const pendingLabel  = pendingKeys ? ` (增量: ${pendingKeys.size} keys)` : ' (全量)';
  console.log(`\n[${li + 1}/${totalLangs}] 🌐 翻译 → ${lang}${pendingLabel}...`);

  // 收集本语言需要发送给 API 的 protectedText → source 映射
  const rawToProtected    = new Map();
  const rawToPlaceholders = new Map();
  const pendingEntries    = []; // [{key, chineseText, protectedText, placeholderMap}]

  for (const series of productSeries) {
    for (const product of series.products || []) {
      for (const field of I18N_FIELDS) {
        const chineseText = getProductFieldSource(series, product, field);
        if (!chineseText) continue;

        const key = generateI18nKey(series.category, product.subCategory, product.model, field);

        // 增量模式：跳过不需要翻译的 key
        if (pendingKeys && !pendingKeys.has(key)) continue;

        if (!rawToProtected.has(chineseText)) {
          const { protected: pt, placeholderMap } = prepareForTranslation(chineseText, field);
          rawToProtected.set(chineseText, pt);
          rawToPlaceholders.set(chineseText, placeholderMap);
        }
        pendingEntries.push({ key, chineseText });
      }
    }
  }

  if (pendingEntries.length === 0) {
    console.log(`  [${lang}] 无需翻译（已是最新）`);
    return { lang, writes: {}, langStats: { added: 0, skipped: 0, samples: [] } };
  }

  // 发送给 API 的唯一 protectedText 列表（去重）
  const uniqueProtectedTexts = Array.from(new Set(rawToProtected.values()));
  const protectedTranslations = await translateTexts(uniqueProtectedTexts, targetLang);

  // 组装写入结果
  const langWrites = {};
  const langStats  = { added: 0, skipped: 0, samples: [] };

  for (const { key, chineseText } of pendingEntries) {
    const protectedText  = rawToProtected.get(chineseText)    || chineseText;
    const placeholderMap = rawToPlaceholders.get(chineseText) || new Map();

    const rawTranslated = protectedTranslations[protectedText] || protectedTranslations[chineseText] || chineseText;
    const { recovered: translatedText, warnings } = postprocessText(rawTranslated, placeholderMap);

    if (warnings && warnings.length > 0) {
      console.warn(`  ⚠️  Placeholder recovery warnings for "${key}" in ${lang}:`, warnings);
    }

    logTranslationKeyValue('generated', lang, key, translatedText, chineseText);

    if (!shouldAcceptTranslatedText(lang, chineseText, translatedText)) {
      logTranslationKeyValue('skip-failed', lang, key, translatedText, chineseText);
      langStats.skipped++;
      continue;
    }

    const existingVal = (translations[lang] || {})[key];
    // pendingKeys !== null 代表增量模式，进入此循环的 key 均已确认内容有变化
    const isChanged = pendingKeys !== null;
    if (shouldWriteTranslation(lang, existingVal, chineseText, isChanged)) {
      langWrites[key] = translatedText;
      logTranslationKeyValue('write', lang, key, translatedText, chineseText);
      langStats.added++;
      if (langStats.samples.length < 10) {
        langStats.samples.push({ key, source: chineseText, target: translatedText });
      }
    } else {
      logTranslationKeyValue('skip', lang, key, existingVal, chineseText);
      langStats.skipped++;
    }
  }

  console.log(`✅ [${lang}] 完成: +${langStats.added} 新增, ${langStats.skipped} 跳过`);
  return { lang, writes: langWrites, langStats };
}

/**
 * 处理中文源语言（zh-CN）：直接写入原文，无需调用翻译 API
 */
function processChineseLang(productSeries, translations, stats, pendingKeys = null) {
  console.log('\n📝 Processing Chinese (source language)...');
  for (const lang of ['zh-CN']) {
    if (!translations[lang]) translations[lang] = {};
    if (!stats[lang]) stats[lang] = { added: 0, skipped: 0, samples: [] };

    for (const series of productSeries) {
      for (const product of series.products || []) {
        for (const field of I18N_FIELDS) {
          const chineseText = getProductFieldSource(series, product, field);
          if (!chineseText) continue;
          const key = generateI18nKey(series.category, product.subCategory, product.model, field);
          if (pendingKeys && !pendingKeys.has(key)) continue;

          logTranslationKeyValue('generated', lang, key, chineseText, chineseText);
          // pendingKeys !== null 代表增量/变更模式，进入此循环的 key 内容已变化，必须更新
          const isChanged = pendingKeys !== null;
          const needsWrite = isChanged
            || !Object.prototype.hasOwnProperty.call(translations[lang], key)
            || !translations[lang][key];
          if (needsWrite) {
            translations[lang][key] = chineseText;
            logTranslationKeyValue('write', lang, key, chineseText, chineseText);
            stats[lang].added++;
            if (stats[lang].samples.length < 10) {
              stats[lang].samples.push({ key, source: chineseText, target: chineseText });
            }
          } else {
            logTranslationKeyValue('skip', lang, key, translations[lang][key], chineseText);
            stats[lang].skipped++;
          }
        }
      }
    }
    console.log(`✅ Processed ${lang}`);
  }
}

/** 打印最终统计 */
function printStats(stats, translations) {
  for (const lang of SUPPORTED_LANGS) {
    if (!translations[lang]) continue;
    const ls = stats[lang] || { added: 0, skipped: 0, samples: [] };
    console.log(`  • ${lang}: newly added ${ls.added} keys`);
    if (ls.samples && ls.samples.length > 0) {
      console.log('    Examples:');
      for (const s of ls.samples) {
        if (s && s.key && s.target) console.log(`      ${s.key} -> ${s.target}`);
      }
    }
  }
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
//  全量翻译（translateProducts）
//  翻译所有产品字段；已存在且合法的译文不覆盖
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────

/**
 * 全量翻译
 * 适用场景：初始化、清理翻译文件、语言规模大幅变化时重建
 */
async function translateProducts() {
  console.log('\n🔄 Starting FULL product translation (Hunyuan-MT-7B + scnet fallback)...\n');

  const productSeries = extractChineseProductData();
  if (productSeries.length === 0) { console.error('❌ No product series found'); process.exit(1); }

  const totalProducts = productSeries.reduce((sum, s) => sum + (s.products || []).length, 0);
  if (totalProducts === 0) { console.error('❌ No products found'); process.exit(1); }

  console.log(`📖 Found ${productSeries.length} series, ${totalProducts} products`);

  const translations = loadTranslations();
  const allLangs     = new Set([...Object.keys(translations), ...SUPPORTED_LANGS]);
  console.log(`📚 Loaded ${allLangs.size} language files\n`);

  const stats = {};
  for (const lang of SUPPORTED_LANGS) stats[lang] = { added: 0, skipped: 0, samples: [] };

  const targetLangs = SUPPORTED_LANGS.filter(l => l !== 'zh-CN');
  console.log(`🌐 共需翻译 ${targetLangs.length} 种目标语言（全并发）\n`);

  // 全语言并发
  const batchResults = await Promise.all(
    targetLangs.map((lang, i) =>
      translateOneLang(lang, i, targetLangs.length, productSeries, translations, null)
    )
  );

  for (const { lang, writes, langStats } of batchResults) {
    if (!translations[lang]) translations[lang] = {};
    Object.assign(translations[lang], writes);
    if (stats[lang]) {
      stats[lang].added   += langStats.added;
      stats[lang].skipped += langStats.skipped;
      stats[lang].samples.push(...langStats.samples.slice(0, 10 - stats[lang].samples.length));
    }
  }

  processChineseLang(productSeries, translations, stats, null);

  // 全量翻译后更新快照
  const currentKeyMap = buildCurrentKeyMap(productSeries);
  const snapshot = {};
  for (const [key, { fingerprint }] of Object.entries(currentKeyMap)) {
    snapshot[key] = fingerprint;
  }
  saveSnapshot(snapshot);
  console.log(`💾 已更新翻译快照（${Object.keys(snapshot).length} 个 key）`);

  console.log('\n💾 Saving product translations to lang/*.json...\n');
  try {
    saveTranslationFiles(translations);
    printStats(stats, translations);
  } catch (err) {
    console.error(`❌ Failed saving translations: ${err.message}`);
  }

  console.log('\n✨ Done! Full translation complete.\n');
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
//  增量翻译（translateProductsIncremental）
//  只翻译新增/变更的产品字段 key
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────

/**
 * 增量翻译
 *
 * 工作流程：
 *  1. 读取 .translation-snapshot.json（上次快照）
 *  2. 计算本次所有 key 的内容指纹
 *  3. 对比找出：新增 key + 内容有变化的 key
 *  4. 只对这些 key 调用翻译 API
 *  5. 写入翻译文件，更新快照
 */
async function translateProductsIncremental() {
  console.log('\n⚡ Starting INCREMENTAL product translation (Hunyuan-MT-7B + scnet fallback)...\n');

  const productSeries = extractChineseProductData();
  if (productSeries.length === 0) { console.error('❌ No product series found'); process.exit(1); }

  const totalProducts = productSeries.reduce((sum, s) => sum + (s.products || []).length, 0);
  if (totalProducts === 0) { console.error('❌ No products found'); process.exit(1); }

  console.log(`📖 Found ${productSeries.length} series, ${totalProducts} products`);

  // 加载快照，对比找出变更 key
  const lastSnapshot   = loadSnapshot();
  const currentKeyMap  = buildCurrentKeyMap(productSeries);
  const isFirstRun     = Object.keys(lastSnapshot).length === 0;

  const changedKeys = new Set();
  for (const [key, { fingerprint }] of Object.entries(currentKeyMap)) {
    if (lastSnapshot[key] !== fingerprint) {
      changedKeys.add(key);
    }
  }

  const removedCount = Object.keys(lastSnapshot).filter(k => !currentKeyMap[k]).length;

  if (isFirstRun) {
    console.log(`🆕 首次运行，无快照，执行全量翻译（${changedKeys.size} 个 key）`);
  } else {
    console.log('🔍 快照对比完成:');
    console.log(`   上次快照: ${Object.keys(lastSnapshot).length} 个 key`);
    console.log(`   本次产品: ${Object.keys(currentKeyMap).length} 个 key`);
    console.log(`   新增/变更: ${changedKeys.size} 个 key`);
    console.log(`   已删除产品 key: ${removedCount} 个（译文保留，不删除）`);
  }

  if (changedKeys.size === 0) {
    console.log('\n✅ 所有产品翻译均为最新，无需重新翻译。\n');
    return;
  }

  const translations = loadTranslations();
  const allLangs     = new Set([...Object.keys(translations), ...SUPPORTED_LANGS]);
  console.log(`\n📚 Loaded ${allLangs.size} language files`);

  const stats = {};
  for (const lang of SUPPORTED_LANGS) stats[lang] = { added: 0, skipped: 0, samples: [] };

  const targetLangs = SUPPORTED_LANGS.filter(l => l !== 'zh-CN');
  console.log(`🌐 共需翻译 ${targetLangs.length} 种目标语言 × ${changedKeys.size} 个变更 key（全并发）\n`);

  // 全语言并发（每语言内只处理 changedKeys）
  const batchResults = await Promise.all(
    targetLangs.map((lang, i) =>
      translateOneLang(lang, i, targetLangs.length, productSeries, translations, changedKeys)
    )
  );

  for (const { lang, writes, langStats } of batchResults) {
    if (!translations[lang]) translations[lang] = {};
    Object.assign(translations[lang], writes);
    if (stats[lang]) {
      stats[lang].added   += langStats.added;
      stats[lang].skipped += langStats.skipped;
      stats[lang].samples.push(...langStats.samples.slice(0, 10 - stats[lang].samples.length));
    }
  }

  processChineseLang(productSeries, translations, stats, changedKeys);

  // 更新快照：仅更新已处理的 key，其余保留
  const newSnapshot = { ...lastSnapshot };
  for (const [key, { fingerprint }] of Object.entries(currentKeyMap)) {
    newSnapshot[key] = fingerprint;
  }
  // 删除已不存在的产品 key 的快照记录（可选：保留也无害，这里清理掉）
  for (const key of Object.keys(newSnapshot)) {
    if (!currentKeyMap[key]) delete newSnapshot[key];
  }
  saveSnapshot(newSnapshot);
  console.log(`💾 已更新翻译快照（${Object.keys(newSnapshot).length} 个 key，本次变更 ${changedKeys.size} 个）`);

  console.log('\n💾 Saving product translations to lang/*.json...\n');
  try {
    saveTranslationFiles(translations);
    printStats(stats, translations);
  } catch (err) {
    console.error(`❌ Failed saving translations: ${err.message}`);
  }

  console.log('\n✨ Done! Incremental translation complete.\n');
}

// ─────────────────────────────────────────────
// Mock 流程（--mock flag，无网络、无文件写入）
// ─────────────────────────────────────────────

function runMockTranslationFlow() {
  const mockProductSeries = [
    {
      category: 'Oven',
      products: [
        {
          subCategory: 'Deck', model: 'DK-100',
          i18n: { name: { 'zh-CN': '甲板烤箱100' }, highlights: { 'zh-CN': '大容量; 节能' }, usage: { 'zh-CN': '面包店' }, scenarios: { 'zh-CN': '商业厨房' } }
        },
        {
          subCategory: 'Convection', model: 'CV-50',
          i18n: { name: { 'zh-CN': '热风烤箱50' }, highlights: { 'zh-CN': '升温快' } }
        },
      ],
    },
  ];

  const targetLangs          = ['en', 'fr', 'de'];
  const existingTranslations = { en: { ae482821_name: 'Deck Oven 100 (existing)' }, fr: {}, de: {} };

  function mockTranslate(text, lang) { return `[${lang}] ${text}`; }

  const generatedByLang = {};
  for (const lang of targetLangs) generatedByLang[lang] = {};

  for (const series of mockProductSeries) {
    for (const product of series.products || []) {
      for (const field of I18N_FIELDS) {
        const zhText = product.i18n && product.i18n[field] && (product.i18n[field]['zh-CN'] || product.i18n[field].zh);
        if (!zhText) continue;
        const key = generateI18nKey(series.category, product.subCategory, product.model, field);
        for (const lang of targetLangs) generatedByLang[lang][key] = mockTranslate(zhText, lang);
      }
    }
  }

  console.log('=== MOCK GENERATED key/value ===');
  for (const [lang, kv] of Object.entries(generatedByLang)) {
    for (const [key, value] of Object.entries(kv)) console.log(`[generated][${lang}] ${key} = ${value}`);
  }

  const toWriteByLang = {};
  for (const lang of targetLangs) {
    const existing = existingTranslations[lang] || {};
    toWriteByLang[lang] = {};
    for (const [key, value] of Object.entries(generatedByLang[lang])) {
      if (!Object.prototype.hasOwnProperty.call(existing, key) || !existing[key]) {
        toWriteByLang[lang][key] = value;
        existing[key] = value;
      }
    }
  }

  console.log('\n=== MOCK TO-WRITE key/value ===');
  for (const [lang, kv] of Object.entries(toWriteByLang)) {
    for (const [key, value] of Object.entries(kv)) console.log(`[write][${lang}] ${key} = ${value}`);
  }

  console.log('\n=== MOCK SUMMARY ===');
  for (const lang of targetLangs) {
    console.log(`${lang}: generated=${Object.keys(generatedByLang[lang]).length}, write=${Object.keys(toWriteByLang[lang]).length}`);
  }

  // 增量测试：模拟快照
  console.log('\n=== MOCK INCREMENTAL SNAPSHOT TEST ===');
  const mockKeyMap   = buildCurrentKeyMap(mockProductSeries);
  const mockSnapshot = {};
  for (const [key, { fingerprint }] of Object.entries(mockKeyMap)) mockSnapshot[key] = fingerprint;
  console.log(`快照包含 ${Object.keys(mockSnapshot).length} 个 key`);

  // 模拟产品内容变化
  mockProductSeries[0].products[0].i18n.name['zh-CN'] = '甲板烤箱100（新款）';
  const updatedKeyMap = buildCurrentKeyMap(mockProductSeries);
  const changedKeys   = [];
  for (const [key, { fingerprint }] of Object.entries(updatedKeyMap)) {
    if (mockSnapshot[key] !== fingerprint) changedKeys.push(key);
  }
  console.log(`模拟内容变更后，检测到 ${changedKeys.length} 个变更 key: ${changedKeys.join(', ')}`);
}

// ─────────────────────────────────────────────
// 命令行入口
// ─────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage: node scripts/product-translate-adapter.js [options]

Options:
  --help, -h            显示帮助
  --incremental         增量翻译（只处理新增/变更的产品 key）
  --demo                Demo 模式（展示结构，不调 API）
  --mock                Mock 流程（无网络、无文件写入）

环境变量：
  SILICONFLOW_API_KEY   主引擎 Hunyuan-MT-7B（申请：https://cloud.siliconflow.cn/account/ak）
  SCNET_API_KEY         降级引擎 Qwen3-30B（申请：https://www.scnet.cn/ui/llm/）

翻译模式说明：
  全量模式  —— 翻译所有产品字段；已存在合法译文不覆盖
              npm run translate:products
  增量模式  —— 对比 .translation-snapshot.json，只翻译新增/变更的 key
              npm run translate:products:incremental
    `);
    process.exit(0);
  }

  if (args.includes('--demo')) {
    console.log('📋 Demo Mode: Showing translation structure without actual API calls\n');
    const productSeries = extractChineseProductData();
    const first = productSeries.find(s => (s.products || []).length > 0);
    if (!first) { console.log('No products available.'); process.exit(0); }
    const p    = first.products[0];
    const zhName = (p.i18n && p.i18n.name && (p.i18n.name['zh-CN'] || p.i18n.name.zh)) || p.name || '(missing)';
    const key  = generateI18nKey(first.category, p.subCategory, p.model, 'name');
    console.log(`First product: ${first.category} / ${p.model}`);
    console.log(`  Name (zh): ${zhName}`);
    console.log(`  i18n key:  ${key}`);
    console.log(`  Engine:    ${isHunyuanSupported('en') ? 'Hunyuan-MT-7B' : 'scnet fallback'} for en`);

    const currentMap = buildCurrentKeyMap(productSeries);
    const snapshot   = loadSnapshot();
    const changed    = Object.entries(currentMap).filter(([k, { fingerprint }]) => snapshot[k] !== fingerprint);
    console.log(`\nIncremental status: ${changed.length}/${Object.keys(currentMap).length} keys need translation`);
    process.exit(0);
  }

  if (args.includes('--mock')) {
    runMockTranslationFlow();
    process.exit(0);
  }

  if (args.includes('--incremental')) {
    translateProductsIncremental().catch(err => {
      console.error('❌ Fatal error:', err.message);
      process.exit(1);
    });
  } else {
    translateProducts().catch(err => {
      console.error('❌ Fatal error:', err.message);
      process.exit(1);
    });
  }
}

module.exports = {
  // 两种翻译模式
  translateProducts,
  translateProductsIncremental,
  // 工具函数
  generateI18nKey,
  translateText,
  translateTexts,
  buildCurrentKeyMap,
  loadSnapshot,
  saveSnapshot,
  runMockTranslationFlow,
  LANGUAGE_MAP,
  I18N_FIELDS,
};
