const fs = require('fs');
const path = require('path');

console.log('=== PHASE 1: PURGING BLOATWARE EXTENSIONS ===');

const bloatPatterns = [
  'github.copilot',
  'github.copilot-chat',
  'github.copilot-for-azure',
  'eowl.copilot-adapter',
  'amazonwebservices.aws-toolkit-vscode',
  'amazonwebservices.amazon-q-vscode',
  'visualstudioexptteam.vscodeintellicode',
  'visualstudioexptteam.intellicode-api-usage-examples',
  'ms-azuretools.vscode-azureresourcegroups',
  'ms-azuretools.vscode-azure-mcp-server',
  'ms-azuretools.vscode-azure-github-copilot',
  'teamsdevapp.vscode-ai-foundry',
  'hoovercj.vscode-power-mode',
  'charliermarsh.ruff',
  'parekhdhruv.quickpaste-console-log'
];

function isBloat(name) {
  const lower = name.toLowerCase();
  return bloatPatterns.some(pattern => lower.startsWith(pattern) || lower.includes(pattern));
}

// 1. Remove built-in copilot extension and shim
const builtinCopilotPaths = [
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/dcd3ad6e36/resources/app/extensions/copilot',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/69047191fc/resources/app/extensions/copilot',
  'C:/CloudLab/Vega-IDE-Build/vscode-win32-x64/bin/copilot-shim'
];

builtinCopilotPaths.forEach(p => {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log(`Deleted built-in copilot asset: ${p}`);
  }
});

// 2. Remove user-level bloat extensions
const extDirs = [
  'C:/Users/heman/.vscode/extensions',
  'C:/Users/heman/.vega/extensions',
  'C:/Users/heman/.vscode-oss/extensions'
];

extDirs.forEach(dir => {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (isBloat(entry)) {
      const fullPath = path.join(dir, entry);
      try {
        fs.rmSync(fullPath, { recursive: true, force: true });
        console.log(`Removed bloatware extension: ${entry}`);
      } catch (err) {
        console.warn(`Could not remove ${entry}: ${err.message}`);
      }
    }
  }

  // Update extensions.json
  const extJsonPath = path.join(dir, 'extensions.json');
  if (fs.existsSync(extJsonPath)) {
    try {
      const raw = fs.readFileSync(extJsonPath, 'utf8');
      if (raw.trim()) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const filtered = list.filter(item => {
            const id = (item.identifier && item.identifier.id) || '';
            return !isBloat(id);
          });
          fs.writeFileSync(extJsonPath, JSON.stringify(filtered, null, 2), 'utf8');
          console.log(`Cleaned ${extJsonPath} (${list.length} -> ${filtered.length} extensions)`);
        }
      }
    } catch (err) {
      console.warn(`Could not update ${extJsonPath}: ${err.message}`);
    }
  }
});

console.log('=== PHASE 1 COMPLETE ===');
