// Gera o molar do showcase de odonto (public/odonto/molar.glb).
// O dente é descrito por funções de distância (SDF): anatomia de um 1º molar inferior,
// com 5 cúspides, sulcos, colo, tronco radicular e 2 raízes com furca.
// Cada camada (esmalte, dentina, polpa, raiz) vira uma malha por marching cubes,
// é simplificada e sai com normais calculadas direto da SDF (superfície lisa de verdade).
// Rodar: node tools/molar.mjs
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { meshopt, reorder } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';

const RES = Number(process.env.RES || 150);
const CENTER = [0, -0.5, 0];
const HALF = 1.5;

// ---------- primitivas ----------
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smax = (a, b, k) => -smin(-a, -b, k);
function ellipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = x - cx, py = y - cy, pz = z - cz;
  const k0 = Math.hypot(px / rx, py / ry, pz / rz);
  const k1 = Math.hypot(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
function roundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx, qy = Math.abs(y) - by, qz = Math.abs(z) - bz;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
function capsule(x, y, z, a, b, r) {
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const h = clamp((pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz), 0, 1);
  return Math.hypot(pax - bax * h, pay - bay * h, paz - baz * h) - r;
}
// cone de pontas arredondadas (iq), em 3D
function roundCone(x, y, z, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  const pax = x - a[0], pay = y - a[1], paz = z - a[2];
  const yy = pax * bax + pay * bay + paz * baz;
  const zz = yy - l2;
  const cx = pax * l2 - bax * yy, cy = pay * l2 - bay * yy, cz = paz * l2 - baz * yy;
  const x2 = cx * cx + cy * cy + cz * cz;
  const y2 = yy * yy * l2;
  const z2 = zz * zz * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
}

// ---------- anatomia ----------
// x: mesial (-) para distal (+). z: lingual (-) para vestibular (+). y: para cima.
const CUSPS = [
  // x, y, z, rx, ry, rz
  [-0.43, 0.66, 0.34, 0.37, 0.34, 0.35], // mesiovestibular
  [0.13, 0.64, 0.4, 0.35, 0.32, 0.33], // distovestibular
  [0.6, 0.55, 0.18, 0.27, 0.27, 0.27], // distal
  [-0.37, 0.72, -0.34, 0.37, 0.35, 0.35], // mesiolingual
  [0.33, 0.69, -0.34, 0.35, 0.33, 0.33], // distolingual
]
const cej = (x, z) => -0.14 + 0.13 * clamp(Math.abs(x) / 0.8, 0, 1) ** 2 - 0.03 * clamp(Math.abs(z) / 0.7, 0, 1);

// raízes levemente curvadas para distal, achatadas no sentido mesiodistal
const ROOTS = [
  { a: [-0.42, -0.45, 0], b: [-0.5, -1.95, 0.02], r1: 0.34, r2: 0.08, flat: 1.5 },
  { a: [0.42, -0.45, 0], b: [0.5, -1.82, -0.02], r1: 0.32, r2: 0.08, flat: 1.5 },
];
function bend(x, y) {
  const t = clamp((-0.45 - y) / 1.5, 0, 1);
  return x - 0.14 * t * t;
}
function rootField(x, y, z, shrink, rs) {
  let d = 1e9;
  const bx = bend(x, y);
  for (const r of ROOTS) {
    const f = r.flat;
    const v = roundCone(r.a[0] + (bx - r.a[0]) * f, y, z, r.a, r.b, r.r1 * rs - shrink, Math.max(r.r2 * rs - shrink, 0.012)) / f;
    d = Math.min(d, v);
  }
  return d;
}

function crown(x, y, z) {
  // estreita em direção ao colo
  const t = clamp((0.36 - y) / 0.55, 0, 1);
  const s = 1 - 0.28 * t * t;
  const cx = x / s, cz = z / s;
  let d = roundBox(cx, y - 0.32, cz, 0.5, 0.12, 0.38, 0.36) * s;
  for (const c of CUSPS) d = smin(d, ellipsoid(x, y, z, ...c), 0.16);
  // fossas e sulcos da face oclusal
  d = smax(d, -ellipsoid(x, y, z, 0.0, 0.93, -0.02, 0.24, 0.14, 0.18), 0.1);
  d = smax(d, -ellipsoid(x, y, z, -0.66, 0.86, 0.0, 0.14, 0.1, 0.18), 0.08);
  d = smax(d, -ellipsoid(x, y, z, 0.66, 0.82, -0.02, 0.12, 0.09, 0.16), 0.08);
  const g = 0.045;
  d = smax(d, -capsule(x, y, z, [-0.66, 0.86, 0.02], [0.66, 0.84, -0.04], g), 0.1); // sulco central
  d = smax(d, -capsule(x, y, z, [-0.14, 0.86, 0.0], [-0.17, 0.58, 0.9], g), 0.1); // vestibular mesial
  d = smax(d, -capsule(x, y, z, [0.4, 0.84, -0.02], [0.47, 0.52, 0.78], g), 0.1); // vestibular distal
  d = smax(d, -capsule(x, y, z, [0.0, 0.86, -0.02], [-0.01, 0.62, -0.88], g), 0.1); // lingual
  return d;
}

function tooth(x, y, z) {
  let d = crown(x, y, z);
  const trunk = ellipsoid(x, y, z, 0, -0.25, 0, 0.74, 0.6, 0.6);
  d = smin(d, trunk, 0.22);
  d = smin(d, rootField(x, y, z, 0, 1), 0.28);
  return d;
}

function pulp(x, y, z) {
  let d = ellipsoid(x, y, z, 0, 0.08, 0, 0.42, 0.2, 0.3);
  for (const c of CUSPS) d = smin(d, ellipsoid(x, y, z, c[0] * 0.62, 0.3, c[2] * 0.55, 0.09, 0.14, 0.09), 0.12);
  d = smin(d, rootField(x, y, z, 0, 0.26), 0.14);
  return d;
}

const enamelThickness = (x, y, z) => 0.07 + 0.08 * clamp((y - cej(x, z)) / 0.85, 0, 1);

const LAYERS = {
  // peças maciças: a de dentro fica sempre um pouco recuada, sem superfícies coincidentes
  enamel: (x, y, z) => smax(tooth(x, y, z), cej(x, z) - 0.04 - y, 0.03),
  dentin: (x, y, z) => Math.max(smax(tooth(x, y, z) + enamelThickness(x, y, z), cej(x, z) - 0.04 - y, 0.06), -pulp(x, y, z)),
  pulp,
  root: (x, y, z) => smax(smax(tooth(x, y, z) + 0.004, y - cej(x, z) + 0.01, 0.05), -pulp(x, y, z), 0.03),
};

// ---------- malha ----------
function polygonize(sdf, budget, skin) {
  const mc = new MarchingCubes(RES, { flatShading: false }, false, false, 900000);
  mc.isolation = 0;
  const N = RES;
  const step = HALF / (N / 2);
  for (let k = 0; k < N; k++)
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        const x = CENTER[0] + (i - N / 2) * step;
        const y = CENTER[1] + (j - N / 2) * step;
        const z = CENTER[2] + (k - N / 2) * step;
        mc.field[i + j * N + k * N * N] = -sdf(x, y, z);
      }
  mc.update();
  const count = mc.count;
  // soldar vértices iguais
  const map = new Map();
  const pos = [];
  const idx = new Uint32Array(count);
  for (let v = 0; v < count; v++) {
    const x = CENTER[0] + mc.positionArray[v * 3] * HALF;
    const y = CENTER[1] + mc.positionArray[v * 3 + 1] * HALF;
    const z = CENTER[2] + mc.positionArray[v * 3 + 2] * HALF;
    const key = `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = pos.length / 3;
      map.set(key, id);
      pos.push(x, y, z);
    }
    idx[v] = id;
  }
  // tirar triângulos degenerados
  const tri = [];
  for (let t = 0; t < count; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    if (a !== b && b !== c && a !== c) tri.push(a, b, c);
  }
  let positions = new Float32Array(pos);
  let indices = new Uint32Array(tri);
  const before = indices.length / 3;
  const [simp] = MeshoptSimplifier.simplify(indices, positions, 3, budget * 3, 0.004, ['LockBorder']);
  // compactar vértices usados
  const remap = new Int32Array(positions.length / 3).fill(-1);
  const outPos = [];
  const outIdx = new Uint32Array(simp.length);
  for (let n = 0; n < simp.length; n++) {
    let r = remap[simp[n]];
    if (r < 0) {
      r = remap[simp[n]] = outPos.length / 3;
      const o = simp[n] * 3;
      outPos.push(positions[o], positions[o + 1], positions[o + 2]);
    }
    outIdx[n] = r;
  }
  positions = new Float32Array(outPos);
  // normais pelo gradiente da SDF
  const normals = new Float32Array(positions.length);
  const e = 0.004;
  for (let v = 0; v < positions.length; v += 3) {
    const x = positions[v], y = positions[v + 1], z = positions[v + 2];
    // na quina do corte, a normal segue a casca de fora: sem faixa escura na emenda
    const f = skin && Math.abs(skin(x, y, z)) < 0.006 ? skin : sdf;
    const nx = f(x + e, y, z) - f(x - e, y, z);
    const ny = f(x, y + e, z) - f(x, y - e, z);
    const nz = f(x, y, z + e) - f(x, y, z - e);
    const l = Math.hypot(nx, ny, nz) || 1;
    normals[v] = nx / l;
    normals[v + 1] = ny / l;
    normals[v + 2] = nz / l;
  }
  // orientação: o marching cubes gera tudo no mesmo sentido; confere uma vez pelo total
  let total = 0;
  for (let t = 0; t < outIdx.length; t += 3) {
    const a = outIdx[t] * 3, b = outIdx[t + 1] * 3, c = outIdx[t + 2] * 3;
    const ux = positions[b] - positions[a], uy = positions[b + 1] - positions[a + 1], uz = positions[b + 2] - positions[a + 2];
    const wx = positions[c] - positions[a], wy = positions[c + 1] - positions[a + 1], wz = positions[c + 2] - positions[a + 2];
    total += (uy * wz - uz * wy) * normals[a] + (uz * wx - ux * wz) * normals[a + 1] + (ux * wy - uy * wx) * normals[a + 2];
  }
  if (total < 0)
    for (let t = 0; t < outIdx.length; t += 3) {
      const tmp = outIdx[t + 1];
      outIdx[t + 1] = outIdx[t + 2];
      outIdx[t + 2] = tmp;
    }
  console.log(`  ${before} → ${outIdx.length / 3} triângulos, ${positions.length / 3} vértices`);
  return { positions, normals, indices: outIdx };
}

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;

const SKIN = { enamel: tooth, root: (x, y, z) => tooth(x, y, z) + 0.004 };
const BUDGET = { enamel: 9000, dentin: 5000, pulp: 3000, root: 6000 };
const doc = new Document();
const buffer = doc.createBuffer();
const sceneNode = doc.createScene('molar');
for (const [name, sdf] of Object.entries(LAYERS)) {
  console.log(name);
  const m = polygonize(sdf, BUDGET[name], SKIN[name]);
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(m.positions).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(m.normals).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(m.indices).setBuffer(buffer));
  const mesh = doc.createMesh(name).addPrimitive(prim);
  sceneNode.addChild(doc.createNode(name).setMesh(mesh));
}

await doc.transform(reorder({ encoder: MeshoptEncoder }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
const io = new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const out = new URL('../public/odonto/molar.glb', import.meta.url);
await import('node:fs').then((fs) => fs.mkdirSync(new URL('.', out), { recursive: true }));
await io.write(out.pathname, doc);
const { statSync } = await import('node:fs');
console.log(`ok: ${out.pathname} (${(statSync(out).size / 1024).toFixed(1)} KB)`);
