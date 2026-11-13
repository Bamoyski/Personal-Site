/**
 * DOM behaviour: theme, motion preference, icons, reveals, tab scrollspy.
 * Kept separate from the 3D layer so the page still works without WebGL.
 */

const root = document.documentElement;

export function initUI({ onThemeChange, onMotionChange } = {}) {
  /* --------------------------------- icons -------------------------------- */
  function paintIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }
  document.addEventListener('DOMContentLoaded', paintIcons);
  window.addEventListener('load', paintIcons);
  if (document.readyState !== 'loading') paintIcons();

  /* --------------------------------- theme -------------------------------- */
  const themeToggle = document.getElementById('theme-toggle');
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const themeColors = { dark: '#08080A', light: '#EDEBE6' };

  function applyTheme(theme, persist) {
    root.dataset.theme = theme;
    themeMeta?.setAttribute('content', themeColors[theme]);
    if (themeToggle) {
      const next = theme === 'dark' ? 'light' : 'dark';
      themeToggle.setAttribute('aria-label', 'Switch to ' + next + ' theme');
      themeToggle.setAttribute('title', 'Switch to ' + next + ' theme');
    }
    onThemeChange?.(theme);
    if (persist) {
      try { localStorage.setItem('bm-theme', theme); } catch (error) { /* storage unavailable */ }
    }
  }

  let savedTheme = null;
  try { savedTheme = localStorage.getItem('bm-theme'); } catch (error) { /* storage unavailable */ }
  applyTheme(savedTheme === 'light' ? 'light' : 'dark', false);

  themeToggle?.addEventListener('click', () => {
    applyTheme(root.dataset.theme === 'dark' ? 'light' : 'dark', true);
  });

  /* ------------------------------ motion toggle --------------------------- */
  const motionToggle = document.getElementById('motion-toggle');
  const systemReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function applyMotion(reduced, persist) {
    root.dataset.motion = reduced ? 'reduced' : 'full';
    if (motionToggle) {
      motionToggle.setAttribute('aria-pressed', String(reduced));
      motionToggle.setAttribute('aria-label', reduced ? 'Enable motion' : 'Reduce motion');
      motionToggle.setAttribute('title', reduced ? 'Enable motion' : 'Reduce motion');
    }
    onMotionChange?.(reduced);
    if (persist) {
      try { localStorage.setItem('bm-motion', reduced ? 'reduced' : 'full'); } catch (error) { /* noop */ }
    }
  }

  let savedMotion = null;
  try { savedMotion = localStorage.getItem('bm-motion'); } catch (error) { /* noop */ }
  applyMotion(savedMotion ? savedMotion === 'reduced' : systemReduced, false);

  motionToggle?.addEventListener('click', () => {
    applyMotion(root.dataset.motion !== 'reduced', true);
  });

  /* ------------------------------ copy button ----------------------------- */
  const copyBtn = document.querySelector('[data-copy]');
  if (copyBtn) {
    const label = copyBtn.querySelector('span');
    let resetTimer;
    copyBtn.addEventListener('click', async () => {
      const value = copyBtn.dataset.copy;
      let copied = false;
      try {
        await navigator.clipboard.writeText(value);
        copied = true;
      } catch (error) {
        const field = document.createElement('textarea');
        field.value = value;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        try { copied = document.execCommand('copy'); } catch (fallbackError) { copied = false; }
        field.remove();
      }
      if (!copied) return;
      copyBtn.classList.add('copied');
      if (label) label.textContent = 'Copied';
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        copyBtn.classList.remove('copied');
        if (label) label.textContent = 'Copy';
      }, 1800);
    });
  }

  /* -------------------------------- reveals ------------------------------- */
  const reveals = document.querySelectorAll('.reveal');
  if (systemReduced) {
    reveals.forEach((element) => element.classList.add('in'));
  } else if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('in');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -5% 0px' }
    );
    reveals.forEach((element) => revealObserver.observe(element));
  } else {
    reveals.forEach((element) => element.classList.add('in'));
  }

  /* -------------------------------- topbar -------------------------------- */
  const topbar = document.getElementById('topbar');
  if (topbar) {
    const onScroll = () => topbar.classList.toggle('is-stuck', window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ------------------------------ open inside ------------------------------ */
  /* Jumps to the exploded view for the machine you are looking at. */
  document.addEventListener('click', (event) => {
    const button = event.target.closest?.('[data-open-inside]');
    if (!button) return;
    const sheet = button.closest('.sheet');
    const target = sheet?.querySelector('[data-internals]');
    if (!target) return;
    target.setAttribute('tabindex', '-1');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.focus({ preventScroll: true });
  });

  /* ------------------------------- tab scrollspy --------------------------- */
  const tabLinks = Array.from(document.querySelectorAll('.tabs a'));
  const sections = tabLinks
    .map((link) => document.querySelector(link.getAttribute('href')))
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length) {
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          tabLinks.forEach((link) => {
            if (link.getAttribute('href') === '#' + entry.target.id) {
              link.setAttribute('aria-current', 'true');
            } else {
              link.removeAttribute('aria-current');
            }
          });
        });
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: 0 }
    );
    sections.forEach((section) => spy.observe(section));
  }

  return { applyTheme, applyMotion };
}
