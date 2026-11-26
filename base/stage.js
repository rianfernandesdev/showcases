// Palco 3D reaproveitável: renderer, câmera, resize, ponteiro suavizado,
// pausa fora da tela e ajuste automático de resolução quando o aparelho engasga.
import {
  WebGLRenderer,
  Scene,
  PerspectiveCamera,
  Timer,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  PMREMGenerator,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export function createStage(host, quality, opts = {}) {
  const { fov = 35, near = 0.1, far = 100, envIntensity = 0.6, transparent = true } = opts;

  const renderer = new WebGLRenderer({
    antialias: opts.antialias ?? quality.tier === 'high',
    alpha: transparent,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1;
  let dpr = quality.dpr;
  renderer.setPixelRatio(dpr);
  renderer.domElement.className = 'stage-canvas';
  host.appendChild(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 1, near, far);

  // Ambiente de reflexo gerado em código (sem HDR baixado).
  if (envIntensity > 0) {
    const pmrem = new PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = envIntensity;
    pmrem.dispose();
  }

  // Ponteiro de -1 a 1, suavizado. No celular, o toque também move.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e) => {
    const p = e.touches ? e.touches[0] : e;
    pointer.tx = (p.clientX / innerWidth) * 2 - 1;
    pointer.ty = -((p.clientY / innerHeight) * 2 - 1);
  };
  addEventListener('pointermove', onMove, { passive: true });
  addEventListener('touchmove', onMove, { passive: true });

  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stage.onResize?.(w, h);
  };
  new ResizeObserver(resize).observe(host);

  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '100px' }).observe(host);

  const timer = new Timer();
  timer.connect?.(document);
  let frames = 0;
  let slowTime = 0;
  let ready = false;

  const stage = {
    renderer,
    scene,
    camera,
    pointer,
    quality,
    onFrame: null,
    onResize: null,
    get width() {
      return host.clientWidth;
    },
    get height() {
      return host.clientHeight;
    },
  };

  renderer.setAnimationLoop((now) => {
    timer.update(now);
    if (!visible || document.hidden || stage.shouldRender?.() === false) return;
    const dt = Math.min(timer.getDelta(), 0.05);
    const k = quality.reduce ? 1 : 1 - Math.pow(0.001, dt);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    stage.onFrame?.(dt, timer.getElapsed());
    renderer.render(scene, camera);

    if (!ready) {
      ready = true;
      host.classList.add('is-ready');
    }
    // Se os primeiros 90 quadros ficarem lentos, baixa a resolução uma vez.
    if (frames < 90) {
      frames++;
      if (dt > 1 / 40) slowTime++;
      if (frames === 90 && slowTime > 45 && dpr > 1) {
        dpr = 1;
        renderer.setPixelRatio(dpr);
        resize();
      }
    }
  });

  resize();
  return stage;
}

// Projeta um ponto 3D pra coordenadas de tela do host (para rótulos em HTML).
export function toScreen(vec3, camera, w, h) {
  const v = vec3.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, behind: v.z > 1 };
}

// Converte a caixa de um elemento HTML em posição e tamanho no mundo 3D,
// num plano a `dist` da câmera. Serve pra "prender" um objeto 3D num lugar da página
// com um canvas fixo só (sem abrir um WebGL por seção).
export function anchorToElement(el, camera, viewW, viewH, dist) {
  const r = el.getBoundingClientRect();
  const halfH = Math.tan((camera.fov * Math.PI) / 360) * dist;
  const halfW = halfH * (viewW / viewH);
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  return {
    x: (cx / viewW) * 2 * halfW - halfW,
    y: -((cy / viewH) * 2 * halfH - halfH),
    size: (Math.min(r.width, r.height) / viewH) * 2 * halfH,
    onScreen: r.bottom > 0 && r.top < viewH,
  };
}
