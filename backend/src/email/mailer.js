const { Resend } = require('resend');
const env = require('../config/env');
const logger = require('../utils/logger');

const DEFAULT_SENDER_NAME = 'Business Market Monitor';

let clientInstance = null;

function sanitizeErrorMessage(error, apiKey) {
  const rawMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  if (!rawMsg) return 'Unknown delivery error';
  if (apiKey && rawMsg.includes(apiKey)) {
    return rawMsg.split(apiKey).join('[REDACTED_API_KEY]');
  }
  return rawMsg;
}

/**
 * Resolves the active email provider cleanly while preserving Resend as default.
 * Precedence:
 *  1. Explicit EMAIL_PROVIDER ('brevo', 'resend', 'console', 'smtp')
 *  2. Automatic 'brevo' when BREVO_API_KEY is configured and EMAIL_PROVIDER is unset
 *  3. Fallback 'resend' (exact existing behavior)
 */
function resolveEmailProvider() {
  const configured = String(env.email?.provider || '').trim().toLowerCase();
  if (configured) {
    return configured;
  }
  if (env.brevo?.apiKey && String(env.brevo.apiKey).trim() !== '') {
    return 'brevo';
  }
  return 'resend';
}

/**
 * Parses EMAIL_FROM ("Display Name <email@domain.com>" or plain "email@domain.com")
 * into Brevo's { name, email } sender object.
 */
function parseBrevoSender(rawFrom) {
  const value = typeof rawFrom === 'string' ? rawFrom.trim() : '';
  if (!value) {
    throw new Error('EMAIL_FROM is not configured. Please set EMAIL_FROM in your .env file.');
  }

  const angleMatch = value.match(/^(.*?)<\s*([^<>\s@]+@[^<>\s@]+\.[^<>\s@]+)\s*>$/);
  if (angleMatch) {
    const rawName = angleMatch[1].trim().replace(/^["']|["']$/g, '').trim();
    const email = angleMatch[2].trim();
    return {
      name: rawName || DEFAULT_SENDER_NAME,
      email,
    };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return {
      name: DEFAULT_SENDER_NAME,
      email: value,
    };
  }

  throw new Error('EMAIL_FROM must be a valid email address or "Display Name <email@domain.com>".');
}

function getBrevoFromRaw() {
  const emailFrom = typeof env.email?.from === 'string' ? env.email.from.trim() : '';
  if (emailFrom) return emailFrom;
  const brevoFrom = typeof env.brevo?.fromEmail === 'string' ? env.brevo.fromEmail.trim() : '';
  if (brevoFrom) return brevoFrom;
  return '';
}

function formatBrevoRecipients(to) {
  if (Array.isArray(to)) {
    return to
      .map((entry) => (typeof entry === 'string' ? entry.trim() : entry?.email?.trim()))
      .filter(Boolean)
      .map((email) => ({ email }));
  }
  return [{ email: String(to).trim() }];
}

/**
 * Sends an email via Brevo Transactional Email REST API (zero external dependencies).
 */
async function sendViaBrevo({ to, subject, html, text }) {
  const apiKey = env.brevo?.apiKey ? String(env.brevo.apiKey).trim() : '';
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured. Please set BREVO_API_KEY in your .env file.');
  }

  const sender = parseBrevoSender(getBrevoFromRaw());
  const baseUrl = (env.brevo?.baseUrl || 'https://api.brevo.com/v3').replace(/\/+$/, '');
  const timeoutMs = Number(env.brevo?.timeoutMs || env.email?.timeoutMs) || 15000;

  const payload = {
    sender,
    to: formatBrevoRecipients(to),
    subject,
    ...(html ? { htmlContent: html } : {}),
    ...(typeof text === 'string' && text.length > 0 ? { textContent: text } : {}),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${baseUrl}/smtp/email`, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Brevo email delivery timed out after ${timeoutMs}ms`);
    }
    const msg = sanitizeErrorMessage(err, apiKey);
    throw new Error(`Brevo email delivery failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  const rawText = await response.text();
  let parsed = null;
  if (rawText) {
    try {
      parsed = JSON.parse(rawText);
    } catch {
      parsed = null;
    }
  }

  if (!response.ok) {
    const detail =
      parsed?.message ||
      parsed?.code ||
      rawText ||
      `HTTP ${response.status} ${response.statusText || ''}`.trim();
    const sanitized = sanitizeErrorMessage(detail, apiKey);
    throw new Error(`Brevo email delivery failed (${response.status}): ${sanitized}`);
  }

  return {
    provider: 'brevo',
    messageId: parsed?.messageId || null,
  };
}

/**
 * Verifies Brevo API credentials and connectivity without sending an email.
 */
async function verifyBrevoConnection() {
  const apiKey = env.brevo?.apiKey ? String(env.brevo.apiKey).trim() : '';
  if (!apiKey) {
    throw new Error('BREVO_API_KEY is not configured. Please set BREVO_API_KEY in your .env file.');
  }

  parseBrevoSender(getBrevoFromRaw());

  const baseUrl = (env.brevo?.baseUrl || 'https://api.brevo.com/v3').replace(/\/+$/, '');
  const timeoutMs = Number(env.brevo?.timeoutMs || env.email?.timeoutMs) || 15000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch(`${baseUrl}/account`, {
      method: 'GET',
      headers: {
        'api-key': apiKey,
        accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`Brevo connection verification timed out after ${timeoutMs}ms`);
    }
    const msg = sanitizeErrorMessage(err, apiKey);
    throw new Error(`Brevo connection verification failed: ${msg}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const rawText = await response.text();
    let parsed = null;
    if (rawText) {
      try {
        parsed = JSON.parse(rawText);
      } catch {
        parsed = null;
      }
    }
    const detail = parsed?.message || parsed?.code || rawText || `HTTP ${response.status}`;
    const sanitized = sanitizeErrorMessage(detail, apiKey);
    throw new Error(`Brevo connection verification failed (${response.status}): ${sanitized}`);
  }

  return true;
}

/**
 * Returns a configured Resend SDK client instance.
 * Throws an actionable error if RESEND_API_KEY is not configured.
 */
function getResendClient() {
  const apiKey = env.resend?.apiKey;
  if (!apiKey || String(apiKey).trim() === '') {
    throw new Error('RESEND_API_KEY is not configured. Please set RESEND_API_KEY in your .env file.');
  }

  if (!clientInstance || clientInstance.key !== apiKey) {
    clientInstance = new Resend(apiKey);
  }

  return clientInstance;
}

async function sendViaResend({ to, subject, html, text }, clientOverride = null) {
  const from = env.resend?.fromEmail;
  if (!from || String(from).trim() === '') {
    throw new Error('RESEND_FROM_EMAIL is not configured. Please set RESEND_FROM_EMAIL in your .env file.');
  }

  const client = clientOverride || getResendClient();
  const payload = {
    from,
    to,
    subject,
    html,
    ...(typeof text === 'string' && text.length > 0 ? { text } : {}),
  };

  const { data, error } = await client.emails.send(payload);

  if (error) {
    const errorMsg = sanitizeErrorMessage(error, env.resend?.apiKey);
    throw new Error(`Resend email delivery failed: ${errorMsg}`);
  }

  return data;
}

async function verifyResendConnection(clientOverride = null) {
  const from = env.resend?.fromEmail;
  if (!from || String(from).trim() === '') {
    throw new Error('RESEND_FROM_EMAIL is not configured. Please set RESEND_FROM_EMAIL in your .env file.');
  }

  const client = clientOverride || getResendClient();

  if (client.apiKeys && typeof client.apiKeys.list === 'function') {
    let result;
    try {
      result = await client.apiKeys.list();
    } catch (err) {
      const errorMsg = sanitizeErrorMessage(err, env.resend?.apiKey);
      throw new Error(`Resend connection verification failed: ${errorMsg}`);
    }

    if (result && result.error) {
      const error = result.error;
      // Sending-only keys return 403 / restricted_api_key, which confirms valid API credentials
      if (error.statusCode === 403 || error.name === 'restricted_api_key') {
        return true;
      }
      const errorMsg = sanitizeErrorMessage(error, env.resend?.apiKey);
      throw new Error(`Resend connection verification failed: ${errorMsg}`);
    }
  }

  return true;
}

/**
 * Sends an email using the active configured provider (brevo, resend, console).
 * Preserves the interface: sendEmail({ to, subject, html, text })
 */
async function sendEmail({ to, subject, html, text }, clientOverride = null) {
  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error('Recipient email ("to") is required.');
  }

  if (clientOverride) {
    return sendViaResend({ to, subject, html, text }, clientOverride);
  }

  const provider = resolveEmailProvider();

  if (provider === 'brevo') {
    return sendViaBrevo({ to, subject, html, text });
  }

  if (provider === 'console') {
    const recipient = Array.isArray(to) ? to.join(', ') : String(to);
    const domain = recipient.includes('@') ? recipient.split('@')[1] : 'unknown';
    logger.info(`[mailer:console] Dispatched email to *@${domain} (subject: "${subject || ''}")`);
    return {
      provider: 'console',
      messageId: `console-${Date.now()}`,
    };
  }

  if (provider === 'smtp') {
    throw new Error('SMTP transport is not configured (use EMAIL_PROVIDER=brevo or EMAIL_PROVIDER=resend for HTTPS delivery).');
  }

  return sendViaResend({ to, subject, html, text }, null);
}

/**
 * Verifies email configuration and API connectivity without sending an email.
 * Preserves the interface: verifyConnection()
 */
async function verifyConnection(clientOverride = null) {
  if (clientOverride) {
    return verifyResendConnection(clientOverride);
  }

  const provider = resolveEmailProvider();

  if (provider === 'brevo') {
    return verifyBrevoConnection();
  }

  if (provider === 'console') {
    return true;
  }

  if (provider === 'smtp') {
    throw new Error('SMTP transport is not configured (use EMAIL_PROVIDER=brevo or EMAIL_PROVIDER=resend for HTTPS delivery).');
  }

  return verifyResendConnection(null);
}

module.exports = {
  sendEmail,
  verifyConnection,
  getResendClient,
  resolveEmailProvider,
  parseBrevoSender,
};
