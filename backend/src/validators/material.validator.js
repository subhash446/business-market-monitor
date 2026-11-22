/**
 * Request body validation for Raw Material Tracking (Document 5 §3.3, §4.5;
 * Document 2 FR-MAT-01, 02, 03, 04). Hand-rolled, dependency-free — same approach
 * as auth.validator.js and business.validator.js.
 *
 * Phase 6A scope:
 *   PATCH /api/v1/materials/:materialId
 *   May update any subset of: isTracked, customName, unitId.
 *   - At least one field must be provided.
 *   - Any unknown/unsupported field is rejected.
 *   - isTracked must be boolean if provided.
 *   - customName must be non-empty string <= 150 chars if provided.
 *   - unitId must be positive integer if provided.
 *
 * Phase 6B scope:
 *   POST /api/v1/materials
 *   Requires customName and unitId.
 *   - customName required, non-empty, max 150 chars.
 *   - unitId required, positive integer referencing units_of_measurement.
 */

const ALLOWED_UPDATE_FIELDS = ['isTracked', 'customName', 'unitId'];
const MAX_CUSTOM_NAME_LENGTH = 150;
const { isStrictPositiveInteger } = require('../utils/validationHelpers');

function validateUpdateMaterial(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.push({ field: 'body', issue: 'must be an object' });
    return errors;
  }

  const providedFields = Object.keys(body);

  const disallowed = providedFields.filter((field) => !ALLOWED_UPDATE_FIELDS.includes(field));
  disallowed.forEach((field) => {
    errors.push({ field, issue: 'cannot be updated' });
  });

  if (providedFields.length === 0) {
    errors.push({ field: 'body', issue: 'must provide at least one field to update' });
    return errors;
  }

  if (body.isTracked !== undefined) {
    if (typeof body.isTracked !== 'boolean') {
      errors.push({ field: 'isTracked', issue: 'must be a boolean' });
    }
  }

  if (body.customName !== undefined) {
    if (typeof body.customName !== 'string' || !body.customName.trim()) {
      errors.push({ field: 'customName', issue: 'cannot be empty' });
    } else if (body.customName.trim().length > MAX_CUSTOM_NAME_LENGTH) {
      errors.push({ field: 'customName', issue: `must be at most ${MAX_CUSTOM_NAME_LENGTH} characters` });
    }
  }

  if (body.unitId !== undefined) {
    if (!isStrictPositiveInteger(body.unitId)) {
      errors.push({ field: 'unitId', issue: 'must be a valid unit id' });
    }
  }

  return errors;
}

function validateCreateMaterial(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.push({ field: 'body', issue: 'must be an object' });
    return errors;
  }

  const providedFields = Object.keys(body);
  const allowedFields = ['customName', 'unitId'];
  const disallowed = providedFields.filter((f) => !allowedFields.includes(f));
  disallowed.forEach((f) => errors.push({ field: f, issue: 'is not an allowed field' }));

  if (!body.customName || typeof body.customName !== 'string' || !body.customName.trim()) {
    errors.push({ field: 'customName', issue: 'is required' });
  } else if (body.customName.trim().length > MAX_CUSTOM_NAME_LENGTH) {
    errors.push({ field: 'customName', issue: `must be at most ${MAX_CUSTOM_NAME_LENGTH} characters` });
  }

  if (!isStrictPositiveInteger(body.unitId)) {
    errors.push({ field: 'unitId', issue: 'is required and must be a valid id' });
  }

  return errors;
}

// Added in Phase B (External Symbol Management) — purely additive.
const { SUPPORTED_SYMBOLS } = require('../config/commodityMapping');
const ALLOWED_SYMBOLS = Object.values(SUPPORTED_SYMBOLS);
const ALLOWED_SYMBOL_BODY_FIELDS = ['externalSymbol'];

function validateSetExternalSymbol(body) {
  const errors = [];
  const providedFields = Object.keys(body || {});

  const disallowed = providedFields.filter((f) => !ALLOWED_SYMBOL_BODY_FIELDS.includes(f));
  disallowed.forEach((f) => errors.push({ field: f, issue: 'cannot be set here' }));

  if (!providedFields.includes('externalSymbol')) {
    errors.push({ field: 'externalSymbol', issue: 'is required' });
    return errors;
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

// Added in V3-M1 (Inventory Profile Management) — purely additive.
const ALLOWED_INVENTORY_FIELDS = [
  'currentStockQty',
  'dailyConsumptionRate',
  'supplierLeadTimeDays',
  'maxStorageDays',
];

function validateUpdateInventoryProfile(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.push({ field: 'body', issue: 'must be an object' });
    return errors;
  }

  const providedFields = Object.keys(body);
  const disallowed = providedFields.filter((f) => !ALLOWED_INVENTORY_FIELDS.includes(f));
  disallowed.forEach((f) => errors.push({ field: f, issue: 'cannot be updated' }));

  if (providedFields.length === 0) {
    errors.push({ field: 'body', issue: 'must provide at least one inventory field to update' });
    return errors;
  }

  if (body.currentStockQty !== undefined && body.currentStockQty !== null) {
    if (typeof body.currentStockQty !== 'number' || isNaN(body.currentStockQty) || body.currentStockQty < 0) {
      errors.push({ field: 'currentStockQty', issue: 'must be a non-negative number or null' });
    }
  }

  if (body.dailyConsumptionRate !== undefined && body.dailyConsumptionRate !== null) {
    if (typeof body.dailyConsumptionRate !== 'number' || isNaN(body.dailyConsumptionRate) || body.dailyConsumptionRate <= 0) {
      errors.push({ field: 'dailyConsumptionRate', issue: 'must be a positive number or null' });
    }
  }

  if (body.supplierLeadTimeDays !== undefined && body.supplierLeadTimeDays !== null) {
    if (!Number.isInteger(body.supplierLeadTimeDays) || body.supplierLeadTimeDays < 0) {
      errors.push({ field: 'supplierLeadTimeDays', issue: 'must be a non-negative integer or null' });
    }
  }

  if (body.maxStorageDays !== undefined && body.maxStorageDays !== null) {
    if (!Number.isInteger(body.maxStorageDays) || body.maxStorageDays <= 0) {
      errors.push({ field: 'maxStorageDays', issue: 'must be a positive integer or null' });
    }
  }

  return errors;
}

// Added in V3-M3 (Landed Cost Configuration) — purely additive.
const ALLOWED_LANDED_FIELDS = [
  'landedUnitFactor',
  'landedDutyFreightPct',
  'landedFixedSpreadInr',
];

function validateUpdateLandedCost(body) {
  const errors = [];
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.push({ field: 'body', issue: 'must be an object' });
    return errors;
  }

  const providedFields = Object.keys(body);
  const disallowed = providedFields.filter((f) => !ALLOWED_LANDED_FIELDS.includes(f));
  disallowed.forEach((f) => errors.push({ field: f, issue: 'cannot be updated' }));

  if (providedFields.length === 0) {
    errors.push({ field: 'body', issue: 'must provide at least one landed-cost field to update' });
    return errors;
  }

  // Refinement 3: Enforce safe numeric bounds matching MySQL column precision
  if (body.landedUnitFactor !== undefined && body.landedUnitFactor !== null) {
    if (typeof body.landedUnitFactor !== 'number' || isNaN(body.landedUnitFactor) || body.landedUnitFactor <= 0 || body.landedUnitFactor > 100000) {
      errors.push({ field: 'landedUnitFactor', issue: 'must be a positive number <= 100000 or null' });
    }
  }

  if (body.landedDutyFreightPct !== undefined && body.landedDutyFreightPct !== null) {
    if (typeof body.landedDutyFreightPct !== 'number' || isNaN(body.landedDutyFreightPct) || body.landedDutyFreightPct < 0 || body.landedDutyFreightPct > 500) {
      errors.push({ field: 'landedDutyFreightPct', issue: 'must be a non-negative number <= 500 or null' });
    }
  }

  if (body.landedFixedSpreadInr !== undefined && body.landedFixedSpreadInr !== null) {
    if (typeof body.landedFixedSpreadInr !== 'number' || isNaN(body.landedFixedSpreadInr) || body.landedFixedSpreadInr < 0 || body.landedFixedSpreadInr > 1000000) {
      errors.push({ field: 'landedFixedSpreadInr', issue: 'must be a non-negative number <= 1000000 or null' });
    }
  }

  return errors;
}

module.exports = {
  validateUpdateMaterial,
  validateCreateMaterial,
  validateSetExternalSymbol,
  validateUpdateInventoryProfile,
  validateUpdateLandedCost,
};
