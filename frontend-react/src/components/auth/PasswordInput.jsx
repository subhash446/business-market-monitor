import { useState } from 'react';

/**
 * PasswordInput — Accessible password input with crisp Show / Hide SVG eye toggle.
 */
export function PasswordInput({
  id,
  name,
  value,
  onChange,
  placeholder = 'Password',
  autoComplete = 'current-password',
  required = false,
  disabled = false,
  hasError = false,
  ariaDescribedBy,
  ariaRequired,
  inputRef,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input-wrap">
      <input
        ref={inputRef}
        type={visible ? 'text' : 'password'}
        id={id}
        name={name}
        className={`form-control password-input-field${hasError ? ' form-control--error' : ''}`}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        disabled={disabled}
        aria-required={ariaRequired}
        aria-describedby={ariaDescribedBy}
        value={value}
        onChange={onChange}
      />
      <button
        type="button"
        className="password-toggle-btn"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        disabled={disabled}
      >
        {visible ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
            <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
            <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
}
