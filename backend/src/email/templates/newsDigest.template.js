'use strict';

/**
 * Responsive HTML and plain-text template for Periodic News & Market Digest (FR-ALERT-06 / T-08).
 */

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case '\'': return '&#39;';
      default: return ch;
    }
  });
}

function formatSignedPercent(num) {
  if (num === null || num === undefined || !Number.isFinite(Number(num))) {
    return '0.00%';
  }
  const val = Number(num);
  return `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;
}

function getActionColor(action) {
  switch (action) {
    case 'ACCELERATE_PURCHASE': return '#b91c1c'; // red
    case 'DELAY_PURCHASE':      return '#b45309'; // amber
    case 'MAINTAIN_BUFFER':     return '#1d4ed8'; // blue
    case 'MONITOR_ONLY':        return '#4b5563'; // gray
    default:                    return '#374151';
  }
}

function buildNewsDigest({
  businessName,
  industryName,
  frequency = 'WEEKLY',
  topMovers = [],
  topNews = [],
  procurementActions = [],
  generatedAt = null,
  dashboardUrl = 'https://business-market-monitor.pages.dev',
} = {}) {
  const safeBusiness = escapeHtml(businessName || 'Valued Business');
  const safeIndustry = escapeHtml(industryName || 'Industry Market');
  const safeFreq = String(frequency || 'WEEKLY').toUpperCase();
  const freqLabel = safeFreq === 'DAILY' ? 'Daily' : (safeFreq === 'MONTHLY' ? 'Monthly' : 'Weekly');

  const dt = generatedAt ? new Date(generatedAt) : new Date();
  const dateStr = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const subject = `[${freqLabel} Digest] Market Intelligence & Procurement Summary for ${businessName || 'Your Business'}`;

  // Price Movers rows
  let moversRows = '';
  if (topMovers && topMovers.length > 0) {
    moversRows = topMovers.map((m) => {
      const isUp = Number(m.changePercent) > 0;
      const isDown = Number(m.changePercent) < 0;
      const changeColor = isUp ? '#b91c1c' : (isDown ? '#15803d' : '#4b5563');
      const arrow = isUp ? '▲' : (isDown ? '▼' : '▬');
      const unit = m.unit ? ` / ${escapeHtml(m.unit)}` : '';
      return `
        <tr>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 500; color: #111827;">
            ${escapeHtml(m.materialName)}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; color: #374151;">
            ${escapeHtml(m.currency || 'INR')} ${Number(m.latestPrice || 0).toFixed(2)}${unit}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-weight: 600; color: ${changeColor};">
            ${arrow} ${formatSignedPercent(m.changePercent)}
          </td>
          <td style="padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
            ${escapeHtml(m.trend || 'STABLE')}
          </td>
        </tr>
      `;
    }).join('');
  } else {
    moversRows = `
      <tr>
        <td colspan="4" style="padding: 16px; text-align: center; color: #6b7280; font-size: 13px;">
          No major 7-day price fluctuations detected across your tracked materials.
        </td>
      </tr>
    `;
  }

  // Procurement actions
  let actionsHtml = '';
  if (procurementActions && procurementActions.length > 0) {
    actionsHtml = procurementActions.map((a) => {
      const color = getActionColor(a.actionRecommendation || a.action);
      const actionName = String(a.actionRecommendation || a.action || 'MONITOR_ONLY').replace(/_/g, ' ');
      return `
        <div style="background-color: #f9fafb; border-left: 4px solid ${color}; border-radius: 4px; padding: 12px 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #111827; font-size: 14px;">${escapeHtml(a.materialName)}</strong>
            <span style="display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; background-color: ${color}20; color: ${color};">
              ${escapeHtml(actionName)}
            </span>
          </div>
          <p style="margin: 4px 0 0; font-size: 13px; color: #4b5563; line-height: 1.4;">
            ${escapeHtml(a.rationale || a.bufferStrategy?.summary || 'Standard replenishment buffer recommended.')}
          </p>
        </div>
      `;
    }).join('');
  } else {
    actionsHtml = `
      <p style="color: #6b7280; font-size: 13px; font-style: italic; margin: 8px 0;">
        All tracked materials are currently within standard replenishment buffers.
      </p>
    `;
  }

  // News items
  let newsHtml = '';
  if (topNews && topNews.length > 0) {
    newsHtml = topNews.map((n) => {
      const pubDate = n.publishedAt ? new Date(n.publishedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
      return `
        <div style="padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
          <a href="${escapeHtml(n.url || '#')}" target="_blank" rel="noopener noreferrer" style="color: #1d4ed8; text-decoration: none; font-weight: 500; font-size: 14px;">
            ${escapeHtml(n.title)}
          </a>
          <div style="font-size: 12px; color: #9ca3af; margin-top: 2px;">
            ${escapeHtml(n.sourceName || 'Market Wire')}${pubDate ? ` • ${pubDate}` : ''}
          </div>
        </div>
      `;
    }).join('');
  } else {
    newsHtml = `
      <p style="color: #6b7280; font-size: 13px; font-style: italic; margin: 8px 0;">
        No fresh industry articles published in the last cycle.
      </p>
    `;
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${escapeHtml(subject)}</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 24px; color: #1f2937;">
      <div style="max-width: 640px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; border: 1px solid #e5e7eb; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
        <!-- Header -->
        <div style="background-color: #0f172a; padding: 24px; color: #ffffff;">
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <div>
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; color: #ffffff;">
                Business Market Monitor
              </h1>
              <p style="margin: 4px 0 0; font-size: 13px; color: #94a3b8;">
                ${escapeHtml(freqLabel)} Market Intelligence &amp; Sourcing Digest
              </p>
            </div>
            <div style="font-size: 12px; color: #94a3b8; text-align: right;">
              ${escapeHtml(dateStr)}
            </div>
          </div>
        </div>

        <div style="padding: 24px;">
          <!-- Business & Industry Info -->
          <div style="margin-bottom: 20px; padding-bottom: 16px; border-bottom: 1px solid #e5e7eb;">
            <div style="font-size: 15px; color: #111827;">
              Prepared for <strong>${safeBusiness}</strong>
            </div>
            <div style="font-size: 13px; color: #6b7280; margin-top: 2px;">
              Industry Focus: <span style="font-weight: 500; color: #374151;">${safeIndustry}</span>
            </div>
          </div>

          <!-- Section 1: Price Movers -->
          <div style="margin-bottom: 28px;">
            <h2 style="font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 12px;">
              📊 7-Day Price Movers
            </h2>
            <div style="border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden;">
              <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
                <thead>
                  <tr style="background-color: #f9fafb; color: #4b5563; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
                    <th style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">Material</th>
                    <th style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">Latest Price</th>
                    <th style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">7D Change</th>
                    <th style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  ${moversRows}
                </tbody>
              </table>
            </div>
          </div>

          <!-- Section 2: Procurement Recommendations -->
          <div style="margin-bottom: 28px;">
            <h2 style="font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 12px;">
              🎯 Sourcing &amp; Inventory Recommendations
            </h2>
            ${actionsHtml}
          </div>

          <!-- Section 3: Industry News -->
          <div style="margin-bottom: 24px;">
            <h2 style="font-size: 16px; font-weight: 600; color: #111827; margin: 0 0 12px;">
              🗞️ Curated Industry News
            </h2>
            ${newsHtml}
          </div>

          <!-- CTA Button -->
          <div style="text-align: center; margin: 32px 0 16px;">
            <a href="${escapeHtml(dashboardUrl)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 14px; padding: 12px 24px; border-radius: 6px; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
              Open BMM Dashboard
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color: #f9fafb; padding: 16px 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280; text-align: center;">
          <p style="margin: 0 0 8px;">
            You received this ${escapeHtml(freqLabel.toLowerCase())} digest because periodic news digest is enabled for your account.
          </p>
          <p style="margin: 0;">
            Adjust frequency or delivery channels in your <a href="${escapeHtml(dashboardUrl)}/settings" style="color: #2563eb; text-decoration: none;">Account Settings</a>.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  // Plain-text representation
  const textLines = [
    `=== BUSINESS MARKET MONITOR — ${freqLabel.toUpperCase()} DIGEST ===`,
    `Date: ${dateStr}`,
    `Business: ${businessName || 'Valued Business'} (${industryName || 'Market'})`,
    '',
    '--- 7-DAY PRICE MOVERS ---',
  ];

  if (topMovers && topMovers.length > 0) {
    topMovers.forEach((m) => {
      textLines.push(`• ${m.materialName}: ${m.currency || 'INR'} ${Number(m.latestPrice || 0).toFixed(2)} (${formatSignedPercent(m.changePercent)}) [${m.trend || 'STABLE'}]`);
    });
  } else {
    textLines.push('No significant price fluctuations in the past 7 days.');
  }

  textLines.push('', '--- SOURCING & INVENTORY RECOMMENDATIONS ---');
  if (procurementActions && procurementActions.length > 0) {
    procurementActions.forEach((a) => {
      const act = String(a.actionRecommendation || a.action || 'MONITOR_ONLY').replace(/_/g, ' ');
      textLines.push(`• ${a.materialName} [${act}]: ${a.rationale || a.bufferStrategy?.summary || 'Standard replenishment buffer.'}`);
    });
  } else {
    textLines.push('All materials are within standard inventory buffer parameters.');
  }

  textLines.push('', '--- CURATED INDUSTRY NEWS ---');
  if (topNews && topNews.length > 0) {
    topNews.forEach((n) => {
      textLines.push(`• ${n.title} (${n.sourceName || 'News'}) - ${n.url || ''}`);
    });
  } else {
    textLines.push('No new articles in the last cycle.');
  }

  textLines.push('', `Dashboard: ${dashboardUrl}`);

  return {
    subject,
    html,
    text: textLines.join('\n'),
  };
}

module.exports = {
  buildNewsDigest,
  escapeHtml,
  formatSignedPercent,
};
