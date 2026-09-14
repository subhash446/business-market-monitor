/**
 * BusinessSettingsModal — Business Settings form in a modal
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/js/components/businessSettings.js
 *
 * BACKEND CONTRACT (preserved exactly):
 *   GET /api/v1/business  → { id, name, industryId, industryName, contactEmail,
 *                              contactPhone, address, newsDigestEnabled, newsDigestFrequency }
 *   PUT /api/v1/business  → body: { name, contactEmail?, contactPhone?, address?,
 *                                   newsDigestEnabled?, newsDigestFrequency? }
 *                           industryId MUST NOT be sent (backend validator rejects it)
 *
 * Validation mirrors business.validator.js:
 *   - name: required, 2–150 chars
 *   - contactEmail: optional, valid email if provided
 *   - newsDigestFrequency: 'DAILY'|'WEEKLY'|'MONTHLY' only
 *   - industryId: NEVER sent in PUT body
 *
 * Props:
 *   isOpen       — boolean
 *   onClose      — () => void
 *   onSaved      — (updatedBusiness) => void  (called after successful PUT)
 *
 * Behavior:
 *   - On open: hydrate from AuthContext business cache first; if absent fetch GET /business.
 *   - On save: PUT /business → call onSaved() with updated data → AuthContext.setBusiness().
 *   - Digest frequency select is disabled when digest email is unchecked.
 *   - industryId never sent (read-only display only).
 *   - Shows Skeleton while loading, form once data is ready.
 */

import { useEffect, useRef, useState } from 'react';
import { getBusiness, updateBusiness } from '../../api/business.api.js';
import { useAuth } from '../../hooks/useAuth.js';
import { isEmail } from '../../utils/validate.js';
import { Modal } from './Modal.jsx';
import { Skeleton } from './Skeleton.jsx';
import { useToast } from './Toast.jsx';

const DIGEST_VALUES = ['DAILY', 'WEEKLY', 'MONTHLY'];

const EMPTY_FORM = {
  name:                '',
  contactEmail:        '',
  contactPhone:        '',
  address:             '',
  newsDigestEnabled:   false,
  newsDigestFrequency: 'WEEKLY',
  industryDisplay:     '',
};

function initFormFromBusiness(business) {
  return {
    name:                business.name                ?? '',
    contactEmail:        business.contactEmail        ?? '',
    contactPhone:        business.contactPhone        ?? '',
    address:             business.address             ?? '',
    newsDigestEnabled:   !!business.newsDigestEnabled,
    newsDigestFrequency: DIGEST_VALUES.includes(business.newsDigestFrequency)
      ? business.newsDigestFrequency
      : 'WEEKLY',
    industryDisplay:     business.industryName        ?? '',
  };
}

export function BusinessSettingsModal({ isOpen, onClose, onSaved }) {
  const { business: cachedBusiness, setBusiness } = useAuth();
  const { showToast } = useToast();

  // Form state
  const [form,    setForm]    = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [saving,  setSaving]  = useState(false);

  // Field errors
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');

  // Ref to first focusable field (for focus on error)
  const nameRef = useRef(null);

  /* ------------------------------------------------------------------
   * Load data on open
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!isOpen) return;

    // Clear errors from previous open
    setErrors({});
    setFormError('');

    if (cachedBusiness) {
      setForm(initFormFromBusiness(cachedBusiness));
      setLoading(false);
      return;
    }

    // No cache → fetch from API
    setLoading(true);
    getBusiness()
      .then(business => {
        setBusiness(business);           // cache in AuthContext + sessionStorage
        setForm(initFormFromBusiness(business));
      })
      .catch(() => {
        setFormError('Could not load business settings. Please close and try again.');
      })
      .finally(() => setLoading(false));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------------
   * Input change handler
   * ------------------------------------------------------------------ */
  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
      // Reset frequency when digest is turned off
      ...(name === 'newsDigestEnabled' && !checked
        ? { newsDigestFrequency: 'WEEKLY' }
        : {}),
    }));
    // Clear field error on change
    if (errors[name]) {
      setErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
    }
  }

  /* ------------------------------------------------------------------
   * Submit handler
   * ------------------------------------------------------------------ */
  async function handleSubmit(e) {
    e.preventDefault();
    setErrors({});
    setFormError('');

    const name         = form.name.trim();
    const contactEmail = form.contactEmail.trim();
    const contactPhone = form.contactPhone.trim();
    const address      = form.address.trim();
    const digestOn     = form.newsDigestEnabled;
    const digestFreq   = form.newsDigestFrequency;

    // Client-side validation (mirrors business.validator.js)
    const newErrors = {};
    if (!name || name.length < 2 || name.length > 150) {
      newErrors.name = 'Business name is required (2–150 characters).';
    }
    if (contactEmail && !isEmail(contactEmail).valid) {
      newErrors.contactEmail = 'Please enter a valid email address.';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      nameRef.current?.focus();
      return;
    }

    // Build PUT body — industryId deliberately excluded (backend rejects it)
    const body = {
      name,
      newsDigestEnabled: digestOn,
    };
    if (contactEmail) body.contactEmail = contactEmail;
    if (contactPhone) body.contactPhone = contactPhone;
    if (address)      body.address      = address;
    if (digestOn && DIGEST_VALUES.includes(digestFreq)) {
      body.newsDigestFrequency = digestFreq;
    }

    setSaving(true);
    try {
      const updated = await updateBusiness(body);
      setBusiness(updated);                          // update AuthContext cache
      if (typeof onSaved === 'function') onSaved(updated);
      showToast({ type: 'success', message: 'Business settings updated.' });
      onClose();
    } catch (err) {
      _handleApiError(err, setErrors, setFormError, nameRef);
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------------------------------------------
   * Footer buttons
   * ------------------------------------------------------------------ */
  const footer = (
    <div className="modal__footer-actions">
      <button
        type="button"
        className="btn btn--ghost"
        onClick={onClose}
        disabled={saving}
      >
        Cancel
      </button>
      <button
        type="submit"
        form="bs-form"
        className={`btn btn--primary${saving ? ' btn--loading' : ''}`}
        disabled={saving || loading}
      >
        Save Changes
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={saving ? undefined : onClose}
      title="Business Settings"
      size="md"
      id="business-settings-modal"
      footer={footer}
    >
      {/* Form-level error */}
      {formError && (
        <div
          className="form-alert form-alert--error form-alert--visible"
          role="alert"
          aria-live="assertive"
        >
          <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
          <span className="form-alert__message">{formError}</span>
        </div>
      )}

      {/* Skeleton while loading */}
      {loading && <Skeleton type="panel" rows={5} />}

      {/* Settings form */}
      {!loading && (
        <form id="bs-form" onSubmit={handleSubmit} noValidate autoComplete="on">

          {/* Industry — read-only */}
          <div className="form-group">
            <label className="form-label" htmlFor="bs-industry-display">
              Industry (cannot be changed)
            </label>
            <p id="bs-industry-display" className="form-control--readonly">
              {form.industryDisplay}
            </p>
          </div>

          {/* Business Name — required */}
          <div className="form-group">
            <label className="form-label form-label--required" htmlFor="bs-business-name">
              Business name
            </label>
            <input
              ref={nameRef}
              type="text"
              id="bs-business-name"
              name="name"
              className={`form-control${errors.name ? ' form-control--error' : ''}`}
              placeholder="Your business name"
              autoComplete="organization"
              maxLength={150}
              required
              aria-required="true"
              aria-describedby="bs-business-name-error"
              value={form.name}
              onChange={handleChange}
            />
            {errors.name && (
              <p id="bs-business-name-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                {errors.name}
              </p>
            )}
          </div>

          {/* Contact Email — optional */}
          <div className="form-group">
            <label className="form-label" htmlFor="bs-contact-email">
              Contact email <span className="form-label__optional">(optional)</span>
            </label>
            <input
              type="email"
              id="bs-contact-email"
              name="contactEmail"
              className={`form-control${errors.contactEmail ? ' form-control--error' : ''}`}
              placeholder="business@example.com"
              autoComplete="email"
              inputMode="email"
              aria-describedby="bs-contact-email-error"
              value={form.contactEmail}
              onChange={handleChange}
            />
            {errors.contactEmail && (
              <p id="bs-contact-email-error" className="form-error form-error--visible" role="alert" aria-live="polite">
                {errors.contactEmail}
              </p>
            )}
          </div>

          {/* Contact Phone — optional */}
          <div className="form-group">
            <label className="form-label" htmlFor="bs-contact-phone">
              Contact phone <span className="form-label__optional">(optional)</span>
            </label>
            <input
              type="tel"
              id="bs-contact-phone"
              name="contactPhone"
              className="form-control"
              placeholder="+1 555 000 0000"
              autoComplete="tel"
              value={form.contactPhone}
              onChange={handleChange}
            />
          </div>

          {/* Address — optional */}
          <div className="form-group">
            <label className="form-label" htmlFor="bs-address">
              Address <span className="form-label__optional">(optional)</span>
            </label>
            <textarea
              id="bs-address"
              name="address"
              className="form-control form-control--textarea"
              placeholder="123 Main Street, City, Country"
              rows={3}
              maxLength={500}
              autoComplete="street-address"
              value={form.address}
              onChange={handleChange}
            />
          </div>

          {/* News Digest Enabled — checkbox */}
          <div className="form-group">
            <div className="form-check">
              <input
                type="checkbox"
                id="bs-digest-enabled"
                name="newsDigestEnabled"
                className="form-check__input"
                checked={form.newsDigestEnabled}
                onChange={handleChange}
              />
              <label className="form-check__label" htmlFor="bs-digest-enabled">
                Enable news digest emails
              </label>
            </div>
          </div>

          {/* Digest Frequency — select */}
          <div className="form-group">
            <label className="form-label" htmlFor="bs-digest-frequency">
              Digest frequency
            </label>
            <select
              id="bs-digest-frequency"
              name="newsDigestFrequency"
              className="form-control"
              disabled={!form.newsDigestEnabled}
              value={form.newsDigestFrequency}
              onChange={handleChange}
            >
              {DIGEST_VALUES.map(val => (
                <option key={val} value={val}>
                  {val.charAt(0) + val.slice(1).toLowerCase()}
                </option>
              ))}
            </select>
          </div>

        </form>
      )}
    </Modal>
  );
}

/* ----------------------------------------------------------------
 * API error handler (mirrors _handleError in businessSettings.js)
 * ---------------------------------------------------------------- */
function _handleApiError(err, setErrors, setFormError, nameRef) {
  if (!err?.status) {
    setFormError('Could not save changes. Check your connection.');
    return;
  }
  switch (err.status) {
    case 400:
      if (err.details && Array.isArray(err.details)) {
        const fieldErrors = {};
        let focusField = null;
        err.details.forEach(d => {
          if (d.field === 'name') {
            fieldErrors.name = 'Business name is required (2–150 characters).';
            if (!focusField) focusField = nameRef;
          } else if (d.field === 'contactEmail') {
            fieldErrors.contactEmail = 'Please enter a valid email address.';
          } else if (d.field === 'newsDigestFrequency') {
            setFormError('Invalid digest frequency. Please select Daily, Weekly, or Monthly.');
          }
        });
        setErrors(fieldErrors);
        focusField?.current?.focus();
      } else {
        setFormError(err.message || 'Please check your input and try again.');
      }
      break;
    case 404:
      setFormError('Business profile not found. Please refresh the page.');
      break;
    default:
      setFormError('Something went wrong. Please try again.');
  }
}
