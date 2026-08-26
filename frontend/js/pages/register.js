/**
 * Registration page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §4.4, §5.2 — pages/register.html
 * Doc 4 §2.2
 *
 * Responsibilities:
 *  1. Redirect authenticated users away immediately (Doc 3 §4.4)
 *  2. Validate fullName + email + password client-side
 *  3. POST /auth/register → 201 { id, email, fullName } (no tokens)
 *  4. Auto-login: POST /auth/login with same credentials (Doc 4 §2.2)
 *  5. setTokens() → redirect to /pages/onboarding.html
 *  6. Error handling per Doc 4 §2.2 error states
 *
 * BACKEND PASSWORD RULE (auth.validator.js line 21-27):
 *  min 8 chars + at least 1 letter (/[A-Za-z]/) + at least 1 digit (/[0-9]/)
 *  NOTE: The backend does NOT require uppercase — client-side validation here
 *  mirrors the BACKEND rule exactly, not the stricter validate.js isStrongPassword().
 */

import { redirectIfAuthenticated, setTokens } from '/js/auth/auth.js';
import { registerUser, loginUser } from '/js/api/auth.api.js';
import { isEmail } from '/js/utils/validate.js';
import {
  byId,
  showFieldError,
  clearFieldError,
  showFormAlert,
  hideFormAlert,
  startLoading,
  stopLoading,
} from '/js/utils/dom.js';

// ── 1. Guard: redirect authenticated users away ───────────────────────────────
redirectIfAuthenticated();

// ── 2. Element references ─────────────────────────────────────────────────────
const form            = byId('reg-form');
const fullNameInput   = byId('reg-fullname');
const emailInput      = byId('reg-email');
const passwordInput   = byId('reg-password');
const fullNameError   = byId('reg-fullname-error');
const emailError      = byId('reg-email-error');
const passwordError   = byId('reg-password-error');
const formError       = byId('reg-form-error');
const submitBtn       = byId('reg-submit-btn');

// ── 3. Real-time error clearing ───────────────────────────────────────────────
fullNameInput?.addEventListener('input', () => {
  clearFieldError(fullNameInput, fullNameError);
  hideFormAlert(formError);
});

emailInput?.addEventListener('input', () => {
  clearFieldError(emailInput, emailError);
  hideFormAlert(formError);
});

passwordInput?.addEventListener('input', () => {
  clearFieldError(passwordInput, passwordError);
  hideFormAlert(formError);
});

// ── 4. Form submit ────────────────────────────────────────────────────────────
form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Clear previous errors
  clearFieldError(fullNameInput, fullNameError);
  clearFieldError(emailInput, emailError);
  clearFieldError(passwordInput, passwordError);
  hideFormAlert(formError);

  const fullName = fullNameInput?.value.trim() ?? '';
  const email    = emailInput?.value.trim()    ?? '';
  const password = passwordInput?.value        ?? '';

  // ── Client-side validation (mirrors backend auth.validator.js exactly) ──
  let hasError = false;
  let firstInvalidEl = null;

  // fullName: required (Doc 4 §2.2 says 2–100 chars client side)
  if (!fullName) {
    showFieldError(fullNameInput, fullNameError, 'Please enter your full name.');
    if (!firstInvalidEl) firstInvalidEl = fullNameInput;
    hasError = true;
  } else if (fullName.length < 2) {
    showFieldError(fullNameInput, fullNameError, 'Please enter your full name.');
    if (!firstInvalidEl) firstInvalidEl = fullNameInput;
    hasError = true;
  }

  const emailCheck = isEmail(email);
  if (!emailCheck.valid) {
    showFieldError(emailInput, emailError, 'Please enter a valid email address.');
    if (!firstInvalidEl) firstInvalidEl = emailInput;
    hasError = true;
  }

  // Password rule: ≥8 chars + at least 1 letter + at least 1 digit
  // (matches backend auth.validator.js isStrongPassword exactly)
  if (!password || password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    showFieldError(
      passwordInput,
      passwordError,
      'Password must be at least 8 characters and include a letter and a number.'
    );
    if (!firstInvalidEl) firstInvalidEl = passwordInput;
    hasError = true;
  }

  if (hasError) {
    firstInvalidEl?.focus();
    return;
  }

  // Start loading
  startLoading(submitBtn);

  try {
    // ── Step 1: POST /api/v1/auth/register ─────────────────────────────────
    // Response: { id, email, fullName } — 201, no tokens (confirmed from auth.service.js)
    await registerUser({ email, password, fullName });

    // ── Step 2: Auto-login (Doc 4 §2.2) ────────────────────────────────────
    // POST /api/v1/auth/login with same credentials to obtain tokens
    const tokens = await loginUser({ email, password });

    // ── Step 3: Store tokens and redirect to onboarding ────────────────────
    setTokens(tokens.accessToken, tokens.refreshToken);

    // New account always goes to onboarding — businessId will be null (no business yet)
    window.location.replace('/pages/onboarding.html');

  } catch (err) {
    stopLoading(submitBtn);
    _handleRegisterError(err);
  }
});

// ── Error handler (Doc 4 §2.2 error states) ───────────────────────────────────
function _handleRegisterError(err) {
  if (!err.status) {
    showFormAlert(formError, 'Could not connect to the server. Check your connection.');
    return;
  }

  switch (err.status) {
    case 409:
      // CONFLICT — email already registered
      showFormAlert(formError, 'An account with this email address already exists.');
      emailInput?.focus();
      break;

    case 400:
      // VALIDATION_ERROR — map to per-field errors from details array
      if (err.details && Array.isArray(err.details)) {
        let firstEl = null;
        err.details.forEach((d) => {
          if (d.field === 'email') {
            showFieldError(emailInput, emailError, 'Please enter a valid email address.');
            if (!firstEl) firstEl = emailInput;
          } else if (d.field === 'password') {
            showFieldError(
              passwordInput,
              passwordError,
              'Password must be at least 8 characters and include a letter and a number.'
            );
            if (!firstEl) firstEl = passwordInput;
          } else if (d.field === 'fullName') {
            showFieldError(fullNameInput, fullNameError, 'Please enter your full name.');
            if (!firstEl) firstEl = fullNameInput;
          }
        });
        firstEl?.focus();
      } else {
        showFormAlert(formError, err.message || 'Please check your details and try again.');
      }
      break;

    case 429:
      showFormAlert(formError, 'Too many attempts. Please wait before trying again.');
      break;

    default:
      showFormAlert(formError, 'Something went wrong. Please try again.');
  }
}
