/**
 * Vega IDE Essential Extension Synchronization Module
 * 
 * Synchronizes required developer extensions from the local environment into ~/.vega/extensions.
 * Strictly READS from ~/.vscode/extensions without modifying or deleting anything inside it.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const config = require('./vega.config.js');

function syncEssentialExtensions(options = {}) {
  const verbose = options.verbose !== false;
  if (verbose) console.log('=== PHASE: SYNCING ESSENTIAL EXTENSIONS ===');

  const srcDir = config.VSCODE_EXTENSIONS_DIR;
  const destDir = config.VEGA_EXTENSIONS_DIR;

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const requiredIds = config.REQUIRED_EXTENSIONS;
  const srcEntries = fs.existsSync(srcDir) ? fs.readdirSync(srcDir) : [];
  const destEntries = fs.readdirSync(destDir);
  const foundMap = {};

  requiredIds.forEach(id => {
    // 1. Check if already present in ~/.vega/extensions
    const destMatch = destEntries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
    if (destMatch) {
      foundMap[id] = destMatch;
      if (verbose) console.log(`[VERIFIED IN .VEGA] ${id} -> ${destMatch}`);
      return;
    }

    // 2. Check if present in ~/.vscode/extensions (READ-ONLY source)
    const srcMatch = srcEntries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
    if (srcMatch) {
      foundMap[id] = srcMatch;
      const sourcePath = path.join(srcDir, srcMatch);
      const destPath = path.join(destDir, srcMatch);
      config.copyRecursiveSync(sourcePath, destPath);
      if (verbose) console.log(`[SYNCED TO .VEGA] ${srcMatch}`);
      return;
    }

    // 3. Attempt CLI installation into destDir if CLI is available
    if (options.offline !== true) {
      try {
        if (verbose) console.log(`[INSTALLING EXTENSION] Attempting CLI install for ${id}...`);
        cp.execSync(`code --extensions-dir "${destDir}" --install-extension ${id}`, { stdio: 'ignore' });
        const updatedDestEntries = fs.readdirSync(destDir);
        const installedMatch = updatedDestEntries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
        if (installedMatch) {
          foundMap[id] = installedMatch;
          if (verbose) console.log(`[SUCCESSFULLY INSTALLED] ${id} -> ${installedMatch}`);
        } else {
          if (verbose) console.warn(`[WARN] Installation command completed but ${id} not found in ${destDir}`);
        }
      } catch (err) {
        if (verbose) console.warn(`[WARN] CLI install failed for ${id}: ${err.message}`);
      }
    }
  });

  // Update ~/.vega/extensions/extensions.json manifest
  const srcExtJsonPath = path.join(srcDir, 'extensions.json');
  const destExtJsonPath = path.join(destDir, 'extensions.json');

  let vegaList = [];
  if (fs.existsSync(destExtJsonPath)) {
    try {
      vegaList = JSON.parse(fs.readFileSync(destExtJsonPath, 'utf8'));
      if (!Array.isArray(vegaList)) throw new TypeError('Expected an array.');
    } catch (err) {
      throw new Error(`Could not read extension manifest ${destExtJsonPath}: ${err.message}`, { cause: err });
    }
  } else if (fs.existsSync(srcExtJsonPath)) {
    try {
      vegaList = JSON.parse(fs.readFileSync(srcExtJsonPath, 'utf8'));
      if (!Array.isArray(vegaList)) throw new TypeError('Expected an array.');
    } catch (err) {
      throw new Error(`Could not read source extension manifest ${srcExtJsonPath}: ${err.message}`, { cause: err });
    }
  }

  const currentDestEntries = fs.readdirSync(destDir);
  requiredIds.forEach(id => {
    const match = currentDestEntries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
    if (match) {
      const existing = vegaList.some(item => {
        const existingId = (item.identifier && item.identifier.id) || '';
        return existingId.toLowerCase() === id.toLowerCase() || (item.relativeLocation && item.relativeLocation.toLowerCase().startsWith(id.toLowerCase()));
      });
      if (!existing) {
        let version = "1.0.0";
        const pkgPath = path.join(destDir, match, 'package.json');
        if (fs.existsSync(pkgPath)) {
          try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            version = pkg.version || version;
          } catch (err) {
            throw new Error(`Could not parse extension manifest ${pkgPath}: ${err.message}`, { cause: err });
          }
        }
        vegaList.push({
          identifier: { id },
          version,
          location: { $mid: 1, path: `/${destDir.replace(/\\/g, '/')}/${match}`, scheme: "file" },
          relativeLocation: match
        });
        if (verbose) console.log(`[REGISTERED IN MANIFEST] ${id} (${version})`);
      }
    }
  });

  fs.writeFileSync(destExtJsonPath, JSON.stringify(vegaList, null, 2), 'utf8');
  if (verbose) console.log(`Updated ${destExtJsonPath} with ${vegaList.length} verified extensions.`);
  if (verbose) console.log('=== ESSENTIAL EXTENSION SYNC COMPLETE ===');
  return { success: true, count: vegaList.length };
}

if (require.main === module) {
  try {
    syncEssentialExtensions();
  } catch (err) {
    console.error('[ERROR] syncEssentialExtensions failed:', err);
    process.exit(1);
  }
}

module.exports = { syncEssentialExtensions };
