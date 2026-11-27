import { Fragment, useEffect, useState } from 'react';
import { IMPACT_FLOW, SAMPLE_DATA_TAG } from '../../data/landingSample.js';
import { RollingMetric } from './RollingMetric.jsx';
import { SignalPill } from './SignalPill.jsx';

const SHOCK_TIMELINE_STEPS = [
  { phase: 1, day: 'Day 0', label: 'Brent +5% Shock' },
  { phase: 2, day: 'Day 4', label: 'Naphtha Pass-Through' },
  { phase: 3, day: 'Day 11', label: 'PET ₹121.40/kg' },
];

const SHOCK_SUBLABELS = [
  'Day 0 · Shock Origin (+5.0% spike)',
  'Day 4 · Cracker Feedstock Pass-Through',
  'Day 11 · Projected Packaging Impact',
];

const SHOCK_NOTES = {
  1: 'Day 0: Brent Crude jumps +5.0% ($82.40 → $86.52/bbl). Structural petrochemical regression initiates upward cost pressure toward Naphtha.',
  2: 'Day 4: Naphtha feedstock reprices to +7.6% 30d shift. Historical lag telemetry confirms converters preparing downstream contract revisions.',
  3: 'Day 11 (Projected Impact): PET Resin reaches ₹121.40/kg (+12.8%). Recommendation switches to ACCELERATE PURCHASE to lock pre-pass-through quotes.',
};

function renderNodeMetric(idx, fallbackMetric, isNodeShocked) {
  if (idx === 0) {
    return (
      <>
        <RollingMetric
          value={isNodeShocked ? 86.52 : 82.4}
          prefix="$"
          suffix="/bbl ("
          decimals={2}
          durationMs={380}
        />
        <RollingMetric
          value={isNodeShocked ? 8.2 : 3.2}
          showPlusSign
          decimals={1}
          suffix="%)"
          durationMs={380}
        />
      </>
    );
  }
  if (idx === 1) {
    return (
      <RollingMetric
        value={isNodeShocked ? 7.6 : 4.1}
        showPlusSign
        decimals={1}
        suffix="% 30d shift"
        durationMs={380}
      />
    );
  }
  if (idx === 2) {
    return (
      <>
        <RollingMetric
          value={isNodeShocked ? 121.4 : 114.5}
          prefix="₹"
          suffix="/kg ("
          decimals={2}
          durationMs={420}
        />
        <RollingMetric
          value={isNodeShocked ? 12.8 : 6.4}
          showPlusSign
          decimals={1}
          suffix="%)"
          durationMs={420}
        />
      </>
    );
  }
  return fallbackMetric;
}

/**
 * ImpactFlow — Chapter 01 Interactive Multi-Hop Supply Chain Visualizer
 *
 * - Equal 3-column CSS Grid tracks on desktop so all 3 node cards align at identical width/height
 * - Continuous flowing left-to-right SVG pulses across STRUCTURAL dashed & OBSERVED solid connectors
 * - Playable "Simulate +5% Crude Shock" wave propagating Day 0 -> Day 4 -> Day 11 with odometer deltas
 * - Hovering or tapping any node spotlights connected edges and displays causal mechanism copy
 */
export function ImpactFlow() {
  const [activeNodeId, setActiveNodeId] = useState(null);
  const [shockPhase, setShockPhase] = useState(0);

  const { nodes, edges } = IMPACT_FLOW;

  useEffect(() => {
    if (shockPhase === 0 || shockPhase >= 3) return undefined;

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reducedMotion) {
      const id = window.setTimeout(() => setShockPhase(3), 0);
      return () => window.clearTimeout(id);
    }

    const timerId = window.setTimeout(() => {
      setShockPhase((curr) => (curr > 0 && curr < 3 ? curr + 1 : curr));
    }, 950);

    return () => window.clearTimeout(timerId);
  }, [shockPhase]);

  const handleToggleShock = () => {
    if (shockPhase > 0) {
      setShockPhase(0);
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    setShockPhase(reducedMotion ? 3 : 1);
  };

  const selectedNode =
    nodes.find((n) => n.id === activeNodeId) ?? nodes[nodes.length - 1];

  const connectedEdge =
    edges.find((edge) => edge.to === selectedNode.id) ??
    edges.find((edge) => edge.from === selectedNode.id) ??
    edges[edges.length - 1];

  const isShockActive = shockPhase > 0;

  return (
    <section
      id="how-it-works"
      className="lp-section lp-reveal"
      aria-label="How BMM Impact Chains Work"
    >
      <div className="lp-container">
        {/* Numbered Left-Aligned Editorial Chapter Header */}
        <div className="lp-chapter-header">
          <div className="lp-chapter-header__lead">
            <div className="lp-chapter-eyebrow">
              <span className="lp-chapter-index">01</span>
              <span>/ Supply Chain Graph Engine</span>
            </div>
            <h2 className="lp-section-title">
              Anticipate Price Shifts Upstream.
            </h2>
          </div>

          <p className="lp-section-desc">
            Raw material price hikes rarely occur in isolation. BMM maps structural
            feedstock dependencies and calculates empirical lag correlations so you see
            cost pressures 10&ndash;14 days before your supplier calls.
          </p>
        </div>

        {/* Visualizer Container */}
        <div className="lp-flow-card lp-spotlight-card">
          <div className="lp-flow-header">
            <div className="lp-flow-header__left">
              <span className="lp-flow-header__title">
                Interactive 3-Hop Cost Propagation Chain
              </span>
              {isShockActive && (
                <span className="lp-shock-badge font-mono" data-testid="shock-active-badge">
                  SIMULATED SHOCK &middot; ILLUSTRATIVE
                </span>
              )}
            </div>

            <div className="lp-flow-header__actions">
              <button
                type="button"
                id="simulate-shock-btn"
                className={`lp-shock-btn font-mono ${isShockActive ? 'lp-shock-btn--active' : ''}`}
                onClick={handleToggleShock}
                aria-pressed={isShockActive}
              >
                <span className="lp-shock-btn__dot" aria-hidden="true" />
                <span>{isShockActive ? 'Reset Simulation' : 'Simulate +5% Crude Shock'}</span>
              </button>
              <span className="lp-sample-tag">{SAMPLE_DATA_TAG}</span>
            </div>
          </div>

          <div className="lp-flow-body">
            {/* Interactive Symmetric Node Chain */}
            <div className="lp-flow-chain">
              {nodes.map((node, idx) => {
                const isHovered = activeNodeId === node.id;
                const isDimmed = !isShockActive && activeNodeId !== null && !isHovered;
                const isNodeShocked = shockPhase >= idx + 1;
                const isNodePulse = shockPhase === idx + 1;

                const edge = edges[idx];
                const edgeActive =
                  (edge &&
                    activeNodeId !== null &&
                    (edge.from === activeNodeId || edge.to === activeNodeId)) ||
                  shockPhase >= idx + 1;
                const edgeDimmed = !isShockActive && activeNodeId !== null && !edgeActive;
                const edgeWaveActive = shockPhase === idx + 1;
                const isDashed = edge?.nature === 'dashed';

                return (
                  <Fragment key={node.id}>
                    <button
                      type="button"
                      className={`lp-flow-node ${isHovered ? 'lp-flow-node--active' : ''} ${
                        isDimmed ? 'lp-flow-node--dimmed' : ''
                      } ${isNodeShocked ? 'lp-flow-node--shocked' : ''} ${
                        isNodePulse ? 'lp-flow-node--shock-pulse' : ''
                      }`}
                      onPointerEnter={() => setActiveNodeId(node.id)}
                      onPointerLeave={() => setActiveNodeId(null)}
                      onClick={() =>
                        setActiveNodeId((curr) => (curr === node.id ? null : node.id))
                      }
                      aria-label={`${node.title}: ${node.metric}`}
                    >
                      <div className="lp-flow-node__top">
                        <span className="lp-flow-node__badge">{node.badge}</span>
                        <span className="lp-flow-node__type font-mono">
                          {isNodeShocked ? SHOCK_TIMELINE_STEPS[idx].day : `Hop ${idx + 1}`}
                        </span>
                      </div>
                      <div className="lp-flow-node__title">{node.title}</div>
                      <div className="lp-flow-node__metric font-mono">
                        {renderNodeMetric(idx, node.metric, isNodeShocked)}
                      </div>
                      <div className="lp-flow-node__sublabel">
                        {isNodeShocked ? SHOCK_SUBLABELS[idx] : node.sublabel}
                      </div>
                    </button>

                    {edge && (
                      <div
                        className={`lp-flow-edge ${
                          isDashed ? 'lp-flow-edge--dashed' : 'lp-flow-edge--solid'
                        } ${edgeActive ? 'lp-flow-edge--active' : ''} ${
                          edgeDimmed ? 'lp-flow-edge--dimmed' : ''
                        } ${shockPhase >= idx + 1 ? 'lp-flow-edge--shocked' : ''}`}
                      >
                        <div className="lp-flow-edge__track" aria-hidden="true">
                          <svg
                            className="lp-flow-edge__svg"
                            viewBox="0 0 156 16"
                            preserveAspectRatio="none"
                          >
                            <line
                              x1="0"
                              y1="8"
                              x2="146"
                              y2="8"
                              stroke={
                                shockPhase >= idx + 1
                                  ? 'rgba(245, 158, 11, 0.45)'
                                  : isDashed
                                  ? 'rgba(255, 255, 255, 0.22)'
                                  : 'rgba(56, 189, 248, 0.32)'
                              }
                              strokeWidth="1.5"
                              strokeDasharray={isDashed ? '4 4' : undefined}
                            />
                            <line
                              x1="0"
                              y1="8"
                              x2="146"
                              y2="8"
                              pathLength={isDashed ? undefined : '100'}
                              stroke={
                                shockPhase >= idx + 1
                                  ? '#f59e0b'
                                  : isDashed
                                  ? '#93c5fd'
                                  : '#38bdf8'
                              }
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeDasharray={isDashed ? '4 4' : '22 78'}
                              className={isDashed ? 'lp-flow-edge__dash-flow' : 'lp-flow-edge__pulse'}
                            />
                            <polygon
                              points="144,4 154,8 144,12"
                              fill={
                                shockPhase >= idx + 1
                                  ? '#f59e0b'
                                  : isDashed
                                  ? '#93c5fd'
                                  : '#38bdf8'
                              }
                            />
                          </svg>
                          {edgeWaveActive && (
                            <span
                              className="lp-shock-dot"
                              data-testid={`shock-dot-${idx}`}
                              aria-hidden="true"
                            />
                          )}
                        </div>

                        <span className="lp-flow-edge__pill font-mono">
                          {edge.label}
                        </span>
                        <span className="lp-flow-edge__mobile-arrow" aria-hidden="true">↓</span>
                      </div>
                    )}
                  </Fragment>
                );
              })}
            </div>

            {/* Context Note Box for Shockwave Progression or Active Node Inspection */}
            <div className={`lp-flow-detail-box ${isShockActive ? 'lp-flow-detail-box--shock' : ''}`}>
              {isShockActive && (
                <div className="lp-shock-timeline" aria-label="Simulation Timeline">
                  {SHOCK_TIMELINE_STEPS.map((step) => {
                    const reached = shockPhase >= step.phase;
                    const current = shockPhase === step.phase;
                    return (
                      <div
                        key={step.phase}
                        className={`lp-shock-step ${reached ? 'lp-shock-step--reached' : ''} ${
                          current ? 'lp-shock-step--current' : ''
                        }`}
                      >
                        <span className="lp-shock-step__day font-mono">{step.day}</span>
                        <span className="lp-shock-step__label">{step.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="lp-flow-detail-box__top">
                <span className="lp-flow-detail-box__label">
                  {isShockActive && activeNodeId === null ? (
                    <>
                      Simulated Shockwave: <strong>+5% Upstream Crude Spike</strong>
                    </>
                  ) : (
                    <>
                      Selected Node Insight: <strong>{selectedNode.title}</strong>
                    </>
                  )}
                </span>

                {isShockActive && shockPhase === 3 && activeNodeId === null ? (
                  <SignalPill signal="ACCELERATE_PURCHASE" />
                ) : (
                  <span className="lp-flow-detail-box__badge font-mono">
                    {isShockActive && activeNodeId === null
                      ? `STEP ${shockPhase} OF 3`
                      : selectedNode.badge}
                  </span>
                )}
              </div>

              <p className="lp-flow-detail-box__note">
                {isShockActive && activeNodeId === null
                  ? SHOCK_NOTES[shockPhase]
                  : selectedNode.note}
              </p>

              {connectedEdge?.description && (
                <div className="lp-flow-detail-box__edge-note">
                  <span className="font-mono">{connectedEdge.type}</span> &middot;{' '}
                  {connectedEdge.description}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
