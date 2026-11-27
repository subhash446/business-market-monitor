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
  readOnly = false,
}) {
  if (!isOpen) return null;

  const modalKey = initialMaterialId ? String(initialMaterialId) : 'auto';
  return (
    <WhatsAppCopilotModalContent
      key={modalKey}
      onClose={onClose}
      materials={materials}
      initialMaterialId={initialMaterialId}
      onQuoteLogged={onQuoteLogged}
      readOnly={readOnly}
    />
  );
}

function WhatsAppCopilotModalContent({
  onClose,
  materials = [],
  initialMaterialId = null,
  onQuoteLogged = null,
  readOnly = false,
}) {
  const titleId = useId();
  const toastCtx = useContext(ToastContext);
  const showToast = toastCtx?.showToast || (() => {});

  const [rawText, setRawText] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState(
    initialMaterialId ? String(initialMaterialId) : ''
  );
  const [parsing, setParsing] = useState(false);
  const [logging, setLogging] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [copiedDraft, setCopiedDraft] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  const trackedList = useMemo(() => {
    return Array.isArray(materials) ? materials.filter((m) => m.isTracked) : [];
  }, [materials]);

  const sampleChips = useMemo(() => {
    if (trackedList.length > 0) {
      return trackedList.slice(0, 3).map((m, idx) => {
        const unit = m.unit || 'kg';
        const price = idx === 0 ? '123.50' : idx === 1 ? '98.20' : '2,640';
        const supplier = idx === 0 ? 'Sharma Polymers' : idx === 1 ? 'Reliance' : 'Indore Mandi';
        return `${m.name} Rs ${price}/${unit} ${supplier}`;
      });
    }
    return [
      'PET Resin Rs 123.50/kg Sharma Polymers',
      'Shrink Film @ 98.20 per kg',
      'Wheat ₹2,640/qtl Indore Mandi',
    ];
  }, [trackedList]);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && typeof onClose === 'function') {
        onClose();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow || '';
    };
  }, []);

  async function handleParse(textToParse, matIdOverride = selectedMaterialId) {
    if (readOnly) {
      setErrorMessage('Viewers have read-only permissions.');
      return;
    }
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
    if (readOnly) {
      setErrorMessage('Viewers have read-only permissions.');
      return;
    }
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
      showToast({
        type: 'success',
        message: `${type === 'counter' ? 'Counter-offer' : 'RFQ'} draft copied to clipboard!`,
      });
      window.setTimeout(() => setCopiedDraft(null), 3000);
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
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal__header materials-modal__header">
          <div>
            <h3 id={titleId} className="modal__title materials-modal__title">
              <i className="fa-brands fa-whatsapp text-success materials-modal__icon--whatsapp" aria-hidden="true" />
              <span>WhatsApp Quote Copilot &amp; Negotiation Advisor</span>
            </h3>
            <span className="materials-modal__subtitle">
              Extract informal supplier quotes, check landed parity benchmarks, and generate counter-offers.
            </span>
          </div>
          <button
            type="button"
            className="modal__close"
            onClick={onClose}
            aria-label="Close dialog"
            disabled={logging || parsing}
          >
            <i className="fa-solid fa-xmark" aria-hidden="true" />
          </button>
        </div>

        <div className="modal__body materials-modal__body">
          {readOnly && (
            <div className="alert-banner alert-banner--warning" role="status">
              <i className="fa-solid fa-eye" aria-hidden="true" />
              <span className="alert-banner__message">
                Read-only viewer role: parsing and logging supplier quotes is disabled.
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="form-alert form-alert--error form-alert--visible materials-modal__alert" role="alert">
              <i className="fa-solid fa-triangle-exclamation mr-1" aria-hidden="true" />
              <span className="form-alert__message">{errorMessage}</span>
            </div>
          )}

          <div className="materials-modal__presets-wrap">
            <span className="text-xs text-muted mb-2 d-block">
              Try 1-Click Sample Snippet:
            </span>
            <div className="materials-modal__chip-row">
              {sampleChips.map((chip, idx) => (
                <button
                  key={idx}
                  type="button"
                  disabled={readOnly || parsing}
                  className="btn btn--sm btn--secondary materials-modal__chip-btn"
                  onClick={() => {
                    setRawText(chip);
                    handleParse(chip);
                  }}
                >
                  <i className="fa-regular fa-paste mr-1" aria-hidden="true" /> {chip}
                </button>
              ))}
            </div>
          </div>

          <div className="form-group mb-3">
            <label className="form-label" htmlFor="copilot-input-text">
              Paste WhatsApp Supplier Chat or Message:
            </label>
            <textarea
              id="copilot-input-text"
              rows={3}
              disabled={readOnly}
              className="form-control font-mono form-control--textarea"
              placeholder='e.g. "PET Resin Rs 123.50/kg Sharma Polymers delivery next Monday"'
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
            />
          </div>

          <div className="materials-modal__match-row">
            <div className="materials-modal__match-control">
              <label htmlFor="material-override-select" className="text-xs text-muted flex-shrink-0">
                Material Match:
              </label>
              <select
                id="material-override-select"
                className="form-control materials-modal__match-select"
                disabled={readOnly}
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
              disabled={readOnly || parsing || !rawText.trim()}
              onClick={() => handleParse()}
            >
              {parsing ? 'Parsing…' : 'Analyze Quote'}
            </button>
          </div>

          {parsed && parsed.isMatch && (
            <div className="materials-modal__preview-box">
              <div className="materials-modal__preview-header">
                <span className="materials-modal__preview-title">
                  Extracted Quote &amp; Negotiation Bounds
                </span>
                {loggedPoint && (
                  <span className="badge badge--success">
                    <i className="fa-solid fa-check mr-1" aria-hidden="true" /> Logged to Prices
                  </span>
                )}
              </div>

              <div className="materials-modal__metrics-grid">
                <div className="materials-modal__metric-tile">
                  <span className="materials-modal__metric-label">Quoted Rate</span>
                  <strong className="font-mono materials-modal__metric-val">
                    {parsed.currency === 'USD' ? '$' : '₹'}
                    {Number(parsed.rawPrice).toFixed(2)}/{parsed.rawUnit}
                  </strong>
                  {parsed.supplierName && (
                    <span className="text-xs text-muted d-block">{parsed.supplierName}</span>
                  )}
                </div>

                <div className="materials-modal__metric-tile">
                  <span className="materials-modal__metric-label">Landed Parity Ref</span>
                  <strong className="font-mono materials-modal__metric-val">
                    {drafts?.benchmarkPrice != null
                      ? `₹${Number(drafts.benchmarkPrice).toFixed(2)}/${drafts.materialUnit || parsed.rawUnit}`
                      : 'No Benchmark'}
                  </strong>
                </div>

                <div className="materials-modal__metric-tile">
                  <span className="materials-modal__metric-label">Parity Variance</span>
                  <strong
                    className={`font-mono materials-modal__metric-val ${
                      drafts?.variancePercent > 0
                        ? 'materials-modal__metric-val--danger'
                        : 'materials-modal__metric-val--success'
                    }`}
                  >
                    {drafts?.variancePercent != null
                      ? `${drafts.variancePercent > 0 ? '+' : ''}${drafts.variancePercent}%`
                      : '—'}
                  </strong>
                </div>

                <div className="materials-modal__metric-tile">
                  <span className="materials-modal__metric-label">Suggested Counter</span>
                  <strong className="font-mono materials-modal__metric-val materials-modal__metric-val--accent">
                    {drafts?.suggestedCounterLow != null
                      ? `₹${Number(drafts.suggestedCounterLow).toFixed(2)} – ₹${Number(drafts.suggestedCounterHigh).toFixed(2)}`
                      : '—'}
                  </strong>
                </div>
              </div>

              {drafts?.unitConversion?.unitConversionNote && (
                <div className="form-alert form-alert--info form-alert--visible materials-modal__alert">
                  <i className="fa-solid fa-circle-info mr-1" aria-hidden="true" />
                  <span className="form-alert__message">{drafts.unitConversion.unitConversionNote}</span>
                </div>
              )}

              {drafts?.counterOfferMessage && (
                <div className="materials-modal__draft-box">
                  <div className="materials-modal__draft-header">
                    <span className="text-xs font-semibold text-secondary">
                      Ready-to-Send WhatsApp Counter-Offer:
                    </span>
                    <button
                      type="button"
                      className="btn btn--ghost btn--xs"
                      onClick={() => handleCopy(drafts.counterOfferMessage, 'counter')}
                    >
                      <i
                        className={`fa-solid ${copiedDraft === 'counter' ? 'fa-check text-success' : 'fa-copy'} mr-1`}
                        aria-hidden="true"
                      />
                      {copiedDraft === 'counter' ? 'Copied' : 'Copy Draft'}
                    </button>
                  </div>
                  <pre className="materials-modal__draft-pre">{drafts.counterOfferMessage}</pre>
                </div>
              )}

              <div className="materials-modal__draft-actions">
                {drafts?.rfqMessage && (
                  <button
                    type="button"
                    className="btn btn--sm btn--secondary"
                    onClick={() => handleCopy(drafts.rfqMessage, 'rfq')}
                  >
                    <i
                      className={`fa-solid ${copiedDraft === 'rfq' ? 'fa-check' : 'fa-file-lines'} mr-1`}
                      aria-hidden="true"
                    />
                    {copiedDraft === 'rfq' ? 'RFQ Copied' : 'Copy RFQ'}
                  </button>
                )}

                {drafts?.waMeLink && (
                  <a
                    href={drafts.waMeLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--sm btn--secondary"
                  >
                    <i className="fa-brands fa-whatsapp text-success mr-1" aria-hidden="true" />
                    Open in WhatsApp
                  </a>
                )}

                <button
                  type="button"
                  id="copilot-log-quote-btn"
                  className={`btn btn--sm btn--primary${logging ? ' btn--loading' : ''}`}
                  disabled={readOnly || logging || loggedPoint != null || drafts?.unitConversion?.unitMismatch}
                  onClick={handleAutoLogQuote}
                >
                  <i className="fa-solid fa-cloud-arrow-up mr-1" aria-hidden="true" />
                  {loggedPoint ? 'Quote Logged' : 'Log Quote to Prices'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="modal__footer materials-modal__footer">
          <span className="materials-modal__trust-note">
            <i className="fa-solid fa-shield-halved text-success" style={{ marginRight: '6px' }} aria-hidden="true" />
            Zero-exposure audit trail. No plaintext phone numbers leaked.
          </span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={onClose}>
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
