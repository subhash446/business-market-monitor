const mailer = require('../email/mailer');
const { buildAlertNotification } = require('../email/templates/alertNotification.template');

async function sendAlertNotification({
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
