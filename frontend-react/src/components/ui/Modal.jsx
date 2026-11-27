/**
 * Modal — generic accessible dialog component
 * Business Market Monitor — React frontend
 *
 * Renders via guarded React Portal directly under document.body.
 * Focus-trap, Escape-to-close, backdrop-click-to-close, and body scroll lock.
 */

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  handleModalBackdropClick,
  handleModalEscapeKey,
  safeInvokeClose,
} from '../../utils/modalHelpers.js';

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
    (el) => !el.closest('[hidden]') && el.offsetParent !== null
  );
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  id = 'bmm-modal',
}) {
  const backdropRef = useRef(null);
  const previousFocusRef = useRef(null);

  const sizeClass = size === 'lg' ? ' modal--lg' : size === 'sm' ? ' modal--sm' : '';
  const canDismiss = typeof onClose === 'function';

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined' || !document.body) return;

    previousFocusRef.current = document.activeElement;
    document.body.style.overflow = 'hidden';

    const raf = window.requestAnimationFrame(() => {
      if (!backdropRef.current) return;
      const focusable = getFocusable(backdropRef.current);
      if (focusable.length > 0) focusable[0].focus();
    });

    return () => {
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = '';
      if (
        previousFocusRef.current &&
        typeof previousFocusRef.current.focus === 'function'
      ) {
        previousFocusRef.current.focus();
        previousFocusRef.current = null;
      }
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || typeof document === 'undefined') return;

    function handleKeyDown(e) {
      if (handleModalEscapeKey(e, onClose)) return;
      if (e.key === 'Tab' && backdropRef.current) {
        const focusable = getFocusable(backdropRef.current);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || typeof document === 'undefined' || !document.body) return null;

  return createPortal(
    <div
      ref={backdropRef}
      className="modal-backdrop modal-backdrop--open"
      id={`${id}-backdrop`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      onClick={(e) => handleModalBackdropClick(e, backdropRef.current, onClose)}
    >
      <div className={`modal${sizeClass}`} id={id}>
        <div className="modal__header">
          <h2 className="modal__title" id={`${id}-title`}>{title}</h2>
          {canDismiss && (
            <button
              type="button"
              className="modal__close"
              aria-label="Close dialog"
              onClick={() => safeInvokeClose(onClose)}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="modal__body" id={`${id}-body`}>
          {children}
        </div>

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
