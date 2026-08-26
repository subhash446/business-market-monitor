/**
 * Placeholder handler for every endpoint not yet implemented.
 * Phase 1 only — replaced module-by-module as each SRS module is built.
 */
const { sendError } = require('./response');

function notImplemented(req, res) {
  sendError(res, 501, 'NOT_IMPLEMENTED', 'Not Implemented');
}

module.exports = notImplemented;
