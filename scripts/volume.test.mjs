import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transfer, density, makeField, volumeBytes } from '../dist/volume-density.js';

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
});
