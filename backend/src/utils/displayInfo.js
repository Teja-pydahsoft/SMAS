const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.heic', '.heif']);

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

export function getExtension(name = '') {
  const match = String(name).toLowerCase().match(/\.[a-z0-9]+$/);
  return match ? match[0] : '';
}

export function isImageMedia(media) {
  if (!media) return false;
  if (media.mimetype?.startsWith('image/')) return true;
  const ext = (media.extension || getExtension(media.originalName || media.path || '')).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext);
}

export function buildDisplayInfo(formData, fields = []) {
  const sorted = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const details = [];
  const mediaDetails = [];
  let displayName = null;
  let displayPhone = null;

  for (const field of sorted) {
    const value = formData?.[field.fieldId];
    if (value === undefined || value === null || value === '') continue;

    if (field.type === 'media') {
      const media = parseMediaValue(value);
      if (media) {
        mediaDetails.push({
          fieldId: field.fieldId,
          label: field.label,
          ...media,
          isImage: isImageMedia(media),
        });
      }
      continue;
    }

    const text = String(value);
    details.push({ label: field.label, value: text });

    const label = field.label.toLowerCase();
    if (!displayName && (label.includes('name') || field.type === 'text')) {
      displayName = text;
    }
    if (
      !displayPhone &&
      (field.type === 'phone' || label.includes('phone') || label.includes('mobile'))
    ) {
      displayPhone = text;
    }
  }

  if (!displayName) {
    const first = details.find((d) => d.value.trim());
    displayName = first?.value || null;
  }

  const hasMediaFields = fields.some((f) => f.type === 'media');

  return { displayName, displayPhone, details, mediaDetails, hasMediaFields };
}

export function photoUrlFromPath(photoPath) {
  if (!photoPath) return null;
  // Cloudinary URLs are already full https:// URLs — return as-is
  if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
    return photoPath;
  }
  // Local fallback: derive URL from filename
  const name = photoPath.replace(/\\/g, '/').split('/').pop();
  // Detect subfolder from the path so gate photos resolve correctly
  if (photoPath.replace(/\\/g, '/').includes('/gate/')) {
    return `/uploads/gate/${name}`;
  }
  return `/uploads/registrations/${name}`;
}
