import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/jetbrains-mono';
import '../base/base.css';
import './style.css';

import { initBase, bindOpenStatus, autoHideHeader, nowInPOA, fmtTime, toast } from '../base/ui.js';
import { detectQuality, whenIdle } from '../base/quality.js';
import { trackProgress, range } from '../base/scroll.js';

// Horário em minutos (0 = domingo).
const HOURS = { 0: null, 1: [480, 1200], 2: [480, 1200], 3: [480, 1200], 4: [480, 1200], 5: [480, 1200], 6: [480, 780] };

initBase();
bindOpenStatus(HOURS);
autoHideHeader(document.querySelector('.hdr'));

// ---------- Vistas da hero, ligadas ao scroll ----------
const hero = document.getElementById('hero');
const frames = [...document.querySelectorAll('.frame')];
const ticks = [...document.querySelectorAll('.ticks i')];
const frameNum = document.querySelector('[data-frame-num]');
const state = { p: 0 };
let current = -1;

trackProgress(hero, (p) => {
  state.p = p;
  const f = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
  ticks.forEach((t, i) => t.style.setProperty('--f', range(p, i / 3, (i + 1) / 3).toFixed(3)));
  if (f !== current) {
    current = f;
    frames.forEach((el, i) => el.classList.toggle('is-on', i === f));
    frameNum.textContent = String(f + 1).padStart(2, '0');
  }
});

// ---------- Horários livres (gerados a partir de hoje, em POA) ----------
function buildSlots() {
  const list = document.getElementById('slots');
  const { day, h, m } = nowInPOA();
  const now = h * 60 + m;
  const names = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const out = [];
  for (let i = 0; out.length < 5 && i < 10; i++) {
    const d = (day + i) % 7;
    const hours = HOURS[d];
    if (!hours) continue;
    // primeiro horário "livre": um pseudo-aleatório estável por dia
    const seed = (d * 37 + i * 11) % 7;
    let first = hours[0] + 40 + seed * 30;
    if (i === 0) first = Math.max(first, Math.ceil((now + 50) / 20) * 20);
    if (first > hours[1] - 50) continue;
    const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : names[d];
    out.push({ label, time: fmtTime(first), count: 2 + ((seed * 3) % 6) });
  }
  list.innerHTML = out
    .map(
      (s) =>
        `<li><button type="button" aria-pressed="false"><b>${s.label}</b><small>${s.count} horários · a partir de ${s.time}</small></button></li>`,
    )
    .join('');
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    list.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    toast(`Demonstração: no site real, abre o WhatsApp com "${b.querySelector('b').textContent}" já escrito.`);
  });
  const next = out[0];
  if (next) document.querySelector('[data-next-slot]').textContent = `${next.label}, ${next.time}`;
}
buildSlots();

// ---------- 3D: só depois do conteúdo, e só se o aparelho aguenta ----------
const quality = detectQuality();
if (quality.tier !== 'off') {
  whenIdle(() => {
    import('./scene.js').then(({ startScene }) =>
      startScene(document.getElementById('stage'), quality, state, document.getElementById('labels')),
    );
  });
}
