/* YSC Teacher Dashboard — Active Huddles panel + join workspace overlay
   Reuses the existing Study Huddle backend (routes/huddle.js) untouched —
   no new API routes. Uses the dashboard's own global `api()` (throw-based,
   see teacher.js) rather than huddle.js's internal null-on-failure helper,
   which is IIFE-scoped in that file and not reachable from here anyway. */

let _teacherName          = null;
let _activeHuddle         = null;
let _huddlesListInterval  = null;
let _huddleOverlayInterval = null;
let _huddleChatSeen       = 0;

async function getTeacherName() {
  if (_teacherName) return _teacherName;
  try {
    const me = await api('/api/teacher/me');
    _teacherName = me?.name || me?.username || '';
  } catch { _teacherName = ''; }
  return _teacherName;
}

// ── Panel: Active Huddles list ──────────────────────────────────────────────
async function loadHuddlesPanel() {
  const list = document.getElementById('th-huddles-list');
  if (!list) return;
  getTeacherName();

  let huddles;
  try {
    huddles = await api('/api/huddle/active');
  } catch (err) {
    list.innerHTML = `<div class="empty-state">Could not load active huddles (${esc(err.message)}).</div>`;
    return;
  }
  renderHuddlesList(huddles || []);

  if (!_huddlesListInterval) {
    _huddlesListInterval = setInterval(() => {
      if (state.activePanel !== 'huddles') {
        clearInterval(_huddlesListInterval);
        _huddlesListInterval = null;
        return;
      }
      loadHuddlesPanel();
    }, 30000);
  }
}

function renderHuddlesList(huddles) {
  const list  = document.getElementById('th-huddles-list');
  const count = document.getElementById('th-huddles-count');
  if (count) count.textContent = `${huddles.length} active`;
  if (!list) return;

  if (!huddles.length) {
    list.innerHTML = '<div class="empty-state">No active student huddles right now.</div>';
    return;
  }

  list.innerHTML = huddles.map(h => {
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(h.startedAt)) / 60000));
    return `<div class="th-huddle-row">
      <div class="th-huddle-row-info">
        <div class="th-huddle-row-name">${esc(h.name)}</div>
        <div class="th-huddle-row-meta">Host: ${esc(h.hostName)} · ${elapsed}m ago${h.assignmentTitle ? ` · ${esc(h.assignmentTitle)}` : ''}</div>
        <div class="th-huddle-row-participants">👥 ${esc(h.participants.join(', '))}</div>
        ${h.notesSnippet ? `<div class="th-huddle-row-notes">"${esc(h.notesSnippet)}"</div>` : ''}
      </div>
      <button class="th-huddle-join-btn" data-id="${esc(h.id)}">Join</button>
    </div>`;
  }).join('');

  list.querySelectorAll('.th-huddle-join-btn').forEach(btn => {
    btn.addEventListener('click', () => joinHuddleAsTeacher(btn.dataset.id, btn));
  });
}

// ── Start a Huddle ───────────────────────────────────────────────────────────
let _thcSlackUsers      = [];
let _thcSelectedInvitees = []; // [{id, name}]

async function openStartHuddleForm() {
  const form = document.getElementById('th-huddle-create-form');
  if (!form) return;
  await getTeacherName();
  form.style.display = '';
  document.getElementById('thc-name').value = 'Study Huddle';
  document.getElementById('thc-invite-search').value = '';
  _thcSelectedInvitees = [];
  renderThcPills();
  document.getElementById('thc-invite-list').innerHTML = '';
  loadThcSlackUsers();
}

function closeStartHuddleForm() {
  const form = document.getElementById('th-huddle-create-form');
  if (form) form.style.display = 'none';
}

async function loadThcSlackUsers() {
  try {
    _thcSlackUsers = await api('/api/huddle/slack-users') || [];
  } catch { _thcSlackUsers = []; }
  renderThcInviteList('');
}

function renderThcInviteList(query) {
  const list = document.getElementById('thc-invite-list');
  if (!list) return;
  const q = query.toLowerCase();
  const filtered = _thcSlackUsers.filter(u => {
    if (_teacherName && u.name === _teacherName) return false; // exclude self
    return !q || u.name.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q);
  }).slice(0, 20);

  list.innerHTML = filtered.length
    ? filtered.map(u => {
        const sel = _thcSelectedInvitees.find(s => s.id === u.id);
        return `<div class="th-invite-row${sel ? ' selected' : ''}" data-id="${esc(u.id)}" data-name="${esc(u.name)}">
          <span>${esc(u.name)}</span>${sel ? '<span class="th-invite-check">✓</span>' : ''}
        </div>`;
      }).join('')
    : '<div class="th-invite-empty">No matches</div>';

  list.querySelectorAll('.th-invite-row').forEach(row => {
    row.addEventListener('click', () => toggleThcInvitee({ id: row.dataset.id, name: row.dataset.name }));
  });
}

function toggleThcInvitee(person) {
  const idx = _thcSelectedInvitees.findIndex(s => s.id === person.id);
  if (idx >= 0) {
    _thcSelectedInvitees.splice(idx, 1);
  } else {
    if (_thcSelectedInvitees.length >= 3) { showToast('Max 3 invites at once.'); return; }
    _thcSelectedInvitees.push(person);
  }
  renderThcPills();
  renderThcInviteList(document.getElementById('thc-invite-search')?.value || '');
}

function renderThcPills() {
  const container = document.getElementById('thc-invite-pills');
  if (!container) return;
  container.innerHTML = _thcSelectedInvitees.map(p => `
    <span class="th-invite-pill" data-id="${esc(p.id)}">${esc(p.name)} <span class="th-invite-pill-remove" data-id="${esc(p.id)}">✕</span></span>`).join('');
  container.querySelectorAll('.th-invite-pill-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      _thcSelectedInvitees = _thcSelectedInvitees.filter(s => s.id !== btn.dataset.id);
      renderThcPills();
      renderThcInviteList(document.getElementById('thc-invite-search')?.value || '');
    });
  });
}

async function submitStartHuddle() {
  const btn  = document.getElementById('thc-start-btn');
  const name = (document.getElementById('thc-name')?.value || 'Study Huddle').trim();
  if (btn) { btn.disabled = true; btn.textContent = 'Starting…'; }
  try {
    const result = await api('/api/huddle/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ huddleName: name, invitees: _thcSelectedInvitees.map(p => p.id) }),
    });
    if (!result?.id) { showToast('Could not start huddle.'); return; }
    closeStartHuddleForm();
    openHuddleOverlay(result.huddle);
  } catch (err) {
    showToast('Could not start huddle: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Start Huddle'; }
  }
}

// ── Join ─────────────────────────────────────────────────────────────────────
async function joinHuddleAsTeacher(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Joining…'; }
  try {
    const result = await api(`/api/huddle/${id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!result?.ok) { showToast('Could not join that huddle — it may have just ended.'); return; }
    openHuddleOverlay(result.huddle);
  } catch (err) {
    showToast('Could not join huddle: ' + err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Join'; }
  }
}

// ── Overlay ──────────────────────────────────────────────────────────────────
async function openHuddleOverlay(huddle) {
  _activeHuddle   = huddle;
  _huddleChatSeen = 0;
  await getTeacherName();

  const overlay = document.getElementById('teacher-huddle-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  renderHuddleOverlayHeader();
  renderHuddleGrid();
  loadHuddleNotes();
  loadHuddleChatMessages();

  if (!_huddleOverlayInterval) {
    _huddleOverlayInterval = setInterval(refreshHuddleOverlay, 5000);
  }
}

function renderHuddleOverlayHeader() {
  const h = _activeHuddle;
  const titleEl = document.getElementById('th-huddle-overlay-title');
  const metaEl  = document.getElementById('th-huddle-overlay-meta');
  if (titleEl) titleEl.textContent = h.name || 'Study Huddle';
  if (metaEl)  metaEl.textContent  = `Host: ${h.hostName}${h.assignmentTitle ? ` · ${h.assignmentTitle}` : ''}`;
}

function initials(name) {
  return (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function renderHuddleGrid() {
  const grid = document.getElementById('th-huddle-grid');
  if (!grid || !_activeHuddle) return;
  const h = _activeHuddle;
  grid.innerHTML = (h.participants || []).map(name => `
    <div class="th-huddle-tile${name === h.hostName ? ' is-host' : ''}">
      <div class="th-huddle-tile-avatar">${esc(initials(name))}</div>
      <div class="th-huddle-tile-name">${esc(name)}${name === _teacherName ? ' (you)' : ''}</div>
      ${name === h.hostName ? '<div class="th-huddle-tile-badge">Host</div>' : ''}
    </div>`).join('');
}

async function refreshHuddleOverlay() {
  if (!_activeHuddle || document.getElementById('teacher-huddle-overlay')?.style.display === 'none') {
    clearInterval(_huddleOverlayInterval);
    _huddleOverlayInterval = null;
    return;
  }
  try {
    const h = await api(`/api/huddle/${_activeHuddle.id}`);
    if (!h || h.status !== 'active') {
      showToast('This huddle has ended.');
      closeHuddleOverlay(false);
      return;
    }
    _activeHuddle = h;
    renderHuddleOverlayHeader();
    renderHuddleGrid();
    loadHuddleChatMessages();
  } catch {
    // transient network error — try again on the next tick
  }
}

// ── Notes ────────────────────────────────────────────────────────────────────
let _notesSaveTimer = null;

async function loadHuddleNotes() {
  const input = document.getElementById('th-huddle-notes-input');
  if (!input || !_activeHuddle) return;
  try {
    const d = await api(`/api/huddle/${_activeHuddle.id}/notes`);
    input.value = d?.notes || '';
  } catch { /* leave whatever's there */ }
}

function scheduleNotesSave() {
  const statusEl = document.getElementById('th-huddle-notes-status');
  if (statusEl) statusEl.textContent = 'Saving…';
  clearTimeout(_notesSaveTimer);
  _notesSaveTimer = setTimeout(async () => {
    const input = document.getElementById('th-huddle-notes-input');
    if (!input || !_activeHuddle) return;
    try {
      await api(`/api/huddle/${_activeHuddle.id}/notes`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: input.value }),
      });
      if (statusEl) statusEl.textContent = 'Saved';
    } catch {
      if (statusEl) statusEl.textContent = 'Could not save';
    }
  }, 1200);
}

// ── Chat ─────────────────────────────────────────────────────────────────────
async function loadHuddleChatMessages() {
  if (!_activeHuddle) return;
  try {
    const d = await api(`/api/huddle/${_activeHuddle.id}/chat?since=${_huddleChatSeen}`);
    if (d?.messages?.length) appendChatMessages(d.messages);
    if (typeof d?.total === 'number') _huddleChatSeen = d.total;
  } catch { /* try again next tick */ }
}

function appendChatMessages(msgs) {
  const box = document.getElementById('th-huddle-chat-messages');
  if (!box) return;
  const wasAtBottom = box.scrollTop + box.clientHeight >= box.scrollHeight - 20;
  msgs.forEach(m => {
    const div = document.createElement('div');
    const isAi = m.role === 'assistant';
    const isMe = !isAi && m.name === _teacherName;
    div.className = 'th-huddle-chat-msg' + (isAi ? ' from-ai' : isMe ? ' from-teacher' : '');
    div.innerHTML = `<div class="th-huddle-chat-msg-name">${esc(isAi ? 'YSC Assistant' : m.name)}</div>
      <div class="th-huddle-chat-msg-bubble">${esc(m.text)}</div>`;
    box.appendChild(div);
  });
  if (wasAtBottom) box.scrollTop = box.scrollHeight;
}

async function sendHuddleChatMessage() {
  const input = document.getElementById('th-huddle-chat-input');
  const text  = (input?.value || '').trim();
  if (!text || !_activeHuddle) return;
  input.value = '';
  try {
    await api(`/api/huddle/${_activeHuddle.id}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: text }),
    });
    loadHuddleChatMessages();
  } catch (err) {
    showToast('Message could not be sent: ' + err.message);
  }
}

// ── Leave ────────────────────────────────────────────────────────────────────
async function closeHuddleOverlay(callLeave = true) {
  if (callLeave && _activeHuddle) {
    api(`/api/huddle/${_activeHuddle.id}/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }).catch(() => {});
  }
  const overlay = document.getElementById('teacher-huddle-overlay');
  if (overlay) overlay.style.display = 'none';
  _activeHuddle = null;
  if (_huddleOverlayInterval) { clearInterval(_huddleOverlayInterval); _huddleOverlayInterval = null; }
  if (state.activePanel === 'huddles') loadHuddlesPanel();
}

// ── Wiring ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('th-huddle-leave-btn')?.addEventListener('click', () => closeHuddleOverlay(true));
  document.getElementById('th-huddle-chat-send-btn')?.addEventListener('click', sendHuddleChatMessage);
  document.getElementById('th-huddle-chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendHuddleChatMessage(); }
  });
  document.getElementById('th-huddle-notes-input')?.addEventListener('input', scheduleNotesSave);
  document.getElementById('th-huddles-refresh-btn')?.addEventListener('click', loadHuddlesPanel);

  document.getElementById('th-start-huddle-btn')?.addEventListener('click', openStartHuddleForm);
  document.getElementById('thc-cancel-btn')?.addEventListener('click', closeStartHuddleForm);
  document.getElementById('thc-start-btn')?.addEventListener('click', submitStartHuddle);
  document.getElementById('thc-invite-search')?.addEventListener('input', e => renderThcInviteList(e.target.value));

  // Relocated from the Zoom Links panel into this one's header row —
  // startZoomMeeting() itself (global, defined in teacher.js) is unchanged.
  document.getElementById('zoom-start-instant-btn')?.addEventListener('click', () => startZoomMeeting('instant'));
  document.getElementById('zoom-start-class-btn')?.addEventListener('click', () => startZoomMeeting('recurring'));
});
