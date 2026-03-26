const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

const PRODUCT_LIST_PATH = path.join(process.cwd(), 'src/assets/product-list.js');
const PRODUCT_TABLE_PATH = path.join(process.cwd(), 'src/assets/product-data-table.js');
const FEISHU_CONFIG_PATH = path.join(process.cwd(), 'scripts/feishu-config.json');
const APPEND_START = '// FEISHU_SYNC_APPEND_START';
const APPEND_END = '// FEISHU_SYNC_APPEND_END';

const ALIAS = {
  '大类': 'category',
  '大类(Key)': 'category',
  '一级分类': 'category',
  '分类': 'category',
  category: 'category',
  '小类': 'subCategory',
  '小类(SPUKey)': 'subCategory',
  '二级分类': 'subCategory',
  subCategory: 'subCategory',
  '产品名称': 'name',
  '名称': 'name',
  name: 'name',
  '型号': 'model',
  '型号(SKUKey)': 'model',
  model: 'model',
  '卖点': 'highlights',
  '亮点': 'highlights',
  highlights: 'highlights',
  '应用场景': 'scenarios',
  '场景': 'scenarios',
  scenarios: 'scenarios',
  '用法': 'usage',
  '用途': 'usage',
  usage: 'usage',
  '功率': 'power',
  power: 'power',
  '吞吐量': 'throughput',
  '吞吐': 'throughput',
  throughput: 'throughput',
  '平均时间': 'averageTime',
  '平均出餐时间': 'averageTime',
  averageTime: 'averageTime',
  '上市时间': 'launchTime',
  launchTime: 'launchTime',
  '状态': 'status',
  status: 'status',
  '是否启用': 'isActive',
  '是否显示': 'isActive',
  '激活': 'isActive',
  '上架': 'isActive',
  isActive: 'isActive',
  '徽章': 'badge',
  '徽标key': 'badge',
  badge: 'badge',
  '徽章颜色': 'badgeColor',
  '徽标颜色': 'badgeColor',
  badgeColor: 'badgeColor',
  '图片识别key': 'imageRecognitionKey',
  '图片key': 'imageRecognitionKey',
  imageRecognitionKey: 'imageRecognitionKey',
  '装箱数量': 'packingQuantity',
  packingQuantity: 'packingQuantity',
  '产品尺寸': 'productDimensions',
  productDimensions: 'productDimensions',
  '包装尺寸': 'packageDimensions',
  packageDimensions: 'packageDimensions',
  '外箱尺寸': 'outerBoxDimensions',
  outerBoxDimensions: 'outerBoxDimensions',
  '包装方式': 'packageType',
  packageType: 'packageType',
  '颜色': 'color',
  color: 'color',
  '净重': 'netWeight',
  netWeight: 'netWeight',
  '毛重': 'grossWeight',
  grossWeight: 'grossWeight',
  '电压': 'voltage',
  voltage: 'voltage',
  '频率': 'frequency',
  frequency: 'frequency',
  '材质': 'material',
  material: 'material',
  '质保期': 'warrantyPeriod',
  warrantyPeriod: 'warrantyPeriod',
  '认证': 'certification',
  certification: 'certification',
  '温度范围': 'temperatureRange',
  temperatureRange: 'temperatureRange',
  '控制方式': 'controlMethod',
  controlMethod: 'controlMethod',
  '能效等级': 'energyEfficiencyGrade',
  energyEfficiencyGrade: 'energyEfficiencyGrade',
  '适用人群': 'applicablePeople',
  applicablePeople: 'applicablePeople',
  '产地': 'origin',
  origin: 'origin',
  '条码': 'barcode',
  barcode: 'barcode',
  '参考价格': 'referencePrice',
  referencePrice: 'referencePrice',
  '最小起订量': 'minimumOrderQuantity',
  minimumOrderQuantity: 'minimumOrderQuantity',
  '库存数量': 'stockQuantity',
  stockQuantity: 'stockQuantity',
  
  // 多语言字段别名 (name_en, name_zh-CN, highlights_en, etc.)
  '产品名称_AR': 'name_ar',
  '产品名称_DE': 'name_de',
  '产品名称_EN': 'name_en',
  '产品名称_ES': 'name_es',
  '产品名称_FIL': 'name_fil',
  '产品名称_FR': 'name_fr',
  '产品名称_HE': 'name_he',
  '产品名称_ID': 'name_id',
  '产品名称_IT': 'name_it',
  '产品名称_JA': 'name_ja',
  '产品名称_KO': 'name_ko',
  '产品名称_MS': 'name_ms',
  '产品名称_NL': 'name_nl',
  '产品名称_PL': 'name_pl',
  '产品名称_PT': 'name_pt',
  '产品名称_RU': 'name_ru',
  '产品名称_TH': 'name_th',
  '产品名称_TR': 'name_tr',
  '产品名称_VI': 'name_vi',
  '产品名称_ZH': 'name_zh',
  '产品名称_ZH_CN': 'name_zh-CN',
  '产品名称_ZH_TW': 'name_zh-TW',
  name_ar: 'name_ar',
  name_de: 'name_de',
  name_en: 'name_en',
  name_es: 'name_es',
  name_fil: 'name_fil',
  name_fr: 'name_fr',
  name_he: 'name_he',
  name_id: 'name_id',
  name_it: 'name_it',
  name_ja: 'name_ja',
  name_ko: 'name_ko',
  name_ms: 'name_ms',
  name_nl: 'name_nl',
  name_pl: 'name_pl',
  name_pt: 'name_pt',
  name_ru: 'name_ru',
  name_th: 'name_th',
  name_tr: 'name_tr',
  name_vi: 'name_vi',
  name_zh: 'name_zh',
  'name_zh-CN': 'name_zh-CN',
  'name_zh-TW': 'name_zh-TW',
  
  // 卖点多语言
  '卖点_AR': 'highlights_ar',
  '卖点_DE': 'highlights_de',
  '卖点_EN': 'highlights_en',
  '卖点_ES': 'highlights_es',
  '卖点_FIL': 'highlights_fil',
  '卖点_FR': 'highlights_fr',
  '卖点_HE': 'highlights_he',
  '卖点_ID': 'highlights_id',
  '卖点_IT': 'highlights_it',
  '卖点_JA': 'highlights_ja',
  '卖点_KO': 'highlights_ko',
  '卖点_MS': 'highlights_ms',
  '卖点_NL': 'highlights_nl',
  '卖点_PL': 'highlights_pl',
  '卖点_PT': 'highlights_pt',
  '卖点_RU': 'highlights_ru',
  '卖点_TH': 'highlights_th',
  '卖点_TR': 'highlights_tr',
  '卖点_VI': 'highlights_vi',
  '卖点_ZH': 'highlights_zh',
  '卖点_ZH_CN': 'highlights_zh-CN',
  '卖点_ZH_TW': 'highlights_zh-TW',
  highlights_ar: 'highlights_ar',
  highlights_de: 'highlights_de',
  highlights_en: 'highlights_en',
  highlights_es: 'highlights_es',
  highlights_fil: 'highlights_fil',
  highlights_fr: 'highlights_fr',
  highlights_he: 'highlights_he',
  highlights_id: 'highlights_id',
  highlights_it: 'highlights_it',
  highlights_ja: 'highlights_ja',
  highlights_ko: 'highlights_ko',
  highlights_ms: 'highlights_ms',
  highlights_nl: 'highlights_nl',
  highlights_pl: 'highlights_pl',
  highlights_pt: 'highlights_pt',
  highlights_ru: 'highlights_ru',
  highlights_th: 'highlights_th',
  highlights_tr: 'highlights_tr',
  highlights_vi: 'highlights_vi',
  highlights_zh: 'highlights_zh',
  'highlights_zh-CN': 'highlights_zh-CN',
  'highlights_zh-TW': 'highlights_zh-TW',
  
  // 应用场景多语言
  '应用场景_AR': 'scenarios_ar',
  '应用场景_DE': 'scenarios_de',
  '应用场景_EN': 'scenarios_en',
  '应用场景_ES': 'scenarios_es',
  '应用场景_FIL': 'scenarios_fil',
  '应用场景_FR': 'scenarios_fr',
  '应用场景_HE': 'scenarios_he',
  '应用场景_ID': 'scenarios_id',
  '应用场景_IT': 'scenarios_it',
  '应用场景_JA': 'scenarios_ja',
  '应用场景_KO': 'scenarios_ko',
  '应用场景_MS': 'scenarios_ms',
  '应用场景_NL': 'scenarios_nl',
  '应用场景_PL': 'scenarios_pl',
  '应用场景_PT': 'scenarios_pt',
  '应用场景_RU': 'scenarios_ru',
  '应用场景_TH': 'scenarios_th',
  '应用场景_TR': 'scenarios_tr',
  '应用场景_VI': 'scenarios_vi',
  '应用场景_ZH': 'scenarios_zh',
  '应用场景_ZH_CN': 'scenarios_zh-CN',
  '应用场景_ZH_TW': 'scenarios_zh-TW',
  scenarios_ar: 'scenarios_ar',
  scenarios_de: 'scenarios_de',
  scenarios_en: 'scenarios_en',
  scenarios_es: 'scenarios_es',
  scenarios_fil: 'scenarios_fil',
  scenarios_fr: 'scenarios_fr',
  scenarios_he: 'scenarios_he',
  scenarios_id: 'scenarios_id',
  scenarios_it: 'scenarios_it',
  scenarios_ja: 'scenarios_ja',
  scenarios_ko: 'scenarios_ko',
  scenarios_ms: 'scenarios_ms',
  scenarios_nl: 'scenarios_nl',
  scenarios_pl: 'scenarios_pl',
  scenarios_pt: 'scenarios_pt',
  scenarios_ru: 'scenarios_ru',
  scenarios_th: 'scenarios_th',
  scenarios_tr: 'scenarios_tr',
  scenarios_vi: 'scenarios_vi',
  scenarios_zh: 'scenarios_zh',
  'scenarios_zh-CN': 'scenarios_zh-CN',
  'scenarios_zh-TW': 'scenarios_zh-TW',
  
  // 用法多语言
  '用法_AR': 'usage_ar',
  '用法_DE': 'usage_de',
  '用法_EN': 'usage_en',
  '用法_ES': 'usage_es',
  '用法_FIL': 'usage_fil',
  '用法_FR': 'usage_fr',
  '用法_HE': 'usage_he',
  '用法_ID': 'usage_id',
  '用法_IT': 'usage_it',
  '用法_JA': 'usage_ja',
  '用法_KO': 'usage_ko',
  '用法_MS': 'usage_ms',
  '用法_NL': 'usage_nl',
  '用法_PL': 'usage_pl',
  '用法_PT': 'usage_pt',
  '用法_RU': 'usage_ru',
  '用法_TH': 'usage_th',
  '用法_TR': 'usage_tr',
  '用法_VI': 'usage_vi',
  '用法_ZH': 'usage_zh',
  '用法_ZH_CN': 'usage_zh-CN',
  '用法_ZH_TW': 'usage_zh-TW',
  usage_ar: 'usage_ar',
  usage_de: 'usage_de',
  usage_en: 'usage_en',
  usage_es: 'usage_es',
  usage_fil: 'usage_fil',
  usage_fr: 'usage_fr',
  usage_he: 'usage_he',
  usage_id: 'usage_id',
  usage_it: 'usage_it',
  usage_ja: 'usage_ja',
  usage_ko: 'usage_ko',
  usage_ms: 'usage_ms',
  usage_nl: 'usage_nl',
  usage_pl: 'usage_pl',
  usage_pt: 'usage_pt',
  usage_ru: 'usage_ru',
  usage_th: 'usage_th',
  usage_tr: 'usage_tr',
  usage_vi: 'usage_vi',
  usage_zh: 'usage_zh',
  'usage_zh-CN': 'usage_zh-CN',
  'usage_zh-TW': 'usage_zh-TW'
};

const PRODUCT_FIELD_KEYS = [
  'category',
  'subCategory',
  'model',
  'name',
  'highlights',
  'scenarios',
  'usage',
  'power',
  'throughput',
  'averageTime',
  'launchTime',
  'status',
  'isActive',
  'badge',
  'badgeColor',
  'imageRecognitionKey',
  'packingQuantity',
  'productDimensions',
  'packageDimensions',
  'outerBoxDimensions',
  'packageType',
  'color',
  'netWeight',
  'grossWeight',
  'voltage',
  'frequency',
  'material',
  'warrantyPeriod',
  'certification',
  'temperatureRange',
  'controlMethod',
  'energyEfficiencyGrade',
  'applicablePeople',
  'origin',
  'barcode',
  'referencePrice',
  'minimumOrderQuantity',
  'stockQuantity'
];

function loadSharedFeishuConfig(configPath = FEISHU_CONFIG_PATH) {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8')) || {};
  } catch (err) {
    throw new Error(`Invalid JSON in config file: ${configPath} (${err.message})`);
  }
}

function requestJson(url, method = 'GET', headers = {}, payload = null) {
  return new Promise((resolve, reject) => {
    const body = payload ? JSON.stringify(payload) : null;
    const req = https.request(
      url,
      {
        method,
        headers: {
          ...headers,
          ...(body ? { 'Content-Type': 'application/json; charset=utf-8' } : {})
        }
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf-8');
          if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${raw}`));
            return;
          }
          try {
            resolve(raw ? JSON.parse(raw) : {});
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err.message}`));
          }
        });
      }
    );

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getFeishuTenantToken(appId, appSecret) {
  const tokenResp = await requestJson(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    'POST',
    {},
    { app_id: appId, app_secret: appSecret }
  );
  if (tokenResp.code !== 0 || !tokenResp.tenant_access_token) {
    throw new Error(`Feishu auth failed: ${JSON.stringify(tokenResp)}`);
  }
  return tokenResp.tenant_access_token;
}

function parseQueryParamsFromRawUrl(raw) {
  const result = {};
  const qIndex = raw.indexOf('?');
  if (qIndex < 0) return result;
  const query = raw.slice(qIndex + 1).split('#')[0];
  for (const part of query.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    const key = decodeURIComponent(String(k || '').trim());
    const value = decodeURIComponent(String(v || '').trim());
    if (key) result[key] = value;
  }
  return result;
}

function requestForRedirect(urlString, method = 'HEAD') {
  return new Promise((resolve, reject) => {
    const protocol = String(urlString).startsWith('http://') ? http : https;
    const req = protocol.request(
      urlString,
      {
        method,
        headers: {
          'User-Agent': 'HTML-YuQL-FeishuSync/1.0'
        }
      },
      (res) => {
        resolve({
          statusCode: res.statusCode || 0,
          location: res.headers.location || '',
          finalUrl: urlString
        });
        res.resume();
      }
    );
    req.on('error', reject);
    req.end();
  });
}

async function resolveFinalFeishuUrl(rawUrl, maxHops = 5) {
  let current = String(rawUrl || '').trim();
  if (!/^https?:\/\//i.test(current)) {
    return current;
  }

  for (let i = 0; i < maxHops; i += 1) {
    let resp;
    try {
      resp = await requestForRedirect(current, 'HEAD');
      if ((resp.statusCode || 0) >= 400) {
        resp = await requestForRedirect(current, 'GET');
      }
    } catch (_) {
      return current;
    }

    const code = Number(resp.statusCode || 0);
    const location = String(resp.location || '').trim();
    if (code >= 300 && code < 400 && location) {
      current = new URL(location, current).toString();
      continue;
    }
    return current;
  }

  return current;
}

function parseBitableTarget(sheetRange) {
  const raw = String(sheetRange || '').trim();
  if (!raw) return { appToken: '', tableId: '', viewId: '' };

  if (/^https?:\/\//i.test(raw)) {
    const appTokenMatch = raw.match(/\/base\/([A-Za-z0-9]+)/i);
    const appToken = appTokenMatch?.[1] || '';
    const params = parseQueryParamsFromRawUrl(raw);
    const tableId = params.table || params.table_id || params.tableId || '';
    const viewId = params.view || params.view_id || params.viewId || '';
    return { appToken, tableId, viewId };
  }

  const byPipe = raw.split('|').map((s) => s.trim()).filter(Boolean);
  if (byPipe.length >= 2) {
    return { appToken: '', tableId: byPipe[0], viewId: byPipe[1] };
  }
  return { appToken: '', tableId: raw, viewId: '' };
}

function normalizeBitableValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    const normalized = [];
    for (const item of value) {
      if (item == null) continue;
      if (typeof item === 'object') {
        const text = item.text || item.name || item.link;
        normalized.push(text ? String(text).trim() : JSON.stringify(item));
      } else {
        normalized.push(String(item).trim());
      }
    }
    return normalized.filter(Boolean).join(', ');
  }
  if (typeof value === 'object') {
    const text = value.text || value.name;
    if (text) return String(text).trim();
    return JSON.stringify(value);
  }
  return String(value).trim();
}

async function fetchRowsFromFeishuSheet(appId, appSecret, spreadsheetToken, sheetRange) {
  const token = await getFeishuTenantToken(appId, appSecret);
  const resolvedSheetRange = await resolveFinalFeishuUrl(sheetRange);
  const { appToken, tableId, viewId } = parseBitableTarget(resolvedSheetRange);
  const finalAppToken = String(appToken || spreadsheetToken || '').trim();

  if (!finalAppToken) {
    throw new Error(
      'Missing app token: set spreadsheet_token or use bitable URL containing /base/{app_token}'
    );
  }
  if (!tableId) {
    throw new Error('sheet_range must provide table_id, or use bitable URL with ?table=xxx');
  }

  let pageToken = '';
  const rawRows = [];
  let hasMore = true;

  while (hasMore) {
    const params = new URLSearchParams();
    params.set('page_size', '500');
    if (pageToken) params.set('page_token', pageToken);
    if (viewId) params.set('view_id', viewId);

    const valuesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${finalAppToken}/tables/${tableId}/records?${params.toString()}`;
    const valuesResp = await requestJson(valuesUrl, 'GET', { Authorization: `Bearer ${token}` });
    if (valuesResp.code !== 0) {
      throw new Error(`Feishu bitable read failed: ${JSON.stringify(valuesResp)}`);
    }

    const items = valuesResp.data?.items || [];
    for (const item of items) {
      const fields = item.fields || {};
      const row = {};
      for (const [key, value] of Object.entries(fields)) {
        row[String(key).trim()] = normalizeBitableValue(value);
      }
      if (Object.keys(row).length > 0) {
        rawRows.push(row);
      }
    }

    hasMore = Boolean(valuesResp.data?.has_more);
    if (!hasMore) break;
    pageToken = valuesResp.data?.page_token || '';
    if (!pageToken) break;
  }

  if (rawRows.length === 0) {
    throw new Error('Feishu bitable is empty');
  }

  return rawRows;
}

function fetchRowsFromXlsx(xlsxPath) {
  // Lazy require so Feishu-only flows don't require xlsx parser installation.
  let XLSX;
  try {
    XLSX = require('xlsx');
  } catch (err) {
    throw new Error('Missing dependency: please install `xlsx` package to read local xlsx files.');
  }

  if (!fs.existsSync(xlsxPath)) {
    throw new Error(`XLSX file not found: ${xlsxPath}`);
  }

  const workbook = XLSX.readFile(xlsxPath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel is empty');
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows || rows.length === 0) {
    throw new Error('Excel is empty');
  }

  const headers = rows[0].map((h) => (h == null ? '' : String(h).trim()));
  const rawRows = rows
    .slice(1)
    .filter((row) => Array.isArray(row) && row.some((cell) => String(cell || '').trim() !== ''))
    .map((row) => {
      const obj = {};
      for (let i = 0; i < headers.length; i += 1) {
        const key = headers[i];
        obj[key] = i >= row.length || row[i] == null ? '' : String(row[i]).trim();
      }
      return obj;
    });

  return { rawRows, sheetTitle: sheetName };
}

function toNullableString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function toBooleanOrDefault(value, defaultValue = true) {
  if (value == null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return true;

  const text = String(value).trim();
  if (!text) return defaultValue;
  if (text === 'false' || text === 'False' || text === 'FALSE' || text === '否') {
    return false;
  }
  return true;
}

function compactRow(rawRow) {
  const normalized = {};
  for (const [key, value] of Object.entries(rawRow || {})) {
    const rawKey = String(key || '').trim();

    // 支持形如 "字段_LANG" 或 "字段 LANG" 的多语言列名映射。
    // 例如："产品名称_EN" -> "name_en"（如果 ALIAS 中包含产品名称 -> name 的映射）
    let normalizedKey = rawKey;
    const langMatch = rawKey.match(/^(.+?)[_\s]([A-Za-z0-9-]+)$/);
    if (langMatch) {
      const baseRaw = langMatch[1].trim();
      const langPart = langMatch[2].trim();
      // 规范化语言码：保持 language 小写，region（如 CN/TW）大写，使用 '-' 连接
      const langNorm = (function(lp) {
        const replaced = String(lp || '').replace('_', '-');
        const parts = replaced.split('-');
        if (parts.length === 1) return parts[0].toLowerCase();
        return parts[0].toLowerCase() + '-' + String(parts[1] || '').toUpperCase();
      })(langPart);

      // 先尝试直接从 ALIAS 映射中文/别名到字段名
      const baseMapped = ALIAS[baseRaw] || ALIAS[baseRaw.toLowerCase()] || ALIAS[baseRaw.toUpperCase()];
      if (baseMapped) {
        normalizedKey = `${baseMapped}_${langNorm}`;
      } else {
        // 如果没有找到 alias，则保留原始 base 并附加语言后缀
        normalizedKey = `${baseRaw}_${langNorm}`;
      }
    } else {
      normalizedKey = ALIAS[rawKey] || rawKey;
    }

    normalized[normalizedKey] = value == null ? '' : String(value).trim();
  }
  return normalized;
}

function parseRowsToSeries(rawRows) {
  const seriesMap = new Map();
  const SUPPORTED_LANGS = ['ar', 'de', 'en', 'es', 'fil', 'fr', 'he', 'id', 'it', 'ja', 'ko', 'ms', 'nl', 'pl', 'pt', 'ru', 'th', 'tr', 'vi', 'zh', 'zh-CN', 'zh-TW'];

  

  for (const row of rawRows || []) {
    const n = compactRow(row);
    const category = toNullableString(n.category);
    if (!category) continue;

    if (!seriesMap.has(category)) {
      seriesMap.set(category, []);
    }

    const product = {};
    for (const field of PRODUCT_FIELD_KEYS) {
      product[field] = null;
    }

    product.category = category;
    product.subCategory = toNullableString(n.subCategory);
    product.model = toNullableString(n.model);
    
    // 提取多语言字段：对 PRODUCT_FIELD_KEYS 中的每个字段，生成 `${field}I18n` 对象（若有多语言列）
    for (const f of PRODUCT_FIELD_KEYS) {
      product[`${f}I18n`] = {};
    }

    // 若表格只提供基础中文列（例如 name/highlights），默认写入 zh-CN 源文案。
    for (const f of PRODUCT_FIELD_KEYS) {
      const baseVal = toNullableString(n[f]);
      if (baseVal) {
        product[`${f}I18n`]['zh-CN'] = baseVal;
      }
    }

    for (const lang of SUPPORTED_LANGS) {
      for (const f of PRODUCT_FIELD_KEYS) {
        const val = toNullableString(n[`${f}_${lang}`]);
        if (val) product[`${f}I18n`][lang] = val;
      }
    }

    // 生成 i18nId（每个产品唯一），前端将使用 i18nId.field 的方式查找翻译
    product.i18nId = (function(cat, sub, mod) {
      const baseParts = [
        String(cat || '').trim().replace(/\s+/g, '_'),
        String(sub || '').trim().replace(/\s+/g, '_'),
        String(mod || '').trim().replace(/\s+/g, '_')
      ].filter(Boolean);
      const base = baseParts.join('_').toLowerCase();
      const hash = base ? crypto.createHash('sha1').update(base, 'utf8').digest('hex').slice(0, 8) : 'unknown';
      return hash;
    })(category, product.subCategory, product.model);

    // 将各 fieldI18n 整理到单一子结构 product.i18n 中，便于区分与后续处理
    product.i18n = product.i18n || {};
    for (const f of PRODUCT_FIELD_KEYS) {
      const key = `${f}I18n`;
      const map = product[key];
      if (map && typeof map === 'object' && Object.keys(map).length > 0) {
        product.i18n[f] = map;
      }
      // 清理临时 fieldI18n 属性
      delete product[key];
    }

    // 将 i18nId 同步到子对象以便后续读取
    product.i18n.id = product.i18nId;

    // 清空原单语言字段（不再存储文本，用 i18nId + i18n 对象替代）
    // 保留 `model` 和 `subCategory` 原始值，以便后续使用或核对
    for (const f of PRODUCT_FIELD_KEYS) {
      if (f === 'category' || f === 'model' || f === 'subCategory') continue;
      product[f] = null;
    }

    // 其他字段继续处理（非i18n字段）
    product.power = toNullableString(n.power);
    product.throughput = toNullableString(n.throughput);
    product.averageTime = toNullableString(n.averageTime);
    product.launchTime = toNullableString(n.launchTime);
    product.status = toNullableString(n.status) || '在售';
    product.isActive = toBooleanOrDefault(n.isActive, true);
    product.badge = toNullableString(n.badge);
    product.badgeColor = toNullableString(n.badgeColor);
    product.imageRecognitionKey = toNullableString(n.imageRecognitionKey);
    product.packingQuantity = toNullableString(n.packingQuantity);
    product.productDimensions = toNullableString(n.productDimensions);
    product.packageDimensions = toNullableString(n.packageDimensions);
    product.outerBoxDimensions = toNullableString(n.outerBoxDimensions);
    product.packageType = toNullableString(n.packageType);
    product.color = toNullableString(n.color);
    product.netWeight = toNullableString(n.netWeight);
    product.grossWeight = toNullableString(n.grossWeight);
    product.voltage = toNullableString(n.voltage);
    product.frequency = toNullableString(n.frequency);
    product.material = toNullableString(n.material);
    product.warrantyPeriod = toNullableString(n.warrantyPeriod);
    product.certification = toNullableString(n.certification);
    product.temperatureRange = toNullableString(n.temperatureRange);
    product.controlMethod = toNullableString(n.controlMethod);
    product.energyEfficiencyGrade = toNullableString(n.energyEfficiencyGrade);
    product.applicablePeople = toNullableString(n.applicablePeople);
    product.origin = toNullableString(n.origin);
    product.barcode = toNullableString(n.barcode);
    product.referencePrice = toNullableString(n.referencePrice);
    product.minimumOrderQuantity = toNullableString(n.minimumOrderQuantity);
    product.stockQuantity = toNullableString(n.stockQuantity);

    seriesMap.get(category).push(product);
  }

  return Array.from(seriesMap.entries()).map(([category, products]) => ({ category, products }));
}

function writeJs(seriesList, outPath, sourceLabel) {
  let content = `// 产品数据表（由 ${sourceLabel} 自动生成）\n`;
  content += 'export const PRODUCT_DATA_TABLE = ';
  content += JSON.stringify(seriesList, null, 2);
  content += ';\n';
  fs.writeFileSync(outPath, content, 'utf-8');
}

function readProductDataTableSeries(tablePath = PRODUCT_TABLE_PATH) {
  if (!fs.existsSync(tablePath)) return [];
  const content = fs.readFileSync(tablePath, 'utf-8');
  const match = content.match(/export const PRODUCT_DATA_TABLE\s*=\s*(\[.*\])\s*;/s);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return [];
  }
}

function readAppendedSeriesFromProductList(productListPath = PRODUCT_LIST_PATH) {
  if (!fs.existsSync(productListPath)) return [];
  const content = fs.readFileSync(productListPath, 'utf-8');
  const start = content.indexOf(APPEND_START);
  const end = content.indexOf(APPEND_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('product-list.js is missing FEISHU append markers');
  }

  const block = content.slice(start, end);
  const match = block.match(/export const APPENDED_PRODUCT_SERIES\s*=\s*(\[.*\])\s*;/s);
  if (!match) return [];
  try {
    return JSON.parse(match[1]);
  } catch (_) {
    return [];
  }
}

function productIdentityKey(product) {
  const category = String(product?.category || '').trim();
  const subCategory = String(product?.subCategory || '').trim();
  const model = String(product?.model || '').trim();
  const nameFallback = String(
    product?.name ||
    product?.i18n?.name?.['zh-CN'] ||
    product?.i18n?.name?.zh ||
    product?.i18n?.name?.['zh_CN'] ||
    ''
  ).trim();
  const identity = model || nameFallback;
  return `${category}::${subCategory}::${identity}`;
}

function hasValidProductIdentity(product) {
  return Boolean(
    String(product?.category || '').trim() &&
    (
      String(product?.subCategory || '').trim() ||
      String(product?.model || '').trim() ||
      String(
        product?.name ||
        product?.i18n?.name?.['zh-CN'] ||
        product?.i18n?.name?.zh ||
        product?.i18n?.name?.['zh_CN'] ||
        ''
      ).trim()
    )
  );
}

function mergeSeriesAppend(existingSeries, incomingSeries) {
  const merged = new Map();

  for (const series of existingSeries || []) {
    const category = String(series?.category || '').trim();
    if (!category) continue;
    merged.set(category, {
      category,
      products: Array.isArray(series.products) ? [...series.products] : []
    });
  }

  let appendedCount = 0;
  let updatedCount = 0;

  for (const incoming of incomingSeries || []) {
    const category = String(incoming?.category || '').trim();
    if (!category) continue;

    if (!merged.has(category)) {
      merged.set(category, { category, products: [] });
    }

    const target = merged.get(category);
    const indexMap = new Map();
    target.products.forEach((product, idx) => {
      if (!hasValidProductIdentity(product)) return;
      indexMap.set(productIdentityKey(product), idx);
    });

    for (const product of incoming.products || []) {
      const pid = hasValidProductIdentity(product) ? productIdentityKey(product) : null;

      if (pid && indexMap.has(pid)) {
        const idx = indexMap.get(pid);
        const before = target.products[idx];
        const after = { ...before, ...product };
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          target.products[idx] = after;
          updatedCount += 1;
        }
      } else {
        // Append incoming product even if it lacks a full identity
        target.products.push(product);
        if (pid) indexMap.set(pid, target.products.length - 1);
        appendedCount += 1;
      }
    }
  }

  return {
    series: Array.from(merged.values()),
    appendedCount,
    updatedCount
  };
}

function validateAndCleanSeries(seriesList, { dropIncomplete = true, source = 'unknown' } = {}) {
  const warnings = [];
  const cleaned = [];
  let droppedProducts = 0;

  for (const series of seriesList || []) {
    const category = String(series?.category || '').trim();
    if (!category) {
      warnings.push(`[quality] empty category series found in ${source}, dropped`);
      continue;
    }

    const products = [];
    for (const product of series.products || []) {
      if (hasValidProductIdentity(product)) {
        products.push(product);
        continue;
      }

      const subCategory = String(product?.subCategory || '').trim();
      const model = String(product?.model || '').trim();
      const name = String(product?.name || '').trim();
      warnings.push(
        `[quality] incomplete identity dropped in ${source}: category=${category}, subCategory=${subCategory || '-'}, model=${model || '-'}, name=${name || '-'}`
      );
      if (dropIncomplete) {
        droppedProducts += 1;
      } else {
        products.push(product);
      }
    }

    cleaned.push({ category, products });
  }

  return {
    series: cleaned,
    warnings,
    droppedProducts
  };
}

function printQualityWarnings(title, report) {
  if (!report || !Array.isArray(report.warnings) || report.warnings.length === 0) return;
  console.warn(`[quality] ${title}: ${report.warnings.length} warning(s), dropped=${report.droppedProducts || 0}`);
  report.warnings.slice(0, 50).forEach((line) => console.warn(line));
  if (report.warnings.length > 50) {
    console.warn(`[quality] ... ${report.warnings.length - 50} more warning(s) omitted`);
  }
}

function writeAppendedSeriesToProductList(seriesList, productListPath = PRODUCT_LIST_PATH) {
  const content = fs.readFileSync(productListPath, 'utf-8');
  const start = content.indexOf(APPEND_START);
  const end = content.indexOf(APPEND_END);
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('product-list.js is missing FEISHU append markers');
  }

  const replacement = `${APPEND_START}\nexport const APPENDED_PRODUCT_SERIES = ${JSON.stringify(seriesList, null, 2)};\n`;
  const newContent = content.slice(0, start) + replacement + content.slice(end);
  fs.writeFileSync(productListPath, newContent, 'utf-8');
}

function writeProductDataTableSeries(seriesList, tablePath = PRODUCT_TABLE_PATH) {
  const header = '// 产品数据表（由增量同步自动更新）\n';
  const body = `export const PRODUCT_DATA_TABLE = ${JSON.stringify(seriesList, null, 2)};\n`;
  fs.writeFileSync(tablePath, header + body, 'utf-8');
}

function buildFeishuConfigFromEnv() {
  const fileConfig = loadSharedFeishuConfig();
  return {
    appId: process.env.FEISHU_APP_ID || fileConfig.app_id || '',
    appSecret: process.env.FEISHU_APP_SECRET || fileConfig.app_secret || '',
    spreadsheetToken: process.env.FEISHU_SPREADSHEET_TOKEN || fileConfig.spreadsheet_token || '',
    sheetRange: process.env.FEISHU_SHEET_RANGE || fileConfig.sheet_range || '',
    productListPath: process.env.FEISHU_SYNC_PRODUCT_LIST_PATH || PRODUCT_LIST_PATH,
    productTablePath: process.env.FEISHU_SYNC_TABLE_PATH || PRODUCT_TABLE_PATH
  };
}

function validateFeishuConfig(config) {
  if (!config || !config.appId || !config.appSecret || !config.sheetRange) {
    return false;
  }
  const parsed = parseBitableTarget(config.sheetRange);
  const hasAppToken = Boolean(config.spreadsheetToken || parsed.appToken);
  return Boolean(hasAppToken && parsed.tableId);
}

async function syncFeishuToProductList(config) {
  const rows = await fetchRowsFromFeishuSheet(
    config.appId,
    config.appSecret,
    config.spreadsheetToken,
    config.sheetRange
  );
  const incomingRaw = parseRowsToSeries(rows);
  const qualityReport = validateAndCleanSeries(incomingRaw, {
    dropIncomplete: true,
    source: 'feishu:product-list'
  });
  printQualityWarnings('feishu:product-list', qualityReport);
  const incomingSeries = qualityReport.series;
  const existingSeries = readAppendedSeriesFromProductList(config.productListPath || PRODUCT_LIST_PATH);
  const merged = mergeSeriesAppend(existingSeries, incomingSeries);
  writeAppendedSeriesToProductList(merged.series, config.productListPath || PRODUCT_LIST_PATH);
  return {
    rows: rows.length,
    series: merged.series.length,
    appended: merged.appendedCount,
    updated: merged.updatedCount
  };
}

async function syncFeishuToProductDataTable(config) {
  const rows = await fetchRowsFromFeishuSheet(
    config.appId,
    config.appSecret,
    config.spreadsheetToken,
    config.sheetRange
  );
  const incomingRaw = parseRowsToSeries(rows);
  const qualityReport = validateAndCleanSeries(incomingRaw, {
    dropIncomplete: true,
    source: 'feishu:product-table'
  });
  printQualityWarnings('feishu:product-table', qualityReport);
  const incomingSeries = qualityReport.series;
  const existingSeries = readProductDataTableSeries(config.productTablePath || PRODUCT_TABLE_PATH);
  const merged = mergeSeriesAppend(existingSeries, incomingSeries);
  writeProductDataTableSeries(merged.series, config.productTablePath || PRODUCT_TABLE_PATH);
  return {
    rows: rows.length,
    series: merged.series.length,
    appended: merged.appendedCount,
    updated: merged.updatedCount
  };
}

async function runFeishuSyncOnce({ syncTo = 'product-table' } = {}) {
  const config = buildFeishuConfigFromEnv();
  if (!validateFeishuConfig(config)) {
    return { skipped: true, reason: 'missing env config' };
  }

  const result = {};
  if (syncTo === 'product-list' || syncTo === 'both') {
    result.productList = await syncFeishuToProductList(config);
  }
  if (syncTo === 'product-table' || syncTo === 'both') {
    result.productTable = await syncFeishuToProductDataTable(config);
  }
  return { skipped: false, ...result };
}

function msUntilNext4am(now = new Date()) {
  const next = new Date(now);
  next.setHours(4, 0, 0, 0);
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }
  return next.getTime() - now.getTime();
}

function scheduleDaily4amSync(task) {
  function scheduleNext() {
    const delay = msUntilNext4am();
    setTimeout(async () => {
      try {
        await task();
      } catch (err) {
        console.error('[feishu-sync] daily task failed:', err.message);
      }
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}

function startDailyFeishuSyncScheduler() {
  scheduleDaily4amSync(async () => {
    const result = await runFeishuSyncOnce();
    if (result.skipped) {
      console.log('[feishu-sync] skipped daily run:', result.reason);
      return;
    }
    console.log('[feishu-sync] synced at 04:00:', JSON.stringify(result));
  });
}

function parseCliArgs(argv = process.argv.slice(2)) {
  const shared = loadSharedFeishuConfig();
  const args = {
    source: 'feishu',
    xlsxPath: 'scripts/products-table.xlsx',
    outPath: 'src/assets/product-data-table.js',
    feishuAppId: process.env.FEISHU_APP_ID || shared.app_id || '',
    feishuAppSecret: process.env.FEISHU_APP_SECRET || shared.app_secret || '',
    spreadsheetToken: process.env.FEISHU_SPREADSHEET_TOKEN || shared.spreadsheet_token || '',
    sheetRange: process.env.FEISHU_SHEET_RANGE || shared.sheet_range || ''
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const value = argv[i + 1];
    if (token === '--source' && value) {
      args.source = value;
      i += 1;
    } else if (token === '--xlsx-path' && value) {
      args.xlsxPath = value;
      i += 1;
    } else if (token === '--out-path' && value) {
      args.outPath = value;
      i += 1;
    } else if (token === '--feishu-app-id' && value) {
      args.feishuAppId = value;
      i += 1;
    } else if (token === '--feishu-app-secret' && value) {
      args.feishuAppSecret = value;
      i += 1;
    } else if (token === '--spreadsheet-token' && value) {
      args.spreadsheetToken = value;
      i += 1;
    } else if (token === '--sheet-range' && value) {
      args.sheetRange = value;
      i += 1;
    }
  }

  return args;
}

async function generateProductDataTable(args = parseCliArgs()) {
  const outPath = path.resolve(process.cwd(), args.outPath);
  let rawRows;
  let sourceLabel;

  if (args.source === 'xlsx') {
    const xlsxPath = path.resolve(process.cwd(), args.xlsxPath);
    const xlsxData = fetchRowsFromXlsx(xlsxPath);
    rawRows = xlsxData.rawRows;
    sourceLabel = args.xlsxPath;
    console.log(`sheet=${xlsxData.sheetTitle}`);
  } else if (args.source === 'feishu') {
    if (!args.feishuAppId || !args.feishuAppSecret) {
      throw new Error('Missing feishu app credentials: --feishu-app-id/--feishu-app-secret');
    }
    if (!args.sheetRange) {
      throw new Error('Missing feishu sheet config: --sheet-range');
    }

    const parsed = parseBitableTarget(args.sheetRange);
    if (!parsed.tableId) {
      throw new Error('sheet_range must provide table_id, or use URL with ?table=xxx');
    }
    if (!args.spreadsheetToken && !parsed.appToken) {
      throw new Error(
        'Missing app token: provide --spreadsheet-token or use URL containing /base/{app_token}'
      );
    }

    rawRows = await fetchRowsFromFeishuSheet(
      args.feishuAppId,
      args.feishuAppSecret,
      args.spreadsheetToken,
      args.sheetRange
    );
    sourceLabel = 'Feishu Sheet';
  } else {
    throw new Error(`Invalid --source value: ${args.source}`);
  }

  // 直接按照最新规则生成产品数据表：不做向后兼容的合并/追加操作
  const incomingSeries = parseRowsToSeries(rawRows);
  const qualityReport = validateAndCleanSeries(incomingSeries, {
    dropIncomplete: true,
    source: args.source
  });
  printQualityWarnings(`cli:${args.source}`, qualityReport);

  // 清理并规范化输出：删除遗留 *Key 字段，清空单语言字段，由 translations 提供多语言文本
  function cleanSeriesForOutput(seriesList) {
    return (seriesList || []).map((series) => ({
      category: series.category,
      products: (series.products || []).map((prod) => {
        const p = Object.assign({}, prod);

        // 删除所有以 Key 结尾的遗留字段（例如 nameKey、highlightsKey）
        for (const k of Object.keys(p)) {
          if (k.endsWith('Key')) delete p[k];
        }

        // 对于需要 i18n 的字段，确保原单语言字段被清空（由 translations 提供）
        for (const f of ['name', 'highlights', 'scenarios', 'usage']) {
          if (Object.prototype.hasOwnProperty.call(p, f)) p[f] = null;
        }

        // 明确保留原始标识字段与分类
        p.model = prod.model;
        p.subCategory = prod.subCategory;
        p.category = series.category;

        // 确保 product.i18n 存在，且包含 i18nId（已经在 parseRowsToSeries 中生成）
        if (!p.i18n || typeof p.i18n !== 'object') p.i18n = {};
        if (!p.i18n.id && p.i18nId) p.i18n.id = p.i18nId;

        return p;
      })
    }));
  }

  const cleanedSeries = cleanSeriesForOutput(qualityReport.series);
  writeJs(cleanedSeries, outPath, sourceLabel);

  console.log('rows=' + rawRows.length);
  console.log('series=' + cleanedSeries.map((s) => s.category).join(','));
  console.log('appended=0');
  console.log('updated=0');
  console.log('written=' + outPath);
}

const feishuProTables = {
  loadSharedFeishuConfig,
  fetchRowsFromXlsx,
  fetchRowsFromFeishuSheet,
  parseRowsToSeries,
  readProductDataTableSeries,
  readAppendedSeriesFromProductList,
  mergeSeriesAppend,
  validateAndCleanSeries,
  writeJs,
  generateProductDataTable,
  parseCliArgs,
  syncFeishuToProductList,
  syncFeishuToProductDataTable,
  runFeishuSyncOnce,
  startDailyFeishuSyncScheduler,
  buildFeishuConfigFromEnv,
  validateFeishuConfig,
  parseBitableTarget,
  resolveFinalFeishuUrl
};

module.exports = {
  feishuProTables,
  ...feishuProTables
};

if (require.main === module) {
  generateProductDataTable(parseCliArgs()).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}