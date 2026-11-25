import { useEffect, useRef } from 'react';

const OTP_LENGTH = 6;

/**
 * OtpInput — 6-Box Segmented Numeric OTP Verification Component.
 *
 * Supports:
 * - Auto-advance when typing digits
 * - Backspace navigation to previous box
 * - Left / Right Arrow key navigation
 * - Full 6-digit clipboard paste (onPaste) & mobile one-time-code autofill
 * - SSR-safe rendering with tabular-nums styling
 */
export function OtpInput({
  id = 'otp-input',
  value = '',
  onChange,
  disabled = false,
  autoFocus = false,
  hasError = false,
  ariaLabel = '6-digit verification code',
}) {
  const inputRefs = useRef([]);
  const normalized = String(value || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
  const digits = Array.from({ length: OTP_LENGTH }, (_, idx) => normalized[idx] || '');

  useEffect(() => {
    if (autoFocus && typeof window !== 'undefined') {
      inputRefs.current[0]?.focus();
    }
  }, [autoFocus]);

  function emit(nextDigits) {
    if (typeof onChange === 'function') {
      onChange(nextDigits.join('').slice(0, OTP_LENGTH));
    }
  }

  function handleChange(index, e) {
    const raw = e.target.value.replace(/\D/g, '');
    if (!raw) {
      const next = [...digits];
      next[index] = '';
      emit(next);
      return;
    }

    // Multi-character entry (e.g. mobile SMS autofill or paste into field)
    if (raw.length > 1) {
      const next = [...digits];
      const chars = raw.slice(0, OTP_LENGTH).split('');
      const start = raw.length >= OTP_LENGTH ? 0 : index;
      chars.forEach((ch, offset) => {
        if (start + offset < OTP_LENGTH) {
          next[start + offset] = ch;
        }
      });
      emit(next);
      const nextFocus = Math.min(start + chars.length, OTP_LENGTH - 1);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    const next = [...digits];
    next[index] = raw;
    emit(next);
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace') {
      if (digits[index]) {
        e.preventDefault();
        const next = [...digits];
        next[index] = '';
        emit(next);
      } else if (index > 0) {
        e.preventDefault();
        const next = [...digits];
        next[index - 1] = '';
        emit(next);
        inputRefs.current[index - 1]?.focus();
      }
      return;
    }

    if (e.key === 'ArrowLeft' && index > 0) {
      e.preventDefault();
      inputRefs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      e.preventDefault();
      inputRefs.current[index + 1]?.focus();
    }
  }

  function handlePaste(e) {
    e.preventDefault();
    const pasted = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!pasted) return;
    const next = Array.from({ length: OTP_LENGTH }, (_, idx) => pasted[idx] || '');
    emit(next);
    const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIdx]?.focus();
  }

  return (
    <div
      className="otp-boxes"
      role="group"
      aria-label={ariaLabel}
      data-testid="otp-boxes"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            inputRefs.current[index] = el;
          }}
          id={index === 0 ? id : `${id}-${index}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={OTP_LENGTH}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          disabled={disabled}
          value={digit}
          className={`otp-box${digit ? ' otp-box--filled' : ''}${hasError ? ' otp-box--error' : ''}`}
          onChange={(e) => handleChange(index, e)}
          onKeyDown={(e) => handleKeyDown(index, e)}
          onPaste={handlePaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
