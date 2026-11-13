# T-05 Step 4 — Frontend Material Impact-Chain Panel Verification & Closure Report

- **Date:** 2026-11-12
- **Scope:** BMM V2 T-05 Step 4 (`frontend-react/` Material Impact-Chain Panel, route integration, API client, and verification)
- **Protected Route:** `/materials/:materialId/impact`
- **Backend Endpoint:** `GET /api/v1/materials/:materialId/impact-analysis[?maxDepth=1..4]`
- **Overall Frontend Status:** **PASS** (Unit/SSR + Lint + Production Build + Real Headless Chrome QA against intercepted `/api/v1/*` fixtures); **Live MySQL-backed E2E Browser Run: NOT RUN** (excluded by task boundary)

---

## 1. Evidence Provenance (SSR vs. Real Browser QA vs. Live Backend/DB)

| Verification Layer | Tooling / Target | Data Source | Status |
| --- | --- | --- | --- |
| **Unit & Vite SSR Suite** | `node --test tests/**/*.test.js` + Vite `ssrLoadModule` (`renderToStaticMarkup`) | Mocked `fetch` & SSR props fixtures | **PASS** (`37/37` tests, `12` suites) |
| **Static Linter & Build** | `oxlint` (`56` files) & `vite build` (`86` modules) | Local `frontend-react/` source | **PASS** (`0` lint errors, `17` pre-existing warnings; build in `618ms`) |
| **Real Headless Browser QA** | Python Playwright + Google Chrome `157.0.8103.51` (`channel="chrome"`, headless) against `npm --prefix frontend-react run dev` (`127.0.0.1:5173`) | Browser-level HTTP `page.route('**/api/v1/**')` QA fixtures matching verified backend contracts | **PASS** (Tests 1–5 + Desktop/Tablet/Mobile + Keyboard `:focus-visible`) |
| **Live Full-Stack E2E (Browser → Express → MySQL)** | Integrated browser automation against running `backend/` + `bmm_t05_verify` | Live MySQL database | **NOT RUN** (connecting to MySQL and modifying `.env` prohibited by task safety boundaries; agent browser MCP plugin not installed) |

---

## 2. Implemented Component Architecture

- **API Client:** [`frontend-react/src/api/aiInsights.api.js`](../frontend-react/src/api/aiInsights.api.js)
  - Exports `DEFAULT_IMPACT_MAX_DEPTH = 3`, `HARD_IMPACT_MAX_DEPTH = 4`, and `getMaterialImpactAnalysis(materialId, { maxDepth } = {})`.
  - Uses existing `get` / `apiRequest` infrastructure from [`client.js`](../frontend-react/src/api/client.js) (Bearer token injection, `401` single refresh retry, session-expired redirect callback).
  - Validates `materialId` (positive integer) and `maxDepth` (`1..4` integer when provided), throwing `ApiError(..., 'VALIDATION_ERROR', 400)` without silent coercion.
- **Formatting, Enums, Disclosures & Error Mapping:** [`frontend-react/src/utils/impactAnalysis.js`](../frontend-react/src/utils/impactAnalysis.js)
  - Verbatim constants `STRUCTURAL_KB_DISCLOSURE` and `OBSERVED_EVIDENCE_DISCLOSURE`.
  - Exact `kb_impact.coverage` metadata across all 6 backend statuses plus fallback.
  - Exact uppercase entity enum mapping (`RAW_MATERIAL`, `COST_DRIVER`, `EXTERNAL_FACTOR`) and dependency enum mapping (`DRIVES_COST`, `INFLUENCES`, `CORRELATES_WITH`) with safe fallbacks.
  - Null-safe `formatPercentChange`, `formatAgeDays`, `formatStaleStatus` (displays `No price history` whenever `latest_recorded_at == null` or `valid_price_count === 0`), and `formatImpactError`.
- **Presentation Panel:** [`MaterialImpactPanel.jsx`](../frontend-react/src/components/ui/MaterialImpactPanel.jsx) & [`MaterialImpactPanel.css`](../frontend-react/src/components/ui/MaterialImpactPanel.css)
  - Purely props-driven, dark-theme token-aligned UI with depth selector (`1..4`, default `3`), `Refresh` trigger, `← Back to Materials`, loading `<Skeleton type="panel" />`, `<ErrorState />` (non-retryable `404`/`400` vs retryable `5xx`/network), inline alert preserving prior loaded data on failed refresh, and XSS-safe JSX text rendering.
- **Route Controller Page:** [`MaterialImpactPage.jsx`](../frontend-react/src/pages/MaterialImpactPage.jsx)
  - Reads `:materialId` via `useParams()`, resets cleanly via `<MaterialImpactView key={materialId} />`, and guards async `getMaterialImpactAnalysis` requests with `createLatestRequestGuard()` (`next()`, `isCurrent(seq)`, `invalidate()`).
- **Route & Navigation Wiring:**
  - [`App.jsx`](../frontend-react/src/App.jsx): Registers `/materials/:materialId/impact` inside `<ProtectedRoute requireBusiness />` and `<AppLayout />`.
  - [`MaterialsPage.jsx`](../frontend-react/src/pages/MaterialsPage.jsx): Renders `Impact` link inside `ActionLinks` exclusively when `material.isTracked` is `true`.
  - [`TrendsPage.jsx`](../frontend-react/src/pages/TrendsPage.jsx): Adds `View Impact Chains` navigation link in Tab 1 when a material (`phMaterialId`) is selected without duplicating `<InsightCard />`.

---

## 3. API Contract, Structural Disclosure & Safety Preservation

- **Structural vs. Observed Separation:**
  - Section A displays `STRUCTURAL_KB_DISCLOSURE` verbatim (`"Structural Knowledge-Base Relationships Only — These relationships describe possible structural pathways and are not proof of real-world causation."`), `kb_impact.warning` (when returned), `kb_impact.coverage`, `traversal_direction` (`Source → Target (Downstream path)`), `max_depth_applied`, `summary` metrics, entity chip groups, and ordered hop-by-hop steps marked `structural_only`.
  - Section B displays a visually distinct `Observed Data Only` badge and disclosure, `signal_assessment` metrics, `warnings`, and `relevant_news` metadata (`title`, `source_name`, `published_at`) as plain text cards without fabricated external `<a href="http...">` links.
  - Section C reuses [`InsightCard.jsx`](../frontend-react/src/components/ui/InsightCard.jsx) read-only for `latest_ai_insight` (`BULLISH`, `BEARISH`, `NEUTRAL`, `VOLATILE`), with **zero** synchronous AI generation endpoints or buttons.
- **Authentication & Tenant Isolation:**
  - Route `/materials/:materialId/impact` enforces `<ProtectedRoute requireBusiness />`.
  - API calls retain `Bearer` token authorization and session-expiry handling; tenant isolation remains strictly enforced server-side (`businessId` from verified JWT).

---

## 4. Real Headless Browser QA Results (Intercepted `/api/v1/*` Fixtures)

Executed on **Google Chrome `157.0.8103.51`** via Python Playwright against the Vite dev server (`http://127.0.0.1:5173`):

| QA Test | Verified Behavior | Result |
| --- | --- | --- |
| **Pre-Auth Guard** | Unauthenticated visit to `/materials/42/impact` redirected to `/login`. | **PASS** |
| **Test 1 — Tracked Material & Navigation** | Logged in via `/login`; verified `/materials` renders `Impact` link for tracked material `42` and omits it for untracked material `99`; navigated to `/materials/42/impact`; verified material name, unit (`kg`), verbatim structural disclosure, `Source → Target` direction, ordered hops (`Hop 1 · Drives cost`, `Hop 2 · Influences`), separate `Observed Data Only` section with no external `http` news hrefs, reused `InsightCard` (`Bullish`, no AI trigger button); verified `/trends?materialId=42` shows single `View Impact Chains` link and single `InsightCard`. | **PASS** |
| **Test 2 — Depth Selector & Race Guard** | Default depth `3` active (`aria-pressed="true"`); clicked `1`, `2`, `4`, `3` and confirmed `maxDepth` query params and `Max Depth Applied` updates; simulated slow `450ms` response for depth `1` followed `50ms` later by fast depth `4` and waited past depth `1` arrival—confirmed `FRESH_DEPTH_4_CHAIN` remained rendered and stale depth `1` never overwrote UI. | **PASS** |
| **Test 3 — Empty & Edge States** | Verified `custom_material_no_kb_links` (`warning` banner rendered), `missing_industry_context` (`No industry linked`), `no_kb_dependencies` (`No KB pathways recorded`), missing price telemetry (`No price history`, never `Recent (≤30 days)`), and `latest_ai_insight: null` (`No insight available yet`). | **PASS** |
| **Test 4 — Error & 401 Handling** | Verified `404` on `/materials/999/impact` (`Material not found`, no retry button); aborted network error (`Network error` + `Try again` recovery); `500` on `Refresh` while data loaded (keeps existing chains visible with `role="alert"` + inline `Retry` that recovers cleanly); `401` with failed `/auth/refresh` redirects to `/login`. Zero uncaught `pageerror` events. | **PASS** |
| **Test 5 — Responsive Viewports & Keyboard** | **Desktop (`1280×800`)**: `scrollWidth=1280`, `overflowX=false`, `2` chain steps side-by-side (`left` increases), `bodyFontSize=16px`. **Tablet (`768×1024`)**: `scrollWidth=768`, `overflowX=false`. **Mobile (`375×812`)**: `scrollWidth=375`, `overflowX=false`, chain steps stacked vertically (`step2.top >= step1.bottom - 2`). **Keyboard**: Tab from depth `1` focused depth `2` (`:focus-visible` matched with `2px solid` outline) and `Enter` activated `Max Depth Applied: 2`. | **PASS** |

---

## 5. Bugs Found & Fixes Applied

- **Earlier Code Review Pass (already verified before browser QA):**
  - Corrected uppercase backend KB entity enums (`RAW_MATERIAL`, `COST_DRIVER`, `EXTERNAL_FACTOR`) and dependency enums (`DRIVES_COST`, `INFLUENCES`, `CORRELATES_WITH`) in [`impactAnalysis.js`](../frontend-react/src/utils/impactAnalysis.js).
  - Added `.impact-depth-btn:focus-visible` outline rule in [`MaterialImpactPanel.css`](../frontend-react/src/components/ui/MaterialImpactPanel.css).
  - Corrected test fixtures (`outlook: 'BULLISH'`, uppercase entity/dependency enums) and expanded coverage in [`impactAnalysis.test.js`](../frontend-react/tests/impactAnalysis.test.js).
- **Browser QA Pass:**
  - **0 UI/application bugs** found during Chrome QA execution.
  - Note: Initial QA harness mock for `GET /materials` needed alignment with the actual backend array response envelope (`{ success: true, data: [...] }`) in the temporary scratch QA script; zero application files required edits.

---

## 6. Regression Verification Results (Final Run)

- **`npm --prefix frontend-react test`**: **PASS** — `37` tests, `12` suites, `37` passed, `0` failed, `0` skipped.
- **`npm --prefix frontend-react run lint`**: **PASS** (`oxlint` across `56` files) — `0` errors, `17` pre-existing warnings (`0` warnings in T-05 Step 4 added/modified files).
- **`npm --prefix frontend-react run build`**: **PASS** (`vite build`) — `86` modules transformed in `618ms` (`dist/index.html`, `dist/assets/index-CbylaB7l.css`, `dist/assets/index-BloltvEV.js`).

---

## 7. Limitations, Untested Scenarios & Closure Readiness

- **Untested in this session:** Live browser → running Express server → MySQL `bmm_t05_verify` end-to-end execution was not run because connecting to MySQL, running migrations/seeds, and altering `.env` were explicitly prohibited for this step, and no IDE browser MCP plugin was installed.
- **Preservation Guarantee:** All prior uncommitted repository work, backend files, migrations, `bmm_t05_verify`, `.env`, and Git commit state remain intact and unmodified.
- **Closure Readiness:** **Ready for T-05 Step 4 Closure** (code-complete, unit/SSR tested, linted, built, and verified in real headless Chrome across all UI states and viewports). Recommend running one quick interactive smoke check against the live local Express server + `bmm_t05_verify` when you next start the full stack locally before proceeding to **T-05 Step 5**.
