import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// A cache of this camera's computed 3D radiance, invalidated by camera/field
// changes. Small interleaved pixel batches refine the actual volume integral.
// No photographic content is used; every refreshed pixel traces the scene.
export class VolumeRenderPass extends Pass {
  constructor(scene, camera, fields, preferHD) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.fields = fields;
    this.preferHD = preferHD;
    this.enabled = false;
    this.needsSwap = false;
    this.target = null;
    this.key = '';
    this.phase = 0;
    this.lastMove = 0;
    this.width = 1;
    this.height = 1;
    this.copy = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: { uFrame: { value: null } },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',
        fragmentShader:
          'uniform sampler2D uFrame;varying vec2 vUv;void main(){gl_FragColor=texture2D(uFrame,vUv);}',
      }),
    );
    this.clearPixels = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          uPhase: { value: 0 },
          uGrid: { value: 4 },
          uBackground: { value: new THREE.Color(0x000002) },
        },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
        fragmentShader:
          'uniform float uPhase,uGrid;uniform vec3 uBackground;void main(){float phase=mod(floor(gl_FragCoord.x),uGrid)+uGrid*mod(floor(gl_FragCoord.y),uGrid);if(abs(phase-uPhase)>.5)discard;gl_FragColor=vec4(uBackground,1);}',
      }),
    );
  }
  setSize(width, height) {
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.reset();
  }
  reset() {
    this.target?.dispose();
    this.target = null;
    this.key = '';
    this.phase = 0;
  }
  render(renderer, writeBuffer, readBuffer) {
    if (!this.target)
      this.target = new THREE.WebGLRenderTarget(this.width, this.height, {
        type: THREE.HalfFloatType,
        depthBuffer: false,
      });
    const values = [
      ...this.camera.position.toArray(),
      ...this.camera.quaternion.toArray(),
      ...this.camera.projectionMatrix.elements,
    ];
    const key =
      values.map((n) => n.toFixed(6)).join(',') +
      Object.values(this.fields.fields)
        .map((f) => f.texture.uuid)
        .join(',');
    const now = performance.now(),
      moving = key !== this.key;
    const grid = this.width * this.height >= 1800000 ? 8 : 4;
    const previous = renderer.getRenderTarget(),
      autoClear = renderer.autoClear,
      background = this.scene.background;
    renderer.autoClear = false;
    renderer.setRenderTarget(this.target);
    this.scene.background = null;
    const u = this.fields.uniforms;
    try {
      if (moving) {
        this.key = key;
        this.lastMove = now;
        this.phase = 0;
        u.uRefinePhase.value = -1;
        u.uVolumeLod.value = 2;
        u.uVolumeSteps.value = 48;
        renderer.setClearColor(background || 0x000002, 1);
        renderer.clear(true, false, false);
        renderer.render(this.scene, this.camera);
      } else if (now - this.lastMove > 160 && this.phase < grid * grid) {
        // Permuting the phase disperses updates throughout the HD image.
        const phase = (this.phase * 13) % (grid * grid);
        u.uRefineGrid.value = grid;
        u.uRefinePhase.value = phase;
        u.uVolumeLod.value = 0;
        u.uVolumeSteps.value = this.preferHD ? 192 : u.uVolumeSteps.value;
        this.clearPixels.material.uniforms.uPhase.value = phase;
        this.clearPixels.material.uniforms.uGrid.value = grid;
        this.clearPixels.render(renderer);
        renderer.render(this.scene, this.camera);
        this.phase++;
      }
      u.uRefinePhase.value = -1;
      renderer.setRenderTarget(this.renderToScreen ? null : readBuffer);
      this.copy.material.uniforms.uFrame.value = this.target.texture;
      this.copy.render(renderer);
    } finally {
      u.uRefinePhase.value = -1;
      this.scene.background = background;
      renderer.autoClear = autoClear;
      renderer.setRenderTarget(previous);
    }
    this.grid = grid;
  }
  bytes() {
    return this.target ? this.width * this.height * 8 : 0;
  }
  snapshot() {
    return {
      completedBatches: this.phase,
      refinementBatches: (this.grid || 4) ** 2,
      complete: this.phase >= (this.grid || 4) ** 2,
      depthSamples: this.preferHD ? 192 : this.fields.uniforms.uVolumeSteps.value,
      liveDepthSamples: 48,
      estimatedMiB: Math.round(this.bytes() / 1048576),
      method: 'camera-dependent 3D radiance cache; interleaved native-HD refinement',
    };
  }
  dispose() {
    this.reset();
    this.copy.material.dispose();
    this.clearPixels.material.dispose();
    this.copy.dispose();
    this.clearPixels.dispose();
  }
}
