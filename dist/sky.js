import * as THREE from 'three';

export function createSky(texture, responseMap, overviewDirection) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: texture },
      uTime: { value: 0 },
      uResponse: { value: responseMap },
      uShimmer: { value: 1 },
      uBrightness: { value: 0.85 },
    },
    vertexShader: `varying vec3 vDirection;
      void main(){ vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform sampler2D uResponse;
      uniform float uShimmer;
      uniform float uTime;
      uniform float uBrightness;
      varying vec3 vDirection;
      void main(){
        vec3 direction=normalize(vDirection);
        // Derive panorama coordinates per fragment. Interpolated sphere UVs
        // stretch into wedges near the poles and the longitude wrap.
        vec2 uv=vec2(fract(atan(direction.z,-direction.x)/6.28318530718+1.0),1.0-acos(clamp(direction.y,-1.0,1.0))/3.14159265359);
        vec3 rx=dFdx(direction),ry=dFdy(direction);
        float longitudeDenominator=max(dot(direction.xz,direction.xz),0.0000001)*6.28318530718;
        float latitudeDenominator=max(sqrt(1.0-direction.y*direction.y),0.0001)*3.14159265359;
        // Analytic gradients stay continuous across longitude zero and choose
        // proper texture filtering at a pole instead of making radial streaks.
        vec2 dx=vec2((direction.z*rx.x-direction.x*rx.z)/longitudeDenominator,rx.y/latitudeDenominator);
        vec2 dy=vec2((direction.z*ry.x-direction.x*ry.z)/longitudeDenominator,ry.y/latitudeDenominator);
        vec3 color=textureGrad(uMap,uv,dx,dy).rgb;
        vec3 response=textureGrad(uResponse,uv,dx,dy).rgb;
        // Atmospheric observing treatment, optional with T. Each photographic
        // light region shares smooth oscillations, never per-frame pixel noise.
        float phase=response.g*6.28318530718;
        float t=uTime*mix(1.4,3.0,response.b);
        float brightness=0.68*sin(t+phase)+0.32*sin(t*1.73+phase*2.1);
        float chromatic=sin(t*0.83+phase+1.2);
        vec3 gain=vec3(1.0+0.28*brightness);
        gain*=vec3(1.0+0.14*chromatic,1.0,1.0-0.14*chromatic);
        color*=mix(vec3(1.0),gain,response.r*uShimmer);
        // Dust extinction is already recorded in the photograph. Do not add
        // moving cloud veils or double-extinguish the captured sky.
        gl_FragColor=vec4(color*uBrightness,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1800, 128, 64), material);
  sky.name = 'milky-way';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  const direction = overviewDirection.clone().normalize().negate();
  sky.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
  sky.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(direction, 0.35));
  return sky;
}
