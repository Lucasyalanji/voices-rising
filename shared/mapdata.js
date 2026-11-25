// Geo-mapped data for central Sydney (Gadigal Country, Eora Nation).
// All coordinates are real-world [lat, lon]; they are projected into world units with toWorld().
// Streets/shorelines are simplified for gameplay — swap in OpenStreetMap data for higher fidelity.
import { toWorld, metresToUnits } from './geo.js';

const W = ([lat, lon]) => {
  const p = toWorld(lat, lon);
  return [p.x, p.z];
};
const P = (lat, lon) => toWorld(lat, lon);

export const BOUNDS = (() => {
  const a = P(-33.8985, 151.1900);
  const b = P(-33.8440, 151.2240);
  return { minX: a.x, maxX: b.x, minZ: b.z, maxZ: a.z };
})();

// ---------- Streets ----------
const ROADS_LL = [
  { name: 'George St', w: 10, pts: [[-33.8840, 151.2010], [-33.8800, 151.2042], [-33.8760, 151.2058], [-33.8730, 151.2069], [-33.8690, 151.2073], [-33.8650, 151.2078], [-33.8615, 151.2088], [-33.8602, 151.2095]] },
  { name: 'Pitt St', w: 7, pts: [[-33.8800, 151.2057], [-33.8730, 151.2081], [-33.8650, 151.2091], [-33.8612, 151.2102]] },
  { name: 'Castlereagh St', w: 7, pts: [[-33.8790, 151.2075], [-33.8730, 151.2092], [-33.8660, 151.2103]] },
  { name: 'Elizabeth St', w: 9, pts: [[-33.8935, 151.2075], [-33.8840, 151.2082], [-33.8780, 151.2098], [-33.8730, 151.2104], [-33.8670, 151.2110], [-33.8630, 151.2115]] },
  { name: 'College St', w: 9, pts: [[-33.8782, 151.2133], [-33.8730, 151.2131], [-33.8700, 151.2126]] },
  { name: 'Macquarie St', w: 10, pts: [[-33.8700, 151.2126], [-33.8660, 151.2128], [-33.8620, 151.2135], [-33.8592, 151.2143], [-33.8578, 151.2148]] },
  { name: 'Park St', w: 9, pts: [[-33.8733, 151.2070], [-33.8733, 151.2104]] },
  { name: 'Druitt St', w: 8, pts: [[-33.8727, 151.2030], [-33.8727, 151.2052]] },
  { name: 'William St', w: 9, pts: [[-33.8733, 151.2131], [-33.8738, 151.2215]] },
  { name: 'Market St', w: 8, pts: [[-33.8711, 151.2017], [-33.8710, 151.2104]] },
  { name: 'Pyrmont Bridge', w: 7, bridge: true, pts: [[-33.8712, 151.2017], [-33.8712, 151.1958]] },
  { name: 'Bathurst St', w: 8, pts: [[-33.8752, 151.2030], [-33.8755, 151.2101]] },
  { name: 'Kent St', w: 7, pts: [[-33.8762, 151.2043], [-33.8630, 151.2046]] },
  { name: 'Clarence St', w: 7, pts: [[-33.8745, 151.2051], [-33.8640, 151.2054]] },
  { name: 'Erskine St', w: 7, pts: [[-33.8665, 151.2034], [-33.8665, 151.2062]] },
  { name: 'Western Distributor', w: 12, pts: [[-33.8775, 151.2040], [-33.8745, 151.2027], [-33.8705, 151.2026], [-33.8665, 151.2034], [-33.8630, 151.2050], [-33.8615, 151.2063]] },
  { name: 'Liverpool St', w: 8, pts: [[-33.8770, 151.2034], [-33.8772, 151.2099]] },
  { name: 'Oxford St', w: 8, pts: [[-33.8775, 151.2133], [-33.8800, 151.2215]] },
  { name: 'King St', w: 7, pts: [[-33.8688, 151.2030], [-33.8690, 151.2125]] },
  { name: 'Martin Place', w: 7, pts: [[-33.8678, 151.2075], [-33.8677, 151.2127]] },
  { name: 'Hunter St', w: 7, pts: [[-33.8655, 151.2060], [-33.8655, 151.2114]] },
  { name: 'Bridge St', w: 7, pts: [[-33.8632, 151.2070], [-33.8632, 151.2133]] },
  { name: 'Alfred St', w: 9, pts: [[-33.8610, 151.2088], [-33.8612, 151.2128]] },
  { name: 'Goulburn St', w: 7, pts: [[-33.8790, 151.2040], [-33.8795, 151.2098]] },
  { name: 'Sussex St', w: 7, pts: [[-33.8780, 151.2034], [-33.8640, 151.2038], [-33.8605, 151.2044]] },
  { name: 'York St', w: 7, pts: [[-33.8740, 151.2058], [-33.8620, 151.2063]] },
  { name: 'Broadway', w: 10, pts: [[-33.8840, 151.2010], [-33.8845, 151.1960], [-33.8850, 151.1905]] },
  { name: 'Regent St', w: 9, pts: [[-33.8840, 151.2010], [-33.8880, 151.2008], [-33.8935, 151.2010]] },
  { name: 'Redfern St', w: 8, pts: [[-33.8926, 151.2010], [-33.8929, 151.2085]] },
  { name: 'Cleveland St', w: 10, pts: [[-33.8890, 151.1975], [-33.8893, 151.2110]] },
  { name: 'Chalmers St', w: 7, pts: [[-33.8842, 151.2064], [-33.8932, 151.2064]] },
  { name: 'Lawson St', w: 6, pts: [[-33.8922, 151.1990], [-33.8923, 151.2010]] },
  { name: 'Eddy Ave', w: 8, pts: [[-33.8822, 151.2045], [-33.8826, 151.2090]] },
  { name: 'Bradfield Hwy', w: 10, pts: [[-33.8615, 151.2063], [-33.8575, 151.2070], [-33.8556, 151.2075]] },
  { name: 'Crown St', w: 7, pts: [[-33.8785, 151.2150], [-33.8935, 151.2135]] },
  { name: 'Bourke St', w: 7, pts: [[-33.8760, 151.2175], [-33.8935, 151.2170]] },
];
export const ROADS = ROADS_LL.map((r) => ({ ...r, wp: r.pts.map(W) }));
export const BRIDGES = ROADS.filter((r) => r.bridge);

export const RAIL = { w: 22, wp: [[-33.8826, 151.2060], [-33.8870, 151.2030], [-33.8905, 151.1993], [-33.8920, 151.1981], [-33.8985, 151.1940]].map(W) };

// ---------- Water (Port Jackson, Sydney Cove/Warrane, Farm Cove, Cockle Bay) ----------
export const WATER = [
  [-33.8748, 151.1975], [-33.8748, 151.2012], [-33.8700, 151.2016], [-33.8650, 151.2017], [-33.8605, 151.2016],
  [-33.8560, 151.2030], [-33.8545, 151.2060], [-33.8540, 151.2080], [-33.8570, 151.2088], [-33.8598, 151.2098],
  [-33.8606, 151.2110], [-33.8598, 151.2128], [-33.8575, 151.2138], [-33.8556, 151.2145], [-33.8560, 151.2162],
  [-33.8595, 151.2163], [-33.8622, 151.2172], [-33.8615, 151.2195], [-33.8585, 151.2208], [-33.8550, 151.2240],
  [-33.8465, 151.2240], [-33.8465, 151.1900], [-33.8640, 151.1900], [-33.8700, 151.1962],
].map(W);

// ---------- Parks ----------
export const PARKS = [
  { name: 'Hyde Park', poly: [[-33.8699, 151.2110], [-33.8699, 151.2123], [-33.8780, 151.2127], [-33.8780, 151.2104]] },
  { name: 'Tumbalong Park', poly: [[-33.8751, 151.2000], [-33.8751, 151.2015], [-33.8762, 151.2015], [-33.8762, 151.2000]] },
  { name: 'Chinese Garden of Friendship', poly: [[-33.8763, 151.2018], [-33.8763, 151.2030], [-33.8773, 151.2030], [-33.8773, 151.2018]] },
  { name: 'Royal Botanic Garden & The Domain', poly: [[-33.8700, 151.2140], [-33.8640, 151.2141], [-33.8626, 151.2150], [-33.8629, 151.2168], [-33.8640, 151.2200], [-33.8710, 151.2205], [-33.8722, 151.2160]] },
  { name: 'Prince Alfred Park', poly: [[-33.8858, 151.2040], [-33.8858, 151.2058], [-33.8887, 151.2058], [-33.8887, 151.2040]] },
  { name: 'Redfern Park', poly: [[-33.8930, 151.2045], [-33.8930, 151.2062], [-33.8945, 151.2062], [-33.8945, 151.2045]] },
  { name: 'The Block', poly: [[-33.8904, 151.1996], [-33.8904, 151.2007], [-33.8920, 151.2007], [-33.8920, 151.1996]] },
  { name: 'Belmore Park', poly: [[-33.8800, 151.2052], [-33.8800, 151.2078], [-33.8815, 151.2078], [-33.8815, 151.2052]] },
  { name: 'Barangaroo Reserve', poly: [[-33.8598, 151.2021], [-33.8566, 151.2036], [-33.8563, 151.2052], [-33.8603, 151.2045]] },
  { name: 'Bennelong Point Forecourt', poly: [[-33.8598, 151.2133], [-33.8578, 151.2141], [-33.8592, 151.2150], [-33.8605, 151.2140]] },
].map((p) => ({ ...p, wp: p.poly.map(W) }));

// ---------- Protest zones (unlock with signatures) ----------
export const ZONES = [
  { key: 'redfern', name: 'Redfern — The Block', lat: -33.8918, lon: 151.2025, rm: 340 },
  { key: 'central', name: 'Central & Prince Alfred Park', lat: -33.8850, lon: 151.2040, rm: 340 },
  { key: 'townhall', name: 'Town Hall — City Council & Main Stage', lat: -33.8728, lon: 151.2062, rm: 190 },
  { key: 'hydepark', name: 'Hyde Park', lat: -33.8735, lon: 151.2115, rm: 300 },
  { key: 'parliament', name: 'Macquarie St — Parliament House', lat: -33.8672, lon: 151.2128, rm: 300 },
].map((z, id) => ({ ...z, id, ...P(z.lat, z.lon), r: metresToUnits(z.rm) }));

// ---------- Rally crowds (yarn with them to win supporters) ----------
export const RALLIES = [
  { name: 'The Block lawn', zone: 0, lat: -33.8909, lon: 151.2004 },
  { name: 'Redfern Park', zone: 0, lat: -33.8937, lon: 151.2053 },
  { name: 'Redfern St shops', zone: 0, lat: -33.8924, lon: 151.2032 },
  { name: 'Railway Square', zone: 1, lat: -33.8836, lon: 151.2018 },
  { name: 'Prince Alfred Park', zone: 1, lat: -33.8872, lon: 151.2049 },
  { name: 'Central forecourt', zone: 1, lat: -33.8828, lon: 151.2050 },
  { name: 'Sydney Square', zone: 2, lat: -33.8739, lon: 151.2071 },
  { name: 'QVB corner', zone: 2, lat: -33.8716, lon: 151.2066 },
  { name: 'Druitt St corner', zone: 2, lat: -33.8722, lon: 151.2050 },
  { name: 'Archibald Fountain', zone: 3, lat: -33.8707, lon: 151.2116 },
  { name: 'Hyde Park south lawn', zone: 3, lat: -33.8745, lon: 151.2121 },
  { name: 'Park St crossing', zone: 3, lat: -33.8728, lon: 151.2117 },
  { name: 'Parliament gates', zone: 4, lat: -33.8680, lon: 151.2131 },
  { name: 'The Domain lawn', zone: 4, lat: -33.8690, lon: 151.2150 },
  { name: 'State Library forecourt', zone: 4, lat: -33.8660, lon: 151.2131 },
].map((r, id) => ({ ...r, id, ...P(r.lat, r.lon) }));

// ---------- Key places ----------
export const ELDERS = { ...P(-33.8914, 151.2000), lat: -33.8914, lon: 151.2000 };
export const SPAWN = P(-33.8909, 151.2002);
export const OUTSKIRTS = P(-33.8975, 151.1925); // where voted-out spies are sent
export const STAGE = { ...P(-33.8728, 151.2066), yaw: Math.PI / 2, name: 'Town Hall Main Stage' }; // faces east to George St
export const FLAGPOLE = P(-33.8669, 151.2131);

// Politicians stand in a row at each zone's civic spot. yaw: direction they face (0 = +z/south).
export const POLITICIAN_SPOTS = [
  { label: 'Redfern community centre', lat: -33.8936, lon: 151.2030, axis: 'ew', yaw: Math.PI },
  { label: 'Prince Alfred Park', lat: -33.8862, lon: 151.2049, axis: 'ew', yaw: Math.PI },
  { label: 'Town Hall — City Council', lat: -33.8742, lon: 151.2056, axis: 'ew', yaw: Math.PI },
  { label: 'Hyde Park', lat: -33.8720, lon: 151.2110, axis: 'ns', yaw: Math.PI / 2 },
  { label: 'Parliament House', lat: -33.8678, lon: 151.2132, axis: 'ns', yaw: -Math.PI / 2 },
].map((s) => ({ ...s, ...P(s.lat, s.lon) }));

export function politicianPos(zone, i) {
  const s = POLITICIAN_SPOTS[zone];
  const off = (i - 4.5) * 3.2;
  return s.axis === 'ew' ? { x: s.x + off, z: s.z, yaw: s.yaw } : { x: s.x, z: s.z + off, yaw: s.yaw };
}

export const MARCH_ROUTES = {
  council: [[-33.8910, 151.2004], [-33.8915, 151.2010], [-33.8880, 151.2008], [-33.8840, 151.2011], [-33.8800, 151.2043], [-33.8760, 151.2059], [-33.8733, 151.2069]].map(W),
  parliament: [[-33.8731, 151.2070], [-33.8733, 151.2085], [-33.8733, 151.2118], [-33.8712, 151.2126], [-33.8692, 151.2127], [-33.8674, 151.2128]].map(W),
};

export const INFO_POINTS = [
  { id: 'block', title: 'The Block, Redfern', lat: -33.8906, lon: 151.2001, text: 'For generations The Block has been a heart of Aboriginal community life in Sydney — a place to find family, organise, and look after each other. Since the 1970s the Aboriginal Housing Company has worked here to keep mob housed on this land.' },
  { id: 'dayofmourning', title: 'Australian Hall — Day of Mourning', lat: -33.8777, lon: 151.2095, text: 'On 26 January 1938, Aboriginal leaders gathered at Australian Hall on Elizabeth Street for the Day of Mourning — one of the first major Aboriginal civil rights protests. You walk in their footsteps.' },
  { id: 'warrane', title: 'Warrane — Sydney Cove', lat: -33.8603, lon: 151.2105, text: 'Warrane is the Gadigal name for Sydney Cove. Long before ferries and wharves, this harbour fed and sustained the Gadigal people for thousands of generations.' },
  { id: 'bennelong', title: 'Bennelong Point', lat: -33.8583, lon: 151.2142, text: 'This point is named after Woollarawarre Bennelong, a Wangal man who became a go-between for his people and the early colony. The Opera House now stands on it.' },
  { id: 'barangaroo', title: 'Barangaroo', lat: -33.8590, lon: 151.2034, text: 'Barangaroo is named after a Cammeraygal woman, a fisher and a strong cultural leader who held to her people\'s ways.' },
].map((i) => ({ ...i, ...P(i.lat, i.lon) }));

export const LANDMARKS = {
  operaHouse: P(-33.8569, 151.2152),
  bridgeA: P(-33.8556, 151.2075),
  bridgeB: P(-33.8462, 151.2108),
  townHall: P(-33.8731, 151.2058),
  parliament: P(-33.8671, 151.2138),
  stateLibrary: P(-33.8658, 151.2138),
  sydneyTower: P(-33.8705, 151.2090),
  central: P(-33.8830, 151.2066),
  australianHall: P(-33.8778, 151.2093),
  quay: P(-33.8606, 151.2110),
  mural: P(-33.8905, 151.2001),
  qvb: P(-33.8718, 151.2063),
  gpo: P(-33.8684, 151.2080),
  stAndrews: P(-33.8751, 151.2061),
  stMarys: P(-33.8711, 151.2135),
  ausMuseum: P(-33.8748, 151.2138),
  anzac: P(-33.8763, 151.2113),
  pool: P(-33.8749, 151.2113),
  archibald: P(-33.8714, 151.2116),
  hospital: P(-33.8687, 151.2138),
  mint: P(-33.8697, 151.2137),
  convention: P(-33.8752, 151.1985),
};

// ---------- Geometry helpers ----------
export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function distToSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = Math.max(0, Math.min(1, t));
  const x = ax + t * dx, z = az + t * dz;
  return Math.hypot(px - x, pz - z);
}

export function distToPolyline(px, pz, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, distToSeg(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]));
  return d;
}

export function polyLength(pts) {
  let L = 0;
  for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  return L;
}

export function pointAlong(pts, d) {
  d = Math.max(0, d);
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (d <= seg || i === pts.length - 2) {
      const t = Math.min(1, d / (seg || 1));
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, dx: (bx - ax) / (seg || 1), dz: (bz - az) / (seg || 1) };
    }
    d -= seg;
  }
  const [x, z] = pts[pts.length - 1];
  return { x, z, dx: 0, dz: 1 };
}

export function zoneAt(x, z) {
  for (const zn of ZONES) if (Math.hypot(x - zn.x, z - zn.z) < zn.r) return zn;
  return null;
}

export function inWater(x, z) {
  if (BRIDGES.some((b) => distToPolyline(x, z, b.wp) < b.w / 2)) return false; // walkable bridge deck
  return pointInPoly(x, z, WATER);
}
