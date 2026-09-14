/**
 * EmptyState — empty content placeholder component
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/js/components/emptyState.js
 * Preserves identical CSS class names and DOM structure.
 * Uses JSX instead of imperative DOM building.
 *
 * Props:
 *   icon    — Font Awesome class string e.g. 'fa-solid fa-inbox'
 *   title   — heading text (required)
 *   message — body text (optional)
 *   action  — { label: string, onClick: fn } — optional CTA button
 */
export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="empty-state">
      {icon && (
        <div className="empty-state__icon">
          <i className={icon} aria-hidden="true" />
        </div>
      )}

      <h3 className="empty-state__title">{title}</h3>

      {message && (
        <p className="empty-state__message">{message}</p>
      )}

      {action && (
        <div className="empty-state__action">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={action.onClick}
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}
