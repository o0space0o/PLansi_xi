import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sunVisibility } from './shadow-lighting.js';

export async function loadSatellite(scene, renderer, skyMap, manager) {
  const { scene: model } = await new GLTFLoader(manager).loadAsync('/assets/models/hubble.glb');
  const box = new THREE.Box3().setFromObject(model),
    sphere = box.getBoundingSphere(new THREE.Sphere());
  model.position.sub(box.getCenter(new THREE.Vector3()));
  const scale = new THREE.Group();
  scale.add(model);
  scale.scale.setScalar(1.4 / sphere.radius);
  scale.rotation.set(0.25, 0.6, -0.28);
  const group = new THREE.Group();
  group.add(scale);
  scene.add(group);
  const pickable = [];
  model.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.userData.world = 'satellite';
    pickable.push(object);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      material.envMapIntensity = 0.8;
      for (const texture of [
        material.map,
        material.normalMap,
        material.roughnessMap,
        material.metalnessMap,
      ])
        if (texture) texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    }
  });
  const environmentCanvas = document.createElement('canvas');
  environmentCanvas.width = 2048;
  environmentCanvas.height = 1024;
  environmentCanvas.getContext('2d').drawImage(skyMap.image, 0, 0, 2048, 1024);
  const texture = new THREE.CanvasTexture(environmentCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  const generator = new THREE.PMREMGenerator(renderer),
    environment = generator.fromEquirectangular(texture);
  scene.environment = environment.texture;
  texture.dispose();
  generator.dispose();
  const sunlight = new THREE.DirectionalLight(0xfff0d9, 3.0);
  sunlight.target = group;
  sunlight.castShadow = true;
  const shadowSize = Math.min(4096, renderer.capabilities.maxTextureSize);
  sunlight.shadow.mapSize.set(shadowSize, shadowSize);
  sunlight.shadow.camera.left = -2;
  sunlight.shadow.camera.right = 2;
  sunlight.shadow.camera.top = 2;
  sunlight.shadow.camera.bottom = -2;
  sunlight.shadow.camera.near = 0.1;
  sunlight.shadow.camera.far = 100;
  sunlight.shadow.normalBias = 0.003;
  sunlight.shadow.bias = -0.00004;
  scene.add(sunlight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  sunlight.shadow.radius = 2;
  const earthshine = new THREE.PointLight(0x83b3e9, 5, 20, 2);
  scene.add(earthshine);
  scene.add(new THREE.HemisphereLight(0x8eabc0, 0x080b12, 0.075));
  return { group, radius: 1.55, model: scale, pickable, sunlight, earthshine, environment };
}
export function updateSatellite(satellite, bodies, days) {
  satellite.model.rotation.y = 0.6 + days * 0.035;
  satellite.sunlight.intensity = 3.0 * sunVisibility(satellite.group.position, bodies, 'satellite');
  satellite.earthshine.position.copy(bodies.earth.group.position);
}
