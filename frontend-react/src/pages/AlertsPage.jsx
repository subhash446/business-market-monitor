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
import { mapAlertCreateError } from '../utils/alertErrors.js';
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
import { useAuth }        from '../hooks/useAuth.js';
import { formatDateTime, formatNumber } from '../utils/format.js';
import '../styles/pages/alerts.css';

/* ── Load states ────────────────────────────────────────────────── */
const STATUS = { LOADING: 'loading', SUCCESS: 'success', ERROR: 'error', IDLE: 'idle' };

/* ── Helpers ────────────────────────────────────────────────────── */
function getMaterialName(materials, trackedMaterialId) {
  const m = materials.find(m => Number(m.id) === Number(trackedMaterialId));
  return m ? m.name : `Material #${trackedMaterialId}`;
}

function formatCondition(conditionType, thresholdType = 'ABSOLUTE') {
  if (thresholdType === 'PERCENTAGE') {
    if (conditionType === 'PRICE_ABOVE') return 'Price Increase (≥ %)';
    if (conditionType === 'PRICE_BELOW') return 'Price Drop (≥ %)';
  }
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
  const { user, business } = useAuth();
  const currentRole = business?.businessRole || user?.businessRole || 'OWNER';
  const isViewer = currentRole === 'VIEWER';

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

  useEffect(() => {
    let cancelled = false;
    Promise.all([getMaterials(), getAlertRules()])
      .then(([mats, ruleList]) => {
        if (cancelled) return;
        setMaterials(mats ?? []);
        setRules(ruleList ?? []);
        setRulesStatus(STATUS.SUCCESS);
      })
      .catch(() => {
        if (!cancelled) setRulesStatus(STATUS.ERROR);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    if (isViewer) {
      showToast({ type: 'error', message: 'Viewers have read-only permissions.' });
      return;
    }
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
    if (isViewer) {
      showToast({ type: 'error', message: 'Viewers have read-only permissions.' });
      setDeleteTarget(null);
      return;
    }
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
    <div className="page-container alerts-page">
      {isViewer && (
        <div id="alerts-viewer-banner" className="alert-banner alert-banner--info alerts-viewer-banner" role="status">
          <i className="fa-solid fa-eye" aria-hidden="true" />
          <span className="alert-banner__message">
            View-only mode: contact a workspace Owner or Purchase Manager to create, pause, or delete alert rules.
          </span>
        </div>
      )}

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="alerts-tabs" role="tablist" aria-label="Alerts views">
        <button
          type="button"
          id="tab-rules"
          role="tab"
          className={`alerts-tab-btn${activeTab === 'rules' ? ' alerts-tab-btn--active' : ''}`}
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
          className={`alerts-tab-btn${activeTab === 'events' ? ' alerts-tab-btn--active' : ''}`}
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
        className={activeTab !== 'rules' ? 'alerts-tab-panel--hidden' : ''}
      >
        {/* Toolbar — "Create Alert Rule" button */}
        <div id="rules-toolbar" className="alerts-toolbar">
          <h2 className="alerts-toolbar__title">Price Alert Rules</h2>
          <button
            type="button"
            id="create-rule-btn"
            className="btn btn--primary btn--sm"
            disabled={isViewer}
            title={isViewer ? 'Viewers have read-only permissions' : undefined}
            onClick={() => {
              if (isViewer) {
                showToast({ type: 'error', message: 'Viewers have read-only permissions.' });
                return;
              }
              setCreateOpen(true);
            }}
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
              readOnly={isViewer}
              onToggle={handleToggleRule}
              onDelete={rule => {
                if (isViewer) {
                  showToast({ type: 'error', message: 'Viewers have read-only permissions.' });
                  return;
                }
                setDeleteTarget(rule);
              }}
              onCreateRule={() => {
                if (!isViewer) setCreateOpen(true);
              }}
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
        className={activeTab !== 'events' ? 'alerts-tab-panel--hidden' : ''}
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
          <div id="events-pagination" className="alerts-pagination">
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
        readOnly={isViewer}
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
 * Columns: Material | Condition | Threshold | Channel | Cooldown | Status | Actions
 * ================================================================ */
export function RulesTable({
  rules,
  materials,
  toggleBusy = {},
  readOnly = false,
  onToggle = () => {},
  onDelete = () => {},
  onCreateRule = () => {},
}) {
  if (rules.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-bell-slash"
        title="No alert rules yet"
        message={
          readOnly
            ? 'No alert rules have been configured for this workspace yet.'
            : 'Create an alert rule to get notified when a material price crosses a threshold.'
        }
        action={readOnly ? undefined : { label: 'Create Alert Rule', onClick: onCreateRule }}
      />
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <caption className="sr-only">Alert rules</caption>
        <thead>
          <tr>
            {['Material', 'Condition', 'Threshold', 'Channel', 'Cooldown', 'Status', 'Actions'].map(col => (
              <th key={col} scope="col">
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
              readOnly={readOnly}
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
function RuleRow({ rule, materials, busy, readOnly, onToggle, onDelete }) {
  const matName = getMaterialName(materials, rule.trackedMaterialId);
  const isPct = rule.thresholdType === 'PERCENTAGE';
  return (
    <tr data-rule-id={rule.id}>
      <td>{matName}</td>
      <td>
        <span className={`badge alerts-badge-pill alerts-badge-pill--inline ${isPct ? 'badge--info' : 'badge--neutral'}`}>
          {isPct ? '% Change' : 'Absolute'}
        </span>
        {formatCondition(rule.conditionType, rule.thresholdType)}
      </td>
      <td className="font-mono">
        {isPct ? `${formatNumber(rule.thresholdPrice, 1)}%` : formatNumber(rule.thresholdPrice, 2)}
      </td>
      <td>
        <span
          className={`badge alerts-badge-pill ${
            rule.notificationChannel === 'WHATSAPP'
              ? 'badge--success'
              : rule.notificationChannel === 'BOTH'
              ? 'badge--info'
              : 'badge--neutral'
          }`}
        >
          {rule.notificationChannel === 'WHATSAPP'
            ? 'WhatsApp'
            : rule.notificationChannel === 'BOTH'
            ? 'Email + WhatsApp'
            : 'Email'}
        </span>
        {rule.destinationPhone && (
          <span className="alerts-submeta font-mono">
            {rule.destinationPhone}
          </span>
        )}
      </td>
      <td className="text-xs text-secondary">
        {rule.cooldownHours || 24}h
        {rule.lastTriggeredAt && (
          <span className="alerts-submeta">
            Fired: {formatDateTime(rule.lastTriggeredAt)}
          </span>
        )}
      </td>
      <td>
        <span className={`badge ${rule.isActive ? 'badge--success' : 'badge--neutral'}`}>
          {rule.isActive ? 'Active' : 'Paused'}
        </span>
      </td>
      <td>
        <div className="alerts-actions">
          {/* Toggle active/paused */}
          <button
            type="button"
            className={`btn btn--sm ${rule.isActive ? 'btn--ghost' : 'btn--secondary'}${busy ? ' btn--loading' : ''}`}
            aria-label={rule.isActive
              ? `Pause alert rule for ${matName}`
              : `Activate alert rule for ${matName}`}
            disabled={busy || readOnly}
            title={readOnly ? 'Viewers have read-only permissions' : undefined}
            onClick={() => { if (!readOnly) onToggle(rule); }}
          >
            {rule.isActive ? 'Pause' : 'Activate'}
          </button>
          {/* Delete */}
          <button
            type="button"
            className="btn btn--sm btn--danger btn--icon"
            aria-label={`Delete alert rule for ${matName}`}
            disabled={busy || readOnly}
            title={readOnly ? 'Viewers have read-only permissions' : undefined}
            onClick={() => { if (!readOnly) onDelete(rule); }}
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
export function EventsTable({ events }) {
  if (!events || events.length === 0) {
    return (
      <EmptyState
        icon="fa-solid fa-bell"
        title="No alerts triggered yet"
        message="Alert events will appear here when a material price crosses one of your alert thresholds."
      />
    );
  }

  return (
    <div className="table-wrapper">
      <table className="table">
        <caption className="sr-only">Alert event history</caption>
        <thead>
          <tr>
            {['Triggered At', 'Condition', 'Threshold', 'Observed Change', 'Triggered Price', 'Channel', 'Delivery Status'].map(col => (
              <th key={col} scope="col">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {events.map(evt => {
            const { cls, label } = deliveryBadgeProps(evt.deliveryStatus);
            const isPct = evt.thresholdTypeSnapshot === 'PERCENTAGE';
            return (
              <tr key={evt.id}>
                <td>{formatDateTime(evt.triggeredAt)}</td>
                <td>
                  <span className={`badge alerts-badge-pill alerts-badge-pill--inline ${isPct ? 'badge--info' : 'badge--neutral'}`}>
                    {isPct ? '% Change' : 'Absolute'}
                  </span>
                  {formatCondition(evt.conditionTypeSnapshot, evt.thresholdTypeSnapshot)}
                </td>
                <td className="font-mono">
                  {isPct
                    ? `${formatNumber(evt.thresholdPriceSnapshot, 1)}%`
                    : formatNumber(evt.thresholdPriceSnapshot, 2)}
                </td>
                <td className="font-mono">
                  {evt.triggeredChangePercent !== null && evt.triggeredChangePercent !== undefined ? (
                    <span className={Number(evt.triggeredChangePercent) >= 0 ? 'alerts-pct-up' : 'alerts-pct-down'}>
                      {Number(evt.triggeredChangePercent) >= 0 ? '+' : ''}{formatNumber(evt.triggeredChangePercent, 2)}%
                    </span>
                  ) : '—'}
                </td>
                <td className="font-mono">{formatNumber(evt.triggeredPrice, 2)}</td>
                <td>
                  <span
                    className={`badge alerts-badge-pill ${evt.notificationChannel === 'WHATSAPP' ? 'badge--success' : 'badge--neutral'}`}
                  >
                    {evt.notificationChannel === 'WHATSAPP' ? 'WhatsApp' : 'Email'}
                  </span>
                  {evt.recipientPhoneSnapshot && (
                    <span className="alerts-submeta font-mono">
                      {evt.recipientPhoneSnapshot}
                    </span>
                  )}
                </td>
                <td>
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
function CreateRuleModal({ isOpen, onClose, materials, onCreated, readOnly = false }) {
  if (!isOpen) return null;

  return (
    <CreateRuleModalContent
      isOpen={isOpen}
      onClose={onClose}
      materials={materials}
      onCreated={onCreated}
      readOnly={readOnly}
    />
  );
}

function CreateRuleModalContent({ isOpen, onClose, materials, onCreated, readOnly = false }) {
  const [matId,                setMatId]                = useState('');
  const [matErr,               setMatErr]               = useState('');
  const [thresholdType,        setThresholdType]        = useState('ABSOLUTE'); // 'ABSOLUTE' | 'PERCENTAGE'
  const [condition,            setCondition]            = useState('');
  const [condErr,              setCondErr]              = useState('');
  const [threshold,            setThreshold]            = useState('');
  const [threshErr,            setThreshErr]            = useState('');
  const [cooldownHours,        setCooldownHours]        = useState('24');
  const [cooldownErr,          setCooldownErr]          = useState('');
  const [notificationChannel,  setNotificationChannel]  = useState('EMAIL'); // 'EMAIL' | 'WHATSAPP' | 'BOTH'
  const [destinationPhone,     setDestinationPhone]     = useState('');
  const [phoneErr,             setPhoneErr]             = useState('');
  const [formErr,              setFormErr]              = useState('');
  const [saving,               setSaving]               = useState(false);

  // Only tracked materials in the select
  const trackedMaterials = materials.filter(m => m.isTracked);

  async function handleSubmit(e) {
    e.preventDefault();
    if (readOnly) {
      setFormErr('Viewers have read-only permissions.');
      return;
    }
    setMatErr(''); setCondErr(''); setThreshErr(''); setCooldownErr(''); setPhoneErr(''); setFormErr('');

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
    } else if (thresholdType === 'PERCENTAGE' && rawThresh > 1000) {
      setThreshErr('Percentage threshold must be 1000% or less.');
      valid = false;
    }

    const cd = Number(cooldownHours);
    if (!cooldownHours || Number.isNaN(cd) || !Number.isInteger(cd) || cd < 1 || cd > 720) {
      setCooldownErr('Cooldown must be between 1 and 720 hours.');
      valid = false;
    }

    if (destinationPhone.trim()) {
      const e164Regex = /^\+[1-9]\d{6,14}$/;
      if (!e164Regex.test(destinationPhone.trim())) {
        setPhoneErr('Phone must be a valid E.164 number (e.g. +919876543210).');
        valid = false;
      }
    }

    if (!valid) return;

    setSaving(true);
    try {
      const created = await createAlertRule({
        trackedMaterialId,
        conditionType:       condition,
        thresholdPrice:      rawThresh,
        thresholdType,
        cooldownHours:       cd,
        notificationChannel,
        destinationPhone:    destinationPhone.trim() || null,
      });
      onClose();
      onCreated(created);
    } catch (err) {
      const mapped = mapAlertCreateError(err);
      if (mapped.matErr) setMatErr(mapped.matErr);
      if (mapped.condErr) setCondErr(mapped.condErr);
      if (mapped.threshErr) setThreshErr(mapped.threshErr);
      if (mapped.cooldownErr) setCooldownErr(mapped.cooldownErr);
      if (mapped.formErr) setFormErr(mapped.formErr);

      const rawErrors = err?.details ?? err?.errors ?? [];
      const phoneIssue = Array.isArray(rawErrors) && rawErrors.find(e => e?.field === 'destinationPhone');
      if (phoneIssue) setPhoneErr(phoneIssue.issue);
    } finally {
      setSaving(false);
    }
  }

  const footer = (
    <div className="modal-form-footer alerts-modal-footer">
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
        disabled={saving || readOnly}
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
            disabled={readOnly}
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

        {/* Threshold Type toggle: Absolute vs % Change */}
        <div className="form-group">
          <label className="form-label form-label--required">Threshold Type</label>
          <div className="alerts-segmented" role="group" aria-label="Threshold type">
            <button
              type="button"
              className={`alerts-segmented__btn${thresholdType === 'ABSOLUTE' ? ' alerts-segmented__btn--active' : ''}`}
              disabled={readOnly}
              onClick={() => { setThresholdType('ABSOLUTE'); setThreshErr(''); }}
            >
              Absolute Price
            </button>
            <button
              type="button"
              className={`alerts-segmented__btn${thresholdType === 'PERCENTAGE' ? ' alerts-segmented__btn--active' : ''}`}
              disabled={readOnly}
              onClick={() => { setThresholdType('PERCENTAGE'); setThreshErr(''); }}
            >
              Percentage Change (%)
            </button>
          </div>
        </div>

        {/* Condition radio group */}
        <div className="form-group">
          <fieldset className="radio-fieldset" disabled={readOnly}>
            <legend className="form-label form-label--required">Condition</legend>
            {[
              {
                id: 'ar-condition-above',
                value: 'PRICE_ABOVE',
                label: thresholdType === 'PERCENTAGE' ? 'Price increases by ≥ threshold %' : 'Price goes above threshold',
              },
              {
                id: 'ar-condition-below',
                value: 'PRICE_BELOW',
                label: thresholdType === 'PERCENTAGE' ? 'Price drops by ≥ threshold %' : 'Price goes below threshold',
              },
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
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {condErr && (
            <p className="form-error form-error--visible" id="ar-condition-error" role="alert">
              {condErr}
            </p>
          )}
        </div>

        {/* Threshold price / percentage */}
        <div className="form-group">
          <label className="form-label form-label--required" htmlFor="ar-threshold">
            {thresholdType === 'PERCENTAGE' ? 'Threshold Change (%)' : 'Threshold Price'}
          </label>
          <input
            type="number"
            id="ar-threshold"
            name="thresholdPrice"
            className={`form-control font-mono${threshErr ? ' form-control--error' : ''}`}
            min={thresholdType === 'PERCENTAGE' ? '0.1' : '0.01'}
            step={thresholdType === 'PERCENTAGE' ? '0.1' : '0.01'}
            max={thresholdType === 'PERCENTAGE' ? '1000' : undefined}
            placeholder={thresholdType === 'PERCENTAGE' ? 'e.g. 5 for 5%' : 'e.g. 1500.00'}
            value={threshold}
            disabled={readOnly}
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

        {/* Cooldown period (hours) */}
        <div className="form-group">
          <label className="form-label" htmlFor="ar-cooldown">
            Cooldown Period (hours)
          </label>
          <input
            type="number"
            id="ar-cooldown"
            name="cooldownHours"
            className={`form-control font-mono${cooldownErr ? ' form-control--error' : ''}`}
            min="1"
            max="720"
            step="1"
            placeholder="24"
            value={cooldownHours}
            disabled={readOnly}
            onChange={e => { setCooldownHours(e.target.value); setCooldownErr(''); }}
            aria-describedby="ar-cooldown-error"
          />
          <small className="form-hint alerts-form-hint">
            Suppresses repeated alert notifications for this rule within this window.
          </small>
          {cooldownErr && (
            <p className="form-error form-error--visible" id="ar-cooldown-error" role="alert">
              {cooldownErr}
            </p>
          )}
        </div>

        {/* Notification Channel selector: Email, WhatsApp, Both */}
        <div className="form-group">
          <label className="form-label form-label--required">Notification Channel</label>
          <div className="alerts-segmented" role="group" aria-label="Notification channel">
            <button
              type="button"
              className={`alerts-segmented__btn${notificationChannel === 'EMAIL' ? ' alerts-segmented__btn--active' : ''}`}
              disabled={readOnly}
              onClick={() => { setNotificationChannel('EMAIL'); setPhoneErr(''); }}
            >
              Email
            </button>
            <button
              type="button"
              className={`alerts-segmented__btn${notificationChannel === 'WHATSAPP' ? ' alerts-segmented__btn--active' : ''}`}
              disabled={readOnly}
              onClick={() => { setNotificationChannel('WHATSAPP'); }}
            >
              WhatsApp
            </button>
            <button
              type="button"
              className={`alerts-segmented__btn${notificationChannel === 'BOTH' ? ' alerts-segmented__btn--active' : ''}`}
              disabled={readOnly}
              onClick={() => { setNotificationChannel('BOTH'); }}
            >
              Both
            </button>
          </div>
        </div>

        {/* WhatsApp destination phone (shown when WHATSAPP or BOTH is selected) */}
        {(notificationChannel === 'WHATSAPP' || notificationChannel === 'BOTH') && (
          <div className="form-group">
            <label className="form-label" htmlFor="ar-phone">
              WhatsApp Destination Phone (optional)
            </label>
            <input
              type="tel"
              id="ar-phone"
              name="destinationPhone"
              className={`form-control font-mono${phoneErr ? ' form-control--error' : ''}`}
              placeholder="+919876543210"
              value={destinationPhone}
              disabled={readOnly}
              onChange={e => { setDestinationPhone(e.target.value); setPhoneErr(''); }}
              aria-describedby="ar-phone-desc"
            />
            <small id="ar-phone-desc" className="form-hint alerts-form-hint">
              E.164 format with country code. If left blank, your business contact phone will be used.
            </small>
            {phoneErr && (
              <p className="form-error form-error--visible" id="ar-phone-error" role="alert">
                {phoneErr}
              </p>
            )}
          </div>
        )}

      </form>
    </Modal>
  );
}
