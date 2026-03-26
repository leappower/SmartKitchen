#!/usr/bin/env node

/**
 * 翻译流程辅助脚本
 * 使用: node scripts/translate-helper.js
 * 
 * 功能:
 * 1. 检查Google Translate API密钥
 * 2. 验证Feishu数据
 * 3. 执行翻译流程
 * 4. 验证翻译结果
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function success(msg) {
  log(`✓ ${msg}`, 'green');
}

function error(msg) {
  log(`✗ ${msg}`, 'red');
}

function warn(msg) {
  log(`⚠ ${msg}`, 'yellow');
}

function info(msg) {
  log(`ℹ ${msg}`, 'blue');
}

function step(msg) {
  log(`\n▶ ${msg}`, 'bright');
}

async function checkApiKey() {
  step('步骤1: 检查Google Translate API密钥');
  
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  
  if (!apiKey) {
    error('未找到环境变量 GOOGLE_TRANSLATE_API_KEY');
    info('设置方式:');
    console.log('  export GOOGLE_TRANSLATE_API_KEY="你的API密钥"');
    console.log('  或编辑 .env 文件添加密钥');
    
    warn('使用 --demo 模式测试（不需要API密钥）');
    console.log('  node scripts/product-translate-adapter.js --demo\n');
    return false;
  }
  
  success(`已找到API密钥 (长度: ${apiKey.length})`);
  return true;
}

async function checkProductData() {
  step('步骤2: 检查产品数据');
  
  const dataPath = path.join(__dirname, '../src/assets/product-data-table.js');
  
  if (!fs.existsSync(dataPath)) {
    error(`未找到产品数据文件: ${dataPath}`);
    info('请先运行: npm run sync:feishu');
    return false;
  }
  
  success('已找到产品数据文件: product-data-table.js');
  
  // 读取产品数据
  const content = fs.readFileSync(dataPath, 'utf8');
  const seriesMatch = content.match(/module\.exports\s*=\s*\[([\s\S]*?)\];/);
  
  if (seriesMatch) {
    // 简单的启发式计数
    const productCount = (content.match(/id:\s*['"`]/g) || []).length;
    info(`检测到约 ${productCount} 个产品`);
    
    if (productCount === 0) {
      warn('未检测到产品数据，可能Feishu为空');
    } else {
      success('产品数据有效');
    }
  }
  
  return true;
}

async function checkTranslationFiles() {
  step('步骤3: 检查已有的翻译文件');
  
  const translationsDir = path.join(__dirname, '../src/assets/lang');
  
  if (!fs.existsSync(translationsDir)) {
    warn('未找到翻译目录，将在执行翻译时创建');
    return true;
  }
  
  const files = fs.readdirSync(translationsDir).filter(f => f.endsWith('.json'));
  success(`已找到 ${files.length} 个语言文件`);
  
  // 检查文件有效性
  let validCount = 0;
  for (const file of files) {
    try {
      const content = fs.readFileSync(path.join(translationsDir, file), 'utf8');
      JSON.parse(content);
      validCount++;
    } catch (e) {
      warn(`文件格式错误: ${file}`);
    }
  }
  
  info(`其中 ${validCount}/${files.length} 文件有效`);
  return true;
}

async function runTranslation(apiKey) {
  step('步骤4: 执行翻译流程');
  
  try {
    info('运行: npm run translate:products');
    
    // 设置环境变量并执行
    const env = { ...process.env, GOOGLE_TRANSLATE_API_KEY: apiKey };
    execSync('npm run translate:products', {
      cwd: path.join(__dirname, '..'),
      env,
      stdio: 'inherit',
      timeout: 300000, // 5分钟超时
    });
    
    success('翻译流程完成');
    return true;
  } catch (e) {
    error(`翻译流程执行失败: ${e.message}`);
    return false;
  }
}

async function verifyResults() {
  step('步骤5: 验证翻译结果');
  
  try {
    info('运行: npm run test');
    execSync('npm run test', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      timeout: 60000,
    });
    
    success('所有测试通过');
    return true;
  } catch (e) {
    error(`测试失败: ${e.message}`);
    return false;
  }
}

async function main() {
  log('╔════════════════════════════════════════════════════╗', 'bright');
  log('║         HTML-YuQL 产品翻译流程助手              ║', 'bright');
  log('║                                                    ║', 'bright');
  log('║  将Feishu中文产品数据翻译为22种语言                 ║', 'bright');
  log('╚════════════════════════════════════════════════════╝', 'bright');
  
  // 检查API密钥
  const hasApiKey = await checkApiKey();
  
  if (!hasApiKey) {
    warn('\n首次使用需要Google Translate API密钥');
    console.log('\n获取密钥步骤:');
    console.log('  1. 访问 https://console.cloud.google.com/');
    console.log('  2. 创建项目并启用 Cloud Translation API');
    console.log('  3. 创建服务账号，生成JSON密钥');
    console.log('  4. 提取project_id作为API密钥');
    console.log('\n详细说明: 见 docs/CHINESE_TO_MULTILINGUAL.md');
    process.exit(1);
  }
  
  // 检查产品数据
  const hasProductData = await checkProductData();
  if (!hasProductData) {
    warn('\n请先同步Feishu数据');
    console.log('  npm run sync:feishu\n');
    process.exit(1);
  }
  
  // 检查交易文件
  await checkTranslationFiles();
  
  // 确认执行
  console.log('\n' + '─'.repeat(54));
  info('现在将执行翻译流程，可能需要2-5分钟');
  info('翻译成本: 约 USD $0.01-0.10 (取决于产品数量)');
  console.log('─'.repeat(54) + '\n');
  
  // 询问确认
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  rl.question('是否继续翻译? (y/n): ', async (answer) => {
    rl.close();
    
    if (answer.toLowerCase() !== 'y') {
      info('已取消操作');
      process.exit(0);
    }
    
    try {
      const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
      const success = await runTranslation(apiKey);
      
      if (success) {
        console.log('');
        await verifyResults();
        
        console.log('\n' + '═'.repeat(54));
        success('翻译流程完成！');
        console.log('═'.repeat(54) + '\n');
        
        info('后续步骤:');
        console.log('  1. npm run build          # 编译应用');
        console.log('  2. npm run dev:webpack  # 本地测试');
        console.log('  3. git commit           # 提交更改');
        console.log(' 4. npm start / npm deploy # 部署\n');
      }
    } catch (e) {
      error(`\n执行出错: ${e.message}`);
      process.exit(1);
    }
  });
}

// 如果直接调用此脚本
if (require.main === module) {
  main().catch(e => {
    error(`\n未预期的错误: ${e.message}`);
    process.exit(1);
  });
}

module.exports = { checkApiKey, checkProductData, runTranslation };
