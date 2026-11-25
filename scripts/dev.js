// Starts the main server and one community game server together, in DEV mode.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, DEV: process.env.DEV ?? '1' };
const run = (name, file) => {
  const p = spawn(process.execPath, [path.join(root, file)], { env, cwd: root, stdio: 'inherit' });
  p.on('exit', (code) => { console.log(`[dev] ${name} exited (${code})`); process.exit(code ?? 1); });
  return p;
};
const main = run('main', 'main-server/server.js');
setTimeout(() => run('game', 'game-server/server.js'), 600);
process.on('SIGINT', () => { main.kill(); process.exit(0); });
