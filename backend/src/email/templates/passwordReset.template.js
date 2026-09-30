/**
 * Password reset email template (FR-AUTH-07, Document 5 §4.1).
 *
 * Generates subject and HTML for password reset emails dispatched via Resend.
 */

function buildPasswordResetEmail({ resetUrl, expiryMinutes = 60 }) {
  const subject = 'Reset Your Password - Business Market Monitor';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1e293b; line-height: 1.5;">
      <h2 style="margin-bottom: 20px; color: #0f172a; font-size: 22px;">Reset Your Password</h2>
      <p style="margin-bottom: 16px;">We received a request to reset the password for your Business Market Monitor account.</p>
      <p style="margin-bottom: 24px;">Click the button below to choose a new password:</p>
      <div style="margin: 28px 0;">
        <a href="${resetUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="color: #64748b; font-size: 14px; margin-bottom: 16px;">
        This link will expire in ${expiryMinutes} minutes.
      </p>
      <p style="color: #64748b; font-size: 14px; margin-bottom: 24px;">
        If the button above does not work, copy and paste this URL into your browser:<br />
        <a href="${resetUrl}" style="color: #2563eb; word-break: break-all;">${resetUrl}</a>
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="color: #94a3b8; font-size: 12px; margin: 0;">
        If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
      </p>
    </div>
  `;

  return {
    subject,
    html,
  };
}

module.exports = {
  buildPasswordResetEmail,
};
