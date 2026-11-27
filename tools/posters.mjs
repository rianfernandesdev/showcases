// Gera os posters (imagem do primeiro quadro do 3D) que aparecem antes do 3D entrar.
// Precisa do site rodando: npx vite build && npx vite preview --port 4173
// Rodar: node tools/posters.mjs   (usa o Playwright/Chromium da máquina)
import { createRequire } from 'node:module';
import { mkdirSync, statSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const sharp = (await import('sharp').catch(() => null))?.default;

const BASE = process.env.BASE || 'http://localhost:4173/showcases';
const PAGES = { odonto: '#stage', estetica: '#scene', solar: '#instrument' };
const SIZES = {
  desk: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1.5 },
  mob: { viewport: { width: 390, height: 760 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
for (const [page, host] of Object.entries(PAGES)) {
  for (const [size, opts] of Object.entries(SIZES)) {
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
