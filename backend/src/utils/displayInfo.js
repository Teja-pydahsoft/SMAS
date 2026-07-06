export function buildDisplayInfo(formData, fields = []) {
  const sorted = [...fields].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const details = [];
  let displayName = null;
  let displayPhone = null;

  for (const field of sorted) {
    const value = formData?.[field.fieldId];
    if (value === undefined || value === null || value === '') continue;
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

  return { displayName, displayPhone, details };
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
