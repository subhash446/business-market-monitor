/**
 * SettingsPage — Workspace Profile & Multi-User Team RBAC Management (V3-M5).
 * Business Market Monitor — React frontend
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { getBusiness, updateBusiness, sendDigestNow } from '../api/business.api.js';
import {
  listTeamMembers,
  inviteTeamMember,
  updateTeamMemberRole,
  revokeTeamMember,
} from '../api/team.api.js';
import { isEmail } from '../utils/validate.js';
import { formatDateTime, getInitialsFromEmail } from '../utils/format.js';
import { EmptyState } from '../components/ui/EmptyState.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog.jsx';
import { PricingPlansSection } from '../components/billing/PricingPlansSection.jsx';
import '../styles/pages/settings.css';

const DIGEST_VALUES = ['DAILY', 'WEEKLY', 'MONTHLY'];
const DIGEST_CHANNELS = ['EMAIL', 'WHATSAPP', 'BOTH'];

export function SettingsPage() {
  const { user, business: cachedBusiness, setBusiness } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState('profile'); // 'profile' | 'team' | 'billing'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [digestSending, setDigestSending] = useState(false);

  // Business profile form state
  const [profileForm, setProfileForm] = useState({
    name: '',
    contactEmail: '',
    contactPhone: '',
    address: '',
    newsDigestEnabled: false,
    newsDigestFrequency: 'WEEKLY',
    newsDigestChannel: 'EMAIL',
    industryName: '',
    lastDigestSentAt: null,
  });
  const [profileErrors, setProfileErrors] = useState({});

  // Team state
  const [members, setMembers] = useState([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', role: 'VIEWER' });
  const [inviting, setInviting] = useState(false);
  const [lastInviteLink, setLastInviteLink] = useState(null);

  // Revoke dialog state
  const [revokeTarget, setRevokeTarget] = useState(null);

  const currentRole = cachedBusiness?.businessRole || user?.businessRole || 'OWNER';
  const isOwner = currentRole === 'OWNER';
  const isViewer = currentRole === 'VIEWER';

  // Load business profile on mount without synchronous pre-await setState
  useEffect(() => {
    let cancelled = false;
    getBusiness()
      .then((biz) => {
        if (cancelled) return;
        setBusiness(biz);
        setProfileForm({
          name: biz.name || '',
          contactEmail: biz.contactEmail || '',
          contactPhone: biz.contactPhone || '',
          address: biz.address || '',
          newsDigestEnabled: !!biz.newsDigestEnabled,
          newsDigestFrequency: DIGEST_VALUES.includes(biz.newsDigestFrequency)
            ? biz.newsDigestFrequency
            : 'WEEKLY',
          newsDigestChannel: DIGEST_CHANNELS.includes(biz.newsDigestChannel)
            ? biz.newsDigestChannel
            : 'EMAIL',
          industryName: biz.industryName || '',
          lastDigestSentAt: biz.lastDigestSentAt || null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          showToast({ type: 'error', message: 'Failed to load business profile' });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load team members explicitly on Team tab switch or mutation
  const loadMembers = async () => {
    setTeamLoading(true);
    try {
      const res = await listTeamMembers();
      setMembers(res.members || []);
    } catch {
      showToast({ type: 'error', message: 'Failed to load team members' });
    } finally {
      setTeamLoading(false);
    }
  };

  const handleSelectTab = (tab) => {
    setActiveTab(tab);
    if (tab === 'team') {
      void loadMembers();
    }
  };

  // Business profile change
  const handleProfileChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProfileForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
    if (profileErrors[name]) {
      setProfileErrors((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
    }
  };

  // Submit business profile update
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    if (isViewer) {
      showToast({ type: 'error', message: 'Viewers have read-only permissions.' });
      return;
    }

    const errors = {};
    if (!profileForm.name.trim() || profileForm.name.trim().length < 2) {
      errors.name = 'Business name is required (min 2 characters).';
    }
    if (profileForm.contactEmail && !isEmail(profileForm.contactEmail).valid) {
      errors.contactEmail = 'Please enter a valid email address.';
    }
    if (Object.keys(errors).length > 0) {
      setProfileErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const updated = await updateBusiness({
        name: profileForm.name.trim(),
        contactEmail: profileForm.contactEmail.trim() || undefined,
        contactPhone: profileForm.contactPhone.trim() || undefined,
        address: profileForm.address.trim() || undefined,
        newsDigestEnabled: profileForm.newsDigestEnabled,
        newsDigestFrequency: profileForm.newsDigestFrequency,
        newsDigestChannel: profileForm.newsDigestChannel,
      });
      setBusiness(updated);
      showToast({ type: 'success', message: 'Business settings updated.' });
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to update settings.' });
    } finally {
      setSaving(false);
    }
  };

  // Trigger test digest
  const handleSendDigestTest = async () => {
    setDigestSending(true);
    try {
      await sendDigestNow();
      showToast({ type: 'success', message: 'Test digest dispatched successfully.' });
      const updated = await getBusiness();
      setBusiness(updated);
      setProfileForm((prev) => ({ ...prev, lastDigestSentAt: updated.lastDigestSentAt }));
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to send test digest.' });
    } finally {
      setDigestSending(false);
    }
  };

  // Invite member
  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.email.includes('@')) {
      showToast({ type: 'error', message: 'Please enter a valid colleague email address.' });
      return;
    }

    setInviting(true);
    try {
      const res = await inviteTeamMember({
        email: inviteForm.email.trim(),
        role: inviteForm.role,
      });
      showToast({ type: 'success', message: `Invitation sent to ${inviteForm.email}` });
      setLastInviteLink(res.inviteLink ? `${window.location.origin}${res.inviteLink}` : null);
      setInviteForm({ email: '', role: 'VIEWER' });
      await loadMembers();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to send invitation.' });
    } finally {
      setInviting(false);
    }
  };

  // Change role
  const handleRoleChange = async (memberId, newRole) => {
    try {
      await updateTeamMemberRole(memberId, newRole);
      showToast({ type: 'success', message: 'Member role updated.' });
      await loadMembers();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to update role.' });
    }
  };

  // Revoke member confirmed
  const handleRevokeConfirmed = async () => {
    if (!revokeTarget) return;
    try {
      await revokeTeamMember(revokeTarget.id);
      showToast({ type: 'success', message: 'Member access revoked.' });
      setRevokeTarget(null);
      await loadMembers();
    } catch (err) {
      showToast({ type: 'error', message: err.message || 'Failed to revoke member.' });
    }
  };

  // Copy link
  const handleCopyLink = () => {
    if (!lastInviteLink) return;
    navigator.clipboard.writeText(lastInviteLink);
    showToast({ type: 'success', message: 'Invite link copied to clipboard!' });
  };

  return (
    <div className="page-container">
      {/* Header */}
      <div className="settings-header">
        <h1 className="settings-header__title">Workspace Settings</h1>
        <p className="settings-header__subtitle">
          Manage your company profile, intelligence digests, and team member permissions.
        </p>
      </div>

      {/* Role Banner */}
      {isViewer ? (
        <div className="settings-role-banner settings-role-banner--viewer" role="status">
          <i className="fa-solid fa-eye" aria-hidden="true" />
          <span>
            You are signed in as a <strong>VIEWER</strong>. You have read-only access. Contact a workspace Owner to modify company profiles or invite team members.
          </span>
        </div>
      ) : (
        <div className="settings-role-banner" role="status">
          <i className="fa-solid fa-shield-halved" aria-hidden="true" />
          <span>
            You are signed in as an <strong>{currentRole}</strong> of <strong>{cachedBusiness?.name || profileForm.name || 'this workspace'}</strong>.
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="settings-tabs" role="tablist" aria-label="Workspace settings sections">
        <button
          type="button"
          role="tab"
          id="tab-profile-btn"
          aria-selected={activeTab === 'profile'}
          aria-controls="settings-panel-profile"
          className={`settings-tab-btn${activeTab === 'profile' ? ' settings-tab-btn--active' : ''}`}
          onClick={() => handleSelectTab('profile')}
        >
          <i className="fa-solid fa-building" aria-hidden="true" />
          <span>Business Profile &amp; Digest</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-team-btn"
          aria-selected={activeTab === 'team'}
          aria-controls="settings-panel-team"
          className={`settings-tab-btn${activeTab === 'team' ? ' settings-tab-btn--active' : ''}`}
          onClick={() => handleSelectTab('team')}
        >
          <i className="fa-solid fa-users" aria-hidden="true" />
          <span>Team &amp; Workspace RBAC</span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-billing-btn"
          aria-selected={activeTab === 'billing'}
          aria-controls="settings-panel-billing"
          className={`settings-tab-btn${activeTab === 'billing' ? ' settings-tab-btn--active' : ''}`}
          onClick={() => handleSelectTab('billing')}
        >
          <i className="fa-solid fa-credit-card" aria-hidden="true" />
          <span>Plans &amp; Billing</span>
        </button>
      </div>

      {/* Tab 1: Profile & Digest */}
      {activeTab === 'profile' && (
        <div
          id="settings-panel-profile"
          role="tabpanel"
          aria-labelledby="tab-profile-btn"
          className="settings-card"
        >
          <h2 className="settings-card__title">Company Information &amp; Intelligence Digest</h2>
          <p className="settings-card__subtitle">
            Configure company details and delivery preferences for automated procurement intelligence.
          </p>

          {loading ? (
            <Skeleton type="panel" rows={6} />
          ) : (
            <form onSubmit={handleProfileSubmit} noValidate>
              <div className="form-group">
                <label className="form-label" htmlFor="settings-industry">
                  Industry (System Template)
                </label>
                <input
                  type="text"
                  id="settings-industry"
                  className="form-control form-control--readonly"
                  readOnly
                  value={profileForm.industryName || 'Standard Industrial'}
                />
              </div>

              <div className="form-group">
                <label className="form-label form-label--required" htmlFor="settings-name">
                  Company Name
                </label>
                <input
                  type="text"
                  id="settings-name"
                  name="name"
                  disabled={isViewer}
                  className={`form-control${profileErrors.name ? ' form-control--error' : ''}`}
                  value={profileForm.name}
                  onChange={handleProfileChange}
                  placeholder="e.g. Apex Polymers Pvt Ltd"
                  required
                />
                {profileErrors.name && (
                  <p className="form-error form-error--visible">{profileErrors.name}</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="settings-email">
                  Procurement Contact Email
                </label>
                <input
                  type="email"
                  id="settings-email"
                  name="contactEmail"
                  disabled={isViewer}
                  className={`form-control${profileErrors.contactEmail ? ' form-control--error' : ''}`}
                  value={profileForm.contactEmail}
                  onChange={handleProfileChange}
                  placeholder="procurement@company.com"
                />
                {profileErrors.contactEmail && (
                  <p className="form-error form-error--visible">{profileErrors.contactEmail}</p>
                )}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="settings-phone">
                  Contact Phone (WhatsApp Alerts)
                </label>
                <input
                  type="tel"
                  id="settings-phone"
                  name="contactPhone"
                  disabled={isViewer}
                  className="form-control"
                  value={profileForm.contactPhone}
                  onChange={handleProfileChange}
                  placeholder="+91 98765 43210"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="settings-address">
                  Factory / Office Address
                </label>
                <textarea
                  id="settings-address"
                  name="address"
                  disabled={isViewer}
                  className="form-control form-control--textarea"
                  rows={2}
                  value={profileForm.address}
                  onChange={handleProfileChange}
                  placeholder="Plot 42, GIDC Estate, Ahmedabad, Gujarat"
                />
              </div>

              {/* News Digest Section */}
              <div className="settings-digest-section">
                <label className="settings-check" htmlFor="settings-digest-enabled">
                  <input
                    type="checkbox"
                    id="settings-digest-enabled"
                    name="newsDigestEnabled"
                    disabled={isViewer}
                    className="settings-check__input"
                    checked={profileForm.newsDigestEnabled}
                    onChange={handleProfileChange}
                  />
                  <span className="settings-check__label">
                    <strong>Enable Periodic Procurement &amp; News Digest</strong>
                  </span>
                </label>

                <div className="settings-digest-grid">
                  <div className="form-group">
                    <label className="form-label" htmlFor="settings-digest-freq">
                      Digest Frequency
                    </label>
                    <select
                      id="settings-digest-freq"
                      name="newsDigestFrequency"
                      disabled={isViewer || !profileForm.newsDigestEnabled}
                      className="form-control"
                      value={profileForm.newsDigestFrequency}
                      onChange={handleProfileChange}
                    >
                      <option value="DAILY">Daily</option>
                      <option value="WEEKLY">Weekly</option>
                      <option value="MONTHLY">Monthly</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" htmlFor="settings-digest-channel">
                      Delivery Channel
                    </label>
                    <select
                      id="settings-digest-channel"
                      name="newsDigestChannel"
                      disabled={isViewer || !profileForm.newsDigestEnabled}
                      className="form-control"
                      value={profileForm.newsDigestChannel}
                      onChange={handleProfileChange}
                    >
                      <option value="EMAIL">Email only</option>
                      <option value="WHATSAPP">WhatsApp only</option>
                      <option value="BOTH">Both Email &amp; WhatsApp</option>
                    </select>
                  </div>
                </div>

                {profileForm.lastDigestSentAt && (
                  <p className="settings-digest-timestamp">
                    <i className="fa-regular fa-clock mr-1" aria-hidden="true" /> Last digest dispatched:{' '}
                    {formatDateTime(profileForm.lastDigestSentAt)}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="settings-profile-actions">
                <button
                  type="submit"
                  id="bs-save-btn"
                  className={`btn btn--primary${saving ? ' btn--loading' : ''}`}
                  disabled={saving || isViewer}
                >
                  Save Profile Settings
                </button>

                {isOwner && profileForm.newsDigestEnabled && (
                  <button
                    type="button"
                    id="bs-send-digest-btn"
                    className={`btn btn--ghost${digestSending ? ' btn--loading' : ''}`}
                    disabled={digestSending}
                    onClick={handleSendDigestTest}
                  >
                    <i className="fa-solid fa-paper-plane mr-2" aria-hidden="true" />
                    Dispatch Test Digest Now
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      )}

      {/* Tab 2: Team RBAC */}
      {activeTab === 'team' && (
        <div
          id="settings-panel-team"
          role="tabpanel"
          aria-labelledby="tab-team-btn"
          className="settings-card"
        >
          <h2 className="settings-card__title">Team Members &amp; Access Control</h2>
          <p className="settings-card__subtitle">
            Invite team members and configure Role-Based Access Control (RBAC) across your procurement workspace.
          </p>

          {/* Invite Form (Owner only) */}
          {isOwner && (
            <form onSubmit={handleInviteSubmit} className="settings-invite-form">
              <div className="form-group settings-form-group-flush">
                <label className="form-label" htmlFor="invite-email-input">
                  Colleague Email Address
                </label>
                <input
                  type="email"
                  id="invite-email-input"
                  placeholder="buyer@yourcompany.com"
                  className="form-control"
                  value={inviteForm.email}
                  onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="form-group settings-form-group-flush">
                <label className="form-label" htmlFor="invite-role-select">
                  Assigned Role
                </label>
                <select
                  id="invite-role-select"
                  className="form-control"
                  value={inviteForm.role}
                  onChange={(e) => setInviteForm({ ...inviteForm, role: e.target.value })}
                >
                  <option value="VIEWER">VIEWER (Read-Only)</option>
                  <option value="PURCHASE_MANAGER">PURCHASE_MANAGER (Procurement &amp; Quotes)</option>
                  <option value="OWNER">OWNER (Full Admin)</option>
                </select>
              </div>

              <button
                type="submit"
                id="invite-submit-btn"
                className={`btn btn--primary${inviting ? ' btn--loading' : ''}`}
                disabled={inviting}
              >
                <i className="fa-solid fa-user-plus mr-1" aria-hidden="true" /> Send Invite
              </button>
            </form>
          )}

          {/* Copy Invite Link Card */}
          {lastInviteLink && (
            <div className="settings-invite-link-card">
              <span className="settings-invite-link-url">{lastInviteLink}</span>
              <button
                type="button"
                className="btn btn--sm btn--primary"
                onClick={handleCopyLink}
              >
                <i className="fa-regular fa-copy mr-1" aria-hidden="true" /> Copy Link
              </button>
            </div>
          )}

          {/* Members Table */}
          {teamLoading ? (
            <Skeleton type="panel" rows={4} />
          ) : members.length === 0 ? (
            <EmptyState
              icon="fa-solid fa-users"
              title="No team members yet"
              message="Workspace members and pending invitations will appear here once invited."
            />
          ) : (
            <div className="settings-table-wrapper">
              <table className="settings-table" id="team-members-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined / Invited</th>
                    {isOwner && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const initials = getInitialsFromEmail(m.memberEmail || m.invitedEmail || '');
                    const isCurrentUser = Number(m.userId) === Number(user?.userId);
                    return (
                      <tr key={m.id}>
                        <td>
                          <div className="settings-member-cell">
                            <div className="settings-member-avatar">{initials}</div>
                            <div>
                              <span className="settings-member-name">
                                {m.memberName || m.invitedEmail.split('@')[0]}
                                {isCurrentUser && ' (You)'}
                              </span>
                              <span className="settings-member-email">
                                {m.memberEmail || m.invitedEmail}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {isOwner && !isCurrentUser ? (
                            <select
                              className="settings-role-select"
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.id, e.target.value)}
                            >
                              <option value="OWNER">OWNER</option>
                              <option value="PURCHASE_MANAGER">PURCHASE_MANAGER</option>
                              <option value="VIEWER">VIEWER</option>
                            </select>
                          ) : (
                            <span
                              className={`badge ${
                                m.role === 'OWNER'
                                  ? 'badge--info'
                                  : m.role === 'PURCHASE_MANAGER'
                                  ? 'badge--warning'
                                  : 'badge--neutral'
                              }`}
                            >
                              {m.role}
                            </span>
                          )}
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              m.status === 'ACTIVE'
                                ? 'badge--success'
                                : m.status === 'INVITED'
                                ? 'badge--warning'
                                : 'badge--danger'
                            }`}
                          >
                            {m.status}
                          </span>
                        </td>
                        <td className="settings-member-timestamp">
                          {m.acceptedAt
                            ? formatDateTime(m.acceptedAt)
                            : m.createdAt
                            ? `Invited ${formatDateTime(m.createdAt)}`
                            : '—'}
                        </td>
                        {isOwner && (
                          <td>
                            {m.status !== 'REVOKED' && !isCurrentUser && (
                              <button
                                type="button"
                                className="btn btn--sm btn--ghost settings-revoke-btn"
                                onClick={() => setRevokeTarget(m)}
                              >
                                Revoke
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Plans & Billing */}
      {activeTab === 'billing' && (
        <div
          id="settings-panel-billing"
          role="tabpanel"
          aria-labelledby="tab-billing-btn"
          className="settings-billing-tab"
          data-testid="settings-billing-tab"
        >
          {/* Top Status Card */}
          <div className="settings-card settings-billing-hero">
            <div className="settings-billing-hero__row">
              <div>
                <div className="settings-billing-hero__badges">
                  <span className="badge badge--success settings-billing-active-badge">
                    ACTIVE WORKSPACE
                  </span>
                  <span className="settings-billing-workspace-name">
                    {cachedBusiness?.name || profileForm.name || 'Workspace'}
                  </span>
                </div>
                <h2 className="settings-card__title settings-billing-hero__title">
                  Current Plan: Early Access — All Pro Features Unlocked at ₹0
                </h2>
                <p className="settings-card__subtitle settings-billing-hero__subtitle">
                  Automated subscription billing is launching soon. Your team currently has unrestricted access to all multi-material tracking, WhatsApp Copilot, and Landed-Cost features.
                </p>
              </div>
              <div className="settings-billing-hero__status">
                <span className="badge settings-early-adopter-badge">
                  <i className="fa-solid fa-bolt mr-1" aria-hidden="true" /> Early Adopter Status
                </span>
              </div>
            </div>
          </div>

          {/* Reusable 3-Column Pricing Grid */}
          <PricingPlansSection
            mode="settings"
            currentWorkspaceName={cachedBusiness?.name || profileForm.name}
            userEmail={user?.email}
          />
        </div>
      )}

      {/* Revoke Member Dialog */}
      <ConfirmDialog
        isOpen={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        onConfirm={handleRevokeConfirmed}
        title="Revoke Member Access"
        message={`Are you sure you want to revoke access for ${revokeTarget?.memberEmail || revokeTarget?.invitedEmail}? They will no longer have access to this workspace.`}
        confirmLabel="Revoke Access"
        cancelLabel="Cancel"
        danger={true}
      />
    </div>
  );
}
