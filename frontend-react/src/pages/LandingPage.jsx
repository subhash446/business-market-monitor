/**
 * LandingPage Component
 * Business Market Monitor — Interactive Industrial-Fintech Command Experience
 *
 * - Hero + HeroWidget + SourcesStrip remain 100% visible on initial paint
 * - Client-only rAF-throttled cursor border spotlight across .lp-spotlight-card & .pricing-card
 * - Zero-flash Hydration-Safe below-the-fold scroll reveal
 * - Desktop right-edge Scroll Telemetry HUD (>= 1200px)
 */

import { useEffect, useRef } from 'react';
import '../styles/landing.css';
import { LandingNav } from '../components/landing/LandingNav.jsx';
import { LandingTicker } from '../components/landing/LandingTicker.jsx';
import { LandingScrollHud } from '../components/landing/LandingScrollHud.jsx';
import { Hero } from '../components/landing/Hero.jsx';
import { SourcesStrip } from '../components/landing/SourcesStrip.jsx';
import { ImpactFlow } from '../components/landing/ImpactFlow.jsx';
import { SilentSlope } from '../components/landing/SilentSlope.jsx';
import { AccessTiers } from '../components/landing/AccessTiers.jsx';
import { LandingFooter } from '../components/landing/LandingFooter.jsx';

export function LandingPage() {
  const pageRef = useRef(null);

  // Below-the-fold IntersectionObserver reveal (SSR renders 100% visible)
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !pageRef.current ||
      typeof IntersectionObserver === 'undefined'
    ) {
      return;
    }

    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      return;
    }

    const targets = Array.from(pageRef.current.querySelectorAll('.lp-reveal')).filter(
      (el) => el.getBoundingClientRect().top > window.innerHeight * 0.92
    );

    if (targets.length === 0) {
      return;
    }

    targets.forEach((el) => el.classList.add('lp-reveal--pending'));

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.remove('lp-reveal--pending');
            entry.target.classList.add('lp-reveal--visible');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 }
    );

    targets.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      targets.forEach((el) => {
        el.classList.remove('lp-reveal--pending');
      });
    };
  }, []);

  // rAF-throttled metallic cursor border & sheen spotlight across dark cards
  useEffect(() => {
    if (typeof window === 'undefined' || !pageRef.current) return;

    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const finePointer =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(pointer: fine)').matches;
    if (prefersReduced || !finePointer) return;

    const container = pageRef.current;
    let rafId = null;
    let lastClientX = 0;
    let lastClientY = 0;

    function updateSpotlights() {
      rafId = null;
      const cards = container.querySelectorAll('.lp-spotlight-card, .pricing-card');
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const pad = 80;
        const near =
          lastClientX >= rect.left - pad &&
          lastClientX <= rect.right + pad &&
          lastClientY >= rect.top - pad &&
          lastClientY <= rect.bottom + pad;

        if (!near) {
          card.style.setProperty('--spot-opacity', '0');
          return;
        }

        const x = lastClientX - rect.left;
        const y = lastClientY - rect.top;
        card.style.setProperty('--mx', `${x.toFixed(1)}px`);
        card.style.setProperty('--my', `${y.toFixed(1)}px`);
        card.style.setProperty('--spot-opacity', '1');
      });
    }

    function onPointerMove(e) {
      lastClientX = e.clientX;
      lastClientY = e.clientY;
      if (rafId === null) {
        rafId = window.requestAnimationFrame(updateSpotlights);
      }
    }

    function onPointerLeave() {
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
        rafId = null;
      }
      const cards = container.querySelectorAll('.lp-spotlight-card, .pricing-card');
      cards.forEach((card) => card.style.setProperty('--spot-opacity', '0'));
    }

    container.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerleave', onPointerLeave, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      container.removeEventListener('pointermove', onPointerMove);
      container.removeEventListener('pointerleave', onPointerLeave);
    };
  }, []);

  return (
    <div ref={pageRef} className="lp-page">
      <a href="#main-content" className="lp-skip-link">
        Skip to main content
      </a>
      <LandingNav />
      <LandingTicker />
      <LandingScrollHud />
      <main id="main-content">
        <Hero />
        <SourcesStrip />
        <ImpactFlow />
        <SilentSlope />
        <AccessTiers />
      </main>
      <LandingFooter />
    </div>
  );
}

export default LandingPage;
