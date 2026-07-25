import fs from 'fs';
import path from 'path';
import jpeg from 'jpeg-js';
import { uploadDir } from './storage.js';
import { isCloudinaryEnabled, uploadToCloudinary } from '../services/cloudinaryService.js';

/**
 * Crop a face region from a JPEG buffer into a smaller JPEG Buffer.
 * @returns {Buffer|null}
 */
export function cropActivityFaceBuffer(imageBuffer, faceBox, { pad = 0.25, maxSide = 160 } = {}) {
  if (!imageBuffer?.length || !faceBox) return null;

  let decoded;
  try {
    decoded = jpeg.decode(imageBuffer, { useTArray: true, formatAsRGBA: true });
  } catch {
    return null;
  }

  const { width: imgW, height: imgH, data } = decoded;
  if (!imgW || !imgH || !data?.length) return null;

  const bx = Number(faceBox.x) || 0;
  const by = Number(faceBox.y) || 0;
  const bw = Math.max(1, Number(faceBox.width) || 1);
  const bh = Math.max(1, Number(faceBox.height) || 1);
  const padX = Math.floor(bw * pad);
  const padY = Math.floor(bh * pad);

  const x1 = Math.max(0, Math.floor(bx - padX));
  const y1 = Math.max(0, Math.floor(by - padY));
  const x2 = Math.min(imgW, Math.ceil(bx + bw + padX));
  const y2 = Math.min(imgH, Math.ceil(by + bh + padY));
  const cropW = Math.max(1, x2 - x1);
  const cropH = Math.max(1, y2 - y1);

  const cropData = Buffer.alloc(cropW * cropH * 4);
  for (let row = 0; row < cropH; row += 1) {
    const srcStart = ((y1 + row) * imgW + x1) * 4;
    const dstStart = row * cropW * 4;
    cropData.set(data.subarray(srcStart, srcStart + cropW * 4), dstStart);
  }

  let outW = cropW;
  let outH = cropH;
  let outData = cropData;
  const scale = Math.min(1, maxSide / Math.max(cropW, cropH));
  if (scale < 1) {
    outW = Math.max(1, Math.round(cropW * scale));
    outH = Math.max(1, Math.round(cropH * scale));
    outData = Buffer.alloc(outW * outH * 4);
    for (let y = 0; y < outH; y += 1) {
      const srcY = Math.min(cropH - 1, Math.floor(y / scale));
      for (let x = 0; x < outW; x += 1) {
        const srcX = Math.min(cropW - 1, Math.floor(x / scale));
        const si = (srcY * cropW + srcX) * 4;
        const di = (y * outW + x) * 4;
        outData[di] = cropData[si];
        outData[di + 1] = cropData[si + 1];
        outData[di + 2] = cropData[si + 2];
        outData[di + 3] = 255;
      }
    }
  }

  try {
    const encoded = jpeg.encode({ data: outData, width: outW, height: outH }, 85);
    return encoded?.data?.length ? Buffer.from(encoded.data) : null;
  } catch {
    return null;
  }
}

/**
 * Persist an activity face JPEG buffer the same way as gate/registration photos:
 * Cloudinary hosted URL when configured, otherwise local uploads/activity/.
 * @returns {Promise<{ photoPath: string, dataUrl: string } | null>}
 */
export async function persistActivityFaceBuffer(jpegBuffer, filenameHint = null) {
  if (!jpegBuffer?.length) return null;
  const dataUrl = `data:image/jpeg;base64,${jpegBuffer.toString('base64')}`;
  const filename = filenameHint || `activity-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  if (isCloudinaryEnabled()) {
    try {
      const result = await uploadToCloudinary(jpegBuffer, 'activity', filename);
      return { photoPath: result.url, dataUrl };
    } catch (err) {
      console.error('Cloudinary activity upload failed, falling back to local:', err.message);
    }
  }

  try {
    const dir = path.join(uploadDir, 'activity');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const localName = `${filename.replace(/\.[^.]+$/, '')}.jpg`;
    const photoPath = path.join(dir, localName);
    fs.writeFileSync(photoPath, jpegBuffer);
    return { photoPath, dataUrl };
  } catch (err) {
    console.warn('Failed to save activity face crop:', err.message);
    return null;
  }
}

/**
 * Crop from full frame + face box, then persist (Cloudinary or local).
 * @returns {Promise<{ photoPath: string, dataUrl: string } | null>}
 */
export async function cropAndSaveActivityFace(imageBuffer, faceBox, options = {}) {
  const jpegBuffer = cropActivityFaceBuffer(imageBuffer, faceBox, options);
  if (!jpegBuffer) return null;
  return persistActivityFaceBuffer(jpegBuffer);
}
