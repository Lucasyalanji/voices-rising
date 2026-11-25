// Cel-shaded ("toon") material helpers for a hand-painted adventure look.
import * as THREE from 'three';

export const gradientMap = (() => {
  const data = new Uint8Array([70, 140, 200, 255]);
  const tex = new THREE.DataTexture(data, 4, 1, THREE.RedFormat);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
})();

const cache = new Map();
export function toon(color, opts = {}) {
  const key = opts.nocache ? null : `${color}|${JSON.stringify(opts)}`;
  if (key && cache.has(key)) return cache.get(key);
  const { nocache, ...rest } = opts;
  const m = new THREE.MeshToonMaterial({ color, gradientMap, ...rest });
  if (key) cache.set(key, m);
  return m;
}

// Inverted-hull outline: draws back faces pushed out along normals in a dark ink colour.
export function outlineMaterial(thickness = 0.04, color = 0x1a1420) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${thickness.toFixed(3)};`);
  };
  return m;
}
export const INK = outlineMaterial(0.045);
export const INK_THIN = outlineMaterial(0.025);

export function addOutline(mesh, mat = INK) {
  const o = new THREE.Mesh(mesh.geometry, mat);
  o.raycast = () => {};
  o.userData.outline = true;
  mesh.add(o);
  return o;
}

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Aboriginal flag (designed by Harold Thomas): black = the people, red = the earth, yellow = the sun.
export function drawAboriginalFlag(g, w, h) {
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h / 2);
  g.fillStyle = '#d4202a';
  g.fillRect(0, h / 2, w, h / 2);
  g.fillStyle = '#ffcd00';
  g.beginPath();
  g.arc(w / 2, h / 2, h * 0.25, 0, Math.PI * 2);
  g.fill();
}

function star(g, cx, cy, r, points = 7, inner = 0.45) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const rr = i % 2 ? r * inner : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

export function drawAustralianFlag(g, w, h) {
  g.fillStyle = '#012169';
  g.fillRect(0, 0, w, h);
  const cw = w / 2, ch = h / 2;
  g.save();
  g.beginPath();
  g.rect(0, 0, cw, ch);
  g.clip();
  g.strokeStyle = '#fff';
  g.lineWidth = ch * 0.2;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(cw, ch); g.moveTo(cw, 0); g.lineTo(0, ch); g.stroke();
  g.strokeStyle = '#c8102e';
  g.lineWidth = ch * 0.067;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(cw, ch); g.moveTo(cw, 0); g.lineTo(0, ch); g.stroke();
  g.strokeStyle = '#fff';
  g.lineWidth = ch * 0.33;
  g.beginPath(); g.moveTo(cw / 2, 0); g.lineTo(cw / 2, ch); g.moveTo(0, ch / 2); g.lineTo(cw, ch / 2); g.stroke();
  g.strokeStyle = '#c8102e';
  g.lineWidth = ch * 0.2;
  g.beginPath(); g.moveTo(cw / 2, 0); g.lineTo(cw / 2, ch); g.moveTo(0, ch / 2); g.lineTo(cw, ch / 2); g.stroke();
  g.restore();
  g.fillStyle = '#fff';
  star(g, cw / 2, h * 0.75, h * 0.15);
  const sx = w * 0.75;
  star(g, sx, h * 0.83, h * 0.07);
  star(g, sx, h * 0.17, h * 0.07);
  star(g, w * 0.63, h * 0.41, h * 0.07);
  star(g, w * 0.88, h * 0.37, h * 0.07);
  star(g, w * 0.8, h * 0.54, h * 0.035, 5);
}

// A flag mesh with a vertex-shader wave.
export function waveFlag(texture, w = 6, h = 3) {
  const geo = new THREE.PlaneGeometry(w, h, 24, 8);
  geo.translate(w / 2, 0, 0);
  const mat = new THREE.MeshToonMaterial({ map: texture, gradientMap, side: THREE.DoubleSide });
  const uniforms = { uTime: { value: 0 } };
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uniforms.uTime;
    s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float k = position.x / ${w.toFixed(1)};
      transformed.z += sin(position.x * 1.3 - uTime * 4.0) * 0.35 * k + sin(position.y * 2.0 + uTime * 2.0) * 0.08 * k;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.userData.uniforms = uniforms;
  mesh.castShadow = true;
  return mesh;
}
