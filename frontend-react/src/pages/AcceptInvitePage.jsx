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
    <div className="auth-page">
      <div className="auth-card" style={{ maxWidth: '480px' }}>
        <div className="auth-header">
          <div className="auth-logo">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="#3b82f6" />
              <path d="M8 22 L8 14 L13 14 L13 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M14 22 L14 10 L19 10 L19 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M20 22 L20 17 L25 17 L25 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="6" y1="22" x2="27" y2="22" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="auth-title">Workspace Invitation</h1>
          <p className="auth-subtitle">
            You have been invited to join a collaborative procurement workspace on Business Market Monitor.
          </p>
        </div>

        {errorMsg && (
          <div className="form-alert form-alert--error form-alert--visible" role="alert" style={{ marginBottom: '16px' }}>
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
              <p style={{ fontSize: '12px', color: '#a1a1aa', marginTop: '6px' }}>
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
              className={`btn btn--primary btn--full${loading ? ' btn--loading' : ''}`}
              disabled={loading || !token.trim()}
            >
              <i className="fa-solid fa-check mr-2" />
              Accept Invitation &amp; Join Workspace
            </button>
          </form>
        ) : (
          <div>
            <div className="form-alert form-alert--info" style={{ marginBottom: '20px' }}>
              <i className="fa-solid fa-circle-info" />
              <span>Please sign in or create an account with the invited email address to accept this invitation.</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
    </div>
  );
}
