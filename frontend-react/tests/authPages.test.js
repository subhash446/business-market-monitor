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

describe('Auth Pages — Business Market Monitor Branding, Google Sign-In & Email OTP', () => {
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
  // 1. Brand Header & Link Verification (LoginPage & RegisterPage)
  // =========================================================================
  describe('1. Full Business Market Monitor Branding on Auth Pages', () => {
    test('LoginPage.jsx renders "Business Market Monitor" with BMM badge and link to /', async () => {
      const { LoginPage } = await viteServer.ssrLoadModule('/src/pages/auth/LoginPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

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

      const html = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, null, React.createElement(LoginPage))
        )
      );

      // Full brand name
      assert.ok(html.includes('Business Market Monitor'), 'LoginPage must display full "Business Market Monitor" brand');
      assert.ok(!html.includes('>Market Monitor<'), 'LoginPage must not display legacy standalone "Market Monitor"');

      // BMM badge
      assert.ok(html.includes('auth-brand__badge'), 'LoginPage must render BMM badge element');
      assert.ok(html.includes('BMM'), 'LoginPage must display BMM acronym badge');

      // Home link
      assert.ok(html.includes('href="/"'), 'LoginPage brand header must link back to home (/)');
    });

    test('RegisterPage.jsx renders "Business Market Monitor" with BMM badge and link to /', async () => {
      const { RegisterPage } = await viteServer.ssrLoadModule('/src/pages/auth/RegisterPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

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

      const html = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, null, React.createElement(RegisterPage))
        )
      );

      // Full brand name
      assert.ok(html.includes('Business Market Monitor'), 'RegisterPage must display full "Business Market Monitor" brand');
      assert.ok(!html.includes('>Market Monitor<'), 'RegisterPage must not display legacy standalone "Market Monitor"');

      // BMM badge
      assert.ok(html.includes('auth-brand__badge'), 'RegisterPage must render BMM badge element');
      assert.ok(html.includes('BMM'), 'RegisterPage must display BMM acronym badge');

      // Home link
      assert.ok(html.includes('href="/"'), 'RegisterPage brand header must link back to home (/)');
    });
  });

  // =========================================================================
  // 2. Google Sign-In Component SSR & Slot Verification
  // =========================================================================
  describe('2. Google Sign-In Button Integration', () => {
    test('GoogleSignInButton renders accessible Google button with icon', async () => {
      const { GoogleSignInButton } = await viteServer.ssrLoadModule('/src/components/auth/GoogleSignInButton.jsx');

      const html = renderToStaticMarkup(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(GoogleSignInButton)
        )
      );

      assert.ok(html.includes('Continue with Google'), 'Must display "Continue with Google" text');
      assert.ok(html.includes('svg'), 'Must render Google G SVG icon');
      assert.ok(html.includes('google-auth-container'), 'Must render google-auth-container wrapper');
    });

    test('both LoginPage and RegisterPage mount GoogleSignInButton and email divider', async () => {
      const loginContent = fs.readFileSync(path.join(srcRoot, 'pages/auth/LoginPage.jsx'), 'utf-8');
      const registerContent = fs.readFileSync(path.join(srcRoot, 'pages/auth/RegisterPage.jsx'), 'utf-8');

      assert.ok(loginContent.includes('<GoogleSignInButton'), 'LoginPage must mount GoogleSignInButton');
      assert.ok(registerContent.includes('<GoogleSignInButton'), 'RegisterPage must mount GoogleSignInButton');
      assert.ok(loginContent.includes('or continue with email'), 'LoginPage must render email divider');
      assert.ok(registerContent.includes('or register with email'), 'RegisterPage must render email divider');
    });
  });

  // =========================================================================
  // 3. Email OTP & Password Mode Controls
  // =========================================================================
  describe('3. Email OTP & Passwordless Controls', () => {
    test('LoginPage renders Email OTP and Password mode switcher tabs', async () => {
      const { LoginPage } = await viteServer.ssrLoadModule('/src/pages/auth/LoginPage.jsx');
      const { AuthContext } = await viteServer.ssrLoadModule('/src/context/AuthContext.jsx');

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

      const html = renderToStaticMarkup(
        React.createElement(
          AuthContext.Provider,
          { value: mockAuth },
          React.createElement(MemoryRouter, null, React.createElement(LoginPage))
        )
      );

      assert.ok(html.includes('Email OTP (Passwordless)'), 'LoginPage must render Email OTP mode option');
      assert.ok(html.includes('Password'), 'LoginPage must render Password mode option');
      assert.ok(html.includes('Send Login OTP'), 'LoginPage must render Send Login OTP submit action in default OTP mode');
    });

    test('auth.css defines clean styles for brand badge, OTP input, and mode toggle', () => {
      const cssContent = fs.readFileSync(path.join(srcRoot, 'styles/pages/auth.css'), 'utf-8');

      assert.ok(cssContent.includes('.auth-brand-link'), 'auth.css must define .auth-brand-link');
      assert.ok(cssContent.includes('.auth-brand__badge'), 'auth.css must define .auth-brand__badge');
      assert.ok(cssContent.includes('.auth-mode-toggle'), 'auth.css must define .auth-mode-toggle');
      assert.ok(cssContent.includes('.otp-digit-input'), 'auth.css must define .otp-digit-input');
      assert.ok(cssContent.includes('tabular-nums'), 'auth.css must define tabular-nums on OTP input');
    });
  });
});
