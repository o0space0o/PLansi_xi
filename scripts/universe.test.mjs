import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { UniverseJourney, releaseScene } from '../dist/universe-lifecycle.js';
import { GraphicsTextures, texturePlan } from '../dist/graphics-textures.js';
import { AnimationClocks } from '../dist/animation.js';
import { schwarzschild, diskShift, raySteps } from '../dist/relativity.js';
import { VolumeFields } from '../dist/deep-space.js';

test('Crossings dispose before loading, retain at most one environment, and coalesce input', async () => {
  let resident = 1,
    maximum = 1,
    continueCover;
  const events = [];
  const journey = new UniverseJourney({
    cover: () =>
      new Promise((resolve) => {
        continueCover = resolve;
      }),
    unload: async () => {
      events.push('dispose');
      resident = 0;
    },
    load: async (id) => {
      assert.equal(resident, 0);
      events.push(id);
      maximum = Math.max(maximum, ++resident);
    },
    reveal: async () => {},
  });
  const first = journey.travel('deep');
  assert.equal(journey.travel('deep'), first);
  continueCover();
  await first;
  assert.deepEqual(events, ['dispose', 'deep']);
  for (let i = 0; i < 8; i++) {
    const next = journey.travel(i % 2 ? 'deep' : 'home');
    continueCover();
    await next;
  }
  assert.equal(maximum, 1);
  assert.equal(journey.completed, 9);
  assert.equal(journey.phase, 'idle');
});

test('A failed destination discards partial resources and rebuilds its origin', async () => {
  const events = [];
  const journey = new UniverseJourney({
    cover: async () => {},
    unload: async () => {
      events.push('dispose');
    },
    load: async (id) => {
      events.push(id);
      if (id === 'deep') throw new Error('offline');
    },
    reveal: async () => {},
  });
  assert.deepEqual(await journey.travel('deep'), {
    active: 'home',
    recovered: true,
    error: 'offline',
  });
  assert.deepEqual(events, ['dispose', 'deep', 'dispose', 'home']);
  assert.equal(journey.phase, 'idle');
  assert.equal(journey.completed, 0);
});

test('Failed recovery stays covered and reports a terminal loading failure', async () => {
  const journey = new UniverseJourney({
    cover: async () => {},
    unload: async () => {},
    load: async () => {
      throw new Error('missing');
    },
    reveal: async () => {
      throw new Error('Must stay covered');
    },
  });
  await assert.rejects(journey.travel('deep'), /missing/);
  assert.equal(journey.phase, 'failed');
  assert.match(journey.error, /recovery/);
});

test('Scene release disposes shared resources once and preserves texture-bank ownership', () => {
  const scene = new THREE.Scene(),
    geometry = new THREE.SphereGeometry(1, 8, 4),
    owned = new THREE.Texture(),
    bankMap = new THREE.Texture();
  const material = new THREE.ShaderMaterial({
    uniforms: { owned: { value: owned }, bank: { value: bankMap } },
  });
  let geometries = 0,
    materials = 0,
    disposed = 0,
    closed = 0,
    bankDisposals = 0;
  geometry.addEventListener('dispose', () => geometries++);
  material.addEventListener('dispose', () => materials++);
  owned.addEventListener('dispose', () => disposed++);
  owned.image = { close: () => closed++ };
  bankMap.addEventListener('dispose', () => bankDisposals++);
  scene.add(new THREE.Mesh(geometry, material), new THREE.Mesh(geometry, material));
  releaseScene(scene, new Set([bankMap]));
  assert.deepEqual(
    [geometries, materials, disposed, closed, bankDisposals, scene.children.length],
    [1, 1, 1, 1, 0, 0],
  );
});

test('A pending adaptive decode cannot resurrect a texture after unloading', async () => {
  let finish,
    closed = 0,
    disposed = 0,
    replacements = 0;
  const maps = {};
  const bank = new GraphicsTextures(
    {
      capabilities: { maxTextureSize: 8192 },
      getContext: () => ({ isContextLost: () => false }),
      initTexture: () => {},
    },
    {},
    maps,
    () => replacements++,
    'home',
  );
  bank.load = () =>
    new Promise((resolve) => {
      finish = () =>
        resolve({
          image: { width: 1, height: 1, close: () => closed++ },
          dispose: () => disposed++,
        });
    });
  const decode = bank.transition('high');
  const unload = bank.dispose();
  finish();
  await Promise.all([decode, unload]);
  assert.deepEqual([closed, disposed, replacements], [1, 1, 0]);
  assert.deepEqual(maps, {});
  assert.equal(bank.tier, null);
});

test('Destination owns no photographic or planet texture allocations', () => {
  for (const tier of ['low', 'balanced', 'high', 'ultra'])
    assert.deepEqual(texturePlan(tier, 4096, 'deep'), {});
});

test('Volume pressure releases resident detail even before the reduced budget can be met', async () => {
  const context = { MAX_3D_TEXTURE_SIZE: 32883, getParameter: () => 256 };
  const fields = new VolumeFields({ getContext: () => context });
  fields.fields = Object.fromEntries(
    ['galaxy', 'nebula', 'gas'].map((id) => [id, { size: 256, texture: {} }]),
  );
  const initial = fields.bytes();
  const replacements = [];
  fields.generate = async (id, size) => {
    replacements.push({ id, size });
    fields.fields[id].size = size;
    return true;
  };
  fields.setActive(true);
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 3000);
  camera.position.set(0, 20, 125);
  camera.lookAt(0, 0, 0);
  for (let i = 0; i < 3; i++) {
    fields.update(camera, 5, 1);
    await fields.pending;
  }
  assert.equal(replacements.length, 3);
  assert.ok(fields.bytes() < initial / 20);
  assert.ok(Object.values(fields.fields).every((field) => field.size <= 64));
  // Restoration needs actual headroom for the old/new coexistence peak.
  fields.update(camera, 0, fields.bytes(), true);
  assert.equal(fields.pending, null);
  assert.equal(replacements.length, 3);
});

test('Inactive worlds retain their exact clocks while another universe runs', () => {
  const clocks = new AnimationClocks();
  clocks.advance(10, ['background', 'earth', 'kepler', 'blackhole']);
  const home = clocks.daysFor('kepler');
  clocks.advance(50, ['background', 'galaxy', 'blackhole']);
  assert.equal(clocks.daysFor('kepler'), home);
  assert.equal(clocks.daysFor('galaxy'), 2.5);
  assert.equal(clocks.daysFor('blackhole'), 3);
});

test('Schwarzschild reference lengths and Doppler asymmetry obey their physical limits', () => {
  assert.equal(schwarzschild.photonOrbit, 1.5);
  assert.ok(Math.abs(schwarzschild.shadow - 2.598076211) < 1e-8);
  assert.equal(schwarzschild.isco, 3);
  assert.throws(() => diskShift(2, 0), RangeError);
  assert.ok(diskShift(6, 1) > diskShift(6, 0));
  assert.ok(diskShift(6, -1) < diskShift(6, 0));
  assert.ok(Math.abs(diskShift(1e9, 0) - 1) < 1e-8);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(raySteps), [224, 192, 160, 128, 96, 80]);
});
