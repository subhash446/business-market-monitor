'use strict';

/**
 * Team & Workspace Management Service (V3-M5).
 *
 * Implements multi-user RBAC workspace membership, secure invite generation,
 * single-use token verification, email validation, and role updates.
 */

const crypto = require('crypto');
const businessMemberRepository = require('../repositories/businessMember.repository');
const userRepository = require('../repositories/user.repository');
const AppError = require('../utils/AppError');

const VALID_ROLES = ['OWNER', 'PURCHASE_MANAGER', 'VIEWER'];
const DEFAULT_INVITE_EXPIRY_DAYS = 7;

function formatMember(row) {
  if (!row) return null;
  const isExpired = row.invite_expires_at
    ? new Date(row.invite_expires_at).getTime() < Date.now()
    : false;

  return {
    id: row.id,
    businessId: row.business_id,
    userId: row.user_id || null,
    invitedEmail: row.invited_email,
    role: row.role,
    status: row.status,
    isExpired,
    inviteExpiresAt: row.invite_expires_at ? new Date(row.invite_expires_at).toISOString() : null,
    invitedBy: row.invited_by || null,
    invitedByName: row.invited_by_name || null,
    acceptedAt: row.accepted_at ? new Date(row.accepted_at).toISOString() : null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
    memberName: row.member_name || null,
    memberEmail: row.member_email || row.invited_email,
  };
}

function hashToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * List all members of a business workspace.
 */
async function listMembers(businessId) {
  if (!businessId) {
    throw new AppError(400, 'BAD_REQUEST', 'businessId is required');
  }
  const rows = await businessMemberRepository.listByBusinessId(businessId);
  return rows.map(formatMember);
}

/**
 * Invite a new member or re-issue an invite for a non-active member.
 */
async function inviteMember(businessId, currentUserId, { email, role = 'VIEWER' }) {
  if (!businessId) {
    throw new AppError(400, 'BAD_REQUEST', 'businessId is required');
  }
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new AppError(400, 'VALIDATION_ERROR', 'A valid email address is required');
  }
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedRole = (role || 'VIEWER').toUpperCase();

  if (!VALID_ROLES.includes(normalizedRole)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid role '${role}'. Allowed roles: ${VALID_ROLES.join(', ')}`
    );
  }

  // Check if member already exists
  const existing = await businessMemberRepository.findByBusinessAndEmail(businessId, normalizedEmail);
  if (existing && existing.status === 'ACTIVE') {
    throw new AppError(409, 'ALREADY_MEMBER', `User '${normalizedEmail}' is already an active member of this workspace`);
  }

  // Generate 256-bit cryptographically secure raw token
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + DEFAULT_INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

  let memberRow;
  if (existing) {
    // Re-issue / rotate invite
    memberRow = await businessMemberRepository.updateInvite({
      id: existing.id,
      role: normalizedRole,
      tokenHash,
      expiresAt,
      invitedBy: currentUserId,
    });
  } else {
    // New invitation
    memberRow = await businessMemberRepository.createInvite({
      businessId,
      invitedEmail: normalizedEmail,
      role: normalizedRole,
      tokenHash,
      expiresAt,
      invitedBy: currentUserId,
    });
  }

  return {
    member: formatMember(memberRow),
    inviteToken: rawToken,
    inviteLink: `/accept-invite?token=${rawToken}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Accept an invite using raw token.
 */
async function acceptInvite(currentUserId, currentUserEmail, rawToken) {
  if (!rawToken || typeof rawToken !== 'string') {
    throw new AppError(400, 'INVALID_TOKEN', 'Invite token is required');
  }

  const tokenHash = hashToken(rawToken.trim());
  const member = await businessMemberRepository.findByTokenHash(tokenHash);

  if (!member) {
    throw new AppError(404, 'INVITE_NOT_FOUND', 'Invalid or expired invitation token');
  }

  if (member.status !== 'INVITED') {
    throw new AppError(400, 'INVITE_ALREADY_USED', 'This invitation has already been accepted or revoked');
  }

  if (member.invite_expires_at && new Date(member.invite_expires_at).getTime() < Date.now()) {
    throw new AppError(410, 'INVITE_EXPIRED', 'This invitation has expired. Please ask an owner to send a new invite.');
  }

  // Case-insensitive email match guard
  if (currentUserEmail && member.invited_email) {
    if (currentUserEmail.trim().toLowerCase() !== member.invited_email.trim().toLowerCase()) {
      throw new AppError(
        403,
        'EMAIL_MISMATCH',
        `Invitation was issued for '${member.invited_email}', but you are signed in as '${currentUserEmail}'. Please sign in with the invited email address.`
      );
    }
  }

  const updated = await businessMemberRepository.acceptInvite({
    id: member.id,
    userId: currentUserId,
    acceptedAt: new Date(),
  });

  return formatMember(updated);
}

/**
 * Update a member's role. Protects against demoting the sole active owner.
 */
async function updateMemberRole(businessId, memberId, newRole) {
  const normalizedRole = (newRole || '').toUpperCase();
  if (!VALID_ROLES.includes(normalizedRole)) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      `Invalid role '${newRole}'. Allowed roles: ${VALID_ROLES.join(', ')}`
    );
  }

  const member = await businessMemberRepository.findById(memberId);
  if (!member || String(member.business_id) !== String(businessId)) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'Workspace member not found');
  }

  // Guard against demoting the sole active OWNER
  if (member.role === 'OWNER' && normalizedRole !== 'OWNER' && member.status === 'ACTIVE') {
    const ownerCount = await businessMemberRepository.countActiveOwners(businessId);
    if (ownerCount <= 1) {
      throw new AppError(400, 'LAST_OWNER', 'Cannot demote the sole active owner of this workspace');
    }
  }

  const updated = await businessMemberRepository.updateRole(memberId, normalizedRole);
  return formatMember(updated);
}

/**
 * Revoke a member or invite. Protects against revoking the sole active owner.
 */
async function revokeMember(businessId, currentUserId, memberId) {
  const member = await businessMemberRepository.findById(memberId);
  if (!member || String(member.business_id) !== String(businessId)) {
    throw new AppError(404, 'MEMBER_NOT_FOUND', 'Workspace member not found');
  }

  // Guard against revoking the sole active OWNER
  if (member.role === 'OWNER' && member.status === 'ACTIVE') {
    const ownerCount = await businessMemberRepository.countActiveOwners(businessId);
    if (ownerCount <= 1) {
      throw new AppError(400, 'LAST_OWNER', 'Cannot revoke the sole active owner of this workspace');
    }
  }

  const updated = await businessMemberRepository.revoke(memberId);
  return formatMember(updated);
}

module.exports = {
  listMembers,
  inviteMember,
  acceptInvite,
  updateMemberRole,
  revokeMember,
  hashToken,
};
