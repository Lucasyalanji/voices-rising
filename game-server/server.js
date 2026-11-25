// COMMUNITY GAME SERVER — anyone can run one. Players log in here; their profile lives on the MAIN server.
// Runs the realtime 3D world: rallies, red spies, Yarning Circle votes, marches, the Town Hall stage
// (with WebRTC live-audio signalling) and the Parliament flag finale.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocketServer } from 'ws';
import { ROOT, loadEnv, sendJson, readBody, serveStatic, clean, clientIp } from '../shared/server-util.js';
import { RULES, deriveCampaign, politicianName } from '../shared/rules.js';
import * as MAP from '../shared/mapdata.js';

const env = loadEnv();
const PORT = Number(env.GAME_PORT || 3000);
const MAIN = (env.MAIN_SERVER_URL || 'http://localhost:4000').replace(/\/$/, '');
const MAIN_PUBLIC = (env.MAIN_PUBLIC_URL || MAIN).replace(/\/$/, '');
const KEY = env.SERVER_KEY || 'dev-server-key';
const NAME = clean(env.SERVER_NAME || 'Gadigal Community Server', 60);
const DEV = env.DEV === '1';
let ICE = [{ urls: 'stun:stun.l.google.com:19302' }];
try { if (env.ICE_SERVERS) ICE = JSON.parse(env.ICE_SERVERS); } catch { console.warn('[game] ICE_SERVERS is not valid JSON, using default STUN'); }

// ---------------- Main-server API ----------------
async function mainApi(pathname, body, extraHeaders = {}) {
  const r = await fetch(MAIN + pathname, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', 'x-server-key': KEY, 'x-home-server': NAME, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// ---------------- World state ----------------
const now = () => Date.now();
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let campaign = deriveCampaign({});
let pending = { supporters: 0, users: {} };
const players = new Map(); // id -> player
let nextId = 1;

const rallies = MAP.RALLIES.map((r) => ({ ...r, progress: 0, disrupted: false, clear: 0, cooldownUntil: 0 }));
let npcs = [];
let npcNextId = 1;
let meeting = null;
let meetingCooldownUntil = 0;
let march = null; // { route, d, length, participants:Set }
let flag = { progress: 0 };
let stage = { performer: null, queue: [] };

function credit(p, key, n) {
  if (!p?.userId) return;
  const u = (pending.users[p.userId] ||= {});
  u[key] = (u[key] || 0) + n;
}
function addSupporters(n, contributors = []) {
  n = Math.round(n);
  if (!n) return;
  pending.supporters += n;
  campaign.supporters = Math.max(0, campaign.supporters + n);
  const share = Math.max(1, Math.round(n / Math.max(1, contributors.length)));
  if (n > 0) for (const p of contributors) credit(p, 'supporters', share);
}

const send = (p, msg) => p.ws.readyState === 1 && p.ws.send(JSON.stringify(msg));
const broadcast = (msg, except) => {
  const s = JSON.stringify(msg);
  for (const p of players.values()) if (p !== except && p.ws.readyState === 1) p.ws.send(s);
};
const toastAll = (text, kind = 'info') => broadcast({ t: 'toast', text, kind });
const active = () => [...players.values()].filter((p) => !p.ejectedUntil);

function zoneUnlocked(z) {
  return !!campaign.unlocked[z];
}

// ---------------- NPC wandering youth (some are disguised AI spies) ----------------
function spawnPoint() {
  const opts = rallies.filter((r) => zoneUnlocked(r.zone));
  const r = pick(opts.length ? opts : rallies.slice(0, 3));
  const a = rand(0, Math.PI * 2), d = rand(12, 35);
  return { x: r.x + Math.cos(a) * d, z: r.z + Math.sin(a) * d };
}
function wantedAiSpies() {
  const reds = [...players.values()].filter((p) => p.role === 'red' && !p.ejectedUntil).length;
  return Math.max(1, 3 - reds);
}
function spawnNpc() {
  const sp = spawnPoint();
  const spies = npcs.filter((n) => n.spy && n.state < 2).length;
  const npc = { id: npcNextId++, x: sp.x, z: sp.z, tx: sp.x, tz: sp.z, state: 0, spy: spies < wantedAiSpies(), seed: Math.floor(Math.random() * 1e6), idleUntil: 0, nextSab: now() + rand(30e3, 60e3), talkUntil: 0, removeAt: 0 };
  npcs.push(npc);
}
function npcRetarget(n) {
  const opts = rallies.filter((r) => zoneUnlocked(r.zone));
  const r = pick(opts.length ? opts : rallies.slice(0, 3));
  n.target = r;
  n.tx = r.x + rand(-14, 14);
  n.tz = r.z + rand(-14, 14);
}

// ---------------- Roles (red spies among players) ----------------
function rebalanceRoles() {
  const act = active();
  const eligible = act.filter((p) => p.metElders && !p.performing);
  const desired = act.length >= RULES.MIN_PLAYERS_FOR_RED ? Math.max(1, Math.floor(act.length / 4)) : 0;
  const reds = act.filter((p) => p.role === 'red');
  if (reds.length < desired) {
    const blues = eligible.filter((p) => p.role === 'blue' && now() - (p.lastRoleChange || 0) > 60e3);
    if (blues.length) {
      const p = pick(blues);
      p.role = 'red';
      p.lastRoleChange = now();
      send(p, { t: 'role', role: 'red', reason: 'The Crown has quietly recruited you as a RED spy. Sabotage rallies (Q) and heckle the stage — but don\'t get voted out of the City.' });
      for (const r of reds) send(r, { t: 'toast', text: `${p.name} has joined the Reds.`, kind: 'red' });
    }
  } else if (reds.length > desired) {
    const p = pick(reds);
    p.role = 'blue';
    p.lastRoleChange = now();
    send(p, { t: 'role', role: 'blue', reason: 'Your spy mission is over. You\'ve heard the Elders — you\'re BLUE now. Stand with the movement.' });
  }
}

// ---------------- Rallies & sabotage ----------------
function sabotage(rally, byPlayer) {
  if (rally.disrupted) return false;
  rally.disrupted = true;
  rally.clear = 0;
  rally.progress = 0;
  addSupporters(-RULES.SABOTAGE_PENALTY);
  if (byPlayer) credit(byPlayer, 'sabotages', 1);
  toastAll(`⚠ A rumour is spreading at ${rally.name}! −${RULES.SABOTAGE_PENALTY} supporters. Go clear it (hold E).`, 'red');
  return true;
}

// ---------------- Meetings (Yarning Circle vote) ----------------
function callMeeting(p) {
  const act = active();
  const min = DEV ? 1 : RULES.MIN_PLAYERS_FOR_VOTE;
  if (meeting) return send(p, { t: 'toast', text: 'A vote is already happening.', kind: 'warn' });
  if (now() < meetingCooldownUntil) return send(p, { t: 'toast', text: `The Yarning Circle can be called again in ${Math.ceil((meetingCooldownUntil - now()) / 1000)}s.`, kind: 'warn' });
  if (act.length < min) return send(p, { t: 'toast', text: `You need at least ${min} players in the City to call a vote.`, kind: 'warn' });
  meeting = { endsAt: now() + RULES.VOTE_TIME * 1000, votes: new Map(), calledBy: p.name, voters: new Set(act.map((x) => x.id)) };
  broadcast({ t: 'meeting', calledBy: p.name, endsAt: meeting.endsAt, candidates: act.map((x) => ({ id: x.id, name: x.name })) });
}
function resolveMeeting() {
  const tally = new Map();
  let skip = 0;
  for (const [, target] of meeting.votes) {
    if (target === 'skip') skip++;
    else tally.set(target, (tally.get(target) || 0) + 1);
  }
  let top = null, topN = 0, tie = false;
  for (const [id, n] of tally) {
    if (n > topN) { top = id; topN = n; tie = false; }
    else if (n === topN) tie = true;
  }
  const result = { t: 'meetingResult', tally: [...tally].map(([id, n]) => ({ id, name: players.get(id)?.name || '?', n })), skip };
  const target = !tie && topN > skip ? players.get(top) : null;
  if (target) {
    const wasRed = target.role === 'red';
    result.ejected = { id: target.id, name: target.name, wasRed };
    target.revealed = true;
    target.ejectedUntil = now() + (wasRed ? RULES.EJECT_RED_MS : RULES.EJECT_BLUE_MS);
    target.x = MAP.OUTSKIRTS.x; target.z = MAP.OUTSKIRTS.z; target.teleportGrace = now() + 2000;
    send(target, { t: 'ejected', until: target.ejectedUntil, wasRed, x: target.x, z: target.z });
    if (target.performing) finishPerformance(false);
    stage.queue = stage.queue.filter((q) => q.id !== target.id);
    for (const [voter, t] of meeting.votes) {
      const v = players.get(voter);
      if (!v) continue;
      if (wasRed && t === target.id) { credit(v, 'spiesCaught', 1); credit(v, 'culture', 10); }
    }
    if (!wasRed) addSupporters(-RULES.WRONG_VOTE_PENALTY);
  }
  broadcast(result);
  meeting = null;
  meetingCooldownUntil = now() + RULES.MEETING_COOLDOWN * 1000;
}

// ---------------- Stage (Town Hall main stage) ----------------
function stageState() {
  const s = stage.performer;
  return {
    t: 'stage',
    performer: s && { id: s.id, name: s.name, kind: s.kind, title: s.title, lines: s.lines, startedAt: s.startedAt, endsAt: s.endsAt, live: s.live, reactions: s.reactions },
    queue: stage.queue.map((q) => q.name),
  };
}
function startNextPerformance() {
  if (stage.performer) return;
  while (stage.queue.length) {
    const q = stage.queue.shift();
    const p = players.get(q.id);
    if (!p || p.ejectedUntil) continue;
    const words = q.body.split(/\s+/).filter(Boolean).length;
    const secs = q.live ? RULES.STAGE_MAX_SECONDS : Math.min(RULES.STAGE_MAX_SECONDS, Math.max(20, words / 2.2 + 8));
    stage.performer = { ...q, startedAt: now(), endsAt: now() + secs * 1000, reactions: 0, reporters: new Set(), listeners: new Set() };
    p.performing = true;
    p.x = MAP.STAGE.x + 3; p.z = MAP.STAGE.z; p.teleportGrace = now() + 2000;
    send(p, { t: 'teleport', x: p.x, z: p.z, yaw: MAP.STAGE.yaw });
    toastAll(`🎤 ${p.name} takes the Town Hall stage with a ${q.kind}${q.live ? ' — LIVE' : ''}: “${q.title || 'Untitled'}”`, 'blue');
    break;
  }
  broadcast(stageState());
}
function finishPerformance(complete, reason = '') {
  const s = stage.performer;
  if (!s) return;
  const p = players.get(s.id);
  stage.performer = null;
  if (p) p.performing = false;
  if (complete) {
    const n = s.listeners.size;
    const gain = RULES.STAGE_BASE * (1 + RULES.STAGE_PER_LISTENER * n);
    addSupporters(gain, p ? [p] : []);
    if (p) { credit(p, 'performances', 1); credit(p, 'culture', 5); }
    toastAll(`✊ ${s.name}'s ${s.kind} moved the crowd — +${Math.round(gain)} supporters join the Blue side!`, 'blue');
    if (p?.userId) mainApi('/api/server/voice', { userId: p.userId, kind: s.kind, title: s.title, body: s.body, live: s.live, listeners: n, reactions: s.reactions, serverName: NAME }).catch(() => {});
  } else if (reason) toastAll(reason, 'warn');
  broadcast({ t: 'stageEnded', id: s.id });
  setTimeout(startNextPerformance, 3000);
  broadcast(stageState());
}

// ---------------- Marches & finale ----------------
function startMarch(p, route) {
  if (march) return send(p, { t: 'toast', text: 'A march is already moving!', kind: 'warn' });
  const pts = MAP.MARCH_ROUTES[route];
  if (!pts) return;
  const start = { x: pts[0][0], z: pts[0][1] };
  if (dist(p, start) > 30) return send(p, { t: 'toast', text: 'Go to the start of the march route first.', kind: 'warn' });
  if (route === 'council' && !campaign.marchUnlocked) return send(p, { t: 'toast', text: `You need ${RULES.MARCH_THRESHOLD.toLocaleString()} blue supporters to march on City Council.`, kind: 'warn' });
  if (route === 'parliament' && !campaign.parliamentUnlocked) return send(p, { t: 'toast', text: `Parliament needs ${RULES.PARLIAMENT_THRESHOLD.toLocaleString()} supporters and Macquarie St unlocked (${RULES.SIGS_PER_ZONE * (RULES.ZONE_COUNT - 1)} signatures).`, kind: 'warn' });
  if ((route === 'council' && campaign.councilMarch) || (route === 'parliament' && campaign.parliamentMarch)) return send(p, { t: 'toast', text: 'This march has already reached its destination.', kind: 'warn' });
  march = { route, d: 0, length: MAP.polyLength(pts), participants: new Set([p.id]), leader: p.name };
  toastAll(route === 'council' ? `📣 ${p.name} starts the march from The Block to City Council! Walk with the crowd!` : `📣 The main protest begins at Town Hall — ${p.name} leads the march on Parliament House!`, 'blue');
}
async function completeMarch() {
  const m = march;
  march = null;
  const ev = m.route === 'council' ? 'council_march' : 'parliament_march';
  for (const id of m.participants) credit(players.get(id), 'culture', 20);
  try {
    const { data } = await mainApi('/api/server/event', { type: ev });
    if (data.campaign) applyCampaign(data.campaign);
  } catch {
    if (m.route === 'council') campaign.councilMarch = true; else campaign.parliamentMarch = true;
  }
  toastAll(m.route === 'council' ? '🏛 The march reaches Town Hall! City Council has to listen — the Main Stage is open.' : '🏛 The crowd fills Macquarie St! Gather at the flagpole and hold E together.', 'blue');
  broadcast({ t: 'campaign', campaign });
}
async function raiseFlag() {
  flag.progress = 1;
  try {
    let { data } = await mainApi('/api/server/event', { type: 'flag_raised' });
    if (data.campaign) applyCampaign(data.campaign, true);
  } catch { campaign.flagRaised = true; }
  broadcast({ t: 'flagRaised' });
  await checkVictory();
}
let victoryBusy = false;
async function checkVictory() {
  if (!campaign.flagRaised || campaign.victory || victoryBusy) return;
  victoryBusy = true;
  const mps = Array.from({ length: RULES.POLITICIANS_PER_ZONE }, (_, i) => ({ name: politicianName(RULES.ZONE_COUNT - 1, i), blue: i < campaign.blueMPs }));
  const victory = campaign.blueMPs >= RULES.MAJORITY;
  if (victory) {
    try {
      const { data } = await mainApi('/api/server/event', { type: 'victory' });
      if (data.campaign) applyCampaign(data.campaign, true);
    } catch { campaign.victory = true; }
  }
  broadcast({ t: 'campaign', campaign });
  broadcast({ t: 'finale', victory, mps, blueMPs: campaign.blueMPs, needed: RULES.MAJORITY });
  victoryBusy = false;
}

// ---------------- Campaign sync with main server ----------------
function applyCampaign(c, silent = false) {
  const old = campaign;
  campaign = c;
  if (silent) return;
  if (c.zoneIndex > old.zoneIndex) toastAll(`🔓 ${c.signatures} signatures! ${MAP.ZONES[c.zoneIndex].name} is now open.`, 'blue');
  const oldF = old.flipped.reduce((a, b) => a + b, 0), newF = c.flipped.reduce((a, b) => a + b, 0);
  if (newF > oldF) toastAll(`🔵 Real signatures came in — ${newF - oldF} politician${newF - oldF > 1 ? 's' : ''} turned BLUE!`, 'blue');
  if (c.marchUnlocked && !old.marchUnlocked) toastAll('🚶 1,000 blue supporters! The march on City Council can start at The Block.', 'blue');
  if (c.parliamentUnlocked && !old.parliamentUnlocked) toastAll('🏛 10,000 strong! Start the main protest from the Town Hall stage — march on Parliament!', 'blue');
  if (c.flagRaised && !c.victory && c.blueMPs >= RULES.MAJORITY) checkVictory();
}
let syncing = false;
async function syncCampaign() {
  if (syncing) return;
  syncing = true;
  const batch = pending;
  pending = { supporters: 0, users: {} };
  try {
    const { status, data } = await mainApi('/api/server/report', { serverName: NAME, supporters: batch.supporters, users: batch.users });
    if (status !== 200) throw new Error(data.error || status);
    const prev = JSON.stringify(campaign);
    applyCampaign(data.campaign);
    campaign.supporters = Math.max(0, campaign.supporters + pending.supporters); // keep optimistic deltas made during the request
    if (JSON.stringify(campaign) !== prev) broadcast({ t: 'campaign', campaign });
  } catch (e) {
    pending.supporters += batch.supporters;
    for (const [id, u] of Object.entries(batch.users)) {
      const t = (pending.users[id] ||= {});
      for (const [k, v] of Object.entries(u)) t[k] = typeof v === 'number' ? (t[k] || 0) + v : v;
    }
    if (!syncCampaign.warned) console.warn('[game] main server unreachable:', e.message);
    syncCampaign.warned = true;
  }
  syncing = false;
}
setInterval(syncCampaign, 4000);

// ---------------- Main loop ----------------
let last = now();
setInterval(() => {
  const t = now();
  const dt = Math.min(0.25, (t - last) / 1000);
  last = t;
  const act = active();

  // Ejection timers
  for (const p of players.values()) {
    if (p.ejectedUntil && t > p.ejectedUntil) {
      p.ejectedUntil = 0; p.revealed = false; p.role = 'blue'; p.lastRoleChange = t;
      p.x = MAP.SPAWN.x; p.z = MAP.SPAWN.z; p.teleportGrace = t + 2000;
      send(p, { t: 'role', role: 'blue', reason: 'You\'re back in the City. The Elders say everyone deserves a second chance — you\'re BLUE now.' });
      send(p, { t: 'teleport', x: p.x, z: p.z });
    }
  }

  // Rallies
  for (const r of rallies) {
    if (!zoneUnlocked(r.zone)) continue;
    const here = act.filter((p) => p.yarning === r.id && dist(p, r) < 14 && p.metElders);
    if (r.disrupted) {
      const blues = here.length;
      if (blues) {
        r.clear += (dt * blues) / RULES.RUMOUR_CLEAR_TIME;
        if (r.clear >= 1) {
          r.disrupted = false; r.clear = 0;
          for (const p of here) credit(p, 'culture', 3);
          toastAll(`✔ ${here.map((p) => p.name).join(' & ')} cleared the rumour at ${r.name}.`, 'blue');
        }
      }
      continue;
    }
    if (t < r.cooldownUntil) continue;
    if (here.length) {
      r.progress += (dt * here.length) / RULES.RALLY_TIME;
      if (r.progress >= 1) {
        const gain = RULES.RALLY_BASE * (1 + RULES.COLLAB_BONUS * (here.length - 1));
        addSupporters(gain, here);
        r.progress = 0;
        r.cooldownUntil = t + RULES.RALLY_COOLDOWN * 1000;
        toastAll(`📣 ${here.map((p) => p.name).join(' & ')} won over the crowd at ${r.name}: +${Math.round(gain)} supporters!`, 'blue');
      }
    } else r.progress = Math.max(0, r.progress - dt * 0.02);
  }

  // NPCs
  const anyoneHome = act.some((p) => p.metElders);
  while (npcs.filter((n) => n.state < 2).length < 12) spawnNpc();
  for (const n of npcs) {
    if (n.state >= 2) continue;
    if (n.talkUntil > t) continue;
    if (n.idleUntil > t) { n.state = 1; continue; }
    n.state = 0;
    const dx = n.tx - n.x, dz = n.tz - n.z, d = Math.hypot(dx, dz);
    if (d < 1) {
      n.idleUntil = t + rand(3000, 9000);
      if (n.spy && anyoneHome && t > n.nextSab && n.target && Math.random() < 0.35 && zoneUnlocked(n.target.zone) && t > n.target.cooldownUntil) {
        sabotage(n.target, null);
        n.nextSab = t + rand(45e3, 80e3);
      }
      npcRetarget(n);
    } else {
      const s = Math.min(d, 3.5 * dt);
      n.x += (dx / d) * s; n.z += (dz / d) * s;
    }
  }
  npcs = npcs.filter((n) => !(n.removeAt && t > n.removeAt));

  // Meeting
  if (meeting && (t >= meeting.endsAt || [...meeting.voters].every((id) => meeting.votes.has(id) || !players.has(id)))) resolveMeeting();

  // March
  if (march) {
    march.d += RULES.MARCH_SPEED * dt;
    const head = MAP.pointAlong(MAP.MARCH_ROUTES[march.route], march.d);
    for (const p of act) if (dist(p, head) < 40) march.participants.add(p.id);
    if (march.d >= march.length) completeMarch();
  }

  // Flag
  if (campaign.parliamentMarch && !campaign.flagRaised && flag.progress < 1) {
    const holders = act.filter((p) => p.flagHold && p.role === 'blue' && dist(p, MAP.FLAGPOLE) < 12).length;
    if (holders) {
      flag.progress = Math.min(1, flag.progress + (dt * holders) / RULES.FLAG_HOLD_SECONDS);
      if (flag.progress >= 1) raiseFlag();
    }
  }

  // Stage
  const s = stage.performer;
  if (s) {
    for (const p of act) if (p.id !== s.id && dist(p, MAP.STAGE) < RULES.STAGE_LISTEN_RADIUS) s.listeners.add(p.id);
    if (!players.has(s.id)) finishPerformance(false, `${s.name} left the stage.`);
    else if (t > s.endsAt) finishPerformance(true);
  }

  // Snapshots (per-recipient: reds can see fellow reds)
  const base = [...players.values()].map((p) => [p.id, +p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2), +p.r.toFixed(2), p.a | 0, (p.ejectedUntil ? 1 : 0) | (p.revealed && p.role === 'red' ? 2 : 0) | (p.performing ? 8 : 0) | (p.performing && stage.performer?.live ? 16 : 0), p.role === 'red']);
  const shared = {
    npcs: npcs.map((n) => [n.id, +n.x.toFixed(1), +n.z.toFixed(1), n.state, n.seed, n.state === 2 ? 1 : 0]),
    rallies: rallies.map((r) => [r.id, Math.round(r.progress * 100), r.disrupted ? 1 : 0, Math.max(0, Math.ceil((r.cooldownUntil - t) / 1000)), Math.round(r.clear * 100)]),
    march: march && { route: march.route, d: march.d, length: march.length },
    flag: flag.progress,
  };
  for (const p of players.values()) {
    const iAmRed = p.role === 'red';
    send(p, { t: 'snap', players: base.map((b) => { const f = b[6] | (iAmRed && b[7] ? 4 : 0); return [b[0], b[1], b[2], b[3], b[4], b[5], f]; }), ...shared });
  }
}, 100);
setInterval(rebalanceRoles, 5000);

// ---------------- Messages ----------------
const handlers = {
  state(p, m) {
    if (!Array.isArray(m.p) || m.p.length !== 3 || !m.p.every(Number.isFinite)) return;
    const [x, y, z] = m.p;
    const t = now();
    const dtm = Math.max(0.05, (t - (p.lastMove || t)) / 1000);
    const moved = Math.hypot(x - p.x, z - p.z);
    if (t < (p.teleportGrace || 0) && moved > 5) return; // waiting for client to accept teleport
    if (t > (p.teleportGrace || 0) && moved / dtm > 45 && (p.rejects = (p.rejects || 0) + 1) < 20) return; // too fast — ignore (anti-teleport), resync after repeated lag
    p.rejects = 0;
    p.x = Math.max(MAP.BOUNDS.minX, Math.min(MAP.BOUNDS.maxX, x));
    p.z = Math.max(MAP.BOUNDS.minZ, Math.min(MAP.BOUNDS.maxZ, z));
    p.y = Math.max(0, Math.min(40, y));
    p.r = Number(m.r) || 0;
    p.a = Number(m.a) | 0;
    p.lastMove = t;
  },
  yarn(p, m) { p.yarning = Number.isInteger(m.rally) ? m.rally : null; },
  flag(p, m) { p.flagHold = !!m.on; },
  metElders(p, m) {
    if (p.metElders) return;
    p.metElders = true;
    credit(p, 'metElders', 1);
    pending.users[p.userId].metElders = true;
    credit(p, 'culture', 10 + 5 * Math.max(0, Math.min(3, Number(m.score) || 0)));
    send(p, { t: 'toast', text: 'The Elders have welcomed you. You\'re part of the movement now — go yarn with the crowds!', kind: 'blue' });
  },
  info(p, m) {
    const ip = MAP.INFO_POINTS.find((i) => i.id === m.id);
    if (!ip || p.seenInfo.has(ip.id) || dist(p, ip) > 20) return;
    p.seenInfo.add(ip.id);
    credit(p, 'culture', 5);
  },
  question(p, m) {
    const n = npcs.find((x) => x.id === m.npc);
    if (!n || n.state >= 2 || n.talkUntil > now() || dist(p, n) > 8 || !p.metElders || p.ejectedUntil) return;
    n.talkUntil = now() + 2600;
    setTimeout(() => {
      if (!players.has(p.id)) return;
      n.state = n.spy ? 2 : 3;
      n.removeAt = now() + 4000;
      if (n.spy) {
        credit(p, 'spiesCaught', 1); credit(p, 'culture', 10);
        toastAll(`🕵 ${p.name} exposed a Red spy hiding in the crowd — kicked out of the City!`, 'blue');
      } else addSupporters(RULES.RECRUIT_NPC, [p]);
      send(p, { t: 'questionResult', npc: n.id, spy: n.spy, gain: n.spy ? 0 : RULES.RECRUIT_NPC });
    }, 2500);
  },
  sabotage(p) {
    if (p.role !== 'red' || p.ejectedUntil) return;
    if (now() - p.lastSabotage < RULES.SABOTAGE_COOLDOWN * 1000) return send(p, { t: 'toast', text: `Sabotage recharging (${Math.ceil((RULES.SABOTAGE_COOLDOWN * 1000 - (now() - p.lastSabotage)) / 1000)}s)`, kind: 'red' });
    if (stage.performer && dist(p, MAP.STAGE) < 40 && stage.performer.id !== p.id) {
      p.lastSabotage = now();
      addSupporters(-20);
      credit(p, 'sabotages', 1);
      broadcast({ t: 'heckle' });
      return toastAll('📢 Someone in the crowd is heckling the stage! −20 supporters. Who was it?', 'red');
    }
    const r = rallies.find((x) => dist(p, x) < 14 && zoneUnlocked(x.zone));
    if (!r) return send(p, { t: 'toast', text: 'Get close to a rally crowd or the stage to sabotage.', kind: 'red' });
    if (sabotage(r, p)) p.lastSabotage = now();
  },
  meeting(p) { if (!p.ejectedUntil) callMeeting(p); },
  vote(p, m) {
    if (!meeting || !meeting.voters.has(p.id) || meeting.votes.has(p.id)) return;
    const target = m.target === 'skip' ? 'skip' : Number(m.target);
    if (target !== 'skip' && !meeting.voters.has(target)) return;
    meeting.votes.set(p.id, target);
    broadcast({ t: 'voted', id: p.id, count: meeting.votes.size, total: meeting.voters.size });
  },
  chat(p, m) {
    const text = clean(m.text, 200);
    if (!text || now() - p.lastChat < 800) return;
    p.lastChat = now();
    if (text.startsWith('/')) return devCommand(p, text);
    broadcast({ t: 'chat', from: p.name, id: p.id, text, ejected: !!p.ejectedUntil });
  },
  startMarch(p, m) { if (!p.ejectedUntil && p.metElders) startMarch(p, m.route === 'parliament' ? 'parliament' : 'council'); },

  // ----- Stage -----
  stageSubmit(p, m) {
    if (p.ejectedUntil || !p.metElders) return;
    if (!zoneUnlocked(2)) return send(p, { t: 'toast', text: 'The Town Hall stage opens when the zone is unlocked or the march reaches City Council.', kind: 'warn' });
    if (dist(p, MAP.STAGE) > 40) return send(p, { t: 'toast', text: 'Walk up to the Town Hall stage first.', kind: 'warn' });
    if (stage.performer?.id === p.id || stage.queue.some((q) => q.id === p.id)) return send(p, { t: 'toast', text: 'You\'re already in the line-up.', kind: 'warn' });
    const kind = ['speech', 'poem', 'music'].includes(m.kind) ? m.kind : 'speech';
    const title = clean(m.title, 60);
    const body = String(m.body || '').replace(/[\u0000-\u0009\u000b-\u001f\u007f<>]/g, '').slice(0, 1200).trim();
    const live = !!m.live;
    if (!body && !live) return send(p, { t: 'toast', text: 'Write something, or tick Go Live to stream your voice.', kind: 'warn' });
    stage.queue.push({ id: p.id, name: p.name, kind, title, body, lines: body ? body.split(/\n+/).map((l) => l.trim()).filter(Boolean).slice(0, 40) : [], live });
    send(p, { t: 'toast', text: stage.performer ? `You're #${stage.queue.length} in the line-up.` : 'You\'re up!', kind: 'blue' });
    startNextPerformance();
    broadcast(stageState());
  },
  stageEnd(p) {
    if (stage.performer?.id === p.id) finishPerformance(Date.now() - stage.performer.startedAt > 10000, `${p.name} ended their set early.`);
    else stage.queue = stage.queue.filter((q) => q.id !== p.id), broadcast(stageState());
  },
  react(p, m) {
    const s = stage.performer;
    if (!s || s.id === p.id || now() - p.lastReact < 1000 || dist(p, MAP.STAGE) > RULES.STAGE_LISTEN_RADIUS) return;
    p.lastReact = now();
    s.reactions++;
    addSupporters(RULES.STAGE_REACTION, players.has(s.id) ? [players.get(s.id)] : []);
    broadcast({ t: 'reaction', kind: m.kind === 'heart' ? 'heart' : 'fist' });
  },
  stageReport(p, m) {
    const s = stage.performer;
    if (!s || s.id === p.id || s.reporters.has(p.id)) return;
    s.reporters.add(p.id);
    mainApi('/api/server/abuse', { reporterId: p.userId, targetId: players.get(s.id)?.userId, context: 'stage', detail: clean(m.reason || `${s.kind}: ${s.title}`, 300), serverName: NAME }).catch(() => {});
    send(p, { t: 'toast', text: 'Thanks — your report was sent to moderators. You can mute the stage with the 🔇 button.', kind: 'info' });
    const needed = Math.max(1, Math.min(RULES.STAGE_REPORTS_TO_CUT, Math.ceil(s.listeners.size / 2)));
    if (s.reporters.size >= needed) finishPerformance(false, '⏸ The performance was paused after reports from the crowd. Moderators will review it.');
  },
  songReport(p, m) { if (typeof m.id === 'string') reportSong(p, m.id, m.reason); },
  reportPlayer(p, m) {
    const target = players.get(Number(m.id));
    if (!target) return;
    mainApi('/api/server/abuse', { reporterId: p.userId, targetId: target.userId, context: 'player', detail: clean(m.reason, 300), serverName: NAME }).catch(() => {});
    send(p, { t: 'toast', text: `Report about ${target.name} sent to moderators.`, kind: 'info' });
  },
  // WebRTC signalling: only between the live performer and listeners.
  rtc(p, m) {
    const s = stage.performer;
    const to = players.get(Number(m.to));
    if (!s || !s.live || !to || !m.data) return;
    if (p.id !== s.id && to.id !== s.id) return;
    const payload = JSON.stringify(m.data);
    if (payload.length > 20000) return;
    send(to, { t: 'rtc', from: p.id, data: m.data });
  },
};

async function devCommand(p, text) {
  const [cmd, arg] = text.split(/\s+/);
  if (!DEV) return send(p, { t: 'toast', text: 'Commands are only available when the server runs with DEV=1.', kind: 'warn' });
  const n = Number(arg) || 0;
  const body = cmd === '/sigs' ? { signatures: n } : cmd === '/sup' ? { supporters: n } : cmd === '/reset' ? { reset: true } : null;
  if (cmd === '/red') { p.role = 'red'; return send(p, { t: 'role', role: 'red', reason: 'DEV: you are now a RED spy.' }); }
  if (cmd === '/blue') { p.role = 'blue'; return send(p, { t: 'role', role: 'blue', reason: 'DEV: you are now BLUE.' }); }
  if (cmd === '/tp' && MAP.ZONES[n]) { p.x = MAP.ZONES[n].x; p.z = MAP.ZONES[n].z; p.teleportGrace = now() + 2000; return send(p, { t: 'teleport', x: p.x, z: p.z }); }
  if (cmd === '/skipmarch') { if (march) march.d = march.length - 1; return; }
  if (!body) return send(p, { t: 'toast', text: 'DEV commands: /sigs N, /sup N, /reset, /red, /blue, /tp ZONE(0-4), /skipmarch', kind: 'info' });
  if (body.reset) { flag.progress = 0; march = null; }
  const { data } = await mainApi('/api/server/dev', body).catch(() => ({ data: {} }));
  if (data.campaign) { applyCampaign(data.campaign); if (body.reset) campaign = data.campaign; broadcast({ t: 'campaign', campaign }); }
  else send(p, { t: 'toast', text: data.error || 'Main server did not accept the dev command (set DEV=1 on it too).', kind: 'warn' });
}

// ---------------- HTTP + WebSocket ----------------
const CLIENT = path.join(ROOT, 'client');
const SHARED = path.join(ROOT, 'shared');
const SHARED_PUBLIC = new Set(['/geo.js', '/mapdata.js', '/rules.js']);

// When the main server runs privately beside this one (one hosted service, one https address),
// pass its public pages and APIs straight through: the petition, the voices archive, campaign data,
// the survey webhook and admin tools. Game-server-only routes (/api/server/*) are never exposed.
const PROXY_MAIN = env.PROXY_MAIN === '1';
const MAIN_PUBLIC_ROUTES = [/^\/petition$/, /^\/voices$/, /^\/api\/(campaign|leaderboard|voices|wathaga\/status)$/, /^\/api\/signatures(\/count|\/webhook)?$/, /^\/api\/admin\/[a-z.-]+$/];
function proxyToMain(req, res, url) {
  const target = new URL(url.pathname + url.search, MAIN);
  const headers = { ...req.headers, host: target.host, 'x-forwarded-for': clientIp(req) };
  const up = http.request(target, { method: req.method, headers }, (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); });
  up.on('error', () => sendJson(res, 502, { error: 'The petition server is not answering. Try again in a moment.' }));
  req.pipe(up);
}

// ---------------- Licensed music ----------------
// Song details live in client/media/songs.json (in git); the audio files do not. They are served from
// the data disk (DATA_DIR/media, uploaded with scripts/upload-media.mjs) or, locally, from client/media.
const MEDIA_DIRS = [path.resolve(ROOT, env.DATA_DIR || 'data', 'media'), path.join(CLIENT, 'media')];
const mediaPath = (file) => MEDIA_DIRS.map((d) => path.join(d, file)).find((f) => fs.existsSync(f));
function songList() {
  try {
    const { songs = [] } = JSON.parse(fs.readFileSync(path.join(CLIENT, 'media', 'songs.json'), 'utf8'));
    return songs.filter((s) => /^[a-z0-9-]+\.mp3$/.test(s.file) && mediaPath(s.file)).map((s) => ({ ...s, url: `/media/${s.file}` }));
  } catch { return []; }
}
function serveMedia(req, res, file) {
  const f = /^[a-z0-9-]+\.mp3$/.test(file) && mediaPath(file);
  if (!f) return sendJson(res, 404, { error: 'Not found' });
  const size = fs.statSync(f).size;
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  const head = { 'Content-Type': 'audio/mpeg', 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=86400' };
  if (range) {
    const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    res.writeHead(206, { ...head, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
    return fs.createReadStream(f, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...head, 'Content-Length': size });
  fs.createReadStream(f).pipe(res);
}
async function uploadMedia(req, res, url) {
  if (!env.ADMIN_KEY || req.headers['x-admin-key'] !== env.ADMIN_KEY) return sendJson(res, 401, { error: 'Bad admin key' });
  const name = url.searchParams.get('name') || '';
  if (!/^[a-z0-9-]+\.mp3$/.test(name)) return sendJson(res, 400, { error: 'Name must look like black-boy.mp3' });
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 30 * 1024 * 1024) return sendJson(res, 413, { error: 'File over 30 MB' }); chunks.push(c); }
  fs.mkdirSync(MEDIA_DIRS[0], { recursive: true });
  fs.writeFileSync(path.join(MEDIA_DIRS[0], name), Buffer.concat(chunks));
  sendJson(res, 201, { ok: true, name, bytes: size, songs: songList().map((s) => s.title) });
}

// ---------------- Community playlist (player uploads) ----------------
// Players who have met the Elders can upload their own MP3s. Each upload needs a rights confirmation,
// waits for a moderator's approval before anyone else hears it, and is hidden after 3 reports.
const COMMUNITY_DIR = path.join(MEDIA_DIRS[0], 'community');
const COMMUNITY_DB = path.join(COMMUNITY_DIR, 'songs.json');
const NEEDS_APPROVAL = env.SONGS_NEED_APPROVAL !== '0';
const loadCommunity = () => { try { return JSON.parse(fs.readFileSync(COMMUNITY_DB, 'utf8')); } catch { return []; } };
const saveCommunity = (list) => { fs.mkdirSync(COMMUNITY_DIR, { recursive: true }); fs.writeFileSync(COMMUNITY_DB, JSON.stringify(list, null, 1)); };
const publicSong = (s) => ({ id: s.id, title: s.title, artist: s.artist, by: s.byName, url: `/media/community/${s.id}.mp3`, community: true });
const uploadsToday = new Map(); // userId -> {day, n}

async function playerFromToken(req) {
  const token = req.headers['x-player-token'];
  if (!token) return null;
  const { status, data } = await mainApi('/api/server/verify', { token }).catch(() => ({ status: 0 }));
  return status === 200 ? data.profile : null;
}
async function communityUpload(req, res, url) {
  const prof = await playerFromToken(req);
  if (!prof) return sendJson(res, 401, { error: 'Please log in again to upload.' });
  const online = [...players.values()].find((p) => p.userId === prof.id);
  if (!prof.metElders && !online?.metElders) return sendJson(res, 403, { error: 'Yarn with the Elders at The Block before sharing music.' });
  if (req.headers['x-rights'] !== 'yes') return sendJson(res, 400, { error: 'Please confirm you made this song or have permission to share it.' });
  const day = new Date().toISOString().slice(0, 10), u = uploadsToday.get(prof.id);
  if (u && u.day === day && u.n >= 3) return sendJson(res, 429, { error: 'You can share up to 3 songs a day.' });
  const title = clean(url.searchParams.get('title'), 60), artist = clean(url.searchParams.get('artist'), 60);
  if (title.length < 1) return sendJson(res, 400, { error: 'Give your song a title.' });
  const chunks = []; let size = 0;
  for await (const c of req) { size += c.length; if (size > 15 * 1024 * 1024) return sendJson(res, 413, { error: 'Songs can be up to 15 MB.' }); chunks.push(c); }
  const buf = Buffer.concat(chunks);
  const isMp3 = buf.length > 1024 && (buf.slice(0, 3).toString() === 'ID3' || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
  if (!isMp3) return sendJson(res, 400, { error: 'That file isn\'t an MP3.' });
  const id = crypto.randomBytes(8).toString('hex');
  fs.mkdirSync(COMMUNITY_DIR, { recursive: true });
  fs.writeFileSync(path.join(COMMUNITY_DIR, `${id}.mp3`), buf);
  const list = loadCommunity();
  list.push({ id, title, artist: artist || prof.displayName, byId: prof.id, byName: prof.displayName, status: NEEDS_APPROVAL ? 'pending' : 'approved', reports: [], at: new Date().toISOString(), bytes: size });
  saveCommunity(list);
  uploadsToday.set(prof.id, { day, n: (u && u.day === day ? u.n : 0) + 1 });
  if (!NEEDS_APPROVAL) broadcast({ t: 'playlist' });
  sendJson(res, 201, { ok: true, status: NEEDS_APPROVAL ? 'pending' : 'approved',
    message: NEEDS_APPROVAL ? 'Thanks! A moderator will check your song, then everyone can hear it.' : 'Your song is on the playlist!' });
}
function communityAdmin(req, res, url) {
  if (!env.ADMIN_KEY || req.headers['x-admin-key'] !== env.ADMIN_KEY) return sendJson(res, 401, { error: 'Bad admin key' });
  const list = loadCommunity();
  if (req.method === 'GET') return sendJson(res, 200, { songs: list });
  const s = list.find((x) => x.id === url.searchParams.get('id'));
  if (!s) return sendJson(res, 404, { error: 'No such song' });
  const action = url.searchParams.get('action');
  if (action === 'approve') s.status = 'approved';
  else if (action === 'hide') s.status = 'hidden';
  else if (action === 'delete') { s.status = 'deleted'; fs.rmSync(path.join(COMMUNITY_DIR, `${s.id}.mp3`), { force: true }); }
  else return sendJson(res, 400, { error: 'action must be approve, hide or delete' });
  saveCommunity(list);
  broadcast({ t: 'playlist' });
  sendJson(res, 200, { ok: true, song: s });
}
function servePlaylist(res) {
  sendJson(res, 200, { official: songList(), community: loadCommunity().filter((s) => s.status === 'approved').map(publicSong), needsApproval: NEEDS_APPROVAL });
}
function serveCommunitySong(req, res, id) {
  const s = /^[a-f0-9]{16}$/.test(id) && loadCommunity().find((x) => x.id === id && x.status === 'approved');
  if (!s) return sendJson(res, 404, { error: 'Not found' });
  const f = path.join(COMMUNITY_DIR, `${id}.mp3`);
  if (!fs.existsSync(f)) return sendJson(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': fs.statSync(f).size, 'Cache-Control': 'public, max-age=3600' });
  fs.createReadStream(f).pipe(res);
}
function reportSong(p, id, reason) {
  const list = loadCommunity(), s = list.find((x) => x.id === id);
  if (!s || s.reports.includes(p.userId)) return;
  s.reports.push(p.userId);
  if (s.reports.length >= 3 && s.status === 'approved') { s.status = 'hidden'; broadcast({ t: 'playlist' }); }
  saveCommunity(list);
  mainApi('/api/server/abuse', { reporterId: p.userId, targetId: s.byId, context: 'song', detail: clean(`${s.title}: ${reason || ''}`, 300), serverName: NAME }).catch(() => {});
  send(p, { t: 'toast', text: 'Thanks, moderators will check that song.', kind: 'info' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (PROXY_MAIN && MAIN_PUBLIC_ROUTES.some((r) => r.test(url.pathname))) return proxyToMain(req, res, url);
  if (req.method === 'GET' && url.pathname.startsWith('/media/community/')) return serveCommunitySong(req, res, url.pathname.slice(17).replace(/\.mp3$/, ''));
  if (req.method === 'GET' && url.pathname.startsWith('/media/') && url.pathname.endsWith('.mp3')) return serveMedia(req, res, url.pathname.slice(7));
  if (req.method === 'POST' && url.pathname === '/media-upload') return uploadMedia(req, res, url);
  if (req.method === 'GET' && url.pathname === '/songs') return servePlaylist(res);
  if (req.method === 'POST' && url.pathname === '/songs/upload') return communityUpload(req, res, url);
  if (url.pathname === '/songs/admin') return communityAdmin(req, res, url);
  try {
    if (req.method === 'POST' && (url.pathname === '/auth/login' || url.pathname === '/auth/register')) {
      const body = await readBody(req);
      const { status, data } = await mainApi(url.pathname === '/auth/login' ? '/api/login' : '/api/register', { ...body, homeServer: NAME }, { 'x-forwarded-for': clientIp(req) });
      return sendJson(res, status, data);
    }
    if (url.pathname === '/api/info') {
      // CORS so the Android app's start screen can check the server before loading it
      return sendJson(res, 200, { serverName: NAME, mainPublicUrl: MAIN_PUBLIC, ice: ICE, dev: DEV, players: players.size, campaign, rules: RULES, songs: songList() }, { 'Access-Control-Allow-Origin': '*' });
    }
    if (url.pathname.startsWith('/shared/')) {
      const f = url.pathname.slice(7);
      if (SHARED_PUBLIC.has(f) && serveStatic(req, res, SHARED, f)) return;
      return sendJson(res, 404, { error: 'Not found' });
    }
    if (req.method === 'GET' && serveStatic(req, res, CLIENT, url.pathname)) return;
    sendJson(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error('[game]', e);
    sendJson(res, 502, { error: 'Could not reach the main server. Is it running?' });
  }
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });
wss.on('connection', async (ws, req) => {
  const token = new URL(req.url, 'http://x').searchParams.get('token');
  let prof;
  try {
    const { status, data } = await mainApi('/api/server/verify', { token });
    if (status !== 200) return ws.close(4001, 'Your saved login is no longer valid — please log in again (or join if you are new).');
    prof = data.profile;
  } catch {
    return ws.close(4003, 'Main server unreachable.');
  }
  for (const other of players.values()) if (other.userId === prof.id) other.ws.close(4002, 'You logged in somewhere else.');

  const p = {
    id: nextId++, ws, userId: prof.id, name: prof.displayName, username: prof.username, profile: prof,
    x: MAP.SPAWN.x + rand(-4, 4), y: 0, z: MAP.SPAWN.z + rand(-4, 4), r: 0, a: 0, role: 'blue', ejectedUntil: 0, revealed: false,
    metElders: !!prof.metElders, yarning: null, flagHold: false, lastMove: now(), lastChat: 0, lastSabotage: 0, lastReact: 0, seenInfo: new Set(), teleportGrace: now() + 2000,
  };
  players.set(p.id, p);
  send(p, {
    t: 'welcome', you: { id: p.id, name: p.name, username: p.username, role: p.role, x: p.x, z: p.z, profile: prof },
    serverName: NAME, mainPublicUrl: MAIN_PUBLIC, ice: ICE, dev: DEV, campaign, rules: RULES,
    players: [...players.values()].map((o) => ({ id: o.id, name: o.name, username: o.username })),
    meeting: meeting && { calledBy: meeting.calledBy, endsAt: meeting.endsAt, candidates: [...meeting.voters].map((id) => ({ id, name: players.get(id)?.name })) },
  });
  send(p, stageState());
  broadcast({ t: 'pjoin', id: p.id, name: p.name, username: p.username }, p);
  if (campaign.flagRaised) send(p, { t: 'flagRaised', quiet: true });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const h = handlers[m?.t];
    if (h) {
      try { h(p, m); } catch (e) { console.error('[game] handler', m.t, e); }
    }
  });
  ws.on('close', () => {
    players.delete(p.id);
    stage.queue = stage.queue.filter((q) => q.id !== p.id);
    broadcast({ t: 'pleave', id: p.id });
  });
});

syncCampaign();
server.listen(PORT, () => console.log(`[game] "${NAME}" running on http://localhost:${PORT}  (main server: ${MAIN})${DEV ? '  [DEV]' : ''}`));
