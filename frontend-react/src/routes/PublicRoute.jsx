/**
 * PublicRoute — redirects authenticated users away from public-only routes.
 * Business Market Monitor — React frontend — Phase D
 *
 * Wrap the landing page (/) so that an authenticated user with a business
 * profile goes directly to /dashboard instead of the marketing page.
 * Guests see the wrapped child route normally.
 */

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

/**
 * @param {{ redirectTo?: string }} props
 *   redirectTo — where to send authenticated users (default: '/dashboard')
 */
export function PublicRoute({ redirectTo = '/dashboard' }) {
  const { isAuthenticated, hasBusinessProfile, loading } = useAuth();

  // While session is resolving, show nothing to avoid flash-redirect.
  if (loading) return null;

  // Authenticated + business → send to app.
  if (isAuthenticated && hasBusinessProfile) {
    return <Navigate to={redirectTo} replace />;
  }

  // Authenticated but no business yet → finish onboarding.
  if (isAuthenticated && !hasBusinessProfile) {
    return <Navigate to="/onboarding" replace />;
  }

  // Guest → render the wrapped public route.
  return <Outlet />;
}
