import { useState } from 'react';
import {
  DIGEST_PREVIEW_SAMPLE,
  SAMPLE_DATA_TAG,
} from '../../data/landingSample.js';
import { SignalPill } from './SignalPill.jsx';

/**
 * DigestPreview — Multi-Channel Morning Procurement Digest Preview
 *
 * Authentic WhatsApp Business chat chrome vs Executive Email inbox chrome
 * (no decorative left border stripes, no unowned custom email domains).
 * Deterministic SSR: Uses fixed date string "Tue 17 Nov · 7:00 AM".
 */
export function DigestPreview({ initialChannel = 'whatsapp' }) {
  const [channel, setChannel] = useState(
    initialChannel === 'email' ? 'email' : 'whatsapp'
  );

  const { fixedDateString, recipient, title, materials } = DIGEST_PREVIEW_SAMPLE;

  const digestBody = (
    <>
      <div className="lp-bubble-heading">
        <span className="lp-bubble-title">{title}</span>
        {channel === 'whatsapp' && (
          <span className="lp-bubble-recipient font-mono">{recipient}</span>
        )}
      </div>

      <div className="lp-bubble-materials">
        {materials.map((m) => (
          <div key={m.name} className="lp-bubble-material-item">
            <div className="lp-bubble-mat-top">
              <span className="lp-bubble-mat-name">{m.name}</span>
              <SignalPill signal={m.action} />
            </div>

            <div className="lp-bubble-mat-prices font-mono">
              <span>Benchmark: {m.benchmark}</span>
              {m.supplierQuote && (
                <span className="lp-bubble-mat-supplier">
                  Quote: {m.supplierQuote} ({m.variance})
                </span>
              )}
            </div>

            <p className="lp-bubble-mat-urgency">{m.urgency}</p>
          </div>
        ))}
      </div>

      <div className="lp-bubble-footer font-mono">
        <span>View full trend telemetry in dashboard</span>
        <span aria-hidden="true">→</span>
      </div>
    </>
  );

  return (
    <div className="lp-phone-wrapper" id="digest-preview">
      {/* Channel Switcher */}
      <div className="lp-channel-switch" role="tablist" aria-label="Digest delivery channel">
        <button
          type="button"
          role="tab"
          aria-selected={channel === 'whatsapp'}
          className={`lp-channel-btn ${
            channel === 'whatsapp' ? 'lp-channel-btn--active' : ''
          }`}
          onClick={() => setChannel('whatsapp')}
        >
          <i className="fa-brands fa-whatsapp" aria-hidden="true" />
          <span>WhatsApp Digest</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={channel === 'email'}
          className={`lp-channel-btn ${
            channel === 'email' ? 'lp-channel-btn--active' : ''
          }`}
          onClick={() => setChannel('email')}
        >
          <i className="fa-solid fa-envelope" aria-hidden="true" />
          <span>Email Digest</span>
        </button>
      </div>

      {/* Phone Hardware Mockup Frame */}
      <div className="lp-phone-frame">
        <div className="lp-phone-notch" aria-hidden="true">
          <div className="lp-phone-speaker" />
          <div className="lp-phone-camera" />
        </div>

        <div className="lp-phone-screen">
          <div className="lp-phone-app-bar">
            <div
              className={`lp-phone-status-dot ${
                channel === 'email' ? 'lp-phone-status-dot--email' : ''
              }`}
              aria-hidden="true"
            />
            <div className="lp-phone-app-info">
              <span className="lp-phone-sender">
                {channel === 'whatsapp' ? 'BMM Procurement Desk' : 'Morning Brief Inbox'}
              </span>
              <span className="lp-phone-time font-mono">{fixedDateString}</span>
            </div>
            <span className="lp-sample-tag">{SAMPLE_DATA_TAG}</span>
          </div>

          <div className="lp-phone-messages">
            {channel === 'whatsapp' ? (
              <div className="lp-wa-bubble" data-testid="digest-whatsapp-view">
                {digestBody}
                <div className="lp-wa-delivery-meta">
                  <span>07:00 AM</span>
                  <span className="lp-wa-ticks" aria-label="Delivered">✓✓</span>
                </div>
              </div>
            ) : (
              <div className="lp-mail-card" data-testid="digest-email-view">
                <div className="lp-mail-header">
                  <div className="lp-mail-meta-line">
                    <span>From:</span>
                    <strong>Business Market Monitor</strong>
                  </div>
                  <div className="lp-mail-subject">
                    Subject: Morning Procurement Digest · Tue 17 Nov
                  </div>
                </div>
                <div className="lp-mail-body">{digestBody}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
