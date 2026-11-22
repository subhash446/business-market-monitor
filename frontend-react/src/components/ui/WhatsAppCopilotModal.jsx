import { useState, useEffect, useId, useMemo, useContext } from 'react';
import { createPortal } from 'react-dom';
import { parseWhatsAppQuote } from '../../api/copilot.api.js';
import { ToastContext } from './Toast.jsx';

/**
 * WhatsAppCopilotModal — Two-Way WhatsApp Quote Capture & Negotiation Copilot (V3-M4).
 */
export function WhatsAppCopilotModal({
  isOpen,
  onClose,
  materials = [],
  initialMaterialId = null,
  onQuoteLogged = null,
}) {
  if (!isOpen) return null;

  return (
    <WhatsAppCopilotModalContent
      isOpen={isOpen}
      onClose={onClose}
      materials={materials}
      initialMaterialId={initialMaterialId}
      onQuoteLogged={onQuoteLogged}
    />
  );
}

function WhatsAppCopilotModalContent({
  isOpen = true,
  onClose,
  materials = [],
  initialMaterialId = null,
  onQuoteLogged = null,
}) {
  const titleId = useId();
  const toastCtx = useContext(ToastContext);
  const showToast = toastCtx?.showToast || (() => {});

  const [rawText, setRawText] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState(initialMaterialId ? String(initialMaterialId) : '');
  const [parsing, setParsing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [copiedDraft, setCopiedDraft] = useState(null); // 'counter' | 'rfq' | null
  const [errorMessage, setErrorMessage] = useState('');

  // Tracked materials list
  const trackedList = useMemo(() => {
    return Array.isArray(materials) ? materials.filter((m) => m.isTracked) : [];
  }, [materials]);

  // Dynamic quick-sample chips
  const sampleChips = useMemo(() => {
    if (trackedList.length > 0) {
      return trackedList.slice(0, 3).map((m, idx) => {
        const unit = m.unit || 'kg';
        const price = idx === 0 ? '123.50' : (idx === 1 ? '98.20' : '2,640');
        const supplier = idx === 0 ? 'Sharma Polymers' : (idx === 1 ? 'Reliance' : 'Indore Mandi');
        return `${m.name} Rs ${price}/${unit} ${supplier}`;
      });
    }
    return [
      'PET Resin Rs 123.50/kg Sharma Polymers',
      'Shrink Film @ 98.20 per kg',
      'Wheat ₹2,640/qtl Indore Mandi',
    ];
  }, [trackedList]);

  // Handle ESC key dismiss
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen && typeof onClose === 'function') {
        onClose();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when open
  useEffect(() => {
    if (!isOpen || typeof document === 'undefined' || !document.body) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, [isOpen]);

  // Reset or initialize when opened
  useEffect(() => {
    if (isOpen) {
      setErrorMessage('');
      setCopiedDraft(null);
      if (initialMaterialId) {
        setSelectedMaterialId(String(initialMaterialId));
      }
    }
  }, [isOpen, initialMaterialId]);

  if (!isOpen) return null;

  async function handleParse(textToParse, matIdOverride = selectedMaterialId) {
    const text = (textToParse != null ? textToParse : rawText).trim();
    if (!text) {
      setErrorMessage('Please paste or type a WhatsApp quote text.');
      return;
    }

    setParsing(true);
    setErrorMessage('');
    try {
      const res = await parseWhatsAppQuote({
        text,
        autoLog: false,
        materialId: matIdOverride ? Number(matIdOverride) : null,
      });

      setParseResult(res);
      if (res?.parsed?.matchedMaterial?.id) {
        setSelectedMaterialId(String(res.parsed.matchedMaterial.id));
      }
      if (!res?.parsed?.isMatch) {
        setErrorMessage(
          res?.parsed?.reason === 'NO_PRICE_FOUND'
            ? 'No valid price found in the pasted text. Please include a quote (e.g. Rs 123.50/kg).'
            : 'Could not match quote. Please verify the text or select a tracked material.'
        );
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to parse WhatsApp quote.');
    } finally {
      setParsing(false);
    }
  }

  async function handleAutoLogQuote() {
    if (!rawText.trim()) return;
    setLogging(true);
    setErrorMessage('');
    try {
      const res = await parseWhatsAppQuote({
        text: rawText.trim(),
        autoLog: true,
        materialId: selectedMaterialId ? Number(selectedMaterialId) : null,
      });

      setParseResult(res);
      showToast({
        type: 'success',
        message: `Quote logged to prices: ₹${res?.loggedPoint?.price}/${res?.drafts?.materialUnit || 'unit'}`,
      });
      if (typeof onQuoteLogged === 'function') {
        onQuoteLogged(res);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to log quote to prices.');
      showToast({
        type: 'error',
        message: err.message || 'Could not log quote.',
      });
    } finally {
      setLogging(false);
    }
  }

  async function handleCopy(text, type) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedDraft(type);
      showToast({ type: 'success', message: `${type === 'counter' ? 'Counter-offer' : 'RFQ'} draft copied to clipboard!` });
      setTimeout(() => setCopiedDraft(null), 3000);
    } catch {
      showToast({ type: 'error', message: 'Failed to copy to clipboard.' });
    }
  }

  const parsed = parseResult?.parsed;
  const drafts = parseResult?.drafts;
  const loggedPoint = parseResult?.loggedPoint;

  const modalMarkup = (
    <div
      className="modal-backdrop modal-backdrop--open modal-backdrop--visible"
      onClick={(e) => {
        if (e.target === e.currentTarget && typeof onClose === 'function') {
          onClose();
        }
      }}
    >
      <div
        className="modal copilot-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          maxWidth: '680px',
          width: '100%',
          margin: 'auto',
          backgroundColor: 'var(--color-bg-base, #09090b)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 'var(--radius-lg, 8px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal__header modal-header" style={{ padding: 'var(--space-4) var(--space-5)' }}>
          <div>
            <h3 id={titleId} className="modal__title modal-title font-semibold" style={{ display: 'flex', alignItems: 'center' }}>
              <i
                className="fa-brands fa-whatsapp text-success"
                style={{ color: '#22c55e', fontSize: '18px', marginRight: '8px' }}
              />
              <span>WhatsApp Quote Copilot &amp; Negotiation Advisor</span>
            </h3>
            <span className="text-xs text-muted" style={{ display: 'block', marginTop: '2px' }}>
              Extract informal supplier quotes, check landed parity benchmarks, and generate counter-offers.
            </span>
          </div>
          <button
            type="button"
            className="btn btn--ghost btn--icon modal__close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={logging || parsing}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        <div className="modal__body modal-body" style={{ maxHeight: '72vh', overflowY: 'auto', padding: 'var(--space-4) var(--space-5)' }}>
          {errorMessage && (
            <div className="alert alert--danger" style={{ marginBottom: 'var(--space-3)', fontSize: 'var(--text-xs)' }}>
              <i className="fa-solid fa-triangle-exclamation mr-1" /> {errorMessage}
            </div>
          )}

          {/* Quick-Sample Chips */}
          <div style={{ marginBottom: 'var(--space-3)' }}>
            <span className="text-xs text-muted" style={{ display: 'block', marginBottom: '6px' }}>
              Try 1-Click Sample Snippet:
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {sampleChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  className="btn btn--sm btn--secondary"
                  style={{ fontSize: '11px', padding: '3px 8px', borderRadius: 'var(--radius-sm)' }}
                  onClick={() => {
                    setRawText(chip);
                    handleParse(chip);
                  }}
                >
                  <i className="fa-regular fa-paste mr-1" /> {chip}
                </button>
              ))}
            </div>
          </div>

          {/* Text Area */}
          <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
            <label className="form-label font-medium" htmlFor="copilot-input-text" style={{ display: 'block', marginBottom: '6px' }}>
              Paste WhatsApp Supplier Chat or Message:
            </label>
            <textarea
              id="copilot-input-text"
              rows={3}
              className="form-control font-mono"
              placeholder='e.g. "PET Resin Rs 123.50/kg Sharma Polymers delivery next Monday"'
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              style={{
                width: '100%',
                backgroundColor: 'var(--color-bg-base, #09090b)',
                color: 'var(--color-text-primary, #fafafa)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                fontSize: '13px',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label htmlFor="material-override-select" className="text-xs text-muted">
                Material Match:
              </label>
              <select
                id="material-override-select"
                className="form-control"
                style={{
                  fontSize: '12px',
                  padding: '4px 8px',
                  height: '30px',
                  backgroundColor: 'var(--color-bg-base, #09090b)',
                  color: 'var(--color-text-primary, #fafafa)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                }}
                value={selectedMaterialId}
                onChange={(e) => {
                  setSelectedMaterialId(e.target.value);
                  if (rawText.trim()) {
                    handleParse(rawText, e.target.value);
                  }
                }}
              >
                <option value="">(Auto-detect from text)</option>
                {trackedList.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.unit})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className={`btn btn--sm btn--primary${parsing ? ' btn--loading' : ''}`}
              disabled={parsing || !rawText.trim()}
              onClick={() => handleParse()}
              style={{ fontSize: '12px', padding: '4px 12px' }}
            >
              {parsing ? 'Parsing…' : 'Analyze Quote'}
            </button>
          </div>

          {/* Parsed Result & Negotiation Drafts Card */}
          {parsed && parsed.isMatch && (
            <div
              style={{
                backgroundColor: 'var(--color-bg-surface, #18181b)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--space-3) var(--space-4)',
                marginBottom: 'var(--space-3)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-2)' }}>
                <span className="text-xs font-semibold" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-primary)' }}>
                  Extracted Quote &amp; Negotiation Bounds
                </span>
                {loggedPoint && (
                  <span className="badge badge--success" style={{ fontSize: '11px' }}>
                    <i className="fa-solid fa-check mr-1" /> Logged to Prices
                  </span>
                )}
              </div>

              {/* Metric Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                <div style={{ padding: '8px', backgroundColor: 'var(--color-bg-base, #09090b)', borderRadius: 'var(--radius-sm)' }}>
                  <span className="text-xs text-muted" style={{ display: 'block' }}>Quoted Rate</span>
                  <strong className="font-mono" style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                    ₹{parsed.rawPrice}/{parsed.rawUnit}
                  </strong>
                  {parsed.supplierName && (
                    <span className="text-xs text-muted" style={{ display: 'block', fontSize: '10px' }}>
                      {parsed.supplierName}
                    </span>
                  )}
                </div>

                <div style={{ padding: '8px', backgroundColor: 'var(--color-bg-base, #09090b)', borderRadius: 'var(--radius-sm)' }}>
                  <span className="text-xs text-muted" style={{ display: 'block' }}>Landed Parity Ref</span>
                  <strong className="font-mono" style={{ fontSize: '14px' }}>
                    {drafts?.benchmarkPrice != null ? `₹${Number(drafts.benchmarkPrice).toFixed(2)}/${drafts.materialUnit}` : 'No Benchmark'}
                  </strong>
                </div>

                <div style={{ padding: '8px', backgroundColor: 'var(--color-bg-base, #09090b)', borderRadius: 'var(--radius-sm)' }}>
                  <span className="text-xs text-muted" style={{ display: 'block' }}>Parity Variance</span>
                  <strong
                    className="font-mono"
                    style={{
                      fontSize: '14px',
                      color: drafts?.variancePercent > 0 ? 'var(--color-danger, #ef4444)' : 'var(--color-success, #22c55e)',
                    }}
                  >
                    {drafts?.variancePercent != null ? `${drafts.variancePercent > 0 ? '+' : ''}${drafts.variancePercent}%` : '—'}
                  </strong>
                </div>

                <div style={{ padding: '8px', backgroundColor: 'var(--color-bg-base, #09090b)', borderRadius: 'var(--radius-sm)' }}>
                  <span className="text-xs text-muted" style={{ display: 'block' }}>Suggested Counter</span>
                  <strong className="font-mono" style={{ fontSize: '14px', color: 'var(--color-accent, #38bdf8)' }}>
                    {drafts?.suggestedCounterLow != null ? `₹${drafts.suggestedCounterLow} – ₹${drafts.suggestedCounterHigh}` : '—'}
                  </strong>
                </div>
              </div>

              {/* Unit conversion note if converted */}
              {drafts?.unitConversion?.unitConversionNote && (
                <div className="alert alert--info" style={{ fontSize: '11px', padding: '4px 8px', marginBottom: '10px' }}>
                  <i className="fa-solid fa-circle-info mr-1" /> {drafts.unitConversion.unitConversionNote}
                </div>
              )}

              {/* Ready-to-send Counter-Offer Draft */}
              {drafts?.counterOfferMessage && (
                <div style={{ marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
                      Ready-to-Send WhatsApp Counter-Offer:
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      style={{ fontSize: '11px', padding: '2px 6px', color: copiedDraft === 'counter' ? 'var(--color-success)' : 'inherit' }}
                      onClick={() => handleCopy(drafts.counterOfferMessage, 'counter')}
                    >
                      <i className={`fa-solid ${copiedDraft === 'counter' ? 'fa-check' : 'fa-copy'} mr-1`} />
                      {copiedDraft === 'counter' ? 'Copied' : 'Copy Draft'}
                    </button>
                  </div>
                  <pre
                    style={{
                      backgroundColor: 'var(--color-bg-base, #09090b)',
                      color: 'var(--color-text-primary, #fafafa)',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '11px',
                      whiteSpace: 'pre-wrap',
                      margin: 0,
                      fontFamily: 'var(--font-mono)',
                      lineHeight: '1.4',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {drafts.counterOfferMessage}
                  </pre>
                </div>
              )}

              {/* Action Buttons: Log Quote + Open in WhatsApp */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                {drafts?.rfqMessage && (
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    style={{ fontSize: '11px', padding: '4px 10px' }}
                    onClick={() => handleCopy(drafts.rfqMessage, 'rfq')}
                  >
                    <i className={`fa-solid ${copiedDraft === 'rfq' ? 'fa-check' : 'fa-file-lines'} mr-1`} />
                    {copiedDraft === 'rfq' ? 'RFQ Copied' : 'Copy RFQ'}
                  </button>
                )}

                {drafts?.waMeLink && (
                  <a
                    href={drafts.waMeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--sm btn--secondary"
                    style={{ fontSize: '11px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                  >
                    <i className="fa-brands fa-whatsapp text-success" />
                    Open in WhatsApp
                  </a>
                )}

                <button
                  type="button"
                  id="copilot-log-quote-btn"
                  className={`btn btn--sm btn--primary${logging ? ' btn--loading' : ''}`}
                  disabled={logging || loggedPoint != null || drafts?.unitConversion?.unitMismatch}
                  onClick={handleAutoLogQuote}
                  style={{ fontSize: '11px', padding: '4px 12px' }}
                >
                  <i className="fa-solid fa-cloud-arrow-up mr-1" />
                  {loggedPoint ? 'Quote Logged' : 'Log Quote to Prices'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal__footer modal-footer" style={{ padding: 'var(--space-3) var(--space-5)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="text-xs text-muted">
            <i className="fa-solid fa-shield-halved mr-1 text-success" />
            Zero-exposure audit trail. No plaintext phone numbers leaked.
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined' && document.body) {
    return createPortal(modalMarkup, document.body);
  }
  return modalMarkup;
}
