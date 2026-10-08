import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename, resolve } from 'node:path';
import { createServer } from 'node:http';
import * as THREE from 'three';
import { MusicControls } from '../dist/music-controls.js';
import { traceObstruction } from '../dist/music.js';
import { discVisibility, sunVisibility } from '../dist/shadow-lighting.js';
import { listMusic, serveMusic } from './music-server.mjs';

class Canvas extends EventTarget {
  style = {};
  clientHeight = 884;
  captured = new Set();
  setPointerCapture(id) {
    this.captured.add(id);
  }
  hasPointerCapture(id) {
    return this.captured.has(id);
  }
  releasePointerCapture(id) {
    this.captured.delete(id);
  }
}
function event(type, fields = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { pointerId: 1, button: 0, ...fields });
  return event;
}
function controls() {
  const calls = [],
    canvas = new Canvas();
  const music = {
    play: () => calls.push('play'),
    stop: () => calls.push('stop'),
    skip: (delta) => calls.push(delta === 1 ? 'next' : 'previous'),
    refreshPlaylist: () => {},
    adjustVolume: (delta) => calls.push(delta),
    reportError: (error) => {
      throw error;
    },
    getState: () => ({ playing: false }),
  };
  return { canvas, calls, mode: new MusicControls(canvas, music) };
}
test('Middle click toggles a hidden mode; ordinary scene clicks remain available', () => {
  const { canvas, calls, mode } = controls();
  const ordinary = event('pointerdown');
  canvas.dispatchEvent(ordinary);
  assert.equal(ordinary.defaultPrevented, false);
  canvas.dispatchEvent(event('pointerdown', { button: 1 }));
  assert.equal(mode.open, true);
  canvas.dispatchEvent(event('pointerup', { button: 1 }));
  assert.deepEqual(calls, []);
  canvas.dispatchEvent(event('pointerdown', { button: 1 }));
  assert.equal(mode.open, false);
});
test('Short clicks play and stop; music context menu is suppressed', () => {
  const { canvas, calls, mode } = controls();
  mode.toggle();
  canvas.dispatchEvent(event('pointerdown'));
  canvas.dispatchEvent(event('pointerup'));
  canvas.dispatchEvent(event('pointerdown', { button: 2 }));
  const context = event('contextmenu');
  canvas.dispatchEvent(context);
  canvas.dispatchEvent(event('pointerup', { button: 2 }));
  assert.deepEqual(calls, ['play', 'stop']);
  assert.equal(context.defaultPrevented, true);
  assert.equal(canvas.captured.size, 0);
});
test('Long presses change tracks without also playing or stopping', async () => {
  const { canvas, calls, mode } = controls();
  mode.toggle();
  for (const button of [0, 2]) {
    canvas.dispatchEvent(event('pointerdown', { button }));
    await new Promise((resolve) => setTimeout(resolve, 700));
    canvas.dispatchEvent(event('pointerup', { button }));
  }
  assert.deepEqual(calls, ['next', 'previous']);
  assert.equal(canvas.captured.size, 0);
});
test('Exiting music mode cancels a hold; wheel input switches only inside the mode', async () => {
  const { canvas, calls, mode } = controls();
  mode.toggle();
  const wheel = event('wheel', { deltaY: -120, deltaMode: 0 });
  canvas.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented, true);
  assert.equal(calls[0], 0.05);
  canvas.dispatchEvent(event('pointerdown'));
  mode.toggle();
  await new Promise((resolve) => setTimeout(resolve, 700));
  assert.deepEqual(calls, [0.05]);
  const outside = event('wheel', { deltaY: -120, deltaMode: 0 });
  canvas.dispatchEvent(outside);
  assert.equal(outside.defaultPrevented, false);
});
test('The Audio playlist discovers tracks, excludes directories, and streams byte ranges', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'plansi-xi-audio-test-'));
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith('plansi-xi-audio-test-'));
  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });
  const bytes = Buffer.from('0123456789abcdefghijklmnopqrstuvwxyz');
  await writeFile(join(root, 'Second song.mp3'), bytes);
  await writeFile(join(root, 'Words before sleep.wav'), bytes);
  await writeFile(join(root, 'private.txt'), 'not music');
  await mkdir(join(root, 'directory.mp3'));
  const tracks = await listMusic(root);
  assert.deepEqual(
    tracks.map((track) => track.id),
    ['Words before sleep.wav', 'Second song.mp3'],
  );
  const server = createServer((req, res) =>
    serveMusic(req, res, root, new URL(req.url, 'http://localhost').pathname).catch(() =>
      res.writeHead(500).end(),
    ),
  );
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + tracks[0].url, { headers: { Range: 'bytes=4-9' } });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get('content-range'), 'bytes 4-9/36');
  assert.equal(await response.text(), '456789');
  assert.equal(
    (await fetch(base + tracks[0].url, { headers: { Range: 'bytes=500-' } })).status,
    416,
  );
  assert.equal((await fetch(base + '/music/private.txt')).status, 404);
  assert.equal((await fetch(base + '/music/%2E%2E%2Foutside.mp3')).status, 404);
});
test('A foreground globe muffles the emitter; clear and grazing rays do not', () => {
  const body = (x, y, z, radius) => ({ group: { position: new THREE.Vector3(x, y, z) }, radius });
  const listener = new THREE.Vector3(0, 0, 0),
    source = new THREE.Vector3(10, 0, 0);
  assert.equal(traceObstruction(listener, source, { earth: body(5, 0, 0, 2) }).amount, 1);
  assert.equal(traceObstruction(listener, source, { earth: body(5, 2, 0, 2) }).amount, 0);
  assert.equal(traceObstruction(listener, source, { earth: body(-5, 0, 0, 2) }).amount, 0);
  const partial = traceObstruction(listener, source, { earth: body(5, 1.9, 0, 2) });
  assert.ok(partial.amount > 0 && partial.amount < 1);
  assert.deepEqual(partial.blockers, ['earth']);
});
test('Finite sunlight distinguishes full, partial, and annular eclipses', () => {
  assert.equal(discVisibility(0.04, 0.1, 0), 0);
  assert.equal(discVisibility(0.04, 0.1, 0.2), 1);
  assert.ok(discVisibility(0.04, 0.1, 0.1) > 0 && discVisibility(0.04, 0.1, 0.1) < 1);
  assert.ok(Math.abs(discVisibility(0.04, 0.02, 0) - 0.75) < 1e-12);
  const point = new THREE.Vector3(10, 0, 0);
  assert.equal(
    sunVisibility(point, {
      earth: { group: { position: new THREE.Vector3(-5, 0, 0) }, radius: 3 },
    }),
    1,
  );
});
