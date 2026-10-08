import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AdaptiveGraphics,
  graphicsLevels,
  memoryBudget,
  renderPixelRatio,
  renderBufferBytes,
} from '../dist/graphics-policy.js';
import { GraphicsTextures, texturePlan, planBytes } from '../dist/graphics-textures.js';
import { GpuTimer } from '../dist/gpu-timer.js';

function run(policy, start, seconds, { frameMs = 16.67, cpuMs = 3, gpuMs = 5, ...options } = {}) {
  const changes = [];
  for (let now = start; now < start + seconds * 1000; now += frameMs)
    if (policy.record({ now, frameMs, cpuMs, gpuMs, ...options }))
      changes.push({ level: policy.level, now });
  return changes;
}

test('Adaptive graphics responds to sustained GPU pressure and recovers slowly', () => {
  const policy = new AdaptiveGraphics({ deviceMemory: 8 });
  const drops = run(policy, 0, 13, { frameMs: 40, gpuMs: 35 });
  assert.ok(drops.length >= 2);
  assert.ok(drops.every((drop, index) => index === 0 || drop.now - drops[index - 1].now >= 4000));
  const low = policy.level;
  assert.equal(run(policy, 13000, 25).length, 0, 'Quality must not bounce back immediately.');
  const upgrades = run(policy, 38000, 55);
  assert.ok(upgrades.length > 0);
  assert.ok(policy.level < low);
});

test('A single stall, background reset, and asset uploads do not lower quality', () => {
  const policy = new AdaptiveGraphics({ deviceMemory: 8 });
  run(policy, 0, 5);
  policy.record({ now: 5500, frameMs: 500, cpuMs: 400, gpuMs: 5 });
  run(policy, 5517, 5);
  assert.equal(policy.level, 1);
  policy.reset(60000);
  run(policy, 60000, 5, { frameMs: 50, cpuMs: 40, transitioning: true });
  assert.equal(policy.level, 1);
});

test('Memory budgets, unavailable hints, and explicit quality choices remain bounded', () => {
  const low = new AdaptiveGraphics({ deviceMemory: 1 });
  assert.equal(low.profile.textures, 'low');
  assert.equal(new AdaptiveGraphics().level, 2);
  assert.equal(new AdaptiveGraphics({ deviceMemory: 8, quality: '8k' }).minimumLevel, 1);
  assert.equal(new AdaptiveGraphics({ deviceMemory: 8, maxTextureSize: 8192 }).minimumLevel, 1);
  assert.equal(low.constrainMemory(memoryBudget(1) * 2, 5000), true);
  assert.equal(low.level, 5);
  assert.equal(low.constrainMemory(memoryBudget(1) * 2, 6000), false);
  const highest = new AdaptiveGraphics({ quality: 'highest', deviceMemory: 32 });
  assert.equal(highest.level, 0);
  assert.equal(highest.enabled, true);
  assert.equal(highest.constrainMemory(Infinity, 5000), true);
  run(highest, 5000, 20, { frameMs: 50, gpuMs: 40 });
  assert.equal(highest.profile.scale, 1);
  assert.ok(highest.level > 1);
});

test('Browser pacing is distinguished from measured slow work, with a timing fallback', () => {
  const paced = new AdaptiveGraphics({ deviceMemory: 8 });
  run(paced, 0, 10, { frameMs: 33.33, cpuMs: 2, gpuMs: 4 });
  assert.equal(paced.level, 1);
  const unsupported = new AdaptiveGraphics({ deviceMemory: 8 });
  run(unsupported, 0, 10, { frameMs: 33.33, cpuMs: 2, gpuMs: null });
  assert.ok(unsupported.level > 1);
  const cpuBound = new AdaptiveGraphics({ deviceMemory: 8 });
  run(cpuBound, 0, 10, { frameMs: 25, cpuMs: 20, gpuMs: 4 });
  assert.ok(cpuBound.level > 1);
  const thirty = new AdaptiveGraphics({ deviceMemory: 8, targetFps: 30 });
  run(thirty, 0, 10, { frameMs: 33.33, cpuMs: 10, gpuMs: 20 });
  assert.equal(thirty.level, 1);
});

test('Resolution follows DPR, GPU dimensions, memory budget, and the active profile', () => {
  const viewport = {
    width: 1920,
    height: 1080,
    nativePixelRatio: 3,
    maxDimension: 16384,
    budget: memoryBudget(8),
  };
  const high = renderPixelRatio(viewport, graphicsLevels[1]);
  const low = renderPixelRatio(viewport, graphicsLevels[4]);
  assert.ok(low < high && high <= 2);
  assert.ok(
    renderPixelRatio({ ...viewport, maxDimension: 1024 }, graphicsLevels[1]) * viewport.width <=
      1024,
  );
  assert.ok(
    renderBufferBytes(1920, 1080, low, graphicsLevels[4]) <
      renderBufferBytes(1920, 1080, high, graphicsLevels[1]),
  );
});

test('Texture plans honor GPU limits, and small prepared images cut decoded/GPU memory', () => {
  for (const tier of ['ultra', 'high', 'balanced', 'low'])
    for (const [, width] of Object.values(texturePlan(tier, 4096))) assert.ok(width <= 4096);
  assert.equal(texturePlan('high', 16384).sky[1], 8192);
  assert.equal(texturePlan('balanced', 16384).sky[1], 4096);
  assert.ok(planBytes('low', 16384) < planBytes('ultra', 16384) / 10);
});

function fakeTexture(width = 8192, height = 4096) {
  return {
    image: {
      width,
      height,
      closed: false,
      close() {
        this.closed = true;
      },
    },
    generateMipmaps: true,
    disposed: false,
    dispose() {
      this.disposed = true;
    },
  };
}

test('Texture replacement keeps old images until upload and then releases their memory', async () => {
  const previous = fakeTexture();
  const maps = { sky: previous };
  const events = [];
  const bank = new GraphicsTextures(
    {
      capabilities: { maxTextureSize: 16384 },
      getContext: () => ({ isContextLost: () => false }),
      initTexture(next) {
        if (!events.length) assert.equal(previous.disposed, false);
        events.push('upload');
        assert.notEqual(next, previous);
      },
    },
    {},
    maps,
    (name, next, old) => {
      events.push('replace');
      if (name === 'sky') {
        assert.equal(old, previous);
        assert.equal(maps.sky, next);
      }
    },
  );
  bank.files.sky = 'milky-way-photo-8k.jpg';
  bank.tier = 'high';
  bank.load = async () => fakeTexture(2048, 1024);
  await bank.transition('low');
  assert.deepEqual(events.slice(0, 2), ['upload', 'replace']);
  assert.equal(previous.disposed, true);
  assert.equal(previous.image.closed, true);
  assert.equal(bank.busy, false);
  assert.equal(bank.tier, 'low');
});

test('Cancelled texture decodes are discarded without replacing the visible image', async () => {
  const previous = fakeTexture(),
    next = fakeTexture(2048, 1024);
  let finish;
  const bank = new GraphicsTextures(
    { capabilities: { maxTextureSize: 16384 }, getContext: () => ({ isContextLost: () => false }) },
    {},
    { sky: previous },
    () => assert.fail('Cancelled upload cannot replace the image.'),
  );
  bank.files.sky = 'milky-way-photo-8k.jpg';
  bank.load = () =>
    new Promise((resolve) => {
      finish = resolve;
    });
  const pending = bank.transition('low');
  bank.cancel();
  finish(next);
  await pending;
  assert.equal(next.disposed, true);
  assert.equal(next.image.closed, true);
  assert.equal(previous.disposed, false);
  assert.equal(bank.busy, false);
});

test('GPU timing polls asynchronously, bounds queries, and discards disjoint results', () => {
  let available = false,
    disjoint = false,
    created = 0;
  const removed = [];
  const gl = {
    QUERY_RESULT_AVAILABLE: 1,
    QUERY_RESULT: 2,
    getExtension: () => ({ TIME_ELAPSED_EXT: 3, GPU_DISJOINT_EXT: 4 }),
    isContextLost: () => false,
    getParameter: () => disjoint,
    getQueryParameter: (_, parameter) => (parameter === 1 ? available : 12000000),
    createQuery: () => ({ id: ++created }),
    beginQuery() {},
    endQuery() {},
    deleteQuery(query) {
      removed.push(query);
    },
  };
  const timer = new GpuTimer(gl);
  for (let frame = 0; frame < 100; frame++) {
    timer.begin(frame * 17);
    timer.end();
  }
  assert.equal(created, 4);
  available = true;
  timer.begin(2000);
  timer.end();
  assert.equal(timer.value(2000), 12);
  assert.equal(timer.value(5000), null);
  available = false;
  for (let frame = 0; frame < 6; frame++) {
    timer.begin(2100 + frame * 17);
    timer.end();
  }
  disjoint = true;
  timer.begin(2300);
  assert.equal(timer.pending.length, 0);
  assert.equal(timer.lastMs, null);
  assert.equal(removed.length, created);
  const unsupported = new GpuTimer({ getExtension: () => null });
  unsupported.begin(0);
  unsupported.end();
  assert.equal(unsupported.value(0), null);
});
