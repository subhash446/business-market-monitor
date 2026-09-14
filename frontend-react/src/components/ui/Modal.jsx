/**
 * Modal — generic accessible dialog component
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/js/components/modal.js
 * Preserves identical CSS classes, aria attributes, focus-trap,
 * Escape-to-close, backdrop-click-to-close, and body scroll lock.
 *
 * Implemented as a React Portal so it renders outside the normal
 * component tree, directly under document.body.
 *
 * Props:
 *   isOpen    — boolean: controls visibility
 *   onClose   — function: called when user dismisses (Escape / close btn / backdrop)
 *   title     — string: modal heading text
 *   children  — modal body content
 *   footer    — ReactNode: rendered inside .modal__footer (optional)
 *   size      — 'sm' | 'md' | 'lg'  (default 'md')
 *   id        — string: base for aria IDs (default 'bmm-modal')
 *
 * Focus trap (Doc 3 §7.5):
 *   Tabs cycle through focusable elements inside the modal.
 *   Focus returns to the previously-focused element on close.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

/* Focusable element selector — mirrors dom.js getFocusableElements() */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(container) {
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    el => !el.closest('[hidden]') && el.offsetParent !== null
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  id   = 'bmm-modal',
}) {
  const backdropRef      = useRef(null);
  const previousFocusRef = useRef(null);

  // Modal size CSS modifier
  const sizeClass = size === 'lg' ? ' modal--lg' : size === 'sm' ? ' modal--sm' : '';

  /* ------------------------------------------------------------------
   * Open / close effects
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!isOpen) return;

    // Save current focus to restore on close
    previousFocusRef.current = document.activeElement;

    // Lock body scroll (same as modal.js openModal)
    document.body.style.overflow = 'hidden';

    // Move focus into modal on next frame
    const raf = requestAnimationFrame(() => {
      if (!backdropRef.current) return;
      const focusable = getFocusable(backdropRef.current);
      if (focusable.length > 0) focusable[0].focus();
    });

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = '';
      // Restore focus
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === 'function'
      ) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen]);

  /* ------------------------------------------------------------------
   * Keyboard handling: Escape + focus trap
   * ------------------------------------------------------------------ */
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && backdropRef.current) {
        const focusable = getFocusable(backdropRef.current);
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
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="modal-backdrop modal-backdrop--open"
      id={`${id}-backdrop`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onClick={e => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className={`modal${sizeClass}`} id={id}>
        {/* Header */}
        <div className="modal__header">
          <h2 className="modal__title" id={`${id}-title`}>{title}</h2>
          <button
            type="button"
            className="modal__close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="modal__body" id={`${id}-body`}>
          {children}
        </div>

        {/* Footer (optional) */}
        {footer && (
          <div className="modal__footer">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
