const fs = require('fs');
const path = require('path');
const cp = require('child_process');

console.log('=== PHASE 2: BAKING IN ESSENTIAL EXTENSIONS ===');

const srcDir = 'C:/Users/heman/.vscode/extensions';
const destDir = 'C:/Users/heman/.vega/extensions';

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

const requiredIds = [
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

function copyRecursiveSync(src, dest) {
  if (fs.existsSync(dest)) return; // already exists
  if (fs.statSync(src).isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(item => copyRecursiveSync(path.join(src, item), path.join(dest, item)));
  } else {
    fs.copyFileSync(src, dest);
  }
}

const srcEntries = fs.existsSync(srcDir) ? fs.readdirSync(srcDir) : [];
const destEntries = fs.readdirSync(destDir);
const foundMap = {};

requiredIds.forEach(id => {
  // Check if already present in destDir
  const destMatch = destEntries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
  if (destMatch) {
    foundMap[id] = destMatch;
    console.log(`[VERIFIED IN .VEGA] ${id} -> ${destMatch}`);
    return;
  }

  // Check if present in srcDir (.vscode/extensions)
  const srcMatch = srcEntries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
  if (srcMatch) {
    foundMap[id] = srcMatch;
    console.log(`[VERIFIED IN .VSCODE] ${id} -> ${srcMatch}`);
    const sourcePath = path.join(srcDir, srcMatch);
    const destPath = path.join(destDir, srcMatch);
    copyRecursiveSync(sourcePath, destPath);
    console.log(`[SYNCED TO .VEGA] ${srcMatch}`);
    return;
  }

  // Attempt CLI installation into destDir
  try {
    console.log(`[INSTALLING EXTENSION] Attempting CLI install for ${id}...`);
    cp.execSync(`code --extensions-dir "${destDir}" --install-extension ${id}`, { stdio: 'inherit' });
    const updatedDestEntries = fs.readdirSync(destDir);
    const installedMatch = updatedDestEntries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
    if (installedMatch) {
      foundMap[id] = installedMatch;
      console.log(`[SUCCESSFULLY INSTALLED] ${id} -> ${installedMatch}`);
    } else {
      console.warn(`[WARNING] Installation command completed but ${id} not found in ${destDir}`);
    }
  } catch (err) {
    console.warn(`[MISSING] ${id} could not be installed: ${err.message}`);
  }
});

// Update .vega/extensions/extensions.json
const srcExtJsonPath = path.join(srcDir, 'extensions.json');
const destExtJsonPath = path.join(destDir, 'extensions.json');

let vegaList = [];
if (fs.existsSync(destExtJsonPath)) {
  try {
    vegaList = JSON.parse(fs.readFileSync(destExtJsonPath, 'utf8'));
  } catch (e) {
    vegaList = [];
  }
} else if (fs.existsSync(srcExtJsonPath)) {
  try {
    vegaList = JSON.parse(fs.readFileSync(srcExtJsonPath, 'utf8'));
  } catch (e) {
    vegaList = [];
  }
}

// Make sure all required extensions currently present in destDir are in extensions.json
const currentDestEntries = fs.readdirSync(destDir);
requiredIds.forEach(id => {
  const match = currentDestEntries.find(entry => entry.toLowerCase().startsWith(id.toLowerCase()));
  if (match) {
    const existing = vegaList.some(item => {
      const existingId = (item.identifier && item.identifier.id) || '';
      return existingId.toLowerCase() === id.toLowerCase() || (item.relativeLocation && item.relativeLocation.toLowerCase().startsWith(id.toLowerCase()));
    });
    if (!existing) {
      // Read package.json inside extension if available to get version
      let version = "1.0.0";
      const pkgPath = path.join(destDir, match, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          version = pkg.version || version;
        } catch {}
      }
      vegaList.push({
        identifier: { id },
        version,
        location: { $mid: 1, path: `/c:/Users/heman/.vega/extensions/${match}`, scheme: "file" },
        relativeLocation: match
      });
      console.log(`[REGISTERED IN MANIFEST] ${id} (${version})`);
    }
  }
});

fs.writeFileSync(destExtJsonPath, JSON.stringify(vegaList, null, 2), 'utf8');
console.log(`Updated ${destExtJsonPath} with ${vegaList.length} verified extensions.`);

console.log('=== PHASE 2 COMPLETE ===');
