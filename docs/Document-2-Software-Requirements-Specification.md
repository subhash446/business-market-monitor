# Document 2: Software Requirements Specification (SRS)

## Document Control

| Field | Value |
|---|---|
| Project Name | Business Market Monitoring & Alert Platform |
| Document | Software Requirements Specification |
| Version | 1.1 (Frozen) |
| Status | **Approved — Frozen** |
| Phase | Version 1 (MVP) |
| Baseline Reference | Document 1: Project Vision (v1.2, Frozen) |
| Prepared By | Engineering (Architect/Lead) |
| Date | 2026-07-18 |
| Approved By | Project Owner, 2026-07-18 |

**Revision note (1.1):** Resolved OI-1 (Knowledge Base maintained via seed data/scripts, no admin UI in V1) and OI-2 (Password Reset confirmed mandatory in V1; Email Verification made optional/non-blocking). Added FR-IKB-05, FR-NEWS-05, FR-DASH-04, FR-PRICE-05, FR-ALERT-08. **Document frozen and approved — no further changes without a formal revision.**

**Traceability rule:** every requirement in this document maps to a scope item explicitly approved in Document 1, Section 6. No requirement introduces new scope; this document exists to make the approved scope precise, testable, and unambiguous enough to design a database and API against.

---

## 1. Introduction

### 1.1 Purpose
This SRS defines the functional and non-functional requirements for Version 1 of the Business Market Monitoring & Alert Platform. It is the technical contract between product intent (Document 1) and system design (Documents 3–5: Architecture, Database Design, API Design). Every requirement here must be satisfiable without contradicting Document 1's frozen scope.

### 1.2 Intended Audience
Engineering (architecture, implementation, QA) for this phase; extensible for future onboarding of additional engineers as the team grows.

### 1.3 Scope
Covers Version 1 only, as frozen in Document 1. AI Business Intelligence, WhatsApp alerts, supplier recommendations, forecasting, multi-business management, subscriptions, and advanced analytics are explicitly **not** specified here — see Document 1, Section 7.

### 1.4 Definitions

| Term | Meaning |
|---|---|
| Business | The single business profile owned by an authenticated user in V1 |
| Industry Knowledge Base (IKB) | Platform-maintained reference data per industry (Document 1, §4) |
| Industry Template | The subset of an IKB entry auto-applied to a Business at onboarding |
| Tracked Material | A raw material a Business has actively chosen to monitor |
| Price Point | A single timestamped price observation for a Tracked Material |
| Alert Rule | A user-defined condition (e.g., price threshold) that triggers a notification |
| Alert Event | A specific instance of an Alert Rule firing |

---

## 2. Overall Description

### 2.1 Product Perspective
V1 is a standalone web application (not a component of an existing system). It is the foundation for V2 (AI Business Intelligence) and V3 (Enterprise SaaS) — see Document 1, §9 (Core Design Philosophy) for the forward-compatibility commitments that constrain this SRS.

### 2.2 User Classes

| Class | Description | V1 Access Level |
|---|---|---|
| Registered Business User | Owns exactly one Business profile | Full access to their own Business's data |
| Unauthenticated Visitor | Not logged in | Access to registration/login only |
| System (scheduled jobs) | node-cron driven processes | Internal — price/news ingestion, alert evaluation |

There is no admin/staff user class in V1's functional scope, **except** for one operational necessity: someone must maintain the Industry Knowledge Base content (Section 5.3). This is flagged as Open Item OI-1 (Section 8).

### 2.3 Operating Environment
- Server: Node.js + Express.js, deployed on Render
- Database: MySQL (managed instance)
- Client: Modern evergreen browsers (Chrome, Edge, Firefox, Safari — last 2 major versions), desktop and mobile-responsive via Bootstrap
- Scheduled jobs: node-cron, running within the Node.js process (single-instance assumption — see NFR-SC-03)

### 2.4 Constraints
- Must use the approved stack only: Node.js/Express, MySQL, vanilla HTML/CSS/JS + Bootstrap + Chart.js frontend, Nodemailer, node-cron (per project instructions — no framework substitutions without explicit approval)
- Must not implement any Section 7 (Document 1) excluded feature, even partially
- Price data source is **not yet decided** (Document 1, §10) — functional requirements in Section 5.6 are written to be source-agnostic so they hold regardless of that decision

### 2.5 Assumptions and Dependencies
- A price data sourcing decision will be made in the Architecture phase before Section 5.6 requirements are implemented (not before they're designed)
- Outbound email delivery (Nodemailer) assumes an SMTP provider will be configured at deployment; provider selection is an Architecture-phase decision
- News ingestion assumes at least one external source (API or RSS) is reachable from the Render environment

---

## 3. Non-Functional Requirements

| ID | Category | Requirement |
|---|---|---|
| NFR-SEC-01 | Security | Passwords must be hashed using a strong adaptive algorithm (bcrypt or equivalent); plaintext passwords must never be logged or stored |
| NFR-SEC-02 | Security | All authenticated endpoints must validate a JWT (or equivalent session token) and reject requests without a valid, unexpired token |
| NFR-SEC-03 | Security | A Business User must never be able to read, modify, or delete another Business's data (enforced at the query layer, not just the UI) |
| NFR-SEC-04 | Security | All user input must be validated and sanitized server-side before persistence or use in queries (parameterized queries only — no string-concatenated SQL) |
| NFR-SEC-05 | Security | Sensitive configuration (DB credentials, JWT secret, SMTP credentials) must be provided via environment variables, never committed to source control |
| NFR-PERF-01 | Performance | Dashboard initial load must return in under 2 seconds under normal load (single-business query volume expected in V1) |
| NFR-PERF-02 | Performance | Historical price trend queries must remain performant as price history grows — requires appropriate indexing (formalized in Document 4: DB Design) |
| NFR-SC-01 | Scalability | The data model must support horizontal growth in tracked materials, price points, and news items without structural redesign |
| NFR-SC-02 | Scalability | The Industry Knowledge Base must support adding new industries without code changes — data-driven, not hard-coded per industry |
| NFR-SC-03 | Scalability | Scheduled jobs (alert evaluation, price/news ingestion) must be designed so they can move to a dedicated worker process in a later version without a rearchitecture, even though V1 runs them in-process |
| NFR-REL-01 | Reliability | A failure in the news ingestion job must not block or fail the price ingestion job, or vice versa (independent failure domains) |
| NFR-REL-02 | Reliability | Failed email alert deliveries must be logged and retryable, not silently dropped |
| NFR-USE-01 | Usability | Onboarding (registration → business profile → industry template applied) must be completable in under 5 minutes for a first-time user |
| NFR-USE-02 | Usability | The application must be responsive and functional on both desktop and mobile browsers (Bootstrap-based responsive layout) |
| NFR-MAINT-01 | Maintainability | Backend code must follow a modular structure (separated routes/controllers/services/data-access) so modules can be extended independently — see Document 3: Architecture |
| NFR-MAINT-02 | Maintainability | No business logic duplicated across modules — shared logic (e.g., alert threshold evaluation) must live in one reusable place |

---

## 4. External Interface Requirements

### 4.1 User Interface
- Bootstrap-based responsive web UI
- Core screens: Login/Register, Onboarding (Business + Industry selection), Dashboard, Material Tracking management, News feed, Alert Rules management, Historical Trends (Chart.js)

### 4.2 Software Interfaces
- MySQL (data persistence) — connection details defined in Document 4
- SMTP provider via Nodemailer (outbound email) — provider TBD in Architecture
- External price/news data source(s) — TBD in Architecture (Document 1, §10, Open Item)

### 4.3 Communication Interfaces
- HTTPS only for all client-server communication (no unencrypted HTTP in production)

---

## 5. Functional Requirements

Each module below traces to Document 1, Section 6.

### 5.1 User Authentication (Document 1, Scope Item 1)

| ID | Requirement |
|---|---|
| FR-AUTH-01 | System shall allow a new user to register with email, password, and basic profile info |
| FR-AUTH-02 | System shall enforce a minimum password strength policy at registration |
| FR-AUTH-03 | System shall reject registration with an email already in use |
| FR-AUTH-04 | System shall allow a registered user to log in with email + password and receive a signed session token (JWT) |
| FR-AUTH-05 | System shall reject login attempts with invalid credentials without revealing whether the email or password was incorrect |
| FR-AUTH-06 | System shall allow a logged-in user to log out (client-side token invalidation at minimum; server-side blacklisting optional for V1) |
| FR-AUTH-07 | System shall support password reset via emailed link. **(Mandatory in V1.)** |
| FR-AUTH-08 | System shall support email verification at registration. **(Optional in V1 — should not block registration, login, or deployment if not completed in time; may ship as a best-effort/deferred sub-feature.)** |

> **Resolved (OI-2):** Password Reset (FR-AUTH-07) is confirmed mandatory for V1. Email Verification (FR-AUTH-08) is confirmed optional and non-blocking — implement if time permits, but it must not gate any other Auth flow or delay release.

### 5.2 Business Profile (Scope Item 2)

| ID | Requirement |
|---|---|
| FR-BIZ-01 | System shall allow a logged-in user to create exactly one Business profile (name, industry, contact details, location) |
| FR-BIZ-02 | System shall require industry selection from the supported list (Document 1, §3) during Business creation |
| FR-BIZ-03 | System shall allow a user to edit their Business profile details after creation |
| FR-BIZ-04 | System shall prevent Business creation from completing until an industry has been selected (industry drives Template application, FR-TPL-01) |

### 5.3 Industry Knowledge Base (Scope Item 3)

| ID | Requirement |
|---|---|
| FR-IKB-01 | System shall maintain one Knowledge Base entry per supported industry, containing: Raw Materials, Related News Keywords, Units of Measurement, Operational Cost Drivers, External Market Factors, and Raw Material Dependencies (Document 1, §4) |
| FR-IKB-02 | System shall store Raw Material Dependencies as relationships between entities (material↔material, material↔cost driver, material↔external factor), not as flat text fields |
| FR-IKB-03 | System shall support the FMCG industry as a lightweight entry (Cost Drivers and general News Keywords only, no exhaustive Raw Materials list), per Document 1, §3 |
| FR-IKB-04 | Knowledge Base content shall be maintainable without code deployment (data-driven, editable via seed data or an internal tool — mechanism TBD in Architecture) |
| FR-IKB-05 | The Industry Knowledge Base shall support storing multi-level dependency relationships between Raw Materials, Operational Cost Drivers, and External Market Factors, so future AI reasoning can traverse complete business impact chains without requiring database redesign |

> **Architect's note on FR-IKB-05:** this raises the bar beyond FR-IKB-02's direct (one-hop) relationships to true multi-level chains — e.g., External Factor → Cost Driver → Raw Material → dependent Raw Material. A flat foreign-key pair won't traverse that; Document 4 (Database Design) will need to evaluate a recursive/self-referencing structure (MySQL 8's `WITH RECURSIVE`, or a closure-table pattern) to make chain traversal queryable rather than requiring application-level graph-walking. Flagging now so it's a conscious input to that design, not decided here.

### 5.4 Industry Templates (Scope Item 4)

| ID | Requirement |
|---|---|
| FR-TPL-01 | System shall automatically generate an Industry Template for a Business immediately upon industry selection, populated from the matching Knowledge Base entry |
| FR-TPL-02 | System shall present the generated Template to the user during onboarding for review before finalizing |
| FR-TPL-03 | Template generation shall not require any manual data entry from the user beyond selecting their industry |

### 5.5 Raw Material Tracking (Scope Item 5)

| ID | Requirement |
|---|---|
| FR-MAT-01 | System shall allow a user to select any subset of their Industry Template's Raw Materials as "Tracked" |
| FR-MAT-02 | System shall allow a user to add a custom Raw Material not present in their Industry Template |
| FR-MAT-03 | System shall allow a user to stop tracking a previously tracked material without deleting its historical price data |
| FR-MAT-04 | System shall associate each Tracked Material with a Unit of Measurement, inherited from the Knowledge Base or set manually for custom materials |

### 5.6 Price Tracking (Scope Item 6)

| ID | Requirement |
|---|---|
| FR-PRICE-01 | System shall store a time-series of Price Points for each Tracked Material (value, unit, timestamp, source) |
| FR-PRICE-02 | System shall record the source of each Price Point (to support future trust/quality scoring in V2) |
| FR-PRICE-03 | System shall support ingesting Price Points on a scheduled basis (mechanism/source TBD — Document 1, §10, Open Item OI-3 below) |
| FR-PRICE-04 | System shall expose the current (most recent) price for each Tracked Material to the Dashboard |
| FR-PRICE-05 | System shall preserve complete historical price records and never overwrite previous price observations |

> **Note:** FR-PRICE-03 is intentionally source-agnostic. It will be refined with a concrete mechanism once the Architecture milestone resolves the price data source decision.

### 5.7 Market News Monitoring (Scope Item 7)

| ID | Requirement |
|---|---|
| FR-NEWS-01 | System shall ingest news items from at least one external source on a scheduled basis |
| FR-NEWS-02 | System shall tag each ingested news item with the industry/material it's relevant to, using Knowledge Base News Keywords (FR-IKB-01) for matching |
| FR-NEWS-03 | System shall display news items relevant to a Business's tracked industry/materials in a dedicated feed |
| FR-NEWS-04 | System shall avoid displaying duplicate news items ingested from multiple passes of the same source |
| FR-NEWS-05 | The system shall allow configurable industry-specific keyword sets for news filtering and categorization |

### 5.8 Email Alerts (Scope Item 8)

| ID | Requirement |
|---|---|
| FR-ALERT-01 | System shall allow a user to define a price threshold Alert Rule for any Tracked Material (e.g., "notify if price rises above X" or "falls below X") |
| FR-ALERT-02 | System shall evaluate active Alert Rules on a scheduled basis (node-cron) against the latest Price Points |
| FR-ALERT-03 | System shall send an email notification (Nodemailer) when an Alert Rule's condition is met, recording the resulting Alert Event |
| FR-ALERT-04 | System shall prevent duplicate alert emails for the same Alert Event (no repeated notification for a condition that remains true across multiple evaluation cycles, unless explicitly re-armed) |
| FR-ALERT-05 | System shall allow a user to enable/disable or delete an Alert Rule |
| FR-ALERT-06 | System shall support a periodic news digest email (frequency configurable, default weekly) summarizing relevant news items |
| FR-ALERT-07 | Alert delivery logic shall be implemented behind a channel-agnostic interface so a non-email channel (e.g., WhatsApp, V2) can be added later without modifying Alert Rule evaluation logic (Document 1, §9) |
| FR-ALERT-08 | The system shall maintain a complete alert history for all notifications sent |

### 5.9 Dashboard (Scope Item 9)

| ID | Requirement |
|---|---|
| FR-DASH-01 | System shall display, on a single screen: all Tracked Materials with current price, recent relevant news items, and active Alert Rules/recent Alert Events |
| FR-DASH-02 | System shall visually indicate materials with a recent significant price change (definition of "significant" configurable, default a percentage threshold) |
| FR-DASH-03 | Dashboard data shall reflect the latest available Price Points and news at time of page load (no manual refresh required beyond page load) |
| FR-DASH-04 | The dashboard shall display the last successful synchronization time for both price data and news data |

### 5.10 Historical Price Trends (Scope Item 10)

| ID | Requirement |
|---|---|
| FR-HIST-01 | System shall render a line chart (Chart.js) of Price Points over time for any selected Tracked Material |
| FR-HIST-02 | System shall allow filtering the trend view by date range |
| FR-HIST-03 | System shall allow comparing two or more Tracked Materials' trends on the same chart (basic multi-line comparison) |

---

## 6. Data Requirements Overview

This section states *what data must be capturable*, not the schema itself (schema is Document 4: Database Design). It formalizes Document 1 §4 and §9 into requirement form:

- DR-01: Every Raw Material must be linkable to zero or more Cost Drivers and External Market Factors it depends on (supports FR-IKB-02)
- DR-02: Every Price Point must retain its full history — updates create new records, they do not overwrite prior values (supports FR-HIST-01, and preserves data for future forecasting in V3)
- DR-03: Every Alert Event must be retained as an audit record, even after the triggering Alert Rule is later disabled or deleted
- DR-04: The schema must allow a Business to belong to exactly one Industry in V1, structured so a future version can relax this to many without restructuring the core Business entity (Document 1, §9)

*Note: FR-PRICE-05 and FR-ALERT-08 (Section 5) formalize DR-02 and DR-03 respectively as explicit, testable functional requirements — not new obligations, just elevated from implied data behavior to acceptance-checkable requirements.*

---

## 7. Acceptance Criteria (Module-Level, Summary)

Detailed test cases will be written per module during implementation; at the SRS level, each module is considered acceptance-ready when:
- All FR-xxx requirements for that module are implemented and demonstrable end-to-end
- Applicable NFR-xxx requirements (especially NFR-SEC-03, data isolation) are verified
- No Section 7 (Document 1) excluded feature has been introduced

---

## 8. Open Items — Resolved

- **OI-1 (Resolved):** Industry Knowledge Base maintained via seed data / engineering-managed DB scripts in V1. No admin panel in scope.
- **OI-2 (Resolved):** Password Reset (FR-AUTH-07) is mandatory in V1. Email Verification (FR-AUTH-08) is optional and non-blocking — see Section 5.1.

---

## Approval — Frozen

**Status: Approved and frozen (v1.1) by the Project Owner on 2026-07-18.** All sections — Non-Functional Requirements, Functional Requirements per module (including FR-IKB-05, FR-NEWS-05, FR-DASH-04, FR-PRICE-05, FR-ALERT-08), and resolutions to OI-1 and OI-2 — are approved as written.

This document is now, alongside Document 1, a baseline reference for all subsequent milestones. Any future change requires a formal revision (new version number + revision note), not a silent edit.

**Next milestone: Document 3 — System Architecture.**
