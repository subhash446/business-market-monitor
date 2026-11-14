'use strict';

/**
 * WhatsApp Cloud API Provider (FR-ALERT-07 / T-06).
 *
 * Responsibilities:
 *   - Sends alert notifications via Meta WhatsApp Cloud API (Graph API v20.0+)
 *   - Enforces timeout via AbortController (no external network dependencies)
 *   - Validates recipient phone number using strict E.164 format
 *   - Strictly redacts tokens and phone numbers in error logs and returned messages
 *   - Gracefully reports delivery failure without throwing unhandled exceptions
 *   - Provider-agnostic boundary: accepts structured alert payloads and delivers
 *
 * API Reference:
 *   POST https://graph.facebook.com/v20.0/{phone_number_id}/messages
 *   Headers: Authorization: Bearer {token}, Content-Type: application/json
 */

const env = require('../config/env');

const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

function isValidE164(phone) {
  return typeof phone === 'string' && E164_PHONE_REGEX.test(phone.trim());
}

/**
 * Redact phone number for safe logging: e.g. "+919876543210" -> "+91****3210"
 */
function redactPhoneNumber(phone) {
  if (typeof phone !== 'string') return '[REDACTED]';
  const trimmed = phone.trim();
  if (trimmed.length <= 6) return '***';
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

/**
 * Sanitize error messages to eliminate tokens and full phone numbers.
 */
function sanitizeErrorMessage(err) {
  const raw = err && err.message ? String(err.message) : String(err || 'Unknown WhatsApp delivery error');
  return raw
    .replace(/(Bearer\s+)[A-Za-z0-9_.-]+/gi, '$1***')
    .replace(/\+[1-9]\d{6,14}\b/g, (m) => redactPhoneNumber(m))
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Format human-readable WhatsApp alert notification text.
 */
function formatAlertMessage({
  materialName,
  conditionType,
  thresholdType = 'ABSOLUTE',
  thresholdPrice,
  triggeredPrice,
  triggeredChangePercent = null,
  currency = 'INR',
  unitLabel = null,
  triggeredAt = null,
}) {
  const isAbove = conditionType === 'PRICE_ABOVE';
  const conditionLabel = isAbove ? 'Price Exceeded Threshold' : 'Price Dropped Below Threshold';
  const unitText = unitLabel ? ` / ${unitLabel}` : '';
  const formattedThreshold = thresholdType === 'PERCENTAGE'
    ? `${Number(thresholdPrice).toFixed(1)}%`
    : `${currency} ${Number(thresholdPrice).toFixed(2)}${unitText}`;
  const formattedTriggered = `${currency} ${Number(triggeredPrice).toFixed(2)}${unitText}`;

  let changeLine = '';
  if (triggeredChangePercent !== null && triggeredChangePercent !== undefined && Number.isFinite(Number(triggeredChangePercent))) {
    const sign = Number(triggeredChangePercent) > 0 ? '+' : '';
    changeLine = `\n• *Change:* ${sign}${Number(triggeredChangePercent).toFixed(2)}%`;
  }

  const dt = triggeredAt ? new Date(triggeredAt) : new Date();
  const timeStr = dt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

  return (
    `🔔 *Business Market Monitor Alert*\n\n` +
    `*Material:* ${materialName}\n` +
    `• *Condition:* ${conditionLabel}\n` +
    `• *Triggered Price:* ${formattedTriggered}\n` +
    `• *Threshold:* ${formattedThreshold} (${thresholdType})${changeLine}\n` +
    `• *Time:* ${timeStr}\n\n` +
    `_Log in to Business Market Monitor for real-time market impact analysis._`
  );
}

/**
 * Send a message via Meta WhatsApp Cloud API.
 *
 * @param {Object} options
 * @param {string} options.to E.164 phone number (e.g. "+919876543210")
 * @param {string} options.text Formatted text body
 * @returns {Promise<{ success: boolean, messageId?: string, error?: string }>}
 */
async function sendMessage({ to, text }) {
  if (!env.whatsapp || !env.whatsapp.enabled) {
    return {
      success: false,
      error: 'WhatsApp delivery is disabled (WHATSAPP_ENABLED=false)',
    };
  }

  if (!isValidE164(to)) {
    return {
      success: false,
      error: `Invalid destination phone number (${redactPhoneNumber(to)}). Must be valid E.164 format.`,
    };
  }

  const apiToken = env.whatsapp.apiToken;
  const phoneNumberId = env.whatsapp.phoneNumberId;
  const baseUrl = env.whatsapp.baseUrl || 'https://graph.facebook.com/v20.0';
  const timeoutMs = env.whatsapp.timeoutMs || 15000;

  if (!apiToken || !phoneNumberId) {
    return {
      success: false,
      error: 'WhatsApp provider misconfigured (missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID)',
    };
  }

  // Meta Cloud API expects recipient number without leading '+'
  const recipientDigits = String(to).trim().replace(/^\+/, '');
  const url = `${baseUrl.replace(/\/+$/, '')}/${phoneNumberId}/messages`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: recipientDigits,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      const apiErr = data && data.error && data.error.message
        ? data.error.message
        : `HTTP ${response.status} ${response.statusText}`;
      return {
        success: false,
        error: sanitizeErrorMessage(new Error(apiErr)),
      };
    }

    const messageId = data?.messages?.[0]?.id || 'delivered';
    return {
      success: true,
      messageId,
    };
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return {
        success: false,
        error: `WhatsApp request timed out after ${timeoutMs}ms`,
      };
    }
    return {
      success: false,
      error: sanitizeErrorMessage(err),
    };
  }
}

module.exports = {
  isValidE164,
  redactPhoneNumber,
  sanitizeErrorMessage,
  formatAlertMessage,
  sendMessage,
};
