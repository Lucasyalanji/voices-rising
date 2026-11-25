// Pigeons in the plazas and seagulls over the harbour. Drawn with instanced meshes (one draw call per
// body part), so hundreds of birds stay cheap on phones. Birds near the player scatter and land again.
import * as THREE from 'three';
import * as MAP from '/shared/mapdata.js';
import { toon } from './materials.js';
import { mulberry32 } from './world.js';

const rand = mulberry32(4242);
const r = (a, b) => a + rand() * (b - a);

// ---------- shared geometry ----------
function birdGeometry(len, wingSpan) {
  const body = new THREE.SphereGeometry(1, 10, 8); body.scale(len * 0.32, len * 0.3, len * 0.55); body.translate(0, len * 0.38, 0);
  const head = new THREE.SphereGeometry(len * 0.2, 10, 8); head.translate(0, len * 0.68, len * 0.42);
  const beak = new THREE.ConeGeometry(len * 0.06, len * 0.2, 6); beak.rotateX(Math.PI / 2); beak.translate(0, len * 0.66, len * 0.66);
  const tail = new THREE.BoxGeometry(len * 0.3, len * 0.05, len * 0.35); tail.translate(0, len * 0.4, -len * 0.62);
  // a wing hinged at the body centre line, pointing +x; the right wing is the mirror (scale x = -1)
  const wing = new THREE.BoxGeometry(wingSpan, len * 0.04, len * 0.42); wing.translate(wingSpan / 2, 0, 0);
  const legs = new THREE.CylinderGeometry(len * 0.025, len * 0.025, len * 0.22, 4); legs.translate(0, len * 0.11, 0);
  return { body, head, beak, tail, wing, legs };
}

class Flock {
  constructor(scene, count, look) {
    this.count = count;
    this.look = look;
    const g = birdGeometry(look.len, look.wing);
    const mk = (geo, color) => { const m = new THREE.InstancedMesh(geo, toon(color), count); m.castShadow = true; m.frustumCulled = false; scene.add(m); return m; };
    this.parts = {
      body: mk(g.body, look.body), head: mk(g.head, look.head), beak: mk(g.beak, look.beak), tail: mk(g.tail, look.tail),
      wingL: mk(g.wing, look.wingColor), wingR: mk(g.wing, look.wingColor), legs: mk(g.legs, look.legs),
    };
    this.birds = [];
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.q2 = new THREE.Quaternion();
    this.v = new THREE.Vector3(); this.s = new THREE.Vector3(1, 1, 1); this.e = new THREE.Euler();
    this.wm = new THREE.Matrix4(); this.base = new THREE.Matrix4();
  }

  write(i, b, t) {
    const { m4, q, v, s, e, wm, base } = this;
    q.setFromEuler(e.set(b.pitch || 0, b.yaw, b.roll || 0, 'YXZ'));
    base.compose(v.set(b.x, b.y, b.z), q, s.set(1, 1, 1));
    for (const k of ['body', 'head', 'beak', 'tail']) this.parts[k].setMatrixAt(i, base);
    // legs hide while flying
    m4.compose(v.set(b.x, b.y, b.z), q, s.set(1, b.flying ? 0.001 : 1, 1));
    this.parts.legs.setMatrixAt(i, m4);
    // head bob while pecking on the ground
    if (!b.flying && b.peck > 0) {
      m4.makeTranslation(0, -this.look.len * 0.18 * Math.max(0, Math.sin(b.peck * 14)), this.look.len * 0.06);
      this.parts.head.setMatrixAt(i, m4.premultiply(base));
      m4.makeTranslation(0, -this.look.len * 0.18 * Math.max(0, Math.sin(b.peck * 14)), this.look.len * 0.06);
      this.parts.beak.setMatrixAt(i, m4.premultiply(base));
    }
    // wings: folded on the ground, flapping or gliding in the air
    // wing = base · lift to shoulder · hinge rotation · mirror/fold (folded wings lie along the back)
    const angle = b.flying ? (b.glide ? Math.sin(t * 2 + b.seed) * 0.15 : Math.sin(t * b.flapRate + b.seed) * 0.9) : 1.35;
    const wingY = this.look.len * (b.flying ? 0.5 : 0.48);
    const fold = b.flying ? 1 : 0.55;
    const T = this.T || (this.T = new THREE.Matrix4()), R = this.R || (this.R = new THREE.Matrix4()), S = this.S || (this.S = new THREE.Matrix4());
    for (const [k, side] of [['wingL', 1], ['wingR', -1]]) {
      T.makeTranslation(0, wingY, 0);
      R.makeRotationZ(side * angle);
      S.makeScale(side * fold, 1, 1);
      wm.copy(base).multiply(T).multiply(R).multiply(S);
      this.parts[k].setMatrixAt(i, wm);
    }
  }

  flush() { for (const p of Object.values(this.parts)) { p.count = this.birds.length; p.instanceMatrix.needsUpdate = true; } }
}

// ---------- Pigeons ----------
const PIGEON = { len: 0.42, wing: 0.42, body: 0x8b93a3, head: 0x5d6b80, beak: 0x3a3a3a, tail: 0x5b6170, wingColor: 0x7b8394, legs: 0xd0756b };
const PIGEON_SPOTS = () => [
  { ...MAP.ELDERS, x: MAP.ELDERS.x + 10, z: MAP.ELDERS.z - 6, n: 7 },              // The Block lawn
  { ...MAP.RALLIES[5], n: 9 },                                                      // Central forecourt
  { x: MAP.STAGE.x + 18, z: MAP.STAGE.z + 8, n: 12 },                               // George St by Town Hall
  { ...MAP.LANDMARKS.archibald, x: MAP.LANDMARKS.archibald.x + 9, n: 12 },         // Archibald Fountain
  { ...MAP.LANDMARKS.gpo, z: MAP.LANDMARKS.gpo.z - 14, n: 9 },                     // Martin Place
  { ...MAP.LANDMARKS.quay, z: MAP.LANDMARKS.quay.z + 12, n: 12 },                  // Circular Quay
  { ...MAP.LANDMARKS.qvb, x: MAP.LANDMARKS.qvb.x + 12, n: 6 },                     // QVB
];

// ---------- Seagulls ----------
const GULL = { len: 0.9, wing: 1.5, body: 0xf4f4f0, head: 0xffffff, beak: 0xf2c230, tail: 0x2f2f33, wingColor: 0xb9c0c8, legs: 0xe8a640 };

export class Birds {
  constructor(scene) {
    this.pigeons = new Flock(scene, 80, PIGEON);
    this.gulls = new Flock(scene, 40, GULL);
    for (const spot of PIGEON_SPOTS()) for (let i = 0; i < spot.n; i++) {
      const a = r(0, Math.PI * 2), d = r(0, 6);
      this.pigeons.birds.push({ home: spot, x: spot.x + Math.cos(a) * d, y: 0, z: spot.z + Math.sin(a) * d, yaw: r(0, 6.28), seed: r(0, 100),
        flying: false, peck: 0, nextPeck: r(0, 4), walk: 0, tx: 0, tz: 0, vy: 0, flapRate: r(18, 24), land: 0 });
    }
    // circling gulls over the harbour
    const Q = MAP.LANDMARKS.quay, O = MAP.LANDMARKS.operaHouse, BR = MAP.LANDMARKS.bridgeA;
    const circles = [{ x: Q.x, z: Q.z - 60, n: 10 }, { x: O.x, z: O.z - 40, n: 8 }, { x: BR.x + 20, z: BR.z - 70, n: 8 }, { x: Q.x - 120, z: Q.z - 140, n: 6 }];
    for (const c of circles) for (let i = 0; i < c.n; i++) {
      this.gulls.birds.push({ circle: { x: c.x + r(-20, 20), z: c.z + r(-20, 20), r: r(18, 45), h: r(9, 26), speed: r(0.12, 0.25) * (rand() < 0.5 ? -1 : 1), a: r(0, 6.28) },
        x: c.x, y: 20, z: c.z, yaw: 0, seed: r(0, 100), flying: true, glide: true, flapRate: r(10, 13) });
    }
    // gulls standing on the wharves
    for (let i = 0; i < 8; i++) {
      const x = Q.x - 30 + Math.floor(i / 2) * 14 + r(-1.5, 1.5), z = Q.z - 4 - r(4, 22);
      this.gulls.birds.push({ home: { x, z }, perch: true, x, y: 0.4, z, yaw: r(0, 6.28), seed: r(0, 100), flying: false, peck: 0, nextPeck: r(2, 8), flapRate: r(10, 13), vy: 0, land: 0 });
    }
  }

  update(dt, t, me) {
    const px = me.x, pz = me.z;
    this.updateGround(this.pigeons, dt, t, px, pz, 5.5);
    this.updateGulls(dt, t, px, pz);
    this.pigeons.flush();
    this.gulls.flush();
  }

  // Ground birds peck, shuffle about, scatter from the player and land again near home.
  updateGround(flock, dt, t, px, pz, scare) {
    flock.birds.forEach((b, i) => {
      if (b.circle) return;
      const dp = Math.hypot(b.x - px, b.z - pz);
      if (!b.flying && dp < scare) {
        b.flying = true; b.glide = false; b.vy = r(5, 7); b.land = t + r(2.5, 4.5);
        const away = Math.atan2(b.x - px, b.z - pz) + r(-0.6, 0.6);
        b.vx = Math.sin(away) * r(5, 8); b.vz = Math.cos(away) * r(5, 8); b.yaw = away;
      }
      if (b.flying) {
        if (t > b.land) { // come back down near home
          const a = r(0, 6.28), d = r(1, 7);
          b.tx = b.home.x + Math.cos(a) * d; b.tz = b.home.z + Math.sin(a) * d;
          const dx = b.tx - b.x, dz = b.tz - b.z, L = Math.hypot(dx, dz) || 1;
          b.vx += ((dx / L) * 6 - b.vx) * Math.min(1, dt * 2); b.vz += ((dz / L) * 6 - b.vz) * Math.min(1, dt * 2);
          b.yaw = Math.atan2(b.vx, b.vz);
          b.vy = Math.max(-4, b.vy - dt * 6);
          if (b.y <= (b.perch ? 0.4 : 0) && L < 2.5) { b.flying = false; b.y = b.perch ? 0.4 : 0; b.vy = 0; b.nextPeck = t + r(0.5, 2); }
        } else b.vy = Math.max(1, b.vy - dt * 3);
        b.x += b.vx * dt; b.z += b.vz * dt; b.y = Math.max(b.perch ? 0.4 : 0, Math.min(14, b.y + b.vy * dt));
        b.pitch = -0.25;
      } else {
        b.pitch = 0;
        if (t > b.nextPeck) { b.peck = 0.7; b.nextPeck = t + r(1.5, 5); if (rand() < 0.35 && !b.perch) { b.walk = r(0.6, 1.4); b.yaw += r(-1.5, 1.5); } }
        if (b.peck > 0) b.peck -= dt;
        if (b.walk > 0) { b.walk -= dt; b.x += Math.sin(b.yaw) * dt * 0.9; b.z += Math.cos(b.yaw) * dt * 0.9; }
      }
      flock.write(i, b, t);
    });
  }

  updateGulls(dt, t, px, pz) {
    const gulls = this.gulls;
    // perched gulls behave like the pigeons (but scare from further away)
    gulls.birds.forEach((b, i) => {
      if (!b.circle) return;
      const c = b.circle;
      c.a += c.speed * dt;
      const nx = c.x + Math.cos(c.a) * c.r, nz = c.z + Math.sin(c.a) * c.r;
      b.yaw = Math.atan2(nx - b.x, nz - b.z);
      b.x = nx; b.z = nz; b.y = c.h + Math.sin(t * 0.5 + b.seed) * 2;
      b.roll = -Math.sign(c.speed) * 0.35;
      b.glide = Math.sin(t * 0.4 + b.seed) > -0.6; // mostly gliding, now and then a few flaps
      gulls.write(i, b, t);
    });
    this.updateGround(gulls, dt, t, px, pz, 8);
  }
}
