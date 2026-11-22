'use strict';

/**
 * WhatsApp Copilot In-App Controller (V3-M4).
 *
 * Provides authenticated endpoints for:
 *   1. POST /api/v1/copilot/whatsapp/parse-quote (Preview & optional autoLog)
 *   2. GET /api/v1/copilot/whatsapp/history (Audit trail & recent parsed quotes)
 */

const crypto = require('crypto');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { sendSuccess } = require('../utils/response');
const materialRepository = require('../repositories/material.repository');
const priceRepository = require('../repositories/price.repository');
const whatsappInboundRepository = require('../repositories/whatsappInbound.repository');
const landedCostService = require('../services/landedCost.service');
const fxRateService = require('../services/fxRate.service');
const {
  parseWhatsAppQuote,
  generateNegotiationDrafts,
  logParsedSupplierQuote,
  resolveMaterialUnit,
} = require('../services/whatsappCopilot.service');
const AppError = require('../utils/AppError');

/**
 * POST /api/v1/copilot/whatsapp/parse-quote
 */
async function parseQuote(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { text, autoLog = false, materialId = null } = req.body || {};

    if (!text || typeof text !== 'string' || !text.trim()) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Quote text is required.'));
    }

    const trackedMaterials = await materialRepository.findTrackedForBusiness(businessId);
    if (!trackedMaterials || trackedMaterials.length === 0) {
      return next(new AppError(400, 'NO_TRACKED_MATERIALS', 'Please track at least one material before parsing quotes.'));
    }

    // 1. Deterministic text parsing
    const parsed = parseWhatsAppQuote(text, trackedMaterials);

    // 2. Allow user materialId override
    let activeMaterial = parsed.matchedMaterial;
    if (materialId != null) {
      const explicitMat = trackedMaterials.find((m) => Number(m.id) === Number(materialId));
      if (explicitMat) {
        const explicitUnit = resolveMaterialUnit(explicitMat) || 'kg';
        activeMaterial = {
          id: explicitMat.id,
          name: explicitMat.name,
          unit: explicitUnit,
          unit_abbreviation: explicitUnit,
          isTracked: explicitMat.isTracked ?? explicitMat.is_tracked ?? true,
          landedUnitFactor: explicitMat.landedUnitFactor ?? explicitMat.landed_unit_factor ?? null,
          landedDutyFreightPct: explicitMat.landedDutyFreightPct ?? explicitMat.landed_duty_freight_pct ?? null,
          landedFixedSpreadInr: explicitMat.landedFixedSpreadInr ?? explicitMat.landed_fixed_spread_inr ?? null,
        };
        parsed.matchedMaterial = activeMaterial;
        parsed.isMatch = true;
      }
    }

    let drafts = null;
    let loggedPoint = null;

    if (parsed.isMatch && activeMaterial && parsed.rawPrice > 0) {
      // 3. Fetch latest benchmark and landed parity
      let benchmarkPrice = null;
      let landedParityBenchmark = null;

      try {
        const latestPoint = await priceRepository.findLatestByMaterialId(activeMaterial.id);
        if (latestPoint) {
          benchmarkPrice = Number(latestPoint.price);
        }

        if (activeMaterial.landedUnitFactor != null) {
          const fx = await fxRateService.getLatestRate('USD', 'INR');
          const parityRes = landedCostService.evaluateLandedCostParity({
            landedCostConfig: {
              unitFactor: activeMaterial.landedUnitFactor,
              dutyFreightPct: activeMaterial.landedDutyFreightPct || 0,
              fixedSpreadInr: activeMaterial.landedFixedSpreadInr || 0,
            },
            latestBenchmark: latestPoint ? { price: Number(latestPoint.price), currency: latestPoint.currency || 'USD' } : null,
            fxRate: fx,
            materialUnit: resolveMaterialUnit(activeMaterial) || 'kg',
          });

          if (parityRes && parityRes.estimatedLandedBenchmark) {
            landedParityBenchmark = parityRes.estimatedLandedBenchmark;
          }
        }
      } catch (_) {}

      // 4. Generate drafts
      const effectiveMatUnit = resolveMaterialUnit(activeMaterial) || 'kg';
      drafts = generateNegotiationDrafts({
        materialName: activeMaterial.name,
        materialUnit: effectiveMatUnit,
        quotedPrice: parsed.rawPrice,
        quotedUnit: parsed.rawUnit || effectiveMatUnit,
        currency: parsed.currency,
        supplierName: parsed.supplierName,
        benchmarkPrice,
        landedParityBenchmark,
      });

      // 5. If autoLog is requested, persist quote to price_points & audit table
      if (autoLog) {
        if (drafts.unitConversion.unitMismatch) {
          return next(
            new AppError(
              400,
              'UNIT_MISMATCH',
              `Cannot auto-log quote due to incompatible unit mismatch (${drafts.unitConversion.unitConversionNote}). Please verify units.`
            )
          );
        }

        loggedPoint = await logParsedSupplierQuote({
          businessId,
          materialId: activeMaterial.id,
          price: drafts.effectiveQuotedPrice,
          supplierName: parsed.supplierName || 'WhatsApp In-App Copilot',
          unitLabel: drafts.materialUnit,
          currency: parsed.currency,
        });

        // Record in whatsapp_inbound_messages for Day-1 history
        const inAppExternalId = `inapp_${crypto.randomUUID()}`;
        const phoneHash = crypto.createHash('sha256').update('IN_APP_WEB').digest('hex');

        await whatsappInboundRepository.createInboundMessage({
          businessId,
          externalMessageId: inAppExternalId,
          senderPhoneMasked: 'IN_APP_WEB',
          senderPhoneHash: phoneHash,
          rawText: text.trim(),
          parsedMaterialId: activeMaterial.id,
          parsedPrice: parsed.rawPrice,
          parsedCurrency: parsed.currency,
          parsedUnit: parsed.rawUnit,
          parsedSupplierName: parsed.supplierName,
          loggedPricePointId: loggedPoint.id,
          suggestedCounterLow: drafts.suggestedCounterLow,
          suggestedCounterHigh: drafts.suggestedCounterHigh,
          processingStatus: 'PARSED',
          replyStatus: 'SKIPPED',
        });
      }
    }

    sendSuccess(res, {
      parsed,
      drafts,
      loggedPoint: loggedPoint
        ? {
            id: loggedPoint.id,
            price: Number(loggedPoint.price),
            currency: loggedPoint.currency,
            unitLabel: loggedPoint.unit_label,
            recordedAt: loggedPoint.recorded_at,
          }
        : null,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/copilot/whatsapp/history
 */
async function getHistory(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const limit = parseInt(req.query.limit, 10) || 20;
    const history = await whatsappInboundRepository.listRecentByBusinessId(businessId, limit);

    sendSuccess(
      res,
      history.map((item) => ({
        id: item.id,
        externalMessageId: item.external_message_id,
        senderMasked: item.sender_phone_masked,
        rawText: item.raw_text,
        materialId: item.parsed_material_id,
        materialName: item.material_name,
        price: item.parsed_price != null ? Number(item.parsed_price) : null,
        currency: item.parsed_currency,
        unit: item.parsed_unit,
        supplierName: item.parsed_supplier_name,
        loggedPricePointId: item.logged_price_point_id,
        suggestedCounterLow: item.suggested_counter_low != null ? Number(item.suggested_counter_low) : null,
        suggestedCounterHigh: item.suggested_counter_high != null ? Number(item.suggested_counter_high) : null,
        processingStatus: item.processing_status,
        replyStatus: item.reply_status,
        createdAt: item.created_at,
      }))
    );
  } catch (err) {
    next(err);
  }
}

module.exports = {
  parseQuote,
  getHistory,
};
