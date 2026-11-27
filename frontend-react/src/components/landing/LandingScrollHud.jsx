import { useEffect, useState } from 'react';

const HUD_CHAPTERS = [
  { id: 'hero-top', code: '00 · LIVE' },
  { id: 'how-it-works', code: '01 · GRAPH' },
  { id: 'supplier-benchmark', code: '02 · LEAK' },
  { id: 'access', code: '03 · ACCESS' },
];

/**
 * LandingScrollHud — Desktop-only right-edge vertical telemetry rail (>= 1200px)
 *
 * - Displays real-time continuous scroll progress bar and active section telemetry code
 * - Deterministic SSR defaults to chapter '00 · LIVE' with 0% progress
 */
export function LandingScrollHud() {
  const [activeId, setActiveId] = useState('hero-top');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let rafId = null;

    function updateTelemetry() {
      rafId = null;
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const nextProgress = Math.max(0, Math.min(1, window.scrollY / maxScroll));
      setProgress(nextProgress);

      const threshold = window.innerHeight * 0.42;
      let nextActive = 'hero-top';
      for (const ch of HUD_CHAPTERS) {
        if (ch.id === 'hero-top') continue;
        const el = document.getElementById(ch.id);
        if (el && el.getBoundingClientRect().top <= threshold) {
          nextActive = ch.id;
        }
      }
      setActiveId(nextActive);
    }

    function scheduleUpdate() {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(updateTelemetry);
    }

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  function handleJump(targetId) {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior = reduced ? 'auto' : 'smooth';

    if (targetId === 'hero-top') {
      window.scrollTo({ top: 0, behavior });
      return;
    }

    const el = document.getElementById(targetId);
    if (el) {
      el.scrollIntoView({ behavior, block: 'start' });
    }
  }

  return (
    <aside
      className="lp-scroll-hud"
      id="landing-scroll-hud"
      aria-label="Section telemetry navigation"
    >
      <div className="lp-hud-track" aria-hidden="true">
        <div
          className="lp-hud-fill"
          style={{ transform: `scaleY(${progress.toFixed(4)})` }}
        />
      </div>

      <ul className="lp-hud-list">
        {HUD_CHAPTERS.map((ch) => {
          const isActive = activeId === ch.id;
          return (
            <li key={ch.id} className="lp-hud-item">
              <button
                type="button"
                className={`lp-hud-btn ${isActive ? 'lp-hud-btn--active' : ''}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={() => handleJump(ch.id)}
              >
                <span className="lp-hud-dot" aria-hidden="true" />
                <span className="lp-hud-code font-mono">{ch.code}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
