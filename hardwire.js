const fs = require('fs');

// 1. Hardwire extension.js
const file = 'C:/CloudLab/Vega-IDE-Build/vscode/extensions/continue/out/extension.js';
let content = fs.readFileSync(file, 'utf8');

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
  console.log('Successfully hardwired Orchestrator into continue out/extension.js');
} else {
  console.log('Searching with looser regex...');
  const regex = /name:\s*"Main Config",\s*version:\s*"1\.0\.0",\s*schema:\s*"v1",\s*models:\s*\[\]/;
  if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync(file, content, 'utf8');
    console.log('Successfully hardwired Orchestrator with regex into continue out/extension.js');
  } else {
    console.error('Target not found in extension.js');
  }
}

// 2. Also hardwire continue repo source default.ts
const defaultTsPath = 'C:/CloudLab/Vega-IDE-Build/continue/core/config/default.ts';
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
  console.log('Successfully hardwired Orchestrator into continue/core/config/default.ts');
}

// 3. Update builtInExtensions.js
const builtInExtJsPath = 'C:/CloudLab/Vega-IDE-Build/vscode/build/lib/builtInExtensions.js';
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
    console.log('Successfully appended Continue to builtInExtensions.js');
  }
}

// 4. Update vscode/product.json builtInExtensions array
const productJsonPath = 'C:/CloudLab/Vega-IDE-Build/vscode/product.json';
const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
if (!product.builtInExtensions) {
  product.builtInExtensions = [];
}
if (!product.builtInExtensions.some(e => e.name === 'continue')) {
  product.builtInExtensions.push({
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
  fs.writeFileSync(productJsonPath, JSON.stringify(product, null, '\t'), 'utf8');
  console.log('Successfully added Continue to product.json builtInExtensions');
}

