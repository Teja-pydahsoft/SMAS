import { rmSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const dir of ['.next', '.turbo']) {
  const path = join(root, dir);
  if (existsSync(path)) {
    rmSync(path, { recursive: true, force: true });
    console.log(`Removed ${dir}/`);
  }
}

console.log('Frontend cache cleared.');
