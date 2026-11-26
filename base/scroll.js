// Progresso de scroll de uma seção: 0 quando o topo dela encosta no topo da tela,
// 1 quando o fim dela encosta no fim da tela. Ideal pra seções "presas" (sticky).
export function sectionProgress(el) {
  const r = el.getBoundingClientRect();
  const total = r.height - innerHeight;
  if (total <= 0) return r.top <= 0 ? 1 : 0;
  return clamp(-r.top / total, 0, 1);
}

// Publica o progresso como variável CSS --p e chama o callback a cada mudança.
export function trackProgress(el, cb) {
  let last = -1;
  const tick = () => {
    const p = sectionProgress(el);
    if (Math.abs(p - last) > 0.0005) {
      last = p;
      el.style.setProperty('--p', p.toFixed(4));
      cb?.(p);
    }
  };
  addEventListener('scroll', tick, { passive: true });
  addEventListener('resize', tick);
  tick();
  return () => sectionProgress(el);
}

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
// Faixa local: quanto do trecho [a, b] já passou, de 0 a 1.
export const range = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
