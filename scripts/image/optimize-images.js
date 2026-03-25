#!/usr/bin/env node
/**
 * optimize-images.js — 图片优化脚本（原地替换 + 增量缓存模式）
 *
 * ── 核心机制：增量压缩（防多次压缩劣化）────────────────────────────────────
 *
 *   每次处理前计算源文件的 SHA-256 哈希，与 .image-cache.json 中记录的上次哈希对比：
 *     - 哈希未变（图片未被修改）→ 跳过处理，保留上次输出（不再压缩）
 *     - 哈希已变（图片被替换/修改）→ 重新压缩，更新缓存记录
 *     - 缓存中没有该文件 → 首次处理，压缩后写入缓存
 *
 *   这样无论 build 执行多少次，每张图片只被压缩一次，不会因反复有损压缩而越来越模糊。
 *   缓存文件保存在 src/assets/images/.image-cache.json，已纳入 git 版本管理（多人协作共享缓存）。
 *
 * ── 标准压缩流程 ─────────────────────────────────────────────────────────────
 *   1. 将 src/assets/images/ 改名为 src/assets/imagesCopy/（原图备份）
 *   2. 创建新的 src/assets/images/ 目录
 *   3. 遍历 imagesCopy/ 中所有图片文件，按以下规则处理：
 *      - WebP 图片且 ≤ 1MB：
 *          已有缓存且哈希未变 → 直接复制（跳过重压缩）
 *          无缓存或哈希变化  → 原样复制（已是最优格式），更新缓存
 *      - WebP 图片且 > 1MB：
 *          已有缓存且哈希未变 → 直接复制上次产物（跳过重压缩，防劣化）
 *          无缓存或哈希变化  → 重新压缩，更新缓存
 *      - PNG/JPG/JPEG 图片：转换为 WebP（不保留原格式，IE 已死）
 *          已有缓存且哈希未变 → 直接复制上次 WebP 产物（跳过转换）
 *          无缓存或哈希变化  → 重新转换，更新缓存
 *      - 其他文件（JSON 等）：直接复制，不参与缓存
 *   4. 删除 imagesCopy/ 备份目录
 *
 * ── --download-remote 流程 ────────────────────────────────────────────────────
 *   1. 读取 image-assets.js 中所有外部 HTTP(S) 图片 URL
 *   2. 已有本地文件（images/<key>.webp）且未指定 --force → 跳过，不重复下载
 *   3. 下载新图片，用 sharp 转换为 WebP，存入 src/assets/images/
 *   4. 更新 image-assets.js 和 src/index.html 中的引用为本地路径
 *   5. 重新生成 image-manifest.json
 *
 * ── 命名规则（snake_case）────────────────────────────────────────────────────
 *   - 所有字母转小写
 *   - 连字符（-）替换为下划线（_）
 *   - 加号（+）替换为 _p（如 M4DAD+1 → m4dad_p1）
 *   - 不允许空格或其他特殊字符
 *   - 示例：ESL-GB50_1 → esl_gb50_1、LOGO_HTML → logo_html
 *
 * ── 用法 ─────────────────────────────────────────────────────────────────────
 *   node scripts/optimize-images.js                    # 增量压缩（跳过未变动图片）
 *   node scripts/optimize-images.js --force            # 强制全量重新压缩（忽略缓存）
 *   node scripts/optimize-images.js --dry-run          # 模拟运行，不执行任何文件操作
 *   node scripts/optimize-images.js --stats            # 仅统计当前 images 目录，不处理
 *   node scripts/optimize-images.js --keep-copy        # 处理完后保留 imagesCopy（调试用）
 *   node scripts/optimize-images.js --gen-manifest     # 仅重新生成 manifest，不处理图片
 *   node scripts/optimize-images.js --download-remote  # 下载所有外部图片并本地化（增量）
 *   node scripts/optimize-images.js --download-remote --force  # 强制重新下载所有图片
 *   node scripts/optimize-images.js --init-cache       # 为已压缩图片初始化缓存记录（避免二次压缩）
 *                                                       # 适用场景：首次启用缓存、新成员 clone 项目后
 *
 * 注意：脚本是幂等的。若 imagesCopy 已存在（上次中断），会直接从 imagesCopy 继续处理。
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const crypto = require('crypto');

// ─── 路径配置 ─────────────────────────────────────────────────────────────────
const ASSETS_DIR   = path.join(__dirname, '../../src/assets');
const IMAGES_DIR   = path.join(ASSETS_DIR, 'images');
const BACKUP_DIR   = path.join(ASSETS_DIR, 'imagesCopy');

// ─── 命令行参数 ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN         = args.includes('--dry-run');
const STATS_ONLY      = args.includes('--stats');
const KEEP_COPY       = args.includes('--keep-copy');
const GEN_MANIFEST    = args.includes('--gen-manifest');
const DOWNLOAD_REMOTE = args.includes('--download-remote');
const FORCE           = args.includes('--force');  // 强制全量重新压缩，忽略缓存
const INIT_CACHE      = args.includes('--init-cache');  // 为已压缩图片初始化缓存记录

// ─── 路径配置（download-remote 用到的源文件）────────────────────────────────
const IMAGE_ASSETS_JS = path.join(ASSETS_DIR, 'image-assets.js');
const INDEX_HTML      = path.join(__dirname, '../../src/index.html');

// ─── 增量缓存路径 ─────────────────────────────────────────────────────────────
// 记录每个源文件的 SHA-256 → 输出文件名 映射，防止反复压缩劣化
const CACHE_FILE = path.join(IMAGES_DIR, '.image-cache.json');

// ─── 压缩参数 ─────────────────────────────────────────────────────────────────
const WEBP_QUALITY   = 85;    // WebP 质量（0-100），85 = 视觉无损
// eslint-disable-next-line no-unused-vars
const PNG_QUALITY    = 80;    // PNG palette 调色板颜色数控制（80 ≈ 200 色），预留
// eslint-disable-next-line no-unused-vars
const JPEG_QUALITY   = 82;    // JPEG 压缩质量，预留
const LARGE_THRESHOLD = 1 * 1024 * 1024;  // 1MB：超过此大小的 WebP 也重新压缩

// ─── ANSI 颜色 ────────────────────────────────────────────────────────────────
const c = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  blue:   '\x1b[34m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
};

function log(msg)    { console.log(`${c.blue}▸${c.reset} ${msg}`); }
function ok(msg)     { console.log(`${c.green}✔${c.reset} ${msg}`); }
function warn(msg)   { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }
function fail(msg)   { console.log(`${c.red}✘${c.reset} ${msg}`); }
function skip(msg)   { console.log(`${c.gray}  ⏭ ${msg}${c.reset}`); }
function title(msg)  { console.log(`\n${c.bold}${c.blue}══ ${msg} ══${c.reset}`); }
function drylog(msg) { console.log(`${c.cyan}[DRY]${c.reset} ${msg}`); }

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * 将文件名（不含扩展名）规范化为 snake_case 小写
 * 规则：大写→小写，连字符→下划线，+→_p，其余特殊字符→下划线
 * 示例：ESL-GB50_1 → esl_gb50_1，M4DAD+1 → m4dad_p1，LOGO_HTML → logo_html
 */
function toSnakeCase(name) {
  return name
    .toLowerCase()
    .replace(/\+/g, '_p')     // + 号 → _p
    .replace(/-/g, '_')       // 连字符 → 下划线
    .replace(/[^a-z0-9_]/g, '_')  // 其他特殊字符 → 下划线
    .replace(/__+/g, '_')     // 连续下划线合并
    .replace(/^_|_$/g, '');   // 去掉首尾下划线
}

// ─── 增量缓存（防多次压缩劣化）────────────────────────────────────────────────

/**
 * 计算文件的 SHA-256 哈希（用于判断源文件是否发生变化）
 * @param {string} filePath
 * @returns {string} hex 字符串
 */
function hashFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * 读取增量缓存文件
 * 格式：{ "<源文件名>": { "hash": "<sha256>", "output": "<输出文件名>", "ts": <时间戳> }, ... }
 * @returns {object}
 */
function loadCache() {
  // FORCE 模式下直接返回空缓存，强制全量重新处理
  if (FORCE) return {};
  if (!fs.existsSync(CACHE_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (_) {
    warn('缓存文件损坏，将重新处理所有图片');
    return {};
  }
}

/**
 * 保存增量缓存文件
 * @param {object} cache
 */
function saveCache(cache) {
  if (DRY_RUN) return;
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (e) {
    warn(`缓存文件写入失败（不影响图片处理）: ${e.message}`);
  }
}

/**
 * 判断文件是否需要重新处理
 * @param {string} filename        - 源文件名（用作缓存 key）
 * @param {string} srcPath         - 源文件完整路径（用于计算哈希）
 * @param {string} expectedOutput  - 期望的输出文件名（如 esl_gb50_1.webp）
 * @param {object} cache           - 当前缓存对象
 * @returns {{ skip: boolean, hash: string }}
 *   skip=true  → 哈希未变且输出文件存在，可安全跳过
 *   skip=false → 需要重新处理；hash 是当前源文件的哈希（供调用方更新缓存）
 */
function shouldSkip(filename, srcPath, expectedOutput, cache) {
  const entry = cache[filename];
  if (!entry) return { skip: false, hash: hashFile(srcPath) };

  const currentHash = hashFile(srcPath);
  if (entry.hash !== currentHash) {
    // 源文件内容已变化，需要重新处理
    return { skip: false, hash: currentHash };
  }

  // 哈希未变：检查输出文件是否真实存在
  const outputPath = path.join(IMAGES_DIR, expectedOutput);
  if (!fs.existsSync(outputPath)) {
    // 输出文件丢失（手动删除 / 目录重建），重新处理
    return { skip: false, hash: currentHash };
  }

  return { skip: true, hash: currentHash };
}

function getSavings(original, optimized) {
  if (original === 0) return { saved: 0, pct: '0.0' };
  const saved = original - optimized;
  const pct = ((saved / original) * 100).toFixed(1);
  return { saved, pct };
}

function getExt(filename) {
  return path.extname(filename).toLowerCase().replace('.', '');
}

/**
 * 判断文件是否需要处理（压缩或转换）
 * 返回 'compress-webp' | 'compress-png' | 'compress-jpg' | 'copy' | 'drop'
 *
 * 注：PNG/JPG 只转 WebP，不再输出 PNG fallback（IE 已死，WebP 支持率 97%+）
 *     原始 PNG/JPG 文件本身不复制到输出目录（'drop'）
 */
function getAction(filename, fileSize) {
  const ext = getExt(filename);
  if (ext === 'webp') {
    return fileSize > LARGE_THRESHOLD ? 'compress-webp' : 'copy';
  }
  if (ext === 'png') return 'compress-png';
  if (ext === 'jpg' || ext === 'jpeg') return 'compress-jpg';
  // 其他文件（svg、json、mp4 等）直接复制
  return 'copy';
}

/**
 * 处理单个图片文件
 * @param {string} filename  - 文件名（含扩展名）
 * @param {string} srcDir    - 来源目录（imagesCopy）
 * @param {string} destDir   - 目标目录（images）
 * @param {object} cache     - 增量缓存对象（会被直接修改）
 * @returns {object} - 处理结果统计
 */
async function processFile(filename, srcDir, destDir, cache) {
  const srcPath  = path.join(srcDir, filename);
  const srcSize  = fs.statSync(srcPath).size;
  const ext      = getExt(filename);
  const basename = path.basename(filename, `.${ext}`);
  const action   = getAction(filename, srcSize);

  const result = {
    filename,
    action,
    srcSize,
    outputs: [],   // [{ path, size, role }]
    error: null,
    skipped: false,
  };

  if (DRY_RUN) {
    drylog(`${filename}  →  [${action}]  (${formatBytes(srcSize)})`);
    return result;
  }

  // ── 增量判断：非图片文件（JSON 等）不参与缓存，直接处理 ──────────────────
  const isImage = ['webp', 'png', 'jpg', 'jpeg'].includes(ext);

  try {
    switch (action) {
    case 'copy': {
      const fileExt = path.extname(filename);
      const nameBase = path.basename(filename, fileExt);
      const normalizedName = fileExt.toLowerCase() === '.webp'
        ? `${toSnakeCase(nameBase)}${fileExt}`
        : filename;
      const destPath = path.join(destDir, normalizedName);

      if (isImage) {
        // WebP ≤1MB：检查增量缓存，未变则跳过
        const { skip, hash } = shouldSkip(filename, srcPath, normalizedName, cache);
        if (skip) {
          result.skipped = true;
          result.outputs.push({ path: destPath, size: fs.statSync(destPath).size, role: 'cache-hit' });
          break;
        }
        fs.copyFileSync(srcPath, destPath);
        cache[filename] = { hash, output: normalizedName, ts: Date.now() };
      } else {
        // 非图片（JSON 等）：直接复制，不参与缓存
        fs.copyFileSync(srcPath, destPath);
      }
      result.outputs.push({ path: destPath, size: fs.statSync(destPath).size, role: 'copy' });
      break;
    }

    case 'compress-webp': {
      // 大 WebP 重新压缩，同时规范化文件名为 snake_case
      const normalizedName = `${toSnakeCase(basename)}.webp`;
      const destPath = path.join(destDir, normalizedName);

      const { skip, hash } = shouldSkip(filename, srcPath, normalizedName, cache);
      if (skip) {
        result.skipped = true;
        result.outputs.push({ path: destPath, size: fs.statSync(destPath).size, role: 'cache-hit' });
        break;
      }

      await sharp(srcPath)
        .webp({ quality: WEBP_QUALITY, effort: 5, alphaQuality: 90 })
        .toFile(destPath);
      const newSize = fs.statSync(destPath).size;
      cache[filename] = { hash, output: normalizedName, ts: Date.now() };
      result.outputs.push({ path: destPath, size: newSize, role: 'webp-recompressed' });
      break;
    }

    case 'compress-png': {
      // PNG → 只输出 WebP（不再保留 PNG，IE 已死，WebP 支持率 97%+）
      const normalizedName = `${toSnakeCase(basename)}.webp`;
      const webpDest = path.join(destDir, normalizedName);

      const { skip, hash } = shouldSkip(filename, srcPath, normalizedName, cache);
      if (skip) {
        result.skipped = true;
        result.outputs.push({ path: webpDest, size: fs.statSync(webpDest).size, role: 'cache-hit' });
        break;
      }

      await sharp(srcPath)
        .webp({
          quality: WEBP_QUALITY,
          lossless: false,
          smartSubsample: true,
          effort: 4,
          alphaQuality: 90,
        })
        .toFile(webpDest);

      cache[filename] = { hash, output: normalizedName, ts: Date.now() };
      result.outputs.push({ path: webpDest, size: fs.statSync(webpDest).size, role: 'webp-from-png' });
      break;
    }

    case 'compress-jpg': {
      // JPG → 只输出 WebP（不再保留 JPG）
      const normalizedName = `${toSnakeCase(basename)}.webp`;
      const webpDest = path.join(destDir, normalizedName);

      const { skip, hash } = shouldSkip(filename, srcPath, normalizedName, cache);
      if (skip) {
        result.skipped = true;
        result.outputs.push({ path: webpDest, size: fs.statSync(webpDest).size, role: 'cache-hit' });
        break;
      }

      await sharp(srcPath)
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toFile(webpDest);

      cache[filename] = { hash, output: normalizedName, ts: Date.now() };
      result.outputs.push({ path: webpDest, size: fs.statSync(webpDest).size, role: 'webp-from-jpg' });
      break;
    }
    }
  } catch (err) {
    result.error = err.message;
    fail(`处理失败 ${filename}: ${err.message}`);
    // 降级：直接复制原文件，确保产物完整
    try {
      const fallbackDest = path.join(destDir, filename);
      fs.copyFileSync(srcPath, fallbackDest);
      result.outputs.push({ path: fallbackDest, size: srcSize, role: 'fallback-copy' });
      warn(`已将 ${filename} 原样复制作为 fallback`);
    } catch (copyErr) {
      fail(`fallback 复制也失败: ${copyErr.message}`);
    }
  }

  return result;
}

// ─── 统计模式 ─────────────────────────────────────────────────────────────────
async function runStats() {
  title('当前 images 目录统计');
  if (!fs.existsSync(IMAGES_DIR)) {
    fail(`目录不存在: ${IMAGES_DIR}`);
    return;
  }
  const files = fs.readdirSync(IMAGES_DIR);
  const byExt = {};
  let total = 0;
  files.forEach(f => {
    const ext = getExt(f) || 'other';
    const size = fs.statSync(path.join(IMAGES_DIR, f)).size;
    byExt[ext] = (byExt[ext] || { count: 0, size: 0 });
    byExt[ext].count++;
    byExt[ext].size += size;
    total += size;
  });
  Object.entries(byExt).sort((a,b) => b[1].size - a[1].size).forEach(([ext, s]) => {
    log(`  .${ext.padEnd(6)} ${String(s.count).padStart(4)} 个    ${formatBytes(s.size)}`);
  });
  log(`  ${'合计'.padEnd(7)} ${String(files.length).padStart(4)} 个    ${formatBytes(total)}`);
}

// ─── 主流程 ───────────────────────────────────────────────────────────────────
async function main() {
  title('图片优化（原地替换 + 增量缓存）');

  if (DRY_RUN)  warn('DRY RUN 模式：不会执行任何实际文件操作');
  if (FORCE)    warn('FORCE 模式：忽略缓存，强制全量重新压缩所有图片');
  if (STATS_ONLY) { await runStats(); return; }
  if (GEN_MANIFEST) { generateManifest(); return; }
  if (DOWNLOAD_REMOTE) { await downloadRemoteImages(); return; }
  if (INIT_CACHE) { await initCache(); return; }

  // ── Step 1: 确定源目录 ────────────────────────────────────────────────────
  // 幂等处理：若 imagesCopy 已存在（上次中断）则直接使用，否则从 images 改名
  let srcDir;
  if (fs.existsSync(BACKUP_DIR)) {
    warn('imagesCopy 已存在（上次中断？），直接从备份继续');
    srcDir = BACKUP_DIR;
  } else if (fs.existsSync(IMAGES_DIR)) {
    log('Step 1: images → imagesCopy (改名备份)');
    if (!DRY_RUN) {
      fs.renameSync(IMAGES_DIR, BACKUP_DIR);
    } else {
      drylog(`fs.renameSync(${IMAGES_DIR}, ${BACKUP_DIR})`);
    }
    srcDir = BACKUP_DIR;
  } else {
    fail(`images 目录不存在: ${IMAGES_DIR}`);
    process.exit(1);
  }

  // ── Step 2: 创建新 images 目录 ────────────────────────────────────────────
  log('Step 2: 创建新的 images/ 目录');
  if (!DRY_RUN) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  } else {
    drylog(`fs.mkdirSync(${IMAGES_DIR})`);
  }

  // ── Step 2b: 加载增量缓存 ─────────────────────────────────────────────────
  // 缓存文件在备份目录里（因为 images 刚被重命名为 imagesCopy）
  // 迁移：把 backup 里的缓存文件复制到新 images 目录，供本次写入
  const backupCache = path.join(BACKUP_DIR, '.image-cache.json');
  if (!DRY_RUN && fs.existsSync(backupCache)) {
    try {
      fs.copyFileSync(backupCache, CACHE_FILE);
    } catch (_) { /* 拷贝失败不影响主流程，当作全量处理 */ }
  }
  const cache = loadCache();
  const cacheMode = FORCE ? '强制全量' : '增量';
  log(`Step 2b: 加载增量缓存（${cacheMode}模式，已缓存 ${Object.keys(cache).length} 条记录）`);

  // ── Step 3: 处理所有文件 ──────────────────────────────────────────────────
  log('Step 3: 处理 imagesCopy/ 中的图片');
  // dry-run 下 rename 未真正执行，fallback 读 images 目录做预览
  const readDir = DRY_RUN ? (fs.existsSync(srcDir) ? srcDir : IMAGES_DIR) : srcDir;
  const files = fs.readdirSync(readDir).filter(f => {
    const stat = fs.statSync(path.join(readDir, f));
    return stat.isFile() && f !== '.image-cache.json';  // 跳过缓存文件本身
  });

  log(`发现 ${files.length} 个文件`);

  const CONCURRENCY = 4;
  const allResults  = [];

  let totalSrcSize  = 0;
  let totalDestSize = 0;
  let countProcessed = 0;
  let countCopied    = 0;
  let countSkipped   = 0;
  let countFailed    = 0;

  for (let i = 0; i < files.length; i += CONCURRENCY) {
    const batch = files.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(f => processFile(f, readDir, IMAGES_DIR, cache))
    );
    allResults.push(...batchResults);

    batchResults.forEach(r => {
      totalSrcSize += r.srcSize;
      const outSize = r.outputs.reduce((s, o) => s + o.size, 0);
      totalDestSize += outSize;

      if (r.error) {
        countFailed++;
      } else if (r.skipped) {
        countSkipped++;
        skip(`${r.filename}  (${formatBytes(r.srcSize)}, 哈希未变，跳过)`);
      } else if (r.action === 'copy') {
        countCopied++;
        if (!DRY_RUN) skip(`${r.filename}  (${formatBytes(r.srcSize)}, 直接复制)`);
      } else {
        countProcessed++;
        if (!DRY_RUN) {
          const savings = getSavings(r.srcSize, outSize);
          const outLabels = r.outputs.map(o => {
            const oExt = path.extname(o.path).slice(1).toUpperCase();
            return `${oExt}: ${formatBytes(o.size)}`;
          }).join('  ');
          ok(`${r.filename}  ↓${savings.pct}%  →  ${outLabels}`);
        }
      }
    });
  }

  // ── Step 4: 删除备份目录 ──────────────────────────────────────────────────
  if (KEEP_COPY) {
    warn('Step 4: --keep-copy 已设置，保留 imagesCopy/');
  } else {
    log('Step 4: 删除 imagesCopy/ 备份目录');
    if (!DRY_RUN) {
      fs.rmSync(BACKUP_DIR, { recursive: true, force: true });
      ok('imagesCopy/ 已删除');
    } else {
      drylog(`fs.rmSync(${BACKUP_DIR}, { recursive: true })`);
    }
  }

  // ── Step 4b: 保存增量缓存 ─────────────────────────────────────────────────
  if (!DRY_RUN) {
    saveCache(cache);
    ok(`增量缓存已保存（${Object.keys(cache).length} 条记录）`);
  }

  // ── 输出统计 ──────────────────────────────────────────────────────────────
  console.log('');
  title('优化统计');
  log(`压缩/转换: ${countProcessed} 个  直接复制: ${countCopied} 个  跳过(缓存命中): ${countSkipped} 个  失败: ${countFailed} 个`);

  if (!DRY_RUN) {
    const s = getSavings(totalSrcSize, totalDestSize);
    log(`原始总大小:  ${formatBytes(totalSrcSize)}`);
    log(`优化后大小:  ${formatBytes(totalDestSize)}`);
    if (parseFloat(s.pct) > 0) {
      ok(`节省: ${formatBytes(s.saved)}  (↓${s.pct}%)`);
    } else {
      warn(`大小变化: ${formatBytes(Math.abs(s.saved))}  (${parseFloat(s.pct) > 0 ? '↓' : '↑'}${Math.abs(parseFloat(s.pct)).toFixed(1)}%)`);
    }
  }

  ok(`输出目录: ${IMAGES_DIR}`);

  // ── Step 5: 生成 image-manifest.json ─────────────────────────────────────
  if (!DRY_RUN) {
    log('Step 5: 生成 image-manifest.json');
    generateManifest();
  } else {
    drylog('生成 image-manifest.json（dry-run 跳过）');
  }

  if (countFailed > 0) {
    warn(`${countFailed} 个文件处理失败，已用原文件兜底`);
    process.exit(1);
  }
}

/**
 * 为当前 images/ 目录中已压缩的图片初始化缓存记录
 *
 * 使用场景：
 *   1. 首次引入增量缓存机制时，图片已经压缩过但缓存文件为空
 *   2. 新成员 clone 项目后（缓存不在 git 里时），避免首次 build 触发全量二次压缩
 *   3. 缓存文件损坏/丢失时，快速重建
 *
 * 逻辑：
 *   - 扫描 images/ 中所有 WebP 文件
 *   - 以"当前文件内容"作为哈希基准写入缓存，标记为"已处理"
 *   - 这样下次 build 时脚本会认为这些文件"哈希未变"，直接跳过，不再二次压缩
 *   - 对已有缓存记录的文件：默认跳过（不覆盖），--force 时全量刷新
 */
async function initCache() {
  title('初始化图片缓存记录（--init-cache）');

  if (!fs.existsSync(IMAGES_DIR)) {
    fail(`images 目录不存在: ${IMAGES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(IMAGES_DIR).filter(f => {
    const stat = fs.statSync(path.join(IMAGES_DIR, f));
    return stat.isFile() && f !== '.image-cache.json';
  });

  const imageFiles = files.filter(f => {
    const ext = getExt(f);
    return ['webp', 'png', 'jpg', 'jpeg'].includes(ext);
  });

  if (imageFiles.length === 0) {
    warn('images/ 目录中没有图片文件，无需初始化');
    return;
  }

  log(`发现 ${imageFiles.length} 个图片文件`);

  // 加载已有缓存（FORCE 模式则忽略，从头重建）
  const cache = FORCE ? {} : loadCache();
  const existingCount = Object.keys(cache).length;
  if (existingCount > 0 && !FORCE) {
    log(`已有缓存记录 ${existingCount} 条，将跳过已记录文件（使用 --force 可强制全量刷新）`);
  }

  let countNew    = 0;
  let countExist  = 0;

  for (const filename of imageFiles) {
    const filePath = path.join(IMAGES_DIR, filename);
    // init-cache 模式：以 images/ 里的文件名作为"输出名"（因为文件已经是最终产物）

    // 已有缓存且非 force：跳过
    if (cache[filename] && !FORCE) {
      countExist++;
      continue;
    }

    if (DRY_RUN) {
      drylog(`${filename}  →  写入缓存记录  (${formatBytes(fs.statSync(filePath).size)})`);
      countNew++;
      continue;
    }

    try {
      const hash = hashFile(filePath);
      cache[filename] = {
        hash,
        output: filename,
        ts: Date.now(),
        initBy: '--init-cache',  // 标记来源，便于排查
      };
      ok(`${path.basename(filename, path.extname(filename)).padEnd(30)} ${formatBytes(fs.statSync(filePath).size).padStart(9)}  ✔ 缓存已写入`);
      countNew++;
    } catch (err) {
      fail(`${filename}: 哈希计算失败 - ${err.message}`);
    }
  }

  if (!DRY_RUN) {
    saveCache(cache);
    ok(`缓存文件已保存: ${CACHE_FILE}`);
  }

  console.log('');
  title('初始化统计');
  log(`新写入: ${countNew}  已有(跳过): ${countExist}  总计: ${imageFiles.length}`);
  if (countNew > 0) {
    ok(`完成！下次 build 时这 ${countNew} 张图片将被跳过，不再二次压缩`);
  } else {
    ok('所有图片均已有缓存记录，无需更新');
  }
}

/**
 * 扫描 images/ 目录，生成 image-manifest.json
 * 格式：{ "version": 1, "images": ["B1RAC_1", "ESL-4BQ30_1", ...] }
 * 可单独调用：node scripts/optimize-images.js --gen-manifest
 */
function generateManifest() {
  if (!fs.existsSync(IMAGES_DIR)) {
    warn('images 目录不存在，跳过 manifest 生成');
    return;
  }

  const webpFiles = fs.readdirSync(IMAGES_DIR)
    .filter(f => f.toLowerCase().endsWith('.webp'))
    .map(f => path.basename(f, '.webp'))
    .sort();

  const manifest = {
    version: 1,
    generated: new Date().toISOString(),
    images: webpFiles,
  };

  const manifestPath = path.join(IMAGES_DIR, 'image-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  ok(`image-manifest.json 已生成，包含 ${webpFiles.length} 张图片`);
}

// ─── 下载远程图片 ─────────────────────────────────────────────────────────────

/**
 * 用 Node 内置 http/https 下载 URL 内容到 Buffer
 * 支持最多 5 次重定向
 */
function downloadBuffer(url, redirectCount) {
  const count = redirectCount || 0;
  return new Promise((resolve, reject) => {
    if (count > 5) {
      reject(new Error('重定向次数过多: ' + url));
      return;
    }
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; image-downloader/1.0)',
        'Accept': 'image/*,*/*;q=0.8',
      },
      timeout: 30000,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(downloadBuffer(res.headers.location, count + 1));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('请求超时: ' + url));
    });
  });
}

/**
 * 从 image-assets.js 源码中提取所有外部 URL 条目
 * 返回 [{ key, url }] 数组
 */
function extractRemoteUrls(source) {
  const entries = [];
  // 匹配形如:  key: 'https://...',  或  key: "https://...",
  const re = /^\s*([\w_]+)\s*:\s*['"]((https?:\/\/)[^'"]+)['"]/gm;
  let m;
  while ((m = re.exec(source)) !== null) {
    entries.push({ key: m[1], url: m[2] });
  }
  return entries;
}

/**
 * 下载所有外部图片 → 压缩为 WebP → 存入 images/
 * 然后替换 image-assets.js 和 index.html 中的引用
 * 增量模式：已有本地文件且未指定 --force 时跳过，不重复下载
 */
async function downloadRemoteImages() {
  title('下载远程图片并本地化');

  if (FORCE) warn('FORCE 模式：强制重新下载所有图片，忽略已有本地文件');

  if (!fs.existsSync(IMAGE_ASSETS_JS)) {
    fail('找不到 image-assets.js: ' + IMAGE_ASSETS_JS);
    process.exit(1);
  }

  const source = fs.readFileSync(IMAGE_ASSETS_JS, 'utf8');
  const entries = extractRemoteUrls(source);

  if (entries.length === 0) {
    ok('未发现外部图片 URL，无需处理');
    return;
  }

  log(`发现 ${entries.length} 个外部图片 URL`);
  entries.forEach(e => log(`  ${e.key.padEnd(22)} ${e.url.substring(0, 80)}...`));

  if (!fs.existsSync(IMAGES_DIR)) {
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
  }

  // 下载并转换
  let countOk   = 0;
  let countSkip = 0;
  let countFail = 0;

  /** @type {Array<{key: string, url: string, localKey: string}>} */
  const succeeded = [];

  for (const entry of entries) {
    const localKey = toSnakeCase(entry.key);  // 规范化为 snake_case
    const destPath = path.join(IMAGES_DIR, `${localKey}.webp`);

    if (DRY_RUN) {
      const exists = fs.existsSync(destPath);
      drylog(`${exists && !FORCE ? '[跳过] ' : '[下载] '}${entry.url.substring(0, 70)} → ${localKey}.webp`);
      succeeded.push({ key: entry.key, url: entry.url, localKey });
      continue;
    }

    // 增量判断：已有本地文件且非强制模式 → 跳过下载
    if (!FORCE && fs.existsSync(destPath)) {
      const size = fs.statSync(destPath).size;
      skip(`${entry.key}  →  ${localKey}.webp  (${formatBytes(size)}, 已存在，跳过)`);
      succeeded.push({ key: entry.key, url: entry.url, localKey });
      countSkip++;
      continue;
    }

    log(`下载 ${entry.key}: ${entry.url.substring(0, 70)}...`);

    try {
      const buf = await downloadBuffer(entry.url);
      await sharp(buf)
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toFile(destPath);
      const size = fs.statSync(destPath).size;
      ok(`  ✔ ${localKey}.webp  (${formatBytes(size)})`);
      succeeded.push({ key: entry.key, url: entry.url, localKey });
      countOk++;
    } catch (err) {
      fail(`  ✘ ${entry.key}: ${err.message}`);
      countFail++;
    }
  }

  if (succeeded.length === 0) {
    fail('所有下载均失败，终止替换');
    process.exit(1);
  }

  // 只有实际下载了新图片才更新引用（跳过的图片引用已经是本地路径，不需要替换）
  const newlyDownloaded = succeeded.filter(s => {
    // 判断依据：image-assets.js 里该 key 当前是否还是 URL
    const re = new RegExp('\\b' + s.key + '\\s*:\\s*[\'"]https?://');
    return re.test(source);
  });

  if (newlyDownloaded.length > 0) {
    // 替换 image-assets.js 中的外部 URL
    log('替换 image-assets.js 中的外部 URL');
    let newSource = source;
    for (const { key, url, localKey } of newlyDownloaded) {
      const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(
        '(\\b' + key + '\\s*:\\s*)[\'"]' + escapedUrl + '[\'"]',
        'g'
      );
      newSource = newSource.replace(re, `$1\`\${IMAGE_PATH_PREFIX}/${localKey}.webp\``);
    }
    if (!DRY_RUN) {
      fs.writeFileSync(IMAGE_ASSETS_JS, newSource, 'utf8');
      ok('image-assets.js 已更新');
    } else {
      drylog('image-assets.js 替换预览（dry-run 跳过写入）');
    }

    // 替换 index.html 中硬编码的外部 URL
    if (fs.existsSync(INDEX_HTML)) {
      log('替换 index.html 中的外部 URL');
      let html = fs.readFileSync(INDEX_HTML, 'utf8');
      for (const { url, localKey } of newlyDownloaded) {
        const localPath = `images/${localKey}.webp`;
        while (html.includes(url)) {
          html = html.replace(url, localPath);
        }
      }
      if (!DRY_RUN) {
        fs.writeFileSync(INDEX_HTML, html, 'utf8');
        ok('index.html 已更新');
      } else {
        drylog('index.html 替换预览（dry-run 跳过写入）');
      }
    }
  } else {
    log('所有图片均已本地化，无需更新引用');
  }

  // 重新生成 manifest
  if (!DRY_RUN) {
    log('重新生成 image-manifest.json');
    generateManifest();
  }

  console.log('');
  title('下载统计');
  log(`新下载: ${countOk}  跳过(已有): ${countSkip}  失败: ${countFail}  共: ${entries.length}`);
  if (countFail > 0) {
    warn(`${countFail} 张图片下载失败，对应 URL 未被替换，请手动处理`);
    process.exit(1);
  }
  ok('所有外部图片已本地化完成');
}

main().catch(err => {
  fail(`图片优化失败: ${err.message}`);
  console.error(err);
  // 若脚本崩溃且 images 目录不存在，提示用户从 imagesCopy 恢复
  if (!fs.existsSync(IMAGES_DIR) && fs.existsSync(BACKUP_DIR)) {
    fail(`images 目录丢失！请手动执行: mv "${BACKUP_DIR}" "${IMAGES_DIR}" 恢复`);
  }
  process.exit(1);
});
