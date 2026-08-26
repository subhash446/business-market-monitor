/**
 * Forgot Password page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §4.4, §5.2 — pages/forgot-password.html
 * Doc 4 §2.3
 *
 * SECURITY: This page never reveals whether a submitted email belongs to
 * an existing account. The same success message is shown for any 2xx
 * response. Only 429 (rate-limit) and network errors deviate from the
 * generic success display.
 *
 * API: POST /api/v1/auth/password-reset/request
 *  Body: { email }
 *  Backend always returns 200 with a generic message regardless of whether
 *  the email exists (prevents email enumeration — auth.service.js line 105-109).
 */

import { redirectIfAuthenticated } from '/js/auth/auth.js';
import { requestPasswordReset }    from '/js/api/auth.api.js';
import { isEmail }                 from '/js/utils/validate.js';
import {
  byId,
  show,
  hide,
  showFieldError,
  clearFieldError,
  showFormAlert,
  hideFormAlert,
  startLoading,
  stopLoading,
  focusEl,
} from '/js/utils/dom.js';

// ── Guard: redirect authenticated users ───────────────────────────────────────
redirectIfAuthenticated();

// ── Element references ────────────────────────────────────────────────────────
const form       = byId('fp-form');
const emailInput = byId('fp-email');
const emailError = byId('fp-email-error');
const formError  = byId('fp-form-error');
const submitBtn  = byId('fp-submit-btn');
const successEl  = byId('fp-success');
const formArea   = byId('fp-form-area');

// ── Real-time validation clearing ─────────────────────────────────────────────
emailInput?.addEventListener('input', () => {
  clearFieldError(emailInput, emailError);
  hideFormAlert(formError);
});

// ── Form submit ───────────────────────────────────────────────────────────────
form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  clearFieldError(emailInput, emailError);
  hideFormAlert(formError);

  const email = emailInput?.value.trim() ?? '';

  // Client-side validation
  const emailCheck = isEmail(email);
  if (!emailCheck.valid) {
    showFieldError(emailInput, emailError, 'Please enter a valid email address.');
    emailInput?.focus();
    return;
  }

  startLoading(submitBtn);

  try {
    // POST /api/v1/auth/password-reset/request
    // Backend always returns 200 regardless of email existence (no enumeration).
    await requestPasswordReset(email);

    // Success — show generic message, hide form
    // (SAME message shown even if email doesn't exist — Doc 4 §2.3, backend design)
    _showSuccess();

  } catch (err) {
    stopLoading(submitBtn);
    _handleError(err);
  }
});

// ── Show generic success state ─────────────────────────────────────────────────
// SECURITY: this function is called regardless of whether the API confirms
// the email exists. Do NOT branch on any email-existence indicator.
function _showSuccess() {
  if (formArea)   hide(formArea);
  if (successEl) {
    show(successEl);
    focusEl(successEl);
  }
}

// ── Error handler (Doc 4 §2.3) ─────────────────────────────────────────────────
function _handleError(err) {
  if (!err.status) {
    showFormAlert(formError, 'Could not connect to the server. Check your connection.');
    return;
  }

  switch (err.status) {
    case 400:
      // VALIDATION_ERROR — only email format errors can arrive here
      if (err.details && Array.isArray(err.details)) {
        const emailDetail = err.details.find((d) => d.field === 'email');
        if (emailDetail) {
          showFieldError(emailInput, emailError, 'Please enter a valid email address.');
          emailInput?.focus();
          return;
        }
      }
      showFormAlert(formError, err.message || 'Please check your email address.');
      break;

    case 429:
      showFormAlert(formError, 'Too many attempts. Please wait before trying again.');
      break;

    default:
      // Any other error (5xx, etc.) — show generic success anyway to prevent
      // timing-based or response-code-based email enumeration (Doc 4 §2.3 note)
      _showSuccess();
  }
}
