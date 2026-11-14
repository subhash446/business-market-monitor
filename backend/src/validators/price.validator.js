/**
 * Request body/query validation for the Price Tracking and Historical
 * Trends modules (Document 5 §3.3, §4.6, §4.10; Document 2 FR-PRICE-01, 05,
 * FR-HIST-01–03). Hand-rolled, dependency-free — same approach as every
 * other validator in this project.
 */

const ALLOWED_DATA_CLASSES = ['OFFICIAL_BENCHMARK', 'MARKET_INDICATIVE', 'SUPPLIER_QUOTE'];
const {
  isStrictFiniteNumber,
  isValidCurrencyCode,
  isValidHttpUrl,
} = require('../utils/validationHelpers');

function validateAddPrice(body) {
  const errors = [];

  const priceNum = isStrictFiniteNumber(body.price) ? Number(body.price) : NaN;
  if (Number.isNaN(priceNum) || priceNum <= 0) {
    // Matches the price_points CHECK constraint (Document 4 §5.4, price > 0)
    // — rejected here before it ever reaches the DB.
    errors.push({ field: 'price', issue: 'must be a number greater than 0' });
  }

  if (!body.recordedAt) {
    errors.push({ field: 'recordedAt', issue: 'is required' });
  } else {
    const recordedDate = new Date(body.recordedAt);
    if (Number.isNaN(recordedDate.getTime())) {
      errors.push({ field: 'recordedAt', issue: 'must be a valid date' });
    } else if (recordedDate.getTime() > Date.now()) {
      errors.push({ field: 'recordedAt', issue: 'cannot be in the future' });
    }
  }

  if (body.currency !== undefined && body.currency !== null) {
    if (!isValidCurrencyCode(body.currency)) {
      errors.push({ field: 'currency', issue: 'must be a 3-letter alphabetic currency code (e.g. INR, USD)' });
    }
  }

  if (body.unitLabel !== undefined && body.unitLabel !== null) {
    if (typeof body.unitLabel !== 'string' || body.unitLabel.length > 30) {
      errors.push({ field: 'unitLabel', issue: 'must be a string up to 30 characters' });
    }
  }

  if (body.region !== undefined && body.region !== null) {
    if (typeof body.region !== 'string' || body.region.length > 100) {
      errors.push({ field: 'region', issue: 'must be a string up to 100 characters' });
    }
  }

  if (body.grade !== undefined && body.grade !== null) {
    if (typeof body.grade !== 'string' || body.grade.length > 100) {
      errors.push({ field: 'grade', issue: 'must be a string up to 100 characters' });
    }
  }

  if (body.sourceUrl !== undefined && body.sourceUrl !== null) {
    if (!isValidHttpUrl(body.sourceUrl, 500)) {
      errors.push({ field: 'sourceUrl', issue: 'must be a valid http or https URL string up to 500 characters' });
    }
  }

  if (body.dataClass !== undefined && body.dataClass !== null) {
    if (!ALLOWED_DATA_CLASSES.includes(body.dataClass)) {
      errors.push({ field: 'dataClass', issue: `must be one of: ${ALLOWED_DATA_CLASSES.join(', ')}` });
    }
  }

  return errors;
}

function validateBulkPriceUpload(body) {
  const errors = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    errors.push({ field: 'body', issue: 'must be an object' });
    return errors;
  }

  if (!Array.isArray(body.prices)) {
    errors.push({ field: 'prices', issue: 'must be an array' });
    return errors;
  }

  if (body.prices.length === 0) {
    errors.push({ field: 'prices', issue: 'must contain at least 1 price item' });
    return errors;
  }

  if (body.prices.length > 200) {
    errors.push({ field: 'prices', issue: 'cannot exceed maximum batch size of 200 items' });
    return errors;
  }

  for (let i = 0; i < body.prices.length; i++) {
    const item = body.prices[i];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ field: `prices[${i}]`, issue: 'must be an object' });
      break;
    }
  }

  return errors;
}

function isValidDateString(value) {
  return !Number.isNaN(new Date(value).getTime());
}

// Production Hardening Phase B, finding C1: shared by both
// validatePriceHistoryQuery and validateCompareQuery below — previously
// each had its own copy-pasted block for this exact check. Appends
// directly to the caller's `errors` array rather than returning a new one,
// so both callers keep their existing "push and continue" style unchanged.
function validateDateRange(query, errors) {
  if (query.from !== undefined && !isValidDateString(query.from)) {
    errors.push({ field: 'from', issue: 'must be a valid date' });
  }
  if (query.to !== undefined && !isValidDateString(query.to)) {
    errors.push({ field: 'to', issue: 'must be a valid date' });
  }
  if (
    query.from !== undefined && query.to !== undefined &&
    isValidDateString(query.from) && isValidDateString(query.to) &&
    new Date(query.from).getTime() > new Date(query.to).getTime()
  ) {
    // Document 5 §4.10: explicit 400 case, "from after to."
    errors.push({ field: 'from', issue: 'must not be after to' });
  }
}

// FR-HIST-01, 02. from/to are optional — see price.repository.js's header
// note for the stated design interpretation (no existing precedent in this
// project for a date-range filter; absence = no date filtering).
function validatePriceHistoryQuery(query) {
  const errors = [];
  validateDateRange(query, errors);
  return errors;
}

// FR-HIST-03. 1–5 materialIds — both bounds explicitly stated in Document 5
// §4.10 ("more than 5 materialIds" rejected; a compare needs at least 1),
// not an invented limit.
function validateCompareQuery(query) {
  const errors = [];

  if (!query.materialIds || !String(query.materialIds).trim()) {
    errors.push({ field: 'materialIds', issue: 'is required' });
    return errors;
  }

  const ids = String(query.materialIds).split(',').map((s) => s.trim());
  const allValid = ids.every((id) => id !== '' && !Number.isNaN(Number(id)));

  if (!allValid) {
    errors.push({ field: 'materialIds', issue: 'must be a comma-separated list of valid ids' });
  } else if (ids.length < 1 || ids.length > 5) {
    errors.push({ field: 'materialIds', issue: 'must contain between 1 and 5 material ids' });
  }

  validateDateRange(query, errors);
  return errors;
}

module.exports = {
  validateAddPrice,
  validateBulkPriceUpload,
  validatePriceHistoryQuery,
  validateCompareQuery,
};
