// Voices Rising: Sydney — browser client.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as MAP from '/shared/mapdata.js';
import { toLatLon } from '/shared/geo.js';
import { RULES, politicianName } from '/shared/rules.js';
import { buildWorld } from './world.js';
import { buildLandmarks } from './landmarks.js';
import { Character, Crowd, TEAM, hashString } from './characters.js';
import { canvasTexture } from './materials.js';
import { LiveAudio } from './live.js';
import { Music } from './music.js';
import * as UI from './ui.js';

const { $, el, toast, chatLine } = UI;
const ANIM = { idle: 0, walk: 1, yarn: 2, hold: 3, perform: 4, cheer: 5 };
const ANIM_NAMES = Object.keys(ANIM);

// ---------------- Renderer & scene ----------------
const canvas = $('#c');
const DEBUG = new URLSearchParams(location.search).has('debug');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG });
let quality = localStorage.getItem('vr_quality') || 'high';
renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.75 : 1));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = quality === 'high';
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.5, 6000);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.3, 0.6, 0.88);
composer.addPass(bloom);
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

let world, landmarks, crowd, locals;
const politicians = [];
const elders = [];
const floaters = [];

// ---------------- State ----------------
const S = {
  token: localStorage.getItem('vr_token'),
  playing: false, myId: 0, username: '', name: '', role: 'blue', metElders: false, ejectedUntil: 0,
  campaign: null, rules: RULES, serverName: '', mainPublicUrl: '', ice: [], dev: false,
  people: new Map(), // id -> {name, username}
  others: new Map(), // id -> {char, x,y,z,r,a,f}
  npcs: new Map(), // id -> {char, x,z,state}
  rallies: [], march: null, flag: 0, stage: { performer: null, queue: [] }, meeting: null,
  lastLine: -2, muted: false, cine: null,
};
const me = { x: MAP.SPAWN.x, y: 0, z: MAP.SPAWN.z, vy: 0, yaw: Math.PI, char: null, speed: 0, anim: 'idle' };
const cam = { yaw: 0.15, pitch: 0.42, dist: 17 };
let ws = null;
let live = null;
let music = null;
const send = (m) => ws?.readyState === 1 && ws.send(JSON.stringify(m));

// ---------------- Boot ----------------
async function boot() {
  const info = await fetch('/api/info').then((r) => r.json()).catch(() => null);
  if (info) {
    S.serverName = info.serverName; S.mainPublicUrl = info.mainPublicUrl; S.ice = info.ice; S.dev = info.dev; S.campaign = info.campaign;
    music = new Music(info.songs || [], (text) => { toast(text, 'info', 6000); chatLine('', text, true); });
    $('#serverName').textContent = info.serverName;
  }
  await new Promise((r) => setTimeout(r, 30));
  world = buildWorld(scene);
  landmarks = buildLandmarks(scene, world.colliders);
  crowd = new Crowd(scene, 900);
  locals = new Crowd(scene, MAP.RALLIES.length * 6);
  buildPoliticians();
  await buildElders();
  if (S.campaign) applyCampaign(S.campaign);
  $('#loading').hidden = true;
  requestAnimationFrame(frame);
  if (S.token && !new URLSearchParams(location.search).has('noauto')) connect();
}

function buildPoliticians() {
  for (let z = 0; z < RULES.ZONE_COUNT; z++) {
    for (let i = 0; i < RULES.POLITICIANS_PER_ZONE; i++) {
      const p = MAP.politicianPos(z, i);
      const c = new Character({ seed: 1000 + z * 10 + i, kind: 'politician', shirt: TEAM.red });
      c.root.position.set(p.x, 0, p.z);
      c.root.rotation.y = p.yaw;
      c.zone = z; c.index = i; c.name = politicianName(z, i); c.blue = false; c.home = { ...p };
      scene.add(c.root);
      politicians.push(c);
    }
  }
}

let ELDER_DATA = null;
async function buildElders() {
  ELDER_DATA = await fetch('/data/elders.json').then((r) => r.json());
  for (const e of ELDER_DATA.elders) {
    const c = new Character({ seed: hashString(e.id), kind: 'elder', shirt: new THREE.Color(e.shirt).getHex(), name: e.name });
    c.root.position.set(MAP.ELDERS.x + e.offset[0] * 0.9, 0, MAP.ELDERS.z + e.offset[1] + 1.4);
    c.root.lookAt(MAP.ELDERS.x, 0, MAP.ELDERS.z);
    c.setName(e.name, '#ffcd00');
    scene.add(c.root);
    elders.push(c);
  }
}

// ---------------- Auth ----------------
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
  $('#loginForm').hidden = b.dataset.tab !== 'login';
  $('#registerForm').hidden = b.dataset.tab !== 'register';
  $('#authMsg').textContent = '';
}));
async function auth(kind, form) {
  const body = Object.fromEntries(new FormData(form));
  if (body.age) body.age = Number(body.age);
  $('#authMsg').textContent = '';
  try {
    const r = await fetch(`/auth/${kind}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Something went wrong');
    S.token = d.token;
    localStorage.setItem('vr_token', d.token);
    connect();
  } catch (e) { $('#authMsg').textContent = e.message; }
}
$('#loginForm').addEventListener('submit', (e) => { e.preventDefault(); auth('login', e.target); });
$('#registerForm').addEventListener('submit', (e) => { e.preventDefault(); auth('register', e.target); });

function connect() {
  ws?.close();
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?token=${encodeURIComponent(S.token)}`);
  ws.onmessage = (e) => { try { onMsg(JSON.parse(e.data)); } catch (err) { console.error(err); } };
  ws.onclose = (e) => {
    if (e.code === 4001 || e.code === 4002) {
      if (e.code === 4001) { localStorage.removeItem('vr_token'); S.token = null; }
      stopPlaying(e.reason || 'Disconnected');
    } else if (S.playing) {
      toast('Connection lost — reconnecting…', 'warn');
      setTimeout(() => S.token && connect(), 3000);
    } else if (e.code === 4003) $('#authMsg').textContent = e.reason;
  };
}
function stopPlaying(msg) {
  S.playing = false;
  $('#hud').hidden = true;
  $('#login').hidden = false;
  $('#authMsg').textContent = msg || '';
  for (const o of S.others.values()) o.char.dispose();
  S.others.clear();
}

// ---------------- Messages ----------------
function onMsg(m) {
  switch (m.t) {
    case 'welcome': return welcome(m);
    case 'snap': return snap(m);
    case 'campaign': return applyCampaign(m.campaign);
    case 'toast': toast(m.text, m.kind); return chatLine('', m.text, true);
    case 'chat': {
      chatLine(m.from + (m.ejected ? ' (outside the City)' : ''), m.text);
      const c = m.id === S.myId ? me.char : S.others.get(m.id)?.char;
      c?.say(m.text, 5);
      return;
    }
    case 'pjoin': S.people.set(m.id, { name: m.name, username: m.username }); return chatLine('', `${m.name} joined the City.`, true);
    case 'pleave': {
      const o = S.others.get(m.id);
      if (o) { o.char.dispose(); S.others.delete(m.id); }
      chatLine('', `${S.people.get(m.id)?.name || 'Someone'} left.`, true);
      S.people.delete(m.id);
      return;
    }
    case 'role': return setRole(m.role, m.reason);
    case 'teleport': me.x = m.x; me.z = m.z; me.y = 0; me.vy = 0; if (m.yaw != null) me.yaw = m.yaw; return;
    case 'meeting': return openVote(m);
    case 'voted': { const c = $('#votecount'); if (c) c.textContent = `${m.count}/${m.total} voted`; return; }
    case 'meetingResult': return meetingResult(m);
    case 'ejected': return ejected(m);
    case 'questionResult': return questionResult(m);
    case 'stage': return stageUpdate(m);
    case 'stageEnded': return stageEnded(m);
    case 'reaction': return floatEmoji(m.kind === 'heart' ? '❤' : '✊');
    case 'heckle': return heckle();
    case 'rtc': return live?.onSignal(m.from, m.data, S.stage.performer?.id === S.myId);
    case 'flagRaised': S.campaign.flagRaised = true; landmarks.flag.set(1, true); if (!m.quiet) toast('The Aboriginal flag flies over Parliament House!', 'blue', 8000); return;
    case 'finale': return runFinale(m);
    case 'playlist': return;
  }
}

function welcome(m) {
  S.myId = m.you.id; S.username = m.you.username; S.name = m.you.name; S.metElders = !!m.you.profile.metElders;
  S.serverName = m.serverName; S.mainPublicUrl = m.mainPublicUrl; S.ice = m.ice; S.dev = m.dev; S.rules = m.rules;
  S.people.clear();
  for (const p of m.players) S.people.set(p.id, p);
  me.x = m.you.x; me.z = m.you.z; me.y = 0;
  if (!me.char) { me.char = new Character({ seed: hashString(S.username), name: S.name }); scene.add(me.char.root); }
  me.char.setName(S.name, '#ffcd00');
  live?.stopMic(); live?.stopListening();
  live = new LiveAudio(send, S.ice);
  setRole(m.you.role);
  applyCampaign(m.campaign);
  $('#login').hidden = true;
  $('#hud').hidden = false;
  S.playing = true;
  chatLine('', `Welcome to ${S.serverName}, ${S.name}.`, true);
  if (!S.metElders) toast('Head to the fire at The Block — the Elders want to yarn with you. (Walk with WASD, press E)', 'blue', 9000);
  if (m.meeting) openVote(m.meeting);
  if (S.dev) chatLine('', 'DEV server: try /sigs 100, /sup 1000, /tp 2, /red, /reset', true);
}

function setRole(role, reason) {
  S.role = role;
  const badge = $('#role');
  badge.className = role;
  badge.textContent = role === 'red' ? '🕵 RED — SPY' : '✊ BLUE — THE MOVEMENT';
  me.char?.setShirt(role === 'red' ? TEAM.red : TEAM.blue);
  $('#tQ').hidden = role !== 'red';
  if (reason) {
    toast(reason, role, 10000);
    chatLine('', reason, true);
  }
}

function snap(m) {
  const seen = new Set();
  for (const [id, x, y, z, r, a, f] of m.players) {
    if (id === S.myId) { me.flags = f; continue; }
    seen.add(id);
    let o = S.others.get(id);
    const info = S.people.get(id) || { name: 'Player', username: String(id) };
    if (!o) {
      o = { char: new Character({ seed: hashString(info.username), name: info.name }), x, y, z, r, a, f: -1 };
      o.char.root.position.set(x, y, z);
      scene.add(o.char.root);
      S.others.set(id, o);
    }
    Object.assign(o, { tx: x, ty: y, tz: z, tr: r, a });
    if (o.f !== f) {
      o.f = f;
      const red = f & 2 || f & 4;
      o.char.setShirt(red ? TEAM.red : TEAM.blue);
      o.char.setName(info.name + (f & 2 ? ' · RED SPY' : f & 4 ? ' · fellow Red' : '') + (f & 16 ? ' 🔴' : ''), f & 2 ? '#ff8a8a' : '#ffffff');
    }
  }
  for (const [id, o] of S.others) if (!seen.has(id)) { o.char.dispose(); S.others.delete(id); }

  const nseen = new Set();
  for (const [id, x, z, state, seed] of m.npcs) {
    nseen.add(id);
    let n = S.npcs.get(id);
    if (!n) {
      n = { char: new Character({ seed, kind: 'youth', shirt: [0x6c757d, 0x9b5cff, 0x2a9d8f, 0xf4a261, 0x264653][seed % 5] }), x, z, state };
      n.char.root.position.set(x, 0, z);
      scene.add(n.char.root);
      S.npcs.set(id, n);
    }
    if (n.state !== state) {
      if (state === 2) { n.char.setShirt(TEAM.red); n.char.setName('RED SPY — kicked out', '#ff8a8a'); }
      if (state === 3) { n.char.setShirt(TEAM.blue); n.char.setName('Joined the movement!', '#9cc7ff'); }
    }
    Object.assign(n, { tx: x, tz: z, state });
  }
  for (const [id, n] of S.npcs) if (!nseen.has(id)) { n.char.dispose(); S.npcs.delete(id); }
  S.rallies = m.rallies;
  S.march = m.march;
  if (!S.campaign.flagRaised) landmarks.flag.set(m.flag || 0, false);
  S.flag = m.flag;
}

function applyCampaign(c) {
  S.campaign = c;
  world.setCampaign(c);
  for (const p of politicians) {
    const blue = p.index < c.flipped[p.zone];
    if (p.blue !== blue || !p.tagged) {
      p.blue = blue; p.tagged = true;
      p.setShirt(blue ? TEAM.blue : TEAM.red);
      p.setName(p.name, blue ? '#9cc7ff' : '#ff9b9b');
    }
    p.root.visible = !(c.victory && p.zone === RULES.ZONE_COUNT - 1 && !blue);
  }
  if (c.flagRaised) landmarks.flag.set(1, true);
  renderCampaign();
}

function renderCampaign() {
  const c = S.campaign;
  if (!c) return;
  const box = $('#campaign');
  const target = c.marchUnlocked ? RULES.PARLIAMENT_THRESHOLD : RULES.MARCH_THRESHOLD;
  const zone = c.zoneIndex;
  const goal = c.parliamentMarch ? (c.flagRaised ? (c.victory ? '🏆 The Reds have been voted out of Parliament!' : (c.blueMPs >= RULES.MAJORITY ? "The final vote is being called…" : `Turn ${RULES.MAJORITY - c.blueMPs} more MPs blue to win the final vote`)) : 'Gather at the Parliament flagpole and hold E together')
    : c.parliamentUnlocked ? 'Start the main protest from the Town Hall stage!'
    : c.councilMarch ? 'Grow to 10,000 and unlock Macquarie St'
    : c.marchUnlocked ? 'Start the march at The Block!' : 'Win over crowds, expose spies, get signatures';
  box.innerHTML = '';
  const pref = localStorage.getItem('vr_board');
  box.classList.toggle('collapsed', pref === 'min' || (!pref && innerWidth < 700));
  box.append(
    el('h3', { text: `✊ The Movement ${box.classList.contains('collapsed') ? '▸' : '▾'}`, title: 'Click to collapse or expand', onclick: () => { localStorage.setItem('vr_board', box.classList.contains('collapsed') ? 'max' : 'min'); renderCampaign(); } }),
    el('div', { class: 'big', text: `🔵 ${c.supporters.toLocaleString()} / ${target.toLocaleString()}` }),
    el('div', { class: 'meter' }, el('i', { style: `width:${Math.min(100, (c.supporters / target) * 100)}%` })),
    el('div', { text: `✍ ${c.signatures.toLocaleString()} real signatures` + (c.nextPoliticianIn ? ` · ${c.nextPoliticianIn} to flip the next politician` : '') }),
    el('div', { class: 'pols' }, ...Array.from({ length: RULES.POLITICIANS_PER_ZONE }, (_, i) => el('b', { class: i < c.flipped[zone] ? 'blue' : '', title: politicianName(zone, i) }))),
    el('div', { class: 'muted', text: c.nextZoneIn ? `${c.nextZoneIn} signatures to open ${MAP.ZONES[zone + 1].name}` : 'Every protest zone is open' }),
    el('div', { class: 'zones' }, ...MAP.ZONES.map((z) => el('span', { class: c.unlocked[z.id] ? 'open' : '', text: (c.unlocked[z.id] ? '' : '🔒 ') + z.name.split(' —')[0] }))),
    el('div', { class: 'muted', style: 'margin-top:6px;color:#ffe9a3', text: '➜ ' + goal }),
  );
}

// ---------------- Input ----------------
const keys = new Set();
let holding = null; // active hold interaction
let current = null; // nearest interaction
const typing = () => document.activeElement === $('#chatin') || document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';

addEventListener('keydown', (e) => {
  if (!S.playing) return;
  if (S.cine?.blocking) { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') S.cine.skip?.(); return; }
  if (typing()) {
    if (e.code === 'Escape') document.activeElement.blur();
    if (e.code === 'Enter' && document.activeElement === $('#chatin')) sendChat();
    return;
  }
  if (UI.dialogueKey(e)) { e.preventDefault(); return; }
  if (UI.modalOpen()) { if (e.code === 'Escape') UI.closeModal(); return; }
  if (!$('#bigmap').hidden) { if (['Escape', 'KeyM'].includes(e.code)) $('#bigmap').hidden = true; return; }
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyE') pressInteract();
  if (e.code === 'KeyQ') send({ t: 'sabotage' });
  if (e.code === 'KeyV') send({ t: 'meeting' });
  if (e.code === 'KeyT' || e.code === 'Enter') { e.preventDefault(); $('#chatin').focus(); }
  if (e.code === 'KeyM') openBigMap();
  if (e.code === 'KeyH') openHelp();
  if (e.code === 'KeyG') toggleQuality();
  if (e.code === 'Digit1') react('fist');
  if (e.code === 'Digit2') react('heart');
});
addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'KeyE') releaseInteract();
});
addEventListener('blur', () => { keys.clear(); releaseInteract(); });

function sendChat() {
  const v = $('#chatin').value.trim();
  if (v) send({ t: 'chat', text: v });
  $('#chatin').value = '';
  $('#chatin').blur();
}

// Mouse orbit
let drag = null;
canvas.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' || !e.isPrimary || e.clientX > innerWidth * 0.4) { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); } });
canvas.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * 0.006;
  cam.pitch = Math.max(0.08, Math.min(1.25, cam.pitch + (e.clientY - drag.y) * 0.004));
  drag.x = e.clientX; drag.y = e.clientY;
});
canvas.addEventListener('pointerup', () => (drag = null));
canvas.addEventListener('wheel', (e) => { cam.dist = Math.max(6, Math.min(60, cam.dist * (1 + Math.sign(e.deltaY) * 0.1))); }, { passive: true });

// Touch joystick
const stick = { x: 0, y: 0, id: null };
const stickEl = $('#stick');
stickEl.addEventListener('pointerdown', (e) => { stick.id = e.pointerId; stickEl.setPointerCapture(e.pointerId); moveStick(e); });
stickEl.addEventListener('pointermove', (e) => e.pointerId === stick.id && moveStick(e));
stickEl.addEventListener('pointerup', () => { stick.id = null; stick.x = stick.y = 0; stickEl.firstElementChild.style.transform = ''; });
function moveStick(e) {
  const r = stickEl.getBoundingClientRect();
  let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(dx, dy);
  if (l > 1) { dx /= l; dy /= l; }
  stick.x = dx; stick.y = dy;
  stickEl.firstElementChild.style.transform = `translate(${dx * 34}px, ${dy * 34}px)`;
}
$('#tE').addEventListener('pointerdown', () => { if (UI.dialogueOpen()) UI.dialogueKey({ code: 'KeyE' }); else pressInteract(); });
$('#tE').addEventListener('pointerup', releaseInteract);
$('#tJ').addEventListener('pointerdown', () => keys.add('Space'));
$('#tJ').addEventListener('pointerup', () => keys.delete('Space'));
$('#tQ').addEventListener('click', () => send({ t: 'sabotage' }));

$('#btnShare').addEventListener('click', sharePetition);
$('#btnVote').addEventListener('click', () => send({ t: 'meeting' }));
$('#btnMap').addEventListener('click', openBigMap);
$('#btnHelp').addEventListener('click', openHelp);
$('#btnMusic').addEventListener('click', openPlaylist);

// ---------------- Music & community playlist ----------------
async function openPlaylist() {
  const box = UI.openModal([el('h2', { text: '♫ Music' }), el('p', { text: 'Loading the playlist…' })]);
  let data;
  try { data = await fetch('/songs').then((r) => r.json()); } catch { box.querySelector('p').textContent = 'Could not load the playlist. Try again in a moment.'; return; }
  box.innerHTML = '';
  const ambient = el('input', { type: 'checkbox', id: 'music-ambient' });
  ambient.checked = !!music?.enabled;
  ambient.addEventListener('change', () => music?.setEnabled(ambient.checked));
  const row = (song) => {
    const playing = music?.manual?.url === song.url;
    const b = el('button', { text: playing ? '■ Stop' : '▶ Play', onclick: () => { if (music?.manual?.url === song.url) music.stopNow(); else music?.playNow(song); openPlaylist(); } });
    const kids = [el('div', { style: 'min-width:0' }, el('b', { text: song.title }), el('div', { class: 'muted', style: 'font-size:13px', text: (song.artist || '') + (song.year ? ' (' + song.year + ')' : '') + (song.community ? ' · shared by ' + song.by : '') })), b];
    if (song.community) kids.push(el('button', { text: '⚑', title: 'Report this song', onclick: () => { send({ t: 'songReport', id: song.id }); } }));
    return el('div', { class: 'vote-list', style: 'grid-template-columns:minmax(0,1fr) auto auto;display:grid;gap:8px;align-items:center;margin:6px 0' }, ...kids);
  };
  box.append(
    el('h2', { text: '♫ Music' }),
    el('label', { class: 'live', style: 'background:transparent;border-color:#33415f' }, ambient, el('span', { text: 'Play music in the world: by the Elders’ fire at The Block, and when you walk with a march.' })),
    el('h3', { text: 'Voices Rising songs' }),
    ...(data.official.length ? data.official.map(row) : [el('p', { text: 'No songs on this server yet.' })]),
    ...(data.official.filter((s) => s.credit).map((s) => el('p', { class: 'muted', style: 'font-size:12px', text: s.credit }))),
    el('h3', { text: 'Community playlist' }),
    ...(data.community.length ? data.community.map(row) : [el('p', { text: 'No community songs yet. Be the first to share one.' })]),
  );
  // Upload form
  const file = el('input', { type: 'file', id: 'song-file', accept: 'audio/mpeg,.mp3' });
  const title = el('input', { id: 'song-title', placeholder: 'Song title', maxlength: 60 });
  const artist = el('input', { id: 'song-artist', placeholder: 'Artist (you, your band or mob)', maxlength: 60, style: 'margin-top:8px' });
  const rights = el('input', { type: 'checkbox', id: 'song-rights' });
  const msg = el('p', { role: 'status', style: 'min-height:20px;font-weight:700' });
  const go = el('button', { class: 'go', text: 'Share my song', onclick: async () => {
    msg.textContent = '';
    if (!S.metElders) { msg.textContent = 'Yarn with the Elders at The Block before sharing music.'; return; }
    const f = file.files[0];
    if (!f) { msg.textContent = 'Choose an MP3 file first.'; return; }
    if (f.size > 15 * 1024 * 1024) { msg.textContent = 'Songs can be up to 15 MB.'; return; }
    if (!title.value.trim()) { msg.textContent = 'Give your song a title.'; return; }
    if (!rights.checked) { msg.textContent = 'Please tick the box to confirm you can share this song.'; return; }
    go.disabled = true; go.textContent = 'Uploading…';
    try {
      const q = new URLSearchParams({ title: title.value.trim(), artist: artist.value.trim() });
      const r = await fetch('/songs/upload?' + q, { method: 'POST', headers: { 'x-player-token': S.token, 'x-rights': 'yes', 'Content-Type': 'audio/mpeg' }, body: f });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Upload failed');
      msg.textContent = d.message; file.value = ''; title.value = ''; artist.value = ''; rights.checked = false;
    } catch (e) { msg.textContent = e.message; }
    go.disabled = false; go.textContent = 'Share my song';
  } });
  box.append(
    el('h3', { text: 'Share your own song' }),
    el('p', { text: 'Upload an MP3 (up to 15 MB) of your own music.' + (data.needsApproval ? ' A moderator checks every song before others can hear it.' : '') }),
    file, title, artist,
    el('label', { class: 'live' }, rights, el('span', { text: 'I made this song, or I have permission from everyone who owns it (writers, performers and label) to share it in Voices Rising.' })),
    el('div', { class: 'row' }, el('button', { text: 'Close', onclick: UI.closeModal }), go),
    msg,
  );
}
// In the Android app, let players go back to the server picker.
if (navigator.userAgent.includes('VoicesRisingApp')) {
  $('#btnServer').hidden = false;
  $('#btnServer').addEventListener('click', () => { location.href = 'https://localhost/?pick=1'; });
}
$('#bigmap .close').addEventListener('click', () => ($('#bigmap').hidden = true));
document.querySelectorAll('#stagebar [data-react]').forEach((b) => b.addEventListener('click', () => react(b.dataset.react)));
$('#btnMute').addEventListener('click', () => { S.muted = !S.muted; live?.setMuted(S.muted); $('#btnMute').textContent = S.muted ? '🔈 Unmute' : '🔇 Mute'; });
$('#btnReport').addEventListener('click', () => {
  if (!S.stage.performer) return;
  const box = UI.openModal([el('h2', { text: 'Report this performance?' }), el('p', { text: 'Reports go to moderators. If enough people in the crowd report, the performance is paused automatically.' })]);
  const reason = el('input', { placeholder: 'What was wrong? (optional)', maxlength: 200 });
  box.append(reason, el('div', { class: 'row' }, el('button', { text: 'Cancel', onclick: UI.closeModal }), el('button', { class: 'go', text: 'Send report', onclick: () => { send({ t: 'stageReport', reason: reason.value }); UI.closeModal(); } })));
});
$('#btnEndSet').addEventListener('click', () => send({ t: 'stageEnd' }));

function sharePetition() {
  const url = `${S.mainPublicUrl}/petition?ref=${encodeURIComponent(S.username)}`;
  const box = UI.openModal([el('h2', { text: '✍ Lobby with real signatures' }), el('p', { text: 'Share your personal petition link with friends, family, school and community. Every 10 real signatures turns a politician from red to blue. Every 100 opens the next protest zone.' })]);
  const inp = el('input', { value: url, readonly: 'readonly' });
  box.append(inp, el('div', { class: 'row' },
    el('button', { text: 'Open petition', onclick: () => window.open(url, '_blank', 'noopener') }),
    el('button', { class: 'go', text: 'Copy link', onclick: async () => { try { await navigator.clipboard.writeText(url); toast('Petition link copied — share it!', 'blue'); } catch { inp.select(); } } })));
}

function openHelp() {
  UI.openModal([
    el('h2', { text: 'How to play' }),
    el('ul', { class: 'help' },
      ...[['WASD', 'move (Shift to run, Space to jump) · drag mouse to look · wheel to zoom'], ['E', 'talk / yarn with a crowd (hold) / interact'], ['V', 'call the Yarning Circle to vote out a suspected Red spy'], ['Q', 'RED spies only: sabotage a rally or heckle the stage'], ['T', 'chat'], ['1 / 2', 'react to a stage performance ✊ ❤'], ['M', 'map'], ['G', 'toggle graphics quality']]
        .map(([k, t]) => el('li', {}, el('kbd', { text: k }), t))),
    el('p', { text: `Goal: grow the Blue movement to ${RULES.MARCH_THRESHOLD.toLocaleString()} to march on City Council, then ${RULES.PARLIAMENT_THRESHOLD.toLocaleString()} to march on Parliament House. Real petition signatures turn politicians blue (${RULES.SIGS_PER_POLITICIAN} each) and open new zones (${RULES.SIGS_PER_ZONE} each).` }),
    el('div', { class: 'row' }, el('button', { class: 'go', text: 'Got it', onclick: UI.closeModal })),
  ]);
}

function toggleQuality() {
  quality = quality === 'high' ? 'low' : 'high';
  localStorage.setItem('vr_quality', quality);
  renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.75 : 1));
  renderer.shadowMap.enabled = quality === 'high';
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  toast(`Graphics: ${quality}`, 'info', 2000);
}

// ---------------- Interactions ----------------
const dist = (p) => Math.hypot(p.x - me.x, p.z - me.z);
const zoneOpen = (z) => !!S.campaign?.unlocked[z];
const amPerforming = () => S.stage.performer?.id === S.myId;

function findInteraction() {
  if (S.ejectedUntil || S.cine) return null;
  if (amPerforming()) return { label: 'End your set', run: () => send({ t: 'stageEnd' }) };
  const opts = [];
  const needElders = (label) => ({ label: `${label} — talk to the Elders at The Block first`, run: () => toast('Visit the Elders at the fire on The Block first. 🔥', 'warn') });
  const add = (d, o) => opts.push({ d, ...o });

  const de = dist(MAP.ELDERS);
  if (de < 10) add(de - 3, { label: 'Yarn with the Elders', run: talkElders });
  for (const ip of MAP.INFO_POINTS) { const d = dist(ip); if (d < 9) add(d, { label: `Read: ${ip.title}`, run: () => readInfo(ip) }); }

  const cs = MAP.MARCH_ROUTES.council[0];
  const dc = Math.hypot(cs[0] - me.x, cs[1] - me.z);
  if (S.campaign.marchUnlocked && !S.campaign.councilMarch && !S.march && dc < 14) add(dc - 5, { label: '📣 Start the march to City Council', run: () => send({ t: 'startMarch', route: 'council' }) });

  const ds = dist(MAP.STAGE);
  if (ds < 18 && zoneOpen(2)) add(ds, S.metElders ? { label: '🎤 Main Stage — perform, or start the main protest', run: openStagePanel } : needElders('Main Stage'));

  const df = dist(MAP.FLAGPOLE);
  if (S.campaign.parliamentMarch && !S.campaign.flagRaised && df < 11) add(df - 4, { hold: true, label: 'Hold — raise the Aboriginal flag together', start: () => send({ t: 'flag', on: true }), stop: () => send({ t: 'flag', on: false }), progress: () => S.flag });

  for (const r of MAP.RALLIES) {
    const d = dist(r);
    if (d > 12 || !zoneOpen(r.zone)) continue;
    if (!S.metElders) { add(d, needElders(r.name)); continue; }
    const st = S.rallies[r.id] || [];
    if (st[2]) add(d, { hold: true, label: `Hold — clear the rumour at ${r.name}`, start: () => send({ t: 'yarn', rally: r.id }), stop: () => send({ t: 'yarn', rally: null }), progress: () => (S.rallies[r.id]?.[4] || 0) / 100 });
    else if (st[3] > 0) add(d, { label: `${r.name}: the crowd is fired up (${st[3]}s)${S.role === 'red' ? ' · Q to sabotage' : ''}`, run: () => {} });
    else add(d, { hold: true, label: `Hold — yarn with the crowd at ${r.name}${S.role === 'red' ? ' · Q to sabotage' : ''}`, start: () => send({ t: 'yarn', rally: r.id }), stop: () => send({ t: 'yarn', rally: null }), progress: () => (S.rallies[r.id]?.[1] || 0) / 100 });
  }
  for (const p of politicians) { const d = dist(p.root.position); if (d < 5 && p.root.visible) add(d, { label: `Lobby ${p.name}`, run: () => lobby(p) }); }
  for (const [id, n] of S.npcs) {
    const d = dist(n.char.root.position);
    if (d < 5 && n.state < 2) add(d, S.metElders ? { label: 'Yarn with this young person', run: () => question(id, n) } : needElders('Yarn'));
  }
  opts.sort((a, b) => a.d - b.d);
  return opts[0] || null;
}

function pressInteract() {
  if (!current || UI.dialogueOpen()) return;
  if (current.hold) { holding = current; holding.start(); }
  else current.run();
}
function releaseInteract() {
  if (holding) { holding.stop(); holding = null; }
}

async function talkElders() {
  const D = ELDER_DATA;
  const nameOf = (id) => D.elders.find((e) => e.id === id)?.name || '';
  const L = (arr) => arr.map((l) => ({ name: nameOf(l.who), text: l.text }));
  elders.forEach((c) => c.root.lookAt(me.x, 0, me.z));
  if (S.metElders) return UI.dialogue(L(D.again));
  let score = 0;
  const lines = L(D.intro);
  for (const q of D.quiz) {
    const line = { name: nameOf('aunty'), text: q.q, options: q.options };
    line.onPick = (k) => { if (k === q.answer) score++; lines.splice(lines.indexOf(line) + 1, 0, { name: nameOf('aunty'), text: k === q.answer ? q.right : q.wrong }); };
    lines.push(line);
  }
  lines.push(...L(D.farewell));
  lines.push({ name: '', text: `You scored ${'{score}'} — and earned culture points. The movement is yours to grow. Go yarn with the crowds (hold E at a blue rally ring).` });
  const last = lines[lines.length - 1];
  const origPick = lines.filter((l) => l.options).pop().onPick;
  lines.filter((l) => l.options).pop().onPick = (k) => { origPick(k); last.text = last.text.replace('{score}', `${score}/3`); };
  await UI.dialogue(lines);
  S.metElders = true;
  send({ t: 'metElders', score });
}

async function readInfo(ip) {
  send({ t: 'info', id: ip.id });
  await UI.dialogue([{ name: ip.title, text: ip.text }]);
}

async function lobby(p) {
  p.root.lookAt(me.x, 0, me.z);
  const c = S.campaign;
  const lines = p.blue
    ? [{ name: p.name, text: 'You lot changed my mind. You\'ve got my vote — keep the pressure on.' }]
    : [
        { name: p.name, text: ['Why should I listen to a bunch of kids?', 'I answer to the Crown, not to you.', 'Petitions? Show me real names and maybe I\'ll think about it.'][p.index % 3] },
        { name: '', text: `Real signatures turn politicians blue: every ${RULES.SIGS_PER_POLITICIAN} flips one. ${c.nextPoliticianIn} more needed for the next one. Share your petition link with real people.`, options: ['Share my petition link', 'Walk away'], onPick: (k) => k === 0 && setTimeout(sharePetition, 50) },
      ];
  await UI.dialogue(lines);
}

function question(id, n) {
  send({ t: 'question', npc: id });
  n.char.root.lookAt(me.x, 0, me.z);
  me.anim = 'yarn';
  S.yarnUntil = performance.now() + 2500;
  toast('Yarning… listen closely to their story.', 'info', 2500);
}
const GENUINE = ['Wait, the Elders said that? I never knew this was Gadigal land. I\'m in.', 'My nan marched back in the day. Count me in!', 'I thought nobody would listen to us. If we go together… yeah, let\'s do it.', 'Deadly. I\'ll bring my cousins too.'];
const SPY = ['Uh, yeah, I\'m totally with the movement. What time is the rally? Where exactly? Who\'s leading it?', 'Why do you need to know who I am? I just… like taking notes. On everyone.'];
function questionResult(m) {
  const lines = m.spy
    ? [{ name: 'Young person', text: SPY[m.npc % SPY.length] }, { name: '', text: 'Their story doesn\'t add up — they\'ve been reporting your plans to the Crown. RED SPY exposed and kicked out of the City!' }]
    : [{ name: 'Young person', text: GENUINE[m.npc % GENUINE.length] }, { name: '', text: `+${m.gain} supporters join the Blue side.` }];
  UI.dialogue(lines);
}

// ---------------- Stage ----------------
function openStagePanel() {
  const c = S.campaign;
  let kind = 'speech';
  const PH = {
    speech: 'Speak from the heart. What does culture mean to you? What needs to change in this city?\n\nEach new line lights up the big screen.',
    poem: 'Write your poem — one line per row.\nEach line lights up on the big screen for the crowd.',
    music: 'Add your lyrics (optional) — then tick Go Live to sing or play through your mic.',
  };
  const kinds = el('div', { class: 'kinds' });
  const title = el('input', { placeholder: 'Title', maxlength: 60 });
  const body = el('textarea', { placeholder: PH.speech, maxlength: 1200 });
  const liveBox = el('input', { type: 'checkbox', id: 'golive' });
  for (const k of ['speech', 'poem', 'music']) {
    const b = el('button', { class: k === kind ? 'on' : '', text: { speech: '🎤 Speech', poem: '📜 Poem', music: '🎸 Music' }[k], onclick: () => { kind = k; kinds.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); body.placeholder = PH[k]; if (k === 'music') liveBox.checked = true; } });
    kinds.append(b);
  }
  const queueText = S.stage.performer ? `On stage now: ${S.stage.performer.name}. ` : 'The mic is open. ';
  const content = [
    el('h2', { text: '🎤 Town Hall Main Stage' }),
    el('p', { text: queueText + (S.stage.queue.length ? `Up next: ${S.stage.queue.join(', ')}.` : '') + ' Share your feelings and your will with the crowd — every listener and reaction brings more people to the Blue side.' }),
    kinds, title, body,
    el('label', { class: 'live' }, liveBox, el('span', {}, el('b', { text: '🔴 Go Live — stream my voice. ' }), 'Your microphone is streamed to players near the stage while you perform. Be respectful: the crowd can mute you, and reports pause a performance.')),
  ];
  const row = el('div', { class: 'row' },
    el('button', { text: 'Cancel', onclick: UI.closeModal }),
    el('button', { class: 'go', text: 'Join the line-up', onclick: async () => {
      let wantLive = liveBox.checked;
      if (wantLive) {
        try { await live.startMic(); }
        catch { wantLive = false; toast('Microphone permission was blocked — performing without live audio.', 'warn'); }
      }
      send({ t: 'stageSubmit', kind, title: title.value, body: body.value, live: wantLive });
      UI.closeModal();
    } }));
  content.push(row);
  if (c.parliamentUnlocked && !c.parliamentMarch) {
    content.push(el('div', { class: 'row' }, el('button', { class: 'march', text: '📣 Start the main protest — march on Parliament House', onclick: () => { send({ t: 'startMarch', route: 'parliament' }); UI.closeModal(); } })));
  }
  content.push(el('p', { style: 'margin-top:12px', text: '' }, el('a', { href: `${S.mainPublicUrl}/voices`, target: '_blank', rel: 'noopener', style: 'color:#9cc7ff', text: 'Read past speeches, poems and songs →' })));
  UI.openModal(content);
}

function stageUpdate(m) {
  const prev = S.stage.performer;
  S.stage = { performer: m.performer, queue: m.queue };
  S.lastLine = -2;
  if (m.performer && (!prev || prev.id !== m.performer.id)) {
    m.performer.localStart = Date.now();
    m.performer.duration = m.performer.endsAt - m.performer.startedAt;
    if (m.performer.id !== S.myId) live?.stopListening();
  } else if (m.performer && prev) { m.performer.localStart = prev.localStart; m.performer.duration = prev.duration; }
  landmarks.stage.drawScreen({ performer: m.performer, queue: m.queue, line: '' });
  $('#btnEndSet').hidden = !amPerforming();
}
function stageEnded(m) {
  if (m.id === S.myId) { live?.stopMic(); toast('Your set is over. The crowd heard you. ✊', 'blue'); }
  else live?.stopListening();
}
function react(kind) {
  if (S.stage.performer && !amPerforming() && dist(MAP.STAGE) < RULES.STAGE_LISTEN_RADIUS) send({ t: 'react', kind });
}

function updateStage() {
  const p = S.stage.performer;
  const bar = $('#stagebar');
  const near = dist(MAP.STAGE) < RULES.STAGE_LISTEN_RADIUS;
  bar.hidden = !(p && (near || amPerforming()));
  if (!p) return;
  const elapsed = Date.now() - p.localStart;
  const frac = Math.min(0.999, elapsed / Math.max(1, p.duration));
  const idx = p.lines.length ? Math.floor(frac * p.lines.length) : -1;
  if (idx !== S.lastLine) {
    S.lastLine = idx;
    const line = idx >= 0 ? p.lines[idx] : '';
    landmarks.stage.drawScreen({ performer: p, queue: S.stage.queue, line });
    bar.querySelector('.who').textContent = `${p.kind} · ${p.name} · “${p.title || 'Untitled'}”${p.live ? ' · 🔴 LIVE' : ''}`;
    bar.querySelector('.line').textContent = line || (p.live ? '🎙 Live from the Town Hall stage…' : '');
    const c = p.id === S.myId ? me.char : S.others.get(p.id)?.char;
    if (line) c?.say(line, Math.max(3, p.duration / 1000 / Math.max(1, p.lines.length)));
  }
  // live audio: listeners near the stage pull the performer's stream
  if (p.live && !amPerforming() && live) {
    const d = dist(MAP.STAGE);
    if (d < RULES.STAGE_LISTEN_RADIUS && !S.muted) {
      if (!live.listen || live.listen.performerId !== p.id) live.request(p.id);
      else if (!live.listen.pc && performance.now() - live.listen.requestedAt > 5000) { live.stopListening(); live.request(p.id); }
      live.setVolume(Math.max(0.15, 1 - d / RULES.STAGE_LISTEN_RADIUS));
    } else if (live.listen) live.stopListening();
  }
}

function emojiSprite(text, color = '#fff') {
  const tex = canvasTexture(128, 128, (g) => { g.font = '96px system-ui, "Segoe UI Emoji", "Apple Color Emoji"'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = color; g.fillText(text, 64, 70); });
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
}
function floatEmoji(e) {
  const s = emojiSprite(e);
  s.position.set(MAP.STAGE.x + (Math.random() - 0.5) * 6, 6, MAP.STAGE.z + (Math.random() - 0.5) * 10);
  s.scale.setScalar(2.2);
  scene.add(s);
  floaters.push({ s, t0: performance.now(), vy: 3 });
}
function heckle() {
  const s = emojiSprite('📢');
  s.position.set(MAP.STAGE.x + 12 + Math.random() * 15, 5, MAP.STAGE.z + (Math.random() - 0.5) * 20);
  s.scale.setScalar(3);
  scene.add(s);
  floaters.push({ s, t0: performance.now(), vy: 1 });
}

// ---------------- Votes, ejection ----------------
function openVote(m) {
  S.meeting = m;
  releaseInteract();
  const list = el('div', { class: 'vote-list' });
  const timer = el('b', { id: 'votetimer' });
  const vote = (target, btn) => { send({ t: 'vote', target }); list.querySelectorAll('button').forEach((b) => (b.disabled = true)); btn.classList.add('voted'); };
  for (const c of m.candidates) {
    const b = el('button', { onclick: () => vote(c.id, b) }, el('span', { text: c.name + (c.id === S.myId ? ' (you)' : '') }), el('span', { text: '🗳' }));
    if (c.id === S.myId) b.disabled = true;
    list.append(b);
  }
  const skip = el('button', { onclick: () => vote('skip', skip) }, el('span', { text: 'Skip — not sure yet' }), el('span', { text: '⏭' }));
  list.append(skip);
  UI.openModal([
    el('h2', { text: '🔥 Yarning Circle Vote' }),
    el('p', { text: `${m.calledBy} called the circle. Who is the Red spy? Yarn it out in chat, then vote. Most votes is kicked out of the City.` }),
    el('p', {}, timer, ' · ', el('span', { id: 'votecount', text: '0 voted' })),
    list,
  ]);
  const tick = setInterval(() => {
    const left = Math.max(0, Math.ceil((m.endsAt - Date.now()) / 1000));
    const t = $('#votetimer');
    if (!t || !S.meeting) return clearInterval(tick);
    t.textContent = `${left}s left`;
  }, 250);
}
function meetingResult(m) {
  S.meeting = null;
  UI.closeModal();
  const tally = m.tally.map((x) => `${x.name}: ${x.n}`).join(' · ') + (m.skip ? ` · skipped: ${m.skip}` : '');
  if (m.ejected) {
    const red = m.ejected.wasRed;
    cinematic([{ html: `<span class="${red ? 'reveal-red' : 'reveal-blue'}">${escapeHtml(m.ejected.name)} ${red ? 'WAS a Red spy.' : 'was NOT a spy.'}</span><small>${red ? 'Kicked out of the City. The movement grows stronger.' : `The movement lost trust. −${RULES.WRONG_VOTE_PENALTY} supporters.`} ${escapeHtml(tally)}</small>`, ms: 4500 }]);
  } else cinematic([{ html: `Nobody was voted out.<small>${escapeHtml(tally || 'No votes cast.')}</small>`, ms: 3500 }]);
}
function ejected(m) {
  S.ejectedUntil = m.until;
  me.x = m.x; me.z = m.z;
  releaseInteract();
  const o = $('#ejected');
  o.hidden = false;
  const tick = setInterval(() => {
    const left = Math.ceil((S.ejectedUntil - Date.now()) / 1000);
    if (left <= 0 || !S.ejectedUntil) { o.hidden = true; S.ejectedUntil = 0; return clearInterval(tick); }
    o.innerHTML = `<div><h2>${m.wasRed ? '🕵 Your cover is blown.' : 'You were voted out of the City.'}</h2><p>You're on the outskirts for ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}. You can still chat.</p></div>`;
  }, 500);
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------------- Cinematics & finale ----------------
function cinematic(steps, opts = {}) {
  return new Promise((resolve) => {
    const box = $('#cinema'), text = box.querySelector('.cine-text');
    box.hidden = false;
    let i = 0, timer;
    const next = () => {
      clearTimeout(timer);
      if (i >= steps.length) { box.hidden = true; S.cine = null; return resolve(); }
      const st = steps[i++];
      text.innerHTML = st.html;
      st.run?.();
      if (st.cam) S.cine = { ...S.cine, cam: st.cam, blocking: opts.blocking, skip: next };
      timer = setTimeout(next, st.ms || 4000);
    };
    S.cine = { blocking: opts.blocking, skip: next };
    next();
  });
}
async function runFinale(m) {
  releaseInteract();
  UI.closeModal();
  const F = MAP.FLAGPOLE, P = MAP.POLITICIAN_SPOTS[RULES.ZONE_COUNT - 1];
  const camFlag = { pos: new THREE.Vector3(F.x - 30, 10, F.z + 18), look: new THREE.Vector3(F.x, 16, F.z) };
  const camMPs = { pos: new THREE.Vector3(P.x - 22, 7, P.z + 6), look: new THREE.Vector3(P.x, 2, P.z) };
  const reds = politicians.filter((p) => p.zone === RULES.ZONE_COUNT - 1 && !p.blue);
  const steps = [
    { html: 'The Australian flag comes down over Macquarie Street…', cam: camFlag, ms: 4000, run: () => landmarks.flag.set(0.45, false) },
    { html: 'The Aboriginal flag rises.<small>Black for the people. Red for the earth. Yellow for the sun.</small>', cam: camFlag, ms: 5000, run: () => { S.flagAnim = { t0: performance.now(), from: 0.5, to: 1 }; } },
    { html: 'Inside Parliament, the vote is called…', cam: camMPs, ms: 3500 },
  ];
  if (m.victory) {
    steps.push({ html: `<span class="reveal-blue">${m.blueMPs} blue MPs vote with the people.</span><small>${reds.length} Red MPs are voted out of Parliament.</small>`, cam: camMPs, ms: 6000, run: () => reds.forEach((p, i) => { p.setName(`${p.name} · VOTED OUT`, '#ff8a8a'); p.leaving = { t0: performance.now() + i * 400 }; }) });
    steps.push({ html: 'The Crown answers to Country now.<small>Gadigal land. Always was, always will be. Thank you for playing Voices Rising.</small>', cam: camFlag, ms: 8000 });
  } else {
    steps.push({ html: `<span class="reveal-red">The Reds still hold ${10 - m.blueMPs} of 10 seats.</span><small>You need ${m.needed - m.blueMPs} more blue MPs — that's ${(m.needed - m.blueMPs) * RULES.SIGS_PER_POLITICIAN} more real signatures. Keep lobbying!</small>`, cam: camMPs, ms: 7000 });
  }
  await cinematic(steps, { blocking: true });
  S.flagAnim = null;
  landmarks.flag.set(1, true);
  if (m.victory) for (const p of reds) p.root.visible = false;
}

// ---------------- Big map ----------------
function mapState() {
  return {
    me: { x: me.x, z: me.z, yaw: me.yaw, red: S.role === 'red' },
    others: [...S.others.values()].map((o) => ({ x: o.char.root.position.x, z: o.char.root.position.z, red: o.f & 6 })),
    rallies: S.rallies, campaign: S.campaign, march: S.march,
  };
}
function openBigMap() {
  $('#bigmap').hidden = false;
  UI.drawBigMap($('#bigmap canvas'), mapState());
}

// ---------------- Movement & collision ----------------
function lockedZoneAt(x, z) {
  for (const zn of MAP.ZONES) if (!S.campaign.unlocked[zn.id] && Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn;
  return null;
}
let lockToastAt = 0;
function blocked(x, z) {
  const B = MAP.BOUNDS;
  if (x < B.minX + 2 || x > B.maxX - 2 || z < B.minZ + 2 || z > B.maxZ - 2) return true;
  if (MAP.inWater(x, z)) return true;
  if (world.colliders.hit(x, z, 0.7, me.y)) return true;
  if (S.ejectedUntil) return Math.hypot(x - MAP.OUTSKIRTS.x, z - MAP.OUTSKIRTS.z) > 30;
  const zn = lockedZoneAt(x, z);
  if (zn && lockedZoneAt(me.x, me.z) !== zn) {
    const head = S.march && MAP.pointAlong(MAP.MARCH_ROUTES[S.march.route], S.march.d);
    if (head && Math.hypot(head.x - x, head.z - z) < 45) return false; // the march pushes through the barrier
    if (performance.now() - lockToastAt > 4000) {
      lockToastAt = performance.now();
      toast(`🔒 ${zn.name} is locked — it opens at ${zn.id * RULES.SIGS_PER_ZONE} real signatures${zn.key === 'townhall' ? ' or when the march reaches City Council' : ''}.`, 'warn');
    }
    return true;
  }
  return false;
}

let sendAcc = 0;
function updatePlayer(dt) {
  const locked = UI.dialogueOpen() || UI.modalOpen() || !!S.cine || !$('#bigmap').hidden;
  let f = 0, r = 0;
  if (!locked) {
    if (keys.has('KeyW') || keys.has('ArrowUp')) f += 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) f -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) r += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) r -= 1;
    f -= stick.y; r += stick.x;
  }
  if (amPerforming()) { f = 0; r = 0; }
  const len = Math.hypot(f, r);
  const run = keys.has('ShiftLeft') || keys.has('ShiftRight') || Math.hypot(stick.x, stick.y) > 0.9;
  const speed = len > 0.1 ? (run ? 15 : 9) * Math.min(1, len) : 0;
  if (len > 0.1) {
    f /= len; r /= len;
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const vx = (fx * f + rx * r) * speed, vz = (fz * f + rz * r) * speed;
    const nx = me.x + vx * dt, nz = me.z + vz * dt;
    if (!blocked(nx, me.z)) me.x = nx;
    if (!blocked(me.x, nz)) me.z = nz;
    const target = Math.atan2(vx, vz);
    let d = target - me.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    me.yaw += d * Math.min(1, dt * 12);
    if (holding) releaseInteract();
  }
  const ground = landmarks.groundHeight(me.x, me.z);
  if (!locked && keys.has('Space') && me.y <= ground + 0.01) me.vy = 9;
  me.vy -= 25 * dt;
  me.y += me.vy * dt;
  if (me.y <= ground) { me.y = ground; me.vy = 0; }
  me.anim = holding ? (holding.label.includes('flag') ? 'hold' : 'yarn') : amPerforming() ? 'perform' : performance.now() < (S.yarnUntil || 0) ? 'yarn' : speed > 0 ? 'walk' : 'idle';
  me.char.root.position.set(me.x, me.y, me.z);
  me.char.root.rotation.y = me.yaw;
  me.char.update(dt, speed, me.anim);
  sendAcc += dt;
  if (sendAcc > 0.066) { sendAcc = 0; send({ t: 'state', p: [+me.x.toFixed(2), +me.y.toFixed(2), +me.z.toFixed(2)], r: +me.yaw.toFixed(2), a: ANIM[me.anim] }); }
}

function updateOthers(dt) {
  const k = Math.min(1, dt * 10);
  for (const o of S.others.values()) {
    const root = o.char.root;
    const px = root.position.x, pz = root.position.z;
    root.position.x += (o.tx - px) * k;
    root.position.y += (o.ty - root.position.y) * k;
    root.position.z += (o.tz - pz) * k;
    let d = o.tr - root.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    root.rotation.y += d * k;
    const sp = Math.hypot(root.position.x - px, root.position.z - pz) / Math.max(dt, 1e-3);
    const dd = dist(root.position);
    root.visible = dd < 220;
    o.char.setDetail(dd < 50);
    if (root.visible) o.char.update(dt, sp, ANIM_NAMES[o.a] || 'idle');
  }
  for (const n of S.npcs.values()) {
    const root = n.char.root;
    const px = root.position.x, pz = root.position.z;
    root.position.x += (n.tx - px) * k;
    root.position.z += (n.tz - pz) * k;
    if (n.state === 2) root.position.y = Math.max(-3, root.position.y - dt * 0.6);
    const vx = root.position.x - px, vz = root.position.z - pz;
    if (Math.hypot(vx, vz) > 0.01) root.rotation.y = Math.atan2(vx, vz);
    const dd = dist(root.position);
    root.visible = dd < 180;
    n.char.setDetail(dd < 40);
    if (root.visible) n.char.update(dt, Math.hypot(vx, vz) / Math.max(dt, 1e-3), n.state === 3 ? 'cheer' : 'idle');
  }
  for (const p of politicians) {
    if (p.leaving) {
      const t = (performance.now() - p.leaving.t0) / 1000;
      if (t > 0) { p.root.position.x = p.home.x + t * 4; p.root.rotation.y = Math.PI / 2; p.update(dt, 4, 'idle'); }
      continue;
    }
    const dd = dist(p.root.position);
    const vis = dd < 160 && !(S.campaign?.victory && p.zone === RULES.ZONE_COUNT - 1 && !p.blue);
    p.root.visible = vis;
    if (!vis) continue;
    p.setDetail(dd < 40);
    if (p.tag) p.tag.visible = dd < 30;
    p.update(dt, 0, p.blue && S.campaign?.flagRaised ? 'cheer' : 'idle');
  }
  for (const e of elders) e.update(dt, 0, 'idle');
}

// ---------------- Crowds ----------------
function gridPlacer(cx, cz, faceX, faceZ, cols = 14, sp = 1.9) {
  const yaw = Math.atan2(faceX - cx, faceZ - cz);
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return (i) => {
    const row = Math.floor(i / cols), col = (i % cols) - cols / 2;
    return { x: cx - fx * row * sp + rx * col * sp, z: cz - fz * row * sp + rz * col * sp, yaw, moving: false };
  };
}
function updateCrowds(t) {
  const c = S.campaign;
  if (!c) return;
  let count, placer;
  if (S.march) {
    const pts = MAP.MARCH_ROUTES[S.march.route];
    count = Math.min(900, c.supporters / 12);
    placer = (i) => {
      const row = Math.floor(i / 8), col = (i % 8) - 3.5;
      const p = MAP.pointAlong(pts, Math.max(0, S.march.d - 3 - row * 1.9));
      return { x: p.x - p.dz * col * 1.8, z: p.z + p.dx * col * 1.8, yaw: Math.atan2(p.dx, p.dz), moving: S.march.d - 3 - row * 1.9 > 0 };
    };
  } else if (c.parliamentMarch) {
    count = Math.min(900, c.supporters / 12);
    placer = gridPlacer(MAP.FLAGPOLE.x - 16, MAP.FLAGPOLE.z + 6, MAP.FLAGPOLE.x, MAP.FLAGPOLE.z, 10);
  } else if (c.councilMarch) {
    count = Math.min(700, c.supporters / 15);
    placer = gridPlacer(MAP.STAGE.x + 16, MAP.STAGE.z, MAP.STAGE.x, MAP.STAGE.z, 16);
  } else {
    count = Math.min(400, c.supporters / 20);
    const rp = MAP.RALLIES[1];
    placer = gridPlacer(rp.x, rp.z + 4, rp.x, rp.z - 20, 12);
  }
  crowd.update(t, count, (i) => {
    const p = placer(i);
    return S.stage.performer && !S.march && c.councilMarch && !c.parliamentMarch ? { ...p, moving: false, yaw: p.yaw } : p;
  });
  // Locals waiting at each rally
  const per = 6;
  locals.update(t, MAP.RALLIES.length * per, (i) => {
    const r = MAP.RALLIES[Math.floor(i / per)], k = i % per;
    const a = (k / per) * Math.PI * 2 + r.id;
    const x = r.x + Math.cos(a) * 6.5, z = r.z + Math.sin(a) * 6.5;
    return { x, z, yaw: Math.atan2(r.x - x, r.z - z), moving: (S.rallies[r.id]?.[1] || 0) > 0 };
  });
}

// ---------------- Camera ----------------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCamera(dt, t) {
  if (!S.playing && !S.cine?.cam) {
    const a = t * 0.04;
    camera.position.set(Math.sin(a) * 260, 140, Math.cos(a) * 260 - 80);
    camera.lookAt(30, 20, -120);
    return;
  }
  if (S.cine?.cam) {
    camPos.lerp(S.cine.cam.pos, Math.min(1, dt * 2));
    camLook.lerp(S.cine.cam.look, Math.min(1, dt * 2));
  } else {
    const target = new THREE.Vector3(me.x, me.y + 2.4, me.z);
    const dir = new THREE.Vector3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
    // camera collision: pull in toward the player if a building is in the way
    let d = cam.dist;
    for (let s = 1.5; s <= cam.dist; s += 0.75) {
      const px = target.x + dir.x * s, py = target.y + dir.y * s, pz = target.z + dir.z * s;
      if (world.colliders.hit(px, pz, 1.0, py)) { d = Math.max(2.5, s - 1); break; }
    }
    camPos.lerp(target.clone().addScaledVector(dir, d), Math.min(1, dt * (d < cam.dist ? 20 : 8)));
    if (camPos.y < 1.5) camPos.y = 1.5;
    camLook.lerp(target, Math.min(1, dt * 12));
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
}

// ---------------- Main loop ----------------
let last = performance.now(), mapAcc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  if (S.playing) {
    updatePlayer(dt);
    updateOthers(dt);
    updateStage();
    current = findInteraction();
    const pr = $('#prompt');
    if (current && !UI.dialogueOpen() && !UI.modalOpen()) { pr.style.display = 'block'; pr.innerHTML = `<kbd>E</kbd>${escapeHtml(current.label)}`; }
    else pr.style.display = 'none';
    if (holding && (!current || current.label !== holding.label)) releaseInteract();
    const hb = $('#holdbar');
    hb.style.display = holding ? 'block' : 'none';
    if (holding) hb.firstElementChild.style.width = `${Math.round((holding.progress?.() || 0) * 100)}%`;
    mapAcc += dt;
    if (mapAcc > 0.1) {
      mapAcc = 0;
      UI.drawMinimap($('#minimap canvas'), mapState());
      const ll = toLatLon(me.x, me.z);
      const zn = MAP.zoneAt(me.x, me.z);
      $('#coords').textContent = `${ll.lat.toFixed(5)}, ${ll.lon.toFixed(5)}${zn ? ' · ' + zn.name.split(' —')[0] : ''}`;
    }
  }
  if (S.flagAnim) {
    const k = Math.min(1, (performance.now() - S.flagAnim.t0) / 4000);
    landmarks.flag.set(S.flagAnim.from + (S.flagAnim.to - S.flagAnim.from) * k, false);
  }
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i], age = (now - f.t0) / 1000;
    f.s.position.y += f.vy * dt;
    f.s.material.opacity = Math.max(0, 1 - age / 2.2);
    if (age > 2.2) { scene.remove(f.s); f.s.material.map.dispose(); floaters.splice(i, 1); }
  }
  music?.update(dt, { me, march: S.march, stageBusy: !!S.stage.performer && !amPerforming(), playing: S.playing });
  updateCrowds(t);
  updateCamera(dt, t);
  const focus = S.playing ? me : { x: 0, z: -60 };
  world.update(t, focus);
  landmarks.update(t, { stageActive: !!S.stage.performer, rallyStates: S.rallies, locked: (z) => !S.campaign?.unlocked[z] });
  if (quality === 'high') composer.render();
  else renderer.render(scene, camera);
}

window.__vr = { S, me, cam, camera, scene, send, get live() { return live; }, step: (n = 30) => { for (let i = 0; i < n; i++) frame(last + 16); } }; // debugging handle

boot().catch((e) => {
  console.error(e);
  $('#loading').textContent = 'Could not load the game: ' + e.message;
});
