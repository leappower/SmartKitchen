#!/usr/bin/env node
/**
 * test-translator-bench.js
 *
 * 对 scnet (Qwen3-30B) 和 Hunyuan-MT-7B 两个翻译引擎进行基准测试
 * 使用与生产一致的 JSON 批量翻译路径（translateJsonObject / translateJsonObjectHunyuan）
 *
 * 用法：node scripts/test-translator-bench.js
 */

'use strict';

const {
  translateJsonObject,
  translateJsonObjectHunyuan,
} = require('./unified-translator');

// ─────────────────────────────────────────────
// 测试数据：模拟真实产品字段，覆盖常见翻译难点
// ─────────────────────────────────────────────
const TEST_PAYLOAD = {
  // 产品名称
  t01_name:   '全自动旋转烤炉',
  t02_name:   '商用热风对流烤箱',
  t03_name:   '多层托盘烤炉',

  // 产品亮点（含分号列表，容易被模型截断）
  t04_highlights: '节能; 快速升温; 均匀受热; 不锈钢内胆',
  t05_highlights: '超大容量; CE/UL认证; 远程温控',

  // 使用场景
  t06_scenarios: '面包店; 酒店厨房; 连锁餐饮',
  t07_scenarios: '中央厨房; 食品加工厂',

  // 技术参数（含单位，必须保留）
  t08_power:    '380V / 50Hz / 18kW',
  t09_voltage:  '220V ± 10%',
  t10_temp:     '室温 ~ 300°C',

  // 产品尺寸
  t11_dims:     '1200mm × 800mm × 1600mm',
  t12_weight:   '净重 85kg / 毛重 102kg',

  // 材质描述
  t13_material: '304不锈钢外壳; 镀铬烤架; 双层隔热玻璃门',

  // 状态标签
  t14_status:   '热销款',
  t15_badge:    '2024爆款',

  // 较长的使用说明（测试长文本）
  t16_usage:    '适合专业面包师及糕点师使用，配合旋转托盘实现均匀烘焙效果，最多可同时烘烤8盘产品',
  t17_usage:    '清洁时请切断电源，使用湿布擦拭内腔，避免使用腐蚀性清洁剂损坏表面涂层',

  // 频率/控制方式
  t18_freq:     '50/60 Hz',
  t19_ctrl:     '触摸屏PLC控制; 可编程烘焙程序',
  t20_ctrl:     '旋钮机械调温; 独立计时报警',

  // 多语言挑战：含括号和特殊格式
  t21_note:     '产品颜色：银灰色（可定制）',
  t22_note:     '认证：CE / UL / NSF（北美版）',
  t23_note:     '交货周期：标准款15工作日；定制款30工作日',

  // 额外字段凑满 25 个（接近新分组上限）
  t24_category: '商用烤箱',
  t25_sub:      '旋转炉',
};

// 测试语言（覆盖欧洲、东亚、阿拉伯语系、东南亚）
const TEST_LANGS = ['en', 'ar', 'ja', 'de', 'vi'];

// ─────────────────────────────────────────────
// 工具
// ─────────────────────────────────────────────
function now() { return Date.now(); }

// 判断一个字段值是否"无需翻译"（纯数字/单位/符号，原样返回属于正确行为）
// 例：'380V / 50Hz / 18kW'、'220V ± 10%'、'1200mm × 800mm × 1600mm'、'50/60 Hz'
function isUntranslatable(text) {
  // 去掉所有数字、单位字母、常见符号后若剩余有意义的文字则需要翻译
  const stripped = String(text)
    .replace(/[\d\s.~±×/×%°+\-–—·]/g, '')  // 去数字和符号
    .replace(/[VvWwKkHzMmGgCcLlAaOoPpSsΩ℃℉]+/g, '')  // 去单位字母
    .trim();
  return stripped.length === 0;
}

function printResult(engine, lang, elapsed, result, original) {
  const keys = Object.keys(original);

  // 无需翻译的字段（原样返回是正确行为，不算兜底）
  const skipKeys = new Set(keys.filter(k => isUntranslatable(original[k])));

  // 需要翻译的字段子集
  const translatableKeys = keys.filter(k => !skipKeys.has(k));

  // 在可翻译字段中：结果非空且与原文不同 → 成功
  const success  = translatableKeys.filter(k => result[k] && result[k] !== original[k]);
  // 在可翻译字段中：结果为空或与原文完全一致 → 真正的兜底（疑似失败）
  const fallback = translatableKeys.filter(k => !result[k] || result[k] === original[k]);
  // 无需翻译、原样返回（正确）
  const passthru = keys.filter(k => skipKeys.has(k) && result[k] === original[k]);
  // 无需翻译但被意外修改（警告）
  const mutated  = keys.filter(k => skipKeys.has(k) && result[k] !== original[k]);

  console.log(`\n  ✅ [${engine}][${lang}] 完成 | 耗时: ${(elapsed/1000).toFixed(2)}s`);
  console.log(`     成功翻译: ${success.length}/${translatableKeys.length} 个字段`);
  if (passthru.length > 0) {
    console.log(`     无需翻译（原样保留，正常）: ${passthru.length} 个 → ${passthru.join(', ')}`);
  }
  if (mutated.length > 0) {
    console.warn(`     ⚠️  纯数字/单位字段被意外修改: ${mutated.length} 个 → ${mutated.join(', ')}`);
    for (const k of mutated) {
      console.warn(`       ${k}: "${original[k]}" → "${result[k]}"`);
    }
  }
  if (fallback.length > 0) {
    console.warn(`     ⚠️  真正兜底（翻译失败）: ${fallback.length} 个 → ${fallback.slice(0,5).join(', ')}${fallback.length>5?'...':''}`);
  }
  // 打印前 5 个翻译样例
  console.log('     样例:');
  const samples = success.slice(0, 5);
  for (const k of samples) {
    const src = String(original[k]).slice(0, 40);
    const tgt = String(result[k]).slice(0, 50);
    console.log(`       ${k}: "${src}" → "${tgt}"`);
  }
}

function printError(engine, lang, elapsed, err) {
  console.log(`\n  ❌ [${engine}][${lang}] 失败 | 耗时: ${(elapsed/1000).toFixed(2)}s`);
  console.log(`     错误: ${err.message}`);
}

// ─────────────────────────────────────────────
// 单引擎单语言测试
// ─────────────────────────────────────────────
async function testOne(engine, lang) {
  const t0 = now();
  try {
    let result;
    if (engine === 'hunyuan') {
      result = await translateJsonObjectHunyuan(TEST_PAYLOAD, lang);
    } else {
      result = await translateJsonObject(TEST_PAYLOAD, lang);
    }
    printResult(engine, lang, now() - t0, result, TEST_PAYLOAD);
    return { engine, lang, ok: true, elapsed: now() - t0 };
  } catch (err) {
    printError(engine, lang, now() - t0, err);
    return { engine, lang, ok: false, elapsed: now() - t0 };
  }
}

// ─────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  翻译引擎基准测试');
  console.log('  字段数:', Object.keys(TEST_PAYLOAD).length);
  console.log('  测试语言:', TEST_LANGS.join(', '));
  console.log('  模式: 两引擎各自对所有语言并发测试');
  console.log('═══════════════════════════════════════════════════\n');

  // ── 阶段 1：Hunyuan 引擎，全语言并发 ──────────────────────────────────────
  console.log('━━━ 阶段 1 / Hunyuan-MT-7B (SiliconFlow) ━━━');
  const t1 = now();
  const hunyuanResults = await Promise.all(
    TEST_LANGS.map(lang => testOne('hunyuan', lang))
  );
  const t1elapsed = ((now() - t1) / 1000).toFixed(2);

  // ── 阶段 2：scnet 引擎，全语言并发 ────────────────────────────────────────
  console.log('\n━━━ 阶段 2 / scnet + Qwen3-30B ━━━');
  const t2 = now();
  const scnetResults = await Promise.all(
    TEST_LANGS.map(lang => testOne('scnet', lang))
  );
  const t2elapsed = ((now() - t2) / 1000).toFixed(2);

  // ── 汇总 ──────────────────────────────────────────────────────────────────
  console.log('\n\n═══════════════════════════════════════════════════');
  console.log('  汇总对比');
  console.log('═══════════════════════════════════════════════════');

  console.log(`\n  Hunyuan-MT-7B  | 总耗时: ${t1elapsed}s`);
  for (const r of hunyuanResults) {
    const status = r.ok ? '✅' : '❌';
    console.log(`    ${status} [${r.lang.padEnd(5)}] ${(r.elapsed/1000).toFixed(2)}s`);
  }

  console.log(`\n  scnet Qwen3-30B | 总耗时: ${t2elapsed}s`);
  for (const r of scnetResults) {
    const status = r.ok ? '✅' : '❌';
    console.log(`    ${status} [${r.lang.padEnd(5)}] ${(r.elapsed/1000).toFixed(2)}s`);
  }

  // 速度对比
  const hOk    = hunyuanResults.filter(r => r.ok).length;
  const sOk    = scnetResults.filter(r => r.ok).length;
  const hAvg   = hunyuanResults.reduce((a, r) => a + r.elapsed, 0) / hunyuanResults.length;
  const sAvg   = scnetResults.reduce((a, r) => a + r.elapsed, 0) / scnetResults.length;
  const faster = hAvg < sAvg ? 'Hunyuan' : 'scnet';
  const ratio  = Math.max(hAvg, sAvg) / Math.min(hAvg, sAvg);

  console.log('\n  ─────────────────────────────────────────────────');
  console.log(`  成功率  Hunyuan: ${hOk}/${TEST_LANGS.length}   scnet: ${sOk}/${TEST_LANGS.length}`);
  console.log(`  平均RTT Hunyuan: ${(hAvg/1000).toFixed(2)}s   scnet: ${(sAvg/1000).toFixed(2)}s`);
  console.log(`  更快的是: ${faster}（快 ${ratio.toFixed(1)}×）`);
  console.log('═══════════════════════════════════════════════════\n');

  // ── 全量预估 ──────────────────────────────────────────────────────────────
  console.log('  全量翻译预估（基于本次实测 RTT）');
  const totalKeys = 1324;
  const chunkSize = 25;   // 新参数
  const groups    = Math.ceil(totalKeys / chunkSize);
  const langsH    = 22;   // Hunyuan 语言数
  const globalC   = 40;   // 新全局并发

  const hAvgPerGroup  = hAvg / 1000;  // 秒
  const sAvgPerGroup  = sAvg / 1000;
  const hTotalBatches = Math.ceil((groups * langsH) / globalC);
  const sTotalBatches = Math.ceil((groups * 2)      / 20);  // scnet 只处理 he/ms 2种语言

  console.log(`  字段数: ${totalKeys}  分组: ${groups}组  Hunyuan语言数: ${langsH}`);
  console.log(`  Hunyuan 预估: ${hTotalBatches}批 × ${hAvgPerGroup.toFixed(1)}s = ${(hTotalBatches * hAvgPerGroup / 60).toFixed(1)} 分钟`);
  console.log(`  scnet  预估: ${sTotalBatches}批 × ${sAvgPerGroup.toFixed(1)}s = ${(sTotalBatches * sAvgPerGroup / 60).toFixed(1)} 分钟（仅 he/ms）`);
  console.log('');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
