import {spawn} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const mobileDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const metro = spawn('pnpm', ['start', '--reset-cache', '--max-workers=2'], {
  cwd: mobileDirectory,
  env: {
    ...process.env,
    API_URL: 'https://staging-api.lazisnu.site',
  },
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

metro.on('error', error => {
  console.error(`Failed to start staging Metro: ${error.message}`);
  process.exitCode = 1;
});

metro.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 0);
});
