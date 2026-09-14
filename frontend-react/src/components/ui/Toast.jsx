/**
 * Toast notification system
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/js/components/toast.js
 * Preserves identical CSS class names, animation classes, and behavior.
 * Implemented as a React Portal + Context so any component can call
 * showToast() imperatively without prop-drilling.
 *
 * Usage:
 *   1. Render <ToastProvider> inside <AuthProvider> (already in App.jsx after update)
 *   2. In any component: const { showToast } = useToast();
 *      showToast({ message: 'Saved!', type: 'success' });
 *
 * Toast types: 'success' | 'error' | 'warning' | 'info'  (default: 'info')
 * duration: auto-dismiss ms (default 4000); 0 = no auto-dismiss
 *
 * ARIA:
 *   - toast-container: aria-live="polite" (assertive for errors, matching original)
 *   - Each toast: role="alert"
 */

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ----------------------------------------------------------------
 * Context
 * ---------------------------------------------------------------- */

const ToastContext = createContext(null);

/* ----------------------------------------------------------------
 * Icons (matching original toast.js ICONS map)
 * ---------------------------------------------------------------- */

const ICONS = {
  success: 'fa-solid fa-circle-check',
  error:   'fa-solid fa-circle-exclamation',
  warning: 'fa-solid fa-triangle-exclamation',
  info:    'fa-solid fa-circle-info',
};

/* ----------------------------------------------------------------
 * Individual Toast item (handles its own dismiss/exit animation)
 * ---------------------------------------------------------------- */

function ToastItem({ id, message, type, onDismiss }) {
  function dismiss() {
    onDismiss(id);
  }

  return (
    <div className={`toast toast--${type}`} role="alert">
      <span className={`toast__icon ${ICONS[type] || ICONS.info}`} aria-hidden="true" />
      <p className="toast__message">{message}</p>
      <button
        type="button"
        className="toast__close"
        aria-label="Close notification"
        onClick={dismiss}
      >
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------
 * ToastProvider — renders the container portal + manages toast list
 * ---------------------------------------------------------------- */

/**
 * @param {{ children: React.ReactNode }} props
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /**
   * Add a toast notification.
   * @param {{ message: string, type?: string, duration?: number }} opts
   */
  const showToast = useCallback(({ message, type = 'info', duration = 4000 }) => {
    const id = ++nextId.current;
    setToasts(prev => [...prev, { id, message, type, duration }]);

    if (duration > 0) {
      setTimeout(() => dismiss(id), duration);
    }
  }, [dismiss]);

  // Determine aria-live based on whether any error toast is visible
  const hasError = toasts.some(t => t.type === 'error');

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {/* Portal renders outside the React tree, appended to document.body */}
      {createPortal(
        <div
          className="toast-container"
          aria-live={hasError ? 'assertive' : 'polite'}
          aria-label="Notifications"
          role="region"
        >
          {toasts.map(toast => (
            <ToastItem
              key={toast.id}
              id={toast.id}
              message={toast.message}
              type={toast.type}
              onDismiss={dismiss}
            />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}

/* ----------------------------------------------------------------
 * useToast hook
 * ---------------------------------------------------------------- */

/**
 * Returns { showToast }. Must be used inside <ToastProvider>.
 * @returns {{ showToast: (opts: {message: string, type?: string, duration?: number}) => void }}
 */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() must be used inside <ToastProvider>.');
  }
  return ctx;
}
