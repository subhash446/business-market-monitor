/**
 * Generic modal dialog — focus-trapped, keyboard-accessible
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §7.5, Doc 4 §10.7 — js/components/modal.js
 *
 * Usage:
 *   import { createModal, openModal, closeModal } from '/js/components/modal.js';
 *
 *   createModal({
 *     id:      'my-modal',
 *     title:   'Confirm Action',
 *     content: formElement,
 *     footer:  footerElement,
 *   });
 *   openModal('my-modal');
 */

import { getFocusableElements } from '../utils/dom.js';

/** @type {Map<string, { backdrop: HTMLElement, previousFocus: HTMLElement|null }>} */
const modals = new Map();

/* ----------------------------------------------------------------
 * createModal
 * ---------------------------------------------------------------- */

/**
 * Build a modal DOM structure and append it to <body>.
 * Call once; use openModal/closeModal to show/hide.
 *
 * @param {Object}          options
 * @param {string}          options.id           — unique modal ID
 * @param {string}          options.title        — modal heading text
 * @param {HTMLElement|string} options.content   — body content (element or text)
 * @param {HTMLElement}     [options.footer]     — footer element (optional)
 * @param {string}          [options.size='md']  — 'sm'|'md'|'lg'
 * @returns {HTMLElement}   backdrop element
 */
export function createModal({ id, title, content, footer, size = 'md' }) {
  // Remove existing modal with this ID if any
  destroyModal(id);

  // Backdrop
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id        = `${id}-backdrop`;
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-labelledby', `${id}-title`);

  // Modal box
  const modal = document.createElement('div');
  modal.className = `modal${size === 'lg' ? ' modal--lg' : size === 'sm' ? ' modal--sm' : ''}`;
  modal.id = id;

  // Header
  const header = document.createElement('div');
  header.className = 'modal__header';

  const titleEl = document.createElement('h2');
  titleEl.className = 'modal__title';
  titleEl.id        = `${id}-title`;
  titleEl.textContent = title; // textContent only

  const closeBtn = document.createElement('button');
  closeBtn.type      = 'button';
  closeBtn.className = 'modal__close';
  closeBtn.setAttribute('aria-label', 'Close dialog');
  const closeIcon = document.createElement('i');
  closeIcon.className = 'fa-solid fa-xmark';
  closeIcon.setAttribute('aria-hidden', 'true');
  closeBtn.appendChild(closeIcon);

  header.appendChild(titleEl);
  header.appendChild(closeBtn);

  // Body
  const body = document.createElement('div');
  body.className = 'modal__body';
  body.id        = `${id}-body`;

  if (content instanceof HTMLElement) {
    body.appendChild(content);
  } else if (typeof content === 'string') {
    // Static/authored strings only — not API data
    body.textContent = content;
  }

  modal.appendChild(header);
  modal.appendChild(body);

  // Footer (optional)
  if (footer instanceof HTMLElement) {
    const footerWrapper = document.createElement('div');
    footerWrapper.className = 'modal__footer';
    footerWrapper.appendChild(footer);
    modal.appendChild(footerWrapper);
  }

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  // Wire close button
  closeBtn.addEventListener('click', () => closeModal(id));

  // Close on backdrop click (outside modal box)
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) closeModal(id);
  });

  modals.set(id, { backdrop, previousFocus: null });
  return backdrop;
}

/* ----------------------------------------------------------------
 * openModal
 * ---------------------------------------------------------------- */

/**
 * Show a modal (must have been created with createModal first).
 * Traps focus inside; saves previous focus for restore on close.
 * @param {string} id
 */
export function openModal(id) {
  const entry = modals.get(id);
  if (!entry) {
    console.warn(`[modal] openModal: no modal with id "${id}"`);
    return;
  }

  entry.previousFocus = document.activeElement;
  entry.backdrop.classList.add('modal-backdrop--open');

  // Prevent body scroll
  document.body.style.overflow = 'hidden';

  // Move focus to first focusable element inside modal
  requestAnimationFrame(() => {
    const focusable = getFocusableElements(entry.backdrop);
    if (focusable.length > 0) {
      focusable[0].focus();
    }
  });

  // Keyboard handling: Escape + focus trap
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      closeModal(id);
      return;
    }
    if (e.key === 'Tab') {
      trapFocus(e, entry.backdrop);
    }
  };

  entry.onKeyDown = onKeyDown;
  document.addEventListener('keydown', onKeyDown);
}

/* ----------------------------------------------------------------
 * closeModal
 * ---------------------------------------------------------------- */

/**
 * Hide a modal and restore focus to the previously-focused element.
 * @param {string} id
 */
export function closeModal(id) {
  const entry = modals.get(id);
  if (!entry) return;

  entry.backdrop.classList.remove('modal-backdrop--open');
  document.body.style.overflow = '';

  if (entry.onKeyDown) {
    document.removeEventListener('keydown', entry.onKeyDown);
    entry.onKeyDown = null;
  }

  // Restore focus
  if (entry.previousFocus && typeof entry.previousFocus.focus === 'function') {
    entry.previousFocus.focus();
    entry.previousFocus = null;
  }
}

/* ----------------------------------------------------------------
 * destroyModal
 * ---------------------------------------------------------------- */

/**
 * Remove a modal from the DOM and clean up.
 * @param {string} id
 */
export function destroyModal(id) {
  const entry = modals.get(id);
  if (!entry) return;

  closeModal(id);

  if (entry.backdrop.parentNode) {
    entry.backdrop.parentNode.removeChild(entry.backdrop);
  }
  modals.delete(id);
}

/* ----------------------------------------------------------------
 * getModalBody
 * ---------------------------------------------------------------- */

/**
 * Get the modal body element so page code can populate/replace content.
 * @param {string} id
 * @returns {HTMLElement|null}
 */
export function getModalBody(id) {
  return document.getElementById(`${id}-body`);
}

/* ----------------------------------------------------------------
 * INTERNAL: focus trap (Doc 3 §7.5)
 * ---------------------------------------------------------------- */

function trapFocus(e, container) {
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last  = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
