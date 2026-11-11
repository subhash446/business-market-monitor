/**
 * OnboardingPage — Business Setup (3-step wizard)
 * Business Market Monitor — React frontend
 *
 * Flow:
 *  1. Auth guard: requireAuth() — handled by ProtectedRoute in App.jsx
 *  2. Step 1 — Load industries from GET /industries, user selects one.
 *              Displays preview of materials automatically tracked for this industry.
 *  3. Step 2 — User fills business details, POST /business.
 *  4. After POST /business success: sets cached business → show Step 3.
 *  5. Step 3 — Confirmation: displays auto-configured materials breakdown and "Go to Dashboard".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listIndustries, getIndustryMaterials, createBusiness } from '../api/business.api.js';
import { post as apiPost } from '../api/client.js';
import { getRefreshToken, setTokens, setCachedBusiness } from '../auth/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import { isEmail } from '../utils/validate.js';
import { createLatestRequestGuard, runLatestIndustryPreview } from '../utils/requestGuard.js';
import '../styles/pages/onboarding.css';

/* ----------------------------------------------------------------
 * Industry icon map
 * ---------------------------------------------------------------- */
const INDUSTRY_ICONS = {
  'packaged drinking water': 'fa-solid fa-bottle-water',
  'plastic manufacturing':   'fa-solid fa-industry',
  'food & beverage':         'fa-solid fa-utensils',
  'dairy':                   'fa-solid fa-cow',
  'fmcg':                    'fa-solid fa-boxes-stacked',
  'manufacturing':           'fa-solid fa-industry',
  'agriculture':             'fa-solid fa-seedling',
  'construction':            'fa-solid fa-helmet-safety',
  'textile':                 'fa-solid fa-shirt',
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

  /* ── Step 1 — Industry & Material Preview ────────────────────── */
  const [industries,           setIndustries]          = useState(null);
  const [industriesError,      setIndustriesError]     = useState(false);
  const [selectedIndustryId,   setSelectedIndustryId]   = useState(null);
  const [selectedIndustryName, setSelectedIndustryName] = useState('');
  const [previewMaterials,     setPreviewMaterials]    = useState([]);
  const [previewLoading,       setPreviewLoading]      = useState(false);
  const [previewError,         setPreviewError]        = useState(false);
  const [previewGuard]         = useState(() => createLatestRequestGuard());
  const industryGridRef = useRef(null);

  /* ── Step 2 — Business details ──────────────────────────────── */
  const [bizName,       setBizName]       = useState('');
  const [contactEmail,  setContactEmail]  = useState('');
  const [contactPhone,  setContactPhone]  = useState('');
  const [address,       setAddress]       = useState('');
  const [step2Errors,   setStep2Errors]   = useState({});
  const [step2FormErr,  setStep2FormErr]  = useState('');
  const [step2409Err,   setStep2409Err]   = useState(false);
  const [creating,      setCreating]      = useState(false);
  const bizNameRef = useRef(null);

  /* ── Step 3 — Confirmation ──────────────────────────────────── */
  const [createdBusiness,  setCreatedBusiness]  = useState(null);
  const [refreshing,       setRefreshing]       = useState(false);
  const [step3Error,       setStep3Error]       = useState('');
  const dashboardBtnRef = useRef(null);

  /* ----------------------------------------------------------------
   * Load industries on mount (Step 1)
   * ---------------------------------------------------------------- */
  const loadIndustries = useCallback(async () => {
    setIndustries(null);
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

  useEffect(() => () => {
    previewGuard.invalidate();
  }, [previewGuard]);

  /* ----------------------------------------------------------------
   * Step navigation helpers
   * ---------------------------------------------------------------- */
  function goToStep(n) {
    setCurrentStep(n);
    window.scrollTo(0, 0);
  }

  /* ── Step 1 → Step 2 ─────────────────────────────────────────── */
  function handleStep1Continue() {
    if (!selectedIndustryId) return;
    goToStep(2);
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

    if (!trimName || trimName.length < 2 || trimName.length > 150) {
      errors.name = 'Business name is required (2–150 characters).';
    }

    if (trimEmail && !isEmail(trimEmail).valid) {
      errors.contactEmail = 'Please enter a valid email address.';
    }

    if (Object.keys(errors).length > 0) {
      setStep2Errors(errors);
      bizNameRef.current?.focus();
      return;
    }

    setCreating(true);

    const body = { name: trimName, industryId: selectedIndustryId };
    if (trimEmail) body.contactEmail = trimEmail;
    if (trimPhone) body.contactPhone = trimPhone;
    if (trimAddress) body.address    = trimAddress;

    try {
      const result = await createBusiness(body);
      setCreatedBusiness(result);

      setCachedBusiness({
        id:         result.id,
        name:       result.name,
        industryId: result.industryId,
      });

      goToStep(3);
      setTimeout(() => dashboardBtnRef.current?.focus(), 0);

    } catch (err) {
      setCreating(false);
      _handleCreateError(err, setStep2Errors, setStep2FormErr, setStep2409Err);
    }
  }

  /* ----------------------------------------------------------------
   * Step 3 — "Go to Dashboard" → token refresh
   * ---------------------------------------------------------------- */
  async function handleGotoDashboard() {
    setStep3Error('');
    setRefreshing(true);

    const refreshToken = getRefreshToken();

    try {
      const res  = await apiPost('/auth/refresh', { refreshToken }, { skipAuth: true });
      const data = res.data;

      if (!data?.accessToken) {
        throw new Error('No access token in refresh response');
      }

      setTokens(data.accessToken, refreshToken);
      refreshUser();

      if (createdBusiness) {
        setBusiness({
          id:           createdBusiness.id,
          name:         createdBusiness.name,
          industryId:   createdBusiness.industryId,
          industryName: createdBusiness.industryName ?? selectedIndustryName,
        });
      }

      navigate('/dashboard', { replace: true });

    } catch {
      setRefreshing(false);
      setStep3Error('retry_login');
    }
  }

  /* ----------------------------------------------------------------
   * Industry card select handler + auto-load material preview
   * ---------------------------------------------------------------- */
  function handleSelectIndustry(industry) {
    setSelectedIndustryId(industry.id);
    setSelectedIndustryName(industry.name);

    void runLatestIndustryPreview({
      industryId: industry.id,
      fetchMaterials: getIndustryMaterials,
      guard: previewGuard,
      onStart: () => {
        setPreviewLoading(true);
        setPreviewError(false);
        setPreviewMaterials([]);
      },
      onSuccess: (materials) => {
        setPreviewMaterials(materials);
      },
      onError: () => {
        setPreviewMaterials([]);
        setPreviewError(true);
      },
      onSettled: () => {
        setPreviewLoading(false);
      },
    });
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
              <p className="onboarding-step__body">
                Choose your industry. The platform will automatically identify and associate the relevant raw materials and price benchmarks with your workspace.
              </p>

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

              {/* Material Mapping Preview Panel */}
              {selectedIndustryId && (
                <div className="card" style={{ marginTop: 'var(--space-4)', padding: 'var(--space-4)', border: '1px solid var(--color-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                    <i className="fa-solid fa-layer-group" style={{ color: 'var(--color-primary)' }} aria-hidden="true" />
                    <h3 style={{ fontSize: 'var(--text-base)', margin: 0, fontWeight: 600 }}>
                      Materials Automatically Tracked for {selectedIndustryName}
                    </h3>
                  </div>
                  <p className="text-xs text-secondary" style={{ marginBottom: 'var(--space-3)' }}>
                    These materials will be automatically configured for your business. You will not have to search for or manually add them.
                  </p>

                  {previewLoading ? (
                    <div style={{ padding: 'var(--space-3) 0', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>
                      <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '6px' }} /> Loading materials catalog...
                    </div>
                  ) : previewError ? (
                    <p className="text-xs" role="alert" style={{ margin: 0, color: 'var(--color-danger, #dc2626)' }}>
                      Could not load materials preview for this industry. Select the industry card again to retry.
                    </p>
                  ) : previewMaterials.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {previewMaterials.map((mat) => (
                        <div
                          key={mat.name}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: 'var(--space-2) var(--space-3)',
                            backgroundColor: 'var(--color-surface-subtle, #f9fafb)',
                            borderRadius: 'var(--radius-sm, 6px)',
                            border: '1px solid var(--color-border-subtle, #f3f4f6)',
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)' }}>{mat.name}</span>{' '}
                            <span className="text-xs text-muted">({mat.defaultUnit || mat.unit})</span>
                            {mat.disclaimer && (
                              <span className="text-xs text-muted" style={{ display: 'block', marginTop: '2px', maxWidth: '420px', lineHeight: 1.25 }}>
                                {mat.disclaimer}
                              </span>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 'var(--space-2)' }}>
                            {mat.hasAutomatedFeed ? (
                              <span className={`badge ${mat.isProxy ? 'badge--warning' : 'badge--info'}`} style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                                <i className={mat.isProxy ? 'fa-solid fa-chart-line' : 'fa-solid fa-building-columns'} style={{ marginRight: '4px' }} aria-hidden="true" />
                                {mat.isProxy ? `Proxy: ${mat.defaultExternalSymbol}` : `Mandi: ${mat.defaultExternalSymbol}`}
                              </span>
                            ) : (
                              <span className="badge badge--neutral" style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>
                                Supplier Quote
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted" style={{ margin: 0 }}>
                      {selectedIndustryName === 'FMCG'
                        ? 'FMCG is configured as a flexible generic template. You can track custom materials tailored to your specific product lines after setup.'
                        : 'No default materials pre-configured. Custom materials can be added from the Materials tab.'}
                    </p>
                  )}
                </div>
              )}

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

              {/* Form-level error */}
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

                {/* Contact Phone — optional */}
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

                {/* Address — optional */}
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
                    materials have been automatically configured and associated with your workspace.
                  </p>
                </div>

                {/* Display auto-associated materials list */}
                {createdBusiness?.materials && createdBusiness.materials.length > 0 && (
                  <div className="card" style={{ textAlign: 'left', margin: 'var(--space-4) 0', padding: 'var(--space-3) var(--space-4)', maxHeight: '220px', overflowY: 'auto', border: '1px solid var(--color-border)' }}>
                    <strong style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', display: 'block', marginBottom: 'var(--space-2)' }}>
                      AUTOMATICALLY CONFIGURED MATERIALS:
                    </strong>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                      {createdBusiness.materials.map((m) => (
                        <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 'var(--text-xs)', padding: 'var(--space-1) 0', borderBottom: '1px solid var(--color-border-subtle, #f3f4f6)' }}>
                          <span><strong>{m.name}</strong> <span className="text-muted">({m.unit})</span></span>
                          {m.hasAutomatedFeed ? (
                            <span className="badge badge--info" style={{ fontSize: '10px' }}>
                              <i className="fa-solid fa-bolt" style={{ marginRight: '3px' }} aria-hidden="true" />
                              Automated ({m.externalSymbol})
                            </span>
                          ) : (
                            <span className="badge badge--neutral" style={{ fontSize: '10px' }}>
                              Supplier Quote
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="onboarding-success__body">
                  We&apos;ve configured your workspace. Tracked materials with automated benchmarks will update automatically. Click below to enter your dashboard.
                </p>

                {/* Step 3 error */}
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
 * ---------------------------------------------------------------- */
function IndustryGrid({ industries, hasError, selectedId, onSelect, onRetry }) {
  if (industries === null) {
    return (
      <>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="industry-card-skeleton skeleton" aria-hidden="true" />
        ))}
      </>
    );
  }

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
 * Error handler for POST /business
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
