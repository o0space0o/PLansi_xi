import * as THREE from 'three';

// Distant directions fit the existing planetary overview. Matter remains
// well outside the planetary system; only prominent fields gain large bricks.
export const spaceObjects = {
  galaxy: {
    name: 'Spiral galaxy',
    radius: 55,
    position: [-620, -410, -760],
    size: [55, 14, 55],
    rotation: [0.68, 0.12, -0.2],
  },
  nebula: {
    name: 'Ionized nebula',
    radius: 34,
    position: [380, -420, -980],
    size: [34, 29, 27],
    rotation: [0.2, -0.3, 0.4],
  },
  gas: {
    name: 'Molecular cloud',
    radius: 33,
    position: [400, -850, -1000],
    size: [28, 34, 25],
    rotation: [-0.3, 0.2, 0.1],
  },
};

export function volumeFraming(width, height) {
  return 4.8 * Math.max(1, height / width);
}

export function orbitalOffset(data, days) {
  const angle = data.phase + (days / data.orbitPeriod) * Math.PI * 2;
  const point = new THREE.Vector3(
    Math.cos(angle) * data.distance,
    Math.sin(angle) * data.distance * Math.sin(data.inclination || 0),
    Math.sin(angle) * data.distance * Math.cos(data.inclination || 0),
  );
  if (data.ascendingNode) point.applyAxisAngle(new THREE.Vector3(0, 1, 0), data.ascendingNode);
  return point;
}
