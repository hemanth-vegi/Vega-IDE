/**
 * Vega IDE Internal Icon Branding
 *
 * Replaces remaining VS Code blue logos in active vscode-win32-x64 app trees:
 *  - code-icon.svg (title bar / Welcome tab / in-product logos)
 *  - letterpress-{dark,light,hcDark,hcLight}.svg (empty-editor watermark)
 *  - resources/win32/code.ico
 *
 * Also builds a clean data-URI of vega_infinity.svg for CSS overrides.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./vega.config.js');

const LETTERPRESS_FILES = [
  'letterpress-dark.svg',
  'letterpress-light.svg',
  'letterpress-hcDark.svg',
  'letterpress-hcLight.svg'
];

const LETTERPRESS_VARIANTS = {
  'letterpress-dark.svg': { opacity: '0.18', stroke: '#f43f5e' },
  'letterpress-light.svg': { opacity: '0.08', stroke: '#9f1239' },
  'letterpress-hcDark.svg': { opacity: '0.35', stroke: '#ff4d4d' },
  'letterpress-hcLight.svg': { opacity: '0.22', stroke: '#9f1239' }
};

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function readVegaSvg() {
  if (!fs.existsSync(config.SVG_PATH)) {
    throw new Error(`CRITICAL: Vega SVG branding source missing at ${config.SVG_PATH}`);
  }
  return fs.readFileSync(config.SVG_PATH, 'utf8');
}

function compactSvg(svg) {
  return svg.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function svgToDataUri(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(compactSvg(svg))}`;
}

function getVegaIconDataUri() {
  return svgToDataUri(readVegaSvg());
}

function extractInfinityPath(svg) {
  const match = svg.match(/<path\s+[^>]*d="([^"]+)"/i);
  if (!match) {
    throw new Error(`Could not extract infinity path from ${config.SVG_PATH}`);
  }
  return match[1];
}

function buildLetterpressSvg(infinityPath, variant) {
  const { opacity, stroke } = variant;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">`
    + `<g opacity="${opacity}">`
    + `<path d="${infinityPath}" fill="none" stroke="${stroke}" stroke-width="48" stroke-linecap="round" stroke-linejoin="round"/>`
    + `</g>`
    + `</svg>\n`;
}

function collectFilesNamed(root, names) {
  const nameSet = new Set(names);
  const found = [];
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      if (['ENOENT', 'EACCES', 'EPERM'].includes(err.code)) return;
      throw err;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && nameSet.has(entry.name)) found.push(fullPath);
    }
  }
  if (fs.existsSync(root)) walk(root);
  return found;
}

function writeIfChanged(filePath, contents, encoding) {
  const next = Buffer.isBuffer(contents) ? contents : Buffer.from(contents, encoding || 'utf8');
  if (fs.existsSync(filePath)) {
    const prev = fs.readFileSync(filePath);
    if (prev.equals(next)) return false;
  }
  fs.writeFileSync(filePath, next);
  return true;
}

function applyInternalBranding(options = {}) {
  const verbose = options.verbose !== false;
  if (verbose) console.log('--- Internal Vega icon branding (SVG / ICO / letterpress) ---');

  const svgSource = readVegaSvg();
  const svgBuffer = Buffer.from(svgSource, 'utf8');
  const infinityPath = extractInfinityPath(svgSource);

  if (!fs.existsSync(config.ICO_PATH)) {
    throw new Error(`CRITICAL: Vega ICO branding source missing at ${config.ICO_PATH}`);
  }
  const icoBuffer = fs.readFileSync(config.ICO_PATH);

  const appDirs = config.getActiveAppDirs();
  const updated = {
    codeIcon: [],
    letterpress: [],
    ico: []
  };

  for (const app of appDirs) {
    for (const file of collectFilesNamed(app.appDir, ['code-icon.svg'])) {
      if (writeIfChanged(file, svgBuffer)) {
        updated.codeIcon.push(file);
        if (verbose) console.log(`[ICON SVG] ${file}`);
      } else if (verbose) {
        console.log(`[ICON SVG UNCHANGED] ${file}`);
      }
    }

    for (const file of collectFilesNamed(app.appDir, LETTERPRESS_FILES)) {
      const name = path.basename(file);
      const variant = LETTERPRESS_VARIANTS[name];
      if (!variant) continue;
      const watermark = buildLetterpressSvg(infinityPath, variant);
      if (writeIfChanged(file, watermark, 'utf8')) {
        updated.letterpress.push(file);
        if (verbose) console.log(`[WATERMARK] ${file}`);
      } else if (verbose) {
        console.log(`[WATERMARK UNCHANGED] ${file}`);
      }
    }

    const icoPath = path.join(app.appDir, 'resources', 'win32', 'code.ico');
    if (fs.existsSync(icoPath)) {
      if (writeIfChanged(icoPath, icoBuffer)) {
        updated.ico.push(icoPath);
        if (verbose) console.log(`[ICON ICO] ${icoPath}`);
      } else if (verbose) {
        console.log(`[ICON ICO UNCHANGED] ${icoPath}`);
      }
    }
  }

  if (verbose) {
    console.log(
      `[INTERNAL BRANDING] code-icon.svg updated=${updated.codeIcon.length}, `
      + `letterpress updated=${updated.letterpress.length}, `
      + `code.ico updated=${updated.ico.length}`
    );
  }

  return { success: true, updated, svgHash: sha256(svgBuffer), icoHash: sha256(icoBuffer) };
}

if (require.main === module) {
  try {
    applyInternalBranding();
  } catch (err) {
    console.error('[ERROR] applyInternalBranding failed:', err);
    process.exit(1);
  }
}

module.exports = {
  applyInternalBranding,
  getVegaIconDataUri,
  svgToDataUri,
  collectFilesNamed,
  LETTERPRESS_FILES,
  LETTERPRESS_VARIANTS
};
