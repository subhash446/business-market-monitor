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

  // Fetch latest FX rate on modal open if not already supplied
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    async function loadFx() {
      try {
        const res = await getLatestFxRate('USD', 'INR');
        if (isMounted && res && res.rate) {
          setFxRate(Number(res.rate));
          if (res.source) setFxSource(res.source);
        }
      } catch (_) {
        // Fall back gracefully to existing rate
      }
    }

    loadFx();
    return () => { isMounted = false; };
  }, [isOpen]);

  useEffect(() => {
    if (material) {
      setUnitFactor(material.landedUnitFactor != null ? String(material.landedUnitFactor) : material.landedCost?.unitFactor != null ? String(material.landedCost.unitFactor) : '');
      setDutyFreightPct(material.landedDutyFreightPct != null ? String(material.landedDutyFreightPct) : material.landedCost?.dutyFreightPct != null ? String(material.landedCost.dutyFreightPct) : '0');
      setFixedSpreadInr(material.landedFixedSpreadInr != null ? String(material.landedFixedSpreadInr) : material.landedCost?.fixedSpreadInr != null ? String(material.landedCost.fixedSpreadInr) : '0');
      setFormError('');
      setActivePreset(null);
    }
  }, [material]);

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

  if (!isOpen || !material) return null;

  const targetMaterialId = material.id ?? material.trackedMaterialId;
  const matUnit = material.unit || material.unit_abbreviation || 'kg';

  // Apply a starter preset
  function handleSelectPreset(preset) {
    setActivePreset(preset.id);
    setUnitFactor(preset.factor);
    setDutyFreightPct(preset.duty);
    setFixedSpreadInr(preset.spread);
    setFormError('');
  }

  // Live calculation preview
  const numFactor = unitFactor.trim() !== '' ? Number(unitFactor) : null;
  const numDuty = dutyFreightPct.trim() !== '' ? Number(dutyFreightPct) : 0;
  const numSpread = fixedSpreadInr.trim() !== '' ? Number(fixedSpreadInr) : 0;

  let liveLandedBenchmark = null;
  let liveVariance = null;
  let liveFormula = '';

  const hasValidInputs = numFactor != null && !isNaN(numFactor) && numFactor > 0 && !isNaN(numDuty) && numDuty >= 0 && !isNaN(numSpread) && numSpread >= 0;
  const activeBenchPrice = benchmarkPrice != null && Number(benchmarkPrice) > 0 ? Number(benchmarkPrice) : null;

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
        style={{ maxWidth: '640px', width: '100%', margin: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header modal-header">
          <div>
            <h3 id={titleId} className="modal__title modal-title font-semibold">
              <i className="fa-solid fa-calculator mr-2" style={{ color: 'var(--color-primary)' }} />
              Landed-Cost &amp; FX Parity Model — {material.name}
            </h3>
            <span className="text-xs text-muted" style={{ display: 'block', marginTop: '2px' }}>
              Convert global USD benchmarks into actionable landed domestic INR/{matUnit} benchmark parity.
            </span>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--icon modal__close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={saving}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal__body modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
            {formError && (
              <div className="alert alert--danger" style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
                <i className="fa-solid fa-triangle-exclamation mr-1" /> {formError}
              </div>
            )}

            {/* Live FX Rate Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--space-2) var(--space-3)',
                backgroundColor: 'var(--color-bg-subtle, #1e293b)',
                borderRadius: 'var(--radius-md)',
                marginBottom: 'var(--space-4)',
                border: '1px solid var(--color-border)',
                fontSize: 'var(--text-xs)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="badge badge--info font-mono" style={{ fontSize: '11px' }}>USD/INR</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                  1 USD = ₹{fxRate.toFixed(2)}
                </span>
              </div>
              <span className="text-muted" style={{ fontSize: '11px' }}>
                Live Reference: {fxSource}
              </span>
            </div>

            {/* Starter Presets */}
            <div style={{ marginBottom: 'var(--space-4)' }}>
              <label className="form-label" style={{ display: 'block', marginBottom: 'var(--space-2)' }}>
                Quick Starter Presets (1-Click Fill &amp; Editable)
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {STARTER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className={`btn btn--sm ${activePreset === preset.id ? 'btn--primary' : 'btn--secondary'}`}
                    onClick={() => handleSelectPreset(preset)}
                    style={{ fontSize: '11px', padding: '3px 8px' }}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Config Fields */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="unit-factor-input">
                  Unit Conversion Factor *
                </label>
                <input
                  id="unit-factor-input"
                  type="number"
                  step="any"
                  min="0.000001"
                  max="100000"
                  className="form-input font-mono"
                  placeholder="e.g. 0.00735"
                  value={unitFactor}
                  onChange={(e) => {
                    setUnitFactor(e.target.value);
                    setActivePreset(null);
                  }}
                  required
                />
                <span className="text-xs text-muted" style={{ display: 'block', marginTop: '4px', lineHeight: '1.3' }}>
                  Benchmark units needed per 1 {matUnit} (e.g. 0.00735 bbl/kg).
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="duty-pct-input">
                  Duty, Freight &amp; Insurance (%)
                </label>
                <input
                  id="duty-pct-input"
                  type="number"
                  step="any"
                  min="0"
                  max="500"
                  className="form-input font-mono"
                  placeholder="e.g. 10.0"
                  value={dutyFreightPct}
                  onChange={(e) => {
                    setDutyFreightPct(e.target.value);
                    setActivePreset(null);
                  }}
                />
                <span className="text-xs text-muted" style={{ display: 'block', marginTop: '4px', lineHeight: '1.3' }}>
                  Basic customs duty, ocean freight &amp; port cess.
                </span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="spread-inr-input">
                  Fixed Spread (₹/{matUnit})
                </label>
                <input
                  id="spread-inr-input"
                  type="number"
                  step="any"
                  min="0"
                  max="1000000"
                  className="form-input font-mono"
                  placeholder="e.g. 32.00"
                  value={fixedSpreadInr}
                  onChange={(e) => {
                    setFixedSpreadInr(e.target.value);
                    setActivePreset(null);
                  }}
                />
                <span className="text-xs text-muted" style={{ display: 'block', marginTop: '4px', lineHeight: '1.3' }}>
                  Local processing, converter spread, or domestic delivery.
                </span>
              </div>
            </div>

            {/* Live Parity Preview */}
            {hasValidInputs && (
              <div
                style={{
                  padding: 'var(--space-3)',
                  backgroundColor: 'var(--color-bg-surface)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  marginBottom: 'var(--space-3)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span className="text-xs font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)' }}>
                    Live Landed Benchmark Preview
                  </span>
                  {activeBenchPrice != null && (
                    <span className="text-xs text-muted font-mono">
                      Ref Benchmark: ${activeBenchPrice.toFixed(2)}/{benchmarkUnit}
                    </span>
                  )}
                </div>

                {liveLandedBenchmark != null ? (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '8px', marginBottom: '8px' }}>
                    <div style={{ padding: '8px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)' }}>
                      <span className="text-xs text-muted" style={{ display: 'block' }}>Landed Parity Benchmark</span>
                      <strong className="font-mono" style={{ fontSize: '15px', color: 'var(--color-text-primary)' }}>
                        ₹{liveLandedBenchmark.toFixed(2)}/{matUnit}
                      </strong>
                    </div>

                    {domesticQuotePrice != null && (
                      <div style={{ padding: '8px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)' }}>
                        <span className="text-xs text-muted" style={{ display: 'block' }}>Supplier Quote</span>
                        <strong className="font-mono" style={{ fontSize: '15px' }}>
                          ₹{Number(domesticQuotePrice).toFixed(2)}/{matUnit}
                        </strong>
                      </div>
                    )}

                    {liveVariance != null && (
                      <div style={{ padding: '8px', backgroundColor: 'var(--color-bg-base)', borderRadius: 'var(--radius-sm)' }}>
                        <span className="text-xs text-muted" style={{ display: 'block' }}>Parity Variance</span>
                        <strong
                          className="font-mono"
                          style={{
                            fontSize: '15px',
                            color: liveVariance > 0 ? 'var(--color-danger)' : 'var(--color-success)',
                          }}
                        >
                          {liveVariance > 0 ? `+${liveVariance}%` : `${liveVariance}%`}
                        </strong>
                      </div>
                    )}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                    Log or ingest a benchmark price (e.g. Brent Crude / WTI in USD) to compute live landed benchmark preview.
                  </p>
                )}

                {liveFormula && (
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', fontFamily: 'var(--font-mono)' }}>
                    Formula: {liveFormula}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="modal__footer modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              type="button"
              className="btn btn--ghost text-muted btn--sm"
              onClick={handleClearModel}
              disabled={saving}
            >
              Clear Model
            </button>
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
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
                disabled={saving}
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
