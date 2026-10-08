import * as THREE from 'three';

// Resident full-resolution sources for the black hole's outgoing curved rays.
// No second universe, portal, ray table or retained photographic copies.
export const worldGLSL = `
uniform sampler2D uHomeSky,uEarthMap,uMoonMap,uKeplerMap;
uniform mat3 uHomeSkyFrame,uPlanetFrame[4];
uniform vec4 uPlanet[4];
float fieldEntry(mat4 frame,vec3 origin,vec3 direction){
  vec2 range=boxInterval((frame*vec4(origin,1.0)).xyz,(frame*vec4(direction,0.0)).xyz);
  return range.y>range.x?range.x:1e8;
}
vec3 worldRadiance(vec3 origin,vec3 direction) {
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
  if(disc>0.0 && -b-sqrt(disc)>0.0 && -b-sqrt(disc)<closest){closest=-b-sqrt(disc);color=vec3(3.0,2.1,1.3);}
  vec4 a=integrateField(uGalaxyField,uGalaxyFrame,origin,direction,0,24,closest);
  vec4 c=integrateField(uNebulaField,uNebulaFrame,origin,direction,1,24,closest);
  vec4 e=integrateField(uGasField,uGasFrame,origin,direction,2,24,closest);
  float da=fieldEntry(uGalaxyFrame,origin,direction),dc=fieldEntry(uNebulaFrame,origin,direction),de=fieldEntry(uGasFrame,origin,direction);
  vec4 swapLight;float swapDepth;
  if(da>dc){swapLight=a;a=c;c=swapLight;swapDepth=da;da=dc;dc=swapDepth;}
  if(dc>de){swapLight=c;c=e;e=swapLight;swapDepth=dc;dc=de;de=swapDepth;}
  if(da>dc){swapLight=a;a=c;c=swapLight;}
  return a.rgb+(1.0-a.a)*(c.rgb+(1.0-c.a)*(e.rgb+(1.0-e.a)*color));
}`;

export class SpaceRadiance {
  constructor() {
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
  bind(maps) {
    for (const [uniform, id] of [
      ['uHomeSky', 'sky'],
      ['uEarthMap', 'earth'],
      ['uMoonMap', 'moon'],
      ['uKeplerMap', 'kepler'],
    ])
      this.uniforms[uniform].value = maps[id];
  }
  update(bodies, sky) {
    this.uniforms.uHomeSkyFrame.value
      .setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(sky.quaternion))
      .transpose();
    ['earth', 'moon', 'kepler', 'aurelia'].forEach((id, i) => {
      const body = bodies[id];
      body.surface.updateWorldMatrix(true, false);
      this.uniforms.uPlanet.value[i].set(
        body.group.position.x,
        body.group.position.y,
        body.group.position.z,
        body.radius,
      );
      this.uniforms.uPlanetFrame.value[i].setFromMatrix4(body.surface.matrixWorld).invert();
    });
  }
}
