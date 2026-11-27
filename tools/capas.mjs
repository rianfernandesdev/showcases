// Gera as capas da página inicial (public/capas/*.webp): print da abertura de cada showcase
// no PC, já com o 3D carregado e sem a faixa de "clínica fictícia".
// Precisa do site rodando: npx vite build && npx vite preview --port 4173
// Rodar: node tools/capas.mjs   (ONLY=estetica pra refazer uma só)
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sharp = (await import('sharp')).default;

const BASE = process.env.BASE || 'http://localhost:4173/showcases';
const ALL = { odonto: '#stage', estetica: '#scene', solar: '#instrument' };
const PAGES = process.env.ONLY ? { [process.env.ONLY]: ALL[process.env.ONLY] } : ALL;
const W = 960;
const H = 578;

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const out = new URL('../public/capas/', import.meta.url);
mkdirSync(out, { recursive: true });

for (const [page, host] of Object.entries(PAGES)) {
  // 1280 de largura, mesma proporção da capa; movimento reduzido pra o 3D ficar no quadro inicial
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: Math.round((1280 * H) / W) },
    deviceScaleFactor: 1.5,
    reducedMotion: 'reduce',
    timezoneId: 'America/Sao_Paulo',
  });
  const pg = await ctx.newPage();
  // terça às 10h: o selo de horário aparece "Aberto agora" na capa
  await pg.clock.setFixedTime(new Date('2026-11-24T10:00:00-03:00'));
  await pg.goto(`${BASE}/${page}/`, { waitUntil: 'networkidle' });
  await pg.addStyleTag({
    content: `.demo-bar { display: none !important; }
      .js [data-reveal], [data-split] * { opacity: 1 !important; transform: none !important; }`,
  });
  await pg.keyboard.press('Shift');
  await pg.waitForSelector(`${host}.is-ready`, { timeout: 30000 });
  await pg.waitForLoadState('networkidle');
  await pg.waitForTimeout(2500);
  const png = await pg.screenshot();
  const file = new URL(`${page}.webp`, out).pathname;
  await sharp(png).resize(W, H).webp({ quality: 80, effort: 6 }).toFile(file);
  console.log(file, `${(statSync(file).size / 1024).toFixed(1)} KB`);
  await ctx.close();
}
await browser.close();
