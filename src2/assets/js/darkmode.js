// darkmode.js — Dark / light mode toggle with localStorage persistence

export function initDarkMode() {
  const stored = localStorage.getItem('darkMode');
  // Default: follow system preference if nothing stored
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = stored !== null ? stored === 'true' : prefersDark;
  document.documentElement.classList.toggle('dark', isDark);
}

export function toggleDarkMode() {
  const nowDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('darkMode', String(nowDark));

  // Update any toggle button icons
  document.querySelectorAll('[data-dark-icon]').forEach(el => {
    el.textContent = nowDark ? 'light_mode' : 'dark_mode';
  });
}

export function setupDarkModeToggle() {
  initDarkMode();

  // Update icon on load
  const isDark = document.documentElement.classList.contains('dark');
  document.querySelectorAll('[data-dark-icon]').forEach(el => {
    el.textContent = isDark ? 'light_mode' : 'dark_mode';
  });

  document.querySelectorAll('[data-action="toggle-dark"]').forEach(btn => {
    btn.addEventListener('click', toggleDarkMode);
  });
}
