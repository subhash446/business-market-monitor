/**
 * Pagination — page navigation controls
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/js/components/pagination.js
 * Preserves identical CSS class names, DOM structure, aria attributes.
 *
 * Props:
 *   meta         — { page, limit, total, totalPages } from API response
 *   onPageChange — (newPage: number) => void
 *
 * Hides itself (returns null) when totalPages <= 1, matching
 * the Vanilla JS renderPagination() hide behavior.
 */
export function Pagination({ meta, onPageChange }) {
  if (!meta || meta.totalPages <= 1) return null;

  const { page, totalPages } = meta;
  const isFirstPage = page <= 1;
  const isLastPage  = page >= totalPages;

  return (
    <nav className="pagination" aria-label="Page navigation">
      <button
        type="button"
        className="pagination__prev"
        aria-label="Go to previous page"
        disabled={isFirstPage}
        aria-disabled={isFirstPage ? 'true' : undefined}
        onClick={() => !isFirstPage && onPageChange(page - 1)}
      >
        <i className="fa-solid fa-chevron-left" aria-hidden="true" />
        <span>Previous</span>
      </button>

      <span
        className="pagination__info"
        aria-live="polite"
        aria-atomic="true"
      >
        Page {page} of {totalPages}
      </span>

      <button
        type="button"
        className="pagination__next"
        aria-label="Go to next page"
        disabled={isLastPage}
        aria-disabled={isLastPage ? 'true' : undefined}
        onClick={() => !isLastPage && onPageChange(page + 1)}
      >
        <span>Next</span>
        <i className="fa-solid fa-chevron-right" aria-hidden="true" />
      </button>
    </nav>
  );
}
