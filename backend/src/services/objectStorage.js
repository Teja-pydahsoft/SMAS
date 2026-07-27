import {
  isCloudinaryEnabled,
  uploadToCloudinary,
  uploadMediaToCloudinary,
  deleteFromCloudinary,
  deleteMediaFromCloudinary,
  extractPublicId,
} from './cloudinaryService.js';
import {
  isS3Enabled,
  uploadToS3,
  deleteFromS3,
  isS3Url,
  extractS3Key,
} from './s3StorageService.js';

/**
 * Prefer S3 when configured; otherwise Cloudinary; otherwise local disk (caller handles).
 */
export function isObjectStorageEnabled() {
  return isS3Enabled() || isCloudinaryEnabled();
}

export function getObjectStorageProvider() {
  if (isS3Enabled()) return 's3';
  if (isCloudinaryEnabled()) return 'cloudinary';
  return 'local';
}

export async function uploadPhoto(buffer, folder, filename = null, contentType = 'image/jpeg') {
  if (isS3Enabled()) {
    return uploadToS3(buffer, folder, filename, contentType);
  }
  if (isCloudinaryEnabled()) {
    return uploadToCloudinary(buffer, folder, filename);
  }
  throw new Error('No cloud object storage configured');
}

export async function uploadMedia(buffer, folder, filename = null, contentType = 'application/octet-stream') {
  if (isS3Enabled()) {
    return uploadToS3(buffer, folder, filename, contentType);
  }
  if (isCloudinaryEnabled()) {
    return uploadMediaToCloudinary(buffer, folder, filename);
  }
  throw new Error('No cloud object storage configured');
}

export async function deleteStoredObject(urlOrPath, resourceType = 'image') {
  if (!urlOrPath || typeof urlOrPath !== 'string') return;

  if (isS3Url(urlOrPath)) {
    await deleteFromS3(urlOrPath);
    return;
  }

  if (urlOrPath.includes('cloudinary.com')) {
    const publicId = extractPublicId(urlOrPath);
    if (resourceType && resourceType !== 'image') {
      await deleteMediaFromCloudinary(publicId, resourceType);
    } else {
      await deleteFromCloudinary(publicId);
    }
  }
}

export async function deleteStoredMedia(urlOrPath, resourceType = 'image') {
  if (!urlOrPath || typeof urlOrPath !== 'string') return;

  if (isS3Url(urlOrPath)) {
    await deleteFromS3(urlOrPath);
    return;
  }

  if (urlOrPath.includes('cloudinary.com')) {
    const publicId = extractPublicId(urlOrPath);
    await deleteMediaFromCloudinary(publicId, resourceType);
  }
}

export { isS3Enabled, isCloudinaryEnabled, isS3Url, extractS3Key };
