/**
 * LandingPage Component
 * Business Market Monitor — Public Landing Page
 *
 * High-trust, human-crafted B2B SaaS experience:
 * - Real-time commodity benchmark telemetry & interactive pure SVG graphs
 * - Upstream multi-hop impact graph
 * - Pricing asymmetry ("Silent Slope") analyzer
 * - Deterministic SSR & verified test invariants
 */

import '../styles/landing.css';
import { LandingNav } from '../components/landing/LandingNav.jsx';
import { Hero } from '../components/landing/Hero.jsx';
import { SourcesStrip } from '../components/landing/SourcesStrip.jsx';
import { ImpactFlow } from '../components/landing/ImpactFlow.jsx';
import { SilentSlope } from '../components/landing/SilentSlope.jsx';
import { AccessTiers } from '../components/landing/AccessTiers.jsx';
import { LandingFooter } from '../components/landing/LandingFooter.jsx';

export function LandingPage() {
  return (
    <div className="lp-page">
      <LandingNav />
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
