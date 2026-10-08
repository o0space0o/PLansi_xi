// Deterministic 3D matter fields, dimensionless optical units. These are
// realizations of disk/bulge + turbulent gas models, not observed TNG cells.
export function noise3(x, y, z) {
  const hash = (a, b, c) => {
    let n = Math.imul(a, 374761393) ^ Math.imul(b, 668265263) ^ Math.imul(c, 2147483647);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const ix = Math.floor(x),
    iy = Math.floor(y),
    iz = Math.floor(z);
  let fx = x - ix,
    fy = y - iy,
    fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const lerp = (a, b, t) => a + (b - a) * t;
  return lerp(
    lerp(
      lerp(hash(ix, iy, iz), hash(ix + 1, iy, iz), fx),
      lerp(hash(ix, iy + 1, iz), hash(ix + 1, iy + 1, iz), fx),
      fy,
    ),
    lerp(
      lerp(hash(ix, iy, iz + 1), hash(ix + 1, iy, iz + 1), fx),
      lerp(hash(ix, iy + 1, iz + 1), hash(ix + 1, iy + 1, iz + 1), fx),
      fy,
    ),
    fz,
  );
}
export function density(kind, x, y, z) {
  const r = Math.hypot(x, z),
    edge = Math.max(0, 1 - Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) ** 8);
  if (!edge) return [0, 0, 0, 0];
  const turbulence =
    noise3(x * 18 + 5, y * 18, z * 18 - 2) * 0.55 +
    noise3(x * 45, y * 45, z * 45) * 0.3 +
    noise3(x * 110, y * 110, z * 110) * 0.15;
  if (kind === 'galaxy') {
    const theta = Math.atan2(z, x),
      phase = 2 * (theta - Math.log(Math.max(r, 0.035)) * 3.1) + (turbulence - 0.5) * 0.9;
    const nucleusWindow = Math.min(1, Math.max(0, (r - 0.06) / 0.08));
    const arms = Math.exp(-((1 - Math.cos(phase)) / 0.27)) * nucleusWindow,
      dustLane = Math.exp(-((1 - Math.cos(phase + 0.28)) / 0.1)) * nucleusWindow;
    const disk = Math.exp(-r * 3.8) / Math.cosh(y * 14) ** 2;
    const bulge = Math.exp(-Math.hypot(x, y * 0.36, z) * 17);
    const clumps = Math.max(0, (turbulence - 0.31) * 2.8);
    return [
      edge * (disk * (0.24 + 0.32 * arms) + bulge * 0.65),
      edge * disk * arms * clumps * 0.33,
      edge * disk * arms * Math.max(0, turbulence - 0.57) ** 2 * 3,
      edge * disk * dustLane * (0.9 + turbulence * 2),
    ];
  }
  const cloud =
    Math.exp(-2.6 * (x * x + y * y + z * z)) * Math.max(0, (turbulence - 0.3) * 2.5) ** 2 * edge;
  const cavity = 1 - Math.exp(-((x + 0.15) ** 2 + (y - 0.1) ** 2 + z * z) * 16);
  const filament = 0.5 + 0.5 * Math.sin(x * 9 + y * 5 + z * 3 + turbulence * 9);
  return kind === 'nebula'
    ? [cloud * 0.08, cloud * cavity * 0.32, cloud * filament * 0.8, cloud * (0.22 + cavity * 0.3)]
    : [cloud * 0.16, cloud * 0.05, cloud * 0.09, cloud * 0.95];
}
export function volumeResolution(level) {
  return [256, 192, 160, 128, 96, 64][Math.min(5, Math.max(0, level))];
}
export function volumeBytes(size) {
  return size ** 3 * 4 * (1 + 8 / 7);
} // CPU source + GPU 3D mip chain
export function makeField(kind, size) {
  const data = new Uint8Array(size ** 3 * 4);
  let i = 0;
  for (let z = 0; z < size; z++)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const d = density(
          kind,
          ((x + 0.5) / size) * 2 - 1,
          ((y + 0.5) / size) * 2 - 1,
          ((z + 0.5) / size) * 2 - 1,
        );
        // Square-root encoding retains faint low-density filaments in RGBA8.
        for (let c = 0; c < 4; c++) data[i++] = Math.round(Math.sqrt(Math.min(1, d[c])) * 255);
      }
  return data;
}
