import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/inter-tight';
import '../base/base.css';
import './style.css';

import { initBase, bindOpenStatus, autoHideHeader } from '../base/ui.js';
import { detectQuality, whenIdle } from '../base/quality.js';
import { trackProgress } from '../base/scroll.js';

const HOURS = { 0: null, 1: [540, 1140], 2: [540, 1140], 3: [540, 1140], 4: [540, 1140], 5: [540, 1140], 6: [540, 780] };

initBase();
bindOpenStatus(HOURS);
const header = document.querySelector('.hdr');
autoHideHeader(header);

// Estado compartilhado com a cena 3D
const state = { intro: 0, care: 0, careIndex: 0 };

trackProgress(document.getElementById('intro'), (p) => (state.intro = p));

// Método: troca o verbo ativo conforme o scroll
const verbs = [...document.querySelectorAll('.verb')];
trackProgress(document.getElementById('metodo'), (p) => {
  const i = Math.min(verbs.length - 1, Math.floor(p * verbs.length * 0.999));
  verbs.forEach((v, k) => v.classList.toggle('is-on', k === i));
});

// Cuidados: item ativo da lista e bolinha
const careItems = [...document.querySelectorAll('.care-list li')];
const dots = [...document.querySelectorAll('.orb-dots i')];
trackProgress(document.getElementById('cuidados'), (p) => {
  state.care = p;
  const i = Math.min(3, Math.floor(p * 4 * 0.999));
  state.careIndex = i;
  careItems.forEach((el, k) => el.classList.toggle('is-on', k === i));
  dots.forEach((el, k) => el.classList.toggle('is-on', k === i));
});

// Cabeçalho escuro quando passa por cima de seção clara
const lightSections = [...document.querySelectorAll('.method, .team, .faq-sec')];
const paintHeader = () => {
  const y = 36;
  const light = lightSections.some((s) => {
    const r = s.getBoundingClientRect();
    return r.top <= y && r.bottom >= y;
  });
  header.classList.toggle('is-light', light);
};
addEventListener('scroll', paintHeader, { passive: true });
paintHeader();

const quality = detectQuality();
if (quality.tier !== 'off') {
  whenIdle(() => {
    import('./scene.js').then(({ startScene }) => startScene(document.getElementById('scene'), quality, state));
  });
}
