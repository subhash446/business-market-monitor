'use strict';

/**
 * Team Management Controller (V3-M5).
 *
 * Handles workspace member listings, team invitations, invite acceptance,
 * role changes, and member revocation.
 */

const teamService = require('../services/team.service');
const userRepository = require('../repositories/user.repository');
const resolveBusinessId = require('../utils/resolveBusinessId');
const { sendSuccess } = require('../utils/response');

async function listMembers(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const members = await teamService.listMembers(businessId);
    sendSuccess(res, { members });
  } catch (err) {
    next(err);
  }
}

async function inviteMember(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { email, role } = req.body || {};
    const result = await teamService.inviteMember(businessId, req.auth.userId, { email, role });
    sendSuccess(res, result, 'Invitation issued successfully', 201);
  } catch (err) {
    next(err);
  }
}

async function acceptInvite(req, res, next) {
  try {
    const { token } = req.body || {};
    let email = req.auth?.email;
    if (!email && req.auth?.userId) {
      const user = await userRepository.findById(req.auth.userId);
      email = user?.email;
    }
    const member = await teamService.acceptInvite(req.auth.userId, email, token);
    sendSuccess(res, { member }, 'Invitation accepted successfully');
  } catch (err) {
    next(err);
  }
}

async function updateMemberRole(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { memberId } = req.params;
    const { role } = req.body || {};
    const updated = await teamService.updateMemberRole(businessId, Number(memberId), role);
    sendSuccess(res, { member: updated }, 'Member role updated successfully');
  } catch (err) {
    next(err);
  }
}

async function revokeMember(req, res, next) {
  try {
    const businessId = await resolveBusinessId(req.auth);
    const { memberId } = req.params;
    const updated = await teamService.revokeMember(businessId, req.auth.userId, Number(memberId));
    sendSuccess(res, { member: updated }, 'Member access revoked successfully');
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listMembers,
  inviteMember,
  acceptInvite,
  updateMemberRole,
  revokeMember,
};
