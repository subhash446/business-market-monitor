/**
 * OnboardingPage — Business Setup (3-step wizard)
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/onboarding.html + frontend/js/pages/onboarding.js
 *
 * FLOW (preserved exactly from original):
 *  1. Auth guard: requireAuth() — handled by ProtectedRoute in App.jsx
 *     requireBusiness() is NOT called — this IS the business creation step.
 *  2. Step 1 — Load industries from GET /industries (public), user selects one
 *  3. Step 2 — User fills business details, POST /business
 *  4. After POST /business success: setCachedBusiness() → show Step 3
 *  5. Step 3 — Confirmation: "Go to Dashboard" button
 *     → POST /auth/refresh { refreshToken }  (mandatory — Doc 3 §4.10)
 *       (existing token still has businessId: null; refresh gets the real businessId)
 *     → setTokens(newAccessToken, refreshToken)
 *     → refreshUser() updates AuthContext user state (businessId now populated)
 *     → setBusiness() updates AuthContext business state
 *     → navigate('/dashboard')
 *
 * POST /business PAYLOAD:
 *   { name, industryId, contactEmail?, contactPhone?, address? }
 *   Optional fields only sent when non-empty (matches original exactly).
 *   DO NOT send userId or businessId.
 *
 * VALIDATION:
 *   name: required, 2–150 chars (UI spec §3.1 — stricter than backend MAX 200)
 *   contactEmail: optional, valid format if provided
 *   contactPhone: optional, no format restriction
 *   address: optional, no format restriction
 *
 * INDUSTRY_ICONS: matches original icon map exactly.
 *
 * CSS: uses onboarding.css + all existing component classes.
 * Layout: standalone (no AppLayout/sidebar) — uses onboarding-container.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listIndustries, createBusiness } from '../api/business.api.js';
import { post as apiPost } from '../api/client.js';
import { getRefreshToken, setTokens, setCachedBusiness } from '../auth/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import { isEmail } from '../utils/validate.js';
import '../styles/pages/onboarding.css';

/* ----------------------------------------------------------------
 * Industry icon map (Doc 4 §3.1 — matches onboarding.js exactly)
 * ---------------------------------------------------------------- */
const INDUSTRY_ICONS = {
  'manufacturing':   'fa-solid fa-industry',
  'agriculture':     'fa-solid fa-seedling',
  'construction':    'fa-solid fa-helmet-safety',
  'food & beverage': 'fa-solid fa-utensils',
  'textile':         'fa-solid fa-shirt',
};

function getIndustryIcon(name) {
  return INDUSTRY_ICONS[(name ?? '').toLowerCase()] ?? 'fa-solid fa-building';
}

/* ----------------------------------------------------------------
 * Main component
 * ---------------------------------------------------------------- */
export function OnboardingPage() {
  const navigate  = useNavigate();
  const { refreshUser, setBusiness } = useAuth();

  /* ── Step state ─────────────────────────────────────────────── */
  const [currentStep, setCurrentStep] = useState(1); // 1 | 2 | 3

  /* ── Step 1 — Industry ──────────────────────────────────────── */
  const [industries,          setIndustries]        = useState(null);  // null=loading, []=[loaded]
  const [industriesError,     setIndustriesError]   = useState(false);
  const [selectedIndustryId,  setSelectedIndustryId]  = useState(null);
  const [selectedIndustryName,setSelectedIndustryName] = useState('');
  const industryGridRef = useRef(null);

  /* ── Step 2 — Business details ──────────────────────────────── */
  const [bizName,       setBizName]       = useState('');
  const [contactEmail,  setContactEmail]  = useState('');
  const [contactPhone,  setContactPhone]  = useState('');
  const [address,       setAddress]       = useState('');
  const [step2Errors,   setStep2Errors]   = useState({});  // { name?, contactEmail? }
  const [step2FormErr,  setStep2FormErr]  = useState('');  // form-level error
  const [step2409Err,   setStep2409Err]   = useState(false); // 409 — already has business
  const [creating,      setCreating]      = useState(false);
  const bizNameRef = useRef(null);

  /* ── Step 3 — Confirmation ──────────────────────────────────── */
  const [createdBusiness,  setCreatedBusiness]  = useState(null); // POST /business response
  const [refreshing,       setRefreshing]       = useState(false);
  const [step3Error,       setStep3Error]       = useState('');   // '' | 'retry_login'
  const dashboardBtnRef = useRef(null);

  /* ----------------------------------------------------------------
   * Load industries on mount (Step 1)
   * ---------------------------------------------------------------- */
  const loadIndustries = useCallback(async () => {
    setIndustries(null);          // triggers skeleton
    setIndustriesError(false);
    try {
      const data = await listIndustries();
      setIndustries(data ?? []);
    } catch {
      setIndustriesError(true);
      setIndustries([]);
    }
  }, []);

  useEffect(() => { loadIndustries(); }, [loadIndustries]);

  /* ----------------------------------------------------------------
   * Step navigation helpers
   * ---------------------------------------------------------------- */
  function goToStep(n) {
    setCurrentStep(n);
    // Scroll to top (matches original window.scrollTo(0,0))
    window.scrollTo(0, 0);
  }

  /* ── Step 1 → Step 2 ─────────────────────────────────────────── */
  function handleStep1Continue() {
    if (!selectedIndustryId) return;
    goToStep(2);
    // Focus business name field after DOM update
    setTimeout(() => bizNameRef.current?.focus(), 0);
  }

  /* ── Step 2 → Step 1 (Back) ─────────────────────────────────── */
  function handleStep2Back() {
    goToStep(1);
  }

  /* ----------------------------------------------------------------
   * Step 2 — Form submission → POST /business
   * ---------------------------------------------------------------- */
  async function handleStep2Submit(e) {
    e.preventDefault();
    setStep2Errors({});
    setStep2FormErr('');
    setStep2409Err(false);

    const trimName    = bizName.trim();
    const trimEmail   = contactEmail.trim();
    const trimPhone   = contactPhone.trim();
    const trimAddress = address.trim();

    const errors = {};

    // name: required, 2–150 chars (UI spec §3.1)
    if (!trimName || trimName.length < 2 || trimName.length > 150) {
      errors.name = 'Business name is required (2–150 characters).';
    }

    // contactEmail: optional, valid format if provided
    if (trimEmail && !isEmail(trimEmail).valid) {
      errors.contactEmail = 'Please enter a valid email address.';
    }

    if (Object.keys(errors).length > 0) {
      setStep2Errors(errors);
      bizNameRef.current?.focus();
      return;
    }

    setCreating(true);

    // Build body — only include optional fields when non-empty
    const body = { name: trimName, industryId: selectedIndustryId };
    if (trimEmail) body.contactEmail = trimEmail;
    if (trimPhone) body.contactPhone = trimPhone;
    if (trimAddress) body.address    = trimAddress;

    try {
      // POST /api/v1/business
      const result = await createBusiness(body);
      setCreatedBusiness(result);

      // Cache business in sessionStorage immediately (mirrors setCachedBusiness in original)
      setCachedBusiness({
        id:         result.id,
        name:       result.name,
        industryId: result.industryId,
      });

      goToStep(3);
      // Focus "Go to Dashboard" button after DOM update
      setTimeout(() => dashboardBtnRef.current?.focus(), 0);

    } catch (err) {
      setCreating(false);
      _handleCreateError(err, setStep2Errors, setStep2FormErr, setStep2409Err);
    }
  }

  /* ----------------------------------------------------------------
   * Step 3 — "Go to Dashboard" → mandatory token refresh (Doc 3 §4.10)
   *
   * The existing stored token still has businessId: null.
   * POST /auth/refresh obtains a new access token embedding the real businessId.
   * Then: setTokens() → refreshUser() updates AuthContext → setBusiness() → navigate
   * ---------------------------------------------------------------- */
  async function handleGotoDashboard() {
    setStep3Error('');
    setRefreshing(true);

    const refreshToken = getRefreshToken();

    try {
      // POST /api/v1/auth/refresh — { refreshToken } — skipAuth (no bearer header needed)
      const res  = await apiPost('/auth/refresh', { refreshToken }, { skipAuth: true });
      const data = res.data;

      if (!data?.accessToken) {
        throw new Error('No access token in refresh response');
      }

      // Store updated tokens — new access token contains the real businessId
      setTokens(data.accessToken, refreshToken);

      // Update AuthContext: re-decode user from fresh token (businessId now populated)
      refreshUser();

      // Update AuthContext business state with the created business data
      if (createdBusiness) {
        setBusiness({
          id:         createdBusiness.id,
          name:       createdBusiness.name,
          industryId: createdBusiness.industryId,
          industryName: createdBusiness.industryName ?? selectedIndustryName,
        });
      }

      // Navigate to dashboard
      navigate('/dashboard', { replace: true });

    } catch {
      setRefreshing(false);
      setStep3Error('retry_login');
    }
  }

  /* ----------------------------------------------------------------
   * Industry card select handler
   * ---------------------------------------------------------------- */
  function handleSelectIndustry(industry) {
    setSelectedIndustryId(industry.id);
    setSelectedIndustryName(industry.name);
  }

  /* ----------------------------------------------------------------
   * Derived step indicator classes
   * ---------------------------------------------------------------- */
  function stepIndicatorClass(n) {
    if (n < currentStep) return 'step-indicator__item step-indicator__item--complete';
    if (n === currentStep) return 'step-indicator__item step-indicator__item--active';
    return 'step-indicator__item';
  }

  /* ----------------------------------------------------------------
   * Render
   * ---------------------------------------------------------------- */
  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <div className="app-shell">

        {/* Page header */}
        <header className="page-header" role="banner">
          <div className="page-header__inner">
            <h1 className="page-header__title">Set Up Your Business</h1>
          </div>
        </header>

        {/* Main content */}
        <main id="main-content" className="main-content" role="main">
          <div className="onboarding-container">

            {/* Step indicator */}
            <nav className="onboarding-progress" aria-label="Setup progress">
              <div
                className={stepIndicatorClass(1)}
                id="indicator-1"
                aria-current={currentStep === 1 ? 'step' : undefined}
              >
                <div className="step-indicator__circle" aria-hidden="true">1</div>
                <span className="step-indicator__label">Industry</span>
              </div>
              <div
                className={stepIndicatorClass(2)}
                id="indicator-2"
                aria-current={currentStep === 2 ? 'step' : undefined}
              >
                <div className="step-indicator__circle" aria-hidden="true">2</div>
                <span className="step-indicator__label">Details</span>
              </div>
              <div
                className={stepIndicatorClass(3)}
                id="indicator-3"
                aria-current={currentStep === 3 ? 'step' : undefined}
              >
                <div className="step-indicator__circle" aria-hidden="true">
                  <i className="fa-solid fa-check" style={{ fontSize: '0.75rem' }} aria-hidden="true" />
                </div>
                <span className="step-indicator__label">Done</span>
              </div>
            </nav>

            {/* ── Step 1 — Industry Selection ─────────────────────── */}
            <div
              className={`onboarding-step${currentStep === 1 ? ' onboarding-step--active' : ''}`}
              id="step-1"
              role="region"
              aria-labelledby="step1-heading"
            >
              <h2 className="onboarding-step__heading" id="step1-heading">Select Your Industry</h2>
              <p className="onboarding-step__body">Choose the industry that best matches your business.</p>

              {/* Industry grid */}
              <div
                ref={industryGridRef}
                id="industry-grid"
                className="industry-grid"
                role="group"
                aria-label="Available industries"
              >
                <IndustryGrid
                  industries={industries}
                  hasError={industriesError}
                  selectedId={selectedIndustryId}
                  onSelect={handleSelectIndustry}
                  onRetry={loadIndustries}
                />
              </div>

              <div className="onboarding-actions">
                <button
                  type="button"
                  id="step1-continue-btn"
                  className="btn btn--primary"
                  disabled={!selectedIndustryId}
                  aria-describedby="step1-heading"
                  onClick={handleStep1Continue}
                >
                  Continue
                  <i className="fa-solid fa-arrow-right" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* ── Step 2 — Business Details ───────────────────────── */}
            <div
              className={`onboarding-step${currentStep === 2 ? ' onboarding-step--active' : ''}`}
              id="step-2"
              role="region"
              aria-labelledby="step2-heading"
            >
              <h2 className="onboarding-step__heading" id="step2-heading">Tell Us About Your Business</h2>

              {/* Form-level error (network, generic) */}
              {step2FormErr && (
                <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span className="form-alert__message">{step2FormErr}</span>
                </div>
              )}

              {/* 409 — already has business */}
              {step2409Err && (
                <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
                  <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                  <span className="form-alert__message">
                    You already have a business profile.{' '}
                    <a href="/dashboard" onClick={e => { e.preventDefault(); navigate('/dashboard'); }}>
                      Go to Dashboard
                    </a>
                  </span>
                </div>
              )}

              <form id="ob-form" onSubmit={handleStep2Submit} noValidate autoComplete="on">

                {/* Business Name — required */}
                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="ob-business-name">
                    Business name
                  </label>
                  <input
                    ref={bizNameRef}
                    type="text"
                    id="ob-business-name"
                    name="name"
                    className={`form-control${step2Errors.name ? ' form-control--error' : ''}`}
                    placeholder="e.g. Acme Manufacturing Ltd."
                    autoComplete="organization"
                    maxLength={150}
                    required
                    aria-required="true"
                    aria-describedby="ob-business-name-error"
                    value={bizName}
                    onChange={e => {
                      setBizName(e.target.value);
                      setStep2Errors(prev => { const n = { ...prev }; delete n.name; return n; });
                      setStep2FormErr('');
                    }}
                  />
                  {step2Errors.name && (
                    <p id="ob-business-name-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                      {step2Errors.name}
                    </p>
                  )}
                </div>

                {/* Contact Email — optional */}
                <div className="form-group">
                  <label className="form-label" htmlFor="ob-contact-email">
                    Contact email <span className="form-label__optional">(optional)</span>
                  </label>
                  <input
                    type="email"
                    id="ob-contact-email"
                    name="contactEmail"
                    className={`form-control${step2Errors.contactEmail ? ' form-control--error' : ''}`}
                    placeholder="business@example.com"
                    autoComplete="email"
                    inputMode="email"
                    aria-describedby="ob-contact-email-error"
                    value={contactEmail}
                    onChange={e => {
                      setContactEmail(e.target.value);
                      setStep2Errors(prev => { const n = { ...prev }; delete n.contactEmail; return n; });
                      setStep2FormErr('');
                    }}
                  />
                  {step2Errors.contactEmail && (
                    <p id="ob-contact-email-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                      {step2Errors.contactEmail}
                    </p>
                  )}
                </div>

                {/* Contact Phone — optional, no format restriction */}
                <div className="form-group">
                  <label className="form-label" htmlFor="ob-contact-phone">
                    Contact phone <span className="form-label__optional">(optional)</span>
                  </label>
                  <input
                    type="tel"
                    id="ob-contact-phone"
                    name="contactPhone"
                    className="form-control"
                    placeholder="+1 555 000 0000"
                    autoComplete="tel"
                    value={contactPhone}
                    onChange={e => setContactPhone(e.target.value)}
                  />
                </div>

                {/* Address — optional, textarea */}
                <div className="form-group">
                  <label className="form-label" htmlFor="ob-address">
                    Address <span className="form-label__optional">(optional)</span>
                  </label>
                  <textarea
                    id="ob-address"
                    name="address"
                    className="form-control form-control--textarea"
                    placeholder="123 Main Street, Suite 4, City, Country"
                    rows={3}
                    maxLength={500}
                    autoComplete="street-address"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                  />
                </div>

                <div className="onboarding-actions">
                  <button
                    type="button"
                    id="step2-back-btn"
                    className="btn btn--ghost"
                    onClick={handleStep2Back}
                  >
                    <i className="fa-solid fa-arrow-left" aria-hidden="true" />
                    Back
                  </button>
                  <button
                    type="submit"
                    id="ob-create-btn"
                    className={`btn btn--primary${creating ? ' btn--loading' : ''}`}
                    disabled={creating}
                  >
                    Create Business
                  </button>
                </div>

              </form>
            </div>

            {/* ── Step 3 — Confirmation ───────────────────────────── */}
            <div
              className={`onboarding-step${currentStep === 3 ? ' onboarding-step--active' : ''}`}
              id="step-3"
              role="region"
              aria-labelledby="step3-heading"
            >
              <div className="onboarding-success">

                <div className="onboarding-success__icon" aria-hidden="true">
                  <i className="fa-solid fa-circle-check" />
                </div>

                <h2 className="onboarding-success__title" id="step3-heading">You&apos;re all set!</h2>

                <div className="onboarding-success__details" aria-live="polite">
                  <p className="onboarding-success__detail">
                    <strong id="ob-created-name">{createdBusiness?.name ?? ''}</strong> has been created.
                  </p>
                  <p className="onboarding-success__detail">
                    <strong id="ob-materials-count">{String(createdBusiness?.materialsGenerated ?? 0)}</strong>{' '}
                    materials have been pre-loaded from your industry template.
                  </p>
                </div>

                <p className="onboarding-success__body">
                  We&apos;ve set up your workspace. Click below to refresh your session and go to your dashboard.
                </p>

                {/* Step 3 error (refresh token failure) */}
                {step3Error === 'retry_login' && (
                  <div className="form-alert form-alert--error form-alert--visible" role="alert" aria-live="assertive">
                    <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                    <span className="form-alert__message">
                      Failed to refresh your session. Please{' '}
                      <a href="/login" onClick={e => { e.preventDefault(); navigate('/login'); }}>
                        sign in again
                      </a>
                      .
                    </span>
                  </div>
                )}

                <button
                  ref={dashboardBtnRef}
                  type="button"
                  id="ob-goto-dashboard-btn"
                  className={`btn btn--primary btn--full btn--lg${refreshing ? ' btn--loading' : ''}`}
                  disabled={refreshing}
                  onClick={handleGotoDashboard}
                >
                  Go to Dashboard
                </button>

              </div>
            </div>

          </div>{/* /.onboarding-container */}
        </main>

      </div>{/* /.app-shell */}
    </div>
  );
}

/* ----------------------------------------------------------------
 * IndustryGrid — inner component for Step 1 industry display
 * Replaces the imperative _renderSkeletons / _renderIndustryCards /
 * _renderIndustryError functions from onboarding.js.
 * ---------------------------------------------------------------- */
function IndustryGrid({ industries, hasError, selectedId, onSelect, onRetry }) {
  // Loading state — industries === null
  if (industries === null) {
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="industry-card-skeleton skeleton" aria-hidden="true" />
        ))}
      </>
    );
  }

  // Error state
  if (hasError || industries.length === 0) {
    return (
      <div className="error-state">
        <div className="error-state__icon">
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
        </div>
        <h3 className="error-state__title">Could not load industries</h3>
        <p className="error-state__message">
          {hasError
            ? 'Please check your connection and try again.'
            : 'No industries available. Please try again.'}
        </p>
        <div className="error-state__action">
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Industry cards
  return (
    <>
      {industries.map(industry => (
        <button
          key={industry.id}
          type="button"
          className={`industry-card${selectedId === industry.id ? ' industry-card--selected' : ''}`}
          aria-pressed={selectedId === industry.id}
          data-industry-id={industry.id}
          onClick={() => onSelect(industry)}
        >
          <span className="industry-card__icon">
            <i className={getIndustryIcon(industry.name)} aria-hidden="true" />
          </span>
          <span className="industry-card__name">{industry.name}</span>
          <span className="industry-card__description">{industry.description ?? ''}</span>
        </button>
      ))}
    </>
  );
}

/* ----------------------------------------------------------------
 * Error handler for POST /business (mirrors _handleCreateError)
 * ---------------------------------------------------------------- */
function _handleCreateError(err, setErrors, setFormErr, set409) {
  if (!err?.status) {
    setFormErr('Could not connect to the server. Check your connection.');
    return;
  }
  switch (err.status) {
    case 409:
      set409(true);
      break;
    case 400:
      if (err.details && Array.isArray(err.details)) {
        const fe = {};
        err.details.forEach(d => {
          if (d.field === 'name')         fe.name         = 'Business name is required (2–150 characters).';
          if (d.field === 'contactEmail') fe.contactEmail = 'Please enter a valid email address.';
        });
        setErrors(fe);
      } else {
        setFormErr(err.message || 'Please check your details and try again.');
      }
      break;
    default:
      setFormErr('Something went wrong. Please try again.');
  }
}
