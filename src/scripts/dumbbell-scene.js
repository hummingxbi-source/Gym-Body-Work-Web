// dumbbell-scene.js — Three.js procedural dumbbell, no GLB, no HDR file
// Importa solo lo necesario para tree-shaking correcto con Vite.
import {
  WebGLRenderer, Scene, PerspectiveCamera,
  Group, Mesh,
  CylinderGeometry, LatheGeometry,
  MeshStandardMaterial,
  DirectionalLight,
  Vector2, Color,
  ACESFilmicToneMapping, SRGBColorSpace,
  PMREMGenerator, CanvasTexture, RepeatWrapping,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

// ═══════════════════════════════════════════════════════
// TEXTURAS PROCEDURALES (canvas → CanvasTexture)
// ═══════════════════════════════════════════════════════

/** Normal map de moleteado en diamante para el mango */
function buildKnurlNormal(size = 512, pitch = 13) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#8080ff'; // normal plana (128,128,255)
  ctx.fillRect(0, 0, size, size);

  // Ranuras profundas en dos diagonales → patrón rombo
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = 'rgba(38,38,145,0.92)';
  for (let i = -size; i < size * 2; i += pitch) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + size, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i - size, size); ctx.stroke();
  }
  // Brillo suave en la cresta opuesta
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(168,168,240,0.38)';
  for (let i = -size; i < size * 2; i += pitch) {
    ctx.beginPath(); ctx.moveTo(i + 1.8, 0); ctx.lineTo(i + size + 1.8, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(i + 1.8, 0); ctx.lineTo(i - size + 1.8, size); ctx.stroke();
  }

  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(7, 2);
  return t;
}

/** Mapa de color de hierro fundido: gris oscuro + arañazos + poros */
function buildIronColor(size = 512) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#454545';
  ctx.fillRect(0, 0, size, size);

  // Micro-arañazos
  for (let i = 0; i < 2200; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const len = Math.random() * 40 + 1;
    const a = Math.random() * Math.PI;
    const v = Math.floor(Math.random() * 62 + 54);
    ctx.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.07 + Math.random() * 0.28) + ')';
    ctx.lineWidth = Math.random() * 1.5 + 0.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    ctx.stroke();
  }
  // Poros de fundición
  for (let i = 0; i < 300; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    ctx.fillStyle = 'rgba(14,14,14,' + (0.18 + Math.random() * 0.48) + ')';
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 3.2 + 0.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Mapa de rugosidad con variación: base ~0.55, variación ±0.14 */
function buildRoughMap(size = 256) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const BASE = 138;
  ctx.fillStyle = 'rgb(' + BASE + ',' + BASE + ',' + BASE + ')';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1200; i++) {
    const x = Math.random() * size, y = Math.random() * size;
    const v = Math.max(0, Math.min(255, Math.floor(BASE + (Math.random() - 0.5) * 70)));
    ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
    ctx.beginPath();
    ctx.arc(x, y, Math.random() * 7 + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  const t = new CanvasTexture(cv);
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

// ═══════════════════════════════════════════════════════
// PERFIL DE DISCO (LatheGeometry)
// ═══════════════════════════════════════════════════════

/**
 * Genera el perfil 2D (radio, y) para un disco de mancuerna.
 * LatheGeometry gira este perfil 360° alrededor de Y.
 * Después de rotateX(PI/2), el disco queda perpendicular al eje Z.
 *
 * Características:
 *  - Orificio central para la varilla (r=0.077)
 *  - Cara ligeramente hundida (bowl) → realismo de fundición
 *  - Bisel en el borde exterior → highlight de metal pulido
 */
function discProfile(outerR, thickness) {
  const h  = thickness / 2;
  const hR = 0.077;                            // radio del orificio interior
  const bv = Math.min(0.024, outerR * 0.048); // tamaño del bisel de borde
  const dp = thickness * 0.065;               // profundidad del hundimiento central

  return [
    new Vector2(hR,              -h            ), // borde interior inferior
    new Vector2(hR + 0.04,       -h + dp * 0.4 ), // inicio del hundimiento
    new Vector2(outerR * 0.55,   -h + dp       ), // punto medio del hundimiento
    new Vector2(outerR - bv * 2, -h + dp * 0.1 ), // transición hacia borde
    new Vector2(outerR - bv,     -h            ), // inicio del bisel
    new Vector2(outerR,          -h + bv       ), // borde exterior inferior
    new Vector2(outerR,           h - bv       ), // borde exterior superior
    new Vector2(outerR - bv,      h            ), // fin del bisel
    new Vector2(outerR - bv * 2,  h - dp * 0.1 ), // transición hacia interior
    new Vector2(outerR * 0.55,    h - dp       ), // punto medio superior
    new Vector2(hR + 0.04,        h - dp * 0.4 ), // fin del hundimiento
    new Vector2(hR,               h            ), // borde interior superior
  ];
}

// ═══════════════════════════════════════════════════════
// INICIALIZADOR PRINCIPAL
// ═══════════════════════════════════════════════════════

export function initDumbbellScene(canvas) {

  // ── Renderer ──────────────────────────────────────────
  const isMobile = window.innerWidth < 768;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isMobile ? 1.5 : 2.0));
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.toneMapping    = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace   = SRGBColorSpace;
  renderer.shadowMap.enabled  = false; // sin sombras proyectadas

  // ── Escena y cámara ───────────────────────────────────
  const scene  = new Scene();
  scene.background = new Color('#0b0b0c');

  const camera = new PerspectiveCamera(42, canvas.clientWidth / canvas.clientHeight, 0.01, 50);
  camera.position.set(0, 0.52, 4.3);
  camera.lookAt(0, 0, 0);

  // ── Entorno procedural (sin HDR descargado) ───────────
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  // ── Iluminación ───────────────────────────────────────
  // Luz de borde roja suave (back-left) → silueta dramática
  const rimL = new DirectionalLight('#ff1505', 2.4);
  rimL.position.set(-3, 0.8, -3);
  scene.add(rimL);

  // Relleno frío tenue (front-right)
  const fillL = new DirectionalLight('#8ab4ff', 0.45);
  fillL.position.set(3, 1, 2);
  scene.add(fillL);

  // Key suave desde arriba
  const keyL = new DirectionalLight('#ffffff', 0.58);
  keyL.position.set(0.6, 4, 1.5);
  scene.add(keyL);

  // ── Texturas ──────────────────────────────────────────
  const ironMap  = buildIronColor(512);
  const roughMap = buildRoughMap(256);
  const knurlMap = buildKnurlNormal(512, 13);

  // ── Materiales ────────────────────────────────────────
  // Hierro fundido de los discos
  const ironMat = new MeshStandardMaterial({
    map:          ironMap,
    roughnessMap: roughMap,
    color:        new Color('#505050'),
    metalness:    0.85,
    roughness:    0.55,
  });

  // Acero del mango con moleteado (normal map canvas)
  const handleMat = new MeshStandardMaterial({
    color:       new Color('#a3a3a8'),
    metalness:   0.92,
    roughness:   0.22,
    normalMap:   knurlMap,
    normalScale: new Vector2(0.88, 0.88),
  });

  // Acero liso para collares de transición y varilla
  const steelMat = new MeshStandardMaterial({
    color:     new Color('#b4b4b8'),
    metalness: 0.96,
    roughness: 0.15,
  });

  // Seguro (collar) rojo mate — metalness bajo per spec
  const redMat = new MeshStandardMaterial({
    color:     new Color('#8f1d1d'),
    metalness: 0.22,
    roughness: 0.65,
  });

  // ── Ensamblaje de la mancuerna ────────────────────────
  const dumbbell = new Group();
  scene.add(dumbbell);

  // Constantes de proporciones
  const HANDLE_HALF = 0.275; // mitad del mango (largo total 0.55)
  const DISC_GAP    = 0.012; // ranura visible entre discos

  // Mango central moleteado (eje Z)
  const handleGeo = new CylinderGeometry(0.085, 0.085, HANDLE_HALF * 2, 28);
  handleGeo.rotateX(Math.PI / 2);
  dumbbell.add(new Mesh(handleGeo, handleMat));

  // Especificaciones de discos: [radioExterior, grosor]
  // Ordenados de interior (más grande) a exterior (más pequeño)
  const DISC_DEFS = [
    [0.500, 0.200], // disco grande
    [0.420, 0.140], // disco mediano
    [0.345, 0.110], // disco pequeño
  ];

  // Construir ambos lados simétricamente
  for (const sign of [1, -1]) {
    const side = new Group();

    // 1. Collar de transición de acero en extremo del mango
    //    Frustum que amplía del radio del mango (0.085) al área de discos (0.115)
    //    Para sign>0: extremo +Z es el ancho (hacia afuera)
    //    Para sign<0: extremo -Z es el ancho (hacia afuera)
    const coneTopR = sign > 0 ? 0.115 : 0.085; // top = +Y → +Z tras rotateX
    const coneBotR = sign > 0 ? 0.085 : 0.115; // bot = -Y → -Z tras rotateX
    const transGeo = new CylinderGeometry(coneTopR, coneBotR, 0.030, 20);
    transGeo.rotateX(Math.PI / 2);
    const transMesh = new Mesh(transGeo, steelMat);
    transMesh.position.z = sign * (HANDLE_HALF + 0.015);
    side.add(transMesh);

    // 2. Varilla roscada delgada que atraviesa discos, collar y sobresale
    const ROD_START = HANDLE_HALF + 0.030; // justo tras collar de transición
    const ROD_END   = 0.995;               // extremo visible (varilla roscada)
    const rodLen    = ROD_END - ROD_START;
    const rodGeo    = new CylinderGeometry(0.069, 0.069, rodLen, 16);
    rodGeo.rotateX(Math.PI / 2);
    const rodMesh   = new Mesh(rodGeo, steelMat);
    rodMesh.position.z = sign * (ROD_START + rodLen / 2);
    side.add(rodMesh);

    // 3. Pila de discos
    let cursor = ROD_START; // posición Z de la cara interior del siguiente disco

    for (const [r, t] of DISC_DEFS) {
      const pts = discProfile(r, t);
      const geo = new LatheGeometry(pts, 64);
      geo.rotateX(Math.PI / 2);
      const mesh = new Mesh(geo, ironMat);
      mesh.position.z = sign * (cursor + t / 2);
      side.add(mesh);
      cursor += t + DISC_GAP;
    }

    // 4. Seguro octogonal rojo (8 lados per spec)
    const COLLAR_T   = 0.100;
    const COLLAR_GAP = 0.010;
    const collarGeo  = new CylinderGeometry(0.160, 0.160, COLLAR_T, 8);
    collarGeo.rotateX(Math.PI / 2);
    // Rotar 22.5° para alinear arista (no cara plana) hacia la cámara → más dinámico
    collarGeo.rotateZ(Math.PI / 8);
    const collarMesh = new Mesh(collarGeo, redMat);
    collarMesh.position.z = sign * (cursor + COLLAR_GAP + COLLAR_T / 2);
    side.add(collarMesh);

    dumbbell.add(side);
  }

  // Ligera inclinación en X para perspectiva más natural
  dumbbell.rotation.x = 0.13;

  // ── Loop de animación ─────────────────────────────────
  let rafId;
  const animate = () => {
    rafId = requestAnimationFrame(animate);
    dumbbell.rotation.y += 0.0038;
    renderer.render(scene, camera);
  };
  animate();

  // ── Resize reactivo ───────────────────────────────────
  const onResize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  const ro = new ResizeObserver(onResize);
  ro.observe(canvas);

  // ── Limpieza ──────────────────────────────────────────
  return () => {
    cancelAnimationFrame(rafId);
    ro.disconnect();
    renderer.dispose();
    [ironMat, handleMat, steelMat, redMat].forEach(m => m.dispose());
    [ironMap, roughMap, knurlMap].forEach(t => t.dispose());
  };
}
