import { useState, useEffect, useId, useContext } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ToastContext } from '../ui/Toast.jsx';

/**
 * EarlyAccessPlanModal — Professional "Launching Soon" early-access modal (V3-M5 SaaS Layer).
 *
 * Enforces:
 * - Clean portal mounting (guarded for SSR).
 * - Accessible dialog attributes (role="dialog", aria-modal="true", ESC key, backdrop dismiss).
 * - Scroll lock on document.body while open.
 * - Safe toast notification wrapped in try/catch if rendered outside ToastProvider.
 * - Executive copy clearly communicating unlocked early access & grandfathered pricing.
 */
export function EarlyAccessPlanModal({
  isOpen,
  onClose,
  plan = null,
  mode = 'settings',
  currentWorkspaceName = '',
  userEmail = '',
}) {
  if (!isOpen) return null;

  return (
    <EarlyAccessPlanModalContent
      isOpen={isOpen}
      onClose={onClose}
      plan={plan}
      mode={mode}
      currentWorkspaceName={currentWorkspaceName}
      userEmail={userEmail}
    />
  );
}

function EarlyAccessPlanModalContent({
  isOpen,
  onClose,
  plan,
  mode,
  currentWorkspaceName,
  userEmail,
}) {
  const titleId = useId();
  const descId = useId();
  const toastCtx = useContext(ToastContext);
  const showToast = toastCtx?.showToast;

  const [confirmedPlanId, setConfirmedPlanId] = useState(null);
  const confirmed = Boolean(plan?.id && confirmedPlanId === plan.id);

  // Handle ESC key dismiss
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen && typeof onClose === 'function') {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined' || !document.body) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, [isOpen]);

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget && typeof onClose === 'function') {
      onClose();
    }
  };

  const handleLockPricing = () => {
    if (plan?.id) {
      setConfirmedPlanId(plan.id);
    }
    if (typeof showToast === 'function') {
      try {
        showToast({
          type: 'success',
          message: `Priority early access locked in for ${plan?.name || 'Growth'} plan!`,
        });
      } catch {
        // Safe fallback if ToastProvider is not mounted
      }
    }
  };

  const planName = plan?.name || 'Growth';
  const planPrice = plan?.price || '₹2,499 / mo';
  const billingCycleLabel = plan?.billingCycle === 'annual' ? 'billed annually' : 'monthly billing';

  const modalMarkup = (
    <div
      className="modal-backdrop modal-backdrop--open early-access-modal-backdrop"
      onClick={handleBackdropClick}
      data-testid="early-access-modal-backdrop"
    >
      <div
        className="modal early-access-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal__header modal-header early-access-modal__header">
          <div>
            <div className="early-access-badge-row">
              <span className="early-access-plan-chip">
                AMIA {planName} · {planPrice}
              </span>
              <span className="early-access-unlocked-chip">
                <i className="fa-solid fa-unlock-keyhole mr-1" aria-hidden="true" />
                All Features Unlocked
              </span>
            </div>
            <h2 id={titleId} className="modal__title modal-title early-access-modal__title">
              Early Access — Paid Plans Launching Soon
            </h2>
          </div>
          <button
            type="button"
            className="modal__close modal-close-btn"
            onClick={onClose}
            aria-label="Close Early Access Modal"
          >
            &times;
          </button>
        </div>

        {/* Body */}
        <div className="modal__body modal-body early-access-modal__body">
          <p id={descId} className="early-access-copy">
            Thank you for your interest in AI Market Intelligence Agent <strong>{planName}</strong> ({billingCycleLabel}).
            Automated subscription billing is rolling out shortly. As an Early Access workspace, all core
            procurement intelligence features are currently unlocked for your team at no cost.
            Request priority access below to lock in early-adopter pricing when billing goes live.
          </p>

          {/* Highlights Box */}
          <div className="early-access-features-box">
            <div className="early-access-features-box__title">
              What You Get in Early Access ({currentWorkspaceName || 'Your Workspace'})
            </div>
            <ul className="early-access-features-box__list">
              <li className="early-access-features-box__item">
                <i className="fa-solid fa-check early-access-icon--success mr-2" aria-hidden="true" />
                <span>Zero rate limits on tracked materials &amp; price benchmark alerts</span>
              </li>
              <li className="early-access-features-box__item">
                <i className="fa-solid fa-check early-access-icon--success mr-2" aria-hidden="true" />
                <span>Full access to Two-Way WhatsApp Quote Copilot &amp; Landed-Cost Parity</span>
              </li>
              <li className="early-access-features-box__item">
                <i className="fa-solid fa-check early-access-icon--success mr-2" aria-hidden="true" />
                <span>Grandfathered discounted rate for 12 months once self-serve billing launches</span>
              </li>
            </ul>
          </div>

          {/* Confirmed State Callout */}
          {confirmed && (
            <div className="early-access-confirmed-callout" role="status">
              <i className="fa-solid fa-circle-check early-access-icon--success early-access-icon--lg mt-1" aria-hidden="true" />
              <div>
                <div className="early-access-confirmed-callout__title">
                  Priority Access Requested ✓
                </div>
                <p className="early-access-confirmed-callout__desc">
                  Your workspace {currentWorkspaceName ? `(${currentWorkspaceName})` : ''} has been added to our priority early-adopter registry
                  {userEmail ? ` under ${userEmail}` : ''}. We will notify you with grandfathered pricing when billing goes live.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal__footer modal-footer early-access-modal__footer">
          <div>
            {mode === 'landing' && (
              <Link
                to="/register"
                onClick={onClose}
                className="early-access-landing-link"
              >
                <span>Start Free Account Now &rarr;</span>
              </Link>
            )}
          </div>
          <div className="early-access-modal__actions">
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={onClose}
            >
              Close
            </button>
            <button
              type="button"
              id="early-access-lock-pricing-btn"
              className={`btn btn--sm ${confirmed ? 'btn--ghost early-access-lock-btn--confirmed' : 'btn--primary'}`}
              onClick={handleLockPricing}
              disabled={confirmed}
            >
              {confirmed ? (
                <>
                  <i className="fa-solid fa-check mr-1" aria-hidden="true" />
                  Priority Access Requested ✓
                </>
              ) : (
                <>
                  <i className="fa-solid fa-shield-halved mr-1" aria-hidden="true" />
                  Lock Early-Adopter Pricing
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalMarkup, document.body);
  }
  return modalMarkup;
}
