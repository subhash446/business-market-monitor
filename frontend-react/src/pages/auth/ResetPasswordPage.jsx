/**
 * ResetPasswordPage — Set New Password
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/reset-password.html + frontend/js/pages/reset-password.js
 *
 * Behavior (preserved exactly from original):
 *  1. Redirect already-authenticated users (mirrors redirectIfAuthenticated())
 *  2. Extract ?token= from URL on mount (useSearchParams)
 *     - If absent/empty → show invalid-link state, do NOT render form
 *     - If present → show password form
 *     - Token kept ONLY in memory — never placed in visible DOM (security)
 *  3. Validate newPassword client-side (same rule as register):
 *     ≥8 chars + at least 1 letter (/[A-Za-z]/) + at least 1 digit (/[0-9]/)
 *  4. POST /auth/password-reset/confirm { token, newPassword }
 *  5. On success: hide form, show success state with login link
 *  6. On 401: show "invalid or expired link" error with /forgot-password link
 *  7. On 400 newPassword field: show field error
 *  8. On 400 token field: show expired-link error
 *
 * SECURITY:
 *   - Token never placed in any visible DOM element or logged
 *   - Token read from URL; stored only in component state (memory)
 *   - No eval(), no unsafe operations
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { confirmPasswordReset } from '../../api/auth.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import '../../styles/pages/auth.css';

export function ResetPasswordPage() {
  const { isAuthenticated, hasBusinessProfile } = useAuth();
  const [params]  = useSearchParams();

  // Extract token from URL — stored in state (memory only, never rendered)
  const resetToken = (params.get('token') ?? '').trim();

  const [password,  setPassword]  = useState('');
  const [passErr,   setPassErr]   = useState('');
  const [formError, setFormError] = useState('');
  const [expiredLink, setExpiredLink] = useState(false); // true → show 401 error with retry link
  const [saving,    setSaving]    = useState(false);
  const [succeeded, setSucceeded] = useState(false);

  const passwordRef   = useRef(null);
  const invalidRef    = useRef(null);
  const successRef    = useRef(null);
  const expiredRef    = useRef(null);

  // Focus invalid-link state if no token (mirrors focusEl(invalidState))
  useEffect(() => {
    if (!isAuthenticated && !resetToken) {
      invalidRef.current?.focus();
    } else if (!isAuthenticated && resetToken) {
      passwordRef.current?.focus();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus success/expired regions when they appear
  useEffect(() => { if (succeeded)    successRef.current?.focus(); }, [succeeded]);
  useEffect(() => { if (expiredLink)  expiredRef.current?.focus(); }, [expiredLink]);

  /* ------------------------------------------------------------------
   * Guard: redirect already-authenticated users
   * ------------------------------------------------------------------ */
  if (isAuthenticated) {
    return <Navigate to={hasBusinessProfile ? '/dashboard' : '/onboarding'} replace />;
  }

  /* ── Password strength rule (mirrors backend auth.validator.js) ── */
  function isValidPassword(pw) {
    return pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
  }

  /* ── Real-time error clearing ──────────────────────────────────── */
  function clearErrors() {
    setPassErr('');
    setFormError('');
  }

  /* ── Submit ──────────────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!resetToken) return; // safety guard — shouldn't be reachable

    setPassErr('');
    setFormError('');
    setExpiredLink(false);

    if (!isValidPassword(password)) {
      setPassErr('Password must be at least 8 characters and include a letter and a number.');
      passwordRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      // POST /api/v1/auth/password-reset/confirm
      // Token in body — never in a DOM element or log
      await confirmPasswordReset(resetToken, password);
      setSucceeded(true);
    } catch (err) {
      setSaving(false);
      _handleError(err, setPassErr, setFormError, setExpiredLink, passwordRef);
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

          {/* ── Invalid-link state (no ?token= in URL) ─────────────── */}
          {!resetToken && (
            <div
              ref={invalidRef}
              id="rp-invalid-state"
              className="error-state"
              role="alert"
              tabIndex={-1}
            >
              <div className="error-state__icon">
                <i className="fa-solid fa-circle-xmark" aria-hidden="true" />
              </div>
              <h2 className="error-state__title">Invalid Reset Link</h2>
              <p className="error-state__message">
                This reset link is missing or malformed. Please request a new one.
              </p>
              <div className="error-state__action">
                <Link to="/forgot-password" className="btn btn--primary">Request New Link</Link>
              </div>
            </div>
          )}

          {/* ── Form area (token is present) ───────────────────────── */}
          {resetToken && !succeeded && (
            <div id="rp-form-area">

              <div className="auth-card__header">
                <h1 className="auth-card__title">Set a New Password</h1>
              </div>

              {/* Form-level error (network, generic) */}
              {formError && (
                <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span className="form-alert__message">{formError}</span>
                </div>
              )}

              {/* Expired / invalid token error (401) */}
              {expiredLink && (
                <div
                  ref={expiredRef}
                  className="form-alert form-alert--error form-alert--visible"
                  role="alert"
                  aria-live="assertive"
                  tabIndex={-1}
                >
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span className="form-alert__message">
                    This reset link is invalid or has expired.{' '}
                    <Link to="/forgot-password" className="fp-retry-link">Request a new link.</Link>
                  </span>
                </div>
              )}

              <form id="rp-form" onSubmit={handleSubmit} noValidate autoComplete="off">

                {/* New Password */}
                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="rp-password">
                    New password
                  </label>
                  <input
                    ref={passwordRef}
                    type="password"
                    id="rp-password"
                    name="newPassword"
                    className={`form-control${passErr ? ' form-control--error' : ''}`}
                    placeholder="New password"
                    autoComplete="new-password"
                    required
                    aria-required="true"
                    aria-describedby="rp-password-hint rp-password-error"
                    value={password}
                    onChange={e => { setPassword(e.target.value); clearErrors(); }}
                  />
                  {/* Password hint — always visible (Doc 4 §2.4) */}
                  <p className="form-hint" id="rp-password-hint">
                    Min. 8 characters &middot; at least one letter and one number
                  </p>
                  {passErr && (
                    <p id="rp-password-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                      {passErr}
                    </p>
                  )}
                </div>

                <div className="auth-form__actions">
                  <button
                    type="submit"
                    className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                    disabled={saving}
                  >
                    Update Password
                  </button>
                </div>

              </form>
            </div>
          )}

          {/* ── Success state ───────────────────────────────────────── */}
          {succeeded && (
            <div
              ref={successRef}
              id="rp-success"
              className="success-message"
              role="status"
              aria-live="polite"
              tabIndex={-1}
            >
              <div className="success-message__icon">
                <i className="fa-solid fa-circle-check" aria-hidden="true" />
              </div>
              <h2 className="success-message__title">Password Updated</h2>
              <p className="success-message__body">Your password has been changed successfully.</p>
              <Link to="/login" className="btn btn--primary btn--full mt-4">Sign In</Link>
            </div>
          )}

        </div>

        <p className="auth-footer">&copy; 2026 Business Market Monitor</p>

      </main>
    </div>
  );
}

/* ── Error handler (Doc 4 §2.4) ─────────────────────────────────── */
function _handleError(err, setPassErr, setFormError, setExpiredLink, passwordRef) {
  if (!err?.status) {
    setFormError('Could not connect to the server. Check your connection.');
    return;
  }
  switch (err.status) {
    case 401:
      // Invalid, expired, or already-consumed token
      setExpiredLink(true);
      break;
    case 400:
      if (err.details && Array.isArray(err.details)) {
        const passDetail  = err.details.find(d => d.field === 'newPassword');
        const tokenDetail = err.details.find(d => d.field === 'token');
        if (passDetail) {
          setPassErr('Password must be at least 8 characters and include a letter and a number.');
          passwordRef.current?.focus();
          return;
        }
        if (tokenDetail) {
          setExpiredLink(true);
          return;
        }
      }
      setFormError(err.message || 'Please check your input and try again.');
      break;
    default:
      setFormError('Something went wrong. Please try again.');
  }
}
