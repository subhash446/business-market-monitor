const nodemailer = require('nodemailer');
const env = require('../config/env');

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: {
    user: env.smtp.user,
    pass: env.smtp.password,
  },
});

async function sendEmail({ to, subject, html }) {
  const info = await transporter.sendMail({
    from: env.smtp.fromEmail,
    to,
    subject,
    html,
  });

  return info;
}

async function verifyConnection() {
  await transporter.verify();
  return true;
}

module.exports = {
  sendEmail,
  verifyConnection,
};