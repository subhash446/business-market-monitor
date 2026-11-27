/**
 * EmptyState — empty content placeholder component
 * Business Market Monitor — React frontend
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
            disabled={Boolean(action.disabled)}
            aria-disabled={action.disabled ? 'true' : undefined}
            title={action.title}
            onClick={action.onClick}
          >
            {action.label}
          </button>
        </div>
      )}
    </div>
  );
}
