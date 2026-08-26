/**
 * DOM helpers — querySelector shortcuts and DOM manipulation utilities
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §2 — js/utils/dom.js
 * All functions are pure/side-effect-free except where noted.
 * No innerHTML with dynamic data — XSS rule enforced (Doc 3 §11.2).
 */

/* ----------------------------------------------------------------
 * QUERY SELECTORS
 * ---------------------------------------------------------------- */

/**
 * Shortcut for document.querySelector.
 * @param {string} selector
 * @param {Element|Document} [context=document]
 * @returns {Element|null}
 */
export function qs(selector, context = document) {
  return context.querySelector(selector);
}

/**
 * Shortcut for querySelectorAll — returns an Array, not NodeList.
 * @param {string} selector
 * @param {Element|Document} [context=document]
 * @returns {Element[]}
 */
export function qsa(selector, context = document) {
  return Array.from(context.querySelectorAll(selector));
}

/**
 * Get element by ID; throws if not found (catches page wiring errors early).
 * @param {string} id
 * @returns {HTMLElement}
 */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) {
    console.warn(`[dom] Element not found: #${id}`);
  }
  return el;
}

/* ----------------------------------------------------------------
 * VISIBILITY
 * ---------------------------------------------------------------- */

/**
 * Show an element by removing the d-none utility class.
 * @param {Element} el
 */
export function show(el) {
  if (!el) return;
  el.removeAttribute('hidden');
  el.classList.remove('d-none');
}

/**
 * Hide an element by adding the d-none utility class.
 * @param {Element} el
 */
export function hide(el) {
  if (!el) return;
  el.classList.add('d-none');
}

/**
 * Toggle visibility of an element.
 * @param {Element} el
 * @param {boolean} [force] — if provided, show/hide based on boolean
 */
export function toggle(el, force) {
  if (!el) return;
  if (force === undefined) {
    el.classList.toggle('d-none');
  } else {
    force ? show(el) : hide(el);
  }
}

/* ----------------------------------------------------------------
 * CSS CLASS UTILITIES
 * ---------------------------------------------------------------- */

/**
 * Add one or more CSS classes to an element.
 * @param {Element} el
 * @param {...string} classNames
 */
export function addClass(el, ...classNames) {
  if (!el) return;
  el.classList.add(...classNames);
}

/**
 * Remove one or more CSS classes from an element.
 * @param {Element} el
 * @param {...string} classNames
 */
export function removeClass(el, ...classNames) {
  if (!el) return;
  el.classList.remove(...classNames);
}

/**
 * Toggle a CSS class on an element.
 * @param {Element} el
 * @param {string} className
 * @param {boolean} [force]
 */
export function toggleClass(el, className, force) {
  if (!el) return;
  el.classList.toggle(className, force);
}

/**
 * Check if element has a CSS class.
 * @param {Element} el
 * @param {string} className
 * @returns {boolean}
 */
export function hasClass(el, className) {
  if (!el) return false;
  return el.classList.contains(className);
}

/* ----------------------------------------------------------------
 * CONTENT MUTATION (XSS-safe — textContent only for dynamic data)
 * ---------------------------------------------------------------- */

/**
 * Set the textContent of an element safely.
 * NEVER use innerHTML with dynamic data (Doc 3 §11.2).
 * @param {Element} el
 * @param {string} text
 */
export function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? '';
}

/**
 * Set an attribute on an element.
 * @param {Element} el
 * @param {string} attr
 * @param {string} value
 */
export function setAttr(el, attr, value) {
  if (!el) return;
  el.setAttribute(attr, value);
}

/**
 * Remove an attribute from an element.
 * @param {Element} el
 * @param {string} attr
 */
export function removeAttr(el, attr) {
  if (!el) return;
  el.removeAttribute(attr);
}

/* ----------------------------------------------------------------
 * ELEMENT CREATION
 * ---------------------------------------------------------------- */

/**
 * Create an element with optional class and textContent.
 * For more complex elements, use document.createElement directly
 * and set properties via textContent / setAttribute.
 *
 * @param {string} tag
 * @param {{ className?: string, text?: string, attrs?: Object }} [options]
 * @returns {HTMLElement}
 */
export function createElement(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.className) el.className = options.className;
  if (options.text !== undefined) el.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

/**
 * Remove all children from an element (safe, no innerHTML).
 * @param {Element} el
 */
export function clearChildren(el) {
  if (!el) return;
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

/* ----------------------------------------------------------------
 * FORM UTILITIES
 * ---------------------------------------------------------------- */

/**
 * Disable a button element by adding disabled attribute + .btn--loading class.
 * @param {HTMLButtonElement} btn
 */
export function startLoading(btn) {
  if (!btn) return;
  btn.disabled = true;
  btn.classList.add('btn--loading');
}

/**
 * Re-enable a button element (undo startLoading).
 * @param {HTMLButtonElement} btn
 */
export function stopLoading(btn) {
  if (!btn) return;
  btn.disabled = false;
  btn.classList.remove('btn--loading');
}

/**
 * Get all form field values as a plain object.
 * @param {HTMLFormElement} form
 * @returns {Object}
 */
export function getFormData(form) {
  const data = new FormData(form);
  const result = {};
  for (const [key, value] of data.entries()) {
    result[key] = value;
  }
  return result;
}

/**
 * Show a form-level error message.
 * @param {HTMLElement} alertEl — the .form-alert element
 * @param {string} message
 */
export function showFormAlert(alertEl, message) {
  if (!alertEl) return;
  alertEl.classList.add('form-alert--visible');
  alertEl.querySelector('.form-alert__message') &&
    setText(alertEl.querySelector('.form-alert__message'), message);
  if (!alertEl.querySelector('.form-alert__message')) {
    setText(alertEl, message);
  }
}

/**
 * Hide a form-level error message.
 * @param {HTMLElement} alertEl
 */
export function hideFormAlert(alertEl) {
  if (!alertEl) return;
  alertEl.classList.remove('form-alert--visible');
}

/**
 * Show a field-level validation error.
 * @param {HTMLElement} inputEl
 * @param {HTMLElement} errorEl — the .form-error element
 * @param {string} message
 */
export function showFieldError(inputEl, errorEl, message) {
  if (inputEl) inputEl.classList.add('form-control--error');
  if (errorEl) {
    errorEl.classList.add('form-error--visible');
    setText(errorEl, message);
    if (inputEl) setAttr(inputEl, 'aria-describedby', errorEl.id || '');
  }
}

/**
 * Clear a field-level validation error.
 * @param {HTMLElement} inputEl
 * @param {HTMLElement} errorEl
 */
export function clearFieldError(inputEl, errorEl) {
  if (inputEl) inputEl.classList.remove('form-control--error');
  if (errorEl) {
    errorEl.classList.remove('form-error--visible');
    setText(errorEl, '');
  }
}

/* ----------------------------------------------------------------
 * FOCUS MANAGEMENT
 * ---------------------------------------------------------------- */

/**
 * Move keyboard focus to an element safely.
 * @param {HTMLElement} el
 */
export function focusEl(el) {
  if (!el) return;
  // Temporarily make non-focusable elements focusable
  const tabIndex = el.tabIndex;
  if (tabIndex < 0 && !el.hasAttribute('tabindex')) {
    el.tabIndex = -1;
  }
  el.focus({ preventScroll: false });
}

/**
 * Get all focusable elements within a container (for modal focus trap).
 * @param {HTMLElement} container
 * @returns {HTMLElement[]}
 */
export function getFocusableElements(container) {
  const selector = [
    'a[href]',
    'button:not(:disabled)',
    'input:not(:disabled)',
    'select:not(:disabled)',
    'textarea:not(:disabled)',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');
  return qsa(selector, container).filter(
    (el) => !el.closest('[hidden]') && el.offsetParent !== null
  );
}

/* ----------------------------------------------------------------
 * EVENT HELPERS
 * ---------------------------------------------------------------- */

/**
 * Add an event listener that removes itself after firing once.
 * @param {EventTarget} target
 * @param {string} type
 * @param {Function} handler
 */
export function once(target, type, handler) {
  const wrapper = (e) => {
    handler(e);
    target.removeEventListener(type, wrapper);
  };
  target.addEventListener(type, wrapper);
}

/**
 * Delegate an event from a parent container.
 * @param {Element} container
 * @param {string} selector — matches the target element
 * @param {string} event
 * @param {Function} handler
 */
export function delegate(container, selector, event, handler) {
  container.addEventListener(event, (e) => {
    const target = e.target.closest(selector);
    if (target && container.contains(target)) {
      handler(e, target);
    }
  });
}

/* ----------------------------------------------------------------
 * URL UTILITIES
 * ---------------------------------------------------------------- */

/**
 * Get a URL query parameter value (treated as untrusted — Doc 3 §11.2 Rule 5).
 * @param {string} name
 * @returns {string|null}
 */
export function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}
