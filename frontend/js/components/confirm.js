/**
 * Confirmation dialog — wraps modal.js
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §7.6 — js/components/confirm.js
 *
 * Usage:
 *   import { confirmAction } from '/js/components/confirm.js';
 *   confirmAction({
 *     title:        'Delete Rule',
 *     message:      'This cannot be undone.',
 *     confirmLabel: 'Delete',
 *     danger:       true,
 *     onConfirm:    () => { ... },
 *   });
 */

import { createModal, openModal, closeModal, destroyModal } from './modal.js';

const CONFIRM_MODAL_ID = 'bmm-confirm-dialog';

/**
 * Show a confirmation dialog.
 *
 * @param {Object}   options
 * @param {string}   options.title           — dialog heading
 * @param {string}   options.message         — body message text
 * @param {string}   [options.confirmLabel='Confirm']   — confirm button label
 * @param {string}   [options.cancelLabel='Cancel']     — cancel button label
 * @param {boolean}  [options.danger=false]  — use danger button style for confirm
 * @param {Function} options.onConfirm       — called on confirm click
 * @param {Function} [options.onCancel]      — called on cancel/close (optional)
 */
export function confirmAction({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  danger       = false,
  onConfirm,
  onCancel,
}) {
  // Clean up any previous confirm dialog
  destroyModal(CONFIRM_MODAL_ID);

  // Body: message paragraph
  const bodyEl  = document.createElement('p');
  bodyEl.style.color = 'var(--color-text-secondary)';
  bodyEl.style.lineHeight = 'var(--leading-relaxed)';
  bodyEl.style.fontSize = 'var(--text-sm)';
  bodyEl.textContent = message; // textContent — not innerHTML

  // Footer: cancel + confirm buttons
  const footerEl = document.createElement('div');
  footerEl.style.display = 'flex';
  footerEl.style.gap     = 'var(--space-3)';

  const cancelBtn = document.createElement('button');
  cancelBtn.type      = 'button';
  cancelBtn.className = 'btn btn--ghost';
  cancelBtn.textContent = cancelLabel;

  const confirmBtn = document.createElement('button');
  confirmBtn.type      = 'button';
  confirmBtn.className = `btn ${danger ? 'btn--danger' : 'btn--primary'}`;
  confirmBtn.textContent = confirmLabel;

  footerEl.appendChild(cancelBtn);
  footerEl.appendChild(confirmBtn);

  createModal({
    id:      CONFIRM_MODAL_ID,
    title,
    content: bodyEl,
    footer:  footerEl,
    size:    'sm',
  });

  // Wire buttons
  cancelBtn.addEventListener('click', () => {
    closeModal(CONFIRM_MODAL_ID);
    destroyModal(CONFIRM_MODAL_ID);
    if (typeof onCancel === 'function') onCancel();
  });

  confirmBtn.addEventListener('click', () => {
    closeModal(CONFIRM_MODAL_ID);
    destroyModal(CONFIRM_MODAL_ID);
    if (typeof onConfirm === 'function') onConfirm();
  });

  openModal(CONFIRM_MODAL_ID);
}
