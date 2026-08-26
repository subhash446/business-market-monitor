/**
 * Toast notifications
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §7.7, Doc 4 §10.8 — js/components/toast.js
 *
 * Usage:
 *   import { showToast } from '/js/components/toast.js';
 *   showToast({ message: 'Saved!', type: 'success' });
 */

/* ----------------------------------------------------------------
 * CONTAINER (created once, appended to <body>)
 * ---------------------------------------------------------------- */

let container = null;

function getContainer() {
  if (container && document.body.contains(container)) return container;

  container = document.createElement('div');
  container.className       = 'toast-container';
  container.setAttribute('aria-live', 'polite');
  container.setAttribute('aria-label', 'Notifications');
  container.setAttribute('role', 'region');
  document.body.appendChild(container);
  return container;
}

/* ----------------------------------------------------------------
 * TOAST ICONS
 * ---------------------------------------------------------------- */

const ICONS = {
  success: 'fa-solid fa-circle-check',
  error:   'fa-solid fa-circle-exclamation',
  warning: 'fa-solid fa-triangle-exclamation',
  info:    'fa-solid fa-circle-info',
};

/* ----------------------------------------------------------------
 * showToast
 * ---------------------------------------------------------------- */

/**
 * Display a toast notification.
 *
 * @param {Object}  options
 * @param {string}  options.message          — notification text (required)
 * @param {'success'|'error'|'warning'|'info'} [options.type='info']
 * @param {number}  [options.duration=4000]  — auto-dismiss ms; 0 = no auto-dismiss
 */
export function showToast({ message, type = 'info', duration = 4000 }) {
  const c = getContainer();

  // Override ARIA live for errors (assertive)
  if (type === 'error') {
    c.setAttribute('aria-live', 'assertive');
  } else {
    c.setAttribute('aria-live', 'polite');
  }

  // Build toast element
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.setAttribute('role', 'alert');

  // Icon
  const iconEl = document.createElement('span');
  iconEl.className = `toast__icon ${ICONS[type] || ICONS.info}`;
  iconEl.setAttribute('aria-hidden', 'true');
  toast.appendChild(iconEl);

  // Message — textContent only (XSS rule)
  const msgEl = document.createElement('p');
  msgEl.className   = 'toast__message';
  msgEl.textContent = message;
  toast.appendChild(msgEl);

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.type      = 'button';
  closeBtn.className = 'toast__close';
  closeBtn.setAttribute('aria-label', 'Close notification');

  const closeIcon = document.createElement('i');
  closeIcon.className     = 'fa-solid fa-xmark';
  closeIcon.setAttribute('aria-hidden', 'true');
  closeBtn.appendChild(closeIcon);
  toast.appendChild(closeBtn);

  // Dismiss logic
  function dismiss() {
    toast.classList.add('toast--exiting');
    // Remove after animation
    const onEnd = () => {
      toast.removeEventListener('animationend', onEnd);
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    };
    toast.addEventListener('animationend', onEnd);
    // Fallback removal (reduced-motion / no animation)
    setTimeout(() => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 400);
  }

  closeBtn.addEventListener('click', dismiss);

  if (duration > 0) {
    setTimeout(dismiss, duration);
  }

  c.appendChild(toast);
}
