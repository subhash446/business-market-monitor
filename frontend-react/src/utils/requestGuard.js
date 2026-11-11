/**
 * Async Request Sequence Guard
 * Prevents out-of-order responses from older user selections overwriting newer UI state.
 */

/**
 * Create a monotonic request sequence guard.
 *
 * @returns {{ next: () => number, isCurrent: (seq: number) => boolean, invalidate: () => void }}
 */
export function createLatestRequestGuard() {
  let currentSeq = 0;

  return {
    next() {
      currentSeq += 1;
      return currentSeq;
    },
    isCurrent(seq) {
      return seq === currentSeq;
    },
    invalidate() {
      currentSeq += 1;
    },
  };
}

/**
 * Execute an async industry preview fetch protected by a latest-request sequence guard.
 *
 * @param {{
 *   industryId: number | string,
 *   fetchMaterials: (id: number | string) => Promise<{ materials?: Array<object> }>,
 *   guard: { next: () => number, isCurrent: (seq: number) => boolean },
 *   onStart: () => void,
 *   onSuccess: (materials: Array<object>) => void,
 *   onError: () => void,
 *   onSettled: () => void,
 * }} params
 * @returns {Promise<boolean>}
 */
export async function runLatestIndustryPreview({
  industryId,
  fetchMaterials,
  guard,
  onStart,
  onSuccess,
  onError,
  onSettled,
}) {
  const requestId = guard.next();
  onStart();

  try {
    const res = await fetchMaterials(industryId);
    if (!guard.isCurrent(requestId)) return false;
    onSuccess(res?.materials || []);
    return true;
  } catch {
    if (!guard.isCurrent(requestId)) return false;
    onError();
    return false;
  } finally {
    if (guard.isCurrent(requestId)) {
      onSettled();
    }
  }
}
