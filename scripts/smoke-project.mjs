import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { listMusic } from './music-server.mjs';

// Run against a standalone repository copy, without npm install or node_modules.
const root = resolve(process.argv[2] ?? '.');
const port = Number(process.argv[3] ?? 4180);
const executable =
  process.platform === 'win32'
    ? resolve(root, `runtime/win-${process.arch === 'arm64' ? 'arm64' : 'x64'}/node.exe`)
    : process.execPath;
await access(executable);
for (const file of [
  'Guide.html',
  'QUICK START.txt',
  'docs/music-player.md',
  'docs/website-guide.md',
  'docs/tutorial.md',
  'Start PLansi_xi.cmd',
]) {
  await access(resolve(root, file));
}
const child = spawn(executable, [resolve(root, 'scripts/serve.mjs'), '--port', String(port)], {
  cwd: root,
  windowsHide: true,
});
let output = '';
try {
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Server did not start: ${output}`)), 10000);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      if (output.includes('Keep this terminal open.')) {
        clearTimeout(timeout);
        resolveReady();
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited ${code}: ${output}`));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  assert.equal((await (await fetch(`${base}/api/health`)).json()).application, 'PLansi_xi');
  for (const path of [
    '/',
    '/help.html',
    '/main.js',
    '/animation.js',
    '/graphics-policy.js',
    '/graphics-textures.js',
    '/black-hole.js',
    '/deep-space.js',
    '/universe-lifecycle.js',
    '/relativity.js',
    '/wormhole.js',
    '/volume-density.js',
    '/volume-renderer.js',
    '/volume-worker.js',
    '/assets/ellis-rays.json',
    '/assets/ellis-rays.bin',
    '/gpu-timer.js',
    '/sky.js',
    '/vendor/three.module.js',
    '/assets/milky-way-photo-16k.jpg',
    '/assets/milky-way-photo-8k.jpg',
    '/assets/milky-way-photo-4k.jpg',
    '/assets/milky-way-photo-2k.jpg',
    '/assets/earth-day-2k.jpg',
    '/assets/moon-2k.jpg',
    '/assets/earth-night-2k.jpg',
    '/assets/earth-clouds-2k.jpg',
    '/assets/starlight-response-2k.png',
    '/assets/starlight-response.png',
    '/assets/models/hubble.glb',
    '/guide-screenshots/earth.jpg',
    '/guide-screenshots/aurelia.jpg',
    '/guide-screenshots/hubble.jpg',
    '/guide-screenshots/black-hole.jpg',
    '/guide-screenshots/deep-space.jpg',
    '/guide-screenshots/deep-space-oblique.jpg',
  ]) {
    const response = await fetch(base + path, { method: 'HEAD' });
    assert.equal(response.status, 200, path);
    assert.ok(Number(response.headers.get('content-length')) > 0, path);
  }
  const { tracks } = await (await fetch(`${base}/api/music`)).json();
  assert.deepEqual(tracks, await listMusic(resolve(root, 'Audio')));
  if (process.argv.includes('--no-audio'))
    assert.equal(tracks.length, 0, 'Public copy must contain no songs.');
  for (const track of tracks) {
    const response = await fetch(base + track.url, { headers: { Range: 'bytes=0-15' } });
    assert.equal(response.status, 206);
    assert.equal((await response.arrayBuffer()).byteLength, 16);
  }
  assert.equal((await fetch(`${base}/package.json`)).status, 404);
  assert.equal((await fetch(`${base}/`, { method: 'POST' })).status, 405);
  console.log(
    `Standalone PLansi_xi passed: bundled runtime, local modules/HD assets, illustrated guide, and ${tracks.length} streamed songs.`,
  );
} finally {
  child.kill();
}
