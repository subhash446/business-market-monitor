import { formatNumber } from './format.js';

export const STRUCTURAL_KB_DISCLOSURE =
  'Structural Knowledge-Base Relationships Only — These relationships describe possible structural pathways and are not proof of real-world causation.';

export const OBSERVED_EVIDENCE_DISCLOSURE =
  'Observed Data Only — Reflects recorded price telemetry and stored news articles for this business account, not causal proof.';

const COVERAGE_MAP = {
  multi_hop: {
    label: 'Multi-hop structural paths',
    tone: 'info',
    description: 'Indirect and direct structural knowledge-base pathways found within the selected depth.',
  },
  direct_only: {
    label: 'Direct structural links only',
    tone: 'info',
    description: 'Only single-hop (depth 1) structural knowledge-base relationships were found.',
  },
  custom_material_no_kb_links: {
    label: 'Custom material (no KB links)',
    tone: 'warning',
    description: 'Custom materials are not mapped to the seeded structural knowledge base.',
  },
  missing_industry_context: {
    label: 'Industry context missing',
    tone: 'warning',
    description: 'No industry context is linked to this material or business profile for KB traversal.',
  },
  no_kb_dependencies: {
    label: 'No KB pathways recorded',
    tone: 'neutral',
    description: 'No structural knowledge-base dependencies are currently mapped for this material.',
  },
  kb_unavailable: {
    label: 'Knowledge base unavailable',
    tone: 'warning',
    description: 'Structural knowledge-base lookup was temporarily unavailable for this request.',
  },
};

const ENTITY_TYPE_MAP = {
  RAW_MATERIAL: { label: 'Raw Material', badgeClass: 'badge--neutral' },
  COST_DRIVER: { label: 'Cost Driver', badgeClass: 'badge--warning' },
  EXTERNAL_FACTOR: { label: 'External Factor', badgeClass: 'badge--info' },
};

const DEPENDENCY_TYPE_MAP = {
  DRIVES_COST: 'Drives cost',
  INFLUENCES: 'Influences',
  CORRELATES_WITH: 'Correlates with',
};

const PRICE_DIRECTION_MAP = {
  UP: { label: 'Upward', symbol: '▲', badgeClass: 'badge--danger' },
  DOWN: { label: 'Downward', symbol: '▼', badgeClass: 'badge--success' },
  FLAT: { label: 'Flat', symbol: '■', badgeClass: 'badge--neutral' },
  UNKNOWN: { label: 'Insufficient history', symbol: '—', badgeClass: 'badge--neutral' },
};

/**
 * Return metadata for `kb_impact.coverage` with a safe fallback for unknown codes.
 */
export function getCoverageMetadata(coverage) {
  if (typeof coverage === 'string' && COVERAGE_MAP[coverage]) {
    return { code: coverage, ...COVERAGE_MAP[coverage] };
  }
  return {
    code: coverage || 'unknown',
    label: coverage ? String(coverage) : 'Unknown coverage',
    tone: 'neutral',
    description: 'Structural knowledge-base coverage status.',
  };
}

/**
 * Return display metadata for a KB entity type (`RAW_MATERIAL`, `COST_DRIVER`, `EXTERNAL_FACTOR`).
 */
export function getEntityTypeMetadata(entityType) {
  if (typeof entityType === 'string' && ENTITY_TYPE_MAP[entityType]) {
    return ENTITY_TYPE_MAP[entityType];
  }
  return {
    label: entityType ? String(entityType) : 'Entity',
    badgeClass: 'badge--neutral',
  };
}

/**
 * Return human-readable label for a KB `dependency_type`.
 */
export function getDependencyTypeMetadata(dependencyType) {
  if (typeof dependencyType === 'string' && DEPENDENCY_TYPE_MAP[dependencyType]) {
    return DEPENDENCY_TYPE_MAP[dependencyType];
  }
  if (!dependencyType) return 'Structural link';
  return String(dependencyType).replace(/_/g, ' ');
}

/**
 * Return display metadata for `signal_assessment.price_direction`.
 */
export function getPriceDirectionMetadata(direction) {
  if (typeof direction === 'string' && PRICE_DIRECTION_MAP[direction]) {
    return PRICE_DIRECTION_MAP[direction];
  }
  return PRICE_DIRECTION_MAP.UNKNOWN;
}

/**
 * Format signed percent change cleanly, returning '—' when unavailable.
 */
export function formatPercentChange(value) {
  if (value === null || value === undefined || value === '') return '—';
  const num = Number(value);
  if (!Number.isFinite(num)) return '—';
  const sign = num > 0 ? '+' : '';
  return `${sign}${formatNumber(num, 2)}%`;
}

/**
 * Format `days_since_latest_price`, never inventing 0 when null/missing.
 */
export function formatAgeDays(days) {
  if (days === null || days === undefined || days === '') return 'No recorded price';
  const num = Number(days);
  if (!Number.isFinite(num) || num < 0) return '—';
  const rounded = Math.round(num);
  if (rounded === 0) return 'Today';
  if (rounded === 1) return '1 day ago';
  return `${rounded} days ago`;
}

/**
 * Accurately represent price staleness without marking missing history as fresh.
 */
export function formatStaleStatus(assessment) {
  if (!assessment || assessment.valid_price_count === 0 || assessment.latest_recorded_at == null) {
    return { label: 'No price history', badgeClass: 'badge--neutral' };
  }
  if (assessment.is_price_stale) {
    return { label: 'Stale (>30 days)', badgeClass: 'badge--warning' };
  }
  return { label: 'Recent (≤30 days)', badgeClass: 'badge--success' };
}

/**
 * Map API/network errors on the impact-analysis endpoint to safe user messages.
 */
export function formatImpactError(err) {
  if (!err) {
    return {
      title: 'Failed to load impact analysis',
      message: 'An unexpected error occurred while loading impact analysis.',
      retryable: true,
    };
  }
  const status = err.status ?? 0;
  if (status === 404) {
    return {
      title: 'Material not found',
      message: 'This tracked material could not be found for your business account, or you do not have access to it.',
      retryable: false,
    };
  }
  if (status === 400) {
    return {
      title: 'Invalid request parameters',
      message: err.message || 'The material ID or depth parameter is invalid.',
      retryable: false,
    };
  }
  if (status === 0) {
    return {
      title: 'Network error',
      message: err.message || 'Could not reach the server. Check your connection and try again.',
      retryable: true,
    };
  }
  return {
    title: 'Unable to load impact analysis',
    message: err.message || 'The server could not complete your request right now. Please try again.',
    retryable: true,
  };
}
