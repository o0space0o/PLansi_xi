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

// Ellis null geodesic in its orbital plane, throat radius a=1, c=1.
// Hamiltonian: p_l² + b²/(1+l²)=1. RK4 is used for the reference
// calculation and the offline ray table; no screen-coordinate distortion.
export function ellisRay(l, angle, { boundary = 64, accuracy = 0.035 } = {}) {
  const b = Math.sqrt(1 + l * l) * Math.sin(angle);
  let p = Math.cos(angle),
    phi = 0,
    error = 0,
    entered = Math.abs(l) < boundary;
  const derivative = (x, v) => [v, (b * b * x) / (1 + x * x) ** 2, b / (1 + x * x)];
  for (let i = 0; i < 20000; i++) {
    if (Math.abs(l) >= boundary - 1e-10 && l * p > 0) break;
    let h = accuracy * Math.min(35, 1 + Math.abs(l));
    if (l * p > 0) h = Math.min(h, Math.max(1e-10, (boundary - Math.abs(l)) / Math.abs(p)));
    const k1 = derivative(l, p);
    const k2 = derivative(l + (h * k1[0]) / 2, p + (h * k1[1]) / 2);
    const k3 = derivative(l + (h * k2[0]) / 2, p + (h * k2[1]) / 2);
    const k4 = derivative(l + h * k3[0], p + h * k3[1]);
    entered ||= Math.abs(l) < boundary;
    l += (h * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0])) / 6;
    p += (h * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])) / 6;
    phi += (h * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])) / 6;
    error = Math.max(error, Math.abs(p * p + (b * b) / (1 + l * l) - 1));
  }
  if (entered && Math.abs(l) > boundary) {
    // Locate the finite-domain exit consistently across integration step sizes.
    phi -= (b * (Math.abs(l) - boundary)) / ((1 + boundary * boundary) * Math.abs(p));
    l = Math.sign(l) * boundary;
    p = Math.sign(p) * Math.sqrt(Math.max(0, 1 - (b * b) / (1 + l * l)));
  }
  return { l, p, phi, b, side: Math.sign(l), error };
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
