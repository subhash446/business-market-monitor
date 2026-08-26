/**
 * Template Generation business logic (Document 2 §5.4 FR-TPL-01–03,
 * Document 3 §11 TemplateGenerationService). Framework-agnostic — no
 * req/res, no SQL (Document 3 §3).
 *
 * Generates one tracked_materials row per raw material in the business's
 * industry, immediately after business creation (FR-TPL-01), with no
 * manual entry required (FR-TPL-03). All inserts run inside a single DB
 * transaction — either every row is created, or none are.
 *
 * Production Hardening Phase B, finding A1: the transaction previously ran
 * directly against `pool` here, bypassing the Repository layer. It has
 * been moved into material.repository.js's bulkCreateFromTemplate() —
 * this service now only orchestrates (read Knowledge Base, delegate the
 * write), matching Document 3 §3's Business Logic Layer rule (no SQL here)
 * exactly. The transaction's atomicity guarantee is unchanged — only its
 * location moved.
 *
 * Kept modular and reusable: exports a single generateTemplate(businessId,
 * industryId) function with no dependency on HTTP or Business Profile
 * internals, so Material Tracking can call it directly too.
 */
const knowledgeBaseRepository = require('../repositories/knowledgeBase.repository');
const materialRepository = require('../repositories/material.repository');

async function generateTemplate(businessId, industryId) {
  // Knowledge Base data is static reference data (Document 4 §7.1) — read
  // outside the transaction, since the transaction's job is to make the
  // WRITES atomic, not the read of unchanging seed data.
  const rawMaterials = await knowledgeBaseRepository.getRawMaterialsForTemplateGeneration(industryId);

  // Lightweight industries (e.g. FMCG, Document 1 §3) have zero raw
  // materials by design — materialRepository.bulkCreateFromTemplate()
  // already returns { materialsGenerated: 0 } for an empty list, so no
  // special-casing is needed here either.
  return materialRepository.bulkCreateFromTemplate(businessId, rawMaterials);
}

module.exports = { generateTemplate };
