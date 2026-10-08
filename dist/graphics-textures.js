import * as THREE from 'three';
import { textureBytes } from './graphics-policy.js';

const variants = {
  sky: [
    ['milky-way-photo-2k.jpg', 2048, 1024],
    ['milky-way-photo-4k.jpg', 4096, 2048],
    ['milky-way-photo-8k.jpg', 8192, 4096],
    ['milky-way-photo-16k.jpg', 16384, 8192],
  ],
  earth: [
    ['earth-day-2k.jpg', 2048, 1024],
    ['earth-day.jpg', 5400, 2700],
  ],
  moon: [
    ['moon-2k.jpg', 2048, 1024],
    ['moon.jpg', 4096, 2048],
  ],
  night: [
    ['earth-night-2k.jpg', 2048, 1024],
    ['earth-night-4k.jpg', 4096, 2048],
    ['earth-night.jpg', 8192, 4096],
  ],
  clouds: [
    ['earth-clouds-2k.jpg', 2048, 1024],
    ['earth-clouds-4k.jpg', 4096, 2048],
    ['earth-clouds.jpg', 8192, 4096],
  ],
  starlightResponse: [
    ['starlight-response-2k.png', 2048, 1024],
    ['starlight-response.png', 4096, 2048],
  ],
};
const limits = { ultra: 16384, high: 8192, balanced: 4096, low: 2048 };
const colorMaps = new Set(['sky', 'earth', 'moon', 'night', 'kepler']);

export function texturePlan(tier, maxTextureSize, environment = 'home') {
  const limit = Math.min(limits[tier], maxTextureSize);
  if (environment === 'deep') return {};
  return Object.fromEntries(
    Object.entries(variants).map(([name, choices]) => {
      const desired =
        name === 'sky'
          ? limit
          : tier === 'ultra'
            ? limit
            : tier === 'high'
              ? Math.min(limit, name === 'earth' ? 5400 : 4096)
              : 2048;
      return [name, choices.filter(([, width]) => width <= desired).at(-1) ?? choices[0]];
    }),
  );
}

export function planBytes(tier, maxTextureSize) {
  return Object.values(texturePlan(tier, maxTextureSize)).reduce(
    (sum, [, width, height]) => sum + textureBytes(width, height),
    0,
  );
}

export function disposeTexture(texture) {
  if (!texture) return;
  texture.dispose();
  texture.image?.close?.();
}

export class GraphicsTextures {
  constructor(renderer, manager, maps, onReplace, environment = 'home') {
    this.renderer = renderer;
    this.manager = manager;
    this.maps = maps;
    this.onReplace = onReplace;
    this.environment = environment;
    this.pending = null;
    this.files = {};
    this.tier = null;
    this.busy = false;
    this.error = null;
    this.generation = 0;
    this.controller = null;
  }

  async load(name, file, signal) {
    const path = `/assets/${file}`;
    let texture;
    if (typeof createImageBitmap === 'function') {
      this.manager.itemStart(path);
      try {
        const response = await fetch(path, { signal });
        if (!response.ok) throw new Error(`Texture HTTP ${response.status}: ${file}`);
        const image = await createImageBitmap(await response.blob(), {
          imageOrientation: 'flipY',
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        });
        if (signal?.aborted) {
          image.close();
          throw new DOMException('Aborted', 'AbortError');
        }
        texture = new THREE.Texture(image);
        texture.flipY = false;
      } finally {
        this.manager.itemEnd(path);
      }
    } else texture = await new THREE.TextureLoader(this.manager).loadAsync(path);
    texture.colorSpace = colorMaps.has(name) ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.wrapS = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
  }

  async initialize(tier, onProgress = () => {}) {
    this.controller = new AbortController();
    const generation = this.generation;
    const plan = texturePlan(tier, this.renderer.capabilities.maxTextureSize, this.environment);
    const initial = [
      ...Object.entries(plan).map(([name, [file]]) => [name, file]),
      ...Object.entries(
        this.environment === 'deep'
          ? {}
          : {
              normal: 'earth-bump.jpg',
              specular: 'earth-specular.jpg',
              moonHeight: 'moon-height.jpg',
              kepler: 'kepler.jpg',
            },
      ),
    ];
    // Serial decodes keep startup peak memory bounded, especially for 16K.
    let loaded = 0;
    for (const [name, file] of initial) {
      const next = await this.load(name, file, this.controller.signal);
      if (generation !== this.generation) {
        disposeTexture(next);
        throw new DOMException('Aborted', 'AbortError');
      }
      this.maps[name] = next;
      this.files[name] = file;
      // Upload one image per animation opportunity to bound startup peaks.
      if (typeof requestAnimationFrame === 'function')
        await new Promise((resolve) => requestAnimationFrame(resolve));
      if (generation !== this.generation) throw new DOMException('Aborted', 'AbortError');
      this.renderer.initTexture?.(next);
      onProgress(++loaded, initial.length);
    }
    this.tier = tier;
    this.controller = null;
  }

  bytes() {
    return Object.values(this.maps).reduce(
      (sum, texture) =>
        sum + textureBytes(texture.image.width, texture.image.height, texture.generateMipmaps),
      0,
    );
  }

  peakBytes(tier) {
    const plan = texturePlan(tier, this.renderer.capabilities.maxTextureSize, this.environment);
    let current = this.bytes(),
      peak = current;
    for (const [name, [file, width, height]] of Object.entries(plan)) {
      if (this.files[name] === file) continue;
      const next = textureBytes(width, height);
      peak = Math.max(peak, current + next);
      const previous = this.maps[name];
      current +=
        next -
        (previous
          ? textureBytes(previous.image.width, previous.image.height, previous.generateMipmaps)
          : 0);
    }
    return peak;
  }

  transition(tier) {
    if (this.pending) return this.pending;
    this.pending = this.runTransition(tier).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  async runTransition(tier) {
    if (this.busy || this.tier === tier) return;
    this.busy = true;
    this.error = null;
    const generation = this.generation;
    this.controller = new AbortController();
    try {
      for (const [name, [file]] of Object.entries(
        texturePlan(tier, this.renderer.capabilities.maxTextureSize, this.environment),
      )) {
        if (this.files[name] === file) continue;
        const next = await this.load(name, file, this.controller.signal);
        if (generation !== this.generation || this.renderer.getContext().isContextLost()) {
          disposeTexture(next);
          return;
        }
        // Yield decoded work before the unavoidable GPU upload. New sources
        // replace old uniforms only after upload, so the sky never goes blank.
        try {
          if (globalThis.scheduler?.postTask)
            await scheduler.postTask(() => {}, {
              priority: 'background',
              signal: this.controller.signal,
            });
          else await new Promise((resolve) => setTimeout(resolve, 0));
        } catch (error) {
          disposeTexture(next);
          throw error;
        }
        if (generation !== this.generation) {
          disposeTexture(next);
          return;
        }
        try {
          this.renderer.initTexture(next);
        } catch (error) {
          disposeTexture(next);
          throw error;
        }
        const previous = this.maps[name];
        this.maps[name] = next;
        this.files[name] = file;
        this.onReplace(name, next, previous);
        disposeTexture(previous);
      }
      this.tier = tier;
    } catch (error) {
      if (error.name !== 'AbortError') {
        this.error = error.message;
        console.warn('Adaptive textures kept their last available images:', error.message);
      }
    } finally {
      this.busy = false;
      this.controller = null;
    }
  }

  cancel() {
    this.generation++;
    this.controller?.abort();
  }

  async dispose() {
    this.cancel();
    await this.pending;
    for (const [name, texture] of Object.entries(this.maps)) {
      disposeTexture(texture);
      delete this.maps[name];
    }
    this.files = {};
    this.tier = null;
    this.controller = null;
  }
}
