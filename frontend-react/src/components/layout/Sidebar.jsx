/**
 * Sidebar — application navigation sidebar
 * Business Market Monitor — React frontend
 *
 * Pure JSX sidebar preserving:
 *   - Identical CSS class names (.sidebar, .sidebar__brand, .nav-link, etc.)
 *   - Brand wordmark ("Business Market Monitor") & custom bar-chart emblem
 *   - Workspace business name, industry, and active RBAC role pill
 *   - Active route indicator pill & mobile drawer close handling
 *   - Safe null/SSR fallback when rendered outside full AuthProvider context
 */

import { useContext, useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext.jsx';
import { getInitialsFromEmail } from '../../utils/format.js';
import { post } from '../../api/client.js';
import { ConfirmDialog } from '../ui/ConfirmDialog.jsx';

const NAV_LINKS = [
  { to: '/dashboard', label: 'Dashboard', icon: 'fa-solid fa-house',      id: 'nav-link-dashboard' },
  { to: '/materials', label: 'Materials', icon: 'fa-solid fa-cubes',      id: 'nav-link-materials' },
  { to: '/news',      label: 'News',      icon: 'fa-solid fa-newspaper',  id: 'nav-link-news'      },
  { to: '/alerts',    label: 'Alerts',    icon: 'fa-solid fa-bell',       id: 'nav-link-alerts'    },
  { to: '/trends',    label: 'Trends',    icon: 'fa-solid fa-chart-line', id: 'nav-link-trends'    },
];

function getRoleDisplay(role) {
  if (role === 'OWNER') return { label: 'OWNER', mod: 'owner' };
  if (role === 'PURCHASE_MANAGER') return { label: 'PURCHASE MANAGER', mod: 'manager' };
  if (role === 'VIEWER') return { label: 'VIEWER', mod: 'viewer' };
  return null;
}

export function Sidebar({ isOpen = false, onClose = () => {} }) {
  const auth = useContext(AuthContext);
  const navigate = useNavigate();

  const user = auth?.user ?? null;
  const business = auth?.business ?? null;
  const logout = auth?.logout;

  const [ready, setReady] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    const raf = window.requestAnimationFrame(() => setReady(true));
    return () => window.cancelAnimationFrame(raf);
  }, []);

  async function handleLogoutConfirmed() {
    try {
      await post('/auth/logout');
    } catch {
      // Ignore — logout clears client tokens regardless
    }
    if (typeof logout === 'function') {
      logout();
    } else {
      navigate('/login', { replace: true });
    }
  }

  const initials = getInitialsFromEmail(user?.email ?? '');
  const businessName = business?.name ?? 'My Business';
  const industryName = business?.industry?.name ?? business?.industryName ?? '';
  const roleBadge = getRoleDisplay(business?.businessRole || user?.businessRole || null);

  return (
    <>
      <aside
        className={`sidebar${ready ? ' sidebar--ready' : ''}${isOpen ? ' sidebar--open' : ''}`}
        id="sidebar"
        aria-label="Main navigation"
      >
        {/* Brand / Wordmark */}
        <div className="sidebar__brand">
          <NavLink
            to="/dashboard"
            className="sidebar__logo-link"
            aria-label="AI Market Intelligence Agent — Dashboard"
            onClick={onClose}
          >
            <span className="sidebar__logo" aria-hidden="true">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                <rect width="32" height="32" rx="8" fill="#2563eb" />
                <path d="M8 22 L8 14 L13 14 L13 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M14 22 L14 10 L19 10 L19 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M20 22 L20 17 L25 17 L25 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                <line x1="6" y1="22" x2="27" y2="22" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <span className="sidebar__app-name">AI Market Intelligence Agent</span>
          </NavLink>
        </div>

        {/* User / Business Info */}
        <div className="sidebar__user">
          <div className="sidebar__avatar" aria-hidden="true">
            <span id="nav-user-initials">{initials}</span>
          </div>
          <div className="sidebar__user-info">
            <span className="sidebar__business-name" id="nav-business-name">
              {businessName}
            </span>
            {industryName && (
              <span className="sidebar__industry-name" id="nav-industry-name">
                {industryName}
              </span>
            )}
            {roleBadge && (
              <span
                className={`sidebar__role-pill sidebar__role-pill--${roleBadge.mod}`}
                id="nav-workspace-role"
              >
                {roleBadge.label}
              </span>
            )}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="sidebar__nav" aria-label="Main menu">
          <ul role="list">
            {NAV_LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  id={link.id}
                  className={({ isActive }) =>
                    `nav-link${isActive ? ' nav-link--active' : ''}`
                  }
                  onClick={onClose}
                >
                  {({ isActive }) => (
                    <>
                      <span className="nav-link__icon" aria-hidden="true">
                        <i className={link.icon} />
                      </span>
                      <span className="nav-link__label">{link.label}</span>
                      {isActive && <span className="sr-only">(current page)</span>}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        {/* Footer Actions */}
        <div className="sidebar__footer">
          <button
            type="button"
            className="sidebar__action-btn"
            id="nav-settings-btn"
            aria-label="Business settings"
            onClick={() => {
              onClose();
              navigate('/settings');
            }}
          >
            <span className="sidebar__action-icon" aria-hidden="true">
              <i className="fa-solid fa-gear" />
            </span>
            <span>Settings</span>
          </button>

          <button
            type="button"
            className="sidebar__action-btn sidebar__action-btn--danger"
            id="nav-logout-btn"
            aria-label="Log out of your account"
            onClick={() => {
              onClose();
              setConfirmLogout(true);
            }}
          >
            <span className="sidebar__action-icon" aria-hidden="true">
              <i className="fa-solid fa-right-from-bracket" />
            </span>
            <span>Log Out</span>
          </button>
        </div>
      </aside>

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
    </>
  );
}
