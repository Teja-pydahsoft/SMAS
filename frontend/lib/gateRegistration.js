const GATE_PHOTO_KEY = 'smas_gate_registration_photo';

export function saveGatePhotoForRegistration(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      try {
        sessionStorage.setItem(GATE_PHOTO_KEY, reader.result);
        resolve();
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function loadGatePhotoForRegistration() {
  if (typeof window === 'undefined') return null;
  try {
    const data = sessionStorage.getItem(GATE_PHOTO_KEY);
    if (!data) return null;
    const res = await fetch(data);
    return res.blob();
  } catch {
    return null;
  }
}

export function clearGatePhotoForRegistration() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(GATE_PHOTO_KEY);
  } catch {
    // ignore
  }
}

export function hasGatePhotoForRegistration() {
  if (typeof window === 'undefined') return false;
  try {
    return Boolean(sessionStorage.getItem(GATE_PHOTO_KEY));
  } catch {
    return false;
  }
}
