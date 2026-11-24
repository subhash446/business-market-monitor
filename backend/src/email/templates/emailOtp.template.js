'use strict';

/**
 * 6-Digit Email OTP verification template (Migration 036).
 *
 * Dispatched via Resend mailer for passwordless sign-in and email verification.
 */
function buildEmailOtpEmail({ otp, purpose = 'LOGIN_OTP', expiryMinutes = 10 }) {
  const isVerify = purpose === 'VERIFY_EMAIL';
  const actionLabel = isVerify ? 'verify your email address' : 'sign in to your account';
  const subject = `Your Business Market Monitor verification code: ${otp}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #18181b; background-color: #ffffff; border-radius: 8px;">
      <div style="margin-bottom: 24px; display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 18px; font-weight: 700; color: #09090b; letter-spacing: -0.01em;">Business Market Monitor</span>
        <span style="font-size: 11px; font-weight: 600; background-color: #eff6ff; color: #2563eb; padding: 2px 6px; border-radius: 4px; border: 1px solid #dbeafe;">BMM</span>
      </div>

      <h2 style="font-size: 20px; font-weight: 600; color: #09090b; margin: 0 0 12px 0;">
        ${isVerify ? 'Verify your email address' : 'Sign in to Business Market Monitor'}
      </h2>

      <p style="font-size: 14px; color: #52525b; line-height: 1.6; margin: 0 0 24px 0;">
        Use the following 6-digit code to ${actionLabel}. This code will expire in ${expiryMinutes} minutes.
      </p>

      <div style="background-color: #f4f4f5; border: 1px solid #e4e4e7; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #09090b;">
          ${otp}
        </div>
      </div>

      <p style="font-size: 13px; color: #71717a; line-height: 1.5; margin: 0 0 24px 0;">
        If you did not request this verification code, please ignore this email or contact support if you have concerns. Never share this code with anyone.
      </p>

      <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 24px 0;" />

      <p style="font-size: 12px; color: #a1a1aa; margin: 0;">
        &copy; 2026 Business Market Monitor &middot; Automated Raw Material Procurement Intelligence
      </p>
    </div>
  `;

  return {
    subject,
    html,
  };
}

module.exports = {
  buildEmailOtpEmail,
};
