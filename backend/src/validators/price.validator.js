/**
 * Request body/query validation for the Price Tracking and Historical
 * Trends modules (Document 5 §3.3, §4.6, §4.10; Document 2 FR-PRICE-01, 05,
 * FR-HIST-01–03). Hand-rolled, dependency-free — same approach as every
 * other validator in this project.
 */
function validateAddPrice(body) {
  const errors = [];

  const priceNum = Number(body.price);
  if (body.price === undefined || body.price === null || Number.isNaN(priceNum) || priceNum <= 0) {
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

module.exports = { validateAddPrice, validatePriceHistoryQuery, validateCompareQuery };
