import { useState } from 'react';
import {
  DIGEST_PREVIEW_SAMPLE,
  SAMPLE_DATA_TAG,
} from '../../data/landingSample.js';
import { SignalPill } from './SignalPill.jsx';

/**
 * DigestPreview — Crisp CSS Phone Mockup Previewing Multi-Channel Morning Digest
 *
 * Deterministic SSR: Uses fixed date string "Tue 17 Nov · 7:00 AM".
 * Never calls new Date() or Math.random().
 */
export function DigestPreview() {
  const [channel, setChannel] = useState('whatsapp');

  const { fixedDateString, recipient, title, materials } = DIGEST_PREVIEW_SAMPLE;

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
          <i className="fa-brands fa-whatsapp mr-1.5" aria-hidden="true" />
          WhatsApp Digest
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
          <i className="fa-solid fa-envelope mr-1.5" aria-hidden="true" />
          Email Digest
        </button>
      </div>

      {/* Phone Hardware Mockup Frame */}
      <div className="lp-phone-frame">
        {/* Speaker / Camera Notch */}
        <div className="lp-phone-notch">
          <div className="lp-phone-speaker" />
          <div className="lp-phone-camera" />
        </div>

        {/* Screen Content */}
        <div className="lp-phone-screen">
          {/* Header Bar */}
          <div className="lp-phone-app-bar">
            <div className="lp-phone-status-dot" aria-hidden="true" />
            <div className="lp-phone-app-info">
              <span className="lp-phone-sender">BMM Procurement Desk</span>
              <span className="lp-phone-time font-mono">{fixedDateString}</span>
            </div>
            <span className="lp-sample-tag">{SAMPLE_DATA_TAG}</span>
          </div>

          {/* Message Bubble Container */}
          <div className="lp-phone-messages">
            <div
              className={`lp-phone-bubble ${
                channel === 'whatsapp'
                  ? 'lp-phone-bubble--whatsapp'
                  : 'lp-phone-bubble--email'
              }`}
            >
              <div className="lp-bubble-heading">
                <span className="lp-bubble-title">{title}</span>
                <span className="lp-bubble-recipient font-mono">{recipient}</span>
              </div>

              <div className="lp-bubble-materials">
                {materials.map((m, idx) => (
                  <div key={idx} className="lp-bubble-material-item">
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
                <span className="lp-bubble-footer__arrow">→</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
