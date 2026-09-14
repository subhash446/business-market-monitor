/**
 * RegisterPage — Create Account page
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/register.html + frontend/js/pages/register.js
 *
 * Behavior (preserved exactly from original):
 *  1. Redirect already-authenticated users (mirrors redirectIfAuthenticated())
 *  2. Validate fullName + email + password client-side
 *  3. POST /auth/register → { id, email, fullName }  ← 201, NO tokens
 *  4. Auto-login: POST /auth/login with same credentials (Doc 4 §2.2)
 *  5. setTokens via AuthContext.login() → navigate to /onboarding
 *     New accounts always → /onboarding (businessId will be null)
 *  6. Error handling per Doc 4 §2.2 (409/400/429/network)
 *  7. Real-time field error clearing on input change
 *
 * PASSWORD RULE (mirrors backend auth.validator.js exactly — NOT the stricter
 * validate.js isStrongPassword()):
 *   ≥ 8 chars + at least 1 letter (/[A-Za-z]/) + at least 1 digit (/[0-9]/)
 *   Uppercase is NOT required.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { registerUser, loginUser } from '../../api/auth.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { isEmail } from '../../utils/validate.js';
import '../../styles/pages/auth.css';

export function RegisterPage() {
  const { isAuthenticated, hasBusinessProfile, login } = useAuth();
  const navigate = useNavigate();

  const [fullName,  setFullName]  = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [errors,    setErrors]    = useState({});
  const [formError, setFormError] = useState('');
  const [saving,    setSaving]    = useState(false);
  const fullNameRef = useRef(null);

  // Focus first field on mount
  useEffect(() => {
    if (!isAuthenticated) fullNameRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------------
   * Guard: redirect already-authenticated users
   * ------------------------------------------------------------------ */
  if (isAuthenticated) {
    return <Navigate to={hasBusinessProfile ? '/dashboard' : '/onboarding'} replace />;
  }

  /* ── Real-time error clearing ──────────────────────────────────── */
  function clearField(field) {
    setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
    setFormError('');
  }

  /* ── Password strength rule (mirrors backend auth.validator.js) ── */
  function isValidPassword(pw) {
    return pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
  }

  /* ── Submit ──────────────────────────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');

    const trimName  = fullName.trim();
    const trimEmail = email.trim();
    const newErrors = {};
    let firstErrorField = null;

    // fullName: required, ≥2 chars (Doc 4 §2.2)
    if (!trimName || trimName.length < 2) {
      newErrors.fullName = 'Please enter your full name.';
      firstErrorField = firstErrorField ?? fullNameRef;
    }

    const emailCheck = isEmail(trimEmail);
    if (!emailCheck.valid) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (!isValidPassword(password)) {
      newErrors.password = 'Password must be at least 8 characters and include a letter and a number.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      firstErrorField?.current?.focus();
      return;
    }

    setSaving(true);
    try {
      // Step 1: POST /auth/register → 201 { id, email, fullName } — no tokens
      await registerUser({ email: trimEmail, password, fullName: trimName });

      // Step 2: Auto-login (Doc 4 §2.2) — POST /auth/login with same credentials
      const tokens = await loginUser({ email: trimEmail, password });

      // Step 3: Store tokens + update React state
      login(tokens.accessToken, tokens.refreshToken);

      // New account always → onboarding (businessId will be null)
      navigate('/onboarding', { replace: true });

    } catch (err) {
      setSaving(false);
      _handleRegisterError(err, setErrors, setFormError);
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

        {/* Registration Card */}
        <div className="auth-card" role="main">

          <div className="auth-card__header">
            <h1 className="auth-card__title">Create Your Account</h1>
            <p className="auth-card__subtitle">Start monitoring your market in minutes.</p>
          </div>

          {/* Form-level error (409 conflict, 429, network) */}
          {formError && (
            <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span className="form-alert__message">{formError}</span>
            </div>
          )}

          {/* Registration Form */}
          <form id="reg-form" onSubmit={handleSubmit} noValidate autoComplete="on">

            {/* Full Name */}
            <div className="form-group">
              <label className="form-label form-label--required" htmlFor="reg-fullname">
                Full name
              </label>
              <input
                ref={fullNameRef}
                type="text"
                id="reg-fullname"
                name="fullName"
                className={`form-control${errors.fullName ? ' form-control--error' : ''}`}
                placeholder="Jane Smith"
                autoComplete="name"
                autoCapitalize="words"
                required
                aria-required="true"
                aria-describedby="reg-fullname-error"
                value={fullName}
                onChange={e => { setFullName(e.target.value); clearField('fullName'); }}
              />
              {errors.fullName && (
                <p id="reg-fullname-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                  {errors.fullName}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="form-group">
              <label className="form-label form-label--required" htmlFor="reg-email">
                Email address
              </label>
              <input
                type="email"
                id="reg-email"
                name="email"
                className={`form-control${errors.email ? ' form-control--error' : ''}`}
                placeholder="your@email.com"
                autoComplete="email"
                inputMode="email"
                required
                aria-required="true"
                aria-describedby="reg-email-error"
                value={email}
                onChange={e => { setEmail(e.target.value); clearField('email'); }}
              />
              {errors.email && (
                <p id="reg-email-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                  {errors.email}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="form-group">
              <label className="form-label form-label--required" htmlFor="reg-password">
                Password
              </label>
              <input
                type="password"
                id="reg-password"
                name="password"
                className={`form-control${errors.password ? ' form-control--error' : ''}`}
                placeholder="Create a password"
                autoComplete="new-password"
                required
                aria-required="true"
                aria-describedby="reg-password-hint reg-password-error"
                value={password}
                onChange={e => { setPassword(e.target.value); clearField('password'); }}
              />
              {/* Password hint — always visible (Doc 4 §2.2) */}
              <p className="form-hint" id="reg-password-hint">
                Min. 8 characters &middot; at least one letter and one number
              </p>
              {errors.password && (
                <p id="reg-password-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                  {errors.password}
                </p>
              )}
            </div>

            {/* Submit */}
            <div className="auth-form__actions">
              <button
                type="submit"
                className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                disabled={saving}
              >
                Create Account
              </button>
            </div>

          </form>

          {/* Sign-in link */}
          <div className="auth-card__footer">
            Already have an account?{' '}
            <Link to="/login" className="font-medium">Sign in</Link>
          </div>

        </div>

        <p className="auth-footer">&copy; 2026 Business Market Monitor</p>

      </main>
    </div>
  );
}

/* ── Error handler (Doc 4 §2.2 error states) ─────────────────────── */
function _handleRegisterError(err, setErrors, setFormError) {
  if (!err?.status) {
    setFormError('Could not connect to the server. Check your connection.');
    return;
  }
  switch (err.status) {
    case 409:
      // Email already registered
      setFormError('An account with this email address already exists.');
      break;
    case 400:
      if (err.details && Array.isArray(err.details)) {
        const fe = {};
        err.details.forEach(d => {
          if (d.field === 'email')    fe.email    = 'Please enter a valid email address.';
          if (d.field === 'password') fe.password = 'Password must be at least 8 characters and include a letter and a number.';
          if (d.field === 'fullName') fe.fullName = 'Please enter your full name.';
        });
        setErrors(fe);
      } else {
        setFormError(err.message || 'Please check your details and try again.');
      }
      break;
    case 429:
      setFormError('Too many attempts. Please wait before trying again.');
      break;
    default:
      setFormError('Something went wrong. Please try again.');
  }
}
