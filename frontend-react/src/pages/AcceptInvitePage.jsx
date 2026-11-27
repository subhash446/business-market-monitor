/**
 * AcceptInvitePage — Workspace Invitation Landing & Acceptance (V3-M5).
 * Business Market Monitor — React frontend
 */

import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { acceptTeamInvite } from '../api/team.api.js';
import { useToast } from '../components/ui/Toast.jsx';
import '../styles/pages/auth.css';

export function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, refreshUser } = useAuth();
  const { showToast } = useToast();

  const initialToken = searchParams.get('token') || '';
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleAccept = async (e) => {
    e.preventDefault();
    if (!token.trim()) {
      setErrorMsg('Please enter or provide a valid invitation token.');
      return;
    }

    setLoading(true);
    setErrorMsg('');
    try {
      await acceptTeamInvite(token.trim());
      showToast({ type: 'success', message: 'Workspace invitation accepted! Loading your dashboard...' });
      refreshUser();
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to accept invitation. The token may be expired or invalid.');
    } finally {
      setLoading(false);
    }
  };

  const loginRedirectUrl = `/login?redirect=${encodeURIComponent(`/accept-invite?token=${token}`)}`;

  return (
    <div className="auth-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <main id="main-content" className="auth-container">
        <Link to="/" className="auth-brand auth-brand-link" aria-label="Business Market Monitor Home">
          <div className="auth-logo-mark" aria-hidden="true">
            <i className="fa-solid fa-chart-column" />
          </div>
          <span className="auth-brand__name">Business Market Monitor</span>
        </Link>

        <div className="auth-card">
          <div className="auth-card__header">
            <h1 className="auth-card__title">Workspace Invitation</h1>
            <p className="auth-card__subtitle">
              You have been invited to join a collaborative procurement workspace on Business Market Monitor.
            </p>
          </div>

          {errorMsg && (
            <div className="form-alert form-alert--error form-alert--visible" role="alert">
              <i className="fa-solid fa-circle-exclamation" aria-hidden="true" />
              <span className="form-alert__message">{errorMsg}</span>
            </div>
          )}

          {isAuthenticated ? (
            <form onSubmit={handleAccept}>
              <div className="form-group">
                <label className="form-label" htmlFor="accept-current-user">
                  Signed In Account
                </label>
                <input
                  type="text"
                  id="accept-current-user"
                  className="form-control form-control--readonly"
                  readOnly
                  value={user?.email || 'Authenticated User'}
                />
                <p className="form-hint">
                  Note: The invitation must match this email address.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="accept-token-input">
                  Invitation Security Token
                </label>
                <input
                  type="text"
                  id="accept-token-input"
                  className="form-control font-mono"
                  placeholder="64-character token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                id="accept-invite-submit-btn"
                className={`btn btn--primary btn--full mt-4${loading ? ' btn--loading' : ''}`}
                disabled={loading || !token.trim()}
              >
                <i className="fa-solid fa-check mr-2" aria-hidden="true" />
                Accept Invitation &amp; Join Workspace
              </button>
            </form>
          ) : (
            <div>
              <div className="form-alert form-alert--info form-alert--visible" role="status">
                <i className="fa-solid fa-circle-info" aria-hidden="true" />
                <span className="form-alert__message">
                  Please sign in or create an account with the invited email address to accept this invitation.
                </span>
              </div>

              <div className="d-flex flex-col gap-3">
                <Link to={loginRedirectUrl} className="btn btn--primary btn--full">
                  Sign In to Accept
                </Link>
                <Link to="/register" className="btn btn--ghost btn--full">
                  Create New Account
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
