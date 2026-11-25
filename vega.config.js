/**
 * Vega IDE Central Configuration & Build Definitions
 * 
 * Single source of truth for paths, branding, extensions, and build helpers.
 * Removes hardcoded usernames and stale commit hashes.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const crypto = require('crypto');

// 1. Environment & Path Resolution
const USER_HOME = os.homedir();
const APPDATA = process.env.APPDATA || path.join(USER_HOME, 'AppData', 'Roaming');
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(USER_HOME, 'AppData', 'Local');
const USERPROFILE = process.env.USERPROFILE || USER_HOME;

const ROOT_DIR = path.resolve(__dirname);
const TARGET_DIR = path.join(ROOT_DIR, 'vscode-win32-x64');
const SRC_BASE = process.env.VSCODE_SRC_BASE || path.join(LOCALAPPDATA, 'Programs', 'Microsoft VS Code');

const ICO_PATH = path.join(ROOT_DIR, 'vega_infinity.ico');
const SVG_PATH = path.join(ROOT_DIR, 'vega_infinity.svg');
const VEGA_DATA_DIR = path.join(ROOT_DIR, 'vega-data');
const VEGA_EXTENSIONS_DIR = path.join(USER_HOME, '.vega', 'extensions');
const VSCODE_EXTENSIONS_DIR = path.join(USER_HOME, '.vscode', 'extensions');

// 2. Python Interpreter Dynamic Resolution
function resolvePythonInterpreter() {
  if (process.env.VEGA_PYTHON && fs.existsSync(process.env.VEGA_PYTHON)) {
    return process.env.VEGA_PYTHON;
  }

  // Try `where python` / `where.exe python` on Windows
  try {
    const stdout = cp.execSync('where python', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const lines = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    for (const line of lines) {
      if (line.toLowerCase().endsWith('python.exe') && !line.toLowerCase().includes('windowsapps')) {
        if (fs.existsSync(line)) {
          return line;
        }
      }
    }
  } catch (err) {
    if (err.code !== 'ENOENT' && err.status !== 1) {
      throw new Error(`Failed to locate Python interpreter: ${err.message}`, { cause: err });
    }
  }

  // Check standard user installs
  const candidateDirs = [
    path.join(LOCALAPPDATA, 'Programs', 'Python', 'Python311', 'python.exe'),
    path.join(LOCALAPPDATA, 'Programs', 'Python', 'Python312', 'python.exe'),
    path.join(LOCALAPPDATA, 'Programs', 'Python', 'Python310', 'python.exe'),
    path.join(LOCALAPPDATA, 'Programs', 'Python', 'Python313', 'python.exe'),
    'C:/Python311/python.exe',
    'C:/Python312/python.exe',
    'C:/Python310/python.exe'
  ];

  for (const candidate of candidateDirs) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return 'python';
}

// 3. Dynamic VS Code App Directory Discovery
function getActiveAppDirs(targetDir = TARGET_DIR) {
  const results = [];
  if (!fs.existsSync(targetDir)) return results;

  // Check root resources/app
  const rootApp = path.join(targetDir, 'resources', 'app');
  const rootProduct = path.join(rootApp, 'product.json');
  let activeCommit;
  if (fs.existsSync(rootProduct)) {
    let rootProductJson;
    try {
      rootProductJson = JSON.parse(fs.readFileSync(rootProduct, 'utf8'));
    } catch (err) {
      throw new Error(`Could not parse active product manifest ${rootProduct}: ${err.message}`, { cause: err });
    }
    if (typeof rootProductJson.commit === 'string' && /^[0-9a-f]{40}$/i.test(rootProductJson.commit)) {
      activeCommit = rootProductJson.commit.slice(0, 10).toLowerCase();
    }
    results.push({
      id: 'root',
      appDir: rootApp,
      productJson: rootProduct,
      cssPath: path.join(rootApp, 'out', 'vs', 'workbench', 'workbench.desktop.main.css'),
      themesDir: path.join(rootApp, 'extensions', 'theme-defaults', 'themes')
    });
  }

  // Discover subdirectories containing resources/app/product.json (skipping backup directories)
  try {
    const entries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // Skip known non-app or backup directories
      if (name.includes('bak') || ['appx', 'bin', 'locales', 'policies', 'resources', 'tools'].includes(name.toLowerCase())) {
        continue;
      }
      if (activeCommit && name.toLowerCase() !== activeCommit) {
        continue;
      }
      const subApp = path.join(targetDir, name, 'resources', 'app');
      const subProduct = path.join(subApp, 'product.json');
      if (fs.existsSync(subProduct)) {
        results.push({
          id: name,
          appDir: subApp,
          productJson: subProduct,
          cssPath: path.join(subApp, 'out', 'vs', 'workbench', 'workbench.desktop.main.css'),
          themesDir: path.join(subApp, 'extensions', 'theme-defaults', 'themes')
        });
      }
    }
  } catch (err) {
    throw new Error(`Could not scan active app directories in ${targetDir}: ${err.message}`, { cause: err });
  }

  return results;
}

// 4. Product Branding Definition (Single Source of Truth)
const PRODUCT_BRANDING = {
  nameShort: "Vega IDE",
  nameLong: "Vega Integrated Development Environment",
  applicationName: "vega",
  dataFolderName: ".vega",
  win32MutexName: "vega",
  urlProtocol: "vega",
  win32DirName: "Vega IDE",
  win32NameVersion: "Vega IDE",
  win32AppUserModelId: "Vega.VegaIDE",
  win32ShellNameShort: "Vega",
  extensionsGallery: {
    serviceUrl: "https://open-vsx.org/vscode/gallery",
    itemUrl: "https://open-vsx.org/vscode/item",
    resourceUrlTemplate: "https://open-vsx.org/vscode/unpkg/{publisher}/{name}/{version}/{path}"
  },
  defaultChatAgent: {
    providerExtensionId: 'continue.continue',
    extensionId: 'continue.continue',
    chatExtensionId: 'continue.continue',
    chatExtensionOutputId: 'continue.continue.log',
    documentationUrl: 'https://continue.dev',
    termsStatementUrl: 'https://continue.dev',
    privacyStatementUrl: 'https://continue.dev',
    skusDocumentationUrl: 'https://continue.dev',
    publicCodeMatchesUrl: 'https://continue.dev',
    manageSettingsUrl: 'https://continue.dev',
    managePlanUrl: 'https://continue.dev',
    manageOverageUrl: 'https://continue.dev',
    upgradePlanUrl: 'https://continue.dev',
    signUpUrl: 'https://continue.dev',
    provider: {
      default: { id: 'orchestrator', name: 'Vega Orchestrator' },
      enterprise: { id: 'orchestrator', name: 'Vega Orchestrator' }
    },
    providerUriSetting: 'continue.uri',
    providerScopes: [[]],
    completionsAdvancedSetting: 'continue.advanced',
    completionsEnablementSetting: 'continue.enableTabAutocomplete'
  },
  keysToDelete: [
    "checksums",
    "checksumFailMoreInfoUrl",
    "chatWelcomeView",
    "walkthroughs",
    "chatParticipantRegistry",
    "chatSessionRecommendations",
    "copilotVersions"
  ]
};

// 5. Extensions Single Source of Truth
const REQUIRED_EXTENSIONS = [
  // AI & Orchestrator Stack
  'continue.continue',
  'saoudrizwan.claude-dev',
  'orchestrator-chat',
  'vega-ai-monitor',

  // Phase A: Core Daily Stack
  'charliermarsh.ruff',
  'redhat.vscode-yaml',
  'timonwong.shellcheck',
  'qwtel.sqlite-viewer',

  // Phase B: Roadmap & DevOps Stack
  'ms-python.python',
  'ms-azuretools.vscode-docker',
  'github.vscode-github-actions',
  'ms-kubernetes-tools.vscode-kubernetes-tools',

  // Language & Runtime Stack
  'ms-python.vscode-pylance',
  'ms-python.debugpy',
  'ms-toolsai.jupyter',
  'eamodio.gitlens',
  'usernamehw.errorlens',
  'esbenp.prettier-vscode',
  'ms-vscode.powershell',
  'ms-vscode-remote.remote-ssh',
  'visualstudiotoolsforunity.vstuc',

  // Cloud & OpenShift Stack (Resume-Aligned)
  'amazonwebservices.aws-toolkit-vscode',
  'redhat.vscode-openshift-connector',
  'redhat.vscode-redhat-account'
];

const BLOAT_PATTERNS = [
  'github.copilot',
  'github.copilot-chat',
  'github.copilot-for-azure',
  'eowl.copilot-adapter',
  'amazonwebservices.amazon-q-vscode',
  'visualstudioexptteam.vscodeintellicode',
  'visualstudioexptteam.intellicode-api-usage-examples',
  'ms-azuretools.vscode-azureresourcegroups',
  'ms-azuretools.vscode-azure-mcp-server',
  'ms-azuretools.vscode-azure-github-copilot',
  'teamsdevapp.vscode-ai-foundry',
  'hoovercj.vscode-power-mode',
  'parekhdhruv.quickpaste-console-log'
];

// Enforce Zero Overlap between REQUIRED_EXTENSIONS and BLOAT_PATTERNS
function validateExtensionLists() {
  const conflicts = [];
  for (const req of REQUIRED_EXTENSIONS) {
    const reqLower = req.toLowerCase();
    for (const bloat of BLOAT_PATTERNS) {
      const bloatLower = bloat.toLowerCase();
      if (reqLower === bloatLower || reqLower.startsWith(bloatLower) || bloatLower.startsWith(reqLower)) {
        conflicts.push({ required: req, bloatPattern: bloat });
      }
    }
  }
  if (conflicts.length > 0) {
    throw new Error(`CRITICAL CONFIG ERROR: Overlap detected between REQUIRED_EXTENSIONS and BLOAT_PATTERNS: ${JSON.stringify(conflicts)}`);
  }
  return true;
}
validateExtensionLists();

// 6. Authoritative product.json Patching Function
function patchProductJson(filePath) {
  if (!fs.existsSync(filePath)) {
    const parent = path.dirname(filePath);
    if (!fs.existsSync(parent)) return false;
  }

  let prod = {};
  if (fs.existsSync(filePath)) {
    try {
      prod = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
      throw new Error(`Could not parse product manifest ${filePath}: ${e.message}`, { cause: e });
    }
  }

  // Apply identity and branding
  prod.nameShort = PRODUCT_BRANDING.nameShort;
  prod.nameLong = PRODUCT_BRANDING.nameLong;
  prod.applicationName = PRODUCT_BRANDING.applicationName;
  prod.dataFolderName = PRODUCT_BRANDING.dataFolderName;
  prod.win32MutexName = PRODUCT_BRANDING.win32MutexName;
  prod.urlProtocol = PRODUCT_BRANDING.urlProtocol;
  prod.win32DirName = PRODUCT_BRANDING.win32DirName;
  prod.win32NameVersion = PRODUCT_BRANDING.win32NameVersion;
  prod.win32AppUserModelId = PRODUCT_BRANDING.win32AppUserModelId;
  prod.win32ShellNameShort = PRODUCT_BRANDING.win32ShellNameShort;
  prod.extensionsGallery = { ...PRODUCT_BRANDING.extensionsGallery };
  prod.defaultChatAgent = { ...PRODUCT_BRANDING.defaultChatAgent };

  // Remove checksums and unwanted copilot keys
  for (const k of PRODUCT_BRANDING.keysToDelete) {
    delete prod[k];
  }

  // Register continue in builtInExtensions
  if (!Array.isArray(prod.builtInExtensions)) {
    prod.builtInExtensions = [];
  }
  if (!prod.builtInExtensions.some(e => e.name === 'continue')) {
    prod.builtInExtensions.push({
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
  }

  fs.writeFileSync(filePath, JSON.stringify(prod, null, '\t'), 'utf8');
  console.log(`[PRODUCT.JSON PATCHED] ${filePath}`);
  return true;
}

// 7. Filesystem & Process Helpers
function copyRecursiveSync(src, dest, options = {}) {
  if (!fs.existsSync(src)) {
    if (options.warnIfMissing === false) return false;
    throw new Error(`Source path does not exist for copy: ${src}`);
  }

  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    const entries = fs.readdirSync(src);
    for (const item of entries) {
      copyRecursiveSync(path.join(src, item), path.join(dest, item), options);
    }
  } else {
    const sourceStats = fs.statSync(src);
    if (fs.existsSync(dest)) {
      const destinationStats = fs.statSync(dest);
      if (sourceStats.size === destinationStats.size && sourceStats.mtimeMs === destinationStats.mtimeMs) {
        return true;
      }
    }

    try {
      const destDir = path.dirname(dest);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      fs.copyFileSync(src, dest);
    } catch (err) {
      if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code) && fs.existsSync(dest)) {
        const sourceHash = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
        const destinationHash = crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
        if (sourceHash === destinationHash) {
          console.warn(`[LOCKED IDENTICAL] Skipping unchanged file in use: ${dest}`);
          return true;
        }
      }
      throw new Error(`Failed to copy ${src} to ${dest}: ${err.message}`, { cause: err });
    }
  }
  return true;
}

function isExeLocked(exePath) {
  if (!fs.existsSync(exePath)) return false;
  try {
    const fd = fs.openSync(exePath, 'r+');
    fs.closeSync(fd);
    return false;
  } catch (err) {
    if (['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) {
      return true;
    }
    throw new Error(`Unable to determine whether ${exePath} is locked: ${err.message}`, { cause: err });
  }
}

function isProcessRunning(processName) {
  try {
    const stdout = cp.execSync(`tasklist /FI "IMAGENAME eq ${processName}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return stdout.toLowerCase().includes(processName.toLowerCase());
  } catch (err) {
    throw new Error(`Unable to check whether ${processName} is running: ${err.message}`, { cause: err });
  }
}

function syncVegaExecutable(sourceExe = path.join(TARGET_DIR, 'Code.exe')) {
  const vegaExe = path.join(TARGET_DIR, 'vega.exe');
  if (!fs.existsSync(sourceExe)) {
    throw new Error(`Cannot synchronize Vega executable; source does not exist: ${sourceExe}`);
  }
  if (path.resolve(sourceExe) === path.resolve(vegaExe)) {
    throw new Error('Cannot synchronize vega.exe from itself.');
  }
  if (isProcessRunning('vega.exe') || isExeLocked(vegaExe)) {
    const error = new Error('Cannot synchronize vega.exe while it is running or locked.');
    error.code = 'VEGA_EXECUTABLE_LOCKED';
    throw error;
  }

  try {
    fs.copyFileSync(sourceExe, vegaExe);
  } catch (err) {
    throw new Error(`Failed to copy ${sourceExe} to ${vegaExe}: ${err.message}`, { cause: err });
  }

  const sourceSize = fs.statSync(sourceExe).size;
  const targetSize = fs.statSync(vegaExe).size;
  if (sourceSize !== targetSize) {
    throw new Error(`Executable copy verification failed: ${sourceExe} is ${sourceSize} bytes; ${vegaExe} is ${targetSize} bytes.`);
  }
  return vegaExe;
}

module.exports = {
  USER_HOME,
  APPDATA,
  LOCALAPPDATA,
  USERPROFILE,
  ROOT_DIR,
  TARGET_DIR,
  SRC_BASE,
  ICO_PATH,
  SVG_PATH,
  VEGA_DATA_DIR,
  VEGA_EXTENSIONS_DIR,
  VSCODE_EXTENSIONS_DIR,
  PRODUCT_BRANDING,
  REQUIRED_EXTENSIONS,
  BLOAT_PATTERNS,
  resolvePythonInterpreter,
  getActiveAppDirs,
  validateExtensionLists,
  patchProductJson,
  copyRecursiveSync,
  isExeLocked,
  isProcessRunning,
  syncVegaExecutable
};
