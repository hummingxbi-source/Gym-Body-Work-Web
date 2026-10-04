/**
 * hero-scene.js
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const CONFIG = {
  MODEL_URL: '/models/dumbbell.glb',
  MAT: {
    metalnessMultiplier: 0.60,
    roughnessMultiplier: 0.65,
    envMapIntensity:     0.85,
    exposure:            1.05,
  },
  LERP_FACTOR: 0.05,
  KEYFRAMES: [
    { progress: 0.00, rotX: 90, rotY: 0, rotZ: 0, scale: 1.0, offsetX: 0, offsetY: 0 },
    { progress: 0.05, rotX: 10, rotY: -30, rotZ: 0, scale: 1.15, offsetX: 0.16, offsetY: 0 },
    { progress: 0.30, rotX: 0, rotY: -90, rotZ: 0, scale: 1.25, offsetX: 0.16, offsetY: 0 },
    { progress: 0.55, rotX: 0, rotY: -90, rotZ: -70, scale: 1.15, offsetX: 0.16, offsetY: 0 },
    { progress: 0.80, rotX: -10, rotY: -20, rotZ: 15, scale: 1.25, offsetX: 0.16, offsetY: 0 }
  ]
};

const DEG = Math.PI / 180;
function lerp(a, b, t) { return a + (b - a) * t; }
function smoothstep(t) { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); }

function interpolateKeyframes(progress, keyframes) {
  const kf = keyframes;
  if (progress <= kf[0].progress) return { ...kf[0] };
  if (progress >= kf[kf.length-1].progress) return { ...kf[kf.length-1] };
  let i = 0;
  while (i < kf.length - 2 && kf[i+1].progress <= progress) i++;
  const a = kf[i], b = kf[i+1];
  const span = b.progress - a.progress;
  const t = span === 0 ? 0 : smoothstep((progress - a.progress) / span);
  return {
    progress,
    rotX: lerp(a.rotX, b.rotX, t),
    rotY: lerp(a.rotY, b.rotY, t),
    rotZ: lerp(a.rotZ, b.rotZ, t),
    scale: lerp(a.scale, b.scale, t),
    offsetX: lerp(a.offsetX, b.offsetX, t),
    offsetY: lerp(a.offsetY, b.offsetY, t),
  };
}

function buildEnvScene(renderer) {
  const envScene = new THREE.Scene();
  function addPlane(hex, brightness, pos, rot, scl) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(brightness), side: THREE.DoubleSide }),
    );
    m.position.set(...pos); m.rotation.set(...rot); m.scale.set(...scl);
    envScene.add(m);
  }
  addPlane(0xe8eef5, 2.8, [ 0,  6,  0], [ Math.PI*0.5,    0, 0], [12, 12, 1]);
  addPlane(0xdce8f0, 2.2, [ 0,  4,  5], [-Math.PI*0.20,   0, 0], [10,  6, 1]);
  addPlane(0xe0e8f0, 1.6, [ 6,  1,  0], [ 0, -Math.PI*0.5, 0], [ 8,  5, 1]);
  addPlane(0xc0cce0, 0.9, [-6,  0,  0], [ 0,  Math.PI*0.5, 0], [ 8,  5, 1]);
  addPlane(0xff1800, 0.9, [ 0,  0, -6], [ 0,  0,            0], [ 2, 2.5, 1]);
  addPlane(0x090909, 1.0, [ 0, -4,  0], [ Math.PI*0.5,    0, 0], [10, 10, 1]);
  const pg = new THREE.PMREMGenerator(renderer);
  pg.compileCubemapShader();
  const envMap = pg.fromScene(envScene).texture;
  pg.dispose();
  return envMap;
}

function fitCamera(camera, modelSize, aspect, fill = 0.72) {
  const halfD  = Math.max(modelSize.x, modelSize.y, modelSize.z) * 0.5;
  const fovRad = THREE.MathUtils.degToRad(camera.fov);
  const fovH   = 2 * Math.atan(Math.tan(fovRad * 0.5) * aspect);
  const dV     = halfD / (Math.tan(fovRad * 0.5) * fill);
  const dH     = halfD / (Math.tan(fovH   * 0.5) * fill);
  const dist   = Math.max(dV, dH) * 1.10;
  camera.userData.baseDist = dist;
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

export async function initHeroScene(canvas, heroSection, scrollState) {
  const reduced  = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isMobile = window.innerWidth < 768;
  const MAX_PR   = isMobile ? 1.5 : 2.0;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas, antialias: !isMobile, alpha: true, powerPreference: 'high-performance',
    });
  } catch { throw new Error('NO_WEBGL'); }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PR));
  renderer.setSize(canvas.clientWidth || canvas.offsetWidth, canvas.clientHeight || canvas.offsetHeight);
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = CONFIG.MAT.exposure;
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled   = false;

  const scene = new THREE.Scene();
  const envMap = buildEnvScene(renderer);
  scene.environment = envMap;

  const w0     = canvas.clientWidth  || canvas.offsetWidth  || 1;
  const h0     = canvas.clientHeight || canvas.offsetHeight || 1;
  const camera = new THREE.PerspectiveCamera(38, w0 / h0, 0.01, 100);

  const rimRed = new THREE.SpotLight(0xff2000, 1.2, 4.0, Math.PI * 0.08, 0.8, 1.5);
  rimRed.position.set(0, 0.1, -2.0);
  rimRed.target.position.set(0, 0, 0);
  rimRed.castShadow = false;
  scene.add(rimRed, rimRed.target);

  const fillLight = new THREE.DirectionalLight(0xa0b8d0, 0.20);
  fillLight.position.set(-3, 1, 1);
  fillLight.castShadow = false;
  scene.add(fillLight);
  scene.add(new THREE.AmbientLight(0xffffff, 0.04));

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf  = await loader.loadAsync(CONFIG.MODEL_URL);
  const model = gltf.scene;

  model.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach(mat => {
      if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;
      mat.metalness       = CONFIG.MAT.metalnessMultiplier;
      mat.roughness       = CONFIG.MAT.roughnessMultiplier;
      mat.envMapIntensity = CONFIG.MAT.envMapIntensity;
      mat.needsUpdate     = true;
    });
  });

  const bbox     = new THREE.Box3().setFromObject(model);
  const center   = bbox.getCenter(new THREE.Vector3());
  const bboxSize = bbox.getSize(new THREE.Vector3());
  model.position.sub(center);

  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);
  fitCamera(camera, bboxSize, camera.aspect);

  let currentProgress = 0;
  let rafId = null, isVisible = true;

  const ro = new ResizeObserver(() => {
    const cw = canvas.clientWidth  || canvas.offsetWidth;
    const ch = canvas.clientHeight || canvas.offsetHeight;
    if (!cw || !ch) return;
    renderer.setSize(cw, ch);
    camera.aspect = cw / ch;
    fitCamera(camera, bboxSize, camera.aspect);
  });
  ro.observe(canvas);

  const io = new IntersectionObserver(entries => {
    isVisible = entries[0].isIntersecting;
    if (isVisible && !rafId && !reduced) startLoop();
  }, { threshold: 0 });
  io.observe(heroSection);

  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault(); stopLoop();
    canvas.dispatchEvent(new CustomEvent('hero:contextlost'));
  }, { once: true });

  let lastProgress = -1;
  const startTime = performance.now();

  function tick() {
    rafId = requestAnimationFrame(tick);
    if (!isVisible || document.hidden) return;

    const raw = scrollState.getProgress();
    currentProgress = lerp(currentProgress, raw, CONFIG.LERP_FACTOR);

    const pd = Math.abs(currentProgress - lastProgress);
    if (pd < 0.00005 && currentProgress >= 0.3) {
      // Idle state
      const elapsed = performance.now() - startTime;
      const idleRotY = 0.05 * Math.sin(0.001 * elapsed);
      const kf = interpolateKeyframes(currentProgress, CONFIG.KEYFRAMES);
      pivot.rotation.y = kf.rotY * DEG + idleRotY;
      renderer.render(scene, camera);
      return; 
    }
    lastProgress = currentProgress;

    const kf = interpolateKeyframes(currentProgress, CONFIG.KEYFRAMES);
    const elapsed = performance.now() - startTime;
    const idleRotY = 0.05 * Math.sin(0.001 * elapsed);
    
    pivot.rotation.x = kf.rotX * DEG;
    pivot.rotation.y = kf.rotY * DEG + idleRotY;
    pivot.rotation.z = kf.rotZ * DEG;
    const dist = camera.userData.baseDist ?? 2;
    const fovRad = THREE.MathUtils.degToRad(camera.fov);
    const frustumH = 2 * dist * Math.tan(fovRad * 0.5);
    const frustumW = frustumH * camera.aspect;

    const isMobileNow = window.innerWidth < 768;
    
    let targetOffsetX = kf.offsetX;
    let targetOffsetY = kf.offsetY;
    let targetScale = kf.scale;

    if (isMobileNow) {
      targetOffsetX = 0;
      
      // progress == 0 (Intro): 0.08 (centrado entre el título y las tarjetas abajo)
      // progress > 0 (4 pasos): 0.25 (centrado en la mitad superior de la pantalla, arriba de "Cuautitlán...")
      const phaseT = Math.min(1, currentProgress * 8);
      targetOffsetY = 0.08 + phaseT * 0.17; 
      
      // Escala: 0.9x en intro, 1.05x en los 4 pasos
      const mobileScaleMult = 0.90 + phaseT * 0.15;
      targetScale = kf.scale * mobileScaleMult;
    }
    
    pivot.scale.setScalar(targetScale);
    pivot.position.set(targetOffsetX * frustumW, targetOffsetY * frustumH, 0);

    renderer.render(scene, camera);
  }

  function startLoop() { if (!rafId) tick(); }
  function stopLoop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }

  if (reduced) {
    const kf = interpolateKeyframes(0, CONFIG.KEYFRAMES);
    pivot.rotation.x = kf.rotX * DEG;
    pivot.rotation.y = kf.rotY * DEG;
    pivot.rotation.z = kf.rotZ * DEG;
    pivot.scale.setScalar(kf.scale);
    renderer.render(scene, camera);
  } else {
    startLoop();
  }

  const onVis = () => {
    if (!document.hidden && isVisible && !rafId && !reduced) startLoop();
    if (document.hidden) stopLoop();
  };
  document.addEventListener('visibilitychange', onVis);

  return function cleanup() {
    stopLoop(); ro.disconnect(); io.disconnect();
    document.removeEventListener('visibilitychange', onVis);
    renderer.dispose(); envMap.dispose();
  };
}
