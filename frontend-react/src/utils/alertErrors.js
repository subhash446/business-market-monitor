/**
 * Alert Rule Error Mapping Utilities
 * Business Market Monitor — React frontend
 */

/**
 * Map a createAlertRule API or runtime error into per-field and form-level error messages.
 * Supports backend ApiError validation payloads on `err.details` (as well as legacy `err.errors`).
 *
 * @param {*} err
 * @returns {{ matErr: string, condErr: string, threshErr: string, cooldownErr: string, formErr: string }}
 */
export function mapAlertCreateError(err) {
  const result = {
    matErr: '',
    condErr: '',
    threshErr: '',
    cooldownErr: '',
    formErr: '',
  };

  if (err?.status === 409) {
    result.formErr = 'An alert rule already exists for this material and condition.';
    return result;
  }

  if (err?.status === 404) {
    result.matErr = 'Material not found. Please reload and try again.';
    return result;
  }

  if (err?.status === 400) {
    const rawErrors = err?.details ?? err?.errors ?? [];
    const errors = Array.isArray(rawErrors) ? rawErrors : [];

    const mE = errors.find((e) => e?.field === 'trackedMaterialId');
    const cE = errors.find((e) => e?.field === 'conditionType');
    const tE = errors.find((e) => e?.field === 'thresholdPrice');
    const cdE = errors.find((e) => e?.field === 'cooldownHours');
    const otherErr = errors.find(
      (e) =>
        e?.field &&
        !['trackedMaterialId', 'conditionType', 'thresholdPrice', 'cooldownHours'].includes(e.field)
    );

    if (mE) result.matErr = mE.issue || 'Please select a material.';
    if (cE) result.condErr = cE.issue || 'Please select a condition.';
    if (tE) result.threshErr = tE.issue || 'Invalid threshold.';
    if (cdE) result.cooldownErr = cdE.issue || 'Invalid cooldown.';

    if (otherErr) {
      result.formErr = otherErr.issue || err?.message || 'Please check your inputs and try again.';
    } else if (!mE && !cE && !tE && !cdE) {
      result.formErr = err?.message || 'Please check your inputs and try again.';
    }
    return result;
  }

  if (!err?.status || err?.code === 'NETWORK_ERROR') {
    result.formErr = 'Could not create alert rule. Check your connection.';
    return result;
  }

  result.formErr = err?.message || 'Could not create alert rule. Please try again.';
  return result;
}
