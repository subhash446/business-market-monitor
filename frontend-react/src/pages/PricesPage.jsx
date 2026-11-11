/**
 * PricesPage — Log a price for a tracked material
 * Business Market Monitor — React frontend
 *
 * Phase 1 & Phase 7 (Data Integrity & Price Tracking):
 *  - Displays explicit currency, unitLabel, and data classification badges
 *  - Highlights proxy commodity benchmarks (WTI/Brent crude USD/bbl) with
 *    clear provenance warnings so users know it is not direct local procurement cost
 *  - Displays authentic latest valid price data from backend API
 *  - Warns if material is untracked and provides one-click tracking activation
 *  - Supports optional currency, grade, and region in manual price entry
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getMaterials, updateMaterialTracking } from '../api/materials.api.js';
import { getLatestPrice, getPriceSourceInfo, logPrice } from '../api/prices.api.js';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { formatPriceDisplay, formatUnitLabel, formatDate, toIsoDateString } from '../utils/format.js';
import { resolveIsProxyPrice, refreshSourceInfoAfterManualQuote } from '../utils/priceSource.js';
import '../styles/pages/prices.css';

/* ── Load state ────────────────────────────────────────────────── */
const LOAD = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error', NOT_FOUND: 'not_found' };

export function PricesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();

  // Read ?materialId from URL — this is tracked_materials.id
  const materialId = searchParams.get('materialId');

  /* ── State ──────────────────────────────────────────────────── */
  const [loadStatus, setLoadStatus] = useState(LOAD.LOADING);
  const [loadErrMsg, setLoadErrMsg] = useState('');
  const [material, setMaterial] = useState(null); // { id, name, unit, isTracked, ... }
  const [latestPrice, setLatestPrice] = useState(null); // { price, recordedAt, source, currency, ... } | null
  const [sourceInfo, setSourceInfo] = useState(null);

  /* ── Form state ─────────────────────────────────────────────── */
  const [price, setPrice] = useState('');
  const [recordedAt, setRecordedAt] = useState(() => toIsoDateString(new Date()));
  const [currency, setCurrency] = useState('INR');
  const [grade, setGrade] = useState('');
  const [region, setRegion] = useState('');
  const [priceErr, setPriceErr] = useState('');
  const [dateErr, setDateErr] = useState('');
  const [formErr, setFormErr] = useState('');
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
      const [materials, latest, srcInfo] = await Promise.all([
        getMaterials(),
        getLatestPrice(materialId),
        getPriceSourceInfo(materialId),
      ]);

      const found = materials.find((m) => String(m.id) === String(materialId));

      if (!found) {
        setLoadStatus(LOAD.NOT_FOUND);
        return;
      }

      setMaterial(found);
      setLatestPrice(latest);
      setSourceInfo(srcInfo);
      setRecordedAt(toIsoDateString(new Date()));
      setLoadStatus(LOAD.SUCCESS);
    } catch (err) {
      let msg = 'Something went wrong. Please try again.';
      if (!err?.status) msg = 'Could not connect to the server. Check your connection.';
      setLoadErrMsg(msg);
      setLoadStatus(LOAD.ERROR);
    }
  }, [materialId]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  /* ── Enable tracking if currently untracked ────────────────── */
  async function handleEnableTracking() {
    if (!material) return;
    try {
      await updateMaterialTracking(material.id, true);
      setMaterial((prev) => ({ ...prev, isTracked: true }));
      showToast({ type: 'success', message: `Tracking enabled for ${material.name}.` });
    } catch {
      showToast({ type: 'error', message: 'Failed to enable tracking. Please try again.' });
    }
  }

  /* ── Form submit — POST /materials/:id/prices ─────────────── */
  async function handleSubmit(e) {
    e.preventDefault();
    setPriceErr('');
    setDateErr('');
    setFormErr('');

    if (material && !material.isTracked) {
      setFormErr('Cannot log prices for an untracked material. Enable tracking first.');
      return;
    }

    let valid = true;

    const rawPrice = parseFloat(price);
    if (!price || isNaN(rawPrice) || rawPrice <= 0) {
      setPriceErr('Price must be a positive number.');
      valid = false;
    }

    if (!recordedAt) {
      setDateErr('Date cannot be in the future.');
      valid = false;
    } else {
      const d = new Date(recordedAt);
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (d.getTime() > today.getTime()) {
        setDateErr('Date cannot be in the future.');
        valid = false;
      }
    }

    if (!valid) return;

    setSubmitting(true);
    try {
      const created = await logPrice(materialId, {
        price: rawPrice,
        recordedAt,
        currency: currency || 'INR',
        unitLabel: material?.unit || null,
        grade: grade.trim() || null,
        region: region.trim() || null,
        dataClass: 'SUPPLIER_QUOTE',
      });

      showToast({ type: 'success', message: 'Price logged successfully.' });

      setLatestPrice(created);
      setPrice('');
      setGrade('');
      setRegion('');
      setRecordedAt(toIsoDateString(new Date()));

      const refreshedSourceInfo = await refreshSourceInfoAfterManualQuote({
        materialId,
        fetchSourceInfo: getPriceSourceInfo,
        createdPrice: created,
        prevSourceInfo: sourceInfo,
        material,
      });
      setSourceInfo(refreshedSourceInfo);
    } catch (err) {
      if (err?.status === 400) {
        const errors = err?.errors ?? err?.details ?? [];
        const priceEr = errors.find((er) => er.field === 'price');
        const dateEr = errors.find((er) => er.field === 'recordedAt');
        if (priceEr) setPriceErr('Price must be a positive number.');
        if (dateEr) setDateErr('Date cannot be in the future.');
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

  const isProxyPrice = resolveIsProxyPrice({ latestPrice, sourceInfo, material });
  const priceDisplay = latestPrice
    ? formatPriceDisplay({
        price: latestPrice.price,
        currency: latestPrice.currency,
        unitLabel: latestPrice.unitLabel,
        fallbackUnit: material?.unit,
        sourceCurrency: sourceInfo?.currency,
        sourceUnitLabel: sourceInfo?.unitLabel,
        externalSymbol: material?.externalSymbol,
      })
    : null;

  return (
    <div className="page-container">
      {/* Back link */}
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

      {/* ── Loading skeleton ── */}
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

      {/* ── Main page content ── */}
      {loadStatus === LOAD.SUCCESS && material && (
        <div id="price-page-content">
          {/* Material header: name + unit badge */}
          <div className="material-header-card" aria-label="Selected material">
            <h2 className="material-header-card__name" id="price-material-name">
              {material.name}
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <span className="badge badge--info material-header-card__unit" id="price-unit-badge">
                {material.unit}
              </span>
              {material.externalSymbol && (
                <span className="badge badge--warning" title="Linked to external benchmark indicator">
                  Indicator: {material.externalSymbol}
                </span>
              )}
            </div>
          </div>

          {/* Current price panel */}
          <div className="card price-current-panel" id="current-price-panel" aria-live="polite">
            <div
              className="card__header"
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <h2 className="card__title">Current Price</h2>
              {latestPrice && latestPrice.dataClass && (
                <div>
                  {latestPrice.dataClass === 'OFFICIAL_BENCHMARK' && (
                    <span className="badge badge--success">Official Benchmark</span>
                  )}
                  {latestPrice.dataClass === 'MARKET_INDICATIVE' && (
                    <span className="badge badge--warning">Market Indicative Proxy</span>
                  )}
                  {latestPrice.dataClass === 'SUPPLIER_QUOTE' && (
                    <span className="badge badge--info">Supplier Quote</span>
                  )}
                </div>
              )}
            </div>
            <div className="card__body price-current-panel__body">
              {latestPrice === null ? (
                <p className="price-current-panel__no-data" id="current-price-no-data">
                  No price recorded yet for this material.
                </p>
              ) : (
                <>
                  <div className="price-current-panel__value font-mono" id="current-price-value">
                    <span style={{ fontSize: '0.65em', marginRight: '0.25rem', opacity: 0.85 }}>
                      {priceDisplay.currencyCode}
                    </span>
                    {priceDisplay.formattedValue}
                    {priceDisplay.unitSuffix && (
                      <span
                        style={{
                          fontSize: '0.5em',
                          marginLeft: '0.35rem',
                          fontWeight: 'normal',
                          opacity: 0.75,
                        }}
                      >
                        / {priceDisplay.unitSuffix}
                      </span>
                    )}
                  </div>

                  <div
                    className="price-current-panel__date"
                    id="current-price-date"
                    style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}
                  >
                    <span>Recorded: {formatDate(latestPrice.recordedAt)}</span>
                    {latestPrice.providerName && (
                      <span className="text-secondary">Source: {latestPrice.providerName}</span>
                    )}
                    {latestPrice.region && (
                      <span className="text-secondary">Region: {latestPrice.region}</span>
                    )}
                  </div>

                  {/* Proxy Benchmark Notice */}
                  {isProxyPrice && (
                    <div
                      style={{
                        marginTop: '0.85rem',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.8125rem',
                        backgroundColor: '#fffbeb',
                        border: '1px solid #fde68a',
                        borderRadius: '0.375rem',
                        color: '#92400e',
                        lineHeight: 1.45,
                      }}
                    >
                      <i
                        className="fa-solid fa-triangle-exclamation"
                        style={{ marginRight: '0.5rem', color: '#d97706' }}
                      />
                      <strong>Proxy Benchmark Notice: </strong>
                      {sourceInfo?.disclaimer ||
                        `This price reflects an international crude oil benchmark (${formatUnitLabel(latestPrice?.currency || sourceInfo?.currency || 'USD', latestPrice?.unitLabel || sourceInfo?.unitLabel || 'bbl')}), not a direct local transaction price for ${material.name}.`}
                    </div>
                  )}

                  {/* Domestic Market Benchmark Info */}
                  {!isProxyPrice && latestPrice?.source !== 'MANUAL' && sourceInfo?.disclaimer && (
                    <div
                      style={{
                        marginTop: '0.85rem',
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.8125rem',
                        backgroundColor: '#eff6ff',
                        border: '1px solid #bfdbfe',
                        borderRadius: '0.375rem',
                        color: '#1e40af',
                        lineHeight: 1.45,
                      }}
                    >
                      <i
                        className="fa-solid fa-building-columns"
                        style={{ marginRight: '0.5rem', color: '#2563eb' }}
                      />
                      <strong>Market Benchmark Info: </strong>
                      {sourceInfo.disclaimer}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Untracked Material Warning Banner */}
          {!material.isTracked && (
            <div
              style={{
                marginBottom: '1.25rem',
                padding: '0.85rem 1rem',
                backgroundColor: '#fffbeb',
                border: '1px solid #fde68a',
                borderRadius: '0.375rem',
                color: '#92400e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="fa-solid fa-triangle-exclamation" style={{ color: '#d97706' }} aria-hidden="true" />
                <span>
                  <strong>Notice:</strong> This material is currently <strong>not tracked</strong>. You must enable
                  tracking to record prices.
                </span>
              </div>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={handleEnableTracking}
                disabled={submitting}
              >
                Enable Tracking Now
              </button>
            </div>
          )}

          {/* Price entry form */}
          <div className="card">
            <div className="card__header">
              <h2 className="card__title">Log a Price (Supplier Quote)</h2>
            </div>
            <div className="card__body">
              {formErr && (
                <div className="form-alert form-alert--error form-alert--visible" id="pe-form-error" role="alert">
                  <span className="form-alert__message">{formErr}</span>
                </div>
              )}

              <form id="price-entry-form" onSubmit={handleSubmit} noValidate>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                  }}
                >
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
                      onChange={(e) => {
                        setPrice(e.target.value);
                        setPriceErr('');
                        setFormErr('');
                      }}
                    />
                    {priceErr && (
                      <p className="form-error form-error--visible" id="pe-price-error" role="alert">
                        {priceErr}
                      </p>
                    )}
                  </div>

                  {/* Currency */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="pe-currency">
                      Currency
                    </label>
                    <select
                      className="form-control"
                      id="pe-currency"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                    </select>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  {/* Date */}
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
                      onChange={(e) => {
                        setRecordedAt(e.target.value);
                        setDateErr('');
                        setFormErr('');
                      }}
                    />
                    {dateErr && (
                      <p className="form-error form-error--visible" id="pe-date-error" role="alert">
                        {dateErr}
                      </p>
                    )}
                  </div>

                  {/* Grade / Spec */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="pe-grade">
                      Grade / Spec (Optional)
                    </label>
                    <input
                      className="form-control"
                      type="text"
                      id="pe-grade"
                      placeholder="e.g. Injection Molding Grade A"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                    />
                  </div>

                  {/* Region */}
                  <div className="form-group">
                    <label className="form-label" htmlFor="pe-region">
                      Region / Market (Optional)
                    </label>
                    <input
                      className="form-control"
                      type="text"
                      id="pe-region"
                      placeholder="e.g. Gujarat / Mumbai Domestic"
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                    />
                  </div>
                </div>

                {/* Submit */}
                <div className="form-actions" style={{ marginTop: '1rem' }}>
                  <button
                    type="submit"
                    id="pe-submit-btn"
                    className={`btn btn--primary${submitting ? ' btn--loading' : ''}`}
                    disabled={submitting || !material.isTracked}
                    title={!material.isTracked ? 'Enable tracking before logging prices' : undefined}
                  >
                    Log Supplier Quote
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
