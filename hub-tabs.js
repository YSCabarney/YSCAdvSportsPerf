/* Hub Tab View — Today / Progress / People / Goals */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  let _user           = null;
  let _teamMembers    = [];
  let _peoplePollTimer = null; // safety-net poll for availability, see startPeoplePoll()
  let _tasksCompleted = {};   // { assignmentId: boolean } — stored in prefs
  let _saPrefs        = {};   // cached prefs for Growth tab
  let _broadcastData  = null; // current broadcast (if any)
  let _currentBroadcastId = null;
  const _tooltip = document.getElementById('htv-avail-tooltip');

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  // Mirrors routes/chat.js's firstName() — same "First Last" format assumption,
  // confirmed reliable against real teacher/support-team data earlier today.
  function firstName(fullName) { return (fullName || '').trim().split(/\s+/)[0] || fullName; }

  function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(d);
    const now = new Date();
    const diff = Math.ceil((dt - now) / 86400000);
    if (diff < 0) return 'Still time — submit what you have';
    if (diff === 0) return 'Due Today';
    if (diff === 1) return 'Due Tomorrow';
    return `Due ${dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  function dueCls(d) {
    if (!d) return 'htv-due-later';
    const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
    if (diff <= 0) return 'htv-due-today';
    if (diff <= 2) return 'htv-due-soon';
    return 'htv-due-later';
  }

  async function api(path, opts) {
    const r = await fetch(path, opts);
    if (!r.ok) return null;
    return r.json();
  }

  // ── Tab switching ─────────────────────────────────────────────────────────
  let _activeTab = 'home';   // Home is the default landing pane (see index.html htv-pane-active)

  function switchTab(tab) {
    const prev = _activeTab;
    _activeTab = tab;

    // Track last non-meetings tab for Back to Today
    if (tab !== 'meetings') window._lastHtvTab = tab;

    document.querySelectorAll('.htv-tab').forEach(b => b.classList.toggle('htv-active', b.dataset.tab === tab));
    document.querySelectorAll('.htv-pane').forEach(p => {
      const isActive = p.id === `htv-${tab}`;
      p.classList.toggle('htv-pane-active', isActive);
      if (isActive) p.style.display = 'flex';
      else p.style.display = 'none';
    });
    if (tab === 'home')     loadHome();
    if (tab === 'today')  { loadToday(); document.querySelector('.htv-tab[data-tab="today"]')?.classList.remove('htv-tab-unread'); }
    if (tab === 'growth')   loadGrowth();
    if (tab === 'people') { loadPeople(); loadMyTeachers(); loadOfficeHourRequests(); loadOutsideWork(); loadSoccerSchedule(); }
    if (tab === 'people') startPeoplePoll(); else stopPeoplePoll();
    if (tab === 'meetings') {
      if (window.onMeetingsTabOpen) window.onMeetingsTabOpen();
    } else if (prev === 'meetings') {
      if (window.onMeetingsTabClose) window.onMeetingsTabClose();
    }
  }

  // Exposed so Back to Today button can restore last tab
  window.switchToHtvTab = switchTab;

  // ── Show the tab view (called when switching from panel to tabs) ─────────
  function showTabView() {
    const tabView   = document.getElementById('hub-tab-view');
    const panelArea = document.getElementById('classicPanelArea');
    const backBar   = document.getElementById('back-to-today-bar');
    if (!tabView) return;
    tabView.style.display = '';
    if (panelArea) panelArea.style.display = 'none';
    if (backBar)   backBar.style.display   = 'none';
    document.querySelectorAll('.classic-nav-btn').forEach(btn => btn.classList.remove('active'));
  }

  // ── TODAY TAB ─────────────────────────────────────────────────────────────

  async function loadMentorBeliefMessage() {
    const container = document.getElementById('mentor-belief-container');
    if (!container) return;
    try {
      const res  = await fetch('/api/student/mentor-weekly-message', { credentials: 'include' });
      const data = await res.json();
      if (!data.message) return; // keep the placeholder
      const initials = (data.message.mentorName || '').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'M';
      const weekOfLabel = new Date(data.message.weekOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
      container.innerHTML =
        '<div class="mentor-belief-card">' +
          '<div class="mbc-from">' +
            '<div class="mbc-avatar">' + esc(initials) + '</div>' +
            '<span class="mbc-label">From ' + esc(data.message.mentorName) + ' — your mentor</span>' +
          '</div>' +
          '<div class="mbc-text">"' + esc(data.message.text) + '"</div>' +
          '<div class="mbc-meta">Week of ' + weekOfLabel + ' · reply via Mentor Chat</div>' +
        '</div>';
    } catch {
      // keep the placeholder on error
    }
  }

  // ── HOME TAB (AI Chat centerpiece) ───────────────────────────────────────
  // #widget-chat lives in #htv-home now. The chat itself is driven by app.js;
  // this just makes sure the proactive opener has run (idempotent).
  function loadHome() {
    if (typeof window.ensureChatOpener === 'function') window.ensureChatOpener();
  }

  // Formerly a 7-widget orchestrator (game-plan, Sport Schedule, Slack/Growth
  // previews, Broadcast, Assignments Due, Recovery invite) — those widgets'
  // render code is untouched in this file (loadTodaySlackPreview,
  // loadTodayGrowthSnapshot, etc.) but no longer called from here. Sport
  // Schedule moved to the People tab (see switchTab()); the mentor weekly
  // message, Broadcast, and Recovery invite moved into the Home chat opener
  // (see renderChatOpener() in app.js). Mentor Chat is this tab's only
  // remaining content.
  async function loadToday() {
    initMentorChat();
  }

  // Broadcast widget
  function renderBroadcastWidget() {
    const el = document.getElementById('htv-broadcast-body');
    if (!el) return;
    if (!_broadcastData) {
      el.innerHTML = '<div class="htv-broadcast-empty">No announcements right now. Check back soon!</div>';
      return;
    }
    const msg = _broadcastData;
    const dismissed = window._dismissedBroadcastIds && window._dismissedBroadcastIds.has(msg.id);
    if (dismissed) {
      el.innerHTML = '<div class="htv-broadcast-empty">No announcements right now. Check back soon!</div>';
      return;
    }
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
    let inner = '';
    const btype = msg.broadcastType || 'text';
    if (btype === 'text') {
      inner = `<div class="htv-bb"><div class="htv-bb-header">📢 Message from Your Teacher</div><div class="htv-bb-text">${esc(msg.text||'')}</div></div>`;
    } else if (btype === 'video') {
      inner = `<div class="htv-tv"><div class="htv-tv-header">📺 Video Message from Your Teacher</div>${msg.mediaUrl ? `<video controls src="${esc(msg.mediaUrl)}"></video>` : ''}${msg.caption ? `<div style="margin-top:8px;font-size:.85rem">${esc(msg.caption)}</div>` : ''}</div>`;
    } else if (btype === 'audio') {
      inner = `<div class="htv-record"><div class="htv-record-disc" id="htv-record-disc"></div><div class="htv-record-content"><div class="htv-record-header">🎵 Audio Message from Your Teacher</div><audio controls onplay="document.getElementById('htv-record-disc')?.classList.add('htv-playing')" onpause="document.getElementById('htv-record-disc')?.classList.remove('htv-playing')" src="${esc(msg.mediaUrl||'')}"></audio>${msg.caption ? `<div style="margin-top:6px;font-size:.82rem">${esc(msg.caption)}</div>` : ''}</div></div>`;
    } else {
      inner = `<div class="htv-bb"><div class="htv-bb-header">📢 Message from Your Teacher</div><div class="htv-bb-text">${esc(msg.text||'')}</div></div>`;
    }
    el.innerHTML = `<div class="htv-broadcast-inner">
      ${inner}
      <button class="htv-dismiss-btn" id="htv-broadcast-dismiss" title="Dismiss">✕</button>
      ${time ? `<div class="htv-broadcast-time">Sent at ${time}</div>` : ''}
    </div>`;
    document.getElementById('htv-broadcast-dismiss')?.addEventListener('click', () => {
      if (typeof saveBroadcastDismissed === 'function') saveBroadcastDismissed(msg.id);
      _broadcastData = null;
      renderBroadcastWidget();
    });
  }

  // ── Soccer schedule ───────────────────────────────────────────────────────

  let _soccerData   = null;
  let _soccerPrefs  = {};   // { soccerNotes: { id: { note, attending } }, soccerCalIds: { id: calEventId } }

  let _myEvents = [];   // the student's own events (see "My events" below)

  async function loadSoccerSchedule() {
    const el = document.getElementById('htv-soccer-body');
    if (!el) return;
    const [team, prefs, mine] = await Promise.all([
      api('/api/people/soccer-schedule'),
      api('/api/prefs'),
      api('/api/people/my-schedule'),
    ]);
    _soccerData  = team || { schedule: [], upcomingEvent: '' };
    _soccerPrefs = prefs || {};
    _myEvents    = mine?.events || [];
    renderSoccerSchedule(el);
  }

  function renderSoccerSchedule(el) {
    if (!el) el = document.getElementById('htv-soccer-body');
    if (!el || !_soccerData) return;
    // Date-aware, matching soccerCountdown()/soccerFullDate() below — a
    // specific `date` on the event wins over its `day` name, so a rescheduled
    // or one-off event (date set, day dropdown left stale) still highlights
    // correctly instead of silently disagreeing with the popup and chatbot.
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    const notes  = _soccerPrefs?.soccerNotes  || {};
    const calIds = _soccerPrefs?.soccerCalIds || {};

    const items = _soccerData.schedule.map(item => {
      const eventDate = soccerEventDate(item);
      const isToday  = !!eventDate && eventDate.getTime() === todayDate.getTime();
      const isGame   = item.type === 'game';
      const typeClass = `htv-type-${item.type || 'practice'}`;
      const hasNote   = notes[item.id]?.note?.trim();
      const isSynced  = !!calIds[item.id];
      const noteIcon  = hasNote  ? '<span class="htv-soccer-note-dot" title="You have a personal note">📝</span>' : '';
      const calIcon   = isSynced ? '<span class="htv-soccer-cal-dot" title="On your calendar">✓</span>' : '';
      return `<div class="htv-soccer-item${isToday ? ' htv-today-item' : ''}${isGame ? ' htv-game' : ''} htv-soccer-clickable" data-soc-id="${esc(item.id||'')}">
        <div class="htv-soccer-row-main">
          <span class="htv-soccer-day">${esc(item.day)}</span>
          <span class="htv-soccer-time">⏰ ${esc(item.time)} · ${esc(item.location)}</span>
        </div>
        <div class="htv-soccer-row-meta">
          <span class="htv-soccer-type ${typeClass}">${esc(item.type || 'practice')}</span>
          ${noteIcon}${calIcon}
        </div>
      </div>`;
    }).join('');

    const upcoming = _soccerData.upcomingEvent
      ? `<div class="htv-next-up-banner"><span class="htv-next-up-label">Next up</span><span class="htv-next-up-text">${esc(_soccerData.upcomingEvent)}</span></div>` : '';

    const syncBtn = `<button class="htv-soccer-sync-btn" id="htv-soccer-sync-all">
      🗓 Sync All Sport Events
    </button>`;

    const teamPart = _soccerData.schedule?.length
      ? `${upcoming}${syncBtn}<div class="htv-soccer-list">${items}</div>` : '';

    el.innerHTML = teamPart + renderMyEventsSection();

    el.querySelectorAll('.htv-soccer-clickable:not(.htv-my-item)').forEach(row => {
      row.addEventListener('click', () => {
        const id = row.dataset.socId;
        const item = _soccerData.schedule.find(s => s.id === id);
        if (item) openSoccerPopup(item);
      });
    });
    el.querySelectorAll('.htv-my-item').forEach(row => {
      row.addEventListener('click', () => {
        const ev = _myEvents.find(e => e.id === row.dataset.myId);
        if (ev) openMyEventModal(ev);
      });
    });
    document.getElementById('htv-my-add')?.addEventListener('click', () => openMyEventModal(null));

    document.getElementById('htv-soccer-sync-all')?.addEventListener('click', () => {
      syncAllSoccer();
    });
  }

  // ── Soccer date helpers ────────────────────────────────────────────────────

  const _DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

  function soccerEventDate(item) {
    if (item.date) return new Date(item.date + 'T00:00:00');
    const todayIdx  = new Date().getDay();
    const targetIdx = _DAY_NAMES.indexOf(item.day);
    if (targetIdx === -1) return null;
    let diff = targetIdx - todayIdx;
    if (diff < 0) diff += 7;
    const d = new Date();
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function soccerCountdown(item) {
    const d = soccerEventDate(item);
    if (!d) return '';
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = Math.round((d - today) / 86400000);
    if (diff === 0) return '⏰ Today!';
    if (diff === 1) return '⏰ Tomorrow';
    if (diff < 0)  return '⏰ Passed';
    return `⏰ ${diff} days away`;
  }

  function soccerFullDate(item) {
    const d = soccerEventDate(item);
    if (!d) return item.day;
    return d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }

  function soccerISODate(item) {
    const d = soccerEventDate(item);
    if (!d) return '';
    return d.toISOString().slice(0, 10);
  }

  // Parse "3:30 – 5:00 PM" → { startTime: "15:30", endTime: "17:00" }
  function parseSoccerTime(timeStr) {
    if (!timeStr) return { startTime: '', endTime: '' };
    const parts = timeStr.split(/[–-]/).map(s => s.trim());
    const ampm  = /AM|PM/i.test(parts[parts.length - 1]) ? parts[parts.length - 1].match(/AM|PM/i)[0] : '';
    function to24(t, meridiem) {
      const clean = t.replace(/\s*(AM|PM)/i, '').trim();
      let [h, m = '00'] = clean.split(':');
      h = parseInt(h); m = parseInt(m);
      const mer = meridiem.toUpperCase();
      if (mer === 'PM' && h !== 12) h += 12;
      if (mer === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    }
    const startTime = parts[0] ? to24(parts[0], ampm || 'PM') : '';
    const endTime   = parts[1] ? to24(parts[1], ampm || 'PM') : '';
    return { startTime, endTime };
  }

  // ── Soccer popup ───────────────────────────────────────────────────────────

  let _soccerPopupItem = null;

  function openSoccerPopup(item) {
    _soccerPopupItem = item;
    const existing = document.getElementById('soccer-popup-overlay');
    if (existing) existing.remove();

    const notes   = _soccerPrefs?.soccerNotes  || {};
    const calIds  = _soccerPrefs?.soccerCalIds || {};
    const myNote  = notes[item.id]?.note      || '';
    const attending = notes[item.id]?.attending !== false; // default true
    const calId   = calIds[item.id] || '';
    const typeLabel = { practice: '⚽ Practice', game: '🏆 Game', film: '🎬 Film Session', match: '🏆 Match', training: '💪 Training' }[item.type] || item.type;
    const countdown = soccerCountdown(item);
    const fullDate  = soccerFullDate(item);

    const opponentRow = (item.type === 'game' || item.type === 'match') && item.opponent
      ? `<div class="soc-popup-detail-row"><span class="soc-popup-detail-icon">🆚</span><span>vs. ${esc(item.opponent)}</span></div>` : '';
    const coachNotes  = item.notes
      ? `<div class="soc-popup-section"><div class="soc-popup-section-label">📋 Coach Notes</div><div class="soc-popup-coach-notes">${esc(item.notes)}</div></div>` : '';
    const calBtn = calId
      ? `<button class="soc-popup-cal-btn soc-popup-cal-synced" id="soc-cal-btn">✓ On Your Calendar<span class="soc-cal-remove">Remove</span></button>`
      : `<button class="soc-popup-cal-btn" id="soc-cal-btn">🗓 Add to My Calendar</button>`;

    const overlay = document.createElement('div');
    overlay.id = 'soccer-popup-overlay';
    overlay.className = 'soc-popup-overlay';
    overlay.innerHTML = `
      <div class="soc-popup-card" id="soccer-popup-card" role="dialog" aria-modal="true">
        <div class="soc-popup-header">
          <span class="soc-popup-header-title">🏆 YSC Academy Sport Schedule</span>
          <button class="soc-popup-close" id="soc-popup-close" aria-label="Close">✕</button>
        </div>
        <div class="soc-popup-body">
          <div class="soc-popup-type-badge soc-type-${esc(item.type||'practice')}">${typeLabel}</div>
          <div class="soc-popup-event-date">${fullDate}</div>

          <div class="soc-popup-details">
            <div class="soc-popup-detail-row">
              <span class="soc-popup-detail-icon">🕐</span>
              <span>${esc(item.time || 'TBD')}</span>
            </div>
            <div class="soc-popup-detail-row">
              <span class="soc-popup-detail-icon">📍</span>
              <span>${esc(item.location || 'TBD')}</span>
            </div>
            ${opponentRow}
          </div>

          ${coachNotes}

          <div class="soc-popup-section">
            <div class="soc-popup-section-label">✏️ My Notes</div>
            <textarea class="soc-popup-notes-input" id="soc-my-notes" placeholder="Ask mom for a ride home, bring shin guards…" rows="3">${esc(myNote)}</textarea>
          </div>

          <div class="soc-popup-section">
            <label class="soc-popup-attending-label">
              <input type="checkbox" id="soc-attending" ${attending ? 'checked' : ''} />
              <span class="soc-attending-text">I'm attending this event</span>
            </label>
          </div>

          <div class="soc-popup-countdown" id="soc-countdown">${countdown}</div>

          <div class="soc-popup-actions">
            ${calBtn}
            <button class="soc-popup-save-btn" id="soc-save-btn">💾 Save Notes</button>
          </div>
          <div class="soc-popup-save-msg" id="soc-save-msg" style="display:none">✓ Saved!</div>
          <div class="soc-popup-cal-msg" id="soc-cal-msg" style="display:none"></div>

          <button class="soc-popup-edit-link" id="soc-edit-open-btn">✏️ Edit this event</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('soc-popup-open'));

    document.getElementById('soc-popup-close').addEventListener('click', closeSoccerPopup);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeSoccerPopup(); });

    document.addEventListener('keydown', _soccerEscHandler);

    document.getElementById('soc-save-btn').addEventListener('click', () => saveSoccerNote(item.id));
    document.getElementById('soc-edit-open-btn').addEventListener('click', () => {
      closeSoccerPopup();
      openSoccerEditModal(item);
    });

    const calBtn2 = document.getElementById('soc-cal-btn');
    if (calId) {
      calBtn2.addEventListener('click', async e => {
        if (e.target.closest('.soc-cal-remove') || calBtn2.classList.contains('soc-popup-cal-synced')) {
          await removeSoccerFromCalendar(item);
        }
      });
    } else {
      calBtn2.addEventListener('click', () => addSoccerToCalendar(item));
    }

    // Dismiss keyboard on mobile when textarea focused
    document.getElementById('soc-my-notes')?.addEventListener('focus', () => {
      setTimeout(() => document.getElementById('soccer-popup-card')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 300);
    });
  }

  function _soccerEscHandler(e) {
    if (e.key === 'Escape') closeSoccerPopup();
  }

  function closeSoccerPopup() {
    const overlay = document.getElementById('soccer-popup-overlay');
    if (!overlay) return;
    document.removeEventListener('keydown', _soccerEscHandler);
    overlay.classList.remove('soc-popup-open');
    setTimeout(() => overlay.remove(), 260);
  }

  // ── Soccer Edit Modal ───────────────────────────────────────────────────────

  function openSoccerEditModal(item) {
    // Coach fields are always read-only from the student hub — editing the
    // schedule itself is Teacher Hub only (requireTeacher-gated). Only
    // personal notes + attending are actually writable here.
    const myNote    = _soccerPrefs?.soccerNotes?.[item.id]?.note || '';
    const attending = !!_soccerPrefs?.soccerNotes?.[item.id]?.attending;

    const lockIcon  = `<span class="soc-edit-lock" title="Only coaches can edit this field">🔒</span>`;

    function field(label, id, val, type, locked, opts = {}) {
      const lockBadge = locked ? lockIcon : '';
      if (type === 'select' && opts.choices) {
        const options = opts.choices.map(c =>
          `<option value="${c.v}"${val === c.v ? ' selected' : ''}>${c.l}</option>`
        ).join('');
        return `<div class="soc-edit-field${locked ? ' soc-edit-locked' : ''}">
          <label class="soc-edit-label">${label} ${lockBadge}</label>
          <select class="soc-edit-input soc-edit-select" id="${id}" ${locked ? 'disabled' : ''}>${options}</select>
        </div>`;
      }
      if (type === 'textarea') {
        return `<div class="soc-edit-field${locked ? ' soc-edit-locked' : ''}">
          <label class="soc-edit-label">${label} ${lockBadge}</label>
          <textarea class="soc-edit-input soc-edit-textarea" id="${id}" rows="3" ${locked ? 'readonly' : ''}>${esc(val || '')}</textarea>
        </div>`;
      }
      return `<div class="soc-edit-field${locked ? ' soc-edit-locked' : ''}">
        <label class="soc-edit-label">${label} ${lockBadge}</label>
        <input class="soc-edit-input" type="${type}" id="${id}" value="${esc(val || '')}" ${locked ? 'readonly' : ''} />
      </div>`;
    }

    const colorChoices = [
      { v: 'green',  l: '🟢 Green (Practice)' },
      { v: 'navy',   l: '🔵 Navy (Home Game)' },
      { v: 'red',    l: '🔴 Red (Away Game)' },
      { v: 'purple', l: '🟣 Purple (Tournament)' },
      { v: 'gold',   l: '🟡 Gold (Meeting)' },
    ];
    const typeChoices = [
      { v: 'practice',    l: 'Practice' },
      { v: 'game',        l: 'Game (Home/Away)' },
      { v: 'tournament',  l: 'Tournament' },
      { v: 'meeting',     l: 'Team Meeting' },
      { v: 'recovery',    l: 'Recovery / Film' },
    ];
    const dayChoices = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
      .map(d => ({ v: d, l: d }));

    const overlay = document.createElement('div');
    overlay.id = 'soccer-edit-overlay';
    overlay.className = 'soc-edit-overlay';
    overlay.innerHTML = `
      <div class="soc-edit-modal" role="dialog" aria-modal="true">
        <div class="soc-edit-header">
          <span>✏️ Edit Sport Event</span>
          <button class="soc-popup-close" id="soc-edit-close">✕</button>
        </div>
        <div class="soc-edit-body">
          <div class="soc-edit-note-banner">🔒 Contact your coach to update event details. You can edit your personal notes below.</div>

          <div class="soc-edit-section-label">Event Details</div>
          ${field('Event Title / Label', 'se-title', item?.title || item?.opponent || (item?.type === 'game' ? `vs. ${item?.opponent || '?'}` : item?.type || ''), 'text', true)}
          ${field('Day of Week', 'se-day', item?.day || 'Monday', 'select', true, { choices: dayChoices })}
          ${field('Date', 'se-date', item?.date || '', 'date', true)}
          ${field('Time', 'se-time', item?.time || '', 'text', true)}
          ${field('Location', 'se-location', item?.location || '', 'text', true)}
          ${field('Event Type', 'se-type', item?.type || 'practice', 'select', true, { choices: typeChoices })}
          ${field('Opponent', 'se-opponent', item?.opponent || '', 'text', true)}
          ${field('Color', 'se-color', item?.color || 'green', 'select', true, { choices: colorChoices })}
          ${field('Coach Notes', 'se-coach-notes', item?.notes || '', 'textarea', true)}

          <div class="soc-edit-section-label" style="margin-top:16px">My Personal Notes</div>
          ${field('My Notes', 'se-my-notes', myNote, 'textarea', false)}
          <div class="soc-edit-field">
            <label class="soc-popup-attending-label">
              <input type="checkbox" id="se-attending" ${attending ? 'checked' : ''} />
              <span class="soc-attending-text">I'm attending this event</span>
            </label>
          </div>
        </div>
        <div class="soc-edit-footer">
          <div class="soc-edit-save-msg" id="soc-edit-save-msg" style="display:none"></div>
          <button class="soc-edit-cancel-btn" id="soc-edit-cancel">Cancel</button>
          <button class="soc-edit-save-btn" id="soc-edit-save">Save Changes</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('soc-popup-open'));

    const close = () => {
      overlay.classList.remove('soc-popup-open');
      setTimeout(() => overlay.remove(), 260);
    };

    document.getElementById('soc-edit-close').addEventListener('click', close);
    document.getElementById('soc-edit-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    document.getElementById('soc-edit-save').addEventListener('click', async () => {
      const msg = document.getElementById('soc-edit-save-msg');

      const notes = _soccerPrefs?.soccerNotes || {};
      notes[item.id] = { note: document.getElementById('se-my-notes').value, attending: document.getElementById('se-attending').checked };
      await api('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soccerNotes: notes }) });
      if (_soccerPrefs) _soccerPrefs.soccerNotes = notes;

      if (msg) {
        msg.textContent = '✓ Saved!';
        msg.style.color = '#2e7d32';
        msg.style.display = 'block';
      }
      setTimeout(async () => { close(); await loadSoccerSchedule(); }, 700);
    });
  }

  async function saveSoccerNote(eventId) {
    const note      = document.getElementById('soc-my-notes')?.value || '';
    const attending = document.getElementById('soc-attending')?.checked ?? true;
    const notes     = { ...(_soccerPrefs?.soccerNotes || {}) };
    notes[eventId]  = { note, attending };
    _soccerPrefs    = { ..._soccerPrefs, soccerNotes: notes };
    await api('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soccerNotes: notes }) });
    const msg = document.getElementById('soc-save-msg');
    if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 2000); }
    renderSoccerSchedule();
  }

  async function addSoccerToCalendar(item) {
    const btn = document.getElementById('soc-cal-btn');
    const msg = document.getElementById('soc-cal-msg');
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    const { startTime, endTime } = parseSoccerTime(item.time);
    const title = item.type === 'game' || item.type === 'match'
      ? `🏆 Game vs. ${item.opponent || 'TBD'}` : `🏆 Sport ${item.type || 'Practice'}`;
    const desc  = [item.location && `📍 ${item.location}`, item.notes].filter(Boolean).join('\n');
    const result = await api('/api/calendar/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, date: soccerISODate(item), startTime, endTime, description: desc, type: 'soccer', color: '#16a34a', soccerEventId: item.id }),
    });
    if (result?.id) {
      const calIds = { ...(_soccerPrefs?.soccerCalIds || {}), [item.id]: result.id };
      _soccerPrefs = { ..._soccerPrefs, soccerCalIds: calIds };
      await api('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soccerCalIds: calIds }) });
      if (btn) { btn.className = 'soc-popup-cal-btn soc-popup-cal-synced'; btn.innerHTML = '✓ On Your Calendar<span class="soc-cal-remove">Remove</span>'; btn.disabled = false; }
      if (msg) { msg.textContent = '✅ Added to your calendar!'; msg.className = 'soc-popup-cal-msg soc-cal-success'; msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 3000); }
      renderSoccerSchedule();
    } else {
      if (btn) { btn.textContent = '🗓 Add to My Calendar'; btn.disabled = false; }
      if (msg) { msg.textContent = 'Could not add to calendar.'; msg.className = 'soc-popup-cal-msg soc-cal-error'; msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 3000); }
    }
  }

  async function removeSoccerFromCalendar(item) {
    const calIds = { ...(_soccerPrefs?.soccerCalIds || {}) };
    const calId  = calIds[item.id];
    if (!calId) return;
    await api(`/api/calendar/events/${calId}`, { method: 'DELETE' });
    delete calIds[item.id];
    _soccerPrefs = { ..._soccerPrefs, soccerCalIds: calIds };
    await api('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soccerCalIds: calIds }) });
    const btn = document.getElementById('soc-cal-btn');
    const msg = document.getElementById('soc-cal-msg');
    if (btn) { btn.className = 'soc-popup-cal-btn'; btn.textContent = '🗓 Add to My Calendar'; btn.disabled = false; }
    if (msg) { msg.textContent = 'Removed from calendar.'; msg.className = 'soc-popup-cal-msg'; msg.style.display = 'block'; setTimeout(() => msg.style.display = 'none', 2500); }
    renderSoccerSchedule();
  }

  async function syncAllSoccer() {
    const btn = document.getElementById('htv-soccer-sync-all');
    if (!_soccerData?.schedule?.length) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Syncing…'; }
    const calIds = { ...(_soccerPrefs?.soccerCalIds || {}) };
    let added = 0;
    for (const item of _soccerData.schedule) {
      if (calIds[item.id]) continue;
      const { startTime, endTime } = parseSoccerTime(item.time);
      const title = item.type === 'game' || item.type === 'match'
        ? `🏆 Game vs. ${item.opponent || 'TBD'}` : `🏆 Sport ${item.type || 'Practice'}`;
      const desc  = [item.location && `📍 ${item.location}`, item.notes].filter(Boolean).join('\n');
      const result = await api('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, date: soccerISODate(item), startTime, endTime, description: desc, type: 'soccer', color: '#16a34a', soccerEventId: item.id }),
      });
      if (result?.id) { calIds[item.id] = result.id; added++; }
    }
    _soccerPrefs = { ..._soccerPrefs, soccerCalIds: calIds };
    await api('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ soccerCalIds: calIds }) });
    if (btn) { btn.disabled = false; btn.textContent = added > 0 ? `✓ ${added} event${added === 1 ? '' : 's'} added!` : '✓ Already synced'; setTimeout(() => { btn.textContent = '🗓 Sync All Sport Events'; }, 3000); }
    renderSoccerSchedule();
  }

  // ── My Teachers (from Canvas) — message any of them on Slack ────────────────
  // The list comes from the student's own Canvas courses (lib/teacher-directory.js).
  // "Message" opens the composer in app.js, which sends from the student's own
  // Slack account. Someone listed as a teacher on EVERY course is usually
  // program staff rather than a subject teacher, so they're grouped separately.
  async function loadMyTeachers() {
    const el = document.getElementById('htv-teachers-body');
    if (!el) return;
    const data = await api('/api/people/my-teachers');
    const teachers = data?.teachers || [];
    if (!teachers.length) {
      el.innerHTML = '<div class="htv-empty-state">Your teachers will show up here once Canvas is connected. You can also ask the AI Assistant to help you reach out to one.</div>';
      return;
    }
    const row = t => `<div class="htv-teacher-row">
        <div class="htv-person-info">
          <div class="htv-person-name">${esc(t.name)}</div>
          <div class="htv-person-role htv-teacher-courses">${esc(t.onAllCourses ? 'Listed on all your courses' : t.courses.join(' · '))}</div>
          ${(t.officeHours || []).length ? `<div class="htv-teacher-hours">🕒 Office hours: ${t.officeHours.map(esc).join(' · ')}</div>` : ''}
        </div>
        <button type="button" class="htv-teacher-msg" data-teacher="${esc(t.name).replace(/"/g, '&quot;')}">Message on Slack</button>
      </div>`;
    const subject = teachers.filter(t => !t.onAllCourses);
    const staff = teachers.filter(t => t.onAllCourses);
    el.innerHTML = subject.map(row).join('') +
      (staff.length ? `<div class="htv-teacher-group">Also on all your courses</div>${staff.map(row).join('')}` : '');
    el.querySelectorAll('.htv-teacher-msg').forEach(b =>
      b.addEventListener('click', () => window.openTeacherComposeModal?.(b.dataset.teacher)));
  }

  // ── My office-hour requests (Phase 2b) — sent from the coach's card; the teacher accepts/declines ───
  async function loadOfficeHourRequests() {
    const el = document.getElementById('htv-oh-requests');
    if (!el) return;
    const data = await api('/api/people/office-hour-requests');
    const list = data?.requests || [];
    if (!list.length) { el.hidden = true; el.innerHTML = ''; return; }
    const label = { requested: 'Waiting for an answer', accepted: '✅ Accepted — on your calendar', declined: 'Declined', expired: 'No answer in time' };
    el.innerHTML = '<div class="htv-teacher-group">Office-hour requests</div>' + list.map(r => `<div class="htv-teacher-row" data-id="${esc(r.id)}">
        <div class="htv-person-info">
          <div class="htv-person-name">${esc(r.teacherName)} · ${esc(r.when)}</div>
          <div class="htv-person-role htv-teacher-courses">${esc(label[r.status] || r.status)}${r.where ? ' · ' + esc(r.where) : ''}</div>
          ${r.teacherNote ? `<div class="htv-teacher-hours">${esc(r.teacherName)}: “${esc(r.teacherNote)}”</div>` : ''}
        </div>
        ${r.canCancel ? '<button type="button" class="htv-teacher-msg htv-oh-cancel">Cancel</button>' : ''}
      </div>`).join('');
    el.hidden = false;
    el.querySelectorAll('.htv-oh-cancel').forEach(b => b.addEventListener('click', async () => {
      const id = b.closest('[data-id]').dataset.id;
      if (!confirm('Cancel this office-hours request? Your teacher will get a message.')) return;
      b.disabled = true;
      const r = await fetch(`/api/people/office-hour-requests/${encodeURIComponent(id)}/cancel`, { method: 'POST' }).catch(() => null);
      if (!r?.ok) { b.disabled = false; alert('Could not cancel — try again.'); return; }
      loadOfficeHourRequests();
      if (typeof window.loadCalendarEvents === 'function') window.loadCalendarEvents().catch(() => {});
    }));
  }

  // ── Other courses (APEX etc.) — the student's own outside-Canvas work list ───────────
  let _owWired = false;
  async function loadOutsideWork() {
    const listEl = document.getElementById('htv-ow-list');
    if (!listEl) return;
    const data = await api('/api/outside-work');
    const items = data?.items || [];
    const today = localYmd(new Date());
    const fmtDue = ymd => new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const open = items.filter(i => !i.done), done = items.filter(i => i.done).slice(-5);
    const row = i => `<div class="htv-ow-row${i.done ? ' is-done' : ''}" data-id="${esc(i.id)}">
        <label class="htv-ow-check"><input type="checkbox" ${i.done ? 'checked' : ''} aria-label="Done"></label>
        <div class="htv-person-info"><div class="htv-person-name">${esc(i.title)}</div>
          <div class="htv-person-role htv-teacher-courses">${esc(i.course)} · due ${esc(fmtDue(i.dueYmd))}${!i.done && i.dueYmd < today ? ' · <span class="htv-ow-late">past due</span>' : ''}</div></div>
        <button type="button" class="htv-ow-del" aria-label="Delete">✕</button>
      </div>`;
    listEl.innerHTML = (open.length ? open.map(row).join('') : '<div class="htv-empty-state">Nothing added yet.</div>')
      + (done.length ? `<div class="htv-teacher-group">Done</div>${done.map(row).join('')}` : '');
    const date = document.getElementById('htv-ow-date');
    if (date && !date.value) date.value = today;
    if (_owWired) return;
    _owWired = true;
    const msg = document.getElementById('htv-ow-msg');
    const say = t => { msg.textContent = t || ''; msg.hidden = !t; };
    document.getElementById('htv-ow-form')?.addEventListener('submit', async e => {
      e.preventDefault();
      say('');
      const body = { course: document.getElementById('htv-ow-course').value, title: document.getElementById('htv-ow-title').value, dueYmd: document.getElementById('htv-ow-date').value };
      const r = await fetch('/api/outside-work', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
      const res = await r?.json().catch(() => ({}));
      if (!r?.ok) { say(res?.error || 'Could not add that — try again.'); return; }
      document.getElementById('htv-ow-title').value = '';   // keep the course for adding the next one
      loadOutsideWork();
    });
    listEl.addEventListener('change', async e => {
      const box = e.target.closest('input[type="checkbox"]');
      const id = box?.closest('[data-id]')?.dataset.id;
      if (!id) return;
      const r = await fetch(`/api/outside-work/${encodeURIComponent(id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ done: box.checked }) }).catch(() => null);
      if (!r?.ok) { box.checked = !box.checked; say('Could not save that — try again.'); return; }
      loadOutsideWork();
    });
    listEl.addEventListener('click', async e => {
      const btn = e.target.closest('.htv-ow-del');
      const id = btn?.closest('[data-id]')?.dataset.id;
      if (!id || !confirm('Delete this assignment from your list?')) return;
      const r = await fetch(`/api/outside-work/${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => null);
      if (!r?.ok) { say('Could not delete that — try again.'); return; }
      loadOutsideWork();
    });
  }

  // ── My events — the student's own sport schedule ───────────────────────────
  // Stored server-side (lib/student-schedule-store.js, Redis-mirrored) and put
  // on the student's Calendar by the server itself, so a save here is the only
  // step — no separate "add to calendar". Coach-managed team events above stay
  // read-only for the student; only these are editable.

  const MY_DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const MY_TYPES = [
    { v: 'practice', l: 'Practice' }, { v: 'game', l: 'Game' }, { v: 'match', l: 'Match' },
    { v: 'training', l: 'Training' }, { v: 'film', l: 'Film session' }, { v: 'other', l: 'Other' },
  ];

  function localYmd(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function fmtHm(hm) {
    if (!hm) return '';
    let [h, m] = hm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, '0')} ${ap}`;
  }
  function fmtYmdShort(ymd) {
    return new Date(ymd + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }
  // Next date this event happens on or after today (null once it's over) —
  // used both to hide finished events and to sort what's coming up first.
  function myEventNextDate(ev) {
    const today = localYmd(new Date());
    if (ev.repeat !== 'weekly') return ev.date >= today ? ev.date : null;
    for (let i = 0; i < 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      const ymd = localYmd(d);
      if (ev.endDate && ymd > ev.endDate) return null;
      if (ev.days.includes(MY_DAYS[(d.getDay() + 6) % 7])) return ymd;
    }
    return null;
  }
  function myEventLabel(ev) {
    if (ev.title) return ev.title;
    if (ev.type === 'game' || ev.type === 'match') return ev.opponent ? `Game vs. ${ev.opponent}` : 'Game';
    return (MY_TYPES.find(t => t.v === ev.type) || {}).l || 'Event';
  }

  function renderMyEventsSection() {
    const upcoming = _myEvents
      .map(ev => ({ ev, next: myEventNextDate(ev) }))
      .filter(x => x.next)
      .sort((a, b) => a.next.localeCompare(b.next) || (a.ev.startTime || '').localeCompare(b.ev.startTime || ''));

    const rows = upcoming.map(({ ev }) => {
      const when = ev.repeat === 'weekly'
        ? 'Every ' + ev.days.map(d => d.slice(0, 3)).join(' · ')
        : fmtYmdShort(ev.date);
      const time = fmtHm(ev.startTime) + (ev.endTime ? ' – ' + fmtHm(ev.endTime) : '');
      const isGame = ev.type === 'game' || ev.type === 'match';
      return `<div class="htv-soccer-item htv-soccer-clickable htv-my-item${isGame ? ' htv-game' : ''}" data-my-id="${esc(ev.id)}">
        <div class="htv-soccer-row-main">
          <span class="htv-soccer-day">${esc(when)}</span>
          <span class="htv-soccer-time">⏰ ${esc(time)}${ev.location ? ' · ' + esc(ev.location) : ''}</span>
        </div>
        <div class="htv-soccer-row-meta">
          <span class="htv-soccer-type htv-type-${esc(ev.type)}">${esc(myEventLabel(ev))}</span>
          <span class="htv-soccer-cal-dot" title="On your calendar">✓</span>
        </div>
      </div>`;
    }).join('');

    return `<div class="htv-my-events">
      <div class="htv-my-events-head">
        <span class="htv-my-events-label">My events</span>
        <button type="button" class="htv-my-add-btn" id="htv-my-add">+ Add to my schedule</button>
      </div>
      ${rows
        ? `<div class="htv-soccer-list">${rows}</div>`
        : '<div class="htv-empty-state">Add your own practices and games — they\'ll show up here and on your Calendar.</div>'}
    </div>`;
  }

  function openMyEventModal(ev) {
    const editing = !!ev;
    document.getElementById('my-event-overlay')?.remove();

    const typeOpts = MY_TYPES.map(t => `<option value="${t.v}">${t.l}</option>`).join('');
    const dayChecks = MY_DAYS.map(d =>
      `<label class="my-day-chip"><input type="checkbox" value="${d}"><span>${d.slice(0, 3)}</span></label>`).join('');

    const overlay = document.createElement('div');
    overlay.id = 'my-event-overlay';
    overlay.className = 'soc-edit-overlay';
    overlay.innerHTML = `
      <div class="soc-edit-modal" role="dialog" aria-modal="true" aria-label="${editing ? 'Edit my event' : 'Add to my schedule'}">
        <div class="soc-edit-header">
          <span>${editing ? '✏️ Edit my event' : '🏆 Add to my schedule'}</span>
          <button class="soc-popup-close" id="me-close" aria-label="Close">✕</button>
        </div>
        <div class="soc-edit-body">
          <div class="soc-edit-field"><label class="soc-edit-label" for="me-type">What is it?</label>
            <select class="soc-edit-input soc-edit-select" id="me-type">${typeOpts}</select></div>
          <div class="soc-edit-field"><label class="soc-edit-label" for="me-title">Name (optional)</label>
            <input class="soc-edit-input" type="text" id="me-title" maxlength="80" placeholder="e.g. Team practice, Club training"></div>
          <div class="soc-edit-field" id="me-opp-field" style="display:none"><label class="soc-edit-label" for="me-opponent">Opponent</label>
            <input class="soc-edit-input" type="text" id="me-opponent" maxlength="80" placeholder="Who are you playing?"></div>
          <div class="soc-edit-field"><label class="soc-edit-label" for="me-repeat">How often?</label>
            <select class="soc-edit-input soc-edit-select" id="me-repeat">
              <option value="once">Just once</option><option value="weekly">Every week</option></select></div>
          <div class="soc-edit-field" id="me-date-field"><label class="soc-edit-label" for="me-date">Date</label>
            <input class="soc-edit-input" type="date" id="me-date"></div>
          <div id="me-weekly-fields" style="display:none">
            <div class="soc-edit-field"><label class="soc-edit-label">Which days?</label>
              <div class="my-days" id="me-days">${dayChecks}</div></div>
            <div class="soc-edit-field"><label class="soc-edit-label" for="me-enddate">Until (optional)</label>
              <input class="soc-edit-input" type="date" id="me-enddate"></div>
          </div>
          <div class="my-time-row">
            <div class="soc-edit-field"><label class="soc-edit-label" for="me-start">Starts</label>
              <input class="soc-edit-input" type="time" id="me-start"></div>
            <div class="soc-edit-field"><label class="soc-edit-label" for="me-end">Ends (optional)</label>
              <input class="soc-edit-input" type="time" id="me-end"></div>
          </div>
          <div class="soc-edit-field"><label class="soc-edit-label" for="me-location">Where?</label>
            <input class="soc-edit-input" type="text" id="me-location" maxlength="100" placeholder="Field, gym, address…"></div>
          <div class="soc-edit-field"><label class="soc-edit-label" for="me-notes">Notes (optional)</label>
            <textarea class="soc-edit-input soc-edit-textarea" id="me-notes" rows="2" maxlength="500" placeholder="Bring shin guards, ride home, etc."></textarea></div>
          <div class="soc-edit-note-banner">📅 Saving puts this on your Calendar automatically.</div>
        </div>
        <div class="soc-edit-footer">
          <div class="soc-edit-save-msg" id="me-msg" style="display:none"></div>
          ${editing ? '<button class="soc-edit-cancel-btn my-delete-btn" id="me-delete" type="button">Delete</button>' : ''}
          <button class="soc-edit-cancel-btn" id="me-cancel" type="button">Cancel</button>
          <button class="soc-edit-save-btn" id="me-save" type="button">${editing ? 'Save changes' : 'Add event'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('soc-popup-open'));

    const $ = id => overlay.querySelector('#' + id);
    // Values are set as DOM properties (not interpolated into the markup) so
    // a name containing quotes can't break out of an attribute.
    $('me-type').value      = ev?.type || 'practice';
    $('me-title').value     = ev?.title || '';
    $('me-opponent').value  = ev?.opponent || '';
    $('me-repeat').value    = ev?.repeat || 'once';
    $('me-date').value      = ev?.date || localYmd(new Date());
    $('me-enddate').value   = ev?.endDate || '';
    $('me-start').value     = ev?.startTime || '';
    $('me-end').value       = ev?.endTime || '';
    $('me-location').value  = ev?.location || '';
    $('me-notes').value     = ev?.notes || '';
    overlay.querySelectorAll('#me-days input').forEach(cb => { cb.checked = !!ev?.days?.includes(cb.value); });

    function syncVisibility() {
      const weekly = $('me-repeat').value === 'weekly';
      $('me-date-field').style.display = weekly ? 'none' : '';
      $('me-weekly-fields').style.display = weekly ? '' : 'none';
      const game = ['game', 'match'].includes($('me-type').value);
      $('me-opp-field').style.display = game ? '' : 'none';
    }
    $('me-repeat').addEventListener('change', syncVisibility);
    $('me-type').addEventListener('change', syncVisibility);
    syncVisibility();

    const close = () => { overlay.classList.remove('soc-popup-open'); setTimeout(() => overlay.remove(), 260); };
    const showMsg = (text, ok) => {
      const m = $('me-msg');
      m.textContent = text; m.style.color = ok ? '#2e7d32' : '#c0392b'; m.style.display = 'block';
    };
    $('me-close').addEventListener('click', close);
    $('me-cancel').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // A failed save must say so — api() here returns null on any non-2xx and
    // would swallow the server's reason, so this uses fetch directly.
    async function send(method, url, body) {
      const r = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Something went wrong — please try again.');
      return data;
    }
    async function refreshEverywhere() {
      await loadSoccerSchedule();
      // The server just wrote calendar entries — pull them into the Calendar panel.
      if (typeof loadCalendarEvents === 'function') {
        await loadCalendarEvents();
        if (typeof renderCalendar === 'function') renderCalendar();
        if (typeof renderUpcoming === 'function') renderUpcoming();
      }
    }

    $('me-save').addEventListener('click', async () => {
      const weekly = $('me-repeat').value === 'weekly';
      const body = {
        type: $('me-type').value, title: $('me-title').value, opponent: $('me-opponent').value,
        repeat: $('me-repeat').value, startTime: $('me-start').value, endTime: $('me-end').value,
        location: $('me-location').value, notes: $('me-notes').value,
      };
      if (weekly) {
        body.days = [...overlay.querySelectorAll('#me-days input:checked')].map(cb => cb.value);
        body.endDate = $('me-enddate').value;
      } else {
        body.date = $('me-date').value;
      }
      const btn = $('me-save'); btn.disabled = true;
      try {
        await send(editing ? 'PUT' : 'POST', editing ? `/api/people/my-schedule/${encodeURIComponent(ev.id)}` : '/api/people/my-schedule', body);
        showMsg('✓ Saved — it\'s on your calendar.', true);
        await refreshEverywhere();
        setTimeout(close, 700);
      } catch (e) {
        showMsg(e.message, false);
        btn.disabled = false;
      }
    });

    $('me-delete')?.addEventListener('click', async () => {
      if (!confirm('Delete this event? It will also come off your calendar.')) return;
      try {
        await send('DELETE', `/api/people/my-schedule/${encodeURIComponent(ev.id)}`);
        await refreshEverywhere();
        close();
      } catch (e) { showMsg(e.message, false); }
    });
  }

  // "Adam's Team" — the People tab is the student's own team page now (their
  // support people + their sport schedule), so it carries their first name.
  function applyTeamTabName(user) {
    const first = String(user?.name || '').trim().split(/\s+/)[0];
    const label = first ? `${first}'s Team` : 'My Team';
    const tab = document.querySelector('.htv-tab[data-tab="people"]');
    if (tab) tab.innerHTML = '<i class="ti ti-users" aria-hidden="true"></i> ' + esc(label);
    const mob = document.querySelector('.mob-nav-btn[data-tab="people"]');
    if (mob) {
      mob.setAttribute('aria-label', label);
      mob.title = label;
      const l = mob.querySelector('.mob-nav-label');
      if (l) l.textContent = label;
    }
  }

  // Task list (Canvas assignments due in next 7 days). This panel is meant to
  // be a light reference, not an alert — a disconnected Canvas account or a
  // transient fetch hiccup is routine, not something to flag as an error (see
  // ysc-mission-and-philosophy skill: no alarmist tone for routine gaps).
  // api() (public/timer.js) throws on any non-2xx response rather than
  // returning null, so this needs a real try/catch — an uncaught rejection
  // here used to leave the panel stuck on "Loading…" indefinitely.
  async function loadTasks() {
    const el = document.getElementById('htv-tasks-body');
    if (!el) return;
    el.innerHTML = '<div class="htv-empty-state" style="padding:10px">Loading…</div>';

    try {
      // Load completed state from prefs
      const prefs = await api('/api/prefs');
      _tasksCompleted = prefs?.tasksCompleted || {};

      const data = await (window.getCanvasAssignments ? window.getCanvasAssignments().catch(() => null) : api('/api/canvas/assignments'));
      // api() returns null (not a throw) on a non-ok response, including
      // 428 Canvas-not-connected — without this check, data.filter() below
      // throws a TypeError whose message never matches the '428' check in
      // the catch block, so it fell through to the generic "not available"
      // text instead of the correct "Connect Canvas" prompt.
      if (!data) throw new Error('428');

      const now  = new Date();
      const week = new Date(now.getTime() + 7 * 86400000);
      const upcoming = data
        .filter(a => a.due_at && new Date(a.due_at) >= now && new Date(a.due_at) <= week)
        .sort((a, b) => new Date(a.due_at) - new Date(b.due_at))
        .slice(0, 10);

      if (!upcoming.length) {
        el.innerHTML = '<div class="htv-empty-state">All clear! No tasks due in the next 7 days. 🎉</div>';
        return;
      }

      el.innerHTML = upcoming.map(a => {
        const done = !!_tasksCompleted[a.id];
        const cls  = dueCls(a.due_at);
        const safeLabel = esc(a.name || 'Untitled').replace(/"/g, '&quot;');
        return `<div class="htv-task-item">
          <div class="htv-task-check${done ? ' htv-done' : ''}" data-task-id="${a.id}" title="Mark complete">${done ? '✓' : ''}</div>
          <div class="htv-task-text${done ? ' htv-done-text' : ''}">
            <div>${esc(a.name || 'Untitled')}</div>
            <div class="htv-task-course">${esc(a.course_name || '')}</div>
            <div class="htv-task-due ${cls}">${fmtDate(a.due_at)}</div>
          </div>
          <button class="htv-focus-btn" data-label="${safeLabel}" title="Start a 25-min focused work session on this" aria-label="Focus Mode">⚡</button>
        </div>`;
      }).join('') + buildStudySchedule(upcoming);

      el.querySelectorAll('.htv-task-check').forEach(box => {
        box.addEventListener('click', () => toggleTask(box.dataset.taskId));
      });

      el.querySelectorAll('.htv-focus-btn, .htv-schedule-focus-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const label = btn.dataset.label || 'Study Session';
          window.timerControl?.startCountdown(25 * 60, label, { focusMode: true });
          // Switch button state briefly
          const orig = btn.innerHTML;
          btn.innerHTML = '✓ Started!';
          btn.disabled = true;
          setTimeout(() => { btn.innerHTML = orig; btn.disabled = false; }, 3000);
        });
      });
    } catch (e) {
      // 428 = Canvas not connected (routes/canvas.js) — same distinction the
      // Growth-tab coaching refresh already makes on this status code.
      el.innerHTML = e.message === '428'
        ? '<div class="htv-empty-state">Connect Canvas (sidebar) to see assignments here.</div>'
        : '<div class="htv-empty-state">Assignments aren\'t available right now.</div>';
    }
  }

  function buildStudySchedule(upcoming) {
    if (!upcoming?.length) return '';
    const todayStr = new Date().toISOString().slice(0, 10);

    // Get today's soccer events
    const todayPractice = _soccerData?.schedule?.find(s => {
      const d = soccerEventDate(s);
      return d && d.toISOString().slice(0, 10) === todayStr;
    });

    // Pick top 3 tasks by urgency
    const urgent = upcoming.slice(0, 3);

    const practiceHtml = todayPractice
      ? `<div class="htv-schedule-practice">⚽ Practice today at ${esc(todayPractice.time || '?')} — ${esc(todayPractice.location || '')}</div>`
      : '';

    const blocks = urgent.map((a, i) => {
      const name = esc(a.name || 'Assignment');
      const course = a.course_name ? ` · ${esc(a.course_name)}` : '';
      const safeLabel = (a.name || 'Assignment').replace(/"/g, '&quot;');
      return `<div class="htv-schedule-block">
        <div class="htv-schedule-block-num">${i + 1}</div>
        <div class="htv-schedule-block-info">
          <div class="htv-schedule-block-name">${name}</div>
          <div class="htv-schedule-block-meta">25 min focus session${course}</div>
        </div>
        <button class="htv-schedule-focus-btn" data-label="${safeLabel}">⚡ Start</button>
      </div>`;
    }).join('');

    return `<div class="htv-study-schedule">
      <div class="htv-schedule-title">📅 Today's Study Plan</div>
      ${practiceHtml}
      <div class="htv-schedule-desc">Suggested 25-minute focus sessions based on your upcoming work:</div>
      ${blocks}
    </div>`;
  }

  async function toggleTask(id) {
    _tasksCompleted[id] = !_tasksCompleted[id];
    await api('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tasksCompleted: _tasksCompleted }) });
    loadTasks();
  }

  // Recovery Plan invite (Assignments Due column) — a calm, single-line
  // nudge, not an itemized "here's what you're missing" list. Same
  // past-due/unsubmitted filter the old list-style version used; only the
  // presentation changed. openRecoveryPlan()/#htv-recovery-overlay/the
  // /api/chat/recovery-plan backend are untouched — this only changes how
  // a student discovers the feature.
  async function loadRecoveryInvite() {
    const el = document.getElementById('htv-recovery-invite');
    if (!el) return;
    el.innerHTML = '';

    const data = await (window.getCanvasAssignments ? window.getCanvasAssignments().catch(() => null) : api('/api/canvas/assignments'));
    if (!data) return;

    const now     = new Date();
    const missing = data.filter(a => {
      if (!a.due_at || new Date(a.due_at) >= now) return false;
      const s = a.submission?.workflow_state;
      return !s || s === 'unsubmitted' || s === 'not_graded';
    });
    if (!missing.length) return;

    const toAssign = a => ({ name: a.name || 'Untitled Assignment', course: a.course_name || '', url: a.html_url || '', due: a.due_at || '' });

    if (missing.length === 1) {
      const assign = toAssign(missing[0]);
      el.innerHTML = `<a href="#" class="htv-recovery-invite-link">One assignment could use a plan — want help catching up?</a>`;
      el.querySelector('.htv-recovery-invite-link').addEventListener('click', e => {
        e.preventDefault();
        openRecoveryPlan(assign);
      });
      return;
    }

    el.innerHTML = `<a href="#" class="htv-recovery-invite-link">A few assignments could use a plan — want help catching up?</a>`;
    el.querySelector('.htv-recovery-invite-link').addEventListener('click', e => {
      e.preventDefault();
      // Reveal a lightweight picker in place — only after the student opts
      // in, not enumerated up front.
      el.innerHTML = missing.map((a, i) => {
        const label = a.course_name ? `${a.name || 'Untitled Assignment'} — ${a.course_name}` : (a.name || 'Untitled Assignment');
        return `<a href="#" class="htv-recovery-invite-pick" data-idx="${i}">${esc(label)}</a>`;
      }).join('');
      el.querySelectorAll('.htv-recovery-invite-pick').forEach(link => {
        link.addEventListener('click', e => {
          e.preventDefault();
          openRecoveryPlan(toAssign(missing[Number(link.dataset.idx)]));
        });
      });
    });
  }

  // ── Recovery Plan Modal ───────────────────────────────────────────────────
  // Exposed for app.js's recovery-invite chat bubble (renderChatOpener) —
  // the overlay/backend this opens are untouched, only the entry point moved
  // from a Today-tab link to a Home chat bubble.
  window.openRecoveryPlan = openRecoveryPlan;
  async function openRecoveryPlan(assign) {
    const overlay = document.getElementById('htv-recovery-overlay');
    if (!overlay) return;
    document.getElementById('htv-recovery-title').textContent = assign.name || 'Assignment';
    document.getElementById('htv-recovery-course').textContent = assign.course ? `${assign.course}${assign.due ? ' · was due ' + new Date(assign.due).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}` : '';
    document.getElementById('htv-recovery-body').innerHTML = `<div class="htv-recovery-loading"><div class="htv-recovery-spinner"></div>Generating your recovery plan…</div>`;
    overlay.style.display = 'flex';

    try {
      const resp = await fetch('/api/chat/recovery-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: assign.name,
          course: assign.course,
          due: assign.due,
          studentName: _user?.name || '',
        }),
      });
      const data = await resp.json();
      let bodyHtml = '';
      if (data.steps?.length) {
        bodyHtml += '<div class="htv-recovery-steps">';
        for (const s of data.steps) {
          bodyHtml += `<div class="htv-recovery-step"><div class="htv-recovery-step-header"><span class="htv-recovery-step-num">Step ${s.step}</span><span class="htv-recovery-step-time">⏱ ${esc(s.time)}</span></div><div class="htv-recovery-step-action">${esc(s.action)}</div></div>`;
        }
        bodyHtml += '</div>';
        if (data.bestTime) {
          bodyHtml += `<div class="htv-recovery-meta"><strong>Best time today:</strong> ${esc(data.bestTime)}</div>`;
        }
        if (data.encouragement) {
          bodyHtml += `<div class="htv-recovery-encourage">${esc(data.encouragement)}</div>`;
        }
      } else {
        bodyHtml = '<div style="color:#dc2626">Could not generate plan. Please try again.</div>';
      }
      if (assign.url) {
        bodyHtml += `<a class="htv-canvas-link" href="${esc(assign.url)}" target="_blank" rel="noopener">📚 Open Assignment in Canvas →</a>`;
      }
      document.getElementById('htv-recovery-body').innerHTML = bodyHtml;
    } catch (err) {
      console.error('[recovery-plan]', err);
      document.getElementById('htv-recovery-body').innerHTML = '<div style="color:#dc2626">Could not generate plan. Please try again.</div>';
    }
  }

  // ── PEOPLE TAB ────────────────────────────────────────────────────────────
  async function loadPeople() {
    const el = document.getElementById('htv-people-body');
    if (!el) return;
    el.innerHTML = '<div class="htv-empty-state">Loading…</div>';
    const data = await api('/api/people/support-team');
    _teamMembers = data?.members || [];
    renderPeopleList();
  }

  // Safety-net poll for the People tab's availability dots. The
  // ysc:availability_update SSE push (below) delivers this instantly when
  // the connection is healthy, but a real two-device pilot-day test found
  // it can silently fail to update an already-open People tab on mobile —
  // the connection can die without the client ever seeing an error, with
  // no way today to tell from the phone alone. This closes that gap within
  // one poll interval regardless of SSE's connection state, without
  // replacing SSE (which still wins on latency when it's working). Scoped
  // to only run while the People tab is the active pane (see switchTab).
  function startPeoplePoll() {
    stopPeoplePoll();
    _peoplePollTimer = setInterval(pollAvailability, 25000);
  }

  function stopPeoplePoll() {
    if (_peoplePollTimer) { clearInterval(_peoplePollTimer); _peoplePollTimer = null; }
  }

  async function pollAvailability() {
    const data = await api('/api/people/support-team').catch(() => null);
    const members = data?.members;
    if (!members) return;
    const changed = members.length !== _teamMembers.length || members.some(m => {
      const existing = _teamMembers.find(x => x.id === m.id);
      return !existing || existing.availability !== m.availability;
    });
    _teamMembers = members;
    if (changed) renderPeopleList();
  }

  function renderPeopleList() {
    const el = document.getElementById('htv-people-body');
    if (!el) return;
    if (!_teamMembers.length) {
      el.innerHTML = '<div class="htv-empty-state">No support team members added yet.</div>';
      return;
    }
    el.innerHTML = _teamMembers.map(m => {
      const avatarInitials = m.initials || m.name[0] || '?';
      const color          = m.color || '#0D1B8E';
      const avail          = m.availability || 'offline';
      const availLabel     = avail === 'available' ? 'Available now — good time to reach out'
                           : avail === 'busy'      ? 'Busy right now — try later or send a message'
                           :                         'Availability not set';
      const subject    = encodeURIComponent(`Hello from a Student`);
      const body       = encodeURIComponent(`Hi ${m.name},\n\n`);
      const mailtoHref = m.email ? `mailto:${m.email}?subject=${subject}&body=${body}` : '#';

      // Show Slack button when there's any chance we can reach them on Slack
      const slackBtn = m.hasSlack
        ? `<button class="htv-msg-btn htv-msg-slack" data-member-id="${esc(m.id)}" data-member-name="${esc(m.name)}" data-member-email="${esc(m.email || '')}" title="Open Slack DM with ${esc(m.name)}">
             <svg width="12" height="12" viewBox="0 0 54 54"><path fill="#fff" d="M13.5 34.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0-6H4.5a4.5 4.5 0 010-9h9v9zM19.5 13.5a4.5 4.5 0 119 0v9h-9v-9zm6 4.5H34.5a4.5 4.5 0 010 9h-9v-9zM40.5 19.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0 6H49.5a4.5 4.5 0 010 9h-9v-9zM34.5 40.5a4.5 4.5 0 11-9 0v-9h9v9zm-6-4.5H19.5a4.5 4.5 0 010-9h9v9z"/></svg>
             Message
           </button>`
        : '';
      const emailBtn = m.email
        ? `<a class="htv-msg-btn htv-msg-email" href="${mailtoHref}" title="Send email to ${esc(m.name)}"><i class="ti ti-mail" aria-hidden="true"></i> Email</a>`
        : '';

      return `<div class="htv-person-item">
        <div class="htv-avatar-wrap">
          <div class="htv-avatar" style="background:${esc(color)}">${esc(avatarInitials)}</div>
          <div class="htv-avail-dot htv-avail-${avail}" data-avail="${avail}" data-avail-label="${esc(availLabel)}" data-member-id="${esc(m.id)}"></div>
        </div>
        <div class="htv-person-info">
          <div class="htv-person-name">${esc(m.name)}</div>
          <div class="htv-person-role">${esc(m.role || '')}</div>
        </div>
        <div class="htv-person-actions">${slackBtn}${emailBtn}</div>
        <div class="htv-person-feedback" id="htv-feedback-${esc(m.id)}"></div>
      </div>`;
    }).join('');

    // Availability dot tooltip
    el.querySelectorAll('.htv-avail-dot').forEach(dot => {
      dot.addEventListener('mouseenter', e => showTooltip(e, dot.dataset.availLabel));
      dot.addEventListener('mouseleave', hideTooltip);
    });

    // Slack Message button — opens DM in the Slack panel
    el.querySelectorAll('.htv-msg-btn.htv-msg-slack[data-member-id]').forEach(btn => {
      btn.addEventListener('click', () => openTeacherDm(btn));
    });
  }

  async function openTeacherDm(btn) {
    const memberId    = btn.dataset.memberId;
    const memberName  = btn.dataset.memberName;
    const memberEmail = btn.dataset.memberEmail;
    const feedbackEl  = document.getElementById(`htv-feedback-${memberId}`);

    // Diagnostic log so we can see exactly what data we're working with
    console.log('[People:openTeacherDm] Button clicked');
    console.log('[People:openTeacherDm] memberId:', memberId);
    console.log('[People:openTeacherDm] memberName:', memberName);
    console.log('[People:openTeacherDm] memberEmail:', memberEmail);
    console.log('[People:openTeacherDm] member data:', _teamMembers.find(m => m.id === memberId));

    // Loading state
    const origHTML = btn.innerHTML;
    btn.disabled = true;
    btn.style.opacity = '0.7';
    btn.textContent = 'Opening…';
    if (feedbackEl) feedbackEl.innerHTML = '';

    console.log('[People:openTeacherDm] Step 1 — calling /api/people/open-dm/' + memberId);

    let result;
    try {
      const resp = await fetch(`/api/people/open-dm/${memberId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      result = await resp.json();
    } catch (e) {
      console.error('[People:openTeacherDm] Fetch failed:', e);
      result = { error: 'Network error. Please try again.' };
    }

    console.log('[People:openTeacherDm] Step 1 result:', result);

    btn.disabled = false;
    btn.style.opacity = '';
    btn.innerHTML = origHTML;

    // ── Case 1: DM requires additional Slack permissions ─────────────────
    if (result?.needsAuth) {
      console.log('[People:openTeacherDm] Step 2 — needsAuth: showing info prompt');
      if (feedbackEl) {
        feedbackEl.innerHTML = `
          <div class="htv-dm-feedback htv-dm-auth">
            <span>Direct messages are sent via the YSC Bot. Your message will appear from the school account.</span>
          </div>`;
      }
      return;
    }

    // ── Case 2: Success — navigate to DM channel ──────────────────────────
    if (result?.ok && result?.channelId) {
      console.log('[People:openTeacherDm] Step 2 — success, channelId:', result.channelId);

      // Step 2: navigate to Slack panel
      console.log('[People:openTeacherDm] Step 3 — calling setClassicPanel(slack)');
      if (window.setClassicPanel) {
        window.setClassicPanel('slack');
      } else {
        console.warn('[People:openTeacherDm] setClassicPanel not available');
      }

      // Step 3: select the DM channel (small delay to let panel render)
      console.log('[People:openTeacherDm] Step 4 — selecting channel', result.channelId);
      setTimeout(async () => {
        if (window.selectChannel) {
          await window.selectChannel(result.channelId, memberName);
          // Fix channel header to say "DM" not "#Name"
          const header = document.getElementById('current-channel-name');
          if (header) header.textContent = `DM · ${memberName}`;
          console.log('[People:openTeacherDm] Step 4 — channel selected');
        } else {
          console.warn('[People:openTeacherDm] selectChannel not available');
        }

        // Step 4: pre-fill message input
        console.log('[People:openTeacherDm] Step 5 — pre-filling message input');
        const input = document.getElementById('slack-message-input');
        if (input) {
          const firstName = memberName.replace(/^(Mr\.|Ms\.|Mrs\.|Dr\.)\s*/i, '').split(' ')[0];
          input.value = `Hi ${firstName}, `;
          // Step 5: focus input
          input.focus();
          // Move cursor to end
          try { input.selectionStart = input.selectionEnd = input.value.length; } catch {}
          console.log('[People:openTeacherDm] Step 5 — input pre-filled and focused');
        } else {
          console.warn('[People:openTeacherDm] slack-message-input not found');
        }
      }, 150);

      return;
    }

    // ── Case 3: Error — show fallback ─────────────────────────────────────
    console.warn('[People:openTeacherDm] Error or unexpected response:', result);
    const errMsg  = result?.error || 'Unable to open Slack right now.';
    const emailHtml = memberEmail
      ? ` <a class="htv-dm-email-link" href="mailto:${esc(memberEmail)}">Email ${esc(memberName)}</a>`
      : '';

    if (feedbackEl) {
      feedbackEl.innerHTML = `
        <div class="htv-dm-feedback htv-dm-error">
          <span>${esc(errMsg)}</span>${emailHtml}
          <button class="htv-dm-retry-btn" onclick="this.closest('.htv-person-item').querySelector('.htv-msg-btn.htv-msg-slack').click()">Try Again</button>
        </div>`;
    }
  }

  // ── GOALS TAB ─────────────────────────────────────────────────────────────
  // ── GROWTH TAB ───────────────────────────────────────────────────────────

  function loadGrowth() {
    if (typeof window.loadGrowthData === 'function') window.loadGrowthData();
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────
  const _tooltipEl = (() => {
    const t = document.createElement('div');
    t.className = 'htv-avail-tooltip';
    t.id = 'htv-avail-tooltip';
    document.body.appendChild(t);
    return t;
  })();

  function showTooltip(e, label) {
    _tooltipEl.textContent = label;
    _tooltipEl.style.left  = (e.clientX + 12) + 'px';
    _tooltipEl.style.top   = (e.clientY - 24) + 'px';
    _tooltipEl.classList.add('htv-tooltip-show');
  }
  function hideTooltip() { _tooltipEl.classList.remove('htv-tooltip-show'); }

  // ── SSE listeners ─────────────────────────────────────────────────────────
  function isTabViewVisible() {
    const el = document.getElementById('hub-tab-view');
    return el && el.style.display !== 'none';
  }

  document.addEventListener('ysc:broadcast', e => {
    _broadcastData = e.detail;
    if (isTabViewVisible()) renderBroadcastWidget();
  });

  document.addEventListener('ysc:broadcast_clear', () => {
    _broadcastData = null;
    if (isTabViewVisible()) renderBroadcastWidget();
  });

  document.addEventListener('ysc:availability_update', e => {
    const members = e.detail?.members;
    if (!members) return;
    // Update local team data
    members.forEach(m => {
      const existing = _teamMembers.find(x => x.id === m.id);
      if (existing) existing.availability = m.availability;
    });
    // Re-render regardless of which pane is currently active — gating this
    // on htv-pane-active left the People list showing a stale status until
    // the student manually switched tabs or reloaded (pilot-day report: a
    // teacher's status change didn't appear live). Still guarded on
    // _teamMembers already having been loaded once this session, so this
    // can't clobber the "Select the People tab to load your team" empty
    // state for a student who hasn't opened People yet.
    if (_teamMembers.length) renderPeopleList();
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('ysc:sessionReady', e => {
    _user = e.detail;
    applyTeamTabName(_user);
    // Warm the teacher directory (Canvas) so the AI Assistant knows the student's teachers from the first message.
    fetch('/api/people/my-teachers').catch(() => {});
    // Expose email globally so other scripts can access it
    window.studentEmail = _user.email;
    // Active-broadcast-on-load is handled by the SSE connection (app.js's
    // connectStudentEvents() -> GET /api/tracker/events), which pushes the
    // current broadcast immediately on connect and dispatches 'ysc:broadcast'
    // (listened for below) — no separate fetch needed here. This used to
    // also fetch /api/teacher/broadcast, but that route is teacher-only
    // (routes/teacher.js's requireTeacher), so it 403'd on every single
    // student page load and never actually populated _broadcastData.

    // ── Dedicated mentor chat socket ─────────────────────────────────────────
    // Separate from SlackBadge to avoid timing issues with shared socket.
    const _mentorSocket = io();
    _mentorSocket.on('connect', () => {
      console.log('[MentorChat] Socket connected, registering:', _user.email);
      _mentorSocket.emit('registerStudent', { email: _user.email });
    });
    _mentorSocket.on('newMentorMessage', data => {
      console.log('[MentorChat] newMentorMessage received:', data);
      const widget = document.getElementById('mentor-chat-messages');
      if (!widget) {
        console.error('[MentorChat] mentor-chat-messages container not found');
        return;
      }
      const welcomeEl = document.getElementById('mentor-welcome');
      if (welcomeEl) welcomeEl.style.display = 'none';
      appendMentorMsg('mentor', data.text, data.mentorName, data.id, data.timestamp);
      showMentorUnreadBadge();
    });
    _mentorSocket.on('disconnect', () => {
      console.log('[MentorChat] Socket disconnected');
    });
    _mentorSocket.on('mentorPresenceUpdate', data => {
      updatePresenceUI(data.online === true);
    });
    _mentorSocket.on('siteBlocked', (data) => {
      if (!window.blockedDomains) window.blockedDomains = [];
      window.blockedDomains.push(data.domain);
      _showBlockedNotice(data.domain, data.reason);
    });
    _mentorSocket.on('siteUnblocked', (data) => {
      if (window.blockedDomains) {
        window.blockedDomains = window.blockedDomains.filter(d => d !== data.domain);
      }
    });
    _mentorSocket.on('mentorWeeklyMessage', () => {
      loadMentorBeliefMessage();
    });
    // Load blocked sites on connect
    fetch('/api/student/blocked-sites', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.sites?.length) {
          window.blockedDomains = d.sites.map(s => s.domain);
          console.log('[WebBlock] Blocked domains loaded:', window.blockedDomains);
        }
      })
      .catch(() => {});

    // Real-time mentor assignment — update the welcome widget name immediately
    if (typeof window.SlackBadge?.onEvent === 'function') {
      window.SlackBadge.onEvent('mentorAssigned', data => {
        console.log('[MentorChat] mentorAssigned received:', data);
        window.assignedMentorName  = data.mentorName  || 'Your Mentor';
        window.assignedMentorEmail = data.mentorEmail || '';
        const nameEl = document.getElementById('mentor-welcome-name');
        if (nameEl) nameEl.textContent = data.mentorName || 'Your Mentor';
      });
    }
    // Load today data now that auth is confirmed
    loadToday();
  });

  document.addEventListener('DOMContentLoaded', () => {
    // UI setup only — data loading waits for ysc:sessionReady

    // Tab nav
    document.querySelectorAll('.htv-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        showTabView();
        switchTab(btn.dataset.tab);
      });
    });


    // Recovery modal close
    const overlay = document.getElementById('htv-recovery-overlay');
    const closeBtn = document.getElementById('htv-recovery-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
    if (overlay)  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.style.display = 'none'; });

  });

  // ── TODAY — Slack preview (column 1) ──────────────────────────────────────
  async function loadTodaySlackPreview() {
    const el = document.getElementById('htv-today-slack');
    if (!el) return;
    try {
      const data = await api('/api/slack-badge/poll');
      if (!data || (data.total === 0 && !data.dmNotifications?.length)) {
        el.innerHTML = '<div class="today-slack-empty">No new messages</div>';
        return;
      }
      const dms = (data.dmNotifications || []).slice(0, 5);
      if (!dms.length) {
        el.innerHTML = `<div class="today-slack-empty">${data.total} new message${data.total !== 1 ? 's' : ''}</div>`;
        return;
      }
      el.innerHTML = dms.map(dm => `
        <div class="today-slack-item" data-channel="${esc(dm.channelId)}">
          <div class="today-slack-channel-row">
            <span class="today-slack-channel">${esc(dm.senderName || 'DM')}</span>
            <span class="today-slack-badge">1</span>
          </div>
          <div class="today-slack-preview">${esc((dm.preview || 'New message').slice(0, 60))}</div>
        </div>
      `).join('');
      el.querySelectorAll('.today-slack-item').forEach(item => {
        item.addEventListener('click', () => {
          const cid = item.dataset.channel;
          if (cid) {
            if (typeof window.setClassicPanel === 'function') window.setClassicPanel('slack');
            setTimeout(() => { if (typeof window.selectChannel === 'function') window.selectChannel(cid, ''); }, 150);
          }
        });
      });
    } catch {
      el.innerHTML = '<div class="today-slack-empty">Something went wrong — tap to try again</div>';
    }
  }

  // ── TODAY — Growth snapshot (column 1) ──────────────────────────────────
  async function loadTodayGrowthSnapshot() {
    const el = document.getElementById('htv-today-growth');
    if (!el) return;
    try {
      const focusData = await api('/api/student/todays-focus');

      const items = [];

      if (focusData?.focus) {
        items.push({
          label: focusData.focus.label || "Today's focus",
          sub:   (focusData.day && focusData.date) ? `${focusData.day} · ${focusData.date}` : null,
          text:  focusData.focus.text,
        });
      }

      // Additional focus items (weekly goal, soccer, etc.)
      if (focusData?.allItems?.length > 1) {
        focusData.allItems.slice(1).forEach(item => {
          items.push({ label: item.label, text: item.text });
        });
      }

      el.innerHTML = items.map(i => `
        <div class="today-growth-item">
          <div class="today-growth-label">${esc(i.label)}</div>
          ${i.sub ? `<div style="font-family:var(--sp-font-label);font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:var(--sp-muted);margin-bottom:4px;">${esc(i.sub)}</div>` : ''}
          <div class="today-growth-text">${esc(i.text)}</div>
        </div>
      `).join('');
    } catch {
      el.innerHTML = '<div class="today-slack-empty">Something went wrong — tap to try again</div>';
    }
  }

  // ── TODAY — Mentor Chat (column 3) ─────────────────────────────────────
  // Messages go to the student's assigned mentor via Slack DM.
  // Mentor messages are forwarded back in real time via socket.io ('newMentorMessage' event).
  let _mentorInitialized        = false;
  let _mentorSending            = false;
  let _mentorNotificationSent   = false;

  function updatePresenceUI(online) {
    // Home status-strip mentor chip (present regardless of which tab is active)
    const chip     = document.getElementById('home-mentor-chip');
    const chipDot   = document.getElementById('home-mentor-dot');
    const chipLabel = document.getElementById('home-mentor-label');
    if (chip && chipDot && chipLabel) {
      chip.style.display = '';
      chipDot.className   = 'hss-mentor-dot ' + (online ? 'is-online' : 'is-offline');
      chipLabel.textContent = online ? 'Mentor online' : 'Mentor offline';
      const strip = document.getElementById('chat-topbar');
      if (strip) strip.style.display = 'flex';
    }

    const dot   = document.getElementById('mentor-presence-dot');
    const label = document.getElementById('mentor-presence-label');
    const notice = document.getElementById('mentor-unavailable-notice');
    if (!dot || !label) return;
    if (online) {
      dot.className   = 'mentor-presence-dot is-online';
      label.className = 'mentor-presence-label is-online';
      label.textContent = 'Online';
      if (notice) notice.style.display = 'none';
    } else {
      dot.className   = 'mentor-presence-dot is-offline';
      label.className = 'mentor-presence-label is-offline';
      label.textContent = 'Offline';
      if (notice) notice.style.display = 'block';
    }
  }

  // Jump from anywhere (Home mentor chip, links) straight into the Mentor
  // Chat tab and focus the input. Same steps as mobile.js's floating Mentor
  // Chat button. No more expand step — Mentor Chat is always full-height now
  // that it's the tab's only content, not a collapsible column.
  window.openMentorChat = function openMentorChat() {
    showTabView();
    switchTab('today');
    setTimeout(() => document.getElementById('htv-mentor-input')?.focus(), 300);
  };

  async function loadMentorPresence() {
    try {
      const res = await fetch('/api/student/mentor-presence', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      updatePresenceUI(data.online === true);
    } catch { /* silent */ }
  }

  // Signals an unread mentor message on the tab button itself instead of a
  // collapsed-bar badge, now that Mentor Chat has no collapsed state — only
  // relevant while the student isn't already looking at the tab. Cleared in
  // switchTab() the moment they land on it.
  function showMentorUnreadBadge() {
    if (_activeTab === 'today') return;
    document.querySelector('.htv-tab[data-tab="today"]')?.classList.add('htv-tab-unread');
  }

  function initMentorChat() {
    if (_mentorInitialized) return;
    _mentorInitialized = true;
    const input   = document.getElementById('htv-mentor-input');
    const sendBtn = document.getElementById('htv-mentor-send');
    if (!input || !sendBtn) return;

    loadMentorPresence();

    // Show welcome state if no messages are present yet, then load history
    const container = document.getElementById('mentor-chat-messages');
    if (container && container.children.length === 0) {
      showMentorWelcome();
      loadMentorInfo();
    }
    loadConversationHistory();

    // newMentorMessage listener is registered in ysc:sessionReady via the dedicated mentor socket

    function send() {
      const text = input.value.trim();
      if (!text || _mentorSending) return;
      const welcomeEl = document.getElementById('mentor-welcome');
      if (welcomeEl) welcomeEl.style.display = 'none';
      input.value = '';
      appendMentorMsg('user', text);
      sendMentorMessage(text);
    }
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  }

  function showMentorWelcome() {
    const container = document.getElementById('mentor-chat-messages');
    if (!container || document.getElementById('mentor-welcome')) return;
    const div = document.createElement('div');
    div.id = 'mentor-welcome';
    div.className = 'mentor-welcome';
    div.innerHTML =
      '<div class="mentor-welcome-label">// Your mentor</div>' +
      '<div class="mentor-welcome-name" id="mentor-welcome-name">Loading...</div>' +
      '<div class="mentor-welcome-text">Your mentor can send you messages here. You can also write to them directly below.</div>';
    container.insertBefore(div, container.firstChild);
  }

  async function loadMentorInfo() {
    try {
      const res = await fetch('/api/student/my-mentor');
      if (!res.ok) return;
      const data = await res.json();
      window.assignedMentorName  = data.mentor?.name  || 'Your Mentor';
      window.assignedMentorEmail = data.mentor?.email || '';
      const nameEl = document.getElementById('mentor-welcome-name');
      if (nameEl) nameEl.textContent = data.mentor?.name || 'Your mentor will be here soon';
      // Collapsed-bar label — first name only, matching today's broader
      // "address staff by first name" convention (routes/chat.js).
      const barNameEl = document.getElementById('mc-mentor-name');
      if (barNameEl && data.mentor?.name) barNameEl.textContent = firstName(data.mentor.name);
    } catch (err) {
      const nameEl = document.getElementById('mentor-welcome-name');
      if (nameEl) nameEl.textContent = 'Mentor';
    }
  }

  async function loadConversationHistory() {
    try {
      const res = await fetch('/api/student/conversation-history');
      if (!res.ok) return;
      const data = await res.json();
      const messages = data.messages || [];

      const widget  = document.getElementById('mentor-chat-messages');
      const welcome = document.getElementById('mentor-welcome');
      if (!widget) return;

      if (!messages.length) {
        if (welcome) welcome.style.display = 'block';
        return;
      }

      if (welcome) welcome.style.display = 'none';
      widget.innerHTML = '';

      const sorted = messages.slice().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      sorted.forEach(msg => displayMentorChatMessage(msg));

      // No real read/unread tracking exists in the data model (checked —
      // there's no seen/lastViewed field anywhere in the mentor conversation
      // store), so this is a heuristic, not a true unread check: if the
      // mentor sent the most recent message, flag it the same non-intrusive
      // way as a live message, rather than auto-expanding on every page
      // load until the student replies (which would defeat "collapsed by
      // default" for any returning student with an open conversation).
      if (sorted[sorted.length - 1]?.role === 'mentor') showMentorUnreadBadge();

      // Scroll: jump to today's divider if it exists, otherwise scroll to bottom
      const dividers = widget.querySelectorAll('.mc-day-divider');
      if (dividers.length > 1) {
        const last = dividers[dividers.length - 1];
        const today = new Date().toISOString().split('T')[0];
        if (last.dataset.date === today) {
          last.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          widget.scrollTop = widget.scrollHeight;
        }
      } else {
        widget.scrollTop = widget.scrollHeight;
      }
    } catch (err) {
      console.warn('[MentorChat] Could not load conversation history:', err.message);
    }
  }

  async function sendMentorMessage(message) {
    _mentorSending = true;
    const sendBtn = document.getElementById('htv-mentor-send');
    if (sendBtn) sendBtn.disabled = true;
    try {
      // Primary: Redis-first direct save + teacher hub broadcast
      const res = await fetch('/api/mentor/student-message', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ message }),
      });
      if (res.ok) {
        const data = await res.json();
        // Also notify mentor via Slack (best-effort, ignore failure)
        fetch('/api/mentor/send-message', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ message }),
        }).then(r => r.ok ? r.json() : {}).then(d => {
          const mentorName = d.mentorName || 'your mentor';
          if (!_mentorNotificationSent) {
            appendMentorAutoResponse(mentorName);
            _mentorNotificationSent = true;
          }
        }).catch(() => {});
      } else {
        appendMentorMsg('ai', "Couldn't reach the server — please try again in a moment.");
      }
    } catch (err) {
      console.error('[MentorChat] Failed to send message:', err);
      appendMentorMsg('ai', "Couldn't reach the server — please try again in a moment.");
    } finally {
      _mentorSending = false;
      if (sendBtn) sendBtn.disabled = false;
    }
  }

  function appendMentorAutoResponse(mentorName) {
    const container = document.getElementById('mentor-chat-messages');
    if (!container) return;
    const wrap = document.createElement('div');
    wrap.className = 'htv-mentor-msg htv-mentor-msg-ai';
    const label = document.createElement('div');
    label.className = 'htv-mentor-label';
    label.textContent = 'Mentor Chat';
    const bubble = document.createElement('div');
    bubble.className = 'htv-mentor-bubble';
    const textEl = document.createElement('div');
    textEl.className = 'htv-mentor-bubble-text';
    // Build the message with inline clickable links
    textEl.appendChild(document.createTextNode(`I'll let ${mentorName} know and they'll respond here as soon as they can. While you're waiting, check out the `));
    const chatLink = document.createElement('span');
    chatLink.className = 'htv-mentor-link';
    chatLink.textContent = 'AI Chatbot';
    chatLink.addEventListener('click', () => {
      if (typeof window.openChatHome === 'function') window.openChatHome();
    });
    textEl.appendChild(chatLink);
    textEl.appendChild(document.createTextNode(' for instant help, or head to the '));
    const growthLink = document.createElement('span');
    growthLink.className = 'htv-mentor-link';
    growthLink.textContent = 'Growth tab';
    growthLink.addEventListener('click', () => {
      if (typeof window.switchToHtvTab === 'function') {
        window.switchToHtvTab('growth');
      } else {
        // Show the tab view first then switch
        const tabView = document.getElementById('hub-tab-view');
        if (tabView) tabView.style.display = '';
        document.querySelectorAll('.htv-tab').forEach(b => {
          b.classList.toggle('htv-active', b.dataset.tab === 'growth');
        });
        document.querySelectorAll('.htv-pane').forEach(p => {
          const active = p.id === 'htv-growth';
          p.classList.toggle('htv-pane-active', active);
          p.style.display = active ? 'flex' : 'none';
        });
      }
    });
    textEl.appendChild(growthLink);
    textEl.appendChild(document.createTextNode(" to update this week's goals and objectives."));
    bubble.appendChild(textEl);
    wrap.appendChild(label);
    wrap.appendChild(bubble);
    container.appendChild(wrap);
    scrollMentorBottom();
  }

  // role: 'ai' | 'mentor' | 'user'
  // displayName: mentor's real name (for 'mentor' role only)
  // msgId: optional deduplication key
  function displayMentorChatMessage(msg) {
    const widget = document.getElementById('mentor-chat-messages');
    if (!widget) return;

    const welcome = document.getElementById('mentor-welcome');
    if (welcome) welcome.style.display = 'none';

    if (msg.id && widget.querySelector(`[data-msg-id="${CSS.escape(msg.id)}"]`)) return;

    // Day divider
    const msgDate = msg.date || (msg.timestamp ? msg.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]);
    const lastDivider     = widget.querySelector('.mc-day-divider:last-of-type');
    const lastDividerDate = lastDivider?.dataset?.date;

    if (msgDate !== lastDividerDate) {
      const today     = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      let label;
      if (msgDate === today)          label = 'Today';
      else if (msgDate === yesterday) label = 'Yesterday';
      else                            label = new Date(msgDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

      const divider = document.createElement('div');
      divider.className    = 'mc-day-divider';
      divider.dataset.date = msgDate;
      const line1 = document.createElement('div'); line1.className = 'mc-divider-line';
      const span  = document.createElement('span'); span.className  = 'mc-divider-label'; span.textContent = label;
      const line2 = document.createElement('div'); line2.className = 'mc-divider-line';
      divider.appendChild(line1);
      divider.appendChild(span);
      divider.appendChild(line2);
      widget.appendChild(divider);
    }

    const isFromMentor = msg.role === 'mentor';
    const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const senderLabel = isFromMentor ? (msg.senderName || 'Mentor') : 'You';

    const div = document.createElement('div');
    if (msg.id) div.dataset.msgId = msg.id;
    div.className = 'mc-message ' + (isFromMentor ? 'mc-from-mentor' : 'mc-from-student');

    const meta = document.createElement('div');
    meta.className = 'mc-msg-meta';
    const sender = document.createElement('span'); sender.className = 'mc-msg-sender'; sender.textContent = senderLabel;
    const timeEl = document.createElement('span'); timeEl.className = 'mc-msg-time';   timeEl.textContent = time;
    meta.appendChild(sender);
    meta.appendChild(timeEl);

    const bubble = document.createElement('div');
    bubble.className = 'mc-msg-bubble';
    bubble.innerHTML = window.formatMentorText ? window.formatMentorText(msg.text || '') : '';
    if (!window.formatMentorText) bubble.textContent = msg.text || '';

    div.appendChild(meta);
    div.appendChild(bubble);
    widget.appendChild(div);
    scrollMentorBottom();
  }

  function appendMentorMsg(role, text, displayName, msgId, timestamp) {
    if (role === 'ai') {
      // System/error messages keep the original look — not part of the thread history
      const container = document.getElementById('mentor-chat-messages');
      if (!container) return null;
      if (msgId && container.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`)) return null;
      const wrap   = document.createElement('div');
      wrap.className = 'htv-mentor-msg htv-mentor-msg-ai';
      if (msgId) wrap.dataset.msgId = msgId;
      const labelEl = document.createElement('div'); labelEl.className = 'htv-mentor-label'; labelEl.textContent = 'Mentor Chat';
      const bubble  = document.createElement('div'); bubble.className  = 'htv-mentor-bubble';
      const textEl  = document.createElement('div'); textEl.className  = 'htv-mentor-bubble-text';
      if (window.formatMentorText) textEl.innerHTML = window.formatMentorText(text); else textEl.textContent = text;
      bubble.appendChild(textEl);
      wrap.appendChild(labelEl);
      wrap.appendChild(bubble);
      container.appendChild(wrap);
      scrollMentorBottom();
      return wrap;
    }
    displayMentorChatMessage({ id: msgId, role, text, senderName: displayName, timestamp: timestamp || new Date().toISOString() });
    return null;
  }

  function scrollMentorBottom() {
    const c = document.getElementById('mentor-chat-messages');
    if (c) c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
  }

  // Expose so growth.js can refresh Today's Focus after saving goals
  window.loadTodaysFocus = loadTodayGrowthSnapshot;

})();

// ── Daily AI Game Plan ────────────────────────────────────────────────────────

// Two callers fetch the game plan on Today load — this widget (window 'load')
// and app.js's initChatOpener (ysc:sessionReady). Share a single in-flight
// request between them rather than both hitting the endpoint. The shared promise
// is cleared as soon as it settles, so a later refresh (e.g. after a task
// toggle) still gets fresh data.
function gp_fetchGamePlan() {
  if (!window.__gpInFlight) {
    window.__gpInFlight = fetch('/api/student/game-plan')
      .then(r => { if (!r.ok) throw new Error('Failed'); return r.json(); })
      .finally(() => { window.__gpInFlight = null; });
  }
  return window.__gpInFlight;
}
window.gp_fetchGamePlan = gp_fetchGamePlan;

async function gp_loadGamePlan() {
  const voiceEl      = document.getElementById('gp-voice');
  const tasksEl      = document.getElementById('gp-tasks');
  const conflictEl   = document.getElementById('gp-conflict-bar');
  const weekBarsEl   = document.getElementById('gp-week-bars');
  const canvasListEl = document.getElementById('gp-canvas-list');
  if (!voiceEl) return;

  try {
    const data = await gp_fetchGamePlan();

    // Voice — escape user content, inject nav links FIRST (while the text is
    // still plain — no <strong> tags for a phrase-matching regex to cross),
    // then render **bold** markers afterward. See gp_injectVoiceLinks() for
    // why the ordering matters.
    if (data.aiVoice) {
      const linked = gp_injectVoiceLinks(gp_esc(data.aiVoice));
      const voiced = linked.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--sp-blue);font-weight:600;">$1</strong>');
      voiceEl.innerHTML = '<p>' + voiced + '</p>';
    } else {
      voiceEl.innerHTML = '<p>Make today count.</p>';
    }

    // Tasks — Canvas assignments link to Canvas and support completion toggle.
    // Visual-only restyle (2026-08-27): the click target that used to BE the
    // urgency tag itself is now a separate checkbox-styled span; the tag
    // moved to its own decorative pill next to the task text. Same
    // gp_completeTask()/gp_uncompleteTask() calls, same arguments, same
    // sole clickable elements as before — only which element carries the
    // onclick, and what markup each element renders, changed. The checkbox
    // glyph is a CSS ::before (see .gp-task-check in hub-tabs.css) so it
    // survives gp_completeTask()'s existing textContent swap to
    // "Marking…"/"Tap to retry" untouched.
    if (tasksEl) {
      tasksEl.innerHTML = (data.tasks || []).map((t, i) => {
        const safeTitleAttr = gp_esc(t.label).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
        const safeDueDateAttr = gp_esc(t.dueDate || '');
        const safeId = gp_esc(String(t.id || ''));
        const isCompleted = !!t.completed;
        const linkColor = isCompleted ? '#999' : '#2A2A2A';
        const labelHtml = t.canvasUrl
          ? `<a href="${gp_esc(t.canvasUrl)}" target="_blank" rel="noopener noreferrer" class="gp-task-link" style="text-decoration:${isCompleted ? 'line-through' : 'none'};color:${linkColor};" onmouseover="this.style.color='#C85A2E'" onmouseout="this.style.color='${linkColor}'">${gp_esc(t.label)}<i class="ti ti-external-link" aria-hidden="true" style="font-size:10px;opacity:0.45;vertical-align:1px;margin-left:4px;"></i></a>`
          : `<span class="gp-task-text-plain" style="${isCompleted ? 'text-decoration:line-through;color:#999;' : ''}">${gp_esc(t.label)}</span>`;
        const durTip = t.estimatedMinutes ? ` title="Estimated time" style="cursor:help;"` : '';
        const durHtml = t.estimatedMinutes ? `<span class="gp-task-dur"${durTip}>${t.estimatedMinutes}m</span>` : '';
        let checkHtml, tagInfoHtml;
        if (t.id) {
          if (isCompleted) {
            checkHtml = `<span class="gp-task-check gp-task-check-done">Done&nbsp;<a href="#" onclick="gp_uncompleteTask(event,'${safeId}','${safeTitleAttr}','${safeDueDateAttr}')" style="color:#999;font-size:9px;text-decoration:underline;">undo</a></span>`;
            tagInfoHtml = '';
          } else {
            checkHtml = `<span class="gp-task-check" style="cursor:pointer;" onclick="gp_completeTask(event,'${safeId}','${safeTitleAttr}','${safeDueDateAttr}',this)"></span>`;
            tagInfoHtml = `<span class="gp-task-tag ${gp_esc(t.tagClass || 'gp-tag-week')}">${gp_esc(t.tag)}</span>`;
          }
        } else {
          checkHtml = `<span class="gp-task-check gp-task-check-disabled"></span>`;
          tagInfoHtml = `<span class="gp-task-tag ${gp_esc(t.tagClass || 'gp-tag-week')}">${gp_esc(t.tag)}</span>`;
        }
        return `<div class="gp-task"${isCompleted ? ' style="opacity:0.55;"' : ''}>` +
          `<span class="gp-task-num">${String(i + 1).padStart(2, '0')}</span>` +
          checkHtml +
          `<div class="gp-task-body">` +
            `<div class="gp-task-text">${labelHtml}</div>` +
            tagInfoHtml +
          `</div>` +
          durHtml +
        `</div>`;
      }).join('');
    }

    // Conflict bar
    if (conflictEl) {
      if (data.travelConflict) {
        conflictEl.innerHTML = '<span>⚠ ' + gp_esc(data.travelConflict) + '</span>';
        conflictEl.style.display = 'flex';
        conflictEl.style.flexDirection = 'column';
        conflictEl.style.gap = '0';
        gp_addMentorContact(conflictEl);
      } else {
        conflictEl.style.display = 'none';
      }
    }

    // (The check-in card that used to lead this panel was removed with the
    // daily check-in — moved to the standalone YSC Check-in app.)

    // Weekly load bar chart — Mon–Fri, completion-aware colors
    if (weekBarsEl) {
      const wd = data.weeklyLoadData || [];
      if (data.canvasConnected === false) {
        // Distinct from "genuinely nothing due" below — weeklyLoadData is only
        // ever populated when Canvas is connected (server.js skips building it
        // entirely otherwise), so an empty array here could otherwise silently
        // read as a clean week instead of "we can't check yet."
        weekBarsEl.innerHTML = '<span style="font-family:var(--sp-font-label);font-size:10px;color:var(--sp-muted);">Connect Canvas to see your week</span>';
      } else if (wd.length) {
        const maxTotal = Math.max(1, ...wd.map(d => d.total || 0));
        weekBarsEl.innerHTML = wd.map(d => {
          const total     = d.total     || 0;
          const completed = d.completed || 0;
          const pending   = d.pending   || 0;
          const isEmpty   = total === 0;
          const barH      = Math.max(total > 0 ? Math.round((total / maxTotal) * 48) : 4, 4);
          const doneH     = total > 0 ? Math.round((completed / total) * barH) : 0;
          const pendH     = barH - doneH;

          // Empty days render as a visible --tint track with a 2px ink border
          // (handled on the wrapper below) rather than a bare tint fill, which
          // reads as almost invisible against the white page background —
          // same fix as the Teacher Hub's copy of this chart.
          let barBg;
          if (isEmpty)                               barBg = 'var(--sp-tint)';
          else if (d.isConflict && pending > 0)       barBg = 'var(--sp-coral)';
          else if (d.isConflict)                      barBg = 'var(--sp-muted)';
          else if (d.isToday)                         barBg = 'var(--sp-blue)';
          else if (completed === total && total > 0)  barBg = 'var(--sp-muted)';
          else                                        barBg = 'var(--sp-muted)';

          const countDisplay = d.isConflict && pending > 0 ? '!'
            : total === 0 ? '—'
            : completed === total && total > 0 ? '✓'
            : String(total);
          const countStyle = d.isToday ? 'color:var(--sp-ink);' : (completed === total && total > 0 ? 'color:var(--sp-muted);' : '');
          const barCol = `<div style="display:flex;flex-direction:column;width:100%;height:${barH}px;box-sizing:border-box;${isEmpty ? 'border:2px solid var(--sp-ink);' : ''}">` +
            (doneH > 0 ? `<div style="width:100%;height:${doneH}px;background:var(--sp-yellow);"></div>` : '') +
            (pendH > 0 ? `<div style="width:100%;height:${pendH}px;background:${barBg};"></div>` : '') +
            `</div>`;
          return `<div class="gp-wb">` +
            barCol +
            `<div class="gp-wb-count" style="${countStyle}">${countDisplay}</div>` +
            `<div class="gp-wb-day ${d.isToday ? 'gp-today' : ''}">${gp_esc(d.day)}</div>` +
            `</div>`;
        }).join('');
      } else {
        weekBarsEl.innerHTML = '<span style="font-family:var(--sp-font-label);font-size:10px;color:var(--sp-muted);">No assignments this week</span>';
      }
    }

    // Canvas assignments list — titles link to Canvas, flag conflicts and urgency
    if (canvasListEl) {
      const items = (data.canvasAssignments || []).slice(0, 4);
      const travelDays = data.travelDays || [];
      if (!items.length) {
        canvasListEl.innerHTML = '<div class="gp-canvas-empty">All clear this week</div>';
      } else {
        canvasListEl.innerHTML = items.map(a => {
          const isConflict = travelDays.includes(a.dueDate);
          const isUrgent   = (a.daysUntilDue || 99) <= 1;
          const dueFmt     = isUrgent
            ? (a.daysUntilDue <= 0 ? 'Due today' : 'Due tomorrow')
            : new Date(a.due).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
          const dueClass   = isConflict ? 'gp-conflict-due' : isUrgent ? 'gp-urgent' : '';
          const conflictNote = isConflict ? ' · travel conflict' : '';
          const courseLabel = gp_esc(a.courseCode || a.course || '');
          const titleHtml = a.canvasUrl
            ? `<a href="${gp_esc(a.canvasUrl)}" target="_blank" rel="noopener noreferrer" class="gp-cr-title" onmouseover="this.style.color='var(--sp-blue)'" onmouseout="this.style.color='var(--sp-ink)'">${gp_esc(a.title)}<i class="ti ti-external-link" aria-hidden="true" style="font-size:9px;opacity:0.35;vertical-align:1px;margin-left:3px;"></i></a>`
            : `<span class="gp-cr-title">${gp_esc(a.title)}</span>`;
          return `<div class="gp-canvas-row">` +
            `<span class="gp-cr-course">${courseLabel}</span>` +
            titleHtml +
            `<span class="gp-cr-due ${dueClass}">${gp_esc(dueFmt)}${gp_esc(conflictNote)}</span>` +
            `</div>`;
        }).join('');
      }
    }
  } catch {
    if (voiceEl) voiceEl.innerHTML = '<div class="gp-loading">Something went wrong — tap ↻ to try again</div>';
  }
}

function gp_esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Matched against plain text BEFORE markdown-bold conversion (see caller in
// gp_loadGamePlan) — never against text that may already contain a <strong>
// tag. \*{0,2} tolerates the ** markers the server sometimes wraps around the
// key word of a phrase (e.g. "reach out to your **mentor**"), folding them
// into the link instead of letting a wildcard match cross into/consume a tag,
// which used to corrupt the rendered link (e.g. leaving an orphaned </strong>
// behind — the original bug here).
// A single alternation, replaced in one pass, so no phrase's own inserted
// <a> can ever be re-matched and re-wrapped by a later phrase in the list
// (the same class of bug, just from one pattern's output colliding with
// another's input instead of with a <strong> tag).
// (Check-in phrases were dropped here when the daily check-in moved to the
// standalone YSC Check-in app; the server no longer emits them.)
const GP_VOICE_LINK_RE = /(?<reachMentor>reach out to your \*{0,2}mentor\*{0,2})|(?<contactMentor>contact your \*{0,2}mentor\*{0,2})|(?<updateGoals>update your \*{0,2}goals\*{0,2})/gi;

function gp_injectVoiceLinks(html) {
  // Student-authored text (e.g. their own goal wording) arrives wrapped in
  // \x02...\x03 by the server — pull it out before scanning so these phrase
  // matches can only ever fire on the fixed template language around it, never
  // on words the student typed themselves.
  const protectedText = [];
  const safeHtml = html.replace(/\x02([\s\S]*?)\x03/g, (_, inner) => {
    protectedText.push(inner);
    return `\x02${protectedText.length - 1}\x03`;
  });

  const linked = safeHtml.replace(GP_VOICE_LINK_RE, (match, ...rest) => {
    const groups  = rest[rest.length - 1];
    const handler = groups.updateGoals ? 'gp_goToGrowth' : 'gp_goToMentorChat';
    // Use the actual matched text (with any ** stripped) as the label,
    // rather than a hardcoded string — so it always faithfully reflects
    // what the source said instead of silently dropping/adding "daily".
    const label = match.replace(/\*/g, '');
    return `<a href="#" onclick="${handler}(event)" style="color:var(--sp-blue);text-decoration:underline;cursor:pointer;">${label}</a>`;
  });

  return linked.replace(/\x02(\d+)\x03/g, (_, i) => protectedText[+i]);
}

async function gp_addMentorContact(conflictBar) {
  try {
    const res  = await fetch('/api/student/my-mentor');
    const data = await res.json();
    if (!data.mentor) return;
    const el = document.createElement('div');
    el.style.cssText = 'margin-top:10px;padding-top:10px;border-top:0.5px solid rgba(200,185,138,0.25);display:flex;align-items:center;justify-content:space-between;gap:10px;';
    el.innerHTML =
      `<div style="display:flex;flex-direction:column;gap:2px;">` +
        `<span style="font-family:var(--sp-font-label);font-size:8px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--sp-muted);">Your mentor</span>` +
        `<span style="font-family:var(--sp-font-body);font-size:12px;font-weight:500;color:var(--sp-muted);">${gp_esc(data.mentor.name)}</span>` +
      `</div>` +
      `<a href="#" onclick="gp_goToMentorChat(event)" style="background:var(--sp-yellow);border:2px solid var(--sp-ink);border-radius:22px;padding:6px 12px;font-family:var(--sp-font-label);font-size:9px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--sp-ink);text-decoration:none;cursor:pointer;white-space:nowrap;flex-shrink:0;">Message mentor →</a>`;
    conflictBar.appendChild(el);
  } catch {}
}

function gp_goToMentorChat(e) {
  if (e) e.preventDefault();
  const msgs = document.getElementById('mentor-chat-messages') || document.querySelector('[data-mentor-messages]');
  if (msgs) msgs.scrollIntoView({ behavior: 'smooth' });
  const input = document.getElementById('htv-mentor-input') || document.querySelector('.htv-mentor-input');
  if (input) { setTimeout(() => input.focus(), 300); }
}

function gp_goToChatbot(e) {
  if (e) e.preventDefault();
  if (typeof window.openChatHome === 'function') window.openChatHome();
}

function gp_goToSchedule(e) {
  if (e) e.preventDefault();
  const el = document.getElementById('htv-soccer-body') || document.querySelector('.schedule-item');
  if (el) el.scrollIntoView({ behavior: 'smooth' });
}

async function gp_completeTask(e, assignmentId, title, dueDate, tagEl) {
  if (e) e.preventDefault();
  if (tagEl) { tagEl.textContent = 'Marking…'; tagEl.style.opacity = '0.5'; }
  try {
    const res = await fetch('/api/student/game-plan/complete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ assignmentId: String(assignmentId), completed: true, assignmentTitle: title, dueDate }),
    });
    const data = await res.json();
    if (data.success) gp_loadGamePlan();
    else if (tagEl) { tagEl.textContent = 'Tap to retry'; tagEl.style.opacity = '1'; }
  } catch {
    if (tagEl) { tagEl.textContent = 'Tap to retry'; tagEl.style.opacity = '1'; }
  }
}

async function gp_uncompleteTask(e, assignmentId, title, dueDate) {
  if (e) e.preventDefault();
  try {
    const res = await fetch('/api/student/game-plan/complete', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ assignmentId: String(assignmentId), completed: false, assignmentTitle: title, dueDate }),
    });
    const data = await res.json();
    if (data.success) gp_loadGamePlan();
  } catch {}
}

window.addEventListener('load', function() { gp_loadGamePlan(); });

// (The login "session opening card" — a streak-celebration overlay gated on a
// completed daily check-in — was removed with the daily check-in. The mentor's
// weekly message it also surfaced still shows on the Today tab.)

// ── Blocked-site notice (shown when teacher blocks a site in real time) ────────
function _showBlockedNotice(domain, reason) {
  const notice = document.createElement('div');
  notice.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:var(--sp-ink);border:2px solid var(--sp-coral);border-radius:16px;padding:14px 20px;font-family:var(--sp-font-body);font-size:15px;color:var(--sp-paper);z-index:9999;max-width:400px;text-align:center;box-shadow:var(--sp-shadow);';
  const safeDomain = String(domain).replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const safeReason = String(reason || '').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  notice.innerHTML = `<strong style="color:var(--sp-coral);font-family:var(--sp-font-label);font-size:12px;display:block;margin-bottom:6px;letter-spacing:0.08em;">SITE BLOCKED</strong>${safeDomain} has been blocked by your teacher.${safeReason ? `<br><span style="font-size:13px;color:rgba(255,255,255,.6);">${safeReason}</span>` : ''}`;
  document.body.appendChild(notice);
  setTimeout(() => { if (notice.parentNode) notice.remove(); }, 5000);
}

document.addEventListener('DOMContentLoaded', () => {
  document.body.style.opacity = '1';
});
