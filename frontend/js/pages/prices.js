/**
 * Prices page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §5.6, Doc 4 §5.1 — js/pages/prices.js
 *
 * FLOW:
 *  1. requireAuth() + requireBusiness()
 *  2. initNav({ pageTitle: 'Log Price', activeHref: '/pages/prices.html' })
 *  3. Read ?materialId from URL → if absent, redirect to /pages/materials.html
 *  4. Promise.all([GET /materials, GET /materials/:id/prices/latest])
 *  5. Find material in list by materialId
 *     → if not found: show not-found state, stop
 *  6. Render material header (name + unit badge)
 *  7. Render current price panel
 *     → 200 data: show price + recordedAt (formatted)
 *     → null (404 from API): show "No price recorded yet" (informational, NOT error-state component)
 *  8. Pre-populate #pe-date with today's date
 *  9. Price entry form submit → POST /materials/:id/prices { price, recordedAt }
 *    → success: toast "Price logged successfully.", update current price panel in-place, reset form
 *    → 400: field errors
 *    → 404: not-found state
 *    → network: form alert
 *
 * BACKEND RESPONSE FIELDS:
 *   Latest price: { price: number, recordedAt: string, source: string }
 *   NO unit field in price response — unit comes from material.unit
 *   POST response: { id, price, recordedAt, source }
 *
 * SECURITY:
 *   No userId in requests.
 *   No innerHTML with API data — textContent / createElement only.
 *   No eval().
 */

import { requireAuth, requireBusiness }  from '/js/auth/auth.js';
import { initNav }                       from '/js/components/nav.js';
import { showSkeleton, hideSkeleton }    from '/js/components/loader.js';
import { showToast }                     from '/js/components/toast.js';
import { getMaterials }                  from '/js/api/materials.api.js';
import { getLatestPrice, logPrice }      from '/js/api/prices.api.js';
import { formatNumber, formatDate,
         toIsoDateString }               from '/js/utils/format.js';
import { byId, show, hide,
         showFieldError, clearFieldError,
         showFormAlert, hideFormAlert,
         getParam }                      from '/js/utils/dom.js';

// ── Auth guards ────────────────────────────────────────────────────────────────
requireAuth();
requireBusiness();

// ── Nav ────────────────────────────────────────────────────────────────────────
initNav({ pageTitle: 'Log Price', activeHref: '/pages/prices.html' });

// ── URL param ─────────────────────────────────────────────────────────────────
// If absent → redirect to materials
const materialId = getParam('materialId');
if (!materialId) {
  window.location.replace('/pages/materials.html');
}

// ── Element references ─────────────────────────────────────────────────────────
const mainContent         = byId('main-content');
const pricePageContent    = byId('price-page-content');
const priceNotFound       = byId('price-not-found');
const materialNameEl      = byId('price-material-name');
const unitBadgeEl         = byId('price-unit-badge');
const currentPricePanel   = byId('current-price-panel');
const currentPriceValue   = byId('current-price-value');
const currentPriceDate    = byId('current-price-date');
const currentPriceNoData  = byId('current-price-no-data');
const priceForm           = byId('price-entry-form');
const pePrice             = byId('pe-price');
const pePriceError        = byId('pe-price-error');
const peDate              = byId('pe-date');
const peDateError         = byId('pe-date-error');
const peFormAlert         = byId('pe-form-error');
const peSubmitBtn         = byId('pe-submit-btn');

/* ================================================================
 * CURRENT PRICE PANEL — render or update
 *
 * latestPrice is { price, recordedAt, source } | null
 * null means "no price recorded yet" — informational notice inside
 * the panel, NOT the error-state component (Doc 4 §5.1)
 * ================================================================ */

function _renderCurrentPrice(latestPrice) {
  if (!currentPricePanel) return;

  if (latestPrice === null) {
    // No price yet — informational notice (not an error)
    if (currentPriceValue)  hide(currentPriceValue);
    if (currentPriceDate)   hide(currentPriceDate);
    if (currentPriceNoData) {
      currentPriceNoData.textContent = 'No price recorded yet for this material.';
      show(currentPriceNoData);
    }
  } else {
    if (currentPriceNoData) hide(currentPriceNoData);

    // price is a scalar number from the backend
    if (currentPriceValue) {
      currentPriceValue.textContent = formatNumber(latestPrice.price, 2);
      show(currentPriceValue);
    }
    // recordedAt is ISO datetime string
    if (currentPriceDate) {
      currentPriceDate.textContent = formatDate(latestPrice.recordedAt);
      show(currentPriceDate);
    }
  }
}

/* ================================================================
 * MATERIAL HEADER — name + unit badge
 * Unit comes from material.unit (NOT from price response)
 * ================================================================ */

function _renderMaterialHeader(material) {
  if (materialNameEl) materialNameEl.textContent = material.name;
  if (unitBadgeEl)    unitBadgeEl.textContent    = material.unit;
}

/* ================================================================
 * NOT-FOUND STATE — full page (material absent or removed)
 * ================================================================ */

function _showNotFound() {
  if (pricePageContent) hide(pricePageContent);
  if (priceNotFound)    show(priceNotFound);
}

/* ================================================================
 * PRICE ENTRY FORM — submit handler
 * POST /api/v1/materials/:materialId/prices
 * Body: { price: number, recordedAt: string }  — both required
 * ================================================================ */

// Pre-populate date to today on load
if (peDate) {
  peDate.value = toIsoDateString(new Date());
}

if (priceForm) {
  priceForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    let valid = true;

    // Validate price
    const rawPrice = pePrice ? parseFloat(pePrice.value) : NaN;
    if (!pePrice?.value || isNaN(rawPrice) || rawPrice <= 0) {
      if (pePrice && pePriceError) showFieldError(pePrice, pePriceError, 'Price must be a positive number.');
      valid = false;
    } else {
      if (pePrice && pePriceError) clearFieldError(pePrice, pePriceError);
    }

    // Validate date — required, not future
    const rawDate = peDate ? peDate.value : '';
    if (!rawDate) {
      if (peDate && peDateError) showFieldError(peDate, peDateError, 'Date cannot be in the future.');
      valid = false;
    } else {
      const d = new Date(rawDate);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // allow same-day
      if (d.getTime() > today.getTime()) {
        if (peDate && peDateError) showFieldError(peDate, peDateError, 'Date cannot be in the future.');
        valid = false;
      } else {
        if (peDate && peDateError) clearFieldError(peDate, peDateError);
      }
    }

    if (!valid) return;

    if (peFormAlert) hideFormAlert(peFormAlert);
    if (peSubmitBtn) { peSubmitBtn.classList.add('btn--loading'); peSubmitBtn.disabled = true; }

    try {
      // POST /api/v1/materials/:materialId/prices
      // Body: { price: number, recordedAt: string }
      const created = await logPrice(materialId, {
        price:      rawPrice,
        recordedAt: rawDate,
      });

      // Success (Doc 4 §5.1):
      // 1. Toast
      showToast({ type: 'success', message: 'Price logged successfully.' });

      // 2. Update current price panel in-place — no full reload
      _renderCurrentPrice({ price: created.price, recordedAt: created.recordedAt, source: created.source });

      // 3. Reset form: clear price, keep date at today
      if (pePrice) pePrice.value = '';
      if (peDate)  peDate.value  = toIsoDateString(new Date());

    } catch (err) {
      if (err?.status === 400) {
        // Field-level errors from validator
        const errors = err?.errors ?? [];
        const priceErr = errors.find(e => e.field === 'price');
        const dateErr  = errors.find(e => e.field === 'recordedAt');
        if (priceErr && pePrice && pePriceError) showFieldError(pePrice, pePriceError, 'Price must be a positive number.');
        if (dateErr  && peDate  && peDateError)  showFieldError(peDate,  peDateError,  'Date cannot be in the future.');
        if (!priceErr && !dateErr && peFormAlert) {
          showFormAlert(peFormAlert, 'Please check your inputs and try again.');
        }
      } else if (err?.status === 404) {
        // Material not found or not tracked
        _showNotFound();
      } else {
        if (peFormAlert) showFormAlert(peFormAlert, 'Could not log price. Check your connection.');
      }
    } finally {
      if (peSubmitBtn) { peSubmitBtn.classList.remove('btn--loading'); peSubmitBtn.disabled = false; }
    }
  });
}

/* ================================================================
 * PAGE LOAD — fetch materials + latest price in parallel
 * ================================================================ */

async function loadPage() {
  if (!materialId) return; // already redirected above

  // Show skeleton in current price panel while loading
  if (currentPricePanel) showSkeleton(currentPricePanel, { rows: 1, type: 'list' });

  try {
    // Parallel: GET /materials (for name/unit) + GET /prices/latest
    const [materials, latestPrice] = await Promise.all([
      getMaterials(),
      getLatestPrice(materialId), // returns null on 404 (semantic empty)
    ]);

    // Find material in the list by id
    const material = materials.find(
      (m) => String(m.id) === String(materialId)
    );

    if (!material) {
      // Material not in list → not-found state
      if (currentPricePanel) hideSkeleton(currentPricePanel);
      _showNotFound();
      return;
    }

    // Render header (name + unit — unit from material, not from price)
    _renderMaterialHeader(material);

    // Render current price panel
    if (currentPricePanel) hideSkeleton(currentPricePanel);
    _renderCurrentPrice(latestPrice);

    // Show page content now that data is ready
    if (pricePageContent) show(pricePageContent);

  } catch (err) {
    if (currentPricePanel) {
      hideSkeleton(currentPricePanel);
      // Show error inside the panel with retry
      const { renderErrorState } = await import('/js/components/errorState.js');
      renderErrorState(currentPricePanel, {
        title:   'Failed to load price data',
        message: 'Something went wrong. Please try again.',
        retry:   () => loadPage(),
      });
    }
  }
}

loadPage();
