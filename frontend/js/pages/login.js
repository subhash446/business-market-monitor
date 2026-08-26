/**
 * Login page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §4.4, §5.2 — pages/login.html
 * Doc 4 §2.1
 *
 * Responsibilities:
 *  1. Redirect authenticated users away immediately (Doc 3 §4.4)
 *  2. Show session-expired banner if ?reason=session_expired in URL
 *  3. Validate email + password client-side
 *  4. POST /auth/login
 *  5. On success: setTokens → redirect to dashboard or onboarding
 *  6. On error: display correct inline error per Doc 4 §2.1
 */

import { redirectIfAuthenticated, setTokens, hasBusinessProfile } from '/js/auth/auth.js';
import { loginUser } from '/js/api/auth.api.js';
import { isEmail, required } from '/js/utils/validate.js';
import {
  byId,
  show,
  hide,
  setText,
  showFieldError,
  clearFieldError,
  showFormAlert,
  hideFormAlert,
  getParam,
  startLoading,
  stopLoading,
} from '/js/utils/dom.js';

// ── 1. Guard: redirect authenticated users away (Doc 3 §4.4) ─────────────────
redirectIfAuthenticated();

// ── 2. Element references ─────────────────────────────────────────────────────
const form           = byId('login-form');
const emailInput     = byId('login-email');
const passwordInput  = byId('login-password');
const emailError     = byId('login-email-error');
const passwordError  = byId('login-password-error');
const formError      = byId('login-form-error');
const submitBtn      = byId('login-submit-btn');
const sessionBanner  = byId('session-expired-banner');

// ── 3. Session-expired banner ─────────────────────────────────────────────────
if (getParam('reason') === 'session_expired' && sessionBanner) {
  show(sessionBanner);
}

// ── 4. Real-time field error clearing ─────────────────────────────────────────
emailInput?.addEventListener('input', () => {
  clearFieldError(emailInput, emailError);
  hideFormAlert(formError);
});

passwordInput?.addEventListener('input', () => {
  clearFieldError(passwordInput, passwordError);
  hideFormAlert(formError);
});

// ── 5. Form submit ────────────────────────────────────────────────────────────
form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Clear previous errors
  clearFieldError(emailInput, emailError);
  clearFieldError(passwordInput, passwordError);
  hideFormAlert(formError);

  const email    = emailInput?.value.trim()    ?? '';
  const password = passwordInput?.value        ?? '';

  // Client-side validation (Doc 4 §2.1)
  let hasError = false;

  const emailCheck = isEmail(email);
  if (!emailCheck.valid) {
    showFieldError(emailInput, emailError, emailCheck.message);
    hasError = true;
  }

  const passCheck = required(password, 'Password');
  if (!passCheck.valid) {
    showFieldError(passwordInput, passwordError, 'Please enter your password.');
    hasError = true;
  }

  if (hasError) {
    emailInput?.focus();
    return;
  }

  // Start loading
  startLoading(submitBtn);

  try {
    // POST /api/v1/auth/login
    const data = await loginUser({ email, password });

    // Store tokens (Doc 3 §4.1)
    setTokens(data.accessToken, data.refreshToken);

    // Redirect: business profile present → dashboard, else → onboarding
    if (hasBusinessProfile()) {
      window.location.replace('/pages/dashboard.html');
    } else {
      window.location.replace('/pages/onboarding.html');
    }
  } catch (err) {
    stopLoading(submitBtn);
    _handleLoginError(err);
  }
});

// ── Error handler (Doc 4 §2.1 error states) ───────────────────────────────────
function _handleLoginError(err) {
  if (!err.status) {
    // Network error (status 0)
    showFormAlert(formError, 'Could not connect to the server. Check your connection.');
    return;
  }

  switch (err.status) {
    case 401:
      // AUTHENTICATION_ERROR — never reveal which field was wrong (backend design)
      showFormAlert(formError, 'Invalid email or password.');
      break;

    case 400:
      // VALIDATION_ERROR — per-field from backend details array
      if (err.details && Array.isArray(err.details)) {
        err.details.forEach((d) => {
          if (d.field === 'email') {
            showFieldError(emailInput, emailError, 'Please enter a valid email address.');
          } else if (d.field === 'password') {
            showFieldError(passwordInput, passwordError, 'Please enter your password.');
          }
        });
      } else {
        showFormAlert(formError, err.message || 'Please check your details and try again.');
      }
      break;

    case 429:
      showFormAlert(formError, 'Too many login attempts. Please wait before trying again.');
      break;

    default:
      showFormAlert(formError, 'Something went wrong. Please try again.');
  }
}
