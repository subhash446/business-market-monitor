/**
 * Alerts page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §5.8, Doc 4 §7.1 — js/pages/alerts.js
 *
 * TABS:
 *  Tab 1 — Alert Rules  (list, create, toggle active, delete)
 *  Tab 2 — Alert History (events, paginated — lazy loaded on first tab click)
 *
 * FLOW:
 *  1. requireAuth() + requireBusiness()
 *  2. initNav({ pageTitle: 'Alerts', activeHref: '/pages/alerts.html' })
 *  3. Promise.all([GET /materials, GET /alerts/rules]) on load
 *  4. Render rules table with material name lookup from loaded materials
 *  5. "Create Alert Rule" → modal (modal.js) with validated form
 *     POST /alerts/rules { trackedMaterialId, conditionType, thresholdPrice }
 *  6. Toggle active → PATCH /alerts/rules/:id { isActive: boolean }
 *  7. Delete → confirmAction → DELETE /alerts/rules/:id → remove row
 *  8. Alert History tab (lazy) → GET /alerts/events?page=1&limit=20
 *
 * BACKEND RESPONSE FIELDS (confirmed from alertRule.service.js):
 *   Rule:  { id, trackedMaterialId, conditionType, thresholdPrice, isActive }
 *   Event: { id, triggeredPrice, thresholdPriceSnapshot, conditionTypeSnapshot,
 *            notificationChannel, deliveryStatus, triggeredAt }
 *   conditionType enums: 'PRICE_ABOVE' | 'PRICE_BELOW'
 *   deliveryStatus enums: 'PENDING' | 'SENT' | 'FAILED'
 *   PATCH allowed fields: conditionType, thresholdPrice, isActive  ONLY
 *   DELETE is soft-delete → returns { id, deletedAt }
 *
 * SECURITY:
 *   No userId in request bodies.
 *   No innerHTML with API data — textContent / createElement only.
 *   No eval().
 */

import { requireAuth, requireBusiness }   from '/js/auth/auth.js';
import { initNav }                        from '/js/components/nav.js';
import { showSkeleton, hideSkeleton }     from '/js/components/loader.js';
import { renderEmptyState }               from '/js/components/emptyState.js';
import { renderErrorState }               from '/js/components/errorState.js';
import { renderPagination }               from '/js/components/pagination.js';
import { showToast }                      from '/js/components/toast.js';
import { confirmAction }                  from '/js/components/confirm.js';
import { createModal, openModal,
         closeModal, destroyModal }       from '/js/components/modal.js';
import { getMaterials }                   from '/js/api/materials.api.js';
import { getAlertRules, createAlertRule,
         updateAlertRule, deleteAlertRule,
         getAlertEvents, EVENTS_LIMIT }   from '/js/api/alerts.api.js';
import { formatDateTime, formatNumber }   from '/js/utils/format.js';
import { byId, show, hide, createElement,
         showFieldError, clearFieldError,
         showFormAlert, hideFormAlert }   from '/js/utils/dom.js';

// ── Auth guards ────────────────────────────────────────────────────────────────
requireAuth();
requireBusiness();

// ── Nav ────────────────────────────────────────────────────────────────────────
initNav({ pageTitle: 'Alerts', activeHref: '/pages/alerts.html' });

// ── State ──────────────────────────────────────────────────────────────────────
let _materials   = []; // [{id, name, unit, isTracked}]
let _rules       = []; // [{id, trackedMaterialId, conditionType, thresholdPrice, isActive}]
let _eventsLoaded = false; // lazy flag

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Look up material name from loaded list by trackedMaterialId */
function _getMaterialName(trackedMaterialId) {
  const m = _materials.find((m) => Number(m.id) === Number(trackedMaterialId));
  return m ? m.name : `Material #${trackedMaterialId}`;
}

/**
 * Format conditionType enum → human-readable string
 * PRICE_ABOVE → "Price Above"
 * PRICE_BELOW → "Price Below"
 */
function _formatCondition(conditionType) {
  if (conditionType === 'PRICE_ABOVE') return 'Price Above';
  if (conditionType === 'PRICE_BELOW') return 'Price Below';
  return conditionType;
}

/* ================================================================
 * TAB SWITCHING (same pattern as Trends)
 * ================================================================ */

const tabRules   = byId('tab-rules');
const tabEvents  = byId('tab-events');
const panelRules = byId('panel-rules');
const panelEvents= byId('panel-events');

function _activateTab(tab) {
  const isRules = (tab === 'rules');

  if (tabRules)   { tabRules.classList.toggle('tab-btn--active', isRules);   tabRules.setAttribute('aria-selected',  isRules  ? 'true' : 'false'); }
  if (tabEvents)  { tabEvents.classList.toggle('tab-btn--active', !isRules);  tabEvents.setAttribute('aria-selected', !isRules ? 'true' : 'false'); }
  if (panelRules) panelRules.classList.toggle('tab-panel--hidden', !isRules);
  if (panelEvents)panelEvents.classList.toggle('tab-panel--hidden',  isRules);

  // Lazy load events when tab first opened
  if (!isRules && !_eventsLoaded) {
    _eventsLoaded = true;
    _loadEvents(1);
  }
}

if (tabRules)  tabRules.addEventListener('click',  () => _activateTab('rules'));
if (tabEvents) tabEvents.addEventListener('click',  () => _activateTab('events'));

/* ================================================================
 * RULES TABLE — render
 * ================================================================ */

const rulesContainer = byId('rules-container');
const rulesToolbar   = byId('rules-toolbar');

/**
 * Build a single rules table row for a rule.
 * Columns: Material | Condition | Threshold | Status | Actions
 */
function _makeRuleRow(rule) {
  const tr = document.createElement('tr');
  tr.dataset.ruleId = rule.id;

  const matName = _getMaterialName(rule.trackedMaterialId);

  // Material
  const tdMat = document.createElement('td');
  tdMat.className = 'table__cell';
  tdMat.textContent = matName;
  tr.appendChild(tdMat);

  // Condition
  const tdCond = document.createElement('td');
  tdCond.className = 'table__cell';
  tdCond.textContent = _formatCondition(rule.conditionType);
  tr.appendChild(tdCond);

  // Threshold
  const tdThresh = document.createElement('td');
  tdThresh.className = 'table__cell font-mono';
  tdThresh.textContent = formatNumber(rule.thresholdPrice, 2);
  tr.appendChild(tdThresh);

  // Status badge
  const tdStatus = document.createElement('td');
  tdStatus.className = 'table__cell';
  const badge = createElement('span', {
    className: `badge ${rule.isActive ? 'badge--success' : 'badge--neutral'}`,
    text:      rule.isActive ? 'Active' : 'Paused',
  });
  tdStatus.appendChild(badge);
  tr.appendChild(tdStatus);

  // Actions
  const tdActions = document.createElement('td');
  tdActions.className = 'table__cell';
  const actionsWrap = createElement('div', { className: 'alerts-actions' });

  // Toggle button
  const toggleBtn = createElement('button', {
    className: `btn btn--sm ${rule.isActive ? 'btn--ghost' : 'btn--secondary'}`,
    text:      rule.isActive ? 'Pause' : 'Activate',
    attrs: {
      type:       'button',
      'aria-label': rule.isActive
        ? `Pause alert rule for ${matName}`
        : `Activate alert rule for ${matName}`,
    },
  });
  toggleBtn.addEventListener('click', () => _toggleRule(rule, tr));
  actionsWrap.appendChild(toggleBtn);

  // Delete button
  const deleteBtn = createElement('button', {
    className: 'btn btn--sm btn--danger btn--icon',
    attrs: {
      type:       'button',
      'aria-label': `Delete alert rule for ${matName}`,
    },
  });
  const trashIcon = document.createElement('i');
  trashIcon.className = 'fa-solid fa-trash';
  trashIcon.setAttribute('aria-hidden', 'true');
  deleteBtn.appendChild(trashIcon);
  deleteBtn.addEventListener('click', () => _deleteRule(rule, tr));
  actionsWrap.appendChild(deleteBtn);

  tdActions.appendChild(actionsWrap);
  tr.appendChild(tdActions);

  return tr;
}

function _renderRules(rules) {
  if (!rulesContainer) return;
  hideSkeleton(rulesContainer);
  while (rulesContainer.firstChild) rulesContainer.removeChild(rulesContainer.firstChild);

  if (rules.length === 0) {
    renderEmptyState(rulesContainer, {
      icon:    'fa-solid fa-bell-slash',
      title:   'No alert rules yet',
      message: 'Create an alert rule to get notified when a material price crosses a threshold.',
      action:  { label: 'Create Alert Rule', onClick: () => _openCreateModal() },
    });
    return;
  }

  const tableWrap = createElement('div', { className: 'table-wrapper' });
  const table = document.createElement('table');
  table.className = 'table';

  const caption = createElement('caption', { className: 'sr-only', text: 'Alert rules' });
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.className = 'table__header-row';
  ['Material', 'Condition', 'Threshold', 'Status', 'Actions'].forEach((col) => {
    const th = createElement('th', {
      className: 'table__cell table__cell--header',
      text:      col,
      attrs:     { scope: 'col' },
    });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  tbody.id = 'rules-table-body';
  rules.forEach((r) => tbody.appendChild(_makeRuleRow(r)));
  table.appendChild(tbody);
  tableWrap.appendChild(table);
  rulesContainer.appendChild(tableWrap);
}

/* ================================================================
 * TOGGLE ACTIVE/INACTIVE
 * PATCH /api/v1/alerts/rules/:ruleId { isActive: boolean }
 * ================================================================ */

async function _toggleRule(rule, tr) {
  const newIsActive = !rule.isActive;
  const matName = _getMaterialName(rule.trackedMaterialId);

  // Optimistic: disable row buttons during request
  const btns = tr.querySelectorAll('button');
  btns.forEach((b) => { b.disabled = true; });

  try {
    // PATCH body: { isActive: boolean } — the only field being changed here
    const updated = await updateAlertRule(rule.id, { isActive: newIsActive });

    // Sync local state
    const idx = _rules.findIndex((r) => r.id === rule.id);
    if (idx !== -1) _rules[idx] = updated;

    showToast({ type: 'success', message: 'Alert rule updated.' });

    // Re-render the row in-place
    const newRow = _makeRuleRow(updated);
    tr.replaceWith(newRow);

  } catch {
    showToast({ type: 'error', message: 'Failed to update alert rule. Please try again.' });
    btns.forEach((b) => { b.disabled = false; });
  }
}

/* ================================================================
 * DELETE (SOFT-DELETE)
 * confirmAction → DELETE /api/v1/alerts/rules/:ruleId → remove row
 * ================================================================ */

function _deleteRule(rule, tr) {
  const matName = _getMaterialName(rule.trackedMaterialId);
  confirmAction({
    title:        'Delete Alert Rule',
    message:      'Are you sure you want to delete this alert rule? This cannot be undone.',
    confirmLabel: 'Delete',
    danger:       true,
    onConfirm:    async () => {
      try {
        await deleteAlertRule(rule.id);

        // Remove from local state
        _rules = _rules.filter((r) => r.id !== rule.id);

        // Remove row from DOM
        tr.remove();

        // If table is now empty, re-render empty state
        const tbody = byId('rules-table-body');
        if (tbody && tbody.rows.length === 0) {
          _renderRules([]);
        }

        showToast({ type: 'success', message: 'Alert rule deleted.' });

      } catch {
        showToast({ type: 'error', message: 'Failed to delete alert rule. Please try again.' });
      }
    },
  });
}

/* ================================================================
 * CREATE ALERT RULE MODAL
 * Modal (modal.js) + form with material select, condition radio,
 * threshold number input
 * ================================================================ */

const CREATE_MODAL_ID = 'create-alert-modal';

function _openCreateModal() {
  // Clean up any leftover instance
  destroyModal(CREATE_MODAL_ID);

  // ── Build form content ─────────────────────────────────────────
  const form = document.createElement('form');
  form.id = 'create-alert-form';
  form.noValidate = true;

  // Form-level alert
  const formAlert = createElement('div', { className: 'form-alert form-alert--error', attrs: { id: 'ar-form-error', role: 'alert' } });
  const formAlertMsg = createElement('p', { className: 'form-alert__message' });
  formAlert.appendChild(formAlertMsg);
  form.appendChild(formAlert);

  // Material select
  const matGroup = createElement('div', { className: 'form-group' });
  const matLabel = createElement('label', { className: 'form-label form-label--required', text: 'Material', attrs: { for: 'ar-material' } });
  const matSelect = document.createElement('select');
  matSelect.className = 'form-control';
  matSelect.id = 'ar-material';
  matSelect.name = 'trackedMaterialId';
  matSelect.setAttribute('aria-required', 'true');
  matSelect.setAttribute('aria-describedby', 'ar-material-error');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = 'Select a material…';
  matSelect.appendChild(placeholder);

  // Only tracked materials
  _materials.filter((m) => m.isTracked).forEach((m) => {
    const opt = document.createElement('option');
    opt.value       = m.id;
    opt.textContent = m.name;
    matSelect.appendChild(opt);
  });

  const matError = createElement('p', { className: 'form-error', attrs: { id: 'ar-material-error', role: 'alert' } });
  matGroup.appendChild(matLabel);
  matGroup.appendChild(matSelect);
  matGroup.appendChild(matError);
  form.appendChild(matGroup);

  // Condition radio group (PRICE_ABOVE / PRICE_BELOW)
  const condGroup = createElement('div', { className: 'form-group' });
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'radio-fieldset';
  const legend = createElement('legend', { className: 'form-label form-label--required', text: 'Condition' });
  fieldset.appendChild(legend);

  [
    { id: 'ar-condition-above', value: 'PRICE_ABOVE', label: 'Price goes above threshold' },
    { id: 'ar-condition-below', value: 'PRICE_BELOW', label: 'Price goes below threshold' },
  ].forEach(({ id, value, label }) => {
    const radioLabel = document.createElement('label');
    radioLabel.className = 'radio-label';
    const radio = document.createElement('input');
    radio.type  = 'radio';
    radio.name  = 'ar-condition';
    radio.id    = id;
    radio.value = value;
    radioLabel.appendChild(radio);
    const labelText = createElement('span', { text: ` ${label}` });
    radioLabel.appendChild(labelText);
    fieldset.appendChild(radioLabel);
  });

  const condError = createElement('p', { className: 'form-error', attrs: { id: 'ar-condition-error', role: 'alert' } });
  condGroup.appendChild(fieldset);
  condGroup.appendChild(condError);
  form.appendChild(condGroup);

  // Threshold price
  const threshGroup = createElement('div', { className: 'form-group' });
  const threshLabel = createElement('label', { className: 'form-label form-label--required', text: 'Threshold Price', attrs: { for: 'ar-threshold' } });
  const threshInput = document.createElement('input');
  threshInput.type        = 'number';
  threshInput.className   = 'form-control font-mono';
  threshInput.id          = 'ar-threshold';
  threshInput.name        = 'thresholdPrice';
  threshInput.min         = '0.01';
  threshInput.step        = '0.01';
  threshInput.placeholder = 'e.g. 1500.00';
  threshInput.setAttribute('aria-required', 'true');
  threshInput.setAttribute('aria-describedby', 'ar-threshold-error');
  const threshError = createElement('p', { className: 'form-error', attrs: { id: 'ar-threshold-error', role: 'alert' } });
  threshGroup.appendChild(threshLabel);
  threshGroup.appendChild(threshInput);
  threshGroup.appendChild(threshError);
  form.appendChild(threshGroup);

  // ── Build modal footer ─────────────────────────────────────────
  const footer = createElement('div', { className: 'modal-form-footer' });

  const cancelBtn = createElement('button', {
    className: 'btn btn--ghost',
    text:      'Cancel',
    attrs:     { type: 'button' },
  });
  cancelBtn.addEventListener('click', () => { closeModal(CREATE_MODAL_ID); destroyModal(CREATE_MODAL_ID); });

  const submitBtn = createElement('button', {
  className: 'btn btn--primary',
  text:     'Create Rule',
  attrs: {
    type: 'submit',
    id: 'ar-submit-btn',
    form: 'create-alert-form',
  },
});

  footer.appendChild(cancelBtn);
  footer.appendChild(submitBtn);

  // ── Create and open modal ──────────────────────────────────────
  createModal({ id: CREATE_MODAL_ID, title: 'Create Alert Rule', content: form, footer, size: 'sm' });
  openModal(CREATE_MODAL_ID);

  // ── Form submission ────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideFormAlert(formAlert);

    let valid = true;

    // Validate material
    const trackedMaterialId = Number(matSelect.value);
    if (!trackedMaterialId) {
      showFieldError(matSelect, matError, 'Please select a material.');
      valid = false;
    } else {
      clearFieldError(matSelect, matError);
    }

    // Validate condition
    const condSelected = form.querySelector('input[name="ar-condition"]:checked');
    const conditionType = condSelected ? condSelected.value : '';
    if (!conditionType) {
      condError.textContent = 'Please select a condition.';
      condError.style.display = 'block';
      valid = false;
    } else {
      condError.textContent = '';
      condError.style.display = 'none';
    }

    // Validate threshold
    const rawThresh = parseFloat(threshInput.value);
    if (!threshInput.value || isNaN(rawThresh) || rawThresh <= 0) {
      showFieldError(threshInput, threshError, 'Threshold must be a positive number.');
      valid = false;
    } else {
      clearFieldError(threshInput, threshError);
    }

    if (!valid) return;

    submitBtn.classList.add('btn--loading');
    submitBtn.disabled = true;

    try {
      // POST /api/v1/alerts/rules — body: { trackedMaterialId, conditionType, thresholdPrice }
      const created = await createAlertRule({
        trackedMaterialId,
        conditionType,
        thresholdPrice: rawThresh,
      });

      // Close modal
      closeModal(CREATE_MODAL_ID);
      destroyModal(CREATE_MODAL_ID);

      // Prepend new rule to local state + re-render
      _rules = [created, ..._rules];
      _renderRules(_rules);

      showToast({ type: 'success', message: 'Alert rule created.' });

    } catch (err) {
      if (err?.status === 409) {
        showFormAlert(formAlert, 'An alert rule already exists for this material and condition.');
      } else if (err?.status === 404) {
        showFieldError(matSelect, matError, 'Material not found. Please reload and try again.');
      } else if (err?.status === 400) {
        const errors = err?.errors ?? [];
        const matErr     = errors.find((e) => e.field === 'trackedMaterialId');
        const condErr    = errors.find((e) => e.field === 'conditionType');
        const threshErr  = errors.find((e) => e.field === 'thresholdPrice');
        if (matErr)    showFieldError(matSelect,  matError,   'Please select a material.');
        if (condErr)   { condError.textContent = 'Please select a condition.'; condError.style.display = 'block'; }
        if (threshErr) showFieldError(threshInput, threshError,'Threshold must be a positive number.');
        if (!matErr && !condErr && !threshErr) showFormAlert(formAlert, 'Please check your inputs and try again.');
      } else {
        showFormAlert(formAlert, 'Could not create alert rule. Check your connection.');
      }
    } finally {
      submitBtn.classList.remove('btn--loading');
      submitBtn.disabled = false;
    }
  });
}

// Wire "Create Alert Rule" toolbar button
const createRuleBtn = byId('create-rule-btn');
if (createRuleBtn) createRuleBtn.addEventListener('click', () => _openCreateModal());

/* ================================================================
 * ALERT HISTORY TAB — EVENTS TABLE
 * GET /api/v1/alerts/events?page=1&limit=20
 * Lazy loaded on first tab open.
 * ================================================================ */

const eventsContainer = byId('events-container');
const eventsPagination = byId('events-pagination');

/** Format delivery status → badge class + label */
function _deliveryBadge(status) {
  const map = {
    PENDING: { cls: 'badge--warning', label: 'Pending' },
    SENT:    { cls: 'badge--success', label: 'Sent'    },
    FAILED:  { cls: 'badge--danger',  label: 'Failed'  },
  };
  return map[status] || { cls: 'badge--neutral', label: status };
}

function _renderEvents(events) {
  if (!eventsContainer) return;
  hideSkeleton(eventsContainer);
  while (eventsContainer.firstChild) eventsContainer.removeChild(eventsContainer.firstChild);

  if (!events || events.length === 0) {
    renderEmptyState(eventsContainer, {
      icon:    'fa-solid fa-bell',
      title:   'No alerts triggered yet',
      message: 'Alert events will appear here when a material price crosses one of your alert thresholds. Automated monitoring is pending activation in the current version.',
    });
    return;
  }

  const tableWrap = createElement('div', { className: 'table-wrapper' });
  const table = document.createElement('table');
  table.className = 'table';

  const caption = createElement('caption', { className: 'sr-only', text: 'Alert event history' });
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headerRow.className = 'table__header-row';
  ['Triggered At', 'Condition', 'Triggered Price', 'Delivery Status'].forEach((col) => {
    const th = createElement('th', {
      className: 'table__cell table__cell--header',
      text:      col,
      attrs:     { scope: 'col' },
    });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');

  events.forEach((evt) => {
    const tr = document.createElement('tr');

    // Triggered At
    const tdAt = document.createElement('td');
    tdAt.className = 'table__cell';
    tdAt.textContent = formatDateTime(evt.triggeredAt);
    tr.appendChild(tdAt);

    // Condition: conditionTypeSnapshot + thresholdPriceSnapshot
    const tdCond = document.createElement('td');
    tdCond.className = 'table__cell';
    tdCond.textContent = `${_formatCondition(evt.conditionTypeSnapshot)} ${formatNumber(evt.thresholdPriceSnapshot, 2)}`;
    tr.appendChild(tdCond);

    // Triggered Price
    const tdPrice = document.createElement('td');
    tdPrice.className = 'table__cell font-mono';
    tdPrice.textContent = formatNumber(evt.triggeredPrice, 2);
    tr.appendChild(tdPrice);

    // Delivery Status badge
    const tdStatus = document.createElement('td');
    tdStatus.className = 'table__cell';
    const { cls, label } = _deliveryBadge(evt.deliveryStatus);
    const badge = createElement('span', { className: `badge ${cls}`, text: label });
    tdStatus.appendChild(badge);
    tr.appendChild(tdStatus);

    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  tableWrap.appendChild(table);
  eventsContainer.appendChild(tableWrap);
}

async function _loadEvents(page = 1) {
  if (eventsContainer) showSkeleton(eventsContainer, { rows: 5, type: 'table' });
  if (eventsPagination) while (eventsPagination.firstChild) eventsPagination.removeChild(eventsPagination.firstChild);

  try {
    const { data: events, meta } = await getAlertEvents({ page, limit: EVENTS_LIMIT });
    _renderEvents(events);

    if (eventsPagination) {
      renderPagination(eventsPagination, meta, (newPage) => _loadEvents(newPage));
    }
  } catch {
    if (eventsContainer) {
      hideSkeleton(eventsContainer);
      renderErrorState(eventsContainer, {
        title:   'Failed to load alert events',
        message: 'Something went wrong. Please try again.',
        retry:   () => _loadEvents(page),
      });
    }
  }
}

/* ================================================================
 * PAGE LOAD — fetch materials + rules in parallel
 * ================================================================ */

async function loadPage() {
  if (rulesContainer) showSkeleton(rulesContainer, { rows: 3, type: 'table' });

  try {
    const [materials, rules] = await Promise.all([
      getMaterials(),
      getAlertRules(),
    ]);

    _materials = materials;
    _rules     = rules;

    _renderRules(_rules);

  } catch {
    if (rulesContainer) {
      hideSkeleton(rulesContainer);
      renderErrorState(rulesContainer, {
        title:   'Failed to load alert rules',
        message: 'Something went wrong. Please try again.',
        retry:   () => loadPage(),
      });
    }
  }
}

loadPage();
