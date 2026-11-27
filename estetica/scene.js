// Cena da estética: vidro em código. Bolhas na abertura, frasco numa caixa de vidro
// no "o que fazemos", um objeto por linha de cuidado preso ao círculo, e bolhas no fim.
import {
  Group,
  Mesh,
  SphereGeometry,
  LatheGeometry,
  TorusGeometry,
  CylinderGeometry,
  Vector2,
  Vector3,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  DirectionalLight,
  PointLight,
  MathUtils,
  PlaneGeometry,
  MeshBasicMaterial,
  Color,
} from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createStage, anchorToElement } from '../base/stage.js';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { range, smooth, lerp } from '../base/scroll.js';

const DIST = 10;

function glassMaterial(quality, tint = 0xffffff) {
  // vidro de verdade (refrata o fundo) no PC e no celular; o simplificado fica só pro aparelho fraco
  if (quality.tier !== 'low') {
    const mid = quality.tier === 'mid';
    return new MeshPhysicalMaterial({
      color: tint,
      transmission: 1,
      thickness: 0.35,
      roughness: 0.06,
      ior: 1.35,
      iridescence: mid ? 0.7 : 0.9,
      iridescenceIOR: 1.3,
      iridescenceThicknessRange: [200, 600],
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      attenuationColor: 0xffe3da,
      attenuationDistance: 2.5,
      envMapIntensity: 1.8,
    });
  }
  // Vidro "falso" pra aparelho mais fraco: transparente com reflexo do ambiente.
  return new MeshPhysicalMaterial({
    color: 0xf6d7cc,
    transparent: true,
    opacity: 0.32,
    roughness: 0.06,
    clearcoat: 1,
    iridescence: 0.3,
    envMapIntensity: 2,
    depthWrite: false,
  });
}

function bottleGeometry() {
  // perfil de frasco de sérum: corpo, ombro, gargalo
  const pts = [
    [0.001, -1.0],
    [0.5, -1.0],
    [0.56, -0.95],
    [0.58, -0.8],
    [0.58, 0.35],
    [0.52, 0.52],
    [0.3, 0.64],
    [0.2, 0.7],
    [0.2, 0.86],
  ].map(([x, y]) => new Vector2(x, y));
  return new LatheGeometry(pts, 64);
}

function dropGeometry() {
  const pts = [];
  for (let i = 0; i <= 40; i++) {
    const t = i / 40;
    const a = t * Math.PI;
    // gota: redonda embaixo, ponta em cima
    const r = Math.sin(a) * (1 - t * 0.55) * 0.75 + 0.001;
    pts.push(new Vector2(r, -Math.cos(a) * 1.0 + t * 0.35));
  }
  return new LatheGeometry(pts, 64);
}

const BG = 0x1c0b14;
const BG_SPAN = 24; // lado do quadrado do fundo, em unidades da cena (unit)
const BG_Z = -6;

// Fundo com uma luz rosada: é o que o vidro refrata. Fica num plano medido na mesma
// unidade das bolhas, então a imagem de abertura (poster) bate com o 3D em qualquer tela.
// gx, gy, r: centro e raio do brilho, em unit, a partir da origem do quadro.
function glowTexture(gx, gy, r) {
  const N = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c0b14';
  ctx.fillRect(0, 0, N, N);
  const px = (v) => (v / BG_SPAN) * N;
  const cx = N / 2 + px(gx);
  const cy = N / 2 - px(gy);
  const g = ctx.createRadialGradient(cx, cy, 2, cx - px(0.3), cy + px(0.3), px(r));
  g.addColorStop(0, '#7a3c55');
  g.addColorStop(0.35, '#4c2236');
  g.addColorStop(1, 'rgba(28,11,20,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, N, N);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

// Sorteio com semente: as bolhinhas nascem sempre no mesmo lugar (igual ao poster).
function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function startScene(host, quality, state) {
  const stage = createStage(host, quality, { fov: 30, envIntensity: 1, exposure: 1.05, transparent: false });
  const { scene, camera, pointer } = stage;
  // no celular a imagem que o vidro refrata é feita em meia resolução: fica igual a olho nu e pesa bem menos
  if (quality.tier === 'mid') stage.renderer.transmissionResolutionScale = 0.5;
  const reduce = quality.reduce;
  scene.background = new Color(BG);
  const bgMat = new MeshBasicMaterial({ toneMapped: false, depthWrite: false });
  const bg = new Mesh(new PlaneGeometry(1, 1), bgMat);
  bg.renderOrder = -1;
  scene.add(bg);
  let bgMode = '';
  camera.position.set(0, 0, DIST);

  const key = new DirectionalLight(0xfff1ea, 2.2);
  key.position.set(-3, 4, 6);
  scene.add(key);
  const warm = new PointLight(0xf0a58f, 30, 20);
  warm.position.set(4, -2, 3);
  scene.add(warm);

  const glass = glassMaterial(quality);
  const metal = new MeshStandardMaterial({ color: 0xe6d3b0, metalness: 1, roughness: 0.28 });
  const seg = quality.tier === 'low' ? 32 : 64;
  const sphereGeo = new SphereGeometry(1, seg, seg / 2);

  // ---------- Abertura: bolhas ----------
  const intro = new Group();
  scene.add(intro);
  const bigA = new Mesh(sphereGeo, glass);
  const bigB = new Mesh(sphereGeo, glass);
  intro.add(bigA, bigB);

  // Bolhinhas: no PC só na metade direita (o texto fica à esquerda); no celular só
  // na parte de cima (o texto fica embaixo). Nunca passam por trás do texto.
  const drops = [];
  const rnd = seeded(7);
  for (let i = 0; i < 12; i++) {
    const m = new Mesh(sphereGeo, glass);
    m.userData = {
      x: rnd(),
      z: (rnd() - 0.5) * 3,
      speed: 0.12 + rnd() * 0.25,
      off: rnd() * 10,
      s: 0.05 + rnd() * 0.09,
    };
    m.scale.setScalar(m.userData.s);
    intro.add(m);
    drops.push(m);
  }

  // Frasco numa caixa de vidro
  const bottleGeo = bottleGeometry();
  const product = new Group();
  const panel = new Mesh(new RoundedBoxGeometry(2.6, 2.6, 0.35, 6, 0.35), glass);
  const bottle = new Group();
  bottle.add(new Mesh(bottleGeo, glass));
  const cap = new Mesh(new CylinderGeometry(0.24, 0.24, 0.42, 40), metal);
  cap.position.y = 1.05;
  const bulb = new Mesh(sphereGeo, metal);
  bulb.scale.set(0.2, 0.26, 0.2);
  bulb.position.y = 1.36;
  bottle.add(cap, bulb);
  bottle.scale.setScalar(0.85);
  bottle.position.z = 0.6;
  product.add(panel, bottle);
  scene.add(product);

  // ---------- Linhas de cuidado: um objeto por linha ----------
  const care = new Group();
  scene.add(care);
  const drop = new Mesh(dropGeometry(), glass);
  const laser = new Group();
  const lens = new Mesh(sphereGeo, glass);
  lens.scale.set(0.85, 0.85, 0.22);
  laser.add(lens);
  const ringMat = new MeshStandardMaterial({ color: 0xf0cabd, emissive: 0xf08f78, emissiveIntensity: 0.9, roughness: 0.4 });
  const rings = [1.05, 1.3, 1.55].map((r, i) => {
    const ring = new Mesh(new TorusGeometry(r, 0.012, 8, 128), ringMat);
    ring.userData.i = i;
    laser.add(ring);
    return ring;
  });
  const body = new Mesh(new TorusGeometry(0.62, 0.32, seg / 2, seg * 2), glass);
  const skin = bottle.clone();
  skin.position.set(0, 0, 0);
  skin.scale.setScalar(0.75);
  const careObjs = [drop, laser, body, skin];
  careObjs.forEach((o) => {
    o.scale.multiplyScalar(0.0001);
    o.userData.base = o === skin ? 0.75 : 1;
    o.userData.k = 0;
    care.add(o);
  });

  // ---------- Fim: duas bolhas ----------
  const outro = new Group();
  const endA = new Mesh(sphereGeo, glass);
  const endB = new Mesh(sphereGeo, glass);
  outro.add(endA, endB);
  scene.add(outro);

  const introPin = document.querySelector('.intro-pin');
  const orbEl = document.getElementById('orb');
  const ctaEl = document.getElementById('cta-bubbles');
  const careSec = document.getElementById('cuidados');
  const ctaSec = document.getElementById('contato');
  const introSec = document.getElementById('intro');

  const onScreen = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > -50 && r.top < innerHeight + 50;
  };
  stage.shouldRender = () => onScreen(introSec) || onScreen(careSec) || onScreen(ctaSec);

  const tmp = new Vector3();

  stage.onFrame = (dt, t) => {
    const W = innerWidth;
    const H = innerHeight;
    const narrow = W / H < 0.8;
    const tt = reduce ? 0 : t;

    camera.position.x = pointer.x * 0.25;
    camera.position.y = pointer.y * 0.18;
    camera.lookAt(0, 0, 0);

    // Quadro de referência: no PC a medida vem da altura e a origem é o centro da tela;
    // no celular a medida vem da largura e a origem é o topo da tela.
    const halfH = Math.tan((camera.fov * Math.PI) / 360) * DIST;
    const halfW = halfH * (W / H);
    // no retrato a medida é a largura, mas no máximo 60% da altura (tablet em pé não
    // deixa as bolhas descerem até o texto). base.css .poster-anchor usa a mesma regra.
    const u = narrow ? (Math.min(W, 0.6 * H) / H) * (halfH * 2) / 5.4 : (Math.min(halfW, halfH) * 2) / 5.4;
    const oy = narrow ? halfH : 0;
    const mode = narrow ? 'n' : 'w';
    if (mode !== bgMode) {
      bgMode = mode;
      bgMat.map?.dispose();
      bgMat.map = narrow ? glowTexture(0.75, -4.1, 7) : glowTexture(1.2, 0.6, 4.3);
      bgMat.needsUpdate = true;
    }
    const k = (DIST - BG_Z) / DIST; // o plano está mais longe: aumenta na mesma proporção
    bg.position.set(0, oy * k, BG_Z);
    bg.scale.set(BG_SPAN * u * k, BG_SPAN * u * k, 1);

    // ---- Abertura
    const a = anchorToElement(introPin, camera, W, H, DIST);
    intro.visible = product.visible = a.onScreen;
    if (a.onScreen) {
      const p = state.intro;
      const out = smooth(range(p, 0.25, 0.75));
      const unit = narrow ? u : a.size / 5.4; // tamanho relativo à tela
      const top = a.y + halfH; // topo da abertura
      intro.position.set(a.x, narrow ? top : a.y, 0);
      const ax = narrow ? 0.35 : 1.5;
      const ay = narrow ? -3.0 : 0.25;
      bigA.position.set(
        (ax + Math.sin(tt * 0.3) * 0.08 - out * (narrow ? 1.2 : 3.2)) * unit,
        (ay + Math.cos(tt * 0.4) * 0.08 + out * (narrow ? 5.5 : 2.2)) * unit,
        0,
      );
      bigB.position.set(
        (ax + (narrow ? -0.7 : 1.15) + Math.cos(tt * 0.35) * 0.1 + out * 1.8) * unit,
        (ay - (narrow ? 0.7 : 0.75) + Math.sin(tt * 0.3) * 0.1 + out * (narrow ? 6.5 : 3.4)) * unit,
        -0.6,
      );
      const sA = (narrow ? 1.15 : 1.35) * unit * (1 - out * 0.35);
      const sB = (narrow ? 0.95 : 1.15) * unit * (1 - out * 0.35);
      bigA.scale.setScalar(sA);
      bigB.scale.setScalar(sB);
      bigA.rotation.y = bigB.rotation.y = tt * 0.1 + pointer.x * 0.3;

      drops.forEach((m) => {
        const d = m.userData;
        const cyc = (tt * d.speed + d.off) % 6; // 0..6, sobe e recomeça
        const x = narrow ? (d.x - 0.5) * 4.8 : 0.15 + d.x * 4.6;
        const y = narrow ? -4.6 + cyc * 0.75 : cyc - 3;
        m.position.set(x * unit, y * unit, d.z);
        // no celular as bolhinhas somem na saída, pra não cruzar os números e o texto novo
        m.scale.setScalar(Math.max(0.0001, d.s * unit * (narrow ? 1 - out : 1 + out * 0.6)));
      });

      const inP = smooth(range(p, 0.42, 0.85));
      product.position.set(
        a.x + (narrow ? 0 : 0.6) * unit,
        (narrow ? top : a.y) + lerp(narrow ? -4.4 : -3.5, narrow ? -3.2 : 0, inP) * unit,
        0,
      );
      product.scale.setScalar(unit * (narrow ? 0.8 : 1) * lerp(0.7, 1, inP));
      product.rotation.y = lerp(-0.9, 0, inP) + pointer.x * 0.35 + Math.sin(tt * 0.4) * 0.05;
      product.rotation.x = -pointer.y * 0.15;
      product.visible = inP > 0.001;
      bottle.rotation.y = tt * 0.25;
    }

    // ---- Linhas de cuidado
    const c = anchorToElement(orbEl, camera, W, H, DIST);
    care.visible = c.onScreen;
    if (c.onScreen) {
      care.position.set(c.x, c.y, 0);
      const unit = c.size / 4.2;
      careObjs.forEach((o, i) => {
        const target = i === state.careIndex ? 1 : 0;
        o.userData.k += (target - o.userData.k) * Math.min(1, dt * 6);
        const k = smooth(o.userData.k);
        o.visible = k > 0.002;
        o.scale.setScalar(Math.max(0.0001, k * unit * o.userData.base));
        o.rotation.y = tt * 0.35 + pointer.x * 0.5 + (1 - k) * 1.5;
        o.rotation.x = -pointer.y * 0.3 + (1 - k) * 0.6;
        o.position.y = (1 - k) * -0.6 * unit;
      });
      body.rotation.x = 0.9 - pointer.y * 0.3;
      rings.forEach((r) => {
        const i = r.userData.i;
        r.rotation.x = tt * (0.4 + i * 0.15) + i;
        r.rotation.y = tt * (0.3 + i * 0.1);
      });
    }

    // ---- Fim
    const e = anchorToElement(ctaEl, camera, W, H, DIST);
    outro.visible = e.onScreen;
    if (e.onScreen) {
      const unit = e.size / 3; // bolhas ocupam o espaço reservado acima do título
      outro.position.set(e.x, e.y, 0);
      endA.position.set(Math.sin(tt * 0.3) * 0.1 * unit, Math.cos(tt * 0.25) * 0.1 * unit, 0);
      endB.position.set((0.95 + Math.cos(tt * 0.3) * 0.1) * unit, (-0.55 + Math.sin(tt * 0.2) * 0.1) * unit, -0.5);
      endA.scale.setScalar(1.25 * unit);
      endB.scale.setScalar(0.75 * unit);
    }
    tmp.set(0, 0, 0);
  };
}
