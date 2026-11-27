import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { updateMaterialInventory } from '../../api/materials.api.js';

/**
 * StockProfileModal — Configure inventory stock, burn rate & lead times (V3-M1)
 */
export function StockProfileModal({
  material,
  isOpen,
  onClose,
  onSaveSuccess,
  readOnly = false,
}) {
  if (!isOpen || !material) return null;

  const modalKey = material.id ?? material.trackedMaterialId ?? material.name ?? 'stock';
  return (
    <StockProfileModalContent
      key={modalKey}
      material={material}
      onClose={onClose}
      onSaveSuccess={onSaveSuccess}
      readOnly={readOnly}
    />
  );
}

function StockProfileModalContent({ material, onClose, onSaveSuccess, readOnly }) {
  const getInitialValue = (key, fallback = '') => {
    if (material?.[key] != null) return String(material[key]);
    if (material?.inventory?.[key] != null) return String(material.inventory[key]);
    return fallback;
  };

  const [stockQty, setStockQty] = useState(() => getInitialValue('currentStockQty', ''));
  const [burnRate, setBurnRate] = useState(() => getInitialValue('dailyConsumptionRate', ''));
  const [leadTime, setLeadTime] = useState(() => getInitialValue('supplierLeadTimeDays', '7'));
  const [maxStorage, setMaxStorage] = useState(() => getInitialValue('maxStorageDays', ''));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

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

  const numStock = stockQty.trim() !== '' ? Number(stockQty) : null;
  const numBurn = burnRate.trim() !== '' ? Number(burnRate) : null;
  const numLead = leadTime.trim() !== '' ? Number(leadTime) : 7;

  let liveCover = null;
  let liveRisk = null;

  if (numStock != null && numBurn != null && !isNaN(numStock) && !isNaN(numBurn) && numBurn > 0 && numStock >= 0) {
    liveCover = Number((numStock / numBurn).toFixed(1));
    if (liveCover <= numLead) {
      liveRisk = 'CRITICAL';
    } else if (liveCover <= Math.max(numLead * 1.5, numLead + 5)) {
      liveRisk = 'LOW';
    } else {
      liveRisk = 'HEALTHY';
    }
  }

  const targetMaterialId = material.id ?? material.trackedMaterialId;

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

    const payload = {};

    if (stockQty.trim() === '') {
      payload.currentStockQty = null;
    } else {
      const val = Number(stockQty);
      if (isNaN(val) || val < 0) {
        setFormError('Current stock quantity must be a non-negative number (0 or greater).');
        return;
      }
      payload.currentStockQty = val;
    }

    if (burnRate.trim() === '') {
      payload.dailyConsumptionRate = null;
    } else {
      const val = Number(burnRate);
      if (isNaN(val) || val <= 0) {
        setFormError('Daily consumption rate must be a positive number greater than 0.');
        return;
      }
      payload.dailyConsumptionRate = val;
    }

    if (leadTime.trim() === '') {
      payload.supplierLeadTimeDays = null;
    } else {
      const val = Number(leadTime);
      if (!Number.isInteger(val) || val < 0) {
        setFormError('Supplier lead time must be a non-negative integer (days).');
        return;
      }
      payload.supplierLeadTimeDays = val;
    }

    if (maxStorage.trim() === '') {
      payload.maxStorageDays = null;
    } else {
      const val = Number(maxStorage);
      if (!Number.isInteger(val) || val <= 0) {
        setFormError('Max storage capacity must be a positive integer (days).');
        return;
      }
      payload.maxStorageDays = val;
    }

    setSaving(true);
    try {
      const updated = await updateMaterialInventory(targetMaterialId, payload);
      if (typeof onSaveSuccess === 'function') {
        onSaveSuccess(updated);
      }
      if (typeof onClose === 'function') {
        onClose();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to update stock profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearProfile() {
    if (readOnly) {
      setFormError('Viewers have read-only permissions.');
      return;
    }
    if (!targetMaterialId) {
      setFormError('Material ID not found.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const updated = await updateMaterialInventory(targetMaterialId, {
        currentStockQty: null,
        dailyConsumptionRate: null,
        supplierLeadTimeDays: null,
        maxStorageDays: null,
      });
      if (typeof onSaveSuccess === 'function') {
        onSaveSuccess(updated);
      }
      if (typeof onClose === 'function') {
        onClose();
      }
    } catch (err) {
      setFormError(err.message || 'Failed to clear stock profile.');
    } finally {
      setSaving(false);
    }
  }

  const modalMarkup = (
    <div
      className="modal-backdrop modal-backdrop--open modal-backdrop--visible"
      id="stock-profile-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && typeof onClose === 'function') onClose();
      }}
      role="presentation"
    >
      <div
        className="modal stock-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-modal-title"
      >
        <div className="modal__header materials-modal__header">
          <div>
            <h2 id="stock-modal-title" className="modal__title materials-modal__title">
              <i className="fa-solid fa-boxes-stacked materials-modal__icon" aria-hidden="true" />
              <span>Stock Profile — {material.name}</span>
            </h2>
            <p className="materials-modal__subtitle">
              Configure current warehouse inventory and consumption rate to trigger automated reorder sizing.
            </p>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close stock profile modal"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {formError && (
          <div className="form-alert form-alert--error form-alert--visible materials-modal__alert--body-top" role="alert">
            <i className="fa-solid fa-circle-exclamation mr-1" aria-hidden="true" />
            <span className="form-alert__message">{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal__body materials-modal__body">
            {readOnly && (
              <div className="alert-banner alert-banner--warning" role="status">
                <i className="fa-solid fa-eye" aria-hidden="true" />
                <span className="alert-banner__message">
                  Read-only viewer role: stock profile edits are disabled.
                </span>
              </div>
            )}

            <div className="materials-modal__grid">
              <div className="form-group">
                <label className="form-label" htmlFor="stock-qty-input">
                  Current Warehouse Stock ({material.unit || 'units'})
                </label>
                <input
                  type="number"
                  id="stock-qty-input"
                  className="form-control font-mono"
                  placeholder="e.g. 12500"
                  step="any"
                  min="0"
                  disabled={readOnly || saving}
                  value={stockQty}
                  onChange={(e) => setStockQty(e.target.value)}
                />
                <span className="form-hint">Physical stock currently on-site or in silos (0 is valid).</span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="burn-rate-input">
                  Daily Consumption Rate ({material.unit || 'units'} / day)
                </label>
                <input
                  type="number"
                  id="burn-rate-input"
                  className="form-control font-mono"
                  placeholder="e.g. 500"
                  step="any"
                  min="0.0001"
                  disabled={readOnly || saving}
                  value={burnRate}
                  onChange={(e) => setBurnRate(e.target.value)}
                />
                <span className="form-hint">Average volume consumed by factory operations per day.</span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="lead-time-input">
                  Supplier Lead Time (Days)
                </label>
                <input
                  type="number"
                  id="lead-time-input"
                  className="form-control font-mono"
                  placeholder="7"
                  min="0"
                  step="1"
                  disabled={readOnly || saving}
                  value={leadTime}
                  onChange={(e) => setLeadTime(e.target.value)}
                />
                <span className="form-hint">Days from PO placement to physical plant delivery (defaults to 7).</span>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="max-storage-input">
                  Max Storage Limit (Days, optional)
                </label>
                <input
                  type="number"
                  id="max-storage-input"
                  className="form-control font-mono"
                  placeholder="e.g. 45"
                  min="1"
                  step="1"
                  disabled={readOnly || saving}
                  value={maxStorage}
                  onChange={(e) => setMaxStorage(e.target.value)}
                />
                <span className="form-hint">Caps reorder size to prevent exceeding warehouse capacity.</span>
              </div>
            </div>
          </div>

          {liveCover != null && (
            <div className="materials-modal__preview-box materials-modal__preview-box--inset">
              <div className="materials-modal__preview-header">
                <span className="materials-modal__preview-title">Live Inventory Telemetry</span>
                <span
                  className={`badge ${
                    liveRisk === 'CRITICAL'
                      ? 'badge--danger'
                      : liveRisk === 'LOW'
                        ? 'badge--warning'
                        : 'badge--success'
                  }`}
                >
                  {liveRisk === 'CRITICAL'
                    ? 'CRITICAL STOCKOUT RISK'
                    : liveRisk === 'LOW'
                      ? 'LOW COVERAGE'
                      : 'HEALTHY COVERAGE'}
                </span>
              </div>
              <div className="materials-modal__preview-metric font-mono">
                {liveCover} <span className="materials-modal__preview-unit">days of operational cover</span>
              </div>
              <p className="materials-modal__preview-desc">
                {liveRisk === 'CRITICAL'
                  ? `Stockout will occur within ${liveCover} days, which is <= supplier lead time of ${numLead} days. Immediate ordering action required!`
                  : liveRisk === 'LOW'
                    ? `Inventory covers ${liveCover} days. Inside standard reorder window for ${numLead}-day lead time.`
                    : `Comfortable safety stock. Plant operations covered for ${liveCover} days.`}
              </p>
            </div>
          )}

          <div className="modal__footer materials-modal__footer">
            <button
              type="button"
              className="btn btn--ghost text-muted btn--sm"
              onClick={handleClearProfile}
              disabled={readOnly || saving}
            >
              Clear Profile
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
                Save Profile
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
