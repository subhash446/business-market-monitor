/**
 * LandingPage Component
 * Business Market Monitor — Public Landing Page
 *
 * - Hero + HeroWidget + SourcesStrip remain 100% visible on initial paint
 * - Below-the-fold `.lp-reveal` chapters hydrate identically with SSR,
 *   attaching subtle scroll transitions strictly inside guarded client useEffect
 * - Deterministic SSR: zero dynamic clock, random, or unguarded DOM calls during render
 */

import { useEffect, useRef } from 'react';
import '../styles/landing.css';
import { LandingNav } from '../components/landing/LandingNav.jsx';
import { LandingTicker } from '../components/landing/LandingTicker.jsx';
import { Hero } from '../components/landing/Hero.jsx';
import { SourcesStrip } from '../components/landing/SourcesStrip.jsx';
import { ImpactFlow } from '../components/landing/ImpactFlow.jsx';
import { SilentSlope } from '../components/landing/SilentSlope.jsx';
import { AccessTiers } from '../components/landing/AccessTiers.jsx';
import { LandingFooter } from '../components/landing/LandingFooter.jsx';

export function LandingPage() {
  const pageRef = useRef(null);

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

  return (
    <div ref={pageRef} className="lp-page">
      <a href="#main-content" className="lp-skip-link">
        Skip to main content
      </a>
      <LandingNav />
      <LandingTicker />
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
