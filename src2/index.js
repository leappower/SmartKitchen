// index.js — Main entry point for Kitchen2026 unified page
import './assets/css/styles.css';
import './assets/js/main.js';

import {
  setupNavHighlight,
  toggleMobileMenu,
  setupMobileMenuAutoClose,
  ensureMobileMenuClosed,
  setupBottomNavHighlight,
  setupBackToTop,
} from './assets/js/navigation.js';

import { setupDarkModeToggle } from './assets/js/darkmode.js';

import {
  setupLazyImages,
  setupROICalculator,
  setupSmoothScroll,
  setupQuoteButton,
  setupNewsletter,
} from './assets/js/utils.js';

// ── Bind all DOM event listeners ─────────────────────────────────────────────
function bindAllEvents() {
  // Mobile hamburger menu
  document.getElementById('mobile-menu-btn')
    ?.addEventListener('click', () => toggleMobileMenu(true));

  document.getElementById('mobile-menu-overlay')
    ?.addEventListener('click', () => toggleMobileMenu(false));

  document.getElementById('mobile-menu-close')
    ?.addEventListener('click', () => toggleMobileMenu(false));

  // Dark mode toggle buttons (any element with data-action="toggle-dark")
  // handled by setupDarkModeToggle()

  // "Get a Quote" / "Start ROI Calculator" — smooth scroll to #contact
  setupQuoteButton();

  // Newsletter form
  setupNewsletter();
}

// ── DOMContentLoaded init ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupDarkModeToggle();
  setupNavHighlight();
  setupBackToTop();
  setupMobileMenuAutoClose();
  ensureMobileMenuClosed();
  setupBottomNavHighlight();
  setupLazyImages();
  setupROICalculator();
  setupSmoothScroll();
  bindAllEvents();
});

// ── Global exports (debug / legacy) ──────────────────────────────────────────
window.toggleMobileMenu = toggleMobileMenu;
