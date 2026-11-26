// Instrumento da Meridia: um relógio solar de 24 h em 3D.
// Anel = horas do dia (cor do céu), ponteiro = hora atual em POA,
// barras e pontos mudam de forma a cada etapa. Na etapa 3, as camadas se separam.
import {
  Group,
  Mesh,
  TorusGeometry,
  CircleGeometry,
  RingGeometry,
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
  Color,
  AdditiveBlending,
  MathUtils,
} from 'three';
import { createStage } from '../base/stage.js';
import { glow } from '../base/textures.js';
import { nowInPOA } from '../base/ui.js';
import { smooth, clamp } from '../base/scroll.js';

// Cor do céu por hora (0h a 23h)
const SKY = [
  '#25407e', '#233b78', '#223672', '#25397a', '#2f4c95', '#5b5fb0',
  '#ff7a3d', '#ff9a2e', '#ffb020', '#ffc229', '#ffd23a', '#ffdd4a',
  '#ffe15a', '#ffd84a', '#ffc934', '#ffb020', '#ff9228', '#ff6a2b',
  '#ff4a3d', '#c8457a', '#6a4fb0', '#3d56a8', '#2c4b95', '#273f82',
];

// Ângulo da hora: meio-dia no topo, meia-noite embaixo, sentido horário.
const hourAngle = (h) => Math.PI / 2 - ((h - 12) / 24) * Math.PI * 2;

const BARS = 44;
const DOTS = 36;

// Larguras das barras (0..1) em cada etapa. u vai de -1 (baixo) a 1 (cima).
const SHAPES = [
  (u) => Math.sqrt(Math.max(0, 1 - u * u)), // 0 · o sol
  (u) => 1 - Math.abs(u), // 1 · projeto: losango
  (u, i) => (Math.abs(u) < 0.82 ? (i % 4 === 3 ? 0.04 : i % 4 === 2 ? 0.42 : 0.66) : 0), // 2 · documento
  (u) => 0.18 + 0.82 * Math.floor(((u + 1) / 2) * 5) / 4, // 3 · camadas/escada
  (u, i, t) => clamp(0.55 + 0.32 * Math.sin(u * 7 + t * 2.2) * Math.cos(u * 2 - t), 0.05, 1), // 4 · sinal
];

// Caminhos dos pontos em cada etapa. x vai de -1 a 1.
const PATHS = [
  (x) => [x * 0.62, Math.sqrt(Math.max(0, 1 - x * x)) * 0.5 - 0.12], // arco do sol no céu
  (x) => [x * 0.62, Math.exp(-((x / 0.42) ** 2)) * 0.62 - 0.32], // curva de geração do dia
  (x) => [x * 0.62, x * 0.5], // processo andando
  (x) => [x * 0.62, Math.tanh(x * 3) * 0.42], // obra: degrau suave
  (x, t) => [x * 0.62, 0.12 * Math.sin(x * 14 + t * 3) + 0.18 * Math.sin(x * 4 - t)], // leitura ao vivo
];

export function startScene(host, quality, state) {
  const stage = createStage(host, quality, { fov: 28, envIntensity: 0 });
  const { scene, camera, pointer } = stage;
  const reduce = quality.reduce;
  const instrument = new Group();
  scene.add(instrument);

  // Camadas (z separado pra dar profundidade quando inclina)
  const layers = {
    disc: new Group(),
    ticks: new Group(),
    ring: new Group(),
    bars: new Group(),
    dots: new Group(),
  };
  Object.values(layers).forEach((g) => instrument.add(g));

  // Disco de fundo
  const disc = new Mesh(new CircleGeometry(0.86, 96), new MeshBasicMaterial({ color: 0x222120 }));
  const discEdge = new Mesh(new RingGeometry(0.855, 0.862, 128), new MeshBasicMaterial({ color: 0x3a3836 }));
  const inner = new Mesh(new RingGeometry(0.705, 0.708, 128), new MeshBasicMaterial({ color: 0x34322f }));
  layers.disc.add(disc, discEdge, inner);

  // Marcas: 120 traços; os que já passaram no dia acendem
  const tickGeo = new BoxGeometry(0.004, 0.05, 0.004);
  const tickMat = new MeshBasicMaterial({ color: 0xffffff });
  const ticks = new InstancedMesh(tickGeo, tickMat, 120);
  const dummy = new Object3D();
  const dim = new Color(0x4a4744);
  const lit = new Color(0xffb020);
  for (let i = 0; i < 120; i++) {
    const a = hourAngle((i / 120) * 24);
    dummy.position.set(Math.cos(a) * 0.78, Math.sin(a) * 0.78, 0);
    dummy.rotation.z = a - Math.PI / 2;
    dummy.scale.set(1, i % 5 === 0 ? 1.8 : 1, 1);
    dummy.updateMatrix();
    ticks.setMatrixAt(i, dummy.matrix);
    ticks.setColorAt(i, dim);
  }
  layers.ticks.add(ticks);

  // Anel das horas: 24 arcos, com brilho somado por cima
  const gap = 0.035;
  const arcs = SKY.map((hex, h) => {
    const arcLen = (Math.PI * 2) / 24 - gap;
    const g = new Group();
    const col = new Color(hex);
    const core = new Mesh(new TorusGeometry(1, 0.011, 6, 24, arcLen), new MeshBasicMaterial({ color: col }));
    const halo = new Mesh(
      new TorusGeometry(1, 0.03, 6, 24, arcLen),
      new MeshBasicMaterial({ color: col, transparent: true, opacity: 0.18, blending: AdditiveBlending, depthWrite: false }),
    );
    g.add(core, halo);
    // arco vai da hora h até h+1 no sentido horário
    g.rotation.z = hourAngle(h + 1) + gap / 2;
    layers.ring.add(g);
    return { g, halo, core };
  });

  // Ponteiro da hora atual
  const hand = new Group();
  const handLine = new Mesh(new PlaneGeometry(0.006, 0.86), new MeshBasicMaterial({ color: 0xecebe7 }));
  handLine.position.y = 0.43;
  const handTip = new Mesh(new SphereGeometry(0.022, 16, 12), new MeshBasicMaterial({ color: 0xecebe7 }));
  handTip.position.y = 1;
  hand.add(handLine, handTip);
  layers.ring.add(hand);

  // Barras horizontais centrais
  const barMat = new MeshBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: 0.92 });
  const bars = new InstancedMesh(new PlaneGeometry(1, 1), barMat, BARS);
  layers.bars.add(bars);
  const barColorA = new Color(0xff4a3d);
  const barColorB = new Color(0xffb020);

  // Pontos + um "sol" que percorre o caminho
  const dotGeo = new SphereGeometry(0.014, 10, 8);
  const dots = new InstancedMesh(dotGeo, new MeshBasicMaterial({ color: 0xff6a2b }), DOTS);
  layers.dots.add(dots);
  const sun = new Mesh(new SphereGeometry(0.035, 20, 14), new MeshBasicMaterial({ color: 0xfff3d6 }));
  const sunGlow = new Mesh(
    new PlaneGeometry(0.4, 0.4),
    new MeshBasicMaterial({ map: glow(128, '255,190,90'), transparent: true, blending: AdditiveBlending, depthWrite: false }),
  );
  sun.add(sunGlow);
  layers.dots.add(sun);

  // Enquadra o instrumento na caixa disponível
  stage.onResize = (w, h) => {
    const half = MathUtils.degToRad(camera.fov / 2);
    const need = 1.28;
    const zh = need / Math.tan(half);
    const zw = need / (Math.tan(half) * (w / h));
    camera.userData.baseZ = Math.max(zh, zw);
  };
  stage.onResize(stage.width, stage.height);

  const tmpCol = new Color();
  let lastLit = -1;

  stage.onFrame = (dt, t) => {
    const tt = reduce ? 0 : t;
    const s = state.p * 4; // 0..4
    const i0 = Math.min(3, Math.floor(s));
    const f = smooth(clamp(s - i0, 0, 1));
    const i1 = Math.min(4, i0 + 1);

    // Separação das camadas na etapa 3 (instalação) e inclinação
    const explode = smooth(clamp(1 - Math.abs(s - 3) * 1.4, 0, 1));
    const z = 0.04 + explode * 0.32;
    layers.disc.position.z = -z;
    layers.ticks.position.z = 0;
    layers.ring.position.z = z * 0.5;
    layers.bars.position.z = z;
    layers.dots.position.z = z * 1.6;

    instrument.rotation.x = -pointer.y * 0.3 - explode * 0.55;
    instrument.rotation.y = pointer.x * 0.4 + explode * 0.45;
    instrument.rotation.z = (reduce ? 0 : Math.sin(t * 0.2) * 0.01) - state.p * 0.25;
    camera.position.set(0, 0, (camera.userData.baseZ || 6) * (1 + explode * 0.12));
    camera.lookAt(0, 0, 0);

    // Hora atual em POA: ponteiro, arco aceso e traços do dia
    const { h, m, s: sec } = nowInPOA();
    const hours = h + m / 60 + sec / 3600;
    hand.rotation.z = hourAngle(hours) - Math.PI / 2;
    arcs.forEach((a, k) => {
      const on = k === h;
      a.halo.material.opacity = on ? 0.55 + (reduce ? 0 : Math.sin(t * 3) * 0.12) : 0.16;
      a.halo.scale.setScalar(1);
      a.core.scale.z = on ? 2.4 : 1;
    });
    const litCount = Math.floor((hours / 24) * 120);
    if (litCount !== lastLit) {
      lastLit = litCount;
      for (let k = 0; k < 120; k++) ticks.setColorAt(k, k <= litCount ? lit : dim);
      ticks.instanceColor.needsUpdate = true;
    }

    // Barras: interpola entre a forma da etapa atual e a próxima
    for (let k = 0; k < BARS; k++) {
      const u = (k / (BARS - 1)) * 2 - 1;
      const w0 = SHAPES[i0](u, k, tt);
      const w1 = SHAPES[i1](u, k, tt);
      const w = MathUtils.lerp(w0, w1, f) * 0.62 + 0.002;
      dummy.position.set(0, u * 0.6, 0);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(w * 2, 0.0065, 1);
      dummy.updateMatrix();
      bars.setMatrixAt(k, dummy.matrix);
      tmpCol.copy(barColorA).lerp(barColorB, (u + 1) / 2);
      bars.setColorAt(k, tmpCol);
    }
    bars.instanceMatrix.needsUpdate = true;
    bars.instanceColor.needsUpdate = true;

    // Pontos
    for (let k = 0; k < DOTS; k++) {
      const x = (k / (DOTS - 1)) * 2 - 1;
      const [x0, y0] = PATHS[i0](x, tt);
      const [x1, y1] = PATHS[i1](x, tt);
      dummy.position.set(MathUtils.lerp(x0, x1, f), MathUtils.lerp(y0, y1, f), 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      dots.setMatrixAt(k, dummy.matrix);
    }
    dots.instanceMatrix.needsUpdate = true;
    const run = reduce ? 0.5 : (t * 0.12) % 1;
    const sx = run * 2 - 1;
    const [a0, b0] = PATHS[i0](sx, tt);
    const [a1, b1] = PATHS[i1](sx, tt);
    sun.position.set(MathUtils.lerp(a0, a1, f), MathUtils.lerp(b0, b1, f), 0.01);
  };
}
