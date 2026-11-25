/**
 * Vega IDE Assembly and Packaging Module
 * 
 * Reusable, idempotent assembly of the Vega IDE distribution.
 */

const fs = require('fs');
const path = require('path');
const config = require('./vega.config.js');

async function packageVega(options = {}) {
  const verbose = options.verbose !== false;
  if (verbose) console.log('=== STARTING VEGA IDE ASSEMBLY & PACKAGING ===');

  const srcBase = config.SRC_BASE;
  const targetDir = config.TARGET_DIR;
  const continueInjectedDir = path.join(config.ROOT_DIR, 'vscode', 'extensions', 'continue');

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. Copy top-level executables and assets from VS Code source base if present
  if (fs.existsSync(srcBase)) {
    if (verbose) console.log(`[BASE] Copying base application files from ${srcBase}...`);
    try {
      const topFiles = fs.readdirSync(srcBase);
      for (const file of topFiles) {
        if (file.startsWith('is-') && file.endsWith('.tmp')) continue;
        const fullSrc = path.join(srcBase, file);
        if (!fs.existsSync(fullSrc)) continue;
        const stat = fs.statSync(fullSrc);
        if (stat.isFile()) {
          const fullDest = path.join(targetDir, file);
          try {
            fs.copyFileSync(fullSrc, fullDest);
          } catch (err) {
            throw new Error(`Failed to copy base application file ${fullSrc} to ${fullDest}: ${err.message}`, { cause: err });
          }
        }
      }
    } catch (err) {
      throw new Error(`Could not copy base application files from ${srcBase}: ${err.message}`, { cause: err });
    }
  } else {
    if (verbose) console.log(`[INFO] Source base ${srcBase} not found; using existing ${targetDir} binaries.`);
  }

  // 2. Ensure Vega always uses the same VS Code runtime version as Code.exe.
  const codeExe = path.join(targetDir, 'Code.exe');
  const vegaExe = config.syncVegaExecutable(codeExe);
  if (verbose) console.log(`[SYNCHRONIZED] ${vegaExe} from ${codeExe}`);

  // Also create/update vega.VisualElementsManifest.xml
  const vegaManifest = path.join(targetDir, 'vega.VisualElementsManifest.xml');
  const codeManifest = path.join(targetDir, 'Code.VisualElementsManifest.xml');
  if (fs.existsSync(codeManifest) && !fs.existsSync(vegaManifest)) {
    try {
      fs.copyFileSync(codeManifest, vegaManifest);
    } catch (err) {
      throw new Error(`Failed to copy ${codeManifest} to ${vegaManifest}: ${err.message}`, { cause: err });
    }
  }

  // 3. Copy commit folder assets if source commit folder exists
  if (fs.existsSync(srcBase)) {
    try {
      const srcEntries = fs.readdirSync(srcBase);
      for (const entry of srcEntries) {
        if (!/^[0-9a-f]{10}$/i.test(entry)) continue;
        const fullSrc = path.join(srcBase, entry);
        if (!fs.existsSync(fullSrc)) continue;
        const stat = fs.statSync(fullSrc);
        if (stat.isDirectory()) {
          if (verbose) console.log(`[COMMIT ASSETS] Found commit directory ${entry} in source base, syncing...`);
          const destCommit = path.join(targetDir, entry);
          config.copyRecursiveSync(fullSrc, destCommit);
          config.copyRecursiveSync(fullSrc, targetDir);
        }
      }
    } catch (err) {
      throw new Error(`Failed to synchronize VS Code commit assets from ${srcBase}: ${err.message}`, { cause: err });
    }

    // Sync bin directory and generate vega CLI launchers
    const srcBin = path.join(srcBase, 'bin');
    const destBin = path.join(targetDir, 'bin');
    if (fs.existsSync(srcBin)) {
      config.copyRecursiveSync(srcBin, destBin);
      const codeCmd = path.join(destBin, 'code.cmd');
      const cleanCodeCmd = `@echo off\r\nsetlocal\r\nset VSCODE_DEV=\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%~dp0..\\Code.exe" "%~dp0..\\resources\\app\\out\\cli.js" %*\r\nIF %ERRORLEVEL% NEQ 0 EXIT /b %ERRORLEVEL%\r\nendlocal\r\n`;
      fs.writeFileSync(codeCmd, cleanCodeCmd, 'utf8');

      const vegaCmd = path.join(destBin, 'vega.cmd');
      const cleanVegaCmd = `@echo off\r\nsetlocal\r\nset VSCODE_DEV=\r\nset ELECTRON_RUN_AS_NODE=1\r\n"%~dp0..\\vega.exe" "%~dp0..\\resources\\app\\out\\cli.js" %*\r\nIF %ERRORLEVEL% NEQ 0 EXIT /b %ERRORLEVEL%\r\nendlocal\r\n`;
      fs.writeFileSync(vegaCmd, cleanVegaCmd, 'utf8');

      const vegaSh = path.join(destBin, 'vega');
      const cleanVegaSh = `#!/usr/bin/env sh\nELECTRON_RUN_AS_NODE=1 exec "$(dirname "$0")/../vega.exe" "$(dirname "$0")/../resources/app/out/cli.js" "$@"\n`;
      fs.writeFileSync(vegaSh, cleanVegaSh, 'utf8');
      if (verbose) console.log(`[CLI SYNCED] Synced bin scripts: vega.cmd, code.cmd in ${destBin}`);
    }
  }

  // 4. Rebrand product.json across all discovered active app directories
  if (verbose) console.log('[BRANDING] Applying surgical Vega IDE rebranding to product.json...');
  const appDirs = config.getActiveAppDirs(targetDir);
  for (const app of appDirs) {
    config.patchProductJson(app.productJson);
  }

  // Also patch vscode/product.json if it exists
  const vscodeProduct = path.join(config.ROOT_DIR, 'vscode', 'product.json');
  if (fs.existsSync(vscodeProduct)) {
    config.patchProductJson(vscodeProduct);
  }

  // 5. Inject Continue AI extension
  if (fs.existsSync(continueInjectedDir)) {
    if (verbose) console.log('[INJECT] Injecting Continue AI extension into active app directories...');
    for (const app of appDirs) {
      const dest = path.join(app.appDir, 'extensions', 'continue');
      config.copyRecursiveSync(continueInjectedDir, dest);
      if (verbose) console.log(`[INJECTED CONTINUE] ${dest}`);
    }
  }

  // 6. Inject Orchestrator Chat extension
  const orchSource = options.orchSource || path.join(config.USER_HOME, 'AI-Agent-Orchestrator', 'orchestrator-chat-extension');
  if (fs.existsSync(orchSource)) {
    if (verbose) console.log(`[INJECT] Injecting Orchestrator Chat extension from ${orchSource}...`);
    for (const app of appDirs) {
      const dest = path.join(app.appDir, 'extensions', 'orchestrator-chat');
      config.copyRecursiveSync(orchSource, dest);
      if (verbose) console.log(`[INJECTED ORCHESTRATOR] ${dest}`);
    }
  }

  // 7. Inject Vega AI Monitor telemetry extension if available
  const monitorSource = path.join(config.USER_HOME, 'AI-Agent-Workspace', 'vega-ai-monitor');
  if (fs.existsSync(monitorSource)) {
    if (verbose) console.log(`[INJECT] Injecting Vega AI Monitor extension from ${monitorSource}...`);
    for (const app of appDirs) {
      const dest = path.join(app.appDir, 'extensions', 'vega-ai-monitor');
      config.copyRecursiveSync(monitorSource, dest);
      if (verbose) console.log(`[INJECTED MONITOR] ${dest}`);
    }
  }

  // 8. Inject the optional, disabled-by-default Vega context provider.
  const contextProviderSource = path.join(config.ROOT_DIR, 'integrations');
  if (fs.existsSync(path.join(contextProviderSource, 'package.json')) &&
      fs.existsSync(path.join(contextProviderSource, 'vega_context_provider.js'))) {
    if (verbose) console.log('[INJECT] Injecting optional Vega Context Bridge extension...');
    for (const app of appDirs) {
      const dest = path.join(app.appDir, 'extensions', 'vega-context-provider');
      config.copyRecursiveSync(contextProviderSource, dest);
      if (verbose) console.log(`[INJECTED VEGA CONTEXT PROVIDER] ${path.basename(app.appDir)}`);
    }
  }

  if (verbose) console.log('=== VEGA IDE ASSEMBLY COMPLETE ===');
  return { success: true };
}

if (require.main === module) {
  packageVega().catch(err => {
    console.error('[ERROR] packageVega failed:', err);
    process.exit(1);
  });
}

module.exports = { packageVega };
