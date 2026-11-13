import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  DEFAULT_IMPACT_MAX_DEPTH,
  getMaterialImpactAnalysis,
} from '../api/aiInsights.api.js';
import { createLatestRequestGuard } from '../utils/requestGuard.js';
import { MaterialImpactPanel } from '../components/ui/MaterialImpactPanel.jsx';

function MaterialImpactView({ materialId }) {
  const [maxDepth, setMaxDepth] = useState(DEFAULT_IMPACT_MAX_DEPTH);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const guardRef = useRef(null);

  useEffect(() => {
    if (!guardRef.current) {
      guardRef.current = createLatestRequestGuard();
    }
    const guard = guardRef.current;
    const seq = guard.next();

    getMaterialImpactAnalysis(materialId, { maxDepth })
      .then((res) => {
        if (!guard.isCurrent(seq)) return;
        setData(res);
        setError(null);
        setLoading(false);
        setIsRefreshing(false);
      })
      .catch((err) => {
        if (!guard.isCurrent(seq)) return;
        setError(err);
        setLoading(false);
        setIsRefreshing(false);
      });

    return () => {
      guard.invalidate();
    };
  }, [materialId, maxDepth, reloadNonce]);

  const handleDepthChange = useCallback((nextDepth) => {
    if (nextDepth === maxDepth) return;
    setError(null);
    if (data) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setMaxDepth(nextDepth);
  }, [data, maxDepth]);

  const handleRefresh = useCallback(() => {
    setError(null);
    if (data) {
      setIsRefreshing(true);
    } else {
      setLoading(true);
    }
    setReloadNonce((n) => n + 1);
  }, [data]);

  return (
    <MaterialImpactPanel
      materialId={materialId}
      data={data}
      maxDepth={maxDepth}
      loading={loading}
      isRefreshing={isRefreshing}
      error={error}
      onDepthChange={handleDepthChange}
      onRefresh={handleRefresh}
    />
  );
}

/**
 * Protected route page: `/materials/:materialId/impact`
 */
export function MaterialImpactPage() {
  const { materialId } = useParams();

  return (
    <div className="page-container">
      <MaterialImpactView key={materialId} materialId={materialId} />
    </div>
  );
}
