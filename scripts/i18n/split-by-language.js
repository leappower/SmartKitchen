#!/usr/bin/env node

/**
 * 将分离的翻译文件按语言拆分为单独文件
 *
 * 数据流改造：lang/{lang}-ui.json 是唯一数据源
 * - 读取所有 lang/*-ui.json（agent编辑的入口，最高优先级）
 * - 读取 ui-i18n.json（如果存在，作为补充）
 * - 合并两者（lang文件优先，不覆盖lang已有的key）
 * - 将合并结果写回 ui-i18n.json 和 ui-i18n-merged.json
 * - 同时拆分产品翻译文件（product-translations.json → *-product.json）
 */

const fs = require('fs');
const path = require('path');

// 配置
const langDir = path.join(__dirname, '../../src/assets/lang');
const uiI18nPath = path.join(__dirname, '../../src/assets/ui-i18n.json');
const uiI18nMergedPath = path.join(__dirname, '../../src/assets/ui-i18n-merged.json');
const inputProductFile = path.join(__dirname, '../../src/assets/product-translations.json');

/**
 * 深度合并两个对象（source优先，base作为补充）
 * 对于嵌套值：如果source有该key，用source的值；否则用base的值
 */
function deepMerge(source, base) {
  const result = { ...base };
  for (const key of Object.keys(source)) {
    const sv = source[key];
    const bv = base[key];
    if (sv !== undefined && sv !== null && typeof sv === 'object' && !Array.isArray(sv) &&
        bv !== undefined && bv !== null && typeof bv === 'object' && !Array.isArray(bv)) {
      result[key] = deepMerge(sv, bv);
    } else {
      result[key] = sv;
    }
  }
  return result;
}

/**
 * 主函数：双向合并 + 拆分
 *
 * 1. 从 lang/*-ui.json 读取所有语言
 * 2. 从 ui-i18n.json 读取（如存在）
 * 3. 合并：lang 文件优先，ui-i18n.json 补充缺失语言/keys
 * 4. 写回 ui-i18n.json 和 ui-i18n-merged.json
 * 5. 将合并结果写回各 lang/*-ui.json（补充 ui-i18n.json 中有但 lang 文件缺失的 keys）
 */
function main() {
  console.log('========================================');
  console.log('  按语言拆分翻译文件（双向合并模式）');
  console.log('========================================');

  try {
    // 确保输出目录存在
    if (!fs.existsSync(langDir)) {
      fs.mkdirSync(langDir, { recursive: true });
    }

    // --- UI 翻译：双向合并 ---
    console.log('\n📝 处理 UI 翻译（双向合并）...');

    // Step 1: 读取所有 lang/*-ui.json
    const langFiles = fs.readdirSync(langDir)
      .filter(f => f.endsWith('-ui.json'))
      .sort();

    const langData = {};
    for (const file of langFiles) {
      const lang = file.replace(/-ui\.json$/, '');
      const filePath = path.join(langDir, file);
      try {
        langData[lang] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`  ✓ 读取 lang: ${lang} (${Object.keys(langData[lang]).length} keys)`);
      } catch (err) {
        console.error(`  ❌ 读取 ${file} 失败: ${err.message}`);
      }
    }

    // Step 2: 读取 ui-i18n.json（如果存在）
    let uiI18nData = {};
    if (fs.existsSync(uiI18nPath)) {
      try {
        uiI18nData = JSON.parse(fs.readFileSync(uiI18nPath, 'utf8'));
        console.log(`  ✓ 读取 ui-i18n.json (${Object.keys(uiI18nData).length} 种语言)`);
      } catch (err) {
        console.warn(`  ⚠️  解析 ui-i18n.json 失败，将跳过: ${err.message}`);
      }
    }

    // Step 3: 合并 — lang 文件优先，ui-i18n.json 补充
    const allLanguages = new Set([...Object.keys(langData), ...Object.keys(uiI18nData)]);
    const merged = {};

    for (const lang of [...allLanguages].sort()) {
      const langContent = langData[lang] || {};
      const uiI18nContent = uiI18nData[lang] || {};

      if (langContent && Object.keys(langContent).length > 0) {
        // lang 文件存在且有内容：lang 优先，用 ui-i18n 补充缺失的 keys
        merged[lang] = deepMerge(langContent, uiI18nContent);
      } else {
        // lang 文件不存在或为空：直接用 ui-i18n 的数据
        merged[lang] = uiI18nContent;
      }
    }

    // Step 4: 写回各 lang/*-ui.json（补充 ui-i18n.json 中有但 lang 文件缺失的 keys）
    for (const lang of Object.keys(merged)) {
      const filePath = path.join(langDir, `${lang}-ui.json`);
      const existingKeys = Object.keys(langData[lang] || {});
      const newKeys = Object.keys(merged[lang]).filter(k => !existingKeys.includes(k));

      if (newKeys.length > 0 || !langData[lang]) {
        fs.writeFileSync(filePath, JSON.stringify(merged[lang], null, 2), 'utf8');
        if (newKeys.length > 0) {
          console.log(`  + 补充 ${lang}: ${newKeys.length} 个新 key → ${lang}-ui.json`);
        }
      }
      console.log(`  ✓ 写入 ${lang}-ui.json (${Object.keys(merged[lang]).length} keys)`);
    }

    // Step 5: 写回 ui-i18n.json
    fs.writeFileSync(uiI18nPath, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`\n  ✅ 写入 ui-i18n.json (${Object.keys(merged).length} 种语言)`);

    // Step 6: 写入 ui-i18n-merged.json
    fs.writeFileSync(uiI18nMergedPath, JSON.stringify(merged, null, 2), 'utf8');
    console.log(`  ✅ 写入 ui-i18n-merged.json (${Object.keys(merged).length} 种语言)`);

    // --- 产品翻译：单向拆分（逻辑不变） ---
    console.log('\n📦 处理产品翻译（单向拆分）...');
    splitByLanguage(inputProductFile, 'product');

    console.log('\n========================================');
    console.log('  完成!');
    console.log('========================================\n');

    // 列出生成的文件
    const uiFiles = fs.readdirSync(langDir).filter(f => f.endsWith('-ui.json')).sort();
    const productFiles = fs.readdirSync(langDir).filter(f => f.endsWith('-product.json')).sort();

    console.log(`UI翻译文件 (${uiFiles.length}):`);
    uiFiles.forEach(file => console.log(`  - ${file}`));

    console.log(`\n产品翻译文件 (${productFiles.length}):`);
    productFiles.forEach(file => console.log(`  - ${file}`));

    console.log('\n✅ 所有翻译文件已生成!\n');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

/**
 * 将合并的翻译文件按语言拆分（用于产品翻译）
 */
function splitByLanguage(inputFile, fileType) {
  console.log(`\n处理 ${fileType} 文件...`);

  if (!fs.existsSync(inputFile)) {
    console.warn(`  警告: 文件不存在，跳过: ${inputFile}`);
    return;
  }

  const translations = JSON.parse(fs.readFileSync(inputFile, 'utf8'));
  const languages = Object.keys(translations);

  console.log(`  找到 ${languages.length} 种语言`);

  languages.forEach(lang => {
    const langTranslations = translations[lang];
    const outputFile = path.join(langDir, `${lang}-${fileType}.json`);

    fs.writeFileSync(outputFile, JSON.stringify(langTranslations, null, 2), 'utf8');
    console.log(`  ✓ 生成: ${path.basename(outputFile)} (${Object.keys(langTranslations).length} 个键)`);
  });
}

/**
 * 反向聚合：从各语言 {lang}-product.json 重建 src/assets/product-translations.json
 */
function collectProductTranslations() {
  console.log('\n========================================');
  console.log('  聚合产品翻译 → product-translations.json');
  console.log('========================================\n');

  if (!fs.existsSync(langDir)) {
    console.error(`❌ 语言目录不存在: ${langDir}`);
    process.exit(1);
  }

  const productFiles = fs.readdirSync(langDir)
    .filter(f => f.endsWith('-product.json'))
    .sort();

  if (productFiles.length === 0) {
    console.warn('⚠️  未找到任何 -product.json 文件，跳过聚合');
    return;
  }

  console.log(`找到 ${productFiles.length} 个产品翻译文件\n`);

  let existingData = {};
  if (fs.existsSync(inputProductFile)) {
    try {
      existingData = JSON.parse(fs.readFileSync(inputProductFile, 'utf-8'));
      console.log(`  ✓ 读取现有 product-translations.json（${Object.keys(existingData).length} 种语言）`);
    } catch (err) {
      console.warn(`  ⚠️  解析现有 product-translations.json 失败，将重新生成: ${err.message}`);
    }
  }

  const aggregated = { ...existingData };
  let totalKeys = 0;

  for (const file of productFiles) {
    const lang = file.replace(/-product\.json$/, '');
    const filePath = path.join(langDir, file);
    try {
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const keyCount = Object.keys(content).length;
      aggregated[lang] = content;
      totalKeys += keyCount;
      console.log(`  ✓ ${lang.padEnd(8)}: ${keyCount} 个键`);
    } catch (err) {
      console.error(`  ❌ ${lang}: 读取失败 — ${err.message}`);
    }
  }

  const sorted = {};
  Object.keys(aggregated).sort().forEach(lang => { sorted[lang] = aggregated[lang]; });

  try {
    fs.writeFileSync(inputProductFile, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    console.log(`\n✅ 聚合完成 → ${inputProductFile}`);
    console.log(`   ${Object.keys(sorted).length} 种语言，共 ${totalKeys} 个键`);
  } catch (err) {
    console.error(`❌ 写入 product-translations.json 失败: ${err.message}`);
    process.exit(1);
  }

  console.log('\n========================================');
  console.log('  完成!');
  console.log('========================================\n');
}

// 运行主函数
if (require.main === module) {
  if (process.argv.includes('--collect')) {
    collectProductTranslations();
  } else {
    main();
  }
}

module.exports = { splitByLanguage, collectProductTranslations };
