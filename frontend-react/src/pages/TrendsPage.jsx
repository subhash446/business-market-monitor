/**
 * TrendsPage â€” Price history chart + multi-material comparison
 * Business Market Monitor â€” React frontend
 *
 * Ported from: frontend/pages/trends.html + frontend/js/pages/trends.js
 *
 * TABS:
 *   Tab 1 â€” Price History (single material, paginated, Chart.js line chart)
 *   Tab 2 â€” Compare Materials (up to 5 materials, checkbox list, multi-line chart)
 *
 * FLOW (preserved exactly from original):
 *  1. Auth + business guard â€” handled by ProtectedRoute in App.jsx
 *  2. GET /materials on load â†’ filter isTracked only â†’ populate selectors
 *  3. ?materialId from URL â†’ pre-select in Tab 1 if present and tracked
 *  4. Tab 1 "Apply" â†’ GET /materials/:id/prices/history?page=1&limit=50&from?&to?
 *     â†’ destroy old chart â†’ create new Chart.js line chart (canvas ref)
 *     â†’ render accessible data table â†’ Pagination component
 *  5. Tab 2 "Compare" â†’ GET /materials/prices/compare?materialIds=1,2,3&from?&to?
 *     â†’ response: [{ materialId, name, series:[{price,recordedAt}] }]
 *     â†’ destroy old chart â†’ create multi-line Chart.js chart
 *
 * CHART CONTRACT:
 *   History items:    { price: number, recordedAt: string } â€” NO unit in series
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
 *   Compare query param: materialIds (plural, comma-separated) â€” NEVER materialId singular
 *
 * SECURITY: No userId in requests. No innerHTML. No eval().
 */

import {
  useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext.jsx';
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

import { getMaterials, getMaterialSupplierRecommendations } from '../api/materials.api.js';
import { getPriceHistory, comparePrices }  from '../api/trends.api.js';
import { getLatestInsight }               from '../api/aiInsights.api.js';
import { Skeleton }    from '../components/ui/Skeleton.jsx';
import { EmptyState }  from '../components/ui/EmptyState.jsx';
import { ErrorState }  from '../components/ui/ErrorState.jsx';
import { Pagination }  from '../components/ui/Pagination.jsx';
import { InsightCard } from '../components/ui/InsightCard.jsx';
import { LandedCostModal } from '../components/materials/LandedCostModal.jsx';
import { WhatsAppCopilotModal } from '../components/ui/WhatsAppCopilotModal.jsx';
import { formatDate, formatNumber, getSafeExternalUrl } from '../utils/format.js';
import '../styles/pages/materials.css';
import '../styles/pages/trends.css';

/* â”€â”€ Register Chart.js components (required for tree-shaking builds) â”€â”€ */
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
);

/* â”€â”€ Chart colour palette (Doc 4 Â§9.1) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const CHART_COLORS = ['#60a5fa', '#4ade80', '#fbbf24', '#a78bfa', '#38bdf8'];

/* â”€â”€ Load states â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const STATUS = { IDLE: 'idle', LOADING: 'loading', SUCCESS: 'success', ERROR: 'error' };

export function TrendsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const auth = useContext(AuthContext);
  const businessRole = String(auth?.business?.businessRole || auth?.user?.businessRole || '').toUpperCase();
  const isViewer = businessRole === 'VIEWER';

  /* â”€â”€ Materials state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [materialsStatus, setMaterialsStatus] = useState(STATUS.LOADING);
  const [trackedMaterials, setTrackedMaterials] = useState([]); // only isTracked=true

  /* â”€â”€ Tab state â€” 'history' | 'compare' â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [activeTab, setActiveTab] = useState('history');

  /* â”€â”€ Tab 1 (History) state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [phMaterialId, setPhMaterialId] = useState('');
  const [phFrom,       setPhFrom]       = useState('');
  const [phTo,         setPhTo]         = useState('');
  const [histStatus,   setHistStatus]   = useState(STATUS.IDLE);
  const [histItems,    setHistItems]    = useState([]);
  const [histMeta,     setHistMeta]     = useState(null);
  const [histPage,     setHistPage]     = useState(1);
  const [histApplying, setHistApplying] = useState(false);
  const [showHistTable, setShowHistTable] = useState(false);

  /* â”€â”€ Tab 2 (Compare) state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const [checkedIds,   setCheckedIds]   = useState({}); // { [id]: boolean }
  const [cmpFrom,      setCmpFrom]      = useState('');
  const [cmpTo,        setCmpTo]        = useState('');
  const [cmpStatus,    setCmpStatus]    = useState(STATUS.IDLE);
  const [comparison,   setComparison]   = useState([]);
  const [cmpApplying,  setCmpApplying]  = useState(false);
  const [showCmpTable, setShowCmpTable] = useState(false);

  /* â”€â”€ Chart canvas refs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const histCanvasRef = useRef(null);
  const cmpCanvasRef  = useRef(null);
  const histChartRef  = useRef(null); // Chart.js instance
  const cmpChartRef   = useRef(null); // Chart.js instance

  /* â”€â”€ AI insight state for Tab 1 (per-material) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  // Fetched when a material is selected; reset when selection clears.
  const [insight,        setInsight]        = useState(undefined); // undefined=not loaded, null=no insight
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError,   setInsightError]   = useState(null);

  /* Supplier recommendation state for Tab 1 */
  const [supplierRec,        setSupplierRec]        = useState(null);
  const [supplierRecLoading, setSupplierRecLoading] = useState(false);
  const [supplierRecError,   setSupplierRecError]   = useState(null);

  /* Landed cost modal state for Tab 1 (V3-M3) */
  const [showLandedCostModal, setShowLandedCostModal] = useState(false);

  /* WhatsApp Copilot modal state for Tab 1 (V3-M4) */
  const [showCopilotModal, setShowCopilotModal] = useState(false);

  /* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const checkedCount = useMemo(
    () => Object.values(checkedIds).filter(Boolean).length,
    [checkedIds],
  );
  const maxedOut = checkedCount >= 5;

  const selectedHistMaterial = useMemo(
    () => trackedMaterials.find(m => String(m.id) === String(phMaterialId)) ?? null,
    [trackedMaterials, phMaterialId],
  );

  /* â”€â”€ Load materials â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

  /* â”€â”€ Fetch AI insight when material selection changes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  useEffect(() => {
    if (!phMaterialId) {
      setInsight(undefined);
      setInsightError(null);
      return;
    }
    let cancelled = false;
    setInsightLoading(true);
    setInsightError(null);
    getLatestInsight(phMaterialId)
      .then(data => { if (!cancelled) { setInsight(data); setInsightLoading(false); } })
      .catch(() => {
        if (!cancelled) {
          setInsightError('Could not load AI insight for this material.');
          setInsightLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [phMaterialId]);

  /* Fetch supplier recommendations when material selection changes */
  useEffect(() => {
    if (!phMaterialId) {
      setSupplierRec(null);
      setSupplierRecError(null);
      return;
    }
    let cancelled = false;
    setSupplierRecLoading(true);
    setSupplierRecError(null);
    getMaterialSupplierRecommendations(phMaterialId)
      .then(data => { if (!cancelled) { setSupplierRec(data); setSupplierRecLoading(false); } })
      .catch(() => {
        if (!cancelled) {
          setSupplierRecError('Could not load supplier sourcing recommendations.');
          setSupplierRecLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [phMaterialId]);

  /* â”€â”€ Auto-load history if URL materialId was pre-selected â”€â”€â”€â”€â”€ */
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

  /* â”€â”€ Destroy chart on tab switch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

  /* â”€â”€ Tab 1: Load history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

  /* â”€â”€ Tab 1: Render Chart.js line chart after canvas is available â”€â”€ */
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
              label: (ctx) => {
                const item = histItems[ctx.dataIndex];
                const unitStr = item?.unitLabel || (item?.currency ? `${item.currency}/${unit}` : unit);
                return `${formatNumber(ctx.parsed.y, 2)} ${unitStr}${item?.dataClass === 'MARKET_INDICATIVE' ? ' (Proxy)' : ''}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid:  { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#9494a0', maxTicksLimit: 8,
                     callback: (_val, idx) => formatDate(labels[idx]) },
          },
          y: {
            grid:  { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#9494a0', callback: (v) => v.toFixed(2) },
          },
        },
      },
    });

    return () => { _destroyHistChart(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [histStatus, histItems, selectedHistMaterial]);

  /* â”€â”€ Tab 2: Load compare â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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

  /* â”€â”€ Tab 2: Render compare chart after canvas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
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
      const firstPt = mat.series?.find(p => p.currency || p.unitLabel);
      const curr = firstPt?.currency || 'INR';
      const rawUnit = firstPt?.unitLabel || '';
      const unitLabelStr = rawUnit.toUpperCase().includes(curr.toUpperCase())
        ? ` (${rawUnit})`
        : (rawUnit ? ` (${curr}/${rawUnit})` : ` (${curr})`);

      return {
        label:           `${mat.name}${unitLabelStr}`,
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
            labels:   { color: '#f4f4f5', usePointStyle: true },
          },
          tooltip: {
            mode:      'index',
            intersect: false,
            callbacks: {
              title: (ctx) => formatDate(ctx[0].label),
              label: (ctx) => {
                const mat = comparison[ctx.datasetIndex];
                const pt = mat?.series?.find(p => p.recordedAt === sortedDates[ctx.dataIndex]);
                const unitStr = pt?.unitLabel || pt?.currency || '';
                return `${ctx.dataset.label}: ${formatNumber(ctx.parsed.y, 2)}${unitStr ? ` ${unitStr}` : ''}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid:  { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#9494a0', maxTicksLimit: 8,
                     callback: (_v, idx) => formatDate(sortedDates[idx]) },
          },
          y: {
            grid:  { color: 'rgba(255, 255, 255, 0.06)' },
            ticks: { color: '#9494a0', callback: (v) => v.toFixed(2) },
          },
        },
      },
    });

    return () => { _destroyCmpChart(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmpStatus, comparison]);

  /* â”€â”€ Compare totals â€” for empty detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const cmpTotalPoints = useMemo(
    () => comparison.reduce((s, m) => s + m.series.length, 0),
    [comparison],
  );

  /* Distinct currencies across compared series — for multi-currency safeguards */
  const uniqueCurrencies = useMemo(() => {
    const set = new Set();
    comparison.forEach(mat => {
      mat.series?.forEach(pt => {
        if (pt.currency) set.add(pt.currency.toUpperCase());
      });
    });
    return Array.from(set);
  }, [comparison]);

  /* â”€â”€ Cleanup charts on unmount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  useEffect(() => {
    return () => {
      _destroyHistChart();
      _destroyCmpChart();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  return (
    <div className="page-container">

      {/* â”€â”€ Tab bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
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

      {/* â”€â”€ Materials load error (full-page, both tabs affected) â”€â”€ */}
      {materialsStatus === STATUS.ERROR && (
        <ErrorState
          title="Failed to load materials"
          message="Could not load your materials list. Please try again."
          retry={loadMaterials}
        />
      )}

      {/* ========================================================
          TAB 1 â€” Price History
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
          {histStatus === STATUS.IDLE && (
            <EmptyState
              icon="fa-solid fa-chart-area"
              title="Select a material to inspect price history"
              message="Choose a tracked material above and click Apply to load benchmarks, supplier quotes, AI outlook, and reorder guidance."
            />
          )}

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
              action={{ label: 'Log a Price', onClick: () => navigate('/prices?materialId=' + phMaterialId) }}
            />
          )}

          {histStatus === STATUS.SUCCESS && histItems.length > 0 && (
            <>
              {/* Benchmark / Proxy notice */}
              {(() => {
                const isGoi = selectedHistMaterial?.externalSymbol?.endsWith('_GOI') ||
                  histItems.some(i => i.unitLabel === 'INR/quintal' || (i.currency === 'INR' && i.dataClass === 'MARKET_INDICATIVE'));
                const isCrudeProxy = selectedHistMaterial?.externalSymbol === 'WTI' ||
                  selectedHistMaterial?.externalSymbol === 'BRENT' ||
                  histItems.some(i => i.currency === 'USD' || i.dataClass === 'OFFICIAL_BENCHMARK');

                if (isGoi) {
                  return (
                    <div className="trends-notice trends-notice--info card">
                      <div className="card__body trends-notice__body">
                        <div className="trends-notice__row">
                          <i className="fa-solid fa-building-columns trends-notice__icon--info" aria-hidden="true" />
                          <strong className="trends-notice__title">
                            Official Indian Wholesale Mandi Benchmark
                          </strong>
                        </div>
                        <p className="trends-notice__copy">
                          Prices shown reflect authentic official Indian wholesale market mandi modal prices (Agmarknet / Ministry of Agriculture) in INR/quintal. These reflect wholesale mandi auctions, not packaged consumer retail prices.
                        </p>
                      </div>
                    </div>
                  );
                }

                if (isCrudeProxy || selectedHistMaterial?.externalSymbol || histItems.some(i => i.dataClass === 'MARKET_INDICATIVE')) {
                  return (
                    <div className="trends-notice trends-notice--warning card">
                      <div className="card__body trends-notice__body">
                        <div className="trends-notice__row">
                          <i className="fa-solid fa-triangle-exclamation trends-notice__icon--warning" aria-hidden="true" />
                          <strong className="trends-notice__title">
                            Market Indicative Proxy Benchmark
                          </strong>
                        </div>
                        <p className="trends-notice__copy">
                          Prices shown reflect global commodity benchmarks ({selectedHistMaterial?.externalSymbol || 'Crude Oil'} in USD/bbl) acting as upstream indicative proxies, not direct local purchase transactions.
                        </p>
                      </div>
                    </div>
                  );
                }

                return null;
              })()}

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
                        <th scope="col">Price</th>
                        <th scope="col">Currency & Unit</th>
                        <th scope="col">Classification</th>
                        <th scope="col">Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histItems.map((row, i) => (
                        <tr key={i}>
                          <td>{formatDate(row.recordedAt)}</td>
                          <td className="font-mono">{formatNumber(row.price, 2)}</td>
                          <td>{row.currency ? `${row.currency} (${row.unitLabel || selectedHistMaterial?.unit || 'unit'})` : (selectedHistMaterial?.unit || '—')}</td>
                          <td>
                            <span className={`badge trends-table-badge ${row.dataClass === 'OFFICIAL_BENCHMARK' ? 'badge--info' : row.dataClass === 'MARKET_INDICATIVE' ? 'badge--warning' : 'badge--neutral'}`}>
                              {row.dataClass === 'OFFICIAL_BENCHMARK' ? 'Benchmark' : row.dataClass === 'MARKET_INDICATIVE' ? 'Proxy' : 'Quote'}
                            </span>
                          </td>
                          <td className="text-xs text-secondary">{row.source || '—'}</td>
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

        {/* AI insight section -- visible whenever a material is selected,
            independent of the chart load state */}
        {phMaterialId && (
          <div className="trends-insight-section">
            <div className="trends-impact-bar">
              <Link
                to={`/materials/${phMaterialId}/impact`}
                className="btn btn--sm btn--secondary"
              >
                View Impact Chains
              </Link>
            </div>
            <InsightCard
              insight={insight ?? null}
              loading={insightLoading}
              error={insightError}
              title={`AI Insight -- ${selectedHistMaterial?.name ?? 'Selected Material'}`}
            />
            <PriceOutlookCard
              outlook={supplierRec?.priceOutlook}
              loading={supplierRecLoading}
              error={supplierRecError}
              materialName={selectedHistMaterial?.name}
            />
            <SupplierGuidanceCard
              rec={supplierRec}
              loading={supplierRecLoading}
              error={supplierRecError}
              materialName={selectedHistMaterial?.name}
              onOpenLandedCost={!isViewer ? () => setShowLandedCostModal(true) : undefined}
              onOpenCopilot={!isViewer ? () => setShowCopilotModal(true) : undefined}
            />

            {!isViewer && showLandedCostModal && selectedHistMaterial && (
              <LandedCostModal
                material={selectedHistMaterial}
                isOpen={showLandedCostModal}
                onClose={() => setShowLandedCostModal(false)}
                onSaveSuccess={() => {
                  if (selectedHistMaterial?.id) {
                    getMaterialSupplierRecommendations(selectedHistMaterial.id)
                      .then(setSupplierRec)
                      .catch(() => {});
                  }
                }}
                benchmarkPrice={supplierRec?.quoteComparison?.latestBenchmark?.price}
                benchmarkCurrency={supplierRec?.quoteComparison?.latestBenchmark?.currency || 'USD'}
                benchmarkUnit={supplierRec?.quoteComparison?.latestBenchmark?.unitLabel || 'bbl'}
                domesticQuotePrice={supplierRec?.quoteComparison?.latestQuote?.price}
                initialFxRate={supplierRec?.fxNormalizedComparison?.fxRate?.rate}
              />
            )}

            {!isViewer && showCopilotModal && (
              <WhatsAppCopilotModal
                isOpen={showCopilotModal}
                onClose={() => setShowCopilotModal(false)}
                materials={trackedMaterials}
                initialMaterialId={phMaterialId}
                onQuoteLogged={() => {
                  if (phMaterialId) {
                    _loadHistory(histPage || 1);
                    getMaterialSupplierRecommendations(phMaterialId)
                      .then(setSupplierRec)
                      .catch(() => {});
                  }
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* ========================================================
          TAB 2 â€” Compare Materials
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

            {/* Checkbox list â€” tracked materials only */}
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
          {cmpStatus === STATUS.IDLE && (
            <EmptyState
              icon="fa-solid fa-code-compare"
              title="Compare multiple tracked materials"
              message="Pick up to 5 tracked materials above and click Compare to overlay trajectory lines side by side."
            />
          )}

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
              {uniqueCurrencies.length > 1 && (
                <div
                  className="alert alert--warning trends-currency-warning"
                  role="alert"
                  id="cmp-currency-warning"
                >
                  <i className="fa-solid fa-triangle-exclamation trends-notice__icon--warning trends-warning-icon" aria-hidden="true" />
                  <div>
                    <strong>Multi-Currency Comparison Notice:</strong> Selected materials use different currencies ({uniqueCurrencies.join(' vs ')}). Chart values reflect nominal prices in each material's local unit and currency without FX conversion. Focus on relative trajectory and percentage trends rather than direct numeric comparison.
                  </div>
                </div>
              )}

              <p className="text-xs text-secondary trends-note-line">
                <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
                Comparing multi-material trends. Series reflect respective benchmark units and currencies.
              </p>

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
    <>
      <p className="text-xs text-secondary trends-subcaption-italic">
        <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
        Values reflect individual commodity benchmark units and currencies. Compare relative trend trajectories rather than direct absolute prices when units differ.
      </p>
      <table className="table table--compact">
        <caption>Price comparison data</caption>
        <thead>
          <tr>
            <th scope="col">Date</th>
            {comparison.map(mat => {
              const pt = mat.series?.[0];
              const curr = pt?.currency || 'INR';
              const rawUnit = pt?.unitLabel || '';
              const displayUnit = rawUnit.toUpperCase().includes(curr.toUpperCase())
                ? rawUnit
                : (rawUnit ? `${curr}/${rawUnit}` : curr);
              return (
                <th key={mat.materialId} scope="col">
                  {mat.name}
                  {displayUnit && (
                    <span className="text-xs text-secondary trends-block-regular">
                      ({displayUnit})
                    </span>
                  )}
                </th>
              );
            })}
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
    </>
  );
}

/* ================================================================
 * DIRECTIONAL PRICE OUTLOOK & BANDS CARD (V3-M2)
 * ================================================================ */

export function formatRelativeDays(publishedAt, evaluatedAt) {
  if (!publishedAt || !evaluatedAt) return 'Recent';
  const tPub = new Date(publishedAt).getTime();
  const tEval = new Date(evaluatedAt).getTime();
  if (isNaN(tPub) || isNaN(tEval)) return 'Recent';
  const diffHours = Math.max(0, Math.round((tEval - tPub) / (1000 * 60 * 60)));
  if (diffHours < 24) {
    return `${Math.max(1, diffHours)}h ago`;
  }
  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
}

export function PriceOutlookCard({ outlook, loading, error, materialName }) {
  if (loading) {
    return (
      <div className="card price-outlook-card" id="price-outlook-card">
        <div className="card__body">
          <Skeleton type="card" rows={3} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card price-outlook-card" id="price-outlook-card">
        <div className="card__body">
          <p className="text-muted trends-muted-copy">
            <i className="fa-solid fa-circle-exclamation mr-1" /> {error}
          </p>
        </div>
      </div>
    );
  }

  if (!outlook) return null;

  if (outlook.insufficientData) {
    return (
      <div className="card price-outlook-card" id="price-outlook-card">
        <div className="price-outlook-header">
          <h3 className="price-outlook-header__title">
            <i className="fa-solid fa-chart-line" style={{ color: 'var(--color-primary)', marginRight: '8px' }} />
            14d &amp; 30d Directional Price Outlook — {materialName || 'Tracked Material'}
          </h3>
          <span className="badge badge--neutral">INSUFFICIENT DATA</span>
        </div>
        <div className="card__body trends-card-body-compact">
          <p className="trends-xs-copy">
            {outlook.reason || 'At least 5 historical price points are required to compute statistical volatility and directional bands.'}
          </p>
          <div className="trends-xs-meta-top">
            Current points logged: <strong className="font-mono">{outlook.dataPointCount || 0}</strong> / {outlook.minimumRequired || 5}
          </div>
        </div>
      </div>
    );
  }

  const direction = outlook.expectedDirection || 'RANGE_BOUND';
  const dirClass =
    direction === 'UPWARD_PRESSURE'   ? 'outlook-dir-pill--up' :
    direction === 'DOWNWARD_PRESSURE' ? 'outlook-dir-pill--down' :
    'outlook-dir-pill--range';

  const dirLabel =
    direction === 'UPWARD_PRESSURE'   ? 'Upward Cost Pressure' :
    direction === 'DOWNWARD_PRESSURE' ? 'Downward Softening' :
    'Range-Bound / Neutral';

  const tierClass =
    outlook.confidenceTier === 'HIGH'     ? 'badge--success' :
    outlook.confidenceTier === 'MODERATE' ? 'badge--warning' : 'badge--neutral';

  return (
    <div className="card price-outlook-card" id="price-outlook-card">
      <div className="price-outlook-header">
        <div className="price-outlook-header__left">
          <h3 className="price-outlook-header__title">
            <i className="fa-solid fa-chart-line" style={{ color: 'var(--color-primary)', marginRight: '8px' }} />
            14d &amp; 30d Directional Price Outlook — {materialName || 'Tracked Material'}
          </h3>
          <span className="text-xs text-muted trends-block-sub">
            Series: {outlook.seriesSource === 'SUPPLIER_QUOTE' ? 'Domestic Supplier Quotes' : 'Market Benchmark'} ({outlook.currency}/{outlook.unit})
          </span>
        </div>
        <div className="price-outlook-header__badges">
          <span className={`outlook-dir-pill ${dirClass}`}>
            <i className={`fa-solid ${direction === 'UPWARD_PRESSURE' ? 'fa-arrow-trend-up' : direction === 'DOWNWARD_PRESSURE' ? 'fa-arrow-trend-down' : 'fa-arrows-left-right'} mr-1`} />
            {dirLabel}
          </span>
          <span className={`badge ${tierClass} trends-pill-sm`}>
            {outlook.confidenceTier} ({outlook.confidenceScore}%)
          </span>
        </div>
      </div>

      <div className="price-outlook-body">
        {outlook.isDataStale && (
          <div className="alert alert--warning trends-alert-compact">
            <i className="fa-solid fa-clock-rotate-left mr-1" />
            Latest price was recorded {outlook.daysSinceLatest} days ago. Statistical confidence is downgraded until fresh prices are logged.
          </div>
        )}

        {/* 14d & 30d Directional Bands Grid */}
        <div className="outlook-bands-grid">
          {/* 14-Day Horizon */}
          <div className="outlook-band-card">
            <div className="outlook-band-card__header">
              <span className="outlook-band-label">14-Day Price Band</span>
              <span className="outlook-band-vol font-mono">±{outlook.volatility14dPct}% vol</span>
            </div>
            <div className="outlook-band-values">
              <div className="outlook-band-col">
                <span className="outlook-sublabel">Low Target</span>
                <span className="outlook-value font-mono">
                  {outlook.currency} {Number(outlook.band14d?.low || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="outlook-band-col outlook-band-col--mid">
                <span className="outlook-sublabel">Expected Mid</span>
                <span className={`outlook-value font-mono ${direction === 'UPWARD_PRESSURE' ? 'outlook-tone--up' : direction === 'DOWNWARD_PRESSURE' ? 'outlook-tone--down' : ''}`}>
                  {outlook.currency} {Number(outlook.band14d?.mid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="outlook-band-col">
                <span className="outlook-sublabel">High Target</span>
                <span className="outlook-value font-mono">
                  {outlook.currency} {Number(outlook.band14d?.high || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="outlook-progress-bar">
              <div
                className={`outlook-progress-fill ${direction === 'UPWARD_PRESSURE' ? 'outlook-progress-fill--up' : direction === 'DOWNWARD_PRESSURE' ? 'outlook-progress-fill--down' : 'outlook-progress-fill--neutral'}`}
                style={{
                  width: `${Math.max(5, Math.min(95, (((outlook.currentPrice - outlook.band14d?.low) / Math.max(0.01, (outlook.band14d?.high || 1) - (outlook.band14d?.low || 0))) * 100)))}%`,
                }}
              />
            </div>
            <span className="outlook-curr-hint font-mono">Current: {outlook.currency} {Number(outlook.currentPrice || 0).toFixed(2)}</span>
          </div>

          {/* 30-Day Horizon */}
          <div className="outlook-band-card">
            <div className="outlook-band-card__header">
              <span className="outlook-band-label">30-Day Price Band</span>
              <span className="outlook-band-vol font-mono">±{outlook.volatility30dPct}% vol</span>
            </div>
            <div className="outlook-band-values">
              <div className="outlook-band-col">
                <span className="outlook-sublabel">Low Target</span>
                <span className="outlook-value font-mono">
                  {outlook.currency} {Number(outlook.band30d?.low || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="outlook-band-col outlook-band-col--mid">
                <span className="outlook-sublabel">Expected Mid</span>
                <span className={`outlook-value font-mono ${direction === 'UPWARD_PRESSURE' ? 'outlook-tone--up' : direction === 'DOWNWARD_PRESSURE' ? 'outlook-tone--down' : ''}`}>
                  {outlook.currency} {Number(outlook.band30d?.mid || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="outlook-band-col">
                <span className="outlook-sublabel">High Target</span>
                <span className="outlook-value font-mono">
                  {outlook.currency} {Number(outlook.band30d?.high || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="outlook-progress-bar">
              <div
                className={`outlook-progress-fill ${direction === 'UPWARD_PRESSURE' ? 'outlook-progress-fill--up' : direction === 'DOWNWARD_PRESSURE' ? 'outlook-progress-fill--down' : 'outlook-progress-fill--neutral'}`}
                style={{
                  width: `${Math.max(5, Math.min(95, (((outlook.currentPrice - outlook.band30d?.low) / Math.max(0.01, (outlook.band30d?.high || 1) - (outlook.band30d?.low || 0))) * 100)))}%`,
                }}
              />
            </div>
            <span className="outlook-curr-hint font-mono">Current: {outlook.currency} {Number(outlook.currentPrice || 0).toFixed(2)}</span>
          </div>
        </div>

        {/* Confidence Drivers & Key Signals */}
        {outlook.confidenceDrivers && outlook.confidenceDrivers.length > 0 && (
          <div className="outlook-subpanel">
            <h4 className="outlook-subpanel__title">
              <i className="fa-solid fa-satellite-dish mr-2 trends-icon--primary" aria-hidden="true" />
              Signal Alignment &amp; Drivers
            </h4>
            <ul className="outlook-drivers-list">
              {outlook.confidenceDrivers.map((driver, idx) => (
                <li key={idx} className="outlook-driver-item">
                  <i className="fa-solid fa-check mr-2 text-muted trends-icon-xs" aria-hidden="true" />
                  <span>{driver}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Top Scored News Impact Drivers */}
        {outlook.newsDrivers && outlook.newsDrivers.length > 0 && (
          <div className="outlook-subpanel">
            <h4 className="outlook-subpanel__title">
              <i className="fa-solid fa-newspaper mr-2 trends-icon--accent" aria-hidden="true" />
              Recent News Impact Drivers
            </h4>
            <div className="outlook-news-list">
              {outlook.newsDrivers.map((driver, idx) => (
                <div key={driver.id || idx} className="outlook-news-item">
                  <div className="outlook-news-item__top">
                    <span
                      className={`badge trends-badge-mini ${
                        driver.impactDirection === 'COST_UP'   ? 'badge--danger' :
                        driver.impactDirection === 'COST_DOWN' ? 'badge--success' : 'badge--neutral'
                      }`}
                    >
                      {driver.impactDirection === 'COST_UP' ? 'COST UP' : driver.impactDirection === 'COST_DOWN' ? 'COST DOWN' : 'NEUTRAL'}
                    </span>
                    <span className="badge badge--neutral font-mono trends-badge-xs">
                      SEV {driver.severityScore}/5
                    </span>
                    <span className="outlook-news-time text-muted font-mono">
                      {formatRelativeDays(driver.publishedAt, outlook.evaluatedAt)}
                    </span>
                  </div>
                  <div className="outlook-news-title">
                    {(() => {
                      const safeDriverUrl = getSafeExternalUrl(driver.url);
                      return safeDriverUrl ? (
                        <a href={safeDriverUrl} target="_blank" rel="noopener noreferrer" className="outlook-news-link">
                          {driver.title}
                        </a>
                      ) : (
                        <span>{driver.title}</span>
                      );
                    })()}
                  </div>
                  {driver.impactRationale && (
                    <div className="outlook-news-rationale text-muted">
                      {driver.impactRationale}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transparency Disclaimer */}
        <div className="outlook-disclaimer text-muted font-mono">
          <i className="fa-solid fa-shield-halved mr-1" /> {outlook.disclaimer}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
 * SUPPLIER SOURCING GUIDANCE CARD (T-08 / FR-ALERT-06)
 * ================================================================ */
export function SupplierGuidanceCard({ rec, loading, error, materialName, onOpenLandedCost, onOpenCopilot }) {
  if (loading) {
    return (
      <div className="card supplier-guidance-card" id="supplier-guidance-card">
        <div className="card__body">
          <Skeleton type="card" rows={3} />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card supplier-guidance-card" id="supplier-guidance-card">
        <div className="card__body">
          <p className="text-muted trends-muted-copy">
            <i className="fa-solid fa-circle-exclamation mr-1" /> {error}
          </p>
        </div>
      </div>
    );
  }

  if (!rec) return null;

  const action = rec.actionRecommendation || 'MONITOR_ONLY';
  const actionLabel = action.replace(/_/g, ' ');

  const pillClass =
    action === 'BUY_MINIMUM_BRIDGE'  ? 'supplier-action-pill--bridge' :
    action === 'ACCELERATE_PURCHASE' ? 'supplier-action-pill--accelerate' :
    action === 'DELAY_PURCHASE'      ? 'supplier-action-pill--delay' :
    action === 'MAINTAIN_BUFFER'     ? 'supplier-action-pill--maintain' :
    'supplier-action-pill--monitor';

  return (
    <div className="card supplier-guidance-card" id="supplier-guidance-card">
      <div className="supplier-guidance-header">
        <h3 className="supplier-guidance-header__title">
          <i className="fa-solid fa-boxes-packing mr-2 trends-icon--primary" aria-hidden="true" />
          Supplier Sourcing &amp; Inventory Guidance — {materialName || 'Tracked Material'}
        </h3>
        <div className="supplier-flex-row">
          {onOpenCopilot && (
            <button
              type="button"
              id="whatsapp-copilot-trends-btn"
              className="btn btn--sm btn--secondary trends-btn-copilot"
              onClick={onOpenCopilot}
            >
              <i className="fa-brands fa-whatsapp trends-icon--success" aria-hidden="true" />
              WhatsApp Copilot
            </button>
          )}
          <span className={`supplier-action-pill ${pillClass}`}>
            {actionLabel}
          </span>
        </div>
      </div>

      <div className="supplier-guidance-body">
        {/* Smart Reorder Decision (V3-M1) */}
        <div className="supplier-subpanel" id="reorder-decision-panel">
          <div className="supplier-subpanel__header">
            <h4 className="supplier-subpanel__title">
              <i className="fa-solid fa-calculator mr-2 trends-icon--primary" aria-hidden="true" />
              Smart Reorder &amp; Inventory Decision
            </h4>
            {rec.inventoryDecision?.hasInventoryProfile && (
              <span
                className={`badge trends-pill-sm ${
                  rec.inventoryDecision.stockoutRisk === 'CRITICAL'
                    ? 'badge--danger'
                    : rec.inventoryDecision.stockoutRisk === 'LOW'
                    ? 'badge--warning'
                    : 'badge--success'
                }`}
              >
                {rec.inventoryDecision.stockoutRisk === 'CRITICAL'
                  ? 'CRITICAL STOCKOUT RISK'
                  : rec.inventoryDecision.stockoutRisk === 'LOW'
                  ? 'LOW COVERAGE'
                  : 'HEALTHY BUFFER'}
              </span>
            )}
          </div>

          {rec.inventoryDecision?.hasInventoryProfile ? (
            <>
              {rec.inventoryDecision.isBridgeOverride && (
                <div className="bridge-override-callout">
                  <i className="fa-solid fa-triangle-exclamation mr-2" />
                  <strong>Critical Stockout Override:</strong> Market price trend suggests delaying purchase, but current stock is below supplier lead time. Minimum bridge order recommended immediately to prevent stockout.
                </div>
              )}

              {rec.inventoryDecision.isStockStale && (
                <div className="alert alert--warning stock-stale-warning">
                  <i className="fa-solid fa-clock-rotate-left mr-1" />
                  Stock updated {rec.inventoryDecision.daysSinceUpdate} days ago. Review and update current stock in Materials to keep reorder calculations accurate.
                </div>
              )}

              <div className="supplier-metric-grid">
                <div className="supplier-metric-card">
                  <span className="supplier-metric-label">Days of Cover</span>
                  <span className="supplier-metric-value">
                    {rec.inventoryDecision.daysOfCover != null ? `${rec.inventoryDecision.daysOfCover}d` : '—'}
                  </span>
                </div>

                <div className="supplier-metric-card">
                  <span className="supplier-metric-label">Recommended Order</span>
                  <span className="supplier-metric-value">
                    {rec.inventoryDecision.recommendedOrderQty != null
                      ? `${Number(rec.inventoryDecision.recommendedOrderQty).toLocaleString()} ${rec.unit || ''}`.trim()
                      : '0'}
                  </span>
                  {rec.inventoryDecision.isStorageCapped && (
                    <span className="supplier-warn-mini">
                      Capped by max storage limit
                    </span>
                  )}
                </div>

                <div className="supplier-metric-card">
                  <span className="supplier-metric-label">Estimated Order Value</span>
                  {rec.inventoryDecision.estimatedOrderValue != null ? (
                    <span className="supplier-metric-value">
                      {rec.inventoryDecision.currency || ''} {Number(rec.inventoryDecision.estimatedOrderValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  ) : (
                    <span className="supplier-sub-note">
                      {rec.inventoryDecision.valuationNote || 'Quote needed for valuation'}
                    </span>
                  )}
                </div>
              </div>

              {rec.inventoryDecision.decisionSummary && (
                <p className="supplier-summary-copy">
                  {rec.inventoryDecision.decisionSummary}
                </p>
              )}
            </>
          ) : (
            <div className="supplier-empty-block">
              <p className="supplier-empty-copy">
                Inventory parameters (current stock, consumption rate, lead time) are not configured for this material.
              </p>
              <Link to="/materials" className="btn btn--secondary btn--sm">
                <i className="fa-solid fa-boxes-stacked mr-1" /> Configure Stock Profile in Materials
              </Link>
            </div>
          )}
        </div>

        {/* Buffer strategy overview */}
        <div className="supplier-subpanel">
          <div className="supplier-subpanel__header">
            <span className="supplier-buffer-value">
              Target Inventory Buffer: {rec.bufferStrategy?.targetBufferDays || 15} Days
            </span>
            <span className="supplier-priority-meta">
              Priority: <strong className="supplier-strong">{rec.bufferStrategy?.priority || 'MEDIUM'}</strong>
            </span>
          </div>
          <p className="trends-xs-copy">
            {rec.bufferStrategy?.detailedGuidance || rec.rationale}
          </p>
        </div>

        {/* Benchmark vs Supplier Quote Comparison */}
        {rec.quoteComparison && (
          <div className="supplier-subpanel">
            <h4 className="supplier-subpanel__title">
              <i className="fa-solid fa-scale-balanced mr-2 trends-icon--accent" aria-hidden="true" />
              Supplier Quote vs Market Benchmark
            </h4>

            {rec.quoteComparison.variancePercent !== null ? (
              <div className="supplier-metric-grid">
                <div className="supplier-metric-card">
                  <span className="supplier-metric-label">Domestic Supplier Quote</span>
                  <span className="supplier-metric-value">
                    {rec.quoteComparison.latestQuote?.currency || 'INR'} {Number(rec.quoteComparison.latestQuote?.price || 0).toFixed(2)}
                  </span>
                </div>

                <div className="supplier-metric-card">
                  <span className="supplier-metric-label">Market Benchmark</span>
                  <span className="supplier-metric-value">
                    {rec.quoteComparison.latestBenchmark?.currency || 'INR'} {Number(rec.quoteComparison.latestBenchmark?.price || 0).toFixed(2)}
                  </span>
                </div>

                <div className="supplier-metric-card">
                  <span className="supplier-metric-label">Calculated Variance</span>
                  <span
                    className={`supplier-metric-value ${
                      rec.quoteComparison.variancePercent > 0 ? 'supplier-metric-value--danger' : 'supplier-metric-value--success'
                    }`}
                  >
                    {rec.quoteComparison.variancePercent > 0 ? '+' : ''}{rec.quoteComparison.variancePercent}%
                  </span>
                </div>
              </div>
            ) : rec.quoteComparison.crossCurrencyNote ? (
              <div className="alert alert--warning supplier-parity-alert">
                <div className="supplier-flex-between">
                  <div>
                    <i className="fa-solid fa-circle-info mr-1" /> {rec.quoteComparison.crossCurrencyNote}
                  </div>
                  {onOpenLandedCost && (
                    <button
                      type="button"
                      className="btn btn--sm btn--primary trends-pill-sm"
                      onClick={onOpenLandedCost}
                    >
                      Configure Landed-Cost Parity
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="supplier-parity-meta">
                Single price stream active. Ingest or upload domestic quotes to evaluate procurement variance against benchmarks.
              </div>
            )}
          </div>
        )}

        {/* Landed-Cost & FX Parity Benchmark (V3-M3) */}
        {rec.fxNormalizedComparison && rec.fxNormalizedComparison.isConfigured && rec.fxNormalizedComparison.estimatedLandedBenchmark != null && (
          <div className="supplier-subpanel landed-parity-subpanel" id="landed-parity-panel">
            <div className="supplier-subpanel-toolbar">
              <h4 className="supplier-subpanel__title supplier-subpanel__title--flush">
                <i className="fa-solid fa-calculator mr-2 trends-icon--primary" aria-hidden="true" />
                Landed-Cost &amp; FX Parity Benchmark
              </h4>
              <div className="supplier-flex-row-compact">
                {rec.fxNormalizedComparison.fxRate && (
                  <span className="badge badge--info font-mono supplier-fx-badge">
                    USD/INR: ₹{Number(rec.fxNormalizedComparison.fxRate.rate).toFixed(2)}
                    {rec.fxNormalizedComparison.fxRate.isStale && ' (Stale)'}
                  </span>
                )}
                {onOpenLandedCost && (
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost trends-btn-edit-model"
                    onClick={onOpenLandedCost}
                  >
                    Edit Model
                  </button>
                )}
              </div>
            </div>

            <div className="supplier-metric-grid">
              <div className="supplier-metric-card">
                <span className="supplier-metric-label">Estimated Landed Benchmark</span>
                <span className="supplier-metric-value font-mono">
                  ₹{Number(rec.fxNormalizedComparison.estimatedLandedBenchmark).toFixed(2)}/{rec.fxNormalizedComparison.targetUnit}
                </span>
              </div>

              <div className="supplier-metric-card">
                <span className="supplier-metric-label">Domestic Supplier Quote</span>
                <span className="supplier-metric-value font-mono">
                  {rec.fxNormalizedComparison.latestDomesticQuote != null
                    ? `₹${Number(rec.fxNormalizedComparison.latestDomesticQuote).toFixed(2)}/${rec.fxNormalizedComparison.targetUnit}`
                    : 'None Logged'}
                </span>
              </div>

              <div className="supplier-metric-card">
                <span className="supplier-metric-label">Landed Parity Variance</span>
                <span
                  className={`supplier-metric-value font-mono ${
                    rec.fxNormalizedComparison.variancePercent != null
                      ? (rec.fxNormalizedComparison.variancePercent > 0 ? 'supplier-metric-value--danger' : 'supplier-metric-value--success')
                      : 'supplier-metric-value--muted'
                  }`}
                >
                  {rec.fxNormalizedComparison.variancePercent != null
                    ? `${rec.fxNormalizedComparison.variancePercent > 0 ? '+' : ''}${rec.fxNormalizedComparison.variancePercent}%`
                    : '—'}
                </span>
              </div>
            </div>

            {rec.fxNormalizedComparison.formulaBreakdown && (
              <div className="supplier-disclaimer-mono">
                Parity Formula: {rec.fxNormalizedComparison.formulaBreakdown}
              </div>
            )}
          </div>
        )}

        {/* Indian Market Diversification & Checklist */}
        {rec.diversification && (
          <div className="supplier-subpanel">
            <h4 className="supplier-subpanel__title">
              <i className="fa-solid fa-shield-halved mr-2 trends-icon--success" aria-hidden="true" />
              Supply Chain Resilience ({rec.diversification.category})
            </h4>
            <p className="supplier-resilience-copy supplier-resilience-copy--lead">
              <strong className="supplier-strong">Primary Hubs:</strong> {rec.diversification.primarySources}
            </p>
            <p className="supplier-resilience-copy">
              <strong className="supplier-strong">Sourcing Strategy:</strong> {rec.diversification.sourcingStrategy}
            </p>

            {rec.diversification.checklist && rec.diversification.checklist.length > 0 && (
              <div>
                <div className="supplier-checklist-heading">
                  Procurement Checklist
                </div>
                <ul className="supplier-checklist">
                  {rec.diversification.checklist.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
