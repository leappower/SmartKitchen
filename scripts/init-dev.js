#!/usr/bin/env node

/**
 * 开发模式初始化脚本
 *
 * 确保开发服务器启动前所有必需的文件都已生成
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const config = {
  srcLangDir: path.join(__dirname, '../src/assets/lang'),
  srcAssetsDir: path.join(__dirname, '../src/assets'),
  uiFile: path.join(__dirname, '../src/assets/ui-i18n.json'),
  productFile: path.join(__dirname, '../src/assets/product-i18n.json'),
};

/**
 * 检查文件是否存在
 */
function checkFiles() {
  const checks = [
    { name: 'UI翻译文件', path: config.uiFile },
    { name: '产品翻译文件', path: config.productFile },
  ];

  let allExists = true;
  checks.forEach(check => {
    if (!fs.existsSync(check.path)) {
      console.log(`⚠️  ${check.name}不存在: ${check.path}`);
      allExists = false;
    }
  });

  return allExists;
}

/**
 * 运行npm脚本
 */
function runScript(scriptName) {
  console.log(`\n🔄 运行: npm run ${scriptName}`);
  try {
    execSync(`npm run ${scriptName}`, { stdio: 'inherit', cwd: __dirname + '/..' });
    console.log(`✅ 完成: ${scriptName}`);
    return true;
  } catch (error) {
    console.error(`❌ 失败: ${scriptName}`);
    return false;
  }
}

/**
 * 主函数
 */
function main() {
  console.log('========================================');
  console.log('  开发模式初始化');
  console.log('========================================\n');

  try {
    // 1. 检查必需的文件
    console.log('📋 检查必需的文件...');
    const filesExist = checkFiles();

    if (!filesExist) {
      console.log('\n⚠️  缺少必需的翻译文件，尝试生成...');
      
      // 尝试运行merge:i18n
      if (!runScript('merge:i18n')) {
        console.error('\n❌ 无法生成翻译文件');
        console.log('请先运行: npm run sync:feishu');
        process.exit(1);
      }
    } else {
      console.log('✅ 所有文件都存在\n');
    }

    // 2. 生成分离的语言文件到 src/assets/lang
    console.log('\n🔨 生成分离的语言文件...');
    runScript('split:lang');

    console.log('\n========================================');
    console.log('  开发模式初始化完成!');
    console.log('========================================\n');

    console.log('✅ 可以启动开发服务器了:');
    console.log('   npm start\n');

  } catch (error) {
    console.error('\n❌ 初始化失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行主函数
if (require.main === module) {
  main();
}

module.exports = { checkFiles };
