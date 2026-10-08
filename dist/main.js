import * as THREE from 'three';
import { createSky } from './sky.js';
import { loadSatellite, updateSatellite } from './satellite.js';
import { SatelliteMusic } from './music.js';
import { MusicControls } from './music-controls.js';
import { AnimationClocks, animationTargets } from './animation.js';
import {
  AdaptiveGraphics,
  graphicsLevels,
  renderPixelRatio,
  renderBufferBytes,
  textureBytes,
} from './graphics-policy.js';
import { GraphicsTextures } from './graphics-textures.js';
import { GpuTimer } from './gpu-timer.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  planetVertex,
  planetFragment,
  atmosphereFragment,
  cloudFragment,
  ringVertex,
  ringFragment,
} from './shaders.js';

const $ = (id) => document.getElementById(id);
const canvas = $('space');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03060b);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.02, 4000);
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    // The HDR composer provides MSAA; a second canvas MSAA buffer wastes RAM.
    antialias: false,
    powerPreference: 'high-performance',
  });
} catch (error) {
  showError(
    'This browser could not start WebGL 2. Enable hardware acceleration in Edge or Chrome, then reload.',
  );
  throw error;
}
const graphicsParams = new URLSearchParams(location.search);
const optimizer = new AdaptiveGraphics({
  deviceMemory: navigator.deviceMemory,
  maxTextureSize: renderer.capabilities.maxTextureSize,
  quality: graphicsParams.get('quality') || 'auto',
  targetFps: Number(graphicsParams.get('fps')),
});
const maxRenderDimension = Math.min(
  renderer.capabilities.maxTextureSize,
  renderer.getContext().getParameter(renderer.getContext().MAX_RENDERBUFFER_SIZE),
);
const viewportBudget = () => ({
  width: innerWidth,
  height: innerHeight,
  nativePixelRatio: devicePixelRatio,
  maxDimension: maxRenderDimension,
  budget: optimizer.enabled ? optimizer.budget : Infinity,
});
const effectiveProfile = (profile = optimizer.profile) => ({
  ...profile,
  samples: Math.min(profile.samples, renderer.capabilities.maxSamples),
  shadowSize: Math.min(profile.shadowSize, renderer.capabilities.maxTextureSize),
});
let resolutionScale = renderPixelRatio(viewportBudget(), effectiveProfile());
renderer.setPixelRatio(resolutionScale);
renderer.setSize(innerWidth, innerHeight);
let gpuTimer = new GpuTimer(renderer.getContext());
let contextLost = false;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
// Free rotation can pass either pole and keep turning without angular limits.
const controls = new TrackballControls(camera, canvas);
controls.staticMoving = true;
controls.noPan = true;
controls.noZoom = true;
controls.rotateSpeed = 2.2;
controls.keys = [];
controls.maxDistance = 600;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: null, RIGHT: null };
// The postprocessing target needs its own multisampling; canvas antialiasing
// alone does not smooth silhouettes rendered through an EffectComposer.
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType,
    samples: effectiveProfile().samples,
  }),
);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.1, 0.35, 1.6);
const resizeBloom = bloom.setSize.bind(bloom);
bloom.setSize = (width, height) => {
  const scale = optimizer.profile.bloomScale;
  resizeBloom(Math.max(64, width * scale), Math.max(64, height * scale));
};
bloom.enabled = optimizer.profile.bloomScale > 0;
composer.addPass(bloom);
composer.addPass(new OutputPass());

const worldData = {
  // Distances/radii are illustrative scene units; periods are simulated days.
  earth: { name: 'Earth', radius: 3, parent: 'sun', distance: 28, orbitPeriod: 365.25, phase: 0 },
  moon: {
    name: 'Luna',
    radius: 0.82,
    parent: 'earth',
    distance: 8.3,
    orbitPeriod: 27.32,
    phase: 0.92,
    inclination: 0.09,
  },
  kepler: {
    name: 'Kepler X',
    radius: 4.1,
    parent: 'sun',
    distance: 53,
    orbitPeriod: 612,
    phase: 2.16,
    inclination: 0.08,
  },
  aurelia: {
    name: 'Aurelia',
    radius: 1.05,
    parent: 'kepler',
    distance: 11.8,
    orbitPeriod: 18.4,
    phase: 0.48,
    inclination: 0.14,
  },
  satellite: {
    name: 'Hubble',
    radius: 1.55,
    parent: 'earth',
    distance: 4.9,
    orbitPeriod: 1.7,
    phase: 1.9,
    inclination: 0.4,
  },
};
const planetIds = ['earth', 'moon', 'kepler', 'aurelia'];
const bodies = {};
const surfaceObjects = [];
const occluders = Array.from({ length: 4 }, () => new THREE.Vector4());
const clocks = new AnimationClocks();
let selected = 'earth',
  mode = 'system';
let sky,
  fps = 60;
let flight = null,
  followingPosition = new THREE.Vector3(),
  lastFrame = 0;
let memoryCheckAt = 0,
  extraTextureMemory = 0,
  lastShadowUpdate = -Infinity;
let longFrames = 0;
const shadowFrustum = new THREE.Frustum();
const shadowProjection = new THREE.Matrix4();
const satelliteSphere = new THREE.Sphere(new THREE.Vector3(), 1.55);
let skyShimmer = true;
let lastJourney = null;
let previousViewport = { width: innerWidth, height: innerHeight };
const sunPosition = new THREE.Vector3(0, 0, 0);
const ringCenter = new THREE.Vector3(),
  ringNormal = new THREE.Vector3(-Math.sin(0.4), Math.cos(0.4), 0);
const shadowUniforms = (index) => ({
  uOccluders: { value: occluders },
  uBodyIndex: { value: index },
  uSunRadius: { value: 2 },
  uRingCenter: { value: ringCenter },
  uRingNormal: { value: ringNormal },
  uRingInner: { value: 1.05 * 1.43 },
  uRingOuter: { value: 1.05 * 2.85 },
});
const music = new SatelliteMusic();
const musicControls = new MusicControls(canvas, music, (open) => {
  controls.noRotate = open || !!flight;
  canvas.setAttribute(
    'aria-label',
    open
      ? 'Music mode. Left click plays, right click stops. Hold left for next track, hold right for previous. Wheel adjusts volume. Middle click exits.'
      : 'Click a world or Hubble to approach. Right-click returns. Scroll over an object or empty sky to control only its animation. Drag rotates freely. Middle click opens music mode.',
  );
});
const manager = new THREE.LoadingManager();
let textureLoadingComplete = false;
manager.onProgress = (_, loaded, total) => {
  if (textureLoadingComplete) $('loading-progress').style.width = `${80 + (loaded / total) * 20}%`;
};
manager.onError = (url) => {
  if (graphicsReady) {
    console.warn('Adaptive texture unavailable:', url);
    return;
  }
  showError(
    `A local texture could not be loaded (${url.split('/').pop()}). Reload the page or run npm install in the PLansi_xi folder.`,
  );
};
const maps = {};
let graphicsReady = false;
const textures = new GraphicsTextures(renderer, manager, maps, (_, next, previous) => {
  scene.traverse((object) => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      for (const uniform of Object.values(material?.uniforms || {}))
        if (uniform.value === previous) uniform.value = next;
    }
  });
});
let longFrameObserver;
if (globalThis.PerformanceObserver?.supportedEntryTypes?.includes('long-animation-frame')) {
  longFrameObserver = new PerformanceObserver((list) => {
    longFrames += list.getEntries().length;
  });
  longFrameObserver.observe({ type: 'long-animation-frame' });
}
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  contextLost = true;
  textures.cancel();
  gpuTimer.clear();
  lastFrame = 0;
  optimizer.change(
    Math.max(3, optimizer.level + 1),
    performance.now(),
    'graphics context recovery',
  );
});
canvas.addEventListener('webglcontextrestored', () => {
  contextLost = false;
  gpuTimer = new GpuTimer(renderer.getContext());
  lastFrame = 0;
  optimizer.reset(performance.now());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  if (bodies.satellite) {
    bodies.satellite.sunlight.shadow.map?.dispose();
    bodies.satellite.sunlight.shadow.map = null;
  }
  applyGraphics(performance.now());
});
document.addEventListener('visibilitychange', () => {
  lastFrame = 0;
  optimizer.reset(performance.now());
  gpuTimer.clear();
});
try {
  await textures.initialize(optimizer.profile.textures, (loaded, total) => {
    $('loading-progress').style.width = `${(loaded / total) * 80}%`;
  });
  textureLoadingComplete = true;
  buildScene();
  bodies.satellite = await loadSatellite(scene, renderer, maps.sky, manager, effectiveProfile());
  const satelliteTextures = new Set();
  bodies.satellite.model.traverse((object) => {
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      for (const value of Object.values(material || {}))
        if (value?.isTexture) satelliteTextures.add(value);
  });
  extraTextureMemory = [...satelliteTextures].reduce(
    (sum, texture) =>
      sum +
      textureBytes(texture.image?.width || 0, texture.image?.height || 0, texture.generateMipmaps),
    0,
  );
  surfaceObjects.push(...bodies.satellite.pickable);
  updateOrbits();
  mode = 'system';
  controls.target.set(0, 0, 0);
  camera.position.copy(overviewOffset());
  controls.minDistance = 40;
  controls.maxDistance = Math.max(600, camera.position.length() * 1.5);
  history.replaceState(null, '', '#system');
  resize();
  controls.update();
  await renderer.compileAsync(scene, camera);
  composer.render();
  graphicsReady = true;
  synchronizeTextures();
  optimizer.reset(performance.now());
  $('loading').classList.add('done');
  setTimeout(() => ($('loading').hidden = true), 1100);
  requestAnimationFrame(frame);
} catch (error) {
  showError(
    'The observatory could not finish loading its local assets. Please reload, or restart using Start PLansi_xi.cmd.',
  );
  console.error(error);
}

function buildScene() {
  sky = createSky(maps.sky, maps.starlightResponse, overviewOffset());
  scene.add(sky);
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(2.0, 48, 32),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 2.1, 1.3) }),
  );
  sun.name = 'sun';
  scene.add(sun);
  bodies.sun = { group: sun, radius: 2 };
  for (const id of planetIds) {
    const data = worldData[id];
    const group = new THREE.Group();
    scene.add(group);
    const tilt = new THREE.Group();
    tilt.rotation.z =
      id === 'earth' ? 0.409 : id === 'kepler' ? 0.29 : id === 'aurelia' ? 0.4 : 0.026;
    group.add(tilt);
    const kind = ['earth', 'moon', 'kepler', 'aurelia'].indexOf(id);
    const atmosphere = new THREE.Color(id === 'kepler' ? 0x72b6bc : 0x448bcc);
    const uniforms = {
      uMap: { value: maps[id] || maps.moon },
      uNight: { value: maps.night },
      uClouds: { value: maps.clouds },
      uSpecular: { value: maps.specular },
      uNormal: { value: maps.normal },
      uSun: { value: sunPosition },
      uTint: { value: new THREE.Color(id === 'aurelia' ? 0xd4dbd6 : 0xffffff) },
      uAtmosphere: { value: atmosphere },
      uCloudOffset: { value: 0 },
      uHasClouds: { value: kind === 0 || kind === 2 ? 1 : 0 },
      uKind: { value: kind },
      uRadius: { value: data.radius },
      uCenter: { value: group.position },
      uHeight: { value: maps.moonHeight },
      ...shadowUniforms(kind),
    };
    const material = new THREE.ShaderMaterial({
      vertexShader: planetVertex,
      fragmentShader: planetFragment,
      uniforms,
    });
    const surface = new THREE.Mesh(new THREE.SphereGeometry(data.radius, 128, 96), material);
    surface.rotation.y = id === 'earth' ? 2.2 : 0.7;
    surface.userData.world = id;
    tilt.add(surface);
    surfaceObjects.push(surface);
    let cloud, air;
    if (kind === 0 || kind === 2) {
      cloud = new THREE.Mesh(
        new THREE.SphereGeometry(data.radius * 1.0035, 128, 64),
        new THREE.ShaderMaterial({
          vertexShader: planetVertex,
          fragmentShader: cloudFragment,
          uniforms: {
            uClouds: { value: maps.clouds },
            uSun: { value: sunPosition },
            uDensity: { value: kind === 0 ? 0.87 : 0.42 },
            ...shadowUniforms(kind),
          },
          transparent: true,
          depthWrite: false,
        }),
      );
      cloud.rotation.y = surface.rotation.y;
      tilt.add(cloud);
      air = new THREE.Mesh(
        new THREE.SphereGeometry(data.radius * 1.024, 96, 64),
        new THREE.ShaderMaterial({
          vertexShader: planetVertex,
          fragmentShader: atmosphereFragment,
          uniforms: {
            uSun: { value: sunPosition },
            uAtmosphere: { value: atmosphere },
            ...shadowUniforms(kind),
          },
          transparent: true,
          depthWrite: false,
          side: THREE.BackSide,
          blending: THREE.AdditiveBlending,
        }),
      );
      tilt.add(air);
    }
    bodies[id] = { group, tilt, surface, cloud, air, radius: data.radius, uniforms };
  }
  const moon = bodies.aurelia,
    radius = moon.radius;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(radius * 1.43, radius * 2.85, 512),
    new THREE.ShaderMaterial({
      vertexShader: ringVertex,
      fragmentShader: ringFragment,
      uniforms: {
        uSun: { value: sunPosition },
        uCenter: { value: moon.group.position },
        uRadius: { value: radius },
        uInner: { value: radius * 1.43 },
        uOuter: { value: radius * 2.85 },
        ...shadowUniforms(-1),
      },
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.userData.world = 'aurelia';
  moon.tilt.add(ring);
  moon.ring = ring;
  surfaceObjects.push(ring);
}

function updateOrbits() {
  for (const [id, data] of Object.entries(worldData)) {
    const a = data.phase + (clocks.daysFor(id) / data.orbitPeriod) * Math.PI * 2;
    bodies[id].group.position
      .set(
        Math.cos(a) * data.distance,
        Math.sin(a) * data.distance * Math.sin(data.inclination || 0),
        Math.sin(a) * data.distance * Math.cos(data.inclination || 0),
      )
      .add(bodies[data.parent].group.position);
  }
  planetIds.forEach((id, i) => {
    const p = bodies[id].group.position;
    occluders[i].set(p.x, p.y, p.z, bodies[id].radius);
  });
  ringCenter.copy(bodies.aurelia.group.position);
}

function framingFactor(id, width = innerWidth, height = innerHeight) {
  const tangent = Math.tan(THREE.MathUtils.degToRad(19));
  const distance =
    id === 'aurelia'
      ? Math.max(9.3, (5.7 * height) / (2 * tangent * width * 0.86))
      : Math.max(3.8, height / (tangent * width * 0.88));
  return distance * 2;
}

function overviewOffset(width = innerWidth, height = innerHeight) {
  // Fit the outer moon and its rings through their complete orbit, including
  // perspective foreshortening when they pass closer to the camera.
  const distance = Math.max(220, 74 / ((Math.tan(THREE.MathUtils.degToRad(19)) * width) / height));
  return new THREE.Vector3(0.05, 0.52, 0.85).normalize().multiplyScalar(distance);
}

function positionAt(id, secondsAhead = 0) {
  if (id === 'sun') return new THREE.Vector3();
  const data = worldData[id],
    a = data.phase + (clocks.daysFor(id, secondsAhead) / data.orbitPeriod) * Math.PI * 2;
  return new THREE.Vector3(
    Math.cos(a) * data.distance,
    Math.sin(a) * data.distance * Math.sin(data.inclination || 0),
    Math.sin(a) * data.distance * Math.cos(data.inclination || 0),
  ).add(positionAt(data.parent, secondsAhead));
}

function viewOffset(id, position = bodies[id].group.position) {
  const data = worldData[id];
  const direction = position.clone().negate().normalize();
  // A sunlit three-quarter view, with space beyond the limb.
  const tangent = new THREE.Vector3(-direction.z, 0, direction.x);
  const distance = data.radius * framingFactor(id);
  return direction
    .multiplyScalar(0.68)
    .add(tangent.multiplyScalar(0.72))
    .add(new THREE.Vector3(0, 0.24, 0))
    .normalize()
    .multiplyScalar(distance);
}

function safeOffset(id, secondsAhead) {
  const target = positionAt(id, secondsAhead),
    preferred = viewOffset(id, target);
  for (const angle of [0, 30, -30, 60, -60, 90, -90, 120, -120, 180]) {
    const offset = preferred
      .clone()
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), THREE.MathUtils.degToRad(angle));
    const length = offset.length(),
      direction = offset.clone().normalize();
    const blocked = Object.entries(bodies).some(([other, b]) => {
      if (other === id) return false;
      const relative = positionAt(other, secondsAhead).sub(target);
      const along = THREE.MathUtils.clamp(relative.dot(direction), 0, length);
      return relative.addScaledVector(direction, -along).length() < b.radius + 0.7;
    });
    if (!blocked) return offset;
  }
  const length = preferred.length();
  return preferred
    .setY(length * 0.9)
    .normalize()
    .multiplyScalar(length);
}

function planLift(f, id, overview) {
  // Predict prescribed orbital positions along the journey, then lift the
  // continuous camera path until it clears the moving bodies.
  const base = Math.min(f.startPosition.distanceTo(f.startEnd), 45) * 0.35;
  for (let lift = base; lift < 160; lift += 4) {
    let clear = true;
    for (let step = 1; step <= 160; step++) {
      const t = step / 160,
        eased = t * t * t * (t * (6 * t - 15) + 10);
      const secondsAhead = f.duration * t;
      const end = overview ? new THREE.Vector3() : positionAt(id, secondsAhead);
      const point = f.startPosition.clone().lerp(end.add(f.offset), eased);
      point.y += Math.sin(Math.PI * t) ** 2 * lift;
      if (
        Object.entries(bodies).some(
          ([other, b]) => point.distanceTo(positionAt(other, secondsAhead)) < b.radius + 0.45,
        )
      ) {
        clear = false;
        break;
      }
    }
    if (clear) return lift;
  }
  return 160;
}

function navigate(id, overview = false) {
  if (!overview && !worldData[id]) return;
  controls.update();
  flight?.resolve?.({ canceled: true });
  if (!overview) selected = id;
  mode = overview ? 'system' : 'explore';
  const target = overview ? new THREE.Vector3() : bodies[id].group.position.clone();
  const duration = overview ? 4.6 : 4.0;
  const endOffset = overview ? overviewOffset() : safeOffset(id, duration);
  flight = {
    startPosition: camera.position.clone(),
    startTarget: controls.target.clone(),
    startEnd: target.clone(),
    offset: endOffset,
    elapsed: 0,
    duration,
    resolve: null,
    minClearance: Infinity,
    frames: 0,
  };
  // Carry the current orientation through the journey without a fixed world
  // up axis, which could flip the view after an unrestricted mouse rotation.
  camera.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
  flight.viewDirection = camera.getWorldDirection(new THREE.Vector3());
  flight.viewRotation = new THREE.Quaternion();
  flight.lift = planLift(flight, id, overview);
  // Keep pointer-release handling active so a click cannot leave a captured
  // pointer behind; only manual rotation waits for the camera journey.
  controls.noRotate = true;
  history.replaceState(null, '', overview ? '#system' : `#${id}`);
  return new Promise((resolve) => {
    flight.resolve = resolve;
  });
}

function frame(now) {
  if (document.hidden || contextLost) {
    lastFrame = 0;
    requestAnimationFrame(frame);
    return;
  }
  const cpuStart = performance.now();
  if (devicePixelRatio !== previousViewport.pixelRatio) resize();
  const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.05) : 0;
  if (!document.hidden) clocks.advance(dt);
  sky.position.copy(camera.position);
  sky.material.uniforms.uTime.value = clocks.times.background;
  updateOrbits();
  for (const [id, data] of Object.entries(worldData)) {
    const b = bodies[id];
    const bodyDays = clocks.daysFor(id);
    if (id === 'satellite') {
      updateSatellite(b, bodies, bodyDays);
      continue;
    }
    const rotation =
      (bodyDays * Math.PI * 2) / (id === 'earth' ? 1 : id === 'kepler' ? 1.6 : data.orbitPeriod);
    b.surface.rotation.y = (id === 'earth' ? 2.2 : 0.7) + rotation;
    if (b.cloud) {
      b.cloud.rotation.y = b.surface.rotation.y + bodyDays * 0.01;
      b.uniforms.uCloudOffset.value = (-bodyDays * 0.01) / (Math.PI * 2);
    }
  }
  if (flight) {
    controls.update();
    const f = flight;
    f.elapsed += dt;
    const t = Math.min(f.elapsed / f.duration, 1),
      eased = t * t * t * (t * (6 * t - 15) + 10);
    const end = mode === 'system' ? new THREE.Vector3() : bodies[selected].group.position.clone();
    controls.target.lerpVectors(f.startTarget, end, eased);
    camera.position.lerpVectors(f.startPosition, end.clone().add(f.offset), eased);
    // Lift the transfer arc well above the orbital plane to clear worlds along the route.
    camera.position.y += Math.sin(Math.PI * t) ** 2 * f.lift;
    const viewDirection = controls.target.clone().sub(camera.position).normalize();
    f.viewRotation.setFromUnitVectors(f.viewDirection, viewDirection);
    camera.up.applyQuaternion(f.viewRotation).normalize();
    f.viewDirection.copy(viewDirection);
    camera.lookAt(controls.target);
    f.frames++;
    for (const b of Object.values(bodies))
      f.minClearance = Math.min(
        f.minClearance,
        camera.position.distanceTo(b.group.position) - b.radius,
      );
    if (t === 1) {
      followingPosition.copy(end);
      flight = null;
      controls.noRotate = musicControls.open;
      lastJourney = {
        destination: mode === 'system' ? 'system' : selected,
        frames: f.frames,
        minClearance: f.minClearance,
        completed: true,
      };
      controls.minDistance =
        mode === 'system' ? 40 : bodies[selected].radius * (selected === 'aurelia' ? 3.7 : 1.3);
      controls.maxDistance = mode === 'system' ? Math.max(260, f.offset.length() * 1.4) : 180;
      controls.update();
      f.resolve?.({ selected, mode });
    }
  } else if (mode === 'explore') {
    const current = bodies[selected].group.position;
    const delta = current.clone().sub(followingPosition);
    camera.position.add(delta);
    controls.target.add(delta);
    followingPosition.copy(current);
    controls.update();
  } else controls.update();
  sky.position.copy(camera.position);
  music.update(camera, bodies.satellite.group.position, bodies, now);
  const profile = effectiveProfile();
  if (now - lastShadowUpdate >= 1000 / profile.shadowHz) {
    camera.updateMatrixWorld();
    shadowProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    shadowFrustum.setFromProjectionMatrix(shadowProjection);
    satelliteSphere.center.copy(bodies.satellite.group.position);
    const projectedRadius =
      (bodies.satellite.radius * innerHeight) /
      (2 *
        Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
        camera.position.distanceTo(satelliteSphere.center));
    if (projectedRadius > 16 && shadowFrustum.intersectsSphere(satelliteSphere)) {
      renderer.shadowMap.needsUpdate = true;
      lastShadowUpdate = now;
    }
  }
  gpuTimer.begin(now);
  composer.render();
  gpuTimer.end();
  updatePerformance(now, performance.now() - cpuStart);
  lastFrame = now;
  requestAnimationFrame(frame);
}

function resize() {
  const w = innerWidth,
    h = innerHeight;
  if (bodies[selected] && mode === 'explore') {
    const ratio =
      framingFactor(selected, w, h) /
      framingFactor(selected, previousViewport.width, previousViewport.height);
    if (flight) flight.offset.multiplyScalar(ratio);
    else camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
  } else if (bodies.sun && mode === 'system') {
    const ratio =
      overviewOffset(w, h).length() /
      overviewOffset(previousViewport.width, previousViewport.height).length();
    if (flight) flight.offset.multiplyScalar(ratio);
    else camera.position.sub(controls.target).multiplyScalar(ratio).add(controls.target);
    controls.maxDistance = Math.max(600, overviewOffset(w, h).length() * 1.5);
  }
  previousViewport = { width: w, height: h, pixelRatio: devicePixelRatio };
  applyGraphics(performance.now());
  camera.aspect = w / h;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  controls.handleResize();
}

function graphicsMemory(profile = effectiveProfile(), pixelRatio = resolutionScale) {
  return (
    textures.bytes() +
    extraTextureMemory +
    renderBufferBytes(innerWidth, innerHeight, pixelRatio, profile)
  );
}

function synchronizeTextures() {
  if (
    !graphicsReady ||
    textures.busy ||
    contextLost ||
    textures.tier === optimizer.profile.textures
  )
    return;
  textures.transition(optimizer.profile.textures).finally(() => {
    optimizer.reset(performance.now());
    if (!textures.error) synchronizeTextures();
  });
}

function applyGraphics(now) {
  const profile = effectiveProfile();
  bloom.enabled = profile.bloomScale > 0;
  for (const target of [composer.renderTarget1, composer.renderTarget2]) {
    if (target.samples !== profile.samples) {
      target.samples = profile.samples;
      target.dispose();
    }
  }
  resolutionScale = renderPixelRatio(viewportBudget(), profile);
  renderer.setPixelRatio(resolutionScale);
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(resolutionScale);
  composer.setSize(innerWidth, innerHeight);
  const shadow = bodies.satellite?.sunlight.shadow;
  if (shadow && shadow.mapSize.x !== profile.shadowSize) {
    shadow.map?.dispose();
    shadow.map = null;
    shadow.mapSize.set(profile.shadowSize, profile.shadowSize);
    renderer.shadowMap.needsUpdate = true;
    lastShadowUpdate = -Infinity;
  }
  optimizer.reset(now);
  synchronizeTextures();
}

function updatePerformance(now, cpuMs) {
  if (!textures.busy && now - memoryCheckAt >= 2000) {
    memoryCheckAt = now;
    if (optimizer.constrainMemory(graphicsMemory(), now)) applyGraphics(now);
  }
  const next = effectiveProfile(
    graphicsLevels[Math.max(optimizer.minimumLevel, optimizer.level - 1)],
  );
  const nextRatio = renderPixelRatio(viewportBudget(), next);
  const canUpgrade =
    textures.peakBytes(next.textures) +
      extraTextureMemory +
      renderBufferBytes(innerWidth, innerHeight, nextRatio, next) <
    optimizer.budget;
  if (
    lastFrame &&
    optimizer.record({
      now,
      frameMs: now - lastFrame,
      cpuMs,
      gpuMs: gpuTimer.value(now),
      transitioning: textures.busy,
      canUpgrade,
    })
  )
    applyGraphics(now);
  fps = optimizer.metrics.fps ?? fps;
}

function showError(message) {
  $('error-message').textContent = message;
  $('error-panel').hidden = false;
  $('loading').hidden = true;
}

addEventListener('resize', resize);
const raycaster = new THREE.Raycaster();
let pointerStart = null;
let pointerPosition = null;
function pickWorld(x, y, tolerance = 9) {
  raycaster.setFromCamera(
    new THREE.Vector2((x / innerWidth) * 2 - 1, 1 - (y / innerHeight) * 2),
    camera,
  );
  const hit = raycaster.intersectObjects(surfaceObjects)[0];
  if (hit) return hit.object.userData.world;
  // A small hit margin keeps the more distant moons selectable.
  let nearest = null,
    best = Infinity;
  for (const [id, b] of Object.entries(bodies)) {
    if (id === 'sun') continue;
    const p = b.group.position.clone().project(camera);
    if (p.z < -1 || p.z > 1) continue;
    const dx = (p.x * 0.5 + 0.5) * innerWidth - x,
      dy = (-p.y * 0.5 + 0.5) * innerHeight - y;
    const d = Math.hypot(dx, dy);
    if (d < tolerance && d < best) {
      nearest = id;
      best = d;
    }
  }
  return nearest;
}
canvas.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
});
canvas.addEventListener('pointerup', (event) => {
  if (
    !pointerStart ||
    pointerStart.button !== 0 ||
    event.button !== 0 ||
    Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5 ||
    flight
  )
    return;
  const id = pickWorld(event.clientX, event.clientY, event.pointerType === 'touch' ? 19 : 9);
  if (id && (id !== selected || mode === 'system')) navigate(id);
});
canvas.addEventListener('pointermove', (event) => {
  pointerPosition = { x: event.clientX, y: event.clientY };
  if (event.buttons === 0)
    canvas.style.cursor = pickWorld(event.clientX, event.clientY) ? 'pointer' : 'grab';
});
canvas.addEventListener('pointerleave', () => {
  pointerPosition = null;
});
canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  navigate(selected, true);
});

function pointedTarget() {
  return pointerPosition
    ? pickWorld(pointerPosition.x, pointerPosition.y) || 'background'
    : 'background';
}
function adjustAnimationRate(delta, target = pointedTarget()) {
  return clocks.adjust(target, delta);
}
canvas.addEventListener(
  'wheel',
  (event) => {
    event.preventDefault();
    const delta =
      event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
    pointerPosition = { x: event.clientX, y: event.clientY };
    adjustAnimationRate(delta, pickWorld(event.clientX, event.clientY) || 'background');
  },
  { passive: false },
);
document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key.toLowerCase() === 't' && !event.repeat && sky) {
    skyShimmer = !skyShimmer;
    sky.material.uniforms.uShimmer.value = skyShimmer ? 1 : 0;
  }
  if (event.key.toLowerCase() === 'h' && !event.repeat) window.open('/help.html', 'plansi-xi-help');
  if (event.key === 'Escape') navigate(selected, true);
  if (/^[1-5]$/.test(event.key)) navigate(Object.keys(worldData)[Number(event.key) - 1]);
});

// Read-only diagnostics used to verify local rendering and orbital continuity.
function getState() {
  const worlds = Object.fromEntries(
    Object.entries(bodies).map(([id, b]) => [id, b.group.position.toArray()]),
  );
  const screen = Object.fromEntries(
    Object.entries(bodies).map(([id, b]) => {
      const p = b.group.position.clone().project(camera);
      return [
        id,
        {
          x: (p.x * 0.5 + 0.5) * innerWidth,
          y: (-p.y * 0.5 + 0.5) * innerHeight,
          visible: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1,
        },
      ];
    }),
  );
  return {
    selected,
    mode,
    pointedTarget: pointedTarget(),
    ...clocks.snapshot(),
    traveling: !!flight,
    camera: camera.position.toArray(),
    cameraUp: camera.up.toArray(),
    target: controls.target.toArray(),
    worlds,
    screen,
    resolutionScale,
    quality: {
      preset: optimizer.profile.name,
      nativePixelRatio: devicePixelRatio,
      renderPixelRatio: resolutionScale,
      antialiasSamples: effectiveProfile().samples,
      automaticResolutionReduction: optimizer.enabled,
      bloomScale: optimizer.profile.bloomScale,
      shadowSize: effectiveProfile().shadowSize,
      textures: { ...textures.files },
      optimizer: {
        ...optimizer.snapshot(),
        approximateDeviceMemoryGiB: navigator.deviceMemory ?? null,
        estimatedGraphicsMemoryMiB: Math.round(graphicsMemory() / (1024 * 1024)),
        gpuTimingAvailable: !!gpuTimer.extension,
        longFrames,
        changingTextures: textures.busy,
        textureError: textures.error,
        contextLost,
      },
    },
    fps,
    lastJourney,
    music: { menuOpen: musicControls.open, ...music.getState() },
    background: `NOIRLab all-sky photograph · ${maps.sky.image.width} × ${maps.sky.image.height} from 40000 × 20000 source`,
    skyShimmer,
    skyEffect: skyShimmer
      ? 'Atmospheric observing treatment of existing photographic pixels; no moving dust or synthetic stars'
      : 'Steady space view; photographic dust extinction and stellar colors',
    syntheticStars: scene.children.filter((object) => object.isPoints || object.isSprite).length,
  };
}
window.PLansi_xi = { navigate, getState };

// Structured access to the same exploration and simulation controls.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const destinations = ['earth', 'moon', 'kepler', 'aurelia', 'satellite', 'system'];
  const register = (tool) => {
    try {
      Promise.resolve(document.modelContext.registerTool(tool, { signal: lifecycle.signal })).catch(
        (error) => console.warn('Observatory tool registration:', error.message),
      );
    } catch (error) {
      console.warn('Observatory tool registration:', error.message);
    }
  };
  register({
    name: 'get_observatory_state',
    title: 'Read observatory state',
    description:
      'Read the selected world, orbital motion, camera journey status, and positions in this local observatory.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: false },
    execute: () => getState(),
  });
  register({
    name: 'navigate_world',
    title: 'Fly to a world',
    description:
      'Move the camera smoothly to Earth, Luna, Kepler X, Aurelia, the Hubble satellite, or the system overview. Returns after the visible camera journey finishes.',
    inputSchema: {
      type: 'object',
      properties: { destination: { type: 'string', enum: destinations } },
      required: ['destination'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input) => {
      if (!input || !destinations.includes(input.destination))
        throw new TypeError('Unknown destination.');
      await navigate(
        input.destination === 'system' ? selected : input.destination,
        input.destination === 'system',
      );
      return getState();
    },
  });
  register({
    name: 'adjust_animation_speed',
    title: 'Adjust animation speed',
    description:
      'Apply the scroll action to one target: its own orbit and spin, or the photographic background shimmer. Other clocks, camera flight duration, and music speed stay independent. Defaults to the object under the pointer.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['faster', 'slower'] },
        steps: { type: 'integer', minimum: 1, maximum: 10 },
        target: { type: 'string', enum: animationTargets },
      },
      required: ['direction'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: (input) => {
      if (
        !input ||
        !['faster', 'slower'].includes(input.direction) ||
        !Number.isInteger(input.steps ?? 1) ||
        (input.steps ?? 1) < 1 ||
        (input.steps ?? 1) > 10
      )
        throw new TypeError('Choose a valid scroll direction and 1–10 steps.');
      return adjustAnimationRate(
        (input.direction === 'faster' ? -120 : 120) * (input.steps ?? 1),
        input.target ?? pointedTarget(),
      );
    },
  });
  const musicActions = [
    'toggle_menu',
    'play',
    'stop',
    'next',
    'previous',
    'volume_up',
    'volume_down',
  ];
  register({
    name: 'control_satellite_music',
    title: 'Control satellite music',
    description:
      'Use the hidden music controls: toggle music mode, play or stop local Audio-folder music, select a track, or change volume. A real click may be needed once to unlock browser audio.',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: musicActions } },
      required: ['action'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute: async (input) => {
      if (!input || !musicActions.includes(input.action))
        throw new TypeError('Choose a valid music action.');
      if (input.action === 'toggle_menu') musicControls.toggle();
      if (input.action === 'play') await music.play();
      if (input.action === 'stop') music.stop();
      if (input.action === 'next') await music.skip(1);
      if (input.action === 'previous') await music.skip(-1);
      if (input.action === 'volume_up') music.adjustVolume(0.05);
      if (input.action === 'volume_down') music.adjustVolume(-0.05);
      return { menuOpen: musicControls.open, ...music.getState() };
    },
  });
  addEventListener('pagehide', () => lifecycle.abort(), { once: true });
}
