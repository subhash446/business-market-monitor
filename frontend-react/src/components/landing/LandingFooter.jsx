import { Link } from 'react-router-dom';

/**
 * LandingFooter — Clean 4-column executive footer
 */
export function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer__inner">
        <div className="lp-footer__top">
          {/* Column 1: Brand + Tagline */}
          <div className="lp-footer__brand">
            <div className="lp-nav__brand">
              <svg
                className="lp-nav__logo"
                viewBox="0 0 32 32"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
              >
                <rect width="32" height="32" rx="8" fill="#2563eb" />
                <path
                  d="M7 23V19M13 23V13M19 23V16M25 23V9"
                  stroke="#ffffff"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
              <span className="lp-nav__title">
                AI Market Intelligence Agent
              </span>
            </div>
            <p className="lp-footer__tagline">
              Real-time raw material procurement intelligence and supplier quote
              benchmarking for Indian manufacturers.
            </p>
          </div>

          {/* Column 2: Platform */}
          <div className="lp-footer__col">
            <span className="lp-footer__col-title">Platform</span>
            <a href="#how-it-works" className="lp-footer__link">
              How It Works
            </a>
            <a href="#supplier-benchmark" className="lp-footer__link">
              Supplier Benchmark
            </a>
            <a href="#access" className="lp-footer__link">
              Access Tiers
            </a>
          </div>

          {/* Column 3: Account */}
          <div className="lp-footer__col">
            <span className="lp-footer__col-title">Account</span>
            <Link to="/login" className="lp-footer__link">
              Sign In
            </Link>
            <Link to="/register" className="lp-footer__link">
              Create Account
            </Link>
            <Link to="/forgot-password" className="lp-footer__link">
              Forgot Password
            </Link>
          </div>

          {/* Column 4: Verified Sources */}
          <div className="lp-footer__col">
            <span className="lp-footer__col-title">Verified Sources</span>
            <span className="lp-footer__static-item">Ministry of Agriculture (Agmarknet)</span>
            <span className="lp-footer__static-item">U.S. Energy Information Admin (EIA)</span>
            <span className="lp-footer__static-item">Meta WhatsApp Cloud API</span>
          </div>
        </div>

        <div className="lp-footer__bottom">
          <p className="lp-footer__copy">
            Built in India for Indian manufacturers. All market benchmark telemetry is
            sourced from official public registries and authentic mandi modal rates.
          </p>
          <span className="lp-footer__cert font-mono">
            © 2026 AI Market Intelligence Agent · Automated 7:00 AM Briefings
          </span>
        </div>
      </div>
    </footer>
  );
}
