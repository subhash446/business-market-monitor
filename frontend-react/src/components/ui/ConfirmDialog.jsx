/**
 * ConfirmDialog — confirmation dialog component
 * Business Market Monitor — React frontend
 *
 * Wraps Modal.jsx with responsive native .modal__footer stacking on mobile (< 480px).
 */

import { Modal } from './Modal.jsx';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  id = 'bmm-confirm-dialog',
}) {
  function handleConfirm() {
    if (typeof onConfirm === 'function') onConfirm();
    if (typeof onClose === 'function') onClose();
  }

  const footer = (
    <>
      <button
        type="button"
        className="btn btn--ghost"
        onClick={onClose}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className={`btn ${danger ? 'btn--danger' : 'btn--primary'}`}
        onClick={handleConfirm}
      >
        {confirmLabel}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      id={id}
      footer={footer}
    >
      <p className="confirm-dialog__message">{message}</p>
    </Modal>
  );
}
