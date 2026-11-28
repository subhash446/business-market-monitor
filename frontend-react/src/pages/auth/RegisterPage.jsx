/**
 * RegisterPage — 2-Step Verified Onboarding
 * Business Market Monitor — React frontend
 *
 * Flow:
 *  - Clean wordmark header linking to / (no BMM badge)
 *  - Step 1: Full-width Google button + "or create an account with email"
 *    - Full name (neutral placeholder "Aarav Sharma") + Email address
 *    - Calls POST /api/v1/auth/email-otp/request with purpose: 'VERIFY_EMAIL'
 *    - Shows inline Sign-in link if email already exists (409 EMAIL_ALREADY_EXISTS)
 *  - Step 2: 6-Box Segmented OTP + Set Password with live criteria checklist
 *    - Calls POST /api/v1/auth/register/verify-otp
 *    - Redirects cleanly to /onboarding or safe redirect target (/accept-invite)
 */

import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { requestEmailOtp, registerWithVerifiedOtp } from '../../api/auth.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { hasBusinessProfile } from '../../auth/auth.js';
import { isEmail } from '../../utils/validate.js';
import { GoogleSignInButton } from '../../components/auth/GoogleSignInButton.jsx';
import { OtpInput } from '../../components/auth/OtpInput.jsx';
import { PasswordInput } from '../../components/auth/PasswordInput.jsx';
import '../../styles/pages/auth.css';

export function RegisterPage() {
  const { isAuthenticated, hasBusinessProfile: contextHasBiz, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();

  const rawRedirect = params.get('redirect') || location.state?.redirect || location.state?.from?.pathname || '';
  const safeRedirect = rawRedirect && rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
    ? rawRedirect
    : '';

  // Step: 'email' | 'verify'
  const [step, setStep] = useState('email');

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [countdown, setCountdown] = useState(0);

  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [saving, setSaving] = useState(false);

  const fullNameRef = useRef(null);
  const passwordRef = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) fullNameRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    setDuplicateEmail(false);
  }

  const hasMinLen = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const isPasswordValid = hasMinLen && hasLetter && hasNumber;

  /* ── Step 1: Validate Name + Email and send VERIFY_EMAIL OTP ────── */
  async function handleSendCode(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setDuplicateEmail(false);

    const trimName = fullName.trim();
    const trimEmail = email.trim();
    const newErrors = {};

    if (!trimName || trimName.length < 2) {
      newErrors.fullName = 'Please enter your full name.';
    }
    const emailCheck = isEmail(trimEmail);
    if (!emailCheck.valid) {
      newErrors.email = 'Please enter a valid email address.';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      if (newErrors.fullName) fullNameRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const res = await requestEmailOtp({
        email: trimEmail,
        name: trimName,
        purpose: 'VERIFY_EMAIL',
      });
      setMaskedEmail(res.maskedEmail || trimEmail);
      setStep('verify');
      setCountdown(res.cooldownSeconds || 45);
    } catch (err) {
      if (err?.status === 409 || err?.code === 'EMAIL_ALREADY_EXISTS') {
        setDuplicateEmail(true);
        setFormError('An account with this email already exists.');
      } else {
        setFormError(err?.message || 'Could not send verification code. Please try again.');
      }
    } finally {
      setSaving(false);
    }
  }

  /* ── Step 2: Verify OTP & Create Account atomically ─────────────── */
  async function handleVerifyAndCreate(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');
    setDuplicateEmail(false);

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setErrors({ otp: 'Please enter the 6-digit verification code.' });
      return;
    }

    if (!isPasswordValid) {
      setErrors({ password: 'Password must be at least 8 characters and include a letter and a number.' });
      passwordRef.current?.focus();
      return;
    }

    setSaving(true);
    try {
      const tokens = await registerWithVerifiedOtp({
        name: fullName.trim(),
        email: email.trim(),
        otp: cleanOtp,
        password,
      });
      handleAuthSuccess(tokens);
    } catch (err) {
      setSaving(false);
      if (err?.status === 409 || err?.code === 'EMAIL_ALREADY_EXISTS') {
        setDuplicateEmail(true);
        setFormError('An account with this email already exists.');
      } else if (err?.details && Array.isArray(err.details)) {
        const fe = {};
        err.details.forEach((d) => {
          if (d.field === 'otp') fe.otp = 'Please enter a valid 6-digit code.';
          if (d.field === 'password') fe.password = 'Password must be at least 8 characters and include a letter and a number.';
        });
        setErrors(fe);
        if (Object.keys(fe).length === 0) {
          setFormError(err.message || 'Verification failed. Please try again.');
        }
      } else {
        setFormError(err?.message || 'Invalid or expired verification code.');
      }
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
      setFormError(err?.message || 'Failed to resend verification code.');
    } finally {
      setSaving(false);
    }
  }

  const loginHref = safeRedirect
    ? `/login?redirect=${encodeURIComponent(safeRedirect)}`
    : '/login';

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

        {/* Registration Card */}
        <div className="auth-card" role="main">
          {step === 'email' ? (
            <>
              <div className="auth-card__header">
                <div className="auth-step-indicator">Step 1 of 2 &middot; Verify email</div>
                <h1 className="auth-card__title">Create Your Account</h1>
                <p className="auth-card__subtitle">
                  Start monitoring raw material markets in minutes.
                </p>
              </div>

              {formError && (
                <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span className="form-alert__message">
                    {formError}
                    {duplicateEmail && (
                      <Link to={loginHref} className="form-alert__action-link">
                        Sign in instead
                      </Link>
                    )}
                  </span>
                </div>
              )}

              {/* 1-Click Google Sign-Up */}
              <GoogleSignInButton onSuccess={handleAuthSuccess} onError={setFormError} />

              <div className="auth-divider">
                <span>or create an account with email</span>
              </div>

              <form id="register-step1-form" onSubmit={handleSendCode} noValidate autoComplete="on">
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
                    placeholder="Aarav Sharma"
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
                    id="register-send-code-btn"
                    className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                    disabled={saving}
                  >
                    Send Verification Code
                  </button>
                </div>
              </form>
            </>
          ) : (
            /* Step 2: Enter 6-Digit OTP & Set Password */
            <div>
              <div className="auth-card__header">
                <div className="auth-step-indicator">Step 2 of 2 &middot; Confirm code &amp; set password</div>
                <h1 className="auth-card__title">Verify Your Email</h1>
                <p className="auth-card__subtitle">
                  Confirm your 6-digit code and set a password to finish setup.
                </p>
              </div>

              {formError && (
                <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span className="form-alert__message">
                    {formError}
                    {duplicateEmail && (
                      <Link to={loginHref} className="form-alert__action-link">
                        Sign in instead
                      </Link>
                    )}
                  </span>
                </div>
              )}

              <form id="register-verify-form" onSubmit={handleVerifyAndCreate} noValidate autoComplete="off">
                <div className="otp-email-context">
                  <span>
                    We sent a 6-digit code to <strong>{maskedEmail || email}</strong>
                  </span>
                  <button
                    type="button"
                    className="otp-change-btn"
                    onClick={() => {
                      setStep('email');
                      setOtp('');
                      setFormError('');
                      setErrors({});
                    }}
                  >
                    Change email
                  </button>
                </div>

                <div className="otp-section">
                  <label className="form-label form-label--required" htmlFor="register-otp-input">
                    Verification code
                  </label>
                  <OtpInput
                    id="register-otp-input"
                    value={otp}
                    onChange={(val) => {
                      setOtp(val);
                      clearField('otp');
                    }}
                    autoFocus
                    disabled={saving}
                    hasError={Boolean(errors.otp)}
                  />
                  {errors.otp && (
                    <p className="form-error form-error--visible" role="alert">
                      {errors.otp}
                    </p>
                  )}

                  <div className="otp-resend-row">
                    <span className="otp-countdown-text">
                      {countdown > 0 ? `Resend code in ${countdown}s` : 'Didn’t receive it?'}
                    </span>
                    {countdown === 0 && (
                      <button
                        type="button"
                        className="otp-resend-btn"
                        onClick={handleResendOtp}
                        disabled={saving}
                      >
                        Resend code
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="register-password">
                    Set Password
                  </label>
                  <PasswordInput
                    inputRef={passwordRef}
                    id="register-password"
                    name="password"
                    placeholder="Create a strong password"
                    autoComplete="new-password"
                    required
                    hasError={Boolean(errors.password)}
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      clearField('password');
                    }}
                  />

                  {/* Live inline password criteria checklist */}
                  <ul className="password-checklist" aria-label="Password requirements">
                    <li className={`password-checklist__item${hasMinLen ? ' password-checklist__item--met' : ''}`}>
                      <span className="password-checklist__dot" aria-hidden="true" />
                      <span>8+ characters</span>
                    </li>
                    <li className={`password-checklist__item${hasLetter ? ' password-checklist__item--met' : ''}`}>
                      <span className="password-checklist__dot" aria-hidden="true" />
                      <span>1 letter</span>
                    </li>
                    <li className={`password-checklist__item${hasNumber ? ' password-checklist__item--met' : ''}`}>
                      <span className="password-checklist__dot" aria-hidden="true" />
                      <span>1 number</span>
                    </li>
                  </ul>

                  {errors.password && (
                    <p className="form-error form-error--visible" role="alert">
                      {errors.password}
                    </p>
                  )}
                </div>

                <div className="auth-form__actions">
                  <button
                    type="submit"
                    id="verify-register-otp-btn"
                    className={`btn btn--primary btn--full btn--lg${saving ? ' btn--loading' : ''}`}
                    disabled={saving || otp.length !== 6 || !isPasswordValid}
                  >
                    Verify &amp; Create Account
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Sign In footer link (no redundant 'or' divider) */}
          <div className="auth-card__footer">
            Already have an account?{' '}
            <Link to={loginHref}>Sign In</Link>
          </div>
        </div>

        <p className="auth-footer">&copy; 2026 AI Market Intelligence Agent</p>
      </main>
    </div>
  );
}
