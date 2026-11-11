/**
 * Template Generation business logic (Document 2 §5.4 FR-TPL-01–03,
 * Document 3 §11 TemplateGenerationService, Phase 5 Automatic Mapping).
 * Framework-agnostic — no req/res, no SQL (Document 3 §3).
 *
 * Responsibilities:
 *   1. Resolves raw materials for the business's industry.
 *   2. Enriches materials with default external commodity symbols (e.g. WHEAT_GOI, WTI).
 *   3. Materializes tracked_materials rows in a single atomic transaction.
 *   4. Initializes newly created automated materials with the latest known market price
 *      (if already stored in the system), ensuring the user immediately sees live data.
 *   5. Remains fully idempotent: skips materials already tracked for this business.
 */
const knowledgeBaseRepository = require('../repositories/knowledgeBase.repository');
const materialRepository = require('../repositories/material.repository');
const priceRepository = require('../repositories/price.repository');
const { resolveExternalSymbol } = require('../config/industryMaterialMapping');
const logger = require('../utils/logger');

async function generateTemplate(businessId, industryId) {
  const rawMaterials = await knowledgeBaseRepository.getRawMaterialsForTemplateGeneration(industryId);

  // Enrich each material with its default external symbol if not already populated from DB
  const enrichedMaterials = (rawMaterials || []).map((rm) => {
    const symbol = rm.default_external_symbol || resolveExternalSymbol(rm.name, rm.industry_slug || industryId);
    return {
      ...rm,
      external_symbol: symbol || null,
    };
  });

  const result = await materialRepository.bulkCreateFromTemplate(businessId, enrichedMaterials);

  // If new materials with automated external symbols were created, backfill ONLY from
  // verified public benchmark/indicative sources and derive descriptive metadata canonically.
  if (result.createdMaterials && result.createdMaterials.length > 0) {
    const { COMMODITY_METADATA } = require('../config/commodityMapping');
    const ALLOWED_BENCHMARK_SOURCES = new Set(['THIRD_PARTY_API', 'GOVERNMENT_DATASET']);
    const ALLOWED_BENCHMARK_CLASSES = new Set(['OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE']);

    for (const created of result.createdMaterials) {
      if (created.externalSymbol) {
        try {
          const latestPrice = await priceRepository.findLatestPriceByExternalSymbol(created.externalSymbol);
          if (
            latestPrice &&
            ALLOWED_BENCHMARK_SOURCES.has(latestPrice.source) &&
            ALLOWED_BENCHMARK_CLASSES.has(latestPrice.data_class)
          ) {
            const meta = COMMODITY_METADATA[created.externalSymbol] || null;
            await priceRepository.create({
              trackedMaterialId: created.id,
              price: latestPrice.price,
              recordedAt: latestPrice.recorded_at,
              source: latestPrice.source,
              currency: meta?.currency || latestPrice.currency,
              unitLabel: meta?.unitLabel || latestPrice.unit_label,
              region: meta?.region || null,
              grade: meta?.grade || null,
              providerName: meta?.provider || null,
              sourceUrl: meta?.sourceUrl || null,
              dataClass: meta?.dataClass || latestPrice.data_class,
              isValid: true,
              invalidReason: null,
            });
            logger.info(
              `[template-generation] Initialized trackedMaterialId=${created.id} ` +
              `with latest ${created.externalSymbol} price=${latestPrice.price} on ${latestPrice.recorded_at}`
            );
          }
        } catch (priceErr) {
          logger.warn(
            `[template-generation] Could not backfill initial price for material ${created.id}: ${priceErr.message}`
          );
        }
      }
    }
  }

  return result;
}

module.exports = { generateTemplate };
