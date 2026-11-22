'use strict';

/**
 * WhatsApp Inbound Messages Repository (V3-M4).
 *
 * Handles audit logging, idempotency queries, and history retrieval
 * for inbound WhatsApp and in-app negotiation copilot quotes.
 */

const { pool } = require('../database/connection');

async function createInboundMessage({
  businessId,
  externalMessageId,
  senderPhoneMasked,
  senderPhoneHash,
  rawText,
  parsedMaterialId = null,
  parsedPrice = null,
  parsedCurrency = 'INR',
  parsedUnit = null,
  parsedSupplierName = null,
  loggedPricePointId = null,
  suggestedCounterLow = null,
  suggestedCounterHigh = null,
  processingStatus = 'PARSED',
  replyStatus = 'PENDING',
}) {
  const [result] = await pool.execute(
    `INSERT INTO whatsapp_inbound_messages (
       business_id, external_message_id, sender_phone_masked, sender_phone_hash,
       raw_text, parsed_material_id, parsed_price, parsed_currency, parsed_unit,
       parsed_supplier_name, logged_price_point_id, suggested_counter_low,
       suggested_counter_high, processing_status, reply_status
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      businessId,
      externalMessageId,
      senderPhoneMasked,
      senderPhoneHash,
      rawText,
      parsedMaterialId,
      parsedPrice != null ? Number(parsedPrice) : null,
      parsedCurrency,
      parsedUnit,
      parsedSupplierName,
      loggedPricePointId,
      suggestedCounterLow != null ? Number(suggestedCounterLow) : null,
      suggestedCounterHigh != null ? Number(suggestedCounterHigh) : null,
      processingStatus,
      replyStatus,
    ]
  );

  return findById(result.insertId);
}

async function findById(id) {
  const [rows] = await pool.execute(
    `SELECT m.*, tm.name AS material_name
     FROM whatsapp_inbound_messages m
     LEFT JOIN tracked_materials tm ON tm.id = m.parsed_material_id
     WHERE m.id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByExternalMessageId(externalMessageId) {
  if (!externalMessageId) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM whatsapp_inbound_messages
     WHERE external_message_id = ?
     LIMIT 1`,
    [externalMessageId]
  );
  return rows[0] || null;
}

async function listRecentByBusinessId(businessId, limit = 20) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
  const [rows] = await pool.execute(
    `SELECT m.*, tm.name AS material_name
     FROM whatsapp_inbound_messages m
     LEFT JOIN tracked_materials tm ON tm.id = m.parsed_material_id
     WHERE m.business_id = ?
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ${safeLimit}`,
    [businessId]
  );
  return rows;
}

async function updateReplyStatus(id, replyStatus) {
  await pool.execute(
    `UPDATE whatsapp_inbound_messages
     SET reply_status = ?
     WHERE id = ?`,
    [replyStatus, id]
  );
  return findById(id);
}

module.exports = {
  createInboundMessage,
  findById,
  findByExternalMessageId,
  listRecentByBusinessId,
  updateReplyStatus,
};
