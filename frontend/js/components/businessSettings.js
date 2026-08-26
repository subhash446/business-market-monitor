/**
 * Business Settings Modal
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §5.4, Doc 4 §3.2 — js/components/businessSettings.js
 *
 * Entry point: openSettingsModal() — called dynamically by nav.js _wireSettings().
 *
 * BACKEND CONTRACT (confirmed from backend source):
 *   GET /api/v1/business  → { id, name, industryId, industryName, contactEmail,
 *                              contactPhone, address, newsDigestEnabled, newsDigestFrequency }
 *   PUT /api/v1/business  → body: { name, contactEmail?, contactPhone?, address?,
 *                                   newsDigestEnabled?, newsDigestFrequency? }
 *                           industryId MUST NOT be sent (rejected by validator)
 *   Validation (business.validator.js):
 *     - name: required, max 200 chars backend / 2–150 frontend (Doc 4 §3.2)
 *     - contactEmail: optional, valid email if provided
 *     - newsDigestFrequency: 'DAILY'|'WEEKLY'|'MONTHLY' if present
 *     - industryId: REJECTED on PUT — validator.js line 51
 *
 * SECURITY:
 *   - No userId in request body (server reads from JWT)
 *   - No unsafe innerHTML in runtime code
 *   - No eval()
 *   - industryId never sent in PUT body
 */

import { createModal, openModal, closeModal } from './modal.js';
import { showToast }                           from './toast.js';
import { getBusiness, updateBusiness }         from '/js/api/business.api.js';
import { getCachedBusiness, setCachedBusiness } from '/js/auth/session.js';
import { isEmail }                             from '/js/utils/validate.js';
import {
  show, hide,
  showFieldError, clearFieldError,
  showFormAlert, hideFormAlert,
  startLoading, stopLoading,
  setText, createElement,
} from '/js/utils/dom.js';

/* ================================================================
 * CONSTANTS
 * ================================================================ */

const MODAL_ID      = 'business-settings-modal';
const DIGEST_VALUES = ['DAILY', 'WEEKLY', 'MONTHLY'];

/* ================================================================
 * MODULE STATE
 * ================================================================ */

let _built    = false; // true after createModal() has been called once
let _formRefs = null;  // populated after modal is in DOM

/* ================================================================
 * PUBLIC API
 * ================================================================ */

/**
 * Open the Business Settings modal.
 * Builds the modal DOM on first invocation; reuses it thereafter.
 * Called by nav.js _wireSettings() dynamically.
 */
export function openSettingsModal() {
  if (!_built) {
    _initModal();
    _built = true;
  }
  _resetErrors();
  openModal(MODAL_ID);
  _loadAndPopulate();
}

/* ================================================================
 * MODAL INIT (once)
 * ================================================================ */

function _initModal() {
  const content = _buildContent();
  const footer  = _buildFooter();

  createModal({
    id:      MODAL_ID,
    title:   'Business Settings',
    content,
    footer,
    size:    'md',
  });

  // Wire interactions after the DOM is ready
  requestAnimationFrame(() => {
    _resolveRefs();
    _wireDigestToggle();
    _wireFormSubmit();
  });
}

/* ── Content (modal body) ─────────────────────────────────────────────────── */

function _buildContent() {
  const wrapper = createElement('div', { className: 'bs-modal-content' });

  // Skeleton (visible while loading)
  const skeleton = createElement('div', { attrs: { id: 'bs-skeleton', class: 'bs-skeleton' } });
  for (let i = 0; i < 5; i++) {
    skeleton.appendChild(createElement('div', { className: 'skeleton skeleton--line' }));
  }
  wrapper.appendChild(skeleton);

  // Form-level error alert
  const formError = createElement('div', {
    attrs: {
      id:          'bs-form-error',
      class:       'form-alert form-alert--error',
      role:        'alert',
      'aria-live': 'assertive',
    },
  });
  formError.appendChild(createElement('i', {
    className: 'fa-solid fa-circle-exclamation',
    attrs:     { 'aria-hidden': 'true' },
  }));
  formError.appendChild(createElement('span', { className: 'form-alert__message' }));
  wrapper.appendChild(formError);

  // Form
  const form = createElement('form', {
    attrs: { id: 'bs-form', novalidate: '', autocomplete: 'on' },
  });

  // Industry (read-only)
  form.appendChild(_fg([
    _label('Industry (cannot be changed)', 'bs-industry-display'),
    createElement('p', { attrs: { id: 'bs-industry-display', class: 'form-control--readonly' } }),
  ]));

  // Business Name — required
  form.appendChild(_fg([
    _label('Business name', 'bs-business-name', true),
    createElement('input', {
      attrs: {
        type:             'text',
        id:               'bs-business-name',
        name:             'name',
        class:            'form-control',
        placeholder:      'Your business name',
        autocomplete:     'organization',
        maxlength:        '150',
        required:         '',
        'aria-required':  'true',
        'aria-describedby': 'bs-business-name-error',
      },
    }),
    createElement('p', { attrs: { id: 'bs-business-name-error', class: 'form-error', role: 'alert', 'aria-live': 'polite' } }),
  ]));

  // Contact Email — optional
  form.appendChild(_fg([
    _optLabel('Contact email', 'bs-contact-email'),
    createElement('input', {
      attrs: {
        type:           'email',
        id:             'bs-contact-email',
        name:           'contactEmail',
        class:          'form-control',
        placeholder:    'business@example.com',
        autocomplete:   'email',
        inputmode:      'email',
        'aria-describedby': 'bs-contact-email-error',
      },
    }),
    createElement('p', { attrs: { id: 'bs-contact-email-error', class: 'form-error', role: 'alert', 'aria-live': 'polite' } }),
  ]));

  // Contact Phone — optional
  form.appendChild(_fg([
    _optLabel('Contact phone', 'bs-contact-phone'),
    createElement('input', {
      attrs: {
        type:         'tel',
        id:           'bs-contact-phone',
        name:         'contactPhone',
        class:        'form-control',
        placeholder:  '+1 555 000 0000',
        autocomplete: 'tel',
      },
    }),
  ]));

  // Address — optional textarea
  form.appendChild(_fg([
    _optLabel('Address', 'bs-address'),
    createElement('textarea', {
      attrs: {
        id:           'bs-address',
        name:         'address',
        class:        'form-control form-control--textarea',
        placeholder:  '123 Main Street, City, Country',
        rows:         '3',
        maxlength:    '500',
        autocomplete: 'street-address',
      },
    }),
  ]));

  // News Digest Enabled — checkbox
  const checkWrapper = createElement('div', { className: 'form-check' });
  const digestCheck  = createElement('input', {
    attrs: { type: 'checkbox', id: 'bs-digest-enabled', class: 'form-check__input' },
  });
  const checkLabel = createElement('label', {
    className: 'form-check__label',
    text:      'Enable news digest emails',
    attrs:     { for: 'bs-digest-enabled' },
  });
  checkWrapper.appendChild(digestCheck);
  checkWrapper.appendChild(checkLabel);
  form.appendChild(_fg([checkWrapper]));

  // Digest Frequency — select
  const freqSelect = createElement('select', {
    attrs: { id: 'bs-digest-frequency', class: 'form-control', disabled: '' },
  });
  DIGEST_VALUES.forEach((val) => {
    const label = val.charAt(0) + val.slice(1).toLowerCase(); // 'DAILY' → 'Daily'
    freqSelect.appendChild(createElement('option', { text: label, attrs: { value: val } }));
  });
  form.appendChild(_fg([
    _label('Digest frequency', 'bs-digest-frequency'),
    freqSelect,
  ]));

  wrapper.appendChild(form);
  return wrapper;
}

/* ── Footer ────────────────────────────────────────────────────────────────── */

function _buildFooter() {
  const footer = createElement('div', { className: 'modal__footer-actions' });

  const cancelBtn = createElement('button', {
    text:  'Cancel',
    attrs: { type: 'button', id: 'bs-cancel-btn', class: 'btn btn--ghost' },
  });
  const saveBtn = createElement('button', {
    text:  'Save Changes',
    attrs: { type: 'submit', id: 'bs-save-btn', form: 'bs-form', class: 'btn btn--primary' },
  });

  cancelBtn.addEventListener('click', () => {
    // Disallow dismissal while saving
    const sb = document.getElementById('bs-save-btn');
    if (!sb?.disabled) closeModal(MODAL_ID);
  });

  footer.appendChild(cancelBtn);
  footer.appendChild(saveBtn);
  return footer;
}

/* ── Field helpers ─────────────────────────────────────────────────────────── */

/** Wrap children in a .form-group div */
function _fg(children) {
  const g = createElement('div', { className: 'form-group' });
  children.forEach((c) => c && g.appendChild(c));
  return g;
}

/** Required label */
function _label(text, forId, required = false) {
  const lbl = createElement('label', {
    className: required ? 'form-label form-label--required' : 'form-label',
    attrs:     { for: forId },
  });
  lbl.textContent = text;
  return lbl;
}

/** Optional label with "(optional)" span */
function _optLabel(text, forId) {
  const lbl = createElement('label', { className: 'form-label', attrs: { for: forId } });
  lbl.appendChild(document.createTextNode(text));
  lbl.appendChild(createElement('span', { className: 'form-label__optional', text: ' (optional)' }));
  return lbl;
}

/* ================================================================
 * RESOLVE DOM REFS (after modal is in body)
 * ================================================================ */

function _resolveRefs() {
  _formRefs = {
    skeleton:          document.getElementById('bs-skeleton'),
    formError:         document.getElementById('bs-form-error'),
    formErrorMsg:      document.querySelector('#bs-form-error .form-alert__message'),
    form:              document.getElementById('bs-form'),
    industryDisplay:   document.getElementById('bs-industry-display'),
    bizName:           document.getElementById('bs-business-name'),
    bizNameError:      document.getElementById('bs-business-name-error'),
    contactEmail:      document.getElementById('bs-contact-email'),
    contactEmailError: document.getElementById('bs-contact-email-error'),
    contactPhone:      document.getElementById('bs-contact-phone'),
    address:           document.getElementById('bs-address'),
    digestEnabled:     document.getElementById('bs-digest-enabled'),
    digestFreq:        document.getElementById('bs-digest-frequency'),
    saveBtn:           document.getElementById('bs-save-btn'),
    cancelBtn:         document.getElementById('bs-cancel-btn'),
  };
}

/* ================================================================
 * DIGEST TOGGLE
 * ================================================================ */

function _wireDigestToggle() {
  const check = document.getElementById('bs-digest-enabled');
  const freq  = document.getElementById('bs-digest-frequency');
  if (!check || !freq) return;

  check.addEventListener('change', () => {
    freq.disabled = !check.checked;
    if (!check.checked) freq.value = 'WEEKLY';
  });
}

/* ================================================================
 * LOAD & POPULATE
 * ================================================================ */

async function _loadAndPopulate() {
  _resolveRefs();
  const r = _formRefs;
  if (!r) return;

  const cached = getCachedBusiness();
  if (cached) {
    _populate(cached);
    _hideSkeletonShowForm();
    return;
  }

  // No cache — fetch from API, show skeleton while loading
  _showSkeletonHideForm();
  hideFormAlert(r.formError);

  try {
    const business = await getBusiness();
    setCachedBusiness(business);
    _populate(business);
    _hideSkeletonShowForm();
  } catch {
    _showSkeletonHideForm();
    _showFormErr('Could not load business settings. Please close and try again.');
  }
}

function _showSkeletonHideForm() {
  const r = _formRefs;
  if (r?.skeleton) show(r.skeleton);
  if (r?.form)     hide(r.form);
}

function _hideSkeletonShowForm() {
  const r = _formRefs;
  if (r?.skeleton) hide(r.skeleton);
  if (r?.form)     show(r.form);
}

/**
 * Populate all form fields from a business object.
 * All mutations via .value or .textContent — no innerHTML.
 */
function _populate(business) {
  const r = _formRefs;
  if (!r) return;

  if (r.industryDisplay) r.industryDisplay.textContent = business.industryName ?? '';
  if (r.bizName)         r.bizName.value              = business.name          ?? '';
  if (r.contactEmail)    r.contactEmail.value          = business.contactEmail  ?? '';
  if (r.contactPhone)    r.contactPhone.value          = business.contactPhone  ?? '';
  if (r.address)         r.address.value               = business.address       ?? '';

  const enabled = !!business.newsDigestEnabled;
  if (r.digestEnabled) r.digestEnabled.checked  = enabled;
  if (r.digestFreq) {
    r.digestFreq.disabled = !enabled;
    const freq = business.newsDigestFrequency;
    if (freq && DIGEST_VALUES.includes(freq)) r.digestFreq.value = freq;
  }
}

/* ================================================================
 * RESET (clear errors on open, preserve values)
 * ================================================================ */

function _resetErrors() {
  _resolveRefs();
  const r = _formRefs;
  if (!r) return;
  if (r.formError)  hideFormAlert(r.formError);
  if (r.bizName)    clearFieldError(r.bizName, r.bizNameError);
  if (r.contactEmail) clearFieldError(r.contactEmail, r.contactEmailError);
}

/* ================================================================
 * FORM SUBMIT
 * ================================================================ */

function _wireFormSubmit() {
  const form = document.getElementById('bs-form');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    _resolveRefs();
    const r = _formRefs;
    if (!r) return;

    // Clear previous errors
    clearFieldError(r.bizName, r.bizNameError);
    clearFieldError(r.contactEmail, r.contactEmailError);
    hideFormAlert(r.formError);

    const name         = (r.bizName?.value       ?? '').trim();
    const contactEmail = (r.contactEmail?.value   ?? '').trim();
    const contactPhone = (r.contactPhone?.value   ?? '').trim();
    const address      = (r.address?.value        ?? '').trim();
    const digestOn     = !!r.digestEnabled?.checked;
    const digestFreq   = r.digestFreq?.value ?? 'WEEKLY';

    // ── Validation (mirrors business.validator.js) ───────────────────────────
    let hasError = false;

    if (!name || name.length < 2 || name.length > 150) {
      showFieldError(r.bizName, r.bizNameError, 'Business name is required (2–150 characters).');
      hasError = true;
    }

    if (contactEmail && !isEmail(contactEmail).valid) {
      showFieldError(r.contactEmail, r.contactEmailError, 'Please enter a valid email address.');
      hasError = true;
    }

    if (hasError) {
      r.bizName?.focus();
      return;
    }

    // ── Loading state ────────────────────────────────────────────────────────
    startLoading(r.saveBtn);
    if (r.cancelBtn) r.cancelBtn.disabled = true;

    // ── Build request body — exactly what PUT /business accepts ──────────────
    // industryId deliberately EXCLUDED (backend rejects it — business.validator.js line 51)
    const body = {
      name,
      newsDigestEnabled: digestOn,
    };
    if (contactEmail)  body.contactEmail  = contactEmail;
    if (contactPhone)  body.contactPhone  = contactPhone;
    if (address)       body.address       = address;
    if (digestOn && DIGEST_VALUES.includes(digestFreq)) {
      body.newsDigestFrequency = digestFreq;
    }

    try {
      // PUT /api/v1/business
      const updated = await updateBusiness(body);

      // Update session cache (Doc 3 §8.2)
      setCachedBusiness(updated);

      // Re-populate so modal reflects saved state if reopened
      _populate(updated);

      // Success feedback
      showToast({ type: 'success', message: 'Business settings updated.' });

      // Close modal — stopLoading not needed (modal closes)
      closeModal(MODAL_ID);

    } catch (err) {
      stopLoading(r.saveBtn);
      if (r.cancelBtn) r.cancelBtn.disabled = false;
      _handleError(err);
    }
  });
}

/* ── Error handler ─────────────────────────────────────────────────────────── */

function _handleError(err) {
  const r = _formRefs;

  if (!err?.status) {
    _showFormErr('Could not save changes. Check your connection.');
    return;
  }

  switch (err.status) {
    case 400:
      if (err.details && Array.isArray(err.details)) {
        let firstEl = null;
        err.details.forEach((d) => {
          if (d.field === 'name') {
            showFieldError(r?.bizName, r?.bizNameError, 'Business name is required (2–150 characters).');
            if (!firstEl) firstEl = r?.bizName;
          } else if (d.field === 'contactEmail') {
            showFieldError(r?.contactEmail, r?.contactEmailError, 'Please enter a valid email address.');
            if (!firstEl) firstEl = r?.contactEmail;
          } else if (d.field === 'newsDigestFrequency') {
            _showFormErr('Invalid digest frequency. Please select Daily, Weekly, or Monthly.');
          }
        });
        firstEl?.focus();
      } else {
        _showFormErr(err.message || 'Please check your input and try again.');
      }
      break;

    case 404:
      _showFormErr('Business profile not found. Please refresh the page.');
      break;

    default:
      _showFormErr('Something went wrong. Please try again.');
  }
}

function _showFormErr(message) {
  const r = _formRefs;
  if (!r?.formError) return;
  if (r.formErrorMsg) setText(r.formErrorMsg, message);
  showFormAlert(r.formError, message);
}
