#!/usr/bin/env node

/**
 * 术语表驱动的翻译一致性校验
 * 
 * 扫描所有 *-product.json 文件，检查术语翻译是否与 glossary 一致
 * 
 * 用法:
 *   node scripts/i18n/validate-glossary.js [--fix] [--lang <lang>] [--verbose]
 * 
 * 选项:
 *   --fix       自动修复不一致的翻译（会直接修改 JSON 文件）
 *   --lang      只检查指定语言（如 en, de, fr）
 *   --verbose   显示详细信息（每个匹配的术语位置）
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');
const GLOSSARY_PATH = path.join(__dirname, 'translation-glossary.json');
const LANG_DIR = path.join(ROOT, 'src/assets/lang');

// Parse args
const args = process.argv.slice(2);
const shouldFix = args.includes('--fix');
const langFilter = (() => {
  const idx = args.indexOf('--lang');
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
})();
const verbose = args.includes('--verbose');

// Load glossary
const glossary = JSON.parse(fs.readFileSync(GLOSSARY_PATH, 'utf-8'));
const terms = glossary.terms;

// Sort terms by length desc so longer terms match first
const sortedTerms = Object.keys(terms).sort((a, b) => b.length - a.length);

/**
 * Find all glossary terms in a Chinese source text
 * Returns array of { term, start, end }
 */
function findTermsInText(text) {
  const results = [];
  for (const term of sortedTerms) {
    let idx = text.indexOf(term);
    while (idx !== -1) {
      results.push({ term, start: idx, end: idx + term.length });
      idx = text.indexOf(term, idx + 1);
    }
  }
  // Sort by position
  return results.sort((a, b) => a.start - b.start);
}

/**
 * For a given Chinese term in source, find the corresponding segment in translation
 * Simple heuristic: the translation of a term should appear as a word/phrase boundary
 */
function findTranslationSegment(translation, expected) {
  // Try exact match first (case-insensitive)
  const lowerTrans = translation.toLowerCase();
  const lowerExpected = expected.toLowerCase();

  if (lowerTrans.includes(lowerExpected)) {
    return { found: true, match: expected };
  }

  // Try individual words of multi-word translations
  const words = expected.split(/\s+/);
  if (words.length > 1) {
    // Check if at least the core words appear
    const matched = words.filter(w => w.length > 2 && lowerTrans.includes(w.toLowerCase()));
    if (matched.length >= Math.ceil(words.length * 0.6)) {
      return { found: false, match: null, partial: matched.join(', ') };
    }
  }

  return { found: false, match: null };
}

// Find all product JSON files
const productFiles = fs.readdirSync(LANG_DIR)
  .filter(f => f.endsWith('-product.json'))
  .map(f => path.join(LANG_DIR, f));

// Extract language code from filename
function getLang(filename) {
  const match = path.basename(filename).match(/^([a-z]+(?:-[a-zA-Z]+)?)-product\.json$/);
  return match ? match[1] : null;
}

// Main validation
const issues = [];
let totalChecked = 0;
let totalFixed = 0;

console.log('🔍 术语表翻译一致性校验\n');
console.log(`📋 术语数量: ${sortedTerms.length}`);
console.log(`📁 扫描目录: ${LANG_DIR}\n`);

for (const filepath of productFiles) {
  const lang = getLang(filepath);
  if (!lang) continue;
  if (lang === 'zh-CN' || lang === 'zh') continue; // Skip source language
  if (langFilter && lang !== langFilter) continue;

  // Check if glossary has this language
  const sampleTerm = sortedTerms[0];
  if (!terms[sampleTerm][lang]) {
    console.log(`⚠️  跳过 ${lang}: 术语表中无此语言`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
  let fileIssues = 0;
  let fileFixed = 0;

  // Traverse all string values recursively
  function traverse(obj, path) {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string' && value.trim()) {
        // Check if this is a Chinese source key pattern
        // We look for glossary terms in the value and check against zh-CN product file
        // But since these are translated files, we need to compare with zh-CN source
        totalChecked++;
      } else if (typeof value === 'object') {
        traverse(value, currentPath);
      }
    }
  }

  traverse(data, '');

  // Better approach: load zh-CN product as source of truth, then compare translations
  // Actually, let's scan each product entry for Chinese terms in translation values
  // and check if they should have been translated

  // Re-scan: check for untranslated Chinese terms remaining in non-Chinese files
  function checkForUntranslatedTerms(obj, path) {
    if (!obj || typeof obj !== 'object') return;

    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;

      if (typeof value === 'string' && value.trim()) {
        for (const term of sortedTerms) {
          if (value.includes(term)) {
            issues.push({
              type: 'untranslated',
              file: path.basename(filepath),
              lang,
              path: currentPath,
              term,
              expected: terms[term][lang],
              found: term, // still in Chinese
            });
            fileIssues++;
          }
        }
      } else if (typeof value === 'object') {
        checkForUntranslatedTerms(value, currentPath);
      }
    }
  }

  checkForUntranslatedTerms(data, '');

  if (fileIssues > 0) {
    console.log(`❌ ${path.basename(filepath)}: ${fileIssues} 个未翻译术语`);
  }
}

// Now do the cross-file consistency check: same Chinese term → same translation across products
console.log('\n📋 跨产品翻译一致性检查...\n');

// Load zh-CN as source
const zhFile = path.join(LANG_DIR, 'zh-CN-product.json');
if (!fs.existsSync(zhFile)) {
  console.log('⚠️  未找到 zh-CN-product.json，跳过一致性检查');
} else {
  const zhData = JSON.parse(fs.readFileSync(zhFile, 'utf-8'));

  // Build map: zhTerm → { lang → [ { value, path } ] }
  const translationMap = {};

  function buildMap(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = path ? `${path}.${key}` : key;
      if (typeof value === 'string' && value.trim()) {
        const foundTerms = findTermsInText(value);
        for (const { term } of foundTerms) {
          if (!translationMap[term]) translationMap[term] = {};
        }
      } else if (typeof value === 'object') {
        buildMap(value, currentPath);
      }
    }
  }

  buildMap(zhData, '');

  // For each language, collect translations of each term
  const langFiles = productFiles.filter(f => {
    const l = getLang(f);
    return l && l !== 'zh-CN' && l !== 'zh' && (!langFilter || l === langFilter);
  });

  for (const term of sortedTerms) {
    const expectedTranslations = {};
    const foundVariants = {};

    for (const filepath of langFiles) {
      const lang = getLang(filepath);
      if (!terms[term][lang]) continue;

      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));

      // Find all values that correspond to zh-CN values containing this term
      // We need to walk both trees in parallel
      function compareWithZh(zhObj, transObj, path) {
        if (!zhObj || !transObj || typeof zhObj !== 'object' || typeof transObj !== 'object') return;

        for (const key of Object.keys(zhObj)) {
          const currentPath = path ? `${path}.${key}` : key;

          if (typeof zhObj[key] === 'string' && zhObj[key].includes(term)) {
            const transValue = transObj[key];
            if (typeof transValue === 'string' && transValue.trim()) {
              const expected = terms[term][lang];

              // Check if the translation matches the glossary
              const result = findTranslationSegment(transValue, expected);
              if (!result.found) {
                if (!foundVariants[lang]) foundVariants[lang] = new Set();
                foundVariants[lang].add(transValue);
                expectedTranslations[lang] = expected;

                issues.push({
                  type: 'inconsistent',
                  file: path.basename(filepath),
                  lang,
                  path: currentPath,
                  term,
                  expected,
                  found: transValue,
                  partial: result.partial,
                });
              }
            }
          } else if (typeof zhObj[key] === 'object' && typeof transObj[key] === 'object') {
            compareWithZh(zhObj[key], transObj[key], currentPath);
          }
        }
      }

      compareWithZh(zhData, data, '');
    }
  }
}

// Report
console.log('\n' + '='.repeat(60));
console.log('📊 检查结果');
console.log('='.repeat(60));

if (issues.length === 0) {
  console.log('\n✅ 所有翻译与术语表一致！');
} else {
  const untranslated = issues.filter(i => i.type === 'untranslated');
  const inconsistent = issues.filter(i => i.type === 'inconsistent');

  if (untranslated.length > 0) {
    console.log(`\n🔴 未翻译的中文术语: ${untranslated.length} 处`);
    // Group by file
    const byFile = {};
    for (const issue of untranslated) {
      if (!byFile[issue.file]) byFile[issue.file] = [];
      byFile[issue.file].push(issue);
    }
    for (const [file, fileIssues] of Object.entries(byFile)) {
      console.log(`\n  📄 ${file}:`);
      // Group by term
      const byTerm = {};
      for (const i of fileIssues) {
        if (!byTerm[i.term]) byTerm[i.term] = { count: 0, paths: [] };
        byTerm[i.term].count++;
        if (verbose) byTerm[i.term].paths.push(i.path);
      }
      for (const [term, info] of Object.entries(byTerm)) {
        console.log(`    "${term}" → 出现 ${info.count} 次，应翻译为 "${terms[term][fileIssues[0].lang]}"`);
        if (verbose) {
          for (const p of info.paths) console.log(`      ↳ ${p}`);
        }
      }
    }
  }

  if (inconsistent.length > 0) {
    console.log(`\n🟡 翻译与术语表不一致: ${inconsistent.length} 处`);
    // Group by term + lang
    const byTermLang = {};
    for (const issue of inconsistent) {
      const k = `${issue.term} [${issue.lang}]`;
      if (!byTermLang[k]) byTermLang[k] = { expected: issue.expected, variants: new Set(), files: [] };
      byTermLang[k].variants.add(issue.found);
      byTermLang[k].files.push({ file: issue.file, path: issue.path, found: issue.found });
    }
    for (const [k, info] of Object.entries(byTermLang)) {
      console.log(`\n  📌 ${k}`);
      console.log(`     期望: "${info.expected}"`);
      console.log(`     发现变体: ${[...info.variants].map(v => `"${v}"`).join(', ')}`);
      if (verbose) {
        for (const f of info.files) {
          console.log(`       ↳ ${f.file} → ${f.path}: "${f.found}"`);
        }
      }
    }
  }

  // --fix mode
  if (shouldFix) {
    console.log('\n🔧 自动修复中...\n');

    for (const filepath of langFiles) {
      const lang = getLang(filepath);
      const data = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      const zhData2 = JSON.parse(fs.readFileSync(zhFile, 'utf-8'));
      let fileFixed = 0;

      // Fix untranslated terms
      function fixUntranslated(obj, path) {
        if (!obj || typeof obj !== 'object') return;
        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          if (typeof value === 'string') {
            for (const term of sortedTerms) {
              if (value.includes(term) && terms[term][lang]) {
                obj[key] = value.replace(term, terms[term][lang]);
                fileFixed++;
              }
            }
          } else if (typeof value === 'object') {
            fixUntranslated(value, currentPath);
          }
        }
      }

      fixUntranslated(data, '');

      if (fileFixed > 0) {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
        console.log(`  ✅ ${path.basename(filepath)}: 修复 ${fileFixed} 处`);
        totalFixed += fileFixed;
      }
    }

    console.log(`\n🎉 共修复 ${totalFixed} 处不一致翻译`);
  } else {
    console.log('\n💡 使用 --fix 参数自动修复未翻译的术语');
  }
}

// Summary
console.log(`\n${'─'.repeat(40)}`);
console.log(`扫描文件: ${langFiles.length + 1} (含 zh-CN)`);
console.log(`术语数量: ${sortedTerms.length}`);
console.log(`发现问题: ${issues.length} 处`);
if (shouldFix) console.log(`已修复: ${totalFixed} 处`);
console.log(`${'─'.repeat(40)}`);

process.exit(issues.length > 0 ? 1 : 0);
