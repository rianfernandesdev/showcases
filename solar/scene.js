// Cena do solar: um módulo fotovoltaico de 600 W (120 meias-células) feito em código.
// Cada etapa do tour tem uma pose:
// 0 · abertura: placa inclinada pegando sol
// 1 · projeto: de frente, com uma sombra varrendo as células (simulação hora a hora)
// 2 · homologação: virada, mostrando a etiqueta técnica e a caixa de junção
// 3 · instalação: desmonta em camadas (moldura, vidro, EVA, células, EVA, fundo)
// 4 · monitoramento: montada, com energia correndo pelas fitas
import {
  Group,
  Mesh,
  BoxGeometry,
  PlaneGeometry,
  CylinderGeometry,
  TubeGeometry,
  CatmullRomCurve3,
  Vector3,
  MeshStandardMaterial,
  MeshPhysicalMaterial,
  MeshBasicMaterial,
  SpriteMaterial,
  Sprite,
  HemisphereLight,
  DirectionalLight,
  CanvasTexture,
  SRGBColorSpace,
  RepeatWrapping,
  ClampToEdgeWrapping,
  AdditiveBlending,
  MathUtils,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createStage, toScreen } from '../base/stage.js';
import { glow } from '../base/textures.js';
import { smooth, clamp } from '../base/scroll.js';

// Medidas (1 unidade ≈ 1 m): módulo 1,13 × 2,10 m, moldura de 35 mm
const W = 1.13;
const H = 2.1;
const FW = 0.035; // largura da moldura
const FD = 0.05; // profundidade da moldura
const IW = W - FW * 2; // área interna
const IH = H - FW * 2;
const COLS = 6;
const ROWS = 20; // meias-células: 10 em cima, 10 embaixo

// ---------- Texturas desenhadas em canvas ----------
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Desenho das células: modo 'color' (a cor de verdade) ou 'bus' (só as fitas, pra energia).
function drawCells(ctx, w, h, mode) {
  const sx = w / IW;
  const sy = h / IH;
  const mx = 0.014 * sx; // margem lateral
  const busH = 0.034 * sy; // faixa das fitas de cima e de baixo
  const gap = 0.0025 * sx;
  const midGap = 0.012 * sy; // corte no meio do módulo (meia-célula)
  const cw = (w - mx * 2 - gap * (COLS - 1)) / COLS;
  const ch = (h - busH * 2 - midGap - gap * (ROWS - 2)) / ROWS;
  const bbCount = 9; // multi-busbar
  const bbW = Math.max(1, w / 900);

  if (mode === 'color') {
    ctx.fillStyle = '#d9dde3';
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
  }

  const rowY = (r) => busH + r * (ch + gap) + (r >= ROWS / 2 ? midGap - gap : 0);

  for (let c = 0; c < COLS; c++) {
    const x = mx + c * (cw + gap);
    for (let r = 0; r < ROWS; r++) {
      const y = rowY(r);
      if (mode === 'color') {
        // célula: azul-escuro quase preto, com chanfro nos cantos
        const k = Math.min(cw, ch) * 0.07;
        ctx.beginPath();
        ctx.moveTo(x + k, y);
        ctx.lineTo(x + cw - k, y);
        ctx.lineTo(x + cw, y + k);
        ctx.lineTo(x + cw, y + ch - k);
        ctx.lineTo(x + cw - k, y + ch);
        ctx.lineTo(x + k, y + ch);
        ctx.lineTo(x, y + ch - k);
        ctx.lineTo(x, y + k);
        ctx.closePath();
        const g = ctx.createLinearGradient(x, y, x + cw, y + ch);
        g.addColorStop(0, '#0f1e4a');
        g.addColorStop(0.5, '#0a1638');
        g.addColorStop(1, '#0d1a42');
        ctx.fillStyle = g;
        ctx.fill();
        // filetes (dedos) finos, na horizontal
        ctx.save();
        ctx.clip();
        ctx.fillStyle = 'rgba(150, 165, 195, 0.09)';
        const fingers = 22;
        for (let f = 1; f < fingers; f++) ctx.fillRect(x, y + (ch * f) / fingers, cw, Math.max(1, h / 2600));
        // grão do silício
        for (let n = 0; n < 40; n++) {
          ctx.fillStyle = `rgba(${90 + Math.random() * 60}, ${110 + Math.random() * 60}, 200, ${Math.random() * 0.06})`;
          ctx.fillRect(x + Math.random() * cw, y + Math.random() * ch, cw * 0.2, ch * 0.08);
        }
        ctx.restore();
      }
    }
    // fitas (busbars) correndo a coluna inteira, por cima das células e dos vãos
    ctx.fillStyle = mode === 'color' ? 'rgba(190, 198, 210, 0.42)' : '#fff';
    for (let b = 0; b < bbCount; b++) {
      if (mode === 'bus' && b % 3 !== 1) continue; // energia: só algumas fitas, pra ler como pulso
      const bx = x + (cw * (b + 0.5)) / bbCount - bbW / 2;
      const bw = mode === 'bus' ? bbW * 2.5 : bbW;
      ctx.fillRect(bx - (bw - bbW) / 2, busH * 0.55, bw, h - busH * 1.1);
    }
  }
  // barramentos de cima, de baixo e do meio, ligando as colunas
  ctx.fillStyle = mode === 'color' ? '#c9ced6' : '#fff';
  const barH = Math.max(2, busH * 0.22);
  ctx.fillRect(mx, busH * 0.35, w - mx * 2, barH);
  ctx.fillRect(mx, h - busH * 0.35 - barH, w - mx * 2, barH);
  ctx.fillRect(mx, rowY(ROWS / 2) - midGap / 2 - gap / 2 - barH / 2, w - mx * 2, barH * 0.8);
}

function cellsTexture(px) {
  const [c, ctx] = canvas(px, Math.round((px * IH) / IW / 2) * 2);
  drawCells(ctx, c.width, c.height, 'color');
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
function busTexture(px) {
  const [c, ctx] = canvas(px, Math.round((px * IH) / IW / 2) * 2);
  drawCells(ctx, c.width, c.height, 'bus');
  return new CanvasTexture(c);
}

// Verso: fundo branco com a etiqueta técnica (a "papelada" do módulo).
function backTexture(px) {
  const [c, ctx] = canvas(px, Math.round((px * IH) / IW));
  const w = c.width;
  const h = c.height;
  ctx.fillStyle = '#eef0f2';
  ctx.fillRect(0, 0, w, h);
  for (let n = 0; n < 900; n++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.025})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  // etiqueta
  const lw = w * 0.62;
  const lh = h * 0.2;
  const lx = (w - lw) / 2;
  const ly = h * 0.6;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(lx, ly, lw, lh);
  ctx.strokeStyle = '#1c1b1a';
  ctx.lineWidth = Math.max(1, w / 300);
  ctx.strokeRect(lx, ly, lw, lh);
  ctx.fillStyle = '#1c1b1a';
  ctx.fillRect(lx, ly, lw, lh * 0.16);
  const fs = lh * 0.075;
  ctx.font = `700 ${fs}px "Space Grotesk Variable", system-ui, sans-serif`;
  ctx.fillStyle = '#ffb020';
  ctx.fillText('MERIDIA · MÓDULO FOTOVOLTAICO', lx + lw * 0.05, ly + lh * 0.11);
  ctx.fillStyle = '#1c1b1a';
  ctx.font = `500 ${fs * 0.92}px "JetBrains Mono Variable", ui-monospace, monospace`;
  const rows = [
    ['Potência máxima (Pmax)', '600 W'],
    ['Tensão em Pmax (Vmp)', '41,8 V'],
    ['Corrente em Pmax (Imp)', '14,36 A'],
    ['Tensão circuito aberto', '50,1 V'],
    ['Eficiência do módulo', '22,1 %'],
    ['Proteção', 'IP68'],
  ];
  rows.forEach(([k, v], i) => {
    const y = ly + lh * (0.3 + i * 0.115);
    ctx.fillText(k, lx + lw * 0.05, y);
    ctx.textAlign = 'right';
    ctx.fillText(v, lx + lw * 0.95, y);
    ctx.textAlign = 'left';
  });
  // código de barras
  for (let b = 0; b < 46; b++) {
    if (Math.random() > 0.45) ctx.fillRect(lx + lw * 0.05 + b * (lw * 0.0125), ly + lh * 0.9, lw * 0.007, lh * 0.06);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// Faixa suave (brilho no vidro, sombra e pulso de energia).
function bandTexture(size = 256, vertical = false, sharp = false) {
  const [c, ctx] = canvas(size, size);
  const g = vertical ? ctx.createLinearGradient(0, 0, 0, size) : ctx.createLinearGradient(0, 0, size, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(sharp ? 0.46 : 0.42, `rgba(255,255,255,${sharp ? 0 : 0.15})`);
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(sharp ? 0.54 : 0.58, `rgba(255,255,255,${sharp ? 0 : 0.15})`);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(c);
}

// ---------- Peças ----------
function frameGroup(mat) {
  const g = new Group();
  const r = 0.006;
  const side = new RoundedBoxGeometry(FW, H, FD, 2, r);
  const top = new RoundedBoxGeometry(W - FW * 2 + 0.002, FW, FD, 2, r);
  const l = new Mesh(side, mat);
  l.position.x = -(W - FW) / 2;
  const rr = new Mesh(side, mat);
  rr.position.x = (W - FW) / 2;
  const t = new Mesh(top, mat);
  t.position.y = (H - FW) / 2;
  const b = new Mesh(top, mat);
  b.position.y = -(H - FW) / 2;
  g.add(l, rr, t, b);
  return g;
}

function junctionBox(plastic, cable, metal) {
  const g = new Group();
  const box = new Mesh(new RoundedBoxGeometry(0.2, 0.1, 0.035, 3, 0.01), plastic);
  g.add(box);
  const lid = new Mesh(new RoundedBoxGeometry(0.16, 0.07, 0.006, 2, 0.003), plastic);
  lid.position.z = 0.019;
  g.add(lid);
  // dois cabos saindo pra baixo, com conectores na ponta
  for (const s of [-1, 1]) {
    const pts = [
      new Vector3(s * 0.06, -0.04, 0.005),
      new Vector3(s * 0.08, -0.16, 0.03),
      new Vector3(s * 0.16, -0.36, 0.05),
      new Vector3(s * 0.2, -0.56, 0.04),
    ];
    const tube = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 24, 0.008, 8, false), cable);
    g.add(tube);
    const conn = new Mesh(new CylinderGeometry(0.016, 0.016, 0.09, 16), plastic);
    conn.position.copy(pts[3]).add(new Vector3(s * 0.008, -0.045, 0));
    conn.rotation.z = s * 0.15;
    g.add(conn);
    const tip = new Mesh(new CylinderGeometry(0.007, 0.007, 0.03, 12), metal);
    tip.position.copy(conn.position).add(new Vector3(s * 0.006, -0.055, 0));
    g.add(tip);
  }
  return g;
}

// ---------- Poses por etapa ----------
// rotação do módulo (x, y, z) em cada etapa
const POSES = [
  [-0.62, -0.55, 0.14], // 0 · abertura
  [-0.1, -0.08, 0.0], // 1 · projeto (de frente)
  [-0.22, Math.PI - 0.38, 0.03], // 2 · homologação (verso)
  [-0.82, 0.62, 0.18], // 3 · instalação (camadas)
  [-0.48, 0.42, -0.06], // 4 · monitoramento
];
// deslocamento de cada camada quando desmonta (eixo da espessura)
const EXPLODE = { frame: 0.95, glass: 0.66, eva1: 0.42, cells: 0.17, eva2: -0.08, back: -0.34, jbox: -0.58 };

export function startScene(host, quality, state, labelsEl) {
  const stage = createStage(host, quality, {
    antialias: quality.tier !== 'low',
    fov: 28,
    envIntensity: 0.9,
    exposure: 1.05,
  });
  const { scene, camera, pointer, renderer } = stage;
  const reduce = quality.reduce;
  const high = quality.tier === 'high';
  const px = quality.tier === 'low' ? 768 : high ? 2048 : 1536;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // Luz: sol quente vindo de cima à direita, céu frio de preenchimento
  scene.add(new HemisphereLight(0xcfd8ff, 0x2a2420, 0.7));
  const sunLight = new DirectionalLight(0xffe2b0, 2.6);
  sunLight.position.set(3, 4, 3);
  scene.add(sunLight);
  const rim = new DirectionalLight(0xff8a4a, 0.9);
  rim.position.set(-3, -1, -2);
  scene.add(rim);

  // Sol atrás da placa
  const sun = new Sprite(new SpriteMaterial({ map: glow(256, '255,200,120'), blending: AdditiveBlending, transparent: true, depthWrite: false }));
  sun.position.set(1.15, 1.25, -2.5);
  sun.scale.setScalar(3.2);
  scene.add(sun);

  // Materiais
  const alu = new MeshStandardMaterial({ color: 0xa4aab2, metalness: 1, roughness: 0.38 });
  const cellsTex = cellsTexture(px);
  cellsTex.anisotropy = aniso;
  const cellsMat = new MeshStandardMaterial({ color: 0x8a90a0, map: cellsTex, roughness: 0.5, metalness: 0, envMapIntensity: 0.3 });
  const edgeMat = new MeshStandardMaterial({ color: 0x1a2236, roughness: 0.6 });
  const glassMat = high
    ? new MeshPhysicalMaterial({ color: 0x000000, transparent: true, opacity: 0.12, roughness: 0.04, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2, depthWrite: false })
    : new MeshStandardMaterial({ color: 0x000000, transparent: true, opacity: 0.12, roughness: 0.05, envMapIntensity: 1.2, depthWrite: false });
  const glassEdge = new MeshStandardMaterial({ color: 0x9fc7c2, transparent: true, opacity: 0.55, roughness: 0.1 });
  const evaMat = new MeshStandardMaterial({ color: 0xf4f6f8, transparent: true, opacity: 0, roughness: 0.7, depthWrite: false });
  const backTex = backTexture(Math.round(px * 0.75));
  backTex.anisotropy = aniso;
  const backMat = new MeshStandardMaterial({ map: backTex, roughness: 0.55 });
  const backFront = new MeshStandardMaterial({ color: 0xe6e9ed, roughness: 0.6 });
  const plastic = new MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.55 });
  const cable = new MeshStandardMaterial({ color: 0x111112, roughness: 0.45 });
  const brass = new MeshStandardMaterial({ color: 0xd9b46a, metalness: 1, roughness: 0.3 });

  // Módulo
  const pivot = new Group(); // gira o conjunto
  scene.add(pivot);
  const panel = new Group();
  pivot.add(panel);
  const parts = {};
  const layer = (name, obj, z) => {
    const g = new Group();
    g.add(obj);
    g.userData.z = z;
    g.position.z = z;
    panel.add(g);
    parts[name] = g;
    return g;
  };

  layer('frame', frameGroup(alu), 0);
  // vidro: caixa fina com borda esverdeada (vidro temperado visto de lado)
  layer('glass', new Mesh(new BoxGeometry(IW, IH, 0.006), [glassEdge, glassEdge, glassEdge, glassEdge, glassMat, glassMat]), 0.019);
  layer('eva1', new Mesh(new BoxGeometry(IW, IH, 0.002), evaMat), 0.0135);
  const cellsBox = new Mesh(new BoxGeometry(IW, IH, 0.004), [edgeMat, edgeMat, edgeMat, edgeMat, cellsMat, edgeMat]);
  const cellsLayer = layer('cells', cellsBox, 0.009);
  layer('eva2', new Mesh(new BoxGeometry(IW, IH, 0.002), evaMat), 0.0045);
  layer('back', new Mesh(new BoxGeometry(IW, IH, 0.004), [backFront, backFront, backFront, backFront, backFront, backMat]), 0.001);
  const jb = junctionBox(plastic, cable, brass);
  jb.rotation.y = Math.PI; // de frente pro verso
  jb.position.y = IH * 0.36;
  layer('jbox', jb, -0.02);

  // Pulso de energia correndo pelas fitas (etapa 4)
  const busMap = busTexture(px);
  const pulse = bandTexture(256, true, true);
  pulse.wrapS = pulse.wrapT = RepeatWrapping;
  pulse.repeat.set(1, 3);
  const energyMat = new MeshBasicMaterial({
    color: 0xff9a1a,
    map: busMap,
    alphaMap: pulse,
    transparent: true,
    opacity: 0,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  const energy = new Mesh(new PlaneGeometry(IW, IH), energyMat);
  energy.position.z = 0.0025;
  cellsLayer.add(energy);

  // Brilho do sol varrendo o vidro
  const glintTex = bandTexture(256);
  glintTex.wrapS = glintTex.wrapT = ClampToEdgeWrapping;
  glintTex.center.set(0.5, 0.5);
  glintTex.rotation = -0.5;
  glintTex.repeat.set(0.55, 1);
  const glint = new Mesh(
    new PlaneGeometry(IW, IH),
    new MeshBasicMaterial({ color: 0xfff1d6, alphaMap: glintTex, transparent: true, opacity: 0.22, blending: AdditiveBlending, depthWrite: false }),
  );
  glint.position.z = 0.0035;
  parts.glass.add(glint);

  // Sombra varrendo as células (etapa 1: simulação de sombra)
  const shadeTex = bandTexture(256);
  shadeTex.wrapS = shadeTex.wrapT = ClampToEdgeWrapping;
  shadeTex.center.set(0.5, 0.5);
  shadeTex.repeat.set(0.45, 1);
  const shade = new Mesh(
    new PlaneGeometry(IW, IH),
    new MeshBasicMaterial({ color: 0x000000, alphaMap: shadeTex, transparent: true, opacity: 0, depthWrite: false }),
  );
  shade.position.z = 0.0045;
  parts.glass.add(shade);

  // Enquadra o módulo na caixa disponível
  stage.onResize = (w, h) => {
    const half = MathUtils.degToRad(camera.fov / 2);
    const needH = 1.32;
    const needW = 0.95;
    const zh = needH / Math.tan(half);
    const zw = needW / (Math.tan(half) * (w / h));
    camera.userData.baseZ = Math.max(zh, zw);
  };
  stage.onResize(stage.width, stage.height);

  const labelEls = labelsEl ? [...labelsEl.querySelectorAll('[data-part]')] : [];
  const sides = { frame: 1, glass: -1, cells: 1, back: -1 };
  const tmp = new Vector3();

  stage.onFrame = (dt, t) => {
    const tt = reduce ? 0 : t;
    const s = state.p * 4; // 0..4
    const i0 = Math.min(3, Math.floor(s));
    const f = smooth(clamp(s - i0, 0, 1));
    const a = POSES[i0];
    const b = POSES[i0 + 1];

    const e = smooth(clamp(1 - Math.abs(s - 3) * 1.35, 0, 1)); // camadas separadas
    const sh = smooth(clamp(1 - Math.abs(s - 1) * 1.6, 0, 1)); // sombra
    const en = smooth(clamp((s - 3.25) / 0.6, 0, 1)); // energia

    pivot.rotation.set(
      MathUtils.lerp(a[0], b[0], f) - pointer.y * 0.14,
      MathUtils.lerp(a[1], b[1], f) + pointer.x * 0.22 + Math.sin(tt * 0.3) * 0.05,
      MathUtils.lerp(a[2], b[2], f),
    );
    pivot.position.y = reduce ? 0 : Math.sin(tt * 0.8) * 0.02;

    for (const [name, g] of Object.entries(parts)) g.position.z = g.userData.z + EXPLODE[name] * e;
    evaMat.opacity = e * 0.32;
    parts.eva1.visible = parts.eva2.visible = e > 0.01;

    // brilho do vidro: atravessa devagar e segue o ponteiro
    const gx = reduce ? 0 : ((tt * 0.07) % 1) * 2.6 - 1.3;
    glintTex.offset.set(gx + pointer.x * 0.15, 0);
    glint.material.opacity = 0.22 * (1 - sh * 0.7);

    // sombra varrendo (simulação hora a hora)
    shadeTex.offset.set(reduce ? 0 : ((tt * 0.12) % 1) * 2.4 - 1.2, 0);
    shade.material.opacity = sh * 0.7;

    // energia correndo pras pontas
    pulse.offset.y = reduce ? 0 : -tt * 0.35;
    energyMat.opacity = en;

    const zoom = 1 + e * (stage.width < 520 ? 0.5 : 0.3);
    camera.position.set(pointer.x * 0.15, pointer.y * 0.1, (camera.userData.baseZ || 9) * zoom);
    camera.lookAt(0, 0, 0);

    // Rótulos das camadas
    if (labelsEl) {
      const on = e > 0.6;
      labelsEl.classList.toggle('is-on', on);
      if (e > 0.05) {
        const w = stage.width;
        const h = stage.height;
        labelEls.forEach((el) => {
          const name = el.dataset.part;
          const side = sides[name];
          const g = parts[name];
          tmp.set(side * IW * 0.5, name === 'back' ? -IH * 0.2 : IH * 0.12, 0);
          g.localToWorld(tmp);
          const sc = toScreen(tmp, camera, w, h);
          // nunca sai da caixa: encosta na borda se precisar
          const ew = el.offsetWidth;
          let x = side > 0 ? sc.x + 14 : sc.x - 14 - ew;
          x = clamp(x, 8, w - ew - 8);
          el.style.transform = `translate(${x.toFixed(1)}px, ${sc.y.toFixed(1)}px) translate(0, -50%)`;
        });
      }
    }
  };
}
