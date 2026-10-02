/**
 * Ordnance Survey National Grid (OSGB36) eastings/northings → WGS84 latitude/longitude.
 *
 * GIAS publishes grid references, not lat/lon. This is the standard two-step conversion
 * (OS "A guide to coordinate systems in Great Britain", 2020):
 *   1. inverse Transverse Mercator on the Airy 1830 ellipsoid → OSGB36 lat/lon;
 *   2. a 7-parameter Helmert datum shift OSGB36 → WGS84.
 * Accuracy is a few metres across Britain (the OSTN15 grid would be centimetre-level, but a
 * "how far is this college" search does not need it). Pure and dependency-free.
 */
const AIRY = { a: 6377563.396, b: 6356256.909 };
const WGS84 = { a: 6378137, b: 6356752.314245 };
const F0 = 0.9996012717;
const LAT0 = (49 * Math.PI) / 180;
const LON0 = (-2 * Math.PI) / 180;
const N0 = -100000;
const E0 = 400000;

const toDeg = (rad: number): number => (rad * 180) / Math.PI;

function eastingNorthingToLatLonOsgb36(E: number, N: number): { lat: number; lon: number } {
  const { a, b } = AIRY;
  const e2 = 1 - (b * b) / (a * a);
  const n = (a - b) / (a + b);
  const n2 = n * n;
  const n3 = n * n * n;

  let lat = LAT0;
  let M = 0;
  do {
    lat = (N - N0 - M) / (a * F0) + lat;
    const dLat = lat - LAT0;
    const sLat = lat + LAT0;
    M =
      b *
      F0 *
      ((1 + n + (5 / 4) * n2 + (5 / 4) * n3) * dLat -
        (3 * n + 3 * n2 + (21 / 8) * n3) * Math.sin(dLat) * Math.cos(sLat) +
        ((15 / 8) * n2 + (15 / 8) * n3) * Math.sin(2 * dLat) * Math.cos(2 * sLat) -
        (35 / 24) * n3 * Math.sin(3 * dLat) * Math.cos(3 * sLat));
  } while (Math.abs(N - N0 - M) >= 0.00001);

  const sin = Math.sin(lat);
  const cos = Math.cos(lat);
  const tan = Math.tan(lat);
  const nu = (a * F0) / Math.sqrt(1 - e2 * sin * sin);
  const rho = (a * F0 * (1 - e2)) / (1 - e2 * sin * sin) ** 1.5;
  const eta2 = nu / rho - 1;
  const tan2 = tan * tan;
  const tan4 = tan2 * tan2;
  const tan6 = tan4 * tan2;
  const sec = 1 / cos;

  const VII = tan / (2 * rho * nu);
  const VIII = (tan / (24 * rho * nu ** 3)) * (5 + 3 * tan2 + eta2 - 9 * tan2 * eta2);
  const IX = (tan / (720 * rho * nu ** 5)) * (61 + 90 * tan2 + 45 * tan4);
  const X = sec / nu;
  const XI = (sec / (6 * nu ** 3)) * (nu / rho + 2 * tan2);
  const XII = (sec / (120 * nu ** 5)) * (5 + 28 * tan2 + 24 * tan4);
  const XIIA = (sec / (5040 * nu ** 7)) * (61 + 662 * tan2 + 1320 * tan4 + 720 * tan6);

  const dE = E - E0;
  return {
    lat: lat - VII * dE ** 2 + VIII * dE ** 4 - IX * dE ** 6,
    lon: LON0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7,
  };
}

/** OSGB36 → WGS84 Helmert parameters (OS guide, Annexe C; position-vector convention). */
const HELMERT = {
  tx: 446.448,
  ty: -125.157,
  tz: 542.06,
  s: -20.4894, // parts per million
  rx: 0.1502, // arc-seconds
  ry: 0.247,
  rz: 0.8421,
};

function helmertToWgs84(lat: number, lon: number): { lat: number; lon: number } {
  const { a, b } = AIRY;
  const e2 = 1 - (b * b) / (a * a);
  const sinLat = Math.sin(lat);
  const nu = a / Math.sqrt(1 - e2 * sinLat * sinLat);
  const x1 = nu * Math.cos(lat) * Math.cos(lon);
  const y1 = nu * Math.cos(lat) * Math.sin(lon);
  const z1 = nu * (1 - e2) * sinLat;

  const sec = Math.PI / (180 * 3600);
  const s1 = HELMERT.s / 1e6 + 1;
  const rx = HELMERT.rx * sec;
  const ry = HELMERT.ry * sec;
  const rz = HELMERT.rz * sec;
  const x2 = HELMERT.tx + x1 * s1 - y1 * rz + z1 * ry;
  const y2 = HELMERT.ty + x1 * rz + y1 * s1 - z1 * rx;
  const z2 = HELMERT.tz - x1 * ry + y1 * rx + z1 * s1;

  const { a: a2, b: b2 } = WGS84;
  const e2w = 1 - (b2 * b2) / (a2 * a2);
  const p = Math.sqrt(x2 * x2 + y2 * y2);
  let phi = Math.atan2(z2, p * (1 - e2w));
  for (let i = 0; i < 10; i++) {
    const sp = Math.sin(phi);
    const nuW = a2 / Math.sqrt(1 - e2w * sp * sp);
    const next = Math.atan2(z2 + e2w * nuW * sp, p);
    if (Math.abs(next - phi) < 1e-12) {
      phi = next;
      break;
    }
    phi = next;
  }
  return { lat: phi, lon: Math.atan2(y2, x2) };
}

/** National Grid easting/northing (metres) → WGS84 degrees, rounded to ~1 m (5 d.p.). */
export function osgbToWgs84(easting: number, northing: number): { lat: number; lon: number } {
  const osgb = eastingNorthingToLatLonOsgb36(easting, northing);
  const w = helmertToWgs84(osgb.lat, osgb.lon);
  return { lat: Math.round(toDeg(w.lat) * 1e5) / 1e5, lon: Math.round(toDeg(w.lon) * 1e5) / 1e5 };
}
