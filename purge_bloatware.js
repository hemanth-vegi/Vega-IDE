/**
 * Vega IDE Bloatware Purge Module
 * 
 * Scoped STRICTLY to Vega IDE directories (vscode-win32-x64/ and ~/.vega/extensions).
 * NEVER touches ~/.vscode/extensions or ~/.vscode-oss/extensions.
 */

const fs = require('fs');
const path = require('path');
const config = require('./vega.config.js');

function isBloat(name) {
  const lower = name.toLowerCase();
  return config.BLOAT_PATTERNS.some(pattern => lower.startsWith(pattern) || lower.includes(pattern));
}

function purgeBloatware(options = {}) {
  const verbose = options.verbose !== false;
  if (verbose) console.log('=== PHASE: PURGING BLOATWARE EXTENSIONS ===');

  // 1. Remove built-in copilot assets and shims across all active app directories in vscode-win32-x64
  const appDirs = config.getActiveAppDirs();
  for (const app of appDirs) {
    const builtinCopilot = path.join(app.appDir, 'extensions', 'copilot');
    if (fs.existsSync(builtinCopilot)) {
      try {
        fs.rmSync(builtinCopilot, { recursive: true, force: true });
        if (verbose) console.log(`[DELETED BUILT-IN COPILOT] ${builtinCopilot}`);
      } catch (err) {
        throw new Error(`Could not remove built-in Copilot assets at ${builtinCopilot}: ${err.message}`, { cause: err });
      }
    }
  }

  // Also remove copilot-shim in bin if present
  const copilotShim = path.join(config.TARGET_DIR, 'bin', 'copilot-shim');
  if (fs.existsSync(copilotShim)) {
    try {
      fs.rmSync(copilotShim, { recursive: true, force: true });
      if (verbose) console.log(`[DELETED COPILOT SHIM] ${copilotShim}`);
    } catch (err) {
      throw new Error(`Could not remove Copilot shim at ${copilotShim}: ${err.message}`, { cause: err });
    }
  }

  // 2. Remove user-level bloat extensions SCOPED ONLY to ~/.vega/extensions
  // (NEVER ~/.vscode/extensions or ~/.vscode-oss/extensions)
  const vegaExtDir = config.VEGA_EXTENSIONS_DIR;
  if (fs.existsSync(vegaExtDir)) {
    const entries = fs.readdirSync(vegaExtDir);
    for (const entry of entries) {
      if (isBloat(entry)) {
        const fullPath = path.join(vegaExtDir, entry);
        try {
          fs.rmSync(fullPath, { recursive: true, force: true });
          if (verbose) console.log(`[REMOVED VEGA BLOAT] ${entry}`);
        } catch (err) {
          throw new Error(`Could not remove Vega bloat extension ${fullPath}: ${err.message}`, { cause: err });
        }
      }
    }

    // Update ~/.vega/extensions/extensions.json
    const extJsonPath = path.join(vegaExtDir, 'extensions.json');
    if (fs.existsSync(extJsonPath)) {
      let raw;
      try {
        raw = fs.readFileSync(extJsonPath, 'utf8');
      } catch (err) {
        throw new Error(`Could not read extension manifest ${extJsonPath}: ${err.message}`, { cause: err });
      }
      if (raw.trim()) {
        let list;
        try {
          list = JSON.parse(raw);
        } catch (err) {
          throw new Error(`Could not parse extension manifest ${extJsonPath}: ${err.message}`, { cause: err });
        }
        if (!Array.isArray(list)) {
          throw new TypeError(`Expected an array in extension manifest ${extJsonPath}.`);
        }
        const filtered = list.filter(item => {
          const id = (item.identifier && item.identifier.id) || '';
          return !isBloat(id);
        });
        fs.writeFileSync(extJsonPath, JSON.stringify(filtered, null, 2), 'utf8');
        if (verbose) console.log(`[CLEANED EXTENSIONS MANIFEST] ${extJsonPath} (${list.length} -> ${filtered.length} extensions)`);
      }
    }
  }

  if (verbose) console.log('=== BLOATWARE PURGE COMPLETE ===');
  return { success: true };
}

if (require.main === module) {
  try {
    purgeBloatware();
  } catch (err) {
    console.error('[ERROR] purgeBloatware failed:', err);
    process.exit(1);
  }
}

module.exports = { purgeBloatware, isBloat };
