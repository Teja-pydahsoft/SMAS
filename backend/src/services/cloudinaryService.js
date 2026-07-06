import { v2 as cloudinary } from 'cloudinary';

const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

if (CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET) {
  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
  });
  console.log('✓ Cloudinary configured');
} else {
  console.warn('⚠ Cloudinary not configured — using local storage fallback');
}

export function isCloudinaryEnabled() {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
}

/**
 * Upload a file buffer to Cloudinary
 * @param {Buffer} buffer - File buffer
 * @param {string} folder - Cloudinary folder (registrations/gate)
 * @param {string} filename - Optional filename (used as public_id)
 * @returns {Promise<{url: string, publicId: string}>}
 */
export async function uploadToCloudinary(buffer, folder, filename = null) {
  return new Promise((resolve, reject) => {
    const options = {
      folder: `smas/${folder}`,
      resource_type: 'image',
      format: 'jpg',
    };

    if (filename) {
      // Strip extension and use as public_id to avoid duplicates
      options.public_id = filename.replace(/\.[^.]+$/, '');
    }

    const uploadStream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      resolve({
        url: result.secure_url,
        publicId: result.public_id,
      });
    });

    uploadStream.end(buffer);
  });
}

/**
 * Delete a file from Cloudinary by public_id
 * @param {string} publicId - Cloudinary public_id (e.g., "smas/registrations/abc123")
 * @returns {Promise<void>}
 */
export async function deleteFromCloudinary(publicId) {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error('Failed to delete from Cloudinary:', err.message);
  }
}

/**
 * Extract public_id from a Cloudinary URL
 * @param {string} url - Full Cloudinary URL
 * @returns {string|null}
 */
export function extractPublicId(url) {
  if (!url || !url.includes('cloudinary.com')) return null;
  // Example URL: https://res.cloudinary.com/dzq7kihy/image/upload/v1234567890/smas/registrations/abc123.jpg
  const match = url.match(/\/v\d+\/(.+)\.\w+$/);
  return match ? match[1] : null;
}
