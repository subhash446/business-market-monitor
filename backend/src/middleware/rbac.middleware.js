'use strict';

/**
 * Role-Based Access Control (RBAC) Middleware (V3-M5).
 *
 * Enforces permissions for:
 *   - 'OWNER': Full workspace administration, team management, business profile editing.
 *   - 'PURCHASE_MANAGER': Material, pricing, inventory, landed-cost, alert management, quote logging.
 *   - 'VIEWER': Read-only access across all views.
 */

const businessRepository = require('../repositories/business.repository');
const AppError = require('../utils/AppError');

/**
 * Resolves the authenticated user's workspace role and attaches it to req.auth.
 */
async function attachBusinessRole(req, res, next) {
  try {
    if (!req.auth || !req.auth.userId) {
      return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
    }

    if (req.auth.businessRole) {
      return next();
    }

    const business = await businessRepository.findByUserId(req.auth.userId);
    if (business) {
      req.auth.businessId = req.auth.businessId || business.id;
      req.auth.businessRole = business.businessRole || business.business_role || 'OWNER';
    } else {
      req.auth.businessRole = 'OWNER'; // creator fallback
    }
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Middleware factory enforcing minimum role requirements.
 * @param {...string} allowedRoles 'OWNER' | 'PURCHASE_MANAGER' | 'VIEWER'
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      if (!req.auth || !req.auth.userId) {
        return next(new AppError(401, 'UNAUTHORIZED', 'Authentication required'));
      }

      if (!req.auth.businessRole) {
        const business = await businessRepository.findByUserId(req.auth.userId);
        if (business) {
          req.auth.businessId = req.auth.businessId || business.id;
          req.auth.businessRole = business.businessRole || business.business_role || 'OWNER';
        } else {
          req.auth.businessRole = 'OWNER';
        }
      }

      if (!allowedRoles.includes(req.auth.businessRole)) {
        return next(
          new AppError(
            403,
            'FORBIDDEN',
            `Insufficient permissions. Role '${req.auth.businessRole}' cannot perform this action. Required: ${allowedRoles.join(', ')}.`
          )
        );
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = {
  attachBusinessRole,
  requireRole,
};
