/* Slack Notification System — IIFE */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  let _user          = null;
  let _settings      = {};
  let _unreadCounts  = {};  // channelId → { count, isDM, name, preview? }
  let _dmPreviews    = {};  // channelId → previewText (persists across events until read)
  let _activePopups  = [];  // { el, timer }
  let _audioCtx      = null;
  let _historyOpen   = false;
  let _historyUnread = 0;   // unread notif count for bell badge
  let _hasTeacherMsg = false;
  let _initialized   = false;

  const MAX_POPUPS    = 3;

  // ── Public API ─────────────────────────────────────────────────────────────
  window.SlackNotif = {
    init,
    markChannelRead,
    markAllRead,
    openHistory,
    closeHistory,
    saveSettingsFromUI,
    testSound,
  };

  // ── Init ───────────────────────────────────────────────────────────────────
  // Scoped activation: this module was never initialized at all (confirmed —
  // nothing anywhere called SlackNotif.init), so the 4 unread badges it owns
  // (nav/channel/header/DM) never populated. Wiring only what those badges +
  // mark-as-read need. The bell button, mark-all-read button, and settings
  // panel (injectBellButton/injectMarkAllReadBtn/injectSettingsPanel) add new
  // always-visible UI beyond those badges and requestPushPermission() prompts
  // the browser unprompted — all deliberately left out, a separate decision.
  async function init(user) {
    if (_initialized) return;
    _initialized = true;
    _user = user;

    patchSelectChannel();
    pollUnread();
    if (window.SlackBadge?.onEvent) {
      window.SlackBadge.onEvent('slack-new-message', () => schedulePoll());
    } else {
      console.warn('[SlackNotif] SlackBadge.onEvent unavailable — badges will only refresh via the 60s fallback poll');
    }
    // Safety net matching app.js's DM-poll fallback convention (45s DM-only
    // poll alongside its own socket listener) — covers a missed/dropped
    // socket event without this module depending on socket reliability.
    setInterval(pollUnread, 60000);
  }

  // ── Unread-count polling ─────────────────────────────────────────────────
  // /api/slack-notifications/poll is the real source of truth: it reads
  // Slack's own per-conversation unread_count against a persisted read-state
  // file, and already excludes self-authored messages — a naive client-side
  // "+1 per socket event" can't replicate that and would drift from Slack's
  // actual state across reloads.
  let _pollDebounceTimer = null;
  function schedulePoll(delayMs = 1500) {
    clearTimeout(_pollDebounceTimer);
    _pollDebounceTimer = setTimeout(pollUnread, delayMs);
  }

  async function pollUnread() {
    try {
      const r = await fetch('/api/slack-notifications/poll');
      const data = await r.json();
      const counts = data?.unreadCounts || {};
      _unreadCounts = counts;
      // _dmPreviews persists across polls until the channel is marked read
      // (see its declaration above) — a poll that finds no *new* message for
      // an already-unread DM won't include a fresh preview, so don't let this
      // full-state replace silently blank out the last one we had.
      Object.keys(_dmPreviews).forEach(id => { if (!counts[id]) delete _dmPreviews[id]; });
      Object.entries(counts).forEach(([id, v]) => { if (v.preview) _dmPreviews[id] = v.preview; });
      updateAllBadges();
    } catch (err) {
      console.warn('[SlackNotif] poll failed, leaving badges as-is until next poll:', err.message);
    }
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  async function loadSettings() {
    try {
      const r = await fetch('/api/slack-notifications/settings');
      _settings = await r.json();
    } catch {
      _settings = {
        enabled: true, browserPush: false, sounds: true, volume: 0.25,
        mutedChannels: [], dndEnabled: false, dndStart: '08:00', dndEnd: '15:00',
        dmOnly: false, teacherOnly: false,
      };
    }
  }

  function saveSettingsFromUI() {
    const s = {
      enabled:     checked('snb-toggle-enabled'),
      browserPush: checked('snb-toggle-push'),
      sounds:      checked('snb-toggle-sounds'),
      volume:      parseFloat(document.getElementById('snb-volume')?.value ?? '0.25'),
      dndEnabled:  checked('snb-toggle-dnd'),
      dndStart:    document.getElementById('snb-dnd-start')?.value || '08:00',
      dndEnd:      document.getElementById('snb-dnd-end')?.value   || '15:00',
      dmOnly:      checked('snb-toggle-dm-only'),
      teacherOnly: checked('snb-toggle-teacher-only'),
      mutedChannels: _settings.mutedChannels || [],
    };
    _settings = s;
    fetch('/api/slack-notifications/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(s),
    });
    showToast('Notification settings saved');
  }

  function checked(id) {
    return !!(document.getElementById(id)?.checked);
  }

  function isDND() {
    if (!_settings.dndEnabled) return false;
    const now   = new Date();
    const hhmm  = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    const start = _settings.dndStart || '08:00';
    const end   = _settings.dndEnd   || '15:00';
    return start <= end ? (hhmm >= start && hhmm <= end) : (hhmm >= start || hhmm <= end);
  }

  // ── Patch selectChannel to clear badge on open ─────────────────────────────
  function patchSelectChannel() {
    const checkInterval = setInterval(() => {
      if (typeof window.selectChannel !== 'function') return;
      clearInterval(checkInterval);
      const orig = window.selectChannel;
      window._snbOrigSelectChannel = orig;
      window.selectChannel = function (id, name) {
        markChannelRead(id);
        return orig.call(this, id, name);
      };
    }, 300);
  }

  // ── Badge updates ──────────────────────────────────────────────────────────
  function updateAllBadges() {
    updateNavBadge();
    updateChannelBadges();
    updateHeaderBadge();
    updateDmActionBtn();
    updatePeopleTabDot();
  }

  function totalUnread() {
    return Object.values(_unreadCounts).reduce((s, v) => s + (v.count || 0), 0);
  }

  function updateNavBadge() {
    const btn = document.querySelector(
      '[data-panel="slack"], .classic-nav-btn[data-panel="slack"]'
    );
    if (!btn) return;
    btn.style.position = 'relative';
    let badge = btn.querySelector('.snb-badge.snb-nav-badge');
    const n = totalUnread();
    if (n <= 0) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'snb-badge snb-nav-badge'; btn.appendChild(badge); }
    badge.textContent = n > 99 ? '99+' : n;
  }

  function updateChannelBadges() {
    const items = document.querySelectorAll('.channel-item');
    items.forEach(item => {
      const id    = item.dataset.channelId;
      const info  = id ? _unreadCounts[id] : null;
      let badge   = item.querySelector('.snb-ch-badge');
      const nameEl = item.querySelector('.channel-name');
      if (!info || info.count <= 0) {
        if (badge) badge.remove();
        if (nameEl) nameEl.style.fontWeight = '';
        return;
      }
      if (nameEl) nameEl.style.fontWeight = '700';
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'snb-ch-badge';
        item.style.display = 'flex';
        item.style.alignItems = 'center';
        item.appendChild(badge);
      }
      badge.textContent = info.count > 99 ? '99+' : info.count;
    });
  }

  function updateHeaderBadge() {
    const title = document.getElementById('slack-sidebar-title');
    if (!title) return;
    let badge = title.querySelector('.snb-header-badge');
    const n   = totalUnread();
    if (n <= 0) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'snb-header-badge'; title.appendChild(badge); }
    badge.textContent = n > 99 ? '99+' : n;
  }

  function updateDmActionBtn() {
    const btn = document.getElementById('dmBtn');
    if (!btn) return;
    const dmTotal = Object.values(_unreadCounts)
      .filter(v => v.isDM)
      .reduce((s, v) => s + (v.count || 0), 0);
    let badge = btn.querySelector('.snb-badge.snb-dm-badge');
    if (dmTotal <= 0) {
      if (badge) badge.remove();
      btn.style.fontWeight = '';
      return;
    }
    btn.style.fontWeight = '700';
    btn.style.position = 'relative';
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'snb-badge snb-dm-badge';
      btn.appendChild(badge);
    }
    badge.textContent = dmTotal > 99 ? '99+' : dmTotal;
  }

  function updatePeopleTabDot() {
    // People tab nav button dot
    const tabs = document.querySelectorAll('.classic-nav-btn, [data-panel]');
    tabs.forEach(btn => {
      if (!btn.textContent?.includes('People')) return;
      let dot = btn.querySelector('.snb-tab-dot');
      const hasDM = Object.values(_unreadCounts).some(v => v.isDM && v.count > 0);
      if (!hasDM) { if (dot) dot.remove(); return; }
      if (!dot) { dot = document.createElement('span'); dot.className = 'snb-tab-dot'; btn.appendChild(dot); }
    });

    // Blue dots + message preview on individual People-tab entries with unread DMs
    // Build a name→{count,preview} lookup from _unreadCounts
    const dmByName = {};
    Object.entries(_unreadCounts).forEach(([id, v]) => {
      if (v.isDM && v.count > 0) {
        const preview = _dmPreviews[id] || v.preview || '';
        dmByName[v.name] = { count: v.count, preview };
      }
    });

    document.querySelectorAll('.htv-person-item').forEach(item => {
      const nameEl    = item.querySelector('.htv-person-name');
      const personName = nameEl?.textContent?.trim() || '';
      const dmInfo    = dmByName[personName];

      // ── Unread dot ──
      let dot = item.querySelector('.snb-person-dm-dot');
      if (dmInfo) {
        if (!dot) {
          dot = document.createElement('span');
          dot.className = 'snb-person-dm-dot';
          item.querySelector('.htv-person-info')?.appendChild(dot);
        }
      } else {
        if (dot) dot.remove();
      }

      // ── Message preview ──
      let previewEl = item.querySelector('.snb-person-dm-preview');
      if (dmInfo && dmInfo.preview) {
        if (!previewEl) {
          previewEl = document.createElement('div');
          previewEl.className = 'snb-person-dm-preview';
          item.querySelector('.htv-person-info')?.appendChild(previewEl);
        }
        previewEl.textContent = dmInfo.preview.slice(0, 60) + (dmInfo.preview.length > 60 ? '…' : '');
      } else {
        if (previewEl) previewEl.remove();
      }
    });
  }

  function updateTeacherIndicator() {
    const title = document.getElementById('slack-sidebar-title');
    if (!title) return;
    let dot = title.querySelector('.snb-teacher-indicator');
    if (_hasTeacherMsg) {
      if (!dot) { dot = document.createElement('span'); dot.className = 'snb-teacher-indicator'; title.appendChild(dot); }
    } else {
      if (dot) dot.remove();
    }
  }

  // ── Mark read ──────────────────────────────────────────────────────────────
  function markChannelRead(channelId) {
    if (!channelId) return;
    delete _unreadCounts[channelId];
    delete _dmPreviews[channelId];
    updateAllBadges();
    // Clear any teacher indicator if no more teacher notifications
    _hasTeacherMsg = false;
    updateTeacherIndicator();
    // Dismiss any popup for this channel
    _activePopups.filter(p => p.channelId === channelId).forEach(p => dismissPopup(p.el));
    fetch('/api/slack-notifications/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    }).catch(() => {});
  }

  async function markAllRead() {
    _unreadCounts = {};
    _dmPreviews   = {};
    _hasTeacherMsg = false;
    updateAllBadges();
    updateTeacherIndicator();
    [..._activePopups].forEach(p => dismissPopup(p.el));
    updateBellBadge(0);
    try {
      await fetch('/api/slack-notifications/mark-all-read', { method: 'POST' });
    } catch {}
  }

  // ── Popup notifications ────────────────────────────────────────────────────
  function showPopup(notif) {
    ensurePopupContainer();

    // Enforce max popups
    while (_activePopups.length >= MAX_POPUPS) {
      dismissPopup(_activePopups[0].el);
    }

    const isTeacher = !!notif.isTeacher;
    const isDM      = !!notif.isDM;
    // Lifetime: teacher DM 10s, regular DM 8s, channel message 5s
    const lifetime = isTeacher ? 10000 : isDM ? 8000 : 5000;

    const el = document.createElement('div');
    // DMs get amber border; teacher DMs get the heavier teacher class (which also sets amber)
    const extraClass = isTeacher ? ' snb-popup-teacher' : isDM ? ' snb-popup-dm' : '';
    el.className = `snb-popup${extraClass}`;
    el.dataset.channelId = notif.channelId;

    const chanTag = isDM
      ? `<span class="snb-popup-channel snb-popup-channel-dm">Direct Message</span>`
      : `<span class="snb-popup-channel">#${esc(notif.channelName)}</span>`;
    const teacherBadge = isTeacher
      ? `<span class="snb-popup-teacher-badge">⭐ Teacher</span>`
      : '';
    const previewText = (notif.text || '(attachment)').slice(0, 60);
    const timeLabel   = relTime(Date.now());

    el.innerHTML = `
      <div class="snb-popup-avatar">${esc(notif.senderInitials)}</div>
      <div class="snb-popup-body">
        ${notif.isDM ? '<div class="snb-popup-dm-label">Direct Message</div>' : ''}
        <div class="snb-popup-header">
          <span class="snb-popup-sender">${esc(notif.senderName)}</span>
          ${chanTag}${teacherBadge}
          <span class="snb-popup-time">${esc(timeLabel)}</span>
        </div>
        <div class="snb-popup-text">${esc(previewText)}</div>
      </div>
      <button class="snb-popup-close" aria-label="Dismiss">✕</button>
    `;

    const container = document.getElementById('snb-popup-container');
    container.appendChild(el);

    const entry = { el, timer: null, channelId: notif.channelId };
    entry.timer = setTimeout(() => dismissPopup(el), lifetime);
    _activePopups.push(entry);

    // Increment bell badge
    _historyUnread++;
    updateBellBadge(_historyUnread);

    // Click popup body → open channel
    el.addEventListener('click', (e) => {
      if (e.target.closest('.snb-popup-close')) return;
      openChannel(notif.channelId, notif.channelName, notif.isDM);
    });

    // Close button
    el.querySelector('.snb-popup-close').addEventListener('click', (e) => {
      e.stopPropagation();
      dismissPopup(el);
    });
  }

  function dismissPopup(el) {
    if (!el || !el.parentNode) return;
    el.classList.add('snb-popup-dismissing');
    const idx = _activePopups.findIndex(p => p.el === el);
    if (idx !== -1) {
      clearTimeout(_activePopups[idx].timer);
      _activePopups.splice(idx, 1);
    }
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 280);
  }

  function ensurePopupContainer() {
    if (!document.getElementById('snb-popup-container')) {
      const c = document.createElement('div');
      c.id = 'snb-popup-container';
      document.body.appendChild(c);
    }
  }

  // ── Open a Slack channel ───────────────────────────────────────────────────
  function openChannel(channelId, channelName, isDM) {
    // Switch to Slack panel
    if (typeof window.setClassicPanel === 'function') window.setClassicPanel('slack');
    // Navigate to channel — use existing selectChannel (already patched above)
    const orig = window._snbOrigSelectChannel || window.selectChannel;
    if (typeof orig === 'function') orig.call(window, channelId, channelName);
    if (_historyOpen) closeHistory();
  }

  // ── Bell button ────────────────────────────────────────────────────────────
  function injectBellButton() {
    if (document.getElementById('snb-bell-btn')) return;
    const headerRight = document.querySelector('.header-right');
    if (!headerRight) return;

    const btn = document.createElement('button');
    btn.id = 'snb-bell-btn';
    btn.title = 'Notifications';
    btn.setAttribute('aria-label', 'Notification history');
    btn.innerHTML = `<span class="snb-bell-icon">🔔</span>`;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      _historyOpen ? closeHistory() : openHistory();
    });

    // Insert before the first child (leftmost position in header-right)
    headerRight.insertBefore(btn, headerRight.firstChild);
  }

  function updateBellBadge(n) {
    _historyUnread = n;
    const btn = document.getElementById('snb-bell-btn');
    if (!btn) return;
    let badge = btn.querySelector('.snb-badge.snb-bell-badge');
    if (n <= 0) { if (badge) badge.remove(); return; }
    if (!badge) { badge = document.createElement('span'); badge.className = 'snb-badge snb-bell-badge'; btn.appendChild(badge); }
    badge.textContent = n > 99 ? '99+' : n;
  }

  // ── Mark All Read button in Slack sidebar ──────────────────────────────────
  function injectMarkAllReadBtn() {
    if (document.getElementById('snb-mark-all-btn')) return;
    const tryInject = () => {
      const actionBar = document.querySelector('.slack-action-bar');
      if (!actionBar) return false;
      if (actionBar.querySelector('#snb-mark-all-btn')) return true;
      const btn = document.createElement('button');
      btn.id = 'snb-mark-all-btn';
      btn.title = 'Mark all messages as read';
      btn.innerHTML = `✓ All read`;
      btn.addEventListener('click', () => markAllRead());
      actionBar.appendChild(btn);
      return true;
    };

    if (!tryInject()) {
      const observer = new MutationObserver(() => { if (tryInject()) observer.disconnect(); });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // ── Notification history panel ─────────────────────────────────────────────
  async function openHistory() {
    if (_historyOpen) { closeHistory(); return; }
    _historyOpen = true;
    updateBellBadge(0);

    const items = await fetchHistory();

    // Backdrop
    const bd = document.createElement('div');
    bd.id = 'snb-backdrop';
    bd.addEventListener('click', closeHistory);
    document.body.appendChild(bd);

    // Panel
    const panel = document.createElement('div');
    panel.id = 'snb-history-panel';
    panel.innerHTML = `
      <div class="snb-history-header">
        <span class="snb-history-title">Notifications</span>
        <button class="snb-history-mark-all" id="snb-h-mark-all">Mark all read</button>
        <button class="snb-history-close" id="snb-h-close">✕</button>
      </div>
      <div class="snb-history-list" id="snb-history-list">
        ${renderHistoryItems(items)}
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#snb-h-close').addEventListener('click', closeHistory);
    panel.querySelector('#snb-h-mark-all').addEventListener('click', async () => {
      await markAllRead();
      panel.querySelector('#snb-history-list').innerHTML = renderHistoryItems([]);
    });

    panel.querySelectorAll('.snb-history-item').forEach(el => {
      el.addEventListener('click', () => {
        openChannel(el.dataset.channelId, el.dataset.channelName, el.dataset.isDm === 'true');
        markHistoryItemRead(el.dataset.notifId, el);
        closeHistory();
      });
    });
  }

  function closeHistory() {
    _historyOpen = false;
    const panel = document.getElementById('snb-history-panel');
    const bd    = document.getElementById('snb-backdrop');
    if (panel) {
      panel.classList.add('snb-closing');
      setTimeout(() => { if (panel.parentNode) panel.parentNode.removeChild(panel); }, 200);
    }
    if (bd && bd.parentNode) bd.parentNode.removeChild(bd);
  }

  async function fetchHistory() {
    try {
      const r = await fetch('/api/slack-notifications/history');
      return await r.json();
    } catch { return []; }
  }

  function renderHistoryItems(items) {
    if (!items.length) return `<div class="snb-history-empty">No notifications in the last 24 hours</div>`;
    return items.map(n => `
      <div class="snb-history-item ${n.read ? '' : 'snb-history-unread'} ${n.isTeacher ? 'snb-history-teacher' : ''}"
           data-channel-id="${esc(n.channelId)}"
           data-channel-name="${esc(n.channelName)}"
           data-is-dm="${n.isDM}"
           data-notif-id="${esc(n.id)}">
        <div class="snb-history-avatar">${esc(n.senderInitials)}</div>
        <div class="snb-history-body">
          <div class="snb-history-meta">
            <span class="snb-history-name">${esc(n.senderName)}</span>
            <span class="snb-history-time">${relTime(n.receivedAt)}</span>
          </div>
          <div class="snb-history-channel-tag">${n.isDM ? 'DM' : '#' + esc(n.channelName)}</div>
          <div class="snb-history-text">${esc(n.text || '(attachment)')}</div>
        </div>
        ${!n.read ? '<div class="snb-history-unread-dot"></div>' : ''}
      </div>
    `).join('');
  }

  function markHistoryItemRead(notifId, el) {
    if (el) { el.classList.remove('snb-history-unread'); el.querySelector('.snb-history-unread-dot')?.remove(); }
    fetch('/api/slack-notifications/history/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notifId }),
    }).catch(() => {});
  }

  // ── Settings panel injection ───────────────────────────────────────────────
  function injectSettingsPanel() {
    if (document.getElementById('snb-settings-panel')) return;
    // Try to find personalization section or Slack sidebar
    const target = document.getElementById('personalization-section') || document.querySelector('.slack-sidebar');
    if (!target) return;
    const panel = document.createElement('div');
    panel.id = 'snb-settings-panel';
    panel.innerHTML = `
      <div class="snb-settings-title">Notification Settings</div>
      <div class="snb-settings-row">
        <span class="snb-settings-label">Enable notifications</span>
        <label class="snb-settings-toggle"><input type="checkbox" id="snb-toggle-enabled" ${_settings.enabled ? 'checked' : ''}><span class="snb-settings-slider"></span></label>
      </div>
      <div class="snb-settings-row">
        <span class="snb-settings-label">Notification sounds</span>
        <label class="snb-settings-toggle"><input type="checkbox" id="snb-toggle-sounds" ${_settings.sounds ? 'checked' : ''}><span class="snb-settings-slider"></span></label>
      </div>
      <div class="snb-settings-volume">
        <span class="snb-settings-volume-label">Volume</span>
        <input type="range" id="snb-volume" min="0" max="1" step="0.05" value="${_settings.volume ?? 0.25}">
        <button class="snb-settings-test-btn" onclick="window.SlackNotif.testSound()">Test</button>
      </div>
      <div class="snb-settings-row">
        <span class="snb-settings-label">Browser push notifications</span>
        <label class="snb-settings-toggle"><input type="checkbox" id="snb-toggle-push" ${_settings.browserPush ? 'checked' : ''}><span class="snb-settings-slider"></span></label>
      </div>
      <div class="snb-settings-row">
        <span class="snb-settings-label">DMs only</span>
        <label class="snb-settings-toggle"><input type="checkbox" id="snb-toggle-dm-only" ${_settings.dmOnly ? 'checked' : ''}><span class="snb-settings-slider"></span></label>
      </div>
      <div class="snb-settings-row">
        <span class="snb-settings-label">Teacher messages only</span>
        <label class="snb-settings-toggle"><input type="checkbox" id="snb-toggle-teacher-only" ${_settings.teacherOnly ? 'checked' : ''}><span class="snb-settings-slider"></span></label>
      </div>
      <div class="snb-settings-row">
        <span class="snb-settings-label">Do Not Disturb</span>
        <label class="snb-settings-toggle"><input type="checkbox" id="snb-toggle-dnd" ${_settings.dndEnabled ? 'checked' : ''}><span class="snb-settings-slider"></span></label>
      </div>
      <div class="snb-settings-dnd-times">
        <span>From</span>
        <input type="time" id="snb-dnd-start" value="${_settings.dndStart || '08:00'}">
        <span>to</span>
        <input type="time" id="snb-dnd-end" value="${_settings.dndEnd || '15:00'}">
      </div>
      <button class="snb-settings-save-btn" onclick="window.SlackNotif.saveSettingsFromUI()">Save Settings</button>
    `;
    target.appendChild(panel);
  }

  // ── Sound ──────────────────────────────────────────────────────────────────
  function getAudioCtx() {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return _audioCtx;
  }

  function playSound(type) {
    try {
      const ctx  = getAudioCtx();
      const vol  = _settings.volume ?? 0.25;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.connect(ctx.destination);

      if (type === 'dm') {
        // Two-note DM tone
        [523.25, 659.25].forEach((freq, i) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);
          osc.connect(gain);
          osc.start(ctx.currentTime + i * 0.12);
          osc.stop(ctx.currentTime + i * 0.12 + 0.1);
        });
        gain.gain.setTargetAtTime(0, ctx.currentTime + 0.22, 0.05);
      } else {
        // Channel chime
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(660, ctx.currentTime + 0.15);
        osc.connect(gain);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.3);
        gain.gain.setTargetAtTime(0, ctx.currentTime + 0.15, 0.05);
      }
    } catch {
      // Audio context unavailable — ignore
    }
  }

  function testSound() {
    if (_settings.sounds) playSound('dm');
    else showToast('Sounds are disabled — enable in settings first');
  }

  // ── Browser push notifications ─────────────────────────────────────────────
  async function requestPushPermission() {
    if (!_settings.browserPush) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') await Notification.requestPermission();
  }

  function sendBrowserPush(notif) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const title   = `New message from ${notif.senderName}`;
    const rawBody = `${notif.isTeacher ? '[Teacher] ' : ''}${notif.senderName}: ${notif.text || '(attachment)'}`;
    const body    = rawBody.slice(0, 100);
    const n       = new Notification(title, { body, icon: '/favicon.ico', tag: notif.id });
    n.onclick = () => {
      window.focus();
      openChannel(notif.channelId, notif.channelName, notif.isDM);
    };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function relTime(ts) {
    const diff = Date.now() - ts;
    if (diff < 60000)  return 'just now';
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return `${Math.floor(diff/86400000)}d ago`;
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;color:#fff;padding:8px 18px;border-radius:8px;font-size:.84rem;z-index:99999;opacity:1;transition:opacity .4s';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2500);
  }
})();
