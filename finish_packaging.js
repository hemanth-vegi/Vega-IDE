const fs = require('fs');
const path = require('path');

const targetDir = 'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64';
const continueSrc = 'C:/CloudLab/Vega-IDE-Build/vscode/extensions/continue';

function copyRecursiveSync(src, dest) {
  if (fs.statSync(src).isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(item => copyRecursiveSync(path.join(src, item), path.join(dest, item)));
  } else {
    fs.copyFileSync(src, dest);
  }
}

// 1. Create vega.exe and manifest
fs.copyFileSync(path.join(targetDir, 'Code.exe'), path.join(targetDir, 'vega.exe'));
if (fs.existsSync(path.join(targetDir, 'Code.VisualElementsManifest.xml'))) {
  fs.copyFileSync(path.join(targetDir, 'Code.VisualElementsManifest.xml'), path.join(targetDir, 'vega.VisualElementsManifest.xml'));
}
console.log('Created vega.exe and vega.VisualElementsManifest.xml');

// 2. Rebrand product.json in all commit directories
const dirs = ['69047191fc', 'dcd3ad6e36'];
for (const dir of dirs) {
  const prodPath = path.join(targetDir, dir, 'resources/app/product.json');
  if (fs.existsSync(prodPath)) {
    const prod = JSON.parse(fs.readFileSync(prodPath, 'utf8'));
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

    if (!prod.builtInExtensions) prod.builtInExtensions = [];
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

    fs.writeFileSync(prodPath, JSON.stringify(prod, null, '\t'), 'utf8');
    console.log(`Rebranded ${prodPath}`);
  }

  // 3. Inject Continue extension
  const extDest = path.join(targetDir, dir, 'resources/app/extensions/continue');
  console.log(`Injecting Continue into ${extDest}...`);
  copyRecursiveSync(continueSrc, extDest);
  console.log(`Injected Continue into ${extDest}`);
}

console.log('All steps completed successfully.');

