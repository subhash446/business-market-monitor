# Document 4 (Frontend): Frontend Component & Page Specification

## Document Control

| Field | Value |
|---|---|
| Project Name | Business Market Monitoring & Alert Platform |
| Document | Frontend Component & Page Specification |
| Version | 1.0 (Approved — Frozen) |
| Status | **APPROVED — FROZEN** |
| Phase | Version 1 Frontend Implementation |
| Source Documents | Doc 3 Frontend Architecture v1.1 (Frozen) · Doc 1 Project Vision (Frozen) · Doc 2 SRS (Frozen) · Doc 5 API Design (Frozen) · Backend v1.0.0 source code |
| Prepared By | Engineering (Frontend Architect) |
| Date | 2026-08-10 |

**Frozen constraints this document must not violate:**
- Backend is frozen at v1.0.0. No new endpoints, fields, or behaviors invented.
- Documents 1, 2, and 3 are frozen. This document refines and concretises their definitions.
- `significantChange` is absent from backend responses — not referenced here.
- `PATCH /materials/:id` supports only `{ isTracked: boolean }` — no name/unit editing.
- Email verification endpoints are 501 stubs — no verification UI.
- No `/auth/me` — user identity decoded client-side from JWT.
- One user → one business. No multi-business UI.
- `innerHTML` with dynamic data is forbidden. The sole approved exception is `nav.js` injecting `components/nav.html`.

---

## Table of Contents

1. [Global Application Shell](#1-global-application-shell)
2. [Authentication Pages](#2-authentication-pages)
3. [Business Profile](#3-business-profile)
4. [Material Tracking](#4-material-tracking)
5. [Price Tracking](#5-price-tracking)
6. [News](#6-news)
7. [Alerts](#7-alerts)
8. [Dashboard](#8-dashboard)
9. [Historical Trends](#9-historical-trends)
10. [Reusable Components](#10-reusable-components)
11. [Form Specification](#11-form-specification)
12. [UI State Matrix](#12-ui-state-matrix)
13. [Responsive Behavior](#13-responsive-behavior)
14. [Accessibility Specification](#14-accessibility-specification)
15. [Page-to-File Mapping](#15-page-to-file-mapping)
16. [API-to-UI Mapping](#16-api-to-ui-mapping)
17. [Implementation Readiness Checklist](#17-implementation-readiness-checklist)

---

## 1. Global Application Shell

### 1.1 Shell Variants

The application has two distinct shell layouts:

| Variant | Pages | Structure |
|---|---|---|
| **Auth Shell** | login, register, forgot-password, reset-password | Centred card, no sidebar |
| **App Shell** | index (redirect), onboarding, dashboard, materials, prices, alerts, news, trends | Sidebar + header + main area |

### 1.2 Auth Shell

**Structure:**
```
<body class="auth-layout">
  <div class="auth-container">
    <div class="auth-brand">       <!-- Logo + app name -->
    <main class="auth-card">       <!-- Form card -->
    <footer class="auth-footer">   <!-- Copyright / version text -->
```

- No sidebar, no top nav
- Centred vertically and horizontally using CSS flexbox
- Max-width: 480px for the card on tablet+; full width with padding on mobile
- Background uses `--color-bg-base` (dark)
- Card uses `--color-bg-surface`, `--radius-xl`, `--shadow-lg`

### 1.3 App Shell — Structure

```
<body class="app-layout">
  <div id="nav-placeholder">       <!-- nav.js injects nav.html here -->
  <div class="app-body">
    <header class="app-header">    <!-- Top header bar -->
    <main id="main-content" class="app-main">
      <div class="page-container"> <!-- Per-page content wrapper -->
```

### 1.4 Sidebar (from `components/nav.html`)

The sidebar is a single HTML fragment loaded by `nav.js`. It is the **only** copy of sidebar markup in the entire project.

**Sidebar DOM structure:**
```html
<aside class="sidebar" id="sidebar" aria-label="Main navigation">
  <div class="sidebar__brand">
    <a href="/pages/dashboard.html" class="sidebar__logo-link">
      <img src="/assets/images/logo.svg" alt="Business Market Monitor" class="sidebar__logo">
      <span class="sidebar__app-name">Market Monitor</span>
    </a>
  </div>

  <div class="sidebar__user">
    <div class="sidebar__avatar" id="nav-user-initials" aria-hidden="true"></div>
    <div class="sidebar__user-info">
      <span class="sidebar__business-name" id="nav-business-name"></span>
      <span class="sidebar__industry-name" id="nav-industry-name"></span>
    </div>
  </div>

  <nav class="sidebar__nav">
    <ul class="sidebar__nav-list" role="list">
      <li><a href="/pages/dashboard.html" class="nav-link" data-page="dashboard">
            <i class="fa-solid fa-chart-line" aria-hidden="true"></i>
            <span class="nav-link__label">Dashboard</span></a></li>
      <li><a href="/pages/materials.html" class="nav-link" data-page="materials">
            <i class="fa-solid fa-boxes-stacked" aria-hidden="true"></i>
            <span class="nav-link__label">Materials</span></a></li>
      <li><a href="/pages/news.html" class="nav-link" data-page="news">
            <i class="fa-solid fa-newspaper" aria-hidden="true"></i>
            <span class="nav-link__label">News</span></a></li>
      <li><a href="/pages/alerts.html" class="nav-link" data-page="alerts">
            <i class="fa-solid fa-bell" aria-hidden="true"></i>
            <span class="nav-link__label">Alerts</span></a></li>
      <li><a href="/pages/trends.html" class="nav-link" data-page="trends">
            <i class="fa-solid fa-chart-area" aria-hidden="true"></i>
            <span class="nav-link__label">Trends</span></a></li>
    </ul>
  </nav>

  <div class="sidebar__footer">
    <button class="sidebar__settings-btn nav-link" id="nav-settings-btn"
            type="button" aria-label="Open business settings">
      <i class="fa-solid fa-gear" aria-hidden="true"></i>
      <span class="nav-link__label">Settings</span>
    </button>
    <button class="sidebar__logout-btn nav-link nav-link--danger" id="nav-logout-btn"
            type="button" aria-label="Log out">
      <i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>
      <span class="nav-link__label">Log Out</span>
    </button>
  </div>
</aside>

<div class="sidebar-overlay" id="sidebar-overlay" aria-hidden="true"></div>
```

**Dynamic population by `nav.js`:**
- `#nav-user-initials`: first letter of user email, uppercased (from `auth.getCurrentUser().email`)
- `#nav-business-name`: `business.name` from `session.getCachedBusiness()`
- `#nav-industry-name`: `business.industryName` from `session.getCachedBusiness()`
- Active nav link: `nav-link--active` class added to `<a>` whose `data-page` matches the current page
- `aria-current="page"` added to the active link

**Sidebar states:**

| State | Class on `<aside>` | Behaviour |
|---|---|---|
| Default (desktop laptop) | `sidebar--expanded` | Fully visible, labels shown |
| Collapsed (laptop) | `sidebar--collapsed` | Icons only, labels hidden |
| Open (mobile/tablet) | `sidebar--open` | Slides in as drawer, overlay shown |
| Closed (mobile/tablet) | (none) | Hidden off-screen |
| Loading user info | `sidebar--loading` | Initials/name placeholders show skeleton |
| Populated | `sidebar--ready` | Opacity transition to full visibility |

### 1.5 Top Header Bar

```html
<header class="app-header">
  <button class="app-header__hamburger" id="sidebar-toggle"
          type="button" aria-label="Toggle navigation" aria-expanded="false"
          aria-controls="sidebar">
    <i class="fa-solid fa-bars" aria-hidden="true"></i>
  </button>
  <h1 class="app-header__page-title" id="page-title"></h1>
  <div class="app-header__actions">
    <span class="app-header__user-badge" id="header-user-initials"
          aria-label="Signed in"></span>
  </div>
</header>
```

- `#page-title` is set by each page JS: `document.getElementById('page-title').textContent = 'Dashboard'`
- Hamburger button: visible only on mobile/tablet; hidden on laptop/desktop
- `#header-user-initials`: first letter of user email, same source as sidebar avatar

### 1.6 Main Content Area

```html
<main id="main-content" class="app-main">
  <a href="#main-content" class="skip-link">Skip to main content</a>
  <div class="page-container">
    <!-- page-specific content -->
  </div>
</main>
```

- Skip link is the first focusable element inside `<main>` — visually hidden until focused
- `.page-container` provides consistent horizontal padding and max-width

### 1.7 Footer

No persistent application footer. Individual pages may include a footer-region inside `.page-container` where appropriate (e.g., pagination controls). There is no global app footer bar.

---

## 2. Authentication Pages

### 2.1 Login Page (`pages/login.html`)

**Layout:** Auth Shell (centred card, no sidebar)

**Page title (`<title>`):** "Sign In — Business Market Monitor"

**Card contents (top to bottom):**
1. Logo/brand mark (small, centred)
2. Heading: `<h1>Sign In</h1>`
3. Session-expired banner (conditional): shown when `?reason=session_expired` in URL
   - Class: `.alert-banner .alert-banner--warning`
   - Text: "Your session has expired. Please sign in again."
   - Dismissible: no (auto-clears after sign-in)
4. Login form
5. "Forgot your password?" link → `/pages/forgot-password.html`
6. Divider
7. "Don't have an account? **Create one**" link → `/pages/register.html`

**Form fields:**

| Field | Type | ID | Placeholder | Validation | Error Message |
|---|---|---|---|---|---|
| Email | `email` | `login-email` | "your@email.com" | Required, valid email format | "Please enter a valid email address." |
| Password | `password` | `login-password` | "Your password" | Required, min 1 char | "Please enter your password." |

**Buttons:**
- Primary: `<button type="submit" id="login-submit-btn" class="btn btn--primary btn--full">Sign In</button>`
- `.btn--full` = `width: 100%`

**Loading state:** `#login-submit-btn` gets `.btn--loading` class; `disabled` attribute set; spinner shown inside button.

**Error states:**
| Trigger | Display Location | Message |
|---|---|---|
| 401 AUTHENTICATION_ERROR | Inline error below form (`#login-form-error`) | "Invalid email or password." |
| 400 VALIDATION_ERROR | Per-field error (`#login-email-error`, `#login-password-error`) | Field-specific messages |
| 429 RATE_LIMITED | Inline error below form | "Too many login attempts. Please wait before trying again." |
| Network error | Inline error below form | "Could not connect to the server. Check your connection." |

**Success behavior:** `auth.setTokens()` → check `businessId` → redirect to `/pages/dashboard.html` or `/pages/onboarding.html`

**API endpoint:** `POST /api/v1/auth/login` — body: `{ email, password }`

**Redirect if already authenticated:** → `/pages/dashboard.html` (or `/pages/onboarding.html` if no business)

---

### 2.2 Registration Page (`pages/register.html`)

**Layout:** Auth Shell

**Page title:** "Create Account — Business Market Monitor"

**Card contents:**
1. Logo/brand mark
2. Heading: `<h1>Create Your Account</h1>`
3. Subheading: `<p>Start monitoring your market in minutes.</p>`
4. Registration form
5. "Already have an account? **Sign in**" link → `/pages/login.html`

**Form fields:**

| Field | Type | ID | Placeholder | Validation | Error Message |
|---|---|---|---|---|---|
| Full Name | `text` | `reg-fullname` | "Jane Smith" | Required, 2–100 chars | "Please enter your full name." |
| Email | `email` | `reg-email` | "your@email.com" | Required, valid email | "Please enter a valid email address." |
| Password | `password` | `reg-password` | "Create a password" | Required, min 8 chars, at least 1 letter + 1 digit | "Password must be at least 8 characters and include a letter and a number." |

**Password strength hint:** `<p class="form-hint" id="reg-password-hint">Min. 8 characters · at least one letter and one number</p>` — shown below the password field always.

**Buttons:**
- Primary: `<button type="submit" id="reg-submit-btn" class="btn btn--primary btn--full">Create Account</button>`

**Loading state:** Button gets `.btn--loading` + `disabled`.

**Error states:**
| Trigger | Display | Message |
|---|---|---|
| 409 CONFLICT | `#reg-form-error` | "An account with this email address already exists." |
| 400 — email format | `#reg-email-error` | "Please enter a valid email address." |
| 400 — password | `#reg-password-error` | "Password must be at least 8 characters and include a letter and a number." |
| 400 — fullName | `#reg-fullname-error` | "Please enter your full name." |
| Network error | `#reg-form-error` | "Could not connect to the server. Check your connection." |

**Success behavior:** Auto-login (`POST /auth/login` with same credentials) → `auth.setTokens()` → redirect to `/pages/onboarding.html`

**API endpoints:**
1. `POST /api/v1/auth/register` — body: `{ email, password, fullName }`
2. `POST /api/v1/auth/login` — body: `{ email, password }` (auto-login, same credentials)

---

### 2.3 Forgot Password Page (`pages/forgot-password.html`)

**Layout:** Auth Shell

**Page title:** "Reset Your Password — Business Market Monitor"

**Card contents:**
1. Logo/brand mark
2. Heading: `<h1>Reset Your Password</h1>`
3. Body copy: `<p>Enter your email address and we'll send you a reset link if your account exists.</p>`
4. Form (replaced by success message on submit)
5. "Back to Sign In" link → `/pages/login.html`

**Form fields:**

| Field | Type | ID | Placeholder | Validation | Error Message |
|---|---|---|---|---|---|
| Email | `email` | `fp-email` | "your@email.com" | Required, valid email format | "Please enter a valid email address." |

**Buttons:**
- Primary: `<button type="submit" id="fp-submit-btn" class="btn btn--primary btn--full">Send Reset Link</button>`

**Success state:** Entire form is hidden and replaced with:
```
<div class="success-message" id="fp-success" role="status">
  <i class="fa-solid fa-circle-check" aria-hidden="true"></i>
  <p>If that email is registered, a reset link has been sent.</p>
  <a href="/pages/login.html" class="btn btn--ghost">Back to Sign In</a>
</div>
```
**Important:** This success message is shown regardless of the API response (prevents email enumeration). The form is hidden; the user cannot re-submit without refreshing.

**Error state:**
| Trigger | Display | Message |
|---|---|---|
| 400 VALIDATION_ERROR (email format) | `#fp-email-error` | "Please enter a valid email address." |
| 429 RATE_LIMITED | `#fp-form-error` | "Too many attempts. Please wait before trying again." |
| Network error | `#fp-form-error` | "Could not connect to the server. Check your connection." |

**Note:** 404 and 200 both display the same success message — no different handling.

**API endpoint:** `POST /api/v1/auth/password-reset/request` — body: `{ email }`

---

### 2.4 Reset Password Page (`pages/reset-password.html`)

**Layout:** Auth Shell

**Page title:** "Set New Password — Business Market Monitor"

**On page load:** Extract `token` from `URLSearchParams`. If absent → show invalid-link state immediately (no form rendered).

**Invalid link state** (shown when no token in URL):
```
<div class="error-state" role="alert">
  <i class="fa-solid fa-circle-xmark"></i>
  <h2>Invalid Reset Link</h2>
  <p>This reset link is missing or malformed. Please request a new one.</p>
  <a href="/pages/forgot-password.html" class="btn btn--primary">Request New Link</a>
</div>
```

**Form (shown when token present):**
- Heading: `<h1>Set a New Password</h1>`

| Field | Type | ID | Placeholder | Validation | Error Message |
|---|---|---|---|---|---|
| New Password | `password` | `rp-password` | "New password" | Required, min 8 chars, 1 letter + 1 digit | "Password must be at least 8 characters and include a letter and a number." |

**Password strength hint:** Same as registration page, shown below field.

**Buttons:**
- Primary: `<button type="submit" id="rp-submit-btn" class="btn btn--primary btn--full">Update Password</button>`

**Success state:** Form hidden, success message shown:
```
<div class="success-message" role="status">
  <i class="fa-solid fa-circle-check"></i>
  <h2>Password Updated</h2>
  <p>Your password has been changed successfully.</p>
  <a href="/pages/login.html" class="btn btn--primary">Sign In</a>
</div>
```

**Error states:**
| Trigger | Display | Message |
|---|---|---|
| 401 AUTHENTICATION_ERROR | `#rp-form-error` | "This reset link is invalid or has expired. Please request a new one." + link to forgot-password |
| 400 VALIDATION_ERROR | `#rp-password-error` | "Password must be at least 8 characters and include a letter and a number." |
| Network error | `#rp-form-error` | "Could not connect to the server. Check your connection." |

**API endpoint:** `POST /api/v1/auth/password-reset/confirm` — body: `{ token, newPassword }`

---

## 3. Business Profile

### 3.1 Onboarding Page (`pages/onboarding.html`)

**Layout:** App Shell (sidebar present via `nav.js`, but nav links show "Onboarding" as active; no active link exists in nav for onboarding — all nav links are inactive)

**Page title:** "Set Up Your Business — Business Market Monitor"

**Auth guard:** `requireAuth()` only. `requireBusiness()` is NOT called here.

**Multi-step layout:**
```
<div class="onboarding-container">
  <div class="onboarding-progress">   <!-- Step indicator -->
  <div class="onboarding-step" id="step-1"> <!-- Industry Selection -->
  <div class="onboarding-step" id="step-2"> <!-- Business Details -->
  <div class="onboarding-step" id="step-3"> <!-- Confirmation -->
```

**Step indicator:**
- 3 circles: "1 Industry", "2 Details", "3 Done"
- Current step: `.step-indicator__item--active`
- Completed steps: `.step-indicator__item--complete`

---

**Step 1 — Industry Selection:**

Heading: `<h2>Select Your Industry</h2>`
Body: `<p>Choose the industry that best matches your business.</p>`

Data source: `GET /api/v1/industries` (called on page load, before user interaction)

Loading state: 5 skeleton cards rendered while API call is in flight.

Industry grid:
- CSS grid, 1 col on mobile, 2 cols on tablet, 3 cols (or 2 wide) on desktop
- Each card: `.industry-card`
  - Icon (Font Awesome, per industry)
  - Industry `name`
  - Industry `description`
  - Click → `.industry-card--selected` class applied, previous selection cleared
  - `aria-pressed="true"` on selected card; `role="button"` or `<button>` element for keyboard access

**Industry icons mapping** (5 industries from API, icons assigned by frontend):
| Industry Name (from API) | Font Awesome Icon |
|---|---|
| Manufacturing | `fa-industry` |
| Agriculture | `fa-seedling` |
| Construction | `fa-helmet-safety` |
| Food & Beverage | `fa-utensils` |
| Textile | `fa-shirt` |

Note: Industry names come from `GET /industries`. Icon assignment is frontend-only; if an industry name doesn't match the table above, a default `fa-building` icon is used.

"Continue" button: disabled until a card is selected. On click → hide step 1, show step 2.

Error state: If `GET /industries` fails → error state with "Try again" button that re-fetches.

---

**Step 2 — Business Details:**

Heading: `<h2>Tell Us About Your Business</h2>`

Form fields:

| Field | Type | ID | Required | Validation | Error Message |
|---|---|---|---|---|---|
| Business Name | `text` | `ob-business-name` | Yes | 2–150 chars | "Business name is required (2–150 characters)." |
| Contact Email | `email` | `ob-contact-email` | No | Valid email if provided | "Please enter a valid email address." |
| Contact Phone | `tel` | `ob-contact-phone` | No | No strict format validation | — |
| Address | `textarea` | `ob-address` | No | Max 500 chars | — |

"Back" button: returns to Step 1 preserving both steps' selected values in JS module variables.
"Create Business" button: primary, calls `POST /api/v1/business`.

Loading state: "Create Business" button gets `.btn--loading` + `disabled`.

Error states:
| Trigger | Display | Message |
|---|---|---|
| 400 — name | `#ob-business-name-error` | "Business name is required (2–150 characters)." |
| 400 — contactEmail | `#ob-contact-email-error` | "Please enter a valid email address." |
| 409 CONFLICT | `#ob-form-error` | hide form, show "You already have a business profile." + dashboard link |
| Network error | `#ob-form-error` | "Could not connect to the server. Check your connection." |

---

**Step 3 — Confirmation:**

Heading: `<h2>You're all set!</h2>`

Content:
- Green checkmark icon
- "`{name}` has been created."
- "`{materialsGenerated}` materials have been pre-loaded from your industry template." (e.g., "12 materials...")
- Body copy: "We've set up your workspace. Click below to refresh your session and go to your dashboard."

Button: `<button id="ob-goto-dashboard-btn" class="btn btn--primary btn--full">Go to Dashboard</button>`

On click:
1. Button gets `.btn--loading` + `disabled`
2. `POST /api/v1/auth/refresh` with `{ refreshToken }` from `auth.getRefreshToken()`
3. `auth.setTokens(newAccessToken, existingRefreshToken)`
4. `window.location.href = '/pages/dashboard.html'`

If refresh fails: show error "Failed to refresh your session. Please sign in again." + link to login.

---

### 3.2 Business Settings Modal

**Access:** Clicking "Settings" in the sidebar (`#nav-settings-btn`) on any authenticated page.

**Modal ID:** `business-settings-modal`

**Modal title:** "Business Settings"

**On open:**
1. Check `session.getCachedBusiness()`. If present → pre-populate fields.
2. If not cached → show skeleton inside modal → call `GET /api/v1/business` → populate → hide skeleton.

**Modal form fields:**

| Field | Type | ID | Required | Validation | Error Message |
|---|---|---|---|---|---|
| Business Name | `text` | `bs-business-name` | Yes | 2–150 chars | "Business name is required (2–150 characters)." |
| Contact Email | `email` | `bs-contact-email` | No | Valid email if provided | "Please enter a valid email address." |
| Contact Phone | `tel` | `bs-contact-phone` | No | None | — |
| Address | `textarea` | `bs-address` | No | Max 500 chars | — |
| News Digest Enabled | `checkbox` | `bs-digest-enabled` | — | On/Off toggle | — |
| News Digest Frequency | `select` | `bs-digest-frequency` | Conditionally (if enabled) | Must be one of: DAILY, WEEKLY, MONTHLY | — |

**Read-only display (not editable):**
- Industry: `<p class="form-control--readonly" id="bs-industry-display"></p>` — populated with `business.industryName`
- Label: "Industry (cannot be changed)"

**`#bs-digest-frequency` select options:**
- `<option value="DAILY">Daily</option>`
- `<option value="WEEKLY">Weekly</option>`
- `<option value="MONTHLY">Monthly</option>`

`#bs-digest-frequency` is disabled when `#bs-digest-enabled` is unchecked.

**Modal footer buttons:**
- Cancel: `<button type="button" class="btn btn--ghost" id="bs-cancel-btn">Cancel</button>` — closes modal without saving
- Save: `<button type="submit" class="btn btn--primary" id="bs-save-btn">Save Changes</button>`

**Loading state:** `#bs-save-btn` gets `.btn--loading` + `disabled`; `#bs-cancel-btn` also `disabled` (prevent dismissal during save).

**Success behavior:** `showToast({ type: 'success', message: 'Business settings updated.' })` → close modal → update `session.setCachedBusiness(updatedBusiness)`.

**Error states:**
| Trigger | Display | Message |
|---|---|---|
| 400 — name | `#bs-business-name-error` (inside modal) | "Business name is required (2–150 characters)." |
| 400 — contactEmail | `#bs-contact-email-error` | "Please enter a valid email address." |
| Network error | `#bs-form-error` (inside modal) | "Could not save changes. Check your connection." |
| 500 | `#bs-form-error` | "Something went wrong. Please try again." |

**API endpoint:** `PUT /api/v1/business` — body: `{ name, contactEmail, contactPhone, address, newsDigestEnabled, newsDigestFrequency }`

---

## 4. Material Tracking

### 4.1 Materials Page (`pages/materials.html`)

**Layout:** App Shell

**Page title (`<title>`):** "Materials — Business Market Monitor"

**Header bar title:** "Materials"

**Auth guard:** `requireAuth()` + `requireBusiness()`

**API calls on page load:**
1. `GET /api/v1/materials` — load all materials
2. `GET /api/v1/units-of-measurement` — load units for the Add Custom Material form

Both called in parallel (`Promise.all`).

---

**Page layout (top to bottom):**

**Toolbar:**
```
[Filter: All | Tracked Only]          [+ Add Custom Material]
```
- Filter: two `<button>` elements acting as a toggle group (`.filter-btn`, `.filter-btn--active`)
- "All": shows all materials; "Tracked Only": shows only `isTracked === true`
- Filter is client-side — no API re-call
- "Add Custom Material" button: `.btn .btn--secondary` — opens the Add Custom Material inline form/panel

**Materials list/table:**
- On **tablet+**: rendered as a `<table>`
- On **mobile**: rendered as stacked cards (`.material-card`)

**Table columns:**
| Column | Content | Notes |
|---|---|---|
| Name | `material.name` | Via `textContent` (both industry-seeded and custom materials expose this field in the API response) |
| Unit | `material.unit` | Via `textContent` (abbreviation, e.g. "t", "kg") |
| Source | Badge: "Industry" or "Custom" | Based on `material.isCustom` |
| Tracking | Toggle button | `isTracked` state |
| Actions | "Log Price" link · "View History" link | Shown only when `isTracked === true` |

**Source badge values:**
- `isCustom === false` → `.badge .badge--info` "Industry"
- `isCustom === true` → `.badge .badge--neutral` "Custom"

**Tracking toggle button:**
- Tracked state: `.btn .btn--sm .btn--success` with `aria-label="Disable tracking for {name}"`, text "Tracked"
- Untracked state: `.btn .btn--sm .btn--secondary` with `aria-label="Enable tracking for {name}"`, text "Track"
- On click: button gets `.btn--loading` + `disabled` → `PATCH /api/v1/materials/:id` with `{ isTracked: !current }` → on success: update button state and row in-place without full reload → show success toast "Tracking updated."
- On error: toast "Failed to update tracking. Please try again." → revert button state

**Action links (tracked materials only):**
- "Log Price" → `<a href="/pages/prices.html?materialId={id}" class="btn btn--sm btn--ghost">Log Price</a>`
- "View History" → `<a href="/pages/trends.html?materialId={id}" class="btn btn--sm btn--ghost">History</a>`

**Loading state:** Skeleton table (5 skeleton rows) shown while `GET /materials` is in flight.

**Empty states:**
- All filter, no materials at all: "No materials in your workspace." (shouldn't occur if business was created with a template, but handle gracefully)
- Tracked Only filter, no tracked materials: empty state with icon + "You are not tracking any materials yet. Click 'Track' next to a material to start." + "View All Materials" button to switch filter.

**Error state:** If `GET /materials` fails → error state with "Try again" button.

---

**Add Custom Material Form:**

Rendered as a collapsible panel below the toolbar (not a modal). Hidden by default. Revealed with a slide-down animation when "+ Add Custom Material" is clicked. The button toggles to "Cancel" when the panel is open.

| Field | Type | ID | Required | Validation | Error Message |
|---|---|---|---|---|---|
| Material Name | `text` | `cm-name` | Yes | 1–150 chars | "Material name is required (max 150 characters)." |
| Unit | `select` | `cm-unit` | Yes | Must select a valid `unitId` from the list | "Please select a unit of measurement." |

`#cm-unit` select: populated from `GET /units-of-measurement` response. First option is disabled placeholder: "Select a unit..."

**Submit button:** `<button type="submit" id="cm-submit-btn" class="btn btn--primary">Add Material</button>`

**Success behavior:** Hide and reset the form → insert new material row at top of list (or prepend to list) → show toast "Custom material added."

**Error states:**
| Trigger | Display | Message |
|---|---|---|
| 400 — customName | `#cm-name-error` | "Material name is required (max 150 characters)." |
| 400 — unitId | `#cm-unit-error` | "Please select a unit of measurement." |
| 409 CONFLICT | `#cm-form-error` | "A material with this name already exists." |
| Network error | `#cm-form-error` | "Could not add material. Check your connection." |

**API endpoint:** `POST /api/v1/materials` — body: `{ customName, unitId }`

**Important:** No edit-material-name or edit-unit UI exists anywhere. `PATCH /materials/:id` supports only `{ isTracked }`.

---

## 5. Price Tracking

### 5.1 Price Entry Page (`pages/prices.html`)

**Layout:** App Shell

**Page title:** "Log Price — Business Market Monitor"

**Header bar title:** "Log Price"

**Auth guard:** `requireAuth()` + `requireBusiness()`

**URL param:** `?materialId=<id>` (required)

**On page load (parallel):**
1. `GET /api/v1/materials` — find material by `materialId` param (for name and unit display)
2. `GET /api/v1/materials/:materialId/prices/latest` — show current latest price

If `materialId` is absent from the URL → redirect to `/pages/materials.html`.

If material not found in the list (404 or ID not in response) → show not-found state and stop.

---

**Page layout:**

**Material header card:**
```
<div class="material-header-card">
  <h2 id="price-material-name"></h2>   <!-- e.g., "Steel Rebar" -->
  <span class="badge badge--info" id="price-unit-badge"></span>   <!-- e.g., "per tonne" -->
</div>
```

**Current price panel:**
- Shows: "Current Price" label + formatted price value + date
- If `GET /prices/latest` returns **404** (no price recorded yet): show the panel with the text "No price recorded yet for this material." — this is a semantic 404, **not** an error state; do not render the error-state component.
- Loading: skeleton (one line)
- Formatted price: monospace font (`--font-mono`), e.g., "1,250.00"
- Formatted date: `format.js` → e.g., "10 Aug 2026"
- **Unit display:** Source `material.unit` from the `GET /materials` list loaded in parallel. The price response does not contain a `unit` field; the unit abbreviation (e.g., "/ t") must come from the material object.

**Price entry form:**

| Field | Type | ID | Required | Validation | Error Message |
|---|---|---|---|---|---|
| Price | `number` | `pe-price` | Yes | > 0, max 15 digits, 2 decimal places | "Price must be a positive number." |
| Date | `date` | `pe-date` | Yes | Not in the future; defaults to today | "Date cannot be in the future." |

`#pe-date` is pre-populated with today's date (`new Date().toISOString().split('T')[0]`) on page load.

**Submit button:** `<button type="submit" id="pe-submit-btn" class="btn btn--primary">Log Price</button>`

**Loading state:** Button `.btn--loading` + `disabled`.

**Success behavior:**
1. Show toast: "Price logged successfully."
2. Update the "Current Price" panel in-place with the new price and date (no full reload).
3. Reset the price field to empty; keep the date field at today.

**Error states:**
| Trigger | Display | Message |
|---|---|---|
| 400 — price ≤ 0 | `#pe-price-error` | "Price must be a positive number." |
| 400 — future date | `#pe-date-error` | "Date cannot be in the future." |
| 404 — material not found | Full page not-found state | "Material not found. It may have been removed or doesn't belong to your business." + back link |
| 404 — no price recorded | Informational notice inside current-price panel (not the error-state component) | "No price recorded yet for this material." |
| Network error | `#pe-form-error` | "Could not log price. Check your connection." |

**Back link:** `<a href="/pages/materials.html" class="btn btn--ghost">← Back to Materials</a>`

**API endpoints:**
- `GET /api/v1/materials` — find material name/unit
- `GET /api/v1/materials/:id/prices/latest` — get current price; response: `{ price, recordedAt, source }` (no `unit` field); returns **404** when no price has been recorded (not a null-valued success)
- `POST /api/v1/materials/:id/prices` — body: `{ price, recordedAt }`

---

## 6. News

### 6.1 News Page (`pages/news.html`)

**Layout:** App Shell

**Page title:** "Industry News — Business Market Monitor"

**Header bar title:** "News"

**Auth guard:** `requireAuth()` + `requireBusiness()`

**API call on load:** `GET /api/v1/news?page=1&limit=20`

**Page layout:**

**Toolbar:**
```
<h2>Industry News</h2>
<p class="page-subtitle" id="news-industry-label">
  Showing news for: {industryName}
</p>
```
`{industryName}` is pulled from `session.getCachedBusiness().industryName`.

**News list:**
- Each item: `.news-card`
  - Article title: `<h3 class="news-card__title"><a href="{url}" target="_blank" rel="noopener noreferrer">{title}</a></h3>` — title via `textContent` on the `<a>`
  - Source name: `<span class="news-card__source">{sourceName}</span>`
  - Published date: `<time class="news-card__date" datetime="{publishedAt}">{formatted date}</time>`
  - External link icon: `<i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i>` after title link

**Loading state:** 5 skeleton cards.

**Empty state:**
- Icon: `fa-newspaper`
- Title: "No news available yet"
- Message: "Industry news articles will appear here once your news feed is connected. This feature is pending activation in the current version."
- No action button (there is nothing the user can do to trigger news ingestion)

**Error state:** Error state component with "Try again" button.

**Pagination:** Below the news list. Uses `pagination.js` component. `meta` from API response. Default: `page=1`, `limit=20`.

**API endpoint:** `GET /api/v1/news` — params: `{ page, limit }`

**Response fields consumed:**
- `data.news[]`: `{ id, title, url, sourceName, publishedAt }`
- `meta`: `{ page, limit, total, totalPages }`

---

## 7. Alerts

### 7.1 Alerts Page (`pages/alerts.html`)

**Layout:** App Shell

**Page title:** "Alerts — Business Market Monitor"

**Header bar title:** "Alerts"

**Auth guard:** `requireAuth()` + `requireBusiness()`

**API calls on load (parallel):**
1. `GET /api/v1/materials` — for material name lookup and the create-rule material dropdown (tracked only)
2. `GET /api/v1/alerts/rules` — load alert rules

**Two tabs:**
```
<div class="tab-bar" role="tablist">
  <button class="tab-btn tab-btn--active" role="tab" id="tab-rules"
          aria-selected="true" aria-controls="panel-rules">Alert Rules</button>
  <button class="tab-btn" role="tab" id="tab-events"
          aria-selected="false" aria-controls="panel-events">Alert History</button>
</div>
<div class="tab-panel" id="panel-rules" role="tabpanel" aria-labelledby="tab-rules">
<div class="tab-panel tab-panel--hidden" id="panel-events" role="tabpanel" aria-labelledby="tab-events">
```

Clicking "Alert History" tab triggers `GET /api/v1/alerts/events?page=1&limit=20` (lazy load — only when the tab is first opened).

---

**Alert Rules Tab:**

**Toolbar:**
```
<h2>Alert Rules</h2>     [+ Create Alert Rule]
```

**Alert Rules Table:**

| Column | Content |
|---|---|
| Material | Material name (looked up from loaded materials list by `trackedMaterialId`) |
| Condition | Formatted string: "Price Above" or "Price Below" |
| Threshold | Formatted number (monospace), e.g., "1,500.00" |
| Status | Badge: `.badge--success` "Active" or `.badge--neutral` "Paused" |
| Actions | Toggle button · Delete button |

**Toggle active/inactive button:**
- Active rule: button `.btn .btn--sm .btn--ghost` text "Pause", `aria-label="Pause alert rule for {material}"`
- Inactive rule: button `.btn .btn--sm .btn--secondary` text "Activate", `aria-label="Activate alert rule for {material}"`
- On click → `PATCH /api/v1/alerts/rules/:id` with `{ isActive: !current }` → update row in-place → toast "Alert rule updated."

**Delete button:**
- `.btn .btn--sm .btn--danger .btn--icon`, `aria-label="Delete alert rule for {material}"`
- Icon: `<i class="fa-solid fa-trash" aria-hidden="true"></i>`
- On click → `confirmAction({ title: 'Delete Alert Rule', message: 'Are you sure you want to delete this alert rule? This cannot be undone.', confirmLabel: 'Delete', onConfirm })` → `DELETE /api/v1/alerts/rules/:id` → remove row from table → toast "Alert rule deleted."

**Loading state:** Skeleton table (3 rows).

**Empty state:**
- Icon: `fa-bell-slash`
- Title: "No alert rules yet"
- Message: "Create an alert rule to get notified when a material price crosses a threshold."
- Action: "Create Alert Rule" button (opens create form)

**Error state:** Error component with retry.

---

**Create Alert Rule Form:**

Triggered by "+ Create Alert Rule" button → opens a modal (uses `modal.js`).

**Modal title:** "Create Alert Rule"

Form fields:

| Field | Type | ID | Required | Validation | Error Message |
|---|---|---|---|---|---|
| Material | `select` | `ar-material` | Yes | Must select a tracked material | "Please select a material." |
| Condition | Radio group | `ar-condition-above` / `ar-condition-below` | Yes | Must select one | "Please select a condition." |
| Threshold Price | `number` | `ar-threshold` | Yes | > 0, 2 decimal places | "Threshold must be a positive number." |

`#ar-material` options: only tracked materials (`isTracked === true`) from the already-loaded materials list.
First option: disabled placeholder "Select a material…"

Condition radio buttons:
```
<fieldset>
  <legend>Condition</legend>
  <label><input type="radio" name="ar-condition" id="ar-condition-above" value="PRICE_ABOVE"> Price goes above threshold</label>
  <label><input type="radio" name="ar-condition" id="ar-condition-below" value="PRICE_BELOW"> Price goes below threshold</label>
</fieldset>
```

**Modal footer:**
- Cancel: `.btn .btn--ghost`
- Create Rule: `.btn .btn--primary` (submit)

**Success behavior:** Close modal → insert new rule at top of table → toast "Alert rule created."

**Error states:**
| Trigger | Display | Message |
|---|---|---|
| 400 — material | `#ar-material-error` | "Please select a material." |
| 400 — condition | `#ar-condition-error` | "Please select a condition." |
| 400 — threshold | `#ar-threshold-error` | "Threshold must be a positive number." |
| 409 CONFLICT | `#ar-form-error` | "An alert rule already exists for this material and condition." |
| Network error | `#ar-form-error` | "Could not create alert rule. Check your connection." |

**API endpoint:** `POST /api/v1/alerts/rules` — body: `{ trackedMaterialId, conditionType, thresholdPrice }`

---

**Alert History Tab:**

**Lazy loaded** when tab first clicked. Loading state: skeleton table shown while `GET /alerts/events` is in progress.

**Alert Events Table:**

| Column | Content |
|---|---|
| Triggered At | Formatted datetime (e.g., "10 Aug 2026, 14:30") |
| Condition | e.g., "Price Above 1,500.00" (from `conditionType` + `thresholdPrice` snapshots) |
| Triggered Price | Formatted price (monospace) |
| Delivery Status | Badge (see below) |

**Delivery status badges:**
- `PENDING` → `.badge--warning` "Pending"
- `SENT` → `.badge--success` "Sent"
- `FAILED` → `.badge--danger` "Failed"

**Pagination:** Below the events table. Uses `pagination.js`. Default: `page=1`, `limit=20`.

**Empty state:**
- Icon: `fa-bell`
- Title: "No alerts triggered yet"
- Message: "Alert events will appear here when a material price crosses one of your alert thresholds. Automated monitoring is pending activation in the current version."

**Error state:** Error component with retry.

> **Source clarification:** The events shown in this tab come from `GET /api/v1/alerts/events` (full, paginated list with the complete event payload including `triggeredPrice`, `conditionTypeSnapshot`, `thresholdPriceSnapshot`, `deliveryStatus`). The Dashboard "Recent Alert Events" panel (section 8 Panel 4) uses a trimmed 5-item subset returned by `GET /api/v1/dashboard`, which includes only `{ id, triggeredAt }` per event. These are not different backend concepts — the difference is the endpoint and aggregation scope.

**API endpoint:** `GET /api/v1/alerts/events` — params: `{ page, limit }`

---

## 8. Dashboard

### 8.1 Dashboard Page (`pages/dashboard.html`)

**Layout:** App Shell

**Page title:** "Dashboard — Business Market Monitor"

**Header bar title:** "Dashboard"

**Auth guard:** `requireAuth()` + `requireBusiness()`

**API calls on load (parallel):**
1. `GET /api/v1/dashboard` — primary data
2. `GET /api/v1/business` — for business name/industry in sidebar (if not cached)

**Loading state:** All 5 panels show skeleton simultaneously. The skeletons are shown as soon as the page renders, before the API call returns.

**Dashboard grid:** On desktop/laptop: 2–3 column CSS grid. On tablet/mobile: single column stack.

---

**Panel 1 — Tracked Materials**

Card: `.dashboard-card`
Card header: "Tracked Materials" + link "Manage →" → `/pages/materials.html`

Content (from `dashboard.trackedMaterials[]`):
- Each material: `.material-item`
  - Material name: `<span class="material-item__name"></span>` (textContent)
  - Latest price: `<span class="material-item__price font-mono"></span>` — `latestPrice` from the dashboard response is a **scalar `number | null`**, not an object. Display the formatted number only (e.g., "1,250.00"). The dashboard endpoint does not return a unit or date alongside the price; do not append a unit suffix here.
  - If `latestPrice === null`: `<span class="material-item__price material-item__price--null">No price recorded</span>`
  - Quick action links:
    - "Add Price" → `<a href="/pages/prices.html?materialId={id}" class="btn btn--sm btn--ghost">Add Price</a>`
    - "Trends" → `<a href="/pages/trends.html?materialId={id}" class="btn btn--sm btn--ghost">Trends</a>`

**`significantChange` is absent and must not be referenced.** No percentage badges, no arrow icons, no colour-coded change indicators anywhere in this panel.

**Dashboard response fields consumed:** `trackedMaterials[].id`, `trackedMaterials[].name`, `trackedMaterials[].latestPrice` — scalar `number | null`. `latestPrice` is the raw numeric price value (e.g., `1250.00`) or `null` if no price has been recorded. There is no `unit`, `recordedAt`, or nested object.

**Empty state:**
- Icon: `fa-boxes-stacked`
- Message: "No materials are being tracked yet."
- Action: "Go to Materials" → `/pages/materials.html`

---

**Panel 2 — Recent News**

Card header: "Recent News" + link "View All →" → `/pages/news.html`

Content (from `dashboard.recentNews[]`):
- Up to 5 items. Each item: `<li class="news-item"><span class="news-item__title"></span></li>`
- Title only — `textContent` from `item.title`
- **No URL, no source name, no date** — these fields are NOT in the dashboard response
- Clicking a title: **no link** — the dashboard response only has `{ id, title }`. A "View All News" link at the card footer provides navigation to the full news page.

**Empty state:**
- Icon: `fa-newspaper`
- Message: "No recent news available."
- Body: "News will appear here once your industry feed is connected."

---

**Panel 3 — Active Alert Rules**

Card header: "Active Alert Rules" + link "Manage →" → `/pages/alerts.html`

Content (from `dashboard.activeAlertRules[]`):
- Up to 5 items. Each item:
  - Condition text: "Price Above 1,500.00" or "Price Below 90.00" — formatted from `conditionType` + `thresholdPrice`
  - **No material name, no status badge** — `{ id, conditionType, thresholdPrice }` only in dashboard response

**Empty state:**
- Icon: `fa-bell-slash`
- Message: "No active alert rules."
- Action: "Create Alert Rule" → `/pages/alerts.html`

---

**Panel 4 — Recent Alert Events**

Card header: "Recent Alert Events" + link "View History →" → `/pages/alerts.html`

Content (from `dashboard.recentAlertEvents[]`):
- Up to 5 items. Each item:
  - Triggered at: formatted datetime — e.g., "10 Aug 2026, 14:30"
  - **Only `triggeredAt` is shown** — `{ id, triggeredAt }` only in dashboard response

**Empty state:**
- Icon: `fa-bell`
- Message: "No alerts triggered yet."
- Body: "Alert events appear here when prices cross your thresholds."

---

**Panel 5 — Sync Status**

Card: smaller, spans full width at the bottom of the grid.
Card header: "Data Sync Status"

Content (from `dashboard.sync`):
- Price sync: "Last price update: **Never**" — `sync.lastPriceSyncAt` is `null` in v1
- News sync: "Last news update: **Never**" — `sync.lastNewsSyncAt` is `null` in v1
- Both `null` values display as "Never" — this is **not an error state** and must not use a danger colour. Use `--color-text-secondary`.
- A small info icon with tooltip/title: "Automated data sync is pending activation. Prices are entered manually."

**No error state for this panel specifically** — null sync times are expected and handled as informational.

---

**Dashboard API endpoint:** `GET /api/v1/dashboard`

**Full response structure consumed:**

```
data: {
  trackedMaterials: [{ id, name, latestPrice: number | null }],   // latestPrice is a raw scalar, not an object
  recentNews:       [{ id, title }],
  activeAlertRules: [{ id, conditionType, thresholdPrice }],
  recentAlertEvents:[{ id, triggeredAt }],
  sync: { lastPriceSyncAt: null, lastNewsSyncAt: null }
}
```

---

## 9. Historical Trends

### 9.1 Trends Page (`pages/trends.html`)

**Layout:** App Shell

**Page title:** "Price Trends — Business Market Monitor"

**Header bar title:** "Trends"

**Auth guard:** `requireAuth()` + `requireBusiness()`

**Chart.js:** Loaded via CDN only on this page. Script tag at end of `<body>`, before the page module script.

**URL param:** `?materialId=<id>` — optional. If present and valid, pre-selects the material in Tab 1.

**API call on load:** `GET /api/v1/materials` — always called, to populate material selectors. Tracked materials only are shown in selectors.

**Two tabs (same tab-bar pattern as Alerts page):**
- Tab 1: "Price History" (single material)
- Tab 2: "Compare Materials" (multi-material)

---

**Tab 1 — Single Material Price History:**

**Controls row:**
```
[Material Selector ▼]  [From: date]  [To: date]  [Apply]
```

**Material selector (`#ph-material`):**
- `<select>` populated with tracked materials
- First option: disabled placeholder "Select a material…"
- If `?materialId` in URL and that ID exists in tracked materials → pre-select it

**Date range inputs:**
- `#ph-from`: `<input type="date">` — optional; no default
- `#ph-to`: `<input type="date">` — optional; no default; must not be before `#ph-from`

**Apply button:** `<button id="ph-apply-btn" class="btn btn--primary">Apply</button>` — disabled until a material is selected.

**On Apply:**
1. Apply button gets `.btn--loading` + `disabled`
2. Call `GET /api/v1/materials/:materialId/prices/history` with `{ from?, to?, page: 1, limit: 50 }`
3. Render chart and pagination

**Chart area:**
```
<div class="chart-container" id="ph-chart-container">
  <canvas id="ph-chart" role="img" aria-label="Price history chart for {materialName}"></canvas>
</div>
<div class="chart-data-table-toggle">
  <button type="button" id="ph-show-table-btn" class="btn btn--ghost btn--sm">Show data table</button>
</div>
<div class="chart-data-table" id="ph-data-table" hidden>
  <!-- accessible <table> rendered here by chart.js wrapper -->
</div>
```

**Chart.js configuration (single material line chart):**

```js
{
  type: 'line',
  data: {
    labels: [/* formatted dates from recordedAt values, ascending */],
    datasets: [{
      label: materialName,
      data: [/* price values */],
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.08)',
      tension: 0.3,
      pointRadius: 3,
      pointHoverRadius: 6,
      fill: true
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },  // single line — no legend needed
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.parsed.y.toFixed(2)} / ${material.unit}`,  // material.unit sourced from GET /materials
          title: (ctx) => formatDate(ctx[0].label)
        }
      }
    },
    scales: {
      x: {
        grid: { color: '#30363d' },
        ticks: { color: '#8b949e', maxTicksLimit: 8 }
      },
      y: {
        grid: { color: '#30363d' },
        ticks: { color: '#8b949e', callback: (v) => v.toFixed(2) }
      }
    }
  }
}
```

**Pagination below chart:** Uses `pagination.js`. `limit=50`. On page change → re-fetch with new `page` param → destroy and re-create chart (not update, to avoid data accumulation).

**Loading state:** Chart area shows skeleton (grey animated rectangle, same height as chart).

**Empty state:** (no data returned for the selected material/range)
- Icon: `fa-chart-line`
- Title: "No price data available"
- Message: "There are no price records for this material in the selected date range. Try adjusting the dates or logging some prices."
- Action: "Log a Price" → `prices.html?materialId={id}`

**Error state:** Error component with retry.

---

**Tab 2 — Compare Materials:**

**Controls row:**
```
[Multi-select material list]  [From: date]  [To: date]  [Compare]
```

**Material multi-select:**
- A checkbox list (not a `<select multiple>`) of all tracked materials
- Each item: `<label><input type="checkbox" name="compare-material" value="{id}"> {materialName}</label>`
- Counter: "X / 5 selected" — shown below the list; updates on change
- When 5 are selected: all unchecked checkboxes get `disabled` attribute; a message shows: "Maximum of 5 materials can be compared."
- Counter and message use `role="status"` for screen reader announcements

**Date range inputs:**
- `#cmp-from`: `<input type="date">` — optional
- `#cmp-to`: `<input type="date">` — optional

**Compare button:** `<button id="cmp-apply-btn" class="btn btn--primary">Compare</button>` — disabled until at least 1 material is checked.

**On Compare:**
1. Gather selected `materialIds` as array → join with comma for query string
2. Call `GET /api/v1/materials/prices/compare` with `{ materialIds: "id1,id2,id3", from?, to? }`
3. Render comparison chart

**Compare endpoint response shape:** An **array** of series objects — `[ { materialId, name, series: [{ price, recordedAt }] } ]`. Each element is one material. The `name` field is the material display name and can be used directly as the chart legend label without a separate lookup.

**Chart.js configuration (comparison multi-line chart):**

```js
{
  type: 'line',
  data: {
    labels: [/* merged sorted dates from all series */],
    datasets: [
      /* one dataset per material */
      {
        label: materialName,
        data: [/* aligned price values — null for dates with no entry */],
        borderColor: CHART_COLORS[index],   // 5-color palette from Doc 3 §15.9
        backgroundColor: 'transparent',
        tension: 0.3,
        pointRadius: 3,
        spanGaps: true  // connect across null values
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        labels: { color: '#e6edf3', usePointStyle: true }
      },
      tooltip: {
        mode: 'index',   // show all series values at hovered x
        intersect: false
      }
    },
    scales: { /* same dark-theme grid as single chart */ }
  }
}
```

**Chart colours (in order):** `#3b82f6`, `#22c55e`, `#f59e0b`, `#a855f7`, `#06b6d4`

**Accessible data table:** Same pattern as Tab 1. One table with columns: Date | Material 1 | Material 2 | …

**Loading state:** Skeleton chart.

**Empty state:** "No price data available for the selected materials and date range."

**Error state:** Error component with retry.

---

## 10. Reusable Components

### 10.1 Button

**File:** `css/components.css` (styles) — no JS needed for basic buttons.

**Purpose:** The primary interactive element for user actions.

**Variants:**

| Class | Visual | Use |
|---|---|---|
| `.btn--primary` | Filled, `--color-primary` bg, white text | Main CTA per screen |
| `.btn--secondary` | Outlined, `--color-primary` border and text | Secondary actions |
| `.btn--danger` | Filled, `--color-danger` bg, white text | Destructive actions (delete) |
| `.btn--ghost` | No bg/border, `--color-text-primary` text | Tertiary, navigation-style |
| `.btn--success` | Filled, `--color-success` bg | Positive states (e.g., "Tracked" toggle) |
| `.btn--full` | `width: 100%` | Full-width form submit buttons |
| `.btn--sm` | Smaller padding (`--space-2 --space-3`) and `--text-sm` | In table rows, compact contexts |
| `.btn--icon` | Square aspect, icon centred | Icon-only buttons |
| `.btn--loading` | Shows inline spinner, text hidden or dimmed | Active API request |

**States:**

| State | CSS | JS |
|---|---|---|
| Default | Base `.btn` + variant | — |
| Hover | Darkened bg / border | — |
| Focus | `box-shadow: var(--shadow-focus)` on `:focus-visible` | — |
| Disabled | `opacity: 0.5`, `cursor: not-allowed`, `pointer-events: none` | `disabled` attribute set |
| Loading | `.btn--loading` + `disabled` attr | Spinner injected / visible |

**Required attributes:**
- All `<button>` elements must have `type="button"` (or `type="submit"` for forms)
- Icon-only buttons must have `aria-label="[action] [target]"` e.g., `aria-label="Delete alert rule for Steel Rebar"`
- Loading state must preserve accessible label (spinner is `aria-hidden="true"`)

**Accessibility:** Focusable by keyboard. Focus ring via `:focus-visible`. `disabled` buttons are skipped by Tab.

**Used in:** All pages and modals.

---

### 10.2 Input

**File:** `css/components.css`

**Purpose:** Single-line text entry.

**HTML structure:**
```html
<div class="form-group">
  <label class="form-label" for="field-id">Label Text</label>
  <input class="form-control" type="text" id="field-id" name="field-name"
         aria-describedby="field-id-error field-id-hint" autocomplete="...">
  <p class="form-hint" id="field-id-hint">Optional helper text</p>
  <p class="form-error" id="field-id-error" role="alert" hidden>Error message</p>
</div>
```

**States:**

| State | CSS class on `<input>` | Error element |
|---|---|---|
| Default | `.form-control` | Hidden |
| Focus | `:focus-visible` → focus ring | Hidden |
| Error | `.form-control--error` (red border) | Visible (`hidden` removed) |
| Disabled | `[disabled]` attribute | — |

**Types used:** `text`, `email`, `password`, `number`, `date`, `tel`

**Required attributes:** `id`, `name`, `type`, `aria-describedby` (pointing to error + hint IDs)

**Accessibility:** `<label>` always paired with `for=` attribute matching input `id`. `aria-describedby` points to error message element. Error message has `role="alert"` for screen reader announcement on show.

---

### 10.3 Select

**File:** `css/components.css`

**Purpose:** Dropdown selection from a fixed list.

**HTML structure:**
```html
<div class="form-group">
  <label class="form-label" for="select-id">Label</label>
  <select class="form-control" id="select-id" name="select-name"
          aria-describedby="select-id-error">
    <option value="" disabled selected>Select an option…</option>
    <!-- options populated by JS via textContent/value -->
  </select>
  <p class="form-error" id="select-id-error" role="alert" hidden>Error message</p>
</div>
```

**Important:** Select options are populated by JS using:
```js
const opt = document.createElement('option');
opt.value = item.id;
opt.textContent = item.name;  // textContent — not innerHTML
select.appendChild(opt);
```

**States:** Same as Input (default, focus, error, disabled).

**Accessibility:** Native `<select>` — inherently keyboard navigable. `aria-describedby` on error.

**Used in:** Business settings (newsDigestFrequency), Add custom material (unitId), Create alert rule (material), Trends (material selector).

---

### 10.4 Checkbox / Toggle

**File:** `css/components.css`

**Purpose (Checkbox):** For the "News Digest Enabled" toggle in business settings and the compare-materials multi-select in trends.

**Purpose (Toggle/Switch):** Visual variant of checkbox for on/off settings.

**HTML structure (checkbox):**
```html
<label class="checkbox-label">
  <input type="checkbox" class="checkbox-input" id="check-id" name="check-name">
  <span class="checkbox-indicator" aria-hidden="true"></span>
  <span class="checkbox-text">Enable news digest</span>
</label>
```

**HTML structure (toggle switch — business settings):**
```html
<div class="form-group form-group--toggle">
  <label class="toggle-label" for="bs-digest-enabled">
    <span class="toggle-text">News Digest</span>
    <input type="checkbox" class="toggle-input" id="bs-digest-enabled" role="switch"
           aria-checked="false">
    <span class="toggle-slider" aria-hidden="true"></span>
  </label>
</div>
```

**States:** Checked, unchecked, disabled (for max-5 compare materials limit).

**Accessibility:** `role="switch"` + `aria-checked` on toggle. Native checkbox behaviour for keyboard. `:focus-visible` ring.

> **`aria-checked` synchronisation:** When `role="switch"` is applied to a native `<input type="checkbox">`, the browser does **not** automatically update `aria-checked` to reflect the element's `checked` property. JavaScript must keep them in sync: call `toggle.setAttribute('aria-checked', toggle.checked ? 'true' : 'false')` on every `change` event and also on initial render to match the starting checked state.

---

### 10.5 Card

**File:** `css/components.css`

**Purpose:** Container grouping related content with visual surface.

**Variants:**

| Class | Use |
|---|---|
| `.card` | Standard content card |
| `.card--dashboard` | Dashboard panel (fixed min-height) |
| `.card--industry` | Industry selection card (onboarding) — clickable |
| `.card--material` | Material item on mobile view |

**Structure:**
```html
<div class="card">
  <div class="card__header">
    <h2 class="card__title">Title</h2>
    <a href="..." class="card__action-link">Action →</a>
  </div>
  <div class="card__body"><!-- content --></div>
  <div class="card__footer"><!-- optional --></div>
</div>
```

**States:** Default, hover (on clickable variants), loading (skeleton replaces body).

**Accessibility:** Clickable cards use `<button>` or `<a>` as the interactive element, not the card div itself.

---

### 10.6 Table

**File:** `css/components.css`

**Purpose:** Tabular data display (materials, alert rules, alert events).

**Structure:**
```html
<div class="table-wrapper">  <!-- horizontal scroll on mobile -->
  <table class="table">
    <caption class="sr-only">Table description for screen readers</caption>
    <thead>
      <tr class="table__header-row">
        <th class="table__cell table__cell--header" scope="col">Column Name</th>
      </tr>
    </thead>
    <tbody id="table-body-id">
      <tr class="table__row">
        <td class="table__cell">...</td>
      </tr>
    </tbody>
  </table>
</div>
```

**Variants:**
- `.table--compact`: smaller row height (used in dashboard mini-lists)

**Accessibility:** `<caption>` (visually hidden via `.sr-only`), `scope="col"` on `<th>`. Sortable columns (if ever added) would use `aria-sort`.

**Used in:** Materials, Alerts (rules + events), Trends (data table), News (if switched to table layout).

---

### 10.7 Modal

**File:** `js/components/modal.js` + `css/components.css`

**Purpose:** Overlay dialog for focused tasks (create alert rule, business settings, confirmation).

**HTML structure (generated by `modal.js`):**
```html
<div class="modal-backdrop" id="{id}-backdrop" aria-hidden="true"></div>
<div class="modal" id="{id}" role="dialog" aria-modal="true"
     aria-labelledby="{id}-title" hidden>
  <div class="modal__container">
    <div class="modal__header">
      <h2 class="modal__title" id="{id}-title">{title}</h2>
      <button class="modal__close btn btn--icon btn--ghost" type="button"
              aria-label="Close dialog">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    </div>
    <div class="modal__body">{content}</div>
    <div class="modal__footer">{footer}</div>
  </div>
</div>
```

**States:** Hidden (default), Open (backdrop + modal visible), Loading (save/submit in progress).

**Behaviour:**
- Escape key closes
- Backdrop click closes
- Focus trapped inside while open (Tab cycles within modal)
- On open: focus moved to first focusable element inside modal
- On close: focus returned to the trigger element

**Accessibility:** `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to title.

**Used in:** Create alert rule, Business settings.

---

### 10.8 Toast

**File:** `js/components/toast.js` + `css/components.css`

**Purpose:** Non-blocking transient notification at top-right.

**HTML structure (generated by `toast.js`):**
```html
<div class="toast-container" id="toast-container" aria-live="polite" aria-atomic="false">
  <!-- toasts appended here -->
  <!-- Do NOT add aria-live to individual toast elements. The container already -->
  <!-- declares one live region; nested aria-live causes duplicate announcements. -->
  <!-- Use role= on each toast to control urgency:                               -->
  <!--   role="alert"  for error / warning  (assertive, interrupts the user)     -->
  <!--   role="status" for success / info   (polite, non-interrupting)           -->
  <div class="toast toast--{type}" role="alert">  <!-- or role="status" for success/info -->
    <i class="fa-solid fa-{icon}" aria-hidden="true"></i>
    <p class="toast__message">{message}</p>
    <button class="toast__close btn btn--icon btn--ghost" type="button" aria-label="Dismiss notification">
      <i class="fa-solid fa-xmark" aria-hidden="true"></i>
    </button>
  </div>
</div>
```

**Variants:**

| Type | Class | Icon | Element `role` (urgency) |
|---|---|---|---|
| `success` | `.toast--success` | `fa-circle-check` | `role="status"` (polite) |
| `error` | `.toast--error` | `fa-circle-xmark` | `role="alert"` (assertive) |
| `warning` | `.toast--warning` | `fa-triangle-exclamation` | `role="alert"` (assertive) |
| `info` | `.toast--info` | `fa-circle-info` | `role="status"` (polite) |

**Behaviour:** Auto-dismiss after `duration` ms (default 4000). Manual close button. Stacks vertically (newest at top). Slide-in animation from right; slide-out on dismiss.

**API:** `showToast({ message, type, duration? })`

**Accessibility:** The container declares a **single live region** (`aria-live="polite"`, `aria-atomic="false"`). Individual toast elements do **not** carry a second `aria-live` attribute — nested live regions cause duplicate announcements in some screen readers. Urgency is communicated via each toast's `role` attribute: `role="alert"` (assertive) for error/warning; `role="status"` (polite) for success/info. `aria-atomic="false"` ensures each toast is announced independently as it is appended to the DOM.

---

### 10.9 Alert Banner

**File:** `css/components.css`

**Purpose:** Inline persistent banners within a page or card (not toasts). Used for the session-expired warning on login page.

**HTML:**
```html
<div class="alert-banner alert-banner--{type}" role="alert">
  <i class="fa-solid fa-{icon}" aria-hidden="true"></i>
  <p class="alert-banner__message">{message}</p>
</div>
```

**Variants:** `--warning`, `--danger`, `--info`, `--success`

**Used in:** Login page (session-expired notice), password reset pages (error/success messages at page level).

---

### 10.10 Badge

**File:** `css/components.css`

**Purpose:** Small inline status/label indicator.

**HTML:** `<span class="badge badge--{variant}">{text}</span>`

**Variants:**

| Class | Colour | Use |
|---|---|---|
| `.badge--success` | Green | "Tracked", "Active", "Sent" |
| `.badge--neutral` | Grey | "Untracked", "Paused", "Industry" |
| `.badge--warning` | Amber | "Pending" |
| `.badge--danger` | Red | "Failed" |
| `.badge--info` | Indigo | "Custom", "MANUAL" |

**Accessibility:** Badges are inline text. If the badge is the only way a status is conveyed (no surrounding text), add `aria-label` to the parent element.

---

### 10.11 Pagination

**File:** `js/components/pagination.js` + `css/components.css`

**Purpose:** Navigate between pages of API results.

**API:** `createPagination({ meta, onPageChange })` — returns a DOM node inserted below list/table.

**HTML structure (generated):**
```html
<nav class="pagination" aria-label="Pagination">
  <button class="btn btn--ghost btn--sm pagination__prev" type="button"
          aria-label="Previous page" {disabled?}>
    <i class="fa-solid fa-chevron-left" aria-hidden="true"></i> Previous
  </button>
  <span class="pagination__info" aria-live="polite">Page {page} of {totalPages}</span>
  <button class="btn btn--ghost btn--sm pagination__next" type="button"
          aria-label="Next page" {disabled?}>
    Next <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
  </button>
</nav>
```

**Behaviour:**
- Previous button disabled on page 1
- Next button disabled on last page
- Page info updated on change
- `aria-live="polite"` on page info announces page change to screen readers

**Used in:** News, Alert Events, Price History (Trends Tab 1).

---

### 10.12 Loading Skeleton

**File:** `js/components/loader.js` + `css/components.css`

**Purpose:** Placeholder animation while data loads, preventing layout shift.

**API:** `showSkeleton(container, config)` / `hideSkeleton(container)`

**Config shape:** `{ rows: 5, type: 'table' | 'card' | 'chart' | 'text' }`

**Table skeleton:** Renders N rows of grey animated bars matching table column widths.

**Card skeleton:** Renders a card outline with animated grey bars for title and body.

**Chart skeleton:** Renders a grey rectangle the same height as the chart canvas.

**CSS:** `.skeleton` class with `background: linear-gradient(90deg, var(--color-bg-elevated) 25%, var(--color-bg-hover) 50%, var(--color-bg-elevated) 75%)` animated left-to-right (shimmer effect). Disabled for `prefers-reduced-motion`.

**Accessibility:** The container has `role="status"` and `aria-label="Loading..."` while skeleton is active.

---

### 10.13 Spinner

**File:** `css/components.css` (CSS-only)

**Purpose:** Inline loading indicator for button loading states and small targeted actions.

**HTML:** `<span class="spinner" aria-hidden="true"></span>`

**CSS:** Circular rotating border using `@keyframes`. Size variants: `.spinner--sm` (16px, used in buttons), `.spinner--lg` (40px, used as page-level overlay).

**In buttons:** The spinner is placed inside the button alongside the hidden/dimmed label text.

**Accessibility:** `aria-hidden="true"` — the button's accessible label already describes the action. Disabled for `prefers-reduced-motion` (shows static indicator instead).

---

### 10.14 Empty State

**File:** `js/components/emptyState.js` + `css/components.css`

**Purpose:** Informative, branded placeholder when a list or section has no data.

**API:** `createEmptyState({ icon, title, message, action? })` → returns DOM node

**HTML structure (generated):**
```html
<div class="empty-state">
  <div class="empty-state__icon">
    <i class="fa-solid fa-{icon}" aria-hidden="true"></i>
  </div>
  <h3 class="empty-state__title">{title}</h3>
  <p class="empty-state__message">{message}</p>
  <!-- if action provided: -->
  <button type="button" class="btn btn--secondary">{action.label}</button>
</div>
```

**Accessibility:** The empty state area has `role="status"` to announce to screen readers when content changes from loading to empty.

**Used in:** Materials (tracked-only filter), News, Alert rules, Alert events, Price history, Dashboard panels.

---

### 10.15 Error State

**File:** `js/components/errorState.js` + `css/components.css`

**Purpose:** Full-section failure display with retry option.

**API:** `createErrorState({ title, message, retry? })` → returns DOM node

**HTML structure:**
```html
<div class="error-state" role="alert">
  <div class="error-state__icon">
    <i class="fa-solid fa-circle-exclamation" aria-hidden="true"></i>
  </div>
  <h3 class="error-state__title">{title}</h3>
  <p class="error-state__message">{message}</p>
  <!-- if retry provided: -->
  <button type="button" class="btn btn--secondary error-state__retry">Try again</button>
</div>
```

**Message rules:**
- 500 / network error: always "Something went wrong. Please try again." (never expose server details)
- 404: context-specific message (e.g., "Material not found.")
- 429: "Too many requests. Please wait before trying again."

**Used in:** All data sections on all pages.

---

### 10.16 Confirmation Dialog

**File:** `js/components/confirm.js`

**Purpose:** Two-button modal prompting user to confirm a destructive or irreversible action.

**API:** `confirmAction({ title, message, confirmLabel, confirmClass?, onConfirm })` → creates and opens a modal

**HTML structure:** Wraps `modal.js` with a fixed layout:
```
Modal title: {title}
Modal body: <p>{message}</p>
Modal footer:
  [Cancel] (btn--ghost)     [{confirmLabel}] (btn--danger or confirmClass)
```

**Behaviour:**
- Cancel → closes modal, no action taken
- Confirm → calls `onConfirm()`, closes modal
- Escape key → Cancel behaviour
- Default `confirmClass`: `btn--danger`

**Used in:** Logout (from `nav.js`), Delete alert rule.

---

### 10.17 Navigation Component (`nav.js` + `components/nav.html`)

**File:** `js/components/nav.js`, `components/nav.html`

**Purpose:** Mounts the application sidebar on every authenticated page from a single HTML fragment. Single source of truth for sidebar markup.

**`initNav()` call sequence (as defined in Doc 3 §7.14):**
1. `fetch('/components/nav.html')` → HTML string
2. `document.getElementById('nav-placeholder').innerHTML = html` *(sole approved `innerHTML` use)*
3. Populate `#nav-user-initials`, `#nav-business-name`, `#nav-industry-name` from `session.getCachedBusiness()` and `auth.getCurrentUser()`
4. Set `.nav-link--active` + `aria-current="page"` on matching `[data-page]` link
5. Bind `#sidebar-toggle` (hamburger) → toggle `sidebar--open` on `<aside>`, toggle `aria-expanded` on button
6. Bind `#sidebar-overlay` click → close sidebar
7. Bind `#nav-logout-btn` → call `confirmAction()` for logout
8. Bind `#nav-settings-btn` → call `businessSettings.openSettingsModal()`

**Exports:** `initNav()` — the only export. Called with `await initNav()` as the first async call in each authenticated page's JS module after auth guards.

**Fallback if fetch fails:** `console.warn('Navigation failed to load.')` — page remains functional. Logout is not accessible via sidebar but user can clear `localStorage` manually. Acceptable failure mode for v1.

**Accessibility:**
- `<aside>` with `aria-label="Main navigation"`
- `<nav>` inside sidebar
- `aria-current="page"` on active link
- `aria-expanded` on hamburger button
- `aria-controls="sidebar"` on hamburger button
- Sidebar overlay: `aria-hidden="true"` (decorative)

---

## 11. Form Specification

Complete table of all frontend forms.

### Login Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| Email | `email` | Yes | RFC 5322 email format | `email` | "Please enter a valid email address." |
| Password | `password` | Yes | Min 1 char (backend validates) | `password` | "Please enter your password." |

### Registration Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| Full Name | `text` | Yes | 2–100 chars | `fullName` | "Please enter your full name." |
| Email | `email` | Yes | Valid email | `email` | "Please enter a valid email address." |
| Password | `password` | Yes | Min 8 chars, 1 letter + 1 digit | `password` | "Password must be at least 8 characters and include a letter and a number." |

### Forgot Password Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| Email | `email` | Yes | Valid email | `email` | "Please enter a valid email address." |

### Reset Password Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| New Password | `password` | Yes | Min 8 chars, 1 letter + 1 digit | `newPassword` | "Password must be at least 8 characters and include a letter and a number." |

### Onboarding — Step 2: Business Details Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| Business Name | `text` | Yes | 2–150 chars | `name` | "Business name is required (2–150 characters)." |
| Contact Email | `email` | No | Valid email if provided | `contactEmail` | "Please enter a valid email address." |
| Contact Phone | `tel` | No | None | `contactPhone` | — |
| Address | `textarea` | No | Max 500 chars | `address` | — |

(`industryId` is sent from Step 1's selection — not a user-editable field in Step 2.)

### Business Settings Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| Business Name | `text` | Yes | 2–150 chars | `name` | "Business name is required (2–150 characters)." |
| Contact Email | `email` | No | Valid email if provided | `contactEmail` | "Please enter a valid email address." |
| Contact Phone | `tel` | No | None | `contactPhone` | — |
| Address | `textarea` | No | Max 500 chars | `address` | — |
| News Digest Enabled | `checkbox` | — | Boolean | `newsDigestEnabled` | — |
| News Digest Frequency | `select` | No (required if enabled) | One of: DAILY, WEEKLY, MONTHLY | `newsDigestFrequency` | — |

### Add Custom Material Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| Material Name | `text` | Yes | 1–150 chars | `customName` | "Material name is required (max 150 characters)." |
| Unit | `select` | Yes | Valid `unitId` from list | `unitId` | "Please select a unit of measurement." |

### Price Entry Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| Price | `number` | Yes | > 0, max 2 decimal places | `price` | "Price must be a positive number." |
| Date | `date` | Yes | Not in the future | `recordedAt` | "Date cannot be in the future." |

### Create Alert Rule Form

| Field | Type | Required | Validation | Backend Field | Error Message |
|---|---|---|---|---|---|
| Material | `select` | Yes | Valid tracked material ID | `trackedMaterialId` | "Please select a material." |
| Condition | `radio` | Yes | `PRICE_ABOVE` or `PRICE_BELOW` | `conditionType` | "Please select a condition." |
| Threshold Price | `number` | Yes | > 0, max 2 decimal places | `thresholdPrice` | "Threshold must be a positive number." |

---

## 12. UI State Matrix

This matrix defines the behaviour every page section must implement for every possible state.

| State | UI Behaviour | Visual Pattern | Accessible Announcement |
|---|---|---|---|
| **Loading** | Skeleton / spinner shown; data area hidden; action buttons disabled | Animated shimmer skeleton or spinner | `role="status"` `aria-label="Loading..."` on container |
| **Success (data present)** | Data rendered; loading state removed | Normal content | Nothing special — content is the announcement |
| **Empty** | `emptyState` component shown; no blank divs | Icon + title + message + optional action | `role="status"` on empty state container |
| **Validation Error** | Field border turns red; error message appears below field | `.form-control--error` + `.form-error` visible | `role="alert"` on error message; `aria-describedby` links input to error |
| **401 Unauthorized** | Trigger token refresh; if refresh fails → clear auth → redirect to login with `?reason=session_expired` | No visible error shown to user (immediate redirect) | Login page announces "Your session has expired." |
| **403 Forbidden** | Toast error: "You don't have permission to perform this action." | Error toast | `role="alert"` toast |
| **404 Not Found** | Context-dependent: full-page not-found state or section error state | Error state component | `role="alert"` |
| **409 Conflict** | Inline form error above submit button | `.form-error` at form level | `role="alert"` on error |
| **429 Rate Limited** | Inline error: "Too many requests. Please wait before trying again." | Inline error or error toast | `role="alert"` |
| **500 Server Error** | Generic error state / toast: "Something went wrong. Please try again." Raw server message never shown | Error state or toast | `role="alert"` |
| **Network Failure** | Error state / inline error: "Could not connect to the server. Check your connection." | Error state or toast | `role="alert"` |
| **Success (action)** | Success toast: action-specific message (e.g., "Price logged successfully.") | `toast--success` | `aria-live="polite"` toast |

---

## 13. Responsive Behavior

### 13.1 Layout Changes by Breakpoint

| Page / Element | Mobile (< 768px) | Tablet (768–1023px) | Laptop (1024–1279px) | Desktop (≥ 1280px) |
|---|---|---|---|---|
| **Sidebar** | Hidden; hamburger in header opens drawer | Hidden; hamburger in header opens drawer | Persistent, icon-only (64px wide) | Persistent, expanded (240px wide) |
| **Main content offset** | 0 (full width) | 0 (full width) | 64px left | 240px left |
| **Auth card** | Full width, `--space-4` padding | Max-width 480px, centred | Max-width 480px, centred | Max-width 480px, centred |
| **Dashboard grid** | 1-column stack | 2-column grid | 2-column grid | 3-column grid |
| **Materials list** | Stacked `.material-card` elements | Table with `.table-wrapper` | Full-width table | Full-width table |
| **Alerts rules table** | `.table-wrapper` (scrollable) | `.table-wrapper` | Full-width | Full-width |
| **News cards** | 1-column stack | 1-column stack | 2-column grid | 2-column grid |
| **Trends controls row** | Stacked vertically | Inline row | Inline row | Inline row |
| **Chart height** | 200px | 280px | 360px | 400px |
| **Onboarding industry grid** | 1-column | 2-column | 2-column | 3-column |
| **Modal width** | 95vw | Max 560px | Max 560px | Max 560px |
| **Pagination** | Compact (no page info text on very small screens) | Full | Full | Full |

### 13.2 Typography Scaling

No font size changes across breakpoints. Base `16px` root font size on all viewports. All sizing in `rem`.

### 13.3 Touch Targets

All interactive elements: minimum `44 × 44px` touch target on mobile achieved via padding. Verified on 375px viewport (iPhone SE equivalent).

---

## 14. Accessibility Specification

### 14.1 Keyboard Navigation

| Element | Keyboard Behaviour |
|---|---|
| All links and buttons | Tab to focus, Enter or Space to activate |
| `<select>` | Tab to focus, arrow keys to select option, Enter to confirm |
| Radio group | Tab into group, arrow keys to change selection |
| Checkbox | Tab to focus, Space to toggle |
| Modal | Tab cycles only within modal; Escape closes; focus returns to trigger on close |
| Dropdown menu | Tab to trigger, Enter/Space to open, arrow keys to navigate, Escape to close |
| Tabs (Alert page, Trends page) | Tab to tab bar, arrow keys to switch tabs |
| Table | Tab through cells; action buttons within cells receive focus in DOM order |
| Pagination | Tab to Previous/Next buttons |
| Sidebar (desktop) | Nav links Tab-navigable in order |
| Sidebar (mobile drawer) | When open: focus moves into sidebar; Tab cycles within open sidebar |

### 14.2 Focus Indicators

- **Rule:** All focusable elements show a visible focus ring on `:focus-visible`.
- **Implementation:** `box-shadow: var(--shadow-focus)` (`0 0 0 3px rgba(59,130,246,0.5)`) applied in CSS.
- **`:focus` vs `:focus-visible`:** Only `:focus-visible` triggers the ring — mouse clicks do not show the ring; keyboard navigation does.
- **Must NOT use** `outline: none` or `outline: 0` without a custom replacement.

### 14.3 Semantic Labels

| Element | Labelling Approach |
|---|---|
| All `<input>`, `<select>`, `<textarea>` | `<label for="id">` paired with element's `id` |
| Icon-only buttons | `aria-label="[action] [target]"` on the `<button>` |
| Icon-only links | `aria-label` or visually hidden `<span>` |
| Sidebar `<aside>` | `aria-label="Main navigation"` |
| Tab panels | `role="tablist"` on container, `role="tab"` on each tab, `role="tabpanel"` on each panel, `aria-controls` + `aria-labelledby` |
| Chart canvas | `role="img"`, `aria-label="Price history chart for {materialName}"` |
| Status badges (standalone) | Surrounding element has `aria-label` if badge is the only status indicator |

### 14.4 Forms Accessibility

- Every input has a visible `<label>` — no placeholder-only labelling
- Errors linked via `aria-describedby` to the input
- Error messages have `role="alert"` so they are announced when shown
- On form submission with validation errors: focus moved to the first field with an error
- Required fields: `required` attribute on inputs; label text does NOT add asterisk as the only indicator (uses "Required" text or the `required` attribute semantics)
- Hint text (password strength, etc.) linked via `aria-describedby` alongside error

### 14.5 Modals Accessibility

- `role="dialog"`, `aria-modal="true"`, `aria-labelledby="{title-id}"`
- On open: focus moved to first focusable element inside modal
- Focus trapped: Tab key cycles within modal only
- Escape key closes
- On close: focus returned to the element that triggered the modal

### 14.6 Navigation Accessibility

- `<aside>` with `aria-label="Main navigation"` wraps the sidebar
- `<nav>` contains the `<ul>` of nav links
- Active link: `aria-current="page"` attribute set by `nav.js`
- Hamburger button: `aria-expanded="true/false"`, `aria-controls="sidebar"`
- Sidebar close (backdrop click): programmatic focus return to hamburger button

### 14.7 Tables Accessibility

- `<caption>` with descriptive text (visually hidden via `.sr-only`) on every `<table>`
- `<th scope="col">` on all header cells
- No layout tables — `<table>` used only for tabular data

### 14.8 Charts Accessibility

- `<canvas role="img" aria-label="[chart title]">` on every chart canvas
- A visible `<button>Show data table</button>` below every chart
- Clicking the button reveals a `<table>` with the same data (visually accessible)
- The `<table>` has a `<caption>` matching the chart title
- Chart colours chosen to be distinguishable without colour alone (legend labels always present on multi-line charts)

### 14.9 Error Messages Accessibility

- All inline form errors: `role="alert"` — announced immediately when shown
- Toasts: error toasts use `role="alert"` (assertive); success toasts use `aria-live="polite"`
- Error state components: `role="alert"` on the container
- Session-expired banner on login: `role="alert"`

### 14.10 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

Applied globally in `css/base.css`. Ensures: skeleton shimmer stops, sidebar drawer appears instantly, modal appears instantly, toast appears instantly. Chart.js animations: `animation: { duration: 0 }` when `prefers-reduced-motion` is active (detected via `window.matchMedia`).

### 14.11 Skip Link

- First focusable element inside `<main>`: `<a href="#main-content" class="skip-link">Skip to main content</a>`
- Visually hidden until focused (`:focus-visible` makes it visible)
- `<main id="main-content">` is the target

---

## 15. Page-to-File Mapping

| Page | HTML file | Page JS | Page CSS | API modules imported | Components imported |
|---|---|---|---|---|---|
| Entry redirect | `index.html` | `js/pages/index.js` | — | — | `auth.js`, `router.js` |
| Login | `pages/login.html` | `js/pages/login.js` | `css/pages/auth.css` | `auth.api.js` | `auth.js`, `router.js`, `toast.js` |
| Register | `pages/register.html` | `js/pages/register.js` | `css/pages/auth.css` | `auth.api.js` | `auth.js`, `router.js`, `toast.js` |
| Forgot Password | `pages/forgot-password.html` | `js/pages/forgot-password.js` | `css/pages/auth.css` | `auth.api.js` | `router.js` |
| Reset Password | `pages/reset-password.html` | `js/pages/reset-password.js` | `css/pages/auth.css` | `auth.api.js` | `router.js` |
| Onboarding | `pages/onboarding.html` | `js/pages/onboarding.js` | — | `knowledgeBase.api.js`, `business.api.js`, `auth.api.js` | `auth.js`, `router.js`, `nav.js`, `loader.js`, `errorState.js`, `toast.js` |
| Dashboard | `pages/dashboard.html` | `js/pages/dashboard.js` | `css/pages/dashboard.css` | `dashboard.api.js`, `business.api.js` | `auth.js`, `router.js`, `nav.js`, `loader.js`, `emptyState.js`, `errorState.js` |
| Materials | `pages/materials.html` | `js/pages/materials.js` | — | `materials.api.js`, `knowledgeBase.api.js` | `auth.js`, `router.js`, `nav.js`, `loader.js`, `emptyState.js`, `errorState.js`, `toast.js` |
| Prices | `pages/prices.html` | `js/pages/prices.js` | — | `materials.api.js`, `prices.api.js` | `auth.js`, `router.js`, `nav.js`, `loader.js`, `toast.js` |
| Alerts | `pages/alerts.html` | `js/pages/alerts.js` | — | `alerts.api.js`, `materials.api.js` | `auth.js`, `router.js`, `nav.js`, `loader.js`, `emptyState.js`, `errorState.js`, `modal.js`, `confirm.js`, `pagination.js`, `toast.js` |
| News | `pages/news.html` | `js/pages/news.js` | — | `news.api.js` | `auth.js`, `router.js`, `nav.js`, `loader.js`, `emptyState.js`, `errorState.js`, `pagination.js` |
| Trends | `pages/trends.html` | `js/pages/trends.js` | `css/pages/trends.css` | `trends.api.js`, `materials.api.js` | `auth.js`, `router.js`, `nav.js`, `loader.js`, `emptyState.js`, `errorState.js`, `chart.js` |

**Shared CSS loaded on every page (via `<link>` in `<head>`):**
`variables.css` → `reset.css` → `base.css` → `layout.css` → `components.css` → `utilities.css`

**External resources loaded on every page:**
- Google Fonts Inter (`<link>` in `<head>`)
- Font Awesome 6.5 CDN (`<link>` in `<head>`)

**External resources loaded on specific pages only:**
- Chart.js CDN: `trends.html` only (`<script>` at end of `<body>`, before page module)

**Navigation fragment:** `components/nav.html` (fetched at runtime by `nav.js` on all authenticated pages)

---

## 16. API-to-UI Mapping

### Authentication

| Endpoint | Method | Frontend Page | UI Action | Request Body | Response Consumed | Success Behaviour | Error Behaviour |
|---|---|---|---|---|---|---|---|
| `/auth/register` | POST | register.html | Form submit | `{ email, password, fullName }` | `{ accessToken, refreshToken }` (then auto-login) | Auto-login → redirect onboarding | 409: email conflict; 400: field errors |
| `/auth/login` | POST | login.html, (register auto-login) | Form submit / auto-call | `{ email, password }` | `{ accessToken, refreshToken }` | `setTokens()` → redirect | 401: invalid creds; 429: rate limited |
| `/auth/refresh` | POST | client.js (all pages), onboarding.html | Auto (401 refresh) / explicit (post-business) | `{ refreshToken }` | `{ accessToken }` | Update tokens, retry request | 401 → logout + redirect login |
| `/auth/logout` | POST | nav.js (all authenticated pages) | Sidebar logout button | `{ refreshToken }` | — (fire-and-forget) | `clearTokens()` → redirect login | Ignored (still clear tokens) |
| `/auth/password-reset/request` | POST | forgot-password.html | Form submit | `{ email }` | — | Always show success message | 429: rate limit; network: error |
| `/auth/password-reset/confirm` | POST | reset-password.html | Form submit | `{ token, newPassword }` | — | Show success state | 401: invalid/expired token; 400: validation |

### Business

| Endpoint | Method | Frontend Page | UI Action | Request | Response | Success | Error |
|---|---|---|---|---|---|---|---|
| `/business` | POST | onboarding.html | Step 2 form submit | `{ name, contactEmail?, contactPhone?, address?, industryId }` | `{ id, materialsGenerated }` | Step 3 confirmation | 409: already exists; 400: validation |
| `/business` | GET | nav.js, business settings modal, dashboard.html | Page load / modal open | — | Full business object | Populate sidebar + cache | Error state / toast |
| `/business` | PUT | Business settings modal | Modal form save | `{ name, contactEmail?, contactPhone?, address?, newsDigestEnabled, newsDigestFrequency }` | Updated business object | Toast + cache update | 400: validation errors |

### Knowledge Base (public)

| Endpoint | Method | Page | Action | Response | Success | Error |
|---|---|---|---|---|---|---|
| `/industries` | GET | onboarding.html | Page load | `{ industries[] }` | Render industry cards | Error state + retry |
| `/industries/:id` | GET | (not used directly in v1 UI) | — | — | — | — |
| `/units-of-measurement` | GET | materials.html | Page load | `{ units[] }` | Populate unit select | Toast error |

### Materials

| Endpoint | Method | Page | Action | Request | Response | Success | Error |
|---|---|---|---|---|---|---|---|
| `/materials` | GET | materials.html, prices.html, alerts.html, trends.html | Page load | `{ page?, limit? }` | `{ materials[] }` | Render list | Error state + retry |
| `/materials` | POST | materials.html | Add custom material form submit | `{ customName, unitId }` | New material object | Prepend to list + toast | 400/409: form errors |
| `/materials/:id` | PATCH | materials.html | Tracking toggle | `{ isTracked: boolean }` | Updated material | Update row in-place + toast | Toast error |

**Note:** `PATCH` accepts only `{ isTracked }`. No other fields.

### Prices

| Endpoint | Method | Page | Action | Request | Response | Success | Error |
|---|---|---|---|---|---|---|---|
| `/materials/:id/prices/latest` | GET | prices.html | Page load | — | `{ price, recordedAt, source }` — 404 when no price recorded | Show current price or "no price yet" notice (semantic 404, not error state) | 404 no-price: informational notice; 404 material-not-found: error state; network: error state |
| `/materials/:id/prices` | POST | prices.html | Price entry form submit | `{ price, recordedAt }` | New price object | Update current price display + toast | 400: validation errors |

### Trends / History

| Endpoint | Method | Page | Action | Request | Response | Success | Error |
|---|---|---|---|---|---|---|---|
| `/materials/:id/prices/history` | GET | trends.html Tab 1 | Apply button click | `{ from?, to?, page, limit }` | `{ prices[], meta }` | Render chart + pagination | Empty state or error state |
| `/materials/prices/compare` | GET | trends.html Tab 2 | Compare button click | `{ materialIds, from?, to? }` | `[ { materialId, name, series: [{ price, recordedAt }] } ]` | Render comparison chart | Empty state or error state |

### News

| Endpoint | Method | Page | Action | Request | Response | Success | Error |
|---|---|---|---|---|---|---|---|
| `/news` | GET | news.html, dashboard.html (via dashboard endpoint) | Page load / pagination | `{ page, limit }` | `{ news[], meta }` | Render news cards + pagination | Empty state (common) or error |

### Alerts

| Endpoint | Method | Page | Action | Request | Response | Success | Error |
|---|---|---|---|---|---|---|---|
| `/alerts/rules` | GET | alerts.html | Tab 1 load | — | `{ rules[] }` | Render rules table | Error state + retry |
| `/alerts/rules` | POST | alerts.html | Create rule modal submit | `{ trackedMaterialId, conditionType, thresholdPrice }` | New rule object | Insert row + close modal + toast | 400/409: modal form errors |
| `/alerts/rules/:id` | PATCH | alerts.html | Toggle active button | `{ isActive: boolean }` | Updated rule | Update row badge + button in-place + toast | Toast error |
| `/alerts/rules/:id` | DELETE | alerts.html | Delete button → confirm | — | `{ id, deletedAt }` | Remove row from table + toast | Toast error |
| `/alerts/events` | GET | alerts.html | Tab 2 lazy load / pagination | `{ page, limit }` | `{ events[], meta }` | Render events table + pagination | Error state + retry |

### Dashboard

| Endpoint | Method | Page | Action | Request | Response | Success | Error |
|---|---|---|---|---|---|---|---|
| `/dashboard` | GET | dashboard.html | Page load | — | Aggregated dashboard object | Render all 5 panels | Per-panel error states |

---

## 17. Implementation Readiness Checklist

This checklist confirms that every page and component specified in this document has complete coverage across all required dimensions before Phase 1 implementation may begin.

### Pages

| Page | UI Spec | API Mapping | States | Responsive | Accessibility | File Mapping |
|---|---|---|---|---|---|---|
| `index.html` (redirect) | ✓ §2 | ✓ §16 | ✓ §12 | N/A | N/A | ✓ §15 |
| `login.html` | ✓ §2.1 | ✓ §16 | ✓ §2.1, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `register.html` | ✓ §2.2 | ✓ §16 | ✓ §2.2, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `forgot-password.html` | ✓ §2.3 | ✓ §16 | ✓ §2.3, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `reset-password.html` | ✓ §2.4 | ✓ §16 | ✓ §2.4, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `onboarding.html` | ✓ §3.1 | ✓ §16 | ✓ §3.1, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `dashboard.html` | ✓ §8 | ✓ §16 | ✓ §8, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `materials.html` | ✓ §4 | ✓ §16 | ✓ §4, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `prices.html` | ✓ §5 | ✓ §16 | ✓ §5, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `alerts.html` | ✓ §7 | ✓ §16 | ✓ §7, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `news.html` | ✓ §6 | ✓ §16 | ✓ §6, §12 | ✓ §13 | ✓ §14 | ✓ §15 |
| `trends.html` | ✓ §9 | ✓ §16 | ✓ §9, §12 | ✓ §13 | ✓ §14 | ✓ §15 |

### Reusable Components

| Component | UI Spec | States | Accessibility | File Mapping |
|---|---|---|---|---|
| Button | ✓ §10.1 | ✓ §10.1 | ✓ §14 | ✓ §15 |
| Input | ✓ §10.2 | ✓ §10.2 | ✓ §14 | ✓ §15 |
| Select | ✓ §10.3 | ✓ §10.3 | ✓ §14 | ✓ §15 |
| Checkbox / Toggle | ✓ §10.4 | ✓ §10.4 | ✓ §14 | ✓ §15 |
| Card | ✓ §10.5 | ✓ §10.5 | ✓ §14 | ✓ §15 |
| Table | ✓ §10.6 | ✓ §10.6 | ✓ §14.7 | ✓ §15 |
| Modal | ✓ §10.7 | ✓ §10.7 | ✓ §14.5 | ✓ §15 |
| Toast | ✓ §10.8 | ✓ §10.8 | ✓ §14.9 | ✓ §15 |
| Alert Banner | ✓ §10.9 | ✓ §10.9 | ✓ §14 | ✓ §15 |
| Badge | ✓ §10.10 | ✓ §10.10 | ✓ §14 | ✓ §15 |
| Pagination | ✓ §10.11 | ✓ §10.11 | ✓ §14 | ✓ §15 |
| Loading Skeleton | ✓ §10.12 | ✓ §10.12 | ✓ §14 | ✓ §15 |
| Spinner | ✓ §10.13 | ✓ §10.13 | ✓ §14 | ✓ §15 |
| Empty State | ✓ §10.14 | ✓ §10.14 | ✓ §14 | ✓ §15 |
| Error State | ✓ §10.15 | ✓ §10.15 | ✓ §14 | ✓ §15 |
| Confirmation Dialog | ✓ §10.16 | ✓ §10.16 | ✓ §14.5 | ✓ §15 |
| Navigation (`nav.js`) | ✓ §10.17, §1.4 | ✓ §1.4 | ✓ §14.6 | ✓ §15 |

### Global Confirmations

- [x] `significantChange` is **not referenced anywhere** in this document
- [x] `PATCH /materials/:id` — only `{ isTracked }` — no name/unit editing in any specification
- [x] Email verification — **not specified** in any flow (501 stub)
- [x] No `/auth/me` — JWT decoded client-side everywhere; no API call for identity
- [x] News empty states are **informational**, not error states
- [x] Alert events empty state is **informational**, not an error state
- [x] Sync status `null` values shown as "Never", not as error
- [x] Dashboard news items show **title only** — no URL, source name, or date
- [x] Dashboard alert events show **triggeredAt only** — no triggered price, condition, or threshold
- [x] Dashboard alert rules show **conditionType + thresholdPrice only** — no material name
- [x] `innerHTML` with dynamic data is **not used anywhere** except the sole approved exception in `nav.js`

---

*End of Document 4 (Frontend) — Frontend Component & Page Specification*

*Version 1.0 — APPROVED — FROZEN — 2026-08-11*
