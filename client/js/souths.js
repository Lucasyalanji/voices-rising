// South Sydney fan flags (cardinal red and myrtle green, no club logo) flying from rooftop poles
// across Redfern, around The Block and near Central.
import * as THREE from 'three';
import * as MAP from '/shared/mapdata.js';
import { toon, canvasTexture, waveFlag } from './materials.js';
import { mulberry32 } from './world.js';

const RED = '#C8102E', GREEN = '#00843D', WHITE = '#FFFFFF';

function drawFanFlag(g, w, h, text) {
  // red and green hoops, like a Souths jersey
  const bands = 5;
  for (let i = 0; i < bands; i++) { g.fillStyle = i % 2 ? GREEN : RED; g.fillRect(0, (h / bands) * i, w, h / bands + 1); }
  g.fillStyle = WHITE;
  g.font = `900 ${Math.round(h * 0.2)}px Impact, "Arial Black", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = h * 0.03; g.strokeStyle = GREEN;
  g.strokeText(text, w / 2, h / 2); g.fillText(text, w / 2, h / 2);
}

const SLOGANS = ['GO SOUTHS', 'GLORY GLORY', 'REDFERN', 'UP THE BUNNIES', 'GO SOUTHS'];

export function addSouthsFlags(scene, colliders) {
  const rng = mulberry32(1908);
  const textures = SLOGANS.map((t) => canvasTexture(512, 256, (g, w, h) => drawFanFlag(g, w, h, t)));
  // Find real building roofs (colliders with a height) inside the Redfern and Central zones.
  const zones = [MAP.ZONES[0], MAP.ZONES[1]];
  const seen = new Set(), roofs = [];
  for (const list of colliders.map.values()) for (const b of list) {
    if (seen.has(b) || b.h > 200) continue;
    seen.add(b);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (zones.some((z) => Math.hypot(cx - z.x, cz - z.z) < z.r * 0.95)) roofs.push(b);
  }
  // Spread the flags out: take roofs at least 22 units apart, preferring ones near the streets people walk.
  roofs.sort((a, b) => rng() - 0.5);
  const picked = [];
  for (const b of roofs) {
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    if (picked.every((p) => Math.hypot(p.x - cx, p.z - cz) > 18)) picked.push({ x: cx, z: cz, b });
    if (picked.length >= 22) break;
  }
  const flags = [];
  const pole = new THREE.CylinderGeometry(0.08, 0.1, 5.5, 6); pole.translate(0, 2.75, 0);
  const poleMat = toon(0xdedede);
  picked.forEach((p, i) => {
    const g = new THREE.Group();
    const corner = rng() < 0.5;
    g.position.set(corner ? p.b.maxX - 0.6 : p.x, p.b.h - 1, corner ? p.b.minZ + 0.6 : p.z);
    g.rotation.y = rng() * Math.PI * 2;
    const m = new THREE.Mesh(pole, poleMat); m.castShadow = true;
    const f = waveFlag(textures[i % textures.length], 3.6, 1.8);
    f.position.set(0.08, 4.6, 0);
    g.add(m, f);
    scene.add(g);
    flags.push(f);
  });
  // A big one on The Block, above the mural, and one at Redfern Park.
  for (const [p, y, w] of [[MAP.LANDMARKS.mural, 8, 3.4], [MAP.RALLIES[1], 0, 3]]) {
    const g = new THREE.Group();
    g.position.set(p.x + (y ? 11 : 4), y, p.z + (y ? 0 : -3));
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6, 6).translate(0, 3, 0), poleMat); m.castShadow = true;
    const f = waveFlag(textures[0], w, w / 2);
    f.position.set(0.1, 5.2, 0);
    g.add(m, f); scene.add(g); flags.push(f);
  }
  return {
    count: flags.length,
    update(t) { flags.forEach((f, i) => { f.userData.uniforms.uTime.value = t + i * 0.7; }); },
  };
}
