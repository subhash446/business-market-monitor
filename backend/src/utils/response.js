/**
 * Standard API response envelope (Document 5 §3.4).
 * Every controller must respond through these helpers so the response
 * shape is identical across all 30 endpoints.
 */

function sendSuccess(res, data, meta, statusCode = 200) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function sendError(res, statusCode, code, message, details) {
  const error = { code, message };
  if (details) error.details = details;
  return res.status(statusCode).json({ success: false, error });
}

module.exports = { sendSuccess, sendError };
