// navigation.js — Top nav highlight, mobile menu, back-to-top, bottom nav

// ── Debounce helper ───────────────────────────────────────────────────────────
function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ── Active nav link (scroll spy) ─────────────────────────────────────────────
export function setupNavHighlight() {
  const sections  = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('header nav a[href^="#"]');
  let positions   = [];

  const calcPositions = () => {
    positions = Array.from(sections)
      .filter(s => s.id)
      .map(s => {
        const rect   = s.getBoundingClientRect();
        const scrollY = window.scrollY || window.pageYOffset;
        return { id: s.id, top: rect.top + scrollY - 100 };
      })
      .sort((a, b) => a.top - b.top);
  };

  const update = () => {
    if (!positions.length) return;
    const scroll = window.scrollY || window.pageYOffset;
    let current  = positions[0].id;
    for (let i = 0; i < positions.length; i++) {
      if (scroll >= positions[i].top) current = positions[i].id;
    }
    navLinks.forEach(link => {
      const target = link.getAttribute('href').substring(1);
      link.classList.toggle('active', target === current);
    });
  };

  calcPositions();
  window.addEventListener('scroll',  debounce(update, 80),       { passive: true });
  window.addEventListener('resize',  debounce(calcPositions, 150), { passive: true });
  setTimeout(update, 150);

  navLinks.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const id  = link.getAttribute('href');
      const el  = document.querySelector(id);
      if (el) {
        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
        history.pushState(null, null, id);
      }
    });
  });
}

// ── Mobile menu (slide-in drawer) ────────────────────────────────────────────
let lastToggleAt = 0;

export function setMobileMenuOpen(open) {
  const overlay = document.getElementById('mobile-menu-overlay');
  const menu    = document.getElementById('mobile-menu');
  if (!overlay || !menu) return;

  if (open) {
    overlay.classList.remove('hidden');
    menu.classList.remove('translate-x-full');
    menu.classList.add('translate-x-0');
    document.body.style.overflow = 'hidden';
  } else {
    overlay.classList.add('hidden');
    menu.classList.add('translate-x-full');
    menu.classList.remove('translate-x-0');
    document.body.style.overflow = '';
  }
}

export function toggleMobileMenu(forceOpen) {
  const menu   = document.getElementById('mobile-menu');
  if (!menu) return;
  lastToggleAt  = Date.now();
  const isOpen  = menu.classList.contains('translate-x-0');
  const open    = typeof forceOpen === 'boolean' ? forceOpen : !isOpen;
  setMobileMenuOpen(open);
}

export function setupMobileMenuAutoClose() {
  document.addEventListener('click', e => {
    const menu = document.getElementById('mobile-menu');
    if (!menu || !menu.classList.contains('translate-x-0')) return;
    if (Date.now() - lastToggleAt < 200) return;
    if (!menu.contains(e.target) && !e.target.closest('[data-mobile-menu-toggle]')) {
      setMobileMenuOpen(false);
    }
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) setMobileMenuOpen(false);
  });
}

export function ensureMobileMenuClosed() {
  const menu    = document.getElementById('mobile-menu');
  const overlay = document.getElementById('mobile-menu-overlay');
  menu?.classList.add('translate-x-full');
  menu?.classList.remove('translate-x-0');
  overlay?.classList.add('hidden');
  document.body.style.overflow = '';
}

// ── Bottom nav tab highlight ──────────────────────────────────────────────────
export function setupBottomNavHighlight() {
  const tabs = document.querySelectorAll('.bottom-nav a[data-tab]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('text-primary');
        t.classList.add('text-slate-500', 'dark:text-slate-400');
      });
      tab.classList.add('text-primary');
      tab.classList.remove('text-slate-500', 'dark:text-slate-400');
    });
  });
}

// ── Back to top (used on desktop/laptop breakpoints) ─────────────────────────
export function setupBackToTop() {
  const btn = document.getElementById('back-to-top');
  if (!btn) return;

  const toggle = () => {
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const threshold  = window.innerWidth < 768 ? 0.3 : 0.5;
    btn.classList.toggle('opacity-0', window.scrollY < scrollable * threshold);
    btn.classList.toggle('pointer-events-none', window.scrollY < scrollable * threshold);
  };

  window.addEventListener('scroll', debounce(toggle, 100), { passive: true });
  btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  toggle();
}
