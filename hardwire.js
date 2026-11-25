/**
 * Vega IDE Continue Extension Hardwiring Module
 * 
 * Safely hardwires Auto-Failover Orchestrator into the local Continue extension source if present.
 * Idempotent: recognizes already-hardwired state without failing.
 */

const fs = require('fs');
const path = require('path');
const config = require('./vega.config.js');

function hardwire(options = {}) {
  const verbose = options.verbose !== false;
  const isStrict = options.strict === true;
  if (verbose) console.log('=== PHASE: HARDWIRING CONTINUE EXTENSION ===');

  const file = path.join(config.ROOT_DIR, 'vscode', 'extensions', 'continue', 'out', 'extension.js');

  if (!fs.existsSync(file)) {
    const msg = `Local Continue source extension not found at: ${file}`;
    if (isStrict) {
      throw new Error(`CRITICAL: ${msg}`);
    }
    console.warn(`[SKIP] ${msg}. Continuing cleanly.`);
    return { success: true, skipped: true };
  }

  let content = fs.readFileSync(file, 'utf8');

  // Idempotency check: if already hardwired, succeed cleanly
  if (content.includes('auto-failover-orchestrator')) {
    if (verbose) console.log('[IDEMPOTENT] Auto-Failover Orchestrator is already hardwired in continue extension.js');
  } else {
    const target = 'name: "Main Config",\n      version: "1.0.0",\n      schema: "v1",\n      models: []';
    const replacement = `name: "Main Config",
      version: "1.0.0",
      schema: "v1",
      models: [
        {
          title: "Auto-Failover Orchestrator (10-Model Cascade)",
          name: "Auto-Failover Orchestrator (10-Model Cascade)",
          provider: "openai",
          model: "auto-failover-orchestrator",
          apiBase: "http://127.0.0.1:8765/v1",
          apiKey: "local-orchestrator",
          roles: ["chat", "edit", "apply"]
        }
      ]`;

    if (content.includes(target)) {
      content = content.replace(target, replacement);
      fs.writeFileSync(file, content, 'utf8');
      if (verbose) console.log('Successfully hardwired Orchestrator into continue out/extension.js');
    } else {
      const regex = /name:\s*"Main Config",\s*version:\s*"1\.0\.0",\s*schema:\s*"v1",\s*models:\s*\[\]/;
      if (regex.test(content)) {
        content = content.replace(regex, replacement);
        fs.writeFileSync(file, content, 'utf8');
        if (verbose) console.log('Successfully hardwired Orchestrator with regex into continue out/extension.js');
      } else {
        throw new Error(`Target models array pattern not found in ${file}`);
      }
    }
  }

  // 2. Also hardwire continue repo source default.ts if present
  const defaultTsPath = path.join(config.ROOT_DIR, 'continue', 'core', 'config', 'default.ts');
  if (fs.existsSync(defaultTsPath)) {
    const tsContent = `import { ConfigYaml } from "@continuedev/config-yaml";

export const defaultConfig: ConfigYaml = {
  name: "Main Config",
  version: "1.0.0",
  schema: "v1",
  models: [
    {
      title: "Auto-Failover Orchestrator (10-Model Cascade)",
      name: "Auto-Failover Orchestrator (10-Model Cascade)",
      provider: "openai",
      model: "auto-failover-orchestrator",
      apiBase: "http://127.0.0.1:8765/v1",
      apiKey: "local-orchestrator",
      roles: ["chat", "edit", "apply"]
    }
  ],
};
`;
    fs.writeFileSync(defaultTsPath, tsContent, 'utf8');
    if (verbose) console.log('Successfully hardwired Orchestrator into continue/core/config/default.ts');
  }

  // 3. Update builtInExtensions.js if present
  const builtInExtJsPath = path.join(config.ROOT_DIR, 'vscode', 'build', 'lib', 'builtInExtensions.js');
  if (fs.existsSync(builtInExtJsPath)) {
    let biContent = fs.readFileSync(builtInExtJsPath, 'utf8');
    if (!biContent.includes('continue')) {
      const continueExtEntry = `
// Injected Continue Built-in Extension
builtInExtensions.push({
  name: "continue",
  version: "2.0.0",
  repo: "https://github.com/continuedev/continue",
  metadata: {
    id: "continue.continue",
    publisherId: {
      publisherId: "continue",
      publisherName: "continue",
      displayName: "Continue",
      flags: "public"
    },
    publisherDisplayName: "Continue"
  }
});
`;
      biContent += continueExtEntry;
      fs.writeFileSync(builtInExtJsPath, biContent, 'utf8');
      if (verbose) console.log('Successfully appended Continue to builtInExtensions.js');
    }
  }

  // 4. Update vscode/product.json builtInExtensions array
  const productJsonPath = path.join(config.ROOT_DIR, 'vscode', 'product.json');
  if (fs.existsSync(productJsonPath)) {
    config.patchProductJson(productJsonPath);
  }

  if (verbose) console.log('=== HARDWIRING COMPLETE ===');
  return { success: true };
}

if (require.main === module) {
  try {
    hardwire();
  } catch (err) {
    console.error('[ERROR] hardwire failed:', err);
    process.exit(1);
  }
}

module.exports = { hardwire };
