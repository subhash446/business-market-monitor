# Document 3 (Frontend): Frontend Architecture & UI Design Specification

## Document Control

| Field | Value |
|---|---|
| Project Name | Business Market Monitoring & Alert Platform |
| Document | Frontend Architecture & UI Design Specification |
| Version | 1.1 (Approved — Frozen) |
| Status | **Approved — Frozen** |
| Phase | Version 1 Frontend Implementation |
| Baseline Reference | Document 1: Project Vision (v1.2, Frozen) · Document 2: SRS (v1.1, Frozen) · Document 5: API Design (v1.1, Frozen) · Project Understanding Report (2026-08-08) |
| Prepared By | Engineering (Frontend Architect) |
| Date | 2026-08-10 |

**Source-of-truth hierarchy:** Where any frozen backend document conflicts with the *actual runtime behavior of the v1.0.0 backend code*, the actual backend behavior governs implementation feasibility. All such conflicts are explicitly documented in Section 12.

**Scope of this document:** Frontend only. The backend is frozen at v1.0.0 and must not be modified.

---

## Table of Contents

1. [Frontend Architecture](#1-frontend-architecture)
2. [Folder Structure](#2-folder-structure)
3. [API Integration Architecture](#3-api-integration-architecture)
4. [Authentication Architecture](#4-authentication-architecture)
5. [Application / Page Architecture](#5-application--page-architecture)
6. [Navigation Architecture](#6-navigation-architecture)
7. [Reusable UI Components](#7-reusable-ui-components)
8. [State Management](#8-state-management)
9. [Responsive Architecture](#9-responsive-architecture)
10. [Accessibility Architecture](#10-accessibility-architecture)
11. [Security Considerations](#11-security-considerations)
12. [Backend Limitations the Frontend Must Respect](#12-backend-limitations-the-frontend-must-respect)
13. [Page-to-API Mapping Table](#13-page-to-api-mapping-table)
14. [Error / Loading / Empty-State Strategy](#14-error--loading--empty-state-strategy)
15. [Design System Architecture](#15-design-system-architecture)
16. [Implementation Phases](#16-implementation-phases)
17. [Approval Checklist](#17-approval-checklist)

---

## 1. Frontend Architecture

### 1.1 Approved Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Structure | HTML5 | Semantic elements throughout |
| Styling | CSS3, custom CSS only | No Bootstrap, no Tailwind, no other CSS framework |
| Logic | Vanilla JavaScript ES6+ | No React, Vue, Angular, or any JS framework |
| HTTP | Fetch API (native) | No axios or other HTTP libraries |
| Charts | Chart.js (CDN) | Used only on the Trends page |
| Icons | Font Awesome (CDN) | Icon library |
| Typography | Google Fonts — Inter | Loaded via `<link>` in `<head>` |

### 1.2 MPA vs. SPA Decision

**Decision: Multi-Page Application (MPA) with a shared JavaScript module layer.**

#### Rationale

- Document 6 (Project Folder Structure) explicitly defines `pages/login.html`, `pages/register.html`, `pages/dashboard.html`, `pages/materials.html`, `pages/alerts.html`, `pages/trends.html` — this is the already-approved MPA shape.
- No build step is required or permitted. The frontend is plain static files served directly by the Express backend via `express.static`.
- Without a framework, a client-side SPA requires significant hand-rolled routing, history management, and component lifecycle logic — introducing high complexity and fragility. The MPA avoids all of this.
- Each page is an independent HTML document, making debugging and progressive development straightforward.

#### Trade-offs Accepted

| Trade-off | Mitigation |
|---|---|
| Hard navigation on page transitions | Native browser caching of shared CSS/JS minimises perception of reload |
| Repeated auth guard logic per page | Centralised `auth.js` module runs the check identically on every page load |
| No shared DOM state between pages | State serialised to `sessionStorage`/`localStorage` where needed (Section 8) |

**Alternative considered — client-side SPA with manual hash routing:** rejected. The added complexity of a hand-written router, history API management, and lifecycle cleanup outweighs the benefit of eliminating page reloads at this project scope.

### 1.3 Overall Structure Philosophy

```
One HTML file per user-facing screen
  → loads shared CSS bundle (one <link> per CSS file in <head>)
  → loads shared JS utilities (auth, api, ui) as <script type="module">
  → loads page-specific JS module last
  → page JS calls shared API layer, manipulates its own DOM section
```

No global namespace pollution. Every JS file uses ES6 module syntax (`import`/`export`). Module scripts are deferred by default — no `defer` attribute needed.

### 1.4 Rendering Model

All rendering is **client-side dynamic**. The server sends only static HTML shells; all data comes from the REST API via `fetch`. There is no server-side rendering, no template engine, no JSX.

Each page HTML file contains:
- Semantic structure (nav, main, aside where applicable)
- Placeholder regions (e.g., `<div id="materials-list"></div>`) that JavaScript fills with API data
- Inline loading/error regions that JS shows/hides via CSS class toggling
- No hardcoded data content

### 1.5 Deployment Model

The Express backend serves `frontend/` as static files at the server root:
- Frontend origin === backend origin (`http://localhost:5000` in dev)
- No CORS issues in normal operation — all API calls go to the same origin
- **Relative API paths** are used throughout: `/api/v1/...` (no hardcoded domain)
- Single-deployment design — one process, one origin, one deployment target

---

## 2. Folder Structure

```
frontend/
|
+-- index.html                    # Entry point — redirects to dashboard or login
|
+-- pages/                        # One HTML file per screen
|   +-- login.html
|   +-- register.html
|   +-- forgot-password.html      # Password reset request form
|   +-- reset-password.html       # Password reset confirm form (token in query string)
|   +-- onboarding.html           # Business profile creation + industry selection
|   +-- dashboard.html            # Main dashboard
|   +-- materials.html            # Material tracking management
|   +-- prices.html               # Price entry for a selected material
|   +-- alerts.html               # Alert rules + alert events
|   +-- news.html                 # Industry news feed
|   +-- trends.html               # Historical price trends + compare
|
+-- css/
|   +-- variables.css             # CSS custom properties (design tokens)
|   +-- reset.css                 # Minimal cross-browser reset
|   +-- base.css                  # Typography, body, global element defaults
|   +-- layout.css                # Page shell, sidebar, header, main content area
|   +-- components.css            # Buttons, forms, cards, tables, modals, badges
|   +-- utilities.css             # Single-purpose utility classes (flex, spacing, text)
|   +-- pages/
|       +-- dashboard.css         # Dashboard-specific overrides
|       +-- trends.css            # Trends chart layout
|       +-- auth.css              # Auth pages centred card layout
|
+-- js/
|   +-- api/                      # API layer — one file per backend module
|   |   +-- client.js             # Core fetch wrapper, token injection, error handling
|   |   +-- auth.api.js           # /auth/* endpoints
|   |   +-- business.api.js       # /business endpoints
|   |   +-- materials.api.js      # /materials endpoints
|   |   +-- prices.api.js         # /materials/:id/prices endpoints
|   |   +-- trends.api.js         # /materials/:id/prices/history + /prices/compare
|   |   +-- news.api.js           # /news endpoint
|   |   +-- alerts.api.js         # /alerts/rules + /alerts/events endpoints
|   |   +-- dashboard.api.js      # /dashboard endpoint
|   |   +-- knowledgeBase.api.js  # /industries + /units-of-measurement endpoints
|   |
|   +-- auth/
|   |   +-- auth.js               # Token storage, decoding, refresh flow, guard functions
|   |   +-- session.js            # Cached user/business data in sessionStorage
|   |
|   +-- components/               # Reusable UI component builders (return DOM nodes)
|   |   +-- nav.js                # Navigation loader — fetches and injects nav.html fragment
|   |   +-- toast.js              # Toast/snackbar notifications
|   |   +-- modal.js              # Generic modal dialog
|   |   +-- confirm.js            # Confirmation dialog (wraps modal.js)
|   |   +-- pagination.js         # Pagination controls
|   |   +-- loader.js             # Skeleton + spinner loading states
|   |   +-- emptyState.js         # Empty-state cards
|   |   +-- errorState.js         # Error-state display
|   |   +-- chart.js              # Chart.js wrapper for trend/compare charts
|   |
|   +-- utils/
|   |   +-- dom.js                # DOM helpers (qs, qsa, show, hide, addClass, etc.)
|   |   +-- format.js             # Date, currency, number formatters
|   |   +-- validate.js           # Client-side form validation helpers
|   |   +-- router.js             # Page guard + redirect utility
|   |
|   +-- pages/                    # One JS file per page (page controller)
|       +-- index.js              # Entry point redirect logic
|       +-- login.js
|       +-- register.js
|       +-- forgot-password.js
|       +-- reset-password.js
|       +-- onboarding.js
|       +-- dashboard.js
|       +-- materials.js
|       +-- prices.js
|       +-- alerts.js
|       +-- news.js
|       +-- trends.js
|
+-- components/
|   +-- nav.html                  # Navigation fragment — single source of truth for sidebar markup
|
+-- assets/
    +-- icons/                    # Custom SVG icons not in Font Awesome
    +-- images/                   # Illustrations, logo, app graphics
    +-- fonts/                    # (empty — Google Fonts loaded via CDN)
```

### 2.1 File Naming Conventions

| Element | Convention | Example |
|---|---|---|
| HTML pages | `kebab-case.html` | `forgot-password.html` |
| CSS files | `kebab-case.css` | `variables.css` |
| JS modules | `camelCase.js` or `domain.layer.js` | `auth.api.js`, `toast.js` |
| CSS custom properties | `--prefix-property` | `--color-primary`, `--space-4` |
| CSS component classes | BEM: `block__element--modifier` | `.card`, `.card__title`, `.btn--primary` |
| JS functions | `camelCase` | `fetchDashboard()`, `showToast()` |
| JS constants | `SCREAMING_SNAKE_CASE` | `API_BASE`, `TOKEN_KEY` |

### 2.2 Script Loading Strategy

Each page HTML loads in this order:

```html
<!-- 1. Google Fonts (in <head>) -->
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">

<!-- 2. Shared CSS (in <head>) -->
<link rel="stylesheet" href="/css/variables.css">
<link rel="stylesheet" href="/css/reset.css">
<link rel="stylesheet" href="/css/base.css">
<link rel="stylesheet" href="/css/layout.css">
<link rel="stylesheet" href="/css/components.css">
<link rel="stylesheet" href="/css/utilities.css">
<!-- page-specific CSS where needed -->

<!-- 3. Font Awesome (in <head>, CDN) -->
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

<!-- 4. Chart.js (trends.html only, at end of <body>) -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>

<!-- 5. Page JS module (type="module", at end of <body>) -->
<script type="module" src="/js/pages/dashboard.js"></script>
```

All JS files use `type="module"` to enable ES6 `import`/`export` and avoid global scope pollution.

---

## 3. API Integration Architecture

### 3.1 Base Configuration

**File:** `js/api/client.js`

```js
const API_BASE = '/api/v1'; // Relative — works for same-origin single-deployment
```

No hardcoded `http://localhost:5000`. Relative paths ensure the frontend works on any host without changes.

### 3.2 Core Fetch Wrapper

`client.js` exports a single async function `apiRequest(method, path, body, options)` that:

1. Constructs the full URL: `API_BASE + path`
2. Reads the access token from storage via `auth.js`
3. Builds request headers: `Content-Type: application/json` (for POST/PUT/PATCH with body) + `Authorization: Bearer <accessToken>` (if token exists)
4. Calls `fetch()` with the constructed request
5. Parses JSON response
6. Handles the universal `{ success, data, meta }` envelope:
   - `success === true` → returns `{ data, meta }`
   - `success === false` → throws a structured `ApiError` with `{ code, message, details, status }`
7. Handles HTTP status codes (see Section 3.4)
8. Handles network errors (no response received)

**Design decision:** The wrapper always returns the inner `data` (not the envelope wrapper), so callers work directly with the payload. `meta` is returned alongside for paginated callers. This keeps all call sites clean and consistent.

### 3.3 Module-Specific API Files

Each file in `js/api/` imports `apiRequest` from `client.js` and exports named async functions:

```
auth.api.js          : register(body), login(body), refresh(token), logout(),
                       requestPasswordReset(email), confirmPasswordReset(token, newPassword)

business.api.js      : createBusiness(body), getBusiness(), updateBusiness(body)

materials.api.js     : listMaterials(params), addMaterial(body), updateMaterial(id, body)

prices.api.js        : getLatestPrice(materialId), addPrice(materialId, body)

trends.api.js        : getPriceHistory(materialId, params), comparePrices(params)

news.api.js          : listNews(params)

alerts.api.js        : listAlertRules(), createAlertRule(body), updateAlertRule(id, body),
                       deleteAlertRule(id), listAlertEvents(params)

dashboard.api.js     : getDashboard()

knowledgeBase.api.js : listIndustries(), getIndustry(id), getIndustryKnowledgeBase(id),
                       listUnitsOfMeasurement()
```

### 3.4 HTTP Status Code Handling

| Status | Handling |
|---|---|
| `200`, `201` | Parse envelope, check `success`, resolve with `{ data, meta }` |
| `400` | Parse `error.details` array, throw `ApiError` with code `VALIDATION_ERROR` |
| `401` | Trigger token refresh flow (Section 4.5). If refresh also fails → logout + redirect to login |
| `403` | Throw `ApiError` with code `AUTHORIZATION_ERROR` |
| `404` | Throw `ApiError` with code `NOT_FOUND` — caller decides: empty state or error |
| `409` | Throw `ApiError` with code `CONFLICT` |
| `429` | Throw `ApiError` with code `RATE_LIMITED` — show "Too many attempts" message |
| `500` | Throw `ApiError` with code `INTERNAL_ERROR` — show generic error only |
| Network error | Throw `ApiError` with code `NETWORK_ERROR` — show connection error |

**Rule:** Server `error.message` may be shown for 400/401/409. For 500 and network errors, always show "Something went wrong. Please try again." — never expose server details.

### 3.5 Pagination Parameters

Functions accepting pagination pass `{ page, limit }` as query parameters.

Defaults:
- `page`: 1
- `limit`: 20 (news, alert events), 50 (price history)

The `meta` object `{ page, limit, total, totalPages }` is passed directly to the `pagination.js` component.

### 3.6 Request Safety

- A loading flag (`isLoading`) is set per-page before any API call and cleared on completion.
- Submit buttons are disabled while a request is in flight to prevent double submission.

---

## 4. Authentication Architecture

### 4.1 Token Storage

**Decision: `localStorage` for tokens, `sessionStorage` for cached derived data.**

| Item | Key | Storage |
|---|---|---|
| Access token | `bmm_access_token` | `localStorage` |
| Refresh token | `bmm_refresh_token` | `localStorage` |
| Cached user payload | `bmm_user` | `sessionStorage` |
| Cached business data | `bmm_business` | `sessionStorage` |

**Rationale:** `httpOnly` cookies would require backend changes (frozen). `sessionStorage` for tokens logs the user out on every new tab. `localStorage` persists across tabs and restarts — acceptable for this application scope. XSS mitigations are addressed in Section 11.

### 4.2 Token Decoding — No `/auth/me`

The backend has **no `/auth/me` endpoint** (deliberately omitted per Document 5). User identity is obtained by:

1. At **login / register**: tokens received in response. The access token payload is base64url-decoded client-side to extract `{ sub (userId), email, businessId, exp }`.
2. The decoded payload is stored in `sessionStorage` as `bmm_user`.
3. On subsequent page loads, `auth.js` reads from `sessionStorage` first.
4. If `sessionStorage` is empty (new tab, cleared storage), the payload is re-decoded from the stored access token.

**Decoding:** Split JWT on `.`, take second segment, base64url-decode, parse as JSON. Read-only — the frontend never constructs or signs tokens.

**No server call is made purely to identify the current user.**

### 4.3 `auth.js` Exports

| Export | Purpose |
|---|---|
| `getAccessToken()` | Returns stored access token or `null` |
| `getRefreshToken()` | Returns stored refresh token or `null` |
| `setTokens(accessToken, refreshToken)` | Stores both, decodes + caches user payload |
| `clearTokens()` | Removes all auth data from localStorage and sessionStorage |
| `getCurrentUser()` | Returns cached decoded payload `{ userId, email, businessId }` |
| `isAuthenticated()` | Returns `true` if access token exists |
| `getBusinessId()` | Returns `businessId` from payload (may be `null`) |
| `hasBusinessProfile()` | Returns `true` if `businessId !== null` |

### 4.4 Route Guards (`router.js`)

Every protected page calls guards as the first action in its page JS:

```
requireAuth()          →  if !isAuthenticated()     →  redirect to /pages/login.html
requireBusiness()      →  if !hasBusinessProfile()  →  redirect to /pages/onboarding.html
```

Public pages call:

```
redirectIfAuthenticated()
  → if isAuthenticated() && hasBusinessProfile()  →  /pages/dashboard.html
  → if isAuthenticated() && !hasBusinessProfile() →  /pages/onboarding.html
```

These run synchronously on page load before any API calls.

### 4.5 Access Token Refresh Flow

When any API request receives `401 AUTHENTICATION_ERROR`:

```
1. Check if refresh token exists.
2. If yes → POST /api/v1/auth/refresh with { refreshToken }
3. If refresh succeeds → setTokens(newAccessToken, existingRefreshToken) → retry original request once
4. If refresh returns 401 → clearTokens() → redirect to /pages/login.html?reason=session_expired
5. If no refresh token → clearTokens() → redirect to /pages/login.html
```

Retry is done **once only**. This flow is transparent to page-level code — pages only see either a successful result or a final `ApiError` after the refresh has already been attempted.

### 4.6 Login Flow

1. User submits `login.html` form
2. Call `authApi.login({ email, password })`
3. On success: `auth.setTokens(accessToken, refreshToken)` → read `businessId` from decoded token
4. If `businessId !== null` → redirect to `/pages/dashboard.html`
5. If `businessId === null` → redirect to `/pages/onboarding.html`
6. On 401: inline error "Invalid email or password"
7. On 400: field-level validation messages
8. On 429: "Too many login attempts. Please wait and try again."

The login page detects `?reason=session_expired` and shows: "Your session has expired. Please sign in again."

### 4.7 Registration Flow

1. User submits `register.html` form
2. Call `authApi.register({ email, password, fullName })`
3. On success (201): call `authApi.login({ email, password })` → `auth.setTokens()` → redirect to `/pages/onboarding.html`
4. On 409 CONFLICT: "An account with this email already exists."
5. On 400 VALIDATION_ERROR: field-level messages

**Auto-login after registration** avoids asking the user to re-enter credentials.

### 4.8 Logout Flow

1. User clicks "Log out" in sidebar
2. Confirmation dialog: "Are you sure you want to log out?"
3. On confirm: call `authApi.logout()` (fire-and-forget) → `auth.clearTokens()` → redirect to `/pages/login.html`

Note: Logout is client-side only. Stateless JWTs are not server-side invalidated.

### 4.9 Password Reset Flow

**Request (`forgot-password.html`):**
1. User enters email, submits
2. Call `authApi.requestPasswordReset(email)`
3. Always show: "If that email is registered, a reset link has been sent." (prevents enumeration)
4. Form replaced by success message (no redirect)

**Confirm (`reset-password.html`):**
1. Extract `token` from `?token=` query string
2. If no token in URL → show "Invalid or missing reset link."
3. User enters new password → call `authApi.confirmPasswordReset(token, newPassword)`
4. On success: "Password updated successfully." + link to login
5. On 401: "This reset link is invalid or has expired."
6. On 400: password strength error

### 4.10 Post-Business-Creation Token Refresh

After creating a business on the onboarding page, the stored access token still has `businessId: null`. The onboarding page must:

1. Call `POST /business` → receive `{ id, materialsGenerated }`
2. Call `POST /auth/refresh` to issue a new token containing `businessId`
3. Call `auth.setTokens(newAccessToken, existingRefreshToken)`
4. Redirect to dashboard

This is mandatory — without the refresh, `requireBusiness()` on all subsequent pages redirects back to onboarding.

---

## 5. Application / Page Architecture

### 5.1 Entry Point (`index.html` / `index.js`)

Pure redirect logic — no UI content:

```
isAuthenticated() && hasBusinessProfile()  → /pages/dashboard.html
isAuthenticated() && !hasBusinessProfile() → /pages/onboarding.html
!isAuthenticated()                         → /pages/login.html
```

### 5.2 Authentication Pages

**`login.html`** — Public. Single centred card layout, no sidebar. Email + password inputs. "Forgot password?" and "Create account" links. Inline error area.

**`register.html`** — Public. Single centred card. Full name, email, password inputs. Password strength hint. "Already have an account?" link. Field-level error display.

**`forgot-password.html`** — Public. Email input. Form replaced by success message on submit (no redirect). Back to login link.

**`reset-password.html`** — Public. New password input. Token from `?token=` URL param (not shown to user). Success state with login link. Error state for invalid/expired tokens.

### 5.3 Onboarding Page (`onboarding.html`)

**Auth guard:** `requireAuth()` only (not `requireBusiness()` — this is where the business is created).

**Multi-step flow:**

**Step 1 — Industry Selection:**
- `GET /api/v1/industries` on page load (public endpoint)
- Grid of 5 industry cards with name and description
- "Continue" enabled only after selection

**Step 2 — Business Details:**
- Business name (required), contact email, phone, address (optional)
- "Back" returns to Step 1, preserving both steps in JS variables
- "Create Business" button submits

**Step 3 — Confirmation:**
- "Your business profile has been created."
- "`{materialsGenerated}` materials have been pre-loaded from your industry template."
- "Go to Dashboard" button triggers token refresh (Section 4.10) then redirects

**Error handling:**
- 409 CONFLICT: show "You already have a business profile." + dashboard link
- 400 VALIDATION_ERROR: field-level messages

### 5.4 Dashboard Page (`dashboard.html`)

**Auth guard:** `requireAuth()` + `requireBusiness()`

**Single API call:** `GET /api/v1/dashboard`

**Layout — 5 panels:**

**1. Tracked Materials Panel:**
- Lists `trackedMaterials` — each has `{ id, name, latestPrice }` only
- Per item: name, latest price + unit, "No price recorded" if null
- Quick links: "Add Price" → `prices.html?materialId=<id>`, "View Trends" → `trends.html?materialId=<id>`
- **`significantChange` is NOT rendered anywhere** — backend does not return it
- Empty state: "No materials are being tracked. Go to Materials to start tracking."

**2. Recent News Panel:**
- Lists up to 5 `recentNews` items — each has only `{ id, title }`
- Title only (no URL, source, or date from this endpoint)
- "View All News" link → `news.html`
- Empty state: "No recent news available." (expected in v1 — informational)

**3. Active Alert Rules Panel:**
- Lists up to 5 `activeAlertRules` — each has only `{ id, conditionType, thresholdPrice }`
- Formatted: "Price Above 150.00" / "Price Below 90.00"
- "Manage Alerts" link → `alerts.html`
- Empty state: "No active alert rules."

**4. Recent Alert Events Panel:**
- Lists up to 5 `recentAlertEvents` — each has only `{ id, triggeredAt }`
- Formatted timestamp
- "View Alert History" link → `alerts.html`
- Empty state: "No alerts have been triggered yet." (expected in v1)

**5. Sync Status Bar:**
- `sync.lastPriceSyncAt` and `sync.lastNewsSyncAt` — both `null` in v1
- Display: "Last price sync: Never" / "Last news sync: Never"
- `null` is expected, not an error

### 5.5 Materials Page (`materials.html`)

**Auth guard:** `requireAuth()` + `requireBusiness()`

**Data sources:** `GET /materials`, `GET /units-of-measurement`

**Layout:**

**Filter toggle:** "All Materials" / "Tracked Only" — client-side filter on loaded data (no extra API call)

**Materials table:** Name, Unit, Source (KB / Custom), Tracking status toggle button
- Toggle: `PATCH /materials/:id` with `{ isTracked: bool }` — **only `isTracked`, no other fields**
- "Log Price" → `prices.html?materialId=<id>` (tracked only)
- "View History" → `trends.html?materialId=<id>` (tracked only)

**Add Custom Material form** (expandable section or modal):
- `customName` input (required)
- `unitId` dropdown (from units-of-measurement API)
- `POST /materials` on submit → refresh list on success

**Constraints:**
- No delete button (no `DELETE /materials/:id` endpoint)
- No edit-name or edit-unit UI (`PATCH` only accepts `isTracked`)

### 5.6 Price Entry Page (`prices.html`)

**Auth guard:** `requireAuth()` + `requireBusiness()`

**URL param:** `?materialId=<id>` (required)

**Data sources:** `GET /materials` (find material), `GET /materials/:id/prices/latest`, `POST /materials/:id/prices`

**Layout:** Material name + unit → current price display → price entry form → back link

**Validation (client-side before submit):**
- Price must be a positive number (> 0)
- `recordedAt` must not be in the future

**Error handling:** 404 → "Material not found." + back link

### 5.7 Trends Page (`trends.html`)

**Auth guard:** `requireAuth()` + `requireBusiness()`

**URL param:** `?materialId=<id>` (optional, pre-selects material on Tab 1)

**Two tabs:**

**Tab 1 — Single Material History:**
- Material selector dropdown (from `GET /materials`)
- Date range: `from` + `to` inputs (both optional)
- Pagination: default `limit=50`
- Chart.js line chart — data ordered ASC from API (no client sorting needed)
- Empty state: "No price data available for this material and date range."

**Tab 2 — Compare Materials:**
- Multi-select checkboxes (up to 5 materials — enforce cap with visible counter)
- Date range inputs
- `materialIds` sent as comma-separated query string
- Chart.js multi-line chart: 5-colour palette, legend with material names
- At cap: "You can compare a maximum of 5 materials."

### 5.8 News Page (`news.html`)

**Auth guard:** `requireAuth()` + `requireBusiness()`

**Data source:** `GET /news?page=1&limit=20`

**Layout:** News cards. Per card: title (external link, `target="_blank" rel="noopener noreferrer"`), source name, publication date. Pagination below.

Empty state: "No news available for your industry." (expected in v1)

### 5.9 Alerts Page (`alerts.html`)

**Auth guard:** `requireAuth()` + `requireBusiness()`

**Two tabs:**

**Alert Rules tab:**
- `GET /alerts/rules` on load; `GET /materials` for material name lookup
- Table: material name, condition type, threshold price, status badge
- Create rule: modal with tracked-material dropdown, condition type radio (PRICE_ABOVE / PRICE_BELOW only), threshold price input
- Toggle active/inactive: `PATCH /alerts/rules/:id` with `{ isActive: bool }`
- Delete: confirmation → `DELETE /alerts/rules/:id` → remove from list
- Empty state: "No alert rules yet."

**Alert History tab:**
- `GET /alerts/events?page=1&limit=20`
- Table: triggered at, condition snapshot, threshold snapshot, triggered price, delivery status badge
- Pagination
- Empty state: "No alerts have been triggered yet." (expected in v1)

### 5.10 Business Profile Settings

**Access:** "Settings" link in sidebar → opens a **modal** (not a separate page).

**Data:** `GET /business` (on open or from session cache) · `PUT /business` (on save)

**Editable fields:** Business name (required), contact email, contact phone, address, news digest enabled (toggle), news digest frequency (DAILY / WEEKLY / MONTHLY dropdown).

**Read-only:** Industry name — displayed as text, no dropdown or edit option.

On success: toast notification + close modal + update `bmm_business` session cache.

---

## 6. Navigation Architecture

### 6.1 Public Pages Navigation

Pages: login, register, forgot-password, reset-password, onboarding — **no sidebar or main navigation**. Simple centred layout with logo/brand header only.

### 6.2 Authenticated Pages — Persistent Left Sidebar

```
+------------------------+
| [Logo]                 |
| Business Market Monitor|
+------------------------+
| [Initials avatar]      |
|  Business Name         |
|  Industry Name         |
+------------------------+
|  Dashboard             |
|  Materials             |
|  News                  |
|  Alerts                |
|  Trends                |
+------------------------+
|  Settings              |  (opens business profile modal)
|  Log Out               |
+------------------------+
```

### 6.3 Active Navigation State

Each page JS reads `window.location.pathname` on load and adds `.nav-link--active` to the matching sidebar link. This is set explicitly in each `js/pages/*.js`.

### 6.4 Top Header Bar

- **Left (mobile only):** Hamburger icon toggles sidebar drawer
- **Centre:** Page title (static text — "Dashboard", "Materials", etc.)
- **Right:** User email initials badge (from `auth.getCurrentUser().email`)

### 6.5 Mobile Navigation

Sidebar hidden by default on mobile (< 768px). Hamburger button shows/hides sidebar as a slide-in drawer with overlay backdrop. Clicking a nav link or the overlay closes the drawer. CSS class toggle (`sidebar--open`) handles show/hide.

### 6.6 Navigation Component Loader (`nav.js`)

**Decision (revised):** The sidebar markup is **not duplicated** across pages. Instead, the sidebar is defined once in a standalone HTML fragment file (`components/nav.html`) and loaded at runtime by `js/components/nav.js`. This gives a single source of truth for all navigation markup while remaining framework-free and fully compatible with the MPA architecture.

**Implementation approach:**

1. Each authenticated page HTML contains a lightweight placeholder element: `<div id="nav-placeholder"></div>` where the sidebar will be injected.
2. `nav.js` is imported by every authenticated page JS module.
3. On import, `nav.js` calls `fetch('/components/nav.html')` to retrieve the sidebar HTML fragment.
4. The fetched markup is inserted into `#nav-placeholder` using `innerHTML`. This is the **one sanctioned use of `innerHTML`** in the entire codebase — the source (`nav.html`) is a static file served by the same Express process as the frontend and contains no user-controlled data, so XSS risk is eliminated by definition.
5. After injection, `nav.js` reads `window.location.pathname` and adds `.nav-link--active` to the matching nav link.
6. `nav.js` also wires the mobile hamburger toggle, the sidebar overlay backdrop, and the logout button — so these do not need to be re-wired by each page's JS module.

**`components/nav.html` contents (fragment — not a full HTML document):**
- The complete sidebar semantic markup: `<nav>`, logo, user info placeholder (populated by JS from `session.js`), navigation links, settings link, logout button.
- No `<html>`, `<head>`, or `<body>` tags — it is a raw HTML fragment.
- User info placeholders (business name, industry name, user initials) are empty elements with stable IDs that `nav.js` populates from cached session data after injection.

**`nav.js` exports:**
- `initNav()` — the single entry-point function; fetches `nav.html`, injects it, sets active state, populates user info, wires logout and mobile drawer.
- Each authenticated page JS module calls `await initNav()` as its first action after auth guards.

**Trade-off vs. duplication:**

| Concern | Resolution |
|---|---|
| Nav renders after page load (async fetch) | `nav.html` is a tiny static file; it will be browser-cached after the first load. Perceived delay is negligible. |
| Layout shift while nav loads | The `#nav-placeholder` is given the sidebar dimensions via CSS, preventing shift. A brief opacity transition on `.sidebar--ready` reveals it when populated. |
| `innerHTML` is used | The source is a static local file with no user data — this is the sole approved exception. All other `innerHTML` uses with dynamic data remain prohibited. |
| Fetch failure | If `fetch('/components/nav.html')` fails, the page is still usable; a console warning is emitted. Logout is always reachable via `auth.clearTokens()` on the client. |

### 6.7 Logout

1. Click "Log out" → confirmation dialog
2. Confirm → `authApi.logout()` (fire-and-forget) → `auth.clearTokens()` → redirect to `/pages/login.html`

---

## 7. Reusable UI Components

All components in `js/components/` are plain JS factory functions that create and return `HTMLElement` objects or manipulate a target container directly. They are not React components or Web Components.

### 7.1 Buttons (`components.css`)

| Class | Style | Use |
|---|---|---|
| `.btn` | Base styles | All `<button>` elements |
| `.btn--primary` | Filled, brand blue | Main CTA |
| `.btn--secondary` | Outlined, brand blue | Secondary actions |
| `.btn--danger` | Filled red | Delete / destructive |
| `.btn--ghost` | Text only, no border | Tertiary / nav actions |
| `.btn--sm` | Small padding/font | Compact contexts (table rows) |
| `.btn--icon` | Square, icon only | Requires `aria-label` |
| `.btn[disabled]` | Greyed, no pointer events | Inactive state |
| `.btn--loading` | Spinner inside button | Active request in flight |

### 7.2 Forms (`components.css`)

- `.form-group` — wraps label + input + error
- `.form-label` — label above input
- `.form-control` — input, textarea, select (consistent height, padding, border)
- `.form-control:focus-visible` — 2px focus ring (brand blue)
- `.form-error` — red error text below input (hidden by default via `display: none`)
- `.form-control--error` — error state on the input (red border)
- `.form-hint` — grey helper text below input

### 7.3 Cards

- `.card` — rounded container, subtle shadow, surface background
- `.card__header` — padded top section (title + optional action)
- `.card__body` — main content area
- `.card__footer` — actions or metadata at bottom

### 7.4 Tables

- `.table` — full-width, consistent spacing
- `.table-wrapper` — horizontally scrollable container for mobile
- `.table__header` — `<thead>` row styles
- `.table__row` — `<tr>` with hover background
- `.table__cell` — `<td>` / `<th>` with padding
- `.table--compact` — smaller row height

### 7.5 Modals (`modal.js`)

- `createModal({ id, title, content, footer })` → creates modal DOM, appends to `<body>`
- `openModal(id)` → shows modal, traps focus inside
- `closeModal(id)` → hides, removes from DOM, releases focus
- Escape key closes modal
- Backdrop click closes modal
- Focus trap: Tab cycles only within modal elements while open

### 7.6 Confirmation Dialogs (`confirm.js`)

Wraps `modal.js`:
- `confirmAction({ title, message, confirmLabel, onConfirm })` → shows dialog
- "Cancel" dismisses, `onConfirm()` callback fires on confirm
- Used for: logout, delete alert rule

### 7.7 Toast Notifications (`toast.js`)

- `showToast({ message, type, duration })` where `type` is one of: `success`, `error`, `warning`, `info`
- Fixed position: top-right corner
- Auto-dismisses after `duration` ms (default 4000)
- Manual close button
- Multiple toasts stack vertically
- `role="alert"` with `aria-live="assertive"` for errors; `aria-live="polite"` for success/info

### 7.8 Loading States (`loader.js`)

**Spinner:** For form submissions and targeted actions
- `showSpinner(container)` / `hideSpinner(container)` — CSS-animated ring

**Skeleton:** For initial page data loads
- `showSkeleton(container, config)` — grey animated placeholder blocks
- `hideSkeleton(container)` — removes skeleton, reveals real content

### 7.9 Empty States (`emptyState.js`)

`createEmptyState({ icon, title, message, action? })` → returns DOM node

- `icon`: Font Awesome icon class name
- `action`: optional `{ label, onClick }` — renders an action button
- Applied to all screens with potentially-empty lists

### 7.10 Error States (`errorState.js`)

`createErrorState({ title, message, retry? })` → returns DOM node

- `retry`: optional callback — renders "Try again" button
- Shown on full-section API failures

### 7.11 Pagination (`pagination.js`)

`createPagination({ meta, onPageChange })` → returns pagination control DOM

- Renders: "Previous" button, "Page X of Y", "Next" button
- First/last page disables respective button
- `onPageChange(newPage)` called on user click
- `aria-label` on buttons; `aria-disabled` on disabled controls

### 7.12 Dropdowns

CSS + minimal JS toggle:
- `.dropdown`, `.dropdown__trigger`, `.dropdown__menu`
- Toggle `.is-open` on trigger click
- Close on document click (outside listener)
- Close on Escape key
- `aria-expanded` on trigger button

### 7.13 Charts (`js/components/chart.js`)

**Single Line Chart:**
- `createLineChart(canvasEl, { labels, datasets, options? })` → returns `Chart` instance
- Labels: formatted dates from `recordedAt` values
- Options: responsive true, tooltip shows price + date, legend hidden (single material)

**Comparison Chart:**
- `createCompareChart(canvasEl, { series })` → multiple datasets
- Each series: `{ materialId, name, data: [{ price, recordedAt }] }`
- 5 pre-defined colours (Section 15.9)
- Legend visible with material names

**Accessibility:** Every chart `<canvas>` has `role="img"` + descriptive `aria-label`. A hidden `<table>` with the same data is rendered below every chart, with a "Show data table" toggle button.

### 7.14 Navigation Loader (`nav.js`)

`nav.js` is the component responsible for mounting the sidebar navigation on every authenticated page. It is not a visual component in the same sense as `toast.js` or `modal.js` — it manages the page shell rather than a UI widget.

**`initNav()` sequence:**
1. `fetch('/components/nav.html')` → get sidebar HTML fragment
2. `document.getElementById('nav-placeholder').innerHTML = html` — **sole approved `innerHTML` use** (static local file, no user data)
3. Populate user info placeholders (business name, industry name, user initials) from `session.js` cached data
4. Read `window.location.pathname` → add `.nav-link--active` to the matching `<a>` element
5. Bind hamburger button click → toggle `sidebar--open` class + overlay backdrop
6. Bind overlay click → close sidebar
7. Bind logout button → call `confirmAction()` → on confirm, call `authApi.logout()` + `auth.clearTokens()` + redirect to login
8. Bind settings link → call `businessSettings.openSettingsModal()`

**Why `innerHTML` is safe here:** `nav.html` is a static file served from the same Express process. Its content is authored by the developer and never contains user-supplied data. No API response data is ever inserted via this path.

**All other uses of `innerHTML` with dynamic data remain strictly prohibited** (see Section 11.2).

---

## 8. State Management

No state management library. A lightweight module-based approach:

### 8.1 Authentication State

`auth.js` + `localStorage` (see Section 4). Single source of truth for auth.

### 8.2 Cached User/Business Data (`session.js`)

After login or business creation, data cached in `sessionStorage`:
- `bmm_user`: `{ userId, email, businessId }` (from decoded JWT)
- `bmm_business`: full `GET /business` response object

`session.js` exports:
- `getCachedUser()`, `setCachedUser(user)`
- `getCachedBusiness()`, `setCachedBusiness(business)`
- `clearSession()` — called on logout alongside `auth.clearTokens()`

**Cache invalidation:** Business cache cleared after `PUT /business` succeeds. Session cleared on logout.

### 8.3 Page-Level State

Each page JS manages its own state as module-scope variables, reset on every page load:

```js
let currentPage = 1;
let currentLimit = 20;
let allMaterials = [];
let isLoading = false;
let selectedMaterialId = null;
let activeFilters = {};
```

No cross-page shared in-memory state (MPA navigation destroys the JS context).

### 8.4 URL-Based State

| Page | URL State |
|---|---|
| `prices.html` | `?materialId=<id>` |
| `trends.html` | `?materialId=<id>` |
| `reset-password.html` | `?token=<token>` |
| `login.html` | `?reason=session_expired` |

URL state is read on page load. Back-button and bookmarks work for URL-state pages.

### 8.5 Filter and Pagination State

Per-page module variables. Filter/page change triggers a re-fetch.

**Exception:** `GET /materials` result is loaded once and client-side filtered for the "Tracked only" toggle — no extra API call.

### 8.6 Form State

The DOM is the form state. Multi-step flows (onboarding) use page-level JS variables to carry values across steps.

---

## 9. Responsive Architecture

### 9.1 Breakpoints (mobile-first)

| Breakpoint | Min Width | Target |
|---|---|---|
| mobile | 0px (base) | Phones portrait |
| tablet | 768px | Tablets, landscape phones |
| laptop | 1024px | Laptops, small monitors |
| desktop | 1280px | Desktop monitors |

Defined as reference values in `css/variables.css`:

```css
--breakpoint-tablet:  768px;
--breakpoint-laptop:  1024px;
--breakpoint-desktop: 1280px;
```

### 9.2 Layout Behaviour by Breakpoint

| Element | Mobile | Tablet | Laptop | Desktop |
|---|---|---|---|---|
| Sidebar | Hidden, hamburger-triggered drawer | Hidden, hamburger-triggered drawer | Persistent, icon-only (64px) | Persistent, expanded (240px) |
| Main content | Full width | Full width | Offset 64px | Offset 240px |
| Dashboard panels | 1-column stack | 2-column grid | 2-column grid | 3-column grid |
| Tables | Horizontally scrollable | Scrollable | Full width | Full width |
| Auth cards | Full width with padding | Centred max 480px | Centred max 480px | Centred max 480px |
| Charts | Full width, 200px height | Full width, 280px | Full width, 360px | Full width, 400px |

### 9.3 Touch Targets

All interactive elements have minimum **44×44px** touch target on mobile via padding.

### 9.4 Typography Scaling

Base font: `16px` on all breakpoints. All sizes in `rem`. No pixel-locked font sizes.

---

## 10. Accessibility Architecture

### 10.1 Semantic HTML First

| Purpose | Element Used |
|---|---|
| Navigation | `<nav aria-label="Main navigation">` |
| Main content area | `<main id="main-content">` |
| Page sections | `<section aria-labelledby="section-heading-id">` |
| Data tables | `<table>` with `<caption>`, `<thead>`, `<th scope="col">` |
| Forms | `<form>`, `<label for="...">`, `<input id="...">`, `<fieldset>`, `<legend>` |
| Buttons | `<button type="button">` or `type="submit"` — never `<div>` with click handler |

### 10.2 Focus Management

- **Visible focus ring:** All focusable elements show 2px solid ring on `:focus-visible`
- **Focus trap:** Modals trap focus while open; Tab cycles only within modal elements
- **Skip link:** "Skip to main content" `<a href="#main-content">` is the first DOM element on every page (visually hidden until focused)
- **Post-action focus:** After creating a record, focus is moved to the new item or the success announcement

### 10.3 ARIA — Only Where Necessary

| Applied On | Attribute |
|---|---|
| Toast container | `role="alert"`, `aria-live="assertive"` (errors) / `aria-live="polite"` (success) |
| Icon-only buttons | `aria-label="Delete rule"` etc. |
| Sidebar toggle button | `aria-expanded`, `aria-controls` |
| Dropdown triggers | `aria-expanded`, `aria-haspopup="listbox"` |
| Loading spinners | `role="status"`, `aria-label="Loading..."` |
| Active nav link | `aria-current="page"` |
| Form input + error | `aria-describedby="field-error-id"` |
| Chart canvas | `role="img"`, `aria-label="[chart description]"` |

ARIA is not used on elements that already have correct native semantics.

### 10.4 Colour Contrast

- Normal text: minimum 4.5:1 contrast ratio (WCAG AA)
- Large text: minimum 3:1
- Form input borders visible against background (not colour-only distinction)
- Status badges use colour + text (not colour alone)
- Error states use red + icon + text (not colour alone)

### 10.5 Keyboard Navigation

- All interactive elements reachable in logical DOM order
- No keyboard traps except intentional modal focus traps (Escape releases)
- Dropdown menus close on Escape
- Table action buttons keyboard-reachable via Tab

### 10.6 Chart Accessibility

- Every chart `<canvas>` has `role="img"` + `aria-label` with a descriptive title
- A visually hidden `<table>` with chart data is rendered below every chart
- "Show data table" toggle button makes the table visually visible
- Chart colours chosen for perceptual distinctness (not only colour — legend labels too)

### 10.7 Accessible Error Messages

- Form errors appear below their field, associated via `aria-describedby`
- On submission error, focus is moved to the first field with an error
- Error message IDs are stable and predictable (e.g., `email-error`, `password-error`)

### 10.8 Reduced Motion

All CSS transitions and animations are wrapped in:

```css
@media (prefers-reduced-motion: reduce) {
  /* Instant state changes — no transitions */
}
```

---

## 11. Security Considerations

Based only on what the v1.0.0 backend actually supports.

### 11.1 Token Handling

- Access and refresh tokens stored in `localStorage` with namespaced keys (`bmm_*`)
- Tokens never logged to `console`
- Tokens never appear in URLs (only the one-time server-generated password reset token is URL-transmitted — it is not a session token)
- `auth.clearTokens()` called on logout and on expired session

### 11.2 XSS Prevention

**This is a mandatory security requirement, not a best practice.** Because JWT access tokens are stored in `localStorage` (approved in Section 4.1), any successful XSS attack would give an attacker full access to the stored tokens. The following rules must be enforced without exception across every file in the frontend codebase:

**Rule 1 — Safe content insertion (non-negotiable):**
All API response data, user-supplied data, or any value sourced from outside the authored source files must be written via `element.textContent`, `element.value`, or equivalent safe DOM property. **`innerHTML`, `outerHTML`, `insertAdjacentHTML`, and `document.write` must never be used with dynamic data.**

```
// FORBIDDEN — never do this with API data:
element.innerHTML = apiData.name;

// REQUIRED — always do this:
element.textContent = apiData.name;
```

**Rule 2 — The one approved `innerHTML` exception:**
`js/components/nav.js` uses `innerHTML` to inject `components/nav.html` into `#nav-placeholder`. This is the **sole approved exception** because the source is a static developer-authored file served by the same Express process — it never contains user-controlled data. No other `innerHTML` use with non-static content is permitted.

**Rule 3 — No eval, no dynamic scripts:**
- No `eval()`, `new Function()`, or `setTimeout(string)` usage
- No dynamically created `<script>` tags
- No `javascript:` URLs

**Rule 4 — External links:**
All links opening external URLs (e.g., news article links) must use `target="_blank" rel="noopener noreferrer"` to prevent tab-napping.

**Rule 5 — URL parameter handling:**
Values read from `window.location.search` or `URLSearchParams` must be treated as untrusted input. They must never be inserted into the DOM via `innerHTML` — only via `textContent` or used as typed values (IDs for API calls). The backend validates ownership of all IDs.

**Enforcement note:** During Phase 10 (polish/audit), a manual code review specifically checking for any `innerHTML` usage with dynamic data is a required acceptance criterion.

### 11.3 Cross-Tenant Data Safety

- Material IDs from URL params are not used directly for write operations without backend validation
- Backend returns 404 for IDs not belonging to the authenticated user — frontend displays "Not found" without confirming whether the resource exists elsewhere

### 11.4 CSRF

Not applicable. The API uses JWT Bearer tokens, not cookies. CSRF requires cookies.

### 11.5 Sensitive Data

- Passwords never stored in any variable beyond the moment of form submission
- No sensitive data logged to `console`

### 11.6 What the Frontend Must NOT Assume

- Backend does NOT enforce HTTPS at the application layer (Render does TLS termination). Frontend uses relative paths only.
- Backend does NOT rotate refresh tokens on use.
- Backend does NOT have server-side logout or token blacklisting.
- CORS is enforced by the backend — the frontend must be served from the same origin as the backend in production.

---

## 12. Backend Limitations the Frontend Must Respect

All items below are confirmed against the actual v1.0.0 backend source code.

| Limitation | Frontend Rule |
|---|---|
| **`significantChange` is NOT returned by `GET /dashboard`** | No change indicator, percentage, arrow, or colour-coded badge anywhere on the dashboard. `trackedMaterials` items contain only `{ id, name, latestPrice }`. |
| **`PATCH /materials/:id` only accepts `{ isTracked: boolean }`** | No UI for editing custom material names or units. The edit-material feature in Document 5 section 4.5 is not implemented in v1.0.0. |
| **Email verification endpoints return 501 Not Implemented** | No "Verify your email" prompt, banner, or onboarding step. Do not call these endpoints. |
| **No `/api/v1/auth/me` endpoint** | Decode user identity from JWT client-side. Never make an API call purely to identify the current user. |
| **One user owns exactly one business** | No business switching, no multi-business UI, no business selector. |
| **No scheduled price ingestion job** | `sync.lastPriceSyncAt` will be `null`. Display as "Never" — not an error. |
| **No scheduled news ingestion job** | News feed empty on fresh deployments. Present with informational empty state. |
| **No scheduled alert evaluation job** | Alert events never auto-generated in v1. Alert history will be empty. Present informatively. |
| **No email delivery (nodemailer not installed)** | Do not promise "You will receive an email." Use the API response message verbatim for password reset. |
| **No bulk price entry** | Single-price entry only. No CSV upload, no multi-row entry. |
| **No material deletion** | No delete button. Toggle `isTracked` only. |
| **No business deletion** | No delete account or delete business feature. |
| **`conditionType` limited to `PRICE_ABOVE` or `PRICE_BELOW`** | Alert creation form offers exactly these two options. No others. |
| **`newsDigestFrequency` limited to `DAILY`, `WEEKLY`, `MONTHLY`** | Business settings dropdown has exactly these three options. |
| **Price must be > 0, `recordedAt` not in future** | Client-side validation enforces both before submit. |
| **Compare endpoint accepts 1–5 `materialIds`** | UI caps selection at 5 with visible counter and cap message. |
| **Rate limiting on auth endpoints** | On 429: show "Too many attempts. Please wait before trying again." |
| **`industryId` cannot be changed after business creation** | Settings form shows industry as read-only text. No dropdown or edit option. |
| **`DELETE /alerts/rules/:id` is a soft delete** | After deletion, rule disappears from list. Treat as successfully removed. |
| **Dashboard `recentNews` items contain only `{ id, title }`** | Render title only in dashboard news panel. No URL, source name, or date available. |
| **Dashboard `recentAlertEvents` items contain only `{ id, triggeredAt }`** | Render formatted timestamp only. |
| **Dashboard `activeAlertRules` items contain only `{ id, conditionType, thresholdPrice }`** | Do not render material name or active status in dashboard rules panel. |

---

## 13. Page-to-API Mapping Table

| Page | Purpose | API Endpoints | Methods | Auth Required | Main UI Data | Loading State | Empty State | Error State |
|---|---|---|---|---|---|---|---|---|
| `index.html` | Redirect entry point | None | — | No | None | None | None | None |
| `login.html` | Authenticate | `/auth/login` | POST | No | Form | Button spinner | — | Inline form error |
| `register.html` | Create account | `/auth/register`, `/auth/login` | POST, POST | No | Form | Button spinner | — | Field-level errors |
| `forgot-password.html` | Request reset | `/auth/password-reset/request` | POST | No | Form → success message | Button spinner | — | Inline error |
| `reset-password.html` | Confirm reset | `/auth/password-reset/confirm` | POST | No | Form → success | Button spinner | Invalid token state | Auth error message |
| `onboarding.html` | Create business | `/industries`, `/business`, `/auth/refresh` | GET, POST, POST | Auth (no business yet) | Industry grid + form | Industry card skeleton | — | Inline form errors |
| `dashboard.html` | Main aggregated view | `/dashboard`, `/business` | GET, GET | Auth + business | 5 data panels | Panel skeletons | Per-panel empty states | Per-panel error + retry |
| `materials.html` | Manage tracking | `/materials`, `/materials/:id`, `/units-of-measurement` | GET, PATCH, GET, POST | Auth + business | Materials table | Table skeleton | "No materials" empty state | Full-section error + retry |
| `prices.html` | Log price entry | `/materials`, `/materials/:id/prices/latest`, `/materials/:id/prices` | GET, GET, POST | Auth + business | Current price + form | Price skeleton | "No price yet" message | 404 material not found |
| `trends.html` | Price trend charts | `/materials`, `/materials/:id/prices/history`, `/materials/prices/compare` | GET, GET, GET | Auth + business | Charts + data table | Chart skeleton | "No data in range" | Chart error + retry |
| `news.html` | Industry news feed | `/news` | GET | Auth + business | News card list | Card skeletons | "No news available" | Full-section error + retry |
| `alerts.html` | Manage alerts | `/materials`, `/alerts/rules`, `/alerts/events` | GET, GET/POST/PATCH/DELETE, GET | Auth + business | Rules table + events table | Table skeletons | Per-tab empty states | Per-tab error + retry |

---

## 14. Error / Loading / Empty-State Strategy

### 14.1 Core Principle

Every section that fetches data must handle exactly four states: Initial (before load), Loading, Loaded-with-data, Loaded-without-data (empty). Every section that can fail additionally handles: Error. No section may render a blank area.

### 14.2 Loading States

**Page initial load:** Skeleton placeholders — grey animated blocks matching real content dimensions. Prevents layout shift.

**Action responses:** Spinner inside the trigger button. Button disabled while request is in flight.

**Pagination navigation:** Light overlay on content area + centred spinner. Existing content not replaced with skeleton.

### 14.3 Empty States

Every empty state must include:
1. A relevant Font Awesome icon
2. A clear, contextual message
3. A contextual action button where appropriate

| Screen | Empty State Message |
|---|---|
| News feed | "No news available for your industry yet. News will appear here once your industry feed is connected." |
| Alert events | "No alerts have been triggered yet. Alert rules will be evaluated once automatic monitoring is enabled." |
| Alert rules | "No alert rules yet. Create one to get notified when prices cross a threshold." |
| Dashboard news panel | "No recent news available." |
| Dashboard events panel | "No alerts triggered yet." |
| Price history | "No price data for this material and date range. Try a wider range or log some prices." |
| Materials (tracked only) | "No materials are currently tracked. Toggle a material to Tracked to start monitoring." |

### 14.4 Error States

**Full-section failure (API call failed):**
- Replace section content with `errorState.js` component
- "Something went wrong. Please try again." for 500 / network errors
- Context-specific message for 404
- "Try again" button re-triggers the same API call

**Inline action failure:**
- Toast notification with error message
- Keep form open with existing data for correction

**Auth failure (session expired):**
- `auth.clearTokens()` → redirect to `/pages/login.html?reason=session_expired`
- Login page shows: "Your session has expired. Please sign in again."

### 14.5 Consistency Rules

| Rule | Implementation |
|---|---|
| Skeleton always shown before API call completes | Applied immediately on page load |
| Empty states always have content | `emptyState.js` component mandatory |
| 500/network errors never expose server details | Generic message always; raw error to `console.error` only in dev |
| Network timeout: 30 seconds | After 30s no response → network error state |
| Success actions confirmed | `showToast({ type: 'success' })` after every create/update/delete |
| 429 errors: distinct message | "Too many attempts. Please wait before trying again." |

---

## 15. Design System Architecture

### 15.1 Design Philosophy

**Professional dark-mode-first interface** featuring:
- Rich dark backgrounds (deep navy/slate) commanding focus
- Vibrant accent blue clearly identifying interactive elements
- Glassmorphism-style card surfaces with subtle borders and shadow
- Smooth 200ms transitions on hover and state changes
- Clean typographic hierarchy with Inter

Dark mode is the primary and only theme in v1. Light mode is a future enhancement.

### 15.2 Colour System (`css/variables.css`)

**Background Scale:**

| Token | Value | Use |
|---|---|---|
| `--color-bg-base` | `#0d1117` | Page background |
| `--color-bg-surface` | `#161b22` | Cards, panels |
| `--color-bg-elevated` | `#1f2937` | Modals, dropdowns |
| `--color-bg-hover` | `#242d3a` | Row/nav hover |
| `--color-border` | `#30363d` | Borders, dividers |
| `--color-border-strong` | `#484f58` | Active/focused borders |

**Text Scale:**

| Token | Value | Use |
|---|---|---|
| `--color-text-primary` | `#e6edf3` | Main content text |
| `--color-text-secondary` | `#8b949e` | Labels, captions |
| `--color-text-disabled` | `#484f58` | Disabled elements |
| `--color-text-inverse` | `#0d1117` | Text on primary buttons |

**Brand / Accent:**

| Token | Value | Use |
|---|---|---|
| `--color-primary` | `#3b82f6` | Primary actions, links, focus rings |
| `--color-primary-hover` | `#2563eb` | Primary button hover |
| `--color-primary-subtle` | `rgba(59,130,246,0.12)` | Active nav bg, selected items |
| `--color-primary-foreground` | `#ffffff` | Text on primary buttons |

**Status Colours:**

| Token | Value | Use |
|---|---|---|
| `--color-success` | `#22c55e` | Success toasts, tracked badge |
| `--color-success-subtle` | `rgba(34,197,94,0.12)` | Success badge bg |
| `--color-warning` | `#f59e0b` | Warning states |
| `--color-warning-subtle` | `rgba(245,158,11,0.12)` | Warning badge bg |
| `--color-danger` | `#ef4444` | Errors, delete buttons |
| `--color-danger-subtle` | `rgba(239,68,68,0.12)` | Error badge bg |
| `--color-info` | `#6366f1` | Info states, MANUAL source badge |
| `--color-info-subtle` | `rgba(99,102,241,0.12)` | Info badge bg |

**Design decision:** Dark palette inspired by GitHub Dark — familiar to technical users, excellent contrast ratios, associated with data/analytics tools. Blue primary is universally associated with trust and action.

### 15.3 Typography

```css
--font-sans: 'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
--font-mono: 'Fira Code', 'Cascadia Code', 'Courier New', monospace;
```

Monospace font used exclusively for price values — visually distinguishes numeric data from labels and improves column alignment.

**Type Scale:**

| Token | Value | Use |
|---|---|---|
| `--text-xs` | `0.75rem` | Badges, captions |
| `--text-sm` | `0.875rem` | Labels, table data |
| `--text-base` | `1rem` | Body text (root default) |
| `--text-lg` | `1.125rem` | Card titles, section headers |
| `--text-xl` | `1.25rem` | Page section titles |
| `--text-2xl` | `1.5rem` | Page headings |
| `--text-3xl` | `1.875rem` | Dashboard hero values |

**Font Weights:**

| Token | Value | Use |
|---|---|---|
| `--weight-normal` | `400` | Body copy |
| `--weight-medium` | `500` | Labels, nav links |
| `--weight-semibold` | `600` | Card titles, buttons |
| `--weight-bold` | `700` | Page headings |

### 15.4 Spacing Scale

4px base unit:

| Token | Value | Use |
|---|---|---|
| `--space-1` | `4px` | Icon gaps |
| `--space-2` | `8px` | Compact padding |
| `--space-3` | `12px` | Form field padding |
| `--space-4` | `16px` | Standard element spacing |
| `--space-5` | `20px` | Section internal padding |
| `--space-6` | `24px` | Card padding |
| `--space-8` | `32px` | Section gap |
| `--space-10` | `40px` | Page section top padding |
| `--space-12` | `48px` | Large section gap |
| `--space-16` | `64px` | Page-level vertical rhythm |

### 15.5 Border Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `4px` | Badges, inputs |
| `--radius-md` | `8px` | Buttons, form controls |
| `--radius-lg` | `12px` | Cards |
| `--radius-xl` | `16px` | Modals |
| `--radius-full` | `9999px` | Pills, toggles |

### 15.6 Shadows

| Token | Value | Use |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.4)` | Cards |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.5)` | Dropdowns |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.6)` | Modals |
| `--shadow-focus` | `0 0 0 3px rgba(59,130,246,0.5)` | Focus ring |

### 15.7 Status Badges

```
.badge              base: pill shape, text-xs, semibold
.badge--success     success-subtle bg + success text
.badge--warning     warning-subtle bg + warning text
.badge--danger      danger-subtle bg + danger text
.badge--info        info-subtle bg + info text
.badge--neutral     border-colour bg + secondary text
```

Usage examples:
- Material: `.badge--success` "Tracked" / `.badge--neutral` "Untracked"
- Alert rule: `.badge--success` "Active" / `.badge--neutral` "Paused"
- Price source: `.badge--info` "MANUAL"
- Alert delivery: `.badge--success` "SENT" / `.badge--danger` "FAILED"

### 15.8 Transitions

```css
--transition-fast: 150ms ease;   /* Toggle switches, badges */
--transition-base: 200ms ease;   /* Button hover, nav hover */
--transition-slow: 300ms ease;   /* Modal, drawer slide */
```

All wrapped in `@media (prefers-reduced-motion: reduce)` for instant state changes when requested.

### 15.9 Chart Colour Palette

| Series | Colour | Hex |
|---|---|---|
| 1 | Blue | `#3b82f6` |
| 2 | Green | `#22c55e` |
| 3 | Amber | `#f59e0b` |
| 4 | Purple | `#a855f7` |
| 5 | Cyan | `#06b6d4` |

All chosen for sufficient contrast against the dark chart background and perceptual distinctness.

---

## 16. Implementation Phases

Each phase builds on the previous and is independently testable.

---

### Phase 1 — Foundation & Design System

**Objective:** Complete CSS design system and shared JS utility/component layer. No API calls.

**Files:**
- All `css/` files (variables, reset, base, layout, components, utilities, pages/auth, pages/dashboard, pages/trends)
- `js/utils/dom.js`, `js/utils/format.js`, `js/utils/validate.js`
- `js/components/toast.js`, `js/components/modal.js`, `js/components/confirm.js`
- `js/components/loader.js`, `js/components/emptyState.js`, `js/components/errorState.js`
- `js/components/pagination.js`
- `js/components/nav.js` — navigation loader (authored in this phase so Phase 4 can consume it)
- `components/nav.html` — sidebar HTML fragment (single source of truth for nav markup)

**API dependencies:** None

**Acceptance criteria:**
- All design tokens defined in `variables.css`
- All button variants, card, table, form, badge styles render correctly
- Toast: shows at top-right, stacks, auto-dismisses, keyboard-closeable
- Modal: opens/closes, traps focus, Escape and backdrop close
- Skeleton loaders animate correctly
- Empty and error state components render correctly
- Pagination renders with correct disabled states on first/last page
- WCAG AA colour contrast verified on all text/background combinations
- `prefers-reduced-motion` applied to all transitions
- `nav.js`: `initNav()` fetches `nav.html`, injects it into `#nav-placeholder`, populates user info placeholders, and wires hamburger toggle — verified in isolation (test page with `#nav-placeholder` div)
- `components/nav.html`: complete sidebar markup authored; no `<html>`/`<head>`/`<body>` tags; user info placeholders have stable IDs

**Must NOT change:** Backend. Documents 1–6 in docs/.

---

### Phase 2 — API Layer & Authentication Logic

**Objective:** Complete API client and authentication module. No HTML pages yet.

**Files:**
- `js/api/client.js`
- `js/api/auth.api.js`, `js/api/knowledgeBase.api.js`
- `js/auth/auth.js`, `js/auth/session.js`
- `js/utils/router.js`

**API dependencies:** `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/logout`, `/auth/password-reset/request`, `/auth/password-reset/confirm`, `/industries`, `/units-of-measurement`

**Acceptance criteria:**
- `apiRequest()` injects Authorization header correctly
- `apiRequest()` handles all HTTP status codes per Section 3.4
- `apiRequest()` triggers token refresh on 401, retries once
- `apiRequest()` redirects to login on failed refresh
- `auth.setTokens()` stores tokens, decodes JWT, caches user data
- `auth.clearTokens()` removes all storage keys
- `auth.isAuthenticated()` returns correct boolean
- `auth.getBusinessId()` returns correct value or `null`
- `requireAuth()` redirects unauthenticated users to login
- `requireBusiness()` redirects users without business to onboarding
- `redirectIfAuthenticated()` redirects logged-in users from public pages

**Must NOT change:** Backend. Phase 1 files.

---

### Phase 3 — Authentication Pages

**Objective:** All auth-related HTML pages with working API integration.

**Files:**
- `pages/login.html` + `js/pages/login.js`
- `pages/register.html` + `js/pages/register.js`
- `pages/forgot-password.html` + `js/pages/forgot-password.js`
- `pages/reset-password.html` + `js/pages/reset-password.js`
- `index.html` + `js/pages/index.js`
- `css/pages/auth.css`

**API dependencies:** All from Phase 2 `auth.api.js`

**Acceptance criteria:**
- Login: valid credentials → dashboard redirect; invalid → inline error; 429 → rate limit message
- Login: `?reason=session_expired` shows appropriate message
- Register: success → auto-login → onboarding redirect; 409 → email conflict; 400 → field errors
- Forgot password: always shows same success message regardless of API response
- Reset password: reads `?token=` from URL; success and invalid-token states both render
- All auth pages redirect authenticated users correctly
- All forms keyboard-navigable and screen-reader accessible
- No auth page shows sidebar or main nav
- Password strength hint on register and reset pages

**Must NOT change:** Backend. Phases 1–2 files.

---

### Phase 4 — Shared Authenticated Layout & Onboarding

**Objective:** Integrate the navigation component into the first authenticated page (onboarding) and build the onboarding flow. This phase validates that `nav.js` + `nav.html` work end-to-end in a real page context.

**Files:**
- `pages/onboarding.html` + `js/pages/onboarding.js`
- `js/api/business.api.js`
- (consumes `js/components/nav.js` and `components/nav.html` from Phase 1)

**API dependencies:** `GET /industries`, `POST /business`, `POST /auth/refresh`

**Acceptance criteria:**
- Onboarding loads 5 industries as cards; selection highlighted
- Step 1 to 2 to 3 progression with data preserved across steps
- Successful creation triggers token refresh then redirects to dashboard
- 409 CONFLICT handled: existing business message + dashboard link
- `initNav()` called on onboarding page; sidebar renders correctly from `nav.html` fragment
- Business name and initials populate in sidebar after business creation and token refresh
- Mobile hamburger/drawer works
- Active nav link `.nav-link--active` set correctly on each page (verified manually on onboarding)
- Logout confirmation + redirect works
- No sidebar markup is duplicated in `onboarding.html` — it contains only `<div id="nav-placeholder"></div>`

**Must NOT change:** Backend. Phases 1–3 files.

---

### Phase 5 — Dashboard Page

**Objective:** Main application screen.

**Files:**
- `pages/dashboard.html` + `js/pages/dashboard.js`
- `js/api/dashboard.api.js`, `js/api/business.api.js`
- `css/pages/dashboard.css`

**API dependencies:** `GET /dashboard`, `GET /business`

**Acceptance criteria:**
- All 5 panels render with correct data
- Skeleton loads before data arrives
- Each panel has correct empty state (all empty on fresh deployment)
- `significantChange` NOT referenced anywhere
- Dashboard news: title only — no URL, source, date
- Dashboard events: `triggeredAt` formatted only
- Dashboard rules: condition type + threshold price only
- Sync status: `null` displayed as "Never" — not an error
- Quick links from panels to other pages work correctly

**Must NOT change:** Backend. Phases 1–4 files.

---

### Phase 6 — Materials & Price Entry

**Objective:** Material tracking management and price entry pages.

**Files:**
- `pages/materials.html` + `js/pages/materials.js`
- `pages/prices.html` + `js/pages/prices.js`
- `js/api/materials.api.js`, `js/api/prices.api.js`

**API dependencies:** `GET /materials`, `POST /materials`, `PATCH /materials/:id`, `GET /units-of-measurement`, `GET /materials/:id/prices/latest`, `POST /materials/:id/prices`

**Acceptance criteria:**
- Materials list renders with skeleton
- Client-side "Tracked only" filter works without extra API call
- Toggle sends `{ isTracked }` only — no other fields
- Add custom material form validates and submits; list refreshes on success
- No delete-material UI, no edit-name/edit-unit UI
- Price entry resolves material from `?materialId` URL param
- Price validation: `> 0`, date not in future — enforced client-side before submit
- 404 handled: "Material not found." with back link

**Must NOT change:** Backend. Phases 1–5 files.

---

### Phase 7 — News & Alerts

**Objective:** News feed and alert management pages.

**Files:**
- `pages/news.html` + `js/pages/news.js`
- `pages/alerts.html` + `js/pages/alerts.js`
- `js/api/news.api.js`, `js/api/alerts.api.js`

**API dependencies:** `GET /news`, `GET /alerts/rules`, `POST /alerts/rules`, `PATCH /alerts/rules/:id`, `DELETE /alerts/rules/:id`, `GET /alerts/events`

**Acceptance criteria:**
- News: paginated, skeleton, empty state rendered informatively
- External news links have `rel="noopener noreferrer"`
- Alert rules tab: table renders; create form validates
- Condition type form offers exactly PRICE_ABOVE and PRICE_BELOW
- Toggle active/inactive: UI updates on success
- Delete: confirmation → soft delete → removed from list
- Alert events tab: paginated, empty state informative
- Both tabs share the page layout correctly

**Must NOT change:** Backend. Phases 1–6 files.

---

### Phase 8 — Historical Trends

**Objective:** Historical price trend charts with Chart.js.

**Files:**
- `pages/trends.html` + `js/pages/trends.js`
- `js/components/chart.js`
- `css/pages/trends.css`

**API dependencies:** `GET /materials`, `GET /materials/:id/prices/history`, `GET /materials/prices/compare`

**Acceptance criteria:**
- Tab 1: material selector + date range + Chart.js line chart renders correctly
- Data is ASC from API — no client-side sorting needed
- Pagination on history works correctly
- Tab 2: multi-select capped at 5 with counter and cap message
- `materialIds` sent as comma-separated string
- Comparison chart renders with 5-colour palette and legend
- Every chart has `role="img"` + `aria-label` on canvas
- Every chart has hidden data table with "Show data table" toggle
- Chart is responsive to window resize
- Empty state for "no data in range"

**Must NOT change:** Backend. Phases 1–7 files.

---

### Phase 9 — Business Profile Settings Modal

**Objective:** Settings modal from sidebar on all authenticated pages.

**Files:**
- `js/components/businessSettings.js`
- Updated sidebar HTML on all authenticated pages (settings link wired)

**API dependencies:** `GET /business`, `PUT /business`

**Acceptance criteria:**
- Modal opens from "Settings" link on all 7 authenticated pages
- Current business data loaded (session cache or API call)
- Industry shown as read-only text — no dropdown
- All editable fields render and submit correctly
- `newsDigestFrequency` dropdown has exactly DAILY, WEEKLY, MONTHLY
- On success: toast + close modal + session cache updated
- On 400 error: field-level messages inside modal

**Must NOT change:** Backend. Phases 1–8 files.

---

### Phase 10 — Polish, Accessibility Audit & Cross-Browser Testing

**Objective:** Final quality pass.

**Files:** All frontend files (review; minimal targeted edits)

**Acceptance criteria:**
- All pages pass keyboard-only navigation test (no mouse)
- All interactive elements have visible focus indicators
- All form errors associated via `aria-describedby`
- Colour contrast WCAG AA verified on all text
- Skip link present and focusable on every page
- `prefers-reduced-motion` disables all transitions correctly
- Tested on Chrome, Firefox, Safari, Edge (latest versions)
- Tested on 375px viewport — all pages functional
- No `console.error` on happy-path flows
- Empty and error states verified on each page

**Must NOT change:** Backend. Design token values in `variables.css`.

---

## 17. Approval Checklist

Before any frontend implementation begins, the following must be confirmed as approved:

### Architecture Decisions
- [x] MPA (Multi-Page Application) architecture — **APPROVED**
- [x] `localStorage` for token storage — **APPROVED** (with mandatory XSS/innerHTML rules per Section 11.2)
- [x] Auto-login after registration — **APPROVED**
- [x] Business settings as modal (not separate page) — **APPROVED**
- [x] Dark-mode-only design (no light mode toggle in v1) — **APPROVED**
- [x] Left sidebar navigation with mobile hamburger drawer — **APPROVED**
- [x] Navigation markup served from single `components/nav.html` fragment, loaded by `nav.js` — **APPROVED** (replaces sidebar HTML duplication)
- [x] Relative API paths (`/api/v1/...`) — no hardcoded domain — **APPROVED**
- [x] Price entry as a separate page (`prices.html`) — **APPROVED**

### Design System
- [ ] Colour palette (dark navy/slate base, blue primary, status colour scale) approved
- [ ] Typography: Inter via Google Fonts CDN approved
- [ ] Monospace font for price values only approved
- [ ] 4px-base spacing scale approved
- [ ] CSS custom property naming conventions approved
- [ ] 5 chart colours for comparison series approved

### Page Inventory
- [ ] All 11 pages in the file structure approved
- [ ] Business profile editing as modal (not separate page) approved

### Backend Limitations Acknowledged
- [ ] `significantChange` will NOT be displayed anywhere
- [ ] Material PATCH limited to `isTracked` — no UI for editing custom material name/unit
- [ ] Email verification endpoints are 501 stubs — no verification UI in any flow
- [ ] No `/auth/me` — JWT decoded client-side for user identity
- [ ] Empty news/alert-events in v1 is expected — handled as informational empty states
- [ ] Password reset emails not delivered in dev — UI uses exact API message

### Implementation Readiness
- [ ] All 10 implementation phases understood and sequenced correctly
- [ ] Each phase has defined acceptance criteria and can be tested independently
- [ ] No phase writes code requiring a future phase to function
- [ ] Backend API base URL uses relative path `/api/v1` (not hardcoded localhost)
- [ ] Chart.js loaded only on `trends.html`

### Accessibility
- [ ] Skip link planned for every page
- [ ] Focus trap planned for all modals
- [ ] Accessible chart data table alternative planned for every chart
- [ ] ARIA live regions planned for toast notifications

---

*End of Document 3 (Frontend) — Frontend Architecture & UI Design Specification*

*Version 1.1 — Approved — Frozen — 2026-08-10*
