/**
 * Request body validation for Raw Material Tracking (Document 5 §3.3, §4.5;
 * Document 2 FR-MAT-01, 03). Hand-rolled, dependency-free — same approach
 * as auth.validator.js and business.validator.js.
 *
 * Phase 6A scope only: PATCH may update isTracked ONLY. name, category,
 * unit, businessId, industryId, and any template-derived data are all
 * rejected here — a generic "unknown field" check, not a name-by-name list,
 * so anything not explicitly allowed is refused by default.
 */
const ALLOWED_UPDATE_FIELDS = ['isTracked'];

function validateUpdateMaterial(body) {
  const errors = [];
  const providedFields = Object.keys(body || {});

  const disallowed = providedFields.filter((field) => !ALLOWED_UPDATE_FIELDS.includes(field));
  disallowed.forEach((field) => {
    errors.push({ field, issue: 'cannot be updated' });
  });

  if (body.isTracked === undefined) {
    errors.push({ field: 'isTracked', issue: 'is required' });
  } else if (typeof body.isTracked !== 'boolean') {
    errors.push({ field: 'isTracked', issue: 'must be a boolean' });
  }

  return errors;
}

// Added in Phase 6B (Custom Materials, FR-MAT-02).
// 150-char limit matches tracked_materials.custom_name VARCHAR(150)
// (Document 4 §5.4) exactly — rejected here before it ever reaches the DB.
// Duplicate-name and invalid-unitId existence checks are NOT done here —
// those require a database lookup, so they belong in the service layer
// (materialTracking.service.js), consistent with how business.validator.js
// only checks shape/format and leaves industryId existence to the service.
const MAX_CUSTOM_NAME_LENGTH = 150;

function validateCreateMaterial(body) {
  const errors = [];

  if (!body.customName || !String(body.customName).trim()) {
    errors.push({ field: 'customName', issue: 'is required' });
  } else if (String(body.customName).trim().length > MAX_CUSTOM_NAME_LENGTH) {
    errors.push({ field: 'customName', issue: `must be at most ${MAX_CUSTOM_NAME_LENGTH} characters` });
  }

  if (body.unitId === undefined || body.unitId === null || Number.isNaN(Number(body.unitId))) {
    errors.push({ field: 'unitId', issue: 'is required and must be a valid id' });
  }

  return errors;
}

// Added in Phase B (External Symbol Management) — purely additive.
//
// Validates the body of PATCH /api/v1/materials/:materialId/external-symbol.
// Allowed body shapes:
//   { "externalSymbol": "WTI" }
//   { "externalSymbol": "BRENT" }
//   { "externalSymbol": null }
//
// The allowed values are driven by SUPPORTED_SYMBOLS — the single source of
// truth for which commodities the application can ingest automatically.
// Any string value not in that set is rejected here, before it ever reaches
// the service or database.
const { SUPPORTED_SYMBOLS } = require('../config/commodityMapping');
const ALLOWED_SYMBOLS = Object.values(SUPPORTED_SYMBOLS);
const ALLOWED_BODY_FIELDS = ['externalSymbol'];

function validateSetExternalSymbol(body) {
  const errors = [];
  const providedFields = Object.keys(body || {});

  const disallowed = providedFields.filter((f) => !ALLOWED_BODY_FIELDS.includes(f));
  disallowed.forEach((f) => errors.push({ field: f, issue: 'cannot be set here' }));

  if (!providedFields.includes('externalSymbol')) {
    errors.push({ field: 'externalSymbol', issue: 'is required' });
    return errors; // no point type-checking a missing field
  }

  const { externalSymbol } = body;

  if (externalSymbol !== null) {
    if (typeof externalSymbol !== 'string') {
      errors.push({ field: 'externalSymbol', issue: 'must be a string or null' });
    } else if (!ALLOWED_SYMBOLS.includes(externalSymbol)) {
      errors.push({
        field: 'externalSymbol',
        issue: `must be one of: ${ALLOWED_SYMBOLS.join(', ')} or null`,
      });
    }
  }

  return errors;
}

module.exports = { validateUpdateMaterial, validateCreateMaterial, validateSetExternalSymbol };
