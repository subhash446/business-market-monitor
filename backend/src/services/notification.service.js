const mailer = require('../email/mailer');
const { buildAlertNotification } = require('../email/templates/alertNotification.template');

async function sendAlertNotification({
  to,
  materialName,
  conditionType,
  thresholdPrice,
  triggeredPrice,
  triggeredAt,
}) {
  const { subject, html } = buildAlertNotification({
    materialName,
    conditionType,
    thresholdPrice,
    triggeredPrice,
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