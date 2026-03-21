#!/usr/bin/env node

/**
 * 将分离的翻译文件按语言拆分为单独文件
 *
 * 从ui-i18n.json和product-i18n.json中提取每种语言，
 * 生成独立的lang-code-ui.json和lang-code-product.json文件
 */

const fs = require('fs');
const path = require('path');

// 配置
// ui-i18n.json is the canonical source; fall back to ui-i18n-merged.json when
// the canonical file does not exist (build environments that only produce the
// merged file).
const _uiCanonical = path.join(__dirname, '../src/assets/ui-i18n.json');
const _uiMerged    = path.join(__dirname, '../src/assets/ui-i18n-merged.json');
const config = {
  inputUIFile: fs.existsSync(_uiCanonical) ? _uiCanonical : _uiMerged,
  inputProductFile: path.join(__dirname, '../src/assets/product-i18n.json'),
  outputLangDir: path.join(__dirname, '../src/assets/lang'),
};

/**
 * 将合并的翻译文件按语言拆分
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
    const outputFile = path.join(config.outputLangDir, `${lang}-${fileType}.json`);

    fs.writeFileSync(outputFile, JSON.stringify(langTranslations, null, 2), 'utf8');
    console.log(`  ✓ 生成: ${path.basename(outputFile)} (${Object.keys(langTranslations).length} 个键)`);
  });
}

/**
 * 主函数
 */
function main() {
  console.log('========================================');
  console.log('  按语言拆分翻译文件');
  console.log('========================================');

  try {
    // 确保输出目录存在
    if (!fs.existsSync(config.outputLangDir)) {
      fs.mkdirSync(config.outputLangDir, { recursive: true });
    }

    // 拆分UI翻译
    splitByLanguage(config.inputUIFile, 'ui');

    // 拆分产品翻译
    splitByLanguage(config.inputProductFile, 'product');

    console.log('\n========================================');
    console.log('  完成!');
    console.log('========================================\n');

    // 列出生成的文件
    const uiFiles = fs.readdirSync(config.outputLangDir)
      .filter(f => f.endsWith('-ui.json'))
      .sort();
    const productFiles = fs.readdirSync(config.outputLangDir)
      .filter(f => f.endsWith('-product.json'))
      .sort();

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
 * 反向聚合：从各语言 {lang}-product.json 重建 src/assets/product-i18n.json
 *
 * 这是 translate:products[:incremental] 之后必须运行的步骤：
 *   翻译脚本将产品译文写到 lang/{lang}-product.json
 *   split:lang 需要读 src/assets/product-i18n.json（按语言聚合的大文件）
 *   本函数将两者桥接起来，确保翻译结果能被 split:lang 消费
 *
 * 运行方式：
 *   node scripts/split-by-language.js --collect
 *   npm run product:collect            （由 build:withFeishu 系列自动调用）
 */
function collectProductTranslations() {
  console.log('\n========================================');
  console.log('  聚合产品翻译 → product-i18n.json');
  console.log('========================================\n');

  const langDir = config.outputLangDir;
  const outputFile = config.inputProductFile;

  if (!fs.existsSync(langDir)) {
    console.error(`❌ 语言目录不存在: ${langDir}`);
    process.exit(1);
  }

  // 找到所有 {lang}-product.json 文件
  const productFiles = fs.readdirSync(langDir)
    .filter(f => f.endsWith('-product.json'))
    .sort();

  if (productFiles.length === 0) {
    console.warn('⚠️  未找到任何 -product.json 文件，跳过聚合');
    return;
  }

  console.log(`找到 ${productFiles.length} 个产品翻译文件\n`);

  // 读取现有的 product-i18n.json（若存在，用于保留未重新翻译的语言）
  let existingData = {};
  if (fs.existsSync(outputFile)) {
    try {
      existingData = JSON.parse(fs.readFileSync(outputFile, 'utf-8'));
      console.log(`  ✓ 读取现有 product-i18n.json（${Object.keys(existingData).length} 种语言）`);
    } catch (err) {
      console.warn(`  ⚠️  解析现有 product-i18n.json 失败，将重新生成: ${err.message}`);
    }
  }

  // 聚合：各语言文件 → { lang: { key: value } }
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

  // 写回 product-i18n.json（语言 key 排序）
  const sorted = {};
  Object.keys(aggregated).sort().forEach(lang => { sorted[lang] = aggregated[lang]; });

  try {
    fs.writeFileSync(outputFile, JSON.stringify(sorted, null, 2) + '\n', 'utf-8');
    console.log(`\n✅ 聚合完成 → ${outputFile}`);
    console.log(`   ${Object.keys(sorted).length} 种语言，共 ${totalKeys} 个键`);
  } catch (err) {
    console.error(`❌ 写入 product-i18n.json 失败: ${err.message}`);
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
