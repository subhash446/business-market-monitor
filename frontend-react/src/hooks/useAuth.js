/**
 * useAuth — React hook for consuming AuthContext
 * Business Market Monitor — React frontend
 *
 * Usage:
 *   const { user, isAuthenticated, hasBusinessProfile, login, logout, setBusiness } = useAuth();
 *
 * Must be used inside a component that is a descendant of AuthProvider.
 * Throws a descriptive error if used outside AuthProvider (dev-time safety).
 */

import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.jsx';

/**
 * @returns {import('../context/AuthContext.jsx').AuthContextValue}
 */
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error(
      'useAuth() must be used inside <AuthProvider>. ' +
      'Ensure the component tree is wrapped with AuthProvider.'
    );
  }
  return ctx;
}
