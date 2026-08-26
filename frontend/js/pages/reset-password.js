/**
 * Reset Password page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §4.4, §5.2 — pages/reset-password.html
 * Doc 4 §2.4
 *
 * Flow:
 *  1. Extract ?token= from URL on page load.
 *  2. If absent/empty → show invalid-link state immediately, do not render form.
 *  3. If present → show form.
 *  4. On submit: validate newPassword client-side.
 *  5. POST /auth/password-reset/confirm { token, newPassword }
 *  6. On success: hide form, show success state with login link.
 *  7. On 401: show "invalid or expired link" error + link to forgot-password.
 *
 * SECURITY:
 *  - Token read from URL; never logged, never displayed, never placed in
 *    any visible DOM element.
 *  - No eval().
 *  - No unsafe innerHTML.
 *
 * API: POST /api/v1/auth/password-reset/confirm
 *  Body: { token, newPassword }
 *  200: { message: 'Password updated' }
 *  401: AUTHENTICATION_ERROR — invalid/expired/consumed token
 *  400: VALIDATION_ERROR — token missing, or newPassword too weak
 */

import { redirectIfAuthenticated } from '/js/auth/auth.js';
import { confirmPasswordReset }    from '/js/api/auth.api.js';
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
  getParam,
  focusEl,
  setText,
} from '/js/utils/dom.js';

// ── Guard: redirect already-authenticated users ────────────────────────────────
redirectIfAuthenticated();

// ── Element references ────────────────────────────────────────────────────────
const invalidState   = byId('rp-invalid-state');
const formArea       = byId('rp-form-area');
const form           = byId('rp-form');
const passwordInput  = byId('rp-password');
const passwordError  = byId('rp-password-error');
const formError      = byId('rp-form-error');
const formErrorMsg   = formError?.querySelector('.form-alert__message') ?? null;
const submitBtn      = byId('rp-submit-btn');
const successEl      = byId('rp-success');

// ── 1. Extract token from URL ─────────────────────────────────────────────────
// Token is read once and kept only in memory — never placed in the DOM.
const resetToken = getParam('token');

// ── 2. No token → show invalid-link state ────────────────────────────────────
if (!resetToken || !resetToken.trim()) {
  if (formArea)    hide(formArea);
  if (invalidState) {
    show(invalidState);
    focusEl(invalidState);
  }
} else {
  // ── 3. Token present → show form ─────────────────────────────────────────
  if (invalidState) hide(invalidState);
  if (formArea)     show(formArea);
}

// ── Real-time validation clearing ─────────────────────────────────────────────
passwordInput?.addEventListener('input', () => {
  clearFieldError(passwordInput, passwordError);
  hideFormAlert(formError);
});

// ── Form submit ───────────────────────────────────────────────────────────────
form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  if (!resetToken) return; // Safety guard — shouldn't be reachable

  clearFieldError(passwordInput, passwordError);
  hideFormAlert(formError);

  const newPassword = passwordInput?.value ?? '';

  // ── Client-side validation (matches backend auth.validator.js isStrongPassword) ──
  // ≥8 chars + at least 1 letter + at least 1 digit
  const isValid =
    newPassword.length >= 8 &&
    /[A-Za-z]/.test(newPassword) &&
    /[0-9]/.test(newPassword);

  if (!isValid) {
    showFieldError(
      passwordInput,
      passwordError,
      'Password must be at least 8 characters and include a letter and a number.'
    );
    passwordInput?.focus();
    return;
  }

  startLoading(submitBtn);

  try {
    // POST /api/v1/auth/password-reset/confirm
    // Token is passed in the request body — never in a DOM element or log
    await confirmPasswordReset(resetToken, newPassword);

    // Success: hide form, show success message
    _showSuccess();

  } catch (err) {
    stopLoading(submitBtn);
    _handleError(err);
  }
});

// ── Show success state ────────────────────────────────────────────────────────
function _showSuccess() {
  if (formArea)   hide(formArea);
  if (successEl) {
    show(successEl);
    focusEl(successEl);
  }
}

// ── Error handler (Doc 4 §2.4) ────────────────────────────────────────────────
function _handleError(err) {
  if (!err.status) {
    showFormAlert(formError, 'Could not connect to the server. Check your connection.');
    return;
  }

  switch (err.status) {
    case 401:
      // Invalid, expired, or already-consumed token (auth.service.js line 147)
      // Show error with a link to request a new one (Doc 4 §2.4)
      _showExpiredLinkError();
      break;

    case 400:
      // VALIDATION_ERROR — token missing (shouldn't happen) or password too weak
      if (err.details && Array.isArray(err.details)) {
        const passDetail  = err.details.find((d) => d.field === 'newPassword');
        const tokenDetail = err.details.find((d) => d.field === 'token');
        if (passDetail) {
          showFieldError(
            passwordInput,
            passwordError,
            'Password must be at least 8 characters and include a letter and a number.'
          );
          passwordInput?.focus();
          return;
        }
        if (tokenDetail) {
          _showExpiredLinkError();
          return;
        }
      }
      showFormAlert(formError, err.message || 'Please check your input and try again.');
      break;

    default:
      showFormAlert(formError, 'Something went wrong. Please try again.');
  }
}

/**
 * Show the "link invalid or expired" error message with a link to
 * forgot-password (Doc 4 §2.4 — 401 error state).
 * Uses textContent + a separate anchor element — no innerHTML.
 */
function _showExpiredLinkError() {
  if (!formError) return;
  show(formError);

  // Use the .form-alert__message span for the text part
  const msgEl = formError.querySelector('.form-alert__message');
  if (msgEl) {
    setText(msgEl, 'This reset link is invalid or has expired. ');
  }

  // Append a link to request a new one if not already present
  if (!formError.querySelector('.fp-retry-link')) {
    const link = document.createElement('a');
    link.className = 'fp-retry-link';
    link.href      = '/pages/forgot-password.html';
    link.textContent = 'Request a new link.';
    // Append to the message element or the alert container
    if (msgEl) {
      msgEl.appendChild(link);
    } else {
      formError.appendChild(link);
    }
  }
}
