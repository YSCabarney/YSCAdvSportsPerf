/* YSC Student Hub — Mobile Interactions */
(function () {
  'use strict';

  // ── Only wire up on narrow screens ─────────────────────────────────────────
  function isMobile() { return window.innerWidth <= 767; }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return Array.from((ctx || document).querySelectorAll(sel)); }

  // ── Bottom nav → switch hub tabs ────────────────────────────────────────────
  const mobNavBtns = qsa('.mob-nav-btn[data-tab]');

  function setMobActive(tab) {
    mobNavBtns.forEach(b => b.classList.toggle('mob-active', b.dataset.tab === tab));
    // Hides the floating Mentor Chat button while already on that tab — it's
    // redundant there now that Mentor Chat fills the whole tab (rather than
    // being a collapsible aside), and live-testing found it visually
    // overlapping the input row/offline notice at the bottom of the pane.
    document.body.classList.toggle('mob-on-mentor-tab', tab === 'today');
  }

  mobNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (!isMobile()) return;
      const tab = btn.dataset.tab;
      // Trigger the desktop tab click so hub-tabs.js handles the switch
      const desktopTab = qs(`.htv-tab[data-tab="${tab}"]`);
      if (desktopTab) desktopTab.click();
      setMobActive(tab);
      // Close any open sidebar panel when switching tabs
      closeSidebarPanel();
    });
  });

  // Keep mobile nav in sync when desktop tabs are clicked
  document.addEventListener('click', e => {
    const tab = e.target.closest('.htv-tab');
    if (tab?.dataset.tab) setMobActive(tab.dataset.tab);
  });

  // ── Drawer open/close ────────────────────────────────────────────────────────
  const drawer        = qs('#mobile-drawer');
  const drawerOverlay = qs('#mobile-drawer-overlay');

  function openDrawer() {
    if (!drawer) return;
    drawer.classList.add('mob-drawer-open');
    drawerOverlay.style.display = 'block';
    requestAnimationFrame(() => drawerOverlay.classList.add('mob-drawer-open'));
    document.body.style.overflow = 'hidden';
    qs('#mob-more-btn')?.classList.add('mob-active');
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.classList.remove('mob-drawer-open');
    drawerOverlay.classList.remove('mob-drawer-open');
    setTimeout(() => { drawerOverlay.style.display = 'none'; }, 260);
    document.body.style.overflow = '';
    qs('#mob-more-btn')?.classList.remove('mob-active');
  }

  qs('#mobile-hamburger')?.addEventListener('click', openDrawer);
  qs('#mob-more-btn')?.addEventListener('click', openDrawer);
  qs('#mobile-drawer-close')?.addEventListener('click', closeDrawer);
  drawerOverlay?.addEventListener('click', closeDrawer);

  // Drawer nav items → open sidebar panels
  qsa('.mob-drawer-item[data-panel]').forEach(item => {
    item.addEventListener('click', () => {
      closeDrawer();
      const panel = item.dataset.panel;
      const navBtn = qs(`.classic-nav-btn[data-panel="${panel}"]`);
      if (navBtn) navBtn.click();
    });
  });

  // Drawer tab-view items (e.g. Meetings, which moved off the bottom nav)
  qsa('.mob-drawer-item[data-tab]').forEach(item => {
    item.addEventListener('click', () => {
      closeDrawer();
      const tab = item.dataset.tab;
      qs(`.htv-tab[data-tab="${tab}"]`)?.click();
      setMobActive(tab);
    });
  });

  // Utility buttons inside drawer
  qs('#mob-timer-btn')?.addEventListener('click', () => {
    closeDrawer();
    qs('#timer-nav-btn')?.click();
  });
  qs('#mob-report-btn')?.addEventListener('click', () => {
    closeDrawer();
    qs('#reportIssueBtn')?.click();
  });
  qs('#mob-profile-btn')?.addEventListener('click', () => {
    closeDrawer();
    qs('#profileMenuTrigger')?.click();
  });

  // ── Sidebar panel: close when returning to hub ───────────────────────────────
  function closeSidebarPanel() {
    const backBtn = qs('#back-to-today-btn');
    const panelArea = qs('#classicPanelArea');
    if (panelArea?.style.display !== 'none') {
      backBtn?.click();
    }
  }

  // Watch for panel area visibility changes to add/remove body class
  const panelArea = qs('#classicPanelArea');
  if (panelArea) {
    const panelObs = new MutationObserver(() => {
      const open = panelArea.style.display !== 'none';
      document.body.classList.toggle('mob-panel-open', open && isMobile());
    });
    panelObs.observe(panelArea, { attributes: true, attributeFilter: ['style'] });
  }

  // ── Swipe left/right on main content to switch tabs ─────────────────────────
  // 'meetings' removed 2026-09-18 along with the tab's own nav buttons — see
  // index.html for the restore note.
  const tabOrder = ['home', 'today', 'growth', 'people'];
  let touchStartX = 0;
  let touchStartY = 0;
  let isSwiping   = false;

  const swipeTarget = qs('#hub-tab-view');
  if (swipeTarget) {
    swipeTarget.addEventListener('touchstart', e => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      isSwiping   = false;
    }, { passive: true });

    swipeTarget.addEventListener('touchmove', e => {
      if (!isMobile()) return;
      const dx = Math.abs(e.touches[0].clientX - touchStartX);
      const dy = Math.abs(e.touches[0].clientY - touchStartY);
      if (dx > dy && dx > 8) isSwiping = true;
    }, { passive: true });

    swipeTarget.addEventListener('touchend', e => {
      if (!isMobile() || !isSwiping) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) < 50) return; // ignore tiny swipes

      const activeTab = qs('.htv-tab.htv-active')?.dataset.tab || 'today';
      const idx = tabOrder.indexOf(activeTab);
      let nextIdx = idx;
      if (dx < 0 && idx < tabOrder.length - 1) nextIdx = idx + 1; // swipe left → next
      if (dx > 0 && idx > 0) nextIdx = idx - 1;                   // swipe right → prev
      if (nextIdx !== idx) {
        const target = qs(`.htv-tab[data-tab="${tabOrder[nextIdx]}"]`);
        if (target) target.click();
        setMobActive(tabOrder[nextIdx]);
      }
    }, { passive: true });
  }

  // ── Initial active state sync ────────────────────────────────────────────────
  const initialTab = qs('.htv-tab.htv-active')?.dataset.tab || 'today';
  setMobActive(initialTab);

  // ── Floating buttons: hidden until scrolled past the top of the page ───────
  // .mob-chat-float-btn / .mob-mentor-float-btn are fixed-position, so
  // whatever's pinned near the top of the active pane can land directly
  // under them at natural, unscrolled rest — confirmed live on a real
  // iPhone (originally against Mentor Chat's now-removed collapsed toggle).
  // Extra bottom padding (see .htv-pane in mobile.css) only protects the
  // *end* of a scroll list, not the top, so instead: don't make the buttons
  // interactive at all until there's been a real scroll away from the top.
  const FLOAT_BTN_SCROLL_THRESHOLD = 120;

  // A pane (or nested scrollable region) whose content can't scroll past
  // the threshold at all — short content that day, or a pane that just
  // doesn't scroll (Meetings) — can never earn "scrolled" status through
  // normal scrolling. Treated as already-scrolled here rather than leaving
  // the buttons permanently unreachable on those tabs/days.
  function isElementScrolled(el) {
    const maxScroll = el.scrollHeight - el.clientHeight;
    if (maxScroll <= FLOAT_BTN_SCROLL_THRESHOLD) return true;
    return el.scrollTop > FLOAT_BTN_SCROLL_THRESHOLD;
  }

  // Several panes have their real scrollable content nested inside a child
  // element rather than scrolling at the pane level itself — e.g.
  // .htv-mentor-messages within #htv-today — and this list will keep
  // growing as features are added. Rather than tracking every
  // known nested region by hand, a capture-phase listener on #hub-tab-view
  // catches scroll events from ANY descendant at any depth (scroll events
  // don't bubble, but capture-phase listeners still see them on the way
  // down regardless) — this covers future nested-scroll regions
  // automatically, not just today's known ones.
  const _scrolledElements = new Set();

  function updateFloatBtnVisibility() {
    const activePane = qs('.htv-pane.htv-pane-active');
    if (!activePane) return;
    const scrolled = isElementScrolled(activePane)
      || [..._scrolledElements].some(el => activePane.contains(el));
    document.body.classList.toggle('mob-scrolled-past-top', scrolled);
  }

  qs('#hub-tab-view')?.addEventListener('scroll', e => {
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (isElementScrolled(target)) _scrolledElements.add(target);
    else _scrolledElements.delete(target);
    updateFloatBtnVisibility();
  }, { capture: true, passive: true });

  // A newly active pane may already be scrolled from a prior visit, or be
  // short enough to have no scroll at all — re-check right after switching.
  qsa('.htv-tab').forEach(btn => {
    btn.addEventListener('click', () => setTimeout(updateFloatBtnVisibility, 0));
  });
  updateFloatBtnVisibility();

  // (The floating AI Chat button was removed — "Home" is bottom-nav item 1.)

  // ── Floating Mentor Chat button ──────────────────────────────────────────────
  // Mentor Chat isn't a "classic panel" — it's not gated by setClassicPanel().
  // Land on the (now Mentor-Chat-only) Today tab and focus the input directly;
  // no more collapsed state or column to expand/scroll into since 2026-09-18.
  qs('#mob-mentor-float-btn')?.addEventListener('click', () => {
    qs('.htv-tab[data-tab="today"]')?.click();
    setMobActive('today');
    setTimeout(() => qs('#htv-mentor-input')?.focus(), 350);
  });

  // ── Android hardware back button — close open overlays in priority order ─────
  window.addEventListener('popstate', () => {
    // 1. Sign-out confirm dialog
    const signout = document.getElementById('signout-confirm-overlay');
    if (signout && signout.style.display !== 'none') {
      signout.style.display = 'none';
      history.pushState(null, '');
      return;
    }
    // 2. Slide-out drawer
    const drawerEl = qs('#mobile-drawer');
    if (drawerEl?.classList.contains('mob-drawer-open')) {
      closeDrawer();
      history.pushState(null, '');
      return;
    }
    // 3. Classic panel (Canvas, Slack, etc.)
    const panelArea = qs('#classicPanelArea');
    if (panelArea && panelArea.style.display !== 'none') {
      qs('#back-to-today-btn')?.click();
      history.pushState(null, '');
      return;
    }
    // 4. Any open modal
    const openModal = document.querySelector(
      '.modal-overlay:not(#signout-confirm-overlay):not([style*="display: none"]):not([style*="display:none"])'
    );
    if (openModal) {
      openModal.style.display = 'none';
      history.pushState(null, '');
    }
  });

  // Push an initial state so the first back-press hits our handler on Android
  if (isMobile()) {
    history.pushState(null, '');
  }

  // ── Swipe down from top of panel area to go back ─────────────────────────────
  let _panelTouchStartY = 0;
  const panelAreaEl = qs('#classicPanelArea');
  if (panelAreaEl) {
    panelAreaEl.addEventListener('touchstart', e => {
      _panelTouchStartY = e.touches[0].clientY;
    }, { passive: true });

    panelAreaEl.addEventListener('touchend', e => {
      if (!isMobile()) return;
      const dy = e.changedTouches[0].clientY - _panelTouchStartY;
      if (dy > 80 && _panelTouchStartY < 100) {
        qs('#back-to-today-btn')?.click();
      }
    }, { passive: true });
  }

})();
