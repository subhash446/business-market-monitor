import { useEffect, useState, useRef } from 'react';
import { getAuthConfig, loginWithGoogle } from '../../api/auth.api.js';

const DEFAULT_GSI_WIDTH = 376;
const MIN_GSI_WIDTH = 220;
const MAX_GSI_WIDTH = 400;

function clampGsiWidth(rawWidth) {
  if (!Number.isFinite(rawWidth) || rawWidth <= 0) {
    return DEFAULT_GSI_WIDTH;
  }
  return Math.min(MAX_GSI_WIDTH, Math.max(MIN_GSI_WIDTH, Math.floor(rawWidth)));
}

/**
 * GoogleSignInButton — Full-Width Aligned Google Identity Services Sign-In Component.
 *
 * Enforces:
 * - SSR safety (checks typeof window !== 'undefined').
 * - ResizeObserver container measurement capped cleanly to Google's 400px max width
 *   so the GSI button aligns edge-to-edge with form inputs and CTA buttons.
 * - Automatic script loading for https://accounts.google.com/gsi/client.
 * - Graceful fallback to disabled state when GOOGLE_CLIENT_ID is not configured.
 */
export function GoogleSignInButton({ onSuccess, onError, disabled = false }) {
  const [googleClientId, setGoogleClientId] = useState(() => {
    return typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID
      ? import.meta.env.VITE_GOOGLE_CLIENT_ID
      : '';
  });
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [buttonWidth, setButtonWidth] = useState(DEFAULT_GSI_WIDTH);

  const wrapperRef = useRef(null);
  const googleBtnContainerRef = useRef(null);
  const handleCredentialRef = useRef(null);

  // Fetch server auth config on mount
  useEffect(() => {
    let isMounted = true;
    getAuthConfig()
      .then((cfg) => {
        if (!isMounted) return;
        if (cfg?.googleClientId) {
          setGoogleClientId(cfg.googleClientId);
        }
      })
      .catch(() => {
        // Non-blocking fallback to env or unconfigured
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Measure container width dynamically with ResizeObserver for edge-to-edge alignment
  useEffect(() => {
    if (typeof window === 'undefined' || !wrapperRef.current) return;

    const updateWidth = () => {
      if (!wrapperRef.current) return;
      const measured = clampGsiWidth(wrapperRef.current.getBoundingClientRect().width || wrapperRef.current.offsetWidth);
      setButtonWidth((prev) => (Math.abs(prev - measured) >= 2 ? measured : prev));
    };

    updateWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }

    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(wrapperRef.current);

    return () => observer.disconnect();
  }, []);

  // Update latest credential callback ref
  handleCredentialRef.current = async (response) => {
    if (!response?.credential) {
      if (typeof onError === 'function') onError('No credential received from Google');
      return;
    }
    setAuthenticating(true);
    try {
      const tokens = await loginWithGoogle({ credential: response.credential });
      if (typeof onSuccess === 'function') {
        onSuccess(tokens);
      }
    } catch (err) {
      setAuthenticating(false);
      if (typeof onError === 'function') {
        onError(err.message || 'Google sign-in failed. Please try again.');
      }
    }
  };

  // Load Google script and render edge-to-edge aligned button
  useEffect(() => {
    if (typeof window === 'undefined' || !googleClientId) return;

    let script = document.getElementById('google-gsi-script');
    const initGoogle = () => {
      if (!window.google?.accounts?.id) return;
      try {
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (res) => handleCredentialRef.current?.(res),
        });

        if (googleBtnContainerRef.current) {
          const targetWidth = clampGsiWidth(
            wrapperRef.current?.getBoundingClientRect().width || buttonWidth
          );
          googleBtnContainerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(googleBtnContainerRef.current, {
            theme: 'filled_black',
            size: 'large',
            width: targetWidth,
            text: 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'left',
          });
        }
      } catch {
        // Ignore initialization errors in test or restricted environments
      }
    };

    if (!script) {
      script = document.createElement('script');
      script.id = 'google-gsi-script';
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    } else {
      initGoogle();
    }
  }, [googleClientId, buttonWidth]);

  // Google 'G' SVG icon
  const googleIcon = (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M17.64 9.20455C17.64 8.56636 17.5827 7.95273 17.4764 7.36364H9V10.845H13.8436C13.635 11.97 13.0009 12.9232 12.0477 13.5614V15.8195H14.9564C16.6582 14.2527 17.64 11.9455 17.64 9.20455Z"
        fill="#4285F4"
      />
      <path
        d="M9 18C11.43 18 13.4673 17.1941 14.9564 15.8195L12.0477 13.5614C11.2418 14.1014 10.2109 14.4205 9 14.4205C6.65591 14.4205 4.67182 12.8373 3.96409 10.71H0.957275V13.0418C2.43818 15.9832 5.48182 18 9 18Z"
        fill="#34A853"
      />
      <path
        d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957275C0.347727 6.17318 0 7.54773 0 9C0 10.4523 0.347727 11.8268 0.957275 13.0418L3.96409 10.71Z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.57955C10.3214 3.57955 11.5077 4.03364 12.4405 4.92545L15.0218 2.34409C13.4632 0.891818 11.4259 0 9 0C5.48182 0 2.43818 2.01682 0.957275 4.95818L3.96409 7.29C4.67182 5.16273 6.65591 3.57955 9 3.57955Z"
        fill="#EA4335"
      />
    </svg>
  );

  if (!googleClientId && !loading) {
    return (
      <div ref={wrapperRef} className="google-auth-container" data-testid="google-auth-container">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="btn btn--outline btn--full google-signin-btn google-signin-btn--disabled"
        >
          {googleIcon}
          <span>Continue with Google</span>
        </button>
        <span className="google-auth-hint">
          Google Sign-In awaiting client configuration
        </span>
      </div>
    );
  }

  return (
    <div ref={wrapperRef} className="google-auth-container" data-testid="google-auth-container">
      <div
        ref={googleBtnContainerRef}
        className="google-gsi-button-slot"
      >
        {/* Crisp fallback button before Google script finishes mounting */}
        <button
          type="button"
          className="btn btn--outline btn--full google-signin-btn"
          disabled={disabled || authenticating}
          onClick={() => {
            if (window.google?.accounts?.id?.prompt) {
              window.google.accounts.id.prompt();
            }
          }}
        >
          {googleIcon}
          <span>{authenticating ? 'Signing in with Google...' : 'Continue with Google'}</span>
        </button>
      </div>
    </div>
  );
}
