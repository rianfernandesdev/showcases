import '@fontsource-variable/space-grotesk';
import '@fontsource-variable/jetbrains-mono';
import '../base/base.css';
import './style.css';

import { initBase } from '../base/ui.js';
import { detectQuality, when3D } from '../base/quality.js';
import { trackProgress } from '../base/scroll.js';

initBase();

// ---------- Tour: progresso define a pose do módulo solar ----------
const state = { p: 0 };
const stepOut = document.querySelector('[data-step]');
trackProgress(document.getElementById('etapas'), (p) => {
  state.p = p;
  stepOut.textContent = String(Math.round(p * 4)).padStart(2, '0');
});

// ---------- Simulador ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const TARIFA = 0.95; // R$/kWh
const GERACAO = 115; // kWh por kWp ao mês em POA
const COMPENSA = 0.85; // parte da conta que a usina abate
const CUSTO_KWP = 3700; // R$ por kWp instalado
const MODULO = 0.6; // kWp por módulo
const AREA_MOD = 2.7; // m² por módulo, com espaçamento

const bill = document.getElementById('bill');
const out = (id, v) => (document.getElementById(id).textContent = v);
function simulate() {
  const v = +bill.value;
  bill.style.setProperty('--fill', `${((v - bill.min) / (bill.max - bill.min)) * 100}%`);
  out('bill-out', brl.format(v));
  const kwh = v / TARIFA;
  const kwp = kwh / GERACAO;
  const mods = Math.ceil(kwp / MODULO);
  const save = v * COMPENSA * 12;
  const cost = kwp * CUSTO_KWP;
  const years = cost / save;
  out('o-kwp', `${num.format(kwp)} kWp`);
  out('o-mod', `${mods}`);
  out('o-area', `${Math.round(mods * AREA_MOD)} m²`);
  out('o-save', brl.format(save));
  const lo = Math.max(1, Math.floor(years * 0.9 * 2) / 2);
  const hi = Math.ceil(years * 1.15 * 2) / 2;
  out('o-pay', `${num.format(lo)} a ${num.format(hi)} anos`);
}
bill.addEventListener('input', simulate);
simulate();

// ---------- 3D ----------
const quality = detectQuality();
when3D(quality, () => {
  import('./scene.js').then(({ startScene }) => startScene(document.getElementById('instrument'), quality, state, document.getElementById('labels')));
});
