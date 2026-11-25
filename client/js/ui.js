// DOM UI helpers: toasts, chat, adventure-style dialogue, modals, minimap.
import * as MAP from '/shared/mapdata.js';

export const $ = (s) => document.querySelector(s);
export const el = (tag, props = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'text') e.textContent = v;
    else e.setAttribute(k, v);
  }
  for (const kid of kids) if (kid != null) e.append(kid);
  return e;
};

export function toast(text, kind = 'info', ms = 5000) {
  const t = el('div', { class: `toast ${kind}`, text });
  $('#toasts').append(t);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  setTimeout(() => t.remove(), ms);
}

export function chatLine(from, text, sys = false) {
  const log = $('#chatlog');
  const line = el('div', { class: sys ? 'sys' : '' });
  if (from) line.append(el('b', { text: from + ': ' }));
  line.append(text);
  log.append(line);
  while (log.children.length > 60) log.firstChild.remove();
  log.scrollTop = log.scrollHeight;
}

// ---------- Dialogue ----------
let dlg = null;
export const dialogueOpen = () => !!dlg;
export function dialogue(lines) {
  return new Promise((resolve) => {
    const box = $('#dialogue'), nameEl = box.querySelector('.name'), textEl = box.querySelector('.text'), opts = box.querySelector('.opts'), next = box.querySelector('.next');
    box.hidden = false;
    let i = -1, typing = null, full = '';
    const answers = [];
    const show = () => {
      i++;
      if (i >= lines.length) { close(); return; }
      const L = lines[i];
      nameEl.textContent = L.name || '';
      nameEl.style.display = L.name ? '' : 'none';
      opts.innerHTML = '';
      next.style.display = L.options ? 'none' : '';
      full = L.text;
      let n = 0;
      clearInterval(typing);
      typing = setInterval(() => {
        n += 2;
        textEl.textContent = full.slice(0, n);
        if (n >= full.length) { clearInterval(typing); typing = null; renderOpts(L); }
      }, 22);
    };
    const renderOpts = (L) => {
      if (!L.options) return;
      L.options.forEach((o, k) => {
        const b = el('button', { text: `${k + 1}. ${o}`, onclick: (e) => { e.stopPropagation(); answers.push(k); L.onPick?.(k); show(); } });
        opts.append(b);
      });
      opts.querySelector('button')?.focus();
    };
    const advance = () => {
      const L = lines[i];
      if (typing) { clearInterval(typing); typing = null; textEl.textContent = full; renderOpts(L); return; }
      if (L?.options) return;
      show();
    };
    const close = () => { clearInterval(typing); box.hidden = true; box.onclick = null; dlg = null; resolve(answers); };
    box.onclick = advance;
    dlg = {
      advance,
      pick: (k) => { const L = lines[i]; if (L?.options && !typing && L.options[k] != null) { answers.push(k); L.onPick?.(k); show(); } },
      close,
    };
    show();
  });
}
export function dialogueKey(e) {
  if (!dlg) return false;
  if (['KeyE', 'Space', 'Enter'].includes(e.code)) dlg.advance();
  else if (/^Digit[1-9]$/.test(e.code)) dlg.pick(Number(e.code.slice(5)) - 1);
  else if (e.code === 'Escape') dlg.close();
  return true;
}

// ---------- Modal ----------
export function openModal(content) {
  const m = $('#modal');
  m.innerHTML = '';
  const box = el('div', { class: 'mbox' });
  box.append(...[].concat(content));
  m.append(box);
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) closeModal(); };
  return box;
}
export const closeModal = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; };
export const modalOpen = () => !$('#modal').hidden;

// ---------- Maps ----------
const SCALE = 1; // px per world unit in the base map
let base = null;
export function buildBaseMap() {
  const B = MAP.BOUNDS;
  const w = Math.ceil((B.maxX - B.minX) * SCALE), h = Math.ceil((B.maxZ - B.minZ) * SCALE);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  const tx = (x) => (x - B.minX) * SCALE, tz = (z) => (z - B.minZ) * SCALE;
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z)))); g.closePath(); };
  g.fillStyle = '#e4d8bd'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#4aa3d8'; poly(MAP.WATER); g.fill();
  g.fillStyle = '#8cc866'; for (const p of MAP.PARKS) { poly(p.wp); g.fill(); }
  g.strokeStyle = '#9c8f7f'; g.lineWidth = MAP.RAIL.w * SCALE * 0.6; g.beginPath(); MAP.RAIL.wp.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z)))); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const r of MAP.ROADS) { g.lineWidth = r.w * SCALE; g.beginPath(); r.wp.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z)))); g.stroke(); }
  g.fillStyle = '#5a5a5a'; g.font = 'bold 13px system-ui'; g.textAlign = 'center';
  for (const r of MAP.ROADS) { const m = MAP.pointAlong(r.wp, MAP.polyLength(r.wp) / 2); g.fillText(r.name, tx(m.x), tz(m.z) - 6); }
  base = { canvas: c, tx, tz };
  return base;
}

function drawOverlay(g, tx, tz, s, st) {
  const dot = (x, z, r, color, stroke = '#1a1420') => { g.beginPath(); g.arc(tx(x), tz(z), r, 0, Math.PI * 2); g.fillStyle = color; g.fill(); g.lineWidth = 1.5; g.strokeStyle = stroke; g.stroke(); };
  for (const zn of MAP.ZONES) {
    g.beginPath(); g.arc(tx(zn.x), tz(zn.z), zn.r * s, 0, Math.PI * 2);
    g.lineWidth = 3; g.setLineDash([8, 6]); g.strokeStyle = st.campaign?.unlocked[zn.id] ? 'rgba(47,123,255,0.9)' : 'rgba(224,49,49,0.9)'; g.stroke(); g.setLineDash([]);
  }
  if (st.march) {
    const pts = MAP.MARCH_ROUTES[st.march.route];
    g.strokeStyle = 'rgba(255,205,0,0.9)'; g.lineWidth = 4; g.beginPath(); pts.forEach(([x, z], i) => (i ? g.lineTo(tx(x), tz(z)) : g.moveTo(tx(x), tz(z)))); g.stroke();
    const h = MAP.pointAlong(pts, st.march.d); dot(h.x, h.z, 7, '#ffcd00');
  }
  for (const r of MAP.RALLIES) { const rs = st.rallies?.[r.id]; dot(r.x, r.z, 5, !st.campaign?.unlocked[r.zone] ? '#888' : rs?.[2] ? '#e03131' : '#2f7bff'); }
  for (const i of MAP.INFO_POINTS) dot(i.x, i.z, 4, '#ffcd00');
  dot(MAP.ELDERS.x, MAP.ELDERS.z, 6, '#ff8a3a');
  dot(MAP.STAGE.x, MAP.STAGE.z, 7, '#9b5cff');
  dot(MAP.FLAGPOLE.x, MAP.FLAGPOLE.z, 6, '#ffffff');
  for (const p of st.others || []) dot(p.x, p.z, 4, p.red ? '#e03131' : '#7fb3ff', '#fff');
  if (st.me) {
    g.save(); g.translate(tx(st.me.x), tz(st.me.z)); g.rotate(-st.me.yaw + Math.PI);
    g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath();
    g.fillStyle = st.me.red ? '#e03131' : '#ffcd00'; g.fill(); g.strokeStyle = '#1a1420'; g.lineWidth = 2; g.stroke(); g.restore();
  }
}

export function drawMinimap(canvas, st) {
  if (!base) buildBaseMap();
  const g = canvas.getContext('2d');
  const W = canvas.width, zoom = 1.3;
  g.save();
  g.clearRect(0, 0, W, W);
  g.beginPath(); g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#4aa3d8'; g.fillRect(0, 0, W, W);
  const cx = base.tx(st.me.x), cz = base.tz(st.me.z);
  g.translate(W / 2, W / 2); g.scale(zoom, zoom); g.translate(-cx, -cz);
  g.drawImage(base.canvas, 0, 0);
  drawOverlay(g, base.tx, base.tz, SCALE, st);
  g.restore();
}

export function drawBigMap(canvas, st) {
  if (!base) buildBaseMap();
  canvas.width = base.canvas.width; canvas.height = base.canvas.height;
  const g = canvas.getContext('2d');
  g.drawImage(base.canvas, 0, 0);
  drawOverlay(g, base.tx, base.tz, SCALE, st);
  g.font = 'bold 16px system-ui'; g.textAlign = 'center';
  for (const zn of MAP.ZONES) { g.fillStyle = '#1a1420'; g.fillText(zn.name, base.tx(zn.x), base.tz(zn.z) - zn.r * SCALE - 6); }
  const lab = (p, t) => { g.fillStyle = '#1a1420'; g.fillText(t, base.tx(p.x), base.tz(p.z) + 22); };
  lab(MAP.ELDERS, 'Elders'); lab(MAP.STAGE, 'Main Stage'); lab(MAP.FLAGPOLE, 'Flagpole');
  lab(MAP.LANDMARKS.operaHouse, 'Opera House'); lab(MAP.LANDMARKS.sydneyTower, 'Sydney Tower');
}
