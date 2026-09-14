/**
 * AlertsPage — Alert rules management + alert event history
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/alerts.html + frontend/js/pages/alerts.js
 *
 * TABS:
 *   Tab 1 — Alert Rules  (list, create modal, toggle active/paused, delete)
 *   Tab 2 — Alert History (events table, paginated — lazy loaded on first click)
 *
 * FLOW (preserved exactly from original):
 *  1. Auth + business guard — handled by ProtectedRoute in App.jsx
 *  2. Promise.all([GET /materials, GET /alerts/rules]) on load
 *  3. Render rules table: Material name lookup by trackedMaterialId from materials list
 *  4. "Create Alert Rule" → Modal with form
 *     POST /alerts/rules { trackedMaterialId, conditionType, thresholdPrice }
 *  5. Toggle active → PATCH /alerts/rules/:id { isActive: boolean }
 *  6. Delete → ConfirmDialog → DELETE /alerts/rules/:id (soft-delete)
 *  7. Alert History tab (lazy) → GET /alerts/events?page=1&limit=20
 *
 * BACKEND RESPONSE FIELDS (confirmed from alertRule.service.js):
 *   Rule:  { id, trackedMaterialId, conditionType, thresholdPrice, isActive }
 *   Event: { id, triggeredPrice, thresholdPriceSnapshot, conditionTypeSnapshot,
 *            notificationChannel, deliveryStatus, triggeredAt }
 *   conditionType enums: 'PRICE_ABOVE' | 'PRICE_BELOW'
 *   deliveryStatus enums: 'PENDING' | 'SENT' | 'FAILED'
 *   PATCH allowed fields: conditionType, thresholdPrice, isActive ONLY
 *   DELETE is soft-delete → returns { id, deletedAt }
 *
 * MATERIAL ID:
 *   Rule.trackedMaterialId = tracked_materials.id — matches material.id from GET /materials
 *   Used for name lookup: materials.find(m => Number(m.id) === Number(trackedMaterialId))
 *   POST body: trackedMaterialId (NOT materialId — exact field name the backend validates)
 *
 * SECURITY: No userId in request bodies. No innerHTML. No eval().
 */

import { useCallback, useEffect, useState } from 'react';
import {
  getMaterials,
} from '../api/materials.api.js';
import {
  getAlertRules,
  createAlertRule,
  updateAlertRule,
  deleteAlertRule,
  getAlertEvents,
  EVENTS_LIMIT,
} from '../api/alerts.api.js';
import { Skeleton }       from '../components/ui/Skeleton.jsx';
import { EmptyState }     from '../components/ui/EmptyState.jsx';
import { ErrorState }     from '../components/ui/ErrorState.jsx';
import { Pagination }     from '../components/ui/Pagination.jsx';
import { Modal }          from '../components/ui/Modal.jsx';
import { ConfirmDialog }  from '../components/ui/ConfirmDialog.jsx';
import { useToast }       from '../components/ui/Toast.jsx';
import { formatDateTime, formatNumber } from '../utils/format.js';
import '../styles/pages/alerts.css';

/* ── Load states ────────────────────────────────────────────────── */
const STATUS = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error', IDLE: 'idle' };

/* ── Helpers ────────────────────────────────────────────────────── */
function getMaterialName(materials, trackedMaterialId) {
  const m = materials.find(m => Number(m.id) === Number(trackedMaterialId));
  return m ? m.name : `Material #${trackedMaterialId}`;
}

function formatCondition(conditionType) {
  if (conditionType === 'PRICE_ABOVE') return 'Price Above';
  if (conditionType === 'PRICE_BELOW') return 'Price Below';
  return conditionType;
}

function deliveryBadgeProps(status) {
  const map = {
    PENDING: { cls: 'badge--warning', label: 'Pending' },
    SENT:    { cls: 'badge--success', label: 'Sent'    },
    FAILED:  { cls: 'badge--danger',  label: 'Failed'  },
  };
  return map[status] ?? { cls: 'badge--neutral', label: status };
}

/* ================================================================
 * MAIN PAGE COMPONENT
 * ================================================================ */
export function AlertsPage() {
  const { showToast } = useToast();

  /* ── Data state ─────────────────────────────────────────────── */
  const [materials,     setMaterials]     = useState([]);
  const [rules,         setRules]         = useState([]);
  const [rulesStatus,   setRulesStatus]   = useState(STATUS.LOADING);

  /* ── Tab state ──────────────────────────────────────────────── */
  const [activeTab,     setActiveTab]     = useState('rules');
  const [eventsLoaded,  setEventsLoaded]  = useState(false);

  /* ── Events state ───────────────────────────────────────────── */
  const [events,        setEvents]        = useState([]);
  const [eventsMeta,    setEventsMeta]    = useState(null);
  const [eventsStatus,  setEventsStatus]  = useState(STATUS.IDLE);

  /* ── Create modal state ─────────────────────────────────────── */
  const [createOpen,    setCreateOpen]    = useState(false);

  /* ── Toggle busy: { [ruleId]: boolean } ────────────────────── */
  const [toggleBusy,    setToggleBusy]    = useState({});

  /* ── Delete confirm state ───────────────────────────────────── */
  const [deleteTarget,  setDeleteTarget]  = useState(null); // rule object | null

  /* ── Page load ──────────────────────────────────────────────── */
  const loadPage = useCallback(async () => {
    setRulesStatus(STATUS.LOADING);
    try {
      const [mats, ruleList] = await Promise.all([getMaterials(), getAlertRules()]);
      setMaterials(mats ?? []);
      setRules(ruleList ?? []);
      setRulesStatus(STATUS.SUCCESS);
    } catch {
      setRulesStatus(STATUS.ERROR);
    }
  }, []);

  useEffect(() => { loadPage(); }, [loadPage]);

  /* ── Tab switching — lazy load events on first open ─────────── */
  function handleTabSwitch(tab) {
    setActiveTab(tab);
    if (tab === 'events' && !eventsLoaded) {
      setEventsLoaded(true);
      loadEvents(1);
    }
  }

  /* ── Load events ────────────────────────────────────────────── */
  async function loadEvents(page = 1) {
    setEventsStatus(STATUS.LOADING);
    try {
      const { data, meta } = await getAlertEvents({ page, limit: EVENTS_LIMIT });
      setEvents(data ?? []);
      setEventsMeta(meta);
      setEventsStatus(STATUS.SUCCESS);
    } catch {
      setEventsStatus(STATUS.ERROR);
    }
  }

  /* ── Toggle active/inactive ─────────────────────────────────── */
  async function handleToggleRule(rule) {
    const newIsActive = !rule.isActive;
    setToggleBusy(prev => ({ ...prev, [rule.id]: true }));
    try {
      // PATCH body: { isActive: boolean } — the only field being changed here
      const updated = await updateAlertRule(rule.id, { isActive: newIsActive });
      setRules(prev => prev.map(r => r.id === rule.id ? updated : r));
      showToast({ type: 'success', message: 'Alert rule updated.' });
    } catch {
      showToast({ type: 'error', message: 'Failed to update alert rule. Please try again.' });
    } finally {
      setToggleBusy(prev => ({ ...prev, [rule.id]: false }));
    }
  }

  /* ── Delete rule ────────────────────────────────────────────── */
  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const rule = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteAlertRule(rule.id);
      const updated = rules.filter(r => r.id !== rule.id);
      setRules(updated);
      showToast({ type: 'success', message: 'Alert rule deleted.' });
    } catch {
      showToast({ type: 'error', message: 'Failed to delete alert rule. Please try again.' });
    }
  }

  /* ── Handle rule created ────────────────────────────────────── */
  function handleRuleCreated(created) {
    setRules(prev => [created, ...prev]);
    showToast({ type: 'success', message: 'Alert rule created.' });
  }

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="page-container">

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="tab-bar" role="tablist" aria-label="Alerts views">
        <button
          type="button"
          id="tab-rules"
          role="tab"
          className={`tab-btn${activeTab === 'rules' ? ' tab-btn--active' : ''}`}
          aria-selected={activeTab === 'rules' ? 'true' : 'false'}
          aria-controls="panel-rules"
          onClick={() => handleTabSwitch('rules')}
        >
          Alert Rules
        </button>
        <button
          type="button"
          id="tab-events"
          role="tab"
          className={`tab-btn${activeTab === 'events' ? ' tab-btn--active' : ''}`}
          aria-selected={activeTab === 'events' ? 'true' : 'false'}
          aria-controls="panel-events"
          onClick={() => handleTabSwitch('events')}
        >
          Alert History
        </button>
      </div>

      {/* ========================================================
          TAB 1 — Alert Rules
          ======================================================== */}
      <div
        id="panel-rules"
        role="tabpanel"
        aria-labelledby="tab-rules"
        className={activeTab !== 'rules' ? 'tab-panel--hidden' : ''}
      >
        {/* Toolbar — "Create Alert Rule" button */}
        <div id="rules-toolbar" className="page-toolbar">
          <button
            type="button"
            id="create-rule-btn"
            className="btn btn--primary btn--sm"
            onClick={() => setCreateOpen(true)}
          >
            + Create Alert Rule
          </button>
        </div>

        {/* Rules container */}
        <div id="rules-container">
          {rulesStatus === STATUS.LOADING && <Skeleton type="table" rows={3} />}

          {rulesStatus === STATUS.ERROR && (
            <ErrorState
              title="Failed to load alert rules"
              message="Something went wrong. Please try again."
              retry={loadPage}
            />
          )}

          {rulesStatus === STATUS.SUCCESS && (
            <RulesTable
              rules={rules}
              materials={materials}
              toggleBusy={toggleBusy}
              onToggle={handleToggleRule}
              onDelete={rule => setDeleteTarget(rule)}
              onCreateRule={() => setCreateOpen(true)}
            />
          )}
        </div>
      </div>

      {/* ========================================================
          TAB 2 — Alert History
          ======================================================== */}
      <div
        id="panel-events"
        role="tabpanel"
        aria-labelledby="tab-events"
        className={activeTab !== 'events' ? 'tab-panel--hidden' : ''}
      >
        <div id="events-container">
          {eventsStatus === STATUS.IDLE && null}
          {eventsStatus === STATUS.LOADING && <Skeleton type="table" rows={5} />}

          {eventsStatus === STATUS.ERROR && (
            <ErrorState
              title="Failed to load alert events"
              message="Something went wrong. Please try again."
              retry={() => loadEvents(eventsMeta?.page ?? 1)}
            />
          )}

          {eventsStatus === STATUS.SUCCESS && (
            <EventsTable events={events} />
          )}
        </div>

        {eventsStatus === STATUS.SUCCESS && (
          <div id="events-pagination">
            <Pagination meta={eventsMeta} onPageChange={page => loadEvents(page)} />
          </div>
        )}
      </div>

      {/* ── Create Alert Rule Modal ──────────────────────────── */}
      <CreateRuleModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        materials={materials}
        onCreated={handleRuleCreated}
        showToast={showToast}
      />

      {/* ── Delete Confirmation ──────────────────────────────── */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        title="Delete Alert Rule"
        message="Are you sure you want to delete this alert rule? This cannot be undone."
        confirmLabel="Delete"
        danger={true}
      />

    </div>
  );
}

/* ================================================================
 * RULES TABLE
 * Columns: Material | Condition | Threshold | Status | Actions
 * ================================================================ */
function RulesTable({ rules, materials, toggleBusy, onToggle, onDelete, onCreateRule }) {
  if (rules.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-bell-slash"
        title="No alert rules yet"
        message="Create an alert rule to get notified when a material price crosses a threshold."
        action={{ label: 'Create Alert Rule', onClick: onCreateRule }}
      />
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <caption className="sr-only">Alert rules</caption>
        <thead>
          <tr className="table__header-row">
            {['Material', 'Condition', 'Threshold', 'Status', 'Actions'].map(col => (
              <th key={col} className="table__cell table__cell--header" scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody id="rules-table-body">
          {rules.map(rule => (
            <RuleRow
              key={rule.id}
              rule={rule}
              materials={materials}
              busy={!!toggleBusy[rule.id]}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Single Rule Row ────────────────────────────────────────────── */
function RuleRow({ rule, materials, busy, onToggle, onDelete }) {
  const matName = getMaterialName(materials, rule.trackedMaterialId);
  return (
    <tr data-rule-id={rule.id}>
      <td className="table__cell">{matName}</td>
      <td className="table__cell">{formatCondition(rule.conditionType)}</td>
      <td className="table__cell font-mono">{formatNumber(rule.thresholdPrice, 2)}</td>
      <td className="table__cell">
        <span className={`badge ${rule.isActive ? 'badge--success' : 'badge--neutral'}`}>
          {rule.isActive ? 'Active' : 'Paused'}
        </span>
      </td>
      <td className="table__cell">
        <div className="alerts-actions">
          {/* Toggle active/paused */}
          <button
            type="button"
            className={`btn btn--sm ${rule.isActive ? 'btn--ghost' : 'btn--secondary'}${busy ? ' btn--loading' : ''}`}
            aria-label={rule.isActive
              ? `Pause alert rule for ${matName}`
              : `Activate alert rule for ${matName}`}
            disabled={busy}
            onClick={() => onToggle(rule)}
          >
            {rule.isActive ? 'Pause' : 'Activate'}
          </button>
          {/* Delete */}
          <button
            type="button"
            className="btn btn--sm btn--danger btn--icon"
            aria-label={`Delete alert rule for ${matName}`}
            disabled={busy}
            onClick={() => onDelete(rule)}
          >
            <i className="fa-solid fa-trash" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

/* ================================================================
 * EVENTS TABLE
 * Columns: Triggered At | Condition | Triggered Price | Delivery Status
 * ================================================================ */
function EventsTable({ events }) {
  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-bell"
        title="No alerts triggered yet"
        message="Alert events will appear here when a material price crosses one of your alert thresholds. Automated monitoring is pending activation in the current version."
      />
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <caption className="sr-only">Alert event history</caption>
        <thead>
          <tr className="table__header-row">
            {['Triggered At', 'Condition', 'Triggered Price', 'Delivery Status'].map(col => (
              <th key={col} className="table__cell table__cell--header" scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map(evt => {
            const { cls, label } = deliveryBadgeProps(evt.deliveryStatus);
            return (
              <tr key={evt.id}>
                <td className="table__cell">{formatDateTime(evt.triggeredAt)}</td>
                <td className="table__cell">
                  {formatCondition(evt.conditionTypeSnapshot)}{' '}
                  {formatNumber(evt.thresholdPriceSnapshot, 2)}
                </td>
                <td className="table__cell font-mono">{formatNumber(evt.triggeredPrice, 2)}</td>
                <td className="table__cell">
                  <span className={`badge ${cls}`}>{label}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ================================================================
 * CREATE ALERT RULE MODAL
 * Fields: trackedMaterialId (select), conditionType (radio), thresholdPrice (number)
 * POST /api/v1/alerts/rules { trackedMaterialId, conditionType, thresholdPrice }
 * ================================================================ */
function CreateRuleModal({ isOpen, onClose, materials, onCreated, showToast }) {
  const [matId,       setMatId]       = useState('');
  const [matErr,      setMatErr]      = useState('');
  const [condition,   setCondition]   = useState('');
  const [condErr,     setCondErr]     = useState('');
  const [threshold,   setThreshold]   = useState('');
  const [threshErr,   setThreshErr]   = useState('');
  const [formErr,     setFormErr]     = useState('');
  const [saving,      setSaving]      = useState(false);

  // Reset on open/close
  useEffect(() => {
    if (!isOpen) {
      setMatId(''); setMatErr('');
      setCondition(''); setCondErr('');
      setThreshold(''); setThreshErr('');
      setFormErr(''); setSaving(false);
    }
  }, [isOpen]);

  // Only tracked materials in the select — mirrors original _materials.filter(m => m.isTracked)
  const trackedMaterials = materials.filter(m => m.isTracked);

  async function handleSubmit(e) {
    e.preventDefault();
    setMatErr(''); setCondErr(''); setThreshErr(''); setFormErr('');

    let valid = true;

    const trackedMaterialId = Number(matId);
    if (!trackedMaterialId) {
      setMatErr('Please select a material.');
      valid = false;
    }

    if (!condition) {
      setCondErr('Please select a condition.');
      valid = false;
    }

    const rawThresh = parseFloat(threshold);
    if (!threshold || isNaN(rawThresh) || rawThresh <= 0) {
      setThreshErr('Threshold must be a positive number.');
      valid = false;
    }

    if (!valid) return;

    setSaving(true);
    try {
      // POST /api/v1/alerts/rules — body: { trackedMaterialId, conditionType, thresholdPrice }
      const created = await createAlertRule({
        trackedMaterialId,
        conditionType:  condition,
        thresholdPrice: rawThresh,
      });
      onClose();
      onCreated(created);
    } catch (err) {
      if (err?.status === 409) {
        setFormErr('An alert rule already exists for this material and condition.');
      } else if (err?.status === 404) {
        setMatErr('Material not found. Please reload and try again.');
      } else if (err?.status === 400) {
        const errors = err?.errors ?? [];
        const mE = errors.find(e => e.field === 'trackedMaterialId');
        const cE = errors.find(e => e.field === 'conditionType');
        const tE = errors.find(e => e.field === 'thresholdPrice');
        if (mE) setMatErr('Please select a material.');
        if (cE) setCondErr('Please select a condition.');
        if (tE) setThreshErr('Threshold must be a positive number.');
        if (!mE && !cE && !tE) setFormErr('Please check your inputs and try again.');
      } else {
        setFormErr('Could not create alert rule. Check your connection.');
      }
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="modal-form-footer">
      <button
        type="button"
        className="btn btn--ghost"
        onClick={onClose}
      >
        Cancel
      </button>
      <button
        type="submit"
        form="create-alert-form"
        id="ar-submit-btn"
        className={`btn btn--primary${saving ? ' btn--loading' : ''}`}
        disabled={saving}
      >
        Create Rule
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Alert Rule"
      size="sm"
      id="create-alert-modal"
      footer={footer}
    >
      <form id="create-alert-form" onSubmit={handleSubmit} noValidate>

        {/* Form-level alert */}
        {formErr && (
          <div className="form-alert form-alert--error form-alert--visible" id="ar-form-error" role="alert">
            <p className="form-alert__message">{formErr}</p>
          </div>
        )}

        {/* Material select — tracked only */}
        <div className="form-group">
          <label className="form-label form-label--required" htmlFor="ar-material">
            Material
          </label>
          <select
            id="ar-material"
            name="trackedMaterialId"
            className={`form-control${matErr ? ' form-control--error' : ''}`}
            value={matId}
            onChange={e => { setMatId(e.target.value); setMatErr(''); }}
            aria-required="true"
            aria-describedby="ar-material-error"
          >
            <option value="" disabled>Select a material…</option>
            {trackedMaterials.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {matErr && (
            <p className="form-error form-error--visible" id="ar-material-error" role="alert">
              {matErr}
            </p>
          )}
        </div>

        {/* Condition radio group */}
        <div className="form-group">
          <fieldset className="radio-fieldset">
            <legend className="form-label form-label--required">Condition</legend>
            {[
              { id: 'ar-condition-above', value: 'PRICE_ABOVE', label: 'Price goes above threshold' },
              { id: 'ar-condition-below', value: 'PRICE_BELOW', label: 'Price goes below threshold' },
            ].map(({ id, value, label }) => (
              <label key={value} className="radio-label">
                <input
                  type="radio"
                  id={id}
                  name="ar-condition"
                  value={value}
                  checked={condition === value}
                  onChange={() => { setCondition(value); setCondErr(''); }}
                />
                <span> {label}</span>
              </label>
            ))}
          </fieldset>
          {condErr && (
            <p className="form-error form-error--visible" id="ar-condition-error" role="alert">
              {condErr}
            </p>
          )}
        </div>

        {/* Threshold price */}
        <div className="form-group">
          <label className="form-label form-label--required" htmlFor="ar-threshold">
            Threshold Price
          </label>
          <input
            type="number"
            id="ar-threshold"
            name="thresholdPrice"
            className={`form-control font-mono${threshErr ? ' form-control--error' : ''}`}
            min="0.01"
            step="0.01"
            placeholder="e.g. 1500.00"
            value={threshold}
            onChange={e => { setThreshold(e.target.value); setThreshErr(''); }}
            aria-required="true"
            aria-describedby="ar-threshold-error"
          />
          {threshErr && (
            <p className="form-error form-error--visible" id="ar-threshold-error" role="alert">
              {threshErr}
            </p>
          )}
        </div>

      </form>
    </Modal>
  );
}
