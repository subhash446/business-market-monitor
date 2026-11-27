/**
 * AppLayout — authenticated application shell
 * Business Market Monitor — React frontend
 *
 * Provides the full command-center page shell:
 *   .app-layout
 *   ├── <Sidebar />            (sidebar navigation + workspace role pill)
 *   ├── .sidebar-overlay       (mobile backdrop)
 *   └── .app-main
 *       ├── <header .header>   (top header chrome + route breadcrumb + user role/badge)
 *       └── <main .main-content>
 *           └── {children}     (page content via <Outlet />)
 */

import { useContext, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AuthContext } from '../../context/AuthContext.jsx';
import { getInitialsFromEmail } from '../../utils/format.js';
import { Sidebar } from './Sidebar.jsx';

const ROUTE_LABELS = [
  { prefix: '/dashboard', label: 'Dashboard' },
  { prefix: '/materials/', label: 'Impact Analysis' },
  { prefix: '/materials', label: 'Materials' },
  { prefix: '/prices', label: 'Price Entry' },
  { prefix: '/trends', label: 'Trends & Guidance' },
  { prefix: '/alerts', label: 'Alerts' },
  { prefix: '/news', label: 'News & Digest' },
  { prefix: '/settings', label: 'Workspace Settings' },
];

function resolveRouteLabel(pathname) {
  if (!pathname) return '';
  const match = ROUTE_LABELS.find((item) => pathname.startsWith(item.prefix));
  return match ? match.label : '';
}

function getHeaderRoleMeta(role) {
  if (role === 'OWNER') return { label: 'OWNER', mod: 'owner' };
  if (role === 'PURCHASE_MANAGER') return { label: 'PURCHASE MANAGER', mod: 'manager' };
  if (role === 'VIEWER') return { label: 'VIEWER', mod: 'viewer' };
  return null;
}

export function AppLayout({ pageTitle, children }) {
  const auth = useContext(AuthContext);
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const user = auth?.user ?? null;
  const business = auth?.business ?? null;
  const initials = getInitialsFromEmail(user?.email ?? '');
  const activeRouteLabel = pageTitle || resolveRouteLabel(location?.pathname ?? '');
  const roleMeta = getHeaderRoleMeta(business?.businessRole || user?.businessRole || null);

  function openSidebar() {
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      {/* Overlay backdrop (mobile) */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' sidebar-overlay--visible' : ''}`}
        id="sidebar-overlay"
        aria-hidden="true"
        onClick={closeSidebar}
      />

      {/* Main content area */}
      <div className="app-main">
        {/* Top Command Header */}
        <header className="header" role="banner">
          <button
            type="button"
            className="header__hamburger"
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="sidebar"
            onClick={openSidebar}
          >
            <i className="fa-solid fa-bars" aria-hidden="true" />
          </button>

          {pageTitle ? (
            <h1 className="header__title">{pageTitle}</h1>
          ) : (
            <div className="header__context">
              <span className="header__workspace-label">
                {business?.name || 'Workspace'}
              </span>
              {activeRouteLabel && (
                <>
                  <span className="header__crumb-sep" aria-hidden="true">/</span>
                  <span className="header__route-label">{activeRouteLabel}</span>
                </>
              )}
            </div>
          )}

          <div className="header__spacer" aria-hidden="true" />

          <div className="header__user">
            {roleMeta && (
              <span
                className={`header__role-pill header__role-pill--${roleMeta.mod}`}
                id="header-role-pill"
              >
                {roleMeta.label}
              </span>
            )}
            <div
              className="header__user-badge"
              title={user?.email ?? ''}
              aria-label={user?.email ? `Signed in as ${user.email}` : 'User'}
            >
              {initials}
            </div>
          </div>
        </header>

        <main className="main-content" id="main-content">
          <Outlet />
          {children}
        </main>
      </div>
    </div>
  );
}
