import * as THREE from 'three';
import { volumeGLSL } from './deep-space.js';

export const homeGLSL = `
uniform sampler2D uHomeSky,uEarthMap,uMoonMap,uKeplerMap;
uniform mat3 uHomeSkyFrame,uPlanetFrame[4];
uniform vec4 uPlanet[4];
vec3 homeRadiance(vec3 origin,vec3 direction) {
  vec3 d=uHomeSkyFrame*direction;
  vec2 uv=vec2(fract(atan(d.z,-d.x)/6.28318530718+1.0),asin(clamp(d.y,-1.0,1.0))/3.14159265359+.5);
  vec3 color=texture2D(uHomeSky,uv).rgb*.85;
  float closest=1e8;
  for(int i=0;i<4;i++){
    vec3 relative=origin-uPlanet[i].xyz;
    float b=dot(relative,direction),disc=b*b-dot(relative,relative)+uPlanet[i].w*uPlanet[i].w;
    if(disc<0.0)continue;
    float t=-b-sqrt(disc);if(t<=0.0||t>closest)continue;closest=t;
    vec3 p=origin+direction*t,n=normalize(p-uPlanet[i].xyz),local=uPlanetFrame[i]*n;
    vec2 texUV=vec2(atan(-local.z,local.x)/6.28318530718+.5,asin(clamp(local.y,-1.0,1.0))/3.14159265359+.5);
    vec3 albedo=i==0 ? texture2D(uEarthMap,texUV).rgb : i==2 ? texture2D(uKeplerMap,texUV).rgb : texture2D(uMoonMap,texUV).rgb;
    color=albedo*(.008+1.5*max(0.0,dot(n,normalize(-p))));
  }
  float b=dot(origin,direction),disc=b*b-dot(origin,origin)+4.0;
  if(disc>0.0 && -b-sqrt(disc)>0.0 && -b-sqrt(disc)<closest)color=vec3(3.0,2.1,1.3);
  return color;
}`;

export class HomeBoundary {
  constructor() {
    this.textures = [];
    this.uniforms = {
      uHomeSky: { value: null },
      uEarthMap: { value: null },
      uMoonMap: { value: null },
      uKeplerMap: { value: null },
      uHomeSkyFrame: { value: new THREE.Matrix3() },
      uPlanet: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
      uPlanetFrame: { value: Array.from({ length: 4 }, () => new THREE.Matrix3()) },
    };
  }
  async initialize(maps) {
    for (const [name, id, size] of [
      ['uHomeSky', 'sky', 1024],
      ['uEarthMap', 'earth', 512],
      ['uMoonMap', 'moon', 512],
      ['uKeplerMap', 'kepler', 512],
    ]) {
      const source = maps[id].image;
      const image = await createImageBitmap(source, {
        resizeWidth: size,
        resizeHeight: Math.round((size * source.height) / source.width),
      });
      const texture = new THREE.Texture(image);
      texture.flipY = false;
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.needsUpdate = true;
      this.textures.push(texture);
      this.uniforms[name].value = texture;
    }
  }
  update(bodies, sky) {
    sky.updateMatrixWorld();
    this.uniforms.uHomeSkyFrame.value
      .setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(sky.quaternion))
      .transpose();
    ['earth', 'moon', 'kepler', 'aurelia'].forEach((id, i) => {
      const b = bodies[id];
      b.surface.updateWorldMatrix(true, false);
      this.uniforms.uPlanet.value[i].set(
        b.group.position.x,
        b.group.position.y,
        b.group.position.z,
        b.radius,
      );
      this.uniforms.uPlanetFrame.value[i].setFromMatrix4(b.surface.matrixWorld).invert();
    });
  }
  bytes() {
    return this.textures.reduce(
      (sum, t) => sum + t.image.width * t.image.height * 4 * (1 + 4 / 3),
      0,
    );
  }
}

const fragment = `
uniform sampler2D uEllis;
uniform vec3 uEye,uMouth,uAxis,uHomeMouth;
uniform float uInside,uProper,uOriginDeep,uThroat,uBeta;
varying vec3 vWorld;
${homeGLSL}
${volumeGLSL}
void main(){
  refinementMask();
  vec3 rd=normalize(vWorld-uEye),relative=uEye-uMouth;
  float r=length(relative)/uThroat;
  vec3 n=uInside>.5?uAxis:normalize(relative);
  float l=uInside>.5?uProper:sqrt(max(0.0,r*r-1.0));
  if(uInside<.5 && r>64.0) {
    vec3 ro=relative/uThroat;float projection=dot(ro,rd);
    float disc=projection*projection-dot(ro,ro)+4096.0;
    if(disc<0.0||projection>=0.0)discard;
    vec3 entry=ro+rd*(-projection-sqrt(disc));
    n=normalize(entry);l=sqrt(4095.0);
  }
  float signL=l<0.0?-1.0:1.0;
  float viewP=dot(rd,n),p=(viewP-uBeta)/(1.0-uBeta*viewP);
  vec3 transverse=rd-n*viewP;
  if(length(transverse)>1e-6)rd=n*p+normalize(transverse)*sqrt(max(0.0,1.0-p*p));
  float outward=p*signL;
  float b=sqrt(1.0+l*l)*sqrt(max(0.0,1.0-p*p));
  if(uInside<.5 && (outward>0.0||b>6.0))discard;
  // Outside the finite metric domain, outward rays are ordinary scene rays.
  bool direct=abs(l)>=16.0 && (outward>0.0||b>sqrt(257.0));
  float angle=acos(clamp(outward,-1.0,1.0));
  vec2 uv=vec2(angle/3.14159265359,log(1.0+min(abs(l),64.0))/log(65.0));
  uv.y=uv.y*(192.0/193.0)+.5/193.0;
  vec2 cell=uv*vec2(1024.0,193.0)-.5,base=floor(cell),f=fract(cell);
  vec4 ray=mix(mix(texture2D(uEllis,(base+.5)/vec2(1024.0,193.0)),texture2D(uEllis,(base+vec2(1.5,.5))/vec2(1024.0,193.0)),f.x),mix(texture2D(uEllis,(base+vec2(.5,1.5))/vec2(1024.0,193.0)),texture2D(uEllis,(base+1.5)/vec2(1024.0,193.0)),f.x),f.y);
  vec2 cs=normalize(ray.xy);
  vec3 tangent=rd-p*n;float tangentLength=length(tangent);
  tangent=tangentLength>1e-6?tangent/tangentLength:normalize(cross(n,abs(n.y)<.9?vec3(0,1,0):vec3(1,0,0)));
  tangent*=signL;
  float side=outward<0.0&&b<1.0?-signL:signL;
  if(abs(l)<1e-5)side=p<0.0?-1.0:1.0;
  vec3 radial=n*cs.x+tangent*cs.y,angular=-n*cs.y+tangent*cs.x;
  float sine=min(.999,b/sqrt(257.0));
  vec3 direction=normalize(radial*sqrt(1.0-sine*sine)+angular*sine);
  vec3 exitPoint=radial*sqrt(257.0)*uThroat;
  if(direct){direction=rd*signL;exitPoint=uInside>.5?n*sqrt(1.0+l*l)*uThroat:relative;}
  bool deep=(uOriginDeep>.5)==(side>0.0);
  vec3 center=deep?vec3(0.0):uHomeMouth;
  float chart=side<0.0?-1.0:1.0;
  vec3 origin=center+exitPoint*chart;
  direction*=chart;
  vec3 color=deep?deepRadiance(origin,direction):homeRadiance(origin,direction);
  float frequency=(1.0+uBeta*p)/sqrt(1.0-uBeta*uBeta);
  gl_FragColor=vec4(color*pow(frequency,3.0),1.0);
}`;

export async function createWormhole(fields, boundary) {
  const response = await fetch('/assets/ellis-rays.bin');
  if (!response.ok) throw new Error('Ellis ray table unavailable');
  const rayData = new Float32Array(await response.arrayBuffer());
  if (rayData.length !== 1024 * 193 * 4) throw new Error('Invalid Ellis ray table');
  const lut = new THREE.DataTexture(rayData, 1024, 193, THREE.RGBAFormat, THREE.FloatType);
  // WebGL2 guarantees float textures but float linear filtering is optional.
  // Manual four-tap interpolation below remains valid without that extension.
  lut.minFilter = lut.magFilter = THREE.NearestFilter;
  lut.needsUpdate = true;
  const uniforms = {
    ...fields.uniforms,
    ...boundary.uniforms,
    uEllis: { value: lut },
    uEye: { value: new THREE.Vector3() },
    uMouth: { value: new THREE.Vector3() },
    uHomeMouth: { value: new THREE.Vector3() },
    uAxis: { value: new THREE.Vector3(0, 0, 1) },
    uInside: { value: 0 },
    uProper: { value: 0 },
    uOriginDeep: { value: 0 },
    uThroat: { value: 1.4 },
    uBeta: { value: 0 },
    uCameraFrame: { value: new THREE.Matrix3() },
    uAspect: { value: 1 },
    uTanFov: { value: Math.tan((19 * Math.PI) / 180) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec3 vWorld;void main(){vWorld=(modelMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);}`,
    fragmentShader: fragment,
    transparent: false,
    depthWrite: false,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(16.8, 16.8), material);
  surface.userData.world = 'wormhole';
  surface.renderOrder = 3;
  const group = new THREE.Group();
  group.add(surface);
  const metricScene = new THREE.Scene();
  const metricMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `uniform mat3 uCameraFrame;uniform vec3 uEye;uniform float uAspect,uTanFov;varying vec3 vWorld;void main(){vWorld=uEye+uCameraFrame*vec3(position.x*uAspect*uTanFov,position.y*uTanFov,-1.0);gl_Position=vec4(position.xy,0,1);}`,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), metricMaterial);
  screen.frustumCulled = false;
  metricScene.add(screen);
  return {
    group,
    surface,
    radius: 1.4,
    metricScene,
    uniforms,
    lut,
    bytes: () => rayData.byteLength * 2,
    update(camera, environment, inside = false, proper = 0, axis = null) {
      uniforms.uEye.value.copy(camera.position);
      uniforms.uMouth.value.copy(group.position);
      uniforms.uOriginDeep.value = environment === 'deep' ? 1 : 0;
      if (environment === 'home' && !inside) uniforms.uHomeMouth.value.copy(group.position);
      uniforms.uInside.value = inside ? 1 : 0;
      if (!inside) uniforms.uBeta.value = 0;
      uniforms.uProper.value = proper;
      if (axis) uniforms.uAxis.value.copy(axis);
      uniforms.uCameraFrame.value.setFromMatrix4(
        new THREE.Matrix4().makeRotationFromQuaternion(camera.quaternion),
      );
      uniforms.uAspect.value = camera.aspect;
      uniforms.uTanFov.value = Math.tan((camera.fov * Math.PI) / 360);
      surface.quaternion.copy(camera.quaternion);
    },
  };
}
