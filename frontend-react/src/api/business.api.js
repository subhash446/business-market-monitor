/**
 * Business API module
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/api/business.api.js (Vanilla JS v1.0)
 * Change: import path updated — client.js is now in the same directory.
 * Phase 5: Added getIndustryMaterials()
 *
 * Doc 3 §3, §5.3 — js/api/business.api.js
 */

import { get, post, put } from './client.js';

/**
 * Fetch all industries (public — no auth required).
 *
 * GET /api/v1/industries
 * Response data: [{ id, name, slug, isAnchor, isLightweightTemplate, description }]
 *
 * @returns {Promise<Array<{ id: number, name: string, slug: string, description: string }>>}
 */
export async function listIndustries() {
  const { data } = await get('/industries', {}, { skipAuth: true });
  return data ?? [];
}

/**
 * Fetch default mapped materials for a business category / industry (Phase 5).
 *
 * GET /api/v1/industries/:industryId/materials
 * Response: { industryId, industryName, industrySlug, isLightweightTemplate, materials: [...] }
 *
 * @param {number|string} industryId
 * @returns {Promise<{ industryId: number, industryName: string, materials: Array<object> }>}
 */
export async function getIndustryMaterials(industryId) {
  const { data } = await get(`/industries/${industryId}/materials`, {}, { skipAuth: true });
  return data ?? { materials: [] };
}

/**
 * Create a new business profile.
 *
 * POST /api/v1/business — requires auth
 * Body: { name, industryId, contactEmail?, contactPhone?, address? }
 * Response data (201): { id, name, industryId, materialsGenerated, materials }
 *
 * IMPORTANT: Field is `name` — NOT `businessName`.
 *
 * @param {{
 *   name:          string,
 *   industryId:    number,
 *   contactEmail?: string,
 *   contactPhone?: string,
 *   address?:      string,
 * }} fields
 * @returns {Promise<{ id: number, name: string, industryId: number, materialsGenerated: number, materials?: Array<object> }>}
 * @throws {ApiError} — 409 if business already exists, 400 validation, 401 auth
 */
export async function createBusiness(fields) {
  const { data } = await post('/business', fields);
  return data;
}

/**
 * Get the current user's business profile.
 *
 * GET /api/v1/business — requires auth
 * Response data: { id, name, industryId, industryName, contactEmail, contactPhone,
 *                  address, newsDigestEnabled, newsDigestFrequency }
 *
 * @returns {Promise<Object>}
 * @throws {ApiError} — 404 if no business yet
 */
export async function getBusiness() {
  const { data } = await get('/business');
  return data;
}

/**
 * Update the current user's business profile.
 *
 * PUT /api/v1/business — requires auth
 * Body: { name, contactEmail?, contactPhone?, address?, newsDigestEnabled?, newsDigestFrequency? }
 *
 * IMPORTANT: Field is `name` — NOT `businessName`.
 * IMPORTANT: industryId CANNOT be changed after creation — must NOT be sent.
 *
 * Response data (200): full business object { id, name, industryId, industryName,
 *   contactEmail, contactPhone, address, newsDigestEnabled, newsDigestFrequency }
 *
 * newsDigestFrequency accepted values: 'DAILY' | 'WEEKLY' | 'MONTHLY'
 *
 * @param {{
 *   name:                  string,
 *   contactEmail?:         string,
 *   contactPhone?:         string,
 *   address?:              string,
 *   newsDigestEnabled?:    boolean,
 *   newsDigestFrequency?:  'DAILY'|'WEEKLY'|'MONTHLY',
 * }} fields
 * @returns {Promise<Object>}
 * @throws {ApiError} — 400 validation, 404 business not found, 401 auth
 */
export async function updateBusiness(fields) {
  const { data } = await put('/business', fields);
  return data;
}

/**
 * Fetch structured preview of periodic news & procurement digest (T-08).
 * GET /api/v1/business/news-digest/preview — requires auth
 *
 * @returns {Promise<Object>}
 */
export async function getDigestPreview() {
  const { data } = await get('/business/news-digest/preview');
  return data;
}

/**
 * Trigger immediate dispatch of news digest for current business (T-08).
 * POST /api/v1/business/news-digest/send-now — requires auth
 *
 * @param {{ channelOverride?: 'EMAIL'|'WHATSAPP'|'BOTH' }} [options]
 * @returns {Promise<{ success: boolean, sentAt: string, channelUsed: string, digest: Object }>}
 */
export async function sendDigestNow(options = {}) {
  const { data } = await post('/business/news-digest/send-now', options);
  return data;
}

/**
 * Fetch supplier sourcing recommendations across all tracked materials (T-08).
 * GET /api/v1/business/supplier-recommendations — requires auth
 *
 * @returns {Promise<{ summary: Object, recommendations: Array<Object> }>}
 */
export async function getBusinessSupplierRecommendations() {
  const { data } = await get('/business/supplier-recommendations');
  return data;
}
