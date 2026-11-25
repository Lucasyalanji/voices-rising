// Cel-shaded characters with realistic (about 7 heads tall) proportions, jointed limbs and simple faces,
// plus name tags, speech bubbles and an instanced marching crowd.
import * as THREE from 'three';
import { toon, addOutline, INK_THIN, canvasTexture, drawAboriginalFlag } from './materials.js';
import { mulberry32 } from './world.js';

export const TEAM = { blue: 0x2f7bff, red: 0xe03131 };
const SKIN = [0x4a2e1f, 0x5a3825, 0x6b4430, 0x7d5038, 0x8d5a3b, 0xa06a45, 0xb97f55, 0xd29a6c, 0xe8b98e];
const HAIR = [0x141012, 0x1e1612, 0x2c1d14, 0x4a2e1c, 0x111111, 0x6b4a2a];
const PANTS = [0x2b2d3a, 0x3b3f52, 0x1f2a44, 0x4d4339, 0x2a2a2a, 0x5a4b6b, 0x3d5a80];
const SHOES = [0xf2f2f2, 0x1a1a1a, 0xd9d9d9, 0x8b5a2b];

// Geometry (shared). Short, chunky "chibi" proportions (big head) like the first version; total figure ≈ 2.6.
const G = {
  thigh: new THREE.CapsuleGeometry(0.17, 0.2, 4, 10),
  shin: new THREE.CapsuleGeometry(0.145, 0.18, 4, 10),
  shoe: new THREE.BoxGeometry(0.28, 0.15, 0.42),
  hips: new THREE.CapsuleGeometry(0.27, 0.12, 4, 12),
  torso: new THREE.CapsuleGeometry(0.38, 0.34, 6, 14),
  upperArm: new THREE.CapsuleGeometry(0.12, 0.2, 4, 8),
  foreArm: new THREE.CapsuleGeometry(0.105, 0.18, 4, 8),
  hand: new THREE.SphereGeometry(0.12, 10, 8),
  neck: new THREE.CylinderGeometry(0.09, 0.11, 0.18, 10),
  head: new THREE.SphereGeometry(0.29, 24, 18),
  eye: new THREE.SphereGeometry(0.035, 8, 6),
  brow: new THREE.BoxGeometry(0.1, 0.022, 0.02),
  nose: new THREE.ConeGeometry(0.04, 0.1, 6),
  mouth: new THREE.BoxGeometry(0.1, 0.018, 0.02),
  ear: new THREE.SphereGeometry(0.06, 8, 6),
  hair: new THREE.SphereGeometry(0.31, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.46),
  hairBack: new THREE.CapsuleGeometry(0.22, 0.3, 4, 10),
  bun: new THREE.SphereGeometry(0.12, 10, 8),
  curls: new THREE.IcosahedronGeometry(0.34, 1),
  capTop: new THREE.SphereGeometry(0.315, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
  brim: new THREE.CylinderGeometry(0.24, 0.24, 0.03, 20, 1, false, -Math.PI / 2, Math.PI),
  hood: new THREE.SphereGeometry(0.26, 14, 10, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.45),
  patch: new THREE.PlaneGeometry(0.2, 0.12),
  collar: new THREE.TorusGeometry(0.13, 0.04, 6, 14),
  stick: new THREE.CylinderGeometry(0.035, 0.045, 1.15, 6),
  tie: new THREE.BoxGeometry(0.07, 0.36, 0.03),
  lapel: new THREE.BoxGeometry(0.1, 0.4, 0.03),
  glasses: new THREE.TorusGeometry(0.06, 0.008, 6, 16),
  sign: new THREE.BoxGeometry(0.8, 0.5, 0.05),
  pole: new THREE.CylinderGeometry(0.03, 0.03, 1.1, 5),
};
const FLAG_TEX = canvasTexture(64, 40, drawAboriginalFlag);
const EYE = new THREE.MeshBasicMaterial({ color: 0x15121a });
const DARK = toon(0x2a1a14);

function part(geo, mat, parent, x, y, z, outline = true) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  if (outline) addOutline(m, INK_THIN);
  parent.add(m);
  return m;
}
function joint(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function appearance(seed) {
  const r = mulberry32(seed);
  return {
    skin: SKIN[Math.floor(r() * SKIN.length)],
    hair: HAIR[Math.floor(r() * HAIR.length)],
    pants: PANTS[Math.floor(r() * PANTS.length)],
    shoes: SHOES[Math.floor(r() * SHOES.length)],
    style: ['short', 'long', 'bun', 'cap', 'curly', 'braids'][Math.floor(r() * 6)],
    capColor: [0x111111, 0xffcd00, 0xd4202a, 0xffffff][Math.floor(r() * 4)],
    build: 0.92 + r() * 0.16, // shoulder/hip width
    height: 0.94 + r() * 0.12,
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export class Character {
  constructor({ seed = 1, shirt = TEAM.blue, kind = 'youth', name = '' } = {}) {
    const a = appearance(seed);
    this.kind = kind;
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.phase = Math.random() * 10;
    this.speed = 0;

    const skin = toon(a.skin);
    this.shirtMat = toon(shirt, { nocache: true });
    const pants = toon(kind === 'politician' ? 0x22252e : kind === 'elder' ? 0x4a4038 : a.pants);
    const shoes = toon(kind === 'politician' ? 0x111111 : kind === 'elder' ? 0x5a3a24 : a.shoes);
    const hairMat = toon(kind === 'elder' ? 0xd9d6d0 : a.hair);
    const w = a.build;

    // ----- legs (hip -> knee -> foot) -----
    const hipY = 0.8;
    this.legs = [-1, 1].map((side) => {
      const hip = joint(this.body, side * 0.17 * w, hipY, 0);
      part(G.thigh, pants, hip, 0, -0.18, 0);
      const knee = joint(hip, 0, -0.36, 0);
      part(G.shin, pants, knee, 0, -0.15, 0);
      part(G.shoe, shoes, knee, 0, -0.36, 0.06, false);
      return { hip, knee };
    });
    // ----- body -----
    const hips = part(G.hips, pants, this.body, 0, hipY + 0.02, 0);
    hips.scale.set(w, 1, 0.75);
    hips.rotation.z = Math.PI / 2;
    hips.scale.set(1, w, 0.75);
    this.torso = part(G.torso, this.shirtMat, this.body, 0, hipY + 0.45, 0);
    this.torso.scale.set(w * 1.08, 1, 0.8);
    part(G.neck, skin, this.body, 0, hipY + 0.86, 0, false);
    if (kind === 'youth') {
      part(G.hood, this.shirtMat, this.body, 0, hipY + 0.78, -0.12, false).scale.setScalar(1.25);
      const patch = new THREE.Mesh(G.patch, new THREE.MeshBasicMaterial({ map: FLAG_TEX }));
      patch.position.set(0.12, hipY + 0.55, 0.3);
      this.body.add(patch);
    }
    if (kind === 'politician') {
      part(G.collar, toon(0xf2f2f2), this.body, 0, hipY + 0.8, 0.02, false).rotation.x = Math.PI / 2;
      part(G.tie, toon(0xb8b8c8), this.body, 0, hipY + 0.55, 0.3, false);
      for (const s of [-1, 1]) part(G.lapel, toon(0x1a1c22), this.body, s * 0.11, hipY + 0.58, 0.29, false).rotation.z = s * 0.25;
    }
    if (kind === 'elder') part(G.collar, toon(0xece4d4), this.body, 0, hipY + 0.8, 0.02, false).rotation.x = Math.PI / 2;

    // ----- arms (shoulder -> elbow -> hand) -----
    const shY = hipY + 0.72;
    this.arms = [-1, 1].map((side) => {
      const sh = joint(this.body, side * 0.47 * w, shY, 0);
      part(G.upperArm, this.shirtMat, sh, 0, -0.16, 0);
      const el = joint(sh, 0, -0.32, 0);
      part(G.foreArm, kind === 'youth' && side > 0 && a.style === 'cap' ? skin : this.shirtMat, el, 0, -0.14, 0);
      part(G.hand, skin, el, 0, -0.32, 0, false);
      return { sh, el };
    });
    [this.armL, this.armR] = this.arms.map((x) => x.sh);

    // ----- head -----
    this.head = joint(this.body, 0, hipY + 1.36, 0);
    this.head.scale.setScalar(1.6);
    const h = part(G.head, skin, this.head, 0, 0, 0);
    h.scale.set(0.92, 1.08, 0.98);
    for (const s of [-1, 1]) {
      part(G.eye, EYE, this.head, s * 0.1, 0.04, 0.255, false).scale.set(1, 1.3, 0.6);
      part(G.brow, kind === 'elder' ? toon(0xcfcac2) : DARK, this.head, s * 0.1, 0.11, 0.26, false).rotation.z = -s * 0.12;
      part(G.ear, skin, this.head, s * 0.27, 0.01, 0, false).scale.set(0.5, 1, 0.7);
    }
    const nose = part(G.nose, skin, this.head, 0, -0.02, 0.28, false);
    nose.rotation.x = Math.PI / 2;
    part(G.mouth, toon(0x6b2e2a), this.head, 0, -0.13, 0.25, false);
    if (kind === 'elder') for (const s of [-1, 1]) part(G.glasses, new THREE.MeshBasicMaterial({ color: 0x2a2320 }), this.head, s * 0.1, 0.04, 0.275, false);

    const style = kind === 'politician' ? 'short' : kind === 'elder' ? (seed % 2 ? 'bun' : 'short') : a.style;
    if (style === 'cap') {
      const capMat = toon(a.capColor);
      part(G.capTop, capMat, this.head, 0, 0.06, 0);
      part(G.brim, capMat, this.head, 0, 0.09, 0.18, false).scale.set(1, 1, 1.5);
    } else {
      const top = part(G.hair, hairMat, this.head, 0, 0.04, -0.03);
      top.scale.set(0.97, 1.08, 1.03);
      top.rotation.x = -0.42; // hairline up at the front, longer at the back
      if (style === 'curly') { const c = part(G.curls, hairMat, this.head, 0, 0.13, -0.07, false); c.scale.set(0.98, 0.8, 0.95); }
      if (style === 'long') { const b = part(G.hairBack, hairMat, this.head, 0, -0.22, -0.13, false); b.scale.set(1, 1, 0.45); }
      if (style === 'bun') part(G.bun, hairMat, this.head, 0, 0.27, -0.15);
      if (style === 'braids') for (const s of [-1, 1]) { const b = part(G.hairBack, hairMat, this.head, s * 0.16, -0.3, -0.06, false); b.scale.set(0.3, 0.9, 0.3); }
    }
    if (kind === 'elder') this.stick = part(G.stick, toon(0x7a5230), this.arms[1].el, 0, -0.5, 0.05, false);
    if (kind === 'protester') {
      const g = joint(this.arms[1].el, 0, -0.32, 0);
      part(G.pole, toon(0x8a6a4a), g, 0, 0.5, 0, false);
      part(G.sign, toon(0xfff6e0), g, 0, 1.1, 0, false);
    }

    this.stoop = kind === 'elder' ? 0.08 : 0;
    this.body.rotation.x = this.stoop;
    this.root.scale.setScalar(a.height * (kind === 'elder' ? 0.96 : 1));
    if (name) this.setName(name);
  }

  setShirt(color) { this.shirtMat.color.set(color); }

  setName(text, color = '#ffffff') {
    if (this.tag) { this.root.remove(this.tag); this.tag.material.map.dispose(); }
    if (!text) return;
    const tex = canvasTexture(512, 96, (g, w) => {
      g.font = 'bold 44px system-ui, sans-serif';
      const tw = Math.min(w - 20, g.measureText(text).width + 40);
      g.fillStyle = 'rgba(15,18,30,0.72)';
      g.beginPath(); g.roundRect((w - tw) / 2, 14, tw, 68, 30); g.fill();
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(text, w / 2, 50, w - 40);
    });
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    this.tag.scale.set(3.6, 0.68, 1);
    this.tag.position.y = 3.15;
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
  }

  say(text, seconds = 4) {
    if (this.bubble) this.root.remove(this.bubble);
    const lines = wrap(text, 26).slice(0, 4);
    const tex = canvasTexture(512, 64 + lines.length * 48, (g, w, h) => {
      g.fillStyle = '#fffdf6'; g.strokeStyle = '#1a1420'; g.lineWidth = 6;
      g.beginPath(); g.roundRect(6, 6, w - 12, h - 30, 26); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(w / 2 - 16, h - 26); g.lineTo(w / 2, h - 4); g.lineTo(w / 2 + 16, h - 26); g.fill();
      g.fillStyle = '#1a1420'; g.font = '600 36px system-ui, sans-serif'; g.textAlign = 'center';
      lines.forEach((l, i) => g.fillText(l, w / 2, 56 + i * 48));
    });
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    const hh = (64 + lines.length * 48) / 512;
    this.bubble.scale.set(4.5, 4.5 * hh, 1);
    this.bubble.position.y = 3.9 + 2.2 * hh;
    this.bubble.renderOrder = 11;
    this.root.add(this.bubble);
    this.bubbleUntil = performance.now() + seconds * 1000;
  }

  setDetail(near) {
    if (this._near === near) return;
    this._near = near;
    this.root.traverse((o) => { if (o.userData.outline) o.visible = near; if (o.isMesh) o.castShadow = near; });
  }

  update(dt, speed = 0, mode = 'idle') {
    this.speed += (speed - this.speed) * Math.min(1, dt * 10);
    const s = this.speed;
    const moving = s > 0.5;
    const run = Math.min(1, s / 14);
    this.phase += dt * (moving ? 2.6 + s * 0.75 : 1.6);
    const swing = moving ? 0.45 + run * 0.4 : 0;
    const sin = Math.sin(this.phase);
    const lerp = (o, k, v) => { o[k] += (v - o[k]) * Math.min(1, dt * 12); };

    // legs: hip swing + knee bend on the back-swing
    this.legs.forEach(({ hip, knee }, i) => {
      const ph = i ? sin : -sin;
      lerp(hip.rotation, 'x', ph * swing);
      lerp(knee.rotation, 'x', moving ? Math.max(0, -Math.sin(this.phase + (i ? 0 : Math.PI) - 0.6)) * (0.6 + run * 0.7) : 0.02);
    });
    // arms
    let sh = [sin * swing * 0.8, -sin * swing * 0.8], elb = [-0.25 - run * 0.6, -0.25 - run * 0.6], z = [0.06, -0.06];
    if (mode === 'cheer') { sh[1] = -2.8 + Math.sin(this.phase * 2.2) * 0.3; elb[1] = -0.2; if (!moving) sh[0] = -0.2; }
    if (mode === 'yarn') { sh = [-0.5 + Math.sin(this.phase * 1.7) * 0.25, -0.7 + Math.sin(this.phase * 1.3 + 1) * 0.35]; elb = [-1.0, -1.2]; z = [0.15, -0.15]; }
    if (mode === 'hold') { sh = [-2.9, -2.9]; elb = [-0.1, -0.1]; z = [0.12, -0.12]; }
    if (mode === 'perform') { sh = [-0.3 + Math.sin(this.phase) * 0.2, -1.5 + Math.sin(this.phase * 1.5) * 0.4]; elb = [-0.5, -0.9]; z = [0.1, -0.25]; }
    if (this.kind === 'protester' && mode !== 'cheer') { sh[1] = -2.4; elb[1] = -0.3; }
    if (this.kind === 'elder') { sh[1] = Math.min(sh[1], -0.15) * 0.4 - 0.15; elb[1] = -0.5; }
    this.arms.forEach(({ sh: s0, el }, i) => { lerp(s0.rotation, 'x', sh[i]); lerp(el.rotation, 'x', elb[i]); s0.rotation.z = z[i]; });

    this.body.position.y = moving ? Math.abs(Math.sin(this.phase)) * (0.05 + run * 0.08) : Math.sin(this.phase) * 0.012;
    this.body.rotation.x = this.stoop + run * 0.12;
    this.head.rotation.y = moving ? 0 : Math.sin(this.phase * 0.35) * 0.15;
    if (this.bubble && performance.now() > this.bubbleUntil) { this.root.remove(this.bubble); this.bubble = null; }
  }

  dispose() { this.root.removeFromParent(); }
}

function wrap(text, n) {
  const words = String(text).split(/\s+/), out = [];
  let line = '';
  for (const w of words) { if ((line + ' ' + w).trim().length > n) { out.push(line); line = w; } else line = (line + ' ' + w).trim(); }
  if (line) out.push(line);
  return out;
}

// ---------- Instanced crowd (hundreds of marchers, realistic proportions) ----------
export class Crowd {
  constructor(scene, max = 900) {
    this.max = max;
    const legGeo = new THREE.CapsuleGeometry(0.22, 0.45, 4, 8); legGeo.scale(1.45, 1, 0.8); legGeo.translate(0, 0.45, 0);
    const bodyGeo = new THREE.CapsuleGeometry(0.38, 0.34, 4, 10); bodyGeo.scale(1.1, 1, 0.8); bodyGeo.translate(0, 1.25, 0);
    const headGeo = new THREE.SphereGeometry(0.46, 12, 10); headGeo.scale(0.92, 1.05, 0.98); headGeo.translate(0, 2.16, 0);
    const signGeo = new THREE.BoxGeometry(0.8, 0.5, 0.05); signGeo.translate(0, 3.05, 0);
    this.legs = new THREE.InstancedMesh(legGeo, toon(0xffffff), max);
    this.bodies = new THREE.InstancedMesh(bodyGeo, toon(0xffffff), max);
    this.heads = new THREE.InstancedMesh(headGeo, toon(0xffffff), max);
    this.signs = new THREE.InstancedMesh(signGeo, toon(0xfff6e0), max);
    const r = mulberry32(99);
    this.seeds = [];
    const shirts = [0x2f7bff, 0x3b8cff, 0x2566d6, 0x4a9bff, 0x1f5fc8, 0x000000, 0xd4202a, 0xffcd00];
    for (let i = 0; i < max; i++) {
      this.seeds.push({ jx: (r() - 0.5) * 1.2, jz: (r() - 0.5) * 1.2, ph: r() * 10, sign: r() < 0.25, k: 0.92 + r() * 0.14 });
      this.bodies.setColorAt(i, new THREE.Color(r() < 0.82 ? shirts[Math.floor(r() * 5)] : shirts[5 + Math.floor(r() * 3)]));
      this.heads.setColorAt(i, new THREE.Color(SKIN[Math.floor(r() * SKIN.length)]));
      this.legs.setColorAt(i, new THREE.Color(PANTS[Math.floor(r() * PANTS.length)]));
    }
    this.meshes = [this.legs, this.bodies, this.heads, this.signs];
    for (const m of this.meshes) { m.count = 0; m.castShadow = true; m.frustumCulled = false; scene.add(m); }
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.v = new THREE.Vector3(); this.s = new THREE.Vector3();
  }
  // placer(i) -> {x, z, yaw, moving}
  update(t, count, placer) {
    count = Math.min(this.max, Math.max(0, Math.floor(count)));
    let signs = 0;
    for (let i = 0; i < count; i++) {
      const p = placer(i);
      const sd = this.seeds[i];
      const bob = p.moving ? Math.abs(Math.sin(t * 6 + sd.ph)) * 0.12 : Math.max(0, Math.sin(t * 2.5 + sd.ph)) * 0.05;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), p.yaw || 0);
      this.m4.compose(this.v.set(p.x + sd.jx, bob, p.z + sd.jz), this.q, this.s.setScalar(sd.k));
      this.legs.setMatrixAt(i, this.m4);
      this.bodies.setMatrixAt(i, this.m4);
      this.heads.setMatrixAt(i, this.m4);
      if (sd.sign) this.signs.setMatrixAt(signs++, this.m4);
    }
    this.legs.count = this.bodies.count = this.heads.count = count;
    this.signs.count = signs;
    for (const m of this.meshes) m.instanceMatrix.needsUpdate = true;
  }
}
