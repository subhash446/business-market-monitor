const mailer = require('../email/mailer');
const { buildAlertNotification } = require('../email/templates/alertNotification.template');
const whatsappProvider = require('../providers/whatsapp.provider');

async function sendAlertNotification({
  channel = 'EMAIL',
  to,
  materialName,
  conditionType,
  thresholdType = 'ABSOLUTE',
  thresholdPrice,
  triggeredPrice,
  triggeredChangePercent = null,
  currency = 'INR',
  unitLabel = null,
  triggeredAt,
}) {
  if (channel === 'WHATSAPP') {
    const formattedText = whatsappProvider.formatAlertMessage({
      materialName,
      conditionType,
      thresholdType,
      thresholdPrice,
      triggeredPrice,
      triggeredChangePercent,
      currency,
      unitLabel,
      triggeredAt,
    });

    return whatsappProvider.sendMessage({
      to,
      text: formattedText,
    });
  }

  // Default: EMAIL channel
  const { subject, html } = buildAlertNotification({
    materialName,
    conditionType,
    thresholdType,
    thresholdPrice,
    triggeredPrice,
    triggeredChangePercent,
    currency,
    unitLabel,
    triggeredAt,
  });

  return mailer.sendEmail({
    to,
    subject,
    html,
  });
}

async function verifyEmailConnection() {
  return mailer.verifyConnection();
}

module.exports = {
  sendAlertNotification,
  verifyEmailConnection,
};
