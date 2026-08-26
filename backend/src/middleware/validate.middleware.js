/**
 * Runs a validator function against req.body (default) or req.query,
 * responds 400 VALIDATION_ERROR with field-level details on failure
 * (Document 5 §3.3, §6).
 *
 * Production Hardening Phase B, finding A3: extended with an optional
 * `source` parameter so query-string validators (Historical Trends,
 * Document 5 §4.10) can reuse this same middleware instead of a second,
 * duplicate implementation. Defaults to 'body' — every existing call site
 * (`validate(fn)`, no second argument) is unaffected.
 */
const AppError = require('../utils/AppError');

function validate(validatorFn, source = 'body') {
  return (req, res, next) => {
    const target = source === 'query' ? (req.query || {}) : (req.body || {});
    const errors = validatorFn(target);
    if (errors.length > 0) {
      return next(new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', errors));
    }
    next();
  };
}

module.exports = validate;
