/**
 * ErrorState — error content placeholder component
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/js/components/errorState.js
 * Preserves identical CSS class names and DOM structure.
 *
 * Props:
 *   title   — heading (default: 'Something went wrong')
 *   message — body text (default: 'Please try again.')
 *   retry   — function, shows "Try again" button if provided
 */
export function ErrorState({
  title   = 'Something went wrong',
  message = 'Please try again.',
  retry,
}) {
  return (
    <div className="error-state">
      <div className="error-state__icon">
        <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
      </div>

      <h3 className="error-state__title">{title}</h3>

      {message && (
        <p className="error-state__message">{message}</p>
      )}

      {typeof retry === 'function' && (
        <div className="error-state__action">
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={retry}
          >
            <i className="fa-solid fa-rotate-right" aria-hidden="true" />
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
