/**
 * Request body validation for Email Alerts (Document 5 §3.3, §4.8;
 * Document 2 FR-ALERT-01, 05). Hand-rolled, dependency-free — same
 * approach as every other validator in this project.
 */
const CONDITION_TYPES = ['PRICE_ABOVE', 'PRICE_BELOW'];

function isValidThresholdPrice(value) {
  const num = Number(value);
  return value !== undefined && value !== null && !Number.isNaN(num) && num > 0;
}

function validateCreateRule(body) {
  const errors = [];

  if (body.trackedMaterialId === undefined || body.trackedMaterialId === null || Number.isNaN(Number(body.trackedMaterialId))) {
    errors.push({ field: 'trackedMaterialId', issue: 'is required and must be a valid id' });
  }

  if (!CONDITION_TYPES.includes(body.conditionType)) {
    errors.push({ field: 'conditionType', issue: `must be one of ${CONDITION_TYPES.join(', ')}` });
  }

  if (!isValidThresholdPrice(body.thresholdPrice)) {
    // Matches the alert_rules CHECK constraint (Document 4 §5.6, threshold_price > 0).
    errors.push({ field: 'thresholdPrice', issue: 'must be a number greater than 0' });
  }

  return errors;
}

const ALLOWED_UPDATE_FIELDS = ['conditionType', 'thresholdPrice', 'isActive'];

function validateUpdateRule(body) {
  const errors = [];
  const providedFields = Object.keys(body || {});

  const disallowed = providedFields.filter((field) => !ALLOWED_UPDATE_FIELDS.includes(field));
  disallowed.forEach((field) => errors.push({ field, issue: 'cannot be updated' }));

  if (providedFields.length === 0) {
    errors.push({ field: 'body', issue: 'at least one field must be provided' });
  }

  if (body.conditionType !== undefined && !CONDITION_TYPES.includes(body.conditionType)) {
    errors.push({ field: 'conditionType', issue: `must be one of ${CONDITION_TYPES.join(', ')}` });
  }

  if (body.thresholdPrice !== undefined && !isValidThresholdPrice(body.thresholdPrice)) {
    errors.push({ field: 'thresholdPrice', issue: 'must be a number greater than 0' });
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    errors.push({ field: 'isActive', issue: 'must be a boolean' });
  }

  return errors;
}

module.exports = { validateCreateRule, validateUpdateRule };
