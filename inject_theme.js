/**
 * Vega IDE Theme Injection Delegation Wrapper
 * 
 * Delegated to deep_theme_purge.js to prevent regressing theme settings.
 */

const { deepThemePurge } = require('./deep_theme_purge.js');

function injectTheme() {
  console.log('[INJECT_THEME] Delegating to deepThemePurge...');
  deepThemePurge();
}

if (require.main === module) {
  try {
    injectTheme();
  } catch (err) {
    console.error('[ERROR] injectTheme failed:', err);
    process.exit(1);
  }
}

module.exports = { injectTheme };
