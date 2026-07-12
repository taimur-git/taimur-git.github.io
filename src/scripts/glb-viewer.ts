/*
 * Shared Three.js GLB viewer core for ModelViewer.astro and WireframeSlider.astro.
 * Loaded via dynamic import() from each component's IntersectionObserver callback,
 * so the Three.js chunk is only fetched when a viewer nears the viewport.
 */
import * as THREE from 'three';
import { GLTFLoader }    from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/* ── angle presets: normalized direction from model center ── */
const ANGLES: Record<string, [number, number, number]> = {
  'front':         [0,    0.05, 1   ],
  'side':          [1,    0.05, 0   ],
  'top':           [0,    1,    0.01],
  'isometric':     [1,    1,    1   ],
  'three-quarter': [0.6,  0.5,  1   ],
};

function bool(v: string | undefined, def = true) {
  return v === undefined ? def : v !== 'false';
}

/* MeshStandardMaterial → MeshBasicMaterial so colours render exactly as
   authored — no lighting calculation, no dimming */
function toBasic(m: THREE.Material): THREE.MeshBasicMaterial {
  const s = m as THREE.MeshStandardMaterial;
  return new THREE.MeshBasicMaterial({
    color:        s.color?.clone() ?? new THREE.Color(1, 1, 1),
    map:          s.map      ?? null,
    alphaMap:     s.alphaMap ?? null,
    alphaTest:    s.alphaTest,
    vertexColors: s.vertexColors,
    transparent:  s.transparent,
    opacity:      s.opacity,
    side:         s.side,
    depthWrite:   s.depthWrite,
  });
}

/* flat mode: replace PBR materials in place, disposing the originals */
function swapToFlat(root: THREE.Object3D) {
  root.traverse((node) => {
    if (!(node as THREE.Mesh).isMesh) return;
    const mesh = node as THREE.Mesh;
    const oldMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const newMats = oldMats.map(toBasic);
    mesh.material = Array.isArray(mesh.material) ? newMats : newMats[0];
    oldMats.forEach((m) => m.dispose());
  });
}

/* orbit controls with the shared UX: wheel-zoom armed on first interaction
   (so the viewer doesn't hijack page scroll), autoRotate paused during
   interaction and resumed 2s after release */
function makeControls(
  cam: THREE.Camera,
  domElement: HTMLElement,
  el: HTMLElement,
  cfg: { zoom: boolean; rotate: boolean; pan: boolean; autoRotate: boolean; autoSpeed: number },
) {
  const controls = new OrbitControls(cam, domElement);
  controls.enableZoom    = false; // armed on first interaction, see below
  controls.enableRotate  = cfg.rotate;
  controls.enablePan     = cfg.pan;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  if (cfg.zoom) {
    el.addEventListener('pointerdown', () => { controls.enableZoom = true; });
    el.addEventListener('mouseleave',  () => { controls.enableZoom = false; });
  }

  if (cfg.autoRotate) {
    controls.autoRotate      = true;
    controls.autoRotateSpeed = cfg.autoSpeed * 2;
    controls.addEventListener('start', () => { controls.autoRotate = false; });
    controls.addEventListener('end',   () => {
      setTimeout(() => { controls.autoRotate = true; }, 2000);
    });
  }

  return controls;
}

/* fit camera to the object's bounding sphere from the named angle preset */
function fitCamera(
  cam: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  controls: OrbitControls,
  object: THREE.Object3D,
  angle: string,
  aspect: number,
) {
  const box    = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const r    = sphere.radius;
  const dist = r * 2.8;

  const [dx, dy, dz] = ANGLES[angle] ?? ANGLES['three-quarter'];
  const dir = new THREE.Vector3(dx, dy, dz).normalize();
  cam.position.copy(center).addScaledVector(dir, dist);
  controls.target.copy(center);

  if (cam instanceof THREE.PerspectiveCamera) {
    cam.near = dist * 0.01;
    cam.far  = dist * 10;
    cam.updateProjectionMatrix();
  } else {
    const o   = cam as THREE.OrthographicCamera;
    const pad = r * 1.3;
    o.left   = -pad * aspect;
    o.right  =  pad * aspect;
    o.top    =  pad;
    o.bottom = -pad;
    o.near   = -dist * 5;
    o.far    =  dist * 5;
    o.updateProjectionMatrix();
  }
  controls.update();

  return { box, center, r, dist };
}

/* render loop that pauses while the element is off-screen */
function runLoopWhileVisible(el: HTMLElement, tick: () => void, onResume?: () => void) {
  let rafId = 0;
  function loop() {
    rafId = requestAnimationFrame(loop);
    tick();
  }
  loop();

  new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      if (!rafId) {
        onResume?.();
        loop();
      }
    } else if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }
  }).observe(el);
}

function showLoadError(tag: string, skeleton: HTMLElement, errClass: string, err: unknown) {
  console.error(`[${tag}] load error:`, err);
  skeleton.textContent = '⚠ could not load model';
  skeleton.classList.add(errClass);
}

/* ════════════════════ ModelViewer ════════════════════ */

export function initModelViewer(el: HTMLElement) {
  const d = el.dataset;
  const cfg = {
    src:        d.src ?? '',
    camera:     d.camera as 'perspective' | 'orthographic' ?? 'perspective',
    angle:      d.angle ?? 'three-quarter',
    zoom:       bool(d.zoom),
    rotate:     bool(d.rotate),
    pan:        d.pan === 'true',
    autoRotate: d.autoRotate === 'true',
    autoSpeed:  parseFloat(d.autoSpeed ?? '1'),
    animation:  d.animation ?? '',
    background: d.background ?? 'transparent',
    shadows:    d.shadows === 'true',
    flat:       bool(d.flat),
  };

  const skeleton = el.querySelector<HTMLElement>('.mv-skeleton')!;
  const canvas   = el.querySelector<HTMLCanvasElement>('.mv-canvas')!;

  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const aspect = w / h;

  /* ── renderer ── */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: cfg.background === 'transparent',
  });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // flat mode: no tone compression so material colors appear at full brightness
  renderer.toneMapping = cfg.flat ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  if (cfg.shadows && !cfg.flat) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
  }
  if (cfg.background !== 'transparent') {
    renderer.setClearColor(new THREE.Color(cfg.background));
  }

  /* ── scene ── */
  const scene = new THREE.Scene();

  /* ── camera ── */
  let cam: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  if (cfg.camera === 'orthographic') {
    cam = new THREE.OrthographicCamera(-1, 1, 1 / aspect, -1 / aspect, 0.01, 1000);
  } else {
    cam = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
  }
  cam.position.set(0, 0, 5);

  /* ── lights ── */
  if (!cfg.flat) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 7);
    if (cfg.shadows) {
      dir.castShadow             = true;
      dir.shadow.mapSize.width   = 1024;
      dir.shadow.mapSize.height  = 1024;
      dir.shadow.camera.near     = 0.1;
      dir.shadow.camera.far      = 100;
    }
    scene.add(dir);
  }

  const controls = makeControls(cam, renderer.domElement, el, cfg);

  /* ── load GLB ── */
  new GLTFLoader().load(
    cfg.src,
    (gltf) => {
      const { box, r } = fitCamera(cam, controls, gltf.scene, cfg.angle, aspect);

      if (cfg.flat) swapToFlat(gltf.scene);

      /* shadow casting */
      if (cfg.shadows && !cfg.flat) {
        gltf.scene.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) {
            node.castShadow    = true;
            node.receiveShadow = true;
          }
        });
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(r * 20, r * 20),
          new THREE.ShadowMaterial({ opacity: 0.15 }),
        );
        ground.rotation.x  = -Math.PI / 2;
        ground.position.y  = box.min.y;
        ground.receiveShadow = true;
        scene.add(ground);
      }

      scene.add(gltf.scene);

      /* animation */
      let mixer: THREE.AnimationMixer | null = null;
      if (cfg.animation && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(gltf.scene);
        const clip = cfg.animation === '*'
          ? gltf.animations[0]
          : THREE.AnimationClip.findByName(gltf.animations, cfg.animation);
        if (clip) {
          mixer.clipAction(clip).play();
        } else {
          console.warn(`[ModelViewer] clip "${cfg.animation}" not found in ${cfg.src}`);
        }
      }

      /* show canvas */
      skeleton.style.display = 'none';
      canvas.style.display   = 'block';

      /* render loop — paused while off-screen */
      const clock = new THREE.Clock();
      runLoopWhileVisible(
        el,
        () => {
          const dt = Math.min(clock.getDelta(), 0.1);
          controls.update();
          if (mixer) mixer.update(dt);
          renderer.render(scene, cam);
        },
        () => { clock.getDelta(); }, // discard time accumulated while paused
      );

      /* resize */
      new ResizeObserver(() => {
        const nw = el.offsetWidth;
        const nh = el.offsetHeight;
        renderer.setSize(nw, nh);
        if (cam instanceof THREE.PerspectiveCamera) {
          cam.aspect = nw / nh;
          cam.updateProjectionMatrix();
        } else {
          const o  = cam as THREE.OrthographicCamera;
          const na = nw / nh;
          const pad = r * 1.3;
          o.left  = -pad * na;
          o.right =  pad * na;
          o.updateProjectionMatrix();
        }
      }).observe(el);
    },

    /* progress — no-op */
    undefined,

    (err) => showLoadError('ModelViewer', skeleton, 'mv-error', err),
  );
}

/* ════════════════════ WireframeSlider ════════════════════ */

export function initWireframeSlider(el: HTMLElement) {
  const d = el.dataset;
  const cfg = {
    src:           d.src ?? '',
    angle:         d.angle ?? 'three-quarter',
    zoom:          bool(d.zoom),
    rotate:        bool(d.rotate),
    pan:           d.pan === 'true',
    autoRotate:    d.autoRotate === 'true',
    autoSpeed:     parseFloat(d.autoSpeed ?? '1'),
    flat:          bool(d.flat),
    background:    d.background ?? 'transparent',
    initialSplit:  parseFloat(d.initialSplit ?? '0.5'),
    wireColor:     d.wireColor ?? '#ffffff',
    wireMode:      d.wireMode as 'edges' | 'tris' ?? 'edges',
    edgeThreshold: parseFloat(d.edgeThreshold ?? '15'),
  };

  const skeleton = el.querySelector<HTMLElement>('.ws-skeleton')!;
  const canvas   = el.querySelector<HTMLCanvasElement>('.ws-canvas')!;
  const divider  = el.querySelector<HTMLElement>('.ws-divider')!;

  const w = el.offsetWidth;
  const h = el.offsetHeight;
  /* CSS-pixel viewport size — setViewport/setScissor take CSS px and are
     multiplied by the pixel ratio internally by three.js */
  let vw = w;
  let vh = h;

  /* ── renderer (always alpha:true — left side may be transparent) ── */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(w, h);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping      = THREE.NoToneMapping;
  renderer.autoClear        = false; // manual clear per scissor pass

  /* ── scene & camera ── */
  const scene = new THREE.Scene();
  const cam   = new THREE.PerspectiveCamera(45, w / h, 0.01, 1000);
  cam.position.set(0, 0, 5);

  /* lights (only matter when flat=false) */
  if (!cfg.flat) {
    scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 0.8));
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(5, 10, 7);
    scene.add(dir);
  }

  const controls = makeControls(cam, canvas, el, cfg);

  /* ── slider state ── */
  let splitRatio = cfg.initialSplit;

  function updateDivider() {
    divider.style.left = `${splitRatio * 100}%`;
    divider.setAttribute('aria-valuenow', String(Math.round(splitRatio * 100)));
  }

  divider.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    if (e.key === 'ArrowLeft')       splitRatio = Math.max(0.02, splitRatio - step);
    else if (e.key === 'ArrowRight') splitRatio = Math.min(0.98, splitRatio + step);
    else return;
    e.preventDefault();
    updateDivider();
  });

  divider.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    divider.setPointerCapture(e.pointerId);

    function onMove(e: PointerEvent) {
      const rect = el.getBoundingClientRect();
      splitRatio = Math.max(0.02, Math.min(0.98, (e.clientX - rect.left) / rect.width));
      updateDivider();
    }
    function onUp(e: PointerEvent) {
      divider.releasePointerCapture(e.pointerId);
      divider.removeEventListener('pointermove', onMove);
    }
    divider.addEventListener('pointermove', onMove);
    divider.addEventListener('pointerup',   onUp, { once: true });
    divider.addEventListener('pointercancel', onUp, { once: true });
  });

  /* ── load GLB ── */
  new GLTFLoader().load(
    cfg.src,
    (gltf) => {
      fitCamera(cam, controls, gltf.scene, cfg.angle, w / h);

      /* ── solid model (flat BasicMaterial swap) ── */
      const modelRoot = gltf.scene;
      if (cfg.flat) swapToFlat(modelRoot);
      scene.add(modelRoot);

      /* ── wireframe group (all in world space) ── */
      modelRoot.updateWorldMatrix(true, true);
      const wireGroup = new THREE.Group();

      modelRoot.traverse((node) => {
        if (!(node as THREE.Mesh).isMesh) return;
        const mesh = node as THREE.Mesh;
        if (!mesh.geometry.getAttribute('position')) return;

        const worldGeo = mesh.geometry.clone();
        worldGeo.applyMatrix4(mesh.matrixWorld);

        const lineGeo = cfg.wireMode === 'tris'
          ? new THREE.WireframeGeometry(worldGeo)
          : new THREE.EdgesGeometry(worldGeo, cfg.edgeThreshold);
        worldGeo.dispose();

        wireGroup.add(new THREE.LineSegments(
          lineGeo,
          new THREE.LineBasicMaterial({ color: new THREE.Color(cfg.wireColor) }),
        ));
      });
      scene.add(wireGroup);

      /* show canvas + divider */
      skeleton.style.display = 'none';
      canvas.style.display   = 'block';
      divider.style.display  = 'block';

      /* ── render loop — paused while off-screen ── */
      runLoopWhileVisible(el, () => {
        controls.update();

        const split = Math.round(splitRatio * vw);

        renderer.setScissorTest(true);

        /* left: solid model */
        modelRoot.visible  = true;
        wireGroup.visible  = false;
        renderer.setScissor(0, 0, split, vh);
        renderer.setViewport(0, 0, vw, vh);
        if (cfg.background === 'transparent') {
          renderer.setClearColor(0x000000, 0);
        } else {
          renderer.setClearColor(new THREE.Color(cfg.background), 1);
        }
        renderer.clear();
        renderer.render(scene, cam);

        /* right: wireframe on black */
        modelRoot.visible  = false;
        wireGroup.visible  = true;
        renderer.setScissor(split, 0, vw - split, vh);
        renderer.setClearColor(0x000000, 1);
        renderer.clear();
        renderer.render(scene, cam);

        renderer.setScissorTest(false);
      });

      /* resize */
      new ResizeObserver(() => {
        vw = el.offsetWidth;
        vh = el.offsetHeight;
        renderer.setSize(vw, vh);
        cam.aspect = vw / vh;
        cam.updateProjectionMatrix();
      }).observe(el);
    },

    undefined,

    (err) => showLoadError('WireframeSlider', skeleton, 'ws-error', err),
  );
}
