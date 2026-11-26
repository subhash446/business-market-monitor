import { useState } from 'react';
import { IMPACT_FLOW, SAMPLE_DATA_TAG } from '../../data/landingSample.js';

/**
 * ImpactFlow — Chapter 01 Interactive Multi-Hop Supply Chain Visualizer
 *
 * Demonstrates how upstream commodity shocks propagate down to SME factory floor inputs.
 * Hovering or tapping any node highlights connected edges and surfaces causal edge notes.
 */
export function ImpactFlow() {
  const [activeNodeId, setActiveNodeId] = useState(null);

  const { nodes, edges } = IMPACT_FLOW;

  const selectedNode =
    nodes.find((n) => n.id === activeNodeId) ?? nodes[nodes.length - 1];

  // Surface connected causal edge explanation when inspecting a node
  const connectedEdge =
    edges.find((edge) => edge.to === selectedNode.id) ??
    edges.find((edge) => edge.from === selectedNode.id) ??
    edges[edges.length - 1];

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
                const edge = edges[idx];
                const edgeActive =
                  edge &&
                  activeNodeId !== null &&
                  (edge.from === activeNodeId || edge.to === activeNodeId);
                const edgeDimmed = activeNodeId !== null && !edgeActive;

                return (
                  <div key={node.id} className="lp-flow-step-wrap">
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

                    {edge && (
                      <div
                        className={`lp-flow-edge ${
                          edge.nature === 'dashed'
                            ? 'lp-flow-edge--dashed'
                            : 'lp-flow-edge--solid'
                        } ${edgeActive ? 'lp-flow-edge--active' : ''} ${
                          edgeDimmed ? 'lp-flow-edge--dimmed' : ''
                        }`}
                      >
                        <div className="lp-flow-edge__track" aria-hidden="true">
                          <span className="lp-flow-edge__line" />
                          <span className="lp-flow-edge__arrow">→</span>
                        </div>
                        <span className="lp-flow-edge__pill font-mono">
                          {edge.label}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Context Note Box for Active Node + Connected Edge Mechanism */}
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
