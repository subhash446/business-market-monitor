/**
 * Loading states — skeleton placeholders and spinner
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §7.8, Doc 4 §10.12–10.13 — js/components/loader.js
 *
 * Usage:
 *   import { showSkeleton, hideSkeleton, showSpinner, hideSpinner } from '/js/components/loader.js';
 *
 *   // Page initial load skeleton
 *   showSkeleton(container, { rows: 5 });
 *   // ... API call completes ...
 *   hideSkeleton(container);
 *   // Render real content
 *
 *   // Button spinner
 *   showSpinner(btn);  // adds btn--loading class
 *   hideSpinner(btn);  // removes it
 */

/* ----------------------------------------------------------------
 * SKELETON LOADERS
 * ---------------------------------------------------------------- */

/**
 * Replace container content with animated skeleton placeholders.
 * Prevents layout shift by filling the same space as the expected content.
 *
 * @param {HTMLElement} container  — target element to fill with skeleton
 * @param {Object}      [config]
 * @param {number}      [config.rows=3]         — number of skeleton row groups
 * @param {string}      [config.type='list']    — 'list' | 'table' | 'card' | 'chart' | 'panel'
 * @param {string}      [config.skeletonClass]  — custom wrapper class
 */
export function showSkeleton(container, config = {}) {
  if (!container) return;

  const { rows = 3, type = 'list', skeletonClass = '' } = config;

  const wrapper = document.createElement('div');
  wrapper.className = `skeleton-wrapper ${skeletonClass}`.trim();
  wrapper.setAttribute('aria-busy', 'true');
  wrapper.setAttribute('aria-label', 'Loading…');

  if (type === 'table') {
    wrapper.appendChild(_buildTableSkeleton(rows));
  } else if (type === 'card') {
    wrapper.appendChild(_buildCardSkeleton(rows));
  } else if (type === 'chart') {
    wrapper.appendChild(_buildChartSkeleton());
  } else if (type === 'panel') {
    wrapper.appendChild(_buildPanelSkeleton(rows));
  } else {
    wrapper.appendChild(_buildListSkeleton(rows));
  }

  // Store original content if container has children
  container._originalContent = container.innerHTML;
  // Use innerHTML here ONLY for empty/skeleton placeholder — no user data
  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(wrapper);
}

/**
 * Remove skeleton and restore the container for real content.
 * Does NOT inject real content — caller renders after hideSkeleton().
 * @param {HTMLElement} container
 */
export function hideSkeleton(container) {
  if (!container) return;
  const wrapper = container.querySelector('.skeleton-wrapper');
  if (wrapper) wrapper.remove();
  container.removeAttribute('aria-busy');
}

/* ----------------------------------------------------------------
 * BUTTON / INLINE SPINNERS
 * ---------------------------------------------------------------- */

/**
 * Start a loading spinner on a button (adds .btn--loading, disables it).
 * @param {HTMLButtonElement} btn
 */
export function showSpinner(btn) {
  if (!btn) return;
  btn.classList.add('btn--loading');
  btn.disabled = true;
}

/**
 * Stop a loading spinner on a button.
 * @param {HTMLButtonElement} btn
 */
export function hideSpinner(btn) {
  if (!btn) return;
  btn.classList.remove('btn--loading');
  btn.disabled = false;
}

/**
 * Show a centred loading spinner in a container (page-level loading).
 * @param {HTMLElement} container
 */
export function showPageSpinner(container) {
  if (!container) return;
  const spinnerWrap = document.createElement('div');
  spinnerWrap.className = 'spinner-container skeleton-wrapper';
  spinnerWrap.setAttribute('aria-busy', 'true');
  spinnerWrap.setAttribute('role', 'status');
  spinnerWrap.setAttribute('aria-label', 'Loading…');

  const spinner = document.createElement('div');
  spinner.className = 'spinner';
  spinnerWrap.appendChild(spinner);

  while (container.firstChild) container.removeChild(container.firstChild);
  container.appendChild(spinnerWrap);
}

/**
 * Remove a page-level spinner.
 * @param {HTMLElement} container
 */
export function hidePageSpinner(container) {
  hideSkeleton(container);
}

/* ----------------------------------------------------------------
 * SKELETON BUILDERS (private)
 * ---------------------------------------------------------------- */

function _buildListSkeleton(rows) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < rows; i++) {
    const row = document.createElement('div');
    row.style.padding       = 'var(--space-3) 0';
    row.style.borderBottom  = '1px solid var(--color-border)';
    row.style.display       = 'flex';
    row.style.flexDirection = 'column';
    row.style.gap           = 'var(--space-2)';

    const line1 = document.createElement('div');
    line1.className = 'skeleton skeleton-line skeleton-line--medium';

    const line2 = document.createElement('div');
    line2.className = 'skeleton skeleton-line skeleton-line--short';

    row.appendChild(line1);
    row.appendChild(line2);
    frag.appendChild(row);
  }
  return frag;
}

function _buildTableSkeleton(rows) {
  const frag = document.createDocumentFragment();

  // Header row
  const header = document.createElement('div');
  header.style.display       = 'flex';
  header.style.gap            = 'var(--space-4)';
  header.style.padding        = 'var(--space-3) var(--space-4)';
  header.style.backgroundColor = 'var(--color-bg-elevated)';
  header.style.borderBottom   = '1px solid var(--color-border)';
  header.style.borderRadius   = 'var(--radius-md) var(--radius-md) 0 0';

  for (let j = 0; j < 4; j++) {
    const cell = document.createElement('div');
    cell.className = 'skeleton skeleton-line';
    cell.style.flex = '1';
    cell.style.height = '12px';
    header.appendChild(cell);
  }
  frag.appendChild(header);

  // Body rows
  for (let i = 0; i < rows; i++) {
    const row = document.createElement('div');
    row.style.display      = 'flex';
    row.style.gap          = 'var(--space-4)';
    row.style.padding      = 'var(--space-3) var(--space-4)';
    row.style.borderBottom = '1px solid var(--color-border)';
    row.style.alignItems   = 'center';

    for (let j = 0; j < 4; j++) {
      const cell = document.createElement('div');
      cell.className = 'skeleton skeleton-line';
      cell.style.flex = '1';
      cell.style.height = '14px';
      if (j === 0) cell.style.flex = '2';
      row.appendChild(cell);
    }
    frag.appendChild(row);
  }

  const wrapper = document.createElement('div');
  wrapper.style.border       = '1px solid var(--color-border)';
  wrapper.style.borderRadius = 'var(--radius-lg)';
  wrapper.style.overflow     = 'hidden';
  wrapper.appendChild(frag);
  return wrapper;
}

function _buildCardSkeleton(rows) {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < rows; i++) {
    const card = document.createElement('div');
    card.style.background    = 'var(--color-bg-surface)';
    card.style.border        = '1px solid var(--color-border)';
    card.style.borderRadius  = 'var(--radius-lg)';
    card.style.padding       = 'var(--space-6)';
    card.style.marginBottom  = 'var(--space-4)';
    card.style.display       = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap           = 'var(--space-3)';

    const title = document.createElement('div');
    title.className = 'skeleton skeleton-line skeleton-line--medium';
    title.style.height = '20px';

    const body1 = document.createElement('div');
    body1.className = 'skeleton skeleton-line skeleton-line--long';

    const body2 = document.createElement('div');
    body2.className = 'skeleton skeleton-line skeleton-line--short';

    card.appendChild(title);
    card.appendChild(body1);
    card.appendChild(body2);
    frag.appendChild(card);
  }
  return frag;
}

function _buildChartSkeleton() {
  const div = document.createElement('div');
  div.className = 'chart-skeleton skeleton';
  return div;
}

function _buildPanelSkeleton(rows) {
  const panel = document.createElement('div');
  panel.style.display       = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap           = 'var(--space-3)';

  const titleLine = document.createElement('div');
  titleLine.className = 'skeleton skeleton-line skeleton-line--short';
  titleLine.style.height  = '20px';
  titleLine.style.marginBottom = 'var(--space-2)';
  panel.appendChild(titleLine);

  for (let i = 0; i < rows; i++) {
    const row = document.createElement('div');
    row.style.display    = 'flex';
    row.style.alignItems = 'center';
    row.style.gap        = 'var(--space-3)';

    const left = document.createElement('div');
    left.className = 'skeleton skeleton-line';
    left.style.flex   = '1';
    left.style.height = '14px';

    const right = document.createElement('div');
    right.className = 'skeleton skeleton-line skeleton-line--short';
    right.style.height = '14px';

    row.appendChild(left);
    row.appendChild(right);
    panel.appendChild(row);
  }

  return panel;
}
