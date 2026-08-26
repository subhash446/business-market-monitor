/**
 * Empty-state component
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §7.9, Doc 4 §10.14 — js/components/emptyState.js
 *
 * Usage:
 *   import { createEmptyState } from '/js/components/emptyState.js';
 *
 *   container.appendChild(createEmptyState({
 *     icon:    'fa-solid fa-inbox',
 *     title:   'No materials yet',
 *     message: 'Add a material to start tracking prices.',
 *     action:  { label: 'Add Material', onClick: () => { ... } },
 *   }));
 */

/**
 * Build an empty-state DOM node.
 *
 * @param {Object}    options
 * @param {string}    options.icon     — Font Awesome class e.g. 'fa-solid fa-inbox'
 * @param {string}    options.title    — heading text
 * @param {string}    options.message  — body text
 * @param {{ label: string, onClick: Function }} [options.action] — optional CTA button
 * @returns {HTMLElement}
 */
export function createEmptyState({ icon, title, message, action }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';

  // Icon
  if (icon) {
    const iconEl = document.createElement('div');
    iconEl.className = 'empty-state__icon';
    const i = document.createElement('i');
    i.className = icon;
    i.setAttribute('aria-hidden', 'true');
    iconEl.appendChild(i);
    wrapper.appendChild(iconEl);
  }

  // Title
  const titleEl = document.createElement('h3');
  titleEl.className   = 'empty-state__title';
  titleEl.textContent = title; // textContent — XSS safe
  wrapper.appendChild(titleEl);

  // Message
  if (message) {
    const msgEl = document.createElement('p');
    msgEl.className   = 'empty-state__message';
    msgEl.textContent = message;
    wrapper.appendChild(msgEl);
  }

  // CTA button
  if (action) {
    const actionDiv = document.createElement('div');
    actionDiv.className = 'empty-state__action';

    const btn = document.createElement('button');
    btn.type        = 'button';
    btn.className   = 'btn btn--primary btn--sm';
    btn.textContent = action.label;
    if (typeof action.onClick === 'function') {
      btn.addEventListener('click', action.onClick);
    }

    actionDiv.appendChild(btn);
    wrapper.appendChild(actionDiv);
  }

  return wrapper;
}

/**
 * Render an empty state into a container, clearing its current content.
 * @param {HTMLElement} container
 * @param {Object} options — same as createEmptyState
 */
export function renderEmptyState(container, options) {
  if (!container) return;
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(createEmptyState(options));
}
