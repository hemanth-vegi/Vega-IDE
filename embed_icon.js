/**
 * Embed Vega Icon and Patch PE Metadata on vega.exe
 * 
 * Uses rcedit to embed vega_infinity.ico and set PE version strings.
 * Safely guards against corrupting a running vega.exe executable.
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { rcedit } = require('rcedit');
const config = require('./vega.config.js');

async function embedIcon(options = {}) {
  const verbose = options.verbose !== false;
  if (verbose) console.log('=== PHASE: EMBED ICON & PE METADATA ON VEGA.EXE ===');

  const vegaExePath = path.join(config.TARGET_DIR, 'vega.exe');
  const icoPath = config.ICO_PATH;
  const manifestPath = path.join(config.TARGET_DIR, 'vega.VisualElementsManifest.xml');

  // 1. Ensure vega_infinity.ico exists
  if (!fs.existsSync(icoPath)) {
    console.log('[INFO] vega_infinity.ico not found, attempting to generate via generate_infinity.py...');
    const pythonExe = config.resolvePythonInterpreter();
    const genScript = path.join(config.ROOT_DIR, 'generate_infinity.py');
    if (fs.existsSync(genScript)) {
      try {
        cp.execSync(`"${pythonExe}" "${genScript}"`, { cwd: config.ROOT_DIR, stdio: 'inherit' });
      } catch (err) {
        throw new Error(`Failed to generate icon with ${pythonExe}: ${err.message}`);
      }
    }
    if (!fs.existsSync(icoPath)) {
      throw new Error(`CRITICAL: Icon file does not exist at ${icoPath} and could not be generated.`);
    }
  }

  // 2. Refresh from Code.exe before patching so the icon never preserves a stale runtime.
  try {
    config.syncVegaExecutable();
  } catch (err) {
    if (err.code === 'VEGA_EXECUTABLE_LOCKED') {
      console.warn(`[LOCKED] ${err.message}`);
      return { success: false, locked: true, reason: err.code };
    }
    throw err;
  }

  // 3. Guard against the executable becoming locked before resource editing.
  if (config.isProcessRunning('vega.exe') || config.isExeLocked(vegaExePath)) {
    console.warn('\n================================================================');
    console.warn('[WARNING] vega.exe is currently locked / running (EBUSY).');
    console.warn('Skipping binary PE patching to avoid corrupting the running executable.');
    console.warn('To embed icon, close all running instances of Vega IDE and re-run:');
    console.warn('  npm run embed:icon');
    console.warn('================================================================\n');
    return { success: false, locked: true, reason: 'EBUSY' };
  }

  // 4. Apply rcedit to vega.exe
  if (verbose) console.log(`[RCEDIT] Patching icon and PE metadata on: ${vegaExePath}`);
  try {
    await rcedit(vegaExePath, {
      icon: icoPath,
      'version-string': {
        ProductName: 'Vega IDE',
        FileDescription: 'Vega Integrated Development Environment',
        InternalName: 'vega',
        OriginalFilename: 'vega.exe'
      }
    });
    if (verbose) console.log('[RCEDIT SUCCESS] Successfully embedded vega_infinity.ico and PE metadata.');
  } catch (err) {
    if (['EBUSY', 'EPERM'].includes(err.code) || err.message.includes('EBUSY')) {
      console.warn(`[LOCKED] rcedit reported file lock: ${err.message}`);
      return { success: false, locked: true, reason: 'EBUSY' };
    }
    throw err;
  }

  // 5. Update vega.VisualElementsManifest.xml cleanly
  if (fs.existsSync(manifestPath) || fs.existsSync(path.join(config.TARGET_DIR, 'Code.VisualElementsManifest.xml'))) {
    const cleanManifest = `<Application xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
\t\t<VisualElements
\t\t\t\tBackgroundColor="#000000"
\t\t\t\tShowNameOnSquare150x150Logo="on"
\t\t\t\tSquare150x150Logo="resources\\app\\resources\\win32\\code_150x150.png"
\t\t\t\tSquare70x70Logo="resources\\app\\resources\\win32\\code_70x70.png"
\t\t\t\tForegroundText="light"
\t\t\t\tShortDisplayName="Vega IDE" />
</Application>
`;
    try {
      fs.writeFileSync(manifestPath, cleanManifest, 'utf8');
      if (verbose) console.log(`[MANIFEST] Cleaned ${manifestPath} with Vega branding.`);
    } catch (err) {
      if (!['EBUSY', 'EPERM'].includes(err.code)) throw err;
      console.warn(`[LOCKED] Skipping locked manifest: ${manifestPath}`);
    }
  }

  return { success: true, locked: false };
}

if (require.main === module) {
  embedIcon().catch(err => {
    console.error('[ERROR] embedIcon failed:', err);
    process.exit(1);
  });
}

module.exports = { embedIcon };
