'use strict';

/**
 * Business Member Repository (V3-M5).
 *
 * Handles workspace memberships, role lookups, invitation tokens,
 * and RBAC multi-user queries against `business_members`.
 */

const { pool } = require('../database/connection');

const BASE_MEMBER_SELECT = `
  SELECT bm.id, bm.business_id, bm.user_id, bm.invited_email, bm.role,
         bm.status, bm.invite_token_hash, bm.invite_expires_at,
         bm.invited_by, bm.accepted_at, bm.created_at, bm.updated_at,
         u.full_name AS member_name, u.email AS member_email,
         inv.full_name AS invited_by_name
  FROM business_members bm
  LEFT JOIN users u ON u.id = bm.user_id
  LEFT JOIN users inv ON inv.id = bm.invited_by
`;

async function findById(id) {
  const [rows] = await pool.execute(
    `${BASE_MEMBER_SELECT} WHERE bm.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByBusinessAndUser(businessId, userId) {
  const [rows] = await pool.execute(
    `${BASE_MEMBER_SELECT} WHERE bm.business_id = ? AND bm.user_id = ? LIMIT 1`,
    [businessId, userId]
  );
  return rows[0] || null;
}

async function findActiveByUserId(userId) {
  const [rows] = await pool.execute(
    `${BASE_MEMBER_SELECT} WHERE bm.user_id = ? AND bm.status = 'ACTIVE' LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function listByBusinessId(businessId) {
  const [rows] = await pool.execute(
    `${BASE_MEMBER_SELECT} WHERE bm.business_id = ? ORDER BY bm.created_at ASC`,
    [businessId]
  );
  return rows;
}

async function findByTokenHash(tokenHash) {
  if (!tokenHash) return null;
  const [rows] = await pool.execute(
    `${BASE_MEMBER_SELECT} WHERE bm.invite_token_hash = ? LIMIT 1`,
    [tokenHash]
  );
  return rows[0] || null;
}

async function findByBusinessAndEmail(businessId, email) {
  if (!email) return null;
  const [rows] = await pool.execute(
    `${BASE_MEMBER_SELECT} WHERE bm.business_id = ? AND LOWER(bm.invited_email) = LOWER(?) LIMIT 1`,
    [businessId, email.trim()]
  );
  return rows[0] || null;
}

async function createInvite({
  businessId,
  invitedEmail,
  role = 'VIEWER',
  tokenHash,
  expiresAt,
  invitedBy = null,
}) {
  const [result] = await pool.execute(
    `INSERT INTO business_members (
       business_id, invited_email, role, status, invite_token_hash, invite_expires_at, invited_by
     ) VALUES (?, ?, ?, 'INVITED', ?, ?, ?)`,
    [businessId, invitedEmail.trim().toLowerCase(), role, tokenHash, expiresAt, invitedBy]
  );
  return findById(result.insertId);
}

async function updateInvite({
  id,
  role,
  tokenHash,
  expiresAt,
  invitedBy = null,
}) {
  await pool.execute(
    `UPDATE business_members
     SET role = ?, invite_token_hash = ?, invite_expires_at = ?, invited_by = ?, status = 'INVITED', updated_at = NOW()
     WHERE id = ?`,
    [role, tokenHash, expiresAt, invitedBy, id]
  );
  return findById(id);
}

async function acceptInvite({ id, userId, acceptedAt = new Date() }) {
  await pool.execute(
    `UPDATE business_members
     SET user_id = ?, status = 'ACTIVE', accepted_at = ?, invite_token_hash = NULL, updated_at = NOW()
     WHERE id = ?`,
    [userId, acceptedAt, id]
  );
  return findById(id);
}

async function updateRole(id, role) {
  await pool.execute(
    `UPDATE business_members
     SET role = ?, updated_at = NOW()
     WHERE id = ?`,
    [role, id]
  );
  return findById(id);
}

async function revoke(id) {
  await pool.execute(
    `UPDATE business_members
     SET status = 'REVOKED', invite_token_hash = NULL, updated_at = NOW()
     WHERE id = ?`,
    [id]
  );
  return findById(id);
}

async function countActiveOwners(businessId) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt
     FROM business_members
     WHERE business_id = ? AND role = 'OWNER' AND status = 'ACTIVE'`,
    [businessId]
  );
  return Number(rows[0]?.cnt || 0);
}

async function addActiveMember({ businessId, userId, email, role = 'OWNER' }) {
  const [result] = await pool.execute(
    `INSERT INTO business_members (
       business_id, user_id, invited_email, role, status, accepted_at
     ) VALUES (?, ?, ?, ?, 'ACTIVE', NOW())
     ON DUPLICATE KEY UPDATE role = VALUES(role), status = 'ACTIVE', accepted_at = NOW()`,
    [businessId, userId, (email || '').trim().toLowerCase(), role]
  );
  return result;
}

module.exports = {
  findById,
  findByBusinessAndUser,
  findActiveByUserId,
  listByBusinessId,
  findByTokenHash,
  findByBusinessAndEmail,
  createInvite,
  updateInvite,
  acceptInvite,
  updateRole,
  revoke,
  countActiveOwners,
  addActiveMember,
};
