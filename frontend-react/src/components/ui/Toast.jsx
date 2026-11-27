/**
 * Toast notification system
 * Business Market Monitor — React frontend
 *
 * Portal renders safely outside the React tree when document.body exists.
 */

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const ToastContext = createContext(null);

const ICONS = {
  success: 'fa-solid fa-circle-check',
  error:   'fa-solid fa-circle-exclamation',
  warning: 'fa-solid fa-triangle-exclamation',
  info:    'fa-solid fa-circle-info',
};

function ToastItem({ id, message, type, onDismiss }) {
  return (
    <div className={`toast toast--${type}`} role="alert">
      <span className={`toast__icon ${ICONS[type] || ICONS.info}`} aria-hidden="true" />
      <p className="toast__message">{message}</p>
      <button
        type="button"
        className="toast__close"
        aria-label="Close notification"
        onClick={() => onDismiss(id)}
      >
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const activeTimers = timersRef.current;
    return () => {
      activeTimers.forEach((timerId) => window.clearTimeout(timerId));
      activeTimers.clear();
    };
  }, []);

  const showToast = useCallback(
    ({ message, type = 'info', duration = 4000 }) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, message, type, duration }]);

      if (duration > 0 && typeof window !== 'undefined') {
        const timerId = window.setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timerId);
      }
    },
    [dismiss]
  );

  const hasError = toasts.some((t) => t.type === 'error');
  const canPortal = typeof document !== 'undefined' && document.body;

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}

      {canPortal &&
        createPortal(
          <div
            className="toast-container"
            aria-live={hasError ? 'assertive' : 'polite'}
            aria-label="Notifications"
            role="region"
          >
            {toasts.map((toast) => (
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

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast() must be used inside <ToastProvider>.');
  }
  return ctx;
}
