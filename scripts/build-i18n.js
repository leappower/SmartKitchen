#!/usr/bin/env node

/**
 * 构建多语言翻译文件
 *
 * 从分离的ui-i18n.json和product-translations.json生成独立的单语言翻译文件
 * 输出到 dist/lang/ 目录，用于按需加载
 */

const fs = require('fs');
const path = require('path');

// 配置
const config = {
  inputUIFile: path.join(__dirname, '../src/assets/ui-i18n.json'),
  inputProductFile: path.join(__dirname, '../src/assets/product-translations.json'),
  outputDir: path.join(__dirname, '../dist/assets/lang'),
};

/**
 * 创建输出目录
 */
function ensureOutputDir() {
  if (!fs.existsSync(config.outputDir)) {
    fs.mkdirSync(config.outputDir, { recursive: true });
    console.log(`✅ 创建输出目录: ${config.outputDir}`);
  }
}

/**
 * 生成单语言UI文件
 */
function generateUIFiles(uiTranslations) {
  const languages = Object.keys(uiTranslations);
  let totalFiles = 0;
  let totalSize = 0;

  console.log(`\n生成 ${languages.length} 个单语言UI翻译文件...\n`);

  languages.forEach(lang => {
    const filePath = path.join(config.outputDir, `${lang}-ui.json`);
    const content = uiTranslations[lang];

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');

    const stats = fs.statSync(filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    totalFiles++;
    totalSize += stats.size;

    console.log(`  ✅ ${lang}-ui.json: ${Object.keys(content).length} 键, ${fileSizeKB} KB`);
  });

  return { totalFiles, totalSize: (totalSize / 1024).toFixed(2) };
}

/**
 * 生成单语言产品文件
 */
function generateProductFiles(productTranslations) {
  const languages = Object.keys(productTranslations);
  let totalFiles = 0;
  let totalSize = 0;

  console.log(`\n生成 ${languages.length} 个单语言产品翻译文件...\n`);

  languages.forEach(lang => {
    const filePath = path.join(config.outputDir, `${lang}-product.json`);
    const content = productTranslations[lang];

    fs.writeFileSync(filePath, JSON.stringify(content, null, 2), 'utf8');

    const stats = fs.statSync(filePath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    totalFiles++;
    totalSize += stats.size;

    console.log(`  ✅ ${lang}-product.json: ${Object.keys(content).length} 键, ${fileSizeKB} KB`);
  });

  return { totalFiles, totalSize: (totalSize / 1024).toFixed(2) };
}

/**
 * 生成语言列表文件
 *
 * UI 与 Product 的语言集合可能不完全相同（UI 支持的语言多于 Product）。
 * 以 UI 语言列表为基准；productKeys 若该语言不存在则记为 0，避免崩溃。
 */
function generateLanguageLists(uiTranslations, productTranslations) {
  const languages = Object.keys(uiTranslations).map(lang => ({
    code: lang,
    name: uiTranslations[lang].language || lang,
    uiKeys: Object.keys(uiTranslations[lang]).length,
    productKeys: productTranslations[lang]
      ? Object.keys(productTranslations[lang]).length
      : 0,
  }));

  const filePath = path.join(config.outputDir, 'languages.json');
  fs.writeFileSync(filePath, JSON.stringify(languages, null, 2), 'utf8');

  console.log(`\n✅ 生成语言列表: ${filePath}`);
  console.log(`   包含 ${languages.length} 种语言\n`);

  return filePath;
}

/**
 * 主函数
 */
function main() {
  console.log('========================================');
  console.log('  构建多语言翻译文件');
  console.log('========================================\n');

  try {
    // 检查输入文件
    if (!fs.existsSync(config.inputUIFile)) {
      console.error(`错误: UI翻译文件不存在: ${config.inputUIFile}`);
      console.log('\n请先运行: npm run merge:i18n && npm run split:lang');
      process.exit(1);
    }

    if (!fs.existsSync(config.inputProductFile)) {
      console.error(`错误: 产品翻译文件不存在: ${config.inputProductFile}`);
      console.log('\n请先运行: npm run merge:i18n && npm run split:lang');
      process.exit(1);
    }

    // 读取翻译文件
    console.log(`读取UI翻译文件: ${config.inputUIFile}`);
    const uiTranslations = JSON.parse(fs.readFileSync(config.inputUIFile, 'utf8'));

    console.log(`读取产品翻译文件: ${config.inputProductFile}`);
    const productTranslations = JSON.parse(fs.readFileSync(config.inputProductFile, 'utf8'));

    // 创建输出目录
    ensureOutputDir();

    // 生成UI文件
    const uiStats = generateUIFiles(uiTranslations);

    // 生成产品文件
    const productStats = generateProductFiles(productTranslations);

    // 生成语言列表
    generateLanguageLists(uiTranslations, productTranslations);

    // 输出统计信息
    console.log('========================================');
    console.log('  统计信息');
    console.log('========================================\n');
    console.log(`UI文件数: ${uiStats.totalFiles}`);
    console.log(`UI总大小: ${uiStats.totalSize} KB`);
    console.log(`产品文件数: ${productStats.totalFiles}`);
    console.log(`产品总大小: ${productStats.totalSize} KB`);
    console.log(`总计: ${uiStats.totalFiles + productStats.totalFiles} 文件`);
    console.log(`输出目录: ${config.outputDir}`);
    console.log('\n✅ 翻译文件构建完成!\n');
    console.log('提示: UI文件可以在页面加载时立即加载，');
    console.log('      产品文件可以在需要时按需加载，避免阻塞首屏渲染。\n');

  } catch (error) {
    console.error('\n❌ 错误:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { generateUIFiles, generateProductFiles, generateLanguageLists };
