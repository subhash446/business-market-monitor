'use strict';

/**
 * Team & Workspace Member Routes (V3-M5).
 *
 * Implements RBAC-protected endpoints for listing members, sending invites,
 * accepting invites, modifying member roles, and revoking memberships.
 */

const express = require('express');
const router = express.Router();
const teamController = require('../controllers/team.controller');
const authMiddleware = require('../middleware/auth.middleware');
const { attachBusinessRole, requireRole } = require('../middleware/rbac.middleware');

// Public to authenticated members of workspace
router.get('/', authMiddleware, attachBusinessRole, teamController.listMembers);

// Accept invite (any authenticated user with a valid invite token)
router.post('/accept-invite', authMiddleware, teamController.acceptInvite);

// Workspace owner-only administration
router.post('/invite', authMiddleware, attachBusinessRole, requireRole('OWNER'), teamController.inviteMember);
router.patch('/members/:memberId/role', authMiddleware, attachBusinessRole, requireRole('OWNER'), teamController.updateMemberRole);
router.delete('/members/:memberId', authMiddleware, attachBusinessRole, requireRole('OWNER'), teamController.revokeMember);

module.exports = router;
