import { readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
for (const file of [
  'dist/main.js',
  'dist/animation.js',
  'dist/graphics-policy.js',
  'dist/graphics-textures.js',
  'dist/gpu-timer.js',
  'dist/black-hole.js',
  'dist/relativity.js',
  'dist/deep-space.js',
  'dist/space-layout.js',
  'dist/space-radiance.js',
  'dist/volume-density.js',
  'dist/volume-renderer.js',
  'scripts/relativity.test.mjs',
  'dist/volume-worker.js',
  'scripts/universe.test.mjs',
  'dist/shaders.js',
  'dist/shadow-lighting.js',
  'dist/sky.js',
  'dist/music.js',
  'dist/music-controls.js',
  'dist/satellite.js',
  'scripts/serve.mjs',
  'scripts/music-server.mjs',
  'scripts/vendor.mjs',
  'scripts/fetch-sky.mjs',
  'scripts/fetch-photo-sky.mjs',
  'scripts/fetch-satellite.mjs',
  'scripts/fetch-references.mjs',
  'scripts/fetch-runtime.mjs',
  'scripts/prepare-starlight.mjs',
  'scripts/build-guide.mjs',
  'scripts/sky.test.mjs',
  'scripts/animation.test.mjs',
  'scripts/graphics.test.mjs',
  'scripts/prepare-graphics.mjs',
]) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
}
const html = await readFile('dist/index.html', 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) await access(`dist${match[1]}`);
for (const [name, minimumWidth] of Object.entries({
  'earth-day': 4096,
  'earth-night-4k': 4096,
  'earth-clouds-4k': 4096,
  'earth-clouds': 8192,
  'earth-night': 8192,
  moon: 4096,
  kepler: 1700,
  'milky-way-photo-8k': 8192,
  'milky-way-photo-16k': 16384,
  'milky-way-photo-4k': 4096,
  'milky-way-photo-2k': 2048,
  'earth-day-2k': 2048,
  'earth-night-2k': 2048,
  'earth-clouds-2k': 2048,
  'moon-2k': 2048,
})) {
  const image = await sharp(`dist/assets/${name}.jpg`).metadata();
  if (image.width < minimumWidth || image.width !== image.height * 2)
    throw new Error(`Invalid ${name} texture dimensions.`);
  console.log(`${name}: ${image.width} × ${image.height}`);
}
await access('dist/vendor/three.module.js');
const response = await sharp('dist/assets/starlight-response.png').metadata();
if (response.width !== 4096 || response.height !== 2048)
  throw new Error('Invalid starlight response map.');
const smallResponse = await sharp('dist/assets/starlight-response-2k.png').metadata();
if (smallResponse.width !== 2048 || smallResponse.height !== 1024)
  throw new Error('Invalid adaptive starlight response map.');
await access('dist/vendor/three.core.js');
await access('dist/vendor/addons/controls/TrackballControls.js');
await access('dist/vendor/addons/loaders/GLTFLoader.js');
const model = await readFile('dist/assets/models/hubble.glb');
if (model.toString('ascii', 0, 4) !== 'glTF') throw new Error('Invalid spacecraft model.');
const data = JSON.parse(model.toString('utf8', 20, 20 + model.readUInt32LE(12)));
if (!data.meshes?.length || !data.images?.length)
  throw new Error('The spacecraft model has no geometry or textures.');
console.log(`Hubble: ${data.meshes.length} meshes, ${data.images.length} embedded textures`);
console.log('Local files, texture dimensions, and JavaScript syntax passed.');
