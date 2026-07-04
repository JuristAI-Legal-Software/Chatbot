import fs from 'node:fs';
import path from 'node:path';
import { KeyvFile } from 'keyv-file';

const dataDir = path.resolve(__dirname, '../../data');
const emptyKeyvPayload = JSON.stringify({ cache: [], lastExpire: 0 });

function prepareKeyvFile(filename: string): string {
  const filePath = path.join(dataDir, filename);
  fs.mkdirSync(dataDir, { recursive: true });

  try {
    const existing = fs.readFileSync(filePath, 'utf8');
    JSON.parse(existing);
  } catch (error) {
    const missingFile = (error as NodeJS.ErrnoException)?.code === 'ENOENT';
    if (!missingFile) {
      const backupPath = `${filePath}.corrupt-${Date.now()}`;
      try {
        fs.copyFileSync(filePath, backupPath);
      } catch {
        // Best-effort backup only; we still want to recover the store.
      }
    }
    fs.writeFileSync(filePath, emptyKeyvPayload, 'utf8');
  }

  return filePath;
}

export const logFile = new KeyvFile({ filename: prepareKeyvFile('logs.json') }).setMaxListeners(20);
export const violationFile = new KeyvFile({ filename: prepareKeyvFile('violations.json') }).setMaxListeners(
  20,
);
