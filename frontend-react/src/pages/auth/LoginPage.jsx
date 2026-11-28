/**
 * LoginPage — Sign In page
 * Business Market Monitor — React frontend
 *
 * Returning-user-first UX:
 *  - Clean wordmark header linking to / (no BMM badge)
 *  - Full-width aligned "Continue with Google" button
 *  - Single hairline divider ("or sign in with email")
 *  - Default Email + Password form (Forgot password? inline + Show/Hide eye toggle)
 *  - Low-friction secondary link to toggle Email OTP passwordless flow
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { loginUser, requestEmailOtp, verifyEmailOtp } from '../../api/auth.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { hasBusinessProfile } from '../../auth/auth.js';
import { isEmail, required } from '../../utils/validate.js';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton.jsx';
import { PasswordInput } from '../../components/auth/PasswordInput.jsx';
import { OtpInput } from '../../components/auth/OtpInput.jsx';
import '../../styles/pages/auth.css';

export function LoginPage() {
  const { isAuthenticated, hasBusinessProfile: contextHasBiz, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const sessionExpired = params.get('reason') === 'session_expired';

  const rawRedirect = params.get('redirect') || location.state?.redirect || location.state?.from?.pathname || '';
  const safeRedirect = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : '';

  // Default to returning-user Email + Password flow; optional 'otp' toggle via text link
  const [authMode, setAuthMode] = useState('password');
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

  if (isAuthenticated) {
    if (safeRedirect) {
      return <Navigate to={safeRedirect} replace />;
    }
    return <Navigate to={contextHasBiz ? '/dashboard' : '/onboarding'} replace />;
  }

  function handleAuthSuccess(tokens) {
    login(tokens.accessToken, tokens.refreshToken);
    if (safeRedirect) {
      navigate(safeRedirect, { replace: true });
    } else if (hasBusinessProfile()) {
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
      setFormError(err.message || 'Failed to send verification code.');
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

  const registerHref = safeRedirect
    ? `/register?redirect=${encodeURIComponent(safeRedirect)}`
    : '/register';

  return (
    <div className="auth-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main id="main-content" className="auth-container">
        {/* Clean Brand Wordmark */}
        <Link to="/" className="auth-brand auth-brand-link" aria-label="AI Market Intelligence Agent Home">
          <div className="auth-logo-mark" aria-hidden="true">
            <i className="fa-solid fa-chart-column" />
          </div>
          <span className="auth-brand__name">AI Market Intelligence Agent</span>
        </Link>

        {/* Login Card */}
        <div className="auth-card" role="main">
          <div className="auth-card__header">
            <h1 className="auth-card__title">Sign In</h1>
            <p className="auth-card__subtitle">
              Procurement intelligence and benchmark tracking
            </p>
          </div>

          {sessionExpired && (
            <div className="alert-banner alert-banner--warning" role="alert" aria-live="polite">
              <i className="fa-solid fa-clock-rotate-left" aria-hidden="true" />
              <span className="alert-banner__message">
                Your session has expired. Please sign in again.
              </span>
            </div>
          )}

          {formError && (
            <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span className="form-alert__message">{formError}</span>
            </div>
          )}

          {/* Full-width Continue with Google */}
          <GoogleSignInButton onSuccess={handleAuthSuccess} onError={setFormError} />

          <div className="auth-divider">
            <span>or sign in with email</span>
          </div>

          {/* 1. Default Password Login Flow */}
          {authMode === 'password' && (
            <div>
              <form id="login-form" onSubmit={handlePasswordSubmit} noValidate autoComplete="on">
                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="login-email-pwd">
                    Email address
                  </label>
                  <input
                    ref={emailRef}
                    type="email"
                    id="login-email-pwd"
                    name="email"
                    className={`form-control${errors.email ? ' form-control--error' : ''}`}
                    placeholder="name@company.com"
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
                  <div className="form-label-row">
                    <label className="form-label form-label--required" htmlFor="login-password">
                      Password
                    </label>
                    <Link to="/forgot-password" className="auth-inline-link">
                      Forgot password?
                    </Link>
                  </div>
                  <PasswordInput
                    id="login-password"
                    name="password"
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    required
                    hasError={Boolean(errors.password)}
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

              <div className="auth-mode-switch-row">
                <button
                  type="button"
                  id="switch-to-otp-btn"
                  className="auth-text-switch-btn"
                  onClick={() => {
                    setAuthMode('otp');
                    setOtpStep('request');
                    setErrors({});
                    setFormError('');
                  }}
                >
                  Prefer a one-time code? <span>Sign in with Email OTP</span>
                </button>
              </div>
            </div>
          )}

          {/* 2. Secondary Passwordless Email OTP Flow */}
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
                      placeholder="name@company.com"
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
                      Send One-Time Code
                    </button>
                  </div>
                </form>
              ) : (
                <form id="otp-verify-form" onSubmit={handleVerifyOtp} noValidate>
                  <div className="otp-email-context">
                    <span>
                      We sent a 6-digit code to <strong>{maskedEmail || email}</strong>
                    </span>
                    <button
                      type="button"
                      className="otp-change-btn"
                      onClick={() => {
                        setOtpStep('request');
                        setOtp('');
                        setFormError('');
                      }}
                    >
                      Change email
                    </button>
                  </div>

                  <div className="otp-section">
                    <label className="form-label form-label--required" htmlFor="login-otp-input">
                      6-digit code
                    </label>
                    <OtpInput
                      id="login-otp-input"
                      value={otp}
                      onChange={(val) => {
                        setOtp(val);
                        setFormError('');
                      }}
                      autoFocus
                      disabled={saving}
                      hasError={Boolean(formError)}
                    />

                    <div className="otp-resend-row">
                      <span className="otp-countdown-text">
                        {countdown > 0 ? `Resend code in ${countdown}s` : 'Didn’t receive it?'}
                      </span>
                      {countdown === 0 && (
                        <button
                          type="button"
                          className="otp-resend-btn"
                          onClick={handleRequestOtp}
                          disabled={saving}
                        >
                          Resend code
                        </button>
                      )}
                    </div>
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

              <div className="auth-mode-switch-row">
                <button
                  type="button"
                  id="switch-to-password-btn"
                  className="auth-text-switch-btn"
                  onClick={() => {
                    setAuthMode('password');
                    setOtpStep('request');
                    setOtp('');
                    setErrors({});
                    setFormError('');
                  }}
                >
                  <span>Back to password sign-in</span>
                </button>
              </div>
            </div>
          )}

          {/* Register link (no redundant 'or' divider) */}
          <div className="auth-card__footer">
            Don&apos;t have an account?{' '}
            <Link to={registerHref}>Create one</Link>
          </div>
        </div>

        <p className="auth-footer">&copy; 2026 AI Market Intelligence Agent</p>
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
