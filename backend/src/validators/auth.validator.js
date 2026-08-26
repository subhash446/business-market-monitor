/**
 * Request body validation for the Authentication module (Document 5 §3.3,
 * §4.1; Document 2 FR-AUTH-01–06).
 *
 * Hand-rolled, dependency-free validation — sufficient for this module's
 * scope (a handful of simple fields) without adding a schema-validation
 * library. Document 5 §3.3 left the library choice open for implementation;
 * this keeps Phase 2 minimal. Revisit if a later module's validation needs
 * outgrow this (e.g., nested/conditional shapes).
 */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Production Hardening Phase B, finding C2: exported so other validators
// (business.validator.js's optional contactEmail) can reuse the exact same
// email format check instead of a second, duplicate regex.
function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_REGEX.test(value);
}

// FR-AUTH-02: minimum password strength policy.
function isStrongPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

// Production Hardening Phase B, finding C3: matches users.full_name
// VARCHAR(150) (Document 4 §5.1) — rejected here before it ever reaches
// the DB, same pattern material.validator.js already used for customName.
const MAX_FULL_NAME_LENGTH = 150;

function validateRegister(body) {
  const errors = [];
  if (!body.email || !isValidEmail(body.email)) {
    errors.push({ field: 'email', issue: 'must be a valid email address' });
  }
  if (!isStrongPassword(body.password)) {
    errors.push({ field: 'password', issue: 'must be at least 8 characters and include a letter and a number' });
  }
  if (!body.fullName || !String(body.fullName).trim()) {
    errors.push({ field: 'fullName', issue: 'is required' });
  } else if (String(body.fullName).trim().length > MAX_FULL_NAME_LENGTH) {
    errors.push({ field: 'fullName', issue: `must be at most ${MAX_FULL_NAME_LENGTH} characters` });
  }
  return errors;
}

function validateLogin(body) {
  const errors = [];
  if (!body.email) errors.push({ field: 'email', issue: 'is required' });
  if (!body.password) errors.push({ field: 'password', issue: 'is required' });
  return errors;
}

function validateRefresh(body) {
  const errors = [];
  if (!body.refreshToken) errors.push({ field: 'refreshToken', issue: 'is required' });
  return errors;
}

// FR-AUTH-07. Only shape/format is checked here, consistent with this
// project's established validator/service split (e.g. business.validator.js
// checks industryId is a number; business.service.js checks it exists) —
// whether the email corresponds to a real account is a service-layer
// concern (and deliberately not distinguished in the response either way,
// to prevent email enumeration).
function validateRequestPasswordReset(body) {
  const errors = [];
  if (!body.email || !isValidEmail(body.email)) {
    errors.push({ field: 'email', issue: 'must be a valid email address' });
  }
  return errors;
}

// FR-AUTH-07. "token must match an unconsumed, unexpired user_tokens row"
// (Document 5 §4.1) requires a DB lookup — a service-layer concern, not
// checked here; this only validates shape, reusing the exact same password
// strength policy as registration (FR-AUTH-02).
function validateConfirmPasswordReset(body) {
  const errors = [];
  if (!body.token || !String(body.token).trim()) {
    errors.push({ field: 'token', issue: 'is required' });
  }
  if (!isStrongPassword(body.newPassword)) {
    errors.push({ field: 'newPassword', issue: 'must be at least 8 characters and include a letter and a number' });
  }
  return errors;
}

module.exports = {
  validateRegister,
  validateLogin,
  validateRefresh,
  validateRequestPasswordReset,
  validateConfirmPasswordReset,
  isValidEmail,
};
