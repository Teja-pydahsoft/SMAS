const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif']);

export function getExtension(name = '') {
  const match = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

export function parseMediaValue(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const ext = getExtension(value);
    return {
      path: value,
      url: mediaUrlFromPath(value),
      originalName: value.replace(/\\/g, '/').split('/').pop() || 'file',
      mimetype: null,
      extension: ext,
    };
  }
  if (typeof value === 'object' && (value.path || value.url)) {
    const path = value.path || value.url;
    const extension = value.extension || getExtension(value.originalName || path);
    const url = value.url?.startsWith('http')
      ? value.url
      : path?.startsWith('http')
        ? path
        : value.url || mediaUrlFromPath(path);
    return {
      path,
      url,
      originalName: value.originalName || path.replace(/\\/g, '/').split('/').pop() || 'file',
      mimetype: value.mimetype || null,
      extension,
      size: value.size ?? null,
    };
  }
  return null;
}

export function mediaUrlFromPath(mediaPath) {
  if (!mediaPath) return null;
  if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://')) {
    return mediaPath;
  }
  const normalized = mediaPath.replace(/\\/g, '/');
  const name = normalized.split('/').pop();
  if (normalized.includes('/registrations-media/')) {
    return `/uploads/registrations-media/${name}`;
  }
  return `/uploads/registrations-media/${name}`;
}

/** Resolve a media URL for use in <img> / links (handles backend absolute URLs). */
export function resolveMediaUrl(mediaPath) {
  if (!mediaPath) return null;
  if (/^https?:\/\/|^data:/.test(mediaPath)) return mediaPath;

  const filename = mediaPath.replace(/\\/g, '/').split('/').pop();
  if (!filename) return null;

  const relativePath = mediaPath.replace(/\\/g, '/').includes('/registrations-media/')
    ? `/uploads/registrations-media/${filename}`
    : `/uploads/registrations-media/${filename}`;

  if (typeof window !== 'undefined') {
    const backendUrl =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      window.__SMAS_BACKEND_URL__ ||
      null;
    if (backendUrl) {
      return `${backendUrl.replace(/\/$/, '')}${relativePath}`;
    }
  }

  return relativePath;
}

export function isImageMedia(media) {
  if (!media) return false;
  if (media.mimetype?.startsWith('image/')) return true;
  const ext = (media.extension || getExtension(media.originalName || media.path || '')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function hasMediaValue(value) {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') return Boolean(value.path || value.url);
  return false;
}

export function isPdfMedia(media) {
  if (!media) return false;
  if (media.mimetype === 'application/pdf') return true;
  const ext = (media.extension || getExtension(media.originalName || '')).toLowerCase();
  return ext === '.pdf';
}
