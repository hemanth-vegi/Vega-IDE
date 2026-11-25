/**
 * Vega IDE Packaging Delegation Wrapper
 * 
 * Delegated into consolidated modules to prevent regressing product.json or theme.
 */

const { packageVega } = require('./package_vega.js');
const { applyConsolidationAndLockin } = require('./apply_consolidation_and_lockin.js');

async function finishPackaging() {
  console.log('[FINISH_PACKAGING] Delegating to packageVega and applyConsolidationAndLockin...');
  await packageVega();
  applyConsolidationAndLockin();
  console.log('[FINISH_PACKAGING] Packaging finished cleanly.');
}

if (require.main === module) {
  finishPackaging().catch(err => {
    console.error('[ERROR] finishPackaging failed:', err);
    process.exit(1);
  });
}

module.exports = { finishPackaging };
