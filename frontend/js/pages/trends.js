/**
 * Trends page controller
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §5.10, Doc 4 §9.1 — js/pages/trends.js
 *
 * TABS:
 *  Tab 1 — Price History (single material, paginated)
 *  Tab 2 — Compare Materials (up to 5 materials, checkbox list)
 *
 * FLOW:
 *  1. requireAuth() + requireBusiness()
 *  2. initNav({ pageTitle: 'Trends', activeHref: '/pages/trends.html' })
 *  3. GET /api/v1/materials → populate selectors (tracked only)
 *  4. Read ?materialId from URL → pre-select in Tab 1 if present and tracked
 *  5. Tab 1 "Apply" → GET /materials/:id/prices/history?page=1&limit=50&from?&to?
 *     → destroy old chart → create new Chart.js line chart
 *     → render accessible data table → pagination.js
 *  6. Tab 2 "Compare" → GET /materials/prices/compare?materialIds=1,2,3&from?&to?
 *     → response: [{ materialId, name, series:[{price,recordedAt}] }]
 *     → destroy old chart → create multi-line Chart.js chart
 *
 * CHART CONTRACT (confirmed from trendQuery.service.js):
 *   History items:    { price: number, recordedAt: string }  — NO unit in series
 *   Compare response: [{ materialId, name, series: [{price,recordedAt}] }]
 *   Unit comes from material.unit (GET /materials), NOT from series
 *
 * SECURITY:
 *   No userId in requests.
 *   No innerHTML with API data — textContent / createElement only.
 *   No eval().
 *
 * CHART.JS:
 *   Loaded via CDN script tag in trends.html (before this module script).
 *   Accessed via global window.Chart (UMD build).
 *   Instance stored in _chartInstance; destroyed before re-creation.
 */

import { requireAuth, requireBusiness }        from '/js/auth/auth.js';
import { initNav }                             from '/js/components/nav.js';
import { showSkeleton, hideSkeleton }          from '/js/components/loader.js';
import { renderEmptyState }                    from '/js/components/emptyState.js';
import { renderErrorState }                    from '/js/components/errorState.js';
import { renderPagination }                    from '/js/components/pagination.js';
import { getMaterials }                        from '/js/api/materials.api.js';
import { getPriceHistory, comparePrices,
         HISTORY_LIMIT }                       from '/js/api/trends.api.js';
import { formatDate, formatNumber }            from '/js/utils/format.js';
import { byId, show, hide, createElement,
         getParam }                            from '/js/utils/dom.js';

// ── Auth guards ────────────────────────────────────────────────────────────────
requireAuth();
requireBusiness();

// ── Nav ────────────────────────────────────────────────────────────────────────
initNav({ pageTitle: 'Trends', activeHref: '/pages/trends.html' });

// ── Chart colour palette (Doc 4 §9.1, Doc 3 §15.9) ───────────────────────────
const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];

// ── Shared chart instance (destroyed before re-creation) ──────────────────────
let _chartInstance = null;

function _destroyChart() {
  if (_chartInstance) {
    _chartInstance.destroy();
    _chartInstance = null;
  }
}

// ── State ──────────────────────────────────────────────────────────────────────
let _trackedMaterials = []; // [{id, name, unit, isTracked, isCustom}]

// ── Element references — Tab bar ───────────────────────────────────────────────
const tabHistory = byId('tab-history');
const tabCompare = byId('tab-compare');
const panelHistory = byId('panel-history');
const panelCompare = byId('panel-compare');

// ── Element references — Tab 1 (Price History) ────────────────────────────────
const phMaterial    = byId('ph-material');
const phFrom        = byId('ph-from');
const phTo          = byId('ph-to');
const phApplyBtn    = byId('ph-apply-btn');
const phChartWrap   = byId('ph-chart-container');
const phChartCanvas = byId('ph-chart');
const phDataTable   = byId('ph-data-table');
const phShowTableBtn= byId('ph-show-table-btn');
const phPagination  = byId('ph-pagination');
const phContent     = byId('ph-chart-area');

// ── Element references — Tab 2 (Compare) ─────────────────────────────────────
const cmpList       = byId('cmp-material-list');
const cmpCounter    = byId('cmp-counter');
const cmpFrom       = byId('cmp-from');
const cmpTo         = byId('cmp-to');
const cmpApplyBtn   = byId('cmp-apply-btn');
const cmpChartWrap  = byId('cmp-chart-container');
const cmpChartCanvas= byId('cmp-chart');
const cmpDataTable  = byId('cmp-data-table');
const cmpShowTableBtn=byId('cmp-show-table-btn');
const cmpContent    = byId('cmp-chart-area');

/* ================================================================
 * TAB SWITCHING
 * ================================================================ */

function _activateTab(tab) {
  const isHistory = (tab === 'history');

  if (tabHistory) { tabHistory.classList.toggle('tab-btn--active', isHistory); tabHistory.setAttribute('aria-selected', isHistory ? 'true' : 'false'); }
  if (tabCompare) { tabCompare.classList.toggle('tab-btn--active', !isHistory); tabCompare.setAttribute('aria-selected', !isHistory ? 'true' : 'false'); }
  if (panelHistory) panelHistory.classList.toggle('tab-panel--hidden', !isHistory);
  if (panelCompare) panelCompare.classList.toggle('tab-panel--hidden', isHistory);

  // Destroy chart when switching tabs (prevent stale canvas)
  _destroyChart();
}

if (tabHistory) tabHistory.addEventListener('click', () => _activateTab('history'));
if (tabCompare) tabCompare.addEventListener('click', () => _activateTab('compare'));

/* ================================================================
 * POPULATE MATERIAL SELECTORS
 * ================================================================ */

function _populateHistory(materials) {
  if (!phMaterial) return;
  while (phMaterial.options.length > 1) phMaterial.remove(1);

  materials.forEach((m) => {
    const opt = document.createElement('option');
    opt.value       = m.id;
    opt.textContent = m.name;
    phMaterial.appendChild(opt);
  });

  // Pre-select from URL param if present and valid
  const urlMaterialId = getParam('materialId');
  if (urlMaterialId) {
    const exists = materials.some((m) => String(m.id) === urlMaterialId);
    if (exists && phMaterial) {
      phMaterial.value = urlMaterialId;
      if (phApplyBtn) phApplyBtn.disabled = false;
    }
  }
}

function _populateCompare(materials) {
  if (!cmpList) return;
  while (cmpList.firstChild) cmpList.removeChild(cmpList.firstChild);

  materials.forEach((m) => {
    const label = createElement('label', { className: 'cmp-material-label' });
    const cb = document.createElement('input');
    cb.type  = 'checkbox';
    cb.name  = 'compare-material';
    cb.value = m.id;
    cb.addEventListener('change', _onCompareSelectionChange);
    label.appendChild(cb);
    const nameSpan = createElement('span', { text: m.name });
    label.appendChild(nameSpan);
    cmpList.appendChild(label);
  });

  _onCompareSelectionChange(); // init counter
}

/* ================================================================
 * COMPARE: selection counter + 5-material cap
 * ================================================================ */

function _getCheckedCompareIds() {
  if (!cmpList) return [];
  const checked = cmpList.querySelectorAll('input[type="checkbox"]:checked');
  return Array.from(checked).map((cb) => cb.value);
}

function _onCompareSelectionChange() {
  const checked = _getCheckedCompareIds();
  const count   = checked.length;
  const maxed   = count >= 5;

  if (cmpCounter) {
    cmpCounter.textContent = `${count} / 5 selected`;
    if (maxed) {
      cmpCounter.textContent += ' — Maximum of 5 materials can be compared.';
    }
  }

  if (cmpList) {
    const allCbs = cmpList.querySelectorAll('input[type="checkbox"]');
    allCbs.forEach((cb) => {
      if (!cb.checked) cb.disabled = maxed;
    });
  }

  if (cmpApplyBtn) cmpApplyBtn.disabled = count < 1;
}

/* ================================================================
 * TAB 1 — APPLY BUTTON STATE
 * ================================================================ */

if (phMaterial) {
  phMaterial.addEventListener('change', () => {
    if (phApplyBtn) phApplyBtn.disabled = !phMaterial.value;
  });
}

/* ================================================================
 * TAB 1 — ACCESSIBLE DATA TABLE (price history)
 * ================================================================ */

function _buildHistoryTable(items, materialName, materialUnit) {
  if (!phDataTable) return;
  while (phDataTable.firstChild) phDataTable.removeChild(phDataTable.firstChild);

  if (!items || items.length === 0) return;

  const caption = createElement('caption');
  caption.textContent = `Price history for ${materialName}`;

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  [`Date`, `Price (${materialUnit})`].forEach((col) => {
    const th = createElement('th', { text: col, attrs: { scope: 'col' } });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);

  const tbody = document.createElement('tbody');
  items.forEach((row) => {
    const tr = document.createElement('tr');
    const tdDate  = document.createElement('td'); tdDate.textContent  = formatDate(row.recordedAt);
    const tdPrice = document.createElement('td'); tdPrice.textContent = formatNumber(row.price, 2);
    tdPrice.className = 'font-mono';
    tr.appendChild(tdDate);
    tr.appendChild(tdPrice);
    tbody.appendChild(tr);
  });

  const table = document.createElement('table');
  table.className = 'table table--compact';
  table.appendChild(caption);
  table.appendChild(thead);
  table.appendChild(tbody);
  phDataTable.appendChild(table);
}

/* ================================================================
 * TAB 1 — CHART.JS HISTORY CHART
 * ================================================================ */

function _renderHistoryChart(items, materialName, materialUnit) {
  _destroyChart();

  if (!phChartCanvas || !window.Chart) return;

  const labels = items.map((r) => r.recordedAt); // raw ISO — formatted in tooltip
  const values = items.map((r) => r.price);

  _chartInstance = new window.Chart(phChartCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label:           materialName,
        data:            values,
        borderColor:     CHART_COLORS[0],
        backgroundColor: 'rgba(59,130,246,0.08)',
        tension:         0.3,
        pointRadius:     3,
        pointHoverRadius:6,
        fill:            true,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (ctx) => formatDate(ctx[0].label),
            label: (ctx) => `${formatNumber(ctx.parsed.y, 2)} / ${materialUnit}`,
          },
        },
      },
      scales: {
        x: {
          grid:  { color: '#30363d' },
          ticks: { color: '#8b949e', maxTicksLimit: 8,
                   callback: (_val, idx) => formatDate(labels[idx]) },
        },
        y: {
          grid:  { color: '#30363d' },
          ticks: { color: '#8b949e',
                   callback: (v) => v.toFixed(2) },
        },
      },
    },
  });
}

/* ================================================================
 * TAB 2 — ACCESSIBLE DATA TABLE (compare)
 * ================================================================ */

function _buildCompareTable(comparison) {
  if (!cmpDataTable) return;
  while (cmpDataTable.firstChild) cmpDataTable.removeChild(cmpDataTable.firstChild);

  // Collect all unique dates across all series (sorted)
  const dateSet = new Set();
  comparison.forEach((mat) => mat.series.forEach((p) => dateSet.add(p.recordedAt)));
  const sortedDates = Array.from(dateSet).sort();

  if (sortedDates.length === 0) return;

  // Build price map: materialId → Map<recordedAt, price>
  const priceMap = new Map();
  comparison.forEach((mat) => {
    const m = new Map();
    mat.series.forEach((p) => m.set(p.recordedAt, p.price));
    priceMap.set(mat.materialId, m);
  });

  const table = document.createElement('table');
  table.className = 'table table--compact';

  const caption = createElement('caption');
  caption.textContent = 'Price comparison data';
  table.appendChild(caption);

  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  const thDate = createElement('th', { text: 'Date', attrs: { scope: 'col' } });
  headerRow.appendChild(thDate);
  comparison.forEach((mat) => {
    const th = createElement('th', { text: mat.name, attrs: { scope: 'col' } });
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  sortedDates.forEach((dt) => {
    const tr = document.createElement('tr');
    const tdDate = document.createElement('td');
    tdDate.textContent = formatDate(dt);
    tr.appendChild(tdDate);
    comparison.forEach((mat) => {
      const td = document.createElement('td');
      td.className = 'font-mono';
      const price = priceMap.get(mat.materialId)?.get(dt);
      td.textContent = price != null ? formatNumber(price, 2) : '—';
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  cmpDataTable.appendChild(table);
}

/* ================================================================
 * TAB 2 — CHART.JS COMPARE CHART
 * response: [{ materialId, name, series: [{price, recordedAt}] }]
 * ================================================================ */

function _renderCompareChart(comparison) {
  _destroyChart();

  if (!cmpChartCanvas || !window.Chart) return;

  // Collect all unique dates (sorted ASC) across all series
  const dateSet = new Set();
  comparison.forEach((mat) => mat.series.forEach((p) => dateSet.add(p.recordedAt)));
  const sortedDates = Array.from(dateSet).sort();

  const datasets = comparison.map((mat, idx) => {
    const priceByDate = new Map(mat.series.map((p) => [p.recordedAt, p.price]));
    const aligned = sortedDates.map((dt) => priceByDate.has(dt) ? priceByDate.get(dt) : null);

    return {
      label:           mat.name, // from backend — use directly
      data:            aligned,
      borderColor:     CHART_COLORS[idx % CHART_COLORS.length],
      backgroundColor: 'transparent',
      tension:         0.3,
      pointRadius:     3,
      spanGaps:        true,
    };
  });

  _chartInstance = new window.Chart(cmpChartCanvas, {
    type: 'line',
    data: {
      labels: sortedDates,
      datasets,
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display:  true,
          position: 'top',
          labels:   { color: '#e6edf3', usePointStyle: true },
        },
        tooltip: {
          mode:      'index',
          intersect: false,
          callbacks: {
            title: (ctx) => formatDate(ctx[0].label),
            label: (ctx) => `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y, 2)}`,
          },
        },
      },
      scales: {
        x: {
          grid:  { color: '#30363d' },
          ticks: { color: '#8b949e', maxTicksLimit: 8,
                   callback: (_v, idx) => formatDate(sortedDates[idx]) },
        },
        y: {
          grid:  { color: '#30363d' },
          ticks: { color: '#8b949e',
                   callback: (v) => v.toFixed(2) },
        },
      },
    },
  });
}

/* ================================================================
 * SHOW/HIDE ACCESSIBLE TABLE TOGGLE
 * ================================================================ */

if (phShowTableBtn && phDataTable) {
  phShowTableBtn.addEventListener('click', () => {
    const hidden = phDataTable.hasAttribute('hidden');
    if (hidden) {
      phDataTable.removeAttribute('hidden');
      phShowTableBtn.textContent = 'Hide data table';
    } else {
      phDataTable.setAttribute('hidden', '');
      phShowTableBtn.textContent = 'Show data table';
    }
  });
}

if (cmpShowTableBtn && cmpDataTable) {
  cmpShowTableBtn.addEventListener('click', () => {
    const hidden = cmpDataTable.hasAttribute('hidden');
    if (hidden) {
      cmpDataTable.removeAttribute('hidden');
      cmpShowTableBtn.textContent = 'Hide data table';
    } else {
      cmpDataTable.setAttribute('hidden', '');
      cmpShowTableBtn.textContent = 'Show data table';
    }
  });
}

/* ================================================================
 * TAB 1 — LOAD HISTORY
 * ================================================================ */

async function _loadHistory(page = 1) {
  if (!phMaterial?.value) return;

  const materialId = phMaterial.value;
  const material   = _trackedMaterials.find((m) => String(m.id) === materialId);
  if (!material) return;

  const from = phFrom?.value || undefined;
  const to   = phTo?.value   || undefined;

  // Skeleton
  _destroyChart();
  if (phContent) showSkeleton(phContent, { rows: 3, type: 'rect' });

  if (phApplyBtn) { phApplyBtn.classList.add('btn--loading'); phApplyBtn.disabled = true; }
  if (phPagination) while (phPagination.firstChild) phPagination.removeChild(phPagination.firstChild);

  try {
    const { data: items, meta } = await getPriceHistory(materialId, { from, to, page });

    if (phContent) hideSkeleton(phContent);

    if (!items || items.length === 0) {
      if (phContent) renderEmptyState(phContent, {
        icon:    'fa-solid fa-chart-line',
        title:   'No price data available',
        message: 'There are no price records for this material in the selected date range. Try adjusting the dates or logging some prices.',
        action:  { label: 'Log a Price', href: `/pages/prices.html?materialId=${materialId}` },
      });
      if (phDataTable) { while (phDataTable.firstChild) phDataTable.removeChild(phDataTable.firstChild); }
      return;
    }

    // Chart
    _renderHistoryChart(items, material.name, material.unit);

    // Accessible data table
    _buildHistoryTable(items, material.name, material.unit);

    // Update canvas aria-label
    if (phChartCanvas) phChartCanvas.setAttribute('aria-label', `Price history chart for ${material.name}`);

    // Pagination
    if (phPagination) {
      renderPagination(phPagination, meta, (newPage) => _loadHistory(newPage));
    }

  } catch (err) {
    if (phContent) {
      hideSkeleton(phContent);
      renderErrorState(phContent, {
        title:   'Failed to load price history',
        message: 'Something went wrong. Please try again.',
        retry:   () => _loadHistory(page),
      });
    }
  } finally {
    if (phApplyBtn) { phApplyBtn.classList.remove('btn--loading'); phApplyBtn.disabled = false; }
  }
}

if (phApplyBtn) {
  phApplyBtn.addEventListener('click', () => _loadHistory(1));
}

/* ================================================================
 * TAB 2 — LOAD COMPARE
 * ================================================================ */

async function _loadCompare() {
  const checkedIds = _getCheckedCompareIds();
  if (checkedIds.length === 0) return;

  const from = cmpFrom?.value || undefined;
  const to   = cmpTo?.value   || undefined;

  _destroyChart();
  if (cmpContent) showSkeleton(cmpContent, { rows: 3, type: 'rect' });
  if (cmpApplyBtn) { cmpApplyBtn.classList.add('btn--loading'); cmpApplyBtn.disabled = true; }

  try {
    // GET /materials/prices/compare?materialIds=1,2,3&from=...&to=...
    // Response: [{ materialId, name, series: [{price, recordedAt}] }]
    const comparison = await comparePrices(checkedIds, { from, to });

    if (cmpContent) hideSkeleton(cmpContent);

    // Check all series are empty
    const totalPoints = comparison.reduce((sum, mat) => sum + mat.series.length, 0);
    if (totalPoints === 0) {
      if (cmpContent) renderEmptyState(cmpContent, {
        icon:    'fa-solid fa-chart-line',
        title:   'No price data available',
        message: 'No price data available for the selected materials and date range.',
      });
      if (cmpDataTable) while (cmpDataTable.firstChild) cmpDataTable.removeChild(cmpDataTable.firstChild);
      return;
    }

    _renderCompareChart(comparison);
    _buildCompareTable(comparison);

    if (cmpChartCanvas) cmpChartCanvas.setAttribute('aria-label', 'Price comparison chart');

  } catch (err) {
    if (cmpContent) {
      hideSkeleton(cmpContent);
      renderErrorState(cmpContent, {
        title:   'Failed to load comparison',
        message: 'Something went wrong. Please try again.',
        retry:   () => _loadCompare(),
      });
    }
  } finally {
    if (cmpApplyBtn) { cmpApplyBtn.classList.remove('btn--loading'); cmpApplyBtn.disabled = false; }
  }
}

if (cmpApplyBtn) {
  cmpApplyBtn.addEventListener('click', () => _loadCompare());
}

/* ================================================================
 * PAGE LOAD — fetch tracked materials, populate selectors
 * ================================================================ */

async function loadPage() {
  try {
    const materials = await getMaterials();
    _trackedMaterials = materials.filter((m) => m.isTracked);

    _populateHistory(_trackedMaterials);
    _populateCompare(_trackedMaterials);

    // If URL materialId is valid, apply initial history load
    const urlId = getParam('materialId');
    if (urlId && _trackedMaterials.some((m) => String(m.id) === urlId)) {
      _loadHistory(1);
    }

  } catch (err) {
    // Show error in both chart areas
    [phContent, cmpContent].forEach((el) => {
      if (el) renderErrorState(el, {
        title:   'Failed to load materials',
        message: 'Could not load your materials list. Please try again.',
        retry:   () => loadPage(),
      });
    });
  }
}

loadPage();
