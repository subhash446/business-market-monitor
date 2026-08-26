/**
 * Pagination controls
 * Business Market Monitor — Frontend v1.0
 *
 * Doc 3 §7.11, Doc 4 §10.11 — js/components/pagination.js
 *
 * Usage:
 *   import { createPagination, renderPagination } from '/js/components/pagination.js';
 *
 *   const controls = createPagination({
 *     meta:         { page: 1, limit: 20, total: 150, totalPages: 8 },
 *     onPageChange: (newPage) => loadData(newPage),
 *   });
 *   paginationContainer.appendChild(controls);
 */

/**
 * Build a pagination control DOM node.
 *
 * @param {Object}   options
 * @param {Object}   options.meta             — from API response meta
 * @param {number}   options.meta.page
 * @param {number}   options.meta.limit
 * @param {number}   options.meta.total
 * @param {number}   options.meta.totalPages
 * @param {Function} options.onPageChange     — called with newPage: number
 * @returns {HTMLElement}
 */
export function createPagination({ meta, onPageChange }) {
  const { page, totalPages } = meta;
  const isFirstPage = page <= 1;
  const isLastPage  = page >= totalPages;

  const nav = document.createElement('nav');
  nav.className = 'pagination';
  nav.setAttribute('aria-label', 'Page navigation');

  // Previous button
  const prevBtn = document.createElement('button');
  prevBtn.type      = 'button';
  prevBtn.className = 'pagination__prev';
  prevBtn.setAttribute('aria-label', 'Go to previous page');

  if (isFirstPage) {
    prevBtn.setAttribute('aria-disabled', 'true');
    prevBtn.disabled = true;
  }

  const prevIcon = document.createElement('i');
  prevIcon.className = 'fa-solid fa-chevron-left';
  prevIcon.setAttribute('aria-hidden', 'true');
  const prevText = document.createElement('span');
  prevText.textContent = 'Previous';
  prevBtn.appendChild(prevIcon);
  prevBtn.appendChild(prevText);

  // Page info
  const info = document.createElement('span');
  info.className = 'pagination__info';
  info.setAttribute('aria-live', 'polite');
  info.setAttribute('aria-atomic', 'true');
  info.textContent = `Page ${page} of ${totalPages}`;

  // Next button
  const nextBtn = document.createElement('button');
  nextBtn.type      = 'button';
  nextBtn.className = 'pagination__next';
  nextBtn.setAttribute('aria-label', 'Go to next page');

  if (isLastPage) {
    nextBtn.setAttribute('aria-disabled', 'true');
    nextBtn.disabled = true;
  }

  const nextText = document.createElement('span');
  nextText.textContent = 'Next';
  const nextIcon = document.createElement('i');
  nextIcon.className = 'fa-solid fa-chevron-right';
  nextIcon.setAttribute('aria-hidden', 'true');
  nextBtn.appendChild(nextText);
  nextBtn.appendChild(nextIcon);

  // Wire events
  if (!isFirstPage) {
    prevBtn.addEventListener('click', () => {
      if (typeof onPageChange === 'function') onPageChange(page - 1);
    });
  }

  if (!isLastPage) {
    nextBtn.addEventListener('click', () => {
      if (typeof onPageChange === 'function') onPageChange(page + 1);
    });
  }

  nav.appendChild(prevBtn);
  nav.appendChild(info);
  nav.appendChild(nextBtn);

  return nav;
}

/**
 * Render pagination into a container, replacing any previous controls.
 * If totalPages <= 1, the container is hidden.
 *
 * @param {HTMLElement} container
 * @param {Object}      meta          — API meta object
 * @param {Function}    onPageChange
 */
export function renderPagination(container, meta, onPageChange) {
  if (!container) return;

  // Clear previous
  while (container.firstChild) container.removeChild(container.firstChild);

  if (!meta || meta.totalPages <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = '';
  container.appendChild(createPagination({ meta, onPageChange }));
}
