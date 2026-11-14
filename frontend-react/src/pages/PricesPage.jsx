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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { getMaterials, updateMaterialTracking } from '../api/materials.api.js';
import { getLatestPrice, getPriceSourceInfo, logPrice, bulkUploadPrices } from '../api/prices.api.js';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { Modal } from '../components/ui/Modal.jsx';
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
  const [allMaterials, setAllMaterials] = useState([]); // all tracked materials
  const [latestPrice, setLatestPrice] = useState(null); // { price, recordedAt, source, currency, ... } | null
  const [sourceInfo, setSourceInfo] = useState(null);

  /* ── Bulk Upload Modal state ────────────────────────────────── */
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkMaterialId, setBulkMaterialId] = useState(materialId || '');
  const [rawCsvText, setRawCsvText] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkError, setBulkError] = useState('');

  const [todayIso] = useState(() => toIsoDateString(new Date()));

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

      const trackedMaterials = (materials || []).filter((m) => m.isTracked);
      setAllMaterials(trackedMaterials);
      const found = materials.find((m) => String(m.id) === String(materialId));

      if (!found) {
        setLoadStatus(LOAD.NOT_FOUND);
        return;
      }

      setMaterial(found);
      setBulkMaterialId((prev) => prev || String(found.id));
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

  /* ── Parse CSV text whenever text or default material changes ──── */
  const parsedRows = useMemo(() => {
    if (!rawCsvText.trim()) {
      return [];
    }
    const lines = rawCsvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return [];
    }

    const firstLine = lines[0].toLowerCase();
    const isHeader = firstLine.includes('date') || firstLine.includes('price') || firstLine.includes('material');
    const dataLines = isHeader ? lines.slice(1) : lines;

    return dataLines.map((line, idx) => {
      const sep = line.includes('\t') ? '\t' : (line.includes(';') ? ';' : ',');
      const parts = line.split(sep).map((p) => p.trim().replace(/^["']|["']$/g, ''));

      let rowMatId = bulkMaterialId;
      let rowDate = '';
      let rowPrice = '';
      let rowCurrency = 'INR';
      let rowGrade = '';
      let rowRegion = '';

      if (parts.length >= 3 && /^\d+$/.test(parts[0]) && !Number.isNaN(Date.parse(parts[1]))) {
        rowMatId = parts[0];
        rowDate = parts[1];
        rowPrice = parts[2];
        if (parts[3]) rowCurrency = parts[3].toUpperCase();
        if (parts[4]) rowGrade = parts[4];
        if (parts[5]) rowRegion = parts[5];
      } else {
        rowDate = parts[0] || '';
        rowPrice = parts[1] || '';
        if (parts[2]) rowCurrency = parts[2].toUpperCase();
        if (parts[3]) rowGrade = parts[3];
        if (parts[4]) rowRegion = parts[4];
      }

      const errors = [];
      const targetMat = allMaterials.find((m) => String(m.id) === String(rowMatId));
      if (!rowMatId || !targetMat) {
        errors.push('Unknown or untracked material');
      }

      const pNum = parseFloat(rowPrice);
      if (!rowPrice || Number.isNaN(pNum) || pNum <= 0) {
        errors.push('Price must be > 0');
      }

      const d = new Date(rowDate);
      if (!rowDate || Number.isNaN(d.getTime())) {
        errors.push('Invalid date');
      } else if (rowDate.slice(0, 10) > todayIso) {
        errors.push('Future date not allowed');
      }

      if (rowCurrency && !/^[A-Za-z]{3}$/.test(rowCurrency)) {
        errors.push('Currency must be 3 letters (e.g. INR)');
      }

      return {
        rowNumber: idx + 1,
        trackedMaterialId: rowMatId ? Number(rowMatId) : null,
        materialName: targetMat ? targetMat.name : (rowMatId ? `Material #${rowMatId}` : 'None'),
        date: rowDate,
        price: pNum,
        rawPrice: rowPrice,
        currency: rowCurrency || 'INR',
        grade: rowGrade || '',
        region: rowRegion || '',
        isValid: errors.length === 0,
        error: errors.join(', '),
      };
    });
  }, [rawCsvText, bulkMaterialId, allMaterials, todayIso]);

  function handleLoadSampleCsv() {
    const today = new Date();
    const d1 = toIsoDateString(new Date(today.getTime() - 2 * 86400000));
    const d2 = toIsoDateString(new Date(today.getTime() - 86400000));
    const d3 = toIsoDateString(today);
    const sample = `Date, Price, Currency, Grade, Region\n${d1}, 112.50, INR, Standard FAQ, Gujarat Domestic\n${d2}, 113.20, INR, Standard FAQ, Gujarat Domestic\n${d3}, 114.00, INR, Premium Grade, Mumbai Domestic`;
    setRawCsvText(sample);
    setBulkResult(null);
    setBulkError('');
  }

  function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === 'string') {
        setRawCsvText(text);
        setBulkResult(null);
        setBulkError('');
      }
    };
    reader.readAsText(file);
  }

  async function handleBulkSubmit() {
    setBulkError('');
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setBulkError('No valid rows to upload. Please fix the errors highlighted in the preview.');
      return;
    }

    if (validRows.length > 200) {
      setBulkError('Maximum batch size is 200 rows. Please reduce your batch.');
      return;
    }

    const payload = validRows.map((r) => ({
      trackedMaterialId: r.trackedMaterialId,
      price: r.price,
      recordedAt: r.date,
      currency: r.currency || 'INR',
      grade: r.grade || null,
      region: r.region || null,
    }));

    setBulkSubmitting(true);
    try {
      const res = await bulkUploadPrices(payload);
      setBulkResult(res);
      if (res.summary.inserted > 0) {
        showToast({
          type: 'success',
          message: `Bulk upload completed: ${res.summary.inserted} price(s) recorded successfully.`,
        });
        await loadPage();
      } else if (res.summary.skipped > 0 && res.summary.failed === 0) {
        showToast({
          type: 'info',
          message: `All ${res.summary.skipped} row(s) were duplicates and skipped safely.`,
        });
      } else {
        showToast({
          type: 'warning',
          message: `Upload finished: ${res.summary.inserted} inserted, ${res.summary.skipped} skipped, ${res.summary.failed} failed.`,
        });
      }
    } catch (err) {
      setBulkError(err?.message || 'Failed to upload price batch. Please try again.');
    } finally {
      setBulkSubmitting(false);
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
            <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
              <h2 className="card__title">Log a Price (Supplier Quote)</h2>
              <button
                type="button"
                className="btn btn--sm btn--secondary"
                id="pe-open-bulk-btn"
                onClick={() => {
                  setShowBulkModal(true);
                  setBulkResult(null);
                  setBulkError('');
                }}
              >
                <i className="fa-solid fa-file-csv" style={{ marginRight: '6px' }} />
                Bulk Upload Prices
              </button>
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

      {/* Bulk Upload Modal */}
      <Modal
        isOpen={showBulkModal}
        onClose={() => {
          setShowBulkModal(false);
          setBulkResult(null);
          setBulkError('');
        }}
        title="Bulk Price Upload (CSV / Spreadsheet)"
        size="lg"
        id="bulk-price-upload-modal"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Instructions and Controls */}
          <div>
            <p className="text-sm text-secondary" style={{ margin: '0 0 0.75rem 0' }}>
              Import multiple supplier quotes at once. Paste tabular data from Excel/Google Sheets, upload a CSV file, or load a sample template below.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem', alignItems: 'end' }}>
              {/* Default Material Selector */}
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" htmlFor="bulk-mat-select">
                  Target Material (if omitted in CSV)
                </label>
                <select
                  id="bulk-mat-select"
                  className="form-control"
                  value={bulkMaterialId}
                  onChange={(e) => setBulkMaterialId(e.target.value)}
                >
                  {allMaterials.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit || m.unit_abbreviation || 'unit'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons: Sample CSV & File Upload */}
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn--sm btn--secondary"
                  id="bulk-load-sample-btn"
                  onClick={handleLoadSampleCsv}
                >
                  <i className="fa-solid fa-file-lines" style={{ marginRight: '5px' }} />
                  Load Sample CSV
                </button>

                <label className="btn btn--sm btn--ghost" style={{ cursor: 'pointer', margin: 0 }}>
                  <i className="fa-solid fa-upload" style={{ marginRight: '5px' }} />
                  Upload .CSV File
                  <input
                    type="file"
                    accept=".csv,.txt,.tsv"
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Paste Textarea */}
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="bulk-csv-textarea">
              CSV or Tab-Delimited Data
            </label>
            <textarea
              id="bulk-csv-textarea"
              className="form-control font-mono"
              rows={5}
              placeholder={`Date, Price, Currency, Grade, Region\n2026-11-01, 112.50, INR, Grade A, Gujarat Domestic\n2026-11-02, 113.20, INR, Grade A, Gujarat Domestic`}
              value={rawCsvText}
              onChange={(e) => {
                setRawCsvText(e.target.value);
                setBulkResult(null);
                setBulkError('');
              }}
            />
          </div>

          {/* Error Message */}
          {bulkError && (
            <div className="form-alert form-alert--error form-alert--visible" role="alert">
              <span className="form-alert__message">{bulkError}</span>
            </div>
          )}

          {/* Results Summary Card if submitted */}
          {bulkResult && (
            <div
              className="bulk-summary-card"
              style={{
                padding: '1rem',
                borderRadius: '0.5rem',
                border: '1px solid var(--color-border, #30363d)',
                backgroundColor: 'var(--color-bg-secondary, #161b22)',
              }}
            >
              <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>Upload Results Summary</h4>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
                <span className="badge badge--success">
                  <i className="fa-solid fa-check" style={{ marginRight: '4px' }} />
                  Inserted: {bulkResult.summary.inserted}
                </span>
                <span className="badge badge--warning">
                  <i className="fa-solid fa-copy" style={{ marginRight: '4px' }} />
                  Skipped (Duplicates): {bulkResult.summary.skipped}
                </span>
                {bulkResult.summary.failed > 0 && (
                  <span className="badge badge--danger">
                    <i className="fa-solid fa-xmark" style={{ marginRight: '4px' }} />
                    Failed: {bulkResult.summary.failed}
                  </span>
                )}
              </div>

              {/* Row Status Breakdown */}
              <div style={{ maxHeight: '160px', overflowY: 'auto', fontSize: '0.8125rem' }}>
                <table className="table table--compact" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Material</th>
                      <th>Status</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResult.results.map((res, i) => (
                      <tr key={i}>
                        <td className="font-mono">{res.index + 1}</td>
                        <td>{allMaterials.find((m) => m.id === res.trackedMaterialId)?.name || `ID ${res.trackedMaterialId}`}</td>
                        <td>
                          {res.status === 'inserted' && <span className="text-success font-semibold">Inserted</span>}
                          {res.status === 'skipped' && <span className="text-warning font-semibold">Skipped</span>}
                          {res.status === 'failed' && <span className="text-danger font-semibold">Failed</span>}
                        </td>
                        <td className="text-secondary">
                          {res.status === 'inserted' && `Price ${res.price} ${res.currency || 'INR'}`}
                          {res.status !== 'inserted' && (res.reason || '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pre-Flight Preview Table */}
          {parsedRows.length > 0 && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span className="text-sm font-semibold">
                  Pre-Flight Preview ({parsedRows.length} rows parsed &bull; {parsedRows.filter((r) => r.isValid).length} ready)
                </span>
                {parsedRows.length > 200 && (
                  <span className="text-xs text-danger font-semibold">
                    Warning: Exceeds 200 batch limit ({parsedRows.length}/200)
                  </span>
                )}
              </div>

              <div
                style={{
                  maxHeight: '200px',
                  overflowY: 'auto',
                  border: '1px solid var(--color-border, #30363d)',
                  borderRadius: '0.375rem',
                }}
              >
                <table className="table table--compact" style={{ width: '100%', margin: 0 }}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Material</th>
                      <th>Date</th>
                      <th>Price</th>
                      <th>Currency</th>
                      <th>Grade / Region</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedRows.map((row) => (
                      <tr key={row.rowNumber} style={{ opacity: row.isValid ? 1 : 0.75 }}>
                        <td className="font-mono">{row.rowNumber}</td>
                        <td>{row.materialName}</td>
                        <td className="font-mono">{row.date || '—'}</td>
                        <td className="font-mono font-semibold">
                          {row.price ? formatPriceDisplay(row.price, row.currency) : (row.rawPrice || '—')}
                        </td>
                        <td>{row.currency}</td>
                        <td className="text-xs text-secondary">
                          {[row.grade, row.region].filter(Boolean).join(' • ') || '—'}
                        </td>
                        <td>
                          {row.isValid ? (
                            <span className="badge badge--success" style={{ fontSize: '0.75rem' }}>Ready</span>
                          ) : (
                            <span className="badge badge--danger" style={{ fontSize: '0.75rem' }} title={row.error}>
                              {row.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Modal Footer / Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => {
                setShowBulkModal(false);
                setBulkResult(null);
                setBulkError('');
              }}
            >
              Close
            </button>
            <button
              type="button"
              id="bulk-submit-upload-btn"
              className={`btn btn--primary${bulkSubmitting ? ' btn--loading' : ''}`}
              disabled={bulkSubmitting || parsedRows.filter((r) => r.isValid).length === 0}
              onClick={handleBulkSubmit}
            >
              Upload {parsedRows.filter((r) => r.isValid).length} Valid Row(s)
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
