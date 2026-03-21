/**
 * Accessibility panel — shared across all pages.
 * The panel HTML lives directly in each HTML file.
 * This script manages the 5 settings, persists choices
 * in localStorage, and applies CSS classes to <html>.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'a11y-settings';

  const SETTINGS = [
    { id: 'large-text',    name: 'Larger Text',       cssClass: 'a11y-large-text' },
    { id: 'bold-text',     name: 'Bold Text',          cssClass: 'a11y-bold-text' },
    { id: 'high-contrast', name: 'High Contrast',      cssClass: 'a11y-high-contrast' },
    { id: 'dyslexia',      name: 'Dyslexia-Friendly',  cssClass: 'a11y-dyslexia' },
    { id: 'opendyslexic', name: 'OpenDyslexic Font',   cssClass: 'a11y-opendyslexic' },
  ];

  //Persistence helpers
  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch {
      return {};
    }
  }

  function saveSetting(id, value) {
    const current = loadSaved();
    current[id] = value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  }

  // Apply / remove CSS class on <html>
  function applySetting(setting, enabled) {
    document.documentElement.classList.toggle(setting.cssClass, enabled);

    const checkbox = document.getElementById('a11y-' + setting.id);
    if (checkbox) {
      checkbox.checked = enabled;
      checkbox.setAttribute('aria-checked', String(enabled));
    }
  }

  // Load saved settings on page start
  function loadAll() {
    const saved = loadSaved();
    SETTINGS.forEach(s => applySetting(s, !!saved[s.id]));
  }

  // Panel open / close
  let previousFocus = null;

  function openPanel() {
    previousFocus = document.activeElement;
    const panel   = document.getElementById('a11y-panel');
    const overlay = document.getElementById('a11y-overlay');
    const btn     = document.getElementById('a11y-toggle-btn') ||
                    document.getElementById('a11y-toggle-btn-float');

    panel.removeAttribute('hidden');
    panel.classList.add('open');
    overlay.classList.add('open');
    overlay.removeAttribute('aria-hidden');
    if (btn) btn.setAttribute('aria-expanded', 'true');

    const closeBtn = document.getElementById('a11y-close');
    if (closeBtn) closeBtn.focus();

    document.addEventListener('keydown', handleKeyDown);
  }

  function closePanel() {
    const panel   = document.getElementById('a11y-panel');
    const overlay = document.getElementById('a11y-overlay');
    const btn     = document.getElementById('a11y-toggle-btn') ||
                    document.getElementById('a11y-toggle-btn-float');

    panel.classList.remove('open');
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    if (btn) btn.setAttribute('aria-expanded', 'false');

    panel.setAttribute('hidden', '');
    document.removeEventListener('keydown', handleKeyDown);

    if (previousFocus) previousFocus.focus();
  }

  //Keyboard trap inside dialog
  function handleKeyDown(e) {
    if (e.key === 'Escape') { closePanel(); return; }

    if (e.key !== 'Tab') return;

    const panel     = document.getElementById('a11y-panel');
    const focusable = [...panel.querySelectorAll(
      'button, input, [tabindex]:not([tabindex="-1"])')];
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];

    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  }

  //Announce change to screen reader
  function announce(msg) {
    const live = document.getElementById('a11y-live');
    if (!live) return;
    live.textContent = '';
    setTimeout(() => { live.textContent = msg; }, 50);
  }

  //Wire up toggle checkboxes
  function wireToggles() {
    SETTINGS.forEach(s => {
      const el = document.getElementById('a11y-' + s.id);
      if (!el) return;
      el.addEventListener('change', () => {
        applySetting(s, el.checked);
        saveSetting(s.id, el.checked);
        announce(s.name + (el.checked ? ' enabled' : ' disabled'));
      });
    });

    document.getElementById('a11y-reset').addEventListener('click', () => {
      SETTINGS.forEach(s => { applySetting(s, false); saveSetting(s.id, false); });
      announce('All accessibility settings reset');
    });

    document.getElementById('a11y-close').addEventListener('click', closePanel);
    document.getElementById('a11y-overlay').addEventListener('click', closePanel);

    ['a11y-toggle-btn', 'a11y-toggle-btn-float'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', openPanel);
    });
  }

  //Init
  function init() {
    loadAll();
    wireToggles();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
