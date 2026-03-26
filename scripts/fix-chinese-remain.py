#!/usr/bin/env python3
"""Fix chineseInNonZh issues by retranslating via Hunyuan-MT API."""

import json
import re
import time
import requests
import sys
import os

LANG_MAP = {
    "ja": "日本語",
    "my": "Burma Burmese",
    "he": "Hebrew",
    "pt": "Portuguese",
    "ru": "Russian",
    "vi": "Vietnamese",
    "km": "Khmer (Cambodian)",
}

API_URL = "https://api.siliconflow.cn/v1/chat/completions"
MODEL = "tencent/Hunyuan-MT-7B"
BASE = "src/assets/lang"

# Load API keys
keys = []
for i in range(1, 10):
    k = os.environ.get(f"SILICONFLOW_API_KEY_{i}", "")
    if k:
        keys.append(k)
if not keys:
    # try .env file
    try:
        for line in open(".env"):
            line = line.strip()
            if line.startswith("SILICONFLOW_API_KEY_") and "=" in line:
                keys.append(line.split("=", 1)[1])
    except:
        pass

if not keys:
    print("ERROR: No API keys found")
    sys.exit(1)

print(f"Loaded {len(keys)} API keys")

# Load quality report
with open("reports/quality-report-2026-03-26.json") as f:
    report = json.load(f)

items = [x for x in report["details"] if x.get("issue") == "chineseInNonZh"]
print(f"Total chineseInNonZh items: {len(items)}")

# Group by (lang, file)
from collections import defaultdict
groups = defaultdict(list)
for x in items:
    groups[(x["lang"], x["file"])].append(x["key"])

# Load zh-CN as source
zh_cn_product = {}
zh_cn_ui = {}
try:
    zh_cn_product = json.load(open(f"{BASE}/zh-CN-product.json"))
except: pass
try:
    zh_cn_ui = json.load(open(f"{BASE}/zh-CN-ui.json"))
except: pass

def count_chinese(s):
    return len(re.findall(r'[\u4e00-\u9fff]', str(s)))

def translate(text, target_lang_name, key_idx=0):
    key = keys[key_idx % len(keys)]
    # system prompt
    system = (
        f"You are a professional translator. Translate the following text to {target_lang_name}. "
        "Rules: 1) Translate completely, do NOT leave any Chinese characters in the output. "
        "2) If the text is a product spec/model number, transliterate it naturally. "
        "3) Keep numbers and units unchanged. 4) Output ONLY the translation, nothing else."
    )
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": text},
        ],
        "temperature": 0.1,
        "max_tokens": 512,
    }
    try:
        resp = requests.post(API_URL, headers=headers, json=payload, timeout=30)
        data = resp.json()
        if resp.status_code == 429:
            print(f"  Rate limited, switching key...")
            return translate(text, target_lang_name, key_idx + 1)
        if "choices" not in data:
            print(f"  API error: {resp.status_code} {json.dumps(data, ensure_ascii=False)[:200]}")
            return None
        return data["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"  Request error: {e}")
        return None

total_fixed = 0
total_failed = 0
request_count = 0

for (lang, ftype), keys_list in sorted(groups.items()):
    filepath = f"{BASE}/{lang}-{ftype}.json"
    if not os.path.exists(filepath):
        print(f"\nSKIP: {filepath} not found")
        continue
    
    source = zh_cn_product if ftype == "product" else zh_cn_ui
    if not source:
        print(f"\nSKIP: no zh-CN source for {ftype}")
        continue
    
    print(f"\n=== {lang}/{ftype}: {len(keys_list)} keys ===")
    target_name = LANG_MAP.get(lang, lang)
    
    # Load target file
    with open(filepath, "r") as fh:
        target_data = json.load(fh)
    
    # Filter keys that actually have Chinese in them currently
    keys_to_fix = []
    for k in keys_list:
        if k in target_data:
            val = str(target_data[k])
            if count_chinese(val) >= 3:
                keys_to_fix.append(k)
        elif k in source:
            keys_to_fix.append(k)  # missing key, needs translation
    
    print(f"  Keys to fix (has Chinese): {len(keys_to_fix)}")
    
    fixed_in_batch = 0
    failed_in_batch = 0
    
    for idx, k in enumerate(keys_to_fix):
        src_text = source.get(k, target_data.get(k, ""))
        if not src_text:
            continue
        
        if idx % 20 == 0:
            print(f"  Progress: {idx}/{len(keys_to_fix)}")
        
        translated = translate(src_text, target_name, request_count)
        request_count += 1
        
        if translated and count_chinese(translated) < 3:
            target_data[k] = translated
            fixed_in_batch += 1
            total_fixed += 1
        else:
            if translated:
                # Still has Chinese, try once more with stronger prompt
                system2 = (
                    f"CRITICAL: Output must be pure {target_name} with ZERO Chinese characters. "
                    f"Translate: {src_text}"
                )
                translated2 = translate(
                    f"Translate to {target_name}, output must contain no Chinese: {src_text}",
                    target_name, request_count
                )
                request_count += 1
                if translated2 and count_chinese(translated2) < 3:
                    target_data[k] = translated2
                    fixed_in_batch += 1
                    total_fixed += 1
                    continue
            failed_in_batch += 1
            total_failed += 1
        
        # Rate limiting: ~3 requests/sec per key, we have 4 keys so ~12/sec
        if request_count % 4 == 0:
            time.sleep(0.3)
    
    # Write back
    with open(filepath, "w", encoding="utf-8") as fh:
        json.dump(target_data, fh, ensure_ascii=False, indent=2)
    
    print(f"  DONE: fixed={fixed_in_batch}, failed={failed_in_batch}")

print(f"\n{'='*50}")
print(f"TOTAL: fixed={total_fixed}, failed={total_failed}, requests={request_count}")
