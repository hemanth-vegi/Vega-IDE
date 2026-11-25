/**
 * Vega IDE Automated Build & Verification Test Suite
 * 
 * Executes comprehensive assertions across all workstreams:
 *  1. Config Conflict Test (Zero intersection between required and bloat)
 *  2. Encoding & Syntax Test (Strict JSON parsing, zero Mojibake)
 *  3. Branding & Checksum Test (Vega IDE branding, Open VSX gallery, zero checksums)
 *  4. CSS Idempotency Test (CSS block appears exactly once)
 *  5. Executable & Icon Test (vega.exe existence, icon existence, PE metadata)
 *  6. Git & Disk Safety Test (No binary leaks, all disk stores intact)
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const config = require('./vega.config.js');
const {
  getVegaIconDataUri,
  collectFilesNamed: collectBrandingFilesNamed,
  LETTERPRESS_FILES
} = require('./apply_internal_branding.js');

const MOJIBAKE_LIGHTNING = String.fromCharCode(0x00e2, 0x0161, 0x00a1);

const SETTINGS_DIRS = [
  path.join(config.APPDATA, 'vega', 'User'),
  path.join(config.APPDATA, 'Vega IDE', 'User'),
  path.join(config.APPDATA, '.vega', 'User'),
  path.join(config.USER_HOME, '.vega', 'User'),
  path.join(config.VEGA_DATA_DIR, 'User')
];

function collectFilesNamed(root, fileName) {
  if (!fs.existsSync(root)) return [];
  const found = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === fileName) found.push(fullPath);
    else if (entry.isDirectory()) found.push(...collectFilesNamed(fullPath, fileName));
  }
  return found;
}

function readStrictJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stripJsonComments(source) {
  let output = '';
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === '\n' || character === '\r') {
        lineComment = false;
        output += character;
      }
      continue;
    }
    if (blockComment) {
      if (character === '*' && next === '/') {
        blockComment = false;
        index += 1;
      } else if (character === '\n' || character === '\r') output += character;
      continue;
    }
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === '/' && next === '/') {
      lineComment = true;
      index += 1;
    } else if (character === '/' && next === '*') {
      blockComment = true;
      index += 1;
    } else output += character;
  }
  return output;
}

function parseJsonc(source) {
  const withoutComments = stripJsonComments(source);
  let output = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < withoutComments.length; index += 1) {
    const character = withoutComments[index];
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === ',') {
      let next = index + 1;
      while (next < withoutComments.length && /\s/.test(withoutComments[next])) next += 1;
      if (withoutComments[next] !== '}' && withoutComments[next] !== ']') output += character;
    } else output += character;
  }
  return JSON.parse(output);
}

function readSettingsJson(filePath) {
  return parseJsonc(fs.readFileSync(filePath, 'utf8'));
}

function isValidColor(value) {
  return /^(#[\da-f]{3,4}|#[\da-f]{6}|#[\da-f]{8}|rgba?\([^)]*\)|hsla?\([^)]*\)|transparent|currentColor|var\(--[^)]+\))$/i.test(value.trim());
}

function getExecutableVersion(exePath) {
  const escapedPath = exePath.replace(/'/g, "''");
  const command = `(Get-Item -LiteralPath '${escapedPath}').VersionInfo.FileVersion`;
  return cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

async function verifyVegaBuild(options = {}) {
  const verbose = options.verbose !== false;
  console.log('\n================================================================');
  console.log('         VEGA IDE AUTOMATED VERIFICATION SUITE');
  console.log('================================================================\n');

  const results = [];
  function assertTest(name, condition, details = '') {
    const passed = Boolean(condition);
    results.push({ name, passed, details });
    const mark = passed ? '[PASS]' : '[FAIL]';
    console.log(`${mark} ${name}${details ? ` (${details})` : ''}`);
    return passed;
  }

  // -------------------------------------------------------------
  // TEST 1: Config Conflict Test (Zero Intersection)
  // -------------------------------------------------------------
  console.log('--- TEST GROUP 1: Configuration & Bloat Patterns ---');
  let conflictFound = false;
  const conflicts = [];
  for (const req of config.REQUIRED_EXTENSIONS) {
    const reqLower = req.toLowerCase();
    for (const bloat of config.BLOAT_PATTERNS) {
      const bloatLower = bloat.toLowerCase();
      if (reqLower === bloatLower || reqLower.startsWith(bloatLower) || bloatLower.startsWith(reqLower)) {
        conflictFound = true;
        conflicts.push({ required: req, bloat });
      }
    }
  }

  assertTest(
    'Config Conflict: Zero intersection between REQUIRED_EXTENSIONS and BLOAT_PATTERNS',
    !conflictFound,
    conflictFound ? `Found conflicts: ${JSON.stringify(conflicts)}` : 'Verified 0 overlaps'
  );

  assertTest(
    'Config Preservation: charliermarsh.ruff is REQUIRED and NOT in BLOAT',
    config.REQUIRED_EXTENSIONS.includes('charliermarsh.ruff') && !config.BLOAT_PATTERNS.includes('charliermarsh.ruff')
  );

  assertTest(
    'Config Preservation: amazonwebservices.aws-toolkit-vscode is REQUIRED and NOT in BLOAT',
    config.REQUIRED_EXTENSIONS.includes('amazonwebservices.aws-toolkit-vscode') && !config.BLOAT_PATTERNS.includes('amazonwebservices.aws-toolkit-vscode')
  );

  // -------------------------------------------------------------
  // TEST 2: Encoding & Syntax Test (Strict JSON & No Mojibake)
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 2: Encoding & Syntax Validation ---');
  const continueDir = path.join(config.USER_HOME, '.continue');
  const continueJsonPath = path.join(continueDir, 'config.json');
  const continueYamlPath = path.join(continueDir, 'config.yaml');

  let continueJsonValid = false;
  let continueJsonNoMojibake = false;
  let continueJsonError = '';
  if (fs.existsSync(continueJsonPath)) {
    try {
      const raw = fs.readFileSync(continueJsonPath, 'utf8');
      JSON.parse(raw);
      continueJsonValid = true;
      continueJsonNoMojibake = !raw.includes(MOJIBAKE_LIGHTNING);
    } catch (err) {
      continueJsonError = err.message;
    }
  }

  assertTest(
    'Continue Config: .continue/config.json parses as strict valid JSON',
    continueJsonValid,
    continueJsonError
  );

  assertTest(
    'Encoding: .continue/config.json contains zero Mojibake',
    continueJsonNoMojibake
  );

  let continueYamlNoMojibake = false;
  if (fs.existsSync(continueYamlPath)) {
    const rawYaml = fs.readFileSync(continueYamlPath, 'utf8');
    continueYamlNoMojibake = !rawYaml.includes(MOJIBAKE_LIGHTNING) && (rawYaml.includes('\u26A1') || rawYaml.includes('Auto-Failover Orchestrator'));
  }

  assertTest(
    'Encoding: .continue/config.yaml contains clean UTF-8 Orchestrator branding and zero Mojibake',
    continueYamlNoMojibake
  );

  let continueYamlValid = false;
  let continueYamlError = '';
  if (fs.existsSync(continueYamlPath)) {
    try {
      cp.execFileSync(config.resolvePythonInterpreter(), [
        '-c',
        'import pathlib, sys, yaml; yaml.safe_load(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))',
        continueYamlPath
      ], { stdio: ['ignore', 'ignore', 'pipe'] });
      continueYamlValid = true;
    } catch (err) {
      continueYamlError = err.stderr ? err.stderr.toString().trim() : err.message;
    }
  }
  assertTest('Continue Config: .continue/config.yaml parses as valid YAML', continueYamlValid, continueYamlError);

  // Check all active product.json files parse strictly
  const appDirs = config.getActiveAppDirs();
  assertTest('App Directory Discovery: Discovered at least one active app directory', appDirs.length > 0, `Found ${appDirs.length} app dirs`);

  let allProductsValidJson = true;
  const productJsonErrors = [];
  for (const app of appDirs) {
    try {
      JSON.parse(fs.readFileSync(app.productJson, 'utf8'));
    } catch (err) {
      allProductsValidJson = false;
      productJsonErrors.push(`${app.productJson}: ${err.message}`);
    }
  }
  assertTest('Syntax: All discovered product.json files parse as valid JSON', allProductsValidJson, productJsonErrors.join('; '));

  const structuredJsonFiles = [
    ...appDirs.map(app => app.productJson),
    ...appDirs.flatMap(app => ['dark_modern.json', 'dark_plus.json', 'dark_vs.json']
      .map(name => path.join(app.themesDir, name))
      .filter(file => fs.existsSync(file))),
    ...SETTINGS_DIRS.flatMap(dir => [
      path.join(dir, 'settings.json'),
      ...collectFilesNamed(path.join(dir, 'profiles'), 'settings.json')
    ]),
    path.join(config.ROOT_DIR, '.vscode', 'extensions.json'),
    path.join(config.VEGA_EXTENSIONS_DIR, 'extensions.json'),
    path.join(config.VSCODE_EXTENSIONS_DIR, 'extensions.json'),
    path.join(config.USER_HOME, '.continue', 'config.json')
  ].filter(file => fs.existsSync(file));

  const invalidJsonFiles = [];
  for (const file of structuredJsonFiles) {
    try {
      if (path.basename(file).toLowerCase() === 'settings.json') readSettingsJson(file);
      else readStrictJson(file);
    } catch (err) {
      invalidJsonFiles.push(`${file}: ${err.message}`);
    }
  }
  assertTest(
    'Syntax: JSON manifests parse strictly and settings.json files parse as JSONC',
    invalidJsonFiles.length === 0,
    invalidJsonFiles.join('; ')
  );

  const mojibakeFiles = [];
  for (const file of [
    ...structuredJsonFiles,
    ...appDirs.map(app => app.cssPath),
    path.join(config.USER_HOME, '.continue', 'config.yaml')
  ].filter(file => fs.existsSync(file))) {
    const raw = fs.readFileSync(file, 'utf8');
    if (raw.includes(MOJIBAKE_LIGHTNING) || raw.includes('\uFFFD')) mojibakeFiles.push(file);
  }
  assertTest('Encoding: Runtime configuration contains zero Mojibake or replacement characters', mojibakeFiles.length === 0, mojibakeFiles.join(', '));

  const settingsColorFailures = [];
  for (const file of SETTINGS_DIRS.flatMap(dir => [
    path.join(dir, 'settings.json'),
    ...collectFilesNamed(path.join(dir, 'profiles'), 'settings.json')
  ]).filter(file => fs.existsSync(file))) {
    try {
      const settings = readSettingsJson(file);
      const colors = settings['workbench.colorCustomizations'];
      if (!colors || typeof colors !== 'object') continue;
      for (const [key, value] of Object.entries(colors)) {
        if (typeof value !== 'string') continue;
        if (/color|foreground|background|border|shadow/i.test(key) && !isValidColor(value)) {
          settingsColorFailures.push(`${file}: ${key}=${value}`);
        }
      }
    } catch (err) {
      settingsColorFailures.push(`${file}: ${err.message}`);
    }
  }
  assertTest('Theme Settings: Custom color values use valid CSS color forms', settingsColorFailures.length === 0, settingsColorFailures.join('; '));

  const themeColorFailures = [];
  for (const app of appDirs) {
    for (const name of ['dark_modern.json', 'dark_plus.json', 'dark_vs.json']) {
      const file = path.join(app.themesDir, name);
      if (!fs.existsSync(file)) continue;
      try {
        const theme = readStrictJson(file);
        for (const [key, value] of Object.entries(theme.colors || {})) {
          if (typeof value === 'string' && !isValidColor(value)) {
            themeColorFailures.push(`${file}: ${key}=${value}`);
          }
        }
      } catch (err) {
        themeColorFailures.push(`${file}: ${err.message}`);
      }
    }
  }
  assertTest('Theme JSON: Every color value in the modified built-in themes is valid CSS', themeColorFailures.length === 0, themeColorFailures.join('; '));

  let builtInEntriesValid = true;
  const builtInFailures = [];
  for (const app of appDirs) {
    const product = readStrictJson(app.productJson);
    for (const extension of product.builtInExtensions || []) {
      const extensionDir = path.join(app.appDir, 'extensions', extension.name);
      const manifestPath = path.join(extensionDir, 'package.json');
      if (!fs.existsSync(manifestPath)) {
        builtInEntriesValid = false;
        builtInFailures.push(`${extension.name}: missing ${manifestPath}`);
        continue;
      }
      try {
        const manifest = readStrictJson(manifestPath);
        const mainPath = manifest.main && path.resolve(extensionDir, manifest.main);
        if (!mainPath || !fs.existsSync(mainPath)) {
          builtInEntriesValid = false;
          builtInFailures.push(`${extension.name}: missing or invalid main entry (${manifest.main || 'unset'})`);
        }
      } catch (err) {
        builtInEntriesValid = false;
        builtInFailures.push(`${extension.name}: ${err.message}`);
      }
    }
  }
  assertTest('BuiltIn Extensions: Every registered extension has a valid package.json and existing main entry', builtInEntriesValid, builtInFailures.join('; '));

  const customExtensionFailures = [];
  for (const app of appDirs) {
    for (const name of ['continue', 'orchestrator-chat', 'vega-ai-monitor']) {
      const extensionDir = path.join(app.appDir, 'extensions', name);
      const manifestPath = path.join(extensionDir, 'package.json');
      try {
        const manifest = readStrictJson(manifestPath);
        if (!manifest.main || !fs.existsSync(path.resolve(extensionDir, manifest.main))) {
          customExtensionFailures.push(`${name}: missing main entry (${manifest.main || 'unset'}) in ${app.id}`);
        }
      } catch (err) {
        customExtensionFailures.push(`${name}: ${err.message} in ${app.id}`);
      }
    }
  }
  assertTest('Vega Extensions: Continue, Orchestrator Chat, and Vega AI Monitor entry points exist in every active app', customExtensionFailures.length === 0, customExtensionFailures.join('; '));

  // -------------------------------------------------------------
  // TEST 3: Branding & Checksum Test
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 3: Product Branding & Security Guardrails ---');
  let allBrandedCorrectly = true;
  let allChecksumsRemoved = true;
  let allGalleriesOpenVSX = true;
  let allContinueRegistered = true;
  const productReadFailures = [];
  const removedCopilotKeys = [
    'checksums',
    'checksumFailMoreInfoUrl',
    'chatWelcomeView',
    'walkthroughs',
    'chatParticipantRegistry',
    'chatSessionRecommendations',
    'copilotVersions'
  ];

  for (const app of appDirs) {
    try {
      const prod = readStrictJson(app.productJson);
      if (prod.nameShort !== 'Vega IDE' || prod.applicationName !== 'vega') {
        allBrandedCorrectly = false;
      }
      if (removedCopilotKeys.some(key => prod[key] !== undefined)) {
        allChecksumsRemoved = false;
      }
      if (!prod.extensionsGallery || prod.extensionsGallery.serviceUrl !== 'https://open-vsx.org/vscode/gallery') {
        allGalleriesOpenVSX = false;
      }
      if (!prod.defaultChatAgent || prod.defaultChatAgent.providerExtensionId !== 'continue.continue' ||
          prod.defaultChatAgent.provider?.default?.id !== 'orchestrator') {
        allContinueRegistered = false;
      }
      if (!Array.isArray(prod.builtInExtensions) || !prod.builtInExtensions.some(e => e.name === 'continue')) {
        allContinueRegistered = false;
      }
    } catch (err) {
      allBrandedCorrectly = false;
      productReadFailures.push(`${app.productJson}: ${err.message}`);
    }
  }

  assertTest(
    'Product Identity: Every active product.json has nameShort="Vega IDE" and applicationName="vega"',
    allBrandedCorrectly,
    productReadFailures.join('; ')
  );

  assertTest(
    'Security Guardrails: Checksums and Microsoft Copilot chat keys completely purged from product.json',
    allChecksumsRemoved
  );

  assertTest(
    'Extension Marketplace: Configured to Open VSX Gallery across all active product.json files',
    allGalleriesOpenVSX
  );

  assertTest(
    'Chat Configuration: Continue Orchestrator is configured as the valid default chat agent and built-in extension',
    allContinueRegistered
  );

  // -------------------------------------------------------------
  // TEST 4: CSS Idempotency Test
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 4: CSS Idempotency Verification ---');
  let cssIdempotent = true;
  const startMarker = '/* === VEGA IDE START === */';
  const endMarker = '/* === VEGA IDE END === */';
  const cssProblems = [];

  for (const app of appDirs) {
    if (fs.existsSync(app.cssPath)) {
      const css = fs.readFileSync(app.cssPath, 'utf8');
      const startCount = css.split(startMarker).length - 1;
      const endCount = css.split(endMarker).length - 1;
      const start = css.indexOf(startMarker);
      const end = css.indexOf(endMarker, start + startMarker.length);
      const bracesBalanced = (css.match(/\{/g) || []).length === (css.match(/\}/g) || []).length;
      const patch = start >= 0 && end >= 0 ? css.slice(start, end + endMarker.length) : '';
      const hidesWorkbench = /(?:\.monaco-workbench\s+)?(?:\.part\.workbench|\.part\.titlebar|\.part\.activitybar|\.part\.statusbar|\.monaco-workbench)\s*\{[^}]*display\s*:\s*none\s*!important/i.test(patch);
      if (startCount !== 1 || endCount !== 1 || end < start || !bracesBalanced || hidesWorkbench) {
        cssIdempotent = false;
        cssProblems.push(`${app.cssPath}: markers=${startCount}/${endCount}, balanced=${bracesBalanced}, broadHide=${hidesWorkbench}`);
      }
    } else {
      cssIdempotent = false;
      cssProblems.push(`${app.cssPath}: missing`);
    }
  }

  assertTest(
    'CSS Integrity: One complete balanced Vega patch per workbench stylesheet; no broad workbench hiding',
    cssIdempotent,
    cssProblems.join('; ')
  );

  const expectedIconUri = getVegaIconDataUri();
  const vegaSvg = fs.readFileSync(config.SVG_PATH);
  const vegaIco = fs.existsSync(config.ICO_PATH) ? fs.readFileSync(config.ICO_PATH) : null;
  const iconCssProblems = [];
  const codeIconProblems = [];
  const letterpressProblems = [];
  const icoProblems = [];

  for (const app of appDirs) {
    if (fs.existsSync(app.cssPath)) {
      const css = fs.readFileSync(app.cssPath, 'utf8');
      const start = css.indexOf(startMarker);
      const end = css.indexOf(endMarker, start + startMarker.length);
      const patch = start >= 0 && end >= 0 ? css.slice(start, end + endMarker.length) : '';
      const hasWindowIcon = patch.includes('.window-appicon') && patch.includes(expectedIconUri);
      const hasWelcomeTabIcon = patch.includes('.vscode_getting_started_page-name-file-icon')
        && patch.includes('background-size: contain')
        && patch.includes('background-repeat: no-repeat')
        && patch.includes('background-position: center');
      if (!hasWindowIcon || !hasWelcomeTabIcon) {
        iconCssProblems.push(`${app.cssPath}: window-appicon=${hasWindowIcon}, welcomeTab=${hasWelcomeTabIcon}`);
      }
    }

    const codeIcons = collectBrandingFilesNamed(app.appDir, ['code-icon.svg']);
    if (codeIcons.length === 0) {
      codeIconProblems.push(`${app.id}: no code-icon.svg found`);
    }
    for (const file of codeIcons) {
      const body = fs.readFileSync(file);
      if (!body.equals(vegaSvg) || body.includes('#007ACC') || body.includes('#0065A9')) {
        codeIconProblems.push(file);
      }
    }

    const letterpress = collectBrandingFilesNamed(app.appDir, LETTERPRESS_FILES);
    if (letterpress.length === 0) {
      letterpressProblems.push(`${app.id}: no letterpress SVGs found`);
    }
    for (const file of letterpress) {
      const body = fs.readFileSync(file, 'utf8');
      if (!body.includes('stroke-linecap="round"') || body.includes('M30.235 39.884') || body.includes('#007ACC')) {
        letterpressProblems.push(file);
      }
    }

    const icoPath = path.join(app.appDir, 'resources', 'win32', 'code.ico');
    if (!vegaIco || !fs.existsSync(icoPath) || !fs.readFileSync(icoPath).equals(vegaIco)) {
      icoProblems.push(icoPath);
    }
  }

  assertTest(
    'CSS Icons: Vega patch overrides .window-appicon and Welcome tab icon with vega_infinity.svg data URI',
    iconCssProblems.length === 0,
    iconCssProblems.join('; ')
  );
  assertTest(
    'Internal Icons: every active code-icon.svg matches vega_infinity.svg',
    codeIconProblems.length === 0,
    codeIconProblems.join('; ')
  );
  assertTest(
    'Watermarks: letterpress SVGs are low-opacity Vega infinity marks',
    letterpressProblems.length === 0,
    letterpressProblems.join('; ')
  );
  assertTest(
    'Win32 Icon: resources/win32/code.ico matches vega_infinity.ico in every active app',
    icoProblems.length === 0,
    icoProblems.join('; ')
  );

  // -------------------------------------------------------------
  // TEST 5: Executable & Icon Test
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 5: Executable Branding & Icon Verification ---');
  const vegaExePath = path.join(config.TARGET_DIR, 'vega.exe');
  const codeExePath = path.join(config.TARGET_DIR, 'Code.exe');
  assertTest('Executable Existence: vscode-win32-x64/vega.exe exists on disk', fs.existsSync(vegaExePath));
  assertTest('Icon Existence: vega_infinity.ico exists on disk', fs.existsSync(config.ICO_PATH));

  const missingSourcePaths = [config.ICO_PATH, config.SVG_PATH, codeExePath, vegaExePath]
    .filter(file => !fs.existsSync(file));
  assertTest('Source Paths: Required icon and executable paths exist', missingSourcePaths.length === 0, missingSourcePaths.join(', '));

  const missingRequiredExtensions = config.REQUIRED_EXTENSIONS.filter(id => {
    const entries = fs.existsSync(config.VEGA_EXTENSIONS_DIR)
      ? fs.readdirSync(config.VEGA_EXTENSIONS_DIR)
      : [];
    const match = entries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
    return !match || !fs.existsSync(path.join(config.VEGA_EXTENSIONS_DIR, match, 'package.json'));
  });
  assertTest('Required Extensions: Every required extension has a source manifest in .vega/extensions', missingRequiredExtensions.length === 0, missingRequiredExtensions.join(', '));

  const optionalExtensionSources = [
    path.join(config.ROOT_DIR, 'vscode', 'extensions', 'continue'),
    path.join(config.USER_HOME, 'AI-Agent-Orchestrator', 'orchestrator-chat-extension'),
    path.join(config.USER_HOME, 'AI-Agent-Workspace', 'vega-ai-monitor')
  ];
  const missingOptionalSources = optionalExtensionSources.filter(file => !fs.existsSync(file));
  assertTest('Extension Sources: Continue, Orchestrator Chat, and Vega AI Monitor source paths exist', missingOptionalSources.length === 0, missingOptionalSources.join(', '));

  const contextProviderSource = path.join(config.ROOT_DIR, 'integrations');
  const contextProviderManifestPath = path.join(contextProviderSource, 'package.json');
  const contextProviderScriptPath = path.join(contextProviderSource, 'vega_context_provider.js');
  let contextProviderSourceValid = false;
  try {
    const providerManifest = readStrictJson(contextProviderManifestPath);
    contextProviderSourceValid = providerManifest.name === 'vega-context-provider' &&
      providerManifest.main === './vega_context_provider.js' &&
      fs.existsSync(contextProviderScriptPath);
  } catch (_) {
    contextProviderSourceValid = false;
  }
  assertTest('Vega Context Bridge: source manifest and provider entry point are present', contextProviderSourceValid);
  const missingContextProviderApps = appDirs.filter(app => {
    const installedProvider = path.join(app.appDir, 'extensions', 'vega-context-provider');
    try {
      const manifest = readStrictJson(path.join(installedProvider, 'package.json'));
      return manifest.name !== 'vega-context-provider' ||
        !fs.existsSync(path.join(installedProvider, 'vega_context_provider.js'));
    } catch (_) {
      return true;
    }
  }).map(app => app.id);
  assertTest(
    'Vega Context Bridge: read-only provider is packaged into every active app',
    missingContextProviderApps.length === 0,
    missingContextProviderApps.join(', ')
  );

  let runtimeParity = false;
  let runtimeParityDetails = '';
  try {
    const rootProduct = readStrictJson(path.join(config.TARGET_DIR, 'resources', 'app', 'product.json'));
    const executableVersion = getExecutableVersion(vegaExePath);
    const codeVersion = getExecutableVersion(codeExePath);
    const normalizedExecutableVersion = executableVersion.split('.').slice(0, 3).join('.');
    const commitAppDir = path.join(config.TARGET_DIR, rootProduct.commit.slice(0, 10), 'resources', 'app');
    const commitProduct = readStrictJson(path.join(commitAppDir, 'product.json'));
    runtimeParity = normalizedExecutableVersion === rootProduct.version &&
      codeVersion.split('.').slice(0, 3).join('.') === rootProduct.version &&
      appDirs.every(app => {
        const product = readStrictJson(app.productJson);
        return product.version === rootProduct.version && product.commit === rootProduct.commit;
      }) &&
      commitProduct.commit === rootProduct.commit &&
      commitProduct.version === rootProduct.version;
    runtimeParityDetails = `vega.exe=${executableVersion}, Code.exe=${codeVersion}, product=${rootProduct.version}, root commit=${rootProduct.commit}, commit app=${commitProduct.commit}`;
  } catch (err) {
    runtimeParityDetails = err.message;
  }
  assertTest('Runtime Parity: vega.exe version and matching commit app agree with root product.json', runtimeParity, runtimeParityDetails);

  // Check PE metadata if PowerShell is available
  let peMetadataVerified = false;
  let peDetails = '';
  try {
    const stdout = cp.execSync(
      `powershell -NoProfile -Command "(Get-Item '${vegaExePath}').VersionInfo | Format-List -Property ProductName, OriginalFilename"`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    if (stdout.includes('Vega IDE') && stdout.includes('vega.exe')) {
      peMetadataVerified = true;
      peDetails = 'ProductName="Vega IDE", OriginalFilename="vega.exe"';
    } else {
      peDetails = stdout.trim().replace(/\r?\n/g, ' ');
    }
  } catch (err) {
    peDetails = err.message;
  }

  assertTest(
    'PE Metadata Verification: vega.exe contains ProductName="Vega IDE"',
    peMetadataVerified,
    peDetails
  );

  // -------------------------------------------------------------
  // TEST 6: Git & Disk Safety Test
  // -------------------------------------------------------------
  console.log('\n--- TEST GROUP 6: Git Hygiene & Directory Protection ---');
  // Confirm runtime and backup directories exist intact
  assertTest('Disk Safety: vscode-win32-x64/ directory intact', fs.existsSync(config.TARGET_DIR));
  assertTest('Disk Safety: vega-data/ directory intact', fs.existsSync(config.VEGA_DATA_DIR));
  assertTest('Disk Safety: continue_bak/ directory intact', fs.existsSync(path.join(config.ROOT_DIR, 'continue_bak')));

  // Check Git status for staged binary leaks or unignored artifacts
  let gitClean = true;
  let gitMessage = '';
  try {
    const gitStatus = cp.execSync('git status -s', { cwd: config.ROOT_DIR, encoding: 'utf8' }).trim();
    const lines = gitStatus ? gitStatus.split(/\r?\n/) : [];
    const forbiddenPatterns = [
      /node_modules/i,
      /vscode-win32-x64/i,
      /vega-data/i,
      /\.env/i,
      /\.db$/i,
      /\.sqlite/i,
      /\.exe$/i,
      /\.dll$/i,
      /\.log$/i
    ];

    const violations = [];
    for (const line of lines) {
      for (const pattern of forbiddenPatterns) {
        if (pattern.test(line)) {
          violations.push(line);
          gitClean = false;
        }
      }
    }
    if (violations.length > 0) {
      gitMessage = `Untracked/staged binaries or forbidden files found: ${violations.join(', ')}`;
    } else {
      gitMessage = `Clean (${lines.length} tracked/source modifications)`;
    }
  } catch (err) {
    gitClean = false;
    gitMessage = err.message;
  }

  assertTest(
    'Git Hygiene: Zero forbidden binaries, node_modules, or runtime stores in git status',
    gitClean,
    gitMessage
  );

  // -------------------------------------------------------------
  // SUMMARY REPORT
  // -------------------------------------------------------------
  console.log('\n================================================================');
  const failed = results.filter(r => !r.passed);
  if (failed.length === 0) {
    console.log(` ALL ${results.length} VERIFICATION CHECKS PASSED SUCCESSFULLY! [OK]`);
  } else {
    console.error(` [FAIL] ${failed.length} OF ${results.length} VERIFICATION CHECKS FAILED:`);
    failed.forEach(f => console.error(`  - ${f.name} ${f.details ? `(${f.details})` : ''}`));
  }
  console.log('================================================================\n');

  return { success: failed.length === 0, total: results.length, failed: failed.length };
}

if (require.main === module) {
  verifyVegaBuild().then(res => {
    if (!res.success) {
      process.exit(1);
    }
  }).catch(err => {
    console.error('[ERROR] Verification failed unexpectedly:', err);
    process.exit(1);
  });
}

module.exports = { verifyVegaBuild };
