/**
 * 产品翻译特殊处理器
 * 用于处理品牌、数字、表情等特殊情况
 * 
 * 工作流程：
 * 1. 前置处理：提取保护的部分（品牌、数字、表情）
 * 2. 翻译：Google Translate 中文 → 目标语言
 * 3. 后置处理：恢复保护的部分、验证翻译质量
 */

const BRAND_DICT = [
  // 中文品牌/术语 -> 英文保留
  { zh: 'ESL', en: 'ESL', type: 'brand' },
  { zh: 'HTML-YuQL', en: 'HTML-YuQL', type: 'brand' },
  { zh: 'AI', en: 'AI', type: 'brand' },
  { zh: 'API', en: 'API', type: 'brand' },
  // 可扩展：添加更多品牌
];

const INDUSTRY_TERMS = [
  // 行业术语（需要特殊翻译）
  { zh: '炒菜机', en: 'Wok Machine', type: 'equipment' },
  { zh: '烤箱', en: 'Oven', type: 'equipment' },
  { zh: '油炸炉', en: 'Fryer', type: 'equipment' },
  { zh: '触屏', en: 'Touch Screen', type: 'feature' },
  { zh: '节能', en: 'Energy Saving', type: 'feature' },
  // 可扩展：添加更多术语
];

/**
 * 创建占位符映射
 * 用于保护品牌和特殊术语
 */
function createPlaceholderMap(text) {
  const placeholderMap = new Map();
  let processedText = text;
  let placeholderId = 0;

  // 保护品牌
  for (const { zh, en } of BRAND_DICT) {
    const regex = new RegExp(zh, 'g');
    if (regex.test(processedText)) {
      const placeholder = `__BRAND_${placeholderId}__`;
      placeholderMap.set(placeholder, en);
      processedText = processedText.replace(regex, placeholder);
      placeholderId++;
    }
  }

  // 保护数字和单位
  const numberRegex = /\d+(\.\d+)?(kW|kg|km|°C|A|V|Hz|倍|个|张)/g;
  processedText = processedText.replace(numberRegex, (match) => {
    const placeholder = `__NUMBER_${placeholderId}__`;
    placeholderMap.set(placeholder, match);
    placeholderId++;
    return placeholder;
  });

  // 保护表情和特殊符号
  const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
  processedText = processedText.replace(emojiRegex, (match) => {
    const placeholder = `__EMOJI_${placeholderId}__`;
    placeholderMap.set(placeholder, match);
    placeholderId++;
    return placeholder;
  });

  // 保护URL
  const urlRegex = /https?:\/\/[^\s]+/g;
  processedText = processedText.replace(urlRegex, (match) => {
    const placeholder = `__URL_${placeholderId}__`;
    placeholderMap.set(placeholder, match);
    placeholderId++;
    return placeholder;
  });

  return { processedText, placeholderMap };
}

/**
 * 恢复占位符为原始文本
 */
function restorePlaceholders(text, placeholderMap) {
  let restoredText = text;
  for (const [placeholder, original] of placeholderMap.entries()) {
    restoredText = restoredText.replace(new RegExp(placeholder, 'g'), original);
  }
  return restoredText;
}

/**
 * 预处理：检查文本中的特殊内容
 * @param {string} text - 原始文本
 * @returns {Object} { original, protected, placeholderMap, analysis }
 */
function preprocessText(text) {
  const { processedText, placeholderMap } = createPlaceholderMap(text);

  // 分析被保护的内容
  const analysis = {
    hasBrand: false,
    hasNumber: false,
    hasEmoji: false,
    hasUrl: false,
    protectedCount: placeholderMap.size,
  };

  for (const [placeholder] of placeholderMap.entries()) {
    if (placeholder.includes('BRAND')) analysis.hasBrand = true;
    if (placeholder.includes('NUMBER')) analysis.hasNumber = true;
    if (placeholder.includes('EMOJI')) analysis.hasEmoji = true;
    if (placeholder.includes('URL')) analysis.hasUrl = true;
  }

  return {
    original: text,
    protected: processedText,
    placeholderMap,
    analysis,
  };
}

/**
 * 后处理：恢复占位符并验证质量
 * @param {string} translatedText - 翻译后的文本
 * @param {Map} placeholderMap - 占位符映射
 * @returns {Object} { recovered, warnings }
 */
function postprocessText(translatedText, placeholderMap) {
  const warnings = [];
  let recovered = translatedText;

  // 检查是否有未恢复的占位符（翻译器可能改变了格式）
  const unresolvedPlaceholders = [];
  for (const [placeholder] of placeholderMap.entries()) {
    // 尝试不同的格式（大小写、空格变化等）
    const basePattern = placeholder.replace(/__/g, '');
    const flexRegex = new RegExp(`__?${basePattern}__?`, 'gi');
    if (!flexRegex.test(recovered)) {
      unresolvedPlaceholders.push(placeholder);
    }
  }

  if (unresolvedPlaceholders.length > 0) {
    warnings.push(`⚠️  Cannot resolve ${unresolvedPlaceholders.length} placeholders`);
  }

  // 恢复占位符
  recovered = restorePlaceholders(recovered, placeholderMap);

  // 验证恢复的内容
  for (const original of placeholderMap.values()) {
    if (!recovered.includes(original)) {
      warnings.push(`⚠️  Missing content: "${original.slice(0, 30)}..."`);
    }
  }

  return { recovered, warnings };
}

/**
 * 完整的翻译准备流程
 * @param {string} text - 原始中文文本
 * @param {string} field - 字段名 (name/highlights/scenarios/usage)
 * @returns {Object} { original, protected, placeholderMap, fieldInfo }
 */
function prepareForTranslation(text, field) {
  if (!text || typeof text !== 'string') {
    return { original: text, protected: text, placeholderMap: new Map(), fieldInfo: null };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { original: text, protected: text, placeholderMap: new Map(), fieldInfo: null };
  }

  const { protected: processedText, placeholderMap, analysis } = preprocessText(trimmed);

  const fieldInfo = {
    field,
    originalLength: trimmed.length,
    protectedLength: processedText.length,
    hasProtected: placeholderMap.size > 0,
    analysis,
  };

  // debug: console.log(`[prepare][${field}] Original length: ${fieldInfo.originalLength}, Protected: ${placeholderMap.size} items`);

  return {
    original: trimmed,
    protected: processedText,
    placeholderMap,
    fieldInfo,
  };
}

/**
 * 验证翻译质量
 * @param {string} original - 原始中文
 * @param {string} translated - 翻译后的文本
 * @param {string} targetLang - 目标语言
 * @returns {Object} { score, issues, suggestions }
 */
function validateTranslation(original, translated, targetLang) {
  const issues = [];
  let score = 100;

  // 检查长度变化
  const lengthRatio = translated.length / original.length;
  if (lengthRatio > 3) {
    issues.push(`Translation too long (${lengthRatio.toFixed(1)}x)`);
    score -= 10;
  } else if (lengthRatio < 0.3) {
    issues.push(`Translation too short (${lengthRatio.toFixed(1)}x)`);
    score -= 10;
  }

  // 检查特殊字符丢失
  const originalHasPunctuation = /[！？；：，。]/g.test(original);
  const translatedHasPunctuation = /[!?.;:,]/g.test(translated);
  if (originalHasPunctuation && !translatedHasPunctuation && targetLang !== 'en') {
    issues.push('Punctuation might be lost');
    score -= 5;
  }

  // 检查数字保留
  const originalNumbers = original.match(/\d+/g) || [];
  const translatedNumbers = translated.match(/\d+/g) || [];
  if (originalNumbers.length !== translatedNumbers.length && targetLang !== 'ja') {
    issues.push(`Number mismatch: ${originalNumbers.length} → ${translatedNumbers.length}`);
    score -= 5;
  }

  return {
    score: Math.max(0, score),
    issues,
    suggestions: issues.length > 0 ? ['Consider using protected placeholders for critical numbers/brands'] : [],
  };
}

module.exports = {
  BRAND_DICT,
  INDUSTRY_TERMS,
  createPlaceholderMap,
  restorePlaceholders,
  preprocessText,
  postprocessText,
  prepareForTranslation,
  validateTranslation,
};
