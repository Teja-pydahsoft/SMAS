import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../../uploads');

export function ensureUploadDirs() {
  const dirs = ['registrations', 'gate'].map((sub) => path.join(uploadDir, sub));
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function getUploadPath(subfolder, filename) {
  return path.join(uploadDir, subfolder, filename);
}

export { uploadDir };
