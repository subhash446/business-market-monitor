/**
 * Materials page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §5.5, Doc 4 §4.1 — js/pages/materials.js
 *
 * FLOW:
 *  1. requireAuth() + requireBusiness()
 *  2. initNav({ pageTitle: 'Materials', activeHref: '/pages/materials.html' })
 *  3. Promise.all([GET /materials, GET /units-of-measurement])
 *  4. Render materials table (tablet+) / card list (mobile)
 *  5. "Add Custom Material" collapsible panel
 *  6. Filter: All | Tracked Only (client-side, no re-fetch)
 *  7. PATCH /materials/:id { isTracked } — toggle in-place
 *
 * BACKEND RESPONSE FIELDS (confirmed from materialTracking.service.js):
 *   material.name    — display name (COALESCE of raw_materials.name / custom_name)
 *   material.unit    — abbreviation (e.g. "kg", "t")
 *   material.isTracked
 *   material.isCustom — rawMaterialId === null
 *   NO customName field in responses
 *   NO significantChange field
 *
 * PATCH /materials/:id accepts ONLY { isTracked: boolean }.
 * Any other field → 400 from backend.
 *
 * SECURITY:
 *   No userId in requests.
 *   No innerHTML with API data — textContent / createElement only.
 *   No eval().
 */

import { requireAuth, requireBusiness }      from '/js/auth/auth.js';
import { initNav }                           from '/js/components/nav.js';
import { showSkeleton, hideSkeleton }        from '/js/components/loader.js';
import { renderEmptyState }                  from '/js/components/emptyState.js';
import { renderErrorState }                  from '/js/components/errorState.js';
import { showToast }                         from '/js/components/toast.js';
import { getMaterials, createMaterial,
         updateMaterialTracking,
         getUnitsOfMeasurement }             from '/js/api/materials.api.js';
import { createElement, byId, show, hide,
         showFieldError, clearFieldError,
         showFormAlert, hideFormAlert }       from '/js/utils/dom.js';

// ── Auth guards ────────────────────────────────────────────────────────────────
requireAuth();
requireBusiness();

// ── Nav ────────────────────────────────────────────────────────────────────────
initNav({ pageTitle: 'Materials', activeHref: '/pages/materials.html' });

// ── State ──────────────────────────────────────────────────────────────────────
let _materials   = [];   // full list from API
let _units       = [];   // [{id, name, abbreviation}]
let _filter      = 'all'; // 'all' | 'tracked'

// ── Element references ─────────────────────────────────────────────────────────
const listContainer   = byId('materials-list-container');
const filterAllBtn    = byId('filter-all-btn');
const filterTrkBtn    = byId('filter-tracked-btn');
const addPanelToggle  = byId('add-material-toggle-btn');
const addPanel        = byId('add-material-panel');
const addForm         = byId('add-material-form');
const cmNameInput     = byId('cm-name');
const cmNameError     = byId('cm-name-error');
const cmUnitSelect    = byId('cm-unit');
const cmUnitError     = byId('cm-unit-error');
const cmFormAlert     = byId('cm-form-error');
const cmSubmitBtn     = byId('cm-submit-btn');

/* ================================================================
 * FILTER BUTTONS
 * ================================================================ */

function _setFilter(f) {
  _filter = f;
  if (filterAllBtn) filterAllBtn.classList.toggle('filter-btn--active', f === 'all');
  if (filterTrkBtn) filterTrkBtn.classList.toggle('filter-btn--active', f === 'tracked');
  _renderList();
}

if (filterAllBtn) filterAllBtn.addEventListener('click', () => _setFilter('all'));
if (filterTrkBtn) filterTrkBtn.addEventListener('click', () => _setFilter('tracked'));

/* ================================================================
 * ADD CUSTOM MATERIAL PANEL TOGGLE
 * ================================================================ */

let _panelOpen = false;

function _toggleAddPanel(forceClose = false) {
  _panelOpen = forceClose ? false : !_panelOpen;
  if (addPanel) {
    if (_panelOpen) {
      addPanel.classList.remove('add-panel--hidden');
    } else {
      addPanel.classList.add('add-panel--hidden');
      _resetAddForm();
    }
  }
  if (addPanelToggle) {
    addPanelToggle.textContent = _panelOpen ? 'Cancel' : '+ Add Custom Material';
  }
}

if (addPanelToggle) addPanelToggle.addEventListener('click', () => _toggleAddPanel());

function _resetAddForm() {
  if (addForm) addForm.reset();
  if (cmNameError) clearFieldError(cmNameInput, cmNameError);
  if (cmUnitError) clearFieldError(cmUnitSelect, cmUnitError);
  if (cmFormAlert) hideFormAlert(cmFormAlert);
}

/* ================================================================
 * UNITS POPULATION
 * ================================================================ */

function _populateUnits(units) {
  if (!cmUnitSelect) return;
  // Clear existing options except the placeholder
  while (cmUnitSelect.options.length > 1) {
    cmUnitSelect.remove(1);
  }
  units.forEach((u) => {
    const opt = document.createElement('option');
    opt.value       = u.id;
    opt.textContent = `${u.name} (${u.abbreviation})`;
    cmUnitSelect.appendChild(opt);
  });
}

/* ================================================================
 * RENDER HELPERS
 * ================================================================ */

/**
 * Create a source badge element.
 * isCustom === true → "Custom" badge--neutral
 * isCustom === false → "Industry" badge--info
 */
function _makeBadge(isCustom) {
  const span = createElement('span', {
    className: `badge ${isCustom ? 'badge--neutral' : 'badge--info'}`,
    text:      isCustom ? 'Custom' : 'Industry',
  });
  return span;
}

/**
 * Create a tracking toggle button for a material row.
 * Tracked → btn--success "Tracked"
 * Untracked → btn--secondary "Track"
 */
function _makeTrackBtn(material) {
  const btn = createElement('button', {
    className: `btn btn--sm ${material.isTracked ? 'btn--success' : 'btn--secondary'}`,
    text:      material.isTracked ? 'Tracked' : 'Track',
    attrs:     {
      type:       'button',
      'aria-label': material.isTracked
        ? `Disable tracking for ${material.name}`
        : `Enable tracking for ${material.name}`,
    },
  });

  btn.addEventListener('click', async () => {
    const newState = !material.isTracked;
    btn.classList.add('btn--loading');
    btn.disabled = true;

    try {
      const updated = await updateMaterialTracking(material.id, newState);
      // Update local state
      const idx = _materials.findIndex((m) => m.id === material.id);
      if (idx !== -1) _materials[idx] = updated;

      showToast({ type: 'success', message: 'Tracking updated.' });
      _renderList(); // re-render in-place (preserves filter)
    } catch {
      showToast({ type: 'error', message: 'Failed to update tracking. Please try again.' });
      btn.classList.remove('btn--loading');
      btn.disabled = false;
    }
  });

  return btn;
}

/**
 * Build the action links cell content for tracked materials.
 * Only shown when isTracked === true.
 */
function _makeActionLinks(material) {
  const wrap = createElement('div', { className: 'materials-actions' });

  const logLink = createElement('a', {
    className: 'btn btn--sm btn--ghost',
    text:      'Log Price',
    attrs:     { href: `/pages/prices.html?materialId=${material.id}` },
  });

  const histLink = createElement('a', {
    className: 'btn btn--sm btn--ghost',
    text:      'History',
    attrs:     { href: `/pages/trends.html?materialId=${material.id}` },
  });

  wrap.appendChild(logLink);
  wrap.appendChild(histLink);
  return wrap;
}

/* ================================================================
 * TABLE ROW (tablet+)
 * ================================================================ */

function _makeTableRow(material) {
  const tr = document.createElement('tr');

  // Name
  const tdName = document.createElement('td');
  tdName.className   = 'table__cell';
  tdName.textContent = material.name;
  tr.appendChild(tdName);

  // Unit
  const tdUnit = document.createElement('td');
  tdUnit.className   = 'table__cell';
  tdUnit.textContent = material.unit;
  tr.appendChild(tdUnit);

  // Source badge
  const tdSource = document.createElement('td');
  tdSource.className = 'table__cell';
  tdSource.appendChild(_makeBadge(material.isCustom));
  tr.appendChild(tdSource);

  // Tracking toggle
  const tdTrack = document.createElement('td');
  tdTrack.className = 'table__cell';
  tdTrack.appendChild(_makeTrackBtn(material));
  tr.appendChild(tdTrack);

  // Actions
  const tdActions = document.createElement('td');
  tdActions.className = 'table__cell';
  if (material.isTracked) {
    tdActions.appendChild(_makeActionLinks(material));
  }
  tr.appendChild(tdActions);

  return tr;
}

/* ================================================================
 * MOBILE CARD
 * ================================================================ */

function _makeCard(material) {
  const card = createElement('div', { className: 'card card--material material-card' });

  // Header: name + badge
  const header = createElement('div', { className: 'material-card__header' });
  const nameEl = createElement('span', {
    className: 'material-card__name',
    text:      material.name,
  });
  header.appendChild(nameEl);
  header.appendChild(_makeBadge(material.isCustom));
  card.appendChild(header);

  // Unit
  const unitEl = createElement('p', {
    className: 'material-card__unit',
    text:      material.unit,
  });
  card.appendChild(unitEl);

  // Footer: toggle + actions
  const footer = createElement('div', { className: 'material-card__footer' });
  footer.appendChild(_makeTrackBtn(material));
  if (material.isTracked) {
    footer.appendChild(_makeActionLinks(material));
  }
  card.appendChild(footer);

  return card;
}

/* ================================================================
 * RENDER MATERIALS LIST
 * ================================================================ */

function _renderList() {
  if (!listContainer) return;
  hideSkeleton(listContainer);

  const visible = _filter === 'tracked'
    ? _materials.filter((m) => m.isTracked)
    : _materials;

  // Clear
  while (listContainer.firstChild) listContainer.removeChild(listContainer.firstChild);

  // Empty states
  if (_materials.length === 0) {
    renderEmptyState(listContainer, {
      icon:    'fa-solid fa-boxes-stacked',
      title:   'No materials in your workspace',
      message: 'No materials in your workspace.',
    });
    return;
  }

  if (visible.length === 0 && _filter === 'tracked') {
    renderEmptyState(listContainer, {
      icon:    'fa-solid fa-box-open',
      title:   'No tracked materials',
      message: "You are not tracking any materials yet. Click 'Track' next to a material to start.",
      action:  {
        label:   'View All Materials',
        onClick: () => _setFilter('all'),
      },
    });
    return;
  }

  // Responsive: use <table> on tablet+, cards on mobile
  // The CSS hides/shows via media query on .materials-table-wrap / .materials-cards
  const tableWrap = createElement('div', { className: 'materials-table-wrap' });
  const table = document.createElement('table');
  table.className = 'table';

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  ['Name', 'Unit', 'Source', 'Tracking', 'Actions'].forEach((col) => {
    const th = createElement('th', {
      className: 'table__header',
      text:      col,
    });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  visible.forEach((m) => tbody.appendChild(_makeTableRow(m)));
  table.appendChild(tbody);
  tableWrap.appendChild(table);

  // Mobile card list
  const cardsWrap = createElement('div', { className: 'materials-cards' });
  visible.forEach((m) => cardsWrap.appendChild(_makeCard(m)));

  listContainer.appendChild(tableWrap);
  listContainer.appendChild(cardsWrap);
}

/* ================================================================
 * ADD CUSTOM MATERIAL — FORM SUBMIT
 * Doc 4 §4.1: POST /materials { customName, unitId }
 * ================================================================ */

if (addForm) {
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Client-side validation
    let valid = true;

    const rawName = cmNameInput ? cmNameInput.value.trim() : '';
    if (!rawName) {
      if (cmNameInput && cmNameError) showFieldError(cmNameInput, cmNameError, 'Material name is required (max 150 characters).');
      valid = false;
    } else if (rawName.length > 150) {
      if (cmNameInput && cmNameError) showFieldError(cmNameInput, cmNameError, 'Material name is required (max 150 characters).');
      valid = false;
    } else {
      if (cmNameInput && cmNameError) clearFieldError(cmNameInput, cmNameError);
    }

    const unitId = cmUnitSelect ? Number(cmUnitSelect.value) : 0;
    if (!unitId) {
      if (cmUnitSelect && cmUnitError) showFieldError(cmUnitSelect, cmUnitError, 'Please select a unit of measurement.');
      valid = false;
    } else {
      if (cmUnitSelect && cmUnitError) clearFieldError(cmUnitSelect, cmUnitError);
    }

    if (!valid) return;

    if (cmFormAlert) hideFormAlert(cmFormAlert);
    if (cmSubmitBtn) { cmSubmitBtn.classList.add('btn--loading'); cmSubmitBtn.disabled = true; }

    try {
      // POST /api/v1/materials — body: { customName, unitId }
      const newMaterial = await createMaterial({ customName: rawName, unitId });

      // Prepend to local list and re-render
      _materials = [newMaterial, ..._materials];
      _toggleAddPanel(true); // close + reset form
      _renderList();
      showToast({ type: 'success', message: 'Custom material added.' });

    } catch (err) {
      if (err?.status === 409) {
        if (cmFormAlert) showFormAlert(cmFormAlert, 'A material with this name already exists.');
      } else if (err?.status === 400) {
        if (cmFormAlert) showFormAlert(cmFormAlert, 'Please check your inputs and try again.');
      } else {
        if (cmFormAlert) showFormAlert(cmFormAlert, 'Could not add material. Check your connection.');
      }
    } finally {
      if (cmSubmitBtn) { cmSubmitBtn.classList.remove('btn--loading'); cmSubmitBtn.disabled = false; }
    }
  });
}

/* ================================================================
 * PAGE LOAD — fetch materials + units in parallel
 * ================================================================ */

async function loadPage() {
  if (listContainer) showSkeleton(listContainer, { rows: 5, type: 'list' });

  try {
    const [materials, units] = await Promise.all([
      getMaterials(),
      getUnitsOfMeasurement(),
    ]);

    _materials = materials;
    _units     = units;

    _populateUnits(units);
    _renderList();

  } catch (err) {
    if (listContainer) {
      hideSkeleton(listContainer);
      renderErrorState(listContainer, {
        title:   'Failed to load materials',
        message: 'Something went wrong. Please try again.',
        retry:   () => loadPage(),
      });
    }
  }
}

loadPage();
