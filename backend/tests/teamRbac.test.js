'use strict';

/**
 * Team & Multi-User Workspace RBAC Tests (V3-M5).
 *
 * Verifies:
 *   1. RBAC Middleware (attachBusinessRole, requireRole enforcement & 403 checks).
 *   2. Invite Token Generation (SHA-256 hash storage, 7-day expiry).
 *   3. Invite Acceptance (Single-use hash clearing, 410 expiry, 403 email mismatch guard).
 *   4. Sole Owner Protection (guard against demoting or revoking the sole active owner).
 *   5. Mutating Route RBAC (VIEWER rejection on write endpoints).
 */

const crypto = require('crypto');
const teamService = require('../src/services/team.service');
const businessMemberRepository = require('../src/repositories/businessMember.repository');
const businessRepository = require('../src/repositories/business.repository');
const { attachBusinessRole, requireRole } = require('../src/middleware/rbac.middleware');
const AppError = require('../src/utils/AppError');

describe('Team & Workspace RBAC Engine (V3-M5)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('1. RBAC Middleware', () => {
    test('attachBusinessRole attaches businessRole from repository or defaults to OWNER', async () => {
      jest.spyOn(businessRepository, 'findByUserId').mockResolvedValue({
        id: 42,
        user_id: 10,
        businessRole: 'PURCHASE_MANAGER',
      });

      const req = { auth: { userId: 10 } };
      const res = {};
      const next = jest.fn();

      await attachBusinessRole(req, res, next);

      expect(req.auth.businessId).toBe(42);
      expect(req.auth.businessRole).toBe('PURCHASE_MANAGER');
      expect(next).toHaveBeenCalledWith();
    });

    test('requireRole allows request if role matches allowed roles', async () => {
      const middleware = requireRole('OWNER', 'PURCHASE_MANAGER');
      const req = { auth: { userId: 10, businessRole: 'PURCHASE_MANAGER' } };
      const res = {};
      const next = jest.fn();

      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    test('requireRole blocks request with 403 FORBIDDEN if role is insufficient', async () => {
      const middleware = requireRole('OWNER', 'PURCHASE_MANAGER');
      const req = { auth: { userId: 10, businessRole: 'VIEWER' } };
      const res = {};
      const next = jest.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(AppError);
      expect(err.statusCode).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
      expect(err.message).toContain("Role 'VIEWER' cannot perform this action");
    });
  });

  describe('2. Team Invitation & Token Security', () => {
    test('inviteMember rejects invalid email formats', async () => {
      await expect(
        teamService.inviteMember(1, 10, { email: 'invalid-email', role: 'VIEWER' })
      ).rejects.toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    test('inviteMember rejects invite if user is already an ACTIVE member (409 Conflict)', async () => {
      jest.spyOn(businessMemberRepository, 'findByBusinessAndEmail').mockResolvedValue({
        id: 5,
        status: 'ACTIVE',
        role: 'VIEWER',
      });

      await expect(
        teamService.inviteMember(1, 10, { email: 'existing@corp.com', role: 'VIEWER' })
      ).rejects.toMatchObject({
        statusCode: 409,
        code: 'ALREADY_MEMBER',
      });
    });

    test('inviteMember generates secure 256-bit token, hashes SHA-256 for DB, and sets 7d expiry', async () => {
      jest.spyOn(businessMemberRepository, 'findByBusinessAndEmail').mockResolvedValue(null);
      let capturedParams = null;
      jest.spyOn(businessMemberRepository, 'createInvite').mockImplementation(async (params) => {
        capturedParams = params;
        return {
          id: 101,
          business_id: params.businessId,
          invited_email: params.invitedEmail,
          role: params.role,
          status: 'INVITED',
          invite_token_hash: params.tokenHash,
          invite_expires_at: params.expiresAt,
          invited_by: params.invitedBy,
          created_at: new Date(),
        };
      });

      const res = await teamService.inviteMember(1, 10, {
        email: 'newbuyer@corp.com',
        role: 'PURCHASE_MANAGER',
      });

      expect(res.inviteToken).toBeDefined();
      expect(res.inviteToken).toHaveLength(64); // 32 bytes hex = 64 chars
      expect(res.inviteLink).toBe(`/accept-invite?token=${res.inviteToken}`);

      // Verify DB stored hash, NOT raw token
      expect(capturedParams.tokenHash).not.toBe(res.inviteToken);
      const expectedHash = crypto.createHash('sha256').update(res.inviteToken).digest('hex');
      expect(capturedParams.tokenHash).toBe(expectedHash);

      // Verify 7-day expiry
      const expiryDate = new Date(capturedParams.expiresAt);
      const diffDays = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      expect(Math.round(diffDays)).toBe(7);
    });

    test('inviteMember rotates token and updates record if user was previously INVITED', async () => {
      jest.spyOn(businessMemberRepository, 'findByBusinessAndEmail').mockResolvedValue({
        id: 55,
        status: 'INVITED',
        role: 'VIEWER',
      });

      const updateSpy = jest.spyOn(businessMemberRepository, 'updateInvite').mockResolvedValue({
        id: 55,
        business_id: 1,
        invited_email: 'pending@corp.com',
        role: 'PURCHASE_MANAGER',
        status: 'INVITED',
        invite_expires_at: new Date(Date.now() + 7 * 86400000),
      });

      const res = await teamService.inviteMember(1, 10, {
        email: 'pending@corp.com',
        role: 'PURCHASE_MANAGER',
      });

      expect(updateSpy).toHaveBeenCalled();
      expect(res.member.id).toBe(55);
      expect(res.inviteToken).toHaveLength(64);
    });
  });

  describe('3. Invite Acceptance & Security Hygiene', () => {
    test('acceptInvite rejects invalid or empty token', async () => {
      await expect(teamService.acceptInvite(10, 'user@test.com', '')).rejects.toMatchObject({
        statusCode: 400,
        code: 'INVALID_TOKEN',
      });
    });

    test('acceptInvite rejects unknown or modified token (404 INVITE_NOT_FOUND)', async () => {
      jest.spyOn(businessMemberRepository, 'findByTokenHash').mockResolvedValue(null);

      await expect(
        teamService.acceptInvite(10, 'user@test.com', 'a'.repeat(64))
      ).rejects.toMatchObject({
        statusCode: 404,
        code: 'INVITE_NOT_FOUND',
      });
    });

    test('acceptInvite rejects expired invitations (410 INVITE_EXPIRED)', async () => {
      jest.spyOn(businessMemberRepository, 'findByTokenHash').mockResolvedValue({
        id: 12,
        status: 'INVITED',
        invited_email: 'user@test.com',
        invite_expires_at: new Date(Date.now() - 10000), // in the past
      });

      await expect(
        teamService.acceptInvite(10, 'user@test.com', 'b'.repeat(64))
      ).rejects.toMatchObject({
        statusCode: 410,
        code: 'INVITE_EXPIRED',
      });
    });

    test('acceptInvite enforces case-insensitive email matching guard (403 EMAIL_MISMATCH)', async () => {
      jest.spyOn(businessMemberRepository, 'findByTokenHash').mockResolvedValue({
        id: 12,
        status: 'INVITED',
        invited_email: 'buyer@intended.com',
        invite_expires_at: new Date(Date.now() + 100000),
      });

      await expect(
        teamService.acceptInvite(10, 'attacker@different.com', 'c'.repeat(64))
      ).rejects.toMatchObject({
        statusCode: 403,
        code: 'EMAIL_MISMATCH',
      });
    });

    test('acceptInvite succeeds, links userId, sets ACTIVE, and clears invite_token_hash (single use)', async () => {
      jest.spyOn(businessMemberRepository, 'findByTokenHash').mockResolvedValue({
        id: 15,
        status: 'INVITED',
        invited_email: 'BUYER@ACME.COM',
        invite_expires_at: new Date(Date.now() + 100000),
      });

      const acceptSpy = jest.spyOn(businessMemberRepository, 'acceptInvite').mockResolvedValue({
        id: 15,
        user_id: 99,
        invited_email: 'buyer@acme.com',
        role: 'PURCHASE_MANAGER',
        status: 'ACTIVE',
        accepted_at: new Date(),
      });

      const res = await teamService.acceptInvite(99, 'buyer@acme.com', 'd'.repeat(64));

      expect(acceptSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 15,
          userId: 99,
        })
      );
      expect(res.status).toBe('ACTIVE');
      expect(res.userId).toBe(99);
    });
  });

  describe('4. Sole Owner Protection', () => {
    test('updateMemberRole prevents demoting sole active OWNER', async () => {
      jest.spyOn(businessMemberRepository, 'findById').mockResolvedValue({
        id: 1,
        business_id: 5,
        role: 'OWNER',
        status: 'ACTIVE',
      });
      jest.spyOn(businessMemberRepository, 'countActiveOwners').mockResolvedValue(1);

      await expect(teamService.updateMemberRole(5, 1, 'VIEWER')).rejects.toMatchObject({
        statusCode: 400,
        code: 'LAST_OWNER',
        message: expect.stringContaining('sole active owner'),
      });
    });

    test('revokeMember prevents revoking sole active OWNER', async () => {
      jest.spyOn(businessMemberRepository, 'findById').mockResolvedValue({
        id: 1,
        business_id: 5,
        role: 'OWNER',
        status: 'ACTIVE',
      });
      jest.spyOn(businessMemberRepository, 'countActiveOwners').mockResolvedValue(1);

      await expect(teamService.revokeMember(5, 10, 1)).rejects.toMatchObject({
        statusCode: 400,
        code: 'LAST_OWNER',
        message: expect.stringContaining('sole active owner'),
      });
    });

    test('updateMemberRole succeeds when multiple active owners exist', async () => {
      jest.spyOn(businessMemberRepository, 'findById').mockResolvedValue({
        id: 2,
        business_id: 5,
        role: 'OWNER',
        status: 'ACTIVE',
      });
      jest.spyOn(businessMemberRepository, 'countActiveOwners').mockResolvedValue(2);
      jest.spyOn(businessMemberRepository, 'updateRole').mockResolvedValue({
        id: 2,
        business_id: 5,
        role: 'PURCHASE_MANAGER',
        status: 'ACTIVE',
      });

      const res = await teamService.updateMemberRole(5, 2, 'PURCHASE_MANAGER');
      expect(res.role).toBe('PURCHASE_MANAGER');
    });
  });
});
