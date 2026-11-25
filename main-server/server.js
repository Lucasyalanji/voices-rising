// MAIN SERVER — the movement's home base.
// Owns: player profiles + login, real-life petition signatures (SQL), the shared campaign state,
// the archive of stage performances, and abuse reports. Community game servers talk to it with a server key.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { ROOT, loadEnv, sendJson, readBody, serveStatic, rateLimiter, clientIp, clean } from '../shared/server-util.js';
import { RULES, deriveCampaign, PETITION } from '../shared/rules.js';

const env = loadEnv();
const PORT = Number(env.MAIN_PORT || 4000);
const DEV = env.DEV === '1';
const DATA_DIR = path.resolve(ROOT, env.DATA_DIR || 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

function secretFromEnvOrFile(name, file) {
  if (env[name]) return env[name];
  const f = path.join(DATA_DIR, file);
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s);
  return s;
}
const TOKEN_SECRET = secretFromEnvOrFile('TOKEN_SECRET', '.token_secret');
const SERVER_KEYS = new Set((env.SERVER_KEYS || 'dev-server-key').split(',').map((s) => s.trim()).filter(Boolean));
const WEBHOOK_KEY = env.WEBHOOK_KEY || '';
const ADMIN_KEY = env.ADMIN_KEY || '';
if (SERVER_KEYS.has('dev-server-key')) console.warn('[main] WARNING: using default SERVER_KEYS=dev-server-key. Set SERVER_KEYS in .env before going public.');

// ---------------- Database ----------------
const db = new DatabaseSync(path.join(DATA_DIR, 'main.db'));
db.exec(`
PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL,
  pass_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  age INTEGER NOT NULL,
  mob TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  home_server TEXT DEFAULT '',
  met_elders INTEGER DEFAULT 0,
  culture_points INTEGER DEFAULT 0,
  supporters_recruited INTEGER DEFAULT 0,
  spies_caught INTEGER DEFAULT 0,
  sabotages INTEGER DEFAULT 0,
  performances INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  banned INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT,
  postcode TEXT NOT NULL,
  message TEXT DEFAULT '',
  ref_user TEXT DEFAULT '',
  source TEXT DEFAULT 'web',
  ip_hash TEXT DEFAULT '',
  hidden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS sig_email ON signatures(lower(email)) WHERE email IS NOT NULL AND email <> '';
CREATE UNIQUE INDEX IF NOT EXISTS sig_name_pc ON signatures(lower(full_name), postcode);
CREATE TABLE IF NOT EXISTS campaign (key TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS servers (name TEXT PRIMARY KEY, supporters INTEGER DEFAULT 0, last_seen TEXT);
CREATE TABLE IF NOT EXISTS voices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT DEFAULT '',
  body TEXT DEFAULT '',
  live INTEGER DEFAULT 0,
  listeners INTEGER DEFAULT 0,
  reactions INTEGER DEFAULT 0,
  server TEXT DEFAULT '',
  hidden INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wathaga_pushed (
  signature_id INTEGER PRIMARY KEY, status TEXT, pushed_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS wathaga_seen (
  response_id TEXT PRIMARY KEY, status TEXT, signature_id INTEGER, seen_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter_id INTEGER, target_id INTEGER, context TEXT, detail TEXT, server TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

const kvGet = db.prepare('SELECT value FROM campaign WHERE key = ?');
const kvSet = db.prepare('INSERT INTO campaign(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
const kvAdd = db.prepare('INSERT INTO campaign(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = MAX(0, value + excluded.value)');
const kv = (k) => kvGet.get(k)?.value ?? 0;
const sigCount = db.prepare('SELECT COUNT(*) AS n FROM signatures WHERE hidden = 0');

function campaign() {
  return deriveCampaign({
    signatures: sigCount.get().n,
    supporters: kv('supporters'),
    councilMarch: kv('council_march'),
    parliamentMarch: kv('parliament_march'),
    flagRaised: kv('flag_raised'),
    victory: kv('victory'),
  });
}

// ---------------- Auth ----------------
const b64u = (buf) => Buffer.from(buf).toString('base64url');
function signToken(user) {
  const payload = b64u(JSON.stringify({ uid: user.id, u: user.username, exp: Date.now() + 7 * 864e5 }));
  const sig = b64u(crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest());
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expect = b64u(crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest());
  if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
const hashPw = (pw, salt) => crypto.scryptSync(pw, salt, 64).toString('hex');

const getUser = db.prepare('SELECT * FROM users WHERE id = ?');
const getUserByName = db.prepare('SELECT * FROM users WHERE username = ?');
const refCount = db.prepare('SELECT COUNT(*) AS n FROM signatures WHERE ref_user = ? COLLATE NOCASE AND hidden = 0');

function profile(u) {
  return {
    id: u.id, username: u.username, displayName: u.display_name, age: u.age, mob: u.mob, bio: u.bio,
    homeServer: u.home_server, metElders: !!u.met_elders, culturePoints: u.culture_points,
    supportersRecruited: u.supporters_recruited, spiesCaught: u.spies_caught, sabotages: u.sabotages,
    performances: u.performances, gamesPlayed: u.games_played, signaturesReferred: refCount.get(u.username).n,
    createdAt: u.created_at,
  };
}

function authUser(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const data = verifyToken(t);
  if (!data) return null;
  const u = getUser.get(data.uid);
  return u && !u.banned ? u : null;
}
const isServer = (req) => SERVER_KEYS.has(req.headers['x-server-key']);
const isAdmin = (req) => ADMIN_KEY && req.headers['x-admin-key'] === ADMIN_KEY;

// ---------------- Rate limits ----------------
const authLimit = rateLimiter(30, 10 * 60e3);
const sigLimit = rateLimiter(25, 60 * 60e3);

// ---------------- Routes ----------------
const routes = {
  'GET /health': () => [200, { ok: true }],

  'GET /api/campaign': () => [200, { campaign: campaign(), rules: RULES, petition: PETITION }],

  'POST /api/register': async (req, body) => {
    if (!authLimit(clientIp(req))) return [429, { error: 'Too many attempts, try again soon.' }];
    const username = clean(body.username, 20);
    const displayName = clean(body.displayName || body.username, 24);
    const password = String(body.password || '');
    const age = Number(body.age);
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return [400, { error: 'Username: 3–20 letters, numbers or _' }];
    if (password.length < 8) return [400, { error: 'Password must be at least 8 characters.' }];
    if (!Number.isInteger(age) || age < 15 || age > 25) return [400, { error: 'Voices Rising is for young people aged 15–25.' }];
    if (getUserByName.get(username)) return [409, { error: 'That username is taken.' }];
    const salt = crypto.randomBytes(16).toString('hex');
    const home = clean(body.homeServer || req.headers['x-home-server'] || '', 60);
    const r = db
      .prepare('INSERT INTO users(username, display_name, pass_hash, salt, age, mob, home_server) VALUES(?,?,?,?,?,?,?)')
      .run(username, displayName, hashPw(password, salt), salt, age, clean(body.mob, 60), home);
    const u = getUser.get(r.lastInsertRowid);
    return [201, { token: signToken(u), profile: profile(u) }];
  },

  'POST /api/login': async (req, body) => {
    if (!authLimit(clientIp(req))) return [429, { error: 'Too many attempts, try again soon.' }];
    const u = getUserByName.get(clean(body.username, 20));
    if (!u) return [401, { error: 'No profile with that username on this server yet — tap "Join the movement" to create one.' }];
    if (hashPw(String(body.password || ''), u.salt) !== u.pass_hash) return [401, { error: 'That password does not match — try again.' }];
    if (u.banned) return [403, { error: 'This account has been suspended by a moderator.' }];
    return [200, { token: signToken(u), profile: profile(u) }];
  },

  'GET /api/me': (req) => {
    const u = authUser(req);
    return u ? [200, { profile: profile(u) }] : [401, { error: 'Not logged in' }];
  },

  'PATCH /api/profile': async (req, body) => {
    const u = authUser(req);
    if (!u) return [401, { error: 'Not logged in' }];
    db.prepare('UPDATE users SET display_name = ?, mob = ?, bio = ? WHERE id = ?').run(
      clean(body.displayName ?? u.display_name, 24) || u.display_name, clean(body.mob ?? u.mob, 60), clean(body.bio ?? u.bio, 280), u.id);
    return [200, { profile: profile(getUser.get(u.id)) }];
  },

  'GET /api/leaderboard': () => {
    const rows = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM signatures s WHERE s.ref_user = u.username COLLATE NOCASE AND s.hidden = 0) AS refs
      FROM users u WHERE banned = 0 ORDER BY (supporters_recruited + refs * 50 + culture_points * 5) DESC LIMIT 20`).all();
    const servers = db.prepare('SELECT name, supporters, last_seen FROM servers ORDER BY supporters DESC LIMIT 20').all();
    return [200, { players: rows.map((u) => ({ name: u.display_name, username: u.username, supporters: u.supporters_recruited, signatures: u.refs, spiesCaught: u.spies_caught, culture: u.culture_points })), servers }];
  },

  // ----- Real-life petition signatures (the "survey tool"), stored in SQL -----
  'POST /api/signatures': async (req, body) => {
    if (!sigLimit(clientIp(req))) return [429, { error: 'Too many signatures from this network right now — please try later.' }];
    const out = addSignature(req, body, 'web');
    if (out[0] === 201) queuePush();
    return out;
  },
  'POST /api/signatures/webhook': async (req, body) => {
    if (!WEBHOOK_KEY || req.headers['x-webhook-key'] !== WEBHOOK_KEY) return [401, { error: 'Bad webhook key' }];
    return addSignature(req, { ...body, consent: body.consent ?? true }, clean(body.source || 'survey', 30));
  },
  'GET /api/signatures/count': () => [200, { count: sigCount.get().n }],
  'GET /api/wathaga/status': () => [200, { enabled: !!WATHAGA.key && !!WATHAGA.survey, ref: WATHAGA.ref, ...wathagaState }],
  'POST /api/admin/wathaga-sync': async (req) => {
    if (!isAdmin(req)) return [401, { error: 'Bad admin key' }];
    await syncWathaga();
    return [200, { ...wathagaState, campaign: campaign() }];
  },

  'GET /api/voices': () => {
    const rows = db.prepare(`SELECT v.id, v.kind, v.title, v.body, v.live, v.listeners, v.reactions, v.created_at, u.display_name AS name
      FROM voices v JOIN users u ON u.id = v.user_id WHERE v.hidden = 0 ORDER BY v.id DESC LIMIT 50`).all();
    return [200, { voices: rows }];
  },

  // ----- Game-server endpoints (x-server-key) -----
  'POST /api/server/verify': (req, body) => {
    if (!isServer(req)) return [401, { error: 'Bad server key' }];
    const data = verifyToken(body.token);
    const u = data && getUser.get(data.uid);
    if (!u || u.banned) return [401, { error: 'Invalid session' }];
    db.prepare('UPDATE users SET games_played = games_played + 1 WHERE id = ?').run(u.id);
    return [200, { profile: profile(u) }];
  },

  'POST /api/server/report': (req, body) => {
    if (!isServer(req)) return [401, { error: 'Bad server key' }];
    const delta = Math.trunc(Number(body.supporters) || 0);
    const name = clean(body.serverName, 60) || 'unknown';
    const upd = db.prepare(`UPDATE users SET supporters_recruited = supporters_recruited + ?, spies_caught = spies_caught + ?,
      culture_points = culture_points + ?, sabotages = sabotages + ?, performances = performances + ?, met_elders = MAX(met_elders, ?) WHERE id = ?`);
    db.exec('BEGIN');
    try {
      if (delta) kvAdd.run('supporters', delta);
      db.prepare(`INSERT INTO servers(name, supporters, last_seen) VALUES(?, ?, datetime('now'))
        ON CONFLICT(name) DO UPDATE SET supporters = MAX(0, supporters + excluded.supporters), last_seen = excluded.last_seen`).run(name, delta);
      for (const [id, s] of Object.entries(body.users || {})) {
        const n = (k) => Math.trunc(Number(s[k]) || 0);
        upd.run(Math.max(0, n('supporters')), n('spiesCaught'), n('culture'), n('sabotages'), n('performances'), s.metElders ? 1 : 0, Number(id));
      }
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
    return [200, { campaign: campaign() }];
  },

  'POST /api/server/event': (req, body) => {
    if (!isServer(req)) return [401, { error: 'Bad server key' }];
    const allowed = ['council_march', 'parliament_march', 'flag_raised', 'victory'];
    if (!allowed.includes(body.type)) return [400, { error: 'Unknown event' }];
    kvSet.run(body.type, 1);
    return [200, { campaign: campaign() }];
  },

  'POST /api/server/voice': (req, body) => {
    if (!isServer(req)) return [401, { error: 'Bad server key' }];
    const kind = ['speech', 'poem', 'music'].includes(body.kind) ? body.kind : 'speech';
    const r = db.prepare('INSERT INTO voices(user_id, kind, title, body, live, listeners, reactions, server) VALUES(?,?,?,?,?,?,?,?)').run(
      Number(body.userId), kind, clean(body.title, 80), String(body.body || '').slice(0, 2000), body.live ? 1 : 0,
      Number(body.listeners) || 0, Number(body.reactions) || 0, clean(body.serverName, 60));
    return [200, { id: Number(r.lastInsertRowid) }];
  },

  'POST /api/server/abuse': (req, body) => {
    if (!isServer(req)) return [401, { error: 'Bad server key' }];
    db.prepare('INSERT INTO reports(reporter_id, target_id, context, detail, server) VALUES(?,?,?,?,?)').run(
      Number(body.reporterId) || null, Number(body.targetId) || null, clean(body.context, 40), clean(body.detail, 500), clean(body.serverName, 60));
    return [200, { ok: true }];
  },

  'POST /api/server/dev': (req, body) => {
    if (!DEV || !isServer(req)) return [403, { error: 'Dev tools disabled (set DEV=1 on the main server)' }];
    const sigs = Math.min(1000, Math.max(0, Math.trunc(Number(body.signatures) || 0)));
    const ins = db.prepare("INSERT INTO signatures(full_name, postcode, source) VALUES(?, '2000', 'dev')");
    for (let i = 0; i < sigs; i++) ins.run(`Test Signer ${crypto.randomUUID()}`);
    if (body.supporters) kvAdd.run('supporters', Math.trunc(Number(body.supporters)));
    if (body.reset) for (const k of ['supporters', 'council_march', 'parliament_march', 'flag_raised', 'victory']) kvSet.run(k, 0);
    if (body.reset) db.exec("DELETE FROM signatures WHERE source = 'dev'");
    return [200, { campaign: campaign() }];
  },

  // ----- Admin (x-admin-key) -----
  'GET /api/admin/signatures.csv': (req, _b, res) => {
    if (!isAdmin(req)) return [401, { error: 'Bad admin key' }];
    const rows = db.prepare('SELECT id, full_name, email, postcode, message, ref_user, source, hidden, created_at FROM signatures ORDER BY id').all();
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['id,full_name,email,postcode,message,ref_user,source,hidden,created_at', ...rows.map((r) => Object.values(r).map(esc).join(','))].join('\n');
    res.writeHead(200, { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="signatures.csv"' });
    res.end(csv);
    return null;
  },
  'POST /api/admin/signature-hide': (req, body) => {
    if (!isAdmin(req)) return [401, { error: 'Bad admin key' }];
    db.prepare('UPDATE signatures SET hidden = ? WHERE id = ?').run(body.hidden === false ? 0 : 1, Number(body.id));
    return [200, { campaign: campaign() }];
  },
  'GET /api/admin/reports': (req) => {
    if (!isAdmin(req)) return [401, { error: 'Bad admin key' }];
    return [200, { reports: db.prepare('SELECT * FROM reports ORDER BY id DESC LIMIT 200').all() }];
  },
  'POST /api/admin/voice-hide': (req, body) => {
    if (!isAdmin(req)) return [401, { error: 'Bad admin key' }];
    db.prepare('UPDATE voices SET hidden = 1 WHERE id = ?').run(Number(body.id));
    return [200, { ok: true }];
  },
  'POST /api/admin/ban': (req, body) => {
    if (!isAdmin(req)) return [401, { error: 'Bad admin key' }];
    db.prepare('UPDATE users SET banned = ? WHERE username = ?').run(body.banned === false ? 0 : 1, clean(body.username, 20));
    return [200, { ok: true }];
  },
  'POST /api/admin/reset-season': (req) => {
    if (!isAdmin(req)) return [401, { error: 'Bad admin key' }];
    for (const k of ['supporters', 'council_march', 'parliament_march', 'flag_raised', 'victory']) kvSet.run(k, 0);
    return [200, { campaign: campaign() }];
  },
};

function addSignature(req, body, source) {
  const fullName = clean(body.fullName || body.name, 80);
  const email = clean(body.email, 120).toLowerCase();
  const postcode = clean(body.postcode, 4);
  if (fullName.length < 2 || !/\s/.test(fullName)) return [400, { error: 'Please enter your first and last name.' }];
  if (!/^\d{4}$/.test(postcode)) return [400, { error: 'Please enter a 4-digit Australian postcode.' }];
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return [400, { error: 'That email doesn\'t look right.' }];
  if (!(body.consent === true || body.consent === 'true' || body.consent === 'on')) return [400, { error: 'Please tick the consent box to add your name.' }];
  const ipHash = crypto.createHash('sha256').update(clientIp(req) + TOKEN_SECRET).digest('hex').slice(0, 16);
  try {
    db.prepare('INSERT INTO signatures(full_name, email, postcode, message, ref_user, source, ip_hash) VALUES(?,?,?,?,?,?,?)').run(
      fullName, email || null, postcode, clean(body.message, 300), clean(body.ref, 20), source, ipHash);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return [409, { error: 'Looks like you have already signed — thank you!' }];
    throw e;
  }
  return [201, { ok: true, campaign: campaign() }];
}

// ---------------- Wathaga survey sync (pull) ----------------
// Pulls individual responses from a Wathaga survey and records each consenting response as a petition
// signature credited to WATHAGA_REF. Works from localhost: the main server calls out, nothing calls in.
const WATHAGA = {
  base: (env.WATHAGA_API_BASE || 'https://wa-94c3c68cd4324da49926d5fc33037f8a.ecs.ap-southeast-2.on.aws/api/v1').replace(/[/]+$/, ''),
  key: env.WATHAGA_API_KEY || '',
  survey: env.WATHAGA_SURVEY_ID || '',
  ref: clean(env.WATHAGA_REF || '', 20),
  every: Math.max(30, Number(env.WATHAGA_POLL_SECONDS) || 60),
};
const wathagaState = { lastSync: null, lastError: null, imported: 0, duplicates: 0, declined: 0, invalid: 0, totalResponses: null, questions: null, pushed: 0, pushPending: 0, pushError: null };
const seenGet = db.prepare('SELECT 1 FROM wathaga_seen WHERE response_id = ?');
const seenAdd = db.prepare('INSERT OR IGNORE INTO wathaga_seen(response_id, status, signature_id) VALUES(?,?,?)');
let wathagaBusy = false;

async function wathagaGet(path, payload) {
  const r = await fetch(WATHAGA.base + path, {
    method: payload ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${WATHAGA.key}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(15000),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Wathaga ${r.status}: ${body.error?.message || body.error?.code || 'request failed'}`);
  return body;
}
const textOf = (q) => String(q.text ?? q.wording ?? q.title ?? q.label ?? q.question ?? '');
function questionRoles(questions) {
  const roles = {};
  for (const q of questions) {
    const t = textOf(q).toLowerCase();
    if (!roles.message && /why/.test(t)) roles.message = q.id;
    else if (!roles.email && /e-?mail/.test(t)) roles.email = q.id;
    else if (!roles.postcode && /post ?code|zip/.test(t)) roles.postcode = q.id;
    else if (!roles.fullName && /name/.test(t)) roles.fullName = q.id;
    else if (!roles.consent && /signature|consent|agree|sign/.test(t)) roles.consent = q.id;
  }
  return roles;
}
function answerOf(resp, qid, questions) {
  const a = resp.answers ?? resp.values ?? resp.data ?? {};
  let v;
  if (Array.isArray(a)) {
    const hit = a.find((x) => (x.questionId ?? x.question_id ?? x.id ?? x.question?.id) === qid);
    v = hit && (hit.value ?? hit.answer ?? hit.text ?? hit.choice ?? hit.choices);
  } else {
    v = a[qid];
    if (v === undefined) { const q = questions.find((x) => x.id === qid); if (q) v = a[textOf(q)]; }
  }
  if (Array.isArray(v)) v = v.join(', ');
  if (v && typeof v === 'object') v = v.value ?? v.label ?? v.text ?? JSON.stringify(v);
  return v == null ? '' : String(v).trim();
}

async function syncWathaga() {
  if (!WATHAGA.key || !WATHAGA.survey || wathagaBusy) return;
  wathagaBusy = true;
  try {
    const survey = (await wathagaGet(`/surveys/${encodeURIComponent(WATHAGA.survey)}`)).data || {};
    const questions = survey.questions || [];
    const roles = questionRoles(questions);
    wathagaState.questions = Object.fromEntries(Object.entries(roles).map(([k, id]) => [k, textOf(questions.find((q) => q.id === id) || {})]));
    if (!roles.fullName || !roles.postcode) throw new Error('Could not find the name and postcode questions in the survey.');
    const fake = { headers: {}, socket: { remoteAddress: 'wathaga' } };
    for (let offset = 0; ; offset += 1000) {
      const page = await wathagaGet(`/surveys/${encodeURIComponent(WATHAGA.survey)}/responses?limit=1000&offset=${offset}`);
      const rows = Array.isArray(page.data) ? page.data : page.data?.responses || [];
      wathagaState.totalResponses = page.page?.total ?? rows.length;
      for (const resp of rows) {
        const rid = String(resp.id ?? resp.responseId ?? `${resp.createdAt}-${JSON.stringify(resp.answers ?? '').length}`);
        if (seenGet.get(rid)) continue;
        const consentAns = roles.consent ? answerOf(resp, roles.consent, questions) : 'yes';
        if (!/^(y|yes|true|i agree|agree)/i.test(consentAns)) { seenAdd.run(rid, 'declined', null); wathagaState.declined++; continue; }
        const [status, out] = addSignature(fake, {
          fullName: answerOf(resp, roles.fullName, questions), postcode: answerOf(resp, roles.postcode, questions),
          email: roles.email ? answerOf(resp, roles.email, questions) : '', message: roles.message ? answerOf(resp, roles.message, questions) : '',
          ref: WATHAGA.ref, consent: true,
        }, 'wathaga');
        if (status === 201) { seenAdd.run(rid, 'imported', null); wathagaState.imported++; }
        else if (status === 409) { seenAdd.run(rid, 'duplicate', null); wathagaState.duplicates++; }
        else { seenAdd.run(rid, 'invalid: ' + out.error, null); wathagaState.invalid++; }
      }
      if (rows.length < 1000) break;
    }
    await pushToWathaga(questions, roles);
    wathagaState.lastError = null;
  } catch (e) {
    wathagaState.lastError = e.message;
    console.warn('[main] Wathaga sync:', e.message);
  } finally {
    wathagaState.lastSync = new Date().toISOString();
    wathagaBusy = false;
  }
}
// Petition -> Wathaga: every signature not yet sent (including ones made before the link) becomes a survey response.
const unpushed = db.prepare(`SELECT s.* FROM signatures s LEFT JOIN wathaga_pushed p ON p.signature_id = s.id
  WHERE p.signature_id IS NULL AND s.hidden = 0 AND s.source NOT IN ('wathaga', 'dev') ORDER BY s.id LIMIT 200`);
const markPushed = db.prepare('INSERT OR REPLACE INTO wathaga_pushed(signature_id, status) VALUES(?, ?)');
async function pushToWathaga(questions, roles) {
  const pending = unpushed.all();
  wathagaState.pushPending = pending.length;
  const consentQ = questions.find((q) => q.id === roles.consent);
  const yes = (consentQ?.options || []).map((o) => (typeof o === 'string' ? o : o.label ?? o.value)).find((o) => /^y/i.test(String(o))) || 'Yes';
  for (const sig of pending) {
    const answers = { [roles.fullName]: sig.full_name, [roles.postcode]: sig.postcode };
    if (roles.consent) answers[roles.consent] = yes;
    if (roles.email && sig.email) answers[roles.email] = sig.email;
    if (roles.message && sig.message) answers[roles.message] = sig.message;
    try {
      const out = await wathagaGet(`/surveys/${encodeURIComponent(WATHAGA.survey)}/responses`, { answers });
      markPushed.run(sig.id, 'sent');
      const rid = out?.data?.id ?? out?.data?.responseId;
      if (rid) seenAdd.run(String(rid), 'from-petition', sig.id); // don't pull our own copy back in
      wathagaState.pushed++;
      wathagaState.pushPending--;
      wathagaState.pushError = null;
    } catch (e) {
      wathagaState.pushError = /403|missing_scope|permission/i.test(e.message)
        ? 'The Wathaga key needs the "Send data in" permission to send petition signatures into the survey.' : e.message;
      if (/400/.test(e.message)) markPushed.run(sig.id, 'rejected: ' + e.message.slice(0, 200)); // bad data: don't retry forever
      else break; // auth / survey closed / network: retry next cycle
    }
  }
}
let pushSoon = null;
const queuePush = () => { if (WATHAGA.key && WATHAGA.survey && !pushSoon) pushSoon = setTimeout(() => { pushSoon = null; syncWathaga(); }, 1500); };

if (WATHAGA.key && WATHAGA.survey) {
  console.log(`[main] Wathaga sync on: survey ${WATHAGA.survey}, credited to "${WATHAGA.ref || '(nobody)'}", every ${WATHAGA.every}s`);
  syncWathaga();
  setInterval(syncWathaga, WATHAGA.every * 1000).unref();
} else console.log('[main] Wathaga sync off (set WATHAGA_API_KEY and WATHAGA_SURVEY_ID in .env to turn it on)');

// ---------------- HTTP ----------------
const PUBLIC = path.join(ROOT, 'main-server', 'public');
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.end();
  const handler = routes[`${req.method} ${url.pathname}`];
  try {
    if (handler) {
      const body = req.method === 'GET' ? {} : await readBody(req);
      const out = await handler(req, body, res);
      if (out) sendJson(res, out[0], out[1]);
      return;
    }
    if (req.method === 'GET') {
      const page = { '/': 'petition.html', '/petition': 'petition.html', '/voices': 'voices.html' }[url.pathname];
      if (serveStatic(req, res, PUBLIC, page || url.pathname)) return;
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('[main]', e);
    sendJson(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  }
});
server.listen(PORT, () => console.log(`[main] Voices Rising MAIN server on http://localhost:${PORT}  (petition: /petition)`));
