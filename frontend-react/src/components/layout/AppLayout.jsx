/**
 * AppLayout — authenticated application shell
 * Business Market Monitor — React frontend
 *
 * Provides the full page shell for all authenticated pages:
 *   .app-layout
 *   ├── <Sidebar />            (sidebar navigation)
 *   ├── .sidebar-overlay       (mobile backdrop)
 *   └── .app-main
 *       ├── <header .header>   (top header bar)
 *       └── <main .main-content>
 *           └── {children}     (page content via <Outlet />)
 *
 * The Vanilla JS equivalent was a hand-rolled HTML template in each page file
 * plus initNav() from nav.js. AppLayout consolidates this into a single layout.
 *
 * Mobile hamburger:
 *   - Hamburger button in header toggles sidebar open/closed.
 *   - Overlay click closes sidebar (same as _wireHamburger in nav.js).
 *   - Nav link clicks close sidebar via Sidebar's onClose prop.
 *
 * Header:
 *   - pageTitle prop: rendered in .header__title (same as nav.js pageTitle option).
 *   - User initials badge in top-right (same as _populateHeaderBadge in nav.js).
 *
 * Usage:
 *   In App.jsx, wrap protected routes with <AppLayout>:
 *
 *   <Route element={<ProtectedRoute requireBusiness />}>
 *     <Route element={<AppLayout pageTitle="Dashboard" />}>
 *       <Route path="/dashboard" element={<Dashboard />} />
 *     </Route>
 *   </Route>
 *
 *   Or use <AppLayout> directly as an element with <Outlet />:
 *   Pages call useOutletContext() or use their own pageTitle.
 *
 * Props:
 *   pageTitle  — string: optional title shown in .header__title
 *   children   — ReactNode: if used without <Outlet /> (rare)
 */

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth.js';
import { getInitialsFromEmail } from '../../utils/format.js';
import { Sidebar } from './Sidebar.jsx';

export function AppLayout({ pageTitle, children }) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const initials = getInitialsFromEmail(user?.email ?? '');

  function openSidebar() {
    setSidebarOpen(true);
  }

  function closeSidebar() {
    setSidebarOpen(false);
  }

  return (
    <div className="app-layout">

      {/* ── Sidebar ─────────────────────────────────── */}
      <Sidebar isOpen={sidebarOpen} onClose={closeSidebar} />

      {/* ── Overlay backdrop (mobile) ────────────────── */}
      <div
        className={`sidebar-overlay${sidebarOpen ? ' sidebar-overlay--visible' : ''}`}
        id="sidebar-overlay"
        aria-hidden="true"
        onClick={closeSidebar}
      />

      {/* ── Main content area ────────────────────────── */}
      <div className="app-main">

        {/* Header */}
        <header className="header" role="banner">
          {/* Hamburger — mobile only */}
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

          {/* Page title */}
          {pageTitle && (
            <h1 className="header__title">{pageTitle}</h1>
          )}

          {/* Spacer — pushes user badge to the right */}
          <div className="header__spacer" aria-hidden="true" />

          {/* User initials badge */}
          <div
            className="header__user-badge"
            title={user?.email ?? ''}
            aria-label={user?.email ? `Signed in as ${user.email}` : 'User'}
          >
            {initials}
          </div>
        </header>

        {/* Page content — rendered by nested <Route> via Outlet, or children */}
        <main className="main-content" id="main-content">
          <Outlet />
          {children}
        </main>

      </div>
    </div>
  );
}
