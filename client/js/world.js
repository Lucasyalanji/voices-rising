// Builds the geo-mapped Sydney world: sky, harbour, streets, parks, trees and a procedural skyline.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as MAP from '/shared/mapdata.js';
import { toon, INK, canvasTexture } from './materials.js';

export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NORTH_Z = Math.min(...MAP.WATER.map((p) => p[1])) + 2; // world z of the north shore line

// ---------- Collision (spatial hash of AABBs + blocked circles) ----------
export class Colliders {
  constructor(cell = 16) { this.cell = cell; this.map = new Map(); this.circles = []; }
  key(i, j) { return i * 73856093 ^ j * 19349663; }
  addBox(minX, minZ, maxX, maxZ, h = 999) {
    const b = { minX, minZ, maxX, maxZ, h };
    for (let i = Math.floor(minX / this.cell); i <= Math.floor(maxX / this.cell); i++)
      for (let j = Math.floor(minZ / this.cell); j <= Math.floor(maxZ / this.cell); j++) {
        const k = this.key(i, j);
        if (!this.map.has(k)) this.map.set(k, []);
        this.map.get(k).push(b);
      }
  }
  addRotatedBox(cx, cz, w, d, yaw) {
    const c = Math.abs(Math.cos(yaw)), s = Math.abs(Math.sin(yaw));
    const hw = (w * c + d * s) / 2, hd = (w * s + d * c) / 2;
    this.addBox(cx - hw, cz - hd, cx + hw, cz + hd);
  }
  hit(x, z, r = 0.6, y = 0) {
    const list = this.map.get(this.key(Math.floor(x / this.cell), Math.floor(z / this.cell)));
    if (list) for (const b of list) if (y < b.h && x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) return true;
    return false;
  }
}

// ---------- Geometry helpers ----------
function ribbon(pts, width, y) {
  const geos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const g = new THREE.PlaneGeometry(width, len);
    g.rotateX(-Math.PI / 2);
    g.rotateY(Math.atan2(bx - ax, bz - az));
    g.translate((ax + bx) / 2, y, (az + bz) / 2);
    geos.push(g);
  }
  for (const [x, z] of pts) {
    const c = new THREE.CircleGeometry(width / 2, 16);
    c.rotateX(-Math.PI / 2);
    c.translate(x, y, z);
    geos.push(c);
  }
  return geos;
}
function dashes(pts, y, len = 3, gap = 4, w = 0.35) {
  const geos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    for (let d = gap; d < L - len; d += len + gap) {
      const g = new THREE.PlaneGeometry(w, len);
      g.rotateX(-Math.PI / 2);
      g.rotateY(Math.atan2(dx, dz));
      g.translate(ax + dx * (d + len / 2), y, az + dz * (d + len / 2));
      geos.push(g);
    }
  }
  return geos;
}
function shapeFrom(poly) {
  const s = new THREE.Shape();
  poly.forEach(([x, z], i) => (i ? s.lineTo(x, -z) : s.moveTo(x, -z)));
  s.closePath();
  return s;
}
function flatShape(shape, y) {
  const g = new THREE.ShapeGeometry(shape, 4);
  g.rotateX(-Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// ---------- Sky ----------
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f7fd8) }, horizon: { value: new THREE.Color(0xcdeaff) }, sunDir: { value: new THREE.Vector3(0.5, 0.6, 0.3).normalize() } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vDir;
      void main(){ float h = max(vDir.y, 0.0); vec3 c = mix(horizon, top, pow(h, 0.6));
      float s = max(dot(normalize(vDir), sunDir), 0.0); c += vec3(1.0,0.9,0.7) * (pow(s, 600.0) * 2.0 + pow(s, 12.0) * 0.25);
      if (vDir.y < 0.0) c = horizon * 0.95; gl_FragColor = vec4(c, 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(4000, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

function makeClouds(rng) {
  const group = new THREE.Group();
  const mat = toon(0xffffff, { emissive: 0x8899aa, emissiveIntensity: 0.35 });
  const sphere = new THREE.IcosahedronGeometry(1, 2);
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Group();
    const n = 4 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(sphere, mat);
      const s = 14 + rng() * 16;
      m.scale.set(s * 1.4, s * 0.8, s);
      m.position.set((k - n / 2) * 16 + rng() * 8, rng() * 8, rng() * 14);
      c.add(m);
    }
    c.position.set(MAP.BOUNDS.minX - 300 + rng() * 1700, 180 + rng() * 80, MAP.BOUNDS.minZ - 200 + rng() * 2400);
    group.add(c);
  }
  return group;
}

// ---------- Water ----------
function makeWater() {
  const uniforms = { uTime: { value: 0 } };
  const mat = new THREE.MeshToonMaterial({ color: 0x1b8fc4, gradientMap: undefined });
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uniforms.uTime;
    s.vertexShader = 'varying vec3 vW;\n' + s.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vW = (modelMatrix * vec4(transformed,1.0)).xyz;');
    s.fragmentShader = 'uniform float uTime; varying vec3 vW;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float w1 = sin(vW.x * 0.09 + uTime * 0.9 + sin(vW.z * 0.05) * 2.0);
      float w2 = sin(vW.z * 0.11 - uTime * 0.7 + sin(vW.x * 0.04) * 2.0);
      float crest = smoothstep(0.82, 0.9, w1 * w2);
      diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.42, 0.62), 0.5 + 0.5 * w2 * 0.3);
      diffuseColor.rgb += crest * vec3(0.55, 0.75, 0.85);`);
  };
  const size = 6000;
  const g = new THREE.PlaneGeometry(size, size, 1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.y = -1.4;
  m.receiveShadow = true;
  m.userData.uniforms = uniforms;
  return m;
}

// ---------- Buildings ----------
function buildingMaterial() {
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, gradientMap: undefined });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = 'varying vec3 vWP; varying vec3 vWN;\n' + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vec4 wp4 = vec4(transformed, 1.0);
      vec3 wn = objectNormal;
      #ifdef USE_INSTANCING
        wp4 = instanceMatrix * wp4; wn = mat3(instanceMatrix) * wn;
      #endif
      vWP = (modelMatrix * wp4).xyz; vWN = normalize(mat3(modelMatrix) * wn);`);
    s.fragmentShader = 'varying vec3 vWP; varying vec3 vWN;\n' + s.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      if (abs(vWN.y) < 0.5) {
        vec2 uv = vec2((abs(vWN.x) > 0.5 ? vWP.z : vWP.x) / 2.4, vWP.y / 2.8);
        vec2 f = fract(uv);
        float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.78) * step(2.8, vWP.y);
        float r = fract(sin(dot(floor(uv), vec2(12.9898, 78.233))) * 43758.5453);
        vec3 glass = mix(vec3(0.20, 0.30, 0.42), vec3(0.62, 0.80, 0.95), step(0.72, r));
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, win * 0.85);
        float shop = step(vWP.y, 2.6) * step(0.4, fract(uv.x * 0.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.25, 0.22, 0.2), shop * 0.35);
      } else { diffuseColor.rgb *= 0.82; }`);
  };
  return mat;
}

const PALETTE_LOW = [0xe8c9a0, 0xd9a38a, 0xc97f6b, 0xf0e2c8, 0xb9c7c9, 0xe3b98f, 0xcf9f7f, 0xf3d9b1];
const PALETTE_TALL = [0xdfe6ea, 0xb8cdd8, 0xc6d4dc, 0xeee6d8, 0x9fb7c6, 0xd9cbb0, 0xa9c4d4];

function makeBuildings(colliders, exclusions, rng) {
  const B = MAP.BOUNDS;
  const tower = MAP.LANDMARKS.sydneyTower;
  const items = [];
  const step = 14;
  const roadSegs = MAP.ROADS.map((r) => r.wp);
  for (let x = B.minX + 10; x < B.maxX - 10; x += step) {
    for (let z = B.minZ + 10; z < B.maxZ - 10; z += step) {
      const cx = x + (rng() - 0.5) * 3, cz = z + (rng() - 0.5) * 3;
      const w = 7 + rng() * 5, d = 7 + rng() * 5;
      const rad = Math.max(w, d) / 2;
      if (MAP.inWater(cx, cz) || MAP.distToPolyline(cx, cz, MAP.WATER.concat([MAP.WATER[0]])) < rad + 4) continue;
      let ok = true;
      for (let i = 0; i < roadSegs.length && ok; i++) if (MAP.distToPolyline(cx, cz, roadSegs[i]) < MAP.ROADS[i].w / 2 + 4 + rad) ok = false;
      if (!ok) continue;
      if (MAP.distToPolyline(cx, cz, MAP.RAIL.wp) < MAP.RAIL.w / 2 + rad + 2) continue;
      if (MAP.PARKS.some((p) => MAP.pointInPoly(cx, cz, p.wp) || MAP.distToPolyline(cx, cz, p.wp.concat([p.wp[0]])) < rad + 2)) continue;
      if (exclusions.some((e) => Math.hypot(cx - e.x, cz - e.z) < e.r + rad)) continue;
      if (cz < NORTH_Z) {
        // north shore: sparse houses only
        if (rng() < 0.5) continue;
      }
      const dt = Math.hypot(cx - tower.x, cz - tower.z);
      let h;
      if (cz < NORTH_Z) h = 4 + rng() * 6;
      else if (dt < 160) h = 22 + rng() * 60 + (rng() < 0.15 ? 30 : 0);
      else if (dt < 300) h = 12 + rng() * 26;
      else h = 4 + rng() * 7;
      const tall = h > 20;
      const color = new THREE.Color((tall ? PALETTE_TALL : PALETTE_LOW)[Math.floor(rng() * (tall ? PALETTE_TALL : PALETTE_LOW).length)]);
      items.push({ x: cx, z: cz, w, d, h, color });
      colliders.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, h + 1);
    }
  }
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const mesh = new THREE.InstancedMesh(geo, buildingMaterial(), items.length);
  const outline = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0x1a1420, side: THREE.BackSide }), items.length);
  const roofGeo = new THREE.BoxGeometry(1, 1, 1);
  roofGeo.translate(0, 0.5, 0);
  const roofs = new THREE.InstancedMesh(roofGeo, toon(0x6b6f78), items.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
  items.forEach((b, i) => {
    m4.compose(p.set(b.x, 0, b.z), q, s.set(b.w, b.h, b.d));
    mesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, b.color);
    m4.compose(p.set(b.x, -0.2, b.z), q, s.set(b.w + 0.5, b.h + 0.5, b.d + 0.5));
    outline.setMatrixAt(i, m4);
    const tall = b.h > 20;
    m4.compose(p.set(b.x, b.h, b.z), q, s.set(b.w * (tall ? 0.5 : 0.9), tall ? 2.5 : 0.6, b.d * (tall ? 0.5 : 0.9)));
    roofs.setMatrixAt(i, m4);
  });
  mesh.castShadow = mesh.receiveShadow = true;
  roofs.castShadow = true;
  const g = new THREE.Group();
  g.add(mesh, outline, roofs);
  return { group: g, count: items.length };
}

// ---------- Trees ----------
function makeTrees(rng, exclusions) {
  const spots = [];
  const tooClose = (x, z) => exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.r) || MAP.ROADS.some((r) => MAP.distToPolyline(x, z, r.wp) < r.w / 2 + 1.5);
  for (const park of MAP.PARKS) {
    const xs = park.wp.map((p) => p[0]), zs = park.wp.map((p) => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minZ = Math.min(...zs), maxZ = Math.max(...zs);
    const n = Math.floor(((maxX - minX) * (maxZ - minZ)) / 140);
    for (let i = 0; i < n * 3 && spots.length < 2500; i++) {
      const x = minX + rng() * (maxX - minX), z = minZ + rng() * (maxZ - minZ);
      if (!MAP.pointInPoly(x, z, park.wp) || tooClose(x, z) || rng() < 0.5) continue;
      if (park.name === 'The Block' && rng() < 0.85) continue;
      spots.push([x, z]);
    }
  }
  for (const name of ['Macquarie St', 'College St', 'Park St', 'Redfern St', 'Elizabeth St', 'Oxford St', 'Regent St', 'Alfred St']) {
    const r = MAP.ROADS.find((x) => x.name === name);
    const L = MAP.polyLength(r.wp);
    for (let d = 6; d < L; d += 13) {
      const a = MAP.pointAlong(r.wp, d);
      for (const side of [-1, 1]) {
        const x = a.x - a.dz * side * (r.w / 2 + 2.5), z = a.z + a.dx * side * (r.w / 2 + 2.5);
        if (!MAP.inWater(x, z) && !exclusions.some((e) => Math.hypot(x - e.x, z - e.z) < e.r)) spots.push([x, z]);
      }
    }
  }
  const trunkGeo = new THREE.CylinderGeometry(0.3, 0.45, 3.2, 6);
  trunkGeo.translate(0, 1.6, 0);
  const canopyGeo = new THREE.IcosahedronGeometry(2.4, 1);
  const trunks = new THREE.InstancedMesh(trunkGeo, toon(0x7a5a43), spots.length);
  const canopy = new THREE.InstancedMesh(canopyGeo, toon(0xffffff, { flatShading: true }), spots.length);
  const ink = new THREE.InstancedMesh(canopyGeo, INK, spots.length);
  const greens = [0x5f9f3e, 0x74b04a, 0x4d8a3a, 0x86a77c, 0x6a9a5a].map((c) => new THREE.Color(c));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  spots.forEach(([x, z], i) => {
    const k = 0.8 + rng() * 0.6;
    m4.compose(p.set(x, 0, z), q.identity(), s.set(k, k, k));
    trunks.setMatrixAt(i, m4);
    q.setFromEuler(e.set(0, rng() * 6, 0));
    m4.compose(p.set(x, 3.2 * k + 1.5 * k, z), q, s.set(k * (1 + rng() * 0.3), k * (1.1 + rng() * 0.5), k));
    canopy.setMatrixAt(i, m4);
    ink.setMatrixAt(i, m4);
    canopy.setColorAt(i, greens[Math.floor(rng() * greens.length)]);
  });
  trunks.castShadow = canopy.castShadow = true;
  canopy.receiveShadow = true;
  const g = new THREE.Group();
  g.add(trunks, canopy, ink);
  return g;
}

// ---------- Zone barriers ----------
function makeLabel(text, color = '#ffffff', bg = 'rgba(20,24,40,0.78)', scale = 1) {
  const lines = text.split('\n');
  const tex = canvasTexture(1024, 96 * lines.length + 40, (g, w, h) => {
    g.fillStyle = bg;
    const r = 36;
    g.beginPath(); g.roundRect(8, 8, w - 16, h - 16, r); g.fill();
    g.fillStyle = color;
    g.font = 'bold 64px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, w / 2, 20 + 96 * i + 48));
  });
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  spr.scale.set(24 * scale, ((24 * (96 * lines.length + 40)) / 1024) * scale, 1);
  return spr;
}
export { makeLabel };

function makeZoneBarriers() {
  const uniforms = { uTime: { value: 0 } };
  const items = MAP.ZONES.map((z) => {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uTime: uniforms.uTime, uColor: { value: new THREE.Color(0xff3344) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        void main(){ float stripe = step(0.5, fract(vUv.x * 160.0 + vUv.y * 2.0 - uTime * 0.6));
        float a = (1.0 - vUv.y) * 0.55 * (0.55 + 0.45 * stripe) + smoothstep(0.96, 1.0, 1.0 - abs(vUv.y - 0.03) * 20.0) * 0.4;
        gl_FragColor = vec4(uColor, a); }`,
    });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(z.r, z.r, 18, 128, 1, true), mat);
    wall.position.set(z.x, 9, z.z);
    const ring = new THREE.Mesh(new THREE.RingGeometry(z.r - 1.2, z.r, 128), new THREE.MeshBasicMaterial({ color: 0x3d8bff, transparent: true, opacity: 0.5 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(z.x, 0.12, z.z);
    const label = makeLabel(`🔒 ${z.name}`, '#ffdede', 'rgba(60,10,16,0.8)', 1.6);
    label.position.set(z.x, 26, z.z);
    const g = new THREE.Group();
    g.add(wall, ring, label);
    return { zone: z, wall, ring, label, group: g };
  });
  return { items, uniforms };
}

// ---------- Public ----------
export function buildWorld(scene) {
  const rng = mulberry32(20240126);
  const colliders = new Colliders();
  

  scene.add(makeSky());
  scene.fog = new THREE.Fog(0xcde6f8, 260, 1250);

  const hemi = new THREE.HemisphereLight(0xdcefff, 0x8a7a5a, 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 10, far: 600 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.5;
  scene.add(sun, sun.target);

  // Ground with the harbour cut out
  const B = MAP.BOUNDS, pad = 400;
  const ground = new THREE.Shape([new THREE.Vector2(B.minX - pad, -(B.maxZ + pad)), new THREE.Vector2(B.maxX + pad, -(B.maxZ + pad)), new THREE.Vector2(B.maxX + pad, -(B.minZ - pad)), new THREE.Vector2(B.minX - pad, -(B.minZ - pad))]);
  ground.holes.push(shapeFrom(MAP.WATER));
  const groundTex = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#dccfb4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,100,80,0.18)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, h); g.moveTo(0, i * 64); g.lineTo(w, i * 64); g.stroke(); }
  });
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(1 / 8, 1 / 8);
  const groundMesh = new THREE.Mesh(flatShape(ground, 0), toon(0xffffff, { map: groundTex }));
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const water = makeWater();
  scene.add(water);
  // Sandstone sea walls
  const wallGeos = [];
  const W = MAP.WATER;
  for (let i = 0; i < W.length; i++) {
    const [ax, az] = W[i], [bx, bz] = W[(i + 1) % W.length];
    const len = Math.hypot(bx - ax, bz - az);
    const g = new THREE.BoxGeometry(1.2, 1.6, len + 1.2);
    g.rotateY(Math.atan2(bx - ax, bz - az));
    g.translate((ax + bx) / 2, -0.75, (az + bz) / 2);
    wallGeos.push(g);
  }
  scene.add(new THREE.Mesh(mergeGeometries(wallGeos), toon(0xc9a877)));

  // Streets
  const foot = [], road = [], lines = [];
  for (const r of MAP.ROADS) {
    foot.push(...ribbon(r.wp, r.w + 5, 0.04));
    road.push(...ribbon(r.wp, r.w, 0.07));
    lines.push(...dashes(r.wp, 0.09));
  }
  const footMesh = new THREE.Mesh(mergeGeometries(foot), toon(0xb9b2a6));
  const roadMesh = new THREE.Mesh(mergeGeometries(road), toon(0x4a4d55));
  const lineMesh = new THREE.Mesh(mergeGeometries(lines), new THREE.MeshBasicMaterial({ color: 0xf2f2f2 }));
  footMesh.receiveShadow = roadMesh.receiveShadow = true;
  scene.add(footMesh, roadMesh, lineMesh);

  // Rail corridor (Central -> Redfern)
  const railBed = new THREE.Mesh(mergeGeometries(ribbon(MAP.RAIL.wp, MAP.RAIL.w, 0.03)), toon(0x8c8073));
  const rails = [];
  for (const off of [-7.5, -6, -2.5, -1, 2.5, 4, 6.5, 8]) {
    const pts = MAP.RAIL.wp.map(([x, z], i, a) => {
      const [nx, nz] = a[Math.min(i + 1, a.length - 1)], [px, pz] = a[Math.max(i - 1, 0)];
      const dx = nx - px, dz = nz - pz, L = Math.hypot(dx, dz);
      return [x - (dz / L) * off, z + (dx / L) * off];
    });
    rails.push(...ribbon(pts, 0.3, 0.12));
  }
  railBed.receiveShadow = true;
  scene.add(railBed, new THREE.Mesh(mergeGeometries(rails), toon(0x5d5f66)));

  // Parks
  const parkGeos = MAP.PARKS.map((p) => flatShape(shapeFrom(p.wp), 0.1));
  const parks = new THREE.Mesh(mergeGeometries(parkGeos), toon(0x7cbd52));
  parks.receiveShadow = true;
  scene.add(parks);

  // Exclusion areas for procedural content
  const L = MAP.LANDMARKS;
  const exclusions = [
    { ...L.operaHouse, r: 40 }, { ...L.townHall, r: 26 }, { ...L.parliament, r: 26 }, { ...L.stateLibrary, r: 16 }, { ...L.sydneyTower, r: 14 },
    { ...L.central, r: 42 }, { ...L.australianHall, r: 10 }, { ...L.qvb, r: 18 },
    { ...L.gpo, r: 16 }, { ...L.stAndrews, r: 16 }, { ...L.stMarys, r: 22 }, { ...L.ausMuseum, r: 18 }, { ...L.anzac, r: 16 }, { ...L.pool, r: 20 }, { ...L.archibald, r: 10 }, { ...L.hospital, r: 16 }, { ...L.mint, r: 12 }, { ...L.convention, r: 24 }, { ...L.bridgeA, r: 30 }, { ...L.bridgeB, r: 30 },
    { ...MAP.ELDERS, r: 24 }, { ...MAP.STAGE, r: 30 }, { ...MAP.FLAGPOLE, r: 12 }, { ...MAP.SPAWN, r: 10 }, { ...MAP.OUTSKIRTS, r: 20 },
    ...MAP.RALLIES.map((r) => ({ ...r, r: 14 })), ...MAP.INFO_POINTS.map((i) => ({ ...i, r: 8 })),
    ...MAP.POLITICIAN_SPOTS.map((s) => ({ ...s, r: 20 })),
  ];
  const buildings = makeBuildings(colliders, exclusions, rng);
  scene.add(buildings.group);
  scene.add(makeTrees(rng, exclusions));
  const clouds = makeClouds(rng);
  scene.add(clouds);
  const barriers = makeZoneBarriers();
  for (const b of barriers.items) scene.add(b.group);

  return {
    colliders, sun, water, clouds, barriers, buildingCount: buildings.count,
    update(t, focus) {
      water.userData.uniforms.uTime.value = t;
      barriers.uniforms.uTime.value = t;
      for (const c of clouds.children) { c.position.x += 0.02; if (c.position.x > MAP.BOUNDS.maxX + 400) c.position.x = MAP.BOUNDS.minX - 400; }
      sun.position.set(focus.x + 120, 220, focus.z + 70);
      sun.target.position.set(focus.x, 0, focus.z);
    },
    setCampaign(c) {
      for (const b of barriers.items) {
        const open = c.unlocked[b.zone.id];
        b.wall.visible = !open;
        b.label.visible = !open;
        b.ring.material.color.set(open ? 0x3d8bff : 0xff3344);
        b.ring.material.opacity = open ? 0.35 : 0.6;
      }
    },
  };
}
