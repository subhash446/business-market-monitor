/**
 * JWT verification (Document 5 §2, §2.3, §2.4). Verifies the Bearer access
 * token, attaches { userId, businessId, email } to req.auth, rejects with
 * 401 AUTHENTICATION_ERROR if missing/invalid/expired.
 *
 * Applied to every protected route already wired in Phase 1 — this replaces
 * the Phase 1 no-op passthrough. Real enforcement starts now.
 */
const { verifyAccessToken } = require('../utils/jwt');
const AppError = require('../utils/AppError');

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError(401, 'AUTHENTICATION_ERROR', 'Missing or invalid Authorization header'));
  }

  try {
    const payload = verifyAccessToken(token);
    req.auth = {
      userId: payload.sub,
      email: payload.email,
      businessId: payload.businessId, // null until Business Profile phase populates it
    };
    next();
  } catch (err) {
    next(new AppError(401, 'AUTHENTICATION_ERROR', 'Invalid or expired token'));
  }
}

module.exports = authMiddleware;
