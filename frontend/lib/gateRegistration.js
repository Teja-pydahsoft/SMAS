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
  const data = sessionStorage.getItem(GATE_PHOTO_KEY);
  if (!data) return null;
  const res = await fetch(data);
  return res.blob();
}

export function clearGatePhotoForRegistration() {
  sessionStorage.removeItem(GATE_PHOTO_KEY);
}

export function hasGatePhotoForRegistration() {
  return Boolean(sessionStorage.getItem(GATE_PHOTO_KEY));
}
