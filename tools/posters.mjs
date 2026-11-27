// Gera os posters (imagem do primeiro quadro do 3D) que aparecem antes do 3D entrar.
// Precisa do site rodando: npx vite build && npx vite preview --port 4173
// Rodar: node tools/posters.mjs   (usa o Playwright/Chromium da máquina)
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sharp = (await import('sharp').catch(() => null))?.default;

const BASE = process.env.BASE || 'http://localhost:4173/showcases';
const ALL = { odonto: '#stage', estetica: '#scene', solar: '#instrument' };
// ONLY=estetica node tools/posters.mjs  -> refaz só uma página
const PAGES = process.env.ONLY ? { [process.env.ONLY]: ALL[process.env.ONLY] } : ALL;
// a estética ancora o poster (base.css .poster-anchor): no PC captura bem larga, no celular bem alta,
// pra cobrir telas mais largas ou mais compridas sem sobrar borda
const SIZES_BY_PAGE = {
  estetica: {
    desk: { viewport: { width: 2000, height: 800 }, deviceScaleFactor: 1.25 },
    tab: { viewport: { width: 816, height: 1024 }, deviceScaleFactor: 1.5, hasTouch: true },
    mob: { viewport: { width: 390, height: 940 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  },
};
const SIZES = {
  desk: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 },
  mob: { viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const [page, host] of Object.entries(PAGES)) {
  for (const [size, opts] of Object.entries(SIZES_BY_PAGE[page] || SIZES)) {
    // movimento reduzido: o 3D fica parado no quadro inicial (sem giro nem flutuação)
    const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' });
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/${page}/`, { waitUntil: 'networkidle' });
    // só o canvas aparece; o resto da página some e o fundo fica transparente
    await pg.addStyleTag({
      content: `html, body { background: transparent !important; }
        body * { visibility: hidden !important; }
        ${host}, ${host} canvas { visibility: visible !important; }
        ${host} picture { display: none !important; }`,
    });
    // tecla qualquer: dispara o 3D sem mexer o ponteiro
    await pg.keyboard.press('Shift');
    await pg.waitForSelector(`${host}.is-ready`, { timeout: 30000 });
    await pg.waitForLoadState('networkidle');
    await pg.waitForTimeout(2500);
    const png = await (await pg.$(host)).screenshot({ omitBackground: true });
    const dir = new URL(`../public/${page}/`, import.meta.url);
    mkdirSync(dir, { recursive: true });
    const out = new URL(`poster-${size}.webp`, dir).pathname;
    if (sharp) await sharp(png).webp({ quality: 78, alphaQuality: 90, effort: 6 }).toFile(out);
    else throw new Error('instala o sharp: npm i -D sharp');
    console.log(out, `${(statSync(out).size / 1024).toFixed(1)} KB`);
    await ctx.close();
  }
}
await browser.close();
