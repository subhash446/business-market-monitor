/**
 * Onboarding page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §4.4, §5.3, §4.10 — pages/onboarding.html
 * Doc 4 §3.1
 *
 * FLOW:
 *  1. requireAuth()  — redirect to login if not authenticated
 *     (requireBusiness() is NOT called — onboarding IS the business creation step)
 *  2. initNav()      — renders sidebar without active nav link
 *  3. Load industries from GET /industries (public)
 *  4. Step 1 — User selects an industry card
 *  5. Step 2 — User fills in business details form
 *  6. POST /business — creates business profile
 *  7. Step 3 — Confirmation shown with materialsGenerated count
 *  8. "Go to Dashboard" → POST /auth/refresh → setTokens() → redirect to dashboard
 *     (Mandatory token refresh — Doc 3 §4.10: stored token still has businessId: null)
 *
 * SECURITY:
 *  - userId comes from the server-side JWT (req.auth.userId) — never from the client
 *  - No eval(), no unsafe innerHTML
 *  - All dynamic text via textContent
 */

import { requireAuth, getRefreshToken, setTokens } from '/js/auth/auth.js';
import { setCachedBusiness } from '/js/auth/session.js';
import { initNav }           from '/js/components/nav.js';
import { showToast }         from '/js/components/toast.js';
import { listIndustries, createBusiness } from '/js/api/business.api.js';
import { post as apiPost }   from '/js/api/client.js';
import { isEmail }           from '/js/utils/validate.js';
import {
  byId,
  show, hide,
  showFieldError, clearFieldError,
  showFormAlert, hideFormAlert,
  startLoading, stopLoading,
  setText, createElement, clearChildren,
} from '/js/utils/dom.js';

// ── 1. Auth guard ─────────────────────────────────────────────────────────────
requireAuth();

// ── 2. Init sidebar nav ───────────────────────────────────────────────────────
// activeHref is intentionally absent — no nav link is active on onboarding (Doc 4 §3.1)
initNav();

// ── Module-level state (persists across Back navigation) ─────────────────────
let selectedIndustryId   = null;
let selectedIndustryName = '';
let createdBusiness      = null; // holds POST /business response data

// ── Element references ────────────────────────────────────────────────────────
const step1El         = byId('step-1');
const step2El         = byId('step-2');
const step3El         = byId('step-3');

const stepItems       = document.querySelectorAll('.step-indicator__item');

const industryGrid    = byId('industry-grid');
const step1ContinueBtn = byId('step1-continue-btn');
const step1Error      = byId('step1-error');

// Step 2
const obForm          = byId('ob-form');
const bizNameInput    = byId('ob-business-name');
const bizNameError    = byId('ob-business-name-error');
const contactEmailInput = byId('ob-contact-email');
const contactEmailError = byId('ob-contact-email-error');
const contactPhoneInput = byId('ob-contact-phone');
const addressInput    = byId('ob-address');
const obFormError     = byId('ob-form-error');
const step2BackBtn    = byId('step2-back-btn');
const createBtn       = byId('ob-create-btn');

// Step 3
const step3BusinessName    = byId('ob-created-name');
const step3MaterialsCount  = byId('ob-materials-count');
const gotoDashboardBtn     = byId('ob-goto-dashboard-btn');
const step3Error           = byId('ob-step3-error');

// ── Industry icon map (Doc 4 §3.1) ───────────────────────────────────────────
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

/* ================================================================
 * STEP MANAGEMENT
 * ================================================================ */

function goToStep(n) {
  [step1El, step2El, step3El].forEach((el, i) => {
    if (!el) return;
    el.classList.toggle('onboarding-step--active', i + 1 === n);
  });

  stepItems.forEach((item, i) => {
    item.classList.remove('step-indicator__item--active', 'step-indicator__item--complete');
    if (i + 1 < n)  item.classList.add('step-indicator__item--complete');
    if (i + 1 === n) item.classList.add('step-indicator__item--active');
  });

  // Scroll to top of main content for mobile
  document.querySelector('.main-content')?.scrollTo(0, 0);
  window.scrollTo(0, 0);
}

/* ================================================================
 * STEP 1 — Industry Selection
 * ================================================================ */

async function loadIndustries() {
  // Show 5 skeleton cards while loading
  _renderSkeletons(5);

  if (step1ContinueBtn) step1ContinueBtn.disabled = true;
  if (step1Error) hide(step1Error);

  try {
    const industries = await listIndustries();
    _renderIndustryCards(industries);
  } catch (err) {
    _renderIndustryError();
  }
}

function _renderSkeletons(count) {
  if (!industryGrid) return;
  clearChildren(industryGrid);
  for (let i = 0; i < count; i++) {
    const skel = createElement('div', {
      className: 'industry-card-skeleton skeleton',
    });
    industryGrid.appendChild(skel);
  }
}

function _renderIndustryCards(industries) {
  if (!industryGrid) return;
  clearChildren(industryGrid);

  if (!industries || industries.length === 0) {
    _renderIndustryError('No industries available. Please try again.');
    return;
  }

  industries.forEach((industry) => {
    const btn = document.createElement('button');
    btn.type      = 'button';
    btn.className = 'industry-card';
    btn.setAttribute('role', 'button');
    btn.setAttribute('aria-pressed', 'false');
    btn.dataset.industryId = industry.id;

    // Icon
    const iconEl = createElement('span', { className: 'industry-card__icon' });
    const i      = createElement('i', {
      className: getIndustryIcon(industry.name),
      attrs:     { 'aria-hidden': 'true' },
    });
    iconEl.appendChild(i);

    // Name
    const nameEl = createElement('span', {
      className: 'industry-card__name',
      text:      industry.name,
    });

    // Description
    const descEl = createElement('span', {
      className: 'industry-card__description',
      text:      industry.description ?? '',
    });

    btn.appendChild(iconEl);
    btn.appendChild(nameEl);
    btn.appendChild(descEl);

    btn.addEventListener('click', () => _selectIndustry(btn, industry));
    industryGrid.appendChild(btn);
  });

  // Restore previously selected industry if user came back from step 2
  if (selectedIndustryId) {
    const prevBtn = industryGrid.querySelector(`[data-industry-id="${selectedIndustryId}"]`);
    if (prevBtn) _selectIndustry(prevBtn, { id: selectedIndustryId, name: selectedIndustryName });
  }
}

function _renderIndustryError(message) {
  if (!industryGrid) return;
  clearChildren(industryGrid);

  const wrapper = createElement('div', { className: 'error-state' });

  const iconDiv = createElement('div', { className: 'error-state__icon' });
  const icon    = createElement('i', { className: 'fa-solid fa-circle-exclamation', attrs: { 'aria-hidden': 'true' } });
  iconDiv.appendChild(icon);

  const title = createElement('h3', {
    className: 'error-state__title',
    text:      'Could not load industries',
  });

  const msg = createElement('p', {
    className: 'error-state__message',
    text:      message ?? 'Please check your connection and try again.',
  });

  const actionDiv = createElement('div', { className: 'error-state__action' });
  const retryBtn  = createElement('button', {
    className: 'btn btn--secondary btn--sm',
    text:      'Try again',
    attrs:     { type: 'button' },
  });
  retryBtn.addEventListener('click', loadIndustries);
  actionDiv.appendChild(retryBtn);

  wrapper.appendChild(iconDiv);
  wrapper.appendChild(title);
  wrapper.appendChild(msg);
  wrapper.appendChild(actionDiv);

  industryGrid.appendChild(wrapper);
}

function _selectIndustry(btn, industry) {
  // Deselect all
  industryGrid?.querySelectorAll('.industry-card').forEach((card) => {
    card.classList.remove('industry-card--selected');
    card.setAttribute('aria-pressed', 'false');
  });

  // Select clicked
  btn.classList.add('industry-card--selected');
  btn.setAttribute('aria-pressed', 'true');

  selectedIndustryId   = industry.id;
  selectedIndustryName = industry.name;

  if (step1ContinueBtn) step1ContinueBtn.disabled = false;
}

// Step 1 → Step 2
step1ContinueBtn?.addEventListener('click', () => {
  if (!selectedIndustryId) return;
  goToStep(2);
  bizNameInput?.focus();
});

/* ================================================================
 * STEP 2 — Business Details
 * ================================================================ */

// Real-time error clearing
bizNameInput?.addEventListener('input', () => {
  clearFieldError(bizNameInput, bizNameError);
  hideFormAlert(obFormError);
});

contactEmailInput?.addEventListener('input', () => {
  clearFieldError(contactEmailInput, contactEmailError);
  hideFormAlert(obFormError);
});

// Back button
step2BackBtn?.addEventListener('click', () => goToStep(1));

// Form submit
obForm?.addEventListener('submit', async (e) => {
  e.preventDefault();

  clearFieldError(bizNameInput, bizNameError);
  clearFieldError(contactEmailInput, contactEmailError);
  hideFormAlert(obFormError);

  const name         = bizNameInput?.value.trim()        ?? '';
  const contactEmail = contactEmailInput?.value.trim()   ?? '';
  const contactPhone = contactPhoneInput?.value.trim()   ?? '';
  const address      = addressInput?.value.trim()        ?? '';

  // ── Client-side validation (mirrors business.validator.js) ───────────────
  let hasError = false;

  // name: required, 2–150 chars (Doc 4 §3.1 says 2–150; backend MAX_NAME_LENGTH=200;
  // frontend applies the stricter 150 from the UI spec)
  if (!name || name.length < 2 || name.length > 150) {
    showFieldError(bizNameInput, bizNameError, 'Business name is required (2–150 characters).');
    hasError = true;
  }

  // contactEmail: optional, but valid format if provided
  if (contactEmail && !isEmail(contactEmail).valid) {
    showFieldError(contactEmailInput, contactEmailError, 'Please enter a valid email address.');
    hasError = true;
  }

  if (hasError) {
    bizNameInput?.focus();
    return;
  }

  startLoading(createBtn);

  // Build request body — only include optional fields when non-empty
  const body = { name, industryId: selectedIndustryId };
  if (contactEmail)  body.contactEmail  = contactEmail;
  if (contactPhone)  body.contactPhone  = contactPhone;
  if (address)       body.address       = address;

  try {
    // POST /api/v1/business — { name, industryId, contactEmail?, contactPhone?, address? }
    const result = await createBusiness(body);
    createdBusiness = result;

    // Cache the business data for the sidebar / session
    setCachedBusiness({
      id:         result.id,
      name:       result.name,
      industryId: result.industryId,
    });

    // Show step 3 confirmation
    _showStep3(result);

  } catch (err) {
    stopLoading(createBtn);
    _handleCreateError(err);
  }
});

function _handleCreateError(err) {
  if (!err.status) {
    showFormAlert(obFormError, 'Could not connect to the server. Check your connection.');
    return;
  }

  switch (err.status) {
    case 409:
      // User already has a business — rare (guard on login) but handled
      hideFormAlert(obFormError);
      if (obFormError) {
        show(obFormError);
        // Build message + dashboard link via DOM (no innerHTML)
        clearChildren(obFormError);

        const icon = createElement('i', {
          className: 'fa-solid fa-circle-exclamation',
          attrs: { 'aria-hidden': 'true' },
        });
        const msgSpan = createElement('span', {
          className: 'form-alert__message',
          text: 'You already have a business profile. ',
        });
        const link = createElement('a', {
          text: 'Go to Dashboard',
          attrs: { href: '/pages/dashboard.html' },
        });
        msgSpan.appendChild(link);
        obFormError.appendChild(icon);
        obFormError.appendChild(msgSpan);
        obFormError.classList.add('form-alert--error', 'form-alert--visible');
      }
      break;

    case 400:
      if (err.details && Array.isArray(err.details)) {
        let firstEl = null;
        err.details.forEach((d) => {
          if (d.field === 'name') {
            showFieldError(bizNameInput, bizNameError, 'Business name is required (2–150 characters).');
            if (!firstEl) firstEl = bizNameInput;
          } else if (d.field === 'contactEmail') {
            showFieldError(contactEmailInput, contactEmailError, 'Please enter a valid email address.');
            if (!firstEl) firstEl = contactEmailInput;
          }
        });
        firstEl?.focus();
      } else {
        showFormAlert(obFormError, err.message || 'Please check your details and try again.');
      }
      break;

    default:
      showFormAlert(obFormError, 'Something went wrong. Please try again.');
  }
}

/* ================================================================
 * STEP 3 — Confirmation
 * ================================================================ */

function _showStep3(result) {
  goToStep(3);

  // Populate confirmation details — textContent only (no innerHTML)
  if (step3BusinessName)   setText(step3BusinessName, result.name);
  if (step3MaterialsCount) setText(step3MaterialsCount, String(result.materialsGenerated ?? 0));

  if (step3Error) hide(step3Error);
  gotoDashboardBtn?.focus();
}

// "Go to Dashboard" → POST /auth/refresh → setTokens → redirect (Doc 3 §4.10)
gotoDashboardBtn?.addEventListener('click', async () => {
  if (step3Error) hide(step3Error);
  startLoading(gotoDashboardBtn);

  const refreshToken = getRefreshToken();

  try {
    // POST /api/v1/auth/refresh — { refreshToken }
    // Mandatory: existing token has businessId: null; new token will have the created businessId
    const res  = await apiPost('/auth/refresh', { refreshToken }, { skipAuth: true });
    const data = res.data;

    if (!data?.accessToken) {
      throw new Error('No access token in refresh response');
    }

    // Store updated tokens — new access token contains the real businessId
    setTokens(data.accessToken, refreshToken);

    // Redirect to dashboard
    window.location.href = '/pages/dashboard.html';

  } catch (err) {
    stopLoading(gotoDashboardBtn);

    if (step3Error) {
      show(step3Error);
      const msgEl = step3Error.querySelector('.form-alert__message') ?? step3Error;
      clearChildren(msgEl);

      // Build: "Failed to refresh your session. Please <a>sign in again</a>."
      const text = document.createTextNode('Failed to refresh your session. Please ');
      const link = createElement('a', {
        text:  'sign in again',
        attrs: { href: '/pages/login.html' },
      });
      const period = document.createTextNode('.');
      msgEl.appendChild(text);
      msgEl.appendChild(link);
      msgEl.appendChild(period);
    }
  }
});

// ── Bootstrap: load industries on page load ───────────────────────────────────
goToStep(1);
loadIndustries();
