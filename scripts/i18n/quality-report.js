#!/usr/bin/env node

/**
 * quality-report.js — 翻译质量报告生成器
 *
 * 扫描所有语言的 UI / Product 翻译文件，检测常见质量问题并输出报告。
 *
 * 检查项：
 *   emptyValues    — 空值或空字符串
 *   sameAsSource   — 翻译与原文相同（>5 字符）
 *   garbledText    — Unicode 替换字符 (U+FFFD) 3 个以上
 *   abnormalLength — 长度异常（>5 倍或 <0.2 倍原文）
 *   chineseInNonZh — 非中文语言中出现中文（3 个以上汉字）
 *   placeholderLeak — 占位符泄漏（__BRAND_\d+__ 或 __NUM_\d+__）
 *
 * 用法：
 *   node scripts/i18n/quality-report.js
 *   node scripts/i18n/quality-report.js --ci
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ─────────────────────────────────────────────
// 配置
// ─────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '../..');

const FILES = [
  { name: 'ui',      path: path.join(ROOT, 'src/assets/ui-i18n.json') },
  { name: 'product', path: path.join(ROOT, 'src/assets/product-translations.json') },
];

const SOURCE_LANG = 'en';
const ZH_LANGS = ['zh-CN', 'zh-TW'];

// ─────────────────────────────────────────────
// 检测函数
// ─────────────────────────────────────────────

function checkEmptyValue(key, value, _lang) {
  if (value === '' || value === null || value === undefined) {
    return { key, issue: 'emptyValues', detail: value === null ? 'null' : value === undefined ? 'undefined' : 'empty string' };
  }
  return null;
}

function checkSameAsSource(key, translated, source) {
  if (!source || typeof source !== 'string') return null;
  const src = source.trim();
  const tgt = (translated || '').trim();
  if (tgt === src && tgt.length > 5) {
    return { key, issue: 'sameAsSource', detail: `len=${tgt.length}` };
  }
  return null;
}

function checkGarbledText(key, value) {
  if (!value || typeof value !== 'string') return null;
  const matches = value.match(/\ufffd/g);
  if (matches && matches.length >= 3) {
    return { key, issue: 'garbledText', detail: `${matches.length} replacement chars` };
  }
  return null;
}

function checkAbnormalLength(key, translated, source) {
  if (!source || typeof source !== 'string') return null;
  const srcLen = source.trim().length;
  if (srcLen < 20) return null;
  const tgtLen = (translated || '').trim().length;
  if (tgtLen < srcLen * 0.2 || tgtLen > srcLen * 5) {
    return { key, issue: 'abnormalLength', detail: `src=${srcLen}, tgt=${tgtLen}, ratio=${(tgtLen / srcLen).toFixed(2)}` };
  }
  return null;
}

function checkChineseInNonZh(key, value, lang) {
  if (ZH_LANGS.includes(lang)) return null;
  if (!value || typeof value !== 'string') return null;
  const chineseChars = (value.match(/[\u4e00-\u9fff]/g) || []);
  if (chineseChars.length >= 3) {
    return { key, issue: 'chineseInNonZh', detail: `${chineseChars.length} Chinese chars` };
  }
  return null;
}

function checkPlaceholderLeak(key, value) {
  if (!value || typeof value !== 'string') return null;
  const brandMatches = value.match(/__BRAND_\d+__/g) || [];
  const numMatches = value.match(/__NUM_\d+__/g) || [];
  if (brandMatches.length > 0 || numMatches.length > 0) {
    return { key, issue: 'placeholderLeak', detail: `BRAND=${brandMatches.length}, NUM=${numMatches.length}` };
  }
  return null;
}

// ─────────────────────────────────────────────
// 扫描
// ─────────────────────────────────────────────

function scanFile(fileInfo) {
  const { name, path: filePath } = fileInfo;
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️  文件不存在: ${filePath}`);
    return [];
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const sourceData = data[SOURCE_LANG] || {};
  const results = [];
  const issues = [];

  for (const lang of Object.keys(data)) {
    if (lang === SOURCE_LANG) continue;
    const langData = data[lang] || {};
    const langIssues = [];

    for (const key of Object.keys(sourceData)) {
      const source = sourceData[key];
      const translated = langData[key];

      const checks = [
        checkEmptyValue(key, translated, lang),
        checkSameAsSource(key, translated, source),
        checkGarbledText(key, translated),
        checkAbnormalLength(key, translated, source),
        checkChineseInNonZh(key, translated, lang),
        checkPlaceholderLeak(key, translated),
      ];

      for (const issue of checks) {
        if (!issue) continue;
        langIssues.push({ ...issue, lang, file: name, sourceSnippet: (source || '').slice(0, 60) });
      }
    }

    if (langIssues.length > 0) {
      issues.push({ lang, count: langIssues.length, items: langIssues });
    }
  }

  results.push({ file: name, totalLanguages: Object.keys(data).length - 1, issues });
  return results;
}

// ─────────────────────────────────────────────
// 报告生成
// ─────────────────────────────────────────────

function generateReport(fileResults) {
  // 按语言汇总
  const langSummary = {};
  const issueTypeSummary = {};
  const allItems = [];

  for (const fileResult of fileResults) {
    for (const langGroup of fileResult.issues) {
      if (!langSummary[langGroup.lang]) {
        langSummary[langGroup.lang] = { lang: langGroup.lang, files: {}, totalCount: 0 };
      }
      langSummary[langGroup.lang].files[fileResult.file] = langGroup.count;
      langSummary[langGroup.lang].totalCount += langGroup.count;

      for (const item of langGroup.items) {
        allItems.push(item);
        issueTypeSummary[item.issue] = (issueTypeSummary[item.issue] || 0) + 1;
      }
    }
  }

  // 按问题数量降序
  const sortedLangs = Object.values(langSummary).sort((a, b) => b.totalCount - a.totalCount);
  const totalIssues = allItems.length;

  return {
    generatedAt: new Date().toISOString(),
    totalIssues,
    issueTypeSummary,
    languageSummary: sortedLangs,
    details: allItems,
  };
}

// ─────────────────────────────────────────────
// 控制台输出
// ─────────────────────────────────────────────

function printReport(report, ciMode) {
  const { totalIssues, issueTypeSummary, languageSummary, details } = report;

  if (ciMode) {
    console.log(`Total issues: ${totalIssues}`);
    if (totalIssues > 0) {
      console.log('Issue breakdown:');
      for (const [type, count] of Object.entries(issueTypeSummary)) {
        console.log(`  ${type}: ${count}`);
      }
      console.log('Top languages:');
      for (const lang of languageSummary.slice(0, 10)) {
        console.log(`  ${lang.lang}: ${lang.totalCount}`);
      }
    }
    return;
  }

  // 完整报告
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  📊 翻译质量报告');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  生成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
  console.log(`  问题总数: ${totalIssues}`);
  console.log('');

  // 检查类型汇总
  console.log('  📋 检查类型汇总');
  console.log('  ──────────────────────────────────────────');
  const issueLabels = {
    emptyValues: '空值/空字符串',
    sameAsSource: '与原文相同',
    garbledText: '乱码',
    abnormalLength: '长度异常',
    chineseInNonZh: '非中文含中文',
    placeholderLeak: '占位符泄漏',
  };
  for (const [type, count] of Object.entries(issueTypeSummary).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${issueLabels[type] || type}: ${count}`);
  }
  console.log('');

  // 语言汇总
  console.log('  🌍 按语言统计 (Top 15)');
  console.log('  ──────────────────────────────────────────');
  console.log('  │ 语言     │ UI   │ Product │ 总计 │');
  console.log('  ├──────────┼──────┼─────────┼──────┤');
  for (const lang of languageSummary.slice(0, 15)) {
    const ui = lang.files['ui'] || 0;
    const prod = lang.files['product'] || 0;
    const name = lang.lang.padEnd(9);
    console.log(`  │ ${name} │ ${String(ui).padStart(4)} │ ${String(prod).padStart(7)} │ ${String(lang.totalCount).padStart(4)} │`);
  }
  console.log('  └──────────┴──────┴─────────┴──────┘');
  if (languageSummary.length > 15) {
    console.log(`  ... 还有 ${languageSummary.length - 15} 种语言`);
  }
  console.log('');

  // 详细问题列表（按语言分组，每种语言最多显示 5 条）
  console.log('  🔍 问题详情（每种语言最多 5 条）');
  console.log('  ──────────────────────────────────────────');
  for (const lang of languageSummary) {
    const langItems = details.filter(d => d.lang === lang.lang);
    console.log(`\n  【${lang.lang}】(${lang.totalCount} 个问题)`);
    for (const item of langItems.slice(0, 5)) {
      const label = issueLabels[item.issue] || item.issue;
      console.log(`    ⚠️  ${label}: "${item.key}" — ${item.detail}`);
    }
    if (langItems.length > 5) {
      console.log(`    ... 还有 ${langItems.length - 5} 个问题`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const ciMode = args.includes('--ci');

  console.log('🔍 正在扫描翻译文件...');

  const fileResults = [];
  for (const fileInfo of FILES) {
    const results = scanFile(fileInfo);
    fileResults.push(...results);
  }

  const report = generateReport(fileResults);

  // 保存 JSON 报告
  const date = new Date().toISOString().slice(0, 10);
  const reportDir = path.join(ROOT, 'reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });

  const reportPath = path.join(reportDir, `quality-report-${date}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`💾 报告已保存: ${reportPath}`);

  printReport(report, ciMode);

  // CI 模式：严重问题（空值、乱码、占位符泄漏）exit code 非零
  if (ciMode) {
    const severeTypes = ['emptyValues', 'garbledText', 'placeholderLeak'];
    const severeCount = severeTypes.reduce((sum, t) => sum + (report.issueTypeSummary[t] || 0), 0);
    if (severeCount > 0) {
      console.error(`\n❌ CI: ${severeCount} severe issues found (empty/garbled/placeholder).`);
      process.exit(1);
    }
  }
}

main();
