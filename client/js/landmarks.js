// Stylised Sydney landmarks + gameplay set pieces (The Block yarning circle, Town Hall Main Stage,
// Parliament flagpole, rally soapboxes, info markers).
import * as THREE from 'three';
import * as MAP from '/shared/mapdata.js';
import { toon, addOutline, INK, INK_THIN, canvasTexture, drawAboriginalFlag, drawAustralianFlag, waveFlag } from './materials.js';
import { makeLabel } from './world.js';

const SAND = 0xdcb57e, CREAM = 0xf1e3c6, STEEL = 0x8a929c, GRANITE = 0xb7a58c;

function box(w, h, d, mat, x = 0, y = 0, z = 0, outline = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = m.receiveShadow = true;
  if (outline) addOutline(m, INK_THIN);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  return m;
}
function place(group, p, yaw = 0) {
  group.position.set(p.x, 0, p.z);
  group.rotation.y = yaw;
  return group;
}

// ---------------- Individual landmarks ----------------
function operaHouse() {
  const g = new THREE.Group();
  g.add(box(40, 4, 56, toon(0xc79a7a)));
  const shellMat = toon(0xfbfaf4, { side: THREE.DoubleSide });
  const shell = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI, 0, Math.PI / 2);
  const rows = [[-8, [20, 16, 12]], [9, [16, 13, 10]]];
  for (const [x, sizes] of rows) {
    sizes.forEach((s, i) => {
      for (const flip of [1, -1]) {
        const m = new THREE.Mesh(shell, shellMat);
        m.scale.set(s * 0.42, s * 1.15, s * 0.9);
        m.position.set(x, 4, -14 + i * 13 + (flip < 0 ? 3 : 0));
        m.rotation.set(flip > 0 ? -0.15 : Math.PI + 0.15, flip > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
        if (flip < 0) { m.scale.multiplyScalar(0.55); m.rotation.set(0, -Math.PI / 2, 0); m.position.z += 6; }
        m.castShadow = true;
        addOutline(m, INK_THIN);
        g.add(m);
      }
    });
  }
  return g;
}

function harbourBridge() {
  const g = new THREE.Group();
  const A = MAP.LANDMARKS.bridgeA, B = MAP.LANDMARKS.bridgeB;
  const L = Math.hypot(B.x - A.x, B.z - A.z);
  const yaw = Math.atan2(B.x - A.x, B.z - A.z);
  g.position.set(A.x, 0, A.z);
  g.rotation.y = yaw;
  const steel = toon(STEEL);
  const deck = box(15, 1.6, L, toon(0x5f646c), 0, 16, L / 2);
  g.add(deck);
  const s0 = L * 0.16, s1 = L * 0.84, span = s1 - s0;
  for (const side of [-6.5, 6.5]) {
    const lower = [], upper = [];
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, k = 4 * t * (1 - t);
      lower.push(new THREE.Vector3(side, 2 + 42 * k, s0 + t * span));
      upper.push(new THREE.Vector3(side, 18 + 30 * Math.pow(k, 0.85), s0 + t * span));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(lower), 80, 1.1, 8), steel));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(upper), 80, 0.8, 8), steel));
    for (let i = 1; i < 40; i += 2) {
      const a = lower[i], b = upper[i];
      const len = Math.abs(b.y - a.y);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, len, 5), steel);
      m.position.set(side, (a.y + b.y) / 2, a.z);
      g.add(m);
      if (a.y > 18) {
        const h = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, a.y - 17, 4), steel);
        h.position.set(side, 17 + (a.y - 17) / 2, a.z);
        g.add(h);
      }
    }
  }
  for (const s of [s0, s1]) for (const side of [-9, 9]) g.add(box(7, 34, 9, toon(GRANITE), side, 0, s));
  for (let z = 8; z < L; z += 22) if (z < s0 - 6 || z > s1 + 6) g.add(cyl(1.2, 1.4, 16, toon(GRANITE), 0, 0, z, 8));
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

function townHall() {
  const g = new THREE.Group();
  const sand = toon(SAND);
  g.add(box(22, 12, 30, sand));
  g.add(box(16, 4, 24, toon(0xcaa26c), 0, 12, 0));
  g.add(box(6, 30, 6, sand, 8, 0, -12));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 7, 4), toon(0x6d7f86));
  roof.position.set(8, 33.5, -12); roof.rotation.y = Math.PI / 4; roof.castShadow = true;
  g.add(roof);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), toon(0xfffbe8));
  clock.position.set(11.05, 25, -12); clock.rotation.y = Math.PI / 2;
  g.add(clock);
  for (let i = -12; i <= 12; i += 3) g.add(cyl(0.45, 0.45, 9, toon(CREAM), 11.4, 0, i, 10));
  g.add(box(3, 1.2, 26, toon(0xc9b69a), 12.5, 0, 0, false));
  return g;
}

function parliamentHouse() {
  const g = new THREE.Group();
  g.add(box(20, 9, 46, toon(CREAM)));
  g.add(box(24, 0.6, 50, toon(0x8a4f3a), -1, 9, 0));
  g.add(box(4, 0.4, 46, toon(0xe7d6b6), -12, 4.2, 0, false));
  for (let z = -22; z <= 22; z += 2.75) {
    g.add(cyl(0.22, 0.22, 4.2, toon(0xffffff), -13.6, 0, z, 8));
    g.add(cyl(0.22, 0.22, 4.6, toon(0xffffff), -13.6, 4.6, z, 8));
  }
  // fence + gates
  for (let z = -24; z <= 24; z += 1.2) if (Math.abs(z) > 4) g.add(cyl(0.08, 0.08, 1.8, toon(0x22252c), -20, 0, z, 4));
  const sign = makeLabel('NSW PARLIAMENT', '#1a1420', 'rgba(240,228,200,0.95)', 0.5);
  sign.position.set(-14.5, 7, 0);
  g.add(sign);
  return g;
}

function stateLibrary() {
  const g = new THREE.Group();
  g.add(box(18, 11, 22, toon(SAND)));
  for (let z = -8; z <= 8; z += 3.2) g.add(cyl(0.6, 0.6, 9, toon(CREAM), -9.6, 0, z, 10));
  const pediment = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 3, 22, 3), toon(SAND));
  pediment.rotation.set(Math.PI / 2, 0, Math.PI / 2); pediment.position.set(-8.5, 12, 0);
  g.add(pediment);
  return g;
}

function sydneyTower() {
  const g = new THREE.Group();
  g.add(box(14, 18, 14, toon(0xb9c6cf)));
  g.add(cyl(1.8, 2.2, 92, toon(0xdfe4e8), 0, 18, 0, 20));
  const turret = cyl(7, 6, 9, toon(0xe7b84a), 0, 100, 0, 24);
  addOutline(turret, INK_THIN);
  g.add(turret);
  g.add(cyl(7.3, 7.3, 2.4, toon(0x2b3a4a), 0, 104, 0, 24));
  g.add(cyl(0.4, 0.6, 16, toon(0xdfe4e8), 0, 109, 0, 8));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const c = cyl(0.2, 0.2, 88, toon(0xcfd6db), Math.cos(a) * 2.6, 18, Math.sin(a) * 2.6, 4);
    g.add(c);
  }
  return g;
}

function centralStation() {
  const g = new THREE.Group();
  g.add(box(64, 10, 20, toon(SAND)));
  g.add(box(64, 1, 40, toon(0x8b8f96), 0, 8, 26, false));
  g.add(box(7, 32, 7, toon(SAND), -26, 0, -6));
  const top = new THREE.Mesh(new THREE.ConeGeometry(5, 5, 4), toon(0x6d7f86));
  top.position.set(-26, 34.5, -6); top.rotation.y = Math.PI / 4;
  g.add(top);
  const clock = new THREE.Mesh(new THREE.CircleGeometry(2, 24), toon(0xfffbe8));
  clock.position.set(-26, 27, -9.6); clock.rotation.y = Math.PI;
  g.add(clock);
  return g;
}

function qvb() {
  const g = new THREE.Group();
  g.add(box(10, 11, 40, toon(0xc98a5a)));
  for (const z of [-15, 0, 15]) {
    const d = new THREE.Mesh(new THREE.SphereGeometry(z === 0 ? 5 : 3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x5e8d7f));
    d.position.set(0, 11, z); d.castShadow = true; addOutline(d, INK_THIN);
    g.add(d);
  }
  return g;
}

function australianHall() {
  const g = new THREE.Group();
  g.add(box(12, 13, 10, toon(0xb9785a)));
  for (let y = 3; y < 13; y += 3.2) for (let x = -4; x <= 4; x += 2.6) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.9), toon(0x34495e));
    w.position.set(x, y, 5.05); g.add(w);
  }
  return g;
}

function circularQuay() {
  const g = new THREE.Group();
  const q = MAP.LANDMARKS.quay;
  for (let i = 0; i < 5; i++) g.add(box(6, 1.2, 26, toon(0xb7aa95), q.x - 30 + i * 14, -0.8, q.z - 14, false));
  return g;
}

const FERRY_ROUTE = [[140, -490], [135, -640], [180, -760], [330, -800], [250, -900], [60, -880], [0, -780], [120, -700], [140, -490]];
function ferry() {
  const g = new THREE.Group();
  g.add(box(4.5, 1.6, 14, toon(0x2e7d32)));
  g.add(box(4, 2.2, 10, toon(0xfff3d6), 0, 1.6, 0));
  g.add(box(4.4, 0.4, 11, toon(0x2e7d32), 0, 3.8, 0));
  g.add(cyl(0.5, 0.6, 2.5, toon(0xf2c94c), 0, 4.2, 1.5, 10));
  return g;
}

// ---------------- CBD landmarks (from the CBD street map) ----------------
function spire(r, h, mat) { const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), mat); m.rotation.y = Math.PI / 4; m.castShadow = true; return m; }
function gpo() {
  const g = new THREE.Group(); const sand = toon(SAND);
  g.add(box(20, 13, 14, sand));
  for (let x = -8; x <= 8; x += 2.6) g.add(cyl(0.4, 0.4, 5, toon(CREAM), x, 0, -7.4, 8));
  g.add(box(5, 28, 5, sand, 0, 0, -4));
  const c = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), toon(0xfffbe8)); c.position.set(0, 24, -6.6); c.rotation.y = Math.PI; g.add(c);
  const s2 = spire(3.6, 4, toon(0x6d7f86)); s2.position.set(0, 30, -4); g.add(s2);
  return g;
}
function cathedral(w, d, towerH, color, twin) {
  const g = new THREE.Group(); const mat = toon(color);
  g.add(box(w, 12, d, mat));
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, w * 0.62, d, 3), toon(0x5d6670));
  roof.rotation.x = Math.PI / 2; roof.rotation.y = 0; roof.rotation.z = Math.PI; roof.position.set(0, 14.6, 0); roof.scale.set(1, 1, 0.55);
  roof.castShadow = true; g.add(roof);
  const xs = twin ? [-w / 2 + 2, w / 2 - 2] : [0];
  for (const x of xs) { g.add(box(4, towerH, 4, mat, x, 0, d / 2 - 2)); const sp = spire(2.9, towerH * 0.35, toon(0x5d6670)); sp.position.set(x, towerH + towerH * 0.175, d / 2 - 2); g.add(sp); }
  const rose = new THREE.Mesh(new THREE.CircleGeometry(2, 20), toon(0x3a5f8a)); rose.position.set(0, 9, d / 2 + 0.05); g.add(rose);
  return g;
}
function museum() {
  const g = new THREE.Group();
  g.add(box(16, 12, 26, toon(SAND)));
  for (let z = -10; z <= 10; z += 2.5) g.add(cyl(0.5, 0.5, 10, toon(CREAM), -8.6, 0, z, 10));
  g.add(box(2, 1.4, 26, toon(SAND), -8.6, 10, 0, false));
  return g;
}
function anzacMemorial() {
  const g = new THREE.Group(); const granite = toon(0xc9b28e);
  g.add(box(18, 2, 18, toon(0xb39b78)));
  g.add(box(12, 16, 12, granite, 0, 2, 0));
  for (const r of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) { const b = box(4, 6, 1.2, granite, 0, 12, 6.4); b.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), r); b.rotation.y = r; g.add(b); }
  g.add(box(9, 2, 9, granite, 0, 18, 0));
  return g;
}
function poolOfReflection() {
  const g = new THREE.Group();
  g.add(box(8, 0.5, 34, toon(0xc9b28e), 0, 0, 0, false));
  const w = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 32.6), new THREE.MeshBasicMaterial({ color: 0x4aa6d6 }));
  w.rotation.x = -Math.PI / 2; w.position.y = 0.52; g.add(w);
  return g;
}
function fountain() {
  const g = new THREE.Group();
  g.add(cyl(6, 6.4, 1, toon(0xd8d2c4), 0, 0, 0, 28));
  const w = new THREE.Mesh(new THREE.CircleGeometry(5.4, 28), new THREE.MeshBasicMaterial({ color: 0x5ab4e0 })); w.rotation.x = -Math.PI / 2; w.position.y = 1.02; g.add(w);
  g.add(cyl(1, 1.4, 3, toon(0x6e8a6a), 0, 1, 0, 12));
  const fig = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 2, 4, 8), toon(0x5e7d5b)); fig.position.set(0, 5.4, 0); fig.castShadow = true; g.add(fig);
  const jets = [];
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const j = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.25, 3, 6), new THREE.MeshBasicMaterial({ color: 0xcfeeff, transparent: true, opacity: 0.7 })); j.position.set(Math.cos(a) * 3, 2.5, Math.sin(a) * 3); j.rotation.z = Math.cos(a) * 0.5; j.rotation.x = -Math.sin(a) * 0.5; g.add(j); jets.push(j); }
  g.userData.jets = jets;
  return g;
}
function colonial(w, d, color) {
  const g = new THREE.Group();
  g.add(box(w, 9, d, toon(color)));
  g.add(box(w + 3, 0.5, d + 1, toon(0x6b4a3a), -1, 9, 0, false));
  g.add(box(3, 0.35, d, toon(0xe7d6b6), -w / 2 - 1.5, 4.3, 0, false));
  for (let z = -d / 2 + 1; z <= d / 2 - 1; z += 2.6) { g.add(cyl(0.2, 0.2, 4.3, toon(0xffffff), -w / 2 - 2.6, 0, z, 6)); g.add(cyl(0.2, 0.2, 4.7, toon(0xffffff), -w / 2 - 2.6, 4.4, z, 6)); }
  return g;
}
function conventionCentre() {
  const g = new THREE.Group();
  g.add(box(30, 14, 22, toon(0x9fc0d3)));
  g.add(box(32, 1, 24, toon(0xdfe6ea), 0, 14, 0));
  return g;
}

// ---------------- The Block: mural + yarning circle ----------------
function theBlock(scene, colliders) {
  const mural = new THREE.Group();
  const tex = canvasTexture(1024, 300, (g, w, h) => {
    g.fillStyle = '#2a1f1a'; g.fillRect(0, 0, w, h);
    drawAboriginalFlagAt(g, 30, 30, 360, 240);
    g.fillStyle = '#ffcd00'; g.font = 'bold 64px system-ui, sans-serif'; g.textAlign = 'left';
    g.fillText('ALWAYS WAS,', 430, 120);
    g.fillText('ALWAYS WILL BE', 430, 200);
    g.fillStyle = '#e8d9c0'; g.font = '32px system-ui'; g.fillText('Gadigal Country · Eora Nation', 432, 255);
  });
  const wall = box(26, 8, 1.2, toon(0x6b4a3a));
  mural.add(wall);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(25, 7.3), toon(0xffffff, { map: tex }));
  face.position.set(0, 4, 0.62);
  mural.add(face);
  place(mural, MAP.LANDMARKS.mural);
  colliders.addBox(mural.position.x - 13, mural.position.z - 0.8, mural.position.x + 13, mural.position.z + 0.8);
  scene.add(mural);

  // Yarning circle
  const circle = new THREE.Group();
  place(circle, MAP.ELDERS);
  const logMat = toon(0x7a5230);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 2.6, 10), logMat);
    log.rotation.set(0, -a, Math.PI / 2);
    log.position.set(Math.cos(a) * 5.5, 0.45, Math.sin(a) * 5.5);
    log.rotation.order = 'YXZ';
    log.rotation.set(0, -a + Math.PI / 2, Math.PI / 2);
    log.castShadow = true; addOutline(log, INK_THIN);
    circle.add(log);
  }
  const stones = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.35, 6, 12), toon(0x8a8178));
  stones.rotation.x = Math.PI / 2; stones.position.y = 0.25;
  circle.add(stones);
  const flames = [];
  const fMat = [0xff6a1a, 0xffa31a, 0xffe066].map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.92 }));
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.9 - i * 0.25, 2.4 - i * 0.5, 8), fMat[i]);
    f.position.y = 1.1 - i * 0.1;
    circle.add(f); flames.push(f);
  }
  const light = new THREE.PointLight(0xff8a3a, 60, 30, 1.6);
  light.position.y = 2;
  circle.add(light);
  const embersGeo = new THREE.BufferGeometry();
  const N = 40, pos = new Float32Array(N * 3), seeds = [];
  for (let i = 0; i < N; i++) seeds.push(Math.random());
  embersGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const embers = new THREE.Points(embersGeo, new THREE.PointsMaterial({ color: 0xffb347, size: 0.25 }));
  circle.add(embers);
  scene.add(circle);
  return {
    update(t) {
      flames.forEach((f, i) => { f.scale.set(1 + Math.sin(t * 9 + i) * 0.08, 1 + Math.sin(t * 11 + i * 2) * 0.18, 1); f.rotation.y = t * (1 + i); });
      light.intensity = 55 + Math.sin(t * 13) * 8 + Math.sin(t * 7) * 6;
      for (let i = 0; i < N; i++) {
        const k = (t * 0.35 + seeds[i]) % 1;
        pos[i * 3] = Math.sin(seeds[i] * 50 + t) * 0.8 * k;
        pos[i * 3 + 1] = 1 + k * 7;
        pos[i * 3 + 2] = Math.cos(seeds[i] * 70 + t) * 0.8 * k;
      }
      embersGeo.attributes.position.needsUpdate = true;
    },
  };
}
function drawAboriginalFlagAt(g, x, y, w, h) {
  g.save(); g.translate(x, y); drawAboriginalFlag(g, w, h); g.restore();
}

// ---------------- Town Hall Main Stage ----------------
function mainStage(scene, colliders) {
  const S = MAP.STAGE;
  const g = new THREE.Group();
  place(g, S, S.yaw); // local +z points toward the audience (east)
  const W = 18, D = 11, H = 1.6;
  g.add(box(W, H, D, toon(0x30333d)));
  g.add(box(W + 0.4, 0.25, D + 0.4, toon(0x1d1f26), 0, H - 0.1, 0, false));
  // steps at the front-left
  for (let i = 0; i < 3; i++) g.add(box(3, (i + 1) * 0.5, 1, toon(0x3a3d48), -W / 2 + 2, 0, D / 2 + 2.5 - i, false));
  // truss
  const truss = toon(0xb9bec6);
  for (const x of [-W / 2, W / 2]) for (const z of [-D / 2, D / 2]) g.add(cyl(0.25, 0.25, 11, truss, x, H, z, 6));
  g.add(box(W + 0.6, 0.5, 0.5, truss, 0, H + 11, D / 2, false));
  g.add(box(W + 0.6, 0.5, 0.5, truss, 0, H + 11, -D / 2, false));
  g.add(box(0.5, 0.5, D, truss, -W / 2, H + 11, 0, false));
  g.add(box(0.5, 0.5, D, truss, W / 2, H + 11, 0, false));
  // speaker stacks
  for (const x of [-W / 2 - 2, W / 2 + 2]) {
    g.add(box(2.6, 3, 2.6, toon(0x15161b), x, 0, D / 2 - 1.5));
    g.add(box(2.6, 2.4, 2.6, toon(0x15161b), x, 3, D / 2 - 1.5));
    for (const y of [1.5, 4.2]) { const c = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), toon(0x444955)); c.position.set(x, y, D / 2 - 0.18); g.add(c); }
  }
  // big screen
  const canvas = document.createElement('canvas');
  canvas.width = 1024; canvas.height = 512;
  const screenTex = new THREE.CanvasTexture(canvas);
  screenTex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshBasicMaterial({ map: screenTex, toneMapped: false }));
  screen.position.set(0, H + 6.5, -D / 2 + 0.4);
  g.add(box(16.8, 8.8, 0.6, toon(0x111216), 0, H + 2.1, -D / 2 + 0.05, false));
  g.add(screen);
  // mic stand
  g.add(cyl(0.05, 0.05, 1.6, toon(0x222222), 0, H, 1.5, 6));
  const mic = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), toon(0x333333)); mic.position.set(0, H + 1.7, 1.5); g.add(mic);
  // spotlights
  const beams = [];
  const beamColors = [0x3d8bff, 0xffcd00, 0xd4202a, 0x3d8bff];
  beamColors.forEach((c, i) => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 11, 16, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
    cone.position.set(-W / 2 + 2.5 + i * ((W - 5) / 3), H + 5.5, 1.5);
    g.add(cone); beams.push(cone);
  });
  // banner
  const banner = makeLabel('VOICES RISING — MAIN STAGE', '#ffffff', 'rgba(47,123,255,0.92)', 0.75);
  banner.position.set(0, H + 12.6, D / 2);
  g.add(banner);
  scene.add(g);
  // collider: only the speaker stacks/screen back (the deck is walkable)
  const back = new THREE.Vector3(0, 0, -D / 2).applyAxisAngle(new THREE.Vector3(0, 1, 0), S.yaw).add(new THREE.Vector3(S.x, 0, S.z));
  colliders.addRotatedBox(back.x, back.z, W, 1.4, S.yaw);

  function drawScreen(state) {
    const c = canvas.getContext('2d');
    const grad = c.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#0f1a33'); grad.addColorStop(1, '#1b2f5c');
    c.fillStyle = grad; c.fillRect(0, 0, 1024, 512);
    c.fillStyle = '#000'; c.fillRect(0, 0, 1024, 14); c.fillStyle = '#d4202a'; c.fillRect(0, 498, 1024, 14);
    c.textAlign = 'center'; c.fillStyle = '#ffcd00';
    if (!state?.performer) {
      c.font = 'bold 64px system-ui'; c.fillText('THE MIC IS OPEN', 512, 190);
      c.fillStyle = '#e6edf8'; c.font = '36px system-ui';
      c.fillText('Share a speech, a poem or your music.', 512, 260);
      c.fillText('Walk up to the stage and press E.', 512, 310);
      if (state?.queue?.length) c.fillText(`Up next: ${state.queue.slice(0, 3).join(', ')}`, 512, 400);
    } else {
      const p = state.performer;
      c.font = 'bold 34px system-ui';
      c.fillText(`${p.kind.toUpperCase()}${p.live ? '  ·  🔴 LIVE' : ''}`, 512, 70);
      c.fillStyle = '#ffffff'; c.font = 'bold 54px system-ui';
      c.fillText(`“${(p.title || 'Untitled').slice(0, 30)}”`, 512, 140);
      c.fillStyle = '#9fc4ff'; c.font = '34px system-ui'; c.fillText(p.name, 512, 190);
      c.fillStyle = '#ffffff'; c.font = '600 40px Georgia, serif';
      const lines = wrapText(c, state.line || (p.live ? '🎙 Listen in…' : ''), 920).slice(0, 5);
      lines.forEach((l, i) => c.fillText(l, 512, 270 + i * 52));
    }
    screenTex.needsUpdate = true;
  }
  drawScreen(null);
  return {
    drawScreen,
    deckHeight: H,
    contains(x, z) {
      const dx = x - S.x, dz = z - S.z;
      const c = Math.cos(-S.yaw), s = Math.sin(-S.yaw);
      const lx = dx * c + dz * s, lz = -dx * s + dz * c;
      return Math.abs(lx) < W / 2 && Math.abs(lz) < D / 2;
    },
    update(t, active) {
      beams.forEach((b, i) => { b.rotation.z = Math.sin(t * 1.3 + i * 1.7) * 0.35; b.rotation.x = Math.cos(t * 1.1 + i) * 0.25; b.material.opacity = active ? 0.2 : 0.07; });
    },
  };
}
function wrapText(c, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(' ')) {
      const test = line ? line + ' ' + w : w;
      if (c.measureText(test).width > maxW && line) { out.push(line); line = w; } else line = test;
    }
    out.push(line);
  }
  return out;
}

// ---------------- Parliament flagpole ----------------
function flagpole(scene) {
  const g = new THREE.Group();
  place(g, MAP.FLAGPOLE);
  g.add(cyl(1.6, 2, 1, toon(GRANITE), 0, 0, 0, 12));
  g.add(cyl(0.18, 0.26, 22, toon(0xf2f2f2), 0, 1, 0, 10));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.4, 12, 8), toon(0xe7b84a)); ball.position.y = 23.2; g.add(ball);
  const au = waveFlag(canvasTexture(400, 200, drawAustralianFlag), 6, 3);
  const abo = waveFlag(canvasTexture(400, 200, drawAboriginalFlag), 6, 3);
  au.position.set(0.2, 21, 0); abo.position.set(0.2, 2.6, 0);
  abo.visible = false;
  g.add(au, abo);
  scene.add(g);
  return {
    au, abo,
    set(progress, raised) {
      if (raised) { au.visible = false; abo.visible = true; abo.position.y = 21; return; }
      const p = Math.max(0, Math.min(1, progress));
      au.visible = p < 0.5;
      au.position.y = 21 - (p / 0.5) * 18.4;
      abo.visible = p >= 0.5;
      abo.position.y = 2.6 + Math.max(0, (p - 0.5) / 0.5) * 18.4;
    },
    update(t) { au.userData.uniforms.uTime.value = t; abo.userData.uniforms.uTime.value = t + 1; },
  };
}

// ---------------- Rally soapboxes ----------------
function rallyStations(scene) {
  const out = [];
  for (const r of MAP.RALLIES) {
    const g = new THREE.Group();
    place(g, r);
    g.add(box(2.4, 1, 2.4, toon(0x9a6b42)));
    g.add(cyl(0.08, 0.08, 6, toon(0xdddddd), 1.6, 0, -1.2, 6));
    const flag = waveFlag(canvasTexture(200, 100, (c, w, h) => { c.fillStyle = '#2f7bff'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 30px system-ui'; c.textAlign = 'center'; c.fillText('VOICES', w / 2, 44); c.fillText('RISING', w / 2, 80); }), 3, 1.6);
    flag.position.set(1.6, 5.1, -1.2);
    g.add(flag);
    const ringMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uP: { value: 0 }, uColor: { value: new THREE.Color(0x3d8bff) }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uP; uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){ vec2 c = vUv - 0.5; float r = length(c) * 2.0; float a = atan(c.y, c.x) / 6.28318 + 0.5;
        float band = smoothstep(0.80, 0.84, r) * (1.0 - smoothstep(0.96, 1.0, r));
        float fill = step(a, uP); float base = 0.18 + 0.08 * sin(uTime * 3.0);
        gl_FragColor = vec4(uColor, band * mix(base, 0.95, fill)); }`,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15;
    g.add(ring);
    const smoke = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + Math.random(), 1), new THREE.MeshBasicMaterial({ color: 0x7a1f3d, transparent: true, opacity: 0.45 }));
      s.userData.seed = Math.random() * 10;
      smoke.add(s);
    }
    smoke.visible = false;
    g.add(smoke);
    const label = makeLabel(r.name, '#ffffff', 'rgba(20,40,90,0.75)', 0.5);
    label.position.set(0, 7.5, 0);
    g.add(label);
    scene.add(g);
    out.push({ rally: r, group: g, ring, ringMat, smoke, flag, label });
  }
  return {
    items: out,
    update(t, states, locked) {
      for (const it of out) {
        const st = states?.[it.rally.id];
        const isLocked = locked(it.rally.zone);
        it.group.visible = true;
        it.flag.userData.uniforms.uTime.value = t + it.rally.id;
        it.ringMat.uniforms.uTime.value = t;
        if (isLocked) { it.ringMat.uniforms.uColor.value.set(0x666666); it.ringMat.uniforms.uP.value = 0; it.smoke.visible = false; continue; }
        const disrupted = st?.[2];
        it.smoke.visible = !!disrupted;
        it.ringMat.uniforms.uColor.value.set(disrupted ? 0xff3344 : st?.[3] > 0 ? 0x9aa7bf : 0x3d8bff);
        it.ringMat.uniforms.uP.value = disrupted ? (st?.[4] || 0) / 100 : (st?.[1] || 0) / 100;
        if (disrupted) it.smoke.children.forEach((s, i) => { const k = (t * 0.4 + s.userData.seed) % 1; s.position.set(Math.sin(s.userData.seed * 9 + t) * 4, 1 + k * 6, Math.cos(s.userData.seed * 7 + t) * 4); s.material.opacity = 0.5 * (1 - k); });
      }
    },
  };
}

// ---------------- Floating quest markers ----------------
function marker(color) {
  const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0), new THREE.MeshBasicMaterial({ color }));
  m.scale.set(1, 1.5, 1);
  addOutline(m, INK);
  return m;
}

// ---------------- Build all ----------------
export function buildLandmarks(scene, colliders) {
  const L = MAP.LANDMARKS;
  const add = (obj, p, yaw, w, d) => { place(obj, p, yaw); scene.add(obj); if (w) colliders.addRotatedBox(p.x, p.z, w, d, yaw); return obj; };

  add(operaHouse(), L.operaHouse, 0, 40, 56);
  scene.add(harbourBridge());
  add(townHall(), L.townHall, 0, 22, 30);
  colliders.addBox(L.townHall.x + 5, L.townHall.z - 15, L.townHall.x + 11, L.townHall.z - 9);
  add(parliamentHouse(), L.parliament, 0, 20, 46);
  add(stateLibrary(), L.stateLibrary, 0, 18, 22);
  add(sydneyTower(), L.sydneyTower, 0, 14, 14);
  add(centralStation(), L.central, 0, 64, 20);
  add(qvb(), L.qvb, 0, 10, 40);
  add(australianHall(), L.australianHall, Math.PI / 2, 12, 10);
  scene.add(circularQuay());
  add(gpo(), L.gpo, 0, 20, 14);
  add(cathedral(12, 22, 16, 0xd8b98a, true), L.stAndrews, Math.PI / 2, 12, 22);
  add(cathedral(16, 34, 26, 0xcfae7c, true), L.stMarys, 0, 16, 34);
  add(museum(), L.ausMuseum, 0, 16, 26);
  add(anzacMemorial(), L.anzac, 0, 18, 18);
  scene.add(place(poolOfReflection(), L.pool));
  const fountainObj = add(fountain(), L.archibald, 0, 12, 12);
  add(colonial(14, 24, CREAM), L.hospital, 0, 14, 24);
  add(colonial(12, 14, 0xe9d4b0), L.mint, 0, 12, 14);
  add(conventionCentre(), L.convention, 0, 30, 22);

  const ferries = [0, 0.33, 0.66].map((o) => { const f = ferry(); scene.add(f); return { f, o }; });
  const routeLen = MAP.polyLength(FERRY_ROUTE);

  const block = theBlock(scene, colliders);
  const stage = mainStage(scene, colliders);
  const flag = flagpole(scene);
  const rallies = rallyStations(scene);

  const markers = [];
  for (const ip of MAP.INFO_POINTS) {
    const m = marker(0xffcd00);
    m.position.set(ip.x, 6, ip.z);
    scene.add(m);
    markers.push(m);
  }
  const stageMarker = marker(0x3d8bff);
  stageMarker.position.set(MAP.STAGE.x + 8, 9, MAP.STAGE.z);
  scene.add(stageMarker);
  markers.push(stageMarker);

  return {
    stage, flag, rallies, block,
    groundHeight(x, z) { return stage.contains(x, z) ? stage.deckHeight : 0; },
    update(t, ctx) {
      block.update(t);
      fountainObj.userData.jets.forEach((j, i) => { j.scale.y = 0.85 + Math.sin(t * 6 + i) * 0.15; });
      flag.update(t);
      stage.update(t, ctx.stageActive);
      rallies.update(t, ctx.rallyStates, ctx.locked);
      for (const m of markers) { m.rotation.y = t * 1.5; m.position.y += Math.sin(t * 2 + m.position.x) * 0.005; }
      for (const { f, o } of ferries) {
        const d = ((t * 6) / routeLen + o) % 1 * routeLen;
        const p = MAP.pointAlong(FERRY_ROUTE, d);
        f.position.set(p.x, -0.6 + Math.sin(t * 2 + o * 10) * 0.15, p.z);
        f.rotation.y = Math.atan2(p.dx, p.dz);
      }
    },
  };
}
