#!/usr/bin/env node

/**
 * unified-translator.js
 *
 * 翻译适配器，支持两个独立的翻译引擎：
 *
 * ── 引擎 A：中科网（scnet.cn） + Qwen3-30B ──────────────────────────────────
 * - API: api.scnet.cn/api/llm/v1（OpenAI 兼容）
 * - 支持所有 21 种目标语言（含 Hebrew/Malay）
 * - 适合通用翻译，使用全局并发信号量，20语言全并发
 *
 * ── 引擎 B：硅基流动（SiliconFlow） + Hunyuan-MT-7B ─────────────────────────
 * - API: api.siliconflow.cn/v1（OpenAI 兼容）
 * - 腾讯混元专用翻译模型，WMT2025 拿下 30 项冠军
 * - ⚠️  语言支持：33 种，但不含 Hebrew(he) 和 Malay(ms)
 *   → 这 2 种语言自动降级到引擎 A（scnet）处理
 * - 支持语言：zh, en, fr, es, de, it, pt, ru, nl, pl, tr, ar,
 *             ja, ko, vi, th, id, fil(tl), zh-TW 等
 *
 * ── 共用工具 ────────────────────────────────────────────────────────────────
 * - splitJsonIntoChunks / splitTextIntoChunks（两引擎均可调用）
 * - Semaphore（可复用的全局并发控制）
 *
 * 主要特性：
 * 1. 两引擎完全独立，互不干扰，可单独调用或对比测试
 * 2. Promise.race 硬超时，防止请求永久挂起
 * 3. 分级重试：区分可重试（429/5xx/timeout）与不可重试（400/413）
 * 4. 响应完整性校验：finish_reason、内容长度、空返回
 * 5. JSON 感知拆分：按键值对单位拆分，保证字段语义完整
 * 6. LANGUAGE_NAMES 从 src/lang-registry.js 统一管理
 */

'use strict';

const https = require('https');
const fs   = require('fs');
const path = require('path');
const { getEnglishNames } = require(path.join(__dirname, '../src/lang-registry'));

// 自动加载 .env 文件（优先级低于已存在的环境变量）
// 不依赖 dotenv 包，直接手动解析，保持零外部依赖
(function loadDotEnv() {
  const envFile = path.join(__dirname, '../.env');
  if (!fs.existsSync(envFile)) return;
  try {
    const lines = fs.readFileSync(envFile, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !(key in process.env)) {
        process.env[key] = val;
      }
    }
  } catch (err) {
    // 读取失败时静默跳过
    console.error(`❌ Error loading .env file: ${err.message}`);
  }
})();

// ─────────────────────────────────────────────
// 语言映射（英文名称，供 Prompt 使用）
// 由 src/lang-registry.js 统一管理，此处直接派生
// ─────────────────────────────────────────────
const LANGUAGE_NAMES = getEnglishNames();

// ─────────────────────────────────────────────
// 全局配置
// ─────────────────────────────────────────────
const CONFIG = {
  // ── 引擎 A：中科网 Qwen3-30B ────────────────────────────────────────────────
  scnet: {
    apiBase:    'api.scnet.cn',
    apiPath:    '/api/llm/v1/chat/completions',
    // 支持多 Key 池：SCNET_API_KEY_1, SCNET_API_KEY_2, ... 或 SCNET_API_KEY（单Key兼容）
    // 由 buildKeyPool('scnet') 在运行时解析，此处留空占位
    apiKey:     process.env.SCNET_API_KEY || '',
    // Qwen3-30B-A3B-Instruct-2507：
    //   - 256K 上下文，可大批量打包翻译，大幅减少请求次数
    //   - 指令模型无思维链，输出干净
    //   - MOE 架构速度快，¥0.5/M 输出价格最优
    model:      'Qwen3-30B-A3B-Instruct-2507',
    // 硬超时：批量翻译时响应较慢，适当延长
    requestTimeout: 180000,
    // socket 超时（连接/读取）—— 并发降低后排队减少，但峰值 RTT 仍可能偏高
    socketTimeout:  150000,
    maxRetries:     2,
    retryBaseDelay: 2000,   // 基础重试延迟（ms），指数退避
    // 批量翻译分组：每组 25 条（减小分组提升 JSON 解析成功率，组数增加由并发补偿）
    maxChunkKeys:   25,     // JSON 模式：单次最多 25 个键值对
    maxChunkChars:  2500,   // 纯文本模式：单块最大字符数
    // 并发控制（基准值；实际全局并发 = keyPool数 × perKeyGlobalConcurrency）
    // ↓ 从 20 降到 8：3Key×8=24 全局并发，降低 Qwen3-30B JSON 截断率
    chunkConcurrency:    8,  // 同一语言内同时并发的 chunk 数
    perKeyGlobalConcurrency: 8, // 单 Key 并发上限（防触发限速）
    // 响应校验
    minResponseRatio: 0.05,
    maxResponseRatio: 20,
  },

  // ── 引擎 B：硅基流动 Hunyuan-MT-7B ──────────────────────────────────────────
  // 腾讯混元专用翻译模型，WMT2025 比赛 30 项冠军
  // ⚠️  不支持 Hebrew(he) 和 Malay(ms)，这两种语言调用方需降级到 scnet
  hunyuan: {
    apiBase:    'api.siliconflow.cn',
    apiPath:    '/v1/chat/completions',
    // 支持多 Key 池：SILICONFLOW_API_KEY_1, SILICONFLOW_API_KEY_2, ... 或 SILICONFLOW_API_KEY
    apiKey:     process.env.SILICONFLOW_API_KEY || '',
    model:      'tencent/Hunyuan-MT-7B',
    // 翻译专用模型响应快，超时可以设短一些
    // ↑ 并发降低后排队减少，峰值 RTT 仍可能 >60s，延长至 120s
    requestTimeout: 150000,
    socketTimeout:  120000,
    maxRetries:     2,
    retryBaseDelay: 2000,
    // 分组大小：25 keys/组，降低 JSON 解析失败率
    maxChunkKeys:   25,
    maxChunkChars:  2500,
    // 并发控制（实际全局并发 = keyPool数 × perKeyGlobalConcurrency）
    // ↓ 从 10 降到 3：5Key×3=15 全局并发，RTT≈12s → ~1.25 req/s/Key，对应 RPM≈75
    chunkConcurrency:    3,
    perKeyGlobalConcurrency: 3, // 单 Key 并发上限（SiliconFlow 免费档 RPM ~60）
    // 响应校验
    minResponseRatio: 0.05,
    maxResponseRatio: 20,
    // Hunyuan-MT-7B 不支持的语言代码（需降级到 scnet 处理）
    // 完整支持语言：zh, en, fr, es, de, it, pt, ru, nl, pl, tr, ar,
    //               ja, ko, vi, th, id, fil(tl), zh-TW 等 33+ 种
    unsupportedLangs: new Set(['he', 'ms']),
  },
};

// 不可重试的 HTTP 状态码（重试也没用）
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 413, 422]);

// ─────────────────────────────────────────────
// Key 池：从环境变量解析多 Key，支持轮转
//
// 环境变量命名规则（两种格式均支持）：
//   单 Key：SCNET_API_KEY / SILICONFLOW_API_KEY
//   多 Key：SCNET_API_KEY_1, SCNET_API_KEY_2, ...
//           SILICONFLOW_API_KEY_1, SILICONFLOW_API_KEY_2, ...
//
// 轮转策略：原子计数器取模（round-robin），跨并发线程安全
// ─────────────────────────────────────────────
function buildKeyPool(engine) {
  const prefix = engine === 'scnet' ? 'SCNET_API_KEY' : 'SILICONFLOW_API_KEY';
  const keys   = [];

  // 先收集带编号的 Key（_1, _2, ...）
  for (let i = 1; i <= 20; i++) {
    const k = process.env[`${prefix}_${i}`];
    if (k && k.trim() && !k.startsWith('<') && k !== 'YOUR_API_KEY' && k.length >= 20) {
      keys.push(k.trim());
    }
  }

  // 如果没有带编号的，回退到不带编号的单 Key
  if (keys.length === 0) {
    const single = process.env[prefix] || CONFIG[engine].apiKey || '';
    if (single && !single.startsWith('<') && single !== 'YOUR_API_KEY' && single.length >= 20) {
      keys.push(single.trim());
    }
  }

  if (keys.length === 0) {
    // 返回一个空池，调用时会在 validate 阶段报错
    return { keys: [], next: () => '' };
  }

  let counter = 0;
  return {
    keys,
    /** 取下一个 Key（round-robin） */
    next() {
      const key = keys[counter % keys.length];
      counter++;
      return key;
    },
    size: keys.length,
  };
}

// 运行时初始化 Key 池
const scnetKeyPool   = buildKeyPool('scnet');
const hunyuanKeyPool = buildKeyPool('hunyuan');

// 打印 Key 池状态（仅显示 Key 数量，不泄漏内容）
console.log(
  `[KeyPool] scnet: ${scnetKeyPool.size} key(s)  |  hunyuan: ${hunyuanKeyPool.size} key(s)`
);

// ─────────────────────────────────────────────
// 全局并发信号量（可复用，两引擎各自独立实例化）
// 实际并发上限 = keyPool.size × perKeyGlobalConcurrency
// ─────────────────────────────────────────────
class Semaphore {
  constructor(max) {
    this._max     = max;
    this._running = 0;
    this._queue   = [];
  }
  acquire() {
    return new Promise(resolve => {
      if (this._running < this._max) {
        this._running++;
        resolve();
      } else {
        this._queue.push(resolve);
      }
    });
  }
  release() {
    this._running--;
    if (this._queue.length > 0) {
      this._running++;
      this._queue.shift()();
    }
  }
  async run(fn) {
    await this.acquire();
    try { return await fn(); } finally { this.release(); }
  }
}

// 引擎 A（scnet）信号量 —— Key 数 × 单Key并发
const scnetGlobalConcurrency   = scnetKeyPool.size   * CONFIG.scnet.perKeyGlobalConcurrency;
const hunyuanGlobalConcurrency = hunyuanKeyPool.size * CONFIG.hunyuan.perKeyGlobalConcurrency;
const scnetSemaphore   = new Semaphore(Math.max(scnetGlobalConcurrency,   CONFIG.scnet.perKeyGlobalConcurrency));
const hunyuanSemaphore = new Semaphore(Math.max(hunyuanGlobalConcurrency, CONFIG.hunyuan.perKeyGlobalConcurrency));

console.log(
  `[Semaphore] scnet 全局并发: ${scnetSemaphore._max}  |  hunyuan 全局并发: ${hunyuanSemaphore._max}`
);

// ─────────────────────────────────────────────
// 工具函数：判断一个字段值是否"无需翻译"
//
// 判定规则：去除数字、SI 单位字母、常见符号后若无剩余有意义字符，
// 则认为该值仅由规格数据构成（电压、功率、尺寸、频率等），
// 模型不应对其做任何修改。
//
// 示例命中：'380V / 50Hz / 18kW'、'220V ± 10%'、
//           '1200mm × 800mm × 1600mm'、'50/60 Hz'
// ─────────────────────────────────────────────
function isUntranslatable(text) {
  const stripped = String(text)
    // 去除数字与常见数学/规格符号
    .replace(/[\d\s.~±×/×%°+\-–—·]/g, '')
    // 去除 SI 单位字母及常见缩写（顺序：长的先匹配）
    .replace(/\b(kW|kVA|kvar|kWh|kHz|MHz|GHz|rpm|mm|cm|dm|km|kg|kN|kPa|kOhm|mA|mV|mW|ms|Hz|kW|VA|VDC|VAC|AC|DC|IP\d+)\b/gi, '')
    .replace(/[VvWwKkHzMmGgCcLlAaOoPpSsSΩ℃℉]+/g, '')
    .trim();
  return stripped.length === 0;
}

// ─────────────────────────────────────────────
// 后处理：将翻译结果中被模型意外修改的纯规格字段还原为原文
//
// 调用时机：JSON 批量翻译结果解析成功后、写回前
// 作用：即使 System Prompt 强调了不翻译单位，模型（尤其针对阿拉伯语）
//       仍可能把 "Hz" 译为 "هرتز"，此函数强制用原值覆盖。
// ─────────────────────────────────────────────
function restoreUntranslatableFields(parsed, group) {
  const restored = [];
  for (const k of Object.keys(group)) {
    if (isUntranslatable(group[k]) && parsed[k] !== group[k]) {
      restored.push(k);
      parsed[k] = group[k];
    }
  }
  if (restored.length > 0) {
    console.log(`  [PostProcess] 还原纯规格字段 ${restored.length} 个: ${restored.join(', ')}`);
  }
  return parsed;
}

// ─────────────────────────────────────────────
// System Prompt（scnet / Qwen3-30B）
//
// 说明：
//  - 产品数据翻译专用，保留专业厨具参数词汇原文或通用格式
//  - 温度固定 0.3（在 callScnetAPI 中设置），保证翻译准确性
// ─────────────────────────────────────────────
function buildSystemPrompt(targetLang) {
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;
  return (
    'You are a professional translator specializing in commercial kitchen and food processing equipment. ' +
    'Translate the following content into ' + langName + '. ' +
    'Rules:\n' +
    '1. Output ONLY the translated text. Do NOT add explanations, notes, or repeat the original.\n' +
    '2. Preserve ALL formatting: punctuation, line breaks, semicolons, numbers, units (kW, kg, mm, °C, V, Hz).\n' +
    '3. Keep brand names, model numbers, and technical parameters (e.g. "304 stainless steel", "CE/UL certified") unchanged or use their standard localized form.\n' +
    '4. CRITICAL: Technical specification values containing only numbers, SI units, and symbols (e.g. "380V / 50Hz / 18kW", "220V ± 10%", "1200mm × 800mm × 1600mm", "50/60 Hz") MUST be kept exactly as-is. Do NOT translate, transliterate, or substitute any unit symbols (V, Hz, kW, mm, kg, etc.) with local-language equivalents.\n' +
    '5. If the input is a JSON object, return a valid JSON object with the same keys and translated values.'
  );
}

function buildUserMessage(text) {
  return text;
}

// ─────────────────────────────────────────────
// 硬超时 Promise 包装
// ─────────────────────────────────────────────
function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`[Timeout] ${label} 超时 (${ms}ms)`));
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// ─────────────────────────────────────────────
// API Key 有效性检查
// ─────────────────────────────────────────────
function validateApiKey(key) {
  if (!key || typeof key !== 'string') {
    throw Object.assign(
      new Error('SCNET_API_KEY 未设置，请在 .env 文件或环境变量中配置'),
      { statusCode: 401 }
    );
  }
  // 含非 ASCII 字符（中文占位符等）
  if (/[^\x20-\x7E]/.test(key)) {
    throw Object.assign(
      new Error('SCNET_API_KEY 包含非法字符（疑似未替换占位符），请在 .env 中设置真实的 API Key'),
      { statusCode: 401 }
    );
  }
  // 明显的占位符格式
  if (key.startsWith('<') || key === 'YOUR_API_KEY' || key.length < 20) {
    throw Object.assign(
      new Error('SCNET_API_KEY 看起来仍是占位符，请替换为真实 API Key'),
      { statusCode: 401 }
    );
  }
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
//   引擎 A：中科网（scnet）Qwen3-30B
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────

// 核心 API 调用（单次，不含重试）— 受 scnet 信号量保护
function callScnetAPI(text, targetLang) {
  return scnetSemaphore.run(() => _callScnetAPIRaw(text, targetLang));
}

function _callScnetAPIRaw(text, targetLang) {
  // 从 Key 池取下一个 Key（round-robin 轮转）
  const apiKey = scnetKeyPool.next() || CONFIG.scnet.apiKey;
  validateApiKey(apiKey);

  const systemPrompt = buildSystemPrompt(targetLang);
  const userMessage  = buildUserMessage(text);

  const requestBody = JSON.stringify({
    model:           CONFIG.scnet.model,
    temperature:     0.3,   // 翻译任务：低温度保证准确性，不需要创意
    top_p:           0.9,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage },
    ],
  });

  const bodyBytes = Buffer.byteLength(requestBody, 'utf8');

  // 413 预检：批量翻译请求体可能较大，上限设为 2MB
  if (bodyBytes > 2 * 1024 * 1024) {
    return Promise.reject(
      Object.assign(new Error(`请求体过大: ${bodyBytes} bytes`), { statusCode: 413 })
    );
  }

  const requestOptions = {
    hostname: CONFIG.scnet.apiBase,
    port:     443,
    path:     CONFIG.scnet.apiPath,
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Authorization':  `Bearer ${apiKey}`,
      'Content-Length': bodyBytes,
      'Accept':         'application/json',
      'User-Agent':     'unified-translator/2.0',
    },
    timeout: CONFIG.scnet.socketTimeout,
  };

  const httpPromise = new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];

      res.on('data', (chunk) => chunks.push(chunk));

      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');

        // ── 响应解析 ──
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return reject(new Error(`响应 JSON 解析失败: ${raw.substring(0, 200)}`));
        }

        // ── HTTP 错误处理 ──
        if (res.statusCode !== 200) {
          const apiMsg = parsed?.error?.message || parsed?.message || `HTTP ${res.statusCode}`;
          const err = Object.assign(
            new Error(`API 错误 [${res.statusCode}]: ${apiMsg}`),
            { statusCode: res.statusCode, retryAfter: res.headers['retry-after'] }
          );
          return reject(err);
        }

        // ── 响应结构校验 ──
        const choice = parsed?.choices?.[0];
        if (!choice) {
          return reject(new Error('响应缺少 choices 字段'));
        }

        // ── finish_reason 校验 ──
        const finishReason = choice.finish_reason;
        if (finishReason === 'length') {
          // 被截断，触发重试（调用方会用更小的分块重试）
          return reject(
            Object.assign(new Error('响应被截断 (finish_reason=length)'), { truncated: true })
          );
        }

        const rawContent = choice.message?.content;
        if (typeof rawContent !== 'string' || rawContent.trim() === '') {
          return reject(new Error('响应 content 为空'));
        }

        // Qwen3 指令模型（非 Thinking 版）不输出思维链，直接使用 content
        const content = rawContent.trim();

        // ── 长度合理性校验 ──
        const ratio = content.length / (text.length || 1);
        if (ratio < CONFIG.scnet.minResponseRatio) {
          return reject(new Error(
            `翻译结果疑似过短: 原文 ${text.length} 字符 → 译文 ${content.length} 字符 (ratio=${ratio.toFixed(2)})`
          ));
        }
        if (ratio > CONFIG.scnet.maxResponseRatio) {
          return reject(new Error(
            `翻译结果疑似过长: 原文 ${text.length} 字符 → 译文 ${content.length} 字符 (ratio=${ratio.toFixed(2)})`
          ));
        }

        resolve(content.trim());
      });

      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('Socket 超时'), { socketTimeout: true }));
    });

    req.write(requestBody);
    req.end();
  });

  return withTimeout(
    httpPromise,
    CONFIG.scnet.requestTimeout,
    `_callScnetAPIRaw(${targetLang})`
  );
}

// ─────────────────────────────────────────────
// 判断错误是否可重试
// ─────────────────────────────────────────────
function isRetryable(err) {
  if (err.statusCode && NON_RETRYABLE_STATUS.has(err.statusCode)) return false;
  return true;
}

// ─────────────────────────────────────────────
// 计算重试延迟（指数退避 + jitter）
// cfgKey: 'scnet' | 'hunyuan'
// ─────────────────────────────────────────────
function calcDelay(retryCount, retryAfterHeader, cfgKey = 'scnet') {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds)) return seconds * 1000;
  }
  const base   = CONFIG[cfgKey].retryBaseDelay * Math.pow(2, retryCount);
  const jitter = Math.random() * 500;
  return Math.min(base + jitter, 30000); // 最大30秒
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
//   引擎 B：硅基流动（SiliconFlow）Hunyuan-MT-7B
//
//   ⚠️  不支持的语言（需调用方降级到 scnet）：
//       he（希伯来语）、ms（马来语）
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────

/**
 * 检查 targetLang 是否受 Hunyuan-MT-7B 支持
 * 不支持时调用方应降级到 scnet 引擎
 */
function isHunyuanSupported(targetLang) {
  return !CONFIG.hunyuan.unsupportedLangs.has(targetLang);
}

/**
 * 验证 SiliconFlow API Key 格式
 */
function validateHunyuanApiKey(key) {
  if (!key || typeof key !== 'string') {
    throw Object.assign(
      new Error('SILICONFLOW_API_KEY 未设置，请在 .env 文件或环境变量中配置'),
      { statusCode: 401 }
    );
  }
  if (/[^\x20-\x7E]/.test(key)) {
    throw Object.assign(
      new Error('SILICONFLOW_API_KEY 包含非法字符（疑似未替换占位符）'),
      { statusCode: 401 }
    );
  }
  if (key.startsWith('<') || key === 'YOUR_API_KEY' || key.length < 20) {
    throw Object.assign(
      new Error('SILICONFLOW_API_KEY 看起来仍是占位符，请替换为真实 API Key'),
      { statusCode: 401 }
    );
  }
}

/**
 * Hunyuan-MT-7B System Prompt（纯文本模式）
 *
 * 混元翻译模型对 system prompt 格式有特定要求：
 *  - 使用 "Translate the following text to {language}:" 格式效果最佳
 *  - 专用翻译模型，领域提示比通用 LLM 更有效
 */
function buildHunyuanSystemPrompt(targetLang) {
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;
  return (
    'You are a professional translation engine specializing in commercial kitchen and food processing equipment. ' +
    `Translate the following text to ${langName}. ` +
    'Rules:\n' +
    '1. Output ONLY the translated text. Do NOT add explanations, notes, or repeat the original.\n' +
    '2. Preserve ALL formatting: punctuation, line breaks, semicolons, numbers, units (kW, kg, mm, °C, V, Hz).\n' +
    '3. Keep brand names, model numbers, and technical parameters (e.g. "304 stainless steel", "CE/UL certified") unchanged or use their standard localized form.\n' +
    '4. CRITICAL: Technical specification values containing only numbers, SI units, and symbols (e.g. "380V / 50Hz / 18kW", "220V ± 10%", "1200mm × 800mm × 1600mm", "50/60 Hz") MUST be kept exactly as-is. Do NOT translate or substitute any unit symbols with local-language equivalents.'
  );
}

/**
 * Hunyuan-MT-7B System Prompt（JSON 批量翻译模式）
 *
 * 专为 JSON 键值对翻译设计，明确告知模型输入输出均为 JSON，
 * 避免模型对 JSON 语法进行"翻译"或破坏结构。
 */
function buildHunyuanJsonSystemPrompt(targetLang) {
  const langName = LANGUAGE_NAMES[targetLang] || targetLang;
  return (
    'You are a professional translation engine specializing in commercial kitchen and food processing equipment. ' +
    `Translate the JSON values in the following object to ${langName}. ` +
    'Rules:\n' +
    '1. Return a valid JSON object with EXACTLY the same keys as the input.\n' +
    '2. Translate ONLY the values. Do NOT translate or modify the keys.\n' +
    '3. Output ONLY the JSON object, no explanation, no markdown code blocks.\n' +
    '4. Preserve numbers, units (kW, kg, mm, °C, V, Hz), model numbers, and brand names.\n' +
    '5. CRITICAL: Values that contain only numbers, SI units, and symbols (e.g. "380V / 50Hz / 18kW", "220V ± 10%", "1200mm × 800mm × 1600mm", "50/60 Hz") MUST be copied exactly as-is into the output. Do NOT translate, transliterate, or replace any unit symbols (V, Hz, kW, mm, kg, etc.) with local-language equivalents.\n' +
    '6. Use standard double quotes (") for all JSON strings. Do NOT use special quotes like 「」„".'
  );
}

/**
 * 核心 HTTP 调用（SiliconFlow / Hunyuan-MT-7B，不含重试）
 * 受 hunyuanSemaphore 全局并发控制
 *
 * @param {string} text - 要翻译的文本（纯文本或 JSON 字符串）
 * @param {string} targetLang - 目标语言代码
 * @param {Function} [promptBuilder] - 可选的 system prompt 构建函数，默认用纯文本 prompt
 */
function callHunyuanAPI(text, targetLang, promptBuilder) {
  return hunyuanSemaphore.run(() => _callHunyuanAPIRaw(text, targetLang, promptBuilder));
}

function _callHunyuanAPIRaw(text, targetLang, promptBuilder) {
  // 从 Key 池取下一个 Key（round-robin 轮转）
  const apiKey = hunyuanKeyPool.next() || CONFIG.hunyuan.apiKey;
  validateHunyuanApiKey(apiKey);

  // 根据调用方传入的 promptBuilder 选择合适的 system prompt
  // JSON 批量翻译用 buildHunyuanJsonSystemPrompt，纯文本用 buildHunyuanSystemPrompt
  const systemContent = (promptBuilder || buildHunyuanSystemPrompt)(targetLang);

  const requestBody = JSON.stringify({
    model:       CONFIG.hunyuan.model,
    temperature: 0.3,   // 翻译任务使用较低温度，保证准确性
    top_p:       0.9,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user',   content: text },
    ],
  });

  const bodyBytes = Buffer.byteLength(requestBody, 'utf8');
  if (bodyBytes > 2 * 1024 * 1024) {
    return Promise.reject(
      Object.assign(new Error(`Hunyuan 请求体过大: ${bodyBytes} bytes`), { statusCode: 413 })
    );
  }

  const requestOptions = {
    hostname: CONFIG.hunyuan.apiBase,
    port:     443,
    path:     CONFIG.hunyuan.apiPath,
    method:   'POST',
    headers: {
      'Content-Type':   'application/json',
      'Authorization':  `Bearer ${apiKey}`,
      'Content-Length': bodyBytes,
      'Accept':         'application/json',
      'User-Agent':     'unified-translator/2.0-hunyuan',
    },
    timeout: CONFIG.hunyuan.socketTimeout,
  };

  const httpPromise = new Promise((resolve, reject) => {
    const req = https.request(requestOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');

        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          return reject(new Error(`Hunyuan 响应 JSON 解析失败: ${raw.substring(0, 200)}`));
        }

        if (res.statusCode !== 200) {
          const apiMsg = parsed?.error?.message || parsed?.message || `HTTP ${res.statusCode}`;
          return reject(Object.assign(
            new Error(`Hunyuan API 错误 [${res.statusCode}]: ${apiMsg}`),
            { statusCode: res.statusCode, retryAfter: res.headers['retry-after'] }
          ));
        }

        const choice = parsed?.choices?.[0];
        if (!choice) return reject(new Error('Hunyuan 响应缺少 choices 字段'));

        if (choice.finish_reason === 'length') {
          return reject(
            Object.assign(new Error('Hunyuan 响应被截断 (finish_reason=length)'), { truncated: true })
          );
        }

        const rawContent = choice.message?.content;
        if (typeof rawContent !== 'string' || rawContent.trim() === '') {
          return reject(new Error('Hunyuan 响应 content 为空'));
        }

        const content = rawContent.trim();
        const ratio   = content.length / (text.length || 1);

        if (ratio < CONFIG.hunyuan.minResponseRatio) {
          return reject(new Error(
            `Hunyuan 翻译结果疑似过短: ${text.length} → ${content.length} 字符 (ratio=${ratio.toFixed(2)})`
          ));
        }
        if (ratio > CONFIG.hunyuan.maxResponseRatio) {
          return reject(new Error(
            `Hunyuan 翻译结果疑似过长: ${text.length} → ${content.length} 字符 (ratio=${ratio.toFixed(2)})`
          ));
        }

        resolve(content);
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(Object.assign(new Error('Hunyuan Socket 超时'), { socketTimeout: true }));
    });

    req.write(requestBody);
    req.end();
  });

  return withTimeout(
    httpPromise,
    CONFIG.hunyuan.requestTimeout,
    `_callHunyuanAPIRaw(${targetLang})`
  );
}

/**
 * 带重试的 Hunyuan 单次翻译
 * @param {string} text
 * @param {string} targetLang
 * @param {number} [retryCount=0]
 * @param {Function} [promptBuilder] - 可选 system prompt 构建函数（JSON 模式传入 buildHunyuanJsonSystemPrompt）
 */
async function translateOnceHunyuan(text, targetLang, retryCount = 0, promptBuilder) {
  const maxRetries = CONFIG.hunyuan.maxRetries;
  try {
    return await callHunyuanAPI(text, targetLang, promptBuilder);
  } catch (err) {
    const attempt = retryCount + 1;
    console.error(`  [Hunyuan] 翻译失败 (第${attempt}次/${maxRetries + 1}): ${err.message}`);
    if (retryCount < maxRetries && isRetryable(err)) {
      const delay = calcDelay(retryCount, err.retryAfter, 'hunyuan');
      console.log(`  [Hunyuan] 等待 ${Math.round(delay)}ms 后重试...`);
      await sleep(delay);
      return translateOnceHunyuan(text, targetLang, retryCount + 1, promptBuilder);
    }
    throw err;
  }
}

/**
 * Hunyuan-MT-7B JSON 批量翻译
 * 与 scnet 版完全独立，逻辑相同但调用 callHunyuanAPI
 */
async function translateJsonObjectHunyuan(jsonObj, targetLang) {
  // 不支持的语言直接告知调用方
  if (!isHunyuanSupported(targetLang)) {
    throw Object.assign(
      new Error(`Hunyuan-MT-7B 不支持语言: ${targetLang}（请改用 scnet 引擎）`),
      { unsupported: true, lang: targetLang }
    );
  }

  const groups = splitJsonIntoChunks(
    jsonObj,
    CONFIG.hunyuan.maxChunkChars,
    CONFIG.hunyuan.maxChunkKeys
  );

  const concurrency = CONFIG.hunyuan.chunkConcurrency || 8;
  console.log(
    `  [Hunyuan/JSON] 共 ${Object.keys(jsonObj).length} 个字段，拆分为 ${groups.length} 组，并发 ${Math.min(concurrency, groups.length)} 个`
  );

  async function processChunk(group, i, retry = false) {
    const groupStr = JSON.stringify(group, null, 2);
    const label    = `第 ${i + 1}/${groups.length} 组 (${Object.keys(group).length} 字段)${retry ? ' [retry]' : ''}`;
    try {
      // 使用 JSON 专用 system prompt，明确告知模型输入输出均为 JSON 对象
      const translated = await translateOnceHunyuan(groupStr, targetLang, 0, buildHunyuanJsonSystemPrompt);
      let parsed;
      try {
        parsed = parseTranslatedJson(translated);
      } catch (parseErr) {
        // 解析失败：首次尝试时拆半重发
        if (!retry && Object.keys(group).length > 1) {
          console.warn(`  [Hunyuan/JSON] ${label} 解析失败，拆半重试: ${parseErr.message}`);
          const keys  = Object.keys(group);
          const half  = Math.ceil(keys.length / 2);
          const left  = Object.fromEntries(keys.slice(0, half).map(k => [k, group[k]]));
          const right = Object.fromEntries(keys.slice(half).map(k => [k, group[k]]));
          const [r1, r2] = await Promise.all([
            processChunk(left,  i, true),
            processChunk(right, i, true),
          ]);
          const merged = { ...r1.result, ...r2.result };
          return { index: i, result: merged, success: r1.success && r2.success };
        }
        console.warn(`  [Hunyuan/JSON] ${label} 解析失败，保留原文: ${parseErr.message}`);
        return { index: i, result: { ...group }, success: false };
      }
      const missingKeys = Object.keys(group).filter(k => !(k in parsed));
      if (missingKeys.length > 0) {
        console.warn(`  [Hunyuan/JSON] ${label} 缺少键 ${missingKeys.length} 个，原文兜底`);
        for (const k of missingKeys) parsed[k] = group[k];
      }
      // 后处理：还原被模型意外修改的纯规格字段（如单位被阿拉伯语化）
      restoreUntranslatableFields(parsed, group);
      console.log(`  [Hunyuan/JSON] ${label} ✓`);
      return { index: i, result: parsed, success: true };
    } catch (err) {
      console.error(`  [Hunyuan/JSON] ${label} 失败: ${err.message}，保留原文`);
      return { index: i, result: { ...group }, success: false };
    }
  }

  const resultMap = new Array(groups.length);
  let successGroups = 0, failGroups = 0;

  for (let start = 0; start < groups.length; start += concurrency) {
    const batch = groups.slice(start, start + concurrency);
    const batchResults = await Promise.all(
      batch.map((group, j) => processChunk(group, start + j))
    );
    for (const r of batchResults) {
      resultMap[r.index] = r.result;
      r.success ? successGroups++ : failGroups++;
    }
  }

  const result = Object.assign({}, ...resultMap);
  console.log(`  [Hunyuan/JSON] 翻译完成: ${successGroups} 组成功, ${failGroups} 组失败`);
  return result;
}

/**
 * Hunyuan-MT-7B 公共翻译入口（带自动拆分 + 重试）
 * - 不支持的语言（he/ms）会抛出 unsupported: true 错误，调用方可降级
 */
async function translateHunyuan(text, targetLang) {
  if (!text || typeof text !== 'string' || text.trim() === '') return text || '';
  if (targetLang === 'zh-CN' || targetLang === 'zh') return text;

  if (!isHunyuanSupported(targetLang)) {
    throw Object.assign(
      new Error(`Hunyuan-MT-7B 不支持语言: ${targetLang}`),
      { unsupported: true, lang: targetLang }
    );
  }

  const estimatedBytes = Buffer.byteLength(text, 'utf8');
  if (estimatedBytes > 30000) {
    // 超大文本分块翻译（复用 scnet 的拆分逻辑，只换调用函数）
    const chunks = splitTextIntoChunks(text, CONFIG.hunyuan.maxChunkChars);
    const parts  = [];
    for (const chunk of chunks) {
      try {
        parts.push(await translateOnceHunyuan(chunk, targetLang));
      } catch {
        parts.push(chunk);
      }
    }
    return parts.join('');
  }

  try {
    return await translateOnceHunyuan(text, targetLang, 0);
  } catch (err) {
    console.error(`  [Hunyuan/Fallback] 翻译失败，返回原文: ${text.substring(0, 50)}...`);
    return text;
  }
}

// ─────────────────────────────────────────────
// ══════════════════════════════════════════════
//   引擎 A：带重试的单次翻译（纯文本）
// ══════════════════════════════════════════════
// ─────────────────────────────────────────────
async function translateOnce(text, targetLang, retryCount = 0) {
  const maxRetries = CONFIG.scnet.maxRetries;
  try {
    return await callScnetAPI(text, targetLang);
  } catch (err) {
    const attempt = retryCount + 1;
    console.error(`  [API] 翻译失败 (第${attempt}次/${maxRetries + 1}): ${err.message}`);

    if (retryCount < maxRetries && isRetryable(err)) {
      const delay = calcDelay(retryCount, err.retryAfter, 'scnet');
      console.log(`  [API] 等待 ${Math.round(delay)}ms 后重试...`);
      await sleep(delay);
      return translateOnce(text, targetLang, retryCount + 1);
    }

    throw err; // 超过重试次数或不可重试，向上抛出
  }
}

// ─────────────────────────────────────────────
// parseTranslatedJson：健壮的模型输出 JSON 解析
//
// 处理以下常见的模型输出问题：
//  1. markdown 代码块包裹（```json ... ```）
//  2. 非标准引号（日语「」、德语„"、中文弯引号、阿拉伯书名号《》«»等）
//  3. value 内含有裸双引号（模型未转义）→ 尝试正则修复
//  4. JSON 结构前后有多余文字（截取第一个 {...}）
//  5. 尾部多余逗号（trailing comma）
//
// 返回：解析成功的对象，失败时抛出含 message 的错误
// ─────────────────────────────────────────────
function parseTranslatedJson(raw) {
  if (!raw || typeof raw !== 'string') throw new Error('空响应');

  // ── Step 1：去除 markdown 代码块 ──────────────────────────────────────────
  // 匹配 ```json ... ``` 或 ``` ... ```
  let text = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  // ── Step 2：提取第一个完整的 {...} 块 ────────────────────────────────────
  // 找到第一个 { 和最后一个 }（贪婪匹配最外层大括号）
  const start = text.indexOf('{');
  const end   = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('未找到 JSON 结构');
  text = text.slice(start, end + 1);

  // ── Step 3：规范化引号 ────────────────────────────────────────────────────
  // 只替换充当 JSON 结构符的非标准引号，不触碰已在双引号内的内容。
  // 策略：整体替换已知单字符非标准引号 → ASCII 双引号，
  //       然后交给 JSON.parse 检验；失败再做更激进的修复。
  const normalizeQuotes = s =>
    s
      // 日语书名号
      .replace(/「/g, '"').replace(/」/g, '"')
      // 德语/波兰语低引号 → 普通双引号
      .replace(/„/g, '"').replace(/\u201E/g, '"')
      // Unicode 弯引号（\u201C \u201D）
      .replace(/\u201C/g, '"').replace(/\u201D/g, '"')
      // 单引号变体（\u2018 \u2019）- JSON key/value 有时被模型用单引号包
      .replace(/\u2018/g, '\'').replace(/\u2019/g, '\'')
      // 阿拉伯书名号 «»（某些语言 Hunyuan 会用）
      .replace(/«/g, '"').replace(/»/g, '"')
      // 全角引号
      .replace(/\uFF02/g, '"').replace(/\uFF07/g, '\'');

  text = normalizeQuotes(text);

  // ── Step 4：尝试直接解析 ──────────────────────────────────────────────────
  try {
    return JSON.parse(text);
  } catch (e1) {
    // ── Step 5：修复 trailing comma（,}  ,]）────────────────────────────────
    const fixedTrailing = text.replace(/,(\s*[}\]])/g, '$1');
    try {
      return JSON.parse(fixedTrailing);
    } catch (e2) {
      // ── Step 6：修复 value 中未转义的裸双引号 ───────────────────────────
      // 使用简单策略：只对 ": "..." 模式中的 value 做处理
      // 正则：找到 "key": "......" 中 value 内的裸引号，将其转义
      // 注意：这是启发式修复，无法保证 100% 正确，但能处理大多数情况
      const fixBareQuotes = s => {
        // 匹配 "...": "..." 结构，将 value 内部的裸 " 转义
        return s.replace(/("(?:[^"\\]|\\.)*"\s*:\s*")([^"]*?)("(?:\s*[,}]))/g, (_, prefix, inner, suffix) => {
          return prefix + inner.replace(/"/g, '\\"') + suffix;
        });
      };
      const fixedQuotes = fixBareQuotes(fixedTrailing);
      try {
        return JSON.parse(fixedQuotes);
      } catch (e3) {
        // 抛出最原始的错误，方便排查
        throw new Error(e1.message);
      }
    }
  }
}

// ─────────────────────────────────────────────
// JSON 键值对拆分（产品数据专用）
//
// 输入：{ "key1": "val1", "key2": "val2", ... }
// 输出：[ { "key1": "val1" }, { "key2": "val2", "key3": "val3" }, ... ]
// 每个分组字符数不超过 maxChunkChars，且不跨越字段边界
// ─────────────────────────────────────────────
function splitJsonIntoChunks(jsonObj, maxChunkChars, maxChunkKeys) {
  const entries = Object.entries(jsonObj);
  const groups  = [];
  let   current = {};
  let   currentChars = 2; // '{' + '}'

  for (const [k, v] of entries) {
    const pairSize = JSON.stringify({ [k]: v }).length - 2; // 减去 {} 开销
    const addedSize = (Object.keys(current).length === 0 ? 0 : 2) + pairSize; // 逗号+空格

    const wouldExceedChars = (currentChars + addedSize) > maxChunkChars;
    const wouldExceedKeys  = Object.keys(current).length >= maxChunkKeys;

    if ((wouldExceedChars || wouldExceedKeys) && Object.keys(current).length > 0) {
      groups.push(current);
      current = {};
      currentChars = 2;
    }

    current[k] = v;
    currentChars += addedSize;
  }

  if (Object.keys(current).length > 0) {
    groups.push(current);
  }

  return groups;
}

// ─────────────────────────────────────────────
// 纯文本拆分（按句子边界）
// ─────────────────────────────────────────────
function splitTextIntoChunks(text, maxChunkChars) {
  if (!text) return [];
  if (text.length <= maxChunkChars) return [text];

  const chunks   = [];
  let   current  = '';
  // 按常见句子边界拆分（保留分隔符）
  const segments = text.split(/(?<=[.。!！?？;；\n])/);

  for (const seg of segments) {
    if (seg.length > maxChunkChars) {
      // 超长单句强制硬切
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < seg.length; i += maxChunkChars) {
        chunks.push(seg.slice(i, i + maxChunkChars));
      }
      continue;
    }
    if ((current + seg).length > maxChunkChars) {
      if (current) chunks.push(current);
      current = seg;
    } else {
      current += seg;
    }
  }
  if (current) chunks.push(current);

  return chunks;
}

// ─────────────────────────────────────────────
// JSON 模式拆分翻译（产品数据推荐入口）
//
// 输入：需要翻译的 JSON 对象（值均为中文字符串）
// 输出：翻译后的 JSON 对象（键名保持不变）
// ─────────────────────────────────────────────
async function translateJsonObject(jsonObj, targetLang) {
  const groups = splitJsonIntoChunks(
    jsonObj,
    CONFIG.scnet.maxChunkChars,
    CONFIG.scnet.maxChunkKeys
  );

  const concurrency = CONFIG.scnet.chunkConcurrency || 5;
  console.log(
    `  [JSON] 共 ${Object.keys(jsonObj).length} 个字段，拆分为 ${groups.length} 组，并发 ${Math.min(concurrency, groups.length)} 个发送`
  );

  // 处理单个 chunk，返回 { index, result, success }
  // retry: true 表示这是缩小分组后的第二次尝试
  async function processChunk(group, i, retry = false) {
    const groupStr = JSON.stringify(group, null, 2);
    const label    = `第 ${i + 1}/${groups.length} 组 (${Object.keys(group).length} 字段)${retry ? ' [retry]' : ''}`;
    try {
      const translated = await translateOnce(groupStr, targetLang);
      let parsed;
      try {
        parsed = parseTranslatedJson(translated);
      } catch (parseErr) {
        // 解析失败：若首次尝试，把本组拆成两半分别重发
        if (!retry && Object.keys(group).length > 1) {
          console.warn(`  [JSON] ${label} 解析失败，拆半重试: ${parseErr.message}`);
          const keys  = Object.keys(group);
          const half  = Math.ceil(keys.length / 2);
          const left  = Object.fromEntries(keys.slice(0, half).map(k => [k, group[k]]));
          const right = Object.fromEntries(keys.slice(half).map(k => [k, group[k]]));
          const [r1, r2] = await Promise.all([
            processChunk(left,  i, true),
            processChunk(right, i, true),
          ]);
          const merged = { ...r1.result, ...r2.result };
          return { index: i, result: merged, success: r1.success && r2.success };
        }
        console.warn(`  [JSON] ${label} 结果解析失败，保留原文: ${parseErr.message}`);
        return { index: i, result: { ...group }, success: false };
      }
      // 补全缺失键（直接用原文兜底）
      const missingKeys = Object.keys(group).filter(k => !(k in parsed));
      if (missingKeys.length > 0) {
        console.warn(`  [JSON] ${label} 缺少键 ${missingKeys.length} 个，原文兜底`);
        for (const k of missingKeys) parsed[k] = group[k];
      }
      // 后处理：还原被模型意外修改的纯规格字段（如单位被阿拉伯语化）
      restoreUntranslatableFields(parsed, group);
      console.log(`  [JSON] ${label} ✓`);
      return { index: i, result: parsed, success: true };
    } catch (err) {
      console.error(`  [JSON] ${label} 失败: ${err.message}，保留原文`);
      return { index: i, result: { ...group }, success: false };
    }
  }

  // 并发池：同时最多 `concurrency` 个 chunk 在飞
  const resultMap = new Array(groups.length);
  let successGroups = 0, failGroups = 0;

  // 简易并发控制：按 concurrency 分批，每批 Promise.all
  for (let start = 0; start < groups.length; start += concurrency) {
    const batch = groups.slice(start, start + concurrency);
    const batchResults = await Promise.all(
      batch.map((group, j) => processChunk(group, start + j))
    );
    for (const r of batchResults) {
      resultMap[r.index] = r.result;
      r.success ? successGroups++ : failGroups++;
    }
  }

  const result = Object.assign({}, ...resultMap);
  console.log(
    `  [JSON] 翻译完成: ${successGroups} 组成功, ${failGroups} 组失败`
  );
  return result;
}

// ─────────────────────────────────────────────
// 纯文本模式拆分翻译
// ─────────────────────────────────────────────
async function translateInChunks(text, targetLang) {
  const chunks = splitTextIntoChunks(text, CONFIG.scnet.maxChunkChars);
  console.log(
    `  [Chunk] 文本过长 (${text.length} 字符)，拆分为 ${chunks.length} 块翻译`
  );

  const parts = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < chunks.length; i++) {
    try {
      parts.push(await translateOnce(chunks[i], targetLang));
      ok++;
    } catch (err) {
      console.error(`  [Chunk] 块 ${i + 1}/${chunks.length} 失败: ${err.message}，保留原文`);
      parts.push(chunks[i]);
      fail++;
    }
  }

  console.log(`  [Chunk] 完成: ${ok} 成功, ${fail} 失败`);
  return parts.join('');
}

// ─────────────────────────────────────────────
// 公共翻译函数（带重试 + 自动拆分）
//
// 主入口，兼容原有调用方式
// ─────────────────────────────────────────────
async function translateWithRetry(text, targetLang, retryCount = 0) {
  // 输入校验
  if (!text || typeof text !== 'string' || text.trim() === '') {
    return text || '';
  }

  // 中文直接返回
  if (targetLang === 'zh-CN' || targetLang === 'zh') {
    return text;
  }

  // 估算请求体大小，决定是否需要拆分
  const estimatedBytes = Buffer.byteLength(text, 'utf8');
  if (estimatedBytes > 30000) {
    // 超大文本：走分块翻译
    return translateInChunks(text, targetLang);
  }

  try {
    return await translateOnce(text, targetLang, retryCount);
  } catch (err) {
    // translateOnce 内已耗尽重试，此处直接返回原文
    console.error(
      `  [Fallback] 翻译彻底失败，返回原文: ${text.substring(0, 50)}...`
    );
    return text;
  }
}

/**
 * 统一翻译函数（简洁入口）
 */
async function translate(text, targetLang) {
  return translateWithRetry(text, targetLang, 0);
}

/**
 * 批量翻译
 * @param {string[]} texts
 * @param {string} targetLang
 * @param {Function} [progressCallback] - (done, total, src, result) => void
 */
async function batchTranslate(texts, targetLang, progressCallback) {
  const results = [];
  const total   = texts.length;

  for (let i = 0; i < total; i++) {
    let result;
    try {
      result = await translate(texts[i], targetLang);
    } catch {
      result = texts[i];
    }
    results.push(result);
    if (progressCallback) progressCallback(i + 1, total, texts[i], result);
  }

  return results;
}

// ─────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────
// 自测主函数（直接运行 node unified-translator.js 时执行）
// 同时测试两个引擎，并给出对比结论
// ─────────────────────────────────────────────
async function main() {
  console.log('══════════════════════════════════════════════════════════');
  console.log('  翻译引擎对比测试');
  console.log('  引擎 A: scnet  (Qwen3-30B-A3B-Instruct-2507)');
  console.log('  引擎 B: Hunyuan (tencent/Hunyuan-MT-7B via SiliconFlow)');
  console.log('══════════════════════════════════════════════════════════\n');

  // 测试样本（真实产品数据）
  const TEST_TEXT_SHORT = '座地式900电磁炒菜机，自动翻锅，304不锈钢材质，大容量触屏版';
  const TEST_OBJ = {
    name:    '座地式900电磁炒菜机语音菜单自动喷料超大批量版',
    badge:   '超大批量喷料',
    feature: '适用于自动煸炒烹饪，单次烹饪30-80kg，自动喷料功能，内置800道菜谱',
    spec:    '功率:35kW, 锅直径:900mm, 容量:30-80kg/次, 材质:304不锈钢',
  };

  // 时间记录工具
  const timed = async (label, fn) => {
    const t0 = Date.now();
    try {
      const result = await fn();
      const ms = Date.now() - t0;
      console.log(`  ✅ ${label} [${ms}ms]`);
      if (typeof result === 'object') {
        console.log(`     ${JSON.stringify(result).substring(0, 120)}`);
      } else {
        console.log(`     ${String(result).substring(0, 120)}`);
      }
      return { ok: true, ms, result };
    } catch (err) {
      const ms = Date.now() - t0;
      console.log(`  ❌ ${label} [${ms}ms] — ${err.message}`);
      return { ok: false, ms, err };
    }
  };

  const stats = { scnet: [], hunyuan: [] };

  // ──────────────────────────────────────────────────────────────────
  // 测试 1：短文本 → 英语（两引擎对比，同时发）
  // ──────────────────────────────────────────────────────────────────
  console.log('\n【测试 1】短文本 zh→en（两引擎同时发，记录耗时）');
  const [r1a, r1b] = await Promise.all([
    timed('scnet   zh→en', () => translate(TEST_TEXT_SHORT, 'en')),
    timed('hunyuan zh→en', () => translateHunyuan(TEST_TEXT_SHORT, 'en')),
  ]);
  if (r1a.ok) stats.scnet.push(r1a.ms);
  if (r1b.ok) stats.hunyuan.push(r1b.ms);

  // ──────────────────────────────────────────────────────────────────
  // 测试 2：短文本 → 日语
  // ──────────────────────────────────────────────────────────────────
  console.log('\n【测试 2】短文本 zh→ja');
  const [r2a, r2b] = await Promise.all([
    timed('scnet   zh→ja', () => translate(TEST_TEXT_SHORT, 'ja')),
    timed('hunyuan zh→ja', () => translateHunyuan(TEST_TEXT_SHORT, 'ja')),
  ]);
  if (r2a.ok) stats.scnet.push(r2a.ms);
  if (r2b.ok) stats.hunyuan.push(r2b.ms);

  // ──────────────────────────────────────────────────────────────────
  // 测试 3：JSON 对象批量翻译 → 法语
  // ──────────────────────────────────────────────────────────────────
  console.log('\n【测试 3】JSON 对象(4字段) zh→fr');
  const [r3a, r3b] = await Promise.all([
    timed('scnet   JSON zh→fr', () => translateJsonObject(TEST_OBJ, 'fr')),
    timed('hunyuan JSON zh→fr', () => translateJsonObjectHunyuan(TEST_OBJ, 'fr')),
  ]);
  if (r3a.ok) stats.scnet.push(r3a.ms);
  if (r3b.ok) stats.hunyuan.push(r3b.ms);

  // ──────────────────────────────────────────────────────────────────
  // 测试 4：hunyuan 不支持语言（he/ms）—— 预期抛出 unsupported 错误
  // ──────────────────────────────────────────────────────────────────
  console.log('\n【测试 4】Hunyuan 不支持语言降级测试（he/ms）');
  for (const lang of ['he', 'ms']) {
    const r = await timed(`hunyuan zh→${lang}（预期失败/降级）`, async () => {
      try {
        return await translateHunyuan(TEST_TEXT_SHORT, lang);
      } catch (err) {
        if (err.unsupported) return `⚠️  unsupported（正常，请改用 scnet）: ${err.message}`;
        throw err;
      }
    });
    if (!r.ok) console.log(`     → 调用方应使用 scnet 处理 ${lang}`);
  }
  // scnet 处理这两种语言没问题
  console.log('  测试 scnet 处理 he/ms（应正常）...');
  const [r4he, r4ms] = await Promise.all([
    timed('scnet   zh→he', () => translate(TEST_TEXT_SHORT, 'he')),
    timed('scnet   zh→ms', () => translate(TEST_TEXT_SHORT, 'ms')),
  ]);
  if (r4he.ok) stats.scnet.push(r4he.ms);
  if (r4ms.ok) stats.scnet.push(r4ms.ms);

  // ──────────────────────────────────────────────────────────────────
  // 测试 5：zh-CN 直通（不调 API）
  // ──────────────────────────────────────────────────────────────────
  console.log('\n【测试 5】zh-CN 直通（两引擎均不应调 API）');
  await Promise.all([
    timed('scnet   zh-CN 直通', async () => {
      const r = await translate('这是中文', 'zh-CN');
      if (r !== '这是中文') throw new Error('直通失败');
      return '（未调 API）';
    }),
    timed('hunyuan zh-CN 直通', async () => {
      const r = await translateHunyuan('这是中文', 'zh-CN');
      if (r !== '这是中文') throw new Error('直通失败');
      return '（未调 API）';
    }),
  ]);

  // ──────────────────────────────────────────────────────────────────
  // 汇总对比
  // ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('  对比汇总');
  console.log('══════════════════════════════════════════════════════════');
  const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 'N/A';
  console.log(`  scnet   有效测试次数: ${stats.scnet.length},   平均耗时: ${avg(stats.scnet)}ms`);
  console.log(`  hunyuan 有效测试次数: ${stats.hunyuan.length}, 平均耗时: ${avg(stats.hunyuan)}ms`);
  console.log('');
  console.log('  语言支持情况:');
  console.log('  - scnet   (Qwen3-30B):      支持全部 21 种目标语言 ✅');
  console.log('  - hunyuan (Hunyuan-MT-7B):  支持 19/21 种（❌ 不支持 he/ms）');
  console.log('');
  console.log('  建议:');
  console.log('  1. 翻译质量方面：Hunyuan-MT-7B 是专用翻译模型，通常更准确');
  console.log('  2. 速度方面：根据上方实测结果判断哪个更快');
  console.log('  3. 覆盖度方面：scnet 支持全部语言（含 he/ms），无需降级处理');
  console.log('  4. 推荐策略：优先用 hunyuan，he/ms 降级到 scnet');
  console.log('══════════════════════════════════════════════════════════');
}

// ─────────────────────────────────────────────
// 模块导出
// ─────────────────────────────────────────────
module.exports = {
  // ── 引擎 A：scnet (Qwen3-30B) ──
  translate,
  translateWithRetry,
  batchTranslate,
  translateInChunks,
  translateJsonObject,

  // ── 引擎 B：hunyuan (Hunyuan-MT-7B) ──
  translateHunyuan,
  translateJsonObjectHunyuan,
  isHunyuanSupported,

  // ── Prompt Builders（供外部测试 / 扩展使用）──
  buildSystemPrompt,
  buildHunyuanSystemPrompt,
  buildHunyuanJsonSystemPrompt,

  // ── JSON 解析工具 ──
  parseTranslatedJson,

  // ── 共用工具 ──
  splitTextIntoChunks,
  splitJsonIntoChunks,

  // ── 配置 & 常量 ──
  CONFIG,
  LANGUAGE_NAMES,
};

// 直接运行时执行对比测试
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
}

