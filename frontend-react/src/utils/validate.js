/**
 * Client-side form validation helpers
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/js/utils/validate.js (Vanilla JS v1.0)
 * No changes — all functions are pure with no DOM or storage dependencies.
 *
 * Doc 3 §2, Doc 4 §10.3 — js/utils/validate.js
 * All validators return { valid: boolean, message?: string }.
 * Mirrors backend validator constraints (Doc 5) for UX — server is still the authority.
 *
 * React usage note: call these functions inside form submit handlers or
 * onChange handlers. Store errors in component state; render them as JSX.
 * The runValidation() runner works identically — pass field validator
 * functions, receive { valid, errors } — no DOM required.
 */

/**
 * @typedef {{ valid: boolean, message?: string }} ValidationResult
 */

/* ----------------------------------------------------------------
 * PRIMITIVE VALIDATORS
 * ---------------------------------------------------------------- */

/**
 * Required — non-empty string or truthy value.
 * @param {*} value
 * @param {string} [label='This field']
 * @returns {ValidationResult}
 */
export function required(value, label = 'This field') {
  const str = typeof value === 'string' ? value.trim() : String(value ?? '').trim();
  if (!str) return { valid: false, message: `${label} is required.` };
  return { valid: true };
}

/**
 * Email format validation.
 * @param {string} value
 * @returns {ValidationResult}
 */
export function isEmail(value) {
  const trimmed = (value ?? '').trim();
  if (!trimmed) return { valid: false, message: 'Email address is required.' };
  // RFC-5322 simplified pattern
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRe.test(trimmed)) {
    return { valid: false, message: 'Please enter a valid email address.' };
  }
  return { valid: true };
}

/**
 * Minimum string length.
 * @param {string} value
 * @param {number} min
 * @param {string} [label='This field']
 * @returns {ValidationResult}
 */
export function minLength(value, min, label = 'This field') {
  const str = (value ?? '').trim();
  if (str.length < min) {
    return { valid: false, message: `${label} must be at least ${min} characters.` };
  }
  return { valid: true };
}

/**
 * Maximum string length.
 * @param {string} value
 * @param {number} max
 * @param {string} [label='This field']
 * @returns {ValidationResult}
 */
export function maxLength(value, max, label = 'This field') {
  const str = (value ?? '').trim();
  if (str.length > max) {
    return { valid: false, message: `${label} must be at most ${max} characters.` };
  }
  return { valid: true };
}

/* ----------------------------------------------------------------
 * PASSWORD VALIDATORS
 * ---------------------------------------------------------------- */

/**
 * Password strength rules (mirrors backend validator).
 * Min 8 chars — suitable for most users.
 * @param {string} value
 * @returns {ValidationResult}
 */
export function isStrongPassword(value) {
  const pass = value ?? '';
  if (!pass) return { valid: false, message: 'Password is required.' };
  if (pass.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(pass)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[a-z]/.test(pass)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter.' };
  }
  if (!/\d/.test(pass)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  return { valid: true };
}

/**
 * Password confirmation match check.
 * @param {string} password
 * @param {string} confirmPassword
 * @returns {ValidationResult}
 */
export function passwordsMatch(password, confirmPassword) {
  if (password !== confirmPassword) {
    return { valid: false, message: 'Passwords do not match.' };
  }
  return { valid: true };
}

/**
 * Get a password strength score (0–3) for the strength indicator.
 * @param {string} value
 * @returns {{ score: number, label: 'weak'|'medium'|'strong' }}
 */
export function getPasswordStrength(value) {
  if (!value || value.length < 4) return { score: 0, label: 'weak' };
  let score = 0;
  if (value.length >= 8)   score++;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
  if (/\d/.test(value) || /[^a-zA-Z0-9]/.test(value)) score++;

  const label = score <= 1 ? 'weak' : score === 2 ? 'medium' : 'strong';
  return { score, label };
}

/* ----------------------------------------------------------------
 * NUMERIC VALIDATORS
 * ---------------------------------------------------------------- */

/**
 * Validate that a price value is a positive number (> 0).
 * Doc 3 §5.6, Doc 4 — price entry validation.
 * @param {string|number} value
 * @returns {ValidationResult}
 */
export function isPositivePrice(value) {
  const num = parseFloat(value);
  if (!value && value !== 0) return { valid: false, message: 'Price is required.' };
  if (isNaN(num)) return { valid: false, message: 'Price must be a valid number.' };
  if (num <= 0) return { valid: false, message: 'Price must be greater than 0.' };
  return { valid: true };
}

/**
 * Validate that a date string is not in the future.
 * Doc 3 §5.6 — price recordedAt validation.
 * @param {string} dateStr — ISO date string or date input value
 * @returns {ValidationResult}
 */
export function isNotFutureDate(dateStr) {
  if (!dateStr) return { valid: false, message: 'Date is required.' };
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return { valid: false, message: 'Please enter a valid date.' };
  const now = new Date();
  // Allow up to end of today
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  if (date > endOfToday) {
    return { valid: false, message: 'Date cannot be in the future.' };
  }
  return { valid: true };
}

/* ----------------------------------------------------------------
 * MULTI-FIELD FORM VALIDATION RUNNER
 * ---------------------------------------------------------------- */

/**
 * Run a map of field validators and collect errors.
 * Returns { valid: boolean, errors: { [field]: string } }.
 *
 * React usage: call in form submit handler; spread errors into
 * component state; render field errors as JSX conditionally.
 *
 * @param {Object.<string, () => ValidationResult>} rules
 *   — key: field name, value: function returning ValidationResult
 * @returns {{ valid: boolean, errors: Object.<string, string> }}
 *
 * @example
 * const { valid, errors } = runValidation({
 *   email:    () => isEmail(formData.email),
 *   password: () => isStrongPassword(formData.password),
 * });
 */
export function runValidation(rules) {
  const errors = {};
  for (const [field, validator] of Object.entries(rules)) {
    const result = validator();
    if (!result.valid) {
      errors[field] = result.message ?? `${field} is invalid.`;
    }
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

/* ----------------------------------------------------------------
 * ID / SELECTOR VALIDATION
 * ---------------------------------------------------------------- */

/**
 * Check if a value is a valid positive integer ID.
 * @param {*} value
 * @returns {boolean}
 */
export function isValidId(value) {
  const n = parseInt(value, 10);
  return Number.isInteger(n) && n > 0;
}
