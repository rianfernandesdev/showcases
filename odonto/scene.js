// Cena do odonto: um 1º molar inferior com anatomia de verdade (gerado por tools/molar.mjs).
// Vista 1: dente inteiro sob a luz. Vista 2: camadas separadas, com nome.
// Vista 3: dente montado de novo, brilhando.
import {
  Group,
  Mesh,
  IcosahedronGeometry,
  PlaneGeometry,
  Vector3,
  Color,
  BufferAttribute,
  MeshStandardMaterial,
  MeshBasicMaterial,
  SpriteMaterial,
  Sprite,
  HemisphereLight,
  DirectionalLight,
  AdditiveBlending,
  MathUtils,
  CanvasTexture,
  SRGBColorSpace,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { createStage, toScreen } from '../base/stage.js';
import { clayNoise, softShadow, glow } from '../base/textures.js';
import { range, smooth } from '../base/scroll.js';

// Pedrinha de massinha: icosaedro amassado por um ruído simples.
function pebbleGeometry(seed) {
  const g = new IcosahedronGeometry(1, 4);
  const pos = g.attributes.position;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d =
      1 +
      0.12 * Math.sin(v.x * 3.1 + seed) * Math.cos(v.y * 2.7 + seed * 2) +
      0.06 * Math.sin(v.z * 5.3 + seed * 3);
    v.multiplyScalar(d);
    pos.setXYZ(i, v.x, v.y * 0.85, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.translate(32, 32);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const r = i % 2 === 0 ? 30 : 5;
    const a = (i / 8) * Math.PI * 2;
    ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function startScene(host, quality, state, labelsEl) {
  const stage = createStage(host, quality, { fov: 30, envIntensity: 0.55, exposure: 1.05 });
  const { scene, camera, pointer } = stage;
  const high = quality.tier === 'high';
  const detail = quality.tier === 'low' ? 32 : 56;

  // Luz quente de consultório
  scene.add(new HemisphereLight(0xfff4e2, 0xb39f88, 1.15));
  const key = new DirectionalLight(0xfff0d8, 2.4);
  key.position.set(3, 4, 5);
  scene.add(key);
  const rim = new DirectionalLight(0xffb79c, 1.6);
  rim.position.set(-4, 2, -3);
  scene.add(rim);

  // Materiais: esmalte claro e brilhante, cemento e dentina amarelados, polpa avermelhada.
  const enamelMat = new MeshStandardMaterial({ vertexColors: true, roughness: high ? 0.17 : 0.22, envMapIntensity: 1.3 });
  const rootMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.42 });
  const dentinMat = new MeshStandardMaterial({ color: 0xf0d39e, roughness: 0.55 });
  const pulpMat = new MeshStandardMaterial({
    color: 0xd45a44,
    roughness: 0.42,
    emissive: 0x6e1e10,
    emissiveIntensity: 0.25,
  });
  const noise = quality.tier === 'low' ? null : clayNoise();
  enamelMat.emissive.setHex(0xfff2d6);

  // Dente: as 4 camadas vêm prontas no molar.glb e entram quando carregam.
  const tooth = new Group();
  scene.add(tooth);
  const enamel = new Group();
  const dentin = new Group();
  const pulp = new Group();
  const roots = new Group();
  tooth.add(roots, pulp, dentin, enamel);
  const parts = { enamel, dentin, pulp, root: roots };

  // Cor por altura: esmalte mais branco nas cúspides e mais quente no colo;
  // raiz mais clara no colo e mais escura no ápice.
  const shade = (geo, stops) => {
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new Color();
    const lo = new Color(stops[0][1]);
    const hi = new Color(stops[1][1]);
    for (let i = 0; i < pos.count; i++) {
      const k = MathUtils.smoothstep(pos.getY(i), stops[0][0], stops[1][0]);
      c.copy(lo).lerp(hi, k);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new BufferAttribute(col, 3));
  };
  const mats = { enamel: enamelMat, dentin: dentinMat, pulp: pulpMat, root: rootMat };
  new GLTFLoader()
    .setMeshoptDecoder(MeshoptDecoder)
    .load(`${import.meta.env.BASE_URL}odonto/molar.glb`, (gltf) => {
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const name = o.name in mats ? o.name : o.parent?.name;
        if (name === 'enamel') shade(o.geometry, [[-0.1, 0xead9b6], [0.6, 0xf7f4ee]]);
        if (name === 'root') shade(o.geometry, [[-1.9, 0xd8bd8a], [-0.2, 0xefe1c2]]);
        o.material = mats[name];
        parts[name]?.add(o.clone());
      });
    });

  // Sombra de contato no "chão"
  const shadow = new Mesh(
    new PlaneGeometry(1, 1),
    new MeshBasicMaterial({ map: softShadow(128, 0.32), transparent: true, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -2.15;
  shadow.scale.set(2.6, 1.6, 1);
  scene.add(shadow);

  // Pedrinhas de massinha flutuando
  const colors = [0xbfd8ea, 0xe8765a, 0xf4d58d, 0xbfd8ea, 0xf4d58d, 0x3b4658];
  const homes = [
    [-1.55, 1.2, -0.6, 0.2],
    [1.6, -0.4, 0.3, 0.16],
    [-1.35, -1.25, 0.5, 0.24],
    [1.25, 1.05, 0.8, 0.12],
    [-0.4, -1.95, 0.9, 0.14],
    [0.9, -1.6, -0.9, 0.18],
  ];
  const pebbles = homes.map(([x, y, z, s], i) => {
    const m = new Mesh(
      pebbleGeometry(i * 1.7),
      new MeshStandardMaterial({ color: colors[i], roughness: 0.82, bumpMap: noise, bumpScale: 1.5 }),
    );
    m.position.set(x, y, z);
    m.scale.setScalar(s);
    m.userData = { home: new Vector3(x, y, z), phase: i * 1.3, radius: 1.5 + (i % 3) * 0.25 };
    scene.add(m);
    return m;
  });

  // Brilhos da vista 3
  const sparkMat = new SpriteMaterial({
    map: starTexture(),
    color: 0xfff6dc,
    blending: AdditiveBlending,
    transparent: true,
    depthWrite: false,
    opacity: 0,
  });
  const sparks = [
    [0.75, 0.95, 0.6],
    [-0.7, 0.7, 0.7],
    [0.15, 1.15, 0.5],
  ].map(([x, y, z], i) => {
    const sp = new Sprite(sparkMat.clone());
    sp.position.set(x, y, z);
    sp.userData.phase = i * 2.1;
    tooth.add(sp);
    return sp;
  });

  // Enquadramento responsivo: o dente inteiro sempre cabe na janela.
  const small = () => stage.width < 520;
  stage.onResize = (w, h) => {
    const half = MathUtils.degToRad(camera.fov / 2);
    const needH = 2.25;
    const needW = 1.75;
    const zh = needH / Math.tan(half);
    const zw = needW / (Math.tan(half) * (w / h));
    camera.userData.baseZ = Math.max(zh, zw);
  };
  stage.onResize(stage.width, stage.height);

  const labelEls = [...labelsEl.querySelectorAll('[data-part]')];
  const tmp = new Vector3();
  const sides = { enamel: 1, dentin: -1, pulp: 1, root: -1 };

  stage.onFrame = (dt, t) => {
    const p = state.p;
    const reduce = quality.reduce;
    const e = smooth(range(p, 0.27, 0.45)) * (1 - smooth(range(p, 0.6, 0.78)));
    const s = smooth(range(p, 0.7, 0.9));

    // Camadas se separando
    enamel.position.y = 1.25 * e;
    dentin.position.y = 0.38 * e;
    pulp.position.y = -0.48 * e;
    roots.position.y = -1.3 * e;

    const idle = reduce ? 0 : t * 0.18;
    tooth.rotation.y = idle + p * Math.PI * 1.6 + pointer.x * 0.4 - e * 0.35;
    tooth.rotation.x = 0.32 - pointer.y * 0.18 - e * 0.1;
    const bob = reduce ? 0 : Math.sin(t * 1.2) * 0.05;
    tooth.position.y = 0.32 + bob + (small() ? 0.25 : 0);
    tooth.scale.setScalar(MathUtils.lerp(1, 0.66, e) * (1 + s * 0.06));

    camera.position.set(pointer.x * 0.25, 0.25 + pointer.y * 0.15, (camera.userData.baseZ || 9) - s * 0.5);
    camera.lookAt(0, small() ? 0.2 : 0, 0);

    // Brilho do esmalte na vista 3
    enamelMat.emissiveIntensity = s * 0.12;
    shadow.material.opacity = 1 - e * 0.6;
    shadow.scale.set(2.6 - e * 0.8, 1.6 - e * 0.5, 1);

    sparks.forEach((sp) => {
      const tw = reduce ? 1 : 0.6 + 0.4 * Math.sin(t * 3 + sp.userData.phase);
      sp.material.opacity = s * tw;
      sp.scale.setScalar(0.35 * s * (0.7 + 0.3 * tw));
    });

    // Pedrinhas: flutuam em casa; na vista 3, giram em volta do dente.
    pebbles.forEach((m) => {
      const { home, phase, radius } = m.userData;
      const a = (reduce ? 0 : t * 0.5) + phase;
      const orbit = tmp.set(Math.cos(a) * radius, Math.sin(a * 0.7) * 0.6 + 0.3, Math.sin(a) * radius * 0.6);
      m.position.lerpVectors(home, orbit, s);
      m.position.y += reduce ? 0 : Math.sin(t * 1.5 + phase) * 0.06;
      m.rotation.x = phase + (reduce ? 0 : t * 0.3);
      m.rotation.y = phase * 2 + (reduce ? 0 : t * 0.2);
    });

    // Rótulos em HTML acompanhando as camadas
    const on = e > 0.6;
    labelsEl.classList.toggle('is-on', on);
    if (e > 0.05) {
      const w = stage.width;
      const h = stage.height;
      const narrow = w < 480;
      const scale = tooth.scale.x;
      const pxPerUnit = h / (2 * Math.tan(MathUtils.degToRad(camera.fov / 2)) * camera.position.z);
      labelEls.forEach((el) => {
        const part = parts[el.dataset.part];
        part.getWorldPosition(tmp);
        if (el.dataset.part === 'root') tmp.y -= 0.7 * scale;
        if (el.dataset.part === 'pulp') tmp.y -= 0.1 * scale;
        const sc = toScreen(tmp, camera, w, h);
        const side = sides[el.dataset.part];
        const off = narrow ? 36 : pxPerUnit * scale * 1.05 + 14;
        const x = sc.x + side * off;
        const shift = narrow ? '-50%' : side > 0 ? '0' : '-100%';
        el.style.transform = `translate(${x.toFixed(1)}px, ${sc.y.toFixed(1)}px) translate(${shift}, -50%)`;
      });
    }
  };
}
