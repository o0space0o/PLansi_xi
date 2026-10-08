import * as THREE from 'three';
import { volumeResolution, volumeBytes } from './volume-density.js';

export const deepWorlds = {
  galaxy: {
    name: 'Spiral galaxy',
    radius: 55,
    position: [-25, 6, -135],
    size: [55, 14, 55],
    rotation: [0.68, 0.12, -0.2],
  },
  nebula: {
    name: 'Ionized nebula',
    radius: 34,
    position: [67, -12, -85],
    size: [34, 29, 27],
    rotation: [0.2, -0.3, 0.4],
  },
  gas: {
    name: 'Molecular cloud',
    radius: 33,
    position: [-82, 23, -75],
    size: [28, 34, 25],
    rotation: [-0.3, 0.2, 0.1],
  },
  wormhole: { name: 'Ellis throat', radius: 1.4, position: [0, 0, 0] },
};

// The same world-space transfer function is used for ordinary and curved rays.
export const volumeGLSL = `
precision highp sampler3D;
uniform sampler3D uGalaxyField,uNebulaField,uGasField;
uniform mat4 uGalaxyFrame,uNebulaFrame,uGasFrame;
uniform int uVolumeSteps;
uniform float uVolumeLod,uRefinePhase,uRefineGrid;
void refinementMask(){if(uRefinePhase>=0.0){float phase=mod(floor(gl_FragCoord.x),uRefineGrid)+uRefineGrid*mod(floor(gl_FragCoord.y),uRefineGrid);if(abs(phase-uRefinePhase)>.5)discard;}}
vec2 boxInterval(vec3 ro,vec3 rd) {
  vec3 safe=sign(rd)*max(abs(rd),vec3(1e-7));
  safe+=vec3(equal(rd,vec3(0.0)))*1e-7;
  vec3 a=(-vec3(1.0)-ro)/safe,b=(vec3(1.0)-ro)/safe;
  vec3 lo=min(a,b),hi=max(a,b);
  return vec2(max(0.0,max(lo.x,max(lo.y,lo.z))),min(hi.x,min(hi.y,hi.z)));
}
vec4 integrateField(sampler3D field,mat4 frame,vec3 origin,vec3 direction,int kind,int steps) {
  vec3 ro=(frame*vec4(origin,1.0)).xyz,rd=(frame*vec4(direction,0.0)).xyz;
  vec2 interval=boxInterval(ro,rd);
  if(interval.y<=interval.x) return vec4(0.0);
  float h=(interval.y-interval.x)/float(steps),localH=h*length(rd);
  float lod=min(uVolumeLod,max(0.0,log2(float(textureSize(field,0).x)/64.0)));
  vec3 radiance=vec3(0.0),T=vec3(1.0);
  for(int i=0;i<192;i++) {
    if(i>=steps || max(T.r,max(T.g,T.b))<.005) break;
    vec3 uv=(ro+rd*(interval.x+(float(i)+.5)*h))*.5+.5;
    vec4 d=textureLod(field,uv,lod);d*=d;
    vec3 sigma=d.a*vec3(5.8,8.0,11.0);
    vec3 j=kind==0 ? d.r*vec3(1.35,1.15,.83)+d.g*vec3(.5,.85,1.6)+d.b*vec3(1.8,.22,.4)
      : kind==1 ? d.r*vec3(.65,.8,1.25)+d.g*vec3(.13,.7,.65)+d.b*vec3(1.8,.12,.24)
      : d.r*vec3(.5,.64,.95)+d.b*vec3(.16,.04,.03);
    j*=kind==0 ? 6.5 : 3.5;
    vec3 attenuation=exp(-sigma*localH);
    vec3 integral=mix(vec3(localH),(vec3(1.0)-attenuation)/max(sigma,vec3(1e-6)),step(vec3(1e-5),sigma));
    radiance+=T*j*integral;
    T*=attenuation;
  }
  return vec4(radiance,1.0-dot(T,vec3(.2126,.7152,.0722)));
}
vec3 deepRadiance(vec3 origin,vec3 direction) {
  vec4 a=integrateField(uGalaxyField,uGalaxyFrame,origin,direction,0,uVolumeSteps);
  vec4 b=integrateField(uNebulaField,uNebulaFrame,origin,direction,1,uVolumeSteps);
  vec4 c=integrateField(uGasField,uGasFrame,origin,direction,2,uVolumeSteps);
  return a.rgb+b.rgb+c.rgb;
}`;

function textureFrom(data, size) {
  const texture = new THREE.Data3DTexture(data, size, size, size);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.unpackAlignment = 1;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

export class VolumeFields {
  constructor(renderer) {
    this.renderer = renderer;
    this.fields = {};
    this.worker = null;
    this.pending = null;
    this.token = 0;
    this.cancelJob = null;
    this.error = null;
    this.active = false;
    this.uniforms = {
      uVolumeSteps: { value: 128 },
      uVolumeLod: { value: 0 },
      uRefinePhase: { value: -1 },
      uRefineGrid: { value: 4 },
    };
    for (const [id, data] of Object.entries(deepWorlds)) {
      if (!data.size) continue;
      const frame = new THREE.Matrix4().compose(
        new THREE.Vector3(...data.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...data.rotation)),
        new THREE.Vector3(...data.size),
      );
      this.uniforms[`u${id[0].toUpperCase() + id.slice(1)}Frame`] = { value: frame.invert() };
      this.uniforms[`u${id[0].toUpperCase() + id.slice(1)}Field`] = { value: null };
    }
  }
  async initialize() {
    for (const id of ['galaxy', 'nebula', 'gas']) await this.generate(id, 48);
  }
  generate(id, size) {
    const token = ++this.token;
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./volume-worker.js', import.meta.url), { type: 'module' });
      this.worker = worker;
      this.pendingSize = size;
      const finish = () => {
        worker.terminate();
        if (this.worker === worker) {
          this.worker = null;
          this.cancelJob = null;
          this.pendingSize = 0;
        }
      };
      this.cancelJob = () => {
        finish();
        resolve(false);
      };
      worker.onerror = (event) => {
        finish();
        this.error = event.message;
        reject(new Error(event.message));
      };
      worker.onmessage = ({ data }) => {
        finish();
        if (data.token !== this.token) {
          resolve(false);
          return;
        }
        const next = textureFrom(data.field, size);
        if (this.renderer.getContext().isContextLost()) {
          next.dispose();
          resolve(false);
          return;
        }
        try {
          this.renderer.initTexture(next);
        } catch (error) {
          next.dispose();
          this.error = error.message;
          reject(error);
          return;
        }
        const previous = this.fields[id];
        this.fields[id] = { texture: next, size };
        this.uniforms[`u${id[0].toUpperCase() + id.slice(1)}Field`].value = next;
        previous?.texture.dispose();
        if (previous) previous.texture.image.data = null;
        resolve(true);
      };
      worker.postMessage({ kind: id, size, token });
    });
  }
  cancel() {
    this.token++;
    this.cancelJob?.();
  }
  setActive(active) {
    this.active = active;
    if (!active) this.cancel();
  }
  update(camera, level, budget, preferHD = false) {
    this.uniforms.uVolumeSteps.value = [192, 160, 128, 104, 80, 56][level];
    if (!this.active || this.pending || this.worker || this.error) return;
    camera.updateMatrixWorld();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );
    const plans = ['galaxy', 'nebula', 'gas']
      .map((id) => {
        const d = deepWorlds[id],
          center = new THREE.Vector3(...d.position);
        const visible = frustum.intersectsSphere(new THREE.Sphere(center, d.radius));
        const angularSize = d.radius / Math.max(1, camera.position.distanceTo(center));
        let size = visible
          ? Math.min(
              preferHD ? 256 : volumeResolution(level),
              angularSize > 0.28 ? 256 : angularSize > 0.1 ? 128 : 64,
            )
          : 48;
        size = Math.min(
          size,
          this.renderer.getContext().getParameter(this.renderer.getContext().MAX_3D_TEXTURE_SIZE),
        );
        return { id, size, angularSize };
      })
      .sort((a, b) => b.angularSize - a.angularSize);
    // Release unneeded detail before considering any upgrade. A reduced
    // budget must still allow shrinking a resident brick, even when the old
    // allocations already exceed it. Small replacement peaks are unavoidable.
    const next =
      plans.find((p) => p.size < this.fields[p.id].size) ||
      plans.find(
        (p) => p.size > this.fields[p.id].size && this.bytes() + volumeBytes(p.size) < budget,
      );
    if (next)
      this.pending = this.generate(next.id, next.size)
        .catch((error) => {
          this.error = error.message;
        })
        .finally(() => {
          this.pending = null;
        });
  }
  async boundaryOnly() {
    this.setActive(false);
    await this.pending;
    for (const id of ['galaxy', 'nebula', 'gas'])
      if (this.fields[id].size > 48) await this.generate(id, 48);
  }
  bytes() {
    return (
      Object.values(this.fields).reduce((sum, f) => sum + volumeBytes(f.size), 0) +
      volumeBytes(this.pendingSize || 0)
    );
  }
  snapshot() {
    return {
      dimensions: Object.fromEntries(Object.entries(this.fields).map(([id, f]) => [id, f.size])),
      estimatedMiB: Math.round(this.bytes() / 1048576),
      generating: !!this.worker,
      error: this.error,
    };
  }
}

const volumeVertex = `varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);}`;
const volumeFragment = `varying vec3 vWorld;uniform int uKind;${volumeGLSL}
void main(){refinementMask();vec3 rd=normalize(vWorld-cameraPosition);vec4 light;
if(uKind==0)light=integrateField(uGalaxyField,uGalaxyFrame,cameraPosition,rd,0,uVolumeSteps);
else if(uKind==1)light=integrateField(uNebulaField,uNebulaFrame,cameraPosition,rd,1,uVolumeSteps);
else light=integrateField(uGasField,uGasFrame,cameraPosition,rd,2,uVolumeSteps);
gl_FragColor=light;}`;

function stars(count, galaxy = false, refinement = {}) {
  let seed = galaxy ? 81427 : 4389;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const positions = new Float32Array(count * 3),
    colors = new Float32Array(count * 3),
    brightness = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const a = random() * Math.PI * 2,
      r = galaxy
        ? Math.min(0.96, -Math.log(Math.max(1e-6, random() * random())) * 0.15)
        : 450 + random() * 1000;
    const y = galaxy ? (random() + random() + random() - 1.5) * 0.05 : (random() * 2 - 1) * r;
    positions.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    const t = random();
    colors.set(t < 0.15 ? [0.62, 0.76, 1] : t < 0.8 ? [1, 0.9, 0.72] : [1, 0.6, 0.36], i * 3);
    brightness[i] = (galaxy ? 0.04 : 0.16) * (0.25 + Math.pow(random(), 9) * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aFlux', new THREE.BufferAttribute(brightness, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      ...refinement,
      uReference: { value: galaxy ? 200 : 1000 },
      uDustFrame: { value: new THREE.Matrix4() },
      uDust: { value: null },
      uGalaxy: { value: galaxy ? 1 : 0 },
    },
    vertexShader: `attribute vec3 color;attribute float aFlux;uniform float uReference;varying vec3 vColor,vStar;varying float vFlux;void main(){vec4 world=modelMatrix*vec4(position,1.0);vec4 p=viewMatrix*world;float flux=aFlux*pow(uReference/max(length(p.xyz),1.0),2.0);gl_PointSize=clamp(sqrt(flux)*1.5,1.0,3.0);vFlux=min(flux,4.0);vColor=color;vStar=world.xyz;gl_Position=projectionMatrix*p;}`,
    fragmentShader: `precision highp sampler3D;uniform sampler3D uDust;uniform mat4 uDustFrame;uniform float uGalaxy;varying vec3 vColor,vStar;varying float vFlux;uniform float uRefinePhase,uRefineGrid;void main(){if(uRefinePhase>=0.0){float phase=mod(floor(gl_FragCoord.x),uRefineGrid)+uRefineGrid*mod(floor(gl_FragCoord.y),uRefineGrid);if(abs(phase-uRefinePhase)>.5)discard;}float r=length(gl_PointCoord-.5);float alpha=exp(-r*r*22.0);vec3 T=vec3(1.0);if(uGalaxy>.5){vec3 start=(uDustFrame*vec4(vStar,1.0)).xyz,end=(uDustFrame*vec4(cameraPosition,1.0)).xyz,step=(end-start)/24.0;float tau=0.0;for(int i=0;i<24;i++){vec3 p=start+step*(float(i)+.5);if(any(greaterThan(abs(p),vec3(1.0))))break;float lod=max(0.0,log2(float(textureSize(uDust,0).x)/64.0));float dust=textureLod(uDust,p*.5+.5,lod).a;tau+=dust*dust*length(step);}T=exp(-tau*vec3(5.8,8.0,11.0));}gl_FragColor=vec4(vColor*T*vFlux,alpha);}`,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

export function buildDeepSpace(scene, fields, bodies, surfaceObjects) {
  scene.background = new THREE.Color(0x000002);
  scene.add(stars(14000, false, fields.uniforms));
  bodies.sun = { group: new THREE.Group(), radius: 0 };
  for (const [index, id] of ['galaxy', 'nebula', 'gas'].entries()) {
    const d = deepWorlds[id],
      group = new THREE.Group();
    group.position.fromArray(d.position);
    group.rotation.set(...d.rotation);
    const surface = new THREE.Mesh(
      new THREE.BoxGeometry(...d.size.map((v) => v * 2)),
      new THREE.ShaderMaterial({
        vertexShader: volumeVertex,
        fragmentShader: volumeFragment,
        uniforms: { ...fields.uniforms, uKind: { value: index } },
        transparent: true,
        premultipliedAlpha: true,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    surface.userData.world = id;
    group.add(surface);
    scene.add(group);
    surfaceObjects.push(surface);
    bodies[id] = { group, surface, radius: d.radius, volume: true };
    if (id === 'galaxy') {
      const population = stars(90000, true, fields.uniforms);
      population.scale.set(...d.size);
      population.material.uniforms.uDust = fields.uniforms.uGalaxyField;
      population.material.uniforms.uDustFrame = fields.uniforms.uGalaxyFrame;
      group.add(population);
    }
  }
  return {
    position: new THREE.Vector3(),
    material: { uniforms: { uTime: { value: 0 }, uShimmer: { value: 0 } } },
  };
}
