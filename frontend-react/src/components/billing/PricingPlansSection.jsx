import { useState } from 'react';
import { Link } from 'react-router-dom';
import { EarlyAccessPlanModal } from './EarlyAccessPlanModal.jsx';
import '../../styles/components/pricing-plans.css';

/**
 * PricingPlansSection — 3-Column SaaS Pricing Grid & Billing Cycle Switcher (V3-M5).
 *
 * Used across:
 * 1. Public Landing Page (#access section / AccessTiers.jsx) with mode="landing"
 * 2. Logged-in Settings Page (Plans & Billing tab) with mode="settings"
 *
 * Strict Design Discipline:
 * - Deterministic SSR rendering (no random IDs or time-dependent calculations).
 * - Segmented monthly/annual toggle with subtle 20% savings badge.
 * - Tabular numbers with JetBrains Mono.
 * - Solid Zinc dark palette (#18181b / #27272a) with crisp hairline borders.
 */
export function PricingPlansSection({
  mode = 'landing',
  currentWorkspaceName = '',
  userEmail = '',
}) {
  const [billingCycle, setBillingCycle] = useState('monthly'); // 'monthly' | 'annual'
  const [selectedPlanForModal, setSelectedPlanForModal] = useState(null);

  const isAnnual = billingCycle === 'annual';

  // Pricing matrix
  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      badge: 'Self-Serve SME Access',
      subtitle: 'Best for single-plant SMEs testing raw material tracking.',
      monthlyPrice: '₹0',
      annualPrice: '₹0',
      period: '/ month',
      billingNote: 'Free forever for single-plant operations',
      features: [
        'Up to 5 tracked raw materials',
        'Official EIA & Agmarknet benchmarks',
        'Daily email digest & threshold alerts',
        '30-day price history & trends',
        '1 workspace seat (OWNER)',
      ],
      isRecommended: false,
    },
    {
      id: 'growth',
      name: 'Growth',
      badge: 'Recommended',
      subtitle: 'Best for active manufacturing & procurement teams.',
      monthlyPrice: '₹2,499',
      annualPrice: '₹1,999',
      period: '/ mo',
      billingNote: isAnnual ? '₹23,988 billed annually · Save 20%' : 'Billed monthly · Cancel anytime',
      features: [
        'Unlimited tracked materials & bulk CSV upload',
        'Live USD/INR FX & Landed-Cost Parity model',
        'Two-Way WhatsApp Quote Copilot & Negotiation Advisor',
        'Automated WhatsApp + Email alerts & morning digests',
        'Inventory Reorder Engine & 14d/30d Price Outlook',
        'Up to 5 team seats (OWNER, PURCHASE_MANAGER, VIEWER)',
      ],
      isRecommended: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      badge: 'Multi-Plant & ERP Sync',
      subtitle: 'Best for multi-factory groups & custom ERP workflows.',
      monthlyPrice: '₹6,999',
      annualPrice: '₹5,599',
      period: '/ mo',
      billingNote: isAnnual ? '₹67,188 billed annually · Save 20%' : 'Billed monthly · Custom invoicing available',
      features: [
        'Everything in Growth',
        'Multi-plant workspaces & unlimited RBAC seats',
        'Dedicated WhatsApp Business API & webhook onboarding',
        'Custom Tally / ERP price sync & API access',
        'Priority onboarding & procurement ROI audit support',
      ],
      isRecommended: false,
    },
  ];

  const handleOpenModal = (plan) => {
    setSelectedPlanForModal({
      id: plan.id,
      name: plan.name,
      price: isAnnual ? `${plan.annualPrice} / mo` : `${plan.monthlyPrice} / mo`,
      billingCycle,
    });
  };

  return (
    <div className="pricing-plans-section" data-testid="pricing-plans-section">
      {/* Billing Cycle Toggle */}
      <div className="pricing-cycle-container">
        <div
          className="pricing-cycle-toggle"
          role="radiogroup"
          aria-label="Billing frequency selection"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!isAnnual}
            id="pricing-cycle-monthly-btn"
            className={`pricing-cycle-btn${!isAnnual ? ' pricing-cycle-btn--active' : ''}`}
            onClick={() => setBillingCycle('monthly')}
          >
            Monthly
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={isAnnual}
            id="pricing-cycle-annual-btn"
            className={`pricing-cycle-btn${isAnnual ? ' pricing-cycle-btn--active' : ''}`}
            onClick={() => setBillingCycle('annual')}
          >
            <span>Annual</span>
            <span className="pricing-discount-pill">Save 20%</span>
          </button>
        </div>
      </div>

      {/* 3-Column Pricing Grid */}
      <div className="pricing-grid">
        {plans.map((plan) => {
          const currentPrice = isAnnual ? plan.annualPrice : plan.monthlyPrice;

          return (
            <div
              key={plan.id}
              className={`pricing-card${plan.isRecommended ? ' pricing-card--recommended' : ''}`}
              data-testid={`pricing-card-${plan.id}`}
            >
              {/* Card Header */}
              <div className="pricing-card__header">
                <div className="pricing-card__badge-row">
                  <span
                    className={`pricing-card__badge${
                      plan.isRecommended ? ' pricing-card__badge--highlight' : ''
                    }`}
                  >
                    {plan.badge}
                  </span>
                </div>
                <h3 className="pricing-card__title">{plan.name}</h3>
                <p className="pricing-card__subtitle">{plan.subtitle}</p>

                {/* Price */}
                <div className="pricing-card__price-row">
                  <span className="pricing-card__amount font-mono">
                    {currentPrice}
                  </span>
                  <span className="pricing-card__period">{plan.period}</span>
                </div>
                <div className="pricing-card__billing-note">
                  {plan.billingNote}
                </div>
              </div>

              {/* Feature List */}
              <ul className="pricing-card__features">
                {plan.features.map((feature, idx) => (
                  <li key={idx} className="pricing-card__feature-item">
                    <i
                      className="fa-solid fa-check pricing-card__check-icon"
                      aria-hidden="true"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              {/* Action Button */}
              <div className="pricing-card__action">
                {plan.id === 'starter' ? (
                  mode === 'landing' ? (
                    <Link
                      to="/register"
                      id="starter-cta-btn"
                      className="pricing-card__btn pricing-card__btn--primary"
                    >
                      Start Monitoring Free
                    </Link>
                  ) : (
                    <button
                      type="button"
                      id="starter-current-plan-btn"
                      className="pricing-card__btn pricing-card__btn--neutral"
                      disabled
                      aria-disabled="true"
                    >
                      Current Plan · Early Access Active
                    </button>
                  )
                ) : plan.id === 'growth' ? (
                  <button
                    type="button"
                    id="growth-cta-btn"
                    className="pricing-card__btn pricing-card__btn--primary"
                    onClick={() => handleOpenModal(plan)}
                  >
                    {mode === 'settings' ? 'Upgrade to Growth' : 'Request Growth Access'}
                  </button>
                ) : (
                  <button
                    type="button"
                    id="enterprise-cta-btn"
                    className="pricing-card__btn pricing-card__btn--outline"
                    onClick={() => handleOpenModal(plan)}
                  >
                    Contact for Enterprise
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Early Access Modal */}
      <EarlyAccessPlanModal
        isOpen={Boolean(selectedPlanForModal)}
        onClose={() => setSelectedPlanForModal(null)}
        plan={selectedPlanForModal}
        mode={mode}
        currentWorkspaceName={currentWorkspaceName}
        userEmail={userEmail}
      />
    </div>
  );
}
