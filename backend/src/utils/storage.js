import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

export function ensureUploadDirs() {
  // Only create local dirs if Cloudinary is NOT configured (local fallback)
  if (process.env.CLOUDINARY_CLOUD_NAME) return;
  const dirs = ['registrations', 'registrations-media', 'gate'].map((sub) => path.join(uploadDir, sub));
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function getUploadPath(subfolder, filename) {
  return path.join(uploadDir, subfolder, filename);
}

/**
 * Returns a multer instance.
 * - If Cloudinary is configured: uses memoryStorage (buffer only, nothing written to disk)
 * - Otherwise: writes to local uploadDir/subfolder
 */
export function createMulter(subfolder, filenameFn) {
  const useMemory = Boolean(process.env.CLOUDINARY_CLOUD_NAME);

  const storage = useMemory
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => {
          const dir = path.join(uploadDir, subfolder);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, filenameFn(req, file));
        },
      });

  return multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/') || file.mimetype === 'application/octet-stream') {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed'));
      }
    },
  });
}

/**
 * Multer for registration media/document uploads — accepts any file type.
 */
export function createMediaMulter(subfolder, filenameFn) {
  const useMemory = Boolean(process.env.CLOUDINARY_CLOUD_NAME);

  const storage = useMemory
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: (req, file, cb) => {
          const dir = path.join(uploadDir, subfolder);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        filename: (req, file, cb) => {
          cb(null, filenameFn(req, file));
        },
      });

  return multer({
    storage,
    limits: { fileSize: 20 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, true),
  });
}
