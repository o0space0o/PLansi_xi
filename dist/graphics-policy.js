// Browser-independent policy: measured performance drives quality; RAM is only
// a coarse hint. No browser API reports the amount of free GPU memory.
const MiB = 1024 * 1024;
export const graphicsLevels = [
  {
    name: 'ultra',
    textures: 'ultra',
    scale: 1,
    pixelCap: 2.5,
    samples: 4,
    bloomScale: 1,
    shadowSize: 4096,
    shadowHz: 30,
  },
  {
    name: 'high',
    textures: 'high',
    scale: 1,
    pixelCap: 2,
    samples: 4,
    bloomScale: 0.75,
    shadowSize: 2048,
    shadowHz: 30,
  },
  {
    name: 'balanced',
    textures: 'high',
    scale: 0.85,
    pixelCap: 2,
    samples: 2,
    bloomScale: 0.5,
    shadowSize: 1024,
    shadowHz: 20,
  },
  {
    name: 'efficient',
    textures: 'balanced',
    scale: 0.75,
    pixelCap: 1.5,
    samples: 0,
    bloomScale: 0.5,
    shadowSize: 1024,
    shadowHz: 15,
  },
  {
    name: 'low',
    textures: 'low',
    scale: 0.6,
    pixelCap: 1.25,
    samples: 0,
    bloomScale: 0.35,
    shadowSize: 512,
    shadowHz: 10,
  },
  {
    name: 'recovery',
    textures: 'low',
    scale: 0.45,
    pixelCap: 1.25,
    samples: 0,
    bloomScale: 0,
    shadowSize: 512,
    shadowHz: 10,
  },
];

export function memoryBudget(deviceMemory) {
  return (
    (deviceMemory >= 16
      ? 4096
      : deviceMemory >= 8
        ? 3072
        : deviceMemory >= 4
          ? 1024
          : deviceMemory >= 2
            ? 384
            : deviceMemory > 0
              ? 256
              : 1024) * MiB
  );
}

export function textureBytes(width, height, mipmaps = true) {
  // RGBA upload + mip chain + decoded source retained for context restoration.
  return width * height * 4 * (1 + (mipmaps ? 4 / 3 : 1));
}

export function renderBufferBytes(width, height, pixelRatio, profile) {
  const pixels = width * height * pixelRatio ** 2;
  // Two HDR/depth composer targets, multisample storage, canvas buffers,
  // bloom's half-resolution mip chain, spacecraft shadows, and PMREM reserve.
  return (
    pixels * (32 + 24 * profile.samples + 8 * profile.bloomScale ** 2) +
    profile.shadowSize ** 2 * 8 +
    24 * MiB
  );
}

export function renderPixelRatio(
  { width, height, nativePixelRatio, maxDimension = 16384, budget },
  profile,
) {
  const native = Number.isFinite(nativePixelRatio) && nativePixelRatio > 0 ? nativePixelRatio : 1;
  const desired = Math.min(native, profile.pixelCap) * profile.scale;
  const dimensionLimit = maxDimension / Math.max(1, width, height);
  const perPixel = 32 + 24 * profile.samples + 8 * profile.bloomScale ** 2;
  const bufferLimit = Math.sqrt((budget * 0.25) / (Math.max(1, width * height) * perPixel));
  return Math.max(Number.EPSILON, Math.min(desired, dimensionLimit, bufferLimit));
}

export class AdaptiveGraphics {
  constructor({ deviceMemory, maxTextureSize = 16384, quality = 'auto', targetFps = 60 } = {}) {
    this.enabled = quality !== 'highest';
    this.targetFps = targetFps === 30 ? 30 : 60;
    this.budget = memoryBudget(deviceMemory);
    this.minimumLevel = quality === '8k' || maxTextureSize < 16384 || !(deviceMemory >= 8) ? 1 : 0;
    this.level = this.enabled
      ? deviceMemory >= 8
        ? 1
        : deviceMemory >= 4
          ? 2
          : deviceMemory > 0
            ? deviceMemory >= 2
              ? 3
              : 4
            : 2
      : maxTextureSize >= 16384
        ? 0
        : 1;
    this.reason = this.enabled ? 'startup memory budget' : 'fixed highest quality';
    this.changes = 0;
    this.lastChange = -Infinity;
    this.upgradeAfter = 20000;
    this.slowWindows = 0;
    this.healthySince = null;
    this.metrics = { fps: null, frameMs: null, p90FrameMs: null, cpuMs: null, gpuMs: null };
    this.reset(0);
  }

  get profile() {
    const profile = graphicsLevels[this.level];
    return this.enabled ? profile : { ...profile, pixelCap: Infinity, samples: 8 };
  }

  reset(now) {
    this.samples = [];
    this.windowStart = now;
    this.warmupUntil = now + 2500;
    this.slowWindows = 0;
    this.healthySince = null;
  }

  change(level, now, reason) {
    level = Math.max(this.minimumLevel, Math.min(graphicsLevels.length - 1, level));
    if (!this.enabled || level === this.level) return false;
    if (level > this.level) this.upgradeAfter = now + 60000;
    this.level = level;
    this.reason = reason;
    this.lastChange = now;
    this.changes++;
    this.reset(now);
    return true;
  }

  constrainMemory(estimatedBytes, now) {
    if (estimatedBytes > this.budget && this.level < graphicsLevels.length - 1)
      return this.change(this.level + 1, now, 'estimated graphics memory pressure');
    return false;
  }

  record({ now, frameMs, cpuMs, gpuMs = null, transitioning = false, canUpgrade = true }) {
    if (
      !Number.isFinite(now) ||
      !Number.isFinite(frameMs) ||
      frameMs <= 0 ||
      !Number.isFinite(cpuMs) ||
      cpuMs < 0
    )
      return false;
    if (transitioning || now < this.warmupUntil) return false;
    this.samples.push({ frameMs, cpuMs, gpuMs });
    // Bound storage even with unexpected timestamps or very high refresh rates.
    if (this.samples.length > 300) this.samples.shift();
    if (now - this.windowStart < 1000 || this.samples.length < 8) return false;
    const frames = this.samples.map((sample) => sample.frameMs).sort((a, b) => a - b);
    const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const gpu = this.samples
      .map((sample) => sample.gpuMs)
      .filter((value) => Number.isFinite(value) && value >= 0);
    const frame = mean(frames),
      cpu = mean(this.samples.map((sample) => sample.cpuMs));
    const gpuTime = gpu.length ? mean(gpu) : null;
    const p90 = frames[Math.min(frames.length - 1, Math.floor(frames.length * 0.9))];
    const percentile90 = (values) =>
      values.sort((a, b) => a - b)[Math.floor((values.length - 1) * 0.9)];
    const work = Math.max(
      percentile90(this.samples.map((sample) => sample.cpuMs)),
      gpu.length ? percentile90(gpu) : 0,
    );
    // One decode/GC/scheduling stall should not trigger an emergency downgrade.
    const stableFrame = mean(frames.slice(0, -1));
    this.metrics = {
      fps: Math.round(1000 / frame),
      frameMs: frame,
      p90FrameMs: p90,
      cpuMs: cpu,
      gpuMs: gpuTime,
    };
    this.samples = [];
    this.windowStart = now;
    if (!this.enabled) return false;
    const budget = 1000 / this.targetFps;
    // A 30-Hz display or browser pacing should not lower detail when actual
    // measured CPU AND GPU work comfortably fit the requested frame budget.
    const pacingOnly = gpuTime !== null && work < budget * 0.55;
    const slow =
      !pacingOnly && (stableFrame > budget * 1.12 || p90 > budget * 1.5 || work > budget * 0.95);
    const severe = !pacingOnly && (stableFrame > budget * 1.8 || work > budget * 1.5);
    this.slowWindows = slow ? this.slowWindows + 1 : 0;
    const healthy = !slow && frame < budget * 1.08 && p90 < budget * 1.2 && work < budget * 0.65;
    if (!healthy || !canUpgrade) this.healthySince = null;
    else this.healthySince ??= now;
    if (now - this.lastChange < 4000) return false;
    if (severe || this.slowWindows >= 2)
      return this.change(
        this.level + 1,
        now,
        severe ? 'sustained heavy rendering' : 'frame budget exceeded',
      );
    if (
      canUpgrade &&
      this.healthySince !== null &&
      now - this.healthySince >= 15000 &&
      now >= this.upgradeAfter
    )
      return this.change(this.level - 1, now, 'sustained performance headroom');
    return false;
  }

  snapshot() {
    return {
      enabled: this.enabled,
      level: this.profile.name,
      targetFps: this.targetFps,
      reason: this.reason,
      changes: this.changes,
      estimatedBudgetMiB: Math.round(this.budget / MiB),
      ...this.metrics,
    };
  }
}
