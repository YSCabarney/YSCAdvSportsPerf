/* YSC Student Hub — Virtual Meetings / Huddle */
(function () {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────────
  let _user         = null;
  let _huddle       = null;   // current huddle data or null
  let _pollTimer    = null;
  let _notesSaveTimer = null;
  let _wbSaveTimer  = null;
  let _dismissedInvite = null;  // huddleId we dismissed an invite for
  let _summary      = null;   // post-huddle summary
  // What's currently drawn in #htv-meetings ('empty' | 'workspace' | 'summary' |
  // null before the first render). Lets pollMyHuddle()'s 5s tick skip a full
  // rebuild when the huddle state hasn't actually changed since last time.
  let _renderedMode = null;
  // Background refresh timer for the student Class Meetings list — decoupled
  // from the 5s huddle poll on purpose, see refreshStudentZoomLinks().
  let _zoomLinksInterval = null;

  // Platform selection ('slack' | 'zoom' | '')
  let _platform = localStorage.getItem('ysc-meeting-platform') || '';
  // Zoom personal links (loaded from server prefs)
  let _zoomPersonal = [];
  // Teacher zoom links
  let _zoomTeacher  = [];
  // Edit modal state
  let _editingZoomId = null;

  // Pomodoro ticker (client-side)
  let _pomoTick = null;
  let _pomoSecsLeft = 0;

  // Whiteboard
  let _wbCtx = null;
  let _wbDrawing = false;
  let _wbTool  = 'pen';
  let _wbColor = '#0D1B8E';
  let _wbLastX = 0;
  let _wbLastY = 0;
  let _wbStrokes = [];     // local stroke log
  let _wbRemoteVersion = 0; // compare to avoid flicker

  // Shared chat
  let _chatMsgCount = 0;

  // Canvas assignments cache
  let _assignments = [];

  // Slack users cache
  let _slackUsers = [];
  let _selectedInvitees = []; // [{id, name}]

  // ── Helpers ───────────────────────────────────────────────────────────────
  function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function initials(name) {
    return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  }

  function formatDuration(ms) {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    return `${m}m ${s % 60}s`;
  }

  function fmtTime(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  // opts.parseError is opt-in — every existing caller keeps the original
  // null-on-failure behavior (many do `if (!data)` / `data || fallback`,
  // which would silently break if failure ever became a truthy object).
  // Pass { parseError: true } only where the caller actually wants the
  // server's real {error: "..."} message instead of a generic fallback.
  async function api(path, opts = {}) {
    try {
      const r = await fetch(path, opts);
      if (!r.ok) {
        if (!opts.parseError) return null;
        try { return { __apiError: true, status: r.status, ...(await r.json()) }; }
        catch { return { __apiError: true, status: r.status }; }
      }
      return r.json();
    } catch {
      return opts.parseError ? { __apiError: true } : null;
    }
  }

  function el(id) { return document.getElementById(id); }
  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }
  function qsa(sel, ctx) { return [...(ctx || document).querySelectorAll(sel)]; }

  // Same threshold as mobile.js/mobile.css's own convention — not reachable
  // from here (mobile.js is IIFE-scoped, not exported), so duplicated
  // rather than adding a cross-file dependency for one line.
  function isMobile() { return window.innerWidth <= 767; }

  // ── Tab activation ────────────────────────────────────────────────────────
  function onMeetingsTabOpen() {
    // Force exactly one fresh render on open (matches the old always-render
    // guarantee), then let the 5s poll below skip redundant rebuilds for as
    // long as this same open session's huddle state doesn't actually change.
    _renderedMode = null;
    pollMyHuddle();
    if (!_pollTimer) _pollTimer = setInterval(pollMyHuddle, 5000);
    if (!_user?.isTeacher && !_zoomLinksInterval) {
      _zoomLinksInterval = setInterval(refreshStudentZoomLinks, 90000);
    }
  }

  function onMeetingsTabClose() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    if (_zoomLinksInterval) { clearInterval(_zoomLinksInterval); _zoomLinksInterval = null; }
    stopPomoTick();
  }

  // ── Poll for my current huddle ────────────────────────────────────────────
  async function pollMyHuddle() {
    const data = await api('/api/huddle/my');
    if (!data) {
      if (_huddle && _huddle.status === 'active') {
        // We lost our huddle — show summary if possible
        const summary = await api(`/api/huddle/${_huddle.id}/summary`);
        if (summary) { _summary = summary; _huddle = null; renderSummary(); return; }
      }
      if (!_huddle || _huddle.status !== 'active') {
        if (_summary) return; // stay on summary screen
        if (_renderedMode !== 'empty') renderEmpty();
      }
      return;
    }

    if (data.status === 'ended') {
      if (_huddle && _huddle.id === data.id) {
        _summary = await api(`/api/huddle/${data.id}/summary`) || null;
        _huddle = null;
        renderSummary();
      }
      return;
    }

    // Active huddle
    const wasIn = _huddle?.selfParticipant === true;
    const amInvited = data.selfInvited === true;
    const amIn = data.selfParticipant === true;

    if (amInvited && !amIn && _dismissedInvite !== data.id) {
      renderInviteBanner(data);
      if (!_huddle && _renderedMode !== 'empty') renderEmpty();
      return;
    }

    if (!amIn) return; // not involved

    const prevHuddle = _huddle;
    _huddle = data;

    if (!wasIn) {
      renderWorkspace();
    } else {
      // Refresh participant screens
      refreshScreens();
      // Check teacher messages
      refreshTeacherMessages();
      // Refresh pomodoro if changed server-side
      syncPomodoro(data.pomodoro);
    }
  }

  // ── Virtual Meetings Hub ──────────────────────────────────────────────────
  function renderEmpty() {
    const pane = el('htv-meetings');
    if (!pane) return;
    _renderedMode = 'empty';

    const oldBanner = qs('.huddle-invite-banner', pane);
    if (oldBanner) oldBanner.remove();

    if (_user?.isTeacher) {
      pane.innerHTML = `
        <div class="meetings-hub">
          <div class="meetings-quick-join" id="meetings-quick-join" style="display:none"></div>
          <div id="huddle-section-standalone"></div>
          <div class="meetings-platform-row">
            <div class="meetings-platform-card${_platform === 'zoom' ? ' active' : ''}" data-platform="zoom">
              <div class="meetings-platform-icon meetings-platform-icon--zoom">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="white"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
              </div>
              <div class="meetings-platform-name">Zoom Meeting</div>
              <div class="meetings-platform-desc">Start or join a Zoom video meeting with collaborative tools</div>
              <button class="meetings-platform-cta" id="zoom-btn" type="button">Open Zoom ↗</button>
            </div>
          </div>
          <div id="meetings-content"></div>
        </div>`;

      pane.querySelectorAll('.meetings-platform-card').forEach(card => {
        card.addEventListener('click', () => {
          _platform = card.dataset.platform;
          localStorage.setItem('ysc-meeting-platform', _platform);
          pane.querySelectorAll('.meetings-platform-card').forEach(c => c.classList.toggle('active', c === card));
          renderMeetingsContent();
        });
      });

      // Direct open button — stop propagation so the card platform-select doesn't also fire.
      // Teachers create a real, fresh instant meeting via the S2S API and open it as host.
      const zoomBtn = el('zoom-btn');
      if (zoomBtn) {
        zoomBtn.addEventListener('click', async e => {
          e.stopPropagation();
          const origText = zoomBtn.textContent;
          zoomBtn.textContent = 'Starting Zoom...';
          try {
            const meeting = await createZoomMeeting('instant');
            zoomBtn.textContent = origText;
            if (!meeting) { showHuddleToast('Could not start Zoom meeting.', 'error'); return; }
            openZoomPopup(meeting.startUrl);
          } catch (err) {
            zoomBtn.textContent = origText;
            showHuddleToast('Could not start Zoom meeting: ' + err.message, 'error');
          }
        });
      }

      loadQuickJoinBar();
      // Study Huddle is the only in-app meeting mechanism now — no longer
      // gated behind platform selection like the (removed) Slack card used
      // to require. Zoom stays card/toggle-based, untouched — teacher-only.
      renderSlackSection(el('huddle-section-standalone'));
      renderMeetingsContent();
      return;
    }

    // ── Students: single always-visible Zoom section, no platform card/
    // toggle — students can only ever JOIN (never host: Zoom licensing
    // means only the 27 staff accounts in YSC's managed org can host at
    // all), so there's nothing to gate behind a click-to-reveal card.
    pane.innerHTML = `
      <div class="meetings-hub">
        <div id="huddle-section-standalone"></div>
        <div id="zoom-section-standalone"></div>
      </div>`;

    renderSlackSection(el('huddle-section-standalone'));
    renderStudentZoomSection(el('zoom-section-standalone'));
  }

  // ── Quick Join bar (teacher-only — students no longer have a separate
  // quick-join strip now that the always-visible Class Meetings list in
  // renderStudentZoomSection() already shows every posted link) ────────────
  async function loadQuickJoinBar() {
    const bar = el('meetings-quick-join');
    if (!bar) return;

    bar.style.display = '';
    bar.innerHTML = `
      <div class="qjb-label">Class Meeting</div>
      <div class="qjb-name">Your recurring class meeting link</div>
      <button class="qjb-join-btn" id="qjb-start-class-meeting">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h12a1 1 0 001-1v-3.5l4 4v-11l-4 4z"/></svg>
        Start
      </button>`;
    el('qjb-start-class-meeting')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const meeting = await createZoomMeeting('recurring', 'Class Meeting');
        openZoomPopup(meeting.startUrl);
      } catch (err) {
        showHuddleToast('Could not start class meeting: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ── Platform content router ───────────────────────────────────────────────
  function renderMeetingsContent() {
    const content = el('meetings-content');
    if (!content) return;
    if (_platform === 'zoom') renderZoomSection(content);
    else content.innerHTML = '';
  }

  // ── Slack Huddle section ──────────────────────────────────────────────────
  function renderSlackSection(container) {
    container.innerHTML = `
      <div class="meetings-section">
        <div class="meetings-section-head">
          <svg width="18" height="18" viewBox="0 0 54 54"><path fill="#36C5F0" d="M13.5 34.5a4.5 4.5 0 110 9 4.5 4.5 0 010-9zm0-6H4.5a4.5 4.5 0 010-9h9v9z"/><path fill="#2EB67D" d="M19.5 13.5a4.5 4.5 0 119 0v9h-9v-9zm6 4.5H34.5a4.5 4.5 0 010 9h-9v-9z"/><path fill="#ECB22E" d="M40.5 19.5a4.5 4.5 0 110-9 4.5 4.5 0 010 9zm0 6H49.5a4.5 4.5 0 010 9h-9v-9z"/><path fill="#E01E5A" d="M34.5 40.5a4.5 4.5 0 11-9 0v-9h9v9zm-6-4.5H19.5a4.5 4.5 0 010-9h9v9z"/></svg>
          Slack Huddle
        </div>
        <p class="meetings-section-desc">Start a study huddle to collaborate with classmates in real time — share notes, a whiteboard, and get AI help together.</p>
        <div class="huddle-empty-actions">
          <button class="btn-start-huddle" id="btn-open-create-huddle">+ Start a Huddle</button>
          <button class="btn-join-huddle" id="btn-show-join-code">Join by Code</button>
        </div>
        <div id="huddle-join-code-area" style="display:none;margin-top:12px;">
          <div class="huddle-join-code-row">
            <input class="huddle-code-input" id="huddle-code-input" placeholder="Enter huddle code (e.g. a3f9c2)" maxlength="10" />
            <button class="btn-join-by-code" id="btn-join-by-code">Join</button>
          </div>
        </div>
      </div>`;

    el('btn-open-create-huddle')?.addEventListener('click', openCreateModal);
    el('btn-show-join-code')?.addEventListener('click', () => {
      const area = el('huddle-join-code-area');
      if (area) area.style.display = area.style.display === 'none' ? '' : 'none';
    });
    el('btn-join-by-code')?.addEventListener('click', async () => {
      const code = (el('huddle-code-input')?.value || '').trim();
      if (!code) return;
      const result = await api(`/api/huddle/${encodeURIComponent(code)}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, parseError: true });
      if (result?.ok) { _huddle = result.huddle; renderWorkspace(); }
      // Huddles are invite-only: a real code alone isn't enough, so say that instead of implying a typo.
      else if (result?.status === 403) showHuddleToast('This huddle is invite-only. Ask the host to invite you, then try again.', 'error');
      else showHuddleToast('That code did not match an active huddle — check with your teacher.', 'error');
    });
  }

  // ── Zoom link list builders — shared between the teacher section below
  // and the student section (renderStudentZoomSection) ─────────────────────
  function buildTeacherLinksHTML() {
    return _zoomTeacher.length
      ? _zoomTeacher.map(l => `
          <div class="zoom-link-row">
            <div class="zoom-link-info">
              <div class="zoom-link-label">${esc(l.label)}</div>
              ${l.forClass  ? `<div class="zoom-link-meta">${esc(l.forClass)}</div>` : ''}
              ${l.schedule  ? `<div class="zoom-link-sched">${esc(l.schedule)}</div>` : ''}
            </div>
            <button class="zoom-join-link-btn" data-url="${esc(l.url)}">Join</button>
          </div>`).join('')
      : '<div class="zoom-empty">No class meetings posted yet.</div>';
  }

  function buildPersonalLinksHTML() {
    return _zoomPersonal.length
      ? _zoomPersonal.map(l => `
          <div class="zoom-link-row" data-zoom-id="${esc(l.id)}">
            <div class="zoom-link-info">
              <div class="zoom-link-label">${esc(l.label)}</div>
            </div>
            <div class="zoom-link-actions">
              <button class="zoom-join-link-btn" data-url="${esc(l.url)}">Open</button>
              <button class="zoom-edit-btn" data-id="${esc(l.id)}" data-label="${esc(l.label)}" data-url="${esc(l.url)}">Edit</button>
              <button class="zoom-del-btn"  data-id="${esc(l.id)}">✕</button>
            </div>
          </div>`).join('')
      : '<div class="zoom-empty">No personal links saved yet. Add up to 5 below.</div>';
  }

  // ── Zoom section (teacher-only — reached via the platform card/toggle in
  // renderEmpty()'s teacher branch) ─────────────────────────────────────────
  async function renderZoomSection(container) {
    // Load personal links from prefs
    const prefs = await api('/api/prefs') || {};
    _zoomPersonal = prefs.zoomLinks || [];
    if (_zoomTeacher.length === 0) _zoomTeacher = await api('/api/zoom/teacher') || [];

    container.innerHTML = buildZoomSectionHTML();
    wireZoomSection(container);
  }

  function buildZoomSectionHTML() {
    return `
      <div class="meetings-section">
        <!-- Start / Join bar -->
        <div class="zoom-action-bar">
          <div class="zoom-action-card" id="zoom-start-card">
            <div class="zoom-action-icon">🎥</div>
            <div class="zoom-action-label">Start a Meeting</div>
            <button class="zoom-action-btn" id="zoom-start-btn">Start Zoom</button>
          </div>
          <div class="zoom-action-divider"></div>
          <div class="zoom-action-card">
            <div class="zoom-action-icon">🔗</div>
            <div class="zoom-action-label">Join a Meeting</div>
            <div class="zoom-join-row">
              <input class="zoom-join-input" id="zoom-join-input" placeholder="Meeting ID or zoom.us/j/... link" />
              <button class="zoom-action-btn" id="zoom-join-btn">Join</button>
            </div>
          </div>
        </div>

        <!-- Teacher class meetings -->
        <div class="zoom-links-section">
          <div class="zoom-links-head">
            <span class="zoom-links-title">Class Meetings</span>
          </div>
          <div id="zoom-teacher-links">${buildTeacherLinksHTML()}</div>
        </div>

        <!-- My saved links -->
        <div class="zoom-links-section">
          <div class="zoom-links-head">
            <span class="zoom-links-title">My Saved Links</span>
            ${_zoomPersonal.length < 5 ? '<button class="zoom-add-link-btn" id="zoom-add-link-btn">+ Add Link</button>' : ''}
          </div>
          <div id="zoom-personal-links">${buildPersonalLinksHTML()}</div>

          <!-- Add / edit form (hidden by default) -->
          <div id="zoom-link-form" class="zoom-link-form" style="display:none">
            <input class="zoom-form-input" id="zoom-form-label" placeholder="Label (e.g. Study Group)" maxlength="60" />
            <input class="zoom-form-input" id="zoom-form-url" placeholder="Zoom link or meeting ID" />
            <div class="zoom-form-actions">
              <button class="zoom-form-save" id="zoom-form-save">Save</button>
              <button class="zoom-form-cancel" id="zoom-form-cancel">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Tip: use hub alongside Zoom popup -->
        <div class="zoom-tip">
          <span class="zoom-tip-icon">💡</span>
          Zoom opens in a side window — keep this hub open to use shared notes, the whiteboard, and chat while in your meeting.
          Press <kbd>Alt+A</kbd> to mute / unmute in Zoom.
        </div>
      </div>`;
  }

  // ── Zoom section (student-only — always visible in renderEmpty(), no
  // card/toggle to reveal it. No "Start a Meeting" card at all: students
  // can never host — Zoom licensing means only the 27 staff accounts in
  // YSC's managed org can host meetings — so offering a start action that
  // could never work isn't shown in the first place. ) ─────────────────────
  async function renderStudentZoomSection(container) {
    const prefs = await api('/api/prefs') || {};
    _zoomPersonal = prefs.zoomLinks || [];
    _zoomTeacher = await api('/api/zoom/teacher') || [];

    container.innerHTML = buildStudentZoomSectionHTML();
    wireStudentZoomSection(container);
  }

  function buildStudentZoomSectionHTML() {
    return `
      <div class="meetings-section">
        <!-- Join bar (join-only — no Start card for students) -->
        <div class="zoom-action-bar">
          <div class="zoom-action-card">
            <div class="zoom-action-icon">🔗</div>
            <div class="zoom-action-label">Join a Meeting</div>
            <div class="zoom-join-row">
              <input class="zoom-join-input" id="zoom-join-input" placeholder="Meeting ID or zoom.us/j/... link" />
              <button class="zoom-action-btn" id="zoom-join-btn">Join</button>
            </div>
          </div>
        </div>

        <!-- Teacher class meetings -->
        <div class="zoom-links-section">
          <div class="zoom-links-head">
            <span class="zoom-links-title">Class Meetings</span>
          </div>
          <div id="zoom-teacher-links">${buildTeacherLinksHTML()}</div>
        </div>

        <!-- My saved links -->
        <div class="zoom-links-section">
          <div class="zoom-links-head">
            <span class="zoom-links-title">My Saved Links</span>
            ${_zoomPersonal.length < 5 ? '<button class="zoom-add-link-btn" id="zoom-add-link-btn">+ Add Link</button>' : ''}
          </div>
          <div id="zoom-personal-links">${buildPersonalLinksHTML()}</div>

          <!-- Add / edit form (hidden by default) -->
          <div id="zoom-link-form" class="zoom-link-form" style="display:none">
            <input class="zoom-form-input" id="zoom-form-label" placeholder="Label (e.g. Study Group)" maxlength="60" />
            <input class="zoom-form-input" id="zoom-form-url" placeholder="Zoom link or meeting ID" />
            <div class="zoom-form-actions">
              <button class="zoom-form-save" id="zoom-form-save">Save</button>
              <button class="zoom-form-cancel" id="zoom-form-cancel">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Tip: use hub alongside Zoom popup -->
        <div class="zoom-tip">
          <span class="zoom-tip-icon">💡</span>
          Zoom opens in a side window — keep this hub open to use shared notes, the whiteboard, and chat while in your meeting.
          Press <kbd>Alt+A</kbd> to mute / unmute in Zoom.
        </div>
      </div>`;
  }

  // Background refresh for the student Class Meetings list — deliberately
  // decoupled from the 5s huddle poll (a teacher's posted/pinned link
  // changes rarely; nothing here needs sub-minute freshness). Diffs before
  // touching the DOM so an unchanged tick never repaints anything.
  async function refreshStudentZoomLinks() {
    const container = el('zoom-teacher-links');
    if (!container) return; // not currently on the Zoom section

    const fresh = await api('/api/zoom/teacher') || [];
    if (JSON.stringify(fresh) === JSON.stringify(_zoomTeacher)) return;

    _zoomTeacher = fresh;
    container.innerHTML = buildTeacherLinksHTML();
    container.querySelectorAll('.zoom-join-link-btn').forEach(btn => {
      btn.addEventListener('click', () => openZoomPopup(btn.dataset.url));
    });
  }

  function wireStudentZoomSection(container) {
    el('zoom-join-btn')?.addEventListener('click', () => {
      const val = (el('zoom-join-input')?.value || '').trim();
      if (!val) return;
      openZoomPopup(val);
    });
    el('zoom-join-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') el('zoom-join-btn')?.click();
    });

    container.querySelectorAll('.zoom-join-link-btn').forEach(btn => {
      btn.addEventListener('click', () => openZoomPopup(btn.dataset.url));
    });

    el('zoom-add-link-btn')?.addEventListener('click', () => openZoomLinkForm(null, container));

    container.querySelectorAll('.zoom-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openZoomLinkForm({ id: btn.dataset.id, label: btn.dataset.label, url: btn.dataset.url }, container));
    });

    container.querySelectorAll('.zoom-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteZoomLink(btn.dataset.id, container));
    });
  }

  function wireZoomSection(container) {
    // Start button — teachers create a real instant meeting via the S2S
    // API and open it as host. Students keep the old saved-link fallback
    // behavior unchanged (same out-of-scope reasoning as the #zoom-btn
    // handler above).
    el('zoom-start-btn')?.addEventListener('click', async () => {
      if (_user?.isTeacher) {
        try {
          const meeting = await createZoomMeeting('instant');
          openZoomPopup(meeting.startUrl);
        } catch (err) {
          showHuddleToast('Could not start Zoom meeting: ' + err.message, 'error');
        }
        return;
      }
      const zoomUrl = _zoomTeacher[0]?.url || _zoomPersonal[0]?.url || 'https://zoom.us';
      if (isMobile()) { location.href = zoomUrl; return; }
      window.open(zoomUrl, 'ZoomWindow', 'width=1200,height=800,toolbar=no,menubar=no,scrollbars=yes,resizable=yes');
    });

    // Join button — parse meeting ID or full URL, open popup
    el('zoom-join-btn')?.addEventListener('click', () => {
      const val = (el('zoom-join-input')?.value || '').trim();
      if (!val) return;
      openZoomPopup(val);
    });
    el('zoom-join-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') el('zoom-join-btn')?.click();
    });

    // Teacher and personal link "Join / Open" buttons
    container.querySelectorAll('.zoom-join-link-btn').forEach(btn => {
      btn.addEventListener('click', () => openZoomPopup(btn.dataset.url));
    });

    // Add link button
    el('zoom-add-link-btn')?.addEventListener('click', () => openZoomLinkForm(null, container));

    // Edit buttons
    container.querySelectorAll('.zoom-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => openZoomLinkForm({ id: btn.dataset.id, label: btn.dataset.label, url: btn.dataset.url }, container));
    });

    // Delete buttons
    container.querySelectorAll('.zoom-del-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteZoomLink(btn.dataset.id, container));
    });
  }

  // Creates a real Zoom meeting via the S2S API (teacher-only route —
  // server derives host identity from the session, this never sends who
  // to create it for). kind: 'instant' for the ad-hoc Start Zoom button,
  // 'recurring' for the pinned Class Meeting slot (idempotent server-side —
  // reuses the teacher's existing pinned meeting instead of making a new
  // one every call). Throws on failure so callers can show the real error.
  async function createZoomMeeting(kind, topic) {
    const result = await api('/api/zoom/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, topic }),
      parseError: true,
    });
    if (!result || result.__apiError) {
      throw new Error(result?.error || result?.detail || 'Zoom meeting request failed');
    }
    return result;
  }

  // Opens a Zoom meeting URL or meeting ID in a popup window on the right side of the screen
  function openZoomPopup(urlOrId) {
    let url;
    if (/^https?:\/\//i.test(urlOrId)) {
      url = urlOrId;
    } else {
      const id = String(urlOrId).replace(/\D/g, '');
      url = `https://zoom.us/j/${id}`;
    }

    // Mobile browsers ignore the popup feature string below entirely —
    // window.open() there just opens an ordinary new tab the app has no
    // reliable way to close, blocking whatever the student actually came
    // back to the hub to see. Plain in-tab navigation avoids that.
    if (isMobile()) { location.href = url; return; }

    const width  = Math.floor(window.screen.width  * 0.45);
    const height = Math.floor(window.screen.height * 0.80);
    const left   = window.screen.width - width;
    const top    = 0;
    const popup  = window.open(
      url, 'ZoomMeeting',
      `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
    );
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      // Popup blocked — fall back to new tab
      window.open(url, '_blank', 'noopener');
      showHuddleToast('Popup blocked — Zoom opened in a new tab. Allow popups for side-by-side view.', 'warn');
    }
  }

  function openZoomLinkForm(existing, container) {
    _editingZoomId = existing?.id || null;
    const form = el('zoom-link-form');
    if (!form) return;
    form.style.display = '';
    el('zoom-form-label').value = existing?.label || '';
    el('zoom-form-url').value   = existing?.url   || '';
    el('zoom-form-save')?.removeEventListener('click', saveZoomLink);
    el('zoom-form-save')?.addEventListener('click', () => saveZoomLink(container));
    el('zoom-form-cancel')?.addEventListener('click', () => { form.style.display = 'none'; _editingZoomId = null; });
  }

  async function saveZoomLink(container) {
    const label = (el('zoom-form-label')?.value || '').trim();
    const url   = (el('zoom-form-url')?.value   || '').trim();
    if (!label || !url) { showHuddleToast('Enter a label and a Zoom link.', 'warn'); return; }

    const prefs = await api('/api/prefs') || {};
    const links = [...(prefs.zoomLinks || [])];

    if (_editingZoomId) {
      const idx = links.findIndex(l => l.id === _editingZoomId);
      if (idx >= 0) { links[idx].label = label; links[idx].url = url; }
    } else {
      if (links.length >= 5) { showHuddleToast('Max 5 personal Zoom links.', 'warn'); return; }
      links.push({ id: `zl_${Date.now()}`, label, url });
    }

    await api('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zoomLinks: links }) });
    _zoomPersonal = links;
    _editingZoomId = null;
    if (_user?.isTeacher) renderZoomSection(container); else renderStudentZoomSection(container);
  }

  async function deleteZoomLink(id, container) {
    if (!confirm('Remove this saved Zoom link?')) return;
    const prefs = await api('/api/prefs') || {};
    const links = (prefs.zoomLinks || []).filter(l => l.id !== id);
    await api('/api/prefs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zoomLinks: links }) });
    _zoomPersonal = links;
    if (_user?.isTeacher) renderZoomSection(container); else renderStudentZoomSection(container);
  }


  // ── Invitation banner ─────────────────────────────────────────────────────
  function renderInviteBanner(data) {
    const pane = el('htv-meetings');
    if (!pane) return;
    const existing = qs('.huddle-invite-banner', pane);
    if (existing) return; // already shown

    const banner = document.createElement('div');
    banner.className = 'huddle-invite-banner';
    banner.innerHTML = `
      <div class="huddle-invite-text">
        <div class="huddle-invite-title">📨 Study Huddle Invitation</div>
        <div class="huddle-invite-sub">${esc(data.hostName)} invited you to "${esc(data.name)}"${data.assignmentTitle ? ` — ${esc(data.assignmentTitle)}` : ''}</div>
      </div>
      <div class="huddle-invite-actions">
        <button class="btn-invite-join" id="btn-accept-invite">Join Now</button>
        <button class="btn-invite-dismiss" id="btn-dismiss-invite">Dismiss</button>
      </div>`;
    pane.prepend(banner);

    el('btn-accept-invite')?.addEventListener('click', async () => {
      const result = await api(`/api/huddle/${data.id}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      if (result?.ok) { _huddle = result.huddle; renderWorkspace(); }
    });
    el('btn-dismiss-invite')?.addEventListener('click', () => {
      _dismissedInvite = data.id;
      banner.remove();
    });

    // Also show browser notification if permitted
    if (Notification.permission === 'granted') {
      new Notification(`Study Huddle: ${data.name}`, {
        body: `${data.hostName} invited you to join`,
        icon: '/logo.jpg',
      });
    }
  }

  // ── Full workspace render ─────────────────────────────────────────────────
  function renderWorkspace() {
    const pane = el('htv-meetings');
    if (!pane) return;
    _renderedMode = 'workspace';

    const h = _huddle;
    const isHost = h.canInvite === true;

    pane.innerHTML = `
      <!-- Teacher message area -->
      <div id="huddle-teacher-msgs"></div>

      <div class="huddle-workspace">
        <!-- Left: screens + controls -->
        <div class="huddle-screens-col">
          <!-- Controls bar -->
          <div class="huddle-controls-bar">
            <div class="huddle-controls-title">
              ${esc(h.name)}
              ${h.assignmentTitle ? `<span>${esc(h.assignmentTitle)}</span>` : ''}
            </div>
            <div class="huddle-timer" id="huddle-live-timer">0m 0s</div>
            <!-- Pomodoro -->
            <div class="huddle-pomodoro">
              <span title="Pomodoro timer">🍅</span>
              <span class="huddle-pomo-time" id="huddle-pomo-display">${fmtTime(_pomoSecsLeft || 25*60)}</span>
              <button class="huddle-pomo-btn" id="huddle-pomo-toggle">▶</button>
              <button class="huddle-pomo-btn" id="huddle-pomo-reset" title="Reset">↺</button>
            </div>
            ${isHost ? `<button class="huddle-ctrl-btn" id="btn-invite-classmate">+ Invite</button>` : ''}
            ${isHost ? `<button class="huddle-ctrl-btn btn-mute" id="btn-mute-all">🔇 Mute All</button>` : ''}
            ${isHost ? `<button class="huddle-ctrl-btn btn-end" id="btn-end-huddle">End Huddle</button>` : `<button class="huddle-ctrl-btn btn-end" id="btn-leave-huddle">Leave</button>`}
          </div>

          <!-- 2×2 student screens -->
          <div class="student-screens-grid" id="student-screens-grid">
          </div>
        </div>

        <!-- Right: tools panel -->
        <div class="huddle-tools-panel">
          <div class="huddle-tools-header">
            <button class="huddle-tool-tab active" data-tool="notes">📝 Notes</button>
            <button class="huddle-tool-tab" data-tool="whiteboard">🎨 Board</button>
            <button class="huddle-tool-tab" data-tool="chat">🤖 AI Chat</button>
          </div>

          <!-- Notes -->
          <div class="huddle-tool-pane active" id="huddle-tool-notes">
            <div class="huddle-notes-area">
              <div class="huddle-notes-meta">Shared notes — everyone can type simultaneously</div>
              <textarea id="huddle-notes-textarea" placeholder="Type shared notes here… everyone in the huddle can see and edit these."></textarea>
              <div class="huddle-notes-footer">
                <span id="huddle-notes-save-status">Auto-saves every 30s</span>
                <button class="btn-notes-save" id="btn-save-notes-now">Save</button>
              </div>
            </div>
          </div>

          <!-- Whiteboard -->
          <div class="huddle-tool-pane" id="huddle-tool-whiteboard">
            <div class="huddle-wb-area">
              <div class="huddle-wb-toolbar">
                <button class="wb-tool-btn active" data-wb-tool="pen" id="wb-btn-pen">✏️ Pen</button>
                <button class="wb-tool-btn" data-wb-tool="eraser" id="wb-btn-eraser">⬜ Erase</button>
                <div style="display:flex;gap:4px;align-items:center;">
                  ${['#0D1B8E','#e74c3c','#27ae60','#f39c12','#8e44ad','#000'].map(c =>
                    `<div class="wb-color-swatch${c === '#0D1B8E' ? ' active' : ''}" data-color="${c}" style="background:${c}"></div>`
                  ).join('')}
                </div>
                <button class="wb-tool-btn" id="wb-btn-clear" style="margin-left:auto">Clear</button>
              </div>
              <canvas id="wb-canvas"></canvas>
            </div>
          </div>

          <!-- AI Group Chat -->
          <div class="huddle-tool-pane" id="huddle-tool-chat">
            <div class="huddle-chat-area">
              <div id="huddle-chat-messages"></div>
              <div class="huddle-chat-composer">
                <textarea id="huddle-chat-input" placeholder="Ask the group AI…" rows="1"></textarea>
                <button id="huddle-chat-send">Send</button>
              </div>
            </div>
          </div>
        </div>
      </div>`;

    // Wire tool tabs
    qsa('.huddle-tool-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        qsa('.huddle-tool-tab').forEach(t => t.classList.remove('active'));
        qsa('.huddle-tool-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const paneId = `huddle-tool-${tab.dataset.tool}`;
        el(paneId)?.classList.add('active');
        if (tab.dataset.tool === 'whiteboard') initWhiteboard();
        if (tab.dataset.tool === 'chat') loadGroupChat();
      });
    });

    // Wire pomodoro
    el('huddle-pomo-toggle')?.addEventListener('click', togglePomodoro);
    el('huddle-pomo-reset')?.addEventListener('click', resetPomodoro);

    // Wire end/leave
    el('btn-end-huddle')?.addEventListener('click', endHuddle);
    el('btn-leave-huddle')?.addEventListener('click', leaveHuddle);

    // Wire invite
    el('btn-invite-classmate')?.addEventListener('click', openInviteQuickModal);

    // Wire mute all (host only — visual only, no actual mic control possible via browser)
    el('btn-mute-all')?.addEventListener('click', () => showHuddleToast('Mute All sent to participants.'));

    // Wire notes auto-save
    const notesTA = el('huddle-notes-textarea');
    if (notesTA) {
      // Load existing notes
      api(`/api/huddle/${h.id}/notes`).then(d => {
        if (d?.notes && notesTA) notesTA.value = d.notes;
      });
      notesTA.addEventListener('input', () => {
        if (_notesSaveTimer) clearTimeout(_notesSaveTimer);
        el('huddle-notes-save-status').textContent = 'Unsaved…';
        _notesSaveTimer = setTimeout(() => saveNotes(), 30000);
      });
      // Poll notes every 10s
      setInterval(() => {
        api(`/api/huddle/${h.id}/notes`).then(d => {
          if (d?.notes !== undefined && document.activeElement !== notesTA) {
            notesTA.value = d.notes;
          }
        });
      }, 10000);
    }
    el('btn-save-notes-now')?.addEventListener('click', saveNotes);

    // Wire group chat send
    el('huddle-chat-send')?.addEventListener('click', sendGroupChat);
    el('huddle-chat-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGroupChat(); }
    });

    // Render screens
    refreshScreens();

    // Start live timer
    startLiveTimer();

    // Sync pomodoro
    syncPomodoro(h.pomodoro);

    // Teacher messages
    refreshTeacherMessages();
  }

  // ── Student screens ───────────────────────────────────────────────────────
  function refreshScreens() {
    const grid = el('student-screens-grid');
    if (!grid || !_huddle) return;

    const slots = [0, 1, 2, 3];
    const participants = _huddle.participants || [];
    const invited      = _huddle.invited || [];
    const isHost = _huddle.canInvite === true;

    grid.innerHTML = '';
    slots.forEach(i => {
      const participant = participants[i];
      const invitedSlot = !participant && invited[i - participants.length] || null;

      const div = document.createElement('div');
      div.className = 'student-screen' + (participant ? ' screen-active' : '');

      if (participant) {
        const isMe   = participant === _user?.name;
        const isHere = participant === _huddle.hostName;
        div.innerHTML = `
          ${isHere ? '<div class="screen-host-badge">HOST</div>' : ''}
          <div class="screen-video-area">
            <div class="screen-avatar-initial">${esc(initials(participant))}</div>
          </div>
          <div class="screen-name-bar">
            <div class="screen-name">
              <div class="screen-active-dot"></div>
              ${esc(participant)}${isMe ? ' (you)' : ''}
            </div>
            ${isMe ? `
            <div class="screen-mic-cam">
              <button class="screen-mic-btn" id="screen-mic-${i}" title="Toggle mic">🎙️</button>
              <button class="screen-cam-btn off" id="screen-cam-${i}" title="Toggle camera">📷</button>
            </div>` : ''}
          </div>`;
        // Mic/cam toggle (local UI only)
        div.querySelector(`#screen-mic-${i}`)?.addEventListener('click', function() {
          this.classList.toggle('muted');
          this.textContent = this.classList.contains('muted') ? '🔇' : '🎙️';
        });
        div.querySelector(`#screen-cam-${i}`)?.addEventListener('click', function() {
          this.classList.toggle('off');
          this.textContent = this.classList.contains('off') ? '📷' : '🎥';
        });
      } else if (invitedSlot) {
        div.innerHTML = `
          <div class="screen-invited-overlay">
            <div class="screen-invited-dot"></div>
            <div class="screen-invited-text">Invited…</div>
            <div style="font-size:.72rem;color:rgba(255,255,255,.5);margin-top:2px">${esc(invitedSlot)}</div>
          </div>`;
      } else {
        div.innerHTML = `
          <div class="screen-placeholder">
            <div class="screen-placeholder-icon">👤</div>
            <div class="screen-placeholder-text">Waiting to join…</div>
            ${isHost ? `<button class="screen-invite-btn invite-from-screen">+ Invite a classmate</button>` : ''}
          </div>`;
        div.querySelector('.invite-from-screen')?.addEventListener('click', openInviteQuickModal);
      }

      grid.appendChild(div);
    });
  }

  // ── Live timer ────────────────────────────────────────────────────────────
  function startLiveTimer() {
    if (!_huddle?.startedAt) return;
    const startMs = new Date(_huddle.startedAt).getTime();
    function tick() {
      const elapsed = Date.now() - startMs;
      const timerEl = el('huddle-live-timer');
      if (timerEl) timerEl.textContent = formatDuration(elapsed);
    }
    tick();
    setInterval(tick, 1000);
  }

  // ── Pomodoro ──────────────────────────────────────────────────────────────
  function syncPomodoro(pomo) {
    if (!pomo) return;
    if (pomo.active && pomo.startedAt) {
      const elapsed = Math.floor((Date.now() - pomo.startedAt) / 1000);
      _pomoSecsLeft = Math.max(0, pomo.secondsLeft - elapsed);
      startPomoTick();
    } else {
      _pomoSecsLeft = pomo.secondsLeft;
      stopPomoTick();
    }
    updatePomoDisplay();
  }

  function startPomoTick() {
    if (_pomoTick) return;
    _pomoTick = setInterval(() => {
      if (_pomoSecsLeft > 0) {
        _pomoSecsLeft--;
        updatePomoDisplay();
      } else {
        stopPomoTick();
        showHuddleToast('🍅 Pomodoro done! Time for a break.');
        const btn = el('huddle-pomo-toggle');
        if (btn) btn.textContent = '▶';
      }
    }, 1000);
    const btn = el('huddle-pomo-toggle');
    if (btn) btn.textContent = '⏸';
  }

  function stopPomoTick() {
    if (_pomoTick) { clearInterval(_pomoTick); _pomoTick = null; }
    const btn = el('huddle-pomo-toggle');
    if (btn) btn.textContent = '▶';
  }

  function updatePomoDisplay() {
    const d = el('huddle-pomo-display');
    if (d) d.textContent = fmtTime(_pomoSecsLeft);
  }

  async function togglePomodoro() {
    if (!_huddle) return;
    const isRunning = !!_pomoTick;
    if (isRunning) {
      stopPomoTick();
      await api(`/api/huddle/${_huddle.id}/pomodoro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pause' }),
      });
    } else {
      const result = await api(`/api/huddle/${_huddle.id}/pomodoro`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', minutes: 25 }),
      });
      if (result?.pomodoro) syncPomodoro(result.pomodoro);
    }
  }

  async function resetPomodoro() {
    if (!_huddle) return;
    stopPomoTick();
    _pomoSecsLeft = 25 * 60;
    updatePomoDisplay();
    await api(`/api/huddle/${_huddle.id}/pomodoro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    });
  }

  // ── Shared notes ──────────────────────────────────────────────────────────
  async function saveNotes() {
    if (!_huddle) return;
    const text = el('huddle-notes-textarea')?.value || '';
    const ok = await api(`/api/huddle/${_huddle.id}/notes`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: text }),
    });
    const status = el('huddle-notes-save-status');
    if (status) status.textContent = ok ? `Saved at ${new Date().toLocaleTimeString()}` : 'Save failed';
  }

  // ── Whiteboard ────────────────────────────────────────────────────────────
  function initWhiteboard() {
    const canvas = el('wb-canvas');
    if (!canvas || _wbCtx) return; // already initialized

    _wbCtx = canvas.getContext('2d');

    function resizeCanvas() {
      const rect = canvas.getBoundingClientRect();
      const prev = canvas.toDataURL();
      canvas.width  = rect.width;
      canvas.height = rect.height;
      const img = new Image();
      img.onload = () => _wbCtx.drawImage(img, 0, 0);
      img.src = prev;
    }
    resizeCanvas();
    new ResizeObserver(resizeCanvas).observe(canvas);

    // Load existing whiteboard
    if (_huddle) {
      api(`/api/huddle/${_huddle.id}/whiteboard`).then(d => {
        if (d?.data) {
          const img = new Image();
          img.onload = () => _wbCtx.drawImage(img, 0, 0, canvas.width, canvas.height);
          img.src = d.data;
        }
      });
    }

    function getPos(e) {
      const rect = canvas.getBoundingClientRect();
      const src = e.touches ? e.touches[0] : e;
      return { x: src.clientX - rect.left, y: src.clientY - rect.top };
    }

    function startDraw(e) {
      _wbDrawing = true;
      const pos = getPos(e);
      _wbLastX = pos.x; _wbLastY = pos.y;
      _wbCtx.beginPath();
      _wbCtx.moveTo(pos.x, pos.y);
      e.preventDefault();
    }
    function draw(e) {
      if (!_wbDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      _wbCtx.lineWidth   = _wbTool === 'eraser' ? 20 : 3;
      _wbCtx.lineCap     = 'round';
      _wbCtx.strokeStyle = _wbTool === 'eraser' ? '#ffffff' : _wbColor;
      _wbCtx.globalCompositeOperation = _wbTool === 'eraser' ? 'destination-out' : 'source-over';
      _wbCtx.lineTo(pos.x, pos.y);
      _wbCtx.stroke();
      _wbCtx.beginPath();
      _wbCtx.moveTo(pos.x, pos.y);
      _wbLastX = pos.x; _wbLastY = pos.y;
    }
    function endDraw(e) {
      if (!_wbDrawing) return;
      _wbDrawing = false;
      _wbCtx.globalCompositeOperation = 'source-over';
      // Save to server debounced
      if (_wbSaveTimer) clearTimeout(_wbSaveTimer);
      _wbSaveTimer = setTimeout(saveWhiteboard, 1500);
    }

    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', draw, { passive: false });
    canvas.addEventListener('touchend', endDraw);

    // Toolbar wiring
    qsa('[data-wb-tool]').forEach(btn => {
      btn.addEventListener('click', () => {
        _wbTool = btn.dataset.wbTool;
        qsa('[data-wb-tool]').forEach(b => b.classList.toggle('active', b === btn));
      });
    });
    qsa('.wb-color-swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        _wbColor = swatch.dataset.color;
        _wbTool  = 'pen';
        qsa('.wb-color-swatch').forEach(s => s.classList.toggle('active', s === swatch));
        qsa('[data-wb-tool]').forEach(b => b.classList.toggle('active', b.dataset.wbTool === 'pen'));
      });
    });
    el('wb-btn-clear')?.addEventListener('click', () => {
      _wbCtx.clearRect(0, 0, canvas.width, canvas.height);
      saveWhiteboard();
    });

    // Poll remote whiteboard every 12s
    setInterval(async () => {
      if (_huddle && !_wbDrawing) {
        const d = await api(`/api/huddle/${_huddle.id}/whiteboard`);
        if (d?.data) {
          const img = new Image();
          img.onload = () => { _wbCtx.clearRect(0,0,canvas.width,canvas.height); _wbCtx.drawImage(img, 0, 0, canvas.width, canvas.height); };
          img.src = d.data;
        }
      }
    }, 12000);
  }

  async function saveWhiteboard() {
    if (!_huddle || !_wbCtx) return;
    const data = el('wb-canvas')?.toDataURL('image/png');
    if (!data) return;
    await api(`/api/huddle/${_huddle.id}/whiteboard`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
  }

  // ── Shared group AI chat ──────────────────────────────────────────────────
  async function loadGroupChat() {
    if (!_huddle) return;
    const d = await api(`/api/huddle/${_huddle.id}/chat`);
    if (!d) return;
    _chatMsgCount = d.total;
    const container = el('huddle-chat-messages');
    if (!container) return;
    container.innerHTML = '';
    (d.messages || []).forEach(m => appendChatMsg(m));
  }

  function appendChatMsg(msg) {
    const container = el('huddle-chat-messages');
    if (!container) return;
    const isAi = msg.role === 'assistant';
    const div = document.createElement('div');
    div.className = `huddle-chat-msg msg-${isAi ? 'ai' : 'user'}`;
    div.innerHTML = `
      <div class="hcm-avatar">${esc(initials(msg.name))}</div>
      <div>
        <div class="hcm-meta">${esc(msg.name)} · ${new Date(msg.sentAt).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })}</div>
        <div class="hcm-bubble">${esc(msg.text)}</div>
      </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  async function sendGroupChat() {
    if (!_huddle) return;
    const input = el('huddle-chat-input');
    const q = (input?.value || '').trim();
    if (!q) return;
    input.value = '';
    input.style.height = 'auto';

    // Optimistic user bubble
    const userMsg = { role: 'user', name: _user?.name || 'You', text: q, sentAt: new Date().toISOString() };
    appendChatMsg(userMsg);

    const result = await api(`/api/huddle/${_huddle.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q }),
    });
    if (result?.aiText) {
      appendChatMsg({ role: 'assistant', name: 'YSC Assistant', text: result.aiText, sentAt: new Date().toISOString() });
    }
  }

  // ── Teacher messages ──────────────────────────────────────────────────────
  function refreshTeacherMessages() {
    const container = el('huddle-teacher-msgs');
    if (!container || !_huddle?.teacherMessages?.length) return;
    container.innerHTML = '';
    _huddle.teacherMessages.forEach(m => {
      const div = document.createElement('div');
      div.className = 'huddle-teacher-msg';
      div.innerHTML = `<strong>📢 From your teacher:</strong> ${esc(m.text)}`;
      container.appendChild(div);
    });
  }

  // ── End / Leave huddle ────────────────────────────────────────────────────
  async function endHuddle() {
    if (!_huddle) return;
    if (!confirm('End the huddle for everyone?')) return;
    const result = await api(`/api/huddle/${_huddle.id}/end`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    stopPomoTick();
    _summary = result?.summary || null;
    _huddle  = null;
    renderSummary();
  }

  async function leaveHuddle() {
    if (!_huddle) return;
    await api(`/api/huddle/${_huddle.id}/leave`, { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    stopPomoTick();
    _wbCtx = null;
    _huddle = null;
    renderEmpty();
  }

  // ── Post-huddle summary ───────────────────────────────────────────────────
  function renderSummary() {
    const pane = el('htv-meetings');
    if (!pane) return;

    const s = _summary;
    if (!s) { renderEmpty(); return; }
    _renderedMode = 'summary';

    const msgs = [
      "Great work, team! 🌟 That was a productive session.",
      "Awesome collaboration! Keep up the momentum. 🚀",
      "You crushed it! Every minute together counts. 💪",
      "Fantastic huddle! Learning together is a superpower. ✨",
    ];
    const msg = msgs[Math.floor(Math.random() * msgs.length)];

    pane.innerHTML = `
      <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:20px;overflow-y:auto;">
        <div class="huddle-summary-card">
          <div class="huddle-summary-emoji">🎉</div>
          <div class="huddle-summary-title">Huddle Complete!</div>
          <div class="huddle-summary-sub">Great session, ${esc(s.hostName?.split(' ')[0] || 'everyone')}.</div>
          <div class="huddle-summary-stats">
            <div class="huddle-stat">
              <div class="huddle-stat-n">${s.durationMinutes}m</div>
              <div class="huddle-stat-l">Duration</div>
            </div>
            <div class="huddle-stat">
              <div class="huddle-stat-n">${s.participants?.length || 1}</div>
              <div class="huddle-stat-l">Participants</div>
            </div>
          </div>
          <div class="huddle-summary-row"><strong>📛 Huddle:</strong> ${esc(s.name)}</div>
          ${s.assignmentTitle ? `<div class="huddle-summary-row"><strong>📚 Assignment:</strong> ${esc(s.assignmentTitle)}</div>` : ''}
          <div class="huddle-summary-row"><strong>👥 Participants:</strong> ${esc((s.participants || []).join(', '))}</div>
          ${s.notesSnippet ? `<div class="huddle-summary-row"><strong>📝 Notes saved.</strong> Open Drive to find your shared notes.</div>` : ''}
          <div class="huddle-summary-msg">${esc(msg)}</div>
          <div class="huddle-summary-actions">
            <button class="btn-summary-new" id="btn-summary-new-huddle">+ Start Another</button>
            <button class="btn-summary-back" id="btn-summary-back">Back to Today</button>
          </div>
        </div>
      </div>`;

    el('btn-summary-new-huddle')?.addEventListener('click', () => { _summary = null; renderEmpty(); openCreateModal(); });
    el('btn-summary-back')?.addEventListener('click', () => {
      _summary = null;
      if (window.showTodayView) window.showTodayView();
    });
  }

  // ── Create huddle modal ───────────────────────────────────────────────────
  async function openCreateModal() {
    // Pre-load assignments and slack users
    [_assignments, _slackUsers] = await Promise.all([
      api('/api/canvas/assignments?bucket=upcoming').then(d => d?.slice(0, 20) || []).catch(() => []),
      api('/api/huddle/slack-users').then(d => d || []).catch(() => []),
    ]);
    _selectedInvitees = [];

    const overlay = document.createElement('div');
    overlay.className = 'huddle-modal-overlay';
    overlay.id = 'huddle-create-overlay';
    overlay.innerHTML = `
      <div class="huddle-modal">
        <div class="huddle-modal-header">
          <div class="huddle-modal-title">🎥 Start a Study Huddle</div>
          <button class="huddle-modal-close" id="huddle-modal-close-btn">✕</button>
        </div>
        <!-- Steps indicator -->
        <div class="huddle-steps">
          <div class="huddle-step-dot active" id="step-dot-1">1</div>
          <div class="huddle-step-line" id="step-line-1"></div>
          <div class="huddle-step-dot" id="step-dot-2">2</div>
          <div class="huddle-step-line" id="step-line-2"></div>
          <div class="huddle-step-dot" id="step-dot-3">3</div>
        </div>

        <!-- Step 1: Name + Assignment -->
        <div class="huddle-modal-step active" id="huddle-step-1">
          <div class="huddle-field-group">
            <label class="huddle-field-label" for="huddle-name-input">Huddle Name</label>
            <input class="huddle-field-input" id="huddle-name-input" placeholder="e.g. Chem Lab Review" maxlength="80" value="Study Huddle" />
          </div>
          <div class="huddle-field-group">
            <label class="huddle-field-label">Canvas Assignment (optional)</label>
            <div class="huddle-hint">Link this huddle to an assignment for context</div>
            <div class="huddle-assignment-list" id="huddle-assignment-list">
              <div class="huddle-assignment-opt" data-id="" data-title="">
                <input type="radio" name="huddle-assignment" value="" checked /> No assignment
              </div>
              ${_assignments.map(a => `
                <div class="huddle-assignment-opt" data-id="${esc(String(a.id))}" data-title="${esc(a.name)}">
                  <input type="radio" name="huddle-assignment" value="${esc(String(a.id))}" />
                  ${esc(a.name)}
                </div>`).join('')}
            </div>
          </div>
          <div class="huddle-modal-footer">
            <button class="btn-huddle-next" id="step1-next">Next →</button>
          </div>
        </div>

        <!-- Step 2: Invite classmates -->
        <div class="huddle-modal-step" id="huddle-step-2">
          <div class="huddle-field-group">
            <label class="huddle-field-label">Invite Classmates (up to 3)</label>
            <div class="huddle-hint">Search by name — they'll get a Slack DM and see a notification here</div>
            <div class="huddle-people-search">
              <span class="huddle-people-search-icon">🔍</span>
              <input class="huddle-people-search-input" id="huddle-people-search" placeholder="Search classmates…" />
            </div>
            <div class="huddle-people-list" id="huddle-people-list"></div>
            <div class="huddle-selected-pills" id="huddle-selected-pills"></div>
          </div>
          <div class="huddle-modal-footer">
            <button class="btn-huddle-back" id="step2-back">← Back</button>
            <button class="btn-huddle-next" id="step2-next">Start Huddle →</button>
          </div>
        </div>

        <!-- Step 3: Starting -->
        <div class="huddle-modal-step" id="huddle-step-3">
          <div class="huddle-starting">
            <div class="huddle-starting-spinner"></div>
            <div class="huddle-starting-text">Starting your huddle…</div>
            <div class="huddle-starting-sub">Sending Slack invitations and setting up your workspace.</div>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Close
    el('huddle-modal-close-btn')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Assignment selection
    qsa('.huddle-assignment-opt', overlay).forEach(opt => {
      opt.addEventListener('click', () => {
        qsa('.huddle-assignment-opt input[type=radio]', overlay).forEach(r => r.checked = false);
        opt.querySelector('input[type=radio]').checked = true;
        qsa('.huddle-assignment-opt', overlay).forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
      });
    });

    // Step 1 → 2
    el('step1-next')?.addEventListener('click', () => {
      goToModalStep(2);
      renderPeopleList('');
    });

    // People search
    el('huddle-people-search')?.addEventListener('input', e => renderPeopleList(e.target.value));

    // Step 2 back/next
    el('step2-back')?.addEventListener('click', () => goToModalStep(1));
    el('step2-next')?.addEventListener('click', () => submitCreateHuddle(overlay));
  }

  function goToModalStep(n) {
    [1,2,3].forEach(i => {
      const dot  = el(`step-dot-${i}`);
      const step = el(`huddle-step-${i}`);
      if (dot)  dot.classList.toggle('active', i === n);
      if (dot)  dot.classList.toggle('done', i < n);
      if (step) step.classList.toggle('active', i === n);
    });
    [1,2].forEach(i => {
      const line = el(`step-line-${i}`);
      if (line) line.classList.toggle('done', i < n);
    });
  }

  function renderPeopleList(query) {
    const list = el('huddle-people-list');
    if (!list) return;
    const q = query.toLowerCase();
    const filtered = _slackUsers.filter(u => {
      if (_user?.name && u.name === _user.name) return false; // exclude self
      return !q || u.name.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
    }).slice(0, 30);

    list.innerHTML = filtered.length ? filtered.map(u => {
      const sel = _selectedInvitees.find(s => s.id === u.id);
      return `<div class="huddle-person-row${sel ? ' selected' : ''}" data-slack-id="${esc(u.id)}" data-slack-name="${esc(u.name)}">
        <div class="huddle-person-avatar">${esc(initials(u.name))}</div>
        <div class="huddle-person-name">${esc(u.name)}${u.displayName && u.displayName !== u.name ? ` <span style="color:#94a3b8;font-size:.78rem">(${esc(u.displayName)})</span>` : ''}</div>
        ${sel ? '<span class="huddle-person-check">✓</span>' : ''}
      </div>`;
    }).join('') : '<div style="padding:12px;font-size:.84rem;color:#94a3b8;text-align:center">No classmates found</div>';

    list.querySelectorAll('.huddle-person-row').forEach(row => {
      row.addEventListener('click', () => toggleInvitee({ id: row.dataset.slackId, name: row.dataset.slackName }));
    });
  }

  function toggleInvitee(person) {
    const idx = _selectedInvitees.findIndex(s => s.id === person.id);
    if (idx >= 0) {
      _selectedInvitees.splice(idx, 1);
    } else {
      if (_selectedInvitees.length >= 3) { showHuddleToast('Max 3 invites at once.', 'warn'); return; }
      _selectedInvitees.push(person);
    }
    renderSelectedPills();
    renderPeopleList(el('huddle-people-search')?.value || '');
  }

  function renderSelectedPills() {
    const container = el('huddle-selected-pills');
    if (!container) return;
    container.innerHTML = _selectedInvitees.map(p => `
      <div class="huddle-pill" data-id="${esc(p.id)}">
        ${esc(p.name)} <span class="huddle-pill-remove" data-id="${esc(p.id)}">✕</span>
      </div>`).join('');
    container.querySelectorAll('.huddle-pill-remove').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        _selectedInvitees = _selectedInvitees.filter(s => s.id !== btn.dataset.id);
        renderSelectedPills();
        renderPeopleList(el('huddle-people-search')?.value || '');
      });
    });
  }

  async function submitCreateHuddle(overlay) {
    goToModalStep(3);

    const name = (el('huddle-name-input')?.value || 'Study Huddle').trim();
    const selectedAssignment = qs('.huddle-assignment-opt input[type=radio]:checked');
    const assignmentId    = selectedAssignment?.value || null;
    const assignmentTitle = selectedAssignment?.closest('.huddle-assignment-opt')?.dataset.title || null;
    const invitees        = _selectedInvitees.map(p => p.id);

    const result = await api('/api/huddle/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ huddleName: name, assignmentId, assignmentTitle, invitees }),
      parseError: true,
    });

    overlay.remove();

    if (result?.id) {
      _huddle = result.huddle;
      renderWorkspace();
      showHuddleToast('Huddle started!');
    } else {
      showHuddleToast(result?.error || 'Could not start huddle.', 'error');
    }
  }

  // ── Quick invite modal ────────────────────────────────────────────────────
  async function openInviteQuickModal() {
    if (!_huddle?.canInvite) return;
    if (!_huddle) return;
    // Reentrancy guard — a fast double-click on "+Invite" (before the first
    // click's overlay is in the DOM, or between the two await points below)
    // would otherwise append a second overlay with duplicate child IDs
    // (invite-quick-list/-search/-pills/-send). getElementById always
    // returns the first match, so the second (visually on-top, currently
    // open) modal's interactions would silently update the first modal's
    // list instead of its own.
    if (document.getElementById('huddle-invite-quick-overlay')) return;
    if (_slackUsers.length === 0) {
      _slackUsers = await api('/api/huddle/slack-users').then(d => d || []).catch(() => []);
    }
    // Re-check after the await above — a second click could have landed
    // and already appended its overlay while this one was awaiting.
    if (document.getElementById('huddle-invite-quick-overlay')) return;
    _selectedInvitees = [];

    const overlay = document.createElement('div');
    overlay.className = 'huddle-modal-overlay';
    overlay.id = 'huddle-invite-quick-overlay';
    overlay.innerHTML = `
      <div class="huddle-modal" style="max-width:400px">
        <div class="huddle-modal-header">
          <div class="huddle-modal-title">+ Invite a Classmate</div>
          <button class="huddle-modal-close" id="invite-quick-close">✕</button>
        </div>
        <div class="huddle-people-search">
          <span class="huddle-people-search-icon">🔍</span>
          <input class="huddle-people-search-input" id="invite-quick-search" placeholder="Search classmates…" />
        </div>
        <div class="huddle-people-list" id="invite-quick-list" style="max-height:240px"></div>
        <div class="huddle-selected-pills" id="invite-quick-pills"></div>
        <div class="huddle-modal-footer" style="margin-top:16px">
          <button class="btn-huddle-next" id="invite-quick-send">Send Invites</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const renderList = (q = '') => {
      const list = el('invite-quick-list');
      const filtered = _slackUsers.filter(u => {
        // Names are presentation only: don't hide a different account with the same name.
        return !q || u.name.toLowerCase().includes(q.toLowerCase());
      }).slice(0, 20);
      list.innerHTML = filtered.map(u => {
        const sel = _selectedInvitees.find(s => s.id === u.id);
        return `<div class="huddle-person-row${sel?' selected':''}" data-slack-id="${esc(u.id)}" data-slack-name="${esc(u.name)}">
          <div class="huddle-person-avatar">${esc(initials(u.name))}</div>
          <div class="huddle-person-name">${esc(u.name)}</div>
          ${sel ? '<span class="huddle-person-check">✓</span>' : ''}
        </div>`;
      }).join('');
      list.querySelectorAll('.huddle-person-row').forEach(row => {
        row.addEventListener('click', () => {
          const p = { id: row.dataset.slackId, name: row.dataset.slackName };
          const idx = _selectedInvitees.findIndex(s => s.id === p.id);
          if (idx >= 0) _selectedInvitees.splice(idx, 1);
          else if (_selectedInvitees.length < 3) _selectedInvitees.push(p);
          renderList(el('invite-quick-search')?.value || '');
          const pills = el('invite-quick-pills');
          if (pills) pills.innerHTML = _selectedInvitees.map(p => `<div class="huddle-pill">${esc(p.name)}</div>`).join('');
        });
      });
    };

    renderList();
    el('invite-quick-search')?.addEventListener('input', e => renderList(e.target.value));
    el('invite-quick-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    el('invite-quick-send')?.addEventListener('click', async () => {
      if (!_selectedInvitees.length) { overlay.remove(); return; }
      // The server records each invitation and attempts its Slack notification.
      try {
        for (const p of _selectedInvitees) {
          const result = await api(`/api/huddle/${_huddle.id}/join`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Invite-Slack-Id': p.id, 'X-Invitee-Name': p.name },
            parseError: true,
          });
          if (!result?.ok) throw new Error(result?.error || 'Could not send invitation.');
          _huddle = result.huddle;
        }
        overlay.remove();
        showHuddleToast(`Invited ${_selectedInvitees.map(p => p.name).join(', ')}!`);
        refreshScreens();
      } catch (err) { showHuddleToast(err.message, 'error'); }
    });
  }

  // ── Toast ─────────────────────────────────────────────────────────────────
  function showHuddleToast(text, type = 'success') {
    if (window.showToast) { window.showToast(text, type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'success'); return; }
    console.log('[Huddle]', text);
  }

  // ── Teacher dashboard: active huddles in Today tab ────────────────────────
  async function loadTeacherHuddles() {
    if (!_user?.isTeacher) return;
    const huddles = await api('/api/huddle/active');
    const container = el('htv-teacher-huddles');
    if (!container) return;

    if (!huddles?.length) {
      container.innerHTML = '<div class="htv-empty-state">No active student huddles right now.</div>';
      return;
    }

    container.innerHTML = huddles.map(h => {
      const elapsed = Math.round((Date.now() - new Date(h.startedAt)) / 60000);
      return `<div class="teacher-huddle-row" data-huddle-id="${esc(h.id)}">
        <div class="teacher-huddle-info">
          <div class="teacher-huddle-name">${esc(h.name)}</div>
          <div class="teacher-huddle-meta">Host: ${esc(h.hostName)} · ${elapsed}m ago${h.assignmentTitle ? ` · ${esc(h.assignmentTitle)}` : ''}</div>
          <div class="teacher-huddle-participants">👥 ${esc(h.participants.join(', '))}</div>
          ${h.notesSnippet ? `<div class="teacher-huddle-notes-preview">"${esc(h.notesSnippet)}"</div>` : ''}
        </div>
        <div class="teacher-huddle-actions">
          <button class="teacher-huddle-btn" data-action="message" data-id="${esc(h.id)}">✉ Message</button>
        </div>
      </div>`;
    }).join('');

    container.querySelectorAll('[data-action="message"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const text = prompt('Message to send to this huddle:');
        if (!text?.trim()) return;
        const sent = await api(`/api/huddle/${btn.dataset.id}/teacher-message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
        });
        if (sent?.ok) showHuddleToast('Message sent to huddle!');
        else showHuddleToast('Could not send message.', 'error');
      });
    });
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  document.addEventListener('ysc:sessionReady', e => {
    _user = e.detail;
  });

  document.addEventListener('DOMContentLoaded', () => {
    // Teacher: load active huddles in Today tab
    document.addEventListener('ysc:sessionReady', () => {
      if (_user?.isTeacher) {
        loadTeacherHuddles();
        setInterval(loadTeacherHuddles, 30000);
      }
    });

    // Virtual Meetings tab is opened by hub-tabs.js, which calls window.onMeetingsTabOpen
    window.onMeetingsTabOpen  = onMeetingsTabOpen;
    window.onMeetingsTabClose = onMeetingsTabClose;
  });

})();
