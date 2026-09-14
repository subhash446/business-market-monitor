/**
 * App.jsx — application root with Router, AuthProvider, ToastProvider, and routes
 * Business Market Monitor — React frontend — Phase D
 *
 * Route structure:
 *   /               public (guest) — LandingPage
 *                   authenticated  — → /dashboard (PublicRoute guard)
 *   /login           public — LoginPage
 *   /register        public — RegisterPage
 *   /forgot-password public — ForgotPasswordPage
 *   /reset-password  public — ResetPasswordPage
 *   /onboarding      requires auth only (no business yet)
 *   /dashboard       requires auth + business → AppLayout
 *   /materials       requires auth + business → AppLayout
 *   /prices          requires auth + business → AppLayout
 *   /trends          requires auth + business → AppLayout
 *   /alerts          requires auth + business → AppLayout
 *   /news            requires auth + business → AppLayout
 */

import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider }   from './context/AuthContext.jsx';
import { ProtectedRoute } from './routes/ProtectedRoute.jsx';
import { PublicRoute }    from './routes/PublicRoute.jsx';
import { ToastProvider }  from './components/ui/Toast.jsx';
import { AppLayout }      from './components/layout/AppLayout.jsx';

/* ── Phase D: Public landing page ─────────────────────────────── */
import { LandingPage } from './pages/public/LandingPage.jsx';

/* ── Auth page components ──────────────────────────────────────── */
import { LoginPage }          from './pages/auth/LoginPage.jsx';
import { RegisterPage }       from './pages/auth/RegisterPage.jsx';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage.jsx';
import { ResetPasswordPage }  from './pages/auth/ResetPasswordPage.jsx';
import { OnboardingPage }     from './pages/OnboardingPage.jsx';
import { DashboardPage }     from './pages/DashboardPage.jsx';
import { MaterialsPage }     from './pages/MaterialsPage.jsx';
import { PricesPage }        from './pages/PricesPage.jsx';
import { TrendsPage }        from './pages/TrendsPage.jsx';
import { NewsPage }          from './pages/NewsPage.jsx';
import { AlertsPage }        from './pages/AlertsPage.jsx';

/* ----------------------------------------------------------------
 * App — provider order:
 *   BrowserRouter  (must wrap useNavigate in AuthProvider)
 *   └── AuthProvider (wires session-expiry handler)
 *       └── ToastProvider (portal, available to all components)
 *           └── Routes
 * ---------------------------------------------------------------- */
function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* ── Root — landing page (guest) / dashboard (auth) ── */}
            <Route element={<PublicRoute />}>
              <Route path="/" element={<LandingPage />} />
            </Route>

            {/* ── Public auth routes ─────────────────────────────── */}
            <Route path="/login"           element={<LoginPage />} />
            <Route path="/register"        element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password"  element={<ResetPasswordPage />} />

            {/* ── Auth-only — onboarding (no business yet) ──────── */}
            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding" element={<OnboardingPage />} />
            </Route>

            {/* ── Auth + business required — full app shell ──────── */}
            <Route element={<ProtectedRoute requireBusiness />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/materials" element={<MaterialsPage />} />
                <Route path="/prices"    element={<PricesPage />} />
                <Route path="/trends"    element={<TrendsPage />} />
                <Route path="/alerts"    element={<AlertsPage />} />
                <Route path="/news"      element={<NewsPage />} />
              </Route>
            </Route>

            {/* ── 404 fallback ────────────────────────────────────── */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
