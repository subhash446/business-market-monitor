/**
 * RegisterPage — Create Account page
 * Business Market Monitor — React frontend
 *
 * Upgraded in Migration 036:
 *  1. Full Business Market Monitor brand header with BMM badge & link back to /
 *  2. "Continue with Google" 1-click social onboarding
 *  3. 6-digit Email OTP verification step before entering /onboarding
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { registerUser, loginUser, verifyEmailOtp, requestEmailOtp } from '../../api/auth.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { hasBusinessProfile } from '../../auth/auth.js';
import { isEmail } from '../../utils/validate.js';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton.jsx';
import '../../styles/pages/auth.css';

export function RegisterPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();

  // Step: 'form' | 'verify'
  const [step, setStep] = useState('form');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const fullNameRef = useRef(null);

  // Focus first field on mount
  useEffect(() => {
    if (!isAuthenticated) fullNameRef.current?.focus();
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
    return <Navigate to={hasBusinessProfile() ? '/dashboard' : '/onboarding'} replace />;
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

  function isValidPassword(pw) {
    return pw.length >= 8 && /[A-Za-z]/.test(pw) && /[0-9]/.test(pw);
  }

  /* ── Step 1: Submit Registration ─────────────────────────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');

    const trimName = fullName.trim();
    const trimEmail = email.trim();
    const newErrors = {};
    let firstErrorField = null;

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
      // Register with sendVerificationOtp flag
      const result = await registerUser({
        email: trimEmail,
        password,
        fullName: trimName,
        sendVerificationOtp: true,
      });

      if (result.emailVerificationPending) {
        setMaskedEmail(result.otpMeta?.maskedEmail || trimEmail);
        setStep('verify');
        setCountdown(result.otpMeta?.cooldownSeconds || 45);
        setSaving(false);
      } else {
        // Fallback: auto-login directly if backend didn't require OTP
        const tokens = await loginUser({ email: trimEmail, password });
        handleAuthSuccess(tokens);
      }
    } catch (err) {
      setSaving(false);
      _handleRegisterError(err, setErrors, setFormError);
    }
  }

  /* ── Step 2: Verify Registration OTP ─────────────────────────────── */
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
        purpose: 'VERIFY_EMAIL',
      });
      handleAuthSuccess(tokens);
    } catch (err) {
      setSaving(false);
      setFormError(err.message || 'Invalid or expired verification code.');
    }
  }

  /* ── Resend Verification OTP ─────────────────────────────────────── */
  async function handleResendOtp() {
    setFormError('');
    setSaving(true);
    try {
      const res = await requestEmailOtp({
        email: email.trim(),
        name: fullName.trim(),
        purpose: 'VERIFY_EMAIL',
      });
      setCountdown(res.cooldownSeconds || 45);
    } catch (err) {
      setFormError(err.message || 'Failed to resend verification code.');
    } finally {
      setSaving(false);
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

        {/* Registration Card */}
        <div className="auth-card" role="main">
          {step === 'form' ? (
            <>
              <div className="auth-card__header">
                <h1 className="auth-card__title">Create Your Account</h1>
                <p className="auth-card__subtitle">Start monitoring your market in minutes.</p>
              </div>

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
                <span>or register with email</span>
              </div>

              {/* Form */}
              <form id="register-form" onSubmit={handleSubmit} noValidate autoComplete="on">
                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="register-fullname">
                    Full name
                  </label>
                  <input
                    ref={fullNameRef}
                    type="text"
                    id="register-fullname"
                    name="fullName"
                    className={`form-control${errors.fullName ? ' form-control--error' : ''}`}
                    placeholder="Subhash Yadav"
                    autoComplete="name"
                    required
                    value={fullName}
                    onChange={(e) => {
                      setFullName(e.target.value);
                      clearField('fullName');
                    }}
                  />
                  {errors.fullName && (
                    <p className="form-error form-error--visible" role="alert">
                      {errors.fullName}
                    </p>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="register-email">
                    Email address
                  </label>
                  <input
                    type="email"
                    id="register-email"
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
                  <label className="form-label form-label--required" htmlFor="register-password">
                    Password
                  </label>
                  <input
                    type="password"
                    id="register-password"
                    name="password"
                    className={`form-control${errors.password ? ' form-control--error' : ''}`}
                    placeholder="At least 8 chars, 1 letter, 1 number"
                    autoComplete="new-password"
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

                <div className="auth-form__actions">
                  <button
                    type="submit"
                    id="register-submit-btn"
                    className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                    disabled={saving}
                  >
                    Create Account
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Step 2: Email OTP Verification */
            <div>
              <div className="auth-card__header">
                <h1 className="auth-card__title">Verify Your Email</h1>
                <p className="auth-card__subtitle">
                  We sent a 6-digit verification code to <strong>{maskedEmail || email}</strong>.
                </p>
              </div>

              {formError && (
                <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span className="form-alert__message">{formError}</span>
                </div>
              )}

              <form id="register-verify-form" onSubmit={handleVerifyOtp} noValidate>
                <div className="otp-input-container">
                  <label className="form-label form-label--required" htmlFor="register-otp-input">
                    6-Digit Verification Code
                  </label>
                  <input
                    type="text"
                    id="register-otp-input"
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
                      setStep('form');
                      setOtp('');
                      setFormError('');
                    }}
                    style={{ padding: 0, color: '#60a5fa' }}
                  >
                    Change details
                  </button>

                  {countdown > 0 ? (
                    <span className="otp-countdown-text">Resend code in {countdown}s</span>
                  ) : (
                    <button
                      type="button"
                      className="btn btn--link text-xs"
                      onClick={handleResendOtp}
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
                    id="verify-register-otp-btn"
                    className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                    disabled={saving || otp.length !== 6}
                  >
                    Verify Email &amp; Get Started
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="auth-divider mt-6">or</div>

          {/* Login link */}
          <div className="auth-card__footer">
            Already have an account?{' '}
            <Link to="/login" className="font-medium">
              Sign In
            </Link>
          </div>
        </div>

        <p className="auth-footer">&copy; 2026 Business Market Monitor</p>
      </main>
    </div>
  );
}

function _handleRegisterError(err, setErrors, setFormError) {
  if (!err?.status) {
    setFormError('Could not connect to the server. Check your connection.');
    return;
  }
  switch (err.status) {
    case 409:
      setFormError('An account with this email already exists. Try signing in.');
      break;
    case 400:
      if (err.details && Array.isArray(err.details)) {
        const fe = {};
        err.details.forEach((d) => {
          if (d.field === 'email') fe.email = 'Please enter a valid email address.';
          if (d.field === 'password') fe.password = 'Password must be at least 8 characters and include a letter and a number.';
          if (d.field === 'fullName') fe.fullName = 'Please enter your full name.';
        });
        setErrors(fe);
      } else {
        setFormError(err.message || 'Please check your details and try again.');
      }
      break;
    case 429:
      setFormError('Too many registration attempts. Please wait before trying again.');
      break;
    default:
      setFormError('Something went wrong. Please try again.');
  }
}
