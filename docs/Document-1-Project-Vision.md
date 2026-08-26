# Document 1: Project Vision

## Document Control

| Field | Value |
|---|---|
| Project Name | Business Market Monitoring & Alert Platform |
| Document | Project Vision |
| Version | 1.2 (Frozen) |
| Status | **Approved — Frozen** |
| Phase | Version 1 (MVP) |
| Prepared By | Engineering (Architect/Lead) |
| Date | 2026-07-18 |
| Approved By | Project Owner, 2026-07-18 |

**Revision note (1.1):** Updated supported industries to reflect a domain-led, anchor-industry strategy; introduced the Industry Knowledge Base concept; added the Core Design Philosophy section on relationship modeling.

**Revision note (1.2):** Expanded the Packaged Drinking Water Knowledge Base example with full Operational Cost Driver and External Market Factor lists, to strengthen the foundation for future AI Business Intelligence (V2). **Document frozen and approved — no further changes without a formal revision.**

---

## 1. Business Problem Statement

Businesses that depend on raw materials — manufacturers, processors, and traders — operate with margins that are directly exposed to raw material price volatility. Cost of goods sold rises and falls with market conditions that can shift within days or even hours.

Today, most small and mid-sized businesses (SMEs) track these conditions through manual, fragmented, and unreliable methods: phone calls to suppliers, informal networks, scattered news sites, or generic financial media that isn't structured around their specific industry. Enterprise-grade market intelligence platforms (e.g., Bloomberg Terminal, S&P Platts, Kpler-class tools) do exist, but they are priced, designed, and built for large enterprises — not SMEs — and require expertise most small businesses don't have in-house.

The result: delayed reactions to price spikes, missed opportunities to purchase at favorable prices, inconsistent purchasing decisions, and avoidable margin erosion.

**There is a clear market gap for an affordable, self-service, industry-specific market monitoring and alerting platform designed for how SMEs actually operate.**

---

## 2. Target Users

| Tier | User | Needs |
|---|---|---|
| Primary | SME owners in manufacturing/trading | Simple, low-effort way to track raw material costs and market conditions relevant to their business |
| Primary | Procurement / purchasing managers | Timely alerts to inform buying decisions; historical data to negotiate with suppliers |
| Secondary (V1, lighter use) | Small trading firms / distributors | Market awareness to price their own offerings competitively |
| Future (V2/V3) | Commodity traders, brokers, consultants | Advanced analytics, forecasting, multi-client management |

**V1 constraint:** one authenticated user manages one business profile. Multi-user teams and multi-business management are explicitly deferred (see Section 7 and Version 3 roadmap) — this keeps the auth/data model simple now while remaining extensible later (see Section 9).

---

## 3. Supported Industries for Version 1 (Revised)

**Primary / Anchor Industry:**
- **Packaged Drinking Water** — the reference industry for V1. Deep domain knowledge here allows the platform to be designed and validated against a real, well-understood use case first, then generalized.

**Supporting Industries:**
- **Plastic Manufacturing** — direct upstream supplier relationship to Packaged Drinking Water (PET resin, caps, shrink film)
- **Food & Beverage** — shares packaging, cold-chain, and logistics cost structure
- **Dairy** — shares refrigeration/cold-chain dependency and packaging cost drivers
- **FMCG** — broader retail/distribution category these products are typically sold within

**Why this set, and why Packaged Drinking Water is the anchor:**
Building the platform around one deeply-understood industry first — rather than five shallow ones — produces a stronger MVP. The reference industry gets the platform's data model, Knowledge Base, and alerting logic *right*, and the remaining industries validate that the design generalizes, rather than all five being built shallowly at once.

The four supporting industries aren't arbitrary — they were chosen for **supply chain adjacency**: Plastic Manufacturing is a direct raw material supplier to Packaged Drinking Water; Food & Beverage and Dairy share overlapping cost structures (packaging, cold chain, transportation, energy); FMCG represents the retail category these goods live in.

> **Architect's note — FMCG is structurally different from the other four.** Packaged Drinking Water, Plastic Manufacturing, Food & Beverage, and Dairy each have a coherent, well-defined raw material profile. FMCG spans personal care, home care, food, and beverages — categories with entirely different raw materials — so it cannot be given the same depth of Knowledge Base entry without becoming either meaningless or enormous. **Recommendation:** in V1, FMCG should be a lightweight/generic template (shared cost drivers like packaging, transportation, and energy — not an exhaustive raw material list), with the option to split it into specific verticals in a later version once we see how businesses actually use it. Flagging this now so it's a conscious, cheap decision rather than something discovered mid-implementation.

---

## 4. Industry Knowledge Base *(New Concept)*

Each supported industry in V1 will have a structured **Knowledge Base entry** — static reference data maintained by the platform (not the end user) that automatically powers Industry Templates during onboarding, and becomes the foundation for future AI capabilities in V2/V3.

**Each Knowledge Base entry defines:**

| Attribute | Purpose |
|---|---|
| Raw Materials | Core inputs specific to the industry |
| Related News Keywords | Terms used to filter and tag incoming news as relevant to this industry |
| Units of Measurement | Standard units per material (kg, MT, litre, roll, etc.) |
| Cost Drivers | Broader operational costs beyond raw materials (electricity, diesel, transportation, labor) |
| External Market Factors | Macro conditions that influence costs (crude oil prices, currency exchange rates, government duties/policy, seasonal factors) |
| Raw Material Dependencies | How materials, cost drivers, and external factors influence one another |

**Example — Packaged Drinking Water Knowledge Base:**

- **Raw Materials:** PET Resin, Bottle Caps, Labels, Cartons, Shrink Film

- **Operational Cost Drivers:**
  - Electricity
  - Diesel
  - Transportation
  - Labor Cost
  - Packaging Cost

- **External Market Factors:**
  - Crude Oil Prices
  - Plastic Industry Trends
  - Government Policies
  - GST / Regulatory Changes
  - Fuel Price Changes
  - Import / Export Restrictions

- **Raw Material Dependencies (examples):**
  - PET Resin price ← driven by → Crude Oil Prices, Plastic Industry Trends
  - Shrink Film cost ← driven by → Crude Oil Prices, Plastic Industry Trends
  - Transportation cost ← driven by → Diesel, Fuel Price Changes
  - Packaging Cost ← driven by → Import / Export Restrictions, GST / Regulatory Changes
  - Overall landed material cost ← driven by → Government Policies, GST / Regulatory Changes

This level of detail is intentionally richer than what V1's UI will surface to end users (V1 shows monitoring and alerts, not analysis). The reason to capture it now, in full, is that it's exactly the structured signal V2's AI Impact Analysis and Recommendations will need — without it, V2 would require re-collecting this relationship data retroactively rather than reasoning over data V1 already has.

**How this changes the architecture (and why it matters now):**

The Knowledge Base is **master reference data**, independent of any individual business. What was previously called an "Industry Template" (Section 6) becomes a *derived view*: when a business selects an industry, its template is auto-populated from the Knowledge Base. The business's own "Raw Material Tracking" list (Section 6, item 4) is then the subset of that template the business actively chooses to monitor.

**Architect's note — Dependencies are relationships, not fields.** "Raw Material Dependencies" cannot be stored as a plain attribute on a material — it describes a relationship *between* entities (a material depends on an external factor; a cost driver depends on another cost driver). This means the database will need a dedicated association structure (e.g., a self-referencing/bridge table capturing `source`, `depends_on`, and `dependency_type`), not just extra columns. This will be formalized in the Database Design milestone, but it's called out here because it's a direct consequence of this decision — and it's precisely what allows V2's AI impact analysis to be built as a *reasoning layer on existing data*, instead of requiring a schema redesign.

---

## 5. Value Proposition

| For SMEs, who... | The platform provides... | Unlike... |
|---|---|---|
| Can't afford enterprise market intelligence tools | An affordable, self-service monitoring platform | Bloomberg/Platts-class tools priced for enterprises |
| Track prices manually and inconsistently | A centralized, industry-templated dashboard | Scattered news sites, supplier calls, spreadsheets |
| Start from a blank slate when onboarding | Knowledge-Base-powered onboarding — auto-populated raw materials, news keywords, and cost drivers | Generic templates or manual setup |
| React late to price movements | Proactive, threshold-based email alerts | Passive, manual price-checking |
| Have no historical view of price behavior | Historical trend charts to inform purchase timing | No structured record-keeping today |
| Need industry-relevant news, not generic finance news | News monitoring filtered by industry/material via Knowledge Base keywords | Generic financial news aggregators |

---

## 6. Version 1 Scope

**In scope — functional modules:**

1. **User Authentication** — registration, login, secure session handling (JWT), password hashing
2. **Business Profile** — business name, industry selection, contact details, basic settings
3. **Industry Knowledge Base** — platform-maintained reference data per industry (Section 4), powering templates
4. **Industry Templates** — auto-generated from the Knowledge Base at onboarding; raw materials, units, and news categories applied to the business
5. **Raw Material Tracking** — user selects materials from their industry template (and can add custom materials) to actively track
6. **Price Tracking** — time-series price data per tracked material (sourcing mechanism to be finalized in the Architecture phase — see Section 10)
7. **Market News Monitoring** — industry/material-tagged news feed, aggregated from external sources using Knowledge Base keywords
8. **Email Alerts** — threshold-based price alerts and periodic news digests, delivered via Nodemailer, scheduled via node-cron
9. **Dashboard** — single-screen overview: tracked materials, latest prices, recent news, active alerts
10. **Historical Price Trends** — Chart.js line charts, filterable by material and date range

**Out of scope for V1 (see Section 7 for full exclusions and rationale).**

---

## 7. Features Intentionally Excluded from Version 1

| Feature | Deferred To | Why excluded now |
|---|---|---|
| AI impact analysis / buy-sell recommendations | V2 | Requires the Knowledge Base + dependency data (Section 4) to mature first; this document's design exists specifically to avoid re-architecting for this later |
| WhatsApp alerts | V2 | Email alerting validates the alert engine first; channel-agnostic design planned (Section 9) |
| Supplier recommendations | V2 | Needs a supplier data model not yet justified by V1 scope |
| AI forecasting | V3 | Needs a mature historical dataset and proven demand for the feature |
| Multi-business / enterprise account management | V3 | Adds significant auth/data-model complexity not needed to validate MVP |
| Subscription plans / billing | V3 | Monetization comes after product-market fit, not before |
| Advanced analytics / BI dashboards | V3 | Depends on AI/forecasting groundwork from V2 |
| Native mobile app | Future | Responsive web is sufficient to validate the product |
| Multi-user / role-based team access per business | Future | Single-owner model is sufficient for MVP validation |

Excluding these isn't just about reducing V1 workload — each one either depends on data/infrastructure V1 hasn't built yet, or adds architectural complexity that isn't justified until the core product is validated.

---

## 8. High-Level Development Roadmap (Version 1 Only)

| Phase | Milestone | Output |
|---|---|---|
| 0 | Planning & Documentation *(current)* | Vision, SRS, Architecture, DB Design, API Design |
| 1 | Project Setup | Repo structure, environment config, base scaffolding |
| 2 | Authentication Module | Register/login, JWT, password security |
| 3 | Industry Knowledge Base & Templates | Reference data model, onboarding flow |
| 4 | Business Profile Module | Business creation, industry assignment |
| 5 | Raw Material & Price Tracking | Material selection, price data model & ingestion |
| 6 | Market News Monitoring | News ingestion, keyword tagging, feed UI |
| 7 | Alert Engine | Threshold logic, node-cron scheduling, Nodemailer integration |
| 8 | Dashboard & Historical Trends | Frontend, Chart.js visualizations |
| 9 | Integration Testing & QA | End-to-end test coverage |
| 10 | Code Review & Hardening | Security review, performance pass |
| 11 | Deployment | Render + managed MySQL, production config |

Each phase will be treated as its own milestone requiring review and approval before the next begins, per our development workflow.

---

## 9. Core Design Philosophy: Modeling Relationships, Not Just Data

This platform's purpose is not simply to log raw material prices — it is to understand how raw materials, operational cost drivers, and external market factors **relate to and influence one another**, so that future versions can reason about business impact without re-architecting the data model.

Concretely, this means V1 will structure the Knowledge Base (Section 4) so that:
- Raw materials are linked to the cost drivers and external factors that influence them (e.g., PET Resin ← Crude Oil price)
- These relationships are stored as first-class, queryable data — not implied or hard-coded in application logic

**V1 will not compute or reason over these relationships** — no impact scoring, no recommendations, no forecasting. That is explicitly V2/V3 territory (Section 7). But the relationships themselves must exist as structured data from day one, so V2's AI Impact Analysis can be built as a reasoning layer on top of existing data, rather than requiring a schema migration.

This same forward-compatibility principle extends to two other structural choices made during the Architecture phase:
- The **alert engine** will be designed channel-agnostically (email today, WhatsApp/other channels later) rather than hard-coded to email.
- The **business/user data model** will be designed so multi-business and multi-user support (V3) can be added by extending relationships, not restructuring existing tables.

These are noted now for transparency; they will be justified in detail in the Architecture document, not implemented yet.

---

## 10. Open Questions / Risks — To Be Resolved in Architecture Phase

These are flagged now but intentionally **not decided** in this document — they belong to Architecture/DB Design:

1. **Price data source strategy** — to be evaluated during the Architecture milestone: third-party commodity price APIs, manual/admin-curated entry, government/public datasets, direct supplier integrations, and web scraping are all on the table. This remains the single most consequential open decision: it affects cost, legality, data reliability, and the DB schema. No option is preferred yet.
2. **News data source** — RSS feeds vs. a news API vs. curated sources, filtered using Knowledge Base keywords per industry.
3. **Email verification & password reset flows** — not explicitly listed in scope, but recommended as standard for production-readiness; will confirm as part of the Auth module design.

**Resolved:** FMCG ships in V1 as a lightweight/generic template (packaging, transportation, and energy cost drivers), not a full Knowledge Base entry — confirmed and approved.

---

## Approval — Frozen

**Status: Approved and frozen (v1.2) by the Project Owner on 2026-07-18.** All sections — Business Problem Statement, Target Users, Supported Industries, Industry Knowledge Base, FMCG lightweight-template scope, Value Proposition, Version 1 Scope, Exclusions, Roadmap, and Core Design Philosophy — are approved as written.

This document is now the baseline reference for all subsequent milestones. Any future change requires a formal revision (new version number + revision note), not a silent edit.

**Next milestone: Document 2 — Software Requirements Specification (SRS).**
