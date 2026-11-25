// Uploads a licensed song to the live server's disk (it is kept out of the public git repo).
// Usage:  node scripts/upload-media.mjs client/media/black-boy.mp3 https://voices-rising-qnm6.onrender.com
// It asks for the ADMIN_KEY (Render → voices-rising → Environment → ADMIN_KEY → reveal) and never stores it.
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

const [file, server = 'https://voices-rising-qnm6.onrender.com'] = process.argv.slice(2);
if (!file || !fs.existsSync(file)) { console.error('Give the MP3 to upload, e.g. client/media/black-boy.mp3'); process.exit(1); }
const name = path.basename(file).toLowerCase();
const key = process.env.ADMIN_KEY || await new Promise((res) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('Paste the ADMIN_KEY from Render, then press Enter: ', (a) => { rl.close(); res(a.trim()); });
});
const body = fs.readFileSync(file);
console.log(`Uploading ${name} (${(body.length / 1048576).toFixed(1)} MB) to ${server} …`);
const r = await fetch(`${server.replace(/\/$/, '')}/media-upload?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'x-admin-key': key, 'Content-Type': 'audio/mpeg' }, body });
const d = await r.json().catch(() => ({}));
if (!r.ok) { console.error('Upload failed:', d.error || r.status); process.exit(1); }
console.log('Done. Songs now on the server:', (d.songs || []).join(', '));
