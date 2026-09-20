const { Resend } = require('resend');
const env = require('../config/env');

let clientInstance = null;

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

function sanitizeErrorMessage(error, apiKey) {
  const rawMsg = error?.message || (typeof error === 'string' ? error : JSON.stringify(error));
  if (!rawMsg) return 'Unknown delivery error';
  if (apiKey && rawMsg.includes(apiKey)) {
    return rawMsg.split(apiKey).join('[REDACTED_API_KEY]');
  }
  return rawMsg;
}

/**
 * Sends an email using the Resend API.
 * Preserves the interface: sendEmail({ to, subject, html })
 * Returns Resend delivery data ({ id }) on success.
 * Throws an Error on missing parameters or provider delivery errors.
 */
async function sendEmail({ to, subject, html }, clientOverride = null) {
  const from = env.resend?.fromEmail;
  if (!from || String(from).trim() === '') {
    throw new Error('RESEND_FROM_EMAIL is not configured. Please set RESEND_FROM_EMAIL in your .env file.');
  }

  if (!to || (Array.isArray(to) && to.length === 0)) {
    throw new Error('Recipient email ("to") is required.');
  }

  const client = clientOverride || getResendClient();

  const { data, error } = await client.emails.send({
    from,
    to,
    subject,
    html,
  });

  if (error) {
    const errorMsg = sanitizeErrorMessage(error, env.resend?.apiKey);
    throw new Error(`Resend email delivery failed: ${errorMsg}`);
  }

  return data;
}

/**
 * Verifies email configuration and API connectivity without sending an email.
 * Preserves the interface: verifyConnection()
 * Returns true on success; throws an Error on configuration or connectivity failure.
 */
async function verifyConnection(clientOverride = null) {
  const from = env.resend?.fromEmail;
  if (!from || String(from).trim() === '') {
    throw new Error('RESEND_FROM_EMAIL is not configured. Please set RESEND_FROM_EMAIL in your .env file.');
  }

  const client = clientOverride || getResendClient();

  // If client provides an apiKeys check, verify connectivity against Resend API without sending email
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

module.exports = {
  sendEmail,
  verifyConnection,
  getResendClient,
};