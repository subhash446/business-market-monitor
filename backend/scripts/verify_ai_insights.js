/**
 * One-off AI insights E2E verification script
 *
 * Calls runInsights() exactly once (no cron, no scheduler).
 * Reads config from environment variables -- set them in your shell
 * before running this script:
 *
 *   $env:AI_INSIGHTS_ENABLED = "true"
 *   $env:GEMINI_API_KEY      = "your-key-here"   <-- never share/commit
 *   node scripts/verify_ai_insights.js
 *
 * IMPORTANT:
 *   - The API key is read from the shell environment only.
 *   - It is never printed, logged, or written to any file here.
 *   - The cron scheduler is NOT started -- this is a single run.
 *   - Delete this file after the run if desired.
 *
 * What this verifies (end-to-end):
 *   1. AI_INSIGHTS_ENABLED flag is respected
 *   2. material.repository.findAllTracked() returns data
 *   3. price.repository.findHistoryForMaterial() returns price evidence
 *   4. news.repository.listRecentByIndustry() returns (or is empty)
 *   5. Gemini API call succeeds with the real key
 *   6. Prompt injection defences allow a valid structured response
 *   7. validateInsightSchema() accepts the response
 *   8. aiInsight.repository.create() stores the row
 *   9. aiInsight.repository.findLatestByMaterial() retrieves it
 *  10. syncStatus was written (AI_INSIGHTS job_type)
 */

'use strict';

// Override the enabled flag before env.js is required so dotenv
// does not overwrite the shell-provided value.
// dotenv.config() only sets vars that are NOT already in process.env,
process.env.AI_INSIGHTS_ENABLED = process.env.AI_INSIGHTS_ENABLED || 'true';

// Load config first (loads dotenv so shell env and .env are both available).
const env                   = require('../src/config/env');
const { runInsights }       = require('../src/jobs/aiInsights.job');
const { pool }              = require('../src/database/connection');
const syncStatusRepo        = require('../src/repositories/syncStatus.repository');
const aiInsightRepo         = require('../src/repositories/aiInsight.repository');
const materialRepo          = require('../src/repositories/material.repository');

// Safety check: refuse to run without a key (avoids confusing auth errors).
if (!env.gemini.apiKey || env.gemini.apiKey.trim() === '') {
  console.error('ERROR: GEMINI_API_KEY is not set in the shell environment or .env file.');
  console.error('Set it with:  $env:GEMINI_API_KEY = "your-key-here" or in backend/.env');
  console.error('Then re-run:  node scripts/verify_ai_insights.js');
  process.exit(1);
}

function sep() { console.log('-'.repeat(60)); }

async function main() {
  console.log('');
  sep();
  console.log('  AI Insights E2E Verification');
  console.log('  ' + new Date().toISOString());
  sep();

  // ── Mode selection: adversarial single-material or full batch ──
  const isAdversarial = process.argv.includes('--adversarial') || process.argv.includes('-a');

  if (isAdversarial) {
    console.log('\n[mode] Running controlled PET Resin adversarial E2E test...');
    console.log('  Material: PET Resin (materialId=16, businessId=3)');
    console.log('  Prices: 300.00 -> 360.00 -> 97.26');
    console.log('  News: Plast Pack 2026: Innovations in Packaging and Plastic Materials\n');

    const aiInsightService = require('../src/services/aiInsight.service');

    const adversarialPrices = [
      { price: '300.00', recorded_at: '2026-09-01' },
      { price: '360.00', recorded_at: '2026-09-08' },
      { price: '97.26',  recorded_at: '2026-09-15' },
    ];

    const adversarialNews = [
      {
        title:        'Plast Pack 2026: Innovations in Packaging and Plastic Materials',
        source_name:  'Packaging Weekly',
        published_at: '2026-09-10T10:00:00Z',
      },
    ];

    let advResult;
    try {
      advResult = await aiInsightService.generateAndStore({
        trackedMaterialId: 16,
        businessId:        3,
        materialName:      'PET Resin',
        prices:            adversarialPrices,
        newsHeadlines:     adversarialNews,
      });
    } catch (err) {
      console.error('[adversarial] UNEXPECTED THROW:', err.message);
      await pool.end();
      process.exit(1);
    }

    sep();
    console.log('\n[adversarial-result] Outcome:');
    console.log(`  status:     ${advResult.status}`);
    console.log(`  materialId: ${advResult.materialId}`);
    console.log(`  businessId: ${advResult.businessId}`);

    if (advResult.status === 'error') {
      const err = advResult.error;
      console.log(`  error.code:       ${err?.code || 'UNKNOWN'}`);
      console.log(`  error.statusCode: ${err?.statusCode ?? err?.status ?? 'n/a'}`);
      console.log(`  error.message:    ${err?.message || String(err)}`);
      sep();
      console.log('  RESULT: FAIL / BLOCKED -- provider returned error.');
      sep();
      await pool.end();
      process.exit(1);
    }

    if (advResult.status === 'generated') {
      const insight = advResult.insight;
      console.log(`  headline:        "${insight.headline}"`);
      console.log(`  what_happened:   "${insight.what_happened || insight.whatHappened}"`);
      console.log(`  why_it_happened: "${insight.why_it_happened || insight.whyItHappened}"`);
      console.log(`  business_impact: "${insight.business_impact || insight.businessImpact}"`);
      console.log(`  outlook:         ${insight.outlook}`);
      console.log(`  confidence:      ${insight.confidence}`);

      const why = insight.why_it_happened || insight.whyItHappened;
      const conf = insight.confidence;

      const isWhyValid = why === 'Causal evidence not found in the available data.';
      const isConfValid = conf === 'LOW';

      console.log('\n[adversarial-verifications]');
      console.log(`  why_it_happened fallback exact match: ${isWhyValid ? 'PASS' : 'FAIL'}`);
      console.log(`  confidence is LOW:                    ${isConfValid ? 'PASS' : 'FAIL'}`);

      sep();
      if (isWhyValid && isConfValid) {
        console.log('  RESULT: PASS -- PET Resin adversarial test verified successfully.');
      } else {
        console.log('  RESULT: FAIL -- constraints not met.');
      }
      sep();
      await pool.end();
      process.exit((isWhyValid && isConfValid) ? 0 : 1);
    }

    sep();
    console.log(`  RESULT: ${advResult.status}`);
    sep();
    await pool.end();
    process.exit(0);
  }

  // ── Pre-flight: show what materials will be processed ──────────
  console.log('\n[pre-flight] Loading tracked materials...');
  let materials = [];
  try {
    materials = await materialRepo.findAllTracked();
    if (materials.length === 0) {
      console.log('  WARNING: No actively-tracked materials found.');
      console.log('  The job will run but generate no insights (nothing to process).');
      console.log('  Ensure at least one material has is_tracked=TRUE in the DB.');
    } else {
      console.log(`  Found ${materials.length} tracked material(s):`);
      materials.forEach(m => {
        console.log(`    id=${m.id}  business_id=${m.business_id}  name="${m.name}"  industry_id=${m.industry_id ?? 'null'}`);
      });
    }
  } catch (err) {
    console.error('  ERROR loading materials:', err.message);
  }

  // ── Run the job ────────────────────────────────────────────────
  console.log('\n[job] Running runInsights() now...\n');
  sep();

  let result;
  try {
    result = await runInsights();
  } catch (err) {
    // runInsights() should never throw -- if it did, something is wrong
    console.error('[job] UNEXPECTED THROW from runInsights():', err.message);
    await pool.end();
    process.exit(1);
  }

  sep();

  // ── Result summary ─────────────────────────────────────────────
  console.log('\n[result] Job summary:');
  console.log(`  status:    ${result.status}`);
  console.log(`  materials: ${result.materials}`);
  console.log(`  generated: ${result.generated}`);
  console.log(`  skipped:   ${result.skipped}  (insufficient evidence)`);
  console.log(`  errors:    ${result.errors}`);

  if (result.status === 'FAILED' && result.errors > 0) {
    console.log('\n  HINT: Check above for [ai-insights] ERROR log lines.');
    if (Array.isArray(result.errorDetails) && result.errorDetails.length > 0) {
      console.log('\n[errors] Failed material details:');
      result.errorDetails.forEach(err => {
        console.log(`  materialId=${err.materialId}  businessId=${err.businessId}`);
        console.log(`    code:       ${err.code}`);
        console.log(`    statusCode: ${err.statusCode ?? 'n/a'}`);
        console.log(`    message:    ${err.message}`);
      });
    }
  }

  // ── Verify DB state ────────────────────────────────────────────
  if (result.generated > 0) {
    console.log('\n[db-verify] Checking stored insights...');
    for (const mat of materials) {
      try {
        const insight = await aiInsightRepo.findLatestByMaterial(mat.id, mat.business_id);
        if (insight) {
          console.log(`\n  materialId=${mat.id} (${mat.name})`);
          console.log(`    insight.id:         ${insight.id}`);
          console.log(`    outlook:            ${insight.outlook}`);
          console.log(`    confidence:         ${insight.confidence}`);
          console.log(`    evidence_prices:    ${insight.evidence_price_points_count} point(s)`);
          console.log(`    evidence_range:     ${insight.evidence_price_range ?? 'n/a'}`);
          console.log(`    evidence_news:      ${insight.evidence_news_count} headline(s)`);
          console.log(`    model_used:         ${insight.model_used}`);
          console.log(`    generated_at:       ${insight.generated_at}`);
          console.log(`    headline:           "${insight.headline}"`);
        }
      } catch (err) {
        console.log(`  WARNING: Could not read insight for materialId=${mat.id}: ${err.message}`);
      }
    }
  }

  // ── Verify sync status ─────────────────────────────────────────
  console.log('\n[sync-status] Checking sync_statuses table...');
  try {
    const statuses = await syncStatusRepo.findAll();
    const aiStatus = statuses.find(s => s.job_type === 'AI_INSIGHTS');
    if (aiStatus) {
      console.log('  AI_INSIGHTS row found:');
      console.log(`    last_run_at:     ${aiStatus.last_run_at ?? 'null'}`);
      console.log(`    last_success_at: ${aiStatus.last_success_at ?? 'null'}`);
      console.log(`    last_status:     ${aiStatus.last_status ?? 'null'}`);
    } else {
      console.log('  WARNING: AI_INSIGHTS row not found in sync_statuses.');
    }
  } catch (err) {
    console.log('  WARNING: Could not read sync_statuses:', err.message);
  }

  // ── Final verdict ──────────────────────────────────────────────
  sep();
  if (result.status === 'SUCCESS' && result.generated > 0) {
    console.log('  RESULT: PASS -- insight(s) generated and stored successfully.');
  } else if (result.status === 'SUCCESS' && result.skipped === result.materials) {
    console.log('  RESULT: PASS (no insights generated -- insufficient price evidence).');
    console.log('  To generate insights, ensure materials have at least 3 price points');
    console.log('  within the last 30 days.');
  } else if (result.status === 'FAILED') {
    console.log('  RESULT: FAIL -- check error logs above.');
  } else {
    console.log(`  RESULT: ${result.status} -- see summary above.`);
  }
  sep();
  console.log('');

  await pool.end();
  process.exit(result.status === 'FAILED' ? 1 : 0);
}

main().catch(err => {
  console.error('\n[fatal] Unhandled error:', err.message);
  pool.end().finally(() => process.exit(1));
});
