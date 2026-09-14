/**
 * Skeleton & Spinner loading components
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/js/components/loader.js
 * Preserves identical CSS class names from components.css.
 *
 * Imperative DOM-building in showSkeleton() is replaced with
 * pure JSX components that render the same structure.
 *
 * Exports:
 *   <Skeleton type="list|table|card|chart|panel" rows={n} />
 *   <Spinner />              — centred page-level spinner (replaces showPageSpinner)
 *   <ButtonSpinner />        — inline use inside a button (visual only, no state)
 *
 * Usage notes:
 *   Button loading state → add 'btn--loading' class + disabled prop via useState.
 *   Page initial load    → render <Skeleton type="..." rows={n} /> while fetching.
 *   Replace skeleton     → conditional render: {loading ? <Skeleton /> : <RealContent />}
 */

/* ----------------------------------------------------------------
 * SKELETON LINE PRIMITIVES
 * ---------------------------------------------------------------- */

function SkeletonLine({ className = '' }) {
  return <div className={`skeleton skeleton-line ${className}`.trim()} />;
}

/* ----------------------------------------------------------------
 * SKELETON TYPE BUILDERS
 * ---------------------------------------------------------------- */

function ListSkeleton({ rows }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            padding:       'var(--space-3) 0',
            borderBottom:  '1px solid var(--color-border)',
            display:       'flex',
            flexDirection: 'column',
            gap:           'var(--space-2)',
          }}
        >
          <SkeletonLine className="skeleton-line--medium" />
          <SkeletonLine className="skeleton-line--short" />
        </div>
      ))}
    </>
  );
}

function TableSkeleton({ rows }) {
  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', backgroundColor: 'var(--color-bg-elevated)', borderBottom: '1px solid var(--color-border)', borderRadius: 'var(--radius-md) var(--radius-md) 0 0' }}>
        {[1, 2, 3, 4].map(j => (
          <div key={j} className="skeleton skeleton-line" style={{ flex: 1, height: '12px' }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', gap: 'var(--space-4)', padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--color-border)', alignItems: 'center' }}>
          {[1, 2, 3, 4].map(j => (
            <div key={j} className="skeleton skeleton-line" style={{ flex: j === 1 ? 2 : 1, height: '14px' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function CardSkeleton({ rows }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={{
            background:    'var(--color-bg-surface)',
            border:        '1px solid var(--color-border)',
            borderRadius:  'var(--radius-lg)',
            padding:       'var(--space-6)',
            marginBottom:  'var(--space-4)',
            display:       'flex',
            flexDirection: 'column',
            gap:           'var(--space-3)',
          }}
        >
          <SkeletonLine className="skeleton-line--medium" />
          <SkeletonLine className="skeleton-line--long" />
          <SkeletonLine className="skeleton-line--short" />
        </div>
      ))}
    </>
  );
}

function ChartSkeleton() {
  return <div className="chart-skeleton skeleton" />;
}

function PanelSkeleton({ rows }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
      <SkeletonLine className="skeleton-line--short" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <div className="skeleton skeleton-line" style={{ flex: 1, height: '14px' }} />
          <SkeletonLine className="skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------
 * MAIN SKELETON COMPONENT
 * ---------------------------------------------------------------- */

/**
 * @param {{ type?: 'list'|'table'|'card'|'chart'|'panel', rows?: number, className?: string }} props
 */
export function Skeleton({ type = 'list', rows = 3, className = '' }) {
  let content;
  if (type === 'table')       content = <TableSkeleton rows={rows} />;
  else if (type === 'card')   content = <CardSkeleton rows={rows} />;
  else if (type === 'chart')  content = <ChartSkeleton />;
  else if (type === 'panel')  content = <PanelSkeleton rows={rows} />;
  else                        content = <ListSkeleton rows={rows} />;

  return (
    <div
      className={`skeleton-wrapper ${className}`.trim()}
      aria-busy="true"
      aria-label="Loading…"
    >
      {content}
    </div>
  );
}

/* ----------------------------------------------------------------
 * PAGE SPINNER
 * ---------------------------------------------------------------- */

/**
 * Centred page-level loading spinner.
 * Replaces showPageSpinner() / hidePageSpinner().
 * Usage: {loading ? <Spinner /> : <RealContent />}
 */
export function Spinner({ label = 'Loading…' }) {
  return (
    <div
      className="spinner-container skeleton-wrapper"
      aria-busy="true"
      role="status"
      aria-label={label}
    >
      <div className="spinner" />
    </div>
  );
}
