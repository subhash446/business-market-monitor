/**
 * Skeleton & Spinner loading components
 * Business Market Monitor — React frontend
 *
 * Uses CSS classes defined in components.css (zero inline styles).
 * Exports:
 *   <Skeleton type="list|table|card|chart|panel" rows={n} />
 *   <Spinner />
 */

function SkeletonLine({ className = '' }) {
  return <div className={`skeleton skeleton-line ${className}`.trim()} />;
}

function ListSkeleton({ rows }) {
  return (
    <div className="skeleton-list">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-list__row">
          <SkeletonLine className="skeleton-line--medium" />
          <SkeletonLine className="skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ rows }) {
  return (
    <div className="skeleton-table">
      <div className="skeleton-table__header">
        {[1, 2, 3, 4].map((j) => (
          <div key={j} className="skeleton skeleton-line skeleton-table__header-cell" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-table__row">
          {[1, 2, 3, 4].map((j) => (
            <div
              key={j}
              className={`skeleton skeleton-line skeleton-table__cell${
                j === 1 ? ' skeleton-table__cell--wide' : ''
              }`}
            />
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
        <div key={i} className="skeleton-card">
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
    <div className="skeleton-panel">
      <SkeletonLine className="skeleton-line--short" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-panel__row">
          <div className="skeleton skeleton-line skeleton-panel__cell" />
          <SkeletonLine className="skeleton-line--short" />
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ type = 'list', rows = 3, className = '' }) {
  let content;
  if (type === 'table') content = <TableSkeleton rows={rows} />;
  else if (type === 'card') content = <CardSkeleton rows={rows} />;
  else if (type === 'chart') content = <ChartSkeleton />;
  else if (type === 'panel') content = <PanelSkeleton rows={rows} />;
  else content = <ListSkeleton rows={rows} />;

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
