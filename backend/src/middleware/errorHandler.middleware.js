/**
 * Centralized error handler (Document 3 §12, Document 5 §6).
 * Every route/middleware error must flow here via next(err) — no controller
 * formats its own error response.
 */
const AppError = require('../utils/AppError');
const { sendError } = require('../utils/response');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return sendError(res, err.statusCode, err.code, err.message, err.details);
  }

  // Unexpected error — full detail logged server-side only, never returned to the client.
  logger.error('[unhandled error]', err.stack || err.message || err);
  return sendError(res, 500, 'INTERNAL_ERROR', 'Something went wrong.');
}

module.exports = errorHandler;
