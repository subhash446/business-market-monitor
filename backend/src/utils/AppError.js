/**
 * Custom error hierarchy (Document 3 §12). Thrown from services/repositories,
 * caught once by middleware/errorHandler.middleware.js.
 */
class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

module.exports = AppError;
