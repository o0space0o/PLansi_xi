import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ellisRay,
  transfer,
  schwarzschild,
  schwarzschildRay,
  observerRay,
} from '../dist/relativity.js';
import { density, makeField, volumeBytes } from '../dist/volume-density.js';

test('Ellis radial light crosses, high-impact light returns, and both charts are symmetric', () => {
  const radial = ellisRay(6, Math.PI);
  assert.equal(radial.side, -1);
  assert.ok(Math.abs(radial.phi) < 1e-10);
  const reflected = ellisRay(6, Math.PI - 0.35);
  assert.equal(reflected.side, 1);
  const forward = ellisRay(6, Math.PI - 0.12),
    reverse = ellisRay(-6, 0.12);
  assert.equal(forward.side, -reverse.side);
  assert.ok(Math.abs(forward.phi - reverse.phi) < 1e-8);
  assert.ok(forward.error < 1e-6);
});
test('Ellis integration converges and conserves its null Hamiltonian near the throat', () => {
  for (const angle of [1.4, 2.4, Math.PI - 0.08, Math.PI - 0.155, Math.PI - 0.18]) {
    const coarse = ellisRay(6, angle, { accuracy: 0.035 });
    const fine = ellisRay(6, angle, { accuracy: 0.00875 });
    assert.equal(coarse.side, fine.side);
    assert.ok(Math.abs(coarse.phi - fine.phi) < 2e-5);
    assert.ok(coarse.error < 1e-6);
  }
});
test('Prepared metric table matches independent finer integration away from caustics', async () => {
  const meta = JSON.parse(await readFile('dist/assets/ellis-rays.json', 'utf8'));
  const bytes = await readFile('dist/assets/ellis-rays.bin');
  const table = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4);
  for (const [x, y] of [
    [140, 95],
    [720, 125],
    [950, 65],
    [995, 110],
  ]) {
    const l = Math.expm1((y / (meta.height - 1)) * Math.log(65));
    const ray = ellisRay(l, ((x + 0.5) / meta.width) * Math.PI, {
      boundary: meta.boundary,
      accuracy: 0.00875,
    });
    const i = (y * meta.width + x) * 4;
    assert.ok(Math.abs(table[i] - Math.cos(ray.phi)) < 1e-5);
    assert.ok(Math.abs(table[i + 1] - Math.sin(ray.phi)) < 1e-5);
    assert.equal(table[i + 2], ray.side);
  }
});
test('Beer-Lambert emission and absorption are invariant under segment subdivision', () => {
  const whole = transfer(0.4, 0.7, 5);
  let T = 1,
    L = 0;
  for (let i = 0; i < 128; i++) {
    const part = transfer(0.4, 0.7, 5 / 128);
    L += T * part.radiance;
    T *= part.transmission;
  }
  assert.ok(Math.abs(L - whole.radiance) < 1e-12);
  assert.ok(Math.abs(T - whole.transmission) < 1e-12);
  assert.equal(transfer(2, 0, 3).radiance, 6);
});
test('Moving observer rays obey relativistic aberration and Doppler directionality', () => {
  for (const beta of [-0.8, -0.04, 0, 0.04, 0.8])
    for (const angle of [-1, -0.3, 0, 0.7, 1]) {
      const mapped = observerRay(angle, beta),
        restored = observerRay(mapped.direction, -beta);
      assert.ok(Math.abs(restored.direction - angle) < 1e-12);
      assert.ok(Math.abs(mapped.frequency * restored.frequency - 1) < 1e-12);
    }
  assert.ok(observerRay(-1, -0.04).frequency > 1);
  assert.ok(observerRay(1, -0.04).frequency < 1);
  assert.throws(() => observerRay(0, 1), RangeError);
});
test('Schwarzschild null rays reproduce the critical shadow and converge in energy', () => {
  for (const b of [2, 2.55, 2.65, 4, 8]) {
    const ray = schwarzschildRay(b),
      fine = schwarzschildRay(b, { step: 0.009 });
    assert.equal(ray.captured, b < schwarzschild.shadow);
    assert.equal(ray.captured, fine.captured);
    assert.ok(fine.error < ray.error);
    assert.ok(ray.error < 0.004);
  }
});
test('Matter fields have finite support, real depth, and bounded CPU/GPU allocations', () => {
  assert.deepEqual(density('galaxy', 1, 0, 0), [0, 0, 0, 0]);
  assert.ok(density('galaxy', 0.2, 0, 0.2)[0] > density('galaxy', 0.2, 0.8, 0.2)[0] * 20);
  for (const kind of ['galaxy', 'nebula', 'gas']) {
    const field = makeField(kind, 16);
    assert.equal(field.byteLength, 16 ** 3 * 4);
    assert.ok(field.some((v) => v > 0));
    assert.ok(field.some((v) => v === 0));
  }
  assert.ok(volumeBytes(256) > 128 * 1048576 && volumeBytes(256) < 138 * 1048576);
});
test('Normal universe view has no labels, status captions, photographic destination or warp pass', async () => {
  const html = await readFile('dist/index.html', 'utf8'),
    main = await readFile('dist/main.js', 'utf8'),
    deep = await readFile('dist/deep-space.js', 'utf8');
  assert.doesNotMatch(html, /id="(?:portal-hint|deep-credits|journey-status)"/);
  assert.doesNotMatch(main, /ShaderPass|uAmount|tDiffuse/);
  assert.doesNotMatch(deep, /photograph|leviathan|nereid|ember/);
  assert.equal(schwarzschild.horizon, 1);
});
