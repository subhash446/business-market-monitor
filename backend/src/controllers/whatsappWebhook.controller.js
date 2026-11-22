'use strict';

/**
 * Meta WhatsApp Cloud API Webhook Controller (V3-M4).
 *
 * Implements:
 *   1. GET: Meta webhook verification handshake (hub.mode, hub.verify_token, hub.challenge).
 *   2. POST: Inbound webhook processor with fail-closed HMAC-SHA256 signature verification,
 *      timing-safe comparison, wamid idempotency, sender phone lookup, quote auto-logging,
 *      and instant copilot advisory reply.
 */

const crypto = require('crypto');
const env = require('../config/env');
const whatsappProvider = require('../providers/whatsapp.provider');
const whatsappInboundRepository = require('../repositories/whatsappInbound.repository');
const businessRepository = require('../repositories/business.repository');
const materialRepository = require('../repositories/material.repository');
const priceRepository = require('../repositories/price.repository');
const landedCostService = require('../services/landedCost.service');
const fxRateService = require('../services/fxRate.service');
const {
  parseWhatsAppQuote,
  generateNegotiationDrafts,
  logParsedSupplierQuote,
  resolveMaterialUnit,
} = require('../services/whatsappCopilot.service');

/**
 * GET /api/v1/webhooks/whatsapp
 * Meta verification endpoint.
 */
function verifyWebhook(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = env.whatsapp.webhookVerifyToken;

  if (mode === 'subscribe' && token && expectedToken && token === expectedToken) {
    return res.status(200).send(challenge);
  }

  return res.status(403).json({
    status: 'error',
    message: 'Verification token mismatch or mode not subscribe.',
  });
}

/**
 * Timing-safe HMAC-SHA256 signature validation.
 */
function verifySignature(req) {
  const appSecret = env.whatsapp.appSecret;
  const isTest = process.env.NODE_ENV === 'test';

  // Fail-closed in production / non-test environments if appSecret is missing
  if (!appSecret) {
    if (!isTest) {
      return { ok: false, status: 503, message: 'WHATSAPP_APP_SECRET missing; fail-closed rejection.' };
    }
    // In test environment without appSecret, allow test suite to mock or bypass
    return { ok: true };
  }

  const sigHeader = req.headers['x-hub-signature-256'] || '';
  if (!sigHeader) {
    return { ok: false, status: 401, message: 'Missing X-Hub-Signature-256 header.' };
  }

  const expectedHex = crypto
    .createHmac('sha256', appSecret)
    .update(req.rawBody || Buffer.from(JSON.stringify(req.body || {})))
    .digest('hex');

  const actualHex = sigHeader.replace(/^sha256=/i, '');

  const bufExpected = Buffer.from(expectedHex, 'utf8');
  const bufActual = Buffer.from(actualHex, 'utf8');

  // ALWAYS compare buffer lengths first so timingSafeEqual never throws RangeError
  if (bufExpected.length !== bufActual.length || !crypto.timingSafeEqual(bufExpected, bufActual)) {
    return { ok: false, status: 401, message: 'Invalid X-Hub-Signature-256 signature.' };
  }

  return { ok: true };
}

/**
 * POST /api/v1/webhooks/whatsapp
 * Inbound messages handler.
 */
async function handleInboundWebhook(req, res) {
  // 1. Verify HMAC signature
  const sigCheck = verifySignature(req);
  if (!sigCheck.ok) {
    return res.status(sigCheck.status).json({
      status: 'error',
      message: sigCheck.message,
    });
  }

  const body = req.body;
  if (!body || !Array.isArray(body.entry)) {
    return res.status(200).json({ status: 'NO_ENTRIES' });
  }

  // Process all inbound entries
  for (const entry of body.entry) {
    const changes = entry.changes || [];
    for (const change of changes) {
      const val = change.value;
      if (!val || !Array.isArray(val.messages)) continue;

      for (const msg of val.messages) {
        const wamid = msg.id;
        const senderDigits = String(msg.from || '').replace(/\D/g, '');
        const textBody = msg.text?.body || '';

        if (!wamid || !textBody) continue;

        // 2. Idempotency check via external_message_id
        const existingMsg = await whatsappInboundRepository.findByExternalMessageId(wamid);
        if (existingMsg) {
          continue; // Already processed
        }

        const phoneMasked = whatsappProvider.redactPhoneNumber('+' + senderDigits);
        const phoneHash = crypto.createHash('sha256').update(senderDigits).digest('hex');

        // 3. Resolve tenant business via sender phone
        const business = await businessRepository.findByContactPhone(senderDigits);
        if (!business) {
          // Unmapped sender: ignore or record audit row if desired, keep Meta 200 contract
          continue;
        }

        // 4. Retrieve tenant's tracked materials
        const trackedMaterials = await materialRepository.findTrackedForBusiness(business.id);
        const parsed = parseWhatsAppQuote(textBody, trackedMaterials);

        let loggedPointId = null;
        let counterLow = null;
        let counterHigh = null;
        let procStatus = 'UNRECOGNIZED';
        let replyStatus = 'SKIPPED';

        if (parsed.isMatch && parsed.matchedMaterial) {
          procStatus = 'PARSED';

          // 5. Look up latest price and landed parity for counter drafting
          let landedParityBenchmark = null;
          let latestBenchmarkPrice = null;

          try {
            const latestPrices = await priceRepository.findLatestByMaterialId(parsed.matchedMaterial.id);
            if (latestPrices) {
              latestBenchmarkPrice = Number(latestPrices.price);
            }

            // Check if landed parity is configured
            if (parsed.matchedMaterial.landedUnitFactor != null) {
              const fx = await fxRateService.getLatestRate('USD', 'INR');
              const parityRes = landedCostService.evaluateLandedCostParity({
                landedCostConfig: {
                  unitFactor: parsed.matchedMaterial.landedUnitFactor,
                  dutyFreightPct: parsed.matchedMaterial.landedDutyFreightPct || 0,
                  fixedSpreadInr: parsed.matchedMaterial.landedFixedSpreadInr || 0,
                },
                latestBenchmark: latestPrices ? { price: Number(latestPrices.price), currency: latestPrices.currency || 'USD' } : null,
                fxRate: fx,
                materialUnit: resolveMaterialUnit(parsed.matchedMaterial) || 'kg',
              });

              if (parityRes && parityRes.estimatedLandedBenchmark) {
                landedParityBenchmark = parityRes.estimatedLandedBenchmark;
              }
            }
          } catch (_) {}

          // Generate negotiation drafts
          const effectiveMatUnit = resolveMaterialUnit(parsed.matchedMaterial) || 'kg';
          const drafts = generateNegotiationDrafts({
            materialName: parsed.matchedMaterial.name,
            materialUnit: effectiveMatUnit,
            quotedPrice: parsed.rawPrice,
            quotedUnit: parsed.rawUnit || effectiveMatUnit,
            currency: parsed.currency,
            supplierName: parsed.supplierName,
            benchmarkPrice: latestBenchmarkPrice,
            landedParityBenchmark,
          });

          counterLow = drafts.suggestedCounterLow;
          counterHigh = drafts.suggestedCounterHigh;

          // 6. Persist quote to price_points if unit matches or converted
          if (!drafts.unitConversion.unitMismatch) {
            try {
              const createdPoint = await logParsedSupplierQuote({
                businessId: business.id,
                materialId: parsed.matchedMaterial.id,
                price: drafts.effectiveQuotedPrice,
                supplierName: parsed.supplierName || 'WhatsApp Inbound',
                unitLabel: drafts.materialUnit,
                currency: parsed.currency,
              });
              loggedPointId = createdPoint?.id || null;
            } catch (_) {}
          }

          // 7. Dispatch instant copilot advisory reply back to sender
          if (env.whatsapp.enabled) {
            replyStatus = 'PENDING';
            const benchmarkRef = landedParityBenchmark != null
              ? `Parity Benchmark: ₹${landedParityBenchmark.toFixed(2)}/${drafts.materialUnit}`
              : (latestBenchmarkPrice != null ? `Market Benchmark: ₹${latestBenchmarkPrice.toFixed(2)}/${drafts.materialUnit}` : '');

            const varianceText = drafts.variancePercent != null
              ? ` (${drafts.variancePercent > 0 ? '+' : ''}${drafts.variancePercent}%)`
              : '';

            const replyText =
              `✅ *BMM Copilot: Quote Captured*\n\n` +
              `• *Material:* ${parsed.matchedMaterial.name}\n` +
              `• *Logged Quote:* ₹${drafts.effectiveQuotedPrice}/${drafts.materialUnit} ${parsed.supplierName ? `(${parsed.supplierName})` : ''}\n` +
              (benchmarkRef ? `• *${benchmarkRef}${varianceText}*\n` : '') +
              `• *Suggested Counter:* ₹${counterLow} – ₹${counterHigh}/${drafts.materialUnit}\n\n` +
              `_Reply with COUNTER to view ready-to-send negotiation draft._`;

            try {
              const sendRes = await whatsappProvider.sendMessage({
                to: '+' + senderDigits,
                text: replyText,
              });
              replyStatus = sendRes.success ? 'SENT' : 'FAILED';
            } catch (_) {
              replyStatus = 'FAILED';
            }
          }
        }

        // 8. Record audit entry
        await whatsappInboundRepository.createInboundMessage({
          businessId: business.id,
          externalMessageId: wamid,
          senderPhoneMasked: phoneMasked,
          senderPhoneHash: phoneHash,
          rawText: textBody,
          parsedMaterialId: parsed.matchedMaterial?.id || null,
          parsedPrice: parsed.rawPrice || null,
          parsedCurrency: parsed.currency || 'INR',
          parsedUnit: parsed.rawUnit || null,
          parsedSupplierName: parsed.supplierName || null,
          loggedPricePointId: loggedPointId,
          suggestedCounterLow: counterLow,
          suggestedCounterHigh: counterHigh,
          processingStatus: procStatus,
          replyStatus,
        });
      }
    }
  }

  // Meta requires 200 OK
  return res.status(200).json({ status: 'EVENT_RECEIVED' });
}

module.exports = {
  verifyWebhook,
  verifySignature,
  handleInboundWebhook,
};
