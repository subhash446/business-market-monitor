/**
 * ProtectedRoute — route guard component
 * Business Market Monitor — React frontend
 *
 * Replaces the Vanilla JS requireAuth() and requireBusiness() guards
 * that were called at the top of every page module.
 *
 * ORIGINAL BEHAVIOR (from frontend/js/auth/auth.js):
 *   requireAuth()      → window.location.replace('/pages/login.html')
 *   requireBusiness()  → window.location.replace('/pages/onboarding.html')
 *
 * REACT EQUIVALENT:
 *   <ProtectedRoute />                 → requires auth only
 *   <ProtectedRoute requireBusiness /> → requires auth + business profile
 *
 * LOADING STATE:
 *   While AuthContext is resolving the initial session (loading === true),
 *   a minimal spinner is shown instead of flashing a redirect.
 *   Because AuthContext resolves synchronously from localStorage/sessionStorage,
 *   the loading state is typically false by the time this renders.
 *   The spinner is a safety net for edge cases.
 *
 * REDIRECT TARGETS:
 *   Not authenticated            → /login    (replaces /pages/login.html)
 *   No business profile          → /onboarding (replaces /pages/onboarding.html)
 *   Both checks pass             → <Outlet /> (renders the nested child route)
 *
 * USAGE:
 *   <Route element={<ProtectedRoute />}>
 *     <Route path="/dashboard" element={<Dashboard />} />
 *   </Route>
 *
 *   <Route element={<ProtectedRoute requireBusiness />}>
 *     <Route path="/materials" element={<Materials />} />
 *   </Route>
 */

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

/**
 * @param {{ requireBusiness?: boolean }} props
 */
export function ProtectedRoute({ requireBusiness = false }) {
  const { isAuthenticated, hasBusinessProfile, loading } = useAuth();

  // While initial session is being resolved, show a minimal spinner.
  if (loading) {
    return (
      <div className="root-loading" role="status" aria-label="Loading application">
        <div className="root-loading__spinner" aria-hidden="true" />
        <p className="root-loading__text">Loading…</p>
      </div>
    );
  }

  // Not logged in → redirect to /login (replaces requireAuth()).
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Logged in but no business profile → redirect to /onboarding (replaces requireBusiness()).
  if (requireBusiness && !hasBusinessProfile) {
    return <Navigate to="/onboarding" replace />;
  }

  // All checks pass — render the nested route.
  return <Outlet />;
}
