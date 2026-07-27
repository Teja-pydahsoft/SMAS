/**
 * resolvePhotoUrl
 *
 * Converts a backend photo path (e.g. "/uploads/registrations/xxx.jpg" or
 * a Windows absolute path stored in the DB) into a URL the browser can load.
 *
 * On production the image is served from the backend host (Render).
 * We use NEXT_PUBLIC_BACKEND_URL when available so <img> tags fetch directly
 * from the backend rather than going through the Next.js rewrite proxy,
 * which can time-out or be unavailable on certain edge runtimes.
 *
 * Falls back to the relative /uploads/... path so local dev still works.
 */
export function resolvePhotoUrl(photoPath) {
  if (!photoPath) return null;

  if (/^https?:\/\/|^data:/.test(photoPath)) return photoPath;

  const normalized = photoPath.replace(/\\/g, '/');
  const filename = normalized.split('/').pop();
  if (!filename) return null;

  let relativePath;
  // Private S3 objects are proxied by the backend — keep the full key path.
  // Must run before /gate/ and /activity/ checks, or S3 gate URLs get rewritten
  // to local /uploads/gate/<filename> and break.
  if (normalized.startsWith('/uploads/s3/')) {
    relativePath = normalized;
  } else if (normalized.includes('/gate/') || normalized.startsWith('/uploads/gate/')) {
    relativePath = `/uploads/gate/${filename}`;
  } else if (normalized.includes('/activity/') || normalized.startsWith('/uploads/activity/')) {
    relativePath = `/uploads/activity/${filename}`;
  } else if (normalized.includes('/registrations-media/')) {
    relativePath = `/uploads/registrations-media/${filename}`;
  } else if (normalized.startsWith('/uploads/')) {
    relativePath = normalized;
  } else {
    relativePath = `/uploads/registrations/${filename}`;
  }

  if (typeof window !== 'undefined') {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      (window.__SMAS_BACKEND_URL__) ||
      null;

    if (backendUrl) {
      const base = backendUrl.replace(/\/$/, '');
      return `${base}${relativePath}`;
    }
  }

  return relativePath;
}
