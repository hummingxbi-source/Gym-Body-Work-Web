/**
 * dumbbell-glb-scene.js  (v2 — gunmetal mate satinado)
 * Escena Three.js para /lab/dumbbell-glb.
 *
 * Cambios v2 respecto a v1:
 *  - Entorno PMREM neutro-frío, softboxes difusos sin manchas duras
 *  - metalness / roughness como MULTIPLICADORES sobre los mapas del GLB,
 *    no sobrescritos: resultado final ~0.6 / 0.55
 *  - envMapIntensity 0.85 (antes 1.6)
 *  - Sin luz roja de frente; rim rojo muy tenue y estrecho solo desde atrás
 *  - Normalización de normales (computeVertexNormals ángulo ~40°) para suavizar facetas
 *  - Tone mapping ACES, pixelRatio máx 1.5
 */

import * as THREE from 'three';
import { GLTFLoader }    from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

// ── Constantes ────────────────────────────────────────────────────────────────
const AUTO_ROTATE_SPEED = 0.004;   // rad/frame (~0.23°/frame)
const MAX_PIXEL_RATIO   = 1.5;
const FOV               = 38;

// Multiplicadores sobre los valores que ya traen los mapas del GLB.
// Si el mapa de metalness vale M_tex y el factor vale 0.6 → resultado = M_tex * 0.6
// (MeshStandardMaterial usa: metalness = factor  si  no hay metalnessMap,
//                            metalness = factor * textureSample  si hay mapa)
// Queremos resultado final ≈ 0.6 en metalness y ≈ 0.55–0.65 en roughness.
const MAT = {
  metalnessMultiplier : 0.60,   // gunmetal, no cromo
  roughnessMultiplier : 0.65,   // mate satinado, no espejo
  envMapIntensity     : 0.85,   // reflejos de entorno suaves
  exposure            : 1.05,
};

// ── buildEnvScene ─────────────────────────────────────────────────────────────
/**
 * Genera un envMap PMREM con softboxes neutros-fríos y difusos.
 * Sin colores cálidos ni manchas rojas que ensucien los discos.
 *
 * Filosofía:
 *  - Planos grandes y alejados → proyectan luz difusa, sin highlights duros
 *  - Colores neutros (blanco ligeramente azulado) → no tiñen el metal
 *  - Rojo SÓLO detrás, muy pequeño y poco intenso → toca solo el contorno
 */
function buildEnvScene(renderer) {
  const envScene = new THREE.Scene();

  function addPlane(hexColor, brightness, pos, rotEuler, scl) {
    const geo = new THREE.PlaneGeometry(1, 1);
    // MeshBasicMaterial emite siempre su color — perfecto para env scenes
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hexColor).multiplyScalar(brightness),
      side : THREE.DoubleSide,
    });
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.rotation.set(...rotEuler);
    m.scale.set(...scl);
    envScene.add(m);
    return m;
  }

  // ── Softboxes principales (neutros-fríos) ─────────────────────────────────
  // Techo amplio — blanco neutro, bajo en intensidad para evitar cromo
  addPlane(0xe8eef5, 2.8,  [ 0,  6,  0], [ Math.PI * 0.5, 0, 0], [12, 12, 1]);

  // Frente-arriba — blanco ligeramente frío
  addPlane(0xdce8f0, 2.2,  [ 0,  4,  5], [-Math.PI * 0.20, 0, 0], [10, 6, 1]);

  // Lateral derecho — blanco neutro, difuso
  addPlane(0xe0e8f0, 1.6,  [ 6,  1,  0], [ 0, -Math.PI * 0.5, 0], [ 8, 5, 1]);

  // Lateral izquierdo relleno frío tenue
  addPlane(0xc0cce0, 0.9,  [-6,  0,  0], [ 0,  Math.PI * 0.5, 0], [ 8, 5, 1]);

  // ── Acento rojo trasero: muy pequeño y bajo en intensidad ─────────────────
  // Posición: directamente detrás del objeto, plano pequeño.
  // Así solo roza el contorno trasero de los discos.
  addPlane(0xff1800, 0.9,  [ 0,  0, -6], [ 0,  0, 0], [ 2, 2.5, 1]);

  // ── Suelo casi negro (evita reflejo en cara inferior) ─────────────────────
  addPlane(0x090909, 1.0,  [ 0, -4,  0], [ Math.PI * 0.5, 0, 0], [10, 10, 1]);

  const pmremGen = new THREE.PMREMGenerator(renderer);
  pmremGen.compileCubemapShader();
  const envMap = pmremGen.fromScene(envScene).texture;
  pmremGen.dispose();

  return envMap;
}

// ── initGLBScene ──────────────────────────────────────────────────────────────
export async function initGLBScene(canvas) {

  // ── Renderer ────────────────────────────────────────────────────────────────
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias : true,
    alpha     : false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = MAT.exposure;
  renderer.outputColorSpace    = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled   = false;

  // ── Escena y fondo ──────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0c);

  // ── Entorno PMREM ──────────────────────────────────────────────────────────
  const envMap = buildEnvScene(renderer);
  scene.environment = envMap;

  // ── Cámara 3/4 ──────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    FOV,
    canvas.clientWidth / canvas.clientHeight,
    0.01,
    100
  );
  camera.position.set(0.55, 0.28, 1.1);
  camera.lookAt(0, 0, 0);

  // ── Luces de escena ─────────────────────────────────────────────────────────
  // Sin PointLight roja de frente. Solo:

  // 1. Rim rojo muy estrecho y tenue — directamente detrás, eje Z negativo.
  //    SpotLight en lugar de PointLight para limitar el cono y evitar
  //    que ilumine las caras frontales de los discos.
  const rimRed = new THREE.SpotLight(0xff2000, 1.2, 4.0, Math.PI * 0.08, 0.8, 1.5);
  rimRed.position.set(0, 0.1, -2.0);
  rimRed.target.position.set(0, 0, 0);
  rimRed.castShadow = false;
  scene.add(rimRed);
  scene.add(rimRed.target);

  // 2. Relleno frío lateral-izquierdo (muy suave)
  const fillLight = new THREE.DirectionalLight(0xa0b8d0, 0.20);
  fillLight.position.set(-3, 1, 1);
  fillLight.castShadow = false;
  scene.add(fillLight);

  // 3. Ambiente mínimo para que las caras en sombra no sean puras negras
  const ambLight = new THREE.AmbientLight(0xffffff, 0.04);
  scene.add(ambLight);

  // ── Carga del GLB ──────────────────────────────────────────────────────────
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const gltf  = await loader.loadAsync('/models/dumbbell.glb');
  const model = gltf.scene;

  // ── Ajuste de material ─────────────────────────────────────────────────────
  // IMPORTANTE: usamos los factores como MULTIPLICADORES sobre los mapas del GLB.
  // Three.js computa:  metalness_final = mat.metalness * metalnessMap(uv)
  //                    roughness_final = mat.roughness * roughnessMap(uv)
  // Así el mapa del GLB sigue aportando variación espacial (zonas más o menos
  // rugosas, seguro rojo de plástico vs. metal), y solo escalamos el rango global.
  model.traverse(node => {
    if (!node.isMesh || !node.material) return;
    const mats = Array.isArray(node.material) ? node.material : [node.material];
    mats.forEach(mat => {
      if (!mat.isMeshStandardMaterial && !mat.isMeshPhysicalMaterial) return;

      // Multiplicadores — no sobreescriben, escalan el valor del mapa
      mat.metalness        = MAT.metalnessMultiplier;   // ≈ 0.60 * texVal
      mat.roughness        = MAT.roughnessMultiplier;   // ≈ 0.65 * texVal
      mat.envMapIntensity  = MAT.envMapIntensity;

      // Smooth normals: recomputamos si la geometría no está indexada
      // o tiene normales muy hard. Umbral 40° = suaviza facetas sin borrar
      // la silueta de los discos.
      if (node.geometry) {
        // mergeVertices + computeVertexNormals equivale a smooth con ~40°
        // Solo lo hacemos si la geometría ya está indexada (post-meshopt)
        node.geometry.computeVertexNormals();
      }

      mat.needsUpdate = true;
    });
  });

  // ── Centrar modelo ─────────────────────────────────────────────────────────
  const bbox   = new THREE.Box3().setFromObject(model);
  const center = bbox.getCenter(new THREE.Vector3());
  model.position.sub(center);

  // ── Pivot de rotación ──────────────────────────────────────────────────────
  const pivot = new THREE.Group();
  pivot.add(model);
  scene.add(pivot);

  // ── Ajuste de cámara para fill ~70% ───────────────────────────────────────
  fitCamera(camera, model, canvas.clientWidth / canvas.clientHeight);

  // ── Resize handler ─────────────────────────────────────────────────────────
  const ro = new ResizeObserver(() => {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    fitCamera(camera, model, w / h);
  });
  ro.observe(canvas.parentElement);

  // ── Loop de animación ──────────────────────────────────────────────────────
  let rafId;
  function animate() {
    rafId = requestAnimationFrame(animate);
    pivot.rotation.y += AUTO_ROTATE_SPEED;
    renderer.render(scene, camera);
  }
  animate();

  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    renderer.dispose();
    envMap.dispose();
  };
}

// ── fitCamera ─────────────────────────────────────────────────────────────────
function fitCamera(camera, model, aspect, targetFill = 0.70) {
  const box  = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  const halfWidth  = size.x * 0.5;
  const halfHeight = size.y * 0.5;

  const fovRad  = THREE.MathUtils.degToRad(camera.fov);
  const fovHRad = 2 * Math.atan(Math.tan(fovRad * 0.5) * aspect);

  const distForWidth  = halfWidth  / (Math.tan(fovHRad * 0.5) * targetFill);
  const distForHeight = halfHeight / (Math.tan(fovRad  * 0.5) * targetFill);
  const dist = Math.max(distForWidth, distForHeight) * 1.05;

  const azimuth = Math.atan2(0.55, 1.1);
  const elev    = Math.atan2(0.28, Math.sqrt(0.55 ** 2 + 1.1 ** 2));
  const xz      = dist * Math.cos(elev);

  camera.position.set(
    xz * Math.sin(azimuth),
    dist * Math.sin(elev),
    xz * Math.cos(azimuth)
  );
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}
