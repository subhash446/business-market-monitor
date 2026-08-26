/**
 * Error-state component
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §7.10, Doc 4 §10.15 — js/components/errorState.js
 *
 * Usage:
 *   import { createErrorState } from '/js/components/errorState.js';
 *
 *   container.appendChild(createErrorState({
 *     title:   'Failed to load materials',
 *     message: 'Something went wrong. Please try again.',
 *     retry:   () => loadMaterials(),
 *   }));
 */

/**
 * Build an error-state DOM node.
 *
 * @param {Object}    options
 * @param {string}    [options.title='Something went wrong']
 * @param {string}    [options.message='Please try again.']
 * @param {Function}  [options.retry]  — callback for "Try again" button (optional)
 * @returns {HTMLElement}
 */
export function createErrorState({
  title   = 'Something went wrong',
  message = 'Please try again.',
  retry,
} = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'error-state';

  // Icon
  const iconEl = document.createElement('div');
  iconEl.className = 'error-state__icon';
  const i = document.createElement('i');
  i.className = 'fa-solid fa-circle-exclamation';
  i.setAttribute('aria-hidden', 'true');
  iconEl.appendChild(i);
  wrapper.appendChild(iconEl);

  // Title
  const titleEl = document.createElement('h3');
  titleEl.className   = 'error-state__title';
  titleEl.textContent = title;
  wrapper.appendChild(titleEl);

  // Message
  if (message) {
    const msgEl = document.createElement('p');
    msgEl.className   = 'error-state__message';
    msgEl.textContent = message;
    wrapper.appendChild(msgEl);
  }

  // Retry button
  if (typeof retry === 'function') {
    const actionDiv = document.createElement('div');
    actionDiv.className = 'error-state__action';

    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'btn btn--secondary btn--sm';
    btn.textContent = 'Try again';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-rotate-right';
    icon.setAttribute('aria-hidden', 'true');
    btn.prepend(icon);

    btn.addEventListener('click', retry);

    actionDiv.appendChild(btn);
    wrapper.appendChild(actionDiv);
  }

  return wrapper;
}

/**
 * Render an error state into a container, clearing its current content.
 * @param {HTMLElement} container
 * @param {Object} options — same as createErrorState
 */
export function renderErrorState(container, options = {}) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(createErrorState(options));
}
