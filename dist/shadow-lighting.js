// Visibility of a finite luminous disc, using overlap of its apparent angular
// circle and each opaque body's apparent circle. This produces umbra,
// penumbra, and annular transits without a fixed-width shadow edge.
export function discVisibility(lightRadius, bodyRadius, separation) {
  if (separation >= lightRadius + bodyRadius) return 1;
  if (separation <= Math.abs(bodyRadius - lightRadius))
    return Math.max(0, 1 - Math.min(lightRadius, bodyRadius) ** 2 / lightRadius ** 2);
  const d = separation,
    R = lightRadius,
    r = bodyRadius;
  const clamp = (x) => Math.max(-1, Math.min(1, x));
  const area =
    R * R * Math.acos(clamp((d * d + R * R - r * r) / (2 * d * R))) +
    r * r * Math.acos(clamp((d * d + r * r - R * R) / (2 * d * r))) -
    0.5 * Math.sqrt(Math.max(0, (-d + R + r) * (d + R - r) * (d - R + r) * (d + R + r)));
  return Math.max(0, Math.min(1, 1 - area / (Math.PI * R * R)));
}
export function sunVisibility(point, bodies, ignore = null) {
  const sun = point.clone().negate(),
    sunDistance = sun.length();
  sun.divideScalar(sunDistance);
  const R = Math.asin(Math.min(1, 2 / sunDistance));
  let visibility = 1;
  for (const [id, body] of Object.entries(bodies)) {
    if (id === 'sun' || id === 'satellite' || id === ignore) continue;
    const relative = body.group.position.clone().sub(point),
      distance = relative.length();
    if (relative.dot(sun) <= 0 || distance >= sunDistance) continue;
    const r = Math.asin(Math.min(1, body.radius / distance)),
      angle = Math.acos(Math.max(-1, Math.min(1, relative.divideScalar(distance).dot(sun))));
    visibility *= discVisibility(R, r, angle);
  }
  return visibility;
}

export const shadowGLSL = `
uniform vec4 uOccluders[4];
uniform int uBodyIndex;
uniform float uSunRadius;
uniform vec3 uRingCenter;
uniform vec3 uRingNormal;
uniform float uRingInner;
uniform float uRingOuter;
float discVisibility(float R,float r,float d) {
  if(d>=R+r)return 1.0;
  if(d<=abs(r-R))return max(0.0,1.0-pow(min(R,r)/R,2.0));
  float R2=R*R,r2=r*r,d2=d*d;
  float a=acos(clamp((d2+R2-r2)/(2.0*d*R),-1.0,1.0));
  float b=acos(clamp((d2+r2-R2)/(2.0*d*r),-1.0,1.0));
  float area=R2*a+r2*b-0.5*sqrt(max(0.0,(-d+R+r)*(d+R-r)*(d-R+r)*(d+R+r)));
  return clamp(1.0-area/(3.14159265359*R2),0.0,1.0);
}
float ringDensity(float t,float footprint) {
  float fine=sin(t*610.0)*0.025*(1.0-smoothstep(0.5,2.5,footprint*610.0));
  float detail=sin(t*155.0)*0.055*(1.0-smoothstep(0.5,2.5,footprint*155.0))+sin(t*45.0)*0.10+fine;
  float bands=0.70+detail;
  float gap=smoothstep(0.34,0.36,t)*(1.0-smoothstep(0.42,0.44,t));
  float fineGap=1.0-smoothstep(0.0,0.004+footprint,abs(t-0.72));
  float edge=smoothstep(-footprint,0.055+footprint,t)*(1.0-smoothstep(0.88-footprint,1.0+footprint,t));
  return clamp(bands*mix(0.38,1.0,smoothstep(0.02,0.19,t))*(1.0-gap*0.98)*(1.0-fineGap*0.76)*edge,0.0,0.95);
}
float ringTransmission(vec3 point,vec3 ray,float sunDistance) {
  float incidence=dot(ray,uRingNormal);
  if(abs(incidence)<0.0001)return 1.0;
  float distance=-dot(point-uRingCenter,uRingNormal)/incidence;
  if(distance<=0.002 || distance>=sunDistance)return 1.0;
  float radius=length(point+ray*distance-uRingCenter);
  if(radius<uRingInner || radius>uRingOuter)return 1.0;
  float t=(radius-uRingInner)/(uRingOuter-uRingInner);
  float density=ringDensity(t,0.002);
  float tau=-log(max(1.0-density,0.005));
  return exp(-tau/max(abs(incidence),0.04));
}
float stellarVisibility(vec3 point,vec3 lightDirection) {
  float sunDistance=length(uSun-point);
  float R=asin(clamp(uSunRadius/sunDistance,0.00001,1.0));
  float visibility=1.0;
  for(int i=0;i<4;i++) {
    if(i==uBodyIndex)continue;
    vec3 relative=uOccluders[i].xyz-point;
    float distance=length(relative);
    if(dot(relative,lightDirection)<=0.0 || distance>=sunDistance)continue;
    float r=asin(clamp(uOccluders[i].w/max(distance,0.0001),0.0,1.0));
    float d=atan(length(cross(relative/distance,lightDirection)),dot(relative/distance,lightDirection));
    visibility*=discVisibility(R,r,d);
  }
  vec3 tangent=normalize(cross(lightDirection,abs(lightDirection.y)<0.95?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0)));
  vec3 bitangent=cross(lightDirection,tangent);
  float spread=uSunRadius/sunDistance;
  float transmission=ringTransmission(point,lightDirection,sunDistance);
  // Sample the extended star so ring shadows soften with their distance from
  // the receiving surface. The same radial opacity drives the visible rings.
  for(int i=0;i<8;i++) {
    float angle=float(i)*2.39996323;
    float radius=sqrt((float(i)+0.5)/8.0)*spread;
    vec3 ray=normalize(lightDirection+radius*(cos(angle)*tangent+sin(angle)*bitangent));
    transmission+=ringTransmission(point,ray,sunDistance);
  }
  return visibility*transmission/9.0;
}
`;
