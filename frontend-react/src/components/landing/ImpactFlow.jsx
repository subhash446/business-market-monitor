import { useState } from 'react';
import { IMPACT_FLOW, SAMPLE_DATA_TAG } from '../../data/landingSample.js';

/**
 * ImpactFlow — Interactive Multi-Hop Supply Chain Visualizer
 *
 * Demonstrates how upstream commodity shocks propagate down to SME factory floor inputs.
 * Hovering or tapping any node highlights its dependencies and dims unrelated nodes to 40% opacity.
 */
export function ImpactFlow() {
  const [activeNodeId, setActiveNodeId] = useState(null);

  const { nodes, edges } = IMPACT_FLOW;

  // Active note detail: defaults to selected node or last target node
  const selectedNode =
    nodes.find((n) => n.id === activeNodeId) ?? nodes[nodes.length - 1];

  return (
    <section id="how-it-works" className="lp-section" aria-label="How BMM Impact Chains Work">
      <div className="lp-container">
        {/* Section Heading */}
        <div className="lp-section-header">
          <div className="lp-section-tag">Supply Chain Graph Engine</div>
          <h2 className="lp-section-title">
            Anticipate Price Shifts <span className="lp-text-gradient">Upstream.</span>
          </h2>
          <p className="lp-section-desc">
            Raw material price hikes rarely occur in isolation. BMM maps structural
            feedstock dependencies and calculates empirical lag correlations so you see
            cost pressures 10–14 days before your supplier calls.
          </p>
        </div>

        {/* Visualizer Container */}
        <div className="lp-flow-card">
          <div className="lp-flow-header">
            <span className="lp-flow-header__title">
              Interactive 3-Hop Cost Propagation Chain
            </span>
            <span className="lp-sample-tag">{SAMPLE_DATA_TAG}</span>
          </div>

          <div className="lp-flow-body">
            {/* Interactive Node Chain */}
            <div className="lp-flow-chain">
              {nodes.map((node, idx) => {
                const isHovered = activeNodeId === node.id;
                const isDimmed = activeNodeId !== null && !isHovered;

                return (
                  <div key={node.id} className="lp-flow-step-wrap">
                    {/* Node Card */}
                    <button
                      type="button"
                      className={`lp-flow-node ${isHovered ? 'lp-flow-node--active' : ''} ${
                        isDimmed ? 'lp-flow-node--dimmed' : ''
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
                        <span className="lp-flow-node__type font-mono">Hop {idx + 1}</span>
                      </div>
                      <div className="lp-flow-node__title">{node.title}</div>
                      <div className="lp-flow-node__metric font-mono">{node.metric}</div>
                      <div className="lp-flow-node__sublabel">{node.sublabel}</div>
                    </button>

                    {/* Edge Connector to Next Node */}
                    {idx < nodes.length - 1 && (
                      <div
                        className={`lp-flow-edge ${
                          edges[idx]?.nature === 'dashed'
                            ? 'lp-flow-edge--dashed'
                            : 'lp-flow-edge--solid'
                        }`}
                      >
                        <div className="lp-flow-edge__line" />
                        <span className="lp-flow-edge__pill font-mono">
                          {edges[idx]?.label}
                        </span>
                        <div className="lp-flow-edge__arrow" aria-hidden="true">→</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Context Note Box for Active Node */}
            <div className="lp-flow-detail-box">
              <div className="lp-flow-detail-box__top">
                <span className="lp-flow-detail-box__label">
                  Selected Node Insight: <strong>{selectedNode.title}</strong>
                </span>
                <span className="lp-flow-detail-box__badge font-mono">
                  {selectedNode.badge}
                </span>
              </div>
              <p className="lp-flow-detail-box__note">{selectedNode.note}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
