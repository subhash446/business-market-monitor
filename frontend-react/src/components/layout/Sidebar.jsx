/**
 * Sidebar — application navigation sidebar
 * Business Market Monitor — React frontend
 *
 * React equivalent of frontend/components/nav.html + frontend/js/components/nav.js
 *
 * The Vanilla JS approach fetched nav.html via HTTP and injected it via innerHTML
 * (the sole approved innerHTML exception in the original codebase). In React, the
 * sidebar is pure JSX — no fetch, no innerHTML, no XSS surface.
 *
 * Preserves:
 *   - Identical CSS class names (.sidebar, .sidebar__brand, .nav-link, etc.)
 *   - Same SVG logo from nav.html
 *   - Same nav link set and icons
 *   - Active link detection (useLocation + pathname matching)
 *   - User initials avatar from email
 *   - Business name + industry display from AuthContext
 *   - Mobile hamburger open/close (controlled by AppLayout via isOpen prop)
 *   - Logout with confirmation dialog (replaces confirmAction + window.location.replace)
 *   - Settings button opening BusinessSettingsModal
 *   - sidebar--ready fade-in class on mount
 *
 * Props:
 *   isOpen  — boolean: mobile sidebar open state (controlled by AppLayout)
 *   onClose — () => void: close the mobile sidebar
 */

import { useEffect, useRef, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { getInitialsFromEmail } from '../../utils/format.js';
import { post } from '../../api/client.js';
import { clearTokens } from '../../auth/auth.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';
import { BusinessSettingsModal } from '../ui/BusinessSettingsModal.jsx';

/** Nav links — matches nav.html exactly */
const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'fa-solid fa-house',      id: 'nav-link-dashboard' },
  { to: '/materials', label: 'Materials', icon: 'fa-solid fa-cubes',       id: 'nav-link-materials' },
  { to: '/news',      label: 'News',      icon: 'fa-solid fa-newspaper',   id: 'nav-link-news'      },
  { to: '/alerts',    label: 'Alerts',    icon: 'fa-solid fa-bell',         id: 'nav-link-alerts'    },
  { to: '/trends',    label: 'Trends',    icon: 'fa-solid fa-chart-line',   id: 'nav-link-trends'    },
];

export function Sidebar({ isOpen, onClose }) {
  const { user, business, logout, setBusiness } = useAuth();
  const navigate = useNavigate();

  const [ready,          setReady]          = useState(false);
  const [confirmLogout,  setConfirmLogout]  = useState(false);
  const [settingsOpen,   setSettingsOpen]   = useState(false);

  // Add sidebar--ready class after mount (fade-in, matching nav.js behavior)
  useEffect(() => {
    const raf = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  /* ------------------------------------------------------------------
   * Logout — confirmation → fire-and-forget POST /auth/logout → clear + navigate
   * (matches _wireLogout in nav.js)
   * ------------------------------------------------------------------ */
  async function handleLogoutConfirmed() {
    try {
      await post('/auth/logout');
    } catch {
      // Ignore — logout is client-side regardless (same as original)
    }
    logout();  // clears tokens + navigates to /login via AuthContext
  }

  const initials     = getInitialsFromEmail(user?.email ?? '');
  const businessName = business?.name ?? 'My Business';
  const industryName = business?.industry?.name ?? business?.industryName ?? '';

  return (
    <>
      <aside
        className={`sidebar${ready ? ' sidebar--ready' : ''}${isOpen ? ' sidebar--open' : ''}`}
        id="sidebar"
        aria-label="Main navigation"
      >
        {/* ── Brand / Logo ─────────────────────────────── */}
        <div className="sidebar__brand">
          <NavLink
            to="/dashboard"
            className="sidebar__logo-link"
            aria-label="Business Market Monitor — Dashboard"
            onClick={onClose}
          >
            <span className="sidebar__logo" aria-hidden="true">
              {/* SVG logo from nav.html — preserved exactly */}
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="#3b82f6"/>
                <path d="M8 22 L8 14 L13 14 L13 22"  stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M14 22 L14 10 L19 10 L19 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M20 22 L20 17 L25 17 L25 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <line x1="6" y1="22" x2="27" y2="22" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </span>
            <span className="sidebar__app-name">Market Monitor</span>
          </NavLink>
        </div>

        {/* ── User / Business Info ──────────────────────── */}
        <div className="sidebar__user">
          <div className="sidebar__avatar" aria-hidden="true">
            <span id="nav-user-initials">{initials}</span>
          </div>
          <div className="sidebar__user-info">
            <span className="sidebar__business-name" id="nav-business-name">
              {businessName}
            </span>
            <span className="sidebar__industry-name" id="nav-industry-name">
              {industryName}
            </span>
          </div>
        </div>

        {/* ── Navigation Links ──────────────────────────── */}
        <nav className="sidebar__nav" aria-label="Main menu">
          <ul role="list">
            {NAV_LINKS.map(link => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  id={link.id}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                  aria-current={undefined}  // NavLink handles via className; aria-current set below
                  onClick={onClose}
                >
                  {({ isActive }) => (
                    <>
                      <span className="nav-link__icon" aria-hidden="true">
                        <i className={link.icon} />
                      </span>
                      <span className="nav-link__label">{link.label}</span>
                      {/* aria-current on the <a> itself */}
                      {isActive && <span className="sr-only">(current page)</span>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* ── Footer Actions ────────────────────────────── */}
        <div className="sidebar__footer">
          {/* Business Settings */}
          <button
            type="button"
            className="sidebar__action-btn"
            id="nav-settings-btn"
            aria-label="Business settings"
            onClick={() => { onClose(); setSettingsOpen(true); }}
          >
            <span className="sidebar__action-icon" aria-hidden="true">
              <i className="fa-solid fa-gear" />
            </span>
            <span>Settings</span>
          </button>

          {/* Log Out */}
          <button
            type="button"
            className="sidebar__action-btn sidebar__action-btn--danger"
            id="nav-logout-btn"
            aria-label="Log out of your account"
            onClick={() => { onClose(); setConfirmLogout(true); }}
          >
            <span className="sidebar__action-icon" aria-hidden="true">
              <i className="fa-solid fa-right-from-bracket" />
            </span>
            <span>Log Out</span>
          </button>
        </div>
      </aside>

      {/* ── Logout Confirmation Dialog ───────────────────── */}
      <ConfirmDialog
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={handleLogoutConfirmed}
        title="Log Out"
        message="Are you sure you want to log out?"
        confirmLabel="Log Out"
        cancelLabel="Cancel"
        danger={false}
      />

      {/* ── Business Settings Modal ──────────────────────── */}
      <BusinessSettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={setBusiness}
      />
    </>
  );
}
