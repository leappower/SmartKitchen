#!/usr/bin/env python3
"""Translate 6 missing privacy keys from zh-CN to 22 languages using Hunyuan-MT API."""

import json
import requests
import time
import sys
import os

# Load API keys
API_KEYS = []
for i in range(1, 5):
    key = os.environ.get(f'SILICONFLOW_API_KEY_{i}') or os.popen(f'grep SILICONFLOW_API_KEY_{i} .env | cut -d= -f2').read().strip()
    if key:
        API_KEYS.append(key)

if not API_KEYS:
    print("ERROR: No API keys found")
    sys.exit(1)

key_idx = 0
def get_next_key():
    global key_idx
    key = API_KEYS[key_idx % len(API_KEYS)]
    key_idx += 1
    return key

# Missing keys and their zh-CN values
MISSING_KEYS = {
    "privacy_section_12_title": "十二、Facebook Pixel 与跟踪技术",
    "privacy_section_12_content": "我们使用 Facebook Pixel 和类似的跟踪技术来：(a) 衡量广告效果；(b) 为未来的广告建立目标受众；(c) 跟踪 Facebook 广告的转化。您可以通过 Facebook 广告偏好设置或使用浏览器请勿跟踪设置来选择退出 Facebook 跟踪。",
    "privacy_section_13_title": "十三、儿童隐私",
    "privacy_section_13_content": "我们的服务不面向 18 岁以下的个人。我们不会故意收集儿童的个人数据。如果您认为我们收集了未成年人的数据，请立即与我们联系。",
    "privacy_section_14_title": "十四、自动化决策",
    "privacy_section_14_content": "我们不使用产生法律效力的自动化决策或用户画像。所有业务决策都涉及人工审核。",
}

# Language codes and their full names for the API
LANGUAGES = {
    "ar": "Arabic",
    "de": "German",
    "es": "Spanish",
    "fil": "Filipino",
    "fr": "French",
    "he": "Hebrew",
    "hi": "Hindi",
    "id": "Indonesian",
    "it": "Italian",
    "ja": "Japanese",
    "km": "Khmer",
    "ko": "Korean",
    "ms": "Malay",
    "my": "Myanmar",
    "nl": "Dutch",
    "pl": "Polish",
    "pt": "Portuguese",
    "ru": "Russian",
    "th": "Thai",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "zh-TW": "Traditional Chinese",
}

# Languages that may need fallback model
FALLBACK_LANGS = {"he", "ms"}

def build_system_prompt(target_lang):
    return f"""You are a professional translator. Translate the following text from Simplified Chinese to {target_lang}.
Rules:
- This is for a commercial kitchen equipment website's privacy policy page.
- Keep legal terms accurate and formal.
- Do NOT translate "Facebook Pixel" - keep it as is.
- Do NOT translate "Facebook" brand name.
- Return ONLY the translated text, no explanations, no quotes."""

def translate(text, target_lang_name, model="tencent/Hunyuan-MT-7B"):
    api_key = get_next_key()
    system_prompt = build_system_prompt(target_lang_name)
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": text}
        ],
        "temperature": 0.1,
        "max_tokens": 1024,
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    try:
        resp = requests.post("https://api.siliconflow.cn/v1/chat/completions", 
                           json=payload, headers=headers, timeout=60)
        if resp.status_code == 429:
            print(f"  Rate limited, waiting 3s...")
            time.sleep(3)
            return translate(text, target_lang_name, model)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"  ERROR: {e}")
        return None

def translate_lang(lang_code):
    lang_name = LANGUAGES[lang_code]
    model = "tencent/Hunyuan-MT-7B"
    use_fallback = lang_code in FALLBACK_LANGS
    
    print(f"\n=== Translating to {lang_code} ({lang_name}) ===")
    results = {}
    
    for key, zh_text in MISSING_KEYS.items():
        print(f"  Translating {key}...")
        result = translate(zh_text, lang_name, model)
        
        if result is None and use_fallback:
            print(f"  Retrying with fallback model Qwen3-30B...")
            result = translate(zh_text, lang_name, "Qwen/Qwen3-30B-A3B")
        
        if result is None:
            print(f"  FAILED for {key}!")
            return None
        
        results[key] = result
        print(f"  OK: {result[:50]}...")
        time.sleep(0.3)  # Rate limit
    
    return results

def main():
    os.chdir("/Users/chee/Projects/SmartKitchen")
    
    success_count = 0
    fail_count = 0
    
    for lang_code in LANGUAGES:
        results = translate_lang(lang_code)
        
        if results is None:
            print(f"FAILED: {lang_code}")
            fail_count += 1
            continue
        
        # Load existing file and merge
        filepath = f"src/assets/lang/{lang_code}-ui.json"
        with open(filepath, 'r', encoding='utf-8') as f:
            existing = json.load(f)
        
        existing.update(results)
        
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        
        print(f"  Saved {filepath} ({len(existing)} keys)")
        success_count += 1
        time.sleep(0.5)
    
    print(f"\n=== DONE: {success_count} success, {fail_count} failed ===")

if __name__ == "__main__":
    main()
