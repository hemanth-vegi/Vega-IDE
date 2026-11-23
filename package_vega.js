const fs = require('fs');
const path = require('path');
const cp = require('child_process');

console.log('=== STARTING VEGA IDE ASSEMBLY & PACKAGING ===');

const srcBase = 'C:/Users/heman/AppData/Local/Programs/Microsoft VS Code';
const commitDir = '69047191fc';
const targetDir = 'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64';
const continueInjectedDir = 'C:/CloudLab/Vega-IDE-Build/vscode/extensions/continue';

function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();
  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    try {
      fs.copyFileSync(src, dest);
    } catch (err) {
      if (['EBUSY', 'EPERM', 'EACCES', 'UNKNOWN'].includes(err.code) || err.errno === -4094 || err.errno === -4082) {
        console.warn(`[LOCKED] Skipping busy file: ${dest}`);
      } else {
        throw err;
      }
    }
  }
}

// 1. Copy top-level executables and assets
console.log('Copying base application files...');
const topFiles = fs.readdirSync(srcBase);
for (const file of topFiles) {
  const fullSrc = path.join(srcBase, file);
  const stat = fs.statSync(fullSrc);
  if (stat.isFile()) {
    const fullDest = path.join(targetDir, file);
    try {
      fs.copyFileSync(fullSrc, fullDest);
    } catch (err) {
      if (err.code === 'EBUSY') {
        console.warn(`[LOCKED] Skipping busy file: ${fullDest}`);
      } else {
        throw err;
      }
    }
  }
}

// Ensure vega.exe exists
const codeExe = path.join(targetDir, 'Code.exe');
const vegaExe = path.join(targetDir, 'vega.exe');
try {
  fs.copyFileSync(codeExe, vegaExe);
  console.log('Created vega.exe from core executable.');
} catch (err) {
  if (err.code === 'EBUSY') {
    console.log('vega.exe is currently in use; keeping existing executable intact.');
  } else {
    throw err;
  }
}

// Also create vega.VisualElementsManifest.xml
const vegaManifest = path.join(targetDir, 'vega.VisualElementsManifest.xml');
if (fs.existsSync(path.join(targetDir, 'Code.VisualElementsManifest.xml'))) {
  try {
    fs.copyFileSync(path.join(targetDir, 'Code.VisualElementsManifest.xml'), vegaManifest);
  } catch (err) {
    if (err.code !== 'EBUSY') throw err;
  }
}

// 2. Copy commit folder assets
console.log('Copying runtime engine and libraries from commit directory...');
const commitPath = path.join(srcBase, commitDir);
if (fs.existsSync(commitPath)) {
  // Copy all files and folders in commitDir to target root
  const commitItems = fs.readdirSync(commitPath);
  for (const item of commitItems) {
    const s = path.join(commitPath, item);
    const d = path.join(targetDir, item);
    console.log(`Copying ${item}...`);
    copyRecursiveSync(s, d);
  }
  // Also keep a copy inside commitDir in targetDir for path resolution compatibility
  const targetCommitDir = path.join(targetDir, commitDir);
  if (!fs.existsSync(targetCommitDir)) {
    fs.mkdirSync(targetCommitDir, { recursive: true });
  }
  for (const item of commitItems) {
    const s = path.join(commitPath, item);
    const d = path.join(targetCommitDir, item);
    copyRecursiveSync(s, d);
  }
}

// 3. Rebrand product.json
console.log('Applying surgical Vega IDE rebranding to product.json...');
const productPaths = [
  path.join(targetDir, 'resources/app/product.json'),
  path.join(targetDir, commitDir, 'resources/app/product.json')
];

for (const p of productPaths) {
  if (fs.existsSync(p)) {
    const prod = JSON.parse(fs.readFileSync(p, 'utf8'));
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
    
    // Register Continue built-in extension in product.json
    if (!prod.builtInExtensions) {
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
    fs.writeFileSync(p, JSON.stringify(prod, null, '\t'), 'utf8');
    console.log(`Rebranded ${p}`);
  }
}

// 4. Inject Continue AI extension
console.log('Injecting Continue AI extension with hardwired Orchestrator into resources/app/extensions/continue...');
const extDestinations = [
  path.join(targetDir, 'resources/app/extensions/continue'),
  path.join(targetDir, commitDir, 'resources/app/extensions/continue')
];

for (const dest of extDestinations) {
  copyRecursiveSync(continueInjectedDir, dest);
  console.log(`Injected Continue extension into ${dest}`);
}

// 5. Inject Orchestrator Chat extension
console.log('Injecting Orchestrator Chat extension into resources/app/extensions/orchestrator-chat...');
const orchSource = 'C:/Users/heman/AI-Agent-Orchestrator/orchestrator-chat-extension';
const orchDestinations = [
  path.join(targetDir, 'resources/app/extensions/orchestrator-chat'),
  path.join(targetDir, commitDir, 'resources/app/extensions/orchestrator-chat')
];

for (const dest of orchDestinations) {
  copyRecursiveSync(orchSource, dest);
  console.log(`Injected Orchestrator Chat extension into ${dest}`);
}

// 6. Inject Vega AI Monitor telemetry extension
const monitorSource = 'C:/Users/heman/AI-Agent-Workspace/vega-ai-monitor';
if (fs.existsSync(monitorSource)) {
  console.log('Injecting Vega AI Monitor extension into resources/app/extensions/vega-ai-monitor...');
  const monitorDestinations = [
    path.join(targetDir, 'resources/app/extensions/vega-ai-monitor'),
    path.join(targetDir, commitDir, 'resources/app/extensions/vega-ai-monitor')
  ];
  for (const dest of monitorDestinations) {
    copyRecursiveSync(monitorSource, dest);
    console.log(`Injected Vega AI Monitor extension into ${dest}`);
  }
}

console.log('=== VEGA IDE ASSEMBLY COMPLETE ===');

