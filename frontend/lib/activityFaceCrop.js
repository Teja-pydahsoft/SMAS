/**
 * Crop a face region from a captured image Blob using detector face_box coords.
 * Returns a JPEG data URL, or null if cropping fails.
 */
export async function cropFaceDataUrlFromBlob(blob, faceBox, { pad = 0.25, size = 160 } = {}) {
  if (!blob || !faceBox) return null;
  if (typeof createImageBitmap !== 'function') return null;

  let bitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }

  try {
    const bx = Number(faceBox.x) || 0;
    const by = Number(faceBox.y) || 0;
    const bw = Math.max(1, Number(faceBox.width) || 1);
    const bh = Math.max(1, Number(faceBox.height) || 1);
    const padX = Math.floor(bw * pad);
    const padY = Math.floor(bh * pad);
    const sx = Math.max(0, Math.floor(bx - padX));
    const sy = Math.max(0, Math.floor(by - padY));
    const sw = Math.max(1, Math.min(bitmap.width - sx, Math.ceil(bw + padX * 2)));
    const sh = Math.max(1, Math.min(bitmap.height - sy, Math.ceil(bh + padY * 2)));

    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, size, size);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return null;
  } finally {
    bitmap.close?.();
  }
}

export async function enrichPeopleWithFaceCrops(blob, people = []) {
  if (!blob || !people.length) return people;
  const next = [];
  for (const person of people) {
    if (person.faceCropDataUrl || person.photoUrl) {
      next.push(person);
      continue;
    }
    const crop = await cropFaceDataUrlFromBlob(blob, person.faceBox);
    next.push(crop ? { ...person, faceCropDataUrl: crop } : person);
  }
  return next;
}

export async function enrichUnmatchedWithFaceCrops(blob, faces = []) {
  if (!blob || !faces.length) return faces;
  const next = [];
  for (const face of faces) {
    if (face.faceCropDataUrl || face.photoUrl) {
      next.push(face);
      continue;
    }
    const crop = await cropFaceDataUrlFromBlob(blob, face.faceBox);
    next.push(crop ? { ...face, faceCropDataUrl: crop } : face);
  }
  return next;
}
