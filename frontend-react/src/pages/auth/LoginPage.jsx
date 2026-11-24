/**
 * LoginPage — Sign In page
 * Business Market Monitor — React frontend
 *
 * Upgraded in Migration 036:
 *  1. Business Market Monitor full branding header with BMM badge & link to /
 *  2. "Continue with Google" social login integration
 *  3. 6-digit passwordless Email OTP verification mode (with 45s resend cooldown)
 *  4. Preserves traditional email + password authentication mode
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { loginUser, requestEmailOtp, verifyEmailOtp } from '../../api/auth.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { hasBusinessProfile } from '../../auth/auth.js';
import { isEmail, required } from '../../utils/validate.js';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton.jsx';
import '../../styles/pages/auth.css';

export function LoginPage() {
  const { isAuthenticated, hasBusinessProfile: contextHasBiz, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionExpired = params.get('reason') === 'session_expired';

  // Mode: 'otp' | 'password'
  const [authMode, setAuthMode] = useState('otp');
  // OTP sub-step: 'request' | 'verify'
  const [otpStep, setOtpStep] = useState('request');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const emailRef = useRef(null);

  // Focus email field on mount
  useEffect(() => {
    if (!isAuthenticated) emailRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Resend cooldown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  /* ------------------------------------------------------------------
   * Guard: redirect already-authenticated users
   * ------------------------------------------------------------------ */
  if (isAuthenticated) {
    return <Navigate to={contextHasBiz ? '/dashboard' : '/onboarding'} replace />;
  }

  function handleAuthSuccess(tokens) {
    login(tokens.accessToken, tokens.refreshToken);
    if (hasBusinessProfile()) {
      navigate('/dashboard', { replace: true });
    } else {
      navigate('/onboarding', { replace: true });
    }
  }

  function clearField(field) {
    setErrors((prev) => {
      const n = { ...prev };
      delete n[field];
      return n;
    });
    setFormError('');
  }

  /* ── Password-based Login ────────────────────────────────────────── */
  async function handlePasswordSubmit(e) {
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
      handleAuthSuccess(data);
    } catch (err) {
      setSaving(false);
      _handleLoginError(err, setErrors, setFormError);
    }
  }

  /* ── OTP Request (Step 1) ────────────────────────────────────────── */
  async function handleRequestOtp(e) {
    if (e) e.preventDefault();
    setErrors({});
    setFormError('');

    const trimEmail = email.trim();
    const emailCheck = isEmail(trimEmail);
    if (!emailCheck.valid) {
      setErrors({ email: 'Please enter a valid email address.' });
      emailRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const res = await requestEmailOtp({ email: trimEmail, purpose: 'LOGIN_OTP' });
      setMaskedEmail(res.maskedEmail || trimEmail);
      setOtpStep('verify');
      setCountdown(res.cooldownSeconds || 45);
    } catch (err) {
      setFormError(err.message || 'Failed to dispatch verification code.');
    } finally {
      setSaving(false);
    }
  }

  /* ── OTP Verification (Step 2) ────────────────────────────────────── */
  async function handleVerifyOtp(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setFormError('Please enter the 6-digit verification code.');
      return;
    }

    setSaving(true);
    try {
      const tokens = await verifyEmailOtp({
        email: email.trim(),
        otp: cleanOtp,
        purpose: 'LOGIN_OTP',
      });
      handleAuthSuccess(tokens);
    } catch (err) {
      setSaving(false);
      setFormError(err.message || 'Invalid or expired verification code.');
    }
  }

  return (
    <div className="auth-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main id="main-content" className="auth-container">
        {/* Brand */}
        <Link to="/" className="auth-brand auth-brand-link" aria-label="Business Market Monitor Home">
          <div className="auth-logo-mark" aria-hidden="true">
            <i className="fa-solid fa-chart-column" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="auth-brand__name">Business Market Monitor</span>
            <span className="auth-brand__badge">BMM</span>
          </div>
        </Link>

        {/* Login Card */}
        <div className="auth-card" role="main">
          <div className="auth-card__header">
            <h1 className="auth-card__title">Sign In</h1>
            <p className="auth-card__subtitle" style={{ fontSize: '13px', color: '#a1a1aa', margin: '4px 0 0 0' }}>
              Procurement intelligence and benchmark tracking
            </p>
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

          {/* Form-level error */}
          {formError && (
            <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span className="form-alert__message">{formError}</span>
            </div>
          )}

          {/* Continue with Google */}
          <GoogleSignInButton onSuccess={handleAuthSuccess} onError={setFormError} />

          <div className="auth-divider" style={{ margin: 'var(--space-4) 0' }}>
            <span>or continue with email</span>
          </div>

          {/* Mode Switcher */}
          <div className="auth-mode-toggle" role="tablist" aria-label="Sign-in method">
            <button
              type="button"
              role="tab"
              id="login-tab-otp"
              aria-selected={authMode === 'otp'}
              className={`auth-mode-btn${authMode === 'otp' ? ' auth-mode-btn--active' : ''}`}
              onClick={() => {
                setAuthMode('otp');
                setOtpStep('request');
                setErrors({});
                setFormError('');
              }}
            >
              Email OTP (Passwordless)
            </button>
            <button
              type="button"
              role="tab"
              id="login-tab-password"
              aria-selected={authMode === 'password'}
              className={`auth-mode-btn${authMode === 'password' ? ' auth-mode-btn--active' : ''}`}
              onClick={() => {
                setAuthMode('password');
                setErrors({});
                setFormError('');
              }}
            >
              Password
            </button>
          </div>

          {/* 1. Email OTP Flow */}
          {authMode === 'otp' && (
            <div>
              {otpStep === 'request' ? (
                <form id="otp-request-form" onSubmit={handleRequestOtp} noValidate>
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
                      placeholder="your@company.com"
                      autoComplete="email"
                      inputMode="email"
                      required
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearField('email');
                      }}
                    />
                    {errors.email && (
                      <p className="form-error form-error--visible" role="alert">
                        {errors.email}
                      </p>
                    )}
                  </div>

                  <div className="auth-form__actions">
                    <button
                      type="submit"
                      id="send-login-otp-btn"
                      className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                      disabled={saving}
                    >
                      Send Login OTP
                    </button>
                  </div>
                </form>
              ) : (
                <form id="otp-verify-form" onSubmit={handleVerifyOtp} noValidate>
                  <p style={{ fontSize: '13px', color: '#a1a1aa', marginBottom: '12px' }}>
                    We sent a 6-digit code to <strong>{maskedEmail || email}</strong>.
                  </p>

                  <div className="otp-input-container">
                    <label className="form-label form-label--required" htmlFor="login-otp-input">
                      6-Digit Verification Code
                    </label>
                    <input
                      type="text"
                      id="login-otp-input"
                      className="otp-digit-input"
                      placeholder="······"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otp}
                      onChange={(e) => {
                        setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setFormError('');
                      }}
                      autoFocus
                    />
                  </div>

                  <div className="otp-resend-row">
                    <button
                      type="button"
                      className="btn btn--link text-xs"
                      onClick={() => {
                        setOtpStep('request');
                        setOtp('');
                        setFormError('');
                      }}
                      style={{ padding: 0, color: '#60a5fa' }}
                    >
                      Change email
                    </button>

                    {countdown > 0 ? (
                      <span className="otp-countdown-text">Resend code in {countdown}s</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn--link text-xs"
                        onClick={handleRequestOtp}
                        disabled={saving}
                        style={{ padding: 0, color: '#60a5fa' }}
                      >
                        Resend code
                      </button>
                    )}
                  </div>

                  <div className="auth-form__actions">
                    <button
                      type="submit"
                      id="verify-login-otp-btn"
                      className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                      disabled={saving || otp.length !== 6}
                    >
                      Verify &amp; Sign In
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* 2. Password Login Flow */}
          {authMode === 'password' && (
            <form id="login-form" onSubmit={handlePasswordSubmit} noValidate autoComplete="on">
              <div className="form-group">
                <label className="form-label form-label--required" htmlFor="login-email-pwd">
                  Email address
                </label>
                <input
                  type="email"
                  id="login-email-pwd"
                  name="email"
                  className={`form-control${errors.email ? ' form-control--error' : ''}`}
                  placeholder="your@company.com"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearField('email');
                  }}
                />
                {errors.email && (
                  <p className="form-error form-error--visible" role="alert">
                    {errors.email}
                  </p>
                )}
              </div>

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
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearField('password');
                  }}
                />
                {errors.password && (
                  <p className="form-error form-error--visible" role="alert">
                    {errors.password}
                  </p>
                )}
              </div>

              <div className="mt-3 text-right">
                <Link to="/forgot-password" className="text-sm">
                  Forgot your password?
                </Link>
              </div>

              <div className="auth-form__actions">
                <button
                  type="submit"
                  id="login-password-submit-btn"
                  className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                  disabled={saving}
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          <div className="auth-divider mt-6">or</div>

          {/* Register link */}
          <div className="auth-card__footer">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="font-medium">
              Create one
            </Link>
          </div>
        </div>

        <p className="auth-footer">&copy; 2026 Business Market Monitor</p>
      </main>
    </div>
  );
}

function _handleLoginError(err, setErrors, setFormError) {
  if (!err?.status) {
    setFormError('Could not connect to the server. Check your connection.');
    return;
  }
  switch (err.status) {
    case 401:
      setFormError('Invalid email or password.');
      break;
    case 400:
      if (err.details && Array.isArray(err.details)) {
        const fe = {};
        err.details.forEach((d) => {
          if (d.field === 'email') fe.email = 'Please enter a valid email address.';
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
