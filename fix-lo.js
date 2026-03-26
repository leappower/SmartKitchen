const fs = require('fs');
const path = require('path');

const langDir = '/Users/chee/Projects/SmartKitchen/src/assets/lang';
const zhCN = JSON.parse(fs.readFileSync(path.join(langDir, 'zh-CN-ui.json'), 'utf8'));
const lo = JSON.parse(fs.readFileSync(path.join(langDir, 'lo-ui.json'), 'utf8'));

const zhKeys = new Set(Object.keys(zhCN));
const loKeys = new Set(Object.keys(lo));

const missingKeys = [...zhKeys].filter(k => !loKeys.has(k));
const staleKeys = [...loKeys].filter(k => !zhKeys.has(k));

// Remove stale keys
for (const k of staleKeys) delete lo[k];

const envFile = fs.readFileSync('/Users/chee/Projects/SmartKitchen/.env', 'utf8');
const API_KEYS = [];
for (let i = 1; i <= 4; i++) {
  const m = envFile.match(new RegExp(`SILICONFLOW_API_KEY_${i}=(.+)`));
  if (m) API_KEYS.push(m[1].trim());
}

let keyIdx = 0;
function getNextKey() { return API_KEYS[keyIdx++ % API_KEYS.length]; }

async function translateOne(zh) {
  const key = getNextKey();
  const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'tencent/Hunyuan-MT-7B',
      messages: [
        { role: 'system', content: 'You are a professional Chinese to Lao translator for a commercial kitchen equipment website. Translate the Chinese text to Lao. Keep brand names, certification names, and HTML tags as-is. Return ONLY the Lao translation, nothing else.' },
        { role: 'user', content: zh }
      ],
      temperature: 0.1,
      max_tokens: 500,
    }),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.choices[0].message.content.trim();
}

async function main() {
  const allTranslations = {};
  
  for (let i = 0; i < missingKeys.length; i++) {
    const k = missingKeys[i];
    const zh = zhCN[k];
    console.log(`[${i+1}/${missingKeys.length}] ${k}`);
    
    let retries = 3;
    while (retries > 0) {
      try {
        const val = await translateOne(zh);
        allTranslations[k] = val;
        console.log(`  → ${val.substring(0, 50)}`);
        break;
      } catch (e) {
        retries--;
        console.log(`  retry (${retries})`);
        if (retries === 0) {
          allTranslations[k] = zh; // fallback to Chinese
          console.log(`  FALLBACK to Chinese`);
        }
      }
    }
  }

  for (const [k, v] of Object.entries(allTranslations)) {
    lo[k] = v;
  }

  const finalLo = new Set(Object.keys(lo));
  const finalMissing = [...zhKeys].filter(k => !finalLo.has(k));
  const finalStale = [...finalLo].filter(k => !zhKeys.has(k));
  
  console.log(`\nFinal: lo=${finalLo.size}, zh-CN=${zhKeys.size}, missing=${finalMissing.length}, stale=${finalStale.length}`);

  fs.writeFileSync(path.join(langDir, 'lo-ui.json'), JSON.stringify(lo, null, 2) + '\n');
  console.log('Saved.');
}

main().catch(e => { console.error(e); process.exit(1); });
