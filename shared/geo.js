// Geo projection shared by servers and the browser client.
// The world is a real-world-aligned map of central Sydney: north = -z, east = +x.
// Origin is Sydney Town Hall. 1 world unit = METERS_PER_UNIT metres (compressed so walking is fun).

export const ORIGIN = { lat: -33.8732, lon: 151.2065 };
export const METERS_PER_UNIT = 3;

const K_LAT = 110574;
const K_LON = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180);

export function toWorld(lat, lon) {
  return {
    x: ((lon - ORIGIN.lon) * K_LON) / METERS_PER_UNIT,
    z: (-(lat - ORIGIN.lat) * K_LAT) / METERS_PER_UNIT,
  };
}

export function toLatLon(x, z) {
  return {
    lat: ORIGIN.lat - (z * METERS_PER_UNIT) / K_LAT,
    lon: ORIGIN.lon + (x * METERS_PER_UNIT) / K_LON,
  };
}

export const metresToUnits = (m) => m / METERS_PER_UNIT;
