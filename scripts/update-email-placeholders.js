#!/usr/bin/env node
/**
 * 批量更新邮箱占位符脚本
 * 将 "form_email_placeholder": "support_kitchen@yukoli.com" 替换为相应的翻译
 */

const fs = require('fs');
const path = require('path');

const langDir = path.join(__dirname, '../src/assets/lang');
const filesToUpdate = [
  'fil-ui.json',
  'he-ui.json',
  'hi-ui.json',
  'id-ui.json',
  'km-ui.json',
  'lo-ui.json',
  'ms-ui.json',
  'my-ui.json',
  'nl-ui.json',
  'pl-ui.json',
  'th-ui.json',
  'tr-ui.json',
  'vi-ui.json',
  'zh-TW-ui.json'
];

// 翻译映射
const translations = {
  'fil-ui.json': 'Ang iyong email address',
  'he-ui.json': 'כתובת הדוא\"ל שלך',
  'hi-ui.json': 'आपका ईमेल पता',
  'id-ui.json': 'Alamat email Anda',
  'km-ui.json': 'អាសយដ្ឋានអ៊ីមែលរបស់អ្នក',
  'lo-ui.json': 'ທີ່ຢູ່ອີເມວຂອງທ່ານ',
  'ms-ui.json': 'Alamat e-mel anda',
  'my-ui.json': 'သင့်အီးမေးလ်လိပ်စာ',
  'nl-ui.json': 'Uw e-mailadres',
  'pl-ui.json': 'Twój adres e-mail',
  'th-ui.json': 'ที่อยู่อีเมลของคุณ',
  'tr-ui.json': 'E-posta adresiniz',
  'vi-ui.json': 'Địa chỉ email của bạn',
  'zh-TW-ui.json': '您的電子郵件地址'
};

let updatedCount = 0;

console.log('🔍 开始更新邮箱占位符...\n');

filesToUpdate.forEach(filename => {
  const filePath = path.join(langDir, filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      const oldPlaceholder = '"form_email_placeholder": "support_kitchen@yukoli.com"';
      const newPlaceholder = `"form_email_placeholder": "${translations[filename]}"`;
      
      if (content.includes(oldPlaceholder)) {
        const newContent = content.replace(oldPlaceholder, newPlaceholder);
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`✅ 已更新 ${filename}`);
        updatedCount++;
      } else {
        console.log(`⚠️  ${filename} 不包含占位符`);
      }
    } else {
      console.log(`❌ ${filename} 未找到`);
    }
  } catch (error) {
    console.log(`❌ 更新 ${filename} 时出错: ${error.message}`);
  }
});

console.log(`\n📊 更新完成: 已更新 ${updatedCount} 个文件，共 ${filesToUpdate.length} 个文件`);
