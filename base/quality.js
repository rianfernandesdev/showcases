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

// Carrega o 3D no primeiro sinal de uso: rolar, tocar, mexer o mouse ou o teclado.
// A página abre leve (só HTML, CSS e texto) e o 3D entra quando a pessoa já está ali.
export function whenEngaged(fn) {
  const events = ['pointermove', 'pointerdown', 'touchstart', 'wheel', 'scroll', 'keydown'];
  let done = false;
  const go = () => {
    if (done) return;
    done = true;
    events.forEach((e) => removeEventListener(e, go));
    whenIdle(fn, 300);
  };
  events.forEach((e) => addEventListener(e, go, { passive: true, once: true }));
  // Se a página já abriu rolada (voltar/recarregar no meio), carrega direto.
  if (scrollY > 0) go();
}
