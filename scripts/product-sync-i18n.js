#!/usr/bin/env node

/**
 * 产品i18n同步脚本
 *
 * 功能：
 * 1. 加载 producti18n.json（中文原始）和 zh-CN.json 两个源文件
 * 2. 互相补全两文件中缺失的产品 key（hash_field 格式）
 * 3. 将已有中文译文同步到其他所有语言文件（缺失的 key 用中文占位）
 *
 * 使用方法：
 *   node scripts/product-sync-i18n.js             # 完整同步（含其他语言）
 *   node scripts/product-sync-i18n.js --source-only  # 仅同步 zh-CN ↔ producti18n
 */

const fs = require('fs');
const path = require('path');
const { getSupportedCodes } = require(path.join(__dirname, '../src/lang-registry'));

const TRANSLATIONS_DIR = path.join(process.cwd(), 'src/assets/lang');
const PRODUCT_I18N_PATH = path.join(process.cwd(), 'scripts/producti18n.json');

// 产品key正则（hash_field格式）
const PRODUCT_KEY_PATTERN = /^[0-9a-f]{8}_[a-z0-9_]+$/;

// --source-only 模式：仅同步三个中文源文件，不写入其他语言（翻译前使用）
const SOURCE_ONLY = process.argv.includes('--source-only');

// 支持的所有语言（由 lang-registry.js 统一管理，hasTranslation:true 的语言）
// 注意：zh.json 已删除，只保留 zh-CN
const SUPPORTED_LANGS = getSupportedCodes();

/**
 * 加载JSON文件
 */
function loadJSON(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`❌ Error loading ${filePath}: ${err.message}`);
    return {};
  }
}

/**
 * 保存JSON文件（key 排序后写入）
 */
function saveJSON(filePath, data) {
  const sorted = {};
  Object.keys(data).sort().forEach(key => { sorted[key] = data[key]; });
  fs.writeFileSync(filePath, JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

/**
 * 获取产品翻译文件路径（{lang}-product.json）
 * 产品翻译与 UI 翻译隔离存储，避免 key 命名空间冲突
 */
function getTranslationPath(lang) {
  return path.join(TRANSLATIONS_DIR, `${lang}-product.json`);
}

/**
 * 提取产品 key（8位hex_field格式）
 */
function extractProductKeys(data) {
  return Object.keys(data).filter(key => PRODUCT_KEY_PATTERN.test(key));
}

/**
 * Step 1: 加载源文件
 * producti18n.json 是平铺中文格式 { key: "中文值" }，是翻译原始数据
 */
function loadSourceFiles() {
  console.log('📚 Loading source files...\n');

  // producti18n.json: 平铺中文 { key: "中文值" }
  const productI18nData = loadJSON(PRODUCT_I18N_PATH);
  const zhCNData = loadJSON(getTranslationPath('zh-CN'));

  const productKeys = new Set(extractProductKeys(productI18nData));
  const zhCNKeys = new Set(extractProductKeys(zhCNData));

  console.log(`  • producti18n.json (中文原始): ${productKeys.size} product keys`);
  console.log(`  • zh-CN.json: ${zhCNKeys.size} product keys\n`);

  return { productI18nData, zhCNData, productKeys, zhCNKeys };
}

/**
 * Step 2: 差异化补全 producti18n.json ↔ zh-CN.json
 * 两文件互为备份，合并所有中文产品 key
 */
function syncSourceFiles(sources) {
  console.log('🔄 Step 2: Syncing producti18n.json ↔ zh-CN.json...\n');

  const { productI18nData, zhCNData, productKeys, zhCNKeys } = sources;

  // 双方合并所有产品 key
  const allKeys = new Set([...productKeys, ...zhCNKeys]);
  console.log(`  • Total unique product keys: ${allKeys.size}`);

  let piAdded = 0, zhCNAdded = 0;

  for (const key of allKeys) {
    // 中文值来源优先级：producti18n > zh-CN
    const zhVal = productI18nData[key] || zhCNData[key] || '';

    if (!productKeys.has(key)) { productI18nData[key] = zhVal; piAdded++; }
    if (!zhCNKeys.has(key))    { zhCNData[key] = zhVal; zhCNAdded++; }
  }

  console.log(`  Summary: producti18n (+${piAdded}), zh-CN.json (+${zhCNAdded})\n`);

  return { productI18nData, zhCNData, allKeys };
}

/**
 * Preview: 翻译前打印各语言文件缺失的产品 key 数量（只读检查，不写入文件）
 */
function previewSync(allKeys, productI18nData) {
  console.log('📋 Preview: Missing product keys per language (before sync):\n');

  let totalMissing = 0;

  for (const lang of SUPPORTED_LANGS) {
    if (lang === 'zh-CN') continue;

    const langFile = loadJSON(getTranslationPath(lang));
    const missingKeys = [...allKeys].filter(key => !langFile[key]);

    if (missingKeys.length > 0) {
      totalMissing += missingKeys.length;
      const sample = missingKeys.slice(0, 3).map(k => `${k} = "${productI18nData[k] || ''}"`).join(', ');
      const suffix = missingKeys.length > 3 ? ` ... +${missingKeys.length - 3} more` : '';
      console.log(`  ⚠️  ${lang.padEnd(6)}: ${missingKeys.length} missing → ${sample}${suffix}`);
    } else {
      console.log(`  ✓  ${lang.padEnd(6)}: all product keys present`);
    }
  }

  console.log(`\n  📊 Total missing entries across all languages: ${totalMissing}\n`);
}

/**
 * Step 3: 将产品 key 同步到其他 20 种语言文件
 * 优先使用各语言文件中已有的翻译，缺失的用中文占位
 */
function syncOtherLanguages(productI18nData, allKeys, zhCNData) {
  console.log('🌐 Step 3: Syncing product keys to other 20 languages...\n');

  let totalAdded = 0;

  for (const lang of SUPPORTED_LANGS) {
    if (lang === 'zh-CN') continue;

    const langFile = loadJSON(getTranslationPath(lang));
    let added = 0;

    for (const key of allKeys) {
      if (!langFile[key]) {
        // 缺失 key：用中文原文占位（等待后续 translate:products 翻译）
        langFile[key] = productI18nData[key] || zhCNData[key] || '';
        added++;
      }
    }

    try {
      saveJSON(getTranslationPath(lang), langFile);
      if (added > 0) {
        console.log(`  ✓ ${lang}: added ${added} product keys`);
        totalAdded += added;
      } else {
        console.log(`  — ${lang}: no missing keys`);
      }
    } catch (err) {
      console.error(`  ❌ Error saving ${lang}.json: ${err.message}`);
    }
  }

  console.log(`\n  Total added across all languages: ${totalAdded}\n`);
}

/**
 * Main
 */
async function main() {
  const mode = SOURCE_ONLY ? ' [--source-only]' : ' [full]';
  console.log(`🔍 Product i18n Sync Script${mode}\n`);
  console.log('='.repeat(50) + '\n');

  if (SOURCE_ONLY) {
    console.log('ℹ️  Source-only mode: syncing producti18n ↔ zh-CN only (skipping other languages)\n');
  }

  try {
    // Step 1: 加载源文件
    const sources = loadSourceFiles();

    // Step 2: 两文件差异化补全
    const synced = syncSourceFiles(sources);

    // 保存补全后的两个中文源文件
    console.log('💾 Saving source files...\n');
    saveJSON(PRODUCT_I18N_PATH, synced.productI18nData);
    console.log('  ✓ producti18n.json saved');
    saveJSON(getTranslationPath('zh-CN'), synced.zhCNData);
    console.log('  ✓ zh-CN.json saved');
    console.log();

    if (!SOURCE_ONLY) {
      // 📋 Preview: 写入前打印各语言缺失 key 检查
      previewSync(synced.allKeys, synced.productI18nData);

      // Step 3: 同步其他 20 种语言（翻译后兜底，缺失的用中文占位）
      syncOtherLanguages(synced.productI18nData, synced.allKeys, synced.zhCNData);
    }

    console.log('='.repeat(50));
    console.log('\n✨ Sync complete!\n');

  } catch (err) {
    console.error(`\n❌ Error: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

main();
