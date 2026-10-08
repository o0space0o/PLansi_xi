import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

// A cache of this camera's computed 3D radiance, invalidated by camera/field
// changes. Small interleaved pixel batches refine the actual volume integral.
// Only static matter is cached; planets, sky, music and the black hole remain
// live. Foreground silhouettes mask the independently composed volume light.
export class VolumeRenderPass extends Pass {
  constructor(scene, camera, fields, preferHD, foregroundBodies = () => []) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.fields = fields;
    this.preferHD = preferHD;
    this.foregroundBodies = foregroundBodies;
    this.enabled = true;
    this.needsSwap = true;
    this.target = null;
    this.key = '';
    this.phase = 0;
    this.lastMove = 0;
    this.width = 1;
    this.height = 1;
    this.copy = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          uFrame: { value: null },
          uSource: { value: null },
          uCameraWorld: { value: camera.matrixWorld },
          uInverseProjection: { value: camera.projectionMatrixInverse },
          uFieldFrame: {
            value: ['galaxy', 'nebula', 'gas'].map(
              (id) => fields.uniforms[`u${id[0].toUpperCase() + id.slice(1)}Frame`].value,
            ),
          },
          uBodies: { value: Array.from({ length: 8 }, () => new THREE.Vector4()) },
          uBodyCount: { value: 0 },
        },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0,1);}',
        fragmentShader: `
uniform sampler2D uFrame,uSource;uniform mat4 uCameraWorld,uInverseProjection,uFieldFrame[3];
uniform vec4 uBodies[8];uniform int uBodyCount;varying vec2 vUv;
float entryDistance(mat4 frame,vec3 origin,vec3 direction){
 vec3 ro=(frame*vec4(origin,1.0)).xyz,rd=(frame*vec4(direction,0.0)).xyz;
 vec3 safe=sign(rd)*max(abs(rd),vec3(1e-7))+vec3(equal(rd,vec3(0.0)))*1e-7;
 vec3 a=(-vec3(1)-ro)/safe,b=(vec3(1)-ro)/safe,lo=min(a,b),hi=max(a,b);
 float first=max(0.0,max(lo.x,max(lo.y,lo.z))),last=min(hi.x,min(hi.y,hi.z));
 return last>first?first:1e8;
}
void main(){
 vec4 base=texture2D(uSource,vUv),light=texture2D(uFrame,vUv);
 if(max(light.r,max(light.g,light.b))+light.a>1e-6){
  vec4 view=uInverseProjection*vec4(vUv*2.0-1.0,1,1);
  vec3 direction=normalize(mat3(uCameraWorld)*(view.xyz/view.w)),origin=uCameraWorld[3].xyz;
  float first=1e8;for(int i=0;i<3;i++)first=min(first,entryDistance(uFieldFrame[i],origin,direction));
  for(int i=0;i<8;i++){
   if(i>=uBodyCount)break;vec3 relative=origin-uBodies[i].xyz;float b=dot(relative,direction);
   float disc=b*b-dot(relative,relative)+uBodies[i].w*uBodies[i].w;
   if(disc>0.0){float hit=-b-sqrt(disc);if(hit>0.0&&hit<first){light=vec4(0);break;}}
  }
 }
 gl_FragColor=vec4(light.rgb+base.rgb*(1.0-light.a),base.a);
}`,
      }),
    );
    this.clearPixels = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: {
          uPhase: { value: 0 },
          uGrid: { value: 4 },
        },
        depthTest: false,
        depthWrite: false,
        toneMapped: false,
        vertexShader: 'void main(){gl_Position=vec4(position.xy,0,1);}',
        fragmentShader:
          'uniform float uPhase,uGrid;void main(){float phase=mod(floor(gl_FragCoord.x),uGrid)+uGrid*mod(floor(gl_FragCoord.y),uGrid);if(abs(phase-uPhase)>.5)discard;gl_FragColor=vec4(0);}',
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
      background = this.scene.background,
      clearColor = renderer.getClearColor(new THREE.Color()),
      clearAlpha = renderer.getClearAlpha();
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
        renderer.setClearColor(0, 0);
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
      renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
      this.copy.material.uniforms.uFrame.value = this.target.texture;
      this.copy.material.uniforms.uSource.value = readBuffer.texture;
      const foreground = this.foregroundBodies().slice(0, 8);
      this.copy.material.uniforms.uBodyCount.value = foreground.length;
      foreground.forEach((body, i) =>
        this.copy.material.uniforms.uBodies.value[i].set(
          body.position.x,
          body.position.y,
          body.position.z,
          body.radius,
        ),
      );
      this.copy.render(renderer);
    } finally {
      u.uRefinePhase.value = -1;
      this.scene.background = background;
      renderer.autoClear = autoClear;
      renderer.setClearColor(clearColor, clearAlpha);
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
