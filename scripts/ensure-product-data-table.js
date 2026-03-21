const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = path.join(process.cwd(), 'src/assets/product-data-table.js');
const emptyModule = '// 产品数据表（自动创建的空数据占位）\nexport const PRODUCT_DATA_TABLE = [];\n';

function runGenerateScript(source) {
  const script = path.join(process.cwd(), 'scripts/generate-products-data-table.js');
  const args = [script, '--source', source, '--out-path', 'src/assets/product-data-table.js'];
  const result = spawnSync('node', args, {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf-8',
  });

  const failed = result.error || result.status !== 0;
  if (!failed) {
    console.log(`[ensure-product-data-table] generate success via ${source}`);
    return true;
  }

  const stderr = (result.stderr || '').trim();
  const stdout = (result.stdout || '').trim();
  const err = result.error ? String(result.error.message || result.error) : '';
  console.warn(`[ensure-product-data-table] generate failed via ${source}`);
  if (err) console.warn('[ensure-product-data-table] error:', err);
  if (stdout) console.warn('[ensure-product-data-table] stdout:', stdout);
  if (stderr) console.warn('[ensure-product-data-table] stderr:', stderr);
  return false;
}

function generateProductDataTable() {
  const generatedByFeishu = runGenerateScript('feishu');
  if (generatedByFeishu) return true;

  const generatedByXlsx = runGenerateScript('xlsx');
  if (generatedByXlsx) return true;

  console.warn(
    '[ensure-product-data-table] feishu and xlsx generation both failed, fallback to default file',
  );
  return false;
}

function ensureProductDataTableFile() {
  const generated = generateProductDataTable();
  if (!generated) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, emptyModule, 'utf-8');
    console.log('[ensure-product-data-table] wrote default file after generation fallback:', target);
    return;
  }

  if (!fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, emptyModule, 'utf-8');
    console.log('[ensure-product-data-table] created missing file:', target);
    return;
  }

  const content = fs.readFileSync(target, 'utf-8');
  const trimmed = content.trim();
  if (!trimmed) {
    fs.writeFileSync(target, emptyModule, 'utf-8');
    console.log('[ensure-product-data-table] replaced empty file with default export:', target);
    return;
  }

  if (!/export const PRODUCT_DATA_TABLE\s*=/.test(content)) {
    fs.writeFileSync(target, emptyModule, 'utf-8');
    console.log('[ensure-product-data-table] fixed invalid module content:', target);
    return;
  }

  console.log('[ensure-product-data-table] file is valid:', target);
}

ensureProductDataTableFile();
