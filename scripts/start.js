// Production launcher for one hosted service (e.g. Render): runs the main server privately on
// 127.0.0.1:4000 and the game server on the public $PORT. The game server passes the petition,
// campaign and admin routes through to the main server, so everything shares one https address.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(root, process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });

// The two servers talk with a shared key. Keep it stable across restarts by storing it on the disk.
let key = process.env.SERVER_KEY;
if (!key) {
  const f = path.join(dataDir, '.server_key');
  key = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, key);
}

const publicUrl = (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, '');
const env = {
  ...process.env,
  DEV: process.env.DEV || '0',
  DATA_DIR: dataDir,
  SERVER_KEY: key,
  SERVER_KEYS: key,
  MAIN_PORT: '4000',
  MAIN_SERVER_URL: 'http://127.0.0.1:4000',
  MAIN_PUBLIC_URL: publicUrl,
  GAME_PORT: process.env.PORT || '3000',
  PROXY_MAIN: '1',
};

const run = (name, file) => {
  const p = spawn(process.execPath, [path.join(root, file)], { env, cwd: root, stdio: 'inherit' });
  p.on('exit', (code) => { console.log(`[start] ${name} exited (${code}); stopping so the host restarts the service`); process.exit(code || 1); });
  return p;
};
const main = run('main', 'main-server/server.js');
setTimeout(() => run('game', 'game-server/server.js'), 800);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { main.kill(); process.exit(0); });
console.log(`[start] Voices Rising starting at ${publicUrl}`);
