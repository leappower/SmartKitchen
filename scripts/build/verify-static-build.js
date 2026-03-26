// verify-static-build.js - Verify static deployment build
// Checks that all required files are present for static deployment

const fs = require('fs');
const path = require('path');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function checkFile(filePath, description) {
  const fullPath = path.resolve(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    const stats = fs.statSync(fullPath);
    const size = (stats.size / 1024).toFixed(2);
    log(`✓ ${description}: ${filePath} (${size} KB)`, 'green');
    return true;
  } else {
    log(`✗ ${description}: ${filePath} - NOT FOUND`, 'red');
    return false;
  }
}

function checkDirectory(dirPath, description) {
  const fullPath = path.resolve(__dirname, '..', dirPath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory()) {
    const files = fs.readdirSync(fullPath);
    log(`✓ ${description}: ${dirPath} (${files.length} items)`, 'green');
    return true;
  } else {
    log(`✗ ${description}: ${dirPath} - NOT FOUND`, 'red');
    return false;
  }
}

function checkLanguageFiles() {
  const langDir = path.resolve(__dirname, '../..', 'dist', 'assets', 'lang');
  
  if (!fs.existsSync(langDir)) {
    log('\n✗ Language directory not found: dist/assets/lang/', 'red');
    return false;
  }

  const files = fs.readdirSync(langDir);
  const jsonFiles = files.filter(f => f.endsWith('.json'));
  
  log('\n📊 Language Files Summary:', 'blue');
  log(`   Total files: ${jsonFiles.length}`, 'blue');
  
  // Expected languages — keep in sync with src/lang-registry.js (hasTranslation: true)
  const expectedLanguages = [
    'zh-CN', 'zh-TW', 'en', 'ar', 'he',
    'de', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'ru', 'tr',
    'ja', 'ko', 'id', 'ms', 'fil', 'th', 'vi', 'hi', 'my', 'km', 'lo'
  ];
  
  let allPresent = true;
  expectedLanguages.forEach(lang => {
    const uiFile    = `${lang}-ui.json`;
    const prodFile  = `${lang}-product.json`;
    const uiPath    = path.join(langDir, uiFile);
    const prodPath  = path.join(langDir, prodFile);

    const uiExists   = fs.existsSync(uiPath);
    const prodExists = fs.existsSync(prodPath);

    if (uiExists && prodExists) {
      const uiSize   = (fs.statSync(uiPath).size   / 1024).toFixed(2);
      const prodSize = (fs.statSync(prodPath).size  / 1024).toFixed(2);
      log(`   ✓ ${lang}: ui=${uiSize} KB  product=${prodSize} KB`, 'green');
    } else {
      if (!uiExists)   { log(`   ✗ ${uiFile}: NOT FOUND`,   'red'); }
      if (!prodExists) { log(`   ✗ ${prodFile}: NOT FOUND`, 'red'); }
      allPresent = false;
    }
  });
  
  return allPresent;
}

function checkServiceWorker() {
  const swPath = path.resolve(__dirname, '../..', 'dist', 'sw.js');
  
  if (!fs.existsSync(swPath)) {
    log('\n✗ Service Worker not found: dist/sw.js', 'red');
    return false;
  }
  
  log('\n✓ Service Worker found: dist/sw.js', 'green');
  
  // Check Service Worker content
  const content = fs.readFileSync(swPath, 'utf-8');
  const checks = {
    'CACHE_NAME': content.includes('CACHE_NAME'),
    'LANGUAGE_FILES': content.includes('LANGUAGE_FILES'),
    // webpack minifier may convert single quotes → double quotes; check both forms
    'install event': content.includes('addEventListener(\'install\'') || content.includes('addEventListener("install"'),
    'fetch event': content.includes('addEventListener(\'fetch\'') || content.includes('addEventListener("fetch"'),
    // webpack minifier may rename the cache variable (e.g. s.match); check generic .match( pattern
    'Cache-First strategy': content.includes('cache.match') || content.includes('.match(')
  };
  
  log('\n📋 Service Worker Content Check:', 'blue');
  let allValid = true;
  Object.entries(checks).forEach(([key, valid]) => {
    if (valid) {
      log(`   ✓ ${key}`, 'green');
    } else {
      log(`   ✗ ${key}`, 'red');
      allValid = false;
    }
  });
  
  return allValid;
}

function checkHTML() {
  const htmlPath = path.resolve(__dirname, '../..', 'dist', 'index.html');
  
  if (!fs.existsSync(htmlPath)) {
    log('\n✗ HTML file not found: dist/index.html', 'red');
    return false;
  }
  
  log('\n✓ HTML file found: dist/index.html', 'green');
  
  const content = fs.readFileSync(htmlPath, 'utf-8');
  const checks = {
    // Match both bundle.js (dev) and bundle.<hash>.js (production)
    'bundle JS referenced': /bundle(\.[a-f0-9]+)?\.js/.test(content),
    'CSS file referenced': content.includes('styles.'),
    'lang attribute': content.includes('lang='),
    'UTF-8 charset': content.includes('charset="utf-8"')
  };
  
  log('\n📋 HTML Content Check:', 'blue');
  let allValid = true;
  Object.entries(checks).forEach(([key, valid]) => {
    if (valid) {
      log(`   ✓ ${key}`, 'green');
    } else {
      log(`   ✗ ${key}`, 'red');
      allValid = false;
    }
  });
  
  return allValid;
}

function checkBundleSize() {
  const distPath = path.resolve(__dirname, '../..', 'dist');
  
  // Support both bundle.js (dev) and bundle.<hash>.js (production)
  const distFiles = fs.existsSync(distPath) ? fs.readdirSync(distPath) : [];
  const bundleFile = distFiles.find(f => /^bundle(\.[a-f0-9]+)?\.js$/.test(f));
  
  if (!bundleFile) {
    return false;
  }
  
  const bundlePath = path.join(distPath, bundleFile);
  const stats = fs.statSync(bundlePath);
  const sizeKB = (stats.size / 1024).toFixed(2);
  const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
  
  log('\n📦 Bundle Size:', 'blue');
  log(`   bundle.js: ${sizeKB} KB (${sizeMB} MB)`, 'blue');
  
  if (stats.size > 1024 * 1024) {
    log('   ⚠ Bundle size exceeds 1 MB', 'yellow');
  } else {
    log('   ✓ Bundle size is reasonable', 'green');
  }
  
  return true;
}

function main() {
  log('\n' + '='.repeat(60), 'blue');
  log('🔍 Static Deployment Build Verification', 'blue');
  log('='.repeat(60) + '\n', 'blue');
  
  // Dynamically locate bundle file (supports hash suffix in production)
  const distPath = path.resolve(__dirname, '../..', 'dist');
  const distFiles = fs.existsSync(distPath) ? fs.readdirSync(distPath) : [];
  const bundleFile = distFiles.find(f => /^bundle(\.[a-f0-9]+)?\.js$/.test(f)) || 'bundle.js';
  
  const results = {
    coreFiles: [
      checkFile('../../dist/index.html', 'HTML file'),
      checkFile(`dist/${bundleFile}`, 'JavaScript bundle'),
      checkDirectory('../../dist/assets', 'Assets directory')
    ],
    languageFiles: checkLanguageFiles(),
    serviceWorker: checkServiceWorker(),
    html: checkHTML(),
    bundleSize: checkBundleSize()
  };
  
  log('\n' + '='.repeat(60), 'blue');
  log('📋 Verification Summary', 'blue');
  log('='.repeat(60) + '\n', 'blue');
  
  const allPassed = results.coreFiles.every(r => r) && 
                    results.languageFiles && 
                    results.serviceWorker && 
                    results.html;
  
  if (allPassed) {
    log('✅ All checks passed! Static deployment is ready.', 'green');
    log('\n🚀 Next Steps:', 'blue');
    log('   1. Deploy the dist/ directory to your static hosting platform', 'blue');
    log('   2. Test the application in a browser', 'blue');
    log('   3. Verify Service Worker is registered (Check DevTools > Application)', 'blue');
    log('   4. Test language switching functionality', 'blue');
    log('   5. Test offline capability (disconnect network and reload)', 'blue');
    process.exit(0);
  } else {
    log('❌ Some checks failed. Please review the issues above.', 'red');
    log('\n💡 Suggestions:', 'yellow');
    log('   1. Run: npm run build:static', 'yellow');
    log('   2. Check webpack.config.js for CopyWebpackPlugin configuration', 'yellow');
    log('   3. Verify language files exist in src/assets/lang/', 'yellow');
    process.exit(1);
  }
}

main();
