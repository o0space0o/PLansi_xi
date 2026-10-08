import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import sharp from 'sharp';

test('Starlight modulation is registered to existing isolated photographic light', async () => {
  const metadata = JSON.parse(await readFile('dist/assets/starlight-response-source.json', 'utf8'));
  const source = await readFile(`dist/assets/${metadata.source}`);
  assert.equal(createHash('sha256').update(source).digest('hex'), metadata.sourceSha256);
  assert.ok(
    metadata.isolatedPhotographicRegions > 500 && metadata.isolatedPhotographicRegions < 5000,
    'Only isolated bright photographic regions should vary, rather than the whole granular sky.',
  );
  const photo = await sharp(source)
    .resize(metadata.width, metadata.height)
    .removeAlpha()
    .raw()
    .toBuffer();
  const response = await sharp('dist/assets/starlight-response.png').raw().toBuffer();
  let active = 0,
    luminanceSum = 0;
  for (let index = 0; index < metadata.width * metadata.height; index++) {
    if (response[index * 4] < 128) continue;
    active++;
    const offset = index * 3;
    const luminance =
      (photo[offset] * 0.2126 + photo[offset + 1] * 0.7152 + photo[offset + 2] * 0.0722) / 255;
    assert.ok(luminance > 0.12, 'Strong modulation must not occur on dark background pixels.');
    luminanceSum += luminance;
  }
  assert.ok(active > 1000 && active < metadata.width * metadata.height * 0.01);
  assert.ok(luminanceSum / active > 0.55, 'The response should follow photographed bright light.');
});

test('Every local browser-module import resolves inside the prepared application', async () => {
  const pending = ['dist/main.js'];
  const checked = new Set();
  const root = resolve('dist');
  for (let index = 0; index < pending.length; index++) {
    const path = resolve(pending[index]);
    if (checked.has(path)) continue;
    checked.add(path);
    const source = await readFile(path, 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+\.js|three)['"]/g)) {
      const specifier = match[1];
      const dependency =
        specifier === 'three'
          ? resolve(root, 'vendor/three.module.js')
          : specifier.startsWith('three/addons/')
            ? resolve(root, 'vendor/addons', specifier.slice(13))
            : resolve(dirname(path), specifier);
      assert.ok(dependency.startsWith(root), 'Browser modules must remain local.');
      pending.push(dependency);
    }
  }
  assert.ok(checked.size >= 20);
  const runtimeFiles = await readdir('dist');
  assert.ok(!runtimeFiles.includes('dust.js') && !runtimeFiles.includes('star-lights.js'));
});

test('Portable Windows runtimes match their official recorded checksums', async () => {
  const source = JSON.parse(await readFile('runtime/source.json', 'utf8'));
  for (const runtime of Object.values(source.architectures)) {
    const bytes = await readFile(`runtime/${runtime.path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), runtime.sha256);
    assert.equal(bytes.toString('ascii', 0, 2), 'MZ');
  }
});
