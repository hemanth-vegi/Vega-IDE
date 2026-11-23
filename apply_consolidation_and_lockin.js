const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== EXECUTING PHASES 3 & 4 ===');

// ==========================================
// PHASE 3.1: Patch product.json files
// ==========================================
console.log('--- Patching product.json across all directories ---');
const productJsonPaths = [
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/dcd3ad6e36/resources/app/product.json',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/69047191fc/resources/app/product.json',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/resources/app/product.json',
  'C:/CloudLab/Vega-IDE-Build/vscode/product.json'
];

productJsonPaths.forEach(p => {
  if (!fs.existsSync(p)) {
    // If parent directory exists, we can write it
    const parent = path.dirname(p);
    if (!fs.existsSync(parent)) return;
  }

  let prod = {};
  if (fs.existsSync(p)) {
    try {
      prod = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      console.warn(`Error reading ${p}: ${e.message}`);
    }
  }

  // Identity
  prod.nameShort = "Vega IDE";
  prod.nameLong = "Vega Integrated Development Environment";
  prod.applicationName = "vega";
  prod.dataFolderName = ".vega";
  prod.win32MutexName = "vega";
  prod.urlProtocol = "vega";
  prod.win32DirName = "Vega IDE";
  prod.win32NameVersion = "Vega IDE";
  prod.win32AppUserModelId = "Vega.VegaIDE";
  prod.win32ShellNameShort = "Vega";

  // Remove checksums completely to prevent corrupt installation banners
  delete prod.checksums;
  delete prod.checksumFailMoreInfoUrl;

  // Remove Copilot & Microsoft Chat agents
  delete prod.defaultChatAgent;
  delete prod.chatWelcomeView;
  delete prod.walkthroughs;
  delete prod.chatParticipantRegistry;
  delete prod.chatSessionRecommendations;
  delete prod.copilotVersions;

  // Ensure Open VSX extension gallery
  prod.extensionsGallery = {
    serviceUrl: "https://open-vsx.org/vscode/gallery",
    itemUrl: "https://open-vsx.org/vscode/item",
    resourceUrlTemplate: "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}"
  };

  fs.writeFileSync(p, JSON.stringify(prod, null, '\t'), 'utf8');
  console.log(`[PRODUCT.JSON PATCHED] ${p}`);
});

// ==========================================
// PHASE 3.2: Patch workbench.desktop.main.css
// ==========================================
console.log('--- Patching workbench.desktop.main.css across all build directories ---');
const cssPaths = [
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/dcd3ad6e36/resources/app/out/vs/workbench/workbench.desktop.main.css',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/69047191fc/resources/app/out/vs/workbench/workbench.desktop.main.css'
];

const cssRulesToAppend = `
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
`;

cssPaths.forEach(cssPath => {
  if (fs.existsSync(cssPath)) {
    let css = fs.readFileSync(cssPath, 'utf8');
    if (!css.includes('VEGA IDE: PURGE COPILOT & SIGN-IN UI')) {
      css += '\n' + cssRulesToAppend;
      fs.writeFileSync(cssPath, css, 'utf8');
      console.log(`[CSS PATCHED] ${cssPath}`);
    } else {
      // Replace existing block with the updated complete block
      css = css.replace(/\/\* === VEGA IDE: PURGE COPILOT & SIGN-IN UI === \*\/[\s\S]*?display: none !important;\s*\}/g, '');
      css += '\n' + cssRulesToAppend;
      fs.writeFileSync(cssPath, css, 'utf8');
      console.log(`[CSS RE-APPLIED] ${cssPath}`);
    }
  }
});

// ==========================================
// PHASE 4.1: Lock In Continue Orchestrator Config
// ==========================================
console.log('--- Locking in Auto-Failover Orchestrator configuration ---');
const continueJsonPath = path.join(os.homedir(), '.continue', 'config.json');
const continueYamlPath = path.join(os.homedir(), '.continue', 'config.yaml');

const continueConfig = {
  models: [
    {
      title: "⚡ Auto-Failover Orchestrator (10-Model Cascade)",
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
      command: "C:/Users/heman/AppData/Local/Programs/Python/Python311/python.exe",
      args: [
        "C:/Users/heman/AI-Agent-Orchestrator/orchestrator_mcp_server.py"
      ]
    }
  ]
};

fs.writeFileSync(continueJsonPath, JSON.stringify(continueConfig, null, 2), 'utf8');
console.log(`[CONTINUE CONFIG.JSON LOCKED] ${continueJsonPath}`);

const yamlContent = `name: Main Config
version: 1.0.0
schema: v1
models:
  - name: "⚡ Auto-Failover Orchestrator (10-Model Cascade)"
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
    command: "C:/Users/heman/AppData/Local/Programs/Python/Python311/python.exe"
    args:
      - "C:/Users/heman/AI-Agent-Orchestrator/orchestrator_mcp_server.py"
`;
fs.writeFileSync(continueYamlPath, yamlContent, 'utf8');
console.log(`[CONTINUE CONFIG.YAML LOCKED] ${continueYamlPath}`);

// ==========================================
// PHASE 4.2: Update settings.json across all profiles
// ==========================================
console.log('--- Merging developer defaults into settings.json ---');
const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
const userProfile = process.env.USERPROFILE || os.homedir();

const settingsDirs = [
  path.join(appData, 'vega', 'User'),
  path.join(appData, 'Vega IDE', 'User'),
  path.join(appData, '.vega', 'User'),
  path.join(userProfile, '.vega', 'User'),
  'C:/CloudLab/Vega-IDE-Build/vega-data/User'
];

const newSettings = {
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
  "python.defaultInterpreterPath": "C:\\Users\\heman\\AppData\\Local\\Programs\\Python\\Python311\\python.exe",
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
      console.warn(`Could not parse ${sFile}: ${e.message}`);
    }
  }

  // Preserve existing workbench.colorCustomizations
  const preservedColors = currentSettings["workbench.colorCustomizations"] || {};
  const preservedTheme = currentSettings["workbench.colorTheme"] || "Default Dark Modern";

  // Merge new functional settings
  Object.assign(currentSettings, newSettings);

  // Re-apply preserved theme & colors
  currentSettings["workbench.colorTheme"] = preservedTheme;
  currentSettings["workbench.colorCustomizations"] = preservedColors;

  fs.writeFileSync(sFile, JSON.stringify(currentSettings, null, 2), 'utf8');
  console.log(`[SETTINGS.JSON UPDATED] ${sFile}`);
});

console.log('=== PHASES 3 & 4 COMPLETE ===');
