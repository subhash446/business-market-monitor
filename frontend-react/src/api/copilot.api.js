/**
 * WhatsApp Quote Copilot API Client (V3-M4).
 * Business Market Monitor — React frontend
 */

import { get, post } from './client.js';

/**
 * Parse an informal WhatsApp supplier quote text and generate negotiation drafts.
 *
 * @param {Object} options
 * @param {string} options.text
 * @param {boolean} [options.autoLog=false]
 * @param {number|null} [options.materialId=null]
 * @returns {Promise<{ parsed: Object, drafts: Object, loggedPoint: Object|null }>}
 */
export async function parseWhatsAppQuote({ text, autoLog = false, materialId = null }) {
  const { data } = await post('/copilot/whatsapp/parse-quote', {
    text,
    autoLog,
    materialId,
  });
  return data;
}

/**
 * Retrieve recent parsed quotes and copilot negotiation drafts for the business.
 *
 * @returns {Promise<Array<Object>>}
 */
export async function getCopilotHistory() {
  const { data } = await get('/copilot/whatsapp/history');
  return data;
}
