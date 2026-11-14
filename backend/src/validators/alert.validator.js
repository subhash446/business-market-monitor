/**
 * Request body validation for Email Alerts (Document 5 §3.3, §4.8;
 * Document 2 FR-ALERT-01, 05). Hand-rolled, dependency-free — same
 * approach as every other validator in this project.
 *
 * Phase 2 enhancements:
 *   - thresholdType: 'ABSOLUTE' | 'PERCENTAGE'
 *   - cooldownHours: integer between 1 and 720 (defaults to 24)
 */
const CONDITION_TYPES = ['PRICE_ABOVE', 'PRICE_BELOW'];
const THRESHOLD_TYPES = ['ABSOLUTE', 'PERCENTAGE'];
const NOTIFICATION_CHANNELS = ['EMAIL', 'WHATSAPP', 'BOTH'];
const E164_PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

const {
  isStrictFiniteNumber,
  isStrictPositiveInteger,
} = require('../utils/validationHelpers');

function isValidThresholdPrice(value, thresholdType = 'ABSOLUTE') {
  if (!isStrictFiniteNumber(value)) {
    return false;
  }
  const num = Number(value);
  if (num <= 0) {
    return false;
  }
  if (thresholdType === 'PERCENTAGE' && num > 1000) {
    return false;
  }
  return true;
}

function isValidCooldownHours(value) {
  if (value === undefined) return true;
  return isStrictPositiveInteger(value) && Number(value) <= 720;
}

function validateCreateRule(body) {
  const errors = [];

  const matId = isStrictPositiveInteger(body.trackedMaterialId)
    ? Number(body.trackedMaterialId)
    : NaN;
  if (Number.isNaN(matId)) {
    errors.push({ field: 'trackedMaterialId', issue: 'is required and must be a valid id' });
  }

  if (!CONDITION_TYPES.includes(body.conditionType)) {
    errors.push({ field: 'conditionType', issue: `must be one of ${CONDITION_TYPES.join(', ')}` });
  }

  const thresholdType = body.thresholdType || 'ABSOLUTE';
  if (body.thresholdType !== undefined && !THRESHOLD_TYPES.includes(body.thresholdType)) {
    errors.push({ field: 'thresholdType', issue: `must be one of ${THRESHOLD_TYPES.join(', ')}` });
  }

  if (!isValidThresholdPrice(body.thresholdPrice, thresholdType)) {
    errors.push({
      field: 'thresholdPrice',
      issue: thresholdType === 'PERCENTAGE'
        ? 'must be a positive percentage number (e.g. 5 for 5%) up to 1000%'
        : 'must be a number greater than 0',
    });
  }

  if (body.cooldownHours !== undefined && !isValidCooldownHours(body.cooldownHours)) {
    errors.push({ field: 'cooldownHours', issue: 'must be an integer between 1 and 720 hours' });
  }

  if (body.notificationChannel !== undefined && !NOTIFICATION_CHANNELS.includes(body.notificationChannel)) {
    errors.push({ field: 'notificationChannel', issue: `must be one of ${NOTIFICATION_CHANNELS.join(', ')}` });
  }

  if (body.destinationPhone !== undefined && body.destinationPhone !== null && String(body.destinationPhone).trim() !== '') {
    if (!E164_PHONE_REGEX.test(String(body.destinationPhone).trim())) {
      errors.push({ field: 'destinationPhone', issue: 'must be a valid E.164 phone number (e.g. +919876543210)' });
    }
  }

  return errors;
}

const ALLOWED_UPDATE_FIELDS = ['conditionType', 'thresholdPrice', 'thresholdType', 'cooldownHours', 'isActive', 'notificationChannel', 'destinationPhone'];

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

  if (body.thresholdType !== undefined && !THRESHOLD_TYPES.includes(body.thresholdType)) {
    errors.push({ field: 'thresholdType', issue: `must be one of ${THRESHOLD_TYPES.join(', ')}` });
  }

  if (body.thresholdPrice !== undefined) {
    const thresholdType = body.thresholdType || 'ABSOLUTE';
    if (!isValidThresholdPrice(body.thresholdPrice, thresholdType)) {
      errors.push({
        field: 'thresholdPrice',
        issue: thresholdType === 'PERCENTAGE'
          ? 'must be a positive percentage number (e.g. 5 for 5%) up to 1000%'
          : 'must be a number greater than 0',
      });
    }
  }

  if (body.cooldownHours !== undefined && !isValidCooldownHours(body.cooldownHours)) {
    errors.push({ field: 'cooldownHours', issue: 'must be an integer between 1 and 720 hours' });
  }

  if (body.isActive !== undefined && typeof body.isActive !== 'boolean') {
    errors.push({ field: 'isActive', issue: 'must be a boolean' });
  }

  if (body.notificationChannel !== undefined && !NOTIFICATION_CHANNELS.includes(body.notificationChannel)) {
    errors.push({ field: 'notificationChannel', issue: `must be one of ${NOTIFICATION_CHANNELS.join(', ')}` });
  }

  if (body.destinationPhone !== undefined && body.destinationPhone !== null && String(body.destinationPhone).trim() !== '') {
    if (!E164_PHONE_REGEX.test(String(body.destinationPhone).trim())) {
      errors.push({ field: 'destinationPhone', issue: 'must be a valid E.164 phone number (e.g. +919876543210)' });
    }
  }

  return errors;
}

module.exports = { validateCreateRule, validateUpdateRule, CONDITION_TYPES, THRESHOLD_TYPES, NOTIFICATION_CHANNELS, E164_PHONE_REGEX };
