/**
 * Request body validation for the Business Profile module (Document 5 §3.3,
 * §4.2; Document 2 FR-BIZ-01–04). Hand-rolled, dependency-free — same
 * approach as auth.validator.js (Document 5 §3.3 left the library choice
 * open; consistency kept minimal across modules).
 */
const { isValidEmail } = require('./auth.validator');

const DIGEST_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];

// Production Hardening Phase B, finding C3: matches businesses.name
// VARCHAR(200) (Document 4 §5.2) — rejected here before it ever reaches
// the DB.
const MAX_NAME_LENGTH = 200;

function validateCreateBusiness(body) {
  const errors = [];

  if (!body.name || !String(body.name).trim()) {
    errors.push({ field: 'name', issue: 'is required' });
  } else if (String(body.name).trim().length > MAX_NAME_LENGTH) {
    errors.push({ field: 'name', issue: `must be at most ${MAX_NAME_LENGTH} characters` });
  }

  if (body.industryId === undefined || body.industryId === null || Number.isNaN(Number(body.industryId))) {
    errors.push({ field: 'industryId', issue: 'is required and must be a valid id' });
  }

  // Production Hardening Phase B, finding C2: contactEmail is optional
  // (Document 5 §4.2 lists it without "required"), so only validated when
  // present — reuses auth.validator.js's exact email format check rather
  // than a second, duplicate regex.
  if (body.contactEmail !== undefined && body.contactEmail !== null && body.contactEmail !== '' && !isValidEmail(body.contactEmail)) {
    errors.push({ field: 'contactEmail', issue: 'must be a valid email address' });
  }

  return errors;
}

function validateUpdateBusiness(body) {
  const errors = [];

  if (!body.name || !String(body.name).trim()) {
    errors.push({ field: 'name', issue: 'is required' });
  } else if (String(body.name).trim().length > MAX_NAME_LENGTH) {
    errors.push({ field: 'name', issue: `must be at most ${MAX_NAME_LENGTH} characters` });
  }

  // Document 5 §4.2: industryId is deliberately not editable after creation.
  // Rejected here, at the validator layer, before it ever reaches the service.
  if (body.industryId !== undefined) {
    errors.push({ field: 'industryId', issue: 'cannot be changed after business creation' });
  }

  if (body.newsDigestFrequency !== undefined && !DIGEST_FREQUENCIES.includes(body.newsDigestFrequency)) {
    errors.push({ field: 'newsDigestFrequency', issue: `must be one of ${DIGEST_FREQUENCIES.join(', ')}` });
  }

  if (body.contactEmail !== undefined && body.contactEmail !== null && body.contactEmail !== '' && !isValidEmail(body.contactEmail)) {
    errors.push({ field: 'contactEmail', issue: 'must be a valid email address' });
  }

  return errors;
}

module.exports = { validateCreateBusiness, validateUpdateBusiness };
