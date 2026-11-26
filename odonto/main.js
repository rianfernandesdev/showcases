import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/jetbrains-mono';
import '../base/base.css';
import './style.css';

import { initBase, bindOpenStatus, autoHideHeader, nowInPOA, fmtTime, toast } from '../base/ui.js';
import { detectQuality, when3D } from '../base/quality.js';
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

// ---------- Agendar: escolhe o dia e a mensagem do WhatsApp sai pronta ----------
// Sem integração com agenda: mostra só os próximos dias em que a clínica abre (HOURS)
// e manda o dia escolhido no texto. Quem confirma o horário é a recepção, no WhatsApp.
function buildDays() {
  const list = document.getElementById('slots');
  const msgEl = document.querySelector('[data-wa-msg]');
  const waBtn = document.querySelector('[data-wa]');
  const { day, h, m } = nowInPOA();
  const now = h * 60 + m;
  const names = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const short = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const base = new Date();
  const out = [];
  for (let i = 0; out.length < 6 && i < 14; i++) {
    const d = (day + i) % 7;
    const hours = HOURS[d];
    if (!hours) continue;
    if (i === 0 && now > hours[1] - 60) continue; // hoje já está fechando
    const date = new Date(base.getTime() + i * 864e5);
    const dm = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
    const label = i === 0 ? 'Hoje' : i === 1 ? 'Amanhã' : short[d];
    const said = i === 0 ? 'hoje' : i === 1 ? 'amanhã' : `${d === 0 || d === 6 ? 'no' : 'na'} ${names[d]}`;
    out.push({ label, dm, said: `${said} (${dm})` });
  }
  list.innerHTML = out
    .map((s, i) => `<li><button type="button" aria-pressed="false" data-i="${i}"><b>${s.label}</b><small>${s.dm}</small></button></li>`)
    .join('');

  const paint = (s) => {
    const text = s
      ? `Olá! Vim pelo site e gostaria de saber se tem horário disponível ${s.said}.`
      : 'Olá! Vim pelo site e gostaria de agendar uma avaliação.';
    msgEl.textContent = text;
    // no site real: waBtn.href = `https://wa.me/55DDDNUMERO?text=${encodeURIComponent(text)}`
    waBtn.dataset.demo = 'Demonstração: no site real, abre o WhatsApp da clínica com essa mensagem já escrita.';
  };
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const on = b.getAttribute('aria-pressed') !== 'true';
    list.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(on && x === b)));
    paint(on ? out[+b.dataset.i] : null);
  });
  paint(null);
}
buildDays();

// ---------- 3D: só depois do conteúdo, e só se o aparelho aguenta ----------
const quality = detectQuality();
when3D(quality, () => {
  import('./scene.js').then(({ startScene }) =>
    startScene(document.getElementById('stage'), quality, state, document.getElementById('labels')),
  );
});
