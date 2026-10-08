import { shadowGLSL } from './shadow-lighting.js';

export const planetVertex = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
void main() {
  vUv = uv;
  vNormal = normalize(mat3(modelMatrix) * normal);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

const eclipseGLSL = shadowGLSL;

export const planetFragment = `
uniform sampler2D uMap;
uniform sampler2D uNight;
uniform sampler2D uClouds;
uniform sampler2D uSpecular;
uniform sampler2D uNormal;
uniform vec3 uSun;
uniform vec3 uTint;
uniform vec3 uAtmosphere;
uniform float uCloudOffset;
uniform float uHasClouds;
uniform float uKind;
uniform float uRadius;
uniform vec3 uCenter;
uniform sampler2D uHeight;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
${eclipseGLSL}
void main() {
  vec3 n = normalize(vNormal);
  vec3 l = normalize(uSun - vWorld);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 base = texture2D(uMap, vUv).rgb * uTint;
  float ocean = 0.0;
  if (uKind < 0.5) {
    ocean = texture2D(uSpecular, vUv).r;
    vec3 normalMap = texture2D(uNormal, vUv).xyz * 2.0 - 1.0;
    vec3 q1 = dFdx(vWorld); vec3 q2 = dFdy(vWorld);
    vec2 s1 = dFdx(vUv); vec2 s2 = dFdy(vUv);
    vec3 t = normalize(q1 * s2.y - q2 * s1.y);
    vec3 b = -normalize(cross(n, t));
    normalMap.xy *= 0.32;
    n = normalize(mat3(t, b, n) * normalMap);
  } else if (uKind > 1.5 && uKind < 2.5) {
    ocean = smoothstep(0.03, 0.13, base.b - base.r) * (1.0 - smoothstep(0.15, 0.35, base.r));
  } else {
    float h = texture2D(uHeight, vUv).r;
    vec3 dp1 = dFdx(vWorld), dp2 = dFdy(vWorld);
    vec3 r1 = cross(dp2, n), r2 = cross(n, dp1);
    float det = dot(dp1, r1);
    vec3 gradient = sign(det) * (dFdx(h) * r1 + dFdy(h) * r2);
    n = normalize(abs(det) * n - gradient * uRadius * 0.0035);
  }
  float ndl = dot(n, l);
  float direct = max(ndl, 0.0);
  float visibility = stellarVisibility(vWorld, l);
  direct *= visibility;
  float cloud = texture2D(uClouds, vec2(vUv.x + uCloudOffset + 0.002, vUv.y)).r * uHasClouds;
  if (uKind > 1.5) cloud *= 0.55;
  vec3 color = base * (0.011 + direct * 1.7) * (1.0 - cloud * 0.40);
  float fresnel = pow(1.0 - max(dot(n, v), 0.0), 3.5);
  if (uKind < 0.5 || (uKind > 1.5 && uKind < 2.5)) {
    vec3 h = normalize(l + v);
    float spec = pow(max(dot(n, h), 0.0), 150.0) * ocean * direct;
    color += vec3(1.0, 0.91, 0.78) * spec * 0.9;
    color += uAtmosphere * fresnel * smoothstep(-0.3, 0.65, ndl) * 0.24 * visibility;
  }
  if (uKind < 0.5) {
    vec3 night = texture2D(uNight, vUv).rgb;
    color += night * 1.15 * (1.0 - smoothstep(-0.18, 0.18, ndl) * visibility) * (1.0 - cloud * 0.85);
  }
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const ringVertex = `
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vLocal;
void main() {
  vLocal = position.xy;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
}`;

export const ringFragment = `
uniform vec3 uSun;
uniform vec3 uCenter;
uniform float uRadius;
uniform float uInner;
uniform float uOuter;
varying vec3 vWorld;
varying vec3 vNormal;
varying vec2 vLocal;
${eclipseGLSL}
float noise(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
void main() {
  float r = length(vLocal);
  float t = (r - uInner) / (uOuter - uInner);
  float pixel = fwidth(t);
  float density=ringDensity(t,pixel);
  vec3 normal=normalize(vNormal);
  float mu=max(0.04,abs(dot(normalize(cameraPosition-vWorld),normal)));
  float tau=-log(max(1.0-density,0.005));
  float alpha=1.0-exp(-tau/mu);
  vec3 icy = vec3(0.72, 0.69, 0.60), pale = vec3(0.89, 0.87, 0.80);
  vec3 color = mix(icy, pale, smoothstep(0.08, 0.33, t));
  vec3 l = normalize(uSun - vWorld);
  float mu0=max(0.04,abs(dot(normal,l)));
  bool litFace=dot(normal,l)*dot(normal,cameraPosition-vWorld)>0.0;
  float reflection=mu0/(mu+mu0)*(1.0-exp(-tau*(1.0/mu+1.0/mu0)));
  float transmission=(1.0-exp(-tau/mu))*exp(-tau/mu0);
  float illumination=litFace?reflection:transmission+0.05*reflection;
  color *= 0.014+2.0*illumination*stellarVisibility(vWorld,l);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const atmosphereFragment = `
uniform vec3 uSun;
uniform vec3 uAtmosphere;
varying vec3 vNormal;
varying vec3 vWorld;
${eclipseGLSL}
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  vec3 l = normalize(uSun - vWorld);
  float rim = pow(1.0 - abs(dot(n, v)), 5.0);
  float day = smoothstep(-0.35, 0.8, dot(n, l));
  vec3 color = uAtmosphere * (0.10 + day * 1.1) * stellarVisibility(vWorld, l);
  gl_FragColor = vec4(color, rim * (0.06 + day * 0.45));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export const cloudFragment = `
uniform sampler2D uClouds;
uniform vec3 uSun;
uniform float uDensity;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorld;
${eclipseGLSL}
void main() {
  float cloud = texture2D(uClouds, vUv).r;
  float alpha = smoothstep(0.12, 0.85, cloud) * uDensity;
  vec3 l = normalize(uSun - vWorld);
  float day = max(dot(normalize(vNormal), l), 0.0) * stellarVisibility(vWorld, l);
  vec3 color = vec3(0.95, 0.965, 0.98) * (0.014 + day * 1.8);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
