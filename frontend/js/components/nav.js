/**
 * Navigation loader — fetches nav.html, injects it, wires interactions
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §6.6, §7.14 — js/components/nav.js
 *
 * SECURITY NOTE (Doc 3 §11.2 Rule 2):
 *   The innerHTML assignment below is the SOLE APPROVED exception to the
 *   no-innerHTML rule. The source (/components/nav.html) is a static,
 *   developer-authored file served by the same Express process.
 *   It contains ZERO user-controlled or API-supplied data.
 *   All other innerHTML usage with dynamic data remains strictly prohibited.
 *
 * Usage:
 *   import { initNav } from '/js/components/nav.js';
 *   await initNav({ pageTitle: 'Dashboard' });
 */

import { getCurrentUser, clearTokens }    from '../auth/auth.js';
import { getCachedBusiness, clearSession } from '../auth/session.js';
import { confirmAction }                   from './confirm.js';
import { getInitialsFromEmail }            from '../utils/format.js';

const NAV_FRAGMENT_URL = '/components/nav.html';

/**
 * Initialise the navigation on an authenticated page.
 *
 * Steps (Doc 3 §6.6, §7.14):
 *  1. Fetch /components/nav.html
 *  2. Inject into #nav-placeholder (sole innerHTML exception)
 *  3. Populate user-info placeholders from cached session data
 *  4. Set .nav-link--active on the matching nav link
 *  5. Wire hamburger toggle + overlay backdrop
 *  6. Wire logout button
 *  7. Wire settings link → businessSettings.openSettingsModal() (Phase 9)
 *
 * @param {Object}  [options]
 * @param {string}  [options.pageTitle]    — text for .header__title (if present)
 * @param {string}  [options.activeHref]   — explicit active path override
 */
export async function initNav({ pageTitle, activeHref } = {}) {
  const placeholder = document.getElementById('nav-placeholder');
  if (!placeholder) {
    console.warn('[nav] #nav-placeholder not found. Skipping nav init.');
    return;
  }

  // ------------------------------------------------------------------
  // 1. Fetch the nav.html fragment
  // ------------------------------------------------------------------
  let html = '';
  try {
    const res = await fetch(NAV_FRAGMENT_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = await res.text();
  } catch (err) {
    console.warn('[nav] Could not load nav.html:', err.message);
    // Page remains usable without sidebar. Logout still reachable
    // via auth.clearTokens() and a manual redirect.
    return;
  }

  // ------------------------------------------------------------------
  // 2. Inject markup — SOLE APPROVED innerHTML use (Doc 3 §11.2 Rule 2)
  //    Source: static developer-authored file, no user data.
  // ------------------------------------------------------------------
  // eslint-disable-next-line no-unsanitized/property
  placeholder.innerHTML = html;

  // Allow pointer events now that nav is injected
  placeholder.style.pointerEvents = 'auto';

  // Reveal sidebar with fade-in
  const sidebar = placeholder.querySelector('.sidebar');
  if (sidebar) {
    requestAnimationFrame(() => sidebar.classList.add('sidebar--ready'));
  }

  // ------------------------------------------------------------------
  // 3. Populate user-info placeholders (textContent — XSS safe)
  // ------------------------------------------------------------------
  _populateUserInfo(placeholder);

  // ------------------------------------------------------------------
  // 4. Set active nav link
  // ------------------------------------------------------------------
  _setActiveNavLink(placeholder, activeHref);

  // ------------------------------------------------------------------
  // 5. Wire hamburger toggle + overlay backdrop (Doc 3 §6.5)
  // ------------------------------------------------------------------
  _wireHamburger(placeholder, sidebar);

  // ------------------------------------------------------------------
  // 6. Wire logout button (Doc 3 §6.7, §4.8)
  // ------------------------------------------------------------------
  _wireLogout(placeholder);

  // ------------------------------------------------------------------
  // 7. Wire settings link (placeholder for Phase 9 businessSettings modal)
  // ------------------------------------------------------------------
  _wireSettings(placeholder);

  // ------------------------------------------------------------------
  // 8. Set page title in header (if element exists)
  // ------------------------------------------------------------------
  if (pageTitle) {
    const titleEl = document.querySelector('.header__title');
    if (titleEl) titleEl.textContent = pageTitle;
  }

  // Populate header user badge
  _populateHeaderBadge();
}

/* ----------------------------------------------------------------
 * PRIVATE HELPERS
 * ---------------------------------------------------------------- */

/**
 * Populate sidebar user-info placeholders from session cache.
 * All via textContent — never innerHTML.
 */
function _populateUserInfo(root) {
  const user     = getCurrentUser();
  const business = getCachedBusiness();

  // Initials avatar
  const avatarEl = root.querySelector('#nav-user-initials');
  if (avatarEl && user?.email) {
    avatarEl.textContent = getInitialsFromEmail(user.email);
  }

  // Business name
  const bizNameEl = root.querySelector('#nav-business-name');
  if (bizNameEl) {
    bizNameEl.textContent = business?.name ?? 'My Business';
  }

  // Industry name
  const industryEl = root.querySelector('#nav-industry-name');
  if (industryEl) {
    industryEl.textContent = business?.industry?.name ?? '';
  }
}

/**
 * Populate the header user-initials badge (outside #nav-placeholder).
 */
function _populateHeaderBadge() {
  const badge = document.querySelector('.header__user-badge');
  const user  = getCurrentUser();
  if (badge && user?.email) {
    badge.textContent = getInitialsFromEmail(user.email);
    badge.setAttribute('title', user.email);
    badge.setAttribute('aria-label', `Signed in as ${user.email}`);
  }
}

/**
 * Add aria-current="page" and .nav-link--active to the current page's link.
 */
function _setActiveNavLink(root, overrideHref) {
  const currentPath = overrideHref || window.location.pathname;
  const links = root.querySelectorAll('.nav-link');

  links.forEach((link) => {
    link.classList.remove('nav-link--active');
    link.removeAttribute('aria-current');

    const href = link.getAttribute('href') || '';
    if (href && currentPath.endsWith(href.split('/').pop())) {
      link.classList.add('nav-link--active');
      link.setAttribute('aria-current', 'page');
    }
  });
}

/**
 * Wire the hamburger toggle button and overlay backdrop for mobile.
 */
function _wireHamburger(navRoot, sidebar) {
  const hamburger = document.querySelector('.header__hamburger');
  const overlay   = document.querySelector('.sidebar-overlay');

  function openSidebar() {
    sidebar?.classList.add('sidebar--open');
    overlay?.classList.add('sidebar-overlay--visible');
    hamburger?.setAttribute('aria-expanded', 'true');
  }

  function closeSidebar() {
    sidebar?.classList.remove('sidebar--open');
    overlay?.classList.remove('sidebar-overlay--visible');
    hamburger?.setAttribute('aria-expanded', 'false');
  }

  if (hamburger) {
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-controls', 'sidebar');
    hamburger.addEventListener('click', openSidebar);
  }

  if (overlay) {
    overlay.addEventListener('click', closeSidebar);
  }

  // Close sidebar when a nav link is clicked on mobile
  navRoot.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', closeSidebar);
  });
}

/**
 * Wire the logout button — confirmation dialog → clearTokens → redirect.
 * Doc 3 §4.8, §6.7.
 */
function _wireLogout(root) {
  const logoutBtn = root.querySelector('#nav-logout-btn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', () => {
    confirmAction({
      title:        'Log Out',
      message:      'Are you sure you want to log out?',
      confirmLabel: 'Log Out',
      cancelLabel:  'Cancel',
      danger:       false,
      onConfirm:    async () => {
        // Fire-and-forget logout API call (Doc 3 §4.8)
        try {
          const { post } = await import('../api/client.js');
          await post('/auth/logout');
        } catch {
          // Ignore — logout is client-side regardless
        }
        clearTokens();
        clearSession();
        window.location.replace('/pages/login.html');
      },
    });
  });
}

/**
 * Wire the settings link.
 * Opens the businessSettings modal (implemented in Phase 9).
 * For Phase 1–8, this is a no-op placeholder.
 */
function _wireSettings(root) {
  const settingsBtn = root.querySelector('#nav-settings-btn');
  if (!settingsBtn) return;

  settingsBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    // businessSettings module loaded dynamically in Phase 9
    try {
      const { openSettingsModal } = await import('./businessSettings.js');
      openSettingsModal();
    } catch {
      // Phase 9 not implemented yet — graceful no-op
      console.info('[nav] Business settings modal not yet implemented (Phase 9).');
    }
  });
}
