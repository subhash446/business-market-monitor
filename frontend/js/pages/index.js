/**
 * index.js — Root redirect controller
 * Business Market Monitor — Frontend v1.0
 *
 * Loaded as <script type="module"> on index.html.
 * Checks auth state and routes to the correct page.
 * Doc 3 §4.4 — root redirect logic.
 */

import { isAuthenticated, hasBusinessProfile } from '/js/auth/auth.js';

(function redirect() {
  if (isAuthenticated()) {
    if (hasBusinessProfile()) {
      window.location.replace('/pages/dashboard.html');
    } else {
      window.location.replace('/pages/onboarding.html');
    }
  } else {
    window.location.replace('/pages/login.html');
  }
})();
