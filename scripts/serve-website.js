// Serves voices-rising/website on http://localhost:5173 for previewing.
import http from 'node:http';
import { ROOT, serveStatic } from '../shared/server-util.js';
import path from 'node:path';
const dir = path.join(ROOT, 'website');
http.createServer((req, res) => { if (!serveStatic(req, res, dir, new URL(req.url, 'http://x').pathname)) { res.writeHead(404); res.end('Not found'); } })
  .listen(5173, () => console.log('website on http://localhost:5173'));
