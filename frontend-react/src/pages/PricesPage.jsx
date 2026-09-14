/**
 * PricesPage — Log a price for a tracked material
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/prices.html + frontend/js/pages/prices.js
 *
 * FLOW (preserved exactly from original):
 *  1. Auth + business guard — handled by ProtectedRoute in App.jsx
 *  2. Read ?materialId from URL (useSearchParams).
 *     If absent → navigate to /materials immediately.
 *  3. Promise.all([GET /materials, GET /materials/:id/prices/latest])
 *  4. Find material in list by id. If not found → show not-found state, stop.
 *  5. Render material header (name + unit badge)
 *  6. Render current price panel:
 *     200 data: show price + recordedAt (formatted with formatDate)
 *     null (404 from API): "No price recorded yet" — informational notice, NOT error-state component
 *  7. Pre-populate date input with today's date (toIsoDateString)
 *  8. Price entry form submit → POST /materials/:id/prices { price, recordedAt }
 *     Success:
 *       1. showToast "Price logged successfully."
 *       2. Update current price panel in-place (no full reload)
 *       3. Reset price field; keep date at today
 *     400: field errors (price/recordedAt)
 *     404: show not-found state
 *     network: form alert
 *
 * DATE CONTRACT (CRITICAL):
 *   recordedAt must remain YYYY-MM-DD.
 *   toIsoDateString() returns exactly this. Do NOT add Z or convert to ISO 8601 full timestamp.
 *
 * MATERIAL ID:
 *   materialId from ?materialId= query param = tracked_materials.id.
 *   This matches material.id from GET /materials response.
 *   Used directly in GET /materials/:id/prices/latest and POST /materials/:id/prices.
 *
 * RESPONSE FIELDS:
 *   Latest price: { price, recordedAt, source } — NO unit field; unit from material.unit
 *   POST response: { id, price, recordedAt, source }
 *
 * VALIDATION:
 *   price: must be a positive number (> 0)
 *   date: required, not in the future (allow same-day up to 23:59:59.999)
 *
 * SECURITY: No userId in requests. No innerHTML. No eval().
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getMaterials }         from '../api/materials.api.js';
import { getLatestPrice, logPrice } from '../api/prices.api.js';
import { Skeleton }   from '../components/ui/Skeleton.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { useToast }   from '../components/ui/Toast.jsx';
import { formatNumber, formatDate, toIsoDateString } from '../utils/format.js';
import '../styles/pages/prices.css';

/* ── Load state ────────────────────────────────────────────────── */
const LOAD = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error', NOT_FOUND: 'not_found' };

export function PricesPage() {
  const navigate          = useNavigate();
  const [searchParams]    = useSearchParams();
  const { showToast }     = useToast();

  // Read ?materialId from URL — this is tracked_materials.id
  const materialId = searchParams.get('materialId');

  /* ── State ──────────────────────────────────────────────────── */
  const [loadStatus,   setLoadStatus]   = useState(LOAD.LOADING);
  const [loadErrMsg,   setLoadErrMsg]   = useState('');
  const [material,     setMaterial]     = useState(null); // { id, name, unit, ... }
  const [latestPrice,  setLatestPrice]  = useState(null); // { price, recordedAt, source } | null

  /* ── Form state ─────────────────────────────────────────────── */
  const [price,      setPrice]      = useState('');
  const [recordedAt, setRecordedAt] = useState(() => toIsoDateString(new Date()));
  const [priceErr,   setPriceErr]   = useState('');
  const [dateErr,    setDateErr]    = useState('');
  const [formErr,    setFormErr]    = useState('');
  const [submitting, setSubmitting] = useState(false);

  const priceInputRef = useRef(null);

  /* ── Redirect if no materialId ──────────────────────────────── */
  useEffect(() => {
    if (!materialId) {
      navigate('/materials', { replace: true });
    }
  }, [materialId, navigate]);

  /* ── Load data ──────────────────────────────────────────────── */
  const loadPage = useCallback(async () => {
    if (!materialId) return;

    setLoadStatus(LOAD.LOADING);
    setLoadErrMsg('');

    try {
      // Parallel: GET /materials (name/unit) + GET /prices/latest (null on 404)
      const [materials, latest] = await Promise.all([
        getMaterials(),
        getLatestPrice(materialId), // returns null on 404 — semantic empty state
      ]);

      // Find material by id — material.id = tracked_materials.id
      const found = materials.find(m => String(m.id) === String(materialId));

      if (!found) {
        setLoadStatus(LOAD.NOT_FOUND);
        return;
      }

      setMaterial(found);
      setLatestPrice(latest);
      // Keep date at today (or reset to today on reload)
      setRecordedAt(toIsoDateString(new Date()));
      setLoadStatus(LOAD.SUCCESS);

    } catch (err) {
      let msg = 'Something went wrong. Please try again.';
      if (!err?.status) msg = 'Could not connect to the server. Check your connection.';
      setLoadErrMsg(msg);
      setLoadStatus(LOAD.ERROR);
    }
  }, [materialId]);

  useEffect(() => { loadPage(); }, [loadPage]);

  /* ── Form submit — POST /materials/:id/prices ─────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setPriceErr('');
    setDateErr('');
    setFormErr('');

    let valid = true;

    // Validate price — must be a positive number
    const rawPrice = parseFloat(price);
    if (!price || isNaN(rawPrice) || rawPrice <= 0) {
      setPriceErr('Price must be a positive number.');
      valid = false;
    }

    // Validate date — required, not in the future (allow same-day)
    if (!recordedAt) {
      setDateErr('Date cannot be in the future.');
      valid = false;
    } else {
      const d     = new Date(recordedAt);
      const today = new Date();
      today.setHours(23, 59, 59, 999); // allow same-day
      if (d.getTime() > today.getTime()) {
        setDateErr('Date cannot be in the future.');
        valid = false;
      }
    }

    if (!valid) return;

    setSubmitting(true);
    try {
      // POST /api/v1/materials/:materialId/prices
      // Body: { price: number, recordedAt: string (YYYY-MM-DD) }
      const created = await logPrice(materialId, {
        price:      rawPrice,
        recordedAt, // already YYYY-MM-DD from toIsoDateString — DO NOT add Z
      });

      // 1. Toast
      showToast({ type: 'success', message: 'Price logged successfully.' });

      // 2. Update current price panel in-place (no full reload)
      setLatestPrice({ price: created.price, recordedAt: created.recordedAt, source: created.source });

      // 3. Reset: clear price, keep date at today
      setPrice('');
      setRecordedAt(toIsoDateString(new Date()));

    } catch (err) {
      if (err?.status === 400) {
        const errors = err?.errors ?? err?.details ?? [];
        const priceEr = errors.find(e => e.field === 'price');
        const dateEr  = errors.find(e => e.field === 'recordedAt');
        if (priceEr) setPriceErr('Price must be a positive number.');
        if (dateEr)  setDateErr('Date cannot be in the future.');
        if (!priceEr && !dateEr) setFormErr('Please check your inputs and try again.');
      } else if (err?.status === 404) {
        setLoadStatus(LOAD.NOT_FOUND);
      } else {
        setFormErr('Could not log price. Check your connection.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div className="page-container">

      {/* Back link — always visible */}
      <Link to="/materials" className="btn btn--ghost price-back-link">
        <i className="fa-solid fa-arrow-left" aria-hidden="true" />
        Back to Materials
      </Link>

      {/* ── Not-found state ───────────────────────────────────── */}
      {loadStatus === LOAD.NOT_FOUND && (
        <div className="price-not-found">
          <div className="card">
            <div className="card__body price-not-found__body">
              <i className="fa-solid fa-circle-exclamation price-not-found__icon" aria-hidden="true" />
              <h2 className="price-not-found__title">Material Not Found</h2>
              <p className="price-not-found__message">
                Material not found. It may have been removed or doesn&apos;t belong to your business.
              </p>
              <Link to="/materials" className="btn btn--secondary">
                ← Back to Materials
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── Load error ────────────────────────────────────────── */}
      {loadStatus === LOAD.ERROR && (
        <ErrorState
          title="Failed to load price data"
          message={loadErrMsg || 'Something went wrong. Please try again.'}
          retry={loadPage}
        />
      )}

      {/* ── Loading skeleton — shown in current price panel area ── */}
      {loadStatus === LOAD.LOADING && (
        <div className="card price-current-panel">
          <div className="card__header">
            <h2 className="card__title">Current Price</h2>
          </div>
          <div className="card__body price-current-panel__body">
            <Skeleton type="list" rows={1} />
          </div>
        </div>
      )}

      {/* ── Main page content — shown once data is loaded ─────── */}
      {loadStatus === LOAD.SUCCESS && material && (
        <div id="price-page-content">

          {/* Material header: name + unit badge */}
          {/* unit comes from material.unit — NOT from price response */}
          <div className="material-header-card" aria-label="Selected material">
            <h2 className="material-header-card__name" id="price-material-name">
              {material.name}
            </h2>
            <span className="badge badge--info material-header-card__unit" id="price-unit-badge">
              {material.unit}
            </span>
          </div>

          {/* Current price panel */}
          <div className="card price-current-panel" id="current-price-panel" aria-live="polite">
            <div className="card__header">
              <h2 className="card__title">Current Price</h2>
            </div>
            <div className="card__body price-current-panel__body">
              {latestPrice === null ? (
                /* No price yet — informational notice (NOT error-state component) */
                <p className="price-current-panel__no-data" id="current-price-no-data">
                  No price recorded yet for this material.
                </p>
              ) : (
                <>
                  {/* price is a scalar number from the backend */}
                  <div className="price-current-panel__value font-mono" id="current-price-value">
                    {formatNumber(latestPrice.price, 2)}
                  </div>
                  {/* recordedAt is ISO datetime string — display formatted */}
                  <div className="price-current-panel__date" id="current-price-date">
                    {formatDate(latestPrice.recordedAt)}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Price entry form */}
          <div className="card">
            <div className="card__header">
              <h2 className="card__title">Log a Price</h2>
            </div>
            <div className="card__body">

              {/* Form-level alert */}
              {formErr && (
                <div className="form-alert form-alert--error form-alert--visible" id="pe-form-error" role="alert">
                  <span className="form-alert__message">{formErr}</span>
                </div>
              )}

              <form id="price-entry-form" onSubmit={handleSubmit} noValidate>

                {/* Price */}
                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="pe-price">
                    Price
                  </label>
                  <input
                    ref={priceInputRef}
                    className={`form-control font-mono${priceErr ? ' form-control--error' : ''}`}
                    type="number"
                    id="pe-price"
                    name="price"
                    min="0.01"
                    step="0.01"
                    placeholder="e.g. 1250.00"
                    aria-required="true"
                    aria-describedby="pe-price-error"
                    value={price}
                    onChange={e => { setPrice(e.target.value); setPriceErr(''); setFormErr(''); }}
                  />
                  {priceErr && (
                    <p className="form-error form-error--visible" id="pe-price-error" role="alert">
                      {priceErr}
                    </p>
                  )}
                </div>

                {/* Date — defaults to today, YYYY-MM-DD */}
                <div className="form-group">
                  <label className="form-label form-label--required" htmlFor="pe-date">
                    Date
                  </label>
                  <input
                    className={`form-control${dateErr ? ' form-control--error' : ''}`}
                    type="date"
                    id="pe-date"
                    name="recordedAt"
                    aria-required="true"
                    aria-describedby="pe-date-error"
                    value={recordedAt}
                    onChange={e => { setRecordedAt(e.target.value); setDateErr(''); setFormErr(''); }}
                  />
                  {dateErr && (
                    <p className="form-error form-error--visible" id="pe-date-error" role="alert">
                      {dateErr}
                    </p>
                  )}
                </div>

                {/* Submit */}
                <div className="form-actions">
                  <button
                    type="submit"
                    id="pe-submit-btn"
                    className={`btn btn--primary${submitting ? ' btn--loading' : ''}`}
                    disabled={submitting}
                  >
                    Log Price
                  </button>
                </div>

              </form>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
