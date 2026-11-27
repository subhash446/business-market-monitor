import { useState, useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { updateMaterialLandedCost, getLatestFxRate } from '../../api/materials.api.js';

export const STARTER_PRESETS = [
  {
    id: 'DIRECT_SAME_UNIT',
    label: 'Direct (USD/kg → INR/kg)',
    factor: '1.0',
    duty: '0',
    spread: '0',
    hint: '1:1 unit match for imported direct materials',
  },
  {
    id: 'BULK_MT_TO_KG',
    label: 'Bulk Import (USD/MT → INR/kg)',
    factor: '0.001',
    duty: '7.5',
    spread: '2.50',
    hint: '1 MT = 1,000 kg + 7.5% tariff & ₹2.50/kg port handling',
  },
  {
    id: 'CRUDE_TO_POLYMER',
    label: 'Crude Proxy (USD/bbl → INR/kg)',
    factor: '0.00735',
    duty: '10.0',
    spread: '32.00',
    hint: '0.00735 bbl/kg crude proxy + 10% duty + ₹32.00/kg cracking spread',
  },
];

/**
 * LandedCostModal — Configure Landed-Cost & FX Parity Normalization (V3-M3).
 */
export function LandedCostModal({
  material,
  isOpen,
  onClose,
  onSaveSuccess,
  benchmarkPrice = null,
  benchmarkCurrency = 'USD',
  benchmarkUnit = 'bbl',
  domesticQuotePrice = null,
  initialFxRate = null,
  readOnly = false,
}) {
  if (!isOpen || !material) return null;

  const modalKey = material.id ?? material.trackedMaterialId ?? material.name ?? 'landed';
  return (
    <LandedCostModalContent
      key={modalKey}
      material={material}
      onClose={onClose}
      onSaveSuccess={onSaveSuccess}
      benchmarkPrice={benchmarkPrice}
      benchmarkCurrency={benchmarkCurrency}
      benchmarkUnit={benchmarkUnit}
      domesticQuotePrice={domesticQuotePrice}
      initialFxRate={initialFxRate}
      readOnly={readOnly}
    />
  );
}

function LandedCostModalContent({
  material,
  onClose,
  onSaveSuccess,
  benchmarkPrice,
  benchmarkCurrency,
  benchmarkUnit,
  domesticQuotePrice,
  initialFxRate,
  readOnly,
}) {
  const titleId = useId();

  const getInitial = (key, fallback = '') => {
    if (material?.[key] != null) return String(material[key]);
    if (material?.landedCost?.[key] != null) return String(material.landedCost[key]);
    return fallback;
  };

  const [unitFactor, setUnitFactor] = useState(() => getInitial('landedUnitFactor', ''));
  const [dutyFreightPct, setDutyFreightPct] = useState(() => getInitial('landedDutyFreightPct', '0'));
  const [fixedSpreadInr, setFixedSpreadInr] = useState(() => getInitial('landedFixedSpreadInr', '0'));
  const [activePreset, setActivePreset] = useState(null);

  const [fxRate, setFxRate] = useState(initialFxRate || 86.42);
  const [fxSource, setFxSource] = useState('FRANKFURTER_ECB');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function loadFx() {
      try {
        const res = await getLatestFxRate('USD', 'INR');
        if (isMounted && res && res.rate) {
          setFxRate(Number(res.rate));
          if (res.source) setFxSource(res.source);
        }
      } catch {
        // Fall back gracefully to existing rate
      }
    }

    loadFx();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && typeof onClose === 'function') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, []);

  const targetMaterialId = material.id ?? material.trackedMaterialId;
  const matUnit = material.unit || material.unit_abbreviation || 'kg';

  function handleSelectPreset(preset) {
    if (readOnly) return;
    setActivePreset(preset.id);
    setUnitFactor(preset.factor);
    setDutyFreightPct(preset.duty);
    setFixedSpreadInr(preset.spread);
    setFormError('');
  }

  const numFactor = unitFactor.trim() !== '' ? Number(unitFactor) : null;
  const numDuty = dutyFreightPct.trim() !== '' ? Number(dutyFreightPct) : 0;
  const numSpread = fixedSpreadInr.trim() !== '' ? Number(fixedSpreadInr) : 0;

  let liveLandedBenchmark = null;
  let liveVariance = null;
  let liveFormula = '';

  const hasValidInputs =
    numFactor != null &&
    !isNaN(numFactor) &&
    numFactor > 0 &&
    !isNaN(numDuty) &&
    numDuty >= 0 &&
    !isNaN(numSpread) &&
    numSpread >= 0;
  const activeBenchPrice =
    benchmarkPrice != null && Number(benchmarkPrice) > 0 ? Number(benchmarkPrice) : null;

  if (hasValidInputs && activeBenchPrice != null && fxRate > 0) {
    const baseInr = activeBenchPrice * fxRate * numFactor;
    const withDuty = baseInr * (1 + numDuty / 100);
    liveLandedBenchmark = Number((withDuty + numSpread).toFixed(2));

    liveFormula = `(${activeBenchPrice.toFixed(2)} ${benchmarkCurrency} * ${fxRate.toFixed(2)} * ${numFactor}) * (1 + ${numDuty}%) + ${numSpread.toFixed(2)} = ₹${liveLandedBenchmark.toFixed(2)}/${matUnit}`;

    if (domesticQuotePrice != null && Number(domesticQuotePrice) > 0 && liveLandedBenchmark > 0) {
      const qPrice = Number(domesticQuotePrice);
      liveVariance = Number((((qPrice - liveLandedBenchmark) / liveLandedBenchmark) * 100).toFixed(2));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (readOnly) {
      setFormError('Viewers have read-only permissions.');
      return;
    }
    setFormError('');

    if (!targetMaterialId) {
      setFormError('Material ID not found.');
      return;
    }

    if (unitFactor.trim() === '') {
      setFormError('Unit conversion factor is required. To reset, use Clear Model.');
      return;
    }

    const valFactor = Number(unitFactor);
    if (isNaN(valFactor) || valFactor <= 0 || valFactor > 100000) {
      setFormError('Unit conversion factor must be a positive number up to 100,000.');
      return;
    }

    const valDuty = dutyFreightPct.trim() !== '' ? Number(dutyFreightPct) : 0;
    if (isNaN(valDuty) || valDuty < 0 || valDuty > 500) {
      setFormError('Duty & freight percentage must be between 0% and 500%.');
      return;
    }

    const valSpread = fixedSpreadInr.trim() !== '' ? Number(fixedSpreadInr) : 0;
    if (isNaN(valSpread) || valSpread < 0 || valSpread > 1000000) {
      setFormError('Fixed spread must be a non-negative number up to ₹1,000,000.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateMaterialLandedCost(targetMaterialId, {
        landedUnitFactor: valFactor,
        landedDutyFreightPct: valDuty,
        landedFixedSpreadInr: valSpread,
      });

      if (typeof onSaveSuccess === 'function') {
        onSaveSuccess(updated);
      }
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to update landed cost configuration.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearModel() {
    if (readOnly) {
      setFormError('Viewers have read-only permissions.');
      return;
    }
    setFormError('');
    setSaving(true);
    try {
      const updated = await updateMaterialLandedCost(targetMaterialId, {
        landedUnitFactor: null,
        landedDutyFreightPct: null,
        landedFixedSpreadInr: null,
      });

      if (typeof onSaveSuccess === 'function') {
        onSaveSuccess(updated);
      }
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to clear landed cost configuration.');
    } finally {
      setSaving(false);
    }
  }

  const modalMarkup = (
    <div
      className="modal-backdrop modal-backdrop--open modal-backdrop--visible"
      onClick={(e) => {
        if (e.target === e.currentTarget && typeof onClose === 'function') {
          onClose();
        }
      }}
    >
      <div
        className="modal landed-cost-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header materials-modal__header">
          <div>
            <h3 id={titleId} className="modal__title materials-modal__title">
              <i className="fa-solid fa-calculator materials-modal__icon" aria-hidden="true" />
              <span>Landed-Cost &amp; FX Parity Model — {material.name}</span>
            </h3>
            <span className="materials-modal__subtitle">
              Convert global USD benchmarks into actionable landed domestic INR/{matUnit} benchmark parity.
            </span>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={saving}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal__body materials-modal__body">
            {readOnly && (
              <div className="alert-banner alert-banner--warning" role="status">
                <i className="fa-solid fa-eye" aria-hidden="true" />
                <span className="alert-banner__message">
                  Read-only viewer role: parity model adjustments are disabled.
                </span>
              </div>
            )}

            {formError && (
              <div className="form-alert form-alert--error form-alert--visible materials-modal__alert" role="alert">
                <i className="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true" />
                <span className="form-alert__message">{formError}</span>
              </div>
            )}

            <div className="materials-modal__fx-bar">
              <div className="materials-modal__fx-left">
                <span className="badge badge--info font-mono">USD/INR</span>
                <span className="font-mono font-semibold materials-modal__fx-value">
                  1 USD = ₹{fxRate.toFixed(2)}
                </span>
              </div>
              <span className="text-muted">
                Live Reference: {fxSource === 'FRANKFURTER_ECB' ? 'ECB (Frankfurter)' : fxSource}
              </span>
            </div>

            <div className="materials-modal__presets-wrap">
              <label className="form-label mb-2">
                Quick Starter Presets (1-Click Fill &amp; Editable)
              </label>
              <div className="materials-modal__chip-row">
                {STARTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={readOnly || saving}
                    className={`btn btn--sm materials-modal__chip-btn ${
                      activePreset === preset.id ? 'btn--primary' : 'btn--secondary'
                    }`}
                    onClick={() => handleSelectPreset(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="materials-modal__grid materials-modal__grid--3">
              <div className="form-group">
                <label className="form-label materials-modal__label" htmlFor="unit-factor-input">
                  Unit Factor *
                </label>
                <input
                  id="unit-factor-input"
                  type="number"
                  step="any"
                  min="0.000001"
                  max="100000"
                  disabled={readOnly || saving}
                  className="form-control font-mono"
                  placeholder="e.g. 0.00735"
                  value={unitFactor}
                  onChange={(e) => {
                    setUnitFactor(e.target.value);
                    setActivePreset(null);
                  }}
                  required
                />
                <span className="form-hint">
                  Benchmark units needed per 1 {matUnit} (e.g. 0.00735 bbl/kg).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label materials-modal__label" htmlFor="duty-pct-input">
                  Duty &amp; Freight (%)
                </label>
                <input
                  id="duty-pct-input"
                  type="number"
                  step="any"
                  min="0"
                  max="500"
                  disabled={readOnly || saving}
                  className="form-control font-mono"
                  placeholder="e.g. 10.0"
                  value={dutyFreightPct}
                  onChange={(e) => {
                    setDutyFreightPct(e.target.value);
                    setActivePreset(null);
                  }}
                />
                <span className="form-hint">
                  Basic customs duty, ocean freight &amp; port cess.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label materials-modal__label" htmlFor="spread-inr-input">
                  Fixed Spread (₹/{matUnit})
                </label>
                <input
                  id="spread-inr-input"
                  type="number"
                  step="any"
                  min="0"
                  max="1000000"
                  disabled={readOnly || saving}
                  className="form-control font-mono"
                  placeholder="e.g. 32.00"
                  value={fixedSpreadInr}
                  onChange={(e) => {
                    setFixedSpreadInr(e.target.value);
                    setActivePreset(null);
                  }}
                />
                <span className="form-hint">
                  Local processing, converter spread, or domestic delivery.
                </span>
              </div>
            </div>

            {hasValidInputs && (
              <div className="materials-modal__preview-box">
                <div className="materials-modal__preview-header">
                  <span className="materials-modal__preview-title">Live Landed Benchmark Preview</span>
                  {activeBenchPrice != null && (
                    <span className="text-xs text-muted font-mono">
                      Ref Benchmark: ${activeBenchPrice.toFixed(2)}/{benchmarkUnit}
                    </span>
                  )}
                </div>

                {liveLandedBenchmark != null ? (
                  <div className="materials-modal__metrics-grid">
                    <div className="materials-modal__metric-tile">
                      <span className="materials-modal__metric-label">Landed Parity Benchmark</span>
                      <strong className="font-mono materials-modal__metric-val">
                        ₹{liveLandedBenchmark.toFixed(2)}/{matUnit}
                      </strong>
                    </div>

                    {domesticQuotePrice != null && (
                      <div className="materials-modal__metric-tile">
                        <span className="materials-modal__metric-label">Supplier Quote</span>
                        <strong className="font-mono materials-modal__metric-val">
                          ₹{Number(domesticQuotePrice).toFixed(2)}/{matUnit}
                        </strong>
                      </div>
                    )}

                    {liveVariance != null && (
                      <div className="materials-modal__metric-tile">
                        <span className="materials-modal__metric-label">Parity Variance</span>
                        <strong
                          className={`font-mono materials-modal__metric-val ${
                            liveVariance > 0
                              ? 'materials-modal__metric-val--danger'
                              : 'materials-modal__metric-val--success'
                          }`}
                        >
                          {liveVariance > 0 ? `+${liveVariance}%` : `${liveVariance}%`}
                        </strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="materials-modal__preview-desc">
                    Log or ingest a benchmark price (e.g. Brent Crude / WTI in USD) to compute live landed benchmark preview.
                  </p>
                )}

                {liveFormula && (
                  <div className="materials-modal__formula">Formula: {liveFormula}</div>
                )}
              </div>
            )}
          </div>

          <div className="modal__footer materials-modal__footer">
            <button
              type="button"
              className="btn btn--ghost text-muted btn--sm"
              onClick={handleClearModel}
              disabled={readOnly || saving}
            >
              Clear Model
            </button>
            <div className="materials-modal__footer-actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn btn--primary btn--sm${saving ? ' btn--loading' : ''}`}
                disabled={readOnly || saving}
              >
                Save Landed Model
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalMarkup, document.body);
  }
  return modalMarkup;
}
