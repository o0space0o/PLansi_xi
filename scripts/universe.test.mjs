import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AnimationClocks } from '../dist/animation.js';
import { VolumeFields, addSpaceVolumes } from '../dist/deep-space.js';
import { spaceObjects, orbitalOffset, volumeFraming } from '../dist/space-layout.js';
import { VolumeRenderPass } from '../dist/volume-renderer.js';
import { readFile } from 'node:fs/promises';

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

test('Independent clocks remain local while every object shares one universe', () => {
  const clocks = new AnimationClocks();
  clocks.advance(10, ['background', 'earth', 'kepler', 'satellite']);
  const home = clocks.daysFor('kepler');
  clocks.advance(50, ['background', 'galaxy', 'satellite']);
  assert.equal(clocks.daysFor('kepler'), home);
  assert.equal(clocks.daysFor('galaxy'), 2.5);
  assert.equal(clocks.daysFor('satellite'), 3);
});

test('Distant 3D objects share the scene and visits fit landscape and portrait views', () => {
  const fields = new VolumeFields({});
  const scene = new THREE.Scene(),
    bodies = {},
    pickable = [];
  addSpaceVolumes(scene, fields, bodies, pickable);
  assert.deepEqual(Object.keys(bodies), ['galaxy', 'nebula', 'gas']);
  assert.equal(pickable.length, 3);
  assert.equal(bodies.galaxy.group.children[1].geometry.attributes.position.count, 90000);
  for (const [id, data] of Object.entries(spaceObjects)) {
    assert.ok(new THREE.Vector3(...data.position).length() - data.radius > 900);
    assert.equal(bodies[id].surface.geometry.type, 'BoxGeometry');
    for (const [width, height] of [
      [1920, 1080],
      [900, 1600],
      [800, 800],
    ]) {
      const center = new THREE.Vector3(...data.position);
      const camera = new THREE.PerspectiveCamera(38, width / height, 0.02, 4000);
      const distance = data.radius * volumeFraming(width, height);
      camera.position
        .copy(center)
        .add(new THREE.Vector3(0.12, 0.35, 1).normalize().multiplyScalar(distance));
      camera.lookAt(center);
      camera.updateMatrixWorld();
      bodies[id].group.updateMatrixWorld(true);
      assert.ok(distance >= data.radius * 4.8);
      for (const x of [-1, 1])
        for (const y of [-1, 1])
          for (const z of [-1, 1]) {
            const projected = new THREE.Vector3(
              x * data.size[0],
              y * data.size[1],
              z * data.size[2],
            )
              .applyMatrix4(bodies[id].group.matrixWorld)
              .project(camera);
            assert.ok(
              Math.abs(projected.x) < 0.99 && Math.abs(projected.y) < 0.99,
              `${id} fits ${width}x${height}`,
            );
          }
    }
  }
});

test('Prescribed planetary orbit preserves separation throughout its inclined plane', () => {
  const orbit = {
    distance: 53,
    orbitPeriod: 612,
    phase: 2.16,
    inclination: 0.08,
  };
  const offsets = Array.from({ length: 32 }, (_, i) => orbitalOffset(orbit, (i * 612) / 32));
  assert.ok(offsets.every((point) => Math.abs(point.length() - 53) < 1e-10));
  for (const [axis, extent] of Object.entries({ x: 100, y: 8, z: 100 })) {
    assert.ok(
      Math.max(...offsets.map((p) => p[axis])) - Math.min(...offsets.map((p) => p[axis])) > extent,
    );
  }
});

test('Completed volume cache still composites live source frames and moving foreground bodies', () => {
  const fields = new VolumeFields({});
  fields.fields = { galaxy: { texture: { uuid: 'galaxy-field' } } };
  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.02, 4000);
  const scene = new THREE.Scene();
  const foreground = { position: new THREE.Vector3(1, 2, 3), radius: 4 };
  const pass = new VolumeRenderPass(scene, camera, fields, true, () => [foreground]);
  pass.setSize(1920, 1080);
  let target = null,
    color = new THREE.Color(0x123456),
    alpha = 0.7,
    volumeDraws = 0,
    composites = 0;
  const renderer = {
    autoClear: true,
    getRenderTarget: () => target,
    setRenderTarget: (next) => {
      target = next;
    },
    getClearColor: (out) => out.copy(color),
    getClearAlpha: () => alpha,
    setClearColor: (next, a) => {
      color = new THREE.Color(next);
      alpha = a;
    },
    clear: () => {},
    render: () => {
      volumeDraws++;
    },
  };
  pass.copy.render = () => {
    composites++;
  };
  const first = { texture: { uuid: 'live-first' } },
    second = { texture: { uuid: 'live-second' } };
  pass.render(renderer, {}, first);
  pass.phase = 64;
  pass.lastMove = 0;
  foreground.position.set(20, 30, 40);
  pass.render(renderer, {}, second);
  assert.equal(volumeDraws, 1);
  assert.equal(composites, 2);
  assert.equal(pass.copy.material.uniforms.uSource.value, second.texture);
  assert.deepEqual(pass.copy.material.uniforms.uBodies.value[0].toArray(), [20, 30, 40, 4]);
  assert.equal(pass.snapshot().complete, true);
  assert.equal(renderer.autoClear, true);
  assert.equal(target, null);
  assert.equal(color.getHex(), 0x123456);
  assert.equal(alpha, 0.7);
  camera.position.x = 1;
  pass.render(renderer, {}, first);
  assert.equal(volumeDraws, 2);
  assert.equal(pass.snapshot().complete, false);
  pass.dispose();
});

test('Public controls expose one universe without black-hole or wormhole actions', async () => {
  const main = await readFile(new URL('../dist/main.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(main, /UniverseJourney|cross_wormhole|createWormhole|universe-lifecycle/);
  assert.doesNotMatch(main, /blackhole|createBlackHole|SpaceRadiance|diskOrientation/);
  assert.doesNotMatch(html, /wormhole|Ellis throat|black hole/i);
  assert.throws(() => new AnimationClocks().validateTarget('blackhole'), TypeError);
  assert.match(main, /wormhole: false/);
});
