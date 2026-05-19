/**
 * test-setup.ts
 * Di-load sebelum setiap test file berjalan.
 * Memuat environment variables dari .env.test.
 */
import * as fs from 'fs';
import * as path from 'path';

const envTestPath = path.resolve(__dirname, '..', '.env.test');
if (fs.existsSync(envTestPath)) {
  const content = fs.readFileSync(envTestPath, 'utf-8');
  content.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=');
    if (key && value !== undefined && !process.env[key]) {
      process.env[key] = value;
    }
  });
}
