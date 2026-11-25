import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after, before, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, '..');
const srcRoot = path.join(frontendRoot, 'src');

const mockAuth = {
  user: null,
  business: null,
  isAuthenticated: false,
  hasBusinessProfile: false,
  login: () => {},
  logout: () => {},
  setBusiness: () => {},
  clearBusiness: () => {},
};

describe('Auth Pages — Linear/Stripe Dark Polish, Default Password Sign-In & 2-Step Verified Signup', () => {
  let viteServer;

  before(async () => {
    viteServer = await createServer({
      root: frontendRoot,
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
      optimizeDeps: { noDiscovery: true },
      logLevel: 'silent',
    });
  });

  after(async () => {
    if (viteServer) {
      await viteServer.close();
    }
  });

  // =========================================================================
  // 1. Clean Brand Header (No BMM Badge) & Link to /
  // =========================================================================
  describe('1. Clean Business Market Monitor Branding Across All Auth Pages', () => {
    test('LoginPage renders "Business Market Monitor" WITHOUT BMM badge and links to /', async () => {
      const { LoginPage } = await viteServer.ssrLoadModule('/src/pages/auth/LoginPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, null, React.createElement(LoginPage))
        )
      );

      assert.ok(html.includes('Business Market Monitor'), 'LoginPage must display "Business Market Monitor"');
      assert.ok(!html.includes('auth-brand__badge'), 'LoginPage must NOT render BMM badge class');
      assert.ok(!html.includes('>BMM<'), 'LoginPage must NOT display BMM pill text');
      assert.ok(html.includes('href="/"'), 'LoginPage brand header must link back to /');
    });

    test('RegisterPage renders "Business Market Monitor" WITHOUT BMM badge and links to /', async () => {
      const { RegisterPage } = await viteServer.ssrLoadModule('/src/pages/auth/RegisterPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, null, React.createElement(RegisterPage))
        )
      );

      assert.ok(html.includes('Business Market Monitor'), 'RegisterPage must display "Business Market Monitor"');
      assert.ok(!html.includes('auth-brand__badge'), 'RegisterPage must NOT render BMM badge class');
      assert.ok(!html.includes('>BMM<'), 'RegisterPage must NOT display BMM pill text');
      assert.ok(html.includes('href="/"'), 'RegisterPage brand header must link back to /');
    });

    test('ForgotPasswordPage and ResetPasswordPage render "Business Market Monitor" WITHOUT BMM badge', async () => {
      const { ForgotPasswordPage } = await viteServer.ssrLoadModule('/src/pages/auth/ForgotPasswordPage.jsx');
      const { ResetPasswordPage } = await viteServer.ssrLoadModule('/src/pages/auth/ResetPasswordPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

      const fpHtml = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, null, React.createElement(ForgotPasswordPage))
        )
      );
      const rpHtml = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, { initialEntries: ['/reset-password?token=abc'] }, React.createElement(ResetPasswordPage))
        )
      );

      for (const [label, html] of [['ForgotPasswordPage', fpHtml], ['ResetPasswordPage', rpHtml]]) {
        assert.ok(html.includes('Business Market Monitor'), `${label} must display "Business Market Monitor"`);
        assert.ok(!html.includes('auth-brand__badge'), `${label} must NOT render BMM badge class`);
        assert.ok(!html.includes('>BMM<'), `${label} must NOT display BMM pill text`);
        assert.ok(html.includes('href="/"'), `${label} brand header must link back to /`);
      }
    });
  });

  // =========================================================================
  // 2. Google Sign-In Full-Width Button & Hairline Dividers
  // =========================================================================
  describe('2. Full-Width Google Sign-In & Minimal Dividers', () => {
    test('GoogleSignInButton renders accessible Google button and ResizeObserver width logic', async () => {
      const { GoogleSignInButton } = await viteServer.ssrLoadModule('/src/components/auth/GoogleSignInButton.jsx');
      const componentSrc = fs.readFileSync(path.join(srcRoot, 'components/auth/GoogleSignInButton.jsx'), 'utf-8');

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, null, React.createElement(GoogleSignInButton))
      );

      assert.ok(html.includes('Continue with Google'), 'Must display "Continue with Google" text');
      assert.ok(html.includes('svg'), 'Must render Google G SVG icon');
      assert.ok(html.includes('google-auth-container'), 'Must render google-auth-container wrapper');
      assert.ok(componentSrc.includes('ResizeObserver'), 'GoogleSignInButton must measure width via ResizeObserver');
    });

    test('LoginPage and RegisterPage have single email divider and no redundant footer divider', () => {
      const loginContent = fs.readFileSync(path.join(srcRoot, 'pages/auth/LoginPage.jsx'), 'utf-8');
      const registerContent = fs.readFileSync(path.join(srcRoot, 'pages/auth/RegisterPage.jsx'), 'utf-8');

      assert.ok(loginContent.includes('or sign in with email'), 'LoginPage must render "or sign in with email" divider');
      assert.ok(registerContent.includes('or create an account with email'), 'RegisterPage must render "or create an account with email" divider');
      assert.ok(!loginContent.includes('auth-divider mt-6'), 'LoginPage must not include redundant bottom "or" divider');
      assert.ok(!registerContent.includes('auth-divider mt-6'), 'RegisterPage must not include redundant bottom "or" divider');
    });
  });

  // =========================================================================
  // 3. LoginPage Default Password Flow & Secondary Email OTP Link
  // =========================================================================
  describe('3. LoginPage Default Email + Password View', () => {
    test('LoginPage defaults directly to Email + Password with Forgot password?, eye toggle, and secondary OTP link (no segmented tabs)', async () => {
      const { LoginPage } = await viteServer.ssrLoadModule('/src/pages/auth/LoginPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, null, React.createElement(LoginPage))
        )
      );

      // No segmented tab box
      assert.ok(!html.includes('role="tablist"'), 'LoginPage must not render a segmented tablist box');
      assert.ok(!html.includes('Email OTP (Passwordless)'), 'LoginPage must not display old segmented OTP tab');

      // Default Email + Password inputs
      assert.ok(html.includes('id="login-email-pwd"'), 'LoginPage must default to email input');
      assert.ok(html.includes('id="login-password"'), 'LoginPage must default to password input');
      assert.ok(html.includes('Forgot password?'), 'LoginPage must display "Forgot password?" link in label row');
      assert.ok(html.includes('aria-label="Show password"'), 'LoginPage must render Show/Hide password toggle');
      assert.ok(html.includes('Sign In'), 'LoginPage must render primary Sign In button');

      // Low-friction secondary link to Email OTP
      assert.ok(html.includes('Prefer a one-time code?'), 'LoginPage must offer subtle Email OTP toggle link');
      assert.ok(html.includes('Sign in with Email OTP'), 'LoginPage must include "Sign in with Email OTP" action');
    });
  });

  // =========================================================================
  // 4. RegisterPage 2-Step Verified Signup & 6-Box OtpInput Component
  // =========================================================================
  describe('4. RegisterPage Step 1 & OtpInput SSR', () => {
    test('RegisterPage renders Step 1 (Name + Email + Send Verification Code) with neutral placeholder', async () => {
      const { RegisterPage } = await viteServer.ssrLoadModule('/src/pages/auth/RegisterPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, null, React.createElement(RegisterPage))
        )
      );

      assert.ok(html.includes('Step 1 of 2'), 'RegisterPage must display Step 1 of 2 indicator');
      assert.ok(html.includes('id="register-fullname"'), 'RegisterPage must render full name input in Step 1');
      assert.ok(html.includes('id="register-email"'), 'RegisterPage must render email input in Step 1');
      assert.ok(html.includes('placeholder="Aarav Sharma"'), 'RegisterPage must use neutral placeholder "Aarav Sharma"');
      assert.ok(!html.includes('Subhash Yadav'), 'RegisterPage must NOT contain personal placeholder "Subhash Yadav"');
      assert.ok(html.includes('Send Verification Code'), 'RegisterPage Step 1 CTA must be "Send Verification Code"');
      assert.ok(!html.includes('id="register-password"'), 'RegisterPage Step 1 must not render password input before email verification');
    });

    test('OtpInput renders 6 accessible numeric digit boxes in SSR', async () => {
      const { OtpInput } = await viteServer.ssrLoadModule('/src/components/auth/OtpInput.jsx');

      const html = renderToStaticMarkup(
        React.createElement(OtpInput, { id: 'test-otp', value: '12' })
      );

      const inputMatches = html.match(/<input /g) || [];
      assert.equal(inputMatches.length, 6, 'OtpInput must render exactly 6 digit inputs');
      assert.ok(html.includes('aria-label="Digit 1 of 6"'), 'OtpInput must render accessible per-digit labels');
      assert.ok(html.includes('aria-label="Digit 6 of 6"'), 'OtpInput must render 6th digit label');
      assert.ok(html.includes('inputMode="numeric"'), 'OtpInput must set inputMode="numeric"');
      assert.ok(html.includes('value="1"'), 'OtpInput must populate digit 1 value');
      assert.ok(html.includes('value="2"'), 'OtpInput must populate digit 2 value');
    });

    test('auth.css defines polished Zinc card, 6-box OTP grid, and password toggle styles', () => {
      const cssContent = fs.readFileSync(path.join(srcRoot, 'styles/pages/auth.css'), 'utf-8');

      assert.ok(cssContent.includes('#111113'), 'auth.css must use dark Zinc #111113 card surface');
      assert.ok(cssContent.includes('.otp-boxes'), 'auth.css must define .otp-boxes');
      assert.ok(cssContent.includes('.otp-box'), 'auth.css must define .otp-box');
      assert.ok(cssContent.includes('tabular-nums'), 'auth.css must apply tabular-nums to OTP boxes');
      assert.ok(cssContent.includes('.password-toggle-btn'), 'auth.css must define .password-toggle-btn');
      assert.ok(!cssContent.includes('.auth-brand__badge'), 'auth.css must remove .auth-brand__badge');
      assert.ok(!cssContent.includes('.auth-mode-toggle'), 'auth.css must remove .auth-mode-toggle');
    });
  });
});
