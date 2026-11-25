/**
 * Vega IDE Consolidation & Lock-In Module
 * 
 * 1. Product.json branding consolidation
 * 2. Internal icon branding + idempotent workbench CSS purge
 * 3. Continue Orchestrator config lock-in (clean UTF-8 \u26A1, guarded mkdir)
 * 4. Developer settings.json lock-in
 */

const fs = require('fs');
const path = require('path');
const config = require('./vega.config.js');
const { applyInternalBranding, getVegaIconDataUri } = require('./apply_internal_branding.js');

const VEGA_CSS_START = '/* === VEGA IDE START === */';
const VEGA_CSS_END = '/* === VEGA IDE END === */';

const VEGA_ICON_DATA_URI = getVegaIconDataUri();

const VEGA_CSS_BLOCK = `${VEGA_CSS_START}
/* === VEGA IDE: PURGE COPILOT & SIGN-IN UI === */
.monaco-workbench .part.editor .gettingStartedContainer .gettingStartedSlideCategories > .gettingStartedCategoriesContainer > .categories-column-right,
.monaco-workbench .part.editor .gettingStartedContainer .walkthroughs-column,
.monaco-workbench .part.editor .gettingStartedContainer .getting-started-category[data-category-id*="copilot"],
.monaco-workbench .part.editor .gettingStartedContainer .footer,
.monaco-workbench .part.editor .gettingStartedContainer button[title*="GitHub"],
.monaco-workbench .part.titlebar .command-center .action-item:has(.codicon-copilot),
.monaco-workbench .part.titlebar .window-controls-container ~ .action-toolbar,
.monaco-workbench .part.titlebar a.action-label[aria-label*="Sign in"],
.monaco-workbench .part.titlebar .Badge-sign-in,
.monaco-workbench [data-category-id*="copilot"],
.monaco-workbench [data-category-id*="github"],
.monaco-workbench .gettingStartedCategory:has([data-category-id*="copilot"]),
.monaco-workbench .getting-started-category[data-category-id*="copilot"],
.monaco-workbench .action-item:has(.codicon-copilot),
.monaco-workbench .action-item:has(.codicon-github),
.monaco-workbench .action-item:has([aria-label*="Sign in"]),
.monaco-workbench .action-item:has([aria-label*="Copilot"]),
.monaco-workbench .codicon-copilot,
.monaco-workbench a[href*="copilot"] {
    display: none !important;
}
/* === VEGA IDE: INTERNAL ICONS === */
.monaco-workbench .part.titlebar .window-appicon:not(.codicon) {
    background-image: url("${VEGA_ICON_DATA_URI}") !important;
    background-size: contain !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
}
.file-icons-enabled .show-file-icons .vscode_getting_started_page-name-file-icon.file-icon:before {
    background-image: url("${VEGA_ICON_DATA_URI}") !important;
    background-size: contain !important;
    background-repeat: no-repeat !important;
    background-position: center !important;
    mask: none !important;
    -webkit-mask: none !important;
}
${VEGA_CSS_END}`;

function applyConsolidationAndLockin(options = {}) {
  const verbose = options.verbose !== false;
  if (verbose) console.log('=== PHASE: CONSOLIDATION & LOCK-IN ===');

  // ==========================================
  // PHASE 3.1: Patch product.json files
  // ==========================================
  if (verbose) console.log('--- Patching product.json across all active directories ---');
  const appDirs = config.getActiveAppDirs();
  for (const app of appDirs) {
    config.patchProductJson(app.productJson);
  }
  const vscodeProduct = path.join(config.ROOT_DIR, 'vscode', 'product.json');
  if (fs.existsSync(vscodeProduct)) {
    config.patchProductJson(vscodeProduct);
  }

  // ==========================================
  // PHASE 3.2: Replace remaining internal VS Code icons
  // ==========================================
  applyInternalBranding({ verbose });

  // ==========================================
  // PHASE 3.3: Patch workbench.desktop.main.css (Idempotent)
  // ==========================================
  if (verbose) console.log('--- Idempotent CSS purge in workbench.desktop.main.css ---');
  const cssRegex = new RegExp(`${escapeRegex(VEGA_CSS_START)}[\\s\\S]*?${escapeRegex(VEGA_CSS_END)}`, 'g');
  // Also clean any legacy un-bracketed blocks
  const legacyRegex = /\/\* === VEGA IDE: PURGE COPILOT & SIGN-IN UI === \*\/[\s\S]*?display: none !important;\s*\}/g;

  for (const app of appDirs) {
    const cssPath = app.cssPath;
    if (fs.existsSync(cssPath)) {
      try {
        let css = fs.readFileSync(cssPath, 'utf8');
        // Remove legacy unbracketed block if present
        css = css.replace(legacyRegex, '').trim();

        const hadPatch = css.includes(VEGA_CSS_START) || css.includes(VEGA_CSS_END);
        css = css.replace(cssRegex, '').trimEnd();
        if (css.includes(VEGA_CSS_START) || css.includes(VEGA_CSS_END)) {
          throw new Error(`Found an incomplete Vega CSS patch block in ${cssPath}`);
        }
        css = `${css}\n${VEGA_CSS_BLOCK}\n`;
        if (verbose) console.log(`[CSS ${hadPatch ? 'REPLACED IDEMPOTENTLY' : 'APPLIED'}] ${cssPath}`);
        fs.writeFileSync(cssPath, css, 'utf8');
      } catch (err) {
        throw new Error(`Failed to patch CSS at ${cssPath}: ${err.message}`, { cause: err });
      }
    }
  }

  // ==========================================
  // PHASE 4.1: Lock In Continue Orchestrator Config (Clean UTF-8 \u26A1)
  // ==========================================
  if (verbose) console.log('--- Locking in Auto-Failover Orchestrator configuration ---');
  const continueDir = path.join(config.USER_HOME, '.continue');
  const continueJsonPath = path.join(continueDir, 'config.json');
  const continueYamlPath = path.join(continueDir, 'config.yaml');

  fs.mkdirSync(continueDir, { recursive: true });

  const pythonExe = config.resolvePythonInterpreter();
  const mcpServerScript = path.join(config.USER_HOME, 'AI-Agent-Orchestrator', 'orchestrator_mcp_server.py');

  const cascadeTitle = "\u26A1 Auto-Failover Orchestrator (10-Model Cascade)";

  const continueConfig = {
    models: [
      {
        title: cascadeTitle,
        name: "Auto-Failover Orchestrator (10-Model Cascade)",
        provider: "openai",
        model: "auto-failover-orchestrator",
        apiBase: "http://127.0.0.1:8765/v1",
        apiKey: "local-orchestrator",
        roles: ["chat", "edit", "apply"]
      },
      {
        title: "Qwen2.5-Coder 3B (Local Fallback)",
        name: "Qwen2.5-Coder 3B (Local Fallback)",
        provider: "ollama",
        model: "qwen2.5-coder-backup:3b",
        roles: ["chat"]
      }
    ],
    tabAutocompleteModel: {
      title: "Qwen2.5-Coder 3B (Local Fallback)",
      provider: "ollama",
      model: "qwen2.5-coder-backup:3b"
    },
    mcpServers: [
      {
        name: "orchestrator",
        command: pythonExe.replace(/\\/g, '/'),
        args: [
          mcpServerScript.replace(/\\/g, '/')
        ]
      }
    ]
  };

  let existingContinueConfig = {};
  if (fs.existsSync(continueJsonPath)) {
    try {
      existingContinueConfig = JSON.parse(fs.readFileSync(continueJsonPath, 'utf8'));
    } catch (err) {
      throw new Error(`Could not parse Continue config ${continueJsonPath}: ${err.message}`, { cause: err });
    }
  }
  const mergedContinueConfig = { ...continueConfig, ...existingContinueConfig };
  const existingModels = Array.isArray(existingContinueConfig.models) ? existingContinueConfig.models : [];
  mergedContinueConfig.models = [
    ...existingModels,
    ...continueConfig.models.filter(model => !existingModels.some(existing => existing.model === model.model))
  ];
  const existingMcpServers = Array.isArray(existingContinueConfig.mcpServers) ? existingContinueConfig.mcpServers : [];
  mergedContinueConfig.mcpServers = [
    ...existingMcpServers,
    ...continueConfig.mcpServers.filter(server => !existingMcpServers.some(existing => existing.name === server.name))
  ];
  if (!existingContinueConfig.tabAutocompleteModel) {
    mergedContinueConfig.tabAutocompleteModel = continueConfig.tabAutocompleteModel;
  }
  fs.writeFileSync(continueJsonPath, JSON.stringify(mergedContinueConfig, null, 2), 'utf8');
  if (verbose) console.log(`[CONTINUE CONFIG.JSON LOCKED] ${continueJsonPath}`);

  const yamlContent = `name: Main Config
version: 1.0.0
schema: v1
models:
  - name: "${cascadeTitle}"
    provider: openai
    model: auto-failover-orchestrator
    apiBase: http://127.0.0.1:8765/v1
    apiKey: local-orchestrator
    roles:
      - chat
      - edit
      - apply
  - name: "Qwen2.5-Coder 3B (Local Fallback)"
    provider: ollama
    model: qwen2.5-coder-backup:3b
    roles:
      - chat
mcpServers:
  - name: orchestrator
    command: "${pythonExe.replace(/\\/g, '/')}"
    args:
      - "${mcpServerScript.replace(/\\/g, '/')}"
`;
  if (fs.existsSync(continueYamlPath)) {
    const existingYaml = fs.readFileSync(continueYamlPath, 'utf8');
    if (existingYaml.includes('\uFFFD')) {
      throw new Error(`Continue YAML config contains invalid UTF-8 replacement characters: ${continueYamlPath}`);
    }
    if (verbose) console.log(`[CONTINUE CONFIG.YAML PRESERVED] ${continueYamlPath}`);
  } else {
    fs.writeFileSync(continueYamlPath, yamlContent, 'utf8');
    if (verbose) console.log(`[CONTINUE CONFIG.YAML CREATED] ${continueYamlPath}`);
  }

  // ==========================================
  // PHASE 4.2: Update settings.json across all profiles
  // ==========================================
  if (verbose) console.log('--- Merging developer defaults into settings.json ---');
  const settingsDirs = [
    path.join(config.APPDATA, 'vega', 'User'),
    path.join(config.APPDATA, 'Vega IDE', 'User'),
    path.join(config.APPDATA, '.vega', 'User'),
    path.join(config.USER_HOME, '.vega', 'User'),
    path.join(config.VEGA_DATA_DIR, 'User')
  ];

  // Developer settings with audit documentation:
  // - chat.disableAIFeatures: Disables built-in Microsoft Copilot features while keeping Orchestrator functional
  // - chat.commandCenter.enabled: Hides Copilot trigger in command center bar
  // - github.gitAuthentication: Disables automatic GitHub OAuth popups for local Git repositories
  // - telemetry.telemetryLevel: Disables telemetry transmission
  // - sync.enable: Disables Microsoft cloud settings sync
  const developerSettings = {
    "window.menuBarVisibility": "classic",
    "window.commandCenter": true,
    "workbench.layoutControl.enabled": true,
    "chat.commandCenter.enabled": false,
    "chat.disableAIFeatures": true,
    "telemetry.telemetryLevel": "off",
    "sync.enable": false,
    "github.gitAuthentication": false,
    "extensions.ignoreRecommendations": true,
    "workbench.tips.enabled": false,
    "python.defaultInterpreterPath": pythonExe,
    "python.analysis.typeCheckingMode": "basic",
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "[python]": {
      "editor.formatOnSave": true
    },
    "terminal.integrated.defaultProfile.windows": "PowerShell",
    "gitlens.launchpad.indicator.enabled": false,
    "gitlens.plusFeatures.enabled": false
  };

  settingsDirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const sFile = path.join(dir, 'settings.json');
    let currentSettings = {};

    if (fs.existsSync(sFile)) {
      try {
        const content = fs.readFileSync(sFile, 'utf8').trim();
        if (content) currentSettings = JSON.parse(content);
      } catch (e) {
        throw new Error(`Could not parse settings file ${sFile}: ${e.message}`, { cause: e });
      }
    }

    // Preserve existing colorCustomizations & colorTheme
    const preservedColors = currentSettings["workbench.colorCustomizations"] || {};
    const preservedTheme = currentSettings["workbench.colorTheme"] || "Default Dark Modern";

    // Merge new developer settings
    Object.assign(currentSettings, developerSettings);

    // Re-apply preserved theme & colors
    currentSettings["workbench.colorTheme"] = preservedTheme;
    currentSettings["workbench.colorCustomizations"] = preservedColors;

    fs.writeFileSync(sFile, JSON.stringify(currentSettings, null, 2), 'utf8');
    if (verbose) console.log(`[SETTINGS.JSON UPDATED] ${sFile}`);
  });

  if (verbose) console.log('=== CONSOLIDATION & LOCK-IN COMPLETE ===');
  return { success: true };
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (require.main === module) {
  try {
    applyConsolidationAndLockin();
  } catch (err) {
    console.error('[ERROR] applyConsolidationAndLockin failed:', err);
    process.exit(1);
  }
}

module.exports = {
  applyConsolidationAndLockin,
  VEGA_CSS_START,
  VEGA_CSS_END,
  VEGA_CSS_BLOCK
};
