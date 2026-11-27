/**
 * MaterialsPage — Raw Materials Tracking, Inventory Cover, Landed Parity & Symbol Mapping
 * Business Market Monitor — React frontend
 */

import { createContext, useContext, useCallback, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  getMaterials,
  createMaterial,
  updateMaterialTracking,
  setExternalSymbol,
  getUnitsOfMeasurement,
} from '../api/materials.api.js';
import { getBusiness } from '../api/business.api.js';
import { useAuth } from '../hooks/useAuth.js';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { ErrorState } from '../components/ui/ErrorState.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { StockProfileModal } from '../components/materials/StockProfileModal.jsx';
import { LandedCostModal } from '../components/materials/LandedCostModal.jsx';
import { WhatsAppCopilotModal } from '../components/ui/WhatsAppCopilotModal.jsx';
import '../styles/pages/materials.css';

const STATUS = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

export const SYMBOL_OPTIONS = [
  { value: '',               label: 'None' },
  { value: 'WTI',            label: 'WTI (Crude Oil Proxy — USD/bbl)' },
  { value: 'BRENT',          label: 'Brent (Crude Oil Proxy — USD/bbl)' },
  { value: 'WHEAT_GOI',      label: 'Wheat (India Mandi — INR/quintal)' },
  { value: 'SUGAR_GOI',      label: 'Sugar (India Mandi — INR/quintal)' },
  { value: 'EDIBLE_OIL_GOI', label: 'Mustard Oil (India Mandi — INR/quintal)' },
];

export function getFilteredSymbolOptions(industryIdentifier, currentSymbol = '') {
  let rawStr = '';
  if (typeof industryIdentifier === 'string') {
    rawStr = industryIdentifier;
  } else if (industryIdentifier && typeof industryIdentifier === 'object') {
    rawStr =
      industryIdentifier.industrySlug ||
      industryIdentifier.industry_slug ||
      industryIdentifier.slug ||
      industryIdentifier.industryName ||
      industryIdentifier.industry_name ||
      industryIdentifier.industry ||
      industryIdentifier.name ||
      '';
  }

  const norm = (rawStr || '').toString().toLowerCase().trim();

  let allowedValues = null;

  if (!norm) {
    allowedValues = null;
  } else if (
    norm.includes('plastic') ||
    norm.includes('polymer') ||
    norm.includes('water')
  ) {
    allowedValues = ['', 'WTI', 'BRENT'];
  } else if (
    norm.includes('food') ||
    norm.includes('beverag') ||
    norm.includes('agri') ||
    norm.includes('dairy') ||
    norm.includes('farm')
  ) {
    allowedValues = ['', 'WHEAT_GOI', 'SUGAR_GOI', 'EDIBLE_OIL_GOI', 'WTI', 'BRENT'];
  } else if (norm.includes('packag')) {
    allowedValues = ['', 'WTI', 'BRENT'];
  } else if (norm.includes('fmcg')) {
    allowedValues = null;
  } else {
    allowedValues = null;
  }

  let options = allowedValues
    ? allowedValues
        .map((val) => SYMBOL_OPTIONS.find((opt) => opt.value === val))
        .filter(Boolean)
    : [...SYMBOL_OPTIONS];

  const activeSym = (currentSymbol || '').toString().trim();
  if (activeSym && !options.some((opt) => opt.value === activeSym)) {
    const existing = SYMBOL_OPTIONS.find((opt) => opt.value === activeSym);
    if (existing) {
      options = [...options, existing];
    } else {
      options = [...options, { value: activeSym, label: `${activeSym} (Saved Symbol)` }];
    }
  }

  return options;
}

export function getSymbolDescription(symbol) {
  switch (symbol) {
    case 'WTI':
    case 'BRENT':
      return 'Proxy benchmark: Global crude oil (USD/bbl). Useful as a leading indicator, not a direct material price.';
    case 'WHEAT_GOI':
      return 'Official benchmark: Indian wholesale wheat mandi modal price (Agmarknet / data.gov.in) in INR/quintal (raw grain FAQ grade).';
    case 'SUGAR_GOI':
      return 'Official benchmark: Indian wholesale sugar mandi modal price (Agmarknet / data.gov.in) in INR/quintal (bulk commercial M-30 grade).';
    case 'EDIBLE_OIL_GOI':
      return 'Official benchmark: Indian wholesale mustard oil price (Agmarknet / data.gov.in) in INR/quintal (refined/packed wholesale).';
    default:
      return null;
  }
}

const StockModalContext = createContext(null);
const LandedModalContext = createContext(null);
const ReadOnlyContext = createContext(false);

export function MaterialsPage() {
  const { business, setBusiness } = useAuth();
  const { user } = useAuth();
  const { showToast } = useToast();

  const currentRole = business?.businessRole || user?.businessRole || 'OWNER';
  const isViewer = currentRole === 'VIEWER';

  const [status, setStatus] = useState(STATUS.LOADING);
  const [materials, setMaterials] = useState([]);
  const [units, setUnits] = useState([]);

  const [filter, setFilter] = useState('all');

  const [panelOpen, setPanelOpen] = useState(false);
  const [cmName, setCmName] = useState('');
  const [cmUnitId, setCmUnitId] = useState('');
  const [cmNameErr, setCmNameErr] = useState('');
  const [cmUnitErr, setCmUnitErr] = useState('');
  const [cmFormErr, setCmFormErr] = useState('');
  const [cmSaving, setCmSaving] = useState(false);

  const [trackingBusy, setTrackingBusy] = useState({});
  const [symbolBusy, setSymbolBusy] = useState({});

  const [stockModalMaterial, setStockModalMaterial] = useState(null);
  const [landedModalMaterial, setLandedModalMaterial] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);

  const handleStockSaved = (updatedMaterial) => {
    setMaterials((prev) =>
      prev.map((m) => (m.id === updatedMaterial.id ? { ...m, ...updatedMaterial } : m))
    );
    showToast({ message: `Stock profile updated for ${updatedMaterial.name}`, type: 'success' });
  };

  const handleLandedCostSaved = (updatedMaterial) => {
    setMaterials((prev) =>
      prev.map((m) => (m.id === updatedMaterial.id ? { ...m, ...updatedMaterial } : m))
    );
    showToast({ message: `Landed cost model updated for ${updatedMaterial.name}`, type: 'success' });
  };

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

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMaterials(), getUnitsOfMeasurement()])
      .then(([mats, unts]) => {
        if (cancelled) return;
        setMaterials(mats ?? []);
        setUnits(unts ?? []);
        setStatus(STATUS.SUCCESS);
      })
      .catch(() => {
        if (!cancelled) setStatus(STATUS.ERROR);
      });

    if (!business && typeof setBusiness === 'function') {
      getBusiness().then(setBusiness).catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [business, setBusiness]);

  const visible = filter === 'tracked' ? materials.filter((m) => m.isTracked) : materials;

  async function handleToggleTracking(material) {
    if (isViewer) {
      showToast({ type: 'error', message: 'Viewers have read-only permissions.' });
      return;
    }
    const newState = !material.isTracked;
    setTrackingBusy((prev) => ({ ...prev, [material.id]: true }));
    try {
      const updated = await updateMaterialTracking(material.id, newState);
      setMaterials((prev) => prev.map((m) => (m.id === material.id ? updated : m)));
      showToast({ type: 'success', message: 'Tracking updated.' });
    } catch {
      showToast({ type: 'error', message: 'Failed to update tracking. Please try again.' });
    } finally {
      setTrackingBusy((prev) => ({ ...prev, [material.id]: false }));
    }
  }

  async function handleSetSymbol(material, newSymbol) {
    if (isViewer) {
      showToast({ type: 'error', message: 'Viewers have read-only permissions.' });
      return;
    }
    const externalSymbol = newSymbol === '' ? null : newSymbol;

    setSymbolBusy((prev) => ({ ...prev, [material.id]: true }));
    try {
      const updated = await setExternalSymbol(material.id, externalSymbol);
      setMaterials((prev) => prev.map((m) => (m.id === material.id ? updated : m)));
      showToast({
        type: 'success',
        message: externalSymbol
          ? `External symbol set to ${externalSymbol}.`
          : 'External symbol cleared.',
      });
    } catch {
      showToast({ type: 'error', message: 'Failed to update external symbol. Please try again.' });
    } finally {
      setSymbolBusy((prev) => ({ ...prev, [material.id]: false }));
    }
  }

  function handleTogglePanel() {
    if (isViewer) return;
    setPanelOpen((prev) => {
      if (prev) {
        _resetAddForm();
      }
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

  async function handleAddSubmit(e) {
    e.preventDefault();
    if (isViewer) {
      setCmFormErr('Viewers have read-only permissions.');
      return;
    }
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
      setMaterials((prev) => [newMaterial, ...prev]);
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

  return (
    <ReadOnlyContext.Provider value={isViewer}>
      <StockModalContext.Provider value={setStockModalMaterial}>
        <LandedModalContext.Provider value={setLandedModalMaterial}>
          <div className="page-container">
            {isViewer && (
              <div className="alert-banner alert-banner--warning" role="status" id="materials-viewer-banner">
                <i className="fa-solid fa-eye" aria-hidden="true" />
                <span className="alert-banner__message">
                  You have <strong>VIEWER</strong> access. Tracking toggles, market symbols, inventory profiles, and quote logging are read-only.
                </span>
              </div>
            )}

            {/* Page toolbar */}
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

              <div className="materials-toolbar__actions">
                <button
                  type="button"
                  id="whatsapp-copilot-btn"
                  className="btn btn--secondary btn--sm materials-copilot-btn"
                  disabled={isViewer}
                  title={isViewer ? 'Viewers cannot parse or log supplier quotes' : 'Parse WhatsApp supplier quote'}
                  onClick={() => !isViewer && setCopilotOpen(true)}
                >
                  <i className="fa-brands fa-whatsapp text-success materials-whatsapp-icon" aria-hidden="true" />
                  <span>WhatsApp Copilot</span>
                </button>

                <button
                  type="button"
                  id="add-material-toggle-btn"
                  className="btn btn--secondary btn--sm"
                  disabled={isViewer}
                  title={isViewer ? 'Viewers cannot add custom materials' : undefined}
                  onClick={handleTogglePanel}
                >
                  {panelOpen ? 'Cancel' : '+ Add Custom Material'}
                </button>
              </div>
            </div>

            {/* Add Custom Material panel */}
            {panelOpen && !isViewer && (
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
                    <div className="form-row">
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
                          onChange={(e) => {
                            setCmName(e.target.value);
                            setCmNameErr('');
                          }}
                          aria-describedby="cm-name-error"
                          required
                        />
                        {cmNameErr && (
                          <p id="cm-name-error" className="form-error form-error--visible" role="alert">
                            {cmNameErr}
                          </p>
                        )}
                      </div>

                      <div className="form-group materials-form-group--reset">
                        <label className="form-label form-label--required" htmlFor="cm-unit">
                          Unit of measurement
                        </label>
                        <select
                          id="cm-unit"
                          className={`form-control${cmUnitErr ? ' form-control--error' : ''}`}
                          value={cmUnitId}
                          onChange={(e) => {
                            setCmUnitId(e.target.value);
                            setCmUnitErr('');
                          }}
                          aria-describedby="cm-unit-error"
                          required
                        >
                          <option value="">Select a unit…</option>
                          {units.map((u) => (
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

            {/* Main list container */}
            <div id="materials-list-container">
              {status === STATUS.LOADING && <Skeleton type="table" rows={5} />}

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
                  business={business}
                  isViewer={isViewer}
                  trackingBusy={trackingBusy}
                  symbolBusy={symbolBusy}
                  onToggleTracking={handleToggleTracking}
                  onSetSymbol={handleSetSymbol}
                  onOpenStock={setStockModalMaterial}
                  onShowAll={() => setFilter('all')}
                  onOpenAdd={() => !isViewer && setPanelOpen(true)}
                />
              )}
            </div>

            <StockProfileModal
              material={stockModalMaterial}
              isOpen={Boolean(stockModalMaterial)}
              onClose={() => setStockModalMaterial(null)}
              onSaveSuccess={handleStockSaved}
              readOnly={isViewer}
            />

            <LandedCostModal
              material={landedModalMaterial}
              isOpen={Boolean(landedModalMaterial)}
              onClose={() => setLandedModalMaterial(null)}
              onSaveSuccess={handleLandedCostSaved}
              readOnly={isViewer}
            />

            <WhatsAppCopilotModal
              isOpen={copilotOpen}
              onClose={() => setCopilotOpen(false)}
              materials={materials}
              onQuoteLogged={() => loadPage()}
              readOnly={isViewer}
            />
          </div>
        </LandedModalContext.Provider>
      </StockModalContext.Provider>
    </ReadOnlyContext.Provider>
  );
}

function MaterialsListContent({
  materials,
  visible,
  filter,
  business,
  isViewer,
  trackingBusy,
  symbolBusy,
  onToggleTracking,
  onSetSymbol,
  onOpenStock,
  onShowAll,
  onOpenAdd,
}) {
  if (materials.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-boxes-stacked"
        title="No materials in your workspace"
        message="Add custom raw materials or configure your industry template to begin monitoring benchmarks."
        action={
          isViewer
            ? undefined
            : { label: '+ Add Custom Material', onClick: onOpenAdd }
        }
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
      <div className="materials-table-wrap">
        <table className="table">
          <thead>
            <tr>
              {['Name', 'Unit', 'Source', 'Tracking', 'Stock Cover', 'Market Symbol', 'Actions'].map(
                (col) => (
                  <th key={col}>{col}</th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {visible.map((m) => (
              <MaterialTableRow
                key={m.id}
                material={m}
                business={business}
                isViewer={isViewer}
                busy={!!trackingBusy[m.id]}
                symbolBusy={!!symbolBusy[m.id]}
                onToggle={onToggleTracking}
                onSetSymbol={onSetSymbol}
                onOpenStock={onOpenStock}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="materials-cards">
        {visible.map((m) => (
          <MaterialCard
            key={m.id}
            material={m}
            business={business}
            isViewer={isViewer}
            busy={!!trackingBusy[m.id]}
            symbolBusy={!!symbolBusy[m.id]}
            onToggle={onToggleTracking}
            onSetSymbol={onSetSymbol}
            onOpenStock={onOpenStock}
          />
        ))}
      </div>
    </>
  );
}

function MaterialTableRow({
  material,
  business,
  isViewer,
  busy,
  symbolBusy,
  onToggle,
  onSetSymbol,
  onOpenStock,
}) {
  return (
    <tr>
      <td className="font-medium">
        <div className="materials-name-cell">
          <span>{material.name}</span>
          {material.landedUnitFactor != null && (
            <span className="badge badge--info materials-parity-badge" title="Landed parity model active">
              PARITY
            </span>
          )}
        </div>
      </td>
      <td>
        <span className="material-unit-pill">{material.unit}</span>
      </td>
      <td>
        <SourceBadge isCustom={material.isCustom} />
      </td>
      <td>
        <TrackButton material={material} busy={busy} disabled={isViewer} onToggle={onToggle} />
      </td>
      <td>
        <StockCoverBadge material={material} onOpenStock={isViewer ? undefined : onOpenStock} />
      </td>
      <td>
        {material.isTracked && (
          <div className="material-symbol-cell">
            <ExternalSymbolSelect
              material={material}
              business={business}
              busy={symbolBusy}
              disabled={isViewer}
              onSetSymbol={onSetSymbol}
            />
            {material.externalSymbol ? (
              <span className="text-xs text-muted materials-symbol-hint">
                {getSymbolDescription(material.externalSymbol) || 'Automatic market benchmark.'}
              </span>
            ) : (
              <span className="text-xs text-secondary materials-symbol-hint">
                No public market ticker — use{' '}
                <Link to={`/prices?materialId=${material.id}`} className="materials-quote-link">
                  Log Supplier Quote
                </Link>{' '}
                for custom or local grades.
              </span>
            )}
          </div>
        )}
      </td>
      <td>{material.isTracked && <ActionLinks material={material} />}</td>
    </tr>
  );
}

function MaterialCard({
  material,
  business,
  isViewer,
  busy,
  symbolBusy,
  onToggle,
  onSetSymbol,
  onOpenStock,
}) {
  return (
    <div className="card card--material material-card">
      <div className="material-card__header">
        <div className="material-card__name">
          <span>{material.name}</span>
          {material.landedUnitFactor != null && (
            <span className="badge badge--info materials-parity-badge" title="Landed parity model active">
              PARITY
            </span>
          )}
        </div>
        <SourceBadge isCustom={material.isCustom} />
      </div>
      <p className="material-card__unit">
        <span className="material-unit-pill">{material.unit}</span>
      </p>
      {material.isTracked && (
        <div className="material-card__stock">
          <StockCoverBadge material={material} onOpenStock={isViewer ? undefined : onOpenStock} />
        </div>
      )}
      <div className="material-card__footer">
        <TrackButton material={material} busy={busy} disabled={isViewer} onToggle={onToggle} />
        {material.isTracked && <ActionLinks material={material} />}
      </div>
      {material.isTracked && (
        <div className="material-card__symbol">
          <ExternalSymbolSelect
            material={material}
            business={business}
            busy={symbolBusy}
            disabled={isViewer}
            onSetSymbol={onSetSymbol}
          />
          {material.externalSymbol ? (
            <span className="text-xs text-muted materials-symbol-hint">
              {getSymbolDescription(material.externalSymbol) || 'Automatic market benchmark.'}
            </span>
          ) : (
            <span className="text-xs text-secondary materials-symbol-hint">
              No public market ticker — use{' '}
              <Link to={`/prices?materialId=${material.id}`} className="materials-quote-link">
                Log Supplier Quote
              </Link>{' '}
              for custom or local grades.
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ExternalSymbolSelect({ material, business, busy, disabled = false, onSetSymbol }) {
  const currentValue = material.externalSymbol ?? '';
  const options = getFilteredSymbolOptions(business, currentValue);

  function handleChange(e) {
    const selected = e.target.value;
    if (selected === currentValue) return;
    onSetSymbol(material, selected);
  }

  return (
    <div className="symbol-select-wrap">
      <select
        className={`form-control symbol-select${busy ? ' symbol-select--loading' : ''}`}
        value={currentValue}
        onChange={handleChange}
        disabled={busy || disabled}
        aria-label={`External market symbol for ${material.name}`}
        aria-busy={busy}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {busy && <span className="symbol-select__spinner" aria-hidden="true" />}
    </div>
  );
}

function SourceBadge({ isCustom }) {
  return (
    <span className={`badge ${isCustom ? 'badge--neutral' : 'badge--info'}`}>
      {isCustom ? 'Custom' : 'Industry'}
    </span>
  );
}

function TrackButton({ material, busy, disabled = false, onToggle }) {
  return (
    <button
      type="button"
      className={`btn btn--sm ${material.isTracked ? 'btn--success' : 'btn--secondary'}${busy ? ' btn--loading' : ''}`}
      aria-label={
        material.isTracked
          ? `Disable tracking for ${material.name}`
          : `Enable tracking for ${material.name}`
      }
      disabled={busy || disabled}
      onClick={() => onToggle(material)}
    >
      {material.isTracked ? 'Tracked' : 'Track'}
    </button>
  );
}

export function ActionLinks({ material, onOpenStock: propOpenStock, onOpenLanded: propOpenLanded }) {
  const isViewer = useContext(ReadOnlyContext);
  const contextOpenStock = useContext(StockModalContext);
  const onOpenStock = propOpenStock || (isViewer ? null : contextOpenStock);
  const contextOpenLanded = useContext(LandedModalContext);
  const onOpenLanded = propOpenLanded || (isViewer ? null : contextOpenLanded);
  const logLabel = material.externalSymbol ? 'Log Price' : 'Log Quote';

  return (
    <div className="materials-actions">
      {!isViewer && (
        <Link to={`/prices?materialId=${material.id}`} className="btn btn--sm btn--ghost">
          {logLabel}
        </Link>
      )}
      <Link to={`/trends?materialId=${material.id}`} className="btn btn--sm btn--ghost">
        History
      </Link>
      <Link to={`/materials/${material.id}/impact`} className="btn btn--sm btn--ghost">
        Impact
      </Link>
      {onOpenStock && (
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => onOpenStock(material)}
        >
          Stock Profile
        </button>
      )}
      {onOpenLanded && (
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => onOpenLanded(material)}
        >
          Landed Cost
        </button>
      )}
    </div>
  );
}

export function StockCoverBadge({ material, onOpenStock: propOpenStock }) {
  const isViewer = useContext(ReadOnlyContext);
  const contextOpenStock = useContext(StockModalContext);
  const onOpenStock = propOpenStock || (isViewer ? null : contextOpenStock);

  if (!material.isTracked) return <span className="text-xs text-muted">—</span>;

  const hasProfile =
    material.currentStockQty != null &&
    material.dailyConsumptionRate != null &&
    Number(material.dailyConsumptionRate) > 0;

  if (!hasProfile) {
    return onOpenStock ? (
      <button
        type="button"
        className="btn btn--xs btn--ghost text-muted"
        onClick={() => onOpenStock(material)}
        title="Configure stock quantity and daily consumption rate"
      >
        + Stock Profile
      </button>
    ) : (
      <span className="text-xs text-muted">Unconfigured</span>
    );
  }

  const cover = Number(
    (Number(material.currentStockQty) / Number(material.dailyConsumptionRate)).toFixed(1)
  );
  const lead =
    material.supplierLeadTimeDays != null && Number(material.supplierLeadTimeDays) >= 0
      ? Number(material.supplierLeadTimeDays)
      : 7;
  const maxDays =
    material.maxStorageDays != null && Number(material.maxStorageDays) > 0
      ? Number(material.maxStorageDays)
      : null;

  let badgeClass = 'badge--success';
  let tone = 'success';
  let filledCount = 3;
  let label = `${cover}d cover`;

  if (cover <= lead) {
    badgeClass = 'badge--danger';
    tone = 'danger';
    filledCount = 1;
    label = `CRITICAL: ${cover}d`;
  } else if (cover <= Math.max(lead * 1.5, lead + 5)) {
    badgeClass = 'badge--warning';
    tone = 'warning';
    filledCount = 2;
    label = `LOW: ${cover}d`;
  } else if (maxDays && cover > maxDays) {
    badgeClass = 'badge--info';
    tone = 'info';
    filledCount = 4;
    label = `${cover}d cover (EXCESS)`;
  }

  const badgeInner = (
    <span className="stock-cover-badge-inner">
      <span className={`badge font-mono ${badgeClass}`}>{label}</span>
      <span className="stock-cover-segments" aria-hidden="true">
        {[1, 2, 3, 4].map((seg) => (
          <span
            key={seg}
            className={`stock-cover-seg${
              seg <= filledCount ? ` stock-cover-seg--${tone}` : ''
            }`}
          />
        ))}
      </span>
    </span>
  );

  return onOpenStock ? (
    <button
      type="button"
      className="stock-cover-btn"
      onClick={() => onOpenStock(material)}
      title={`Current stock: ${material.currentStockQty} ${material.unit} (${cover} days cover vs ${lead}d lead time). Click to edit.`}
    >
      {badgeInner}
    </button>
  ) : (
    badgeInner
  );
}
