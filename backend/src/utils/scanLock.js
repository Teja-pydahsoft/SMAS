/**
 * Per-registration in-process mutex for gate/department scans.
 * Prevents concurrent requests for the same person from both passing
 * validate → write (the race that creates double check-in / check-out).
 */

const tailByKey = new Map();

/**
 * Run `fn` exclusively for `registrationId` (serialized FIFO per key).
 * @template T
 * @param {string|import('mongoose').Types.ObjectId} registrationId
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withRegistrationScanLock(registrationId, fn) {
  const key = registrationId?.toString?.() || String(registrationId || '');
  if (!key) return fn();

  const prev = tailByKey.get(key) || Promise.resolve();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const tail = prev.then(() => gate, () => gate);
  tailByKey.set(key, tail);

  await prev.catch(() => {});
  try {
    return await fn();
  } finally {
    release();
    if (tailByKey.get(key) === tail) {
      tailByKey.delete(key);
    }
  }
}
