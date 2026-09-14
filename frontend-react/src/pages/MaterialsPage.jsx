/**
 * MaterialsPage — Materials list with tracking toggle, custom material creation,
 * and external symbol management (Phase C).
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/materials.html + frontend/js/pages/materials.js
 *
 * FLOW (preserved exactly from original):
 *  1. Auth + business guard — handled by ProtectedRoute in App.jsx
 *  2. Promise.all([GET /materials, GET /units-of-measurement]) in parallel
 *  3. Render materials table (tablet+) / cards (mobile) — CSS handles responsiveness
 *  4. Filter: All | Tracked Only (client-side, no re-fetch)
 *  5. "Add Custom Material" collapsible panel — POST /materials { customName, unitId }
 *  6. PATCH /materials/:id { isTracked } — toggle tracking in-place
 *  7. PATCH /materials/:id/external-symbol — set/clear EIA symbol (Phase C)
 *
 * BACKEND RESPONSE FIELDS (confirmed from materialTracking.service.js):
 *   material.name    — COALESCE of raw_materials.name / custom_name (display name)
 *   material.unit    — abbreviation (e.g. "kg", "t")
 *   material.isTracked
 *   material.isCustom — rawMaterialId === null
 *   material.externalSymbol — 'WTI' | 'BRENT' | null  (Phase B addition)
 *   NO customName field in responses; NO significantChange field
 *
 * PATCH /materials/:id ONLY accepts { isTracked: boolean }.
 *   Any other field → 400 from backend.
 *
 * MATERIAL ID:
 *   material.id = tracked_materials.id — universal material ID for downstream APIs.
 *   Used in "Log Price" link (/prices?materialId=<id>) and "History" (/trends?materialId=<id>).
 *   Do NOT substitute rawMaterialId.
 *
 * POST /materials body: { customName, unitId } — NOT { name, ... }
 *
 * EXTERNAL SYMBOL:
 *   The external symbol dropdown (None / WTI / BRENT) is only shown for
 *   tracked materials. Selecting a value calls PATCH .../external-symbol.
 *   Selecting "None" sends { externalSymbol: null } to clear the mapping.
 *   On API failure the select reverts to the previous value and a toast is shown.
 *
 * SECURITY:
 *   No userId in requests. No innerHTML. No eval().
 */

import { useCallback, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getMaterials,
  createMaterial,
  updateMaterialTracking,
  setExternalSymbol,
  getUnitsOfMeasurement,
} from '../api/materials.api.js';
import { Skeleton }   from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { useToast }   from '../components/ui/Toast.jsx';
import '../styles/pages/materials.css';

/* ── Load state ────────────────────────────────────────────── */
const STATUS = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

/* ── Supported external symbols (matches backend SUPPORTED_SYMBOLS) ── */
const SYMBOL_OPTIONS = [
  { value: '',      label: 'None' },
  { value: 'WTI',  label: 'WTI (Crude Oil)' },
  { value: 'BRENT', label: 'Brent (Crude Oil)' },
];

export function MaterialsPage() {
  const { showToast } = useToast();

  /* ── Data state ─────────────────────────────────────────── */
  const [status,    setStatus]    = useState(STATUS.LOADING);
  const [materials, setMaterials] = useState([]);
  const [units,     setUnits]     = useState([]);

  /* ── Filter state — 'all' | 'tracked' ──────────────────── */
  const [filter, setFilter] = useState('all');

  /* ── Add custom material panel state ───────────────────── */
  const [panelOpen,   setPanelOpen]   = useState(false);
  const [cmName,      setCmName]      = useState('');
  const [cmUnitId,    setCmUnitId]    = useState('');
  const [cmNameErr,   setCmNameErr]   = useState('');
  const [cmUnitErr,   setCmUnitErr]   = useState('');
  const [cmFormErr,   setCmFormErr]   = useState('');
  const [cmSaving,    setCmSaving]    = useState(false);

  /* ── Toggle tracking loading map: { [id]: boolean } ────── */
  const [trackingBusy, setTrackingBusy] = useState({});

  /* ── External symbol loading map: { [id]: boolean } ────── */
  const [symbolBusy, setSymbolBusy] = useState({});

  /* ── Load data ──────────────────────────────────────────── */
  const loadPage = useCallback(async () => {
    setStatus(STATUS.LOADING);
    try {
      const [mats, unts] = await Promise.all([getMaterials(), getUnitsOfMeasurement()]);
      setMaterials(mats ?? []);
      setUnits(unts ?? []);
      setStatus(STATUS.SUCCESS);
    } catch {
      setStatus(STATUS.ERROR);
    }
  }, []);

  useEffect(() => { loadPage(); }, [loadPage]);

  /* ── Derived: filtered list ─────────────────────────────── */
  const visible = filter === 'tracked'
    ? materials.filter(m => m.isTracked)
    : materials;

  /* ── Tracking toggle ────────────────────────────────────── */
  async function handleToggleTracking(material) {
    const newState = !material.isTracked;
    setTrackingBusy(prev => ({ ...prev, [material.id]: true }));
    try {
      const updated = await updateMaterialTracking(material.id, newState);
      setMaterials(prev =>
        prev.map(m => m.id === material.id ? updated : m)
      );
      showToast({ type: 'success', message: 'Tracking updated.' });
    } catch {
      showToast({ type: 'error', message: 'Failed to update tracking. Please try again.' });
    } finally {
      setTrackingBusy(prev => ({ ...prev, [material.id]: false }));
    }
  }

  /* ── External symbol change ─────────────────────────────── */
  async function handleSetSymbol(material, newSymbol) {
    // newSymbol is '' (empty string from select) → send null to clear
    const externalSymbol = newSymbol === '' ? null : newSymbol;

    setSymbolBusy(prev => ({ ...prev, [material.id]: true }));
    try {
      const updated = await setExternalSymbol(material.id, externalSymbol);
      // Update in-place, preserve order and filter
      setMaterials(prev =>
        prev.map(m => m.id === material.id ? updated : m)
      );
      showToast({
        type: 'success',
        message: externalSymbol
          ? `External symbol set to ${externalSymbol}.`
          : 'External symbol cleared.',
      });
    } catch {
      // Revert — the materials array already reflects the old value since we
      // only update state on success. The select reads from material.externalSymbol
      // so it naturally reverts when the parent state is unchanged.
      showToast({ type: 'error', message: 'Failed to update external symbol. Please try again.' });
    } finally {
      setSymbolBusy(prev => ({ ...prev, [material.id]: false }));
    }
  }

  /* ── Add custom material panel toggle ───────────────────── */
  function handleTogglePanel() {
    setPanelOpen(prev => {
      if (prev) { _resetAddForm(); }
      return !prev;
    });
  }

  function _resetAddForm() {
    setCmName('');
    setCmUnitId('');
    setCmNameErr('');
    setCmUnitErr('');
    setCmFormErr('');
  }

  /* ── Add custom material submit ─────────────────────────── */
  async function handleAddSubmit(e) {
    e.preventDefault();
    setCmNameErr('');
    setCmUnitErr('');
    setCmFormErr('');

    let valid = true;

    const trimName = cmName.trim();
    if (!trimName || trimName.length > 150) {
      setCmNameErr('Material name is required (max 150 characters).');
      valid = false;
    }

    const unitId = Number(cmUnitId);
    if (!unitId) {
      setCmUnitErr('Please select a unit of measurement.');
      valid = false;
    }

    if (!valid) return;

    setCmSaving(true);
    try {
      const newMaterial = await createMaterial({ customName: trimName, unitId });
      setMaterials(prev => [newMaterial, ...prev]);
      setPanelOpen(false);
      _resetAddForm();
      showToast({ type: 'success', message: 'Custom material added.' });
    } catch (err) {
      if (err?.status === 409) {
        setCmFormErr('A material with this name already exists.');
      } else if (err?.status === 400) {
        setCmFormErr('Please check your inputs and try again.');
      } else {
        setCmFormErr('Could not add material. Check your connection.');
      }
    } finally {
      setCmSaving(false);
    }
  }

  /* ── Render ───────────────────────────────────────────────── */
  return (
    <div className="page-container">

      {/* ── Page toolbar: filter + add button ─────────────────── */}
      <div className="materials-toolbar">
        <div className="filter-bar" role="group" aria-label="Filter materials">
          <button
            type="button"
            className={`btn btn--sm filter-btn${filter === 'all' ? ' filter-btn--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            type="button"
            className={`btn btn--sm filter-btn${filter === 'tracked' ? ' filter-btn--active' : ''}`}
            onClick={() => setFilter('tracked')}
          >
            Tracked Only
          </button>
        </div>

        <button
          type="button"
          id="add-material-toggle-btn"
          className="btn btn--secondary btn--sm"
          onClick={handleTogglePanel}
        >
          {panelOpen ? 'Cancel' : '+ Add Custom Material'}
        </button>
      </div>

      {/* ── Add Custom Material panel ────────────────────────── */}
      {panelOpen && (
        <div id="add-material-panel" className="card add-panel">
          <div className="card__header">
            <h2 className="card__title">Add Custom Material</h2>
          </div>
          <div className="card__body">
            {cmFormErr && (
              <div className="form-alert form-alert--error form-alert--visible" role="alert">
                <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
                <span className="form-alert__message">{cmFormErr}</span>
              </div>
            )}
            <form id="add-material-form" onSubmit={handleAddSubmit} noValidate>

              {/* Custom material name */}
              <div className="form-group">
                <label className="form-label form-label--required" htmlFor="cm-name">
                  Material name
                </label>
                <input
                  type="text"
                  id="cm-name"
                  className={`form-control${cmNameErr ? ' form-control--error' : ''}`}
                  placeholder="e.g. Premium Grade Steel"
                  maxLength={150}
                  value={cmName}
                  onChange={e => { setCmName(e.target.value); setCmNameErr(''); }}
                  aria-describedby="cm-name-error"
                  required
                />
                {cmNameErr && (
                  <p id="cm-name-error" className="form-error form-error--visible" role="alert">
                    {cmNameErr}
                  </p>
                )}
              </div>

              {/* Unit of measurement */}
              <div className="form-group">
                <label className="form-label form-label--required" htmlFor="cm-unit">
                  Unit of measurement
                </label>
                <select
                  id="cm-unit"
                  className={`form-control${cmUnitErr ? ' form-control--error' : ''}`}
                  value={cmUnitId}
                  onChange={e => { setCmUnitId(e.target.value); setCmUnitErr(''); }}
                  aria-describedby="cm-unit-error"
                  required
                >
                  <option value="">Select a unit…</option>
                  {units.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.abbreviation})
                    </option>
                  ))}
                </select>
                {cmUnitErr && (
                  <p id="cm-unit-error" className="form-error form-error--visible" role="alert">
                    {cmUnitErr}
                  </p>
                )}
              </div>

              <div className="form-actions">
                <button
                  type="submit"
                  id="cm-submit-btn"
                  className={`btn btn--primary${cmSaving ? ' btn--loading' : ''}`}
                  disabled={cmSaving}
                >
                  Add Material
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Main list container ──────────────────────────────── */}
      <div id="materials-list-container">

        {status === STATUS.LOADING && <Skeleton type="list" rows={5} />}

        {status === STATUS.ERROR && (
          <ErrorState
            title="Failed to load materials"
            message="Something went wrong. Please try again."
            retry={loadPage}
          />
        )}

        {status === STATUS.SUCCESS && (
          <MaterialsListContent
            materials={materials}
            visible={visible}
            filter={filter}
            trackingBusy={trackingBusy}
            symbolBusy={symbolBusy}
            onToggleTracking={handleToggleTracking}
            onSetSymbol={handleSetSymbol}
            onShowAll={() => setFilter('all')}
          />
        )}
      </div>

    </div>
  );
}

/* ================================================================
 * MATERIALS LIST CONTENT
 * ================================================================ */
function MaterialsListContent({
  materials, visible, filter, trackingBusy, symbolBusy,
  onToggleTracking, onSetSymbol, onShowAll,
}) {
  if (materials.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-boxes-stacked"
        title="No materials in your workspace"
        message="No materials in your workspace."
      />
    );
  }

  if (visible.length === 0 && filter === 'tracked') {
    return (
      <EmptyState
        icon="fa-solid fa-box-open"
        title="No tracked materials"
        message="You are not tracking any materials yet. Click 'Track' next to a material to start."
        action={{ label: 'View All Materials', onClick: onShowAll }}
      />
    );
  }

  return (
    <>
      {/* ── Table (tablet+) ─────────────────────────────────── */}
      <div className="materials-table-wrap">
        <table className="table">
          <thead>
            <tr>
              {['Name', 'Unit', 'Source', 'Tracking', 'Market Symbol', 'Actions'].map(col => (
                <th key={col} className="table__header">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(m => (
              <MaterialTableRow
                key={m.id}
                material={m}
                busy={!!trackingBusy[m.id]}
                symbolBusy={!!symbolBusy[m.id]}
                onToggle={onToggleTracking}
                onSetSymbol={onSetSymbol}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Cards (mobile) ──────────────────────────────────── */}
      <div className="materials-cards">
        {visible.map(m => (
          <MaterialCard
            key={m.id}
            material={m}
            busy={!!trackingBusy[m.id]}
            symbolBusy={!!symbolBusy[m.id]}
            onToggle={onToggleTracking}
            onSetSymbol={onSetSymbol}
          />
        ))}
      </div>
    </>
  );
}

/* ================================================================
 * TABLE ROW (tablet+)
 * ================================================================ */
function MaterialTableRow({ material, busy, symbolBusy, onToggle, onSetSymbol }) {
  return (
    <tr>
      <td className="table__cell">{material.name}</td>
      <td className="table__cell">{material.unit}</td>
      <td className="table__cell">
        <SourceBadge isCustom={material.isCustom} />
      </td>
      <td className="table__cell">
        <TrackButton material={material} busy={busy} onToggle={onToggle} />
      </td>
      <td className="table__cell">
        {material.isTracked && (
          <ExternalSymbolSelect
            material={material}
            busy={symbolBusy}
            onSetSymbol={onSetSymbol}
          />
        )}
      </td>
      <td className="table__cell">
        {material.isTracked && <ActionLinks material={material} />}
      </td>
    </tr>
  );
}

/* ================================================================
 * MOBILE CARD
 * ================================================================ */
function MaterialCard({ material, busy, symbolBusy, onToggle, onSetSymbol }) {
  return (
    <div className="card card--material material-card">
      <div className="material-card__header">
        <span className="material-card__name">{material.name}</span>
        <SourceBadge isCustom={material.isCustom} />
      </div>
      <p className="material-card__unit">{material.unit}</p>
      <div className="material-card__footer">
        <TrackButton material={material} busy={busy} onToggle={onToggle} />
        {material.isTracked && <ActionLinks material={material} />}
      </div>
      {material.isTracked && (
        <div className="material-card__symbol">
          <ExternalSymbolSelect
            material={material}
            busy={symbolBusy}
            onSetSymbol={onSetSymbol}
          />
        </div>
      )}
    </div>
  );
}

/* ── External symbol select ──────────────────────────────────
 * Renders a small <select> showing None / WTI / BRENT.
 * Only rendered when material.isTracked === true.
 * Sends null to the API when "None" is selected.
 * Disabled while the API call is in flight (symbolBusy).
 * ─────────────────────────────────────────────────────────── */
function ExternalSymbolSelect({ material, busy, onSetSymbol }) {
  // The select value is '' for null (select can't hold null natively)
  const currentValue = material.externalSymbol ?? '';

  function handleChange(e) {
    const selected = e.target.value;  // '' | 'WTI' | 'BRENT'
    if (selected === currentValue) return;  // no change
    onSetSymbol(material, selected);
  }

  return (
    <div className="symbol-select-wrap">
      <select
        className={`form-control symbol-select${busy ? ' symbol-select--loading' : ''}`}
        value={currentValue}
        onChange={handleChange}
        disabled={busy}
        aria-label={`External market symbol for ${material.name}`}
        aria-busy={busy}
      >
        {SYMBOL_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {busy && (
        <span className="symbol-select__spinner" aria-hidden="true" />
      )}
    </div>
  );
}

/* ── Source badge: Custom (badge--neutral) | Industry (badge--info) ── */
function SourceBadge({ isCustom }) {
  return (
    <span className={`badge ${isCustom ? 'badge--neutral' : 'badge--info'}`}>
      {isCustom ? 'Custom' : 'Industry'}
    </span>
  );
}

/* ── Track/Tracked button ────────────────────────────────────── */
function TrackButton({ material, busy, onToggle }) {
  return (
    <button
      type="button"
      className={`btn btn--sm ${material.isTracked ? 'btn--success' : 'btn--secondary'}${busy ? ' btn--loading' : ''}`}
      aria-label={material.isTracked
        ? `Disable tracking for ${material.name}`
        : `Enable tracking for ${material.name}`}
      disabled={busy}
      onClick={() => onToggle(material)}
    >
      {material.isTracked ? 'Tracked' : 'Track'}
    </button>
  );
}

/* ── Action links — shown only when isTracked === true ─────────
 * Links use material.id = tracked_materials.id (universal ID)
 * ──────────────────────────────────────────────────────────── */
function ActionLinks({ material }) {
  return (
    <div className="materials-actions">
      <Link
        to={`/prices?materialId=${material.id}`}
        className="btn btn--sm btn--ghost"
      >
        Log Price
      </Link>
      <Link
        to={`/trends?materialId=${material.id}`}
        className="btn btn--sm btn--ghost"
      >
        History
      </Link>
    </div>
  );
}
