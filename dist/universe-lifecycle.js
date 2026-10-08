// Scene ownership is exclusive: the loading callback only runs after disposal.
// The metric ray renderer and bounded matter caches remain available while
// neither large environment is resident; the camera pauses at l=0 if needed.
export class UniverseJourney {
  constructor({ active = 'home', cover, unload, load, reveal, onPhase = () => {} }) {
    Object.assign(this, { active, cover, unload, load, reveal, onPhase });
    this.phase = 'idle';
    this.pending = null;
    this.error = null;
    this.completed = 0;
  }

  setPhase(phase) {
    this.phase = phase;
    this.onPhase(phase);
  }

  travel(destination) {
    if (this.pending) return this.pending;
    if (destination === this.active) return Promise.resolve({ active: this.active });
    this.pending = this.run(destination).finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  async run(destination) {
    const origin = this.active;
    this.error = null;
    this.setPhase('entering');
    try {
      await this.cover();
      this.setPhase('unloading');
      await this.unload();
      this.setPhase('loading');
      await this.load(destination);
      this.active = destination;
      this.setPhase('arriving');
      await this.reveal();
      this.completed++;
      this.setPhase('idle');
      return { active: this.active };
    } catch (error) {
      this.error = error.message;
      // Rebuild the origin from its saved clock and camera state. No retained
      // scene is used for rollback, so recovery also respects the memory limit.
      this.setPhase('recovering');
      try {
        await this.unload();
        await this.load(origin, true);
        this.active = origin;
        await this.reveal();
        this.setPhase('idle');
        return { active: origin, recovered: true, error: this.error };
      } catch (recoveryError) {
        this.error += `; recovery: ${recoveryError.message}`;
        this.setPhase('failed');
        throw recoveryError;
      }
    }
  }

  get busy() {
    return this.phase !== 'idle';
  }
  snapshot() {
    return { active: this.active, phase: this.phase, completed: this.completed, error: this.error };
  }
}

// A Set prevents shared textures/materials being disposed more than once.
// Bitmap.close releases decoded CPU pixels as well as the GPU allocation.
export function releaseScene(scene, externalTextures = new Set()) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set(),
    shadows = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.shadow) shadows.add(object.shadow);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      for (const uniform of Object.values(material.uniforms || {}))
        if (uniform.value?.isTexture) textures.add(uniform.value);
    }
  });
  for (const texture of textures) {
    if (externalTextures.has(texture) || texture === scene.environment) continue;
    texture.dispose();
    texture.image?.close?.();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const shadow of shadows) shadow.dispose();
  scene.environment = null;
  scene.clear();
  return { geometries: geometries.size, materials: materials.size, textures: textures.size };
}
