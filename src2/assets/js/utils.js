// utils.js — Shared helpers for the Kitchen2026 page

// ── Lazy image loading (IntersectionObserver) ─────────────────────────────────
export function setupLazyImages() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;

      // Background-image via data-bg
      const bg = img.dataset.bg;
      if (bg) {
        img.style.backgroundImage = `url('${bg}')`;
        img.removeAttribute('data-bg');
      }

      // Regular <img> via data-src
      const src = img.dataset.src;
      if (src) {
        img.src = src;
        img.removeAttribute('data-src');
      }

      img.classList.add('loaded');
      observer.unobserve(img);
    });
  }, { rootMargin: '120px', threshold: 0 });

  const observe = (root) => {
    root.querySelectorAll('[data-src],[data-bg]').forEach(el => {
      if (!el.dataset.lazyObserved) {
        el.dataset.lazyObserved = '1';
        observer.observe(el);
      }
    });
  };

  observe(document);

  // Watch for dynamically inserted elements
  new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => {
      if (node.nodeType === Node.ELEMENT_NODE) observe(node);
    }));
  }).observe(document.body, { childList: true, subtree: true });
}

// ── ROI Calculator (simple inline demo) ──────────────────────────────────────
export function setupROICalculator() {
  const btn    = document.getElementById('roi-calc-btn');
  const modal  = document.getElementById('roi-calc-modal');
  const closeBtn = document.getElementById('roi-calc-close');

  btn?.addEventListener('click', () => modal?.classList.remove('hidden'));
  closeBtn?.addEventListener('click', () => modal?.classList.add('hidden'));
  modal?.addEventListener('click', e => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

// ── Smooth anchor scroll ──────────────────────────────────────────────────────
export function setupSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const id = link.getAttribute('href');
      if (id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      window.scrollTo({ top: target.offsetTop - 72, behavior: 'smooth' });
    });
  });
}

// ── Quote / Get a Quote button ────────────────────────────────────────────────
export function setupQuoteButton() {
  document.querySelectorAll('[data-action="get-quote"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const contactSection = document.getElementById('contact');
      if (contactSection) {
        window.scrollTo({ top: contactSection.offsetTop - 72, behavior: 'smooth' });
      }
    });
  });
}

// ── Newsletter form ───────────────────────────────────────────────────────────
export function setupNewsletter() {
  const form = document.getElementById('newsletter-form');
  if (!form) return;
  form.addEventListener('submit', e => {
    e.preventDefault();
    const email = form.querySelector('input[type="email"]')?.value?.trim();
    if (!email) return;
    // Replace with real API call
    const btn = form.querySelector('button[type="submit"]');
    if (btn) { btn.textContent = 'Sent!'; btn.disabled = true; }
  });
}
