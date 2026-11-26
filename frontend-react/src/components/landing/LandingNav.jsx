import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * LandingNav — Sticky 56px navigation bar
 *
 * Deterministic SSR: scrolled state defaults to false and only hydrates
 * via window scroll listener on client mount. Zero overflow down to 360px.
 */
export function LandingNav() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > 12);
    }
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`lp-nav ${isScrolled ? 'lp-nav--scrolled' : ''}`}>
      <div className="lp-container lp-nav__inner">
        {/* Brand logo & unified wordmark */}
        <Link to="/" className="lp-nav__brand" aria-label="Business Market Monitor Home">
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
            Business Market Monitor
          </span>
        </Link>

        {/* Center section anchor links */}
        <nav className="lp-nav__links" aria-label="Landing page sections">
          <a href="#how-it-works" className="lp-nav__link">
            How it works
          </a>
          <a href="#supplier-benchmark" className="lp-nav__link">
            Supplier benchmark
          </a>
          <a href="#access" className="lp-nav__link">
            Access
          </a>
        </nav>

        {/* Right CTA actions */}
        <div className="lp-nav__actions">
          <Link to="/login" className="lp-nav__signin-btn">
            Sign in
          </Link>
          <Link to="/register" className="lp-btn lp-btn--sm lp-btn--primary">
            <span>
              Start <span className="lp-nav__cta-mid">Monitoring </span>Free
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}
