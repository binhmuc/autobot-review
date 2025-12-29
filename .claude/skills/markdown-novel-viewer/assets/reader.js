/**
 * Reader.js - Client-side interactivity for novel viewer
 * Handles theme toggle, font size, sidebar, and keyboard navigation
 */

(function() {
  'use strict';

  // DOM Elements
  const html = document.documentElement;
  const themeToggle = document.getElementById('theme-toggle');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  const fontBtns = document.querySelectorAll('.font-btn');
  const hljsLight = document.getElementById('hljs-light');
  const hljsDark = document.getElementById('hljs-dark');

  // Storage keys (shared with kanban dashboard for theme persistence)
  const THEME_KEY = 'theme';
  const FONT_KEY = 'novel-viewer-font';
  const SIDEBAR_KEY = 'novel-viewer-sidebar';

  // Initialize theme
  function initTheme() {
    const stored = localStorage.getItem(THEME_KEY);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');

    setTheme(theme);
  }

  // Set theme
  function setTheme(theme) {
    html.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);

    // Switch highlight.js theme
    if (hljsLight && hljsDark) {
      hljsLight.disabled = theme === 'dark';
      hljsDark.disabled = theme === 'light';
    }
  }

  // Toggle theme
  function toggleTheme() {
    const current = html.dataset.theme || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    setTheme(next);
  }

  // Initialize font size
  function initFontSize() {
    const stored = localStorage.getItem(FONT_KEY) || 'M';
    setFontSize(stored);
  }

  // Set font size
  function setFontSize(size) {
    html.dataset.fontSize = size;
    localStorage.setItem(FONT_KEY, size);

    // Update button states
    fontBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.size === size);
    });
  }

  // Initialize sidebar
  function initSidebar() {
    const stored = localStorage.getItem(SIDEBAR_KEY);
    const isMobile = window.innerWidth <= 900;

    if (isMobile) {
      sidebar?.classList.add('hidden');
    } else if (stored === 'hidden') {
      sidebar?.classList.add('hidden');
    }
  }

  // Toggle sidebar
  function toggleSidebar() {
    const isHidden = sidebar?.classList.toggle('hidden');
    localStorage.setItem(SIDEBAR_KEY, isHidden ? 'hidden' : 'visible');
  }

  // Keyboard navigation
  function handleKeydown(e) {
    // Skip if in input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    const navPrev = document.querySelector('.nav-prev');
    const navNext = document.querySelector('.nav-next');

    switch (e.key) {
      case 'ArrowLeft':
        if (navPrev) {
          e.preventDefault();
          window.location.href = navPrev.href;
        }
        break;
      case 'ArrowRight':
        if (navNext) {
          e.preventDefault();
          window.location.href = navNext.href;
        }
        break;
      case 'Escape':
        if (window.innerWidth <= 900 && sidebar && !sidebar.classList.contains('hidden')) {
          toggleSidebar();
        }
        break;
      case 't':
      case 'T':
        if (!e.ctrlKey && !e.metaKey) {
          toggleTheme();
        }
        break;
      case 's':
      case 'S':
        if (!e.ctrlKey && !e.metaKey) {
          toggleSidebar();
        }
        break;
    }
  }

  // Smooth scroll to anchor with sidebar active state update
  function handleAnchorClick(e) {
    const anchor = e.target.closest('a');
    const href = anchor?.getAttribute('href');
    if (href?.startsWith('#')) {
      e.preventDefault();
      const targetId = href.slice(1);
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.pushState(null, '', href);
        // Update sidebar active state
        updateSidebarActiveState(targetId);
      }
    }
  }

  // Update sidebar active state based on anchor
  function updateSidebarActiveState(anchorId) {
    const planNav = document.getElementById('plan-nav');
    if (!planNav) return;

    // Remove active from all items
    planNav.querySelectorAll('.phase-item').forEach(item => {
      item.classList.remove('active');
    });

    // Add active to matching item
    const matchingItem = planNav.querySelector(`[data-anchor="${anchorId}"]`);
    if (matchingItem) {
      matchingItem.classList.add('active');
    }
  }

  // Setup Intersection Observer for section tracking
  function setupSectionObserver() {
    const planNav = document.getElementById('plan-nav');
    if (!planNav) return;

    // Get all anchors from sidebar
    const anchors = Array.from(planNav.querySelectorAll('[data-anchor]'))
      .map(item => item.dataset.anchor);

    if (anchors.length === 0) return;

    // Find corresponding elements in content
    const sections = anchors
      .map(id => document.getElementById(id))
      .filter(el => el !== null);

    if (sections.length === 0) return;

    // Create observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          updateSidebarActiveState(entry.target.id);
        }
      });
    }, {
      rootMargin: '-20% 0px -60% 0px', // Trigger when section is in upper portion of viewport
      threshold: 0
    });

    // Observe all sections
    sections.forEach(section => observer.observe(section));
  }

  // Handle hash change (browser back/forward)
  function handleHashChange() {
    const hash = window.location.hash;
    if (hash) {
      const targetId = hash.slice(1);
      const target = document.getElementById(targetId);
      if (target) {
        updateSidebarActiveState(targetId);
      }
    }
  }

  // Initialize
  function init() {
    initTheme();
    initFontSize();
    initSidebar();

    // Event listeners
    themeToggle?.addEventListener('click', toggleTheme);
    sidebarToggle?.addEventListener('click', toggleSidebar);

    fontBtns.forEach(btn => {
      btn.addEventListener('click', () => setFontSize(btn.dataset.size));
    });

    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('click', handleAnchorClick);

    // Handle hash change for sidebar active state
    window.addEventListener('hashchange', handleHashChange);

    // Setup section observer for auto-highlighting sidebar
    setupSectionObserver();

    // Handle initial hash on page load
    if (window.location.hash) {
      handleHashChange();
    }

    // Handle resize
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (window.innerWidth > 900) {
          sidebar?.classList.remove('visible');
        }
      }, 100);
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(THEME_KEY)) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    });
  }

  // Run when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
