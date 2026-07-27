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

/** Private S3 object URLs must go through the backend proxy (bucket is not public). */
function s3ProxyPathFromHttps(url) {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('amazonaws.com')) return null;
    let key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    // Path-style: s3.region.amazonaws.com/bucket/key
    if (parsed.hostname.startsWith('s3.') || parsed.hostname === 's3.amazonaws.com') {
      const slash = key.indexOf('/');
      if (slash > 0) key = key.slice(slash + 1);
    }
    if (!key) return null;
    return `/uploads/s3/${key.split('/').map(encodeURIComponent).join('/')}`;
  } catch {
    return null;
  }
}

export function resolvePhotoUrl(photoPath) {
  if (!photoPath) return null;

  if (/^data:/.test(photoPath)) return photoPath;

  if (/^https?:\/\//.test(photoPath)) {
    const s3Proxy = s3ProxyPathFromHttps(photoPath);
    if (s3Proxy) {
      photoPath = s3Proxy;
    } else {
      return photoPath; // Cloudinary / other public HTTPS
    }
  }

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
      window.__SMAS_BACKEND_URL__ ||
      null;

    if (backendUrl) {
      const base = backendUrl.replace(/\/$/, '');
      return `${base}${relativePath}`;
    }
  }

  return relativePath;
}
