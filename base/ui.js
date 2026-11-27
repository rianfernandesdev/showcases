// Interações de interface que todo showcase usa. Sem dependência.

// Aparece ao entrar na tela: [data-reveal] ganha .is-in.
export function reveal(root = document) {
  const els = root.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('is-in'));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('is-in');
          io.unobserve(e.target);
        }
      }
    },
    { rootMargin: '0px 0px -12% 0px' },
  );
  els.forEach((el) => {
    // o que já está na primeira tela ao abrir aparece direto, mesmo encostado no fim dela
    // (em celular baixo o botão da abertura ficava nos últimos 12% e nunca aparecia)
    if (scrollY === 0 && el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in');
    else io.observe(el);
  });
}

// Quebra o texto em palavras pra animar em cascata: [data-split].
export function splitWords(root = document) {
  root.querySelectorAll('[data-split]').forEach((el) => {
    let i = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) frag.append(part);
            else {
              const w = document.createElement('span');
              w.className = 'w';
              const inner = document.createElement('span');
              inner.textContent = part;
              inner.style.setProperty('--i', i++);
              w.append(inner);
              frag.append(w);
            }
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el);
    el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
  });
}

// Hora atual em Porto Alegre, independente do fuso do visitante.
export function nowInPOA() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const days = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: days[get('weekday')],
    h: +get('hour'),
    m: +get('minute'),
    s: +get('second'),
  };
}

const pad = (n) => String(n).padStart(2, '0');
export const fmtTime = (mins) => `${pad(Math.floor(mins / 60))}h${mins % 60 ? pad(mins % 60) : ''}`;

// hours: { 0: null, 1: [480, 1140], ... } em minutos desde a meia-noite, 0 = domingo.
export function openStatus(hours) {
  const { day, h, m } = nowInPOA();
  const now = h * 60 + m;
  const today = hours[day];
  if (today && now >= today[0] && now < today[1]) {
    return { open: true, text: `Aberto agora · até ${fmtTime(today[1])}` };
  }
  for (let i = 0; i < 7; i++) {
    const d = (day + i) % 7;
    const slot = hours[d];
    if (!slot) continue;
    if (i === 0 && now < slot[0]) return { open: false, text: `Fechado · abre hoje às ${fmtTime(slot[0])}` };
    if (i === 1) return { open: false, text: `Fechado · abre amanhã às ${fmtTime(slot[0])}` };
    if (i > 1) {
      const name = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d];
      return { open: false, text: `Fechado · abre ${name} às ${fmtTime(slot[0])}` };
    }
  }
  return { open: false, text: 'Fechado' };
}

export function bindOpenStatus(hours, selector = '[data-open-status]') {
  const paint = () => {
    const s = openStatus(hours);
    document.querySelectorAll(selector).forEach((el) => {
      el.textContent = s.text;
      el.closest('[data-open]')?.setAttribute('data-open', s.open ? 'yes' : 'no');
    });
    const { day } = nowInPOA();
    // data-day="3" (um dia) ou data-days="1,2,3,4,5" (linha que junta vários dias)
    document.querySelectorAll('[data-day], [data-days]').forEach((el) => {
      const days = (el.dataset.days ?? el.dataset.day).split(',').map(Number);
      el.classList.toggle('is-today', days.includes(day));
    });
  };
  paint();
  setInterval(paint, 60_000);
}

// Relógio de POA ao vivo: [data-clock].
export function bindClock(selector = '[data-clock]') {
  const els = document.querySelectorAll(selector);
  if (!els.length) return;
  const paint = () => {
    const { h, m, s } = nowInPOA();
    els.forEach((el) => (el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`));
  };
  paint();
  setInterval(paint, 1000);
}

// Aviso curto no canto (usado nos botões que, no site real, abrem o WhatsApp).
let toastTimer;
export function toast(msg) {
  let el = document.querySelector('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 3200);
}

export function bindDemoLinks(msg = 'Demonstração: no site real, este botão abre o WhatsApp da clínica.') {
  document.querySelectorAll('[data-demo]').forEach((el) =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      toast(el.dataset.demo || msg);
    }),
  );
}

// Cabeçalho que some ao descer e volta ao subir.
export function autoHideHeader(header) {
  if (!header) return;
  let last = scrollY;
  addEventListener(
    'scroll',
    () => {
      const y = scrollY;
      header.classList.toggle('is-scrolled', y > 24);
      header.classList.toggle('is-hidden', y > last && y > 400);
      last = y;
    },
    { passive: true },
  );
}

export function initBase() {
  document.documentElement.classList.add('js');
  splitWords();
  reveal();
  bindClock();
  bindDemoLinks();
  document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
}
