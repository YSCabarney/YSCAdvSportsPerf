/* Slack badge + popup notifications — Events API push via socket.io, no polling */
(function () {
  'use strict';

  let _dmCount = 0;
  let _pendingIdentifyEmail = null;
  // Listener registrations queued before init() creates the socket — flushed in connectWebSocket()
  let _pendingListeners = [];

  window.SlackBadge = {
    init,
    clear,
    identify: () => {}, // no-op: student identification now handled by dedicated mentor socket
    onEvent: (event, cb) => {
      if (_socket) {
        _socket.on(event, cb);
        console.log('[SlackBadge] onEvent registered on live socket:', event);
      } else {
        _pendingListeners.push({ event, cb });
        console.log('[SlackBadge] onEvent queued (socket not ready yet):', event);
      }
    },
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  let _initialized = false;
  function init() {
    if (_initialized) return; // guard against double-call when init is moved earlier
    _initialized = true;
    console.log('[SlackBadge] Initialized — real-time push only (no polling)');
    injectSlideInCss();
    patchSlackOpen();
    connectWebSocket();
  }

  function injectSlideInCss() {
    if (document.getElementById('snb-slidein-style')) return;
    const s = document.createElement('style');
    s.id = 'snb-slidein-style';
    s.textContent = '@keyframes slideIn{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}' +
      '@keyframes slideInRight{from{transform:translateX(110%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(s);
  }

  // ── WebSocket (socket.io) real-time notifications ─────────────────────────
  let _socket = null;

  function connectWebSocket() {
    if (typeof io !== 'function') {
      console.warn('[SlackBadge] socket.io client not loaded — real-time push unavailable');
      return;
    }
    _socket = io({
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    // Flush any listeners that were registered via onEvent() before init() ran
    if (_pendingListeners.length) {
      console.log('[SlackBadge] Flushing', _pendingListeners.length, 'queued listener(s)');
      _pendingListeners.forEach(({ event, cb }) => _socket.on(event, cb));
      _pendingListeners = [];
    }

    _socket.on('connect', () => {
      console.log('[Socket] Connected:', _socket.id);
      _pendingIdentifyEmail = null;
    });
    _socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
    });
    _socket.on('connect_error', (err) => {
      console.warn('[Socket] Connection error:', err.message);
    });
    _socket.on('slack-new-message', function (data) {
      if (data.isDM || data.channelType === 'im') {
        // Skip badge and popup if student has already dismissed the mentor notification
        if (localStorage.getItem('mentorNotifDismissed') === 'true') return;
        if (typeof window.showDMNotification === 'function') {
          window.showDMNotification({
            channelId:   data.channelId,
            latestText:  data.text || 'New direct message',
            unreadCount: 1,
            senderId:    data.userId,
          });
        } else {
          showSlackNotification(data);
        }
      } else {
        if (typeof window.showChannelNotification === 'function') {
          window.showChannelNotification(data);
        } else {
          showSlackNotification(data);
        }
      }

      // Nav-icon badge is now SlackNotif's job (slack-notifications.js) — it
      // polls Slack's real unread state instead of a naive per-event counter.
      // This module used to render its own overlapping badge here too.
      if (_settings && _settings.browserPush && document.visibilityState === 'hidden') {
        sendBrowserPush(data);
      }
    });
  }

  // ── Real-time notification popup ─────────────────────────────────────────
  // Alias so socket listener can call showChannelNotification() for non-DMs
  function showChannelNotification(data) { showSlackNotification(data); }

  function showSlackNotification(data) {
    const existing = document.getElementById('slack-rt-notification');
    if (existing) existing.remove();

    const notif = document.createElement('div');
    notif.id = 'slack-rt-notification';
    notif.style.cssText = [
      'position:fixed',
      'bottom:80px',
      'right:20px',
      'background:#111111',
      'color:white',
      'padding:14px 18px',
      'border-radius:6px',
      'max-width:300px',
      'z-index:999999',
      'box-shadow:0 2px 12px rgba(0,0,0,0.18)',
      'cursor:pointer',
      'font-family:sans-serif',
      'border-left:4px solid var(--sp-blue)',
      'animation:slideIn 0.3s ease',
    ].join(';');

    notif.innerHTML =
      '<div style="font-size:11px;opacity:0.8;margin-bottom:6px">' +
        (data.isDM ? '💬 Direct Message' : '# New Slack message') +
      '</div>' +
      '<div style="font-size:13px;font-weight:500;line-height:1.4">' +
        escHtml((data.text || 'New message').substring(0, 80)) +
      '</div>' +
      '<div style="font-size:11px;opacity:0.7;margin-top:6px">Tap to open Slack</div>';

    notif.onclick = () => {
      notif.remove();
      openSlackPanel(data.channelId, data.isDM);
    };
    document.body.appendChild(notif);
    setTimeout(() => { if (notif.parentNode) notif.remove(); }, 8000);
  }

  // ── Open Slack panel + navigate to channel ────────────────────────────────
  function openSlackPanel(channelId, isDM) {
    if (typeof window.setClassicPanel === 'function') window.setClassicPanel('slack');
    if (channelId && typeof window.selectChannel === 'function') {
      setTimeout(function () { window.selectChannel(channelId, ''); }, 150);
    }
  }

  // ── Browser push for background tabs ─────────────────────────────────────
  let _settings = null;
  function loadPushSettings() {
    fetch('/api/slack-notifications/settings')
      .then(r => r.json())
      .then(s => { _settings = s; })
      .catch(() => {});
  }
  loadPushSettings();

  function sendBrowserPush(data) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification('New message from ' + (data.senderName || 'Someone'), {
      body: (data.text || '').substring(0, 100),
      icon: '/logo.jpg',
    });
    n.onclick = function () {
      window.focus();
      openSlackPanel(data.channelId, data.isDM);
    };
  }

  // ── DMs button badge ──────────────────────────────────────────────────────
  function setDmBadge(n) {
    const dmBtn = document.getElementById('dmBtn');
    if (!dmBtn) return;
    let badge = dmBtn.querySelector('.snb-dm-count');
    if (n <= 0) {
      if (badge) badge.remove();
      dmBtn.classList.remove('snb-dm-btn-alert');
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'snb-dm-count';
      dmBtn.appendChild(badge);
    }
    badge.textContent = n > 9 ? '9+' : String(n);
    dmBtn.classList.add('snb-dm-btn-alert');
  }

  // ── DM popup notification ─────────────────────────────────────────────────
  function showDmPopup({ channelId, senderName, preview }) {
    // Avoid stacking identical popups
    if (document.querySelector(`.snb-dm-popup[data-channel="${channelId}"]`)) return;

    const popup = document.createElement('div');
    popup.className = 'snb-dm-popup';
    popup.dataset.channel = channelId;

    const safeN = escHtml(senderName);
    const safeP = escHtml(preview || '');
    popup.innerHTML = `
      <div class="snb-dm-popup-header">
        <span class="snb-dm-popup-icon">💬</span>
        <span class="snb-dm-popup-from">New message from <strong>${safeN}</strong></span>
        <button class="snb-dm-popup-close" aria-label="Dismiss">✕</button>
      </div>
      ${safeP ? `<div class="snb-dm-popup-preview">${safeP}</div>` : ''}
    `;

    // Click on popup body → open the DM
    popup.addEventListener('click', (e) => {
      if (e.target.closest('.snb-dm-popup-close')) return;
      openDm(channelId, senderName);
      popup.remove();
    });

    popup.querySelector('.snb-dm-popup-close').addEventListener('click', (e) => {
      e.stopPropagation();
      popup.remove();
    });

    // Auto-dismiss after 8 seconds
    document.body.appendChild(popup);
    setTimeout(() => {
      if (popup.parentNode) {
        popup.classList.add('snb-dm-popup-hide');
        setTimeout(() => popup.remove(), 300);
      }
    }, 8000);
  }

  // ── Open a DM channel in the Slack panel ──────────────────────────────────
  function openDm(channelId, senderName) {
    // Show the Slack panel
    if (typeof window.setClassicPanel === 'function') {
      window.setClassicPanel('slack');
    }

    // Navigate to the DM channel after the panel renders
    setTimeout(() => {
      if (typeof window.selectChannel === 'function') {
        window.selectChannel(channelId, senderName);
        const header = document.getElementById('current-channel-name');
        if (header) header.textContent = `DM · ${senderName}`;
      }
    }, 150);
  }

  // ── Reconnect banner (shown when no user token for DMs) ───────────────────
  let _bannerShown = false;
  function showReconnectBanner(show) {
    if (!show) { _bannerShown = false; return; }
    if (_bannerShown) return;
    // Suppress banner when Slack is auto-linked or auto-link was attempted — app.js shows the connect banner
    const su = window._sessionUser;
    if (su?.slackAutoLinked || su?.slackAutoLinkFailed || su?.services?.slack) return;
    _bannerShown = true;

    // Only show inside the Slack panel so it's contextual
    const panel = document.querySelector('.panel-slack');
    if (!panel) return;

    let banner = document.getElementById('snb-reconnect-banner');
    if (banner) return;

    banner = document.createElement('div');
    banner.id = 'snb-reconnect-banner';
    banner.className = 'snb-reconnect-banner';
    banner.innerHTML = `
      <span>🔔 Slack notifications are not loading — try refreshing the page</span>
      <button class="snb-reconnect-close" aria-label="Dismiss">✕</button>
    `;
    banner.querySelector('.snb-reconnect-close').addEventListener('click', () => banner.remove());

    // Insert at top of the slack-main area
    const main = panel.querySelector('.slack-main') || panel;
    main.insertBefore(banner, main.firstChild);
  }

  // ── Clear badge + server state when student opens Slack ───────────────────
  // Always posts to /api/slack-badge/clear (harmless if there was nothing to
  // clear) — that server-side state is still read by hub-tabs.js's Today-tab
  // Slack preview, independent of the nav-icon badge removed from this file.
  async function clear() {
    _dmCount = 0;
    setDmBadge(0);
    try { await fetch('/api/slack-badge/clear', { method: 'POST' }); } catch {}
  }

  // ── Patch panel opener so opening Slack clears the badge ──────────────────
  function patchSlackOpen() {
    // Patch window.setClassicPanel for calls from hub-tabs.js and other scripts
    const waitPanel = setInterval(() => {
      if (typeof window.setClassicPanel !== 'function') return;
      clearInterval(waitPanel);
      const orig = window.setClassicPanel;
      window.setClassicPanel = function (panel) {
        if (panel === 'slack') clear();
        return orig.call(this, panel);
      };
    }, 150);

    // Also patch the direct sidebar nav button click
    const waitBtn = setInterval(() => {
      const btn = document.querySelector(
        '[data-panel="slack"], .classic-nav-btn[data-panel="slack"]'
      );
      if (!btn || btn._sbPatched) return;
      btn._sbPatched = true;
      btn.addEventListener('click', () => clear(), { capture: true });
      clearInterval(waitBtn);
    }, 150);
  }

  // ── Minimal HTML escaper ──────────────────────────────────────────────────
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
})();
