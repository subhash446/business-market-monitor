/**
 * ForgotPasswordPage — Request Password Reset
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/forgot-password.html + frontend/js/pages/forgot-password.js
 *
 * Behavior (preserved exactly from original):
 *  1. Redirect already-authenticated users (mirrors redirectIfAuthenticated())
 *  2. Validate email client-side
 *  3. POST /auth/password-reset/request via requestPasswordReset(email)
 *  4. On success (2xx): show generic success state, hide form
 *     SECURITY: Same success shown for any email — prevents enumeration (Doc 4 §2.3)
 *  5. On unhandled errors (5xx etc.): ALSO show success state (anti-enumeration)
 *  6. Only 400 (invalid email) and 429 (rate-limit) show actual errors
 *  7. Real-time field error clearing on input change
 *
 * SECURITY NOTE: The success message is always shown after any API call
 * EXCEPT for 400 (email format error) and 429 (rate-limit).
 * This matches the backend design that always returns 200 for this endpoint.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { requestPasswordReset } from '../../api/auth.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { isEmail } from '../../utils/validate.js';
import '../../styles/pages/auth.css';

export function ForgotPasswordPage() {
  const { isAuthenticated, hasBusinessProfile } = useAuth();

  const [email,     setEmail]     = useState('');
  const [emailErr,  setEmailErr]  = useState('');
  const [formError, setFormError] = useState('');
  const [saving,    setSaving]    = useState(false);
  const [succeeded, setSucceeded] = useState(false); // true → show success state, hide form
  const emailRef   = useRef(null);
  const successRef = useRef(null);

  // Focus email field on mount
  useEffect(() => {
    if (!isAuthenticated) emailRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus success region on reveal (mirrors focusEl(successEl))
  useEffect(() => {
    if (succeeded) successRef.current?.focus();
  }, [succeeded]);

  /* ------------------------------------------------------------------
   * Guard: redirect already-authenticated users
   * ------------------------------------------------------------------ */
  if (isAuthenticated) {
    return <Navigate to={hasBusinessProfile ? '/dashboard' : '/onboarding'} replace />;
  }

  /* ── Real-time error clearing ──────────────────────────────────── */
  function clearErrors() {
    setEmailErr('');
    setFormError('');
  }

  /* ── Show success state (anti-enumeration — same message always) ── */
  function showSuccess() {
    setSucceeded(true);
  }

  /* ── Submit ──────────────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setEmailErr('');
    setFormError('');

    const trimEmail = email.trim();

    const emailCheck = isEmail(trimEmail);
    if (!emailCheck.valid) {
      setEmailErr('Please enter a valid email address.');
      emailRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      // POST /api/v1/auth/password-reset/request
      // Backend always returns 200 regardless of email existence.
      await requestPasswordReset(trimEmail);
      showSuccess();
    } catch (err) {
      setSaving(false);
      _handleError(err, setEmailErr, setFormError, emailRef, showSuccess);
    }
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="auth-layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <main id="main-content" className="auth-container">

        {/* Brand */}
        <div className="auth-brand">
          <div className="auth-logo-mark" aria-hidden="true">
            <i className="fa-solid fa-chart-column" />
          </div>
          <span className="auth-brand__name">Market Monitor</span>
        </div>

        {/* Card */}
        <div className="auth-card">

          <div className="auth-card__header">
            <h1 className="auth-card__title">Reset Your Password</h1>
            <p className="auth-card__subtitle">
              Enter your email address and we&apos;ll send you a reset link if your account exists.
            </p>
          </div>

          {/* Form-level error (400 validation, 429 rate-limit only) */}
          {formError && (
            <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span className="form-alert__message">{formError}</span>
            </div>
          )}

          {/* Form area — hidden on success */}
          {!succeeded && (
            <div id="fp-form-area">
              <form id="fp-form" onSubmit={handleSubmit} noValidate autoComplete="on">

                {/* Email */}
                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="fp-email">
                    Email address
                  </label>
                  <input
                    ref={emailRef}
                    type="email"
                    id="fp-email"
                    name="email"
                    className={`form-control${emailErr ? ' form-control--error' : ''}`}
                    placeholder="your@email.com"
                    autoComplete="email"
                    inputMode="email"
                    required
                    aria-required="true"
                    aria-describedby="fp-email-error"
                    value={email}
                    onChange={e => { setEmail(e.target.value); clearErrors(); }}
                  />
                  {emailErr && (
                    <p id="fp-email-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                      {emailErr}
                    </p>
                  )}
                </div>

                <div className="auth-form__actions">
                  <button
                    type="submit"
                    className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                    disabled={saving}
                  >
                    Send Reset Link
                  </button>
                </div>

              </form>
            </div>
          )}

          {/* Success state — shown after API call (anti-enumeration: same for any email) */}
          {succeeded && (
            <div
              ref={successRef}
              id="fp-success"
              className="success-message"
              role="status"
              aria-live="polite"
              tabIndex={-1}
            >
              <div className="success-message__icon">
                <i className="fa-solid fa-circle-check" aria-hidden="true" />
              </div>
              <p>If that email is registered, a reset link has been sent.</p>
              <Link to="/login" className="btn btn--ghost btn--full mt-4">
                Back to Sign In
              </Link>
            </div>
          )}

          {/* Back to login (always visible) */}
          <div className="auth-card__footer">
            <Link to="/login">
              <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              {' '}Back to Sign In
            </Link>
          </div>

        </div>

        <p className="auth-footer">&copy; 2026 Business Market Monitor</p>

      </main>
    </div>
  );
}

/* ── Error handler (Doc 4 §2.3) ─────────────────────────────────── */
function _handleError(err, setEmailErr, setFormError, emailRef, showSuccess) {
  if (!err?.status) {
    setFormError('Could not connect to the server. Check your connection.');
    return;
  }
  switch (err.status) {
    case 400:
      if (err.details && Array.isArray(err.details)) {
        const emailDetail = err.details.find(d => d.field === 'email');
        if (emailDetail) {
          setEmailErr('Please enter a valid email address.');
          emailRef.current?.focus();
          return;
        }
      }
      setFormError(err.message || 'Please check your email address.');
      break;
    case 429:
      setFormError('Too many attempts. Please wait before trying again.');
      break;
    default:
      // Any other error (5xx etc.) — show success anyway to prevent
      // timing/response-code-based email enumeration (Doc 4 §2.3 note)
      showSuccess();
  }
}
