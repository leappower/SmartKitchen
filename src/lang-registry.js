/**
 * lang-registry.js — 语言注册表（唯一权威数据源）
 *
 * 所有与语言相关的配置均在此处管理：
 *   - 前端弹窗展示（nativeName、uiGroup）
 *   - 翻译引擎目标语言（hasTranslation、englishName）
 *   - 翻译文件生成/合并排序（sortOrder）
 *   - 运行时语言白名单（hasTranslation: true）
 *
 * 使用方式：
 *   Node.js:  const { LANGUAGES, getLangs } = require('../src/lang-registry');
 *   Browser:  通过 webpack/vite 打包或 <script> 引入后读取 window.LANG_REGISTRY
 *
 * 字段说明：
 *   code           语言代码（唯一 ID）
 *   nativeName     弹窗展示的原生名称
 *   englishName    翻译 Prompt 中使用的英文名称
 *   hasTranslation true  = 已有翻译文件，参与翻译引擎处理
 *                  false = 仅前端展示，暂无翻译文件
 *                  → 将 hasTranslation 改为 true 并提供翻译文件即可纳入翻译体系
 *
 * 说明 hi / km / my / lo 四种语言（hasTranslation: true）：
 *   - {lang}-ui.json      ✅ 已有完整 UI 翻译（约 15 KB）
 *   - {lang}-product.json ⚠️  当前为空 {}，产品页自动 fallback 到 zh-CN
 *   → 运行 product:sync 可生成占位翻译，后续逐步补全产品字段
 *   uiGroup        弹窗分组：'common' | 'european' | 'asian' | 'rtl'
 *   sortOrder      合并/排序时的顺序（数字越小越靠前）
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// 主注册表（25 种语言）
// ─────────────────────────────────────────────────────────────────────────────
const LANGUAGES = [
  // ── 常用语言 (Common) ──────────────────────────────────────────────────────
  {
    code: 'zh-CN',
    nativeName: '中文（简体）',
    englishName: 'Chinese (Simplified)',
    hasTranslation: true,
    uiGroup: 'common',
    sortOrder: 1,
  },
  {
    code: 'zh-TW',
    nativeName: '中文（繁體）',
    englishName: 'Chinese (Traditional)',
    hasTranslation: true,
    uiGroup: 'common',
    sortOrder: 2,
  },
  {
    code: 'en',
    nativeName: 'English',
    englishName: 'English',
    hasTranslation: true,
    uiGroup: 'common',
    sortOrder: 3,
  },
  {
    code: 'ar',
    nativeName: 'العربية',
    englishName: 'Arabic',
    hasTranslation: true,
    uiGroup: 'rtl',
    sortOrder: 4,
  },
  {
    code: 'he',
    nativeName: 'עברית',
    englishName: 'Hebrew',
    hasTranslation: true,
    uiGroup: 'rtl',
    sortOrder: 5,
  },
  // ── 欧洲语言 (European) ────────────────────────────────────────────────────
  {
    code: 'de',
    nativeName: 'Deutsch',
    englishName: 'German',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 6,
  },
  {
    code: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 7,
  },
  {
    code: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 8,
  },
  {
    code: 'it',
    nativeName: 'Italiano',
    englishName: 'Italian',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 9,
  },
  {
    code: 'nl',
    nativeName: 'Nederlands',
    englishName: 'Dutch',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 10,
  },
  {
    code: 'pl',
    nativeName: 'Polski',
    englishName: 'Polish',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 11,
  },
  {
    code: 'pt',
    nativeName: 'Português',
    englishName: 'Portuguese',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 12,
  },
  {
    code: 'ru',
    nativeName: 'Русский',
    englishName: 'Russian',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 13,
  },
  {
    code: 'tr',
    nativeName: 'Türkçe',
    englishName: 'Turkish',
    hasTranslation: true,
    uiGroup: 'european',
    sortOrder: 14,
  },
  // ── 亚洲语言 (Asian) ───────────────────────────────────────────────────────
  {
    code: 'ja',
    nativeName: '日本語',
    englishName: 'Japanese',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 15,
  },
  {
    code: 'ko',
    nativeName: '한국어',
    englishName: 'Korean',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 16,
  },
  {
    code: 'id',
    nativeName: 'Bahasa Indonesia',
    englishName: 'Indonesian',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 17,
  },
  {
    code: 'ms',
    nativeName: 'Bahasa Melayu',
    englishName: 'Malay',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 18,
  },
  {
    code: 'fil',
    nativeName: 'Filipino',
    englishName: 'Filipino',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 19,
  },
  {
    code: 'th',
    nativeName: 'ภาษาไทย',
    englishName: 'Thai',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 20,
  },
  {
    code: 'vi',
    nativeName: 'Tiếng Việt',
    englishName: 'Vietnamese',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 21,
  },
  {
    code: 'hi',
    nativeName: 'हिन्दी',
    englishName: 'Hindi',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 22,
  },
  {
    code: 'my',
    nativeName: 'မြန်မာဘာသာ',
    englishName: 'Burmese',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 23,
  },
  {
    code: 'km',
    nativeName: 'ភាសាខ្មែរ',
    englishName: 'Khmer',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 24,
  },
  {
    code: 'lo',
    nativeName: 'ພາສາລາວ',
    englishName: 'Lao',
    hasTranslation: true,
    uiGroup: 'asian',
    sortOrder: 25,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 派生工具函数（从注册表生成各脚本需要的格式）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 筛选语言
 * @param {{ group?: string, hasTranslation?: boolean }} [filter]
 * @returns {Array} 符合条件的语言记录，按 sortOrder 升序
 */
function getLangs(filter) {
  var result = LANGUAGES.slice().sort(function(a, b) { return a.sortOrder - b.sortOrder; });
  if (!filter) return result;
  if (filter.group !== undefined) {
    result = result.filter(function(l) { return l.uiGroup === filter.group; });
  }
  if (filter.hasTranslation !== undefined) {
    result = result.filter(function(l) { return l.hasTranslation === filter.hasTranslation; });
  }
  return result;
}

/**
 * 返回所有有翻译文件的语言代码列表（对应 config.js supportedLanguages）
 * @returns {string[]}
 */
function getSupportedCodes() {
  return getLangs({ hasTranslation: true }).map(function(l) { return l.code; });
}

/**
 * 返回所有语言代码（含待翻译语言，供前端弹窗使用）
 * @returns {string[]}
 */
function getAllCodes() {
  return getLangs().map(function(l) { return l.code; });
}

/**
 * 返回 { code: nativeName } 映射（对应 translations.js languageNames）
 * @param {{ hasTranslation?: boolean }} [filter]
 * @returns {Object}
 */
function getNativeNames(filter) {
  return getLangs(filter).reduce(function(acc, l) {
    acc[l.code] = l.nativeName;
    return acc;
  }, {});
}

/**
 * 返回 { code: englishName } 映射（对应 unified-translator.js LANGUAGE_NAMES）
 * 仅包含 hasTranslation: true 的语言
 * @returns {Object}
 */
function getEnglishNames() {
  return getLangs({ hasTranslation: true }).reduce(function(acc, l) {
    acc[l.code] = l.englishName;
    return acc;
  }, {});
}

/**
 * 返回按分组归类的语言列表（用于 HTML 弹窗渲染）
 * @returns {{ common: Array, rtl: Array, european: Array, asian: Array }}
 */
function getLangsByGroup() {
  var result = { common: [], rtl: [], european: [], asian: [] };
  getLangs().forEach(function(l) {
    if (result[l.uiGroup]) result[l.uiGroup].push(l);
  });
  return result;
}

/**
 * 按 sortOrder 返回语言代码数组（对应 merge-translations.js languageOrder）
 * @returns {string[]}
 */
function getSortedCodes() {
  return getLangs().map(function(l) { return l.code; });
}

// ─────────────────────────────────────────────────────────────────────────────
// 导出
// ─────────────────────────────────────────────────────────────────────────────

// Node.js 环境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    LANGUAGES,
    getLangs,
    getSupportedCodes,
    getAllCodes,
    getNativeNames,
    getEnglishNames,
    getLangsByGroup,
    getSortedCodes,
  };
}

// 浏览器环境（通过 <script> 直接引入时）
if (typeof window !== 'undefined') {
  window.LANG_REGISTRY = {
    LANGUAGES: LANGUAGES,
    getLangs: getLangs,
    getSupportedCodes: getSupportedCodes,
    getAllCodes: getAllCodes,
    getNativeNames: getNativeNames,
    getEnglishNames: getEnglishNames,
    getLangsByGroup: getLangsByGroup,
  };
}
