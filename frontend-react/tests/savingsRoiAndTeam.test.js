import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, '../src');

describe('V3-M5 — Commercial SaaS Layer (Procurement Savings ROI & Team RBAC)', () => {
  // =========================================================================
  // 1. API Helper Verification (team.api.js & analytics.api.js)
  // =========================================================================
  describe('1. API Clients for Team RBAC & Savings ROI', () => {
    test('team.api.js exports listTeamMembers, inviteTeamMember, acceptTeamInvite, updateTeamMemberRole, revokeTeamMember', () => {
      const apiPath = path.join(srcRoot, 'api/team.api.js');
      const content = fs.readFileSync(apiPath, 'utf-8');

      assert.ok(
        content.includes('export async function listTeamMembers()'),
        'team.api.js must export listTeamMembers()'
      );
      assert.ok(content.includes("get('/team')"), 'listTeamMembers must call GET /team');

      assert.ok(
        content.includes('export async function inviteTeamMember('),
        'team.api.js must export inviteTeamMember()'
      );
      assert.ok(
        content.includes("post('/team/invite'"),
        'inviteTeamMember must call POST /team/invite'
      );

      assert.ok(
        content.includes('export async function acceptTeamInvite('),
        'team.api.js must export acceptTeamInvite()'
      );
      assert.ok(
        content.includes("post('/team/accept-invite'"),
        'acceptTeamInvite must call POST /team/accept-invite'
      );

      assert.ok(
        content.includes('export async function updateTeamMemberRole('),
        'team.api.js must export updateTeamMemberRole()'
      );
      assert.ok(
        content.includes("patch(`/team/members/${memberId}/role`"),
        'updateTeamMemberRole must call PATCH /team/members/:memberId/role'
      );

      assert.ok(
        content.includes('export async function revokeTeamMember('),
        'team.api.js must export revokeTeamMember()'
      );
      assert.ok(
        content.includes("del(`/team/members/${memberId}`)"),
        'revokeTeamMember must call DELETE /team/members/:memberId'
      );
    });

    test('analytics.api.js exports getSavingsRoi targeting GET /analytics/savings-roi', () => {
      const apiPath = path.join(srcRoot, 'api/analytics.api.js');
      const content = fs.readFileSync(apiPath, 'utf-8');

      assert.ok(
        content.includes('export async function getSavingsRoi()'),
        'analytics.api.js must export getSavingsRoi()'
      );
      assert.ok(
        content.includes("get('/analytics/savings-roi')"),
        'getSavingsRoi must call GET /analytics/savings-roi'
      );
    });
  });

  // =========================================================================
  // 2. SettingsPage.jsx Structure & Tabs
  // =========================================================================
  describe('2. SettingsPage.jsx Structure & Team RBAC', () => {
    test('SettingsPage renders Profile and Team tabs, invite form, and member table', () => {
      const pagePath = path.join(srcRoot, 'pages/SettingsPage.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');

      assert.ok(
        content.includes('tab-profile-btn') && content.includes('tab-team-btn'),
        'SettingsPage must render Profile and Team tabs'
      );
      assert.ok(
        content.includes('settings-role-banner--viewer'),
        'SettingsPage must contain viewer-specific role banner'
      );
      assert.ok(
        content.includes('invite-email-input') && content.includes('invite-role-select'),
        'SettingsPage must contain invite email input and role select'
      );
      assert.ok(
        content.includes('team-members-table'),
        'SettingsPage must contain team members table'
      );
      assert.ok(
        content.includes('handleSendDigestTest'),
        'SettingsPage must contain test digest trigger'
      );
    });
  });

  // =========================================================================
  // 3. AcceptInvitePage.jsx Structure & Token Flow
  // =========================================================================
  describe('3. AcceptInvitePage.jsx Structure', () => {
    test('AcceptInvitePage renders token input, accept button, and login redirect', () => {
      const pagePath = path.join(srcRoot, 'pages/AcceptInvitePage.jsx');
      const content = fs.readFileSync(pagePath, 'utf-8');

      assert.ok(
        content.includes('accept-token-input'),
        'AcceptInvitePage must contain token input'
      );
      assert.ok(
        content.includes('accept-invite-submit-btn'),
        'AcceptInvitePage must contain accept invitation submit button'
      );
      assert.ok(
        content.includes('searchParams.get(\'token\')'),
        'AcceptInvitePage must parse token from URL search params'
      );
    });
  });

  // =========================================================================
  // 4. DashboardPage.jsx Savings ROI KPI Card
  // =========================================================================
  describe('4. DashboardPage.jsx Procurement Savings ROI Card', () => {
    test('DashboardPage renders Procurement Savings ROI KPI card with monthly metrics', () => {
      const dashPath = path.join(srcRoot, 'pages/DashboardPage.jsx');
      const content = fs.readFileSync(dashPath, 'utf-8');

      assert.ok(
        content.includes('kpi-savings-roi'),
        'DashboardPage must contain kpi-savings-roi card'
      );
      assert.ok(
        content.includes('Procurement Savings ROI'),
        'DashboardPage must display "Procurement Savings ROI" label'
      );
      assert.ok(
        content.includes('getSavingsRoi'),
        'DashboardPage must invoke getSavingsRoi API'
      );
      assert.ok(
        content.includes('totalMonthlySavingsInr'),
        'DashboardPage must display totalMonthlySavingsInr'
      );
    });
  });

  // =========================================================================
  // 5. Routing & Sidebar Integration
  // =========================================================================
  describe('5. App.jsx & Sidebar.jsx Route Integration', () => {
    test('App.jsx mounts /settings and /accept-invite routes', () => {
      const appPath = path.join(srcRoot, 'App.jsx');
      const content = fs.readFileSync(appPath, 'utf-8');

      assert.ok(
        content.includes('path="/settings"'),
        'App.jsx must mount /settings route'
      );
      assert.ok(
        content.includes('path="/accept-invite"'),
        'App.jsx must mount /accept-invite route'
      );
    });

    test('Sidebar.jsx settings button routes to /settings', () => {
      const sidePath = path.join(srcRoot, 'components/layout/Sidebar.jsx');
      const content = fs.readFileSync(sidePath, 'utf-8');

      assert.ok(
        content.includes("navigate('/settings')"),
        'Sidebar.jsx #nav-settings-btn must navigate to /settings'
      );
    });
  });
});
