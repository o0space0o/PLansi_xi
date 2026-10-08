import * as THREE from 'three';
import { raySteps } from './relativity.js';
import { worldGLSL } from './space-radiance.js';
import { volumeGLSL } from './deep-space.js';
import { diskOrientation } from './space-layout.js';

const vertexShader = `
varying vec3 vWorld;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;
const fragmentShader = `
uniform vec3 uCenter;
uniform mat3 uDiskFrame;
uniform float uRs, uTime;
uniform int uSteps;
varying vec3 vWorld;
const float PI = 3.14159265359;
${volumeGLSL}
${worldGLSL}
vec3 skyColor(vec3 d, vec3 origin) {
 return worldRadiance(origin,transpose(uDiskFrame)*normalize(d));
}
vec3 acceleration(vec3 p, float l2) {
  float r2 = max(dot(p,p), 0.5);
  // Null Schwarzschild orbit: u'' + u = 3u²/2, in r_s units.
  return -1.5 * l2 * p / (r2 * r2 * sqrt(r2));
}
vec4 disk(vec3 p, vec3 direction) {
  float r = length(p.xz);
  if (r < 3.0 || r > 12.0) return vec4(0.0);
  float angle = atan(p.z, p.x);
  float omega = pow(r, -1.5) * 5.0;
  float filament = sin(angle * 29.0 - uTime * omega + r * 13.0);
  float grain = sin(angle * 103.0 + r * 67.0 + sin(r * 19.0 - angle * 11.0));
  float structure = 0.76 + 0.16 * filament + 0.08 * grain;
  float edge = smoothstep(3.0, 3.35, r) * (1.0 - smoothstep(9.0, 12.0, r));
  float temperature = pow(3.0/r, 0.75) * pow(max(0.0, 1.0 - sqrt(3.0/r)), 0.25);
  float beta = sqrt(1.0/(2.0*(r-1.0)));
  vec3 velocity = normalize(vec3(-p.z, 0.0, p.x));
  float g = sqrt(1.0-1.0/r) * sqrt(1.0-beta*beta) / (1.0-beta*dot(velocity,-normalize(direction)));
  // Thermal palette with gravitational redshift and D³ specific-intensity beaming.
  vec3 thermal = mix(vec3(1.0,0.23,0.055),vec3(1.0,0.88,0.62),clamp(temperature*g*2.7,0.0,1.0));
  return vec4(thermal * structure * pow(g,3.0) * edge * 1.7, edge * 0.97);
}
void main() {
  vec3 ro = uDiskFrame * (cameraPosition-uCenter) / uRs;
  vec3 rd = normalize(uDiskFrame * (vWorld-cameraPosition));
  float projection = dot(ro,rd);
  float impact2 = max(0.0, dot(ro,ro)-projection*projection);
  // Reject empty billboard pixels before the ray integration.
  if (impact2 > 225.0) discard;
  float entry = -projection-sqrt(max(0.0,1024.0-impact2));
  vec3 p = ro + rd*max(0.0,entry);
  // Local orthonormal observer angle -> conserved impact parameter.
  float observerR=length(ro);
  float l2=dot(cross(ro,rd),cross(ro,rd))/max(.01,1.0-1.0/observerR);
  vec3 radial=normalize(p),tangent=rd-radial*dot(rd,radial);
  tangent=length(tangent)>1e-6?normalize(tangent):vec3(0.0);
  float startR=length(p);
  vec3 velocity=radial*sign(dot(rd,radial))*sqrt(max(0.0,1.0-(1.0-1.0/startR)*l2/(startR*startR)))+tangent*sqrt(l2)/startR;
  vec3 emission = vec3(0.0);
  float transmission = 1.0;
  bool captured = false;
  for (int i=0; i<224; i++) {
    if (i>=uSteps) break;
    float r = length(p);
    if (r < 1.025) { captured = true; break; }
    if (r > 34.0 && dot(p,velocity)>0.0) break;
    // Affine steps shrink near the photon sphere; a fixed loop bounds GPU work.
    float h = clamp(r*0.065,0.018,1.5) * (224.0/float(uSteps));
    vec3 a = acceleration(p,l2);
    vec3 next = p + velocity*h + 0.5*a*h*h;
    if (p.y*next.y < 0.0) {
      vec3 crossing = mix(p,next,abs(p.y)/(abs(p.y)+abs(next.y)));
      vec4 light = disk(crossing,velocity);
      emission += transmission * light.rgb * light.a;
      transmission *= 1.0-light.a;
    }
    velocity += 0.5*(a+acceleration(next,l2))*h;
    p = next;
  }
  vec3 background = captured ? vec3(0.0) : skyColor(velocity,uCenter+transpose(uDiskFrame)*p*uRs);
  vec3 original = skyColor(rd,cameraPosition);
  // Feather only the outer lens field; the horizon and disk stay opaque.
  float edge = 1.0-smoothstep(11.8,15.0,sqrt(impact2));
  gl_FragColor = vec4(mix(original,emission+background*transmission,edge),edge);
}`;

export function createBlackHole(maps, radius = 1.05, radiance, fields) {
  const group = new THREE.Group();
  const orientation = diskOrientation(0);
  const rotation = new THREE.Matrix4().makeRotationFromQuaternion(orientation);
  const diskFrame = new THREE.Matrix3().setFromMatrix4(rotation).transpose();
  const rs = radius / (Math.sqrt(27) / 2);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      ...fields.uniforms,
      ...radiance.uniforms,
      // Directly lens the current main universe's resident sources.
      uHomeSky: { value: maps.sky },
      uEarthMap: { value: maps.earth },
      uMoonMap: { value: maps.moon },
      uKeplerMap: { value: maps.kepler },
      uCenter: { value: group.position },
      uDiskFrame: { value: diskFrame },
      uRs: { value: rs },
      uTime: { value: 0 },
      uSteps: { value: 192 },
      uVolumeLod: { value: 2 },
    },
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const surface = new THREE.Mesh(new THREE.PlaneGeometry(rs * 30, rs * 30), material);
  surface.userData.world = 'blackhole';
  surface.renderOrder = 2;
  group.add(surface);
  return {
    group,
    surface,
    radius,
    orientation,
    uniforms: material.uniforms,
    update(camera, time, level, preferHD = false) {
      surface.quaternion.copy(camera.quaternion);
      orientation.copy(diskOrientation(time));
      rotation.makeRotationFromQuaternion(orientation);
      diskFrame.setFromMatrix4(rotation).transpose();
      material.uniforms.uTime.value = time;
      material.uniforms.uSteps.value = preferHD ? Math.max(160, raySteps(level)) : raySteps(level);
    },
  };
}
