/**
 * LoginPage — Sign In page
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/login.html + frontend/js/pages/login.js
 *
 * Behavior (preserved exactly from original):
 *  1. Redirect already-authenticated users (mirrors redirectIfAuthenticated())
 *     - has business → /dashboard; no business → /onboarding
 *  2. Show session-expired banner when ?reason=session_expired in URL
 *  3. Validate email + password client-side on submit
 *  4. POST /auth/login via loginUser()
 *  5. On success: AuthContext.login() stores tokens → navigate based on businessId
 *  6. Error handling per Doc 4 §2.1 (401/400/429/network)
 *  7. Real-time field error clearing on input change
 *
 * IMPORTANT — Hooks rules:
 *   All hooks must be called unconditionally. The authenticated-user guard is
 *   expressed as a conditional <Navigate> *inside* the JSX return, NOT before hooks.
 *
 * CSS: auth.css classes — auth-layout, auth-container, auth-card, etc.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { loginUser } from '../../api/auth.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { hasBusinessProfile } from '../../auth/auth.js';
import { isEmail, required } from '../../utils/validate.js';
import '../../styles/pages/auth.css';

export function LoginPage() {
  const { isAuthenticated, hasBusinessProfile: contextHasBiz, login } = useAuth();
  const navigate           = useNavigate();
  const [params]           = useSearchParams();
  const sessionExpired     = params.get('reason') === 'session_expired';

  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [errors,    setErrors]    = useState({});
  const [formError, setFormError] = useState('');
  const [saving,    setSaving]    = useState(false);
  const emailRef = useRef(null);

  // Focus email field on mount
  useEffect(() => {
    if (!isAuthenticated) emailRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------------
   * Guard: redirect already-authenticated users
   * Expressed in JSX so hooks remain unconditional above.
   * ------------------------------------------------------------------ */
  if (isAuthenticated) {
    return <Navigate to={contextHasBiz ? '/dashboard' : '/onboarding'} replace />;
  }

  /* ── Real-time error clearing ──────────────────────────────────── */
  function clearField(field) {
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    setFormError('');
  }

  /* ── Submit ──────────────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');

    const trimEmail = email.trim();
    const newErrors = {};

    const emailCheck = isEmail(trimEmail);
    if (!emailCheck.valid) newErrors.email = 'Please enter a valid email address.';

    const passCheck = required(password, 'Password');
    if (!passCheck.valid) newErrors.password = 'Please enter your password.';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      emailRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const data = await loginUser({ email: trimEmail, password });
      // Persist tokens + update React state (storage writes happen inside login())
      login(data.accessToken, data.refreshToken);
      // Read hasBusinessProfile from localStorage (just updated by login())
      if (hasBusinessProfile()) {
        navigate('/dashboard', { replace: true });
      } else {
        navigate('/onboarding', { replace: true });
      }
    } catch (err) {
      setSaving(false);
      _handleLoginError(err, setErrors, setFormError);
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

        {/* Login Card */}
        <div className="auth-card" role="main">

          <div className="auth-card__header">
            <h1 className="auth-card__title">Sign In</h1>
          </div>

          {/* Session-expired banner (?reason=session_expired) */}
          {sessionExpired && (
            <div className="alert-banner alert-banner--warning" role="alert" aria-live="polite">
              <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
              <span className="alert-banner__message">
                Your session has expired. Please sign in again.
              </span>
            </div>
          )}

          {/* Form-level error (401, 429, network) */}
          {formError && (
            <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span className="form-alert__message">{formError}</span>
            </div>
          )}

          {/* Login Form */}
          <form id="login-form" onSubmit={handleSubmit} noValidate autoComplete="on">

            {/* Email */}
            <div className="form-group">
              <label className="form-label form-label--required" htmlFor="login-email">
                Email address
              </label>
              <input
                ref={emailRef}
                type="email"
                id="login-email"
                name="email"
                className={`form-control${errors.email ? ' form-control--error' : ''}`}
                placeholder="your@email.com"
                autoComplete="email"
                inputMode="email"
                required
                aria-required="true"
                aria-describedby="login-email-error"
                value={email}
                onChange={e => { setEmail(e.target.value); clearField('email'); }}
              />
              {errors.email && (
                <p id="login-email-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label form-label--required" htmlFor="login-password">
                Password
              </label>
              <input
                type="password"
                id="login-password"
                name="password"
                className={`form-control${errors.password ? ' form-control--error' : ''}`}
                placeholder="Your password"
                autoComplete="current-password"
                required
                aria-required="true"
                aria-describedby="login-password-error"
                value={password}
                onChange={e => { setPassword(e.target.value); clearField('password'); }}
              />
              {errors.password && (
                <p id="login-password-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Forgot password link */}
            <div className="mt-3 text-right">
              <Link to="/forgot-password" className="text-sm">Forgot your password?</Link>
            </div>

            {/* Submit */}
            <div className="auth-form__actions">
              <button
                type="submit"
                className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                disabled={saving}
              >
                Sign In
              </button>
            </div>

          </form>

          {/* Divider */}
          <div className="auth-divider mt-6">or</div>

          {/* Register link */}
          <div className="auth-card__footer">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium">Create one</Link>
          </div>

        </div>

        <p className="auth-footer">&copy; 2026 Business Market Monitor</p>

      </main>
    </div>
  );
}

/* ── Error handler (Doc 4 §2.1 error states) ─────────────────────── */
function _handleLoginError(err, setErrors, setFormError) {
  if (!err?.status) {
    setFormError('Could not connect to the server. Check your connection.');
    return;
  }
  switch (err.status) {
    case 401:
      // Never reveal which field was wrong (backend design)
      setFormError('Invalid email or password.');
      break;
    case 400:
      if (err.details && Array.isArray(err.details)) {
        const fe = {};
        err.details.forEach(d => {
          if (d.field === 'email')    fe.email    = 'Please enter a valid email address.';
          if (d.field === 'password') fe.password = 'Please enter your password.';
        });
        setErrors(fe);
      } else {
        setFormError(err.message || 'Please check your details and try again.');
      }
      break;
    case 429:
      setFormError('Too many login attempts. Please wait before trying again.');
      break;
    default:
      setFormError('Something went wrong. Please try again.');
  }
}
