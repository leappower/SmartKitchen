#!/usr/bin/env node

/**
 * 构建多语言翻译文件
 *
 * 直接从 src/assets/lang/*-ui.json 和 *-product.json 复制到 dist/assets/lang/
 * lang 文件是唯一数据源，不再依赖 ui-i18n.json
 */

const fs = require('fs');
const path = require('path');

// 配置
const config = {
  langDir: path.join(__dirname, '../../src/assets/lang'),
  outputDir: path.join(__dirname, '../dist/assets/lang'),
  productTranslationsFile: path.join(__dirname, '../../src/assets/product-translations.json'),
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
 * 从 lang 目录复制 *-ui.json 和 *-product.json 到 dist
 */
function copyLangFiles() {
  const files = fs.readdirSync(config.langDir)
    .filter(f => f.endsWith('-ui.json') || f.endsWith('-product.json'))
    .sort();

  let totalFiles = 0;
  let totalSize = 0;

  console.log(`\n复制 ${files.length} 个翻译文件到 dist...\n`);

  for (const file of files) {
    const srcPath = path.join(config.langDir, file);
    const destPath = path.join(config.outputDir, file);
    const content = fs.readFileSync(srcPath, 'utf8');

    fs.writeFileSync(destPath, content, 'utf8');

    const stats = fs.statSync(destPath);
    const fileSizeKB = (stats.size / 1024).toFixed(2);
    totalFiles++;
    totalSize += stats.size;

    const type = file.endsWith('-ui.json') ? 'UI' : '产品';
    console.log(`  ✅ ${file}: ${fileSizeKB} KB (${type})`);
  }

  return { totalFiles, totalSize: (totalSize / 1024).toFixed(2) };
}

/**
 * 生成语言列表文件
 */
function generateLanguageLists() {
  const uiFiles = fs.readdirSync(config.langDir)
    .filter(f => f.endsWith('-ui.json'))
    .sort();

  const productFiles = fs.readdirSync(config.langDir)
    .filter(f => f.endsWith('-product.json'))
    .sort();

  const productLangs = new Set(productFiles.map(f => f.replace(/-product\.json$/, '')));

  const languages = uiFiles.map(file => {
    const lang = file.replace(/-ui\.json$/, '');
    let uiKeys = 0;
    try {
      const content = JSON.parse(fs.readFileSync(path.join(config.langDir, file), 'utf8'));
      uiKeys = Object.keys(content).length;
    } catch (e) { /* skip */ }

    return {
      code: lang,
      name: lang, // Will be overridden if 'language' key exists in content
      uiKeys,
      productKeys: productLangs.has(lang) ? (function() {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(config.langDir, `${lang}-product.json`), 'utf8'));
          return Object.keys(content).length;
        } catch (e) { return 0; }
      })() : 0,
    };
  });

  // Read 'name' from translation content if available
  for (const lang of languages) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(config.langDir, `${lang.code}-ui.json`), 'utf8'));
      if (content.language) {
        lang.name = content.language;
      }
    } catch (e) { /* skip */ }
  }

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
    // 检查源目录
    if (!fs.existsSync(config.langDir)) {
      console.error(`错误: 语言目录不存在: ${config.langDir}`);
      console.log('\n请先运行: npm run split:lang');
      process.exit(1);
    }

    // 创建输出目录
    ensureOutputDir();

    // 复制翻译文件
    const stats = copyLangFiles();

    // 生成语言列表
    generateLanguageLists();

    // 输出统计信息
    console.log('========================================');
    console.log('  统计信息');
    console.log('========================================\n');
    console.log(`文件数: ${stats.totalFiles}`);
    console.log(`总大小: ${stats.totalSize} KB`);
    console.log(`输出目录: ${config.outputDir}`);
    console.log('\n✅ 翻译文件构建完成!\n');

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

module.exports = { copyLangFiles, generateLanguageLists };
