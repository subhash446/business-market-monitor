/**
 * Business API module
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §3, §5.3 — js/api/business.api.js
 */

import { get, post, put } from '../api/client.js';

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
 * Create a new business profile.
 *
 * POST /api/v1/business — requires auth
 * Body: { name, industryId, contactEmail?, contactPhone?, address? }
 * Response data (201): { id, name, industryId, materialsGenerated }
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
 * @returns {Promise<{ id: number, name: string, industryId: number, materialsGenerated: number }>}
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
