// Schwarzschild lengths in units of r_s = 2GM/c². Scene distances are stylized;
// there is no physical mass or orbital perturbation assigned to this artwork.
export const schwarzschild = Object.freeze({
  horizon: 1,
  photonOrbit: 1.5,
  shadow: Math.sqrt(27) / 2,
  isco: 3,
});
export function diskShift(radius, towardObserver) {
  if (radius < schwarzschild.isco)
    throw new RangeError('The disk starts outside the Schwarzschild ISCO.');
  const beta = Math.sqrt(1 / (2 * (radius - 1)));
  return (
    (Math.sqrt(1 - 1 / radius) * Math.sqrt(1 - beta * beta)) /
    (1 - beta * Math.max(-1, Math.min(1, towardObserver)))
  );
}
export function raySteps(level) {
  return [224, 192, 160, 128, 96, 80][Math.min(5, Math.max(0, level))];
}

export function transfer(emission, extinction, distance) {
  const transmission = Math.exp(-extinction * distance);
  return {
    transmission,
    radiance: emission * (extinction > 1e-8 ? (1 - transmission) / extinction : distance),
  };
}

// Backward viewing ray, with observer velocity beta along the radial frame.
export function observerRay(cosine, beta) {
  if (Math.abs(beta) >= 1) throw new RangeError('The observer must remain timelike.');
  const direction = (cosine - beta) / (1 - beta * cosine);
  const frequency = (1 + beta * direction) / Math.sqrt(1 - beta * beta);
  return { direction, frequency };
}

// Independent reference for the spatial Schwarzschild null orbit used by the
// GPU integrator. |v|²-b²/r³=1 and p×v=b are conserved (r_s units).
export function schwarzschildRay(impact, { step = 0.018, start = 64 } = {}) {
  let x = 0,
    z = -start,
    vx = impact / start,
    vz = Math.sqrt(1 - ((1 - 1 / start) * impact ** 2) / start ** 2),
    error = 0;
  const acceleration = (a, b) => {
    const r = Math.hypot(a, b),
      factor = (-1.5 * impact ** 2) / r ** 5;
    return [a * factor, b * factor];
  };
  for (let i = 0; i < 30000; i++) {
    const r = Math.hypot(x, z);
    if (r < 1.015) return { captured: true, error };
    if (r >= start && x * vx + z * vz > 0) return { captured: false, error };
    const h = step * Math.min(40, r),
      a = acceleration(x, z),
      nx = x + vx * h + (a[0] * h * h) / 2,
      nz = z + vz * h + (a[1] * h * h) / 2,
      na = acceleration(nx, nz);
    vx += ((a[0] + na[0]) * h) / 2;
    vz += ((a[1] + na[1]) * h) / 2;
    x = nx;
    z = nz;
    error = Math.max(error, Math.abs(vx * vx + vz * vz - impact ** 2 / Math.hypot(x, z) ** 3 - 1));
  }
  return { captured: null, error };
}
