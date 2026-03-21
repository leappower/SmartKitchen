#!/usr/bin/env node
/**
 * 批量替换邮箱地址脚本
 * 将 support_kitchen@yukoli.com 替换为 support_kitchen@yukoli.com
 * 用法: node scripts/batch-replace-email.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 要搜索的目录
const ROOT_DIR = path.join(__dirname, '..');

// 要替换的邮箱地址
const OLD_EMAIL = 'support_kitchen@yukoli.com';
const NEW_EMAIL = 'support_kitchen@yukoli.com';

// 要搜索的文件扩展名
const FILE_EXTENSIONS = ['.js', '.html', '.css', '.json', '.txt', '.md', '.ts', '.jsx', '.tsx'];

// 排除的目录
const EXCLUDE_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'coverage',
  '.idea',
  '.vscode',
  '__pycache__'
];

console.log(`🔍 开始搜索 ${OLD_EMAIL}...\n`);

// 递归搜索文件
function findFiles(dir) {
  let results = [];
  const items = fs.readdirSync(dir);
  
  for (const item of items) {
    const itemPath = path.join(dir, item);
    const stat = fs.statSync(itemPath);
    
    // 跳过排除目录
    if (stat.isDirectory() && !EXCLUDE_DIRS.includes(item)) {
      results = results.concat(findFiles(itemPath));
    } else if (stat.isFile()) {
      const ext = path.extname(item).toLowerCase();
      if (FILE_EXTENSIONS.includes(ext)) {
        results.push(itemPath);
      }
    }
  }
  
  return results;
}

// 搜索包含旧邮箱的文件
function searchFiles() {
  const allFiles = findFiles(ROOT_DIR);
  const matchedFiles = [];
  
  for (const file of allFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes(OLD_EMAIL)) {
        matchedFiles.push(file);
      }
    } catch (err) {
      console.warn(`⚠️  无法读取文件: ${file}`, err.message);
    }
  }
  
  return matchedFiles;
}

// 替换文件中的邮箱地址
function replaceInFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const newContent = content.replace(new RegExp(OLD_EMAIL, 'g'), NEW_EMAIL);
    
    if (content !== newContent) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      const count = (newContent.match(new RegExp(NEW_EMAIL, 'g')) || []).length;
      const oldCount = (content.match(new RegExp(OLD_EMAIL, 'g')) || []).length;
      return { success: true, changed: true, count, oldCount, filePath };
    }
    
    return { success: true, changed: false, filePath };
  } catch (err) {
    return { success: false, error: err.message, filePath };
  }
}

// 主函数
function main() {
  const matchedFiles = searchFiles();
  
  if (matchedFiles.length === 0) {
    console.log(`✅ 未找到包含 ${OLD_EMAIL} 的文件`);
    return;
  }
  
  console.log(`📋 找到 ${matchedFiles.length} 个文件包含 ${OLD_EMAIL}:`);
  matchedFiles.forEach((file, index) => {
    console.log(`  ${index + 1}. ${path.relative(ROOT_DIR, file)}`);
  });
  
  console.log(`\n🔄 开始替换为 ${NEW_EMAIL}...\n`);
  
  const results = [];
  let totalReplaced = 0;
  let totalFilesChanged = 0;
  
  for (const file of matchedFiles) {
    const result = replaceInFile(file);
    results.push(result);
    
    if (result.success && result.changed) {
      console.log(`✅ ${path.relative(ROOT_DIR, file)}: 替换了 ${result.oldCount} 处`);
      totalReplaced += result.count;
      totalFilesChanged++;
    } else if (!result.success) {
      console.log(`❌ ${path.relative(ROOT_DIR, file)}: 失败 - ${result.error}`);
    }
  }
  
  console.log(`\n📊 替换完成:`);
  console.log(`   - 处理文件数: ${matchedFiles.length}`);
  console.log(`   - 成功修改文件数: ${totalFilesChanged}`);
  console.log(`   - 总替换次数: ${totalReplaced}`);
  
  // 验证替换结果
  console.log(`\n🔍 验证替换结果...`);
  const remainingFiles = searchFiles();
  if (remainingFiles.length === 0) {
    console.log(`✅ 所有 ${OLD_EMAIL} 已成功替换为 ${NEW_EMAIL}`);
  } else {
    console.log(`⚠️  仍有 ${remainingFiles.length} 个文件包含 ${OLD_EMAIL}:`);
    remainingFiles.forEach((file, index) => {
      console.log(`  ${index + 1}. ${path.relative(ROOT_DIR, file)}`);
    });
  }
}

// 执行主函数
if (require.main === module) {
  main();
}

module.exports = { OLD_EMAIL, NEW_EMAIL, searchFiles, replaceInFile };
