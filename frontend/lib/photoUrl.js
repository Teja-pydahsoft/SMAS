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

  // If it's already an absolute URL (http/https/data:) return as-is
  if (/^https?:\/\/|^data:/.test(photoPath)) return photoPath;

  // Extract just the filename from any path format
  const filename = photoPath.replace(/\\/g, '/').split('/').pop();
  if (!filename) return null;

  const relativePath = `/uploads/registrations/${filename}`;

  // On the client, prefer an absolute URL to the backend so the image
  // loads directly without going through the Next.js rewrite layer.
  if (typeof window !== 'undefined') {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      (window.__SMAS_BACKEND_URL__) || // runtime injection fallback
      null;

    if (backendUrl) {
      const base = backendUrl.replace(/\/$/, '');
      return `${base}${relativePath}`;
    }
  }

  return relativePath;
}
