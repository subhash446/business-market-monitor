/**
 * ConfirmDialog — confirmation dialog component
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/js/components/confirm.js
 * Wraps Modal.jsx, preserving identical button styles and behavior.
 *
 * Props:
 *   isOpen        — boolean
 *   onClose       — called on cancel / close button / Escape
 *   onConfirm     — called when confirm button is clicked
 *   title         — dialog heading
 *   message       — body message text
 *   confirmLabel  — confirm button text (default 'Confirm')
 *   cancelLabel   — cancel button text (default 'Cancel')
 *   danger        — boolean: use btn--danger for confirm button (default false)
 *
 * Usage:
 *   const [open, setOpen] = useState(false);
 *   <ConfirmDialog
 *     isOpen={open}
 *     title="Delete Rule"
 *     message="This cannot be undone."
 *     danger
 *     confirmLabel="Delete"
 *     onConfirm={() => { handleDelete(); setOpen(false); }}
 *     onClose={() => setOpen(false)}
 *   />
 */

import { Modal } from './Modal.jsx';

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  danger       = false,
}) {
  function handleConfirm() {
    if (typeof onConfirm === 'function') onConfirm();
    onClose();
  }

  const footer = (
    <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
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
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      id="bmm-confirm-dialog"
      footer={footer}
    >
      <p
        style={{
          color:      'var(--color-text-secondary)',
          lineHeight: 'var(--leading-relaxed)',
          fontSize:   'var(--text-sm)',
        }}
      >
        {message}
      </p>
    </Modal>
  );
}
