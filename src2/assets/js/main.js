// main.js — App bootstrap: module registry + error / lazy-load handling
class App {
  constructor() {
    this.modules     = new Map();
    this.initialized = false;
  }

  registerModule(name, mod) { this.modules.set(name, mod); }

  async initialize() {
    if (this.initialized) return;
    for (const [, mod] of this.modules) {
      try { if (typeof mod.init === 'function') await mod.init(); }
      catch (err) { console.error('[App] module init error:', err); }
    }
    this.initialized = true;
    document.querySelector('main')?.classList.add('loaded');
  }
}

// ── Error handler ─────────────────────────────────────────────────────────────
class ErrorHandlingModule {
  init() {
    window.addEventListener('error', e => console.error('[Global error]', e.error));
    window.addEventListener('unhandledrejection', e => console.error('[Unhandled rejection]', e.reason));
    window.addEventListener('offline',  () => this._toast('You are offline', 'yellow'));
    window.addEventListener('online',   () => this._toast('Back online', 'green'));
  }
  _toast(msg, color) {
    const el = Object.assign(document.createElement('div'), {
      className: `fixed top-4 right-4 px-4 py-2 rounded-lg shadow-lg z-50 bg-${color}-500 text-white text-sm font-medium`,
      textContent: msg,
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  }
}

const app = new App();
app.registerModule('errors', new ErrorHandlingModule());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.initialize());
} else {
  app.initialize();
}

window.app = app;
export { App };
