/**
 * AuthContext — React authentication state provider
 * Business Market Monitor — React frontend
 *
 * Provides:
 *   user           — decoded JWT payload { userId, email, businessId } | null
 *   business       — full business object from GET /business | null
 *   isAuthenticated — Boolean (token present in localStorage)
 *   hasBusinessProfile — Boolean (businessId !== null in user payload)
 *   loading        — true during initial session resolution on mount
 *   login(accessToken, refreshToken) — persist tokens + update state
 *   logout()       — clear all tokens + navigate to /login
 *   setBusiness(business) — cache business data + update state
 *   clearBusiness()       — clear business cache (after PUT /business)
 *
 * STORAGE CONTRACT (preserved exactly from Vanilla JS auth.js):
 *   localStorage:   bmm_access_token, bmm_refresh_token
 *   sessionStorage: bmm_user, bmm_business
 *
 * SESSION-EXPIRY INTEGRATION:
 *   api/client.js exposes setSessionExpiredHandler(fn).
 *   AuthContext registers its logout() function as the handler so that
 *   automatic token refresh failures trigger a clean React-aware logout
 *   (rather than a hard window.location.replace in the middle of React renders).
 *   This is wired in the useEffect on mount.
 *
 * INITIAL LOAD BEHAVIOR:
 *   On mount, AuthContext reads localStorage for an existing token.
 *   If a token exists it decodes the user payload (sessionStorage cache first,
 *   then re-decode from the raw token for new-tab scenarios).
 *   It also hydrates business from sessionStorage if available.
 *   During this synchronous resolution, `loading` is true so ProtectedRoute
 *   can show a blank/spinner instead of a flash-redirect to /login.
 *
 * BUSINESS LOADING:
 *   AuthContext does NOT call GET /business automatically on mount.
 *   The business data is hydrated from sessionStorage cache on mount.
 *   Individual page components or the onboarding flow call setBusiness()
 *   after a successful GET /business or POST /business + refresh.
 *   This keeps AuthContext free of direct API calls.
 */

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAccessToken,
  getCurrentUser,
  getCachedBusiness,
  setCachedBusiness,
  clearBusinessCache,
  setTokens,
  clearTokens,
  isAuthenticated as checkIsAuthenticated,
  hasBusinessProfile as checkHasBusinessProfile,
} from '../auth/auth.js';
import { setSessionExpiredHandler } from '../api/client.js';

/* ----------------------------------------------------------------
 * Context shape (exported for type-checking in JSDoc)
 * ---------------------------------------------------------------- */

/**
 * @typedef {{
 *   user:               { userId: number, email: string, businessId: number|null } | null,
 *   business:           Object | null,
 *   isAuthenticated:    boolean,
 *   hasBusinessProfile: boolean,
 *   loading:            boolean,
 *   login:              (accessToken: string, refreshToken: string) => void,
 *   logout:             () => void,
 *   setBusiness:        (business: Object) => void,
 *   clearBusiness:      () => void,
 * }} AuthContextValue
 */

const AuthContext = createContext(/** @type {AuthContextValue} */ (null));

/* ----------------------------------------------------------------
 * AuthProvider
 * ---------------------------------------------------------------- */

/**
 * Wrap the application (inside BrowserRouter) with this provider.
 * @param {{ children: React.ReactNode }} props
 */
export function AuthProvider({ children }) {
  const navigate = useNavigate();

  // Synchronously resolve initial auth state from localStorage/sessionStorage.
  // This runs once before the first render so there is no flicker.
  const [user, setUser]         = useState(() => getCurrentUser());
  const [business, setBizState] = useState(() => getCachedBusiness());
  // loading stays true until the mount effect wires the session-expired handler.
  // It's false immediately since we resolved state synchronously above.
  const [loading, setLoading]   = useState(false);

  // Keep a stable ref to navigate so logout() registered as a callback
  // always uses the latest navigate function without re-registering the handler.
  const navigateRef = useRef(navigate);
  useEffect(() => { navigateRef.current = navigate; }, [navigate]);

  /* ------------------------------------------------------------------
   * Wire session-expired handler on mount.
   * When api/client.js fails to refresh a token, it calls this handler
   * instead of window.location.replace, giving React a clean logout.
   * ------------------------------------------------------------------ */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      // Clear storage (same as logout, but navigate is via React Router).
      clearTokens();
      setUser(null);
      setBizState(null);
      navigateRef.current('/login', { replace: true });
    });

    // Cleanup: remove handler when provider unmounts (e.g. tests).
    return () => setSessionExpiredHandler(null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------------------------------------
   * login — called after successful POST /auth/login or /auth/register.
   * Persists tokens to localStorage, updates React state.
   * Does NOT navigate — the calling page component handles redirect.
   * ------------------------------------------------------------------ */
  function login(accessToken, refreshToken) {
    const decoded = setTokens(accessToken, refreshToken);
    setUser(decoded);
    // Business starts empty after fresh login; page/onboarding will call setBusiness().
    setBizState(null);
  }

  /* ------------------------------------------------------------------
   * logout — called by nav logout button or session-expiry handler.
   * Clears all storage and navigates to /login.
   * ------------------------------------------------------------------ */
  function logout() {
    clearTokens();
    setUser(null);
    setBizState(null);
    navigate('/login', { replace: true });
  }

  /* ------------------------------------------------------------------
   * setBusiness — called after GET /business or POST /business + refresh.
   * Updates sessionStorage cache and React state.
   * ------------------------------------------------------------------ */
  function setBusiness(biz) {
    setCachedBusiness(biz);
    setBizState(biz);
  }

  /* ------------------------------------------------------------------
   * clearBusiness — called after a successful PUT /business so that
   * the next GET /business fetches fresh data.
   * ------------------------------------------------------------------ */
  function clearBusiness() {
    clearBusinessCache();
    setBizState(null);
  }

  /* ------------------------------------------------------------------
   * refreshUser — called after POST /business + mandatory token refresh
   * to embed the new businessId in the JWT. Reads the fresh token from
   * localStorage (setTokens() was already called by the API flow) and
   * updates React state.
   * ------------------------------------------------------------------ */
  function refreshUser() {
    const fresh = getCurrentUser();
    setUser(fresh);
  }

  /* ------------------------------------------------------------------
   * Derived booleans — computed from state, not stored separately.
   * ------------------------------------------------------------------ */
  const isAuthenticatedValue    = Boolean(user) && checkIsAuthenticated();
  const hasBusinessProfileValue = Boolean(user?.businessId);

  const value = {
    user,
    business,
    isAuthenticated:    isAuthenticatedValue,
    hasBusinessProfile: hasBusinessProfileValue,
    loading,
    login,
    logout,
    setBusiness,
    clearBusiness,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/* ----------------------------------------------------------------
 * Raw context export (for useAuth hook)
 * ---------------------------------------------------------------- */
export { AuthContext };
