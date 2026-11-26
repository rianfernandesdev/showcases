// Decide quanto 3D o aparelho aguenta, antes de carregar o Three.js.
// tier: 'off' (sem WebGL ou economia de dados) · 'low' · 'mid' · 'high'

export function detectQuality() {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection?.saveData === true;
  const memory = navigator.deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  const small = Math.min(innerWidth, innerHeight) < 640;

  let webgl = false;
  try {
    const c = document.createElement('canvas');
    webgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    webgl = false;
  }

  if (!webgl || saveData) return { tier: 'off', reduce, dpr: 1, small };
  if (memory <= 2 || (cores <= 4 && small)) return { tier: 'low', reduce, dpr: 1, small };
  const dpr = Math.min(devicePixelRatio || 1, small ? 1.5 : 2);
  return { tier: small ? 'mid' : 'high', reduce, dpr, small };
}

// Roda depois do conteúdo: espera o load e um respiro do navegador.
export function whenIdle(fn, timeout = 1200) {
  const go = () => {
    if ('requestIdleCallback' in window) requestIdleCallback(fn, { timeout });
    else setTimeout(fn, 200);
  };
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}
