/**
 * TrendsPage — Price history chart + multi-material comparison
 * Business Market Monitor — React frontend
 *
 * Ported from: frontend/pages/trends.html + frontend/js/pages/trends.js
 *
 * TABS:
 *   Tab 1 — Price History (single material, paginated, Chart.js line chart)
 *   Tab 2 — Compare Materials (up to 5 materials, checkbox list, multi-line chart)
 *
 * FLOW (preserved exactly from original):
 *  1. Auth + business guard — handled by ProtectedRoute in App.jsx
 *  2. GET /materials on load → filter isTracked only → populate selectors
 *  3. ?materialId from URL → pre-select in Tab 1 if present and tracked
 *  4. Tab 1 "Apply" → GET /materials/:id/prices/history?page=1&limit=50&from?&to?
 *     → destroy old chart → create new Chart.js line chart (canvas ref)
 *     → render accessible data table → Pagination component
 *  5. Tab 2 "Compare" → GET /materials/prices/compare?materialIds=1,2,3&from?&to?
 *     → response: [{ materialId, name, series:[{price,recordedAt}] }]
 *     → destroy old chart → create multi-line Chart.js chart
 *
 * CHART CONTRACT:
 *   History items:    { price: number, recordedAt: string } — NO unit in series
 *   Compare response: [{ materialId, name, series: [{price,recordedAt}] }]
 *   Unit comes from material.unit (GET /materials), NOT from series
 *
 * CHART.JS (npm chart.js):
 *   Exact same config as original window.Chart usage.
 *   Instance stored in ref; destroyed via chart.destroy() before re-creation.
 *   Must register required controllers/elements before use.
 *
 * MATERIAL ID:
 *   material.id from GET /materials = tracked_materials.id
 *   Compare query param: materialIds (plural, comma-separated) — NEVER materialId singular
 *
 * SECURITY: No userId in requests. No innerHTML. No eval().
 */

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

import { getMaterials }                    from '../api/materials.api.js';
import { getPriceHistory, comparePrices }  from '../api/trends.api.js';
import { Skeleton }    from '../components/ui/Skeleton.jsx';
import { EmptyState }  from '../components/ui/EmptyState.jsx';
import { ErrorState }  from '../components/ui/ErrorState.jsx';
import { Pagination }  from '../components/ui/Pagination.jsx';
import { formatDate, formatNumber } from '../utils/format.js';
import '../styles/pages/trends.css';

/* ── Register Chart.js components (required for tree-shaking builds) ── */
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

/* ── Chart colour palette (Doc 4 §9.1) ─────────────────────────── */
const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4'];

/* ── Load states ────────────────────────────────────────────────── */
const STATUS = { IDLE: 'idle', LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

export function TrendsPage() {
  const [searchParams] = useSearchParams();

  /* ── Materials state ────────────────────────────────────────── */
  const [materialsStatus, setMaterialsStatus] = useState(STATUS.LOADING);
  const [trackedMaterials, setTrackedMaterials] = useState([]); // only isTracked=true

  /* ── Tab state — 'history' | 'compare' ─────────────────────── */
  const [activeTab, setActiveTab] = useState('history');

  /* ── Tab 1 (History) state ──────────────────────────────────── */
  const [phMaterialId, setPhMaterialId] = useState('');
  const [phFrom,       setPhFrom]       = useState('');
  const [phTo,         setPhTo]         = useState('');
  const [histStatus,   setHistStatus]   = useState(STATUS.IDLE);
  const [histItems,    setHistItems]    = useState([]);
  const [histMeta,     setHistMeta]     = useState(null);
  const [histPage,     setHistPage]     = useState(1);
  const [histApplying, setHistApplying] = useState(false);
  const [showHistTable, setShowHistTable] = useState(false);

  /* ── Tab 2 (Compare) state ──────────────────────────────────── */
  const [checkedIds,   setCheckedIds]   = useState({}); // { [id]: boolean }
  const [cmpFrom,      setCmpFrom]      = useState('');
  const [cmpTo,        setCmpTo]        = useState('');
  const [cmpStatus,    setCmpStatus]    = useState(STATUS.IDLE);
  const [comparison,   setComparison]   = useState([]);
  const [cmpApplying,  setCmpApplying]  = useState(false);
  const [showCmpTable, setShowCmpTable] = useState(false);

  /* ── Chart canvas refs ──────────────────────────────────────── */
  const histCanvasRef = useRef(null);
  const cmpCanvasRef  = useRef(null);
  const histChartRef  = useRef(null); // Chart.js instance
  const cmpChartRef   = useRef(null); // Chart.js instance

  /* ── Helpers ────────────────────────────────────────────────── */
  const checkedCount = useMemo(
    () => Object.values(checkedIds).filter(Boolean).length,
    [checkedIds],
  );
  const maxedOut = checkedCount >= 5;

  const selectedHistMaterial = useMemo(
    () => trackedMaterials.find(m => String(m.id) === String(phMaterialId)) ?? null,
    [trackedMaterials, phMaterialId],
  );

  /* ── Load materials ─────────────────────────────────────────── */
  const loadMaterials = useCallback(async () => {
    setMaterialsStatus(STATUS.LOADING);
    try {
      const all = await getMaterials();
      const tracked = (all ?? []).filter(m => m.isTracked);
      setTrackedMaterials(tracked);
      setMaterialsStatus(STATUS.SUCCESS);

      // Pre-select ?materialId from URL if present and tracked
      const urlId = searchParams.get('materialId');
      if (urlId && tracked.some(m => String(m.id) === urlId)) {
        setPhMaterialId(urlId);
      }
    } catch {
      setMaterialsStatus(STATUS.ERROR);
    }
  }, [searchParams]);

  useEffect(() => { loadMaterials(); }, [loadMaterials]);

  /* ── Auto-load history if URL materialId was pre-selected ───── */
  const didAutoLoad = useRef(false);
  useEffect(() => {
    if (
      !didAutoLoad.current &&
      materialsStatus === STATUS.SUCCESS &&
      phMaterialId &&
      trackedMaterials.some(m => String(m.id) === String(phMaterialId))
    ) {
      didAutoLoad.current = true;
      _loadHistory(1);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialsStatus, phMaterialId]);

  /* ── Destroy chart on tab switch ────────────────────────────── */
  function _destroyHistChart() {
    if (histChartRef.current) {
      histChartRef.current.destroy();
      histChartRef.current = null;
    }
  }
  function _destroyCmpChart() {
    if (cmpChartRef.current) {
      cmpChartRef.current.destroy();
      cmpChartRef.current = null;
    }
  }

  function handleTabSwitch(tab) {
    _destroyHistChart();
    _destroyCmpChart();
    setActiveTab(tab);
  }

  /* ── Tab 1: Load history ────────────────────────────────────── */
  async function _loadHistory(page) {
    if (!phMaterialId) return;
    const mat = trackedMaterials.find(m => String(m.id) === String(phMaterialId));
    if (!mat) return;

    _destroyHistChart();
    setHistStatus(STATUS.LOADING);
    setHistApplying(true);
    setHistMeta(null);
    setShowHistTable(false);

    try {
      const { data: items, meta } = await getPriceHistory(phMaterialId, {
        from: phFrom || undefined,
        to:   phTo   || undefined,
        page,
      });

      setHistItems(items ?? []);
      setHistMeta(meta);
      setHistPage(page);
      setHistStatus(STATUS.SUCCESS);

    } catch {
      setHistStatus(STATUS.ERROR);
    } finally {
      setHistApplying(false);
    }
  }

  /* ── Tab 1: Render Chart.js line chart after canvas is available ── */
  useEffect(() => {
    if (
      histStatus !== STATUS.SUCCESS ||
      !histItems.length ||
      !histCanvasRef.current ||
      !selectedHistMaterial
    ) return;

    _destroyHistChart();

    const labels = histItems.map(r => r.recordedAt);
    const values = histItems.map(r => r.price);
    const { name, unit } = selectedHistMaterial;

    histChartRef.current = new ChartJS(histCanvasRef.current, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label:           name,
          data:            values,
          borderColor:     CHART_COLORS[0],
          backgroundColor: 'rgba(59,130,246,0.08)',
          tension:         0.3,
          pointRadius:     3,
          pointHoverRadius: 6,
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
              label: (ctx) => `${formatNumber(ctx.parsed.y, 2)} / ${unit}`,
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
            ticks: { color: '#8b949e', callback: (v) => v.toFixed(2) },
          },
        },
      },
    });

    return () => { _destroyHistChart(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histStatus, histItems, selectedHistMaterial]);

  /* ── Tab 2: Load compare ────────────────────────────────────── */
  async function _loadCompare() {
    const ids = Object.entries(checkedIds)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (!ids.length) return;

    _destroyCmpChart();
    setCmpStatus(STATUS.LOADING);
    setCmpApplying(true);
    setShowCmpTable(false);

    try {
      // GET /materials/prices/compare?materialIds=1,2,3 (plural param name)
      const data = await comparePrices(ids, {
        from: cmpFrom || undefined,
        to:   cmpTo   || undefined,
      });
      setComparison(data ?? []);
      setCmpStatus(STATUS.SUCCESS);
    } catch {
      setCmpStatus(STATUS.ERROR);
    } finally {
      setCmpApplying(false);
    }
  }

  /* ── Tab 2: Render compare chart after canvas ─────────────── */
  useEffect(() => {
    if (
      cmpStatus !== STATUS.SUCCESS ||
      !comparison.length ||
      !cmpCanvasRef.current
    ) return;

    const totalPoints = comparison.reduce((s, m) => s + m.series.length, 0);
    if (totalPoints === 0) return;

    _destroyCmpChart();

    // Collect all unique dates (sorted ASC) across all series
    const dateSet = new Set();
    comparison.forEach(mat => mat.series.forEach(p => dateSet.add(p.recordedAt)));
    const sortedDates = Array.from(dateSet).sort();

    const datasets = comparison.map((mat, idx) => {
      const priceByDate = new Map(mat.series.map(p => [p.recordedAt, p.price]));
      const aligned = sortedDates.map(dt =>
        priceByDate.has(dt) ? priceByDate.get(dt) : null
      );
      return {
        label:           mat.name,
        data:            aligned,
        borderColor:     CHART_COLORS[idx % CHART_COLORS.length],
        backgroundColor: 'transparent',
        tension:         0.3,
        pointRadius:     3,
        spanGaps:        true,
      };
    });

    cmpChartRef.current = new ChartJS(cmpCanvasRef.current, {
      type: 'line',
      data: { labels: sortedDates, datasets },
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
            ticks: { color: '#8b949e', callback: (v) => v.toFixed(2) },
          },
        },
      },
    });

    return () => { _destroyCmpChart(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmpStatus, comparison]);

  /* ── Compare totals — for empty detection ───────────────────── */
  const cmpTotalPoints = useMemo(
    () => comparison.reduce((s, m) => s + m.series.length, 0),
    [comparison],
  );

  /* ── Cleanup charts on unmount ──────────────────────────────── */
  useEffect(() => {
    return () => {
      _destroyHistChart();
      _destroyCmpChart();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Render ─────────────────────────────────────────────────── */
  return (
    <div className="page-container">

      {/* ── Tab bar ─────────────────────────────────────────── */}
      <div className="tab-bar" role="tablist" aria-label="Trends views">
        <button
          type="button"
          id="tab-history"
          role="tab"
          className={`tab-btn${activeTab === 'history' ? ' tab-btn--active' : ''}`}
          aria-selected={activeTab === 'history' ? 'true' : 'false'}
          aria-controls="panel-history"
          onClick={() => handleTabSwitch('history')}
        >
          Price History
        </button>
        <button
          type="button"
          id="tab-compare"
          role="tab"
          className={`tab-btn${activeTab === 'compare' ? ' tab-btn--active' : ''}`}
          aria-selected={activeTab === 'compare' ? 'true' : 'false'}
          aria-controls="panel-compare"
          onClick={() => handleTabSwitch('compare')}
        >
          Compare Materials
        </button>
      </div>

      {/* ── Materials load error (full-page, both tabs affected) ── */}
      {materialsStatus === STATUS.ERROR && (
        <ErrorState
          title="Failed to load materials"
          message="Could not load your materials list. Please try again."
          retry={loadMaterials}
        />
      )}

      {/* ========================================================
          TAB 1 — Price History
          ======================================================== */}
      <div
        id="panel-history"
        role="tabpanel"
        aria-labelledby="tab-history"
        className={activeTab !== 'history' ? 'tab-panel--hidden' : ''}
      >
        {/* Filter controls */}
        <div className="trends-filter-bar card">
          <div className="card__body trends-filter-bar__body">

            <div className="form-group trends-filter-bar__item">
              <label className="form-label form-label--required" htmlFor="ph-material">
                Material
              </label>
              <select
                id="ph-material"
                className="form-control"
                value={phMaterialId}
                onChange={e => setPhMaterialId(e.target.value)}
                disabled={materialsStatus === STATUS.LOADING}
              >
                <option value="">Select a material…</option>
                {trackedMaterials.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group trends-filter-bar__item">
              <label className="form-label" htmlFor="ph-from">From</label>
              <input
                type="date"
                id="ph-from"
                className="form-control"
                value={phFrom}
                onChange={e => setPhFrom(e.target.value)}
              />
            </div>

            <div className="form-group trends-filter-bar__item">
              <label className="form-label" htmlFor="ph-to">To</label>
              <input
                type="date"
                id="ph-to"
                className="form-control"
                value={phTo}
                onChange={e => setPhTo(e.target.value)}
              />
            </div>

            <div className="trends-filter-bar__actions">
              <button
                type="button"
                id="ph-apply-btn"
                className={`btn btn--primary${histApplying ? ' btn--loading' : ''}`}
                disabled={!phMaterialId || histApplying}
                onClick={() => _loadHistory(1)}
              >
                Apply
              </button>
            </div>
          </div>
        </div>

        {/* Chart area */}
        <div id="ph-chart-area">
          {histStatus === STATUS.LOADING && <Skeleton type="rect" rows={3} />}

          {histStatus === STATUS.ERROR && (
            <ErrorState
              title="Failed to load price history"
              message="Something went wrong. Please try again."
              retry={() => _loadHistory(histPage)}
            />
          )}

          {histStatus === STATUS.SUCCESS && histItems.length === 0 && (
            <EmptyState
              icon="fa-solid fa-chart-line"
              title="No price data available"
              message="There are no price records for this material in the selected date range. Try adjusting the dates or logging some prices."
              action={{ label: 'Log a Price', onClick: () => {} }}
            />
          )}

          {histStatus === STATUS.SUCCESS && histItems.length > 0 && (
            <>
              {/* Chart canvas */}
              <div id="ph-chart-container" className="chart-container">
                <canvas
                  id="ph-chart"
                  ref={histCanvasRef}
                  aria-label={`Price history chart for ${selectedHistMaterial?.name ?? ''}`}
                  role="img"
                />
              </div>

              {/* Show/Hide accessible data table toggle */}
              <button
                type="button"
                id="ph-show-table-btn"
                className="btn btn--ghost btn--sm trends-show-table-btn"
                onClick={() => setShowHistTable(v => !v)}
              >
                {showHistTable ? 'Hide data table' : 'Show data table'}
              </button>

              {/* Accessible data table */}
              {showHistTable && (
                <div id="ph-data-table" className="trends-data-table">
                  <table className="table table--compact">
                    <caption>Price history for {selectedHistMaterial?.name}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Price ({selectedHistMaterial?.unit})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histItems.map((row, i) => (
                        <tr key={i}>
                          <td>{formatDate(row.recordedAt)}</td>
                          <td className="font-mono">{formatNumber(row.price, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              <div id="ph-pagination">
                <Pagination meta={histMeta} onPageChange={page => _loadHistory(page)} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========================================================
          TAB 2 — Compare Materials
          ======================================================== */}
      <div
        id="panel-compare"
        role="tabpanel"
        aria-labelledby="tab-compare"
        className={activeTab !== 'compare' ? 'tab-panel--hidden' : ''}
      >
        {/* Compare filter bar */}
        <div className="trends-filter-bar card">
          <div className="card__body trends-filter-bar__body trends-filter-bar__body--compare">

            {/* Checkbox list — tracked materials only */}
            <div className="form-group trends-compare-list-wrap">
              <span className="form-label">Materials (select up to 5)</span>
              <div id="cmp-material-list" className="cmp-material-list">
                {trackedMaterials.length === 0 && materialsStatus === STATUS.SUCCESS && (
                  <p className="text-muted">No tracked materials available.</p>
                )}
                {trackedMaterials.map(m => {
                  const checked = !!checkedIds[m.id];
                  const disabled = !checked && maxedOut;
                  return (
                    <label key={m.id} className="cmp-material-label">
                      <input
                        type="checkbox"
                        name="compare-material"
                        value={m.id}
                        checked={checked}
                        disabled={disabled}
                        onChange={e => setCheckedIds(prev => ({
                          ...prev,
                          [m.id]: e.target.checked,
                        }))}
                      />
                      <span>{m.name}</span>
                    </label>
                  );
                })}
              </div>
              <p id="cmp-counter" className="cmp-counter">
                {checkedCount} / 5 selected
                {maxedOut && ' — Maximum of 5 materials can be compared.'}
              </p>
            </div>

            <div className="form-group trends-filter-bar__item">
              <label className="form-label" htmlFor="cmp-from">From</label>
              <input
                type="date"
                id="cmp-from"
                className="form-control"
                value={cmpFrom}
                onChange={e => setCmpFrom(e.target.value)}
              />
            </div>

            <div className="form-group trends-filter-bar__item">
              <label className="form-label" htmlFor="cmp-to">To</label>
              <input
                type="date"
                id="cmp-to"
                className="form-control"
                value={cmpTo}
                onChange={e => setCmpTo(e.target.value)}
              />
            </div>

            <div className="trends-filter-bar__actions">
              <button
                type="button"
                id="cmp-apply-btn"
                className={`btn btn--primary${cmpApplying ? ' btn--loading' : ''}`}
                disabled={checkedCount < 1 || cmpApplying}
                onClick={_loadCompare}
              >
                Compare
              </button>
            </div>
          </div>
        </div>

        {/* Compare chart area */}
        <div id="cmp-chart-area">
          {cmpStatus === STATUS.LOADING && <Skeleton type="rect" rows={3} />}

          {cmpStatus === STATUS.ERROR && (
            <ErrorState
              title="Failed to load comparison"
              message="Something went wrong. Please try again."
              retry={_loadCompare}
            />
          )}

          {cmpStatus === STATUS.SUCCESS && cmpTotalPoints === 0 && (
            <EmptyState
              icon="fa-solid fa-chart-line"
              title="No price data available"
              message="No price data available for the selected materials and date range."
            />
          )}

          {cmpStatus === STATUS.SUCCESS && cmpTotalPoints > 0 && (
            <>
              <div id="cmp-chart-container" className="chart-container">
                <canvas
                  id="cmp-chart"
                  ref={cmpCanvasRef}
                  aria-label="Price comparison chart"
                  role="img"
                />
              </div>

              <button
                type="button"
                id="cmp-show-table-btn"
                className="btn btn--ghost btn--sm trends-show-table-btn"
                onClick={() => setShowCmpTable(v => !v)}
              >
                {showCmpTable ? 'Hide data table' : 'Show data table'}
              </button>

              {showCmpTable && (
                <div id="cmp-data-table" className="trends-data-table">
                  <CompareTable comparison={comparison} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

    </div>
  );
}

/* ================================================================
 * COMPARE DATA TABLE — accessible, date-aligned across all series
 * ================================================================ */
function CompareTable({ comparison }) {
  // Collect all unique dates (sorted ASC) across all series
  const dateSet = new Set();
  comparison.forEach(mat => mat.series.forEach(p => dateSet.add(p.recordedAt)));
  const sortedDates = Array.from(dateSet).sort();

  if (sortedDates.length === 0) return null;

  // Build price map: materialId → Map<recordedAt, price>
  const priceMap = new Map();
  comparison.forEach(mat => {
    const m = new Map(mat.series.map(p => [p.recordedAt, p.price]));
    priceMap.set(mat.materialId, m);
  });

  return (
    <table className="table table--compact">
      <caption>Price comparison data</caption>
      <thead>
        <tr>
          <th scope="col">Date</th>
          {comparison.map(mat => (
            <th key={mat.materialId} scope="col">{mat.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {sortedDates.map(dt => (
          <tr key={dt}>
            <td>{formatDate(dt)}</td>
            {comparison.map(mat => {
              const price = priceMap.get(mat.materialId)?.get(dt);
              return (
                <td key={mat.materialId} className="font-mono">
                  {price != null ? formatNumber(price, 2) : '—'}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
