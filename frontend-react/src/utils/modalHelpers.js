/**
 * Safe modal interaction helpers — dismiss callbacks & backdrop/Escape guards.
 * Separated as a pure module so Modal interactions remain unit-testable
 * without requiring an external browser/DOM test dependency.
 */

/**
 * Invoke onClose only when it is a function.
 *
 * @param {unknown} onClose
 * @returns {boolean} True if onClose was invoked.
 */
export function safeInvokeClose(onClose) {
  if (typeof onClose === 'function') {
    onClose();
    return true;
  }
  return false;
}

/**
 * Handle Escape key dismissal safely.
 * Returns true if Escape was handled (whether or not onClose was callable).
 *
 * @param {{ key?: string } | null | undefined} event
 * @param {unknown} onClose
 * @returns {boolean}
 */
export function handleModalEscapeKey(event, onClose) {
  if (event?.key !== 'Escape') {
    return false;
  }
  safeInvokeClose(onClose);
  return true;
}

/**
 * Handle modal backdrop clicks safely — dismisses only when clicking the backdrop itself.
 *
 * @param {{ target?: unknown } | null | undefined} event
 * @param {unknown} backdropEl
 * @param {unknown} onClose
 * @returns {boolean} True if backdrop click invoked onClose.
 */
export function handleModalBackdropClick(event, backdropEl, onClose) {
  if (event?.target === backdropEl) {
    return safeInvokeClose(onClose);
  }
  return false;
}
