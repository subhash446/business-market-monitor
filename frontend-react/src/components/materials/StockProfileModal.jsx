import { useState, useEffect } from 'react';
import { updateMaterialInventory } from '../../api/materials.api.js';

/**
 * StockProfileModal — Configure inventory stock, burn rate & lead times (V3-M1)
 *
 * Enforces Tech Lead Refinements:
 * - Allows explicit 0 as valid stock (zero-stock handling).
 * - Real-time calculation of Days of Cover and Stockout Risk preview.
 * - Clear stock profile capability.
 * - Accessible modal dialog semantics (role="dialog", aria-modal="true", ESC key, backdrop).
 */
export function StockProfileModal({ material, isOpen, onClose, onSaveSuccess }) {
  const [stockQty, setStockQty] = useState(() => (material?.currentStockQty != null ? String(material.currentStockQty) : ''));
  const [burnRate, setBurnRate] = useState(() => (material?.dailyConsumptionRate != null ? String(material.dailyConsumptionRate) : ''));
  const [leadTime, setLeadTime] = useState(() => (material?.supplierLeadTimeDays != null ? String(material.supplierLeadTimeDays) : '7'));
  const [maxStorage, setMaxStorage] = useState(() => (material?.maxStorageDays != null ? String(material.maxStorageDays) : ''));
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (material) {
      setStockQty(material.currentStockQty != null ? String(material.currentStockQty) : '');
      setBurnRate(material.dailyConsumptionRate != null ? String(material.dailyConsumptionRate) : '');
      setLeadTime(material.supplierLeadTimeDays != null ? String(material.supplierLeadTimeDays) : '7');
      setMaxStorage(material.maxStorageDays != null ? String(material.maxStorageDays) : '');
      setFormError('');
    }
  }, [material]);

  // Handle ESC key dismiss
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !material) return null;

  // Live calculation preview
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

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');

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
      const updated = await updateMaterialInventory(material.id, payload);
      onSaveSuccess(updated);
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to update stock profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClearProfile() {
    setSaving(true);
    setFormError('');
    try {
      const updated = await updateMaterialInventory(material.id, {
        currentStockQty: null,
        dailyConsumptionRate: null,
        supplierLeadTimeDays: null,
        maxStorageDays: null,
      });
      onSaveSuccess(updated);
      onClose();
    } catch (err) {
      setFormError(err.message || 'Failed to clear stock profile.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="modal-backdrop modal-backdrop--visible"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        className="modal-dialog stock-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-modal-title"
      >
        <div className="modal-header">
          <div className="stock-modal-title-row">
            <i className="fa-solid fa-boxes-stacked stock-modal-icon" aria-hidden="true" />
            <div>
              <h2 id="stock-modal-title" className="modal-title">
                Stock Profile — {material.name}
              </h2>
              <p className="stock-modal-subtitle">
                Configure current warehouse inventory and consumption rate to trigger automated reorder sizing.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close stock profile modal"
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {formError && (
          <div className="form-alert form-alert--error form-alert--visible" role="alert">
            <i className="fa-solid fa-circle-exclamation mr-1" aria-hidden="true" />
            <span>{formError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <div className="modal-body stock-modal-grid">
            {/* Current Stock */}
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
                value={stockQty}
                onChange={(e) => setStockQty(e.target.value)}
              />
              <span className="form-hint">Physical stock currently on-site or in silos (0 is valid).</span>
            </div>

            {/* Daily Consumption */}
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
                value={burnRate}
                onChange={(e) => setBurnRate(e.target.value)}
              />
              <span className="form-hint">Average volume consumed by factory operations per day.</span>
            </div>

            {/* Lead Time Days */}
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
                value={leadTime}
                onChange={(e) => setLeadTime(e.target.value)}
              />
              <span className="form-hint">Days from PO placement to physical plant delivery (defaults to 7).</span>
            </div>

            {/* Max Storage Days */}
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
                value={maxStorage}
                onChange={(e) => setMaxStorage(e.target.value)}
              />
              <span className="form-hint">Caps reorder size to prevent exceeding warehouse capacity.</span>
            </div>
          </div>

          {/* Live Preview Panel */}
          {liveCover != null && (
            <div className="stock-preview-box">
              <div className="stock-preview-header">
                <span className="stock-preview-label">Live Inventory Telemetry</span>
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
              <div className="stock-preview-metric font-mono">
                {liveCover} <span className="stock-preview-unit">days of operational cover</span>
              </div>
              <p className="stock-preview-desc">
                {liveRisk === 'CRITICAL'
                  ? `Stockout will occur within ${liveCover} days, which is <= supplier lead time of ${numLead} days. Immediate ordering action required!`
                  : liveRisk === 'LOW'
                  ? `Inventory covers ${liveCover} days. Inside standard reorder window for ${numLead}-day lead time.`
                  : `Comfortable safety stock. Plant operations covered for ${liveCover} days.`}
              </p>
            </div>
          )}

          <div className="modal-footer stock-modal-footer">
            <button
              type="button"
              className="btn btn--ghost text-muted btn--sm"
              onClick={handleClearProfile}
              disabled={saving}
            >
              Clear Profile
            </button>
            <div className="stock-modal-actions">
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
                Save Profile
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
