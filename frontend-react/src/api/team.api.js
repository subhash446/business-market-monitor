/**
 * Team & Workspace Members API module (V3-M5).
 * Business Market Monitor — React frontend
 */

import { get, post, patch, del } from './client.js';

/**
 * List all members of the current workspace.
 * GET /api/v1/team
 * @returns {Promise<{ members: Array<Object> }>}
 */
export async function listTeamMembers() {
  const { data } = await get('/team');
  return data ?? { members: [] };
}

/**
 * Invite a new member to the workspace.
 * POST /api/v1/team/invite
 * @param {{ email: string, role?: 'OWNER'|'PURCHASE_MANAGER'|'VIEWER' }} payload
 * @returns {Promise<{ member: Object, inviteToken: string, inviteLink: string, expiresAt: string }>}
 */
export async function inviteTeamMember(payload) {
  const { data } = await post('/team/invite', payload);
  return data;
}

/**
 * Accept a workspace invitation token.
 * POST /api/v1/team/accept-invite
 * @param {string} token
 * @returns {Promise<{ member: Object }>}
 */
export async function acceptTeamInvite(token) {
  const { data } = await post('/team/accept-invite', { token });
  return data;
}

/**
 * Update a workspace member's role.
 * PATCH /api/v1/team/members/:memberId/role
 * @param {number|string} memberId
 * @param {'OWNER'|'PURCHASE_MANAGER'|'VIEWER'} role
 * @returns {Promise<{ member: Object }>}
 */
export async function updateTeamMemberRole(memberId, role) {
  const { data } = await patch(`/team/members/${memberId}/role`, { role });
  return data;
}

/**
 * Revoke a member or cancel an active invite.
 * DELETE /api/v1/team/members/:memberId
 * @param {number|string} memberId
 * @returns {Promise<{ member: Object }>}
 */
export async function revokeTeamMember(memberId) {
  const { data } = await del(`/team/members/${memberId}`);
  return data;
}
