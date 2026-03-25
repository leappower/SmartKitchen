const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '../../src/assets/lang');
const targetDir = path.resolve(__dirname, '../dist/assets/lang');

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Source directory does not exist: ${sourceDir}`);
}

/**
 * Check if file should be copied (only split files: *-ui.json, *-product.json, and languages.json)
 */
function shouldCopyFile(filename) {
  return filename.endsWith('-ui.json') ||
         filename.endsWith('-product.json') ||
         filename === 'languages.json';
}

function collectFilesRecursively(dir, base = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFilesRecursively(absPath, base));
      continue;
    }

    // Only include split files
    if (!shouldCopyFile(entry.name)) {
      continue;
    }

    const relPath = path.relative(base, absPath);
    const stat = fs.statSync(absPath);
    files.push({ relPath, size: stat.size });
  }

  return files.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function hasSourceChanged() {
  if (!fs.existsSync(targetDir)) {
    return true;
  }

  const sourceFiles = collectFilesRecursively(sourceDir);
  const targetFiles = collectFilesRecursively(targetDir);

  if (sourceFiles.length !== targetFiles.length) {
    return true;
  }

  for (let i = 0; i < sourceFiles.length; i += 1) {
    const src = sourceFiles[i];
    const dst = targetFiles[i];
    if (
      src.relPath !== dst.relPath ||
      src.size !== dst.size
    ) {
      return true;
    }

    const srcPath = path.join(sourceDir, src.relPath);
    const dstPath = path.join(targetDir, dst.relPath);
    const srcContent = fs.readFileSync(srcPath);
    const dstContent = fs.readFileSync(dstPath);

    if (!srcContent.equals(dstContent)) {
      return true;
    }
  }

  return false;
}

if (!hasSourceChanged()) {
  console.log('Translations unchanged, skipped copy.');
  process.exit(0);
}

// Keep target in sync with source and avoid stale translation files.
fs.rmSync(targetDir, { recursive: true, force: true });
// Recreate the target directory itself (not just its parent).
fs.mkdirSync(targetDir, { recursive: true });

// Copy only split files
const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
let copiedCount = 0;

for (const entry of entries) {
  const srcPath = path.join(sourceDir, entry.name);
  const dstPath = path.join(targetDir, entry.name);

  if (entry.isDirectory()) {
    // Recursively copy subdirectories
    fs.mkdirSync(dstPath, { recursive: true });
    const subEntries = fs.readdirSync(srcPath, { withFileTypes: true });

    for (const subEntry of subEntries) {
      const subSrcPath = path.join(srcPath, subEntry.name);
      const subDstPath = path.join(dstPath, subEntry.name);

      if (!subEntry.isFile() || !shouldCopyFile(subEntry.name)) {
        continue;
      }

      fs.copyFileSync(subSrcPath, subDstPath);
      copiedCount++;
    }
  } else if (entry.isFile() && shouldCopyFile(entry.name)) {
    // Copy only split files
    fs.copyFileSync(srcPath, dstPath);
    copiedCount++;
  }
}

console.log(`Copied ${copiedCount} translation files: ${sourceDir} -> ${targetDir}`);
