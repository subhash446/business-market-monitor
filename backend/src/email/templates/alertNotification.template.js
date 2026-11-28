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

function normalizeMaterialName(materialName) {
  if (typeof materialName === 'string') {
    const trimmed = materialName.trim();
    return trimmed || 'Tracked Material';
  }
  if (typeof materialName === 'number' && Number.isFinite(materialName)) {
    return String(materialName);
  }
  return 'Tracked Material';
}

function normalizeUnitSuffix(unitLabel) {
  if (typeof unitLabel === 'string') {
    const trimmed = unitLabel.trim();
    return trimmed ? ` / ${trimmed}` : '';
  }
  if (typeof unitLabel === 'number' && Number.isFinite(unitLabel)) {
    return ` / ${unitLabel}`;
  }
  return '';
}

function formatAmount(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return 'N/A';
  }
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : 'N/A';
}

function formatSignedPercent(value) {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') {
    return null;
  }
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return {
    numeric: num,
    formatted: `${num >= 0 ? '+' : ''}${num.toFixed(2)}%`,
  };
}

function formatTriggeredAt(triggeredAt) {
  if (
    triggeredAt === null ||
    triggeredAt === undefined ||
    triggeredAt === '' ||
    typeof triggeredAt === 'boolean' ||
    (typeof triggeredAt === 'object' && !(triggeredAt instanceof Date))
  ) {
    return 'N/A';
  }
  const parsed = triggeredAt instanceof Date ? triggeredAt : new Date(triggeredAt);
  if (Number.isNaN(parsed.getTime())) {
    return 'N/A';
  }
  return parsed.toISOString();
}

function buildAlertNotification({
  materialName,
  conditionType,
  thresholdType = 'ABSOLUTE',
  thresholdPrice,
  triggeredPrice,
  triggeredChangePercent = null,
  currency = 'INR',
  unitLabel = null,
  triggeredAt,
} = {}) {
  const safeMaterialName = normalizeMaterialName(materialName);
  const subjectMaterialName = safeMaterialName.replace(/[\r\n]+/g, ' ');
  const htmlMaterialName = escapeHtml(safeMaterialName);

  const safeCurrency = typeof currency === 'string' && currency.trim() ? currency.trim() : 'INR';
  const rawCurrSym = safeCurrency === 'USD' ? '$' : (safeCurrency === 'INR' ? '₹' : `${safeCurrency} `);
  const htmlCurrSym = escapeHtml(rawCurrSym);

  const rawUnitSuffix = normalizeUnitSuffix(unitLabel);
  const htmlUnitSuffix = escapeHtml(rawUnitSuffix);

  const thresholdFormatted = formatAmount(thresholdPrice);
  const triggeredFormatted = formatAmount(triggeredPrice);
  const triggeredAtFormatted = escapeHtml(formatTriggeredAt(triggeredAt));

  let conditionTextHtml = '';
  let subject = '';

  const signedChange = formatSignedPercent(triggeredChangePercent);

  if (thresholdType === 'PERCENTAGE') {
    const isAbove = conditionType === 'PRICE_ABOVE';
    const pctThresholdDisplay =
      typeof thresholdPrice === 'number' && Number.isFinite(thresholdPrice)
        ? String(thresholdPrice)
        : (typeof thresholdPrice === 'string' && thresholdPrice.trim() ? thresholdPrice.trim() : '0');
    const safePctThresholdHtml = escapeHtml(pctThresholdDisplay);
    const pctLabelText = isAbove
      ? `Price increase ≥ ${pctThresholdDisplay}%`
      : `Price drop ≥ ${pctThresholdDisplay}%`;
    conditionTextHtml = isAbove
      ? `Price increase ≥ ${safePctThresholdHtml}%`
      : `Price drop ≥ ${safePctThresholdHtml}%`;

    const changeFormatted = signedChange ? signedChange.formatted : 'N/A';
    subject = `Price Alert: ${subjectMaterialName} ${pctLabelText} (Triggered: ${changeFormatted})`;
  } else {
    const condition = conditionType === 'PRICE_ABOVE' ? 'Price Above' : 'Price Below';
    conditionTextHtml = `${condition} ${htmlCurrSym}${thresholdFormatted}${htmlUnitSuffix}`;
    subject = `Price Alert: ${subjectMaterialName} ${condition} ${rawCurrSym}${thresholdFormatted}`;
  }

  const changeRow = thresholdType === 'PERCENTAGE' && signedChange
    ? `<tr>
         <td style="padding: 10px; border: 1px solid #ddd;"><strong>Observed Change</strong></td>
         <td style="padding: 10px; border: 1px solid #ddd; font-weight: bold; color: ${signedChange.numeric >= 0 ? '#b91c1c' : '#15803d'};">
           ${signedChange.formatted}
         </td>
       </tr>`
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="margin-bottom: 20px; color: #111827;">🚨 Price Alert Triggered</h2>

      <p>Your configured market alert rule for <strong>${htmlMaterialName}</strong> has been triggered.</p>

      <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <tr>
          <td style="padding: 10px; border: 1px solid #ddd; width: 40%;"><strong>Material</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${htmlMaterialName}</td>
        </tr>

        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Alert Rule</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${conditionTextHtml}</td>
        </tr>

        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Threshold</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">
            ${thresholdType === 'PERCENTAGE' ? `${thresholdFormatted}%` : `${htmlCurrSym}${thresholdFormatted}${htmlUnitSuffix}`}
          </td>
        </tr>

        ${changeRow}

        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Triggered Price</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd; font-family: monospace; font-size: 1.1em;">
            ${htmlCurrSym}${triggeredFormatted}${htmlUnitSuffix}
          </td>
        </tr>

        <tr>
          <td style="padding: 10px; border: 1px solid #ddd;"><strong>Triggered At</strong></td>
          <td style="padding: 10px; border: 1px solid #ddd;">${triggeredAtFormatted}</td>
        </tr>
      </table>

      <p style="margin-top: 24px; font-size: 12px; color: #6b7280;">
        This automated alert was generated by AI Market Intelligence Agent. You can manage your alert rules and notification settings in your dashboard.
      </p>
    </div>
  `;

  return { subject, html };
}

module.exports = { buildAlertNotification, escapeHtml, formatTriggeredAt };
