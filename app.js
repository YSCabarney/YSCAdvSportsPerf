/* YSC Student Hub — Frontend */

// ── Safe fetch wrapper — guards against HTML error pages on mobile ─────────
// Returns { error, ok: false } instead of throwing on non-JSON or 401.
async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, { credentials: 'include', ...options });
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      console.error('[API] Non-JSON response from:', url, 'status:', res.status);
      return { error: 'Server error', ok: false };
    }
    const data = await res.json();
    if (data.needsLogin) {
      showSessionExpiredMessage();
      return { error: 'Session expired', ok: false };
    }
    return data;
  } catch (err) {
    console.error('[Fetch Error]', url, err.message);
    return { error: err.message, ok: false };
  }
}

function showSessionExpiredMessage() {
  if (document.getElementById('session-expired-msg')) return;
  const msg = document.createElement('div');
  msg.id = 'session-expired-msg';
  msg.style.cssText = [
    'position:fixed', 'top:70px', 'left:50%',
    'transform:translateX(-50%)',
    'background:var(--sp-yellow)', 'color:var(--sp-ink)',
    'border:2px solid var(--sp-ink)',
    'padding:12px 20px', 'border-radius:22px',
    'z-index:99999', 'font-size:13px',
    'text-align:center', 'font-weight:700',
    'box-shadow:var(--sp-shadow)',
  ].join(';');
  msg.innerHTML = 'Your session expired. <a href="/login" style="color:var(--sp-ink);font-weight:700;text-decoration:underline">Tap to sign in again</a>';
  document.body.appendChild(msg);
}

// ── External link helper — mobile Safari blocks window.open from async code ──
const _isMobile = /Mobi|iPhone|iPad|Android/i.test(navigator.userAgent);

function openExternalLink(url) {
  if (!url) return;
  if (_isMobile) {
    window.location.href = url;
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

// Global delegated handler for real <a href> tags and anything explicitly
// marked data-external-link. Runs on capture so it fires before any child
// click handlers that stopPropagation.
//
// Used to match any [data-url]/[data-href] element — too broad: several
// unrelated elements carry data-url as incidental metadata for their own
// click handler (e.g. .course-item's data-url, read by selectCourse() to
// build an in-app detail view; .chat-copy-btn's data-url, read by its own
// clipboard-copy handler), and on mobile this listener would intercept
// the click first, hard-navigating the tab to that URL instead of ever
// running the element's real handler. Found via a real bug report: a
// Canvas course click did nothing beyond navigating away, because
// selectCourse() never got a chance to run.
//
// Nothing currently needs data-external-link — the one plausible
// candidate (.zoom-join-link-btn in huddle.js) already handles mobile
// itself via openZoomPopup()'s own `location.href` fallback for narrow
// viewports, so it was never actually relying on this listener; removing
// its incidental data-url match here doesn't change its behavior.
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href], [data-external-link]');
  if (!link) return;
  const url = link.getAttribute('href') || link.dataset.url || link.dataset.href;
  if (!url || url.startsWith('#') || url.startsWith('/') || url.startsWith('javascript')) return;
  // Only intercept external URLs on mobile (desktop lets the browser handle target="_blank")
  if (!_isMobile) return;
  e.preventDefault();
  window.location.href = url;
}, true); // capture phase

// ── Session-based Identity ─────────────────────────────────────────────────
let _sessionUser = null;

function getStudentName() {
  return _sessionUser?.name || '';
}

async function initSession() {
  try {
    const data = await safeFetch('/api/session/me');
    if (!data || !data.authenticated) {
      window.location.href = '/login';
      return null;
    }
    // A fresh load with a confirmed-valid session — safe to let apiFetch()
    // redirect again on some future genuine 401 (see REDIRECT_GUARD_KEY).
    sessionStorage.removeItem(REDIRECT_GUARD_KEY);
    _sessionUser = data;
    window._sessionUser = data;
    applySessionToUI(data);
    return data;
  } catch {
    window.location.href = '/login';
    return null;
  }
}

function applySessionToUI(user) {
  // Header avatar + name pill
  const avatar = document.getElementById('headerAvatar');
  const initial = document.getElementById('headerAvatarInitial');
  const nameEl  = document.getElementById('headerStudentName');
  if (user.photo && avatar) {
    avatar.src = user.photo;
    avatar.style.display = 'block';
    if (initial) initial.style.display = 'none';
  } else if (initial) {
    initial.textContent = (user.name || '?')[0].toUpperCase();
    initial.style.color = '#fff';
  }
  if (nameEl) nameEl.textContent = (user.name || '').split(' ')[0];

  // Profile dropdown
  const profilePhoto = document.getElementById('profilePhoto');
  const profileInitial = document.getElementById('profileInitialBig');
  if (user.photo && profilePhoto) {
    profilePhoto.src = user.photo;
    profilePhoto.style.display = 'block';
    if (profileInitial) profileInitial.style.display = 'none';
  } else if (profileInitial) {
    profileInitial.textContent = (user.name || '?')[0].toUpperCase();
    profileInitial.style.display = 'flex';
  }

  const profileName  = document.getElementById('profileName');
  const profileEmail = document.getElementById('profileEmail');
  if (profileName)  profileName.textContent  = user.name  || '';
  if (profileEmail) profileEmail.textContent = user.email || '';

  // Slack service row — services.slack is true for auto-link OR a real OAuth
  // token; services.slackHasUserToken is true only for the latter. This dot
  // is what tells a student they're set up for as-user mentor-chat posting,
  // so it must reflect the real token specifically — auto-link alone (which
  // most students get automatically on login, no action needed) doesn't
  // grant that. Using services.slack here previously showed "Connected" for
  // every auto-linked student regardless of whether they'd ever done the
  // real /auth/slack OAuth consent.
  updateProfileSlackStatus(user.services?.slackHasUserToken, user.services?.slackUser);

  // If Slack auto-link failed, inject a notice into the Slack panel once it renders
  if (user.slackAutoLinkFailed) {
    const injectSlackConnectBanner = () => {
      const panel = document.querySelector('.panel-slack .slack-main') || document.querySelector('.panel-slack');
      if (!panel || document.getElementById('slack-connect-banner')) return;
      const banner = document.createElement('div');
      banner.id = 'slack-connect-banner';
      banner.style.cssText = 'background:var(--sp-paper);border:2px solid var(--sp-ink);border-left:4px solid var(--sp-blue);border-radius:16px;padding:12px 16px;font-family:var(--sp-font-body);font-size:14px;color:var(--sp-ink);margin:0 0 8px;display:flex;align-items:center;gap:10px;';
      banner.innerHTML = 'Slack is connecting automatically — if channels don\'t appear within a few seconds, try refreshing the page. If the problem persists, contact your mentor.';
      panel.insertBefore(banner, panel.firstChild);
    };
    injectSlackConnectBanner();
    setTimeout(injectSlackConnectBanner, 1500);
    document.addEventListener('slackPanelReady', injectSlackConnectBanner, { once: true });
  }

  // The student's own time zone (teachers are Eastern; many students aren't) — reminders, study blocks and the
  // coach's times use it. Server accepts only real IANA zones (lib/student-tz.js).
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) fetch('/api/student/timezone', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tz }) }).catch(() => {});
  } catch { /* old browser — the server keeps its default */ }

  document.dispatchEvent(new CustomEvent('ysc:sessionReady', { detail: user }));
}

// ── "Connect your Slack" prompt after login ─────────────────────────────────
// Students message teachers through Slack, and a message only goes out as the
// student (their name, replies coming back to them) once they've connected
// their own Slack account — otherwise the hub refuses to send rather than post
// as the Student Hub app. The first-login wizard has a Slack step, but returning
// students who skipped it were never asked again. This is a gentle, dismissible
// dialog for anyone not connected: snoozed for 3 days on "Not now", and it stops
// asking on its own after 3 dismissals (the profile menu and the teacher-message
// card still offer Connect Slack any time).
const SLACK_PROMPT_KEY = 'ysc-slack-prompt';
const SLACK_PROMPT_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
const SLACK_PROMPT_MAX_DISMISSALS = 3;

function _slackPromptState(email) {
  try {
    const all = JSON.parse(localStorage.getItem(SLACK_PROMPT_KEY) || '{}');
    return all[(email || '').toLowerCase()] || { dismissals: 0, until: 0 };
  } catch { return { dismissals: 0, until: 0 }; }
}
function _slackPromptSnooze(email) {
  try {
    const all = JSON.parse(localStorage.getItem(SLACK_PROMPT_KEY) || '{}');
    const k = (email || '').toLowerCase();
    const cur = all[k] || { dismissals: 0, until: 0 };
    all[k] = { dismissals: cur.dismissals + 1, until: Date.now() + SLACK_PROMPT_SNOOZE_MS };
    localStorage.setItem(SLACK_PROMPT_KEY, JSON.stringify(all));
  } catch { /* storage unavailable — worst case the prompt shows again next login */ }
}

function maybePromptSlackConnect(user) {
  if (!user || user.services?.slackHasUserToken) return;   // already connected as themselves
  if (user.isFirstLogin) return;                           // the setup wizard has its own Slack step
  if (window._slackJustReturned) {                         // just came back from Slack's consent screen
    if (window._slackDenied) _slackPromptSnooze(user.email); // they said no — don't ask again right away
    return;
  }
  const st = _slackPromptState(user.email);
  if (st.dismissals >= SLACK_PROMPT_MAX_DISMISSALS || Date.now() < st.until) return;

  // Wait a beat, and for the one-time Home intro tip to clear, so two prompts
  // never stack; skip this login entirely if another dialog is open.
  let waited = 0;
  const attempt = () => {
    if (document.querySelector('.home-intro-tip') && waited < 15000) { waited += 1000; setTimeout(attempt, 1000); return; }
    const otherDialogOpen = [...document.querySelectorAll('.modal-overlay, .soc-edit-overlay, .soc-popup-overlay')]
      .some(el => getComputedStyle(el).display !== 'none' && el.id !== 'slack-prompt-overlay');
    if (otherDialogOpen || document.getElementById('slack-prompt-overlay')) return;
    _showSlackPrompt(user);
  };
  // Second-priority slot — Canvas-connect (the highest-value nudge, for students with no Canvas
  // access at all) now owns the first 2500ms slot; see its own comment for the stagger reasoning.
  setTimeout(attempt, 3500);
}

function _showSlackPrompt(user) {
  const overlay = document.createElement('div');
  overlay.id = 'slack-prompt-overlay';
  overlay.className = 'soc-edit-overlay';
  overlay.innerHTML = `
    <div class="soc-edit-modal slack-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="slack-prompt-title">
      <div class="soc-edit-header"><span id="slack-prompt-title">💬 Connect your Slack</span></div>
      <div class="soc-edit-body">
        <p class="slack-prompt-lead">Slack is how you reach your teachers — and how they reach you.</p>
        <ul class="slack-prompt-list">
          <li>Your messages come from <strong>you</strong>, with your name — not from the Student Hub app.</li>
          <li>Your teachers’ replies come straight back to you.</li>
          <li>It takes about 10 seconds, once.</li>
        </ul>
        <p class="slack-prompt-foot">You can also do this any time from your profile menu.</p>
      </div>
      <div class="soc-edit-footer">
        <button type="button" class="soc-edit-cancel-btn" id="slack-prompt-later">Not now</button>
        <button type="button" class="soc-edit-save-btn" id="slack-prompt-connect">Connect Slack</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('soc-popup-open'));

  const close = snooze => {
    if (snooze) _slackPromptSnooze(user.email);
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('soc-popup-open');
    setTimeout(() => overlay.remove(), 260);
  };
  const onKey = e => { if (e.key === 'Escape') close(true); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(true); });
  overlay.querySelector('#slack-prompt-later').addEventListener('click', () => close(true));
  overlay.querySelector('#slack-prompt-connect').addEventListener('click', () => { window.location.href = '/auth/slack'; });
  overlay.querySelector('#slack-prompt-connect').focus();
}

// Nudge for a student with NO Canvas connection at all — distinct from the rescope nudge below
// (that one only fires when Canvas IS connected but is missing newer scopes). Root cause worth
// knowing: the onboarding wizard's Canvas checklist item was hardcoded "done" until 2026-09-30
// (see showSetupWizard()'s real services.canvas check, added that day) — any student who went
// through setup before that fix was told Canvas was connected regardless of whether it actually
// was, so a real share of "never connected" students likely believed it already was. Highest
// priority of the three login nudges (fires first, at 2500ms) since Canvas access is foundational
// to most of what the coach can do.
const CANVAS_CONNECT_KEY = 'ysc-canvas-connect-prompt';
const CANVAS_CONNECT_SNOOZE_MS = 5 * 24 * 60 * 60 * 1000;
const CANVAS_CONNECT_MAX_DISMISSALS = 3;

function _canvasConnectState(email) {
  try {
    const all = JSON.parse(localStorage.getItem(CANVAS_CONNECT_KEY) || '{}');
    return all[(email || '').toLowerCase()] || { dismissals: 0, until: 0 };
  } catch { return { dismissals: 0, until: 0 }; }
}
function _canvasConnectSnooze(email) {
  try {
    const all = JSON.parse(localStorage.getItem(CANVAS_CONNECT_KEY) || '{}');
    const k = (email || '').toLowerCase();
    const cur = all[k] || { dismissals: 0, until: 0 };
    all[k] = { dismissals: cur.dismissals + 1, until: Date.now() + CANVAS_CONNECT_SNOOZE_MS };
    localStorage.setItem(CANVAS_CONNECT_KEY, JSON.stringify(all));
  } catch { /* storage unavailable — worst case the prompt shows again next login */ }
}

function maybePromptCanvasConnect(user) {
  if (!user || user.services?.canvas) return;   // already connected
  if (user.isFirstLogin) return;                 // the setup wizard's own Canvas step covers this
  const st = _canvasConnectState(user.email);
  if (st.dismissals >= CANVAS_CONNECT_MAX_DISMISSALS || Date.now() < st.until) return;

  let waited = 0;
  const attempt = () => {
    if (document.querySelector('.home-intro-tip') && waited < 15000) { waited += 1000; setTimeout(attempt, 1000); return; }
    const otherDialogOpen = [...document.querySelectorAll('.modal-overlay, .soc-edit-overlay, .soc-popup-overlay')]
      .some(el => getComputedStyle(el).display !== 'none' && el.id !== 'canvas-connect-prompt-overlay');
    if (otherDialogOpen || document.getElementById('canvas-connect-prompt-overlay')) return;
    _showCanvasConnectPrompt(user);
  };
  // First-priority slot — Slack (3500ms) and Canvas-rescope (4500ms) are staggered a second later
  // each, so whichever of those checks later can actually see this one's overlay if it's showing.
  setTimeout(attempt, 2500);
}

function _showCanvasConnectPrompt(user) {
  const overlay = document.createElement('div');
  overlay.id = 'canvas-connect-prompt-overlay';
  overlay.className = 'soc-edit-overlay';
  overlay.innerHTML = `
    <div class="soc-edit-modal slack-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="canvas-connect-title">
      <div class="soc-edit-header"><span id="canvas-connect-title">📚 Connect Canvas</span></div>
      <div class="soc-edit-body">
        <p class="slack-prompt-lead">Your Canvas isn't connected yet — the AI coach can't see your assignments or grades without it.</p>
        <ul class="slack-prompt-list">
          <li>See assignments, due dates, and grades right here in the hub.</li>
          <li>Ask the AI coach to help you catch up, build a study guide, or explain a lesson.</li>
          <li>Takes about 10 seconds, once.</li>
        </ul>
        <p class="slack-prompt-foot">You can also do this any time from your profile menu.</p>
      </div>
      <div class="soc-edit-footer">
        <button type="button" class="soc-edit-cancel-btn" id="canvas-connect-later">Not now</button>
        <button type="button" class="soc-edit-save-btn" id="canvas-connect-connect">Connect Canvas</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('soc-popup-open'));

  const close = snooze => {
    if (snooze) _canvasConnectSnooze(user.email);
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('soc-popup-open');
    setTimeout(() => overlay.remove(), 260);
  };
  const onKey = e => { if (e.key === 'Escape') close(true); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(true); });
  overlay.querySelector('#canvas-connect-later').addEventListener('click', () => close(true));
  overlay.querySelector('#canvas-connect-connect').addEventListener('click', () => { window.location.href = '/auth/canvas'; });
  overlay.querySelector('#canvas-connect-connect').focus();
}

// Existing-student nudge to re-run Canvas OAuth after the 2026-09-25 scope widening (pages,
// syllabus, modules, discussions, assignment detail — see CLAUDE.md "Study materials in chat").
// A brand-new student's first connect already requests every scope (CANVAS_EXTRA_SCOPES is baked
// into the standing OAuth request server-side), so this only ever fires for someone who connected
// BEFORE that change and never reconnected since — services.canvasNeedsRescope is computed
// server-side from the token's real lastAuthorizedAt, not guessed client-side. Same dismissible/
// snooze shape as the Slack-connect nudge above, on purpose — one earned pattern, not a new one.
const CANVAS_RESCOPE_KEY = 'ysc-canvas-rescope-prompt-v2';   // v2 (2026-10-12): new reason to reconnect (grade weights), so earlier dismissals reset once
const CANVAS_RESCOPE_SNOOZE_MS = 5 * 24 * 60 * 60 * 1000;
const CANVAS_RESCOPE_MAX_DISMISSALS = 3;

function _canvasRescopeState(email) {
  try {
    const all = JSON.parse(localStorage.getItem(CANVAS_RESCOPE_KEY) || '{}');
    return all[(email || '').toLowerCase()] || { dismissals: 0, until: 0 };
  } catch { return { dismissals: 0, until: 0 }; }
}
function _canvasRescopeSnooze(email) {
  try {
    const all = JSON.parse(localStorage.getItem(CANVAS_RESCOPE_KEY) || '{}');
    const k = (email || '').toLowerCase();
    const cur = all[k] || { dismissals: 0, until: 0 };
    all[k] = { dismissals: cur.dismissals + 1, until: Date.now() + CANVAS_RESCOPE_SNOOZE_MS };
    localStorage.setItem(CANVAS_RESCOPE_KEY, JSON.stringify(all));
  } catch { /* storage unavailable — worst case the prompt shows again next login */ }
}

function maybePromptCanvasRescope(user) {
  if (!user || !user.services?.canvasNeedsRescope) return;   // not connected, or already has the new scopes
  if (user.isFirstLogin) return;                              // a first-time connect already gets every scope
  const st = _canvasRescopeState(user.email);
  if (st.dismissals >= CANVAS_RESCOPE_MAX_DISMISSALS || Date.now() < st.until) return;

  let waited = 0;
  const attempt = () => {
    if (document.querySelector('.home-intro-tip') && waited < 15000) { waited += 1000; setTimeout(attempt, 1000); return; }
    const otherDialogOpen = [...document.querySelectorAll('.modal-overlay, .soc-edit-overlay, .soc-popup-overlay')]
      .some(el => getComputedStyle(el).display !== 'none' && el.id !== 'canvas-rescope-prompt-overlay');
    if (otherDialogOpen || document.getElementById('canvas-rescope-prompt-overlay')) return;
    _showCanvasRescopePrompt(user);
  };
  // Third-priority slot (4500ms) — behind Canvas-connect (2500ms) and Slack-connect (3500ms), so
  // whichever of those two shows has fully rendered by the time this one checks for an open dialog
  // (three setTimeout calls racing each other at the same delay wouldn't reliably detect one
  // another). Only one nudge should ever show per login.
  setTimeout(attempt, 4500);
}

function _showCanvasRescopePrompt(user) {
  const overlay = document.createElement('div');
  overlay.id = 'canvas-rescope-prompt-overlay';
  overlay.className = 'soc-edit-overlay';
  overlay.innerHTML = `
    <div class="soc-edit-modal slack-prompt-modal" role="dialog" aria-modal="true" aria-labelledby="canvas-rescope-title">
      <div class="soc-edit-header"><span id="canvas-rescope-title">📚 Give the AI coach more to work with</span></div>
      <div class="soc-edit-body">
        <p class="slack-prompt-lead">Your Canvas connection is a bit older, so the AI coach can't open everything yet.</p>
        <ul class="slack-prompt-list">
          <li>Reconnecting lets it read <strong>Canvas pages, the syllabus, and modules</strong> you paste or link into chat.</li>
          <li>It also lets the hub see <strong>how each class weights its grades</strong> (tests vs. homework), so the coach knows what counts most.</li>
          <li>It can already see your assignments and grades — this just adds more.</li>
          <li>Takes about 10 seconds, once.</li>
        </ul>
        <p class="slack-prompt-foot">You can also do this any time from your profile menu.</p>
      </div>
      <div class="soc-edit-footer">
        <button type="button" class="soc-edit-cancel-btn" id="canvas-rescope-later">Not now</button>
        <button type="button" class="soc-edit-save-btn" id="canvas-rescope-connect">Reconnect Canvas</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('soc-popup-open'));

  const close = snooze => {
    if (snooze) _canvasRescopeSnooze(user.email);
    document.removeEventListener('keydown', onKey);
    overlay.classList.remove('soc-popup-open');
    setTimeout(() => overlay.remove(), 260);
  };
  const onKey = e => { if (e.key === 'Escape') close(true); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(true); });
  overlay.querySelector('#canvas-rescope-later').addEventListener('click', () => close(true));
  overlay.querySelector('#canvas-rescope-connect').addEventListener('click', () => { window.location.href = '/auth/canvas'; });
  overlay.querySelector('#canvas-rescope-connect').focus();
}

function updateProfileSlackStatus(connected, slackUser) {
  const dot    = document.getElementById('slackServiceDot');
  const status = document.getElementById('slackServiceStatus');
  const btn    = document.getElementById('slackConnectProfileBtn');
  if (!dot) return;
  if (connected) {
    dot.className    = 'service-dot service-dot--on';
    status.textContent = slackUser ? `As ${slackUser}` : 'Connected';
    status.className   = 'service-status service-status--on';
    if (btn) btn.style.display = 'none';
  } else {
    dot.className    = 'service-dot service-dot--off';
    status.textContent = 'Not connected';
    status.className   = 'service-status';
    if (btn) btn.style.display = 'inline-block';
  }
}

let _activityInterval = null;
function startActivityTracking() {
  const name = getStudentName();
  if (!name) return;
  const ping = () => {
    fetch('/api/tracker/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Student-Name': name },
      body: JSON.stringify({ feature: getActivePanel() }),
    }).then(r => r.json()).then(data => {
      if (data?.safeguards) applySafeguardUpdate(data.safeguards);
    }).catch(() => {});
  };
  ping();
  if (_activityInterval) clearInterval(_activityInterval);
  _activityInterval = setInterval(ping, 30000);
}

// ── 8-hour inactivity auto-logout ─────────────────────────────────────────
const INACTIVITY_LIMIT_MS = 8 * 60 * 60 * 1000;
let _lastActivityMs = Date.now();
['click', 'keydown', 'scroll', 'mousemove', 'touchstart'].forEach(evt =>
  document.addEventListener(evt, () => { _lastActivityMs = Date.now(); }, { passive: true })
);
setInterval(() => {
  if (Date.now() - _lastActivityMs >= INACTIVITY_LIMIT_MS) {
    fetch('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login?msg=expired';
  }
}, 60_000);

function getActivePanel() {
  return classicActivePanel || 'canvas';
}

// ── Setup Wizard ───────────────────────────────────────────────────────────
const SETUP_DONE_KEY = 'ysc-setup-done-v1';

function showSetupWizard(user) {
  if (localStorage.getItem(SETUP_DONE_KEY)) return;
  const overlay = document.getElementById('setup-wizard-overlay');
  if (!overlay) return;

  const nameEl = document.getElementById('setupWelcomeName');
  const slackNameEl = document.getElementById('setupSlackName');
  const firstName = (user.name || 'there').split(' ')[0];
  if (nameEl) nameEl.textContent = firstName;
  if (slackNameEl) slackNameEl.textContent = firstName;

  // Pre-check Slack if already connected
  if (user.services?.slack) {
    const check = document.getElementById('setupSlackCheck');
    if (check) {
      check.className = 'setup-check setup-check--done';
      check.querySelector('.setup-check-icon').textContent = '✓';
    }
  }

  // Canvas row reflects the real connection state — this used to be hardcoded "done"
  // regardless of whether Canvas was actually connected (see profile-menu Reconnect
  // button, added 2026-09-25, for the same fix applied there). A brand-new student's
  // OAuth login already requests every scope the app knows about (CANVAS_EXTRA_SCOPES
  // is baked into the standing scope list server-side), so this button is mainly a
  // safety net — re-running /auth/canvas is harmless and fixes a failed/partial
  // connect without waiting on support.
  const canvasCheck  = document.getElementById('setupCanvasCheck');
  const canvasStatus = document.getElementById('setupCanvasStatus');
  const canvasBtn    = document.getElementById('setupCanvasReconnectBtn');
  if (canvasCheck && canvasStatus) {
    if (user.services?.canvas) {
      canvasCheck.className = 'setup-check setup-check--done';
      canvasCheck.querySelector('.setup-check-icon').textContent = '✓';
      canvasStatus.textContent = 'Assignments & grades connected';
      if (canvasBtn) canvasBtn.textContent = 'Reconnect';
    } else {
      canvasCheck.className = 'setup-check setup-check--pending';
      canvasCheck.querySelector('.setup-check-icon').textContent = '○';
      canvasStatus.textContent = 'Not connected yet';
      if (canvasBtn) canvasBtn.textContent = 'Connect';
    }
  }
  if (canvasBtn && !canvasBtn.dataset.hasListener) {
    canvasBtn.dataset.hasListener = 'true';
    canvasBtn.addEventListener('click', e => { e.stopPropagation(); window.location.href = '/auth/canvas'; });
  }

  overlay.style.display = 'flex';
  goToSetupStep(1);
}

function goToSetupStep(n) {
  document.querySelectorAll('.setup-step').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.setup-dot').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === n);
  });
  const step = document.getElementById(`setup-step-${n}`);
  if (step) step.classList.add('active');
}

function closeSetupWizard() {
  const overlay = document.getElementById('setup-wizard-overlay');
  if (overlay) overlay.style.display = 'none';
  localStorage.setItem(SETUP_DONE_KEY, '1');
}

// ── One-time "Home is your new starting point" tip for returning students ────
// Shown once (localStorage-gated), anchored to the Today tab, never to a
// brand-new user (they're in the setup wizard and Home was always their start).
// Fires straight on load. It used to wait for the daily check-in gate to be
// dismissed first, but that gate is gone (check-in moved to the standalone YSC
// Check-in app), so the event it waited on would never fire.
const HOME_INTRO_KEY = 'ysc-home-intro-seen';
function maybeShowHomeIntroTip() {
  try { if (localStorage.getItem(HOME_INTRO_KEY)) return; } catch { return; }
  _renderHomeIntroTip();
}

function _renderHomeIntroTip() {
  try { if (localStorage.getItem(HOME_INTRO_KEY)) return; } catch { return; }
  const anchor = document.querySelector('.htv-tab[data-tab="today"]');
  const nav = document.querySelector('.htv-nav');
  if (!anchor || !nav) return;

  const tip = document.createElement('div');
  tip.className = 'home-intro-tip';
  tip.setAttribute('role', 'status');
  tip.innerHTML =
    '<span>Home is your new starting point — your dashboard’s right here.</span>' +
    '<button type="button" class="home-intro-tip-x" aria-label="Dismiss">✕</button>';

  const r = anchor.getBoundingClientRect();
  document.body.appendChild(tip);
  tip.style.position = 'fixed';
  tip.style.top  = Math.round(r.bottom + 6) + 'px';
  tip.style.left = Math.round(r.left) + 'px';

  // Flag it "seen" the moment it renders — showing it once is the whole
  // contract, regardless of how it's dismissed.
  try { localStorage.setItem(HOME_INTRO_KEY, '1'); } catch {}

  // It's a lightweight fixed-position nudge, not a modal: dismissed by the ×
  // or after a beat. (No outside-click / tab-click handlers — those also fire
  // for programmatic clicks during load and were closing it instantly.)
  tip.querySelector('.home-intro-tip-x').addEventListener('click', () => tip.remove());
  setTimeout(() => tip.remove(), 12000);
}

// ── Broadcast dismiss tracking ─────────────────────────────────────────────
const dismissedBroadcastIds = new Set();

async function loadDismissedBroadcasts() {
  const name = getStudentName();
  if (!name) return;
  try {
    const res = await fetch('/api/tracker/broadcast/dismissed', {
      headers: { 'X-Student-Name': name },
    });
    if (res.ok) {
      const data = await res.json();
      (data.ids || []).forEach(id => dismissedBroadcastIds.add(id));
    }
  } catch {}
}

function saveBroadcastSeen(broadcastId) {
  const name = getStudentName();
  if (!broadcastId || !name) return;
  fetch('/api/tracker/broadcast/seen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Student-Name': name },
    body: JSON.stringify({ broadcastId }),
  }).catch(() => {});
}

function saveBroadcastDismissed(broadcastId) {
  const name = getStudentName();
  if (!broadcastId || !name) return;
  dismissedBroadcastIds.add(broadcastId);
  fetch('/api/tracker/broadcast/dismiss', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Student-Name': name },
    body: JSON.stringify({ broadcastId }),
  }).catch(() => {});
}

function showGotItToast() {
  const existing = document.getElementById('broadcast-gotit-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'broadcast-gotit-toast';
  toast.className = 'broadcast-gotit-toast';
  toast.innerHTML = '<span class="gotit-check">✓</span> Got it!';
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('gotit-visible'));
  setTimeout(() => {
    toast.classList.remove('gotit-visible');
    setTimeout(() => toast.remove(), 400);
  }, 2000);
}

function showToast(text, type = 'success') {
  const existing = document.getElementById('ysc-generic-toast');
  if (existing) existing.remove();
  const colors = { success: '#27ae60', error: '#e74c3c', info: '#111111', warn: '#e67e22' };
  const toast = document.createElement('div');
  toast.id = 'ysc-generic-toast';
  toast.style.cssText = `
    position:fixed; bottom:32px; left:50%; transform:translateX(-50%) translateY(20px);
    background:${colors[type] || colors.success}; color:#fff; font-size:.88rem; font-weight:700;
    padding:10px 22px; border-radius:40px; border:2px solid var(--sp-ink); z-index:99999; opacity:0;
    transition:opacity .25s,transform .25s; white-space:nowrap;
    box-shadow:var(--sp-shadow);`;
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

// ── SSE connection ─────────────────────────────────────────────────────────
let _es = null;

function connectStudentEvents() {
  if (_es) { try { _es.close(); } catch {} _es = null; }
  const name = getStudentName();
  const url  = name ? `/api/tracker/events?student=${encodeURIComponent(name)}` : '/api/tracker/events';
  const es   = new EventSource(url);
  _es = es;
  es.onmessage = e => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'safeguards') applySafeguardUpdate(data);
      else if (data.type === 'broadcast') { showBroadcast(data); document.dispatchEvent(new CustomEvent('ysc:broadcast', { detail: data })); updateOpenerBroadcast(data); }
      else if (data.type === 'broadcast_clear') { hideBroadcast(); document.dispatchEvent(new CustomEvent('ysc:broadcast_clear')); updateOpenerBroadcast(null); }
      else if (data.type === 'availability_update') document.dispatchEvent(new CustomEvent('ysc:availability_update', { detail: data }));
      else if (data.type === 'reminder' && data.reminder) showReminderPopup(data.reminder);
      else if (data.type === 'alarm'    && data.alarm)    document.dispatchEvent(new CustomEvent('ysc:alarm', { detail: data.alarm }));
    } catch {}
  };
  es.onerror = () => {};
}

// Reconnect whenever the page comes back to the foreground if the existing
// connection isn't genuinely open. Mobile networks/backgrounding can
// silently kill an EventSource without ever firing onerror — confirmed via
// a real two-device pilot-day test where a phone's already-visible People
// tab never got a live update. Only acts once a connection has already
// been established at least once this page load (connectStudentEvents()
// itself is still the thing that opens the first one, right after
// initSession() resolves) — a bare CONNECTING/OPEN state is left alone.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if (_es && _es.readyState === EventSource.CLOSED) connectStudentEvents();
});

function applySafeguardUpdate(sg) {
  const banner = document.getElementById('hub-lock-banner');
  if (sg.lockedMode) {
    if (!banner) {
      const b = document.createElement('div');
      b.id = 'hub-lock-banner';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:var(--sp-coral);color:var(--sp-ink);text-align:center;padding:10px;font-family:var(--sp-font-label);font-weight:700;font-size:.8rem;letter-spacing:0.08em;text-transform:uppercase;border-bottom:2px solid var(--sp-ink)';
      b.textContent = '🔒 Hub is locked by your teacher. Please focus on Canvas assignments.';
      document.body.prepend(b);
    }
  } else if (banner) {
    banner.remove();
  }
  document.dispatchEvent(new CustomEvent('ysc:safeguards', { detail: sg }));
}

// ── Broadcast helpers ──────────────────────────────────────────────────────
function escHtmlBroadcast(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}
function escAttr(s) {
  return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── Theme builders ─────────────────────────────────────────────────────────
function buildBlackboardHtml(msg) {
  const text = msg.text || '';
  const hasImage = msg.broadcastType === 'image' && msg.mediaUrl;
  const imgHtml = hasImage ? `
    <div class="bb-pinned-image">
      <div class="bb-tape bb-tape-tl"></div>
      <div class="bb-tape bb-tape-tr"></div>
      <img class="bb-image" src="${escAttr(msg.mediaUrl)}" alt="" onerror="this.parentElement.style.display='none'">
    </div>` : '';
  return `
    <div class="bb-wrap">
      <div class="bb-frame">
        <div class="bb-header">📢 Message from Your Teacher</div>
        ${text ? `<div class="bb-text">${escHtmlBroadcast(text)}</div>` : ''}
        ${imgHtml}
        <div class="bb-footer">
          <span class="bb-signature">— Your Teacher</span>
          <button class="bb-eraser-btn" id="broadcast-dismiss">🧹 Erase</button>
        </div>
        <div class="bb-tray">
          <div class="bb-chalk"></div>
          <div class="bb-chalk bb-chalk-short"></div>
        </div>
      </div>
    </div>`;
}

function buildTVHtml(msg) {
  const vid = msg.mediaUrl?.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)?.[1];
  const text = msg.text || '';
  const screenContent = vid
    ? `<iframe class="tv-iframe" src="https://www.youtube-nocookie.com/embed/${vid}?autoplay=1&rel=0" frameborder="0" allowfullscreen allow="autoplay; encrypted-media"></iframe>`
    : `<div class="tv-no-video">${escHtmlBroadcast(text || 'Broadcast from your teacher')}</div>`;
  return `
    <div class="tv-wrap">
      <div class="tv-cabinet">
        <div class="tv-antenna-row">
          <div class="tv-antenna tv-ant-l"></div>
          <div class="tv-antenna-ball"></div>
          <div class="tv-antenna tv-ant-r"></div>
        </div>
        <div class="tv-screen-bezel">
          <div class="tv-screen">
            <div class="tv-static"></div>
            <div class="tv-scanlines"></div>
            <div class="tv-vignette"></div>
            ${screenContent}
          </div>
        </div>
        <div class="tv-bottom-row">
          <div class="tv-left-controls">
            <div class="tv-power-light"></div>
            <div class="tv-knob"></div>
            <div class="tv-knob"></div>
          </div>
          <button class="tv-power-btn" id="broadcast-dismiss">⏻ OFF</button>
        </div>
        <div class="tv-nameplate">Class Announcement · YSC Academy</div>
      </div>
    </div>`;
}

function buildRecordHtml(msg) {
  const text = msg.text || 'Class Announcement';
  const delays = [0, 90, 170, 45, 125, 205, 65, 145];
  const eqBars = delays.map(d => `<div class="rp-eq-bar" style="animation-delay:${d}ms"></div>`).join('');
  return `
    <div class="rp-wrap">
      <div class="rp-turntable">
        <div class="rp-platter-area">
          <div class="rp-mat"></div>
          <div class="rp-vinyl" id="rp-vinyl">
            <div class="rp-label">
              <div class="rp-label-title">${escHtmlBroadcast(text.slice(0, 22))}</div>
              <div class="rp-label-sub">Your Teacher</div>
              <div class="rp-spindle"></div>
            </div>
          </div>
          <div class="rp-arm-pivot">
            <div class="rp-tonearm" id="rp-tonearm">
              <div class="rp-needle-head"></div>
            </div>
          </div>
        </div>
        <div class="rp-bottom-section">
          <div class="rp-speaker-grille"></div>
          <div class="rp-controls">
            <div class="rp-eq-bars" id="rp-eq">${eqBars}</div>
            <audio id="rp-audio" src="${escAttr(msg.mediaUrl || '')}" preload="auto"></audio>
            <button class="rp-play-btn" id="rp-play-btn">▶ Play</button>
          </div>
        </div>
        <div class="rp-footer">
          <button class="rp-lift-btn" id="broadcast-dismiss">↑ Lift Needle</button>
        </div>
      </div>
    </div>`;
}

function setupRecordPlayer() {
  const audio = document.getElementById('rp-audio');
  const vinyl = document.getElementById('rp-vinyl');
  const tonearm = document.getElementById('rp-tonearm');
  const playBtn = document.getElementById('rp-play-btn');
  const eq = document.getElementById('rp-eq');
  if (!audio || !vinyl) return;

  const onPlay = () => {
    vinyl.classList.add('spinning');
    tonearm?.classList.add('lowered');
    eq?.classList.add('active');
    if (playBtn) playBtn.textContent = '⏸ Pause';
  };
  const onPause = () => {
    vinyl.classList.remove('spinning');
    eq?.classList.remove('active');
    if (playBtn) playBtn.textContent = '▶ Play';
  };

  audio.addEventListener('play', onPlay);
  audio.addEventListener('pause', onPause);
  audio.addEventListener('ended', onPause);
  playBtn?.addEventListener('click', () => {
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });

  // Drop needle then auto-play
  setTimeout(() => {
    tonearm?.classList.add('lowered');
    setTimeout(() => audio.play().catch(() => {}), 900);
  }, 600);
}

// ── Show / hide ────────────────────────────────────────────────────────────
let _currentBroadcastId = null;

function showBroadcast(msg) {
  const name = getStudentName();
  if (msg._targets?.length && !msg._targets.includes(name)) return;

  // If teacher forced a reshow, clear local dismissed cache for this broadcast
  if (msg._force && msg.id) dismissedBroadcastIds.delete(msg.id);

  // Skip if already dismissed (server confirmed + local cache)
  if (msg.id && dismissedBroadcastIds.has(msg.id)) return;

  const overlay = document.getElementById('broadcast-overlay');
  if (!overlay) return;

  _currentBroadcastId = msg.id || null;

  const type = msg.broadcastType || 'text';

  if (type === 'youtube') {
    overlay.innerHTML = buildTVHtml(msg);
    overlay.className = 'broadcast-overlay bcast-tv';
  } else if (type === 'audio') {
    overlay.innerHTML = buildRecordHtml(msg);
    overlay.className = 'broadcast-overlay bcast-record';
    requestAnimationFrame(() => setupRecordPlayer());
  } else {
    overlay.innerHTML = buildBlackboardHtml(msg);
    overlay.className = 'broadcast-overlay bcast-blackboard';
  }

  overlay.style.display = 'flex';
  // Record that student saw this broadcast
  if (_currentBroadcastId) saveBroadcastSeen(_currentBroadcastId);
  document.getElementById('broadcast-dismiss')?.addEventListener('click', hideBroadcast);
}

function hideBroadcast() {
  const overlay = document.getElementById('broadcast-overlay');
  if (!overlay) return;
  const audio = document.getElementById('rp-audio');
  if (audio) audio.pause();
  overlay.style.display = 'none';
  overlay.innerHTML = '';
  overlay.className = 'broadcast-overlay';
  if (_currentBroadcastId) {
    saveBroadcastDismissed(_currentBroadcastId);
    _currentBroadcastId = null;
  }
  showGotItToast();
}

// ── Reminder popup ─────────────────────────────────────────────────────────
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function fireBrowserNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(`⏰ ${title}`, { body, icon: '/favicon.ico', tag: 'ysc-reminder' });
    n.onclick = () => { window.focus(); n.close(); };
  }
}

async function updateReminderBadge() {
  try {
    const name = getStudentName();
    if (!name) return;
    const reminders = await apiFetch(`/api/reminders?student=${encodeURIComponent(name)}`);
    const pending = reminders.filter(r => r.status === 'pending' || r.status === 'snoozed').length;
    // Store count for future UI badge use
    state.pendingReminderCount = pending;
  } catch {}
}

function showReminderPopup(reminder) {
  // Fire browser notification even if tab is active
  fireBrowserNotification(reminder.title, reminder.message || reminder.title);

  const existing = document.getElementById('reminder-popup');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'reminder-popup';
  overlay.className = 'reminder-popup-overlay';

  const when = reminder.scheduledFor
    ? new Date(reminder.scheduledFor).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  overlay.innerHTML = `
    <div class="reminder-popup-card">
      <div class="reminder-popup-icon">⏰</div>
      <div class="reminder-popup-title">${escHtmlBroadcast(reminder.title)}</div>
      ${reminder.message && reminder.message !== reminder.title
        ? `<div class="reminder-popup-body">${escHtmlBroadcast(reminder.message)}</div>` : ''}
      ${when ? `<div class="reminder-popup-when">${escHtmlBroadcast(when)}</div>` : ''}
      <div class="reminder-popup-actions">
        <button class="reminder-btn reminder-btn-dismiss" data-id="${escAttr(reminder.id)}">✓ Got it</button>
        <button class="reminder-btn reminder-btn-snooze10" data-id="${escAttr(reminder.id)}">💤 10 min</button>
        <button class="reminder-btn reminder-btn-snooze60" data-id="${escAttr(reminder.id)}">💤 1 hour</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const studentN = getStudentName();

  overlay.querySelector('.reminder-btn-dismiss').addEventListener('click', async () => {
    if (studentN) {
      try { await apiFetch(`/api/reminders/${reminder.id}/dismiss`, { method: 'POST' }); } catch {}
    }
    overlay.remove();
  });

  overlay.querySelector('.reminder-btn-snooze10').addEventListener('click', async () => {
    if (studentN) {
      try { await apiFetch(`/api/reminders/${reminder.id}/snooze`, { method: 'POST', body: JSON.stringify({ minutes: 10 }) }); } catch {}
    }
    overlay.remove();
  });

  overlay.querySelector('.reminder-btn-snooze60').addEventListener('click', async () => {
    if (studentN) {
      try { await apiFetch(`/api/reminders/${reminder.id}/snooze`, { method: 'POST', body: JSON.stringify({ minutes: 60 }) }); } catch {}
    }
    overlay.remove();
  });
}

function trackWebsiteVisit(url, feature) {
  const name = getStudentName();
  if (!name) return;
  fetch('/api/tracker/website', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Student-Name': name },
    body: JSON.stringify({ url, feature: feature || getActivePanel() }),
  }).catch(() => {});
}

// ── State ─────────────────────────────────────────────────────────────────
const state = {
  courses: [],
  assignments: [],
  announcements: [],
  channels: [],
  activeChannel: null,
  selectedCourse: null,
  myFiles: [],
  sharedFiles: [],
  grades: [],
  missingCount: 0,
  notifications: null,
  chatHistory: [],
  chatOpen: false,
  slackUserId: null,        // Slack user ID for sent-vs-received detection
  channelLastTs: {},        // channelId → newest ts seen (used by poll)
  gamePlanCompletions: {},  // assignmentId → {completedAt, date} — from /api/student/game-plan/completions
  cal: {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    events: [],
    canvasEvents: [],
    initialized: false,
  },
};

// ── API helpers ────────────────────────────────────────────────────────────
// Guards against the 2026-07-27 Canvas-connect reload loop: a single
// endpoint's 401 (routes/canvas.js's /announcements bypassed the normal
// Canvas-error translation) used to force a hard redirect to /login
// unconditionally. /login bounces an already-authenticated user straight
// back to /, which re-fires the same failing call — a full-page reload
// every ~2s until the tab was closed. Two independent safeguards, either
// alone would have stopped it:
//   1. Don't trust one endpoint's 401 as "the session is dead" — confirm
//      against /api/session/me (which itself never 401s) before redirecting.
//      Most 401s from a single API call are endpoint-specific, not a real
//      session expiry — only redirect once that's actually confirmed.
//   2. Even a confirmed expiry only gets one redirect per load. The flag is
//      cleared by initSession() once a fresh load confirms the session is
//      genuinely fine — if we land right back on another 401 before that
//      happens, redirecting again would just resume the loop, so show an
//      error instead.
const REDIRECT_GUARD_KEY = 'ysc-401-redirect-attempted';

async function apiFetch(url, opts = {}) {
  const name = getStudentName();
  const headers = { 'Content-Type': 'application/json', ...(name ? { 'X-Student-Name': name } : {}), ...opts.headers };
  const res = await fetch(url, { ...opts, headers });

  if (res.status === 401) {
    if (sessionStorage.getItem(REDIRECT_GUARD_KEY)) {
      const data = await res.json().catch(() => ({ error: 'Unauthorized' }));
      throw Object.assign(new Error(data.error || 'Request failed after a recent re-login attempt'), { data });
    }

    let stillAuthenticated = false;
    try {
      const me = await fetch('/api/session/me', { credentials: 'include' }).then(r => r.json());
      stillAuthenticated = !!me?.authenticated;
    } catch { /* treat the check itself failing as "not authenticated" */ }

    if (!stillAuthenticated) {
      sessionStorage.setItem(REDIRECT_GUARD_KEY, '1');
      window.location.href = '/login?msg=expired';
      throw new Error('Not authenticated');
    }
    // Session is genuinely fine — this 401 is specific to this one endpoint,
    // not a real session expiry. Don't redirect; fail normally so the
    // calling widget's own error handling takes over instead of the whole page.
    const data = await res.json().catch(() => ({ error: 'Unauthorized' }));
    throw Object.assign(new Error(data.error || 'API error'), { data });
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw Object.assign(new Error(data.error || 'API error'), { data });
  }
  return attachCanvasPartial(res, await res.json());
}

// /api/canvas/assignments marks an incomplete list with X-Canvas-Partial headers
// (its 10s Canvas budget ran out, or a course's fetch failed). Carry that on the
// array as a NON-enumerable property so the array itself, JSON.stringify of it,
// and every existing caller stay exactly the same.
function attachCanvasPartial(res, data) {
  if (Array.isArray(data) && res?.headers?.get('X-Canvas-Partial') === 'true') {
    Object.defineProperty(data, 'canvasPartial', {
      value: {
        reason: res.headers.get('X-Canvas-Partial-Reason') || 'unknown',
        skippedCourses: Number(res.headers.get('X-Canvas-Skipped-Courses')) || 0,
      },
    });
  }
  return data;
}
const CANVAS_PARTIAL_NOTE = "Some of your courses didn't load just now, so this list may be incomplete. Try refreshing in a minute.";

// ── Date helpers ───────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return 'No due date';
  const d = new Date(iso);
  const now = new Date();
  const diff = (d - now) / 86400000;
  if (diff < 0) return 'Your next step is to submit this';
  if (diff < 1) return 'Due today!';
  if (diff < 2) return 'Due tomorrow';
  if (diff < 7) return `Due ${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Same as fmtDate(), but for the AI context string only — fmtDate's overdue phrasing
// ("Your next step is to submit this") carries no date at all, so buildSuggestedChips()
// in routes/chat.js can never recover a real due date for exactly the assignments most
// worth naming specifically: the overdue ones.
function fmtDateForContext(iso) {
  if (!iso) return 'no due date';
  const d = new Date(iso);
  const now = new Date();
  const diff = (d - now) / 86400000;
  if (diff < 0) return `${d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} (overdue)`;
  if (diff < 1) return 'today';
  if (diff < 2) return 'tomorrow';
  if (diff < 7) return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function urgencyTag(iso) {
  if (!iso) return '';
  const diff = (new Date(iso) - new Date()) / 86400000;
  if (diff < 0) return '<span class="tag tag-urgent">Submit what you have</span>';
  if (diff < 2) return '<span class="tag tag-urgent">Urgent</span>';
  if (diff < 7) return '<span class="tag tag-upcoming">This week</span>';
  return '';
}

function mimeIcon(mime) {
  if (!mime) return '📄';
  if (mime.includes('spreadsheet') || mime.includes('excel')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📑';
  if (mime.includes('document') || mime.includes('word')) return '📝';
  if (mime.includes('pdf')) return '📕';
  if (mime.includes('folder')) return '📁';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('video')) return '🎬';
  if (mime.includes('audio')) return '🎵';
  return '📄';
}

function fmtRelTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function avatarInitial(name) {
  return (name || '?').trim()[0].toUpperCase();
}

function avatarColor(name) {
  const colors = ['#14141A', '#333333', '#27ae60', '#FF5C4D', '#8e44ad', '#2B3BFF'];
  let hash = 0;
  for (const c of (name || '')) hash = c.charCodeAt(0) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

// ── Spinner helpers ────────────────────────────────────────────────────────
function spin(btn) { btn.classList.add('spinning'); }
function unspin(btn) { btn.classList.remove('spinning'); }

// ── Canvas ─────────────────────────────────────────────────────────────────

// Shared handling for the canvas_not_connected signal (routes/canvas.js) —
// apiFetch() throws an Error whose .data is the parsed response body, so
// e.data?.error === 'canvas_not_connected' is how every consumer below
// distinguishes "you haven't connected Canvas" from a real failure and shows
// a real prompt instead of a raw "⚠️ canvas_not_connected" error string.
function isCanvasNotConnected(e) {
  return e?.data?.error === 'canvas_not_connected';
}
function renderCanvasNotConnected(el) {
  el.innerHTML = '<div class="empty-state">Connect your Canvas account (Canvas panel in the sidebar) to see this.</div>';
}
function renderCanvasFailure(el, error) {
  if (!el) return false;
  if (isCanvasNotConnected(error)) { renderCanvasNotConnected(el); return true; }
  const messages = {
    canvas_permission_denied: 'Canvas did not allow this request. Check course access and app permissions; reconnecting alone may not fix it.',
    canvas_rate_limited: 'Canvas is limiting requests. Please wait before trying again.',
    canvas_temporarily_unavailable: 'Canvas is temporarily unavailable. Please try again later.',
    canvas_resource_not_found: 'This Canvas resource is no longer available.',
  };
  const code = error?.data?.error;
  if (!Object.hasOwn(messages, code)) return false;
  const wait = Number(error?.data?.retryAfter);
  const detail = code === 'canvas_rate_limited' && Number.isFinite(wait) && wait > 0 ? ` Try again after ${Math.ceil(wait)} seconds.` : '';
  el.innerHTML = `<div class="error-state" role="status">${escHtml(messages[code] + detail)}</div>`;
  return true;
}

// Gates the Canvas sidebar panel on whether this student has connected their
// own Canvas account (services.canvas from /api/session/me). Not-yet-connected
// students see a simple connect prompt instead of the courses/assignments/
// announcements sections; nothing loads from Canvas until they've connected.
// This is a real, persistent per-student check (lib/canvas-token-store.js) —
// once connected, this always resolves true on every future login, so the
// prompt is a genuine one-time thing, not shown again after the first connect.
function initCanvasPanelState(user) {
  const prompt  = document.getElementById('canvas-connect-prompt');
  const content = document.getElementById('canvas-connected-content');
  if (!prompt || !content) return;

  if (user?.services?.canvas) {
    prompt.style.display  = 'none';
    content.style.display = '';
    loadCourses();
    setTimeout(() => loadAssignments(), 100);
    setTimeout(() => loadAnnouncements(), 200);
  } else {
    prompt.style.display  = 'flex';
    content.style.display = 'none';
  }

  const btn = document.getElementById('canvasConnectBtn');
  if (btn && !btn.dataset.hasListener) {
    btn.dataset.hasListener = 'true';
    btn.addEventListener('click', () => { window.location.href = '/auth/canvas'; });
  }
}

async function loadCourses() {
  const el = document.getElementById('courses-list');
  const btn = document.querySelector('[data-action="refreshCourses"]');
  spin(btn);
  try {
    const courses = await apiFetch('/api/canvas/courses');
    state.courses = courses;
    if (!courses.length) { el.innerHTML = '<div class="empty-state">No active courses found.</div>'; return; }
    el.innerHTML = courses.map(c => `
      <div class="list-item course-item" data-id="${c.id}" data-name="${escHtml(c.name)}" data-url="${c.html_url}">
        <div class="list-item-title">${escHtml(c.name)}</div>
        <div class="list-item-sub">
          <span>${c.term?.name || ''}${c.course_code ? ` · ${c.course_code}` : ''}</span>
          <a class="course-ext-link" href="${c.html_url}" target="_blank" rel="noopener noreferrer" title="Open in Canvas" onclick="event.stopPropagation()">View in Canvas ↗</a>
        </div>
      </div>`).join('');
    el.querySelectorAll('.course-item').forEach(item => {
      item.addEventListener('click', () => selectCourse(item.dataset.id, item.dataset.name));
    });
  } catch (e) {
    if (renderCanvasFailure(el, e)) return;
    el.innerHTML = `<div class="error-state">⚠️ ${e.message}</div>`;
  } finally { unspin(btn); }
}

function selectCourse(id, name) {
  state.selectedCourse = { id, name };
  document.querySelectorAll('.course-item').forEach(el =>
    el.classList.toggle('active', el.dataset.id === id)
  );
  document.getElementById('assignments-title').textContent = name;
  document.getElementById('assignments-back-btn').style.display = '';
  loadCourseDetail(id);
}

function resetCourseView() {
  state.selectedCourse = null;
  document.querySelectorAll('.course-item').forEach(el => el.classList.remove('active'));
  document.getElementById('assignments-title').textContent = 'Upcoming Assignments';
  document.getElementById('assignments-back-btn').style.display = 'none';
  document.getElementById('course-grades-banner').style.display = 'none';
  loadAssignments();
}

// Aborts a still-in-flight request from a previous click before starting a
// new one — otherwise rapid clicking across several courses piles up
// concurrent requests that can outlive the panel that asked for them
// (the same underlying condition behind a real bug: the server-side hang
// this was found investigating).
let _courseDetailAbort = null;

async function loadCourseDetail(id) {
  _courseDetailAbort?.abort();
  const controller = new AbortController();
  _courseDetailAbort = controller;

  const listEl = document.getElementById('assignments-list');
  const bannerEl = document.getElementById('course-grades-banner');
  listEl.innerHTML = '<div class="loading">Loading…</div>';
  bannerEl.style.display = 'none';
  try {
    const { assignments, grades } = await apiFetch(`/api/canvas/courses/${id}/detail`, { signal: controller.signal });

    if (grades) {
      const score = grades.current_score ?? grades.final_score;
      const letter = grades.current_grade ?? grades.final_grade ?? '';
      bannerEl.innerHTML = `
        <div class="grades-banner">
          <span class="grade-label">Current Grade</span>
          <span class="grade-score">${score != null ? score + '%' : '—'}</span>
          ${letter ? `<span class="grade-letter">${escHtml(letter)}</span>` : ''}
        </div>`;
      bannerEl.style.display = 'block';
    }

    const sorted = assignments
      .filter(a => a.due_at)
      .sort((a, b) => new Date(a.due_at) - new Date(b.due_at));
    if (!sorted.length) {
      listEl.innerHTML = '<div class="empty-state">Clear week ahead — great time to get ahead</div>';
      return;
    }
    listEl.innerHTML = sorted.map(a => {
      const submitted = a.submission?.workflow_state === 'submitted';
      const score = a.submission?.score;
      return `
      <div class="list-item">
        <div class="list-item-title">
          ${urgencyTag(a.due_at)}
          ${submitted ? '<span class="tag tag-done">Submitted</span>' : ''}
          <a class="list-link" href="${a.html_url}" target="_blank">${escHtml(a.name)}</a>
        </div>
        <div class="list-item-sub">
          ${fmtDate(a.due_at)}${a.points_possible ? ` · ${a.points_possible} pts` : ''}${score != null ? ` · Score: ${score}` : ''}
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    if (e.name === 'AbortError') return; // superseded by a newer course click — nothing to show
    if (renderCanvasFailure(listEl, e)) return;
    listEl.innerHTML = `<div class="error-state">⚠️ ${e.message}</div>`;
  }
}

function getCoachingLabel(assignment) {
  const state = assignment.submission?.workflow_state;
  if (state === 'submitted' || state === 'graded') return null;
  const daysUntilDue = assignment.due_at
    ? (new Date(assignment.due_at) - new Date()) / 86400000
    : null;
  if (state === 'missing' || (daysUntilDue !== null && daysUntilDue < 0)) return "Let's get this back on track";
  if (daysUntilDue !== null && daysUntilDue < 1) return 'Due today — submit what you have';
  if (daysUntilDue !== null && daysUntilDue < 2) return 'Due tomorrow';
  return null;
}

// ── One /api/canvas/assignments request per page (incident review 2026-10-12) ──
// The chat opener, the Canvas panel (on sign-in AND again after a Canvas connect) and the calendar each asked for the
// same list, 3–4 requests per page load. Concurrent callers now share one in-flight request, and a list fetched in the
// last 30s is reused. `fresh` (refresh button) skips the reuse but still joins a request already in flight. A failed
// request is never reused. invalidateCanvasAssignments() forgets everything (new Canvas connection).
const ASSIGNMENTS_REUSE_MS = 30 * 1000;
let _assignmentsInFlight = null, _assignmentsData = null, _assignmentsAt = 0;
function getCanvasAssignments({ fresh = false } = {}) {
  if (!fresh && _assignmentsData && Date.now() - _assignmentsAt < ASSIGNMENTS_REUSE_MS) return Promise.resolve(_assignmentsData);
  if (_assignmentsInFlight) return _assignmentsInFlight;
  const request = apiFetch('/api/canvas/assignments')
    .then(data => { if (_assignmentsInFlight === request) { _assignmentsData = data; _assignmentsAt = Date.now(); } return data; })
    .finally(() => { if (_assignmentsInFlight === request) _assignmentsInFlight = null; });
  _assignmentsInFlight = request;
  return request;
}
function invalidateCanvasAssignments() { _assignmentsInFlight = null; _assignmentsData = null; _assignmentsAt = 0; }
window.getCanvasAssignments = getCanvasAssignments;

async function loadAssignments({ fresh = false } = {}) {
  const el = document.getElementById('assignments-list');
  const btn = document.querySelector('[data-action="refreshAssignments"]');
  if (btn) spin(btn);
  try {
    const assignments = await getCanvasAssignments({ fresh });
    state.assignments = assignments;
    // An incomplete list must not read as "nothing due" — show the note instead of the all-clear.
    const partialNote = assignments.canvasPartial ? `<div class="canvas-partial-note" role="status">${escHtml(CANVAS_PARTIAL_NOTE)}</div>` : '';
    if (!assignments.length) { el.innerHTML = partialNote || '<div class="empty-state">Clear week ahead — great time to get ahead</div>'; return; }
    const submitted = assignments.filter(a => a.submission?.submitted_at || a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded').length;
    const total = assignments.length;
    const progressBar = submitted > 0
      ? `<div class="canvas-progress-bar"><div class="cpb-fill" style="width:${Math.round((submitted/total)*100)}%;"></div><span class="cpb-text">${submitted} of ${total} submitted this week</span></div>`
      : '';
    el.innerHTML = partialNote + progressBar + assignments.map(a => {
      const isSubmitted = a.submission?.workflow_state === 'submitted' || a.submission?.workflow_state === 'graded';
      const coachLabel  = getCoachingLabel(a);
      return `
      <div class="list-item">
        <div class="list-item-title">
          ${urgencyTag(a.due_at)}
          ${isSubmitted ? '<span class="tag tag-done">Submitted</span>' : (coachLabel ? `<span class="tag tag-urgent">${escHtml(coachLabel)}</span>` : '')}
          <a class="list-link" href="${a.html_url}" target="_blank">${escHtml(a.name)}</a>
        </div>
        <div class="list-item-sub">${fmtDate(a.due_at)}${a.points_possible ? ` · ${a.points_possible} pts` : ''}</div>
      </div>`;
    }).join('');
  } catch (e) {
    if (renderCanvasFailure(el, e)) return;
    el.innerHTML = `<div class="error-state">⚠️ ${e.message}</div>`;
  } finally { if (btn) unspin(btn); }
}

async function loadAnnouncements() {
  const el = document.getElementById('announcements-list');
  const btn = document.querySelector('[data-action="refreshAnnouncements"]');
  spin(btn);
  try {
    // Server now fetches up to 100 (routes/canvas.js's /announcements uses the
    // same canvasFetchJSON per_page=100 as every other Canvas route) — cap to
    // the 10 most recent here to match the original intended display size.
    const items = (await apiFetch('/api/canvas/announcements')).slice(0, 10);
    state.announcements = items;
    if (!items.length) { el.innerHTML = '<div class="empty-state">No announcements.</div>'; return; }
    el.innerHTML = items.map(a => `
      <div class="list-item">
        <div class="list-item-title"><a class="list-link" href="${a.html_url}" target="_blank">${a.title}</a></div>
        <div class="list-item-sub">${a.context_name || ''} · ${fmtRelTime(a.posted_at)}</div>
      </div>`).join('');
  } catch (e) {
    if (renderCanvasFailure(el, e)) return;
    el.innerHTML = `<div class="error-state">⚠️ ${e.message}</div>`;
  } finally { unspin(btn); }
}

// ── Slack ──────────────────────────────────────────────────────────────────
let _channelAutoRefreshTimer = null;

// Client-side message cache: channelId → { data: [], ts: number }
const _clientMsgCache = new Map();
const CLIENT_MSG_TTL  = 30 * 1000;

function renderChannelList(channels) {
  const el = document.getElementById('channels-list');
  if (!el) return;

  if (!channels.length) {
    el.innerHTML = '<div class="empty-state">No active channels found. Ask your teacher to invite the bot to your class channels.</div>';
    return;
  }

  // Sort: unread (new activity since last viewed) first, then by lastTs desc
  const sorted = [...channels].sort((a, b) => {
    const aUnread = a.lastTs && parseFloat(a.lastTs) > parseFloat(state.channelLastTs[a.id] || 0) && state.activeChannel !== a.id;
    const bUnread = b.lastTs && parseFloat(b.lastTs) > parseFloat(state.channelLastTs[b.id] || 0) && state.activeChannel !== b.id;
    if (aUnread !== bUnread) return bUnread ? 1 : -1;
    const diff = parseFloat(b.lastTs || 0) - parseFloat(a.lastTs || 0);
    return diff !== 0 ? diff : a.name.localeCompare(b.name);
  });

  el.innerHTML = sorted.map(c => {
    const isActive = state.activeChannel === c.id;
    const isUnread = !isActive && c.lastTs && parseFloat(c.lastTs) > parseFloat(state.channelLastTs[c.id] || 0);
    const dateStr  = c.lastTs ? fmtRelTime(new Date(parseFloat(c.lastTs) * 1000).toISOString()) : '';
    const preview  = c.lastMessagePreview || '';
    const previewUser = c.lastMessageUser ? `${escHtml(c.lastMessageUser.split(' ')[0])}: ` : '';
    return `
      <div class="channel-item${isActive ? ' active' : ''}${isUnread ? ' unread' : ''}" data-channel-id="${c.id}" data-channel-name="${escAttr(c.name)}">
        <div class="channel-item-row">
          <span class="channel-name">${escHtml(c.name)}</span>
          ${isUnread ? '<span class="channel-badge" aria-label="unread"></span>' : ''}
          ${dateStr ? `<span class="channel-date">${escHtml(dateStr)}</span>` : ''}
        </div>
        ${preview ? `<div class="channel-preview">${previewUser}${escHtml(preview)}</div>` : ''}
      </div>`;
  }).join('');

  // Attach delegated listener once per container — guarded so re-renders don't stack
  if (!el.dataset.hasListener) {
    el.dataset.hasListener = 'true';
    el.addEventListener('click', function (e) {
      const item = e.target.closest('.channel-item');
      if (!item) return;
      const channelId   = item.dataset.channelId;
      const channelName = item.dataset.channelName;
      console.log('[Slack] Channel clicked:', channelId, channelName);
      document.querySelectorAll('.channel-item').forEach(el2 => el2.classList.remove('active'));
      item.classList.add('active');
      const ch = state.channels.find(c => c.id === channelId);
      if (ch?.lastTs) state.channelLastTs[channelId] = ch.lastTs;
      loadChannelMessages(channelId, channelName);
    });
    console.log('[Slack] Click handler added to #channels-list');
  }
}

async function loadChannels() {
  const el  = document.getElementById('channels-list');
  const btn = document.querySelector('[data-action="refreshChannels"]');
  if (el && !el.querySelector('.channel-item')) {
    el.innerHTML = '<div class="loading">Loading channels…</div>';
  }
  spin(btn);
  try {
    const t0 = Date.now();
    const channels = await apiFetch('/api/slack/channels');
    console.log(`[Slack] Channels loaded in ${Date.now() - t0}ms (${channels.length} channels)`);
    state.channels = channels;
    renderChannelList(channels);
  } catch (e) {
    if (el) el.innerHTML = `<div class="error-state">⚠️ ${e.message}</div>`;
  } finally { unspin(btn); }

  // Auto-refresh every 60 seconds — server has its own cache so this is cheap
  if (!_channelAutoRefreshTimer) {
    _channelAutoRefreshTimer = setInterval(async () => {
      try {
        const channels = await apiFetch('/api/slack/channels');
        state.channels = channels;
        renderChannelList(channels);
      } catch {}
    }, 60 * 1000);
  }
}

// ── loadChannelMessages — delegates to window.selectChannel (guarded) ────────
window.loadChannelMessages = function (channelId, channelName) {
  if (!channelId) return;
  window.selectChannel(channelId, channelName);
};

// openSlackChannel / displaySlackMessages — simple wrappers used by the
// active click handlers (see "Click handler added" / "Fallback click
// handler added" below)
window.openSlackChannel = function (channelId, name) {
  console.log('[Slack] Opening channel:', channelId, name);
  document.querySelectorAll('[data-channel-id]').forEach(el => {
    el.classList.toggle('active', el.dataset.channelId === channelId);
  });
  safeFetch('/api/slack/messages/' + channelId)
    .then(data => {
      if (data.error) {
        const el = document.getElementById('messages-list');
        if (el) el.innerHTML = `<div class="error-state">⚠️ ${data.error}</div>`;
        return;
      }
      console.log('[Slack] Loaded', data.messages?.length ?? data.length, 'messages');
      const messages = Array.isArray(data) ? data : (data.messages || []);
      displaySlackMessages(messages, name);
    });
};

window.displaySlackMessages = function (messages, name) {
  const el = document.getElementById('messages-list');
  if (!el) return;
  if (!messages.length) {
    el.innerHTML = '<div class="empty-state">Start the conversation — your mentor is here</div>';
    return;
  }
  el.innerHTML = [...messages].reverse().map(renderMessage).join('');
  el.scrollTop = el.scrollHeight;
  if (name) document.getElementById('current-channel-name').textContent = '#' + name;
};

// selectChannel — used by slack-badge.js popup, hub-tabs.js, and delegation handlers
let isLoadingChannel = false;

window.selectChannel = async function selectChannel(id, name) {
  if (isLoadingChannel) return;
  isLoadingChannel = true;
  console.log('[Slack] selectChannel:', id, name);
  try {
    state.activeChannel = id;
    document.querySelectorAll('.channel-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.querySelector('[data-channel-id="' + id + '"]');
    if (activeEl) activeEl.classList.add('active');
    const hdr = document.getElementById('current-channel-name');
    const isDMChannel = id.startsWith('D') || id.startsWith('G');
    if (hdr) hdr.textContent = isDMChannel ? (name || 'Direct Message') : (name ? '#' + name : 'Channel');
    const refreshBtn = document.getElementById('msg-refresh-btn');
    if (refreshBtn) refreshBtn.style.display = '';
    const composer = document.getElementById('slack-composer');
    if (composer) composer.style.display = 'flex';

    const data = await safeFetch('/api/slack/messages/' + id);
    if (data.error) throw new Error(data.error);
    const messages = Array.isArray(data) ? data : (data.messages || []);
    console.log('[Slack] Loaded', messages.length, 'messages');
    displaySlackMessages(messages, name);
  } catch (err) {
    console.error('[Slack] Error:', err.message);
    const el = document.getElementById('messages-list');
    if (el) el.innerHTML = `<div class="error-state">⚠️ ${err.message}</div>`;
  } finally {
    isLoadingChannel = false;
  }
};

// ── Slack text formatter — handles mentions, channels, links ──────────────
function formatSlackText(raw) {
  return escHtml(raw)
    // <@USERID> → @Name (shown as styled mention; server already resolved names in message body)
    .replace(/&lt;@([A-Z0-9]+)&gt;/g, '<span class="slack-mention">@$1</span>')
    // <#CHANID|name> → #name
    .replace(/&lt;#[A-Z0-9]+\|([^&]+)&gt;/g, '<span class="slack-mention">#$1</span>')
    // <url|label>
    .replace(/&lt;(https?:\/\/[^|&>]+)\|([^&>]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>')
    // bare <url>
    .replace(/&lt;(https?:\/\/[^&>]+)&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>')
    // newlines → <br>
    .replace(/\n/g, '<br>');
}

// ── Render one Slack message as a chat bubble ─────────────────────────────
// Pass m._sent=true to force the sent-bubble style (used for optimistic UI).
function renderMessage(m) {
  if (m.subtype && m.subtype !== 'me_message') {
    const note = m.text ? escHtml(m.text) : m.subtype.replace(/_/g, ' ');
    return `<div class="slack-msg-system">${note}</div>`;
  }
  const name   = m.userName || m.user || 'Unknown';
  const time   = fmtRelTime(new Date(parseFloat(m.ts) * 1000).toISOString());
  const text   = formatSlackText(m.text || '');
  const isSent = m._sent || (state.slackUserId && m.user === state.slackUserId);

  if (isSent) {
    return `<div class="slack-msg sent"${m._optimisticId ? ` data-optimistic-id="${m._optimisticId}"` : ''}>
      <div class="slack-msg-body">
        <div class="slack-msg-meta">${escHtml(time)}</div>
        <div class="slack-bubble">${text}</div>
      </div>
    </div>`;
  }
  const color = avatarColor(name);
  return `<div class="slack-msg received">
    <div class="slack-avatar" style="background:${color}">${avatarInitial(name)}</div>
    <div class="slack-msg-body">
      <div class="slack-msg-meta"><strong>${escHtml(name)}</strong> · ${escHtml(time)}</div>
      <div class="slack-bubble">${text}</div>
    </div>
  </div>`;
}


async function loadMessages(channelId) {
  console.log('[Slack] Loading messages for:', channelId);
  const el = document.getElementById('messages-list');
  el.innerHTML = '<div class="loading">Loading messages…</div>';
  try {
    // Serve from client-side cache if fresh (channels only, not DMs)
    const isDM = channelId.startsWith('D');
    const cached = !isDM && _clientMsgCache.get(channelId);
    const messages = (cached && Date.now() - cached.ts < CLIENT_MSG_TTL)
      ? cached.data
      : await apiFetch(`/api/slack/messages/${channelId}`);

    if (!isDM && messages !== cached?.data) {
      _clientMsgCache.set(channelId, { data: messages, ts: Date.now() });
    }

    if (!Array.isArray(messages) || !messages.length) {
      el.innerHTML = '<div class="empty-state">Start the conversation — be the first to say something</div>';
      state.channelLastTs[channelId] = String(Date.now() / 1000);
      return;
    }
    el.innerHTML = [...messages].reverse().map(renderMessage).join('');
    const newestTs = messages.reduce((max, m) => (m.ts > max ? m.ts : max), '0');
    state.channelLastTs[channelId] = newestTs;
    el.scrollTop = el.scrollHeight;
  } catch (e) {
    const msg = e.data?.fix || e.message;
    el.innerHTML = `<div class="error-state">⚠️ ${escHtml(msg)}</div>`;
  }
}

// ── Slack OAuth ────────────────────────────────────────────────────────────

async function checkSlackAuth() {
  const name = getStudentName();
  if (!name) return;
  try {
    const status = await apiFetch('/api/slack/auth-status');
    if (status.userId) state.slackUserId = status.userId;
    if (status.teamId) window._slackTeamId = status.teamId;
    updateSlackAuthUI(status);
    // Profile dot must reflect the real OAuth token specifically (status.connected),
    // not auto-link (status.autoLinked) — auto-link alone doesn't enable as-user
    // mentor-chat posting, so showing it as "Connected" here would be misleading.
    updateProfileSlackStatus(status.connected, status.userName);
  } catch {}
}

// ── DM polling ────────────────────────────────────────────────────────────────
const NOTIF_KEY = 'mentorNotifDismissed';
let lastKnownDMs      = {};
let dmPollingInterval = null;

async function startDMPolling() {
  if (dmPollingInterval) return;

  async function checkDMs() {
    // Don't re-trigger if the student has already dismissed a mentor notification
    if (localStorage.getItem(NOTIF_KEY) === 'true') return;
    try {
      const auth = await safeFetch('/api/slack/auth-status');
      if (auth.error || (!auth.connected && !auth.hasUserToken)) return;

      const data = await safeFetch('/api/slack/dm-check');

      if (data.hasNewDMs && data.dms?.length > 0) {
        data.dms.forEach(dm => {
          if (lastKnownDMs[dm.channelId] !== dm.ts) {
            lastKnownDMs[dm.channelId] = dm.ts;
            showDMNotification(dm);
          }
        });
      }
    } catch (err) {
      console.error('[DM Poll]', err.message);
    }
  }

  await checkDMs();
  dmPollingInterval = setInterval(checkDMs, 45000);
  console.log('[DM Poll] Started — every 45 seconds (Socket Mode handles instant delivery)');
}

// Pending DM channel — set when a notification arrives, cleared when opened
window.pendingDMChannelId = null;

// loadDMConversation — loads a DM (or any channel) directly via selectChannel.
// Used for DM channels that are never rendered in the #channels-list DOM.
async function loadDMConversation(channelId) {
  console.log('[Slack] Loading DM:', channelId);
  if (typeof window.selectChannel === 'function') {
    await window.selectChannel(channelId, 'Direct Message');
  }
  clearSlackBadge();
}

function clearSlackBadge() {
  document.querySelectorAll(
    '.snb-dm-badge, .snb-slack-badge, ' +
    '.slack-badge, .slack-notification-count, ' +
    '[id*="slack"][id*="badge"]'
  ).forEach(b => { b.textContent = ''; b.style.display = 'none'; try { b.remove(); } catch(_) {} });
  if (typeof window.SlackBadge?.clear === 'function') window.SlackBadge.clear();
  console.log('[Slack] Badge cleared');
}
window.clearSlackBadge = clearSlackBadge;

function openSlackToChannel(channelId) {
  console.log('[Slack] Opening to:', channelId);
  if (!channelId) return;
  clearSlackBadge();

  // Mark DM as read immediately so polling won't re-notify
  if (channelId.startsWith('D')) {
    fetch('/api/slack/mark-dm-read', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId }),
    }).catch(() => {});
  }

  // Click the Slack nav button — broadest selector covers desktop, mobile drawer, and any alias
  const slackBtn = document.querySelector(
    '[data-panel="slack"], ' +
    '[data-nav="slack"], ' +
    '.classic-nav-btn[data-panel="slack"]'
  );
  if (slackBtn) {
    slackBtn.click();
    console.log('[Slack] Nav button clicked');
  } else {
    console.error('[Slack] Nav button not found');
  }

  setTimeout(() => {
    const isDM = channelId.startsWith('D') || channelId.startsWith('G');

    if (isDM) {
      loadDMConversation(channelId);
    } else {
      const channelEl = document.querySelector('[data-channel-id="' + channelId + '"]');
      if (channelEl) {
        channelEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        channelEl.click();
        setTimeout(() => {
          const msgList = document.querySelector(
            '.messages-list, #messages-list, .slack-messages, .message-list'
          );
          if (msgList) msgList.scrollTop = msgList.scrollHeight;
        }, 500);
      } else {
        loadDMConversation(channelId);
      }
    }

  }, 400);
}

function showDMNotification(dm) {
  // Never show again after the student has dismissed a mentor notification
  if (localStorage.getItem(NOTIF_KEY) === 'true') return;

  window.pendingDMChannelId = dm.channelId; // cleared when student opens the DM
  const existing = document.getElementById('dm-notif-' + dm.channelId);
  if (existing) existing.remove();

  const notif = document.createElement('div');
  notif.id = 'dm-notif-' + dm.channelId;
  notif.style.cssText = [
    'position:fixed', 'bottom:80px', 'right:20px',
    'background:var(--sp-ink)', 'color:var(--sp-paper)', 'padding:14px 18px',
    'border-radius:16px', 'max-width:300px', 'width:90%',
    'z-index:999999', 'box-shadow:var(--sp-shadow)',
    'cursor:pointer', 'border-left:4px solid var(--sp-coral)',
    'font-family:sans-serif', 'animation:slideInRight 0.3s ease',
  ].join(';');

  notif.innerHTML =
    '<div style="font-size:11px;opacity:0.8;margin-bottom:6px;' +
    'text-transform:uppercase;letter-spacing:0.05em">💬 Direct Message</div>' +
    '<div style="font-size:13px;font-weight:500;line-height:1.4;margin-bottom:6px">' +
    escHtml((dm.latestText || 'New message').substring(0, 80)) + '</div>' +
    '<div style="font-size:11px;opacity:0.7">Tap to open DM →</div>';

  notif.onclick = () => {
    localStorage.setItem(NOTIF_KEY, 'true');
    notif.remove();
    clearSlackBadge();
    window.pendingDMChannelId = null;
    fetch('/api/slack/mark-dm-read', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelId: dm.channelId, ts: dm.ts }),
    }).catch(() => {});
    openSlackToChannel(dm.channelId);
  };
  document.body.appendChild(notif);
  setTimeout(() => { if (notif.parentNode) notif.remove(); }, 10000);

  const navBtn = document.querySelector('.classic-nav-btn[data-panel="slack"]');
  if (navBtn) {
    navBtn.style.position = 'relative';
    let badge = navBtn.querySelector('.snb-dm-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'snb-dm-badge snb-badge';
      navBtn.appendChild(badge);
    }
    badge.textContent = dm.unreadCount || '!';
  }
}

function showChannelNotification(data) {
  const existing = document.getElementById('channel-notif-' + data.channelId);
  if (existing) existing.remove();

  const notif = document.createElement('div');
  notif.id = 'channel-notif-' + data.channelId;
  notif.style.cssText = [
    'position:fixed', 'bottom:80px', 'right:20px',
    'background:var(--sp-ink)', 'color:var(--sp-paper)', 'padding:14px 18px',
    'border-radius:16px', 'max-width:300px', 'width:90%',
    'z-index:999999', 'box-shadow:var(--sp-shadow)',
    'cursor:pointer', 'border-left:4px solid var(--sp-coral)',
    'font-family:sans-serif', 'animation:slideInRight 0.3s ease',
  ].join(';');

  notif.innerHTML =
    '<div style="font-size:11px;opacity:0.8;margin-bottom:6px;' +
    'text-transform:uppercase;letter-spacing:0.05em"># New Slack message</div>' +
    '<div style="font-size:13px;font-weight:500;line-height:1.4;margin-bottom:6px">' +
    escHtml((data.text || 'New message').substring(0, 80)) + '</div>' +
    '<div style="font-size:11px;opacity:0.7">Tap to open message →</div>';

  notif.onclick = () => { notif.remove(); clearSlackBadge(); openSlackToChannel(data.channelId); };
  document.body.appendChild(notif);
  setTimeout(() => { if (notif.parentNode) notif.remove(); }, 10000);
}

// Expose for slack-badge.js (separate script, no module scope)
window.showDMNotification      = showDMNotification;
window.showChannelNotification = showChannelNotification;

function updateSlackAuthUI(status) {
  const bar = document.getElementById('slack-auth-bar');
  if (!bar) return;
  bar.style.display = '';

  if (status?.connected) {
    startDMPolling();
    // Discard any DM channel IDs that were opened by the bot — they can't be
    // posted to via the user token. Next click will call open-dm with user token.
    window._slackExistingDMs = {};
    window._dmChannelToUser = {};
    const missingScope = status.grantedScopes && !status.grantedScopes.includes('chat:write');
    const encodedName = encodeURIComponent(getStudentName());
    if (missingScope) {
      bar.innerHTML = `
        <span class="slack-auth-text">
          Signed in as <strong>${escHtml(status.userName || 'You')}</strong> — sending via YSC Bot
        </span>`;
    } else {
      bar.innerHTML = `
        <span class="slack-identity-chip">
          <span class="slack-check">✓</span>
          Sending as <strong style="margin-left:3px">${escHtml(status.userName || 'You')}</strong>
        </span>
        <button class="slack-disconnect-btn" id="slack-disconnect-btn">Disconnect</button>`;
      document.getElementById('slack-disconnect-btn')?.addEventListener('click', disconnectSlack);
    }
  } else if (status?.autoLinked) {
    // Auto-linked via Google email — identity is known, messages sent via school bot
    bar.innerHTML = `
      <span class="slack-identity-chip">
        <span class="slack-check">✓</span>
        Slack linked as <strong style="margin-left:3px">${escHtml(status.userName || 'You')}</strong>
      </span>`;
  } else {
    bar.innerHTML = `
      <span class="slack-auth-text">
        Sending via <strong>YSC Bot</strong> — Slack is linking automatically
      </span>`;
  }
}

async function disconnectSlack() {
  try {
    await apiFetch('/api/slack/disconnect', { method: 'POST' });
  } catch {}
  updateSlackAuthUI({ connected: false });
  updateProfileSlackStatus(false, null);
}

async function sendSlackMessage() {
  const input = document.getElementById('slack-message-input');
  const text = input.value.trim();
  if (!text || !state.activeChannel) return;
  const channel = state.activeChannel;
  input.value = '';

  // ── Optimistic UI — show the message immediately before the API responds ──
  const optimisticId = `opt-${Date.now()}`;
  const msgsEl = document.getElementById('messages-list');
  if (msgsEl) {
    const html = renderMessage({
      ts: String(Date.now() / 1000),
      text,
      user: state.slackUserId || '__me__',
      userName: getStudentName(),
      _sent: true,
      _optimisticId: optimisticId,
    });
    msgsEl.insertAdjacentHTML('beforeend', html);
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  const removeOptimistic = () => msgsEl?.querySelector(`[data-optimistic-id="${optimisticId}"]`)?.remove();

  try {
    const result = await apiFetch('/api/slack/send', { method: 'POST', body: JSON.stringify({ channel, text }) });

    // Update channelLastTs so the next poll only fetches messages AFTER this one
    if (result.ts && state.channelLastTs[channel]) {
      state.channelLastTs[channel] = result.ts;
    }

    // For DMs: immediately reload to replace optimistic bubble with the real
    // Slack message (confirms delivery and gets the correct server-side ts).
    // For channels: the optimistic bubble is fine; the 5-second poll will catch
    // any ordering issues.
    if (channel.startsWith('D')) {
      removeOptimistic();
      await loadMessages(channel);
    }
  } catch (e) {
    removeOptimistic();
    input.value = text;

    // Stale bot DM channel — re-open with user token and retry
    if (e.data?.code === 'restricted_action_read_only_channel' && channel.startsWith('D')) {
      const userId = window._dmChannelToUser?.[channel];
      if (userId) {
        try {
          delete window._slackExistingDMs[userId];
          delete window._dmChannelToUser[channel];
          const { channelId: freshChannel } = await apiFetch('/api/slack/open-dm', {
            method: 'POST',
            body: JSON.stringify({ userId }),
          });
          state.activeChannel = freshChannel;
          window._slackExistingDMs[userId] = freshChannel;
          window._dmChannelToUser[freshChannel] = userId;
          input.value = '';
          // Re-enter this function now that we have the correct channel
          await sendSlackMessage();
          return;
        } catch (retryErr) {
          input.value = text;
          alert(`Failed to send: ${retryErr.message}`);
          return;
        }
      }
      input.value = text;
      showToast("Please click the contact's name again, then resend.", 'warn');
      return;
    }
    alert(`Failed to send: ${e.message}`);
  }
}

// ── Slack: Find Channels ───────────────────────────────────────────────────
let allChannelsCache = null;

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }

async function openFindChannels() {
  openModal('find-channels-modal');
  document.getElementById('channel-search-input').value = '';
  if (!allChannelsCache) {
    document.getElementById('all-channels-list').innerHTML = '<div class="loading">Loading…</div>';
    try {
      allChannelsCache = await apiFetch('/api/slack/all-channels');
    } catch (e) {
      document.getElementById('all-channels-list').innerHTML = `<div class="error-state">⚠️ ${escHtml(e.message)}</div>`;
      return;
    }
  }
  renderAllChannels(allChannelsCache);
  document.getElementById('channel-search-input').focus();
}

function renderAllChannels(channels) {
  const query = document.getElementById('channel-search-input').value.toLowerCase();
  const filtered = query ? channels.filter(c => c.name.includes(query) || c.purpose.toLowerCase().includes(query)) : channels;
  const el = document.getElementById('all-channels-list');
  if (!filtered.length) { el.innerHTML = '<div class="empty-state">No channels match.</div>'; return; }
  el.innerHTML = filtered.map(c => `
    <div class="modal-channel-item">
      <div class="modal-channel-info">
        <div class="modal-channel-name">#${escHtml(c.name)}</div>
        <div class="modal-channel-meta">${c.num_members} members${c.purpose ? ' · ' + escHtml(c.purpose.slice(0, 60)) : ''}</div>
      </div>
      <button class="btn-join" data-channel-id="${c.id}" data-channel-name="${escHtml(c.name)}"
        ${c.is_member ? 'disabled' : ''}>${c.is_member ? '✓ Joined' : 'Join'}</button>
    </div>`).join('');
  el.querySelectorAll('.btn-join:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => joinChannelById(btn.dataset.channelId, btn.dataset.channelName, btn));
  });
}

async function joinChannelById(id, name, btn) {
  btn.textContent = 'Joining…';
  btn.disabled = true;
  try {
    await apiFetch('/api/slack/join-channel', { method: 'POST', body: JSON.stringify({ channelId: id }) });
    btn.textContent = '✓ Joined';
    // Mark as member in cache so re-filter reflects it
    if (allChannelsCache) {
      const ch = allChannelsCache.find(c => c.id === id);
      if (ch) ch.is_member = true;
    }
    loadChannels(); // refresh sidebar
  } catch (e) {
    btn.textContent = 'Join';
    btn.disabled = false;
    alert(`Could not join #${name}: ${e.message}`);
  }
}

// ── Slack: Add Channel ─────────────────────────────────────────────────────
async function submitAddChannel() {
  const input = document.getElementById('add-channel-name');
  const status = document.getElementById('add-channel-status');
  const btn = document.getElementById('add-channel-submit');
  const name = input.value.trim().replace(/^#/, '');
  if (!name) return;

  btn.disabled = true;
  btn.textContent = 'Joining…';
  status.className = 'modal-status';
  status.textContent = '';

  try {
    await apiFetch('/api/slack/join-channel', { method: 'POST', body: JSON.stringify({ channelName: name }) });
    status.className = 'modal-status ok';
    status.textContent = `✓ Joined #${name}`;
    input.value = '';
    allChannelsCache = null; // invalidate so find-channels reloads
    loadChannels();
  } catch (e) {
    status.className = 'modal-status err';
    status.textContent = `⚠️ ${e.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Join Channel';
  }
}

// ── Slack: Direct Messages ─────────────────────────────────────────────────
async function loadDMs() {
  const el = document.getElementById('channels-list');
  const title = document.getElementById('slack-sidebar-title');
  title.textContent = 'Direct Messages';
  document.getElementById('dmBtn').classList.add('active');
  window._slackMembers = null;
  window._slackExistingDMs = {};
  window._dmChannelToUser = {};

  el.innerHTML = `
    <div class="dm-search-wrap">
      <input id="dm-search" class="dm-search" placeholder="Find someone…" autocomplete="off" />
    </div>
    <div id="dm-member-list"><div class="loading">Loading members…</div></div>`;

  document.getElementById('dm-search').addEventListener('input', e => {
    if (window._slackMembers) renderMemberList(window._slackMembers, e.target.value);
  });

  try {
    // Load all members and existing DM channels in parallel
    const [members, dms] = await Promise.all([
      apiFetch('/api/slack/members'),
      apiFetch('/api/slack/dms').catch(() => []),
    ]);



    window._slackMembers = members;
    renderMemberList(members, '');
  } catch (e) {
    const listEl = document.getElementById('dm-member-list');
    if (listEl) listEl.innerHTML = `<div class="error-state">⚠️ ${escHtml(e.message)}</div>`;
  }
}

function renderMemberList(members, query) {
  const listEl = document.getElementById('dm-member-list');
  if (!listEl) return;
  const q = query.toLowerCase().trim();
  const filtered = q
    ? members.filter(m => m.name.toLowerCase().includes(q) || (m.title || '').toLowerCase().includes(q))
    : members;
  if (!filtered.length) { listEl.innerHTML = '<div class="empty-state">No members match.</div>'; return; }
  listEl.innerHTML = filtered.map(m => `
    <div class="dm-item" data-user-id="${m.id}" data-user-name="${escHtml(m.name)}">
      <div class="dm-avatar" style="background:${avatarColor(m.name)}">${avatarInitial(m.name)}</div>
      <div class="dm-item-info">
        <div class="dm-item-name">${escHtml(m.name)}</div>
        ${m.title ? `<div class="dm-item-title">${escHtml(m.title)}</div>` : ''}
      </div>
    </div>`).join('');
  listEl.querySelectorAll('.dm-item').forEach(item => {
    item.addEventListener('click', () => openMemberDM(item.dataset.userId, item.dataset.userName, item));
  });
}

async function openMemberDM(userId, name, itemEl) {
  document.querySelectorAll('.dm-item').forEach(el => el.classList.remove('active'));
  if (itemEl) itemEl.classList.add('active');
  document.getElementById('current-channel-name').textContent = name;
  document.getElementById('slack-composer').style.display = 'flex';
  const refreshBtn = document.getElementById('msg-refresh-btn');
  if (refreshBtn) refreshBtn.style.display = '';

  const messagesEl = document.getElementById('messages-list');

  // If we already have an open DM channel for this user, use it directly
  const existingChannelId = window._slackExistingDMs?.[userId];
  if (existingChannelId) {
    state.activeChannel = existingChannelId;
    loadMessages(existingChannelId);
    return;
  }

  // Otherwise open a new DM (requires im:write scope on the bot or user token)
  messagesEl.innerHTML = '<div class="loading">Opening conversation…</div>';
  try {
    const { channelId } = await apiFetch('/api/slack/open-dm', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
    state.activeChannel = channelId;
    window._slackExistingDMs[userId] = channelId;
    window._dmChannelToUser[channelId] = userId;
    loadMessages(channelId);
  } catch (e) {
    messagesEl.innerHTML = `<div class="error-state">⚠️ ${escHtml(e.message)}</div>`;
  }
}

function showChannelsMode() {
  document.getElementById('slack-sidebar-title').textContent = 'Channels';
  document.getElementById('dmBtn').classList.remove('active');
  window._slackMembers = null;
  loadChannels();
}

// ── Calendar ───────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const EVENT_COLORS = { assignment:'#e74c3c', class:'#2B3BFF', appointment:'#27ae60', reminder:'#f39c12', canvas:'#e74c3c', sport:'#FFD23D', soccer:'#FFD23D', study:'#FF8A5B' };

function calPad(n) { return String(n).padStart(2, '0'); }
function calDateStr(d) { return `${d.getFullYear()}-${calPad(d.getMonth()+1)}-${calPad(d.getDate())}`; }

async function initCalendar() {
  if (!state.cal.initialized) {
    state.cal.initialized = true;
    await Promise.all([loadCalendarEvents(), loadCanvasForCalendar()]);
  }
  renderCalendar();
  renderUpcoming();
}

async function loadCalendarEvents() {
  try { state.cal.events = await apiFetch('/api/calendar/events'); }
  catch (e) { console.error('Calendar load error:', e.message); }
}

// ── Canvas → Calendar sync ─────────────────────────────────────────────────
const AUTO_SYNC_KEY = 'ysc-canvas-auto-sync';

async function syncCanvasToCalendar(courseFilter = null) {
  const btn    = document.getElementById('canvasSyncBtn');
  const status = document.getElementById('sync-status');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Syncing…'; }
  if (status) { status.textContent = ''; status.className = 'sync-status'; }

  try {
    const result = await apiFetch('/api/calendar/sync-canvas', {
      method: 'POST',
      body: JSON.stringify({ courseFilter: courseFilter || null }),
    });

    // Refresh calendar
    await loadCalendarEvents();
    renderCalendar();
    renderUpcoming();

    const { added = [], updated = [] } = result;
    let msg = '';
    if (added.length || updated.length) {
      msg  = added.length    ? `✓ Added ${added.length}` : '';
      msg += updated.length  ? `${msg ? ', updated ' : '✓ Updated '}${updated.length}` : '';
    } else {
      msg = '✓ Already up to date';
    }
    if (status) {
      status.textContent = msg;
      status.className   = 'sync-status success';
      setTimeout(() => { if (status) { status.textContent = ''; status.className = 'sync-status'; } }, 5000);
    }
    return result;
  } catch (e) {
    const msg = isCanvasNotConnected(e)
      ? 'Connect your Canvas account (Canvas panel in the sidebar) to sync.'
      : `⚠ ${e.message}`;
    if (status) { status.textContent = msg; status.className = 'sync-status error'; }
    throw e;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = '📅 Sync All to Calendar'; }
  }
}

async function loadCanvasForCalendar() {
  try {
    const assignments = state.assignments.length
      ? state.assignments
      : await getCanvasAssignments();
    state.cal.canvasEvents = assignments
      .filter(a => a.due_at)
      .map(a => ({
        id: `canvas-${a.id}`,
        title: a.name,
        type: 'canvas',
        date: a.due_at.slice(0, 10),
        startTime: a.due_at.slice(11, 16),
        endTime: '',
        description: `Canvas · ${fmtDate(a.due_at)}`,
        url: a.html_url,
        readOnly: true,
      }));
  } catch (e) {
    // 428 = Canvas not connected — expected/silent, same as this function's
    // sibling Canvas loaders (loadAssignments, loadAnnouncements). Only
    // genuinely unexpected failures get logged.
    if (isCanvasNotConnected(e)) return;
    console.error('Canvas calendar error:', e.message);
  }
}

function renderCalendar() {
  const { year, month } = state.cal;
  const titleEl = document.getElementById('cal-month-title');
  if (!titleEl) return;
  titleEl.textContent = `${MONTH_NAMES[month]} ${year}`;

  const firstDay      = new Date(year, month, 1).getDay();
  const daysInMonth   = new Date(year, month + 1, 0).getDate();
  const daysInPrevMo  = new Date(year, month, 0).getDate();
  const todayStr      = calDateStr(new Date());
  // Exclude ephemeral canvas events that have already been synced to events.json
  const syncedIds     = new Set(state.cal.events.filter(e => e.canvas_id).map(e => String(e.canvas_id)));
  const ephemeralEvts = state.cal.canvasEvents.filter(e => !syncedIds.has(e.id.replace('canvas-', '')));
  const allEvents     = [...state.cal.events, ...ephemeralEvts];

  const cells = [];

  for (let i = firstDay - 1; i >= 0; i--) {
    const d = daysInPrevMo - i;
    const pm = month === 0 ? 11 : month - 1;
    const py = month === 0 ? year - 1 : year;
    cells.push({ day: d, date: `${py}-${calPad(pm+1)}-${calPad(d)}`, current: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, date: `${year}-${calPad(month+1)}-${calPad(d)}`, current: true });
  }
  let nd = 1;
  const total = Math.ceil(cells.length / 7) * 7;
  while (cells.length < total) {
    const nm = month === 11 ? 0 : month + 1;
    const ny = month === 11 ? year + 1 : year;
    cells.push({ day: nd, date: `${ny}-${calPad(nm+1)}-${calPad(nd)}`, current: false });
    nd++;
  }

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = cells.map(cell => {
    const evts  = allEvents.filter(e => e.date === cell.date);
    const shown = evts.slice(0, 3);
    const extra = evts.length - 3;
    const isToday = cell.date === todayStr;
    return `<div class="cal-day${!cell.current ? ' other-month' : ''}${isToday ? ' today' : ''}" data-date="${cell.date}">
      <div class="cal-day-num${isToday ? ' today-num' : ''}">${cell.day}</div>
      ${shown.map(e => `<div class="cal-event event-${e.type}" data-event-id="${e.id}" title="${escHtml(e.title)}">${e.startTime ? `<span class="cal-event-time">${e.startTime}</span> ` : ''}${escHtml(e.title)}</div>`).join('')}
      ${extra > 0 ? `<div class="cal-overflow">+${extra} more</div>` : ''}
    </div>`;
  }).join('');

  grid.querySelectorAll('.cal-day').forEach(cell => {
    cell.addEventListener('click', e => {
      if (!e.target.closest('.cal-event')) openEventModal(cell.dataset.date);
    });
  });
  grid.querySelectorAll('.cal-event').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const ev = [...state.cal.events, ...state.cal.canvasEvents].find(x => x.id === chip.dataset.eventId);
      if (!ev) return;
      ev.readOnly ? (ev.url && openExternalLink(ev.url)) : openEventModal(ev.date, ev);
    });
  });
}

function renderUpcoming() {
  const el = document.getElementById('upcoming-events');
  if (!el) return;
  const countEl = document.getElementById('upcoming-count');
  const today = new Date(); today.setHours(0,0,0,0);
  const in7 = new Date(today); in7.setDate(today.getDate() + 7);

  const syncedIds2 = new Set(state.cal.events.filter(e => e.canvas_id).map(e => String(e.canvas_id)));
  const upcoming = [...state.cal.events, ...state.cal.canvasEvents.filter(e => !syncedIds2.has(e.id.replace('canvas-', '')))]
    .filter(e => { const d = new Date(e.date + 'T00:00:00'); return d >= today && d <= in7; })
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime||'').localeCompare(b.startTime||''));

  if (countEl) countEl.textContent = upcoming.length;

  if (!upcoming.length) { el.innerHTML = '<div class="notif-empty-section">Clear week ahead — great time to get ahead</div>'; return; }

  el.innerHTML = upcoming.map(e => `
    <div class="list-item upcoming-event${e.readOnly ? '' : ' editable'}" data-event-id="${e.id}">
      <div class="list-item-title" style="display:flex;align-items:center;gap:6px">
        <span style="width:9px;height:9px;border-radius:3px;background:${EVENT_COLORS[e.type]||'#888'};flex-shrink:0;display:inline-block"></span>
        ${e.readOnly
          ? `<a class="list-link" href="${e.url}" target="_blank">${escHtml(e.title)}</a>`
          : escHtml(e.title)}
      </div>
      <div class="list-item-sub">
        ${new Date(e.date+'T00:00:00').toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})}${e.startTime ? ` · ${e.startTime}` : ''}
      </div>
    </div>`).join('');

  el.querySelectorAll('.upcoming-event.editable').forEach(item => {
    item.addEventListener('click', () => {
      const ev = state.cal.events.find(x => x.id === item.dataset.eventId);
      if (ev) openEventModal(ev.date, ev);
    });
  });
}

// ── Assignment Notifications ───────────────────────────────────────────────

function daysUntilDue(isoStr) {
  return (new Date(isoStr) - new Date()) / 86400000;
}

function urgencyClass(isoStr) {
  const d = daysUntilDue(isoStr);
  if (d < 0)   return 'notif-overdue';
  if (d < 1)   return 'notif-today';
  if (d < 2)   return 'notif-tomorrow';
  if (d < 3.5) return 'notif-near';
  return 'notif-coming';
}

function dueLabel(isoStr) {
  const d = daysUntilDue(isoStr);
  if (d < 0) {
    const n = Math.round(-d);
    return n === 0 ? 'Yesterday' : `${n} day${n !== 1 ? 's' : ''} overdue`;
  }
  if (d < 0.04) return 'Due now';
  if (d < 1)    return 'Due today';
  if (d < 2)    return 'Due tomorrow';
  const days = Math.ceil(d);
  return `Due in ${days} day${days !== 1 ? 's' : ''}`;
}

function fmtDueTimestamp(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function renderNotifItem(a) {
  const cls   = urgencyClass(a.dueAt);
  const label = dueLabel(a.dueAt);
  return `<div class="notif-item ${cls}">
    <div class="notif-item-name"><a class="notif-link" href="${escHtml(a.url)}" target="_blank">${escHtml(a.name)}</a></div>
    <div class="notif-item-meta">
      <span class="notif-item-course">${escHtml(a.courseName)}</span>
      <span class="notif-item-due">${label}</span>
    </div>
    <div class="notif-item-date">${fmtDueTimestamp(a.dueAt)}</div>
  </div>`;
}

async function loadNotifications() {
  try {
    const data = await apiFetch('/api/canvas/notifications');
    state.notifications = data;
    renderBellBadge(data);
    renderNotificationDropdown(data);
    renderCalendarNotifications(data);
    initBrowserNotifications(data);
  } catch (e) {
    const body = document.getElementById('notif-panel-body');
    if (renderCanvasFailure(body, e)) return;
    console.warn('[Notifications] Load error:', e.message);
    if (body) body.innerHTML = `<div class="error-state">⚠️ ${escHtml(e.message)}</div>`;
  }
}

function renderBellBadge(data) {
  const count = (data.todayCount || 0) + (data.upcomingCount || 0);
  const badge = document.getElementById('notif-badge');
  const btn   = document.getElementById('notif-bell-btn');
  if (!badge) return;
  badge.textContent = count > 99 ? '99+' : String(count);
  badge.style.display = count > 0 ? '' : 'none';
  btn?.classList.toggle('has-alerts', count > 0);
}

function renderNotificationDropdown(data) {
  const body = document.getElementById('notif-dropdown-body');
  if (!body) return;
  const allUrgent = [...(data.dueToday || []), ...(data.upcoming || [])];
  if (!allUrgent.length && !data.missing?.length) {
    body.innerHTML = '<div class="notif-empty">No upcoming assignments right now.</div>';
    return;
  }
  let html = '';
  if (data.dueToday?.length) {
    html += `<div class="notif-section-head notif-red-head">Due Today (${data.dueToday.length})</div>`;
    html += data.dueToday.map(renderNotifItem).join('');
  }
  if (data.upcoming?.length) {
    html += `<div class="notif-section-head">Next 7 Days (${data.upcoming.length})</div>`;
    html += data.upcoming.map(renderNotifItem).join('');
  }
  if (data.missing?.length) {
    html += `<div class="notif-section-head notif-red-head">Past due (${data.missing.length})</div>`;
    html += data.missing.slice(0, 5).map(renderNotifItem).join('');
  }
  body.innerHTML = html;
}

function renderCalendarNotifications(data) {
  // Summary stats
  const w = document.getElementById('notif-stat-week');
  const t = document.getElementById('notif-stat-today');
  const m = document.getElementById('notif-stat-missing');
  if (w) w.textContent = data.weekCount    ?? 0;
  if (t) t.textContent = data.todayCount   ?? 0;
  if (m) m.textContent = data.missingCount ?? 0;

  // "Next due" bar
  const nextEl   = document.getElementById('notif-next');
  const nextLink = document.getElementById('notif-next-link');
  if (data.nextDue && nextEl && nextLink) {
    const nd  = data.nextDue;
    const dt  = new Date(nd.dueAt);
    const lbl = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    nextLink.textContent = `${nd.name} · ${lbl}`;
    nextLink.href        = nd.url;
    nextEl.style.display = '';
  } else if (nextEl) {
    nextEl.style.display = 'none';
  }

  // Notification sections panel
  const body = document.getElementById('notif-panel-body');
  if (!body) return;

  const section = (title, count, items, isRed, emptyText) => {
    const headClass = isRed ? 'notif-section-title notif-red-head' : 'notif-section-title';
    const cntClass  = isRed ? 'notif-section-count notif-red-count' : 'notif-section-count';
    return `<div class="notif-section">
      <div class="${headClass}">
        <span>${title}</span>
        <span class="${cntClass}">${count}</span>
      </div>
      ${items.length ? items.map(renderNotifItem).join('') : `<div class="notif-empty-section">${emptyText}</div>`}
    </div>`;
  };

  // Middle section is a shell only — renderUpcoming() (below) owns
  // #upcoming-events' actual content and fires independently (calendar
  // load, event save/delete, etc.), not just on notification load like
  // this function. It shows the fuller merged view (assignments +
  // calendar events — games, practices, personal notes) rather than the
  // Canvas-only list this section used to render, since that's a strict
  // superset and having both was redundant in a 215px-wide sidebar.
  body.innerHTML =
    section('Due Today', data.todayCount ?? 0, data.dueToday ?? [], true, 'Nothing due today') +
    `<div class="notif-section">
      <div class="notif-section-title">
        <span>Upcoming</span>
        <span class="notif-section-count" id="upcoming-count">0</span>
      </div>
      <div id="upcoming-events"><div class="notif-empty-section">Loading…</div></div>
    </div>` +
    section('Past Due', data.missingCount ?? 0, data.missing ?? [], true, 'All caught up — nothing past due');

  renderUpcoming();
}

async function initBrowserNotifications(data) {
  const urgent = [...(data.dueToday || []),
    ...(data.upcoming || []).filter(a => daysUntilDue(a.dueAt) < 2)];
  if (!urgent.length || !('Notification' in window) || window._notifFired) return;
  window._notifFired = true;

  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return;

  for (const a of urgent.slice(0, 3)) {
    const n = new Notification(`${dueLabel(a.dueAt)}: ${a.name}`, {
      body: `${a.courseName} — click to open in Canvas`,
      icon: '/logo.jpg',
      tag:  `canvas-${a.id}`,
    });
    n.onclick = () => { openExternalLink(a.url); n.close(); };
  }
}

function openEventModal(date, event = null) {
  document.getElementById('event-modal-title').textContent = event ? 'Edit Event' : 'Add Event';
  document.getElementById('event-id').value       = event?.id || '';
  document.getElementById('event-title').value    = event?.title || '';
  document.getElementById('event-type').value     = event?.type || 'reminder';
  document.getElementById('event-start').value    = event?.startTime || '';
  document.getElementById('event-end').value      = event?.endTime || '';
  document.getElementById('event-desc').value     = event?.description || '';
  document.getElementById('event-modal').dataset.date = date;
  document.getElementById('event-delete-btn').style.display = event ? 'inline-flex' : 'none';
  openModal('event-modal');
  setTimeout(() => document.getElementById('event-title').focus(), 80);
}

async function saveEvent() {
  const title = document.getElementById('event-title').value.trim();
  if (!title) { document.getElementById('event-title').focus(); return; }

  const id = document.getElementById('event-id').value;
  const payload = {
    title,
    type:        document.getElementById('event-type').value,
    date:        document.getElementById('event-modal').dataset.date,
    startTime:   document.getElementById('event-start').value,
    endTime:     document.getElementById('event-end').value,
    description: document.getElementById('event-desc').value,
  };

  const btn = document.getElementById('event-save-btn');
  btn.disabled = true; btn.textContent = 'Saving…';

  try {
    if (id) {
      const updated = await apiFetch(`/api/calendar/events/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
      state.cal.events = state.cal.events.map(e => e.id === id ? updated : e);
    } else {
      const created = await apiFetch('/api/calendar/events', { method: 'POST', body: JSON.stringify(payload) });
      state.cal.events.push(created);
    }
    closeModal('event-modal');
    renderCalendar();
    renderUpcoming();
  } catch (e) {
    alert(`Could not save event: ${e.message}`);
  } finally {
    btn.disabled = false; btn.textContent = 'Save';
  }
}

async function deleteCalEvent() {
  const id = document.getElementById('event-id').value;
  if (!id || !confirm('Delete this event?')) return;
  try {
    await apiFetch(`/api/calendar/events/${id}`, { method: 'DELETE' });
    state.cal.events = state.cal.events.filter(e => e.id !== id);
    closeModal('event-modal');
    renderCalendar();
    renderUpcoming();
  } catch (e) {
    alert(`Could not delete: ${e.message}`);
  }
}

// ── Google Drive ───────────────────────────────────────────────────────────
async function loadMyFiles() {
  const el = document.getElementById('my-files-list');
  const btn = document.querySelector('[data-action="refreshMyFiles"]');
  spin(btn);
  try {
    const data = await apiFetch('/api/drive/files');
    // Server returns { files: [], message } when token is missing — show banner
    const files = Array.isArray(data) ? data : (data?.files || []);
    if (!Array.isArray(data) && data?.message) {
      document.getElementById('google-auth-banner').style.display = 'flex';
      el.innerHTML = '<div class="empty-state">Connect Google Drive to view files.</div>';
      return;
    }
    state.myFiles = files;
    renderFiles(el, files);
  } catch (e) {
    el.innerHTML = `<div class="error-state">⚠️ ${e.message}</div>`;
  } finally { unspin(btn); }
}

async function loadSharedFiles() {
  const el = document.getElementById('shared-files-list');
  const btn = document.querySelector('[data-action="refreshSharedFiles"]');
  spin(btn);
  try {
    const data = await apiFetch('/api/drive/shared');
    const files = Array.isArray(data) ? data : (data?.files || []);
    if (!Array.isArray(data) && data?.message) {
      el.innerHTML = '<div class="empty-state">Connect Google Drive to view shared files.</div>';
      return;
    }
    state.sharedFiles = files;
    renderFiles(el, files);
  } catch (e) {
    el.innerHTML = `<div class="error-state">⚠️ ${e.message}</div>`;
  } finally { unspin(btn); }
}

function refreshDrive() {
  window.driveLoaded = true;
  loadMyFiles();
  loadSharedFiles();
}
window.refreshDrive = refreshDrive;

function renderFiles(el, files) {
  if (!files.length) { el.innerHTML = '<div class="empty-state">No files found.</div>'; return; }
  el.innerHTML = `<div style="padding:4px 0">` + files.map(f => `
    <div class="file-item">
      <span class="file-icon">${mimeIcon(f.mimeType)}</span>
      <div class="file-info">
        <div class="file-name"><a class="list-link" href="${f.webViewLink}" target="_blank">${escHtml(f.name)}</a></div>
        <div class="file-meta">Modified ${fmtRelTime(f.modifiedTime)}</div>
      </div>
    </div>`).join('') + `</div>`;
}

// ── Grades ─────────────────────────────────────────────────────────────────
function scoreToGPA(s) {
  if (s >= 93) return 4.0; if (s >= 90) return 3.7;
  if (s >= 87) return 3.3; if (s >= 83) return 3.0;
  if (s >= 80) return 2.7; if (s >= 77) return 2.3;
  if (s >= 73) return 2.0; if (s >= 70) return 1.7;
  if (s >= 67) return 1.3; if (s >= 63) return 1.0;
  if (s >= 60) return 0.7; return 0.0;
}

function gradeClass(score) {
  if (score == null) return '';
  if (score >= 90) return 'grade-a';
  if (score >= 80) return 'grade-b';
  if (score >= 70) return 'grade-c';
  if (score >= 60) return 'grade-d';
  return 'grade-f';
}

function letterFromScore(score) {
  if (score >= 93) return 'A';  if (score >= 90) return 'A−';
  if (score >= 87) return 'B+'; if (score >= 83) return 'B';
  if (score >= 80) return 'B−'; if (score >= 77) return 'C+';
  if (score >= 73) return 'C';  if (score >= 70) return 'C−';
  if (score >= 67) return 'D+'; if (score >= 63) return 'D';
  if (score >= 60) return 'D−'; return 'F';
}

async function loadGrades() {
  const list = document.getElementById('grades-list');
  if (!list) return;
  list.innerHTML = '<div class="loading">Loading grades…</div>';
  try {
    const data = await apiFetch('/api/canvas/grades');
    if (data?.error) throw new Error(data.error);

    state.grades      = data.grades      || [];
    state.missingCount = data.missingCount ?? 0;

    // GPA summary
    const scores = state.grades.map(g => g.current_score).filter(s => s != null);
    const gpa = scores.length
      ? (scores.reduce((sum, s) => sum + scoreToGPA(s), 0) / scores.length).toFixed(2)
      : '—';
    const gpaN = document.getElementById('gpa-value');
    const courseN = document.getElementById('grades-course-count');
    const missingN = document.getElementById('grades-missing-count');
    if (gpaN)    gpaN.textContent    = gpa;
    if (courseN) courseN.textContent = state.grades.length;
    if (missingN) missingN.textContent = state.missingCount;

    if (!state.grades.length) {
      list.innerHTML = '<div class="list-empty">No grade data available</div>';
      return;
    }

    list.innerHTML = state.grades.map(g => {
      const score  = g.current_score;
      const cls    = gradeClass(score);
      const pct    = score != null ? `${Math.round(score * 10) / 10}%` : '—';
      const letter = g.current_grade || (score != null ? letterFromScore(score) : '—');
      const bar    = score != null ? Math.min(100, Math.max(0, score)) : 0;
      return `
      <div class="grade-row ${cls}" data-course-id="${g.id}">
        <div class="grade-row-header">
          <a class="grade-course-name" href="${g.html_url}" target="_blank" rel="noopener">${escHtml(g.name)}</a>
          <div class="grade-badge">
            <span class="grade-pct">${pct}</span>
            <span class="grade-sep">·</span>
            <span class="grade-letter">${escHtml(letter)}</span>
          </div>
        </div>
        <div class="grade-bar-wrap">
          <div class="grade-bar"><div class="grade-bar-fill" style="width:${bar}%"></div></div>
        </div>
        <div class="grade-detail" id="grade-detail-${g.id}"></div>
        <button class="grade-detail-btn" data-course-id="${g.id}">View Details ▾</button>
      </div>`;
    }).join('');

    list.querySelectorAll('.grade-detail-btn').forEach(btn => {
      btn.addEventListener('click', () => toggleGradeDetail(btn.dataset.courseId));
    });
  } catch (e) {
    if (renderCanvasFailure(list, e)) return;
    list.innerHTML = `<div class="list-empty">Could not load grades: ${escHtml(e.message)}</div>`;
  }
}

async function toggleGradeDetail(courseId) {
  const detailEl = document.getElementById(`grade-detail-${courseId}`);
  const btn = document.querySelector(`.grade-detail-btn[data-course-id="${courseId}"]`);
  if (!detailEl || !btn) return;

  const isOpen = detailEl.classList.contains('grade-detail-open');
  if (isOpen) {
    detailEl.classList.remove('grade-detail-open');
    btn.textContent = 'View Details ▾';
    return;
  }

  detailEl.classList.add('grade-detail-open');
  btn.textContent = 'Hide Details ▲';

  if (detailEl.dataset.loaded) return;
  detailEl.innerHTML = '<div class="loading" style="padding:6px 0">Loading details…</div>';

  try {
    const data = await apiFetch(`/api/canvas/grades/${courseId}/detail`);
    detailEl.dataset.loaded = '1';

    const groups = data.groups || [];
    const recent = data.recentGraded || [];
    const hasWeights = groups.some(g => g.group_weight > 0);
    let html = '<div class="grade-detail-inner">';

    if (groups.length) {
      html += '<div class="grade-detail-section-title">Assignment Categories</div>';
      html += '<div class="grade-groups-list">';
      for (const g of groups) {
        const w = hasWeights ? ` <span class="grade-group-weight">${g.group_weight}%</span>` : '';
        html += `<div class="grade-group-item"><span class="grade-group-name">${escHtml(g.name)}</span>${w}</div>`;
      }
      html += '</div>';
    }

    if (recent.length) {
      html += '<div class="grade-detail-section-title" style="margin-top:6px">Recent Grades</div>';
      html += '<div class="grade-recent-list">';
      for (const a of recent) {
        const score = a.submission?.score ?? '—';
        const pts   = a.points_possible != null ? `/${a.points_possible}` : '';
        const pct   = a.submission?.score != null && a.points_possible
          ? ` (${Math.round(a.submission.score / a.points_possible * 1000) / 10}%)`
          : '';
        html += `<div class="grade-recent-item">
          <a class="grade-recent-name" href="${a.html_url}" target="_blank" rel="noopener">${escHtml(a.name)}</a>
          <span class="grade-recent-score">${score}${pts}${pct}</span>
        </div>`;
      }
      html += '</div>';
    }

    if (!groups.length && !recent.length) {
      html += '<div class="list-empty" style="padding:4px 0">No detailed data available.</div>';
    }

    html += '</div>';
    detailEl.innerHTML = html;
  } catch (e) {
    detailEl.innerHTML = `<div class="list-empty">Something went wrong — try again</div>`;
  }
}

// ── AI Chatbot ─────────────────────────────────────────────────────────────
function buildContext() {
  const parts = [];
  const today = new Date().toISOString().slice(0, 10);

  if (state.courses.length) {
    parts.push(`Active courses: ${state.courses.map(c => c.name).join(', ')}`);
  }
  if (state.assignments.length) {
    const upcoming = state.assignments.slice(0, 10).map(a => {
      const url = a.html_url || '#';
      const submitted = a.submission?.workflow_state === 'submitted' ? ' (submitted)' : '';
      // groupWeight/groupName come from routes/canvas.js's /assignments enrichment —
      // null for an unweighted course, so only append when it's real data, not "0%".
      const weight = (a.groupWeight != null && a.groupName)
        ? ` [${a.groupName}, worth ${a.groupWeight}% of course grade]` : '';
      const pts = a.points_possible != null ? ` (${a.points_possible} pts)` : '';
      return `[${a.name}](${url}) due ${fmtDateForContext(a.due_at)}${pts}${weight}${submitted}`;
    }).join('; ');
    parts.push(`Upcoming assignments:\n${upcoming}`);
  }
  // Outside the length check: a partial load can be an EMPTY list, which is exactly
  // when the coach would otherwise say "nothing is due".
  if (state.assignments.canvasPartial) {
    parts.push('Note: Canvas only partly loaded just now, so the assignment list may be incomplete. Do not tell the student nothing is due; suggest refreshing the Canvas panel in a minute.');
  }
  if (state.announcements.length) {
    parts.push(`Recent announcements: ${state.announcements.slice(0, 3).map(a => a.title).join(', ')}`);
  }
  if (state.channels.length) {
    parts.push(`Slack channels: ${state.channels.slice(0, 10).map(c => c.name).join(', ')}`);
  }
  if (state.myFiles.length) {
    const list = state.myFiles.slice(0, 10).map(f =>
      `[${f.name}](${f.webViewLink || f.iconLink || '#'})`
    ).join(', ');
    parts.push(`My Google Drive files (recent): ${list}`);
  }
  if (state.sharedFiles.length) {
    const list = state.sharedFiles.slice(0, 10).map(f =>
      `[${f.name}](${f.webViewLink || f.iconLink || '#'})`
    ).join(', ');
    parts.push(`Shared Google Drive files (recent): ${list}`);
  }
  if (state.grades.length) {
    const gradeList = state.grades.map(g =>
      `${g.name}: ${g.current_score != null ? g.current_score + '%' : g.current_grade || '—'}`
    ).join(', ');
    parts.push(`Current grades: ${gradeList}`);
  }
  if (state.missingCount > 0) parts.push(`Past due assignments: ${state.missingCount}`);
  // Brain-break hurdle race (public/brain-break.js): the server turns this into an instruction for the coach.
  if (typeof window !== 'undefined' && window.BrainBreak?.isEnabled?.()) parts.push(`Brain break: ${window.BrainBreak.canPlay() || window.__brainBreakTester ? 'available' : 'locked'}`);

  const focusToday = !!localStorage.getItem(`sa-f-${today}`);
  const quickDone  = !!localStorage.getItem(`sa-q-${today}`);
  parts.push(`Hub activity today — Focus session: ${focusToday ? 'completed' : 'not started'}, Quick win task: ${quickDone ? 'done' : 'not done'}`);

  const lastChatDate = localStorage.getItem('ysc-last-chat-date');
  if (lastChatDate !== today) {
    parts.push('FIRST_CHAT_TODAY=true');
    localStorage.setItem('ysc-last-chat-date', today);
  }
  return parts.join('\n');
}

// ── Game-plan completion state (assignment checkboxes in chat) ─────────────
// Fetched once after login so it's already warm by the time the first chat
// response finishes streaming and renderMarkdown() needs it synchronously —
// see the initSession().then(...) call site. Same store the Home tab's Game
// Plan checklist reads/writes (gp_completeTask/gp_uncompleteTask in
// hub-tabs.js), just a second UI surface onto it.
async function loadGamePlanCompletions() {
  const data = await safeFetch('/api/student/game-plan/completions');
  if (data && data.completions) state.gamePlanCompletions = data.completions;
}

// ── Chat link helpers ─────────────────────────────────────────────────────
const EXT_ICON = `<svg class="chat-ext-icon" width="9" height="9" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c0 1.1.9 2 2 2v-7h-2v7zM14 3v2h3.59L7.76 14.83l1.41 1.41L19 6.41V10h2V3h-7z"/></svg>`;

function smartLinkText(rawUrl) {
  try {
    const u = new URL(rawUrl);
    const h = u.hostname.replace(/^www\./, '');
    const p = u.pathname;
    // Canvas
    if (/instructure\.com/.test(h)) {
      if (/\/assignments\/\d+/.test(p)) return '📝 Open Assignment';
      if (/\/discussions\/\d+/.test(p)) return '💬 Canvas Discussion';
      if (/\/quizzes\/\d+/.test(p))    return '📋 Canvas Quiz';
      if (/\/courses\/\d+/.test(p))    return '📚 Open Course';
      return '📚 Canvas';
    }
    // Google Docs / Drive
    if (/docs\.google\.com/.test(h)) {
      if (/\/document\//.test(p))      return '📄 Open Google Doc';
      if (/\/spreadsheets\//.test(p))  return '📊 Open Google Sheet';
      if (/\/presentation\//.test(p))  return '📑 Open Google Slides';
      if (/\/forms\//.test(p))         return '📋 Open Google Form';
      return '📄 Google Docs';
    }
    if (/drive\.google\.com/.test(h)) return '📁 Open in Drive';
    // YouTube
    if (/youtube\.com/.test(h) || /youtu\.be/.test(h)) return '▶ Watch on YouTube';
    // Zoom
    if (/zoom\.us/.test(h)) return '📹 Join Zoom';
    // Generic — domain + last path segment
    const seg = p.replace(/\/$/, '').split('/').filter(Boolean).pop() || '';
    const label = seg ? decodeURIComponent(seg).slice(0, 28) : h;
    return `${h}/${label}`;
  } catch {
    return rawUrl.slice(0, 40) + (rawUrl.length > 40 ? '…' : '');
  }
}

function buildChatLink(safeHref, safeDisplay) {
  return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" class="chat-link">${safeDisplay} ${EXT_ICON}</a><button class="chat-copy-btn" data-url="${safeHref}" title="Copy link" type="button">⎘</button>`;
}

// Detects a Canvas assignment URL — the exact shape routes/chat.js's system prompt already
// requires for every assignment link — and renders a checkbox wired to the same completion
// store as the Home tab's Game Plan checklist (gp_completeTask/gp_uncompleteTask in
// hub-tabs.js). URL-pattern detection rather than a new AI-emitted marker: markers like
// [[FOCUS:...]] fire probabilistically (see CLAUDE.md's Long-Term Memory section), but the
// model is already required to link assignments in this exact form, so this can't silently
// fail to trigger. Only called from Phase 4 (markdown links) — Phase 5 raw-link display
// text is a decorative smartLinkText() label, not a real assignment name.
function assignmentCheckboxHtml(rawUrl, safeDisp) {
  const m = /\/courses\/\d+\/assignments\/(\d+)/.exec(rawUrl);
  if (!m) return '';
  const id = m[1];
  const done = !!state.gamePlanCompletions[id];
  const safeTitle = safeDisp.replace(/"/g, '&quot;');
  return `<button class="chat-task-check${done ? ' done' : ''}" data-assignment-id="${id}" data-assignment-title="${safeTitle}" aria-pressed="${done}" title="${done ? 'Mark incomplete' : 'Mark complete'}" type="button">${done ? '✓' : ''}</button>`;
}

// Safe formatter for human-written mentor/student messages (Mentor Chat, weekly mentor message).
// Mentors mostly reply from Slack, so this understands Slack's mrkdwn (*bold*, _italic_, ~strike~,
// <url|label>, <@U123>) as well as ordinary markdown (**bold**), plus bare links and "-"/"•" bullets.
// Everything is HTML-escaped first; only http(s) links are made clickable. Newlines are kept by CSS
// (white-space: pre-wrap on the bubble). Returns an HTML string.
function formatMentorText(text) {
  let t = String(text ?? '')
    // Slack pre-escapes these three characters
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const links = [];
  const keep = (html) => { links.push(html); return `\x02L${links.length - 1}\x03`; };
  const safeUrl = u => (/^https?:\/\/[^\s<>"']+$/i.test(u) ? u : null);
  const linkHtml = (u, label) => `<a href="${escHtml(u)}" target="_blank" rel="noopener noreferrer" class="chat-link">${escHtml(label || u)}</a>`;
  t = t
    .replace(/<(https?:\/\/[^>|\s]+)\|([^>]+)>/g, (m, u, l) => safeUrl(u) ? keep(linkHtml(u, l)) : l)   // Slack <url|label>
    .replace(/<(https?:\/\/[^>\s]+)>/g, (m, u) => safeUrl(u) ? keep(linkHtml(u)) : u)                    // Slack <url>
    .replace(/<@[A-Z0-9]+(?:\|([^>]+))?>/g, (m, n) => n ? '@' + n : '@someone')                          // Slack mentions
    .replace(/<#[A-Z0-9]+\|([^>]+)>/g, '#$1')                                                             // Slack channels
    .replace(/<!(?:here|channel|everyone)[^>]*>/g, '')
    .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, l, u) => safeUrl(u) ? keep(linkHtml(u, l)) : l) // [label](url)
    .replace(/(^|[\s(])(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g, (m, pre, u) => pre + keep(linkHtml(u)));   // bare URL
  t = escHtml(t)
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, '$1<strong>$2</strong>')     // Slack *bold*
    .replace(/(^|[\s(])_([^_\n]+?)_(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')                // Slack _italic_
    .replace(/(^|[\s(])~([^~\n]+?)~(?=[\s).,;:!?]|$)/g, '$1<s>$2</s>')
    .replace(/`([^`\n]+?)`/g, '<code>$1</code>')
    .replace(/^([ \t]*)[-•] /gm, '$1• ')
    .replace(/^&gt; ?(.*)$/gm, '<span class="mentor-quote">$1</span>');
  return t.replace(/\x02L(\d+)\x03/g, (m, i) => links[+i]);
}
window.formatMentorText = formatMentorText;

function renderMarkdown(text) {
  if (!text) return '';

  // ── Phase 0: extract [[FOCUS:X]] tokens → clickable Focus Mode buttons ──
  const focusTokens = [];
  text = text.replace(/\[\[FOCUS:([^\]]+)\]\]/g, (_, name) => {
    const i = focusTokens.length;
    focusTokens.push(name.trim());
    return `\x02FOCUS${i}\x03`;
  });

  // ── Phase 0b: extract [[GROWTH]] tokens → clickable Growth tab link ──────
  // No argument (unlike FOCUS's assignment name) — a single fixed placeholder
  // is enough, restored in Phase 7 below.
  text = text.replace(/\[\[GROWTH\]\]/g, '\x02GROWTH\x03');

  // ── Phase 1: extract links BEFORE HTML-escaping so URLs stay intact ────
  const mdLinks  = [];   // markdown [text](url)
  const rawLinks = [];   // bare https://...

  let s = text;

  // Capture [text](https://...) — greedy match for the URL up to the closing )
  s = s.replace(/\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g, (_, display, url) => {
    const i = mdLinks.length;
    mdLinks.push({ display: display.trim(), url: url.trim() });
    return `\x02MDLINK${i}\x03`;
  });

  // Capture bare https?:// URLs not inside markdown parens or already replaced
  s = s.replace(/(?<![(\[])(https?:\/\/[^\s<>"')\]]+)/g, (url) => {
    // skip if it looks like a partial URL inside a placeholder (shouldn't happen)
    const i = rawLinks.length;
    rawLinks.push(url);
    return `\x02RAWLINK${i}\x03`;
  });

  // ── Phase 2: HTML-escape the remaining text ───────────────────────────
  s = s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // ── Phase 3: inline markdown formatting ──────────────────────────────
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/`([^`\n]+)`/g, '<code class="chat-code">$1</code>');
  // ### headings
  s = s.replace(/^#{1,3}\s+(.+)$/gm, '<strong class="chat-heading">$1</strong>');

  // ── Phase 4: restore markdown links ──────────────────────────────────
  s = s.replace(/\x02MDLINK(\d+)\x03/g, (_, i) => {
    const { display, url } = mdLinks[+i];
    const safeUrl  = url.replace(/"/g, '%22');
    const safeDisp = display.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return assignmentCheckboxHtml(url, safeDisp) + buildChatLink(safeUrl, safeDisp);
  });

  // ── Phase 5: restore raw links ────────────────────────────────────────
  s = s.replace(/\x02RAWLINK(\d+)\x03/g, (_, i) => {
    const url = rawLinks[+i];
    const safeUrl  = url.replace(/"/g, '%22');
    const safeDisp = escHtml(smartLinkText(url));
    return buildChatLink(safeUrl, safeDisp);
  });

  // ── Phase 6: newlines → <br> ──────────────────────────────────────────
  s = s.replace(/\n/g, '<br>');

  // ── Phase 7: restore FOCUS tokens as buttons ──────────────────────────
  s = s.replace(/\x02FOCUS(\d+)\x03/g, (_, i) => {
    const name = focusTokens[+i].replace(/"/g, '&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<button class="chat-focus-btn" data-assignment="${name}" type="button">⚡ Start Focus Mode for ${name} →</button>`;
  });

  // ── Phase 7b: restore GROWTH token as a button ────────────────────────
  s = s.replace(/\x02GROWTH\x03/g, '<button class="chat-growth-btn" type="button">🎯 Set a goal in the Growth tab →</button>');

  return s;
}

// Shown on a bubble when the server flags its message as retryable (type:'error',
// retryable:true) — a real signal from routes/chat.js, not a guess based on the
// message's wording (see the 'error' branch in sendChatMessage's SSE handler below).
// Shown when a chat send didn't get a streamed reply at all (a 401/5xx JSON or HTML
// body, or nothing for too long). Previously the client only read the stream, so any
// such response left the bubble on "typing…" forever — indistinguishable from a freeze.
async function showChatSendFailure(bubble, kind, text) {
  bubble.classList.remove('typing');
  bubble.textContent = '';
  const wrap = bubble.closest('.chat-bubble-wrap');
  const say = (msg) => { const p = document.createElement('div'); p.textContent = msg; bubble.appendChild(p); };
  const button = (label, fn) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = label;
    b.style.cssText = 'margin-top:8px;padding:8px 16px;min-height:36px;background:var(--sp-ink);color:var(--sp-paper);border:none;border-radius:18px;font-size:11px;font-weight:700;cursor:pointer;display:block;letter-spacing:.04em;text-transform:uppercase';
    b.onclick = fn; bubble.appendChild(b);
  };
  let sessionGone = false;
  if (kind === 401 || kind === 403) {
    try { const me = await fetch('/api/session/me').then(r => r.json()); sessionGone = !me?.authenticated; } catch { /* treat as transient */ }
  }
  if (sessionGone) {
    say('Your sign-in expired, so that message didn’t go through. Sign in again and pick up where you left off.');
    const input = document.getElementById('chat-input'); if (input) input.value = text;
    button('Sign in again', () => { window.location.href = '/login'; });
    return;
  }
  say(kind === 'stalled'
    ? 'That’s taking longer than usual, so I stopped waiting.'
    : 'That didn’t go through — the connection hiccupped.');
  button('Try again', () => {
    const prevUser = wrap?.previousElementSibling;
    wrap?.remove();
    if (prevUser?.classList.contains('user')) prevUser.remove();
    sendChatMessage(text);
  });
}

function appendChatRetryButton(bubble) {
  const retryBtn = document.createElement('button');
  retryBtn.textContent = 'Try again';
  retryBtn.style.cssText = 'margin-top:8px;padding:8px 16px;min-height:36px;background:var(--sp-ink);' +
    'color:var(--sp-paper);border:none;border-radius:18px;font-size:11px;font-weight:700;cursor:pointer;display:block;letter-spacing:.04em;text-transform:uppercase';
  retryBtn.onclick = () => {
    retryBtn.remove();
    const lastUserMsg = [...state.chatHistory].reverse().find(m => m.role === 'user')?.content;
    if (lastUserMsg) {
      state.chatHistory.pop(); // remove the failed bot reply
      sendChatMessage(lastUserMsg);
    }
  };
  bubble.appendChild(retryBtn);
}

function appendBubble(role, text) {
  const el   = document.getElementById('chat-messages');
  const wrap = document.createElement('div');
  wrap.className = `chat-bubble-wrap ${role}`;

  if (role === 'assistant') {
    const avatar = document.createElement('img');
    avatar.src       = '/logo.jpg';
    avatar.alt       = 'YSC';
    avatar.className = 'chat-avatar';
    wrap.appendChild(avatar);
  }

  const div = document.createElement('div');
  div.className   = `chat-bubble ${role}`;
  div.textContent = text;
  wrap.appendChild(div);

  el.appendChild(wrap);
  el.scrollTop = el.scrollHeight;
  return div;
}

function appendYouTubeCards(bubble, videos) {
  if (!videos?.length) return;
  const container = document.createElement('div');
  container.className = 'yt-results';
  container.innerHTML = videos.map(v => `
    <a class="yt-card" href="${escHtml(v.url)}" target="_blank" rel="noopener noreferrer" data-track-url="${escHtml(v.url)}">
      <div class="yt-thumb-wrap">
        <img class="yt-thumb" src="${escHtml(v.thumbnail)}" alt="" loading="lazy" />
        <div class="yt-play-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
        </div>
        ${v.duration ? `<span class="yt-duration">${escHtml(v.duration)}</span>` : ''}
      </div>
      <div class="yt-info">
        <div class="yt-title">${escHtml(v.title)}</div>
        <div class="yt-channel">${escHtml(v.channel)}</div>
        ${v.description ? `<div class="yt-desc">${escHtml(v.description.slice(0, 110))}${v.description.length > 110 ? '…' : ''}</div>` : ''}
      </div>
    </a>`).join('');
  bubble.after(container);
  document.getElementById('chat-messages').scrollTop = 999999;
}

// Renders the structured { title, sections } payload directly (not through
// renderMarkdown() — this gives real heading/bullet elements rather than the
// chat renderer's plain-text-with-<br> handling for "### "/"- " lines), then
// appends a download button. Same content the server used to build the PDF —
// this is a preview of that file, not a separate description of it.
function appendStudyGuide(bubble, studyGuide) {
  const wrap = document.createElement('div');
  wrap.className = 'study-guide-preview';

  // Kicker: lets a student tell this apart from a Flashcards card at a glance,
  // without reading the body — see CLAUDE.md "Chat content-type kickers" note.
  const kicker = document.createElement('div');
  kicker.className = 'content-kicker kicker-study';
  kicker.textContent = '📘 Study Guide';
  wrap.appendChild(kicker);

  const titleEl = document.createElement('div');
  titleEl.className = 'sg-title';
  titleEl.textContent = studyGuide.title || 'Study Guide';
  wrap.appendChild(titleEl);

  for (const section of studyGuide.sections || []) {
    if (section.heading) {
      const h = document.createElement('div');
      h.className = 'sg-heading';
      h.textContent = section.heading;
      wrap.appendChild(h);
    }
    let numCounter = 0;
    for (const item of section.items || []) {
      const line = document.createElement('div');
      if (item.type === 'bullet') {
        line.className = 'sg-bullet';
        line.textContent = `•  ${item.text}`;
      } else if (item.type === 'numbered') {
        numCounter++;
        line.className = 'sg-numbered';
        line.textContent = `${numCounter}.  ${item.text}`;
      } else {
        line.className = 'sg-paragraph';
        line.textContent = item.text;
      }
      wrap.appendChild(line);
    }
  }
  bubble.appendChild(wrap);

  const btn = document.createElement('button');
  btn.className = 'sg-download-btn';
  btn.type = 'button';
  btn.textContent = '📄 Download Study Guide (PDF)';
  const origLabel = btn.textContent;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Preparing PDF…';
    try {
      const res = await fetch('/api/chat/study-guide/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(studyGuide),
      });
      if (!res.ok) throw new Error('Generation failed');
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(studyGuide.title || 'study-guide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'study-guide'}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      btn.textContent = origLabel;
      btn.disabled = false;
    } catch {
      btn.textContent = 'Download failed — try again';
      setTimeout(() => { btn.textContent = origLabel; btn.disabled = false; }, 2500);
    }
  });
  bubble.appendChild(btn);

  document.getElementById('chat-messages').scrollTop = 999999;
}

// Renders a simple front/back list (no flip interaction — a static preview only,
// same in-chat scope as appendStudyGuide()) plus a download button. Unlike the
// study guide's PDF, this needs no server round trip at all — the export is
// plain tab-separated text (Anki's default import format; also pastes straight
// into Quizlet's import box), trivial to build directly in the browser from the
// same structured data used for the preview.
function appendFlashcards(bubble, flashcards) {
  const wrap = document.createElement('div');
  wrap.className = 'flashcards-preview';

  // Kicker: see matching note in appendStudyGuide() above.
  const kicker = document.createElement('div');
  kicker.className = 'content-kicker kicker-flashcards';
  kicker.textContent = '🗂️ Flashcards';
  wrap.appendChild(kicker);

  const titleEl = document.createElement('div');
  titleEl.className = 'fc-title';
  titleEl.textContent = flashcards.title || 'Flashcards';
  wrap.appendChild(titleEl);

  for (const card of flashcards.cards || []) {
    const row = document.createElement('div');
    row.className = 'fc-card';
    const front = document.createElement('div');
    front.className = 'fc-front';
    front.textContent = card.front;
    const back = document.createElement('div');
    back.className = 'fc-back';
    back.textContent = card.back;
    row.appendChild(front);
    row.appendChild(back);
    wrap.appendChild(row);
  }
  bubble.appendChild(wrap);

  const actions = document.createElement('div');
  actions.className = 'fc-actions';

  const studyBtn = document.createElement('button');
  studyBtn.className = 'fc-study-btn';
  studyBtn.type = 'button';
  studyBtn.textContent = '▶ Study Flashcards';
  studyBtn.addEventListener('click', () => openFlashcardStudyModal(flashcards));
  actions.appendChild(studyBtn);

  const btn = document.createElement('button');
  btn.className = 'fc-download-btn';
  btn.type = 'button';
  btn.textContent = '🗂️ Download (.txt)';
  btn.title = 'Tab-separated — import into Quizlet or Anki, or open as plain text';
  btn.addEventListener('click', () => {
    const tsv = (flashcards.cards || []).map(c => `${c.front}\t${c.back}`).join('\n');
    const blob = new Blob([tsv], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(flashcards.title || 'flashcards').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'flashcards'}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
  actions.appendChild(btn);

  bubble.appendChild(actions);

  document.getElementById('chat-messages').scrollTop = 999999;
}

// ── Morning Slack message: setup card (chat) + settings modal ────────────────
// The coach only PRE-FILLS this (MORNING_MESSAGE: marker, routes/chat.js); the
// student reviews and presses "Turn on", which saves through PUT
// /api/morning-message. Nothing is ever switched on by the model alone.
// Reused by the profile menu and the ?morning=manage link in the Slack message.
function buildMorningSettingsForm(prefill = {}, { onDone } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'mm-card';
  wrap.innerHTML = `
    <div class="content-kicker kicker-mentor">☀️ Morning message on Slack</div>
    <div class="mm-lead">A short Slack DM each morning with what's due, your schedule, and class announcements.</div>
    <div class="mm-grid">
      <label class="mm-field"><span>Send at</span><input type="time" class="mm-time" value="07:00"></label>
      <label class="mm-field"><span>Which days</span>
        <select class="mm-days"><option value="weekdays">School days (Mon–Fri)</option><option value="daily">Every day</option></select></label>
    </div>
    <div class="mm-tz"></div>
    <div class="mm-extras-label">Optional extras</div>
    <label class="mm-check"><input type="checkbox" class="mm-weather-on"> Weather for my day</label>
    <input type="text" class="mm-city" placeholder="Your city, like Denver, CO" maxlength="80" hidden>
    <label class="mm-check"><input type="checkbox" class="mm-plan" checked> A plan for my day (worked around practice)</label>
    <label class="mm-check"><input type="checkbox" class="mm-joke"> A joke of the day</label>
    <label class="mm-field mm-headlines-row"><span>Headlines</span><select class="mm-headlines"><option value="">None</option></select></label>
    <div class="mm-actions">
      <button type="button" class="mm-save">Turn on</button>
      <button type="button" class="mm-sample">Send me a sample now</button>
      <button type="button" class="mm-off" hidden>Turn off</button>
      <button type="button" class="mm-dismiss">Not now</button>
    </div>
    <div class="mm-msg" role="status" hidden></div>`;
  const $ = sel => wrap.querySelector(sel);
  const msg = $('.mm-msg');
  const say = (t, kind) => { msg.textContent = t; msg.dataset.kind = kind || ''; msg.hidden = !t; };
  const browserTz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })();
  const syncCity = () => { $('.mm-city').hidden = !$('.mm-weather-on').checked; };
  $('.mm-weather-on').addEventListener('change', syncCity);
  $('.mm-dismiss').addEventListener('click', () => (onDone ? onDone() : wrap.remove()));

  const read = () => ({
    time: $('.mm-time').value, days: $('.mm-days').value,
    weatherOn: $('.mm-weather-on').checked, city: $('.mm-city').value.trim(),
    joke: $('.mm-joke').checked, headlines: $('.mm-headlines').value, tz: browserTz, plan: $('.mm-plan').checked,
  });
  const call = async (method, url, body) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Something went wrong — please try again.');
    return data;
  };

  let enabled = false;
  const applyState = (st) => {
    enabled = !!st.enabled;
    $('.mm-save').textContent = enabled ? 'Save changes' : 'Turn on';
    $('.mm-off').hidden = !enabled;
    if (st.slackReachable === false) say("Heads up: I can't find your Slack account under your school email yet — the message arrives as a Slack DM, so join the YSC Slack first.", 'info');
  };

  // Load current settings (+ headline options), then overlay whatever the coach pre-filled.
  (async () => {
    let st = {};
    try { st = await call('GET', '/api/morning-message'); } catch { /* still usable with defaults */ }
    for (const [k, label] of Object.entries(st.headlineOptions || {})) {
      const o = document.createElement('option'); o.value = k; o.textContent = label; $('.mm-headlines').appendChild(o);
    }
    if (st.time) $('.mm-time').value = st.time;
    if (st.days) $('.mm-days').value = st.days;
    $('.mm-weather-on').checked = !!st.weatherOn; $('.mm-city').value = st.city || '';
    $('.mm-joke').checked = !!st.joke; $('.mm-headlines').value = st.headlines || '';
    $('.mm-plan').checked = st.plan !== false;   // on by default
    if (prefill.time) $('.mm-time').value = prefill.time;
    if (prefill.days) $('.mm-days').value = prefill.days;
    if (prefill.weatherOn !== undefined) $('.mm-weather-on').checked = prefill.weatherOn;
    if (prefill.city) $('.mm-city').value = prefill.city;
    if (prefill.joke !== undefined) $('.mm-joke').checked = prefill.joke;
    if (prefill.headlines !== undefined) $('.mm-headlines').value = prefill.headlines;
    syncCity();
    $('.mm-tz').textContent = `Times are in your time zone${browserTz ? ` (${browserTz.replace(/_/g, ' ')})` : ''} — or your city's, if you add weather.`;
    applyState(st);
    if (prefill.off && st.enabled) say('Press "Turn off" to stop your morning messages.', 'info');
  })();

  $('.mm-save').addEventListener('click', async () => {
    const btn = $('.mm-save'); btn.disabled = true; say('Saving…', 'info');
    try {
      const st = await call('PUT', '/api/morning-message', read());
      applyState(st);
      say(`✓ You're set — your next message arrives ${st.next || 'soon'}.`, 'ok');
      if (onDone) setTimeout(onDone, 2200);
    } catch (e) { say(e.message, 'error'); }
    btn.disabled = false;
  });
  $('.mm-sample').addEventListener('click', async () => {
    const btn = $('.mm-sample'); btn.disabled = true; say('Sending a sample to your Slack…', 'info');
    try { await call('POST', '/api/morning-message/test', read()); say('✓ Sample sent — check your Slack DMs from the Student Hub app.', 'ok'); }
    catch (e) { say(e.message, 'error'); }
    btn.disabled = false;
  });
  $('.mm-off').addEventListener('click', async () => {
    try { await call('PUT', '/api/morning-message', { enabled: false }); applyState({ enabled: false }); say('Morning messages are off. You can turn them back on any time.', 'ok'); }
    catch (e) { say(e.message, 'error'); }
  });
  return wrap;
}

function appendMorningCard(bubble, prefill) {
  bubble.appendChild(buildMorningSettingsForm(prefill));
  document.getElementById('chat-messages').scrollTop = 999999;
}

function openMorningSettingsModal() {
  document.getElementById('mm-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'mm-overlay';
  overlay.className = 'soc-edit-overlay';
  overlay.innerHTML = `<div class="soc-edit-modal" role="dialog" aria-modal="true" aria-label="Morning message settings">
    <div class="soc-edit-header"><span>☀️ Morning message</span><button class="soc-popup-close" id="mm-close" aria-label="Close">✕</button></div>
    <div class="soc-edit-body" id="mm-body"></div></div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('soc-popup-open'));
  const close = () => { overlay.classList.remove('soc-popup-open'); setTimeout(() => overlay.remove(), 260); };
  overlay.querySelector('#mm-body').appendChild(buildMorningSettingsForm({}, { onDone: close }));
  overlay.querySelector('#mm-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}
window.openMorningSettingsModal = openMorningSettingsModal;

// ── Message a teacher on Slack (draft card in chat + "My teachers" modal) ─────
// The coach only DRAFTS (TEACHER_MESSAGE: marker, routes/chat.js). The student
// reads/edits it and sends it here; the server posts it from the student's OWN
// Slack account (POST /api/people/message-teacher) — never as the hub's bot.
// If they haven't connected Slack yet, the card offers the one-time connect.
function buildTeacherComposer(teacher, draft, { onSent } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'tm-card';
  wrap.innerHTML = `
    <div class="content-kicker kicker-mentor">✉️ Message to a teacher</div>
    <div class="tm-to">To <strong class="tm-to-name"></strong> · Slack, from your own account</div>
    <textarea class="tm-text" rows="5" maxlength="2000" aria-label="Your message to your teacher" placeholder="Write your message…"></textarea>
    <div class="tm-actions">
      <button type="button" class="tm-send">Send on Slack</button>
      <button type="button" class="tm-connect" hidden>Connect Slack</button>
      <button type="button" class="tm-dismiss">Not now</button>
    </div>
    <div class="tm-msg" role="status" hidden></div>`;
  wrap.querySelector('.tm-to-name').textContent = teacher;
  const ta = wrap.querySelector('.tm-text');
  ta.value = draft || '';
  const sendBtn = wrap.querySelector('.tm-send');
  const connectBtn = wrap.querySelector('.tm-connect');
  const msg = wrap.querySelector('.tm-msg');
  const say = (text, kind) => { msg.textContent = text; msg.dataset.kind = kind || ''; msg.hidden = !text; };

  wrap.querySelector('.tm-dismiss').addEventListener('click', () => wrap.remove());
  connectBtn.addEventListener('click', () => {
    window.open('/auth/slack', '_blank', 'noopener');
    connectBtn.hidden = true;
    sendBtn.textContent = "I've connected — send";
    say('Finish connecting in the new tab, then come back and press send.', 'info');
  });

  sendBtn.addEventListener('click', async () => {
    const text = ta.value.trim();
    if (!text) { say('Write a message first.', 'error'); return; }
    sendBtn.disabled = true;
    say('Sending…', 'info');
    try {
      const r = await fetch('/api/people/message-teacher', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacher, text }),
      });
      const data = await r.json().catch(() => ({}));
      if (data.ok) {
        ta.readOnly = true;
        wrap.querySelector('.tm-actions').hidden = true;
        say(`✓ Sent to ${data.teacher || teacher} on Slack — they'll reply to you there.`, 'ok');
        if (onSent) onSent();
        return;
      }
      if (data.needsAuth) {
        connectBtn.hidden = false;
        say('To send this as you (not as the Student Hub app), connect your Slack account once.', 'info');
      } else {
        say(data.error || 'That did not send — please try again.', 'error');
      }
    } catch {
      say('Could not reach the server — check your connection and try again.', 'error');
    }
    sendBtn.disabled = false;
  });
  return wrap;
}

// ── Coach-proposed action card (Phase 0 of docs/act-and-pace-plan.md) ──────────
// The coach can only PROPOSE: nothing happens until the student presses Confirm, which posts to
// /api/chat/actions/:id/confirm (server checks the proposal is this student's own, and acts once).
function appendActionCard(bubble, action) {
  const card = document.createElement('div');
  card.className = 'tm-card action-card';
  card.innerHTML = `
    <div class="action-kicker">Needs your OK</div>
    <div class="action-summary"></div>
    <div class="tm-actions">
      <button type="button" class="tm-send action-confirm">Confirm</button>
      <button type="button" class="tm-dismiss action-cancel">Cancel</button>
    </div>
    <div class="action-status" role="status"></div>`;
  card.querySelector('.action-summary').textContent = action.summary || 'Proposed action';
  // A study plan lists its blocks with a tickbox each — the student keeps only the ones they want.
  if (Array.isArray(action.items) && action.items.length) {
    const list = document.createElement('div');
    list.className = 'action-items';
    action.items.forEach((text, i) => {
      const row = document.createElement('label');
      row.className = 'action-item';
      row.innerHTML = '<input type="checkbox" checked> <span></span>';
      row.querySelector('input').dataset.index = String(i);
      row.querySelector('span').textContent = text;
      list.appendChild(row);
    });
    card.querySelector('.action-summary').after(list);
    if (action.note) {
      const note = document.createElement('div');
      note.className = 'action-note';
      note.textContent = action.note;
      list.after(note);
    }
    card.querySelector('.action-confirm').textContent = 'Add to my calendar';
    // Optional Slack nudge when each block starts — offered only when the app's bot can reach this student, and OFF
    // until they choose it (lib/study-block-reminders.js).
    if (action.canRemind) {
      const remind = document.createElement('label');
      remind.className = 'action-item action-remind';
      remind.innerHTML = '<input type="checkbox" class="action-remind-box"> <span>🔔 Remind me on Slack when each block starts</span>';
      (card.querySelector('.action-note') || list).after(remind);
    }
  }
  // A light day (sick / worn out / traveling) — or ending one.
  if (action.kind === 'light_day') {
    if (action.note) {
      const note = document.createElement('div');
      note.className = 'action-note';
      note.textContent = action.note;
      card.querySelector('.action-summary').after(note);
    }
    card.querySelector('.action-confirm').textContent = action.end ? 'Back to normal' : 'Make it a light day';
  }
  // Work from a course outside Canvas (APEX etc.) — added to the student's own work list.
  if (action.kind === 'outside_work') {
    if (action.note) {
      const note = document.createElement('div');
      note.className = 'action-note';
      note.textContent = action.note;
      card.querySelector('.action-summary').after(note);
    }
    card.querySelector('.action-confirm').textContent = 'Add to my list';
  }
  // An office-hours request: the note says what the teacher will see; the button sends the request.
  if (action.kind === 'office_hours') {
    card.querySelector('.action-kicker').textContent = 'Needs your OK — sends a request';
    if (action.note) {
      const note = document.createElement('div');
      note.className = 'action-note';
      note.textContent = action.note;
      card.querySelector('.action-summary').after(note);
    }
    card.querySelector('.action-confirm').textContent = 'Send request';
  }
  const status = card.querySelector('.action-status');
  const buttons = card.querySelectorAll('button');
  const decide = async (confirm) => {
    const boxes = [...card.querySelectorAll('.action-item input:not(.action-remind-box)')];
    const remindBox = card.querySelector('.action-remind-box');
    const selected = boxes.filter(b => b.checked).map(b => Number(b.dataset.index));
    if (confirm && boxes.length && !selected.length) { status.textContent = 'Tick at least one block, or press Cancel.'; return; }
    buttons.forEach(b => { b.disabled = true; });
    boxes.forEach(b => { b.disabled = true; });
    if (remindBox) remindBox.disabled = true;
    status.textContent = confirm ? 'Saving…' : 'Cancelling…';
    try {
      const res = await fetch(`/api/chat/actions/${encodeURIComponent(action.id)}/${confirm ? 'confirm' : 'cancel'}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(boxes.length ? { selected, remind: !!remindBox?.checked } : {}),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.status === 'confirmed') {
        if (action.kind === 'study_plan') {
          const n = body.added || 0;
          status.textContent = n
            ? `✅ Added ${n} study block${n === 1 ? '' : 's'} to your calendar.${body.reminders ? " I'll Slack you when each one starts." : ''}${body.skipped?.length ? ` (${body.skipped.length} no longer fit your schedule.)` : ''}`
            : "None of those blocks fit your schedule anymore — ask the coach for new times.";
          if (n && typeof loadCalendarEvents === 'function') loadCalendarEvents().then(() => { renderCalendar(); renderUpcoming(); }).catch(() => {});
        } else if (action.kind === 'light_day') {
          status.textContent = body.end ? '☀️ Back to your normal plan. Glad you’re feeling better.' : '🌙 Light day on. Take care of yourself — just the essentials.';
        } else if (action.kind === 'outside_work') {
          status.textContent = "✅ Added. It'll be in your morning message, plans and calendar — tick it off on your Team tab when it's done.";
          if (typeof loadCalendarEvents === 'function') loadCalendarEvents().then(() => { renderCalendar(); renderUpcoming(); }).catch(() => {});
        } else if (action.kind === 'office_hours') {
          status.textContent = `✅ Request sent to ${body.teacher || 'your teacher'}. You'll hear back when they accept or decline — it'll be on your calendar if they accept.`;
        } else {
          status.textContent = action.kind === 'reminder' ? '✅ Reminder set.' : '✅ Done.';
        }
        card.querySelector('.tm-actions').hidden = true;
        if (action.kind === 'reminder') { requestNotificationPermission(); updateReminderBadge(); }
      } else if (res.ok && body.status === 'cancelled') {
        status.textContent = 'Cancelled — nothing was saved.';
        card.querySelector('.tm-actions').hidden = true;
      } else if (res.status === 404) {
        status.textContent = 'This expired. Ask the coach again if you still want it.';
        card.querySelector('.tm-actions').hidden = true;
      } else if (res.status === 409) {
        status.textContent = 'Already handled.';
        card.querySelector('.tm-actions').hidden = true;
      } else {
        status.textContent = body.error || "That didn't work — try again.";
        buttons.forEach(b => { b.disabled = false; });
        boxes.forEach(b => { b.disabled = false; });
        if (remindBox) remindBox.disabled = false;
      }
    } catch {
      status.textContent = "Couldn't reach the hub — check your connection and try again.";
      buttons.forEach(b => { b.disabled = false; });
      boxes.forEach(b => { b.disabled = false; });
      if (remindBox) remindBox.disabled = false;
    }
  };
  card.querySelector('.action-confirm').addEventListener('click', () => decide(true));
  card.querySelector('.action-cancel').addEventListener('click', () => decide(false));
  bubble.appendChild(card);
  document.getElementById('chat-messages').scrollTop = 999999;
}

function appendTeacherMessageCard(bubble, tm) {
  bubble.appendChild(buildTeacherComposer(tm.teacher, tm.text));
  document.getElementById('chat-messages').scrollTop = 999999;
}

// Modal version, used by the Team tab's "My teachers" list.
function openTeacherComposeModal(teacher) {
  document.getElementById('tm-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'tm-overlay';
  overlay.className = 'soc-edit-overlay';
  overlay.innerHTML = `<div class="soc-edit-modal" role="dialog" aria-modal="true" aria-label="Message a teacher">
    <div class="soc-edit-header"><span>✉️ Message a teacher</span><button class="soc-popup-close" id="tm-close" aria-label="Close">✕</button></div>
    <div class="soc-edit-body" id="tm-body"></div></div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('soc-popup-open'));
  const close = () => { overlay.classList.remove('soc-popup-open'); setTimeout(() => overlay.remove(), 260); };
  const card = buildTeacherComposer(teacher, '', { onSent: () => setTimeout(close, 1800) });
  card.querySelector('.tm-dismiss').addEventListener('click', close);
  overlay.querySelector('#tm-body').appendChild(card);
  overlay.querySelector('#tm-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  card.querySelector('.tm-text').focus();
}

// ── Read aloud (🔊 Listen) ───────────────────────────────────────────────────
// Uses the browser's built-in speech synthesis (Web Speech API): free, works offline on most devices, and NOTHING is sent
// anywhere — the text never leaves the device. A small row under each coach reply: Listen / Pause / Resume, Stop, a speed
// button (0.8× / 1× / 1.25× / 1.5×, remembered) and an "Auto-read" toggle (remembered) for students who prefer to be read to.
// Only the reply's own words are spoken (no buttons, pictures, cards, links' URLs or emoji), in sentence-sized pieces (Chrome
// silently cuts off long utterances). One voice at a time; it stops when a new message is sent or the tab is hidden.
// iOS/Safari only start speech from a tap, so Auto-read may stay silent there — the Listen button always works.
const TTS_RATE_KEY = 'ysc-tts-rate', TTS_AUTO_KEY = 'ysc-tts-auto', TTS_RATES = [1, 1.25, 1.5, 0.8];
const _tts = { chunks: [], i: 0, state: 'idle', gen: 0, row: null };
const ttsSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
const ttsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const ttsSet = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* storage unavailable — preference just won't stick */ } };
const ttsRate = () => { const r = parseFloat(ttsGet(TTS_RATE_KEY, '1')); return TTS_RATES.includes(r) ? r : 1; };

// The words of a rendered reply, as speech: block breaks become pauses; buttons/images/URLs/emoji/markup are dropped.
function speechTextFromBubble(bubbleEl) {
  const c = bubbleEl.cloneNode(true);
  c.querySelectorAll('button, img, svg, script, style, .chat-task-check, .chat-copy-btn, .content-kicker, .chat-feedback, .chat-listen').forEach(n => n.remove());
  c.querySelectorAll('br').forEach(n => n.replaceWith('\n'));
  c.querySelectorAll('p, li, div, h1, h2, h3, h4, tr').forEach(n => n.append('\n'));
  return cleanForSpeech(c.textContent || '');
}
function cleanForSpeech(t) {
  return String(t)
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[↗⎘→←•·▸►☐☑✓]/g, ' ')
    .replace(/[*_`#>~|]+/g, ' ')
    .replace(/\s*\n\s*/g, '. ')
    .replace(/([.!?:;])\s*\./g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[.\s]+/, '')
    .trim();
}
// Sentence-sized chunks (<= ~220 chars) so long replies aren't cut off and Pause/Stop respond quickly.
function speechChunks(text) {
  const out = [];
  for (const sent of String(text).split(/(?<=[.!?])\s+/)) {
    let s = sent.trim(); if (!s || !/[A-Za-z0-9]/.test(s)) continue;   // nothing pronounceable (a stray ".")
    while (s.length > 220) { let k = s.lastIndexOf(',', 220); if (k < 80) k = s.lastIndexOf(' ', 220); if (k < 40) k = 220; out.push(s.slice(0, k + 1).trim()); s = s.slice(k + 1).trim(); }
    if (s) out.push(s);
  }
  return out;
}
function pickVoice() {
  const vs = (window.speechSynthesis.getVoices() || []).filter(v => /^en(-|_|$)/i.test(v.lang));
  const pref = [/Google US English/i, /Samantha/i, /Microsoft (Aria|Jenny|Guy).*Online|Natural/i, /Google UK English/i, /Daniel|Karen|Moira/i];
  for (const re of pref) { const v = vs.find(x => re.test(x.name)); if (v) return v; }
  return vs.find(v => /en-US/i.test(v.lang)) || vs[0] || null;
}
function ttsPaint() {
  const row = _tts.row; if (!row) return;
  row.dataset.state = _tts.state;
  const main = row.querySelector('.chat-listen-main'), stop = row.querySelector('.chat-listen-stop');
  if (main) main.textContent = _tts.state === 'playing' ? '⏸ Pause' : _tts.state === 'paused' ? '▶ Resume' : '🔊 Listen';
  if (stop) stop.hidden = _tts.state === 'idle';
}
function stopSpeech() {
  if (!ttsSupported()) return;
  _tts.gen++;
  try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
  _tts.state = 'idle'; _tts.i = 0; ttsPaint();
}
function speakFrom(index) {
  const gen = ++_tts.gen;
  const step = i => {
    if (gen !== _tts.gen) return;                       // cancelled / superseded
    if (i >= _tts.chunks.length) { _tts.state = 'idle'; _tts.i = 0; ttsPaint(); return; }
    _tts.i = i;
    const u = new SpeechSynthesisUtterance(_tts.chunks[i]);
    const v = pickVoice(); if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-US';
    u.rate = ttsRate();
    u.onend = () => step(i + 1);
    u.onerror = e => { if (e && (e.error === 'canceled' || e.error === 'interrupted')) return; step(i + 1); };
    try { window.speechSynthesis.speak(u); } catch { _tts.state = 'idle'; ttsPaint(); }
  };
  _tts.state = 'playing'; ttsPaint(); step(index);
}
function appendListenControls(bubble, spoken) {
  if (!bubble || !ttsSupported()) return null;
  const chunks = speechChunks(spoken);
  if (!chunks.length || chunks.join(' ').length < 20) return null;
  const row = document.createElement('div');
  row.className = 'chat-listen';
  const mk = (cls, label, aria) => { const b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label; b.setAttribute('aria-label', aria); return b; };
  const main = mk('chat-listen-btn chat-listen-main', '🔊 Listen', 'Read this reply aloud');
  const stop = mk('chat-listen-btn chat-listen-stop', '■ Stop', 'Stop reading'); stop.hidden = true;
  const speed = mk('chat-listen-btn chat-listen-speed', `${ttsRate()}×`, 'Change reading speed');
  const auto = mk('chat-listen-btn chat-listen-auto', ttsGet(TTS_AUTO_KEY, '0') === '1' ? 'Auto-read: on' : 'Auto-read: off', 'Toggle reading replies aloud automatically');
  row.append(main, stop, speed, auto);
  bubble.appendChild(row);

  const begin = () => { if (_tts.row !== row) { stopSpeech(); _tts.row = row; _tts.chunks = chunks; } _tts.row = row; _tts.chunks = chunks; speakFrom(0); };
  main.addEventListener('click', () => {
    if (_tts.row === row && _tts.state === 'playing') { try { window.speechSynthesis.pause(); } catch { /* ignore */ } _tts.state = 'paused'; ttsPaint(); }
    else if (_tts.row === row && _tts.state === 'paused') { try { window.speechSynthesis.resume(); } catch { /* ignore */ } _tts.state = 'playing'; ttsPaint(); }
    else begin();
  });
  stop.addEventListener('click', stopSpeech);
  speed.addEventListener('click', () => {
    const next = TTS_RATES[(TTS_RATES.indexOf(ttsRate()) + 1) % TTS_RATES.length];
    ttsSet(TTS_RATE_KEY, next);
    document.querySelectorAll('.chat-listen-speed').forEach(b => { b.textContent = `${next}×`; });
    if (_tts.row === row && _tts.state === 'playing') speakFrom(_tts.i);   // apply the new speed from the current sentence
  });
  auto.addEventListener('click', () => {
    const on = ttsGet(TTS_AUTO_KEY, '0') !== '1';
    ttsSet(TTS_AUTO_KEY, on ? '1' : '0');
    document.querySelectorAll('.chat-listen-auto').forEach(b => { b.textContent = on ? 'Auto-read: on' : 'Auto-read: off'; });
  });
  if (ttsGet(TTS_AUTO_KEY, '0') === '1') { try { begin(); } catch { /* the Listen button still works */ } }
  return row;
}
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopSpeech(); });
  window.addEventListener('pagehide', stopSpeech);
}

// ── 👍 / 👎 feedback on a coach reply ────────────────────────────────────────
// One small row under each real chat reply. 👍/👎 saves immediately (POST /api/chat/feedback returns an
// id); after a 👎 the student can optionally tap a reason and add a note, which UPDATE that same entry.
// Mentors see their own mentees' feedback in Teacher Hub → Data → Chatbot Feedback. Failures are silent —
// feedback must never get in the way of the chat.
const FEEDBACK_REASONS = [
  ['wrong', 'Wrong information'], ['not_helpful', "Didn't answer my question"], ['confusing', 'Confusing'],
  ['too_long', 'Too long'], ['too_short', 'Not enough detail'], ['other', 'Something else'],
];
async function postFeedback(body) {
  try {
    const r = await fetch('/api/chat/feedback', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
function appendFeedbackRow(bubble, ctx) {
  if (!bubble || !ctx?.response || ctx.response.length < 20) return;
  const row = document.createElement('div');
  row.className = 'chat-feedback';
  const label = document.createElement('span');
  label.className = 'chat-feedback-label';
  label.textContent = 'Was this helpful?';
  const mk = (rating, emoji, aria) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chat-feedback-btn'; b.textContent = emoji; b.setAttribute('aria-label', aria);
    return b;
  };
  const up = mk('up', '👍', 'Yes, this was helpful'), down = mk('down', '👎', 'No, this was not helpful');
  row.append(label, up, down);
  bubble.appendChild(row);

  let feedbackId = null;
  const base = { prompt: ctx.prompt, response: ctx.response, visuals: ctx.visuals };
  const thanks = msg => { row.innerHTML = ''; const t = document.createElement('span'); t.className = 'chat-feedback-label'; t.textContent = msg; row.appendChild(t); };

  up.addEventListener('click', async () => {
    thanks('Thanks — glad it helped ✓');
    await postFeedback({ rating: 'up', ...base });
  });
  down.addEventListener('click', async () => {
    row.innerHTML = '';
    const head = document.createElement('div'); head.className = 'chat-feedback-label'; head.textContent = "Sorry about that — what went wrong? (optional)";
    const chips = document.createElement('div'); chips.className = 'chat-feedback-chips';
    let chosen = '';
    FEEDBACK_REASONS.forEach(([key, text]) => {
      const c = document.createElement('button'); c.type = 'button'; c.className = 'chat-feedback-chip'; c.textContent = text;
      c.addEventListener('click', () => { chosen = key; chips.querySelectorAll('.chat-feedback-chip').forEach(x => x.classList.toggle('on', x === c)); });
      chips.appendChild(c);
    });
    const note = document.createElement('input'); note.type = 'text'; note.className = 'chat-feedback-note'; note.maxLength = 300; note.placeholder = 'Anything else? (optional)';
    const send = document.createElement('button'); send.type = 'button'; send.className = 'chat-feedback-send'; send.textContent = 'Send';
    const idPromise = postFeedback({ rating: 'down', ...base }).then(r => { feedbackId = r?.id || null; });   // saved right away
    send.addEventListener('click', async () => {
      await idPromise;
      if (feedbackId) await postFeedback({ id: feedbackId, rating: 'down', reason: chosen, comment: note.value });
      thanks('Thanks — this helps make the coach better ✓');
    });
    row.append(head, chips, note, send);
  });
}

// ── Pictures & real diagrams (Wikipedia) ────────────────────────────────────
// Rendered from the server's 'images' SSE event (routes/chat.js, lib/image-search.js).
// Each image opens full-size in a lightbox; attribution links to the source file page.
function openImageLightbox(img) {
  const ov = document.createElement('div');
  ov.className = 'chat-img-lightbox';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-label', img.title || 'Picture');
  const big = document.createElement('img');
  big.src = img.url; big.alt = img.caption || img.title || '';
  const cap = document.createElement('div');
  cap.className = 'chat-img-lb-cap';
  cap.textContent = [img.caption || img.title, img.credit].filter(Boolean).join(' — ');
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  ov.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  ov.append(big, cap);
  document.body.appendChild(ov);
}

function appendImages(bubble, images) {
  const list = (Array.isArray(images) ? images : []).filter(i => i && /^https:\/\//.test(i.url || ''));
  if (!list.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'chat-images';
  const kicker = document.createElement('div');
  kicker.className = 'content-kicker kicker-images';
  kicker.textContent = '🖼️ Pictures';
  wrap.appendChild(kicker);
  const grid = document.createElement('div');
  grid.className = 'chat-images-grid';
  list.forEach(img => {
    const fig = document.createElement('figure');
    fig.className = 'chat-img-fig';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-img-btn';
    btn.setAttribute('aria-label', 'Enlarge: ' + (img.title || 'picture'));
    const el = document.createElement('img');
    el.src = img.url; el.alt = img.caption || img.title || 'Picture'; el.loading = 'lazy';
    el.referrerPolicy = 'no-referrer';
    el.addEventListener('error', () => { fig.remove(); if (!grid.children.length) wrap.remove(); });
    btn.appendChild(el);
    btn.addEventListener('click', () => openImageLightbox(img));
    const cap = document.createElement('figcaption');
    cap.textContent = (img.title || '').slice(0, 80);
    if (img.full) {
      const a = document.createElement('a');
      a.href = img.full; a.target = '_blank'; a.rel = 'noopener noreferrer';
      a.textContent = 'source'; a.className = 'chat-img-src';
      cap.append(' · ', a);
    }
    fig.append(btn, cap);
    grid.appendChild(fig);
  });
  wrap.appendChild(grid);
  bubble.appendChild(wrap);
}

// ── Animated process diagram (Krebs cycle, water cycle, math proofs, etc.) ──
// Renders diagram.steps as numbered SVG nodes — a closed loop for
// diagram.type === 'cycle', a left-to-right chain for 'linear' — with a
// description panel, play/pause auto-advance, and click-to-jump on any node.
// One reusable component for any sequential/cyclical process the model
// emits via the DIAGRAM: marker (see routes/chat.js#extractDiagram).
function appendDiagram(bubble, diagram) {
  const wrap = document.createElement('div');
  wrap.className = 'diagram-preview';

  const kicker = document.createElement('div');
  kicker.className = 'content-kicker kicker-diagram';
  kicker.textContent = '🔄 Diagram';
  wrap.appendChild(kicker);

  const titleEl = document.createElement('div');
  titleEl.className = 'dg-title';
  titleEl.textContent = diagram.title || 'Diagram';
  wrap.appendChild(titleEl);

  const steps = Array.isArray(diagram.steps) ? diagram.steps : [];
  const n = steps.length;
  if (n < 2) return; // extractDiagram() already enforces >=3, this is just a render-time guard
  const isCycle = diagram.type === 'cycle';

  // ── Node layout ─────────────────────────────────────────────────────────
  const nodeR = 22;
  const positions = [];
  let viewW, viewH, cx, cy;
  if (isCycle) {
    // Orbit radius grows with step count — a fixed radius crowded labels
    // together on anything past ~5 steps (confirmed live on a 7-step diagram:
    // adjacent node labels overlapped both the connector lines and each other).
    const orbitR = Math.max(95, Math.min(150, 55 + n * 13));
    // Room for the radially-offset label text outside the orbit — live-tested
    // at 66 and long labels ("Photosynthesis", "Fossil Fuels") got clipped at
    // the viewBox edge since start/end-anchored text on a side node grows
    // outward from its offset point rather than staying centered on it.
    const pad = 110;
    viewW = viewH = orbitR * 2 + nodeR * 2 + pad;
    cx = viewW / 2; cy = viewH / 2;
    for (let i = 0; i < n; i++) {
      const angle = -Math.PI / 2 + i * (2 * Math.PI / n); // start at top, clockwise
      positions.push({ x: cx + orbitR * Math.cos(angle), y: cy + orbitR * Math.sin(angle) });
    }
  } else {
    viewH = 150;
    cy = viewH / 2;
    const marginX = 40;
    viewW = Math.max(360, marginX * 2 + (n - 1) * 95);
    const gap = n > 1 ? (viewW - marginX * 2) / (n - 1) : 0;
    for (let i = 0; i < n; i++) positions.push({ x: marginX + i * gap, y: cy });
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${viewW} ${viewH}`);
  svg.setAttribute('class', 'dg-svg');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  const markerId = 'dg-arrow-' + Math.random().toString(36).slice(2, 9);
  const defs = document.createElementNS(svgNS, 'defs');
  const marker = document.createElementNS(svgNS, 'marker');
  marker.setAttribute('id', markerId);
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  const arrowPath = document.createElementNS(svgNS, 'path');
  arrowPath.setAttribute('d', 'M0,0 L6,3 L0,6 Z');
  arrowPath.setAttribute('class', 'dg-arrowhead-fill');
  marker.appendChild(arrowPath);
  defs.appendChild(marker);
  svg.appendChild(defs);

  // Connector lines, offset to stop at each node's edge (room left for the arrowhead)
  const connectorCount = isCycle ? n : n - 1;
  for (let i = 0; i < connectorCount; i++) {
    const a = positions[i];
    const b = positions[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const line = document.createElementNS(svgNS, 'line');
    line.setAttribute('x1', a.x + ux * nodeR);
    line.setAttribute('y1', a.y + uy * nodeR);
    line.setAttribute('x2', b.x - ux * (nodeR + 7));
    line.setAttribute('y2', b.y - uy * (nodeR + 7));
    line.setAttribute('class', 'dg-connector');
    line.setAttribute('marker-end', `url(#${markerId})`);
    line.dataset.fromStep = i;
    svg.appendChild(line);
  }

  const nodeEls = [];
  positions.forEach((pos, i) => {
    const g = document.createElementNS(svgNS, 'g');
    g.setAttribute('class', 'dg-node');
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `Step ${i + 1}: ${steps[i].title}`);

    const circle = document.createElementNS(svgNS, 'circle');
    circle.setAttribute('cx', pos.x);
    circle.setAttribute('cy', pos.y);
    circle.setAttribute('r', nodeR);
    circle.setAttribute('class', 'dg-node-circle');
    g.appendChild(circle);

    const num = document.createElementNS(svgNS, 'text');
    num.setAttribute('x', pos.x);
    num.setAttribute('y', pos.y + 5);
    num.setAttribute('class', 'dg-node-num');
    num.setAttribute('text-anchor', 'middle');
    num.textContent = String(i + 1);
    g.appendChild(num);

    svg.appendChild(g);
    nodeEls.push(g);

    // Label placed radially outward from center (cycle) or below the node (linear)
    const label = document.createElementNS(svgNS, 'text');
    let lx = pos.x, ly = pos.y + nodeR + 18, anchor = 'middle';
    if (isCycle) {
      const ddx = pos.x - cx, ddy = pos.y - cy;
      const ddist = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
      const ux = ddx / ddist, uy = ddy / ddist;
      const offset = 30; // clears the node edge (nodeR=22) with real margin
      lx = pos.x + ux * offset;
      ly = pos.y + uy * offset + 3;
      // text-anchor:middle centers the label ON lx — fine for a node near
      // the top/bottom of the circle (label sits directly above/below and
      // spreads evenly), but for a node on the left/right side, a centered
      // label's far half swings back over the node itself (confirmed live:
      // "Fossil Fuels"/"Combustion"/"Consumption" all overlapped their own
      // node number). Anchor away from the node instead once it's mostly a
      // side node, so the label only grows outward, never back over it.
      if (ux > 0.35) anchor = 'start';
      else if (ux < -0.35) anchor = 'end';
    }
    label.setAttribute('x', lx);
    label.setAttribute('y', ly);
    label.setAttribute('class', 'dg-node-label');
    label.setAttribute('text-anchor', anchor);
    const t = steps[i].title || '';
    // Cycle nodes sit closer together arc-wise than linear ones, so their
    // labels get a tighter cap to reduce collision with neighboring nodes.
    const maxLen = isCycle ? 14 : 20;
    label.textContent = t.length > maxLen ? t.slice(0, maxLen - 1) + '…' : t;
    svg.appendChild(label);
  });

  const svgWrap = document.createElement('div');
  svgWrap.className = 'dg-svg-wrap';
  svgWrap.appendChild(svg);
  wrap.appendChild(svgWrap);

  // ── Description panel ──────────────────────────────────────────────────
  const descPanel = document.createElement('div');
  descPanel.className = 'dg-desc-panel';
  const descStepLabel = document.createElement('div');
  descStepLabel.className = 'dg-desc-step-label';
  const descText = document.createElement('div');
  descText.className = 'dg-desc-text';
  descPanel.appendChild(descStepLabel);
  descPanel.appendChild(descText);
  wrap.appendChild(descPanel);

  // ── Controls ────────────────────────────────────────────────────────────
  const controls = document.createElement('div');
  controls.className = 'dg-controls';
  const playBtn = document.createElement('button');
  playBtn.type = 'button';
  playBtn.className = 'dg-play-btn';
  playBtn.textContent = '▶ Play';
  const progressEl = document.createElement('div');
  progressEl.className = 'dg-progress';
  controls.appendChild(playBtn);
  controls.appendChild(progressEl);
  wrap.appendChild(controls);

  bubble.appendChild(wrap);

  // ── Interaction ─────────────────────────────────────────────────────────
  let current = 0;
  let playing = false;
  let timer = null;
  let autoAdvances = 0;
  const MAX_AUTO_ADVANCES = n * 3; // cap cycle auto-loop so it doesn't run forever unattended

  function render() {
    nodeEls.forEach((g, idx) => g.classList.toggle('dg-node-active', idx === current));
    svg.querySelectorAll('.dg-connector').forEach(line => {
      line.classList.toggle('dg-connector-active', Number(line.dataset.fromStep) === current);
    });
    descStepLabel.textContent = `Step ${current + 1} of ${n} — ${steps[current].title}`;
    descText.textContent = steps[current].description || '';
    progressEl.textContent = `${current + 1} / ${n}`;
  }

  function stopPlaying() {
    playing = false;
    if (timer) { clearInterval(timer); timer = null; }
    playBtn.textContent = '▶ Play';
  }

  function goTo(i) {
    current = ((i % n) + n) % n;
    render();
  }

  function jumpTo(i) {
    stopPlaying();
    goTo(i);
  }

  function startPlaying() {
    if (!isCycle && current === n - 1) goTo(0); // restart from the beginning
    playing = true;
    autoAdvances = 0;
    playBtn.textContent = '⏸ Pause';
    timer = setInterval(() => {
      const next = current + 1;
      if (!isCycle && next >= n) { stopPlaying(); return; }
      goTo(next);
      autoAdvances++;
      if (autoAdvances >= MAX_AUTO_ADVANCES) stopPlaying();
    }, 2200);
  }

  playBtn.addEventListener('click', () => { playing ? stopPlaying() : startPlaying(); });

  nodeEls.forEach((g, idx) => {
    g.addEventListener('click', () => jumpTo(idx));
    g.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpTo(idx); }
    });
  });

  render();

  document.getElementById('chat-messages').scrollTop = 999999;
}

// ── Interactive flashcard study modal ────────────────────────────────────────
// Dynamically built (not the static openModal(id)/closeModal(id) helpers, which
// assume a pre-existing DOM element by ID — this content is entirely data-driven
// from whichever deck was clicked) — same creation/teardown pattern already used
// for the Huddle invite modal in huddle.js. Reuses the app's generic .modal-
// overlay/.modal/.modal-header/.modal-close-btn classes (already used by every
// other modal in this app, including its existing mobile @media override in
// mobile.css) rather than hand-rolling new modal chrome.
//
// knownSet/learningSet track ORIGINAL card indices and persist across a
// "restudy" pass (activeIndices changes, the assessment sets don't) — so
// re-assessing a card while restudying the ones you're still learning correctly
// moves it between the two, rather than starting the tally over.
function openFlashcardStudyModal(flashcards) {
  const cards = flashcards.cards || [];
  if (!cards.length) return;

  let activeIndices = cards.map((_, i) => i);
  let pos = 0;
  let flipped = false;
  const knownSet    = new Set();
  const learningSet = new Set();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay fcm-overlay';
  overlay.innerHTML = `
    <div class="modal fcm-modal">
      <div class="modal-header">
        <h3>${escHtml(flashcards.title || 'Flashcards')}</h3>
        <button class="modal-close-btn" id="fcm-close" type="button" aria-label="Close">✕</button>
      </div>
      <div class="fcm-body">
        <div class="fcm-study-view" id="fcm-study-view">
          <div class="fcm-progress" id="fcm-progress"></div>
          <div class="fcm-card-area">
            <div class="fcm-card" id="fcm-card" role="button" tabindex="0" aria-label="Flip card to see the answer">
              <div class="fcm-card-face fcm-front">
                <div class="fcm-card-label">Term</div>
                <div class="fcm-card-text" id="fcm-front-text"></div>
              </div>
              <div class="fcm-card-face fcm-back">
                <div class="fcm-card-label">Answer</div>
                <div class="fcm-card-text" id="fcm-back-text"></div>
              </div>
            </div>
          </div>
          <div class="fcm-flip-hint">↻ Tap card to flip</div>
          <div class="fcm-nav">
            <button class="fcm-nav-btn" id="fcm-prev" type="button" aria-label="Previous card">◀</button>
            <button class="fcm-nav-btn fcm-flip-btn" id="fcm-flip-btn" type="button">Flip</button>
            <button class="fcm-nav-btn" id="fcm-next" type="button" aria-label="Next card">▶</button>
          </div>
          <div class="fcm-assess">
            <button class="fcm-assess-btn fcm-learning" id="fcm-mark-learning" type="button">Still Learning</button>
            <button class="fcm-assess-btn fcm-know" id="fcm-mark-know" type="button">Got It ✓</button>
          </div>
          <div class="fcm-tally" id="fcm-tally"></div>
        </div>
        <div class="fcm-complete-view" id="fcm-complete-view" style="display:none"></div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const studyView    = overlay.querySelector('#fcm-study-view');
  const completeView = overlay.querySelector('#fcm-complete-view');
  const cardEl        = overlay.querySelector('#fcm-card');
  const frontText      = overlay.querySelector('#fcm-front-text');
  const backText       = overlay.querySelector('#fcm-back-text');
  const progressEl     = overlay.querySelector('#fcm-progress');
  const tallyEl        = overlay.querySelector('#fcm-tally');
  const prevBtn        = overlay.querySelector('#fcm-prev');
  const nextBtn        = overlay.querySelector('#fcm-next');

  function currentCardIdx() { return activeIndices[pos]; }

  function render() {
    const card = cards[currentCardIdx()];
    frontText.textContent = card.front;
    backText.textContent  = card.back;
    cardEl.classList.toggle('flipped', flipped);
    progressEl.textContent = `Card ${pos + 1} of ${activeIndices.length}`;
    tallyEl.textContent = (knownSet.size || learningSet.size)
      ? `${knownSet.size} got it · ${learningSet.size} still learning`
      : '';
    prevBtn.disabled = pos === 0;
    nextBtn.disabled = pos === activeIndices.length - 1;
  }

  function flip() {
    flipped = !flipped;
    cardEl.classList.toggle('flipped', flipped);
  }

  function goTo(newPos) {
    if (newPos < 0 || newPos >= activeIndices.length) return;
    pos = newPos;
    flipped = false;
    render();
  }

  function mark(known) {
    const i = currentCardIdx();
    if (known) { knownSet.add(i); learningSet.delete(i); }
    else       { learningSet.add(i); knownSet.delete(i); }
    if (pos < activeIndices.length - 1) goTo(pos + 1);
    else { render(); showCompletion(); }
  }

  function showCompletion() {
    studyView.style.display = 'none';
    completeView.style.display = 'flex';
    const learningCount = learningSet.size;
    completeView.innerHTML = `
      <div class="fcm-complete-icon">🎉</div>
      <div class="fcm-complete-text">You've gone through all ${activeIndices.length} card${activeIndices.length !== 1 ? 's' : ''}!</div>
      <div class="fcm-complete-tally">${knownSet.size} got it · ${learningCount} still learning</div>
      <div class="fcm-complete-actions">
        ${learningCount ? `<button class="fcm-nav-btn fcm-restudy-btn" id="fcm-restudy-learning" type="button">Restudy the ${learningCount} I'm still learning</button>` : ''}
        <button class="fcm-nav-btn fcm-restudy-btn" id="fcm-restudy-all" type="button">Restudy All</button>
        <button class="fcm-nav-btn" id="fcm-done" type="button">Close</button>
      </div>`;
    completeView.querySelector('#fcm-done').addEventListener('click', close);
    completeView.querySelector('#fcm-restudy-all').addEventListener('click', () => restart(cards.map((_, i) => i)));
    completeView.querySelector('#fcm-restudy-learning')?.addEventListener('click', () => restart([...learningSet]));
  }

  function restart(indices) {
    activeIndices = indices;
    pos = 0;
    flipped = false;
    completeView.style.display = 'none';
    studyView.style.display = 'block';
    render();
  }

  cardEl.addEventListener('click', flip);
  cardEl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
  overlay.querySelector('#fcm-flip-btn').addEventListener('click', flip);
  prevBtn.addEventListener('click', () => goTo(pos - 1));
  nextBtn.addEventListener('click', () => goTo(pos + 1));
  overlay.querySelector('#fcm-mark-learning').addEventListener('click', () => mark(false));
  overlay.querySelector('#fcm-mark-know').addEventListener('click', () => mark(true));

  function close() {
    document.removeEventListener('keydown', onKeydown);
    overlay.remove();
  }
  overlay.querySelector('#fcm-close').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

  function onKeydown(e) {
    if (e.key === 'Escape') { close(); return; }
    if (completeView.style.display !== 'none') return; // nav/flip keys only during the study view
    if (e.key === 'ArrowLeft') goTo(pos - 1);
    else if (e.key === 'ArrowRight') goTo(pos + 1);
    else if (e.key === ' ' && document.activeElement !== cardEl) { e.preventDefault(); flip(); }
  }
  document.addEventListener('keydown', onKeydown);

  render();
}


// ── Study-material attachments (📎) ─────────────────────────────────────────
// Files go to /api/study-uploads (extracted server-side, kept 24h, private to this student); the chat message
// then just carries their ids. Attachments stay on for the whole conversation so follow-up questions and quizzes
// keep working from the same material; ✕ removes one.
state.studyAttachments = [];

function renderStudyAttachments() {
  const strip = document.getElementById('chat-attachments');
  if (!strip) return;
  const list = state.studyAttachments;
  strip.hidden = list.length === 0;
  strip.innerHTML = '';
  if (!list.length) return;
  if (list.some(a => !a.busy)) {
    const actions = document.createElement('div');
    actions.className = 'chat-attach-actions';
    [['Summarize it', 'Summarize what I attached in a few key points.'],
     ['Make a study guide', 'Make me a study guide from what I attached.'],
     ['Make flashcards', 'Make flashcards from what I attached.'],
     ['Quiz me on it', 'Quiz me on what I attached, one question at a time.']].forEach(([label, msg]) => {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = label;
      b.addEventListener('click', () => sendChatMessage(msg, 'chip'));
      actions.appendChild(b);
    });
    strip.appendChild(actions);
  }
  list.forEach(a => {
    const chip = document.createElement('span');
    chip.className = 'chat-attach-chip' + (a.busy ? ' busy' : '');
    const nm = document.createElement('span');
    nm.className = 'name';
    nm.textContent = (a.kind === 'image' ? '🖼️ ' : '📄 ') + a.name + (a.busy ? ' — reading…' : '');
    chip.appendChild(nm);
    if (!a.busy) {
      const x = document.createElement('button');
      x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', 'Remove ' + a.name);
      x.addEventListener('click', () => removeStudyAttachment(a.id));
      chip.appendChild(x);
    }
    strip.appendChild(chip);
  });
}

async function removeStudyAttachment(id) {
  state.studyAttachments = state.studyAttachments.filter(a => a.id !== id);
  renderStudyAttachments();
  fetch('/api/study-uploads/' + encodeURIComponent(id), { method: 'DELETE' }).catch(() => {});
}

async function addStudyAttachment(name, request) {
  if (state.studyAttachments.length >= 5) { showToast('You can keep up to 5 files at a time — remove one first.', 'error'); return; }
  const temp = { id: 'tmp' + Date.now() + Math.random(), name, busy: true, kind: 'text' };
  state.studyAttachments.push(temp);
  renderStudyAttachments();
  try {
    const res = await request();
    const data = await res.json().catch(() => ({}));
    state.studyAttachments = state.studyAttachments.filter(a => a !== temp);
    if (!res.ok || !data.upload) { showToast(data.error || 'I couldn\'t read that file.', 'error'); }
    else {
      state.studyAttachments.push({ id: data.upload.id, name: data.upload.name, kind: data.upload.kind });
      showToast('Got it — ask me anything about ' + data.upload.name, 'success');
    }
  } catch {
    state.studyAttachments = state.studyAttachments.filter(a => a !== temp);
    showToast('Couldn\'t upload that file — check your connection and try again.', 'error');
  }
  renderStudyAttachments();
}


// Screenshots from a laptop/Chromebook are often several MB PNGs — shrink pictures to a sane size before uploading.
async function shrinkImageFile(file) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size < 700 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}

// Paste (Cmd/Ctrl+V) or drop a screenshot/picture onto the chat box: works on every device with its own screenshot tool.
function initChatImagePasteDrop() {
  const box = document.getElementById('chat-input');
  if (!box) return;
  const take = files => { const imgs = [...files].filter(f => f.type.startsWith('image/')).slice(0, 3); imgs.forEach((f, i) => uploadStudyFile(f.name && f.name !== 'image.png' ? f : new File([f], `Pasted image ${(state.pasteCount = (state.pasteCount || 0) + 1)}.png`, { type: f.type }))); return imgs.length > 0; };
  box.addEventListener('paste', e => { if (take(e.clipboardData?.files || [])) e.preventDefault(); });
  box.addEventListener('dragover', e => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); });
  box.addEventListener('drop', e => { if (take(e.dataTransfer?.files || [])) e.preventDefault(); });
}

async function uploadStudyFile(file) {
  file = await shrinkImageFile(file);
  if (file.size > 7 * 1024 * 1024) { showToast('That file is over 7 MB — try a smaller one.', 'error'); return; }
  addStudyAttachment(file.name, async () => {
    const buf = new Uint8Array(await file.arrayBuffer());
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return fetch('/api/study-uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, data: btoa(bin) }) });
  });
}

async function openDrivePicker() {
  const overlay = document.createElement('div');
  overlay.className = 'drive-picker-overlay';
  overlay.innerHTML = '<div class="drive-picker" role="dialog" aria-label="Choose a file from Google Drive"><header><span>Choose a file from Google Drive</span><button type="button" aria-label="Close">✕</button></header><ul></ul></div>';
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  overlay.querySelector('header button').addEventListener('click', close);
  document.body.appendChild(overlay);
  const ul = overlay.querySelector('ul');
  ul.innerHTML = '<li class="empty">Loading your files…</li>';
  try {
    const r = await fetch('/api/drive/files');
    const data = await r.json();
    const readable = /^application\/vnd\.google-apps\.(document|presentation|spreadsheet)$|^application\/pdf$|wordprocessingml|presentationml|^text\/(plain|csv|markdown)$|^image\/(png|jpeg|gif|webp)$/;
    const files = (Array.isArray(data) ? data : (data.files || [])).filter(f => readable.test(f.mimeType || ''));
    if (!files.length) {
      ul.innerHTML = '';
      const li = document.createElement('li'); li.className = 'empty';
      li.textContent = data && data.message ? data.message : 'No Docs, Slides, PDFs or pictures found in your Drive.';
      ul.appendChild(li);
      return;
    }
    ul.innerHTML = '';
    files.forEach(f => {
      const li = document.createElement('li');
      const b = document.createElement('button'); b.type = 'button';
      const n = document.createElement('span'); n.textContent = f.name;
      const m = document.createElement('span'); m.className = 'meta'; m.textContent = f.mimeLabel || '';
      b.append(n, m);
      b.addEventListener('click', () => {
        close();
        addStudyAttachment(f.name, () => fetch('/api/study-uploads/drive', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fileId: f.id }) }));
      });
      li.appendChild(b); ul.appendChild(li);
    });
    ul.querySelector('button')?.focus();
  } catch {
    ul.innerHTML = '<li class="empty">Couldn\'t load your Drive files right now.</li>';
  }
}


// One-click screenshot of another browser tab (an FLVS lesson, a slide deck, an embedded page the coach can't fetch).
// Uses the browser's own screen-capture picker — the student chooses exactly what to share, nothing is recorded, we grab
// ONE frame and stop immediately. Whole-screen sharing is excluded where the browser supports that hint. Not available on
// phones/iPads (no getDisplayMedia), where the menu item stays hidden — they can attach a screenshot instead.
async function captureTabToChat() {
  if (state.studyAttachments.length >= 5) { showToast('You can keep up to 5 files at a time — remove one first.', 'error'); return; }
  let stream;
  try {
    // No surface restrictions: the browser's own picker lets the student choose a tab, a window, or the screen —
    // restricting it left some browsers/devices offering only the hub tab itself.
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (e) {
    if (e && e.name !== 'NotAllowedError' && e.name !== 'AbortError') showToast('Couldn\'t start the capture on this device.', 'error');
    return;   // cancelled the picker — nothing to do
  }
  try {
    const video = document.createElement('video');
    video.muted = true; video.playsInline = true; video.srcObject = stream;
    await video.play();
    await new Promise(r => setTimeout(r, 450));   // let the first real frame arrive
    const w0 = video.videoWidth, h0 = video.videoHeight;
    if (!w0 || !h0) throw new Error('no frame');
    const scale = Math.min(1, 1600 / w0);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w0 * scale); canvas.height = Math.round(h0 * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(r => canvas.toBlob(r, 'image/jpeg', 0.85));
    if (!blob) throw new Error('encode failed');
    state.captureCount = (state.captureCount || 0) + 1;
    uploadStudyFile(new File([blob], `Screen capture ${state.captureCount}.jpg`, { type: 'image/jpeg' }));
    showToast('Captured. Capture the next slide too if there is more, then ask me about it.', 'success');
  } catch {
    showToast('Couldn\'t capture that tab — try again.', 'error');
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}

function initStudyAttachControls() {
  const btn = document.getElementById('chat-attach-btn');
  const menu = document.getElementById('chat-attach-menu');
  const fileInput = document.getElementById('chat-file-input');
  if (!btn || !menu || !fileInput) return;
  const capBtn = document.getElementById('chat-attach-capture');
  if (capBtn && navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') capBtn.hidden = false;
  const hideMenu = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', e => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); });
  document.addEventListener('click', e => { if (!menu.hidden && !menu.contains(e.target)) hideMenu(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { hideMenu(); btn.focus(); } });
  menu.addEventListener('click', e => {
    const which = e.target.closest('button')?.dataset.attach;
    if (!which) return;
    hideMenu();
    if (which === 'computer') fileInput.click(); else if (which === 'capture') captureTabToChat(); else openDrivePicker();
  });
  fileInput.addEventListener('change', () => {
    [...fileInput.files].slice(0, 5).forEach(uploadStudyFile);
    fileInput.value = '';
  });
}

// A student asking the coach for a game/break gets a real button under the reply — deterministic, not left to the model:
// "Start your brain break" when one is earned (or always, for staff test accounts), otherwise "Start a 25-min focus
// session" (which earns one). Only when the game is switched on (BRAIN_BREAK_ENABLED).
// Narrow on purpose: these are student-athletes — "I have a game tomorrow" / "we play at 5" must NOT offer the race.
const GAME_ASK = /\b(brain ?break|hurdle race|(?:play|quick|fun|mini|little)\s+(?:a\s+|the\s+)?(?:quick\s+|fun\s+|race\s+)?games?|(?:can|could) (?:we|i) play\b(?!\s+(?:in|at|on|for|tomorrow|today|this|next))|let'?s play\b(?!\s+(?:in|at|on|for)))/i;
// The coach is told about the button (routes/chat.js); when ITS reply points to it, show it too — so the button never
// depends on how the student happened to word the request (found 2026-10-11: "Tap 'Start your brain break'" with no button).
const COACH_POINTS_TO_BUTTON = /start your brain break|start a 25-min(ute)? focus session|unlocks after a 25-minute focus/i;
function maybeAppendBrainBreakButton(bubble, userText, replyText = '') {
  const BB = window.BrainBreak;
  if (!BB?.isEnabled?.() || !(GAME_ASK.test(String(userText || '')) || COACH_POINTS_TO_BUTTON.test(String(replyText || '')))) return;
  const tester = !!window.__brainBreakTester;
  const ready = BB.canPlay() || tester;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'chat-brainbreak-btn';
  btn.textContent = ready ? `🏁 Start your brain break${tester && !BB.canPlay() ? ' (test account)' : ''}` : '🎯 Start a 25-min focus session (unlocks the race)';
  btn.addEventListener('click', () => {
    if (ready) {
      if (!BB.canPlay() && tester) BB.earn(25 * 60);   // staff test shortcut
      BB.open();
      btn.disabled = true;
    } else {
      window.timerControl?.startCountdown?.(25 * 60, '🎯 Focus session');
    }
  });
  bubble.appendChild(btn);
}

async function sendChatMessage(text, source) {
  if (!text.trim()) return;
  // Any answer box left under an earlier question is stale once a new message goes out.
  document.querySelectorAll('.chat-answer-box').forEach(el => el.remove());
  const input = document.getElementById('chat-input');
  const sendBtn = document.getElementById('chat-send');
  input.value = '';
  input.style.height = 'auto';
  sendBtn.disabled = true;

  if (ttsSupported()) stopSpeech();   // a new message ends any read-aloud in progress
  const userBubble = appendBubble('user', text);
  if (state.studyAttachments?.length) {
    const note = document.createElement('span');
    note.className = 'bubble-attach';
    note.textContent = '📎 ' + state.studyAttachments.map(a => a.name).join(', ');
    userBubble.appendChild(note);
  }
  state.chatHistory.push({ role: 'user', content: text });

  const bubble = appendBubble('assistant', '');
  bubble.classList.add('typing');
  // Animated dots instead of a plain-text "…" — the 'text' SSE handler below
  // overwrites this via bubble.textContent the moment real content starts
  // streaming in, so this is purely the resting placeholder, never partially
  // replaced.
  bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  let fullText = '';
  let pendingYtVideos = null;
  let pendingYtTrigger = null;
  let pendingStudyGuide = null;
  let pendingFlashcards = null;
  let pendingDiagram = null;
  let pendingImages = null;
  let pendingTeacherMessage = null;
  let pendingActions = [];   // coach-proposed actions (lib/chat-actions.js) — Confirm/Cancel cards
  const stallController = new AbortController();
  let stallTimer = null;
  let pendingMorning = null;

  try {
    const studentName = getStudentName();
    // If the server sends nothing at all for 90s, stop waiting and say so.
    stallTimer = setTimeout(() => stallController.abort(), 90000);
    const res = await fetch('/api/chat/message', {
      method: 'POST',
      signal: stallController.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(studentName ? { 'X-Student-Name': studentName } : {}),
      },
      body: JSON.stringify({
        messages: state.chatHistory,
        context: buildContext(),
        tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; } })(),
        ...(state.studyAttachments?.length ? { attachmentIds: state.studyAttachments.filter(a => !a.busy).map(a => a.id) } : {}),
        // Private engagement signal only — 'chip' vs. 'typed' tally server-side.
        // Omitted (e.g. on retry-resend) simply means this send isn't counted.
        ...(source ? { interactionSource: source } : {}),
      }),
    });

    // A rejected request (expired session, gateway error) comes back as JSON/HTML,
    // not a stream — surface it instead of waiting on a stream that never starts.
    if (!res.ok || !(res.headers.get('content-type') || '').includes('text/event-stream')) {
      clearTimeout(stallTimer);
      state.chatHistory.pop(); // this turn never happened server-side
      await showChatSendFailure(bubble, res.status, text);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let lineBuffer = '';

    while (true) {
      const { done, value } = await reader.read();
      clearTimeout(stallTimer); // bytes are flowing — the stall timer's job is done
      if (done) break;
      lineBuffer += decoder.decode(value, { stream: true });
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop(); // last item may be an incomplete line — save for next chunk
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let data;
        try { data = JSON.parse(line.slice(6)); }
        catch { console.warn('[Chat] SSE parse skip:', line.slice(6, 80)); continue; }
        if (data.type === 'text') {
          fullText += data.text;
          bubble.textContent = fullText;
          bubble.classList.remove('typing');
          document.getElementById('chat-messages').scrollTop = 999999;
        } else if (data.type === 'youtube_results') {
          pendingYtVideos = data.videos;
        } else if (data.type === 'youtube_trigger') {
          // Server already confirmed this against the complete response and
          // extracted the exact phrase + topic — nothing left to guess here.
          pendingYtTrigger = data;
        } else if (data.type === 'done') {
          // Remove the confirmed trigger phrase before rendering — it was still
          // present in the raw streamed text (detection only happens once the
          // full response is known, server-side), but must never be shown.
          if (pendingYtTrigger?.phrase) {
            fullText = fullText.replace(pendingYtTrigger.phrase, '').replace(/\n{3,}/g, '\n\n').trim();
          }
          const feedbackVisuals = [pendingImages?.length ? `${pendingImages.length} pictures` : null, pendingDiagram ? 'diagram' : null,
            pendingYtVideos?.length ? 'videos' : null, pendingStudyGuide ? 'study guide' : null, pendingFlashcards ? 'flashcards' : null].filter(Boolean);
          bubble.innerHTML = renderMarkdown(fullText);
          maybeAppendBrainBreakButton(bubble, text, fullText);
          const spokenText = ttsSupported() ? speechTextFromBubble(bubble) : '';   // the reply's own words, before cards/pictures are appended
          if (pendingYtVideos?.length) {
            appendYouTubeCards(bubble, pendingYtVideos);
            pendingYtVideos = null;
          }
          if (pendingYtTrigger?.topic && !pendingYtVideos) {
            safeFetch('/api/youtube/search?q=' + encodeURIComponent(pendingYtTrigger.topic))
              .then(d => {
                const vids = d.items || (Array.isArray(d) ? d : []);
                if (vids.length) appendYouTubeCards(bubble, vids);
              })
              .catch(() => {});
          }
          pendingYtTrigger = null;
          if (pendingImages) {
            appendImages(bubble, pendingImages);
            pendingImages = null;
          }
          if (pendingDiagram) {
            appendDiagram(bubble, pendingDiagram);
            pendingDiagram = null;
          }
          if (pendingStudyGuide) {
            appendStudyGuide(bubble, pendingStudyGuide);
            pendingStudyGuide = null;
          }
          if (pendingFlashcards) {
            appendFlashcards(bubble, pendingFlashcards);
            pendingFlashcards = null;
          }
          if (pendingTeacherMessage) {
            appendTeacherMessageCard(bubble, pendingTeacherMessage);
            pendingTeacherMessage = null;
          }
          if (pendingMorning) {
            appendMorningCard(bubble, pendingMorning);
            pendingMorning = null;
          }
          for (const action of pendingActions) appendActionCard(bubble, action);
          pendingActions = [];
          appendListenControls(bubble, spokenText);
          appendFeedbackRow(bubble, { prompt: text, response: fullText, visuals: feedbackVisuals });
          document.getElementById('chat-messages').scrollTop = 999999;
        } else if (data.type === 'calendar_refresh') {
          loadCalendarEvents().then(() => { renderCalendar(); renderUpcoming(); });
        } else if (data.type === 'reminder_created' && data.reminder) {
          requestNotificationPermission();
          updateReminderBadge();
        } else if (data.type === 'timer_action' && data.action && window.timerControl) {
          const a = data.action;
          if (a.type === 'pomodoro')   window.timerControl.startPomodoro();
          else if (a.type === 'countdown' && a.secs) window.timerControl.startCountdown(a.secs, a.label || '');
          else if (a.type === 'stop')  window.timerControl.stopTimer();
        } else if (data.type === 'open_question') {
          renderAnswerBox();
        } else if (data.type === 'suggested_chips' && Array.isArray(data.chips)) {
          // isGuiding now comes from the server (routes/chat.js), which knows
          // whether these are the model's real CHOICES: or the generic
          // fallback list — previously hardcoded true here for both cases,
          // so the "🧭 your call" cue rendered even over unrelated fallback
          // chips. Falls back to true if an older server response doesn't
          // send the field, matching the prior behavior.
          renderQuickChips(data.chips, data.isGuiding !== false);
        } else if (data.type === 'morning_message' && data.morning) {
          pendingMorning = data.morning; // held until 'done' like the other cards
        } else if (data.type === 'action_proposal' && data.action?.id) {
          pendingActions.push(data.action); // held until 'done' like the other cards
        } else if (data.type === 'teacher_message' && data.teacherMessage) {
          pendingTeacherMessage = data.teacherMessage; // held until 'done' like the cards below
        } else if (data.type === 'images' && Array.isArray(data.images)) {
          pendingImages = data.images; // held until 'done' like the other cards
        } else if (data.type === 'diagram' && data.diagram) {
          pendingDiagram = data.diagram; // same held-until-'done' reasoning as the two below
        } else if (data.type === 'study_guide' && data.studyGuide) {
          // Held until 'done' below, same reason as pendingYtVideos/pendingYtTrigger —
          // this arrives before 'done', and 'done' replaces bubble.innerHTML wholesale
          // (renderMarkdown(fullText)), which would wipe out anything appended now.
          pendingStudyGuide = data.studyGuide;
        } else if (data.type === 'flashcards' && data.flashcards) {
          pendingFlashcards = data.flashcards; // same held-until-'done' reasoning
        } else if (data.type === 'error') {
          bubble.classList.remove('typing');
          bubble.textContent = data.error || 'Something went wrong — try again';
          if (data.retryable) appendChatRetryButton(bubble);
          document.getElementById('chat-messages').scrollTop = 999999;
        }
      }
    }
    state.chatHistory.push({ role: 'assistant', content: fullText });
  } catch (e) {
    if (e.name === 'AbortError') {
      state.chatHistory.pop();
      await showChatSendFailure(bubble, 'stalled', text);
    } else {
      bubble.textContent = `Connection error: ${e.message}`;
    }
  } finally {
    clearTimeout(stallTimer);
    sendBtn.disabled = false;
  }
}

// Renders chips as a new row inline in the message flow, directly after whatever
// is currently the last thing in #chat-messages (the AI response — and its focus
// card, if renderChatOpener() added one — that these chips relate to). Each turn
// gets its own row rather than a single shared container, so scrolling back still
// shows which options went with which message, like a normal chat thread.
//
// isGuiding: true ONLY at the real CHOICES: call site (SSE 'suggested_chips',
// sent when the coach asked a guiding question instead of stating the answer —
// see the "Coaching Persona" section of the SYSTEM_PROMPT in routes/chat.js).
// The starter-suggestion call sites below pass nothing, deliberately — those
// are static defaults, not a signal that a guiding question just happened,
// and tagging them as such would be a false "coach state" cue.
function renderQuickChips(chips, isGuiding = false) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl || !chips?.length) return;
  if (isGuiding) {
    const cue = document.createElement('div');
    cue.className = 'chat-guiding-cue';
    cue.textContent = '🧭 your call';
    messagesEl.appendChild(cue);
  }
  const row = document.createElement('div');
  row.className = 'chat-suggestions';
  row.innerHTML = chips.map(q =>
    `<button class="suggestion-chip" data-q="${q.replace(/"/g, '&quot;')}">${q}</button>`
  ).join('');
  messagesEl.appendChild(row);
  row.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', () => sendChatMessage(chip.dataset.q, 'chip'));
  });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Inline answer box, rendered directly under an open-ended question from the
// coach (the server sends 'open_question' when a reply ends in "?" and has no
// CHOICES: of its own). Submits through the same sendChatMessage() path as a
// chip tap or the main input bar, so the answer is an ordinary chat message.
function renderAnswerBox() {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return;
  messagesEl.querySelectorAll('.chat-answer-box').forEach(el => el.remove());

  const box = document.createElement('form');
  box.className = 'chat-answer-box';
  box.innerHTML = `
    <textarea class="chat-answer-input" rows="2" maxlength="2000" placeholder="Type your answer…" aria-label="Your answer"></textarea>
    <button type="submit" class="chat-answer-send">Send answer</button>`;
  messagesEl.appendChild(box);

  const ta = box.querySelector('textarea');
  const submit = () => {
    const text = ta.value.trim();
    if (!text) return;
    box.remove();
    sendChatMessage(text, 'answer');
  };
  box.addEventListener('submit', e => { e.preventDefault(); submit(); });
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
  });
  // Focus straight away on desktop only — on a phone that would pop the keyboard
  // over the question the student is still reading.
  if (window.matchMedia('(pointer: fine)').matches) ta.focus({ preventScroll: true });
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Chat: proactive opener ─────────────────────────────────────────────────
// Runs once per session. Replaces the static greeting with a personalized one
// built from the same data the Today tab's game-plan widget uses, so the
// coach's opening line matches what the student already sees there. Falls back
// to the static HTML greeting if the fetch fails.
// (The old streak/energy status strip was removed with the daily check-in;
// #chat-topbar now holds the mentor-availability chip — shown by
// updatePresenceUI() in hub-tabs.js — and the "What I know" memory chip
// below, shown by loadMemoryChip().)
let _chatOpenerInitialized = false;
document.addEventListener('ysc:sessionReady', initChatOpener);
document.addEventListener('ysc:sessionReady', loadMemoryChip);
// Exposed for hub-tabs.js's loadHome(): idempotent (guarded below), so a Home
// tab visit before ysc:sessionReady still gets the proactive opener once ready.
window.ensureChatOpener = initChatOpener;

// ── Chat: post-Focus-Mode reflection ─────────────────────────────────────────
// Dispatched by timer.js's onCDDone() only for a Focus-Mode-flagged countdown
// (see startCountdown()'s opts.focusMode) — turns "Start Focus Mode" into a
// closed coaching loop instead of a timer that just... stops. Routed through
// the normal sendChatMessage() pipeline (same as a suggestion-chip tap) so the
// existing coaching persona/system prompt handles the response — no new
// server-side logic needed for this part.
document.addEventListener('ysc:focusModeComplete', (e) => {
  const { label, outcome } = e.detail || {};
  if (!label) return;
  const homeTab = document.querySelector('.htv-tab[data-tab="home"]');
  const alreadyHome = homeTab?.classList.contains('htv-active');
  if (homeTab && !alreadyHome) homeTab.click();
  const msg = outcome === 'done'
    ? `I just finished my Focus Mode session on "${label}" — got it done!`
    : `I just finished my Focus Mode session on "${label}" but I'm still stuck.`;
  // Small delay only when a tab switch just happened, so #chat-messages has
  // settled into view before the bubble/scroll lands.
  setTimeout(() => sendChatMessage(msg, 'chip'), alreadyHome ? 0 : 150);
});

// ── Chat: "What I know about you" memory chip ───────────────────────────────
// Surfaces lib/student-memory-store.js's contents (via GET /api/chat/memories)
// so the MEMORY: feature is legible instead of an invisible thing the bot
// just seems to know. Runs once per session, same trigger as initChatOpener.
// Stays hidden entirely when the student has zero stored memories yet —
// no empty state, nothing to click.
let _memoryChipInitialized = false;
async function loadMemoryChip() {
  if (_memoryChipInitialized) return;
  _memoryChipInitialized = true;
  try {
    const data = await safeFetch('/api/chat/memories');
    const memories = data?.memories || [];
    if (!memories.length) return;
    renderMemoryChip(memories);
  } catch (err) {
    console.warn('[Chat] loadMemoryChip error:', err.message);
  }
}

function renderMemoryChip(memories) {
  const chip  = document.getElementById('home-memory-chip');
  const panel = document.getElementById('home-memory-panel');
  const strip = document.getElementById('chat-topbar');
  if (!chip || !panel || !strip) return;

  chip.style.display = '';
  strip.style.display = 'flex';
  renderMemoryPanelList(panel, memories);

  chip.addEventListener('click', () => {
    const open = panel.style.display !== 'none';
    panel.style.display = open ? 'none' : '';
    chip.setAttribute('aria-expanded', String(!open));
  });
  // Close on an outside click, same convention as other dropdowns in this file.
  document.addEventListener('click', (e) => {
    if (panel.style.display === 'none') return;
    if (e.target === chip || chip.contains(e.target) || panel.contains(e.target)) return;
    panel.style.display = 'none';
    chip.setAttribute('aria-expanded', 'false');
  });
}

function renderMemoryPanelList(panel, memories) {
  panel.innerHTML = '';
  const title = document.createElement('div');
  title.className = 'hss-memory-panel-title';
  title.textContent = 'What I know about you';
  panel.appendChild(title);

  if (!memories.length) {
    // Only reachable after forgetting the last item — the chip itself stays
    // hidden on initial load when there's nothing to show (see loadMemoryChip).
    const empty = document.createElement('div');
    empty.className = 'hss-memory-item';
    empty.textContent = "Nothing stored yet — I'll pick things up as we talk.";
    panel.appendChild(empty);
    return;
  }

  for (const mem of memories) {
    const row = document.createElement('div');
    row.className = 'hss-memory-item';
    const text = document.createElement('span');
    text.className = 'hss-memory-item-text';
    text.textContent = mem.text;
    const forget = document.createElement('button');
    forget.className = 'hss-memory-forget';
    forget.type = 'button';
    forget.title = 'Forget this';
    forget.textContent = '✕';
    forget.addEventListener('click', async (e) => {
      e.stopPropagation();
      forget.disabled = true;
      try {
        await fetch(`/api/chat/memories/${encodeURIComponent(mem.id)}`, { method: 'DELETE', credentials: 'include' });
        const next = memories.filter(m => m.id !== mem.id);
        memories.length = 0;
        memories.push(...next);
        renderMemoryPanelList(panel, memories);
        if (!memories.length) {
          document.getElementById('home-memory-chip')?.style.setProperty('display', 'none');
          panel.style.display = 'none';
        }
      } catch (err) {
        forget.disabled = false;
        console.warn('[Chat] forget memory failed:', err.message);
      }
    });
    row.appendChild(text);
    row.appendChild(forget);
    panel.appendChild(row);
  }
}

// ── Chat opener extras: mentor weekly message, broadcast echo, recovery
// invite — folded in 2026-09-18 when the Today tab (their only surface) was
// removed. Broadcast *delivery* is unchanged (the full-screen overlay via
// showBroadcast()/connectStudentEvents() still fires immediately regardless
// of tab); this is a persistent "still here" echo, replacing the old
// Today-tab pinned card, using the real dismissedBroadcastIds state (not
// hub-tabs.js's dead window._dismissedBroadcastIds check its old widget read).
function appendAssistantBubble(innerHtml) {
  const messagesEl = document.getElementById('chat-messages');
  if (!messagesEl) return null;
  const wrap = document.createElement('div');
  wrap.className = 'chat-bubble-wrap assistant';
  wrap.innerHTML = `<img src="/logo.jpg" alt="YSC" class="chat-avatar" /><div class="chat-bubble assistant">${innerHtml}</div>`;
  messagesEl.appendChild(wrap);
  return wrap;
}

function appendMentorMessageBubble(message) {
  if (!message) return;
  const weekOfLabel = new Date(message.weekOf + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  appendAssistantBubble(`
    <div class="content-kicker kicker-mentor">📨 From your mentor</div>
    <div class="mentor-msg-bubble-text">"${formatMentorText(message.text)}"</div>
    <div class="mentor-msg-bubble-meta">— ${escHtml(message.mentorName)} · week of ${weekOfLabel}</div>
  `);
}

// Current non-dismissed broadcast to echo in chat, or null. Set by
// connectStudentEvents()'s existing 'broadcast'/'broadcast_clear' SSE
// handling below (same live signal the full-screen overlay already uses),
// so this stays correct regardless of whether it arrives before or after
// the opener has already rendered.
let _openerBroadcast   = null;
let _broadcastBubbleEl = null;

function buildBroadcastBubbleInnerHtml(msg) {
  const type = msg.broadcastType || 'text';
  let inner;
  if (type === 'youtube' || type === 'video') {
    inner = `<div class="htv-tv"><div class="htv-tv-header">📺 Video Message from Your Teacher</div>${msg.mediaUrl ? `<video controls src="${escHtml(msg.mediaUrl)}"></video>` : ''}${msg.caption ? `<div style="margin-top:8px;font-size:.85rem">${escHtml(msg.caption)}</div>` : ''}</div>`;
  } else if (type === 'audio') {
    inner = `<div class="htv-record"><div class="htv-record-disc" id="chat-broadcast-disc"></div><div class="htv-record-content"><div class="htv-record-header">🎵 Audio Message from Your Teacher</div><audio controls onplay="document.getElementById('chat-broadcast-disc')?.classList.add('htv-playing')" onpause="document.getElementById('chat-broadcast-disc')?.classList.remove('htv-playing')" src="${escHtml(msg.mediaUrl||'')}"></audio>${msg.caption ? `<div style="margin-top:6px;font-size:.82rem">${escHtml(msg.caption)}</div>` : ''}</div></div>`;
  } else {
    inner = `<div class="htv-bb"><div class="htv-bb-header">📢 Message from Your Teacher</div><div class="htv-bb-text">${escHtml(msg.text||'')}</div></div>`;
  }
  return `<button class="chat-bubble-dismiss-btn" title="Dismiss">✕</button>${inner}`;
}

function renderBroadcastChatBubble() {
  if (_broadcastBubbleEl) { _broadcastBubbleEl.remove(); _broadcastBubbleEl = null; }
  if (!_openerBroadcast) return;
  const msg  = _openerBroadcast;
  const wrap = appendAssistantBubble(buildBroadcastBubbleInnerHtml(msg));
  if (!wrap) return;
  _broadcastBubbleEl = wrap;
  wrap.querySelector('.chat-bubble-dismiss-btn')?.addEventListener('click', () => {
    if (msg.id) saveBroadcastDismissed(msg.id);
    if (_openerBroadcast === msg) _openerBroadcast = null;
    wrap.remove();
    if (_broadcastBubbleEl === wrap) _broadcastBubbleEl = null;
  });
}

// Called from connectStudentEvents()'s SSE handling. Same target/dismissed
// checks as showBroadcast() (the overlay), so the chat echo never shows a
// broadcast the overlay itself would have skipped.
function updateOpenerBroadcast(msg) {
  if (msg) {
    const name = getStudentName();
    if (msg._targets?.length && !msg._targets.includes(name)) return;
    if (msg.id && dismissedBroadcastIds.has(msg.id) && !msg._force) return;
  }
  _openerBroadcast = msg;
  if (_chatOpenerInitialized) renderBroadcastChatBubble();
}

function buildRecoveryInvite(assignments) {
  if (!Array.isArray(assignments)) return null;   // an error body here used to throw and blank the whole opener
  const now = new Date();
  const missing = assignments.filter(a => {
    if (!a.due_at || new Date(a.due_at) >= now) return false;
    const s = a.submission?.workflow_state;
    return !s || s === 'unsubmitted' || s === 'not_graded';
  });
  return missing.length ? missing : null;
}

function appendRecoveryInviteBubble(missing) {
  const toAssign = a => ({ name: a.name || 'Untitled Assignment', course: a.course_name || '', url: a.html_url || '', due: a.due_at || '' });
  const label = missing.length === 1
    ? 'One assignment could use a plan — want help catching up?'
    : 'A few assignments could use a plan — want help catching up?';
  const wrap = appendAssistantBubble(`<a href="#" class="htv-recovery-invite-link">${escHtml(label)}</a>`);
  if (!wrap) return;
  wrap.querySelector('.htv-recovery-invite-link').addEventListener('click', e => {
    e.preventDefault();
    if (missing.length === 1) { window.openRecoveryPlan?.(toAssign(missing[0])); return; }
    // Reveal a lightweight picker in place — only after the student opts in.
    const bubble = wrap.querySelector('.chat-bubble');
    bubble.innerHTML = missing.map((a, i) => {
      const pickLabel = a.course_name ? `${a.name || 'Untitled Assignment'} — ${a.course_name}` : (a.name || 'Untitled Assignment');
      return `<a href="#" class="htv-recovery-invite-pick" data-idx="${i}">${escHtml(pickLabel)}</a>`;
    }).join('');
    bubble.querySelectorAll('.htv-recovery-invite-pick').forEach(link => {
      link.addEventListener('click', e2 => {
        e2.preventDefault();
        window.openRecoveryPlan?.(toAssign(missing[Number(link.dataset.idx)]));
      });
    });
  });
}

async function initChatOpener() {
  if (_chatOpenerInitialized) return;
  _chatOpenerInitialized = true;
  try {
    // Share the Today-tab widget's in-flight request when it's available
    // (hub-tabs.js) so Today load makes one game-plan call, not two.
    const [gamePlanData, mentorMsgData, recoveryAssignments, morningOffer, yesterdayRecap] = await Promise.all([
      (window.gp_fetchGamePlan
        ? window.gp_fetchGamePlan()
        : fetch('/api/student/game-plan', { credentials: 'include' }).then(r => r.json())
      ).catch(() => null),
      fetch('/api/student/mentor-weekly-message', { credentials: 'include' }).then(r => r.json()).catch(() => null),
      // Shared with the Canvas panel. Not connected / any error → null (no recovery invite), never an error object.
      getCanvasAssignments().catch(() => null),
      morningOfferState(),
      yesterdayRecapForToday(),
    ]);
    renderChatOpener(gamePlanData, mentorMsgData?.message, buildRecoveryInvite(recoveryAssignments), morningOffer, yesterdayRecap);
  } catch (err) {
    console.warn('[Chat] initChatOpener error:', err.message);
  }
}

// ── "Yesterday" recap bubble (Home opener, first load of each day) ───────────────
// GET /api/student/yesterday-recap (lib/yesterday-recap.js): what they checked off yesterday + whether the
// mentor wrote back. Shown ONCE per calendar day per student (localStorage remembers the day) and only when
// there's something real to recognise — never a "you did nothing" message. Marked shown when fetched, so
// a second tab/reload the same day doesn't repeat it.
const RECAP_DAY_KEY = 'ysc-recap-day';
async function yesterdayRecapForToday() {
  try {
    const email = (window._sessionUser?.email || '').toLowerCase();
    if (!email) return null;
    const r = await fetch('/api/student/yesterday-recap', { credentials: 'include' });
    if (!r.ok) return null;
    const recap = await r.json();
    if (!recap?.today) return null;
    let all = {};
    try { all = JSON.parse(localStorage.getItem(RECAP_DAY_KEY) || '{}'); } catch { /* storage unavailable */ }
    if (all[email] === recap.today) return null;               // already shown today
    try { all[email] = recap.today; localStorage.setItem(RECAP_DAY_KEY, JSON.stringify(all)); } catch { /* may repeat next load — harmless */ }
    return recap.hasContent ? recap : null;
  } catch { return null; }
}

function appendYesterdayRecapBubble(recap) {
  if (!recap?.hasContent) return;
  const lines = [];
  if (recap.completedCount > 0) {
    const n = recap.completedCount;
    const names = (recap.completed || []).map(t => `<em>${escHtml(t)}</em>`);
    const extra = n - names.length;
    let list = '';
    if (names.length) list = ' — ' + (names.length === 1 && extra <= 0 ? names[0]
      : names.slice(0, -1).join(', ') + (extra > 0 ? `, ${names[names.length - 1]}` : ` and ${names[names.length - 1]}`) + (extra > 0 ? ` and ${extra} more` : ''));
    lines.push(`You checked off <strong>${n} ${n === 1 ? 'thing' : 'things'}</strong> yesterday${list}.`);
  }
  if (recap.mentor?.replies > 0) {
    const who = escHtml(recap.mentor.name || 'Your mentor');
    lines.push(`${who} wrote back to you in Mentor Chat. <button type="button" class="recap-link" data-recap-mentor>Open Mentor Chat →</button>`);
  }
  const wrap = appendAssistantBubble(`
    <div class="content-kicker kicker-recap">📆 Yesterday</div>
    <div class="recap-lines">${lines.map(l => `<div>${l}</div>`).join('')}</div>
    <div class="recap-q">What's one thing you want to build on today?</div>
  `);
  wrap?.querySelector('[data-recap-mentor]')?.addEventListener('click', () => { if (typeof window.openMentorChat === 'function') window.openMentorChat(); });
}

// ── Proactive offer: the morning Slack message ───────────────────────────────
// Students won't know they can ask for it, and a model that only mentions it "when
// it seems helpful" is unreliable — so the Home opener offers it deterministically
// to any student who hasn't set it up (or turned it off), can be reached on Slack,
// and hasn't said "Not now" (snoozed 7 days; after 2 dismissals it stops offering on
// its own — the profile menu and just asking the coach still work). Saying yes
// hands off to the coach conversation (asks the time, then optional extras, then the
// confirm card), so the same flow works whether they asked or were offered.
const MORNING_OFFER_KEY = 'ysc-morning-offer';
const MORNING_OFFER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function _morningOfferState(email) {
  try { return JSON.parse(localStorage.getItem(MORNING_OFFER_KEY) || '{}')[(email || '').toLowerCase()] || { dismissals: 0, until: 0 }; }
  catch { return { dismissals: 0, until: 0 }; }
}
function _morningOfferSet(email, patch) {
  try {
    const all = JSON.parse(localStorage.getItem(MORNING_OFFER_KEY) || '{}');
    const k = (email || '').toLowerCase();
    all[k] = { ...(all[k] || { dismissals: 0, until: 0 }), ...patch };
    localStorage.setItem(MORNING_OFFER_KEY, JSON.stringify(all));
  } catch { /* storage unavailable — the offer may simply show again next load */ }
}

async function morningOfferState() {
  try {
    const email = (window._sessionUser?.email || '').toLowerCase();
    if (!email) return null;
    const st = _morningOfferState(email);
    if (st.dismissals >= 2 || Date.now() < st.until) return null;
    const r = await fetch('/api/morning-message', { credentials: 'include' });
    if (!r.ok) return null;
    const v = await r.json();
    if (v.exists || v.slackReachable === false) return null; // already set up (even if turned off), or can't be DMed
    return { email, firstName: String(window._sessionUser?.name || '').trim().split(/\s+/)[0] || '' };
  } catch { return null; }
}

function appendMorningOfferBubble(offer, onDismiss) {
  if (!offer) return;
  const wrap = appendAssistantBubble(`
    <div class="content-kicker kicker-mentor">☀️ Morning message</div>
    <div>${offer.firstName ? escHtml(offer.firstName) + ' — want' : 'Want'} me to Slack you a quick rundown every morning? It has what’s due, what’s on your schedule, and a note from your mentor — and you pick the time.</div>
    <div class="morning-offer-actions">
      <button type="button" class="suggestion-chip" data-act="yes">Yes, set it up</button>
      <button type="button" class="suggestion-chip" data-act="info">What’s in it?</button>
      <button type="button" class="suggestion-chip" data-act="no">Not now</button>
    </div>`.replace(/>\s+</g, '><').trim()); // the bubble is pre-wrap — don't render the template's line breaks as gaps
  if (!wrap) return;
  const close = () => wrap.remove();
  wrap.querySelector('[data-act="yes"]').addEventListener('click', () => {
    _morningOfferSet(offer.email, { until: Date.now() + 2 * 24 * 60 * 60 * 1000 }); // engaged — don't re-offer on the next reload
    close();
    sendChatMessage('Yes, please set up the morning Slack message.', 'chip');
  });
  wrap.querySelector('[data-act="info"]').addEventListener('click', () => {
    _morningOfferSet(offer.email, { until: Date.now() + 2 * 24 * 60 * 60 * 1000 });
    close();
    sendChatMessage('What would be in the morning Slack message?', 'chip');
  });
  wrap.querySelector('[data-act="no"]').addEventListener('click', () => {
    const cur = _morningOfferState(offer.email);
    _morningOfferSet(offer.email, { dismissals: cur.dismissals + 1, until: Date.now() + MORNING_OFFER_SNOOZE_MS });
    close();
    if (onDismiss) onDismiss(); // bring back the usual starter buttons they'd otherwise miss
  });
}

function renderChatOpener(gamePlanData, mentorMessage, recoveryInvite, morningOffer, yesterdayRecap) {
  const messagesEl = document.getElementById('chat-messages');
  const hasExtras  = !!mentorMessage || !!_openerBroadcast || !!recoveryInvite || !!yesterdayRecap;
  if (!messagesEl || (!gamePlanData?.aiVoice && !hasExtras)) {
    // Keep the static fallback greeting bubble, but still offer starter chips —
    // there's no longer a static chip row in the HTML for this case to fall back on.
    renderQuickChips(['What is due this week?', 'Find my files', 'Show me announcements']);
    return;
  }

  messagesEl.innerHTML = '';
  appendMentorMessageBubble(mentorMessage);
  renderBroadcastChatBubble();
  if (recoveryInvite) appendRecoveryInviteBubble(recoveryInvite);
  appendYesterdayRecapBubble(yesterdayRecap);

  if (!gamePlanData?.aiVoice) {
    const fallbackStarters = ['What is due this week?', 'Find my files', 'Show me announcements'];
    // While the morning-message offer is showing it carries its own buttons — the generic
    // starters underneath would only repeat/compete with it — so they wait until "Not now".
    if (morningOffer) appendMorningOfferBubble(morningOffer, () => renderQuickChips(fallbackStarters));
    else renderQuickChips(fallbackStarters);
    return;
  }

  // \x02...\x03 marks student-authored text for gp_injectVoiceLinks() (hub-tabs.js)
  // to skip — this widget doesn't auto-link at all, so just strip the markers.
  // .trim() — aiVoice carries leading/trailing whitespace from how the server
  // assembles it, which white-space:pre-wrap on .chat-bubble then renders as a
  // literal first-line indent. Appearance fix only; the words are untouched.
  const html = escHtml(gamePlanData.aiVoice.trim())
    .replace(/\x02([\s\S]*?)\x03/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--sp-blue);">$1</strong>');
  appendAssistantBubble(html);

  const topTask = (gamePlanData.tasks || [])[0];
  let starterLabel = '';
  if (topTask) {
    const [title, course] = String(topTask.label || '').split(' — ');
    starterLabel = title || topTask.label || '';
    const meta = [
      topTask.dueDate ? 'Due ' + new Date(topTask.dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : null,
      topTask.estimatedMinutes ? `est. ${topTask.estimatedMinutes} min` : null,
    ].filter(Boolean).join(' · ');
    const card = document.createElement('div');
    card.className = 'cb-focus-card';
    card.innerHTML = `
      <div class="cb-fc-label">${escHtml(course ? '// ' + course : (topTask.tag || '// Focus'))}</div>
      <div class="cb-fc-title">${escHtml(starterLabel)}</div>
      ${meta ? `<div class="cb-fc-meta">${escHtml(meta)}</div>` : ''}
      ${topTask.canvasUrl ? `<a href="${escHtml(topTask.canvasUrl)}" target="_blank" rel="noopener" class="cb-fc-link">Open in Canvas →</a>` : ''}
    `;
    messagesEl.appendChild(card);
  }

  // ── Due this week — the rest of the week beyond the focus task ────────────
  // Data is already in the same game-plan response (canvasAssignments), so no
  // extra fetch. When Canvas isn't connected, aiVoice already says so — don't
  // stack a second prompt here.
  if (gamePlanData.canvasConnected !== false) {
    const topId = (topTask && topTask.id != null) ? String(topTask.id) : null;
    const rest  = (gamePlanData.canvasAssignments || [])
      .filter(a => topId == null || String(a.id) !== topId);
    if (rest.length) {
      const SHOW  = 5;
      const shown = rest.slice(0, SHOW);
      const more  = rest.length - shown.length;
      const fmt = ymd => new Date(ymd + 'T12:00:00')
        .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const list = document.createElement('div');
      list.className = 'cb-due-list';
      list.innerHTML = `
        <div class="cb-due-label">// Due this week</div>
        ${shown.map(a => `
          <div class="cb-due-item">
            <div class="cb-due-main">
              <span class="cb-due-title">${escHtml(a.title || 'Assignment')}</span>
              ${a.course || a.courseCode ? `<span class="cb-due-course">${escHtml(a.course || a.courseCode)}</span>` : ''}
            </div>
            <div class="cb-due-meta">
              ${a.dueDate ? `<span class="cb-due-when">${escHtml(fmt(a.dueDate))}</span>` : ''}
              ${a.canvasUrl ? `<a href="${escHtml(a.canvasUrl)}" target="_blank" rel="noopener" class="cb-due-link">Open →</a>` : ''}
            </div>
          </div>`).join('')}
        ${more > 0 ? `<button class="cb-due-more" type="button">+${more} more — show everything due</button>` : ''}
      `;
      messagesEl.appendChild(list);
      list.querySelector('.cb-due-more')?.addEventListener('click', () => {
        sendChatMessage('Show me everything due this week', 'chip');
      });
    }
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;

  // Swap the default static suggestion chips for energy/task-aware starters, through
  // the same renderQuickChips() path the server uses for its own follow-up chips —
  // so the adventure-style flow continues seamlessly once the student picks one.
  const starters = topTask
    ? [`Help me with ${starterLabel}`, 'Show me everything due', 'Something else']
    : ['Help with assignments', 'Plan my day', "I'm stressed"];
  // The morning-message offer has its own buttons; showing the starters beneath it too
  // was redundant, so they appear only once the offer is out of the way ("Not now").
  if (morningOffer) appendMorningOfferBubble(morningOffer, () => renderQuickChips(starters));
  else renderQuickChips(starters);
}

// ── Zoom Meetings ──────────────────────────────────────────────────────────
const ZOOM_KEY = 'ysc-zoom-links';

const DEFAULT_ZOOM_LINKS = [
  { id: 'def-1', name: 'Morning Homeroom', url: 'https://zoom.us', notes: 'Mon–Fri · 8:30 AM', category: 'school' },
  { id: 'def-2', name: 'Office Hours',     url: 'https://zoom.us', notes: 'Tue & Thu · 3:00 PM', category: 'school' },
  { id: 'def-3', name: 'Study Hall',       url: 'https://zoom.us', notes: 'Daily · 4:00 PM', category: 'school' },
];

// Added to state after state declaration
state.zoomLinks = [];
let zoomModalEditId   = null;
let zoomModalCategory = 'school';

function loadZoomLinks() {
  try {
    const stored = localStorage.getItem(ZOOM_KEY);
    return stored ? JSON.parse(stored) : JSON.parse(JSON.stringify(DEFAULT_ZOOM_LINKS));
  } catch { return JSON.parse(JSON.stringify(DEFAULT_ZOOM_LINKS)); }
}

function saveZoomLinks(links) {
  localStorage.setItem(ZOOM_KEY, JSON.stringify(links));
  state.zoomLinks = links;
}

// Opens a Zoom meeting URL in a popup window docked to the right side of the
// screen, rather than a full new tab — same dimensions/fallback behavior as
// huddle.js's openZoomPopup() (IIFE-scoped there, so not reusable directly;
// duplicated here to match, same as this file already does for other
// huddle.js-only helpers). Mobile browsers ignore the popup feature string
// and would just open an ordinary new tab the app can't close, so mobile
// gets plain in-tab navigation instead. If the popup is blocked (e.g. not
// triggered from a direct click), falls back to a real new tab.
function openZoomPopup(url) {
  if (!url) return;
  if (window.innerWidth <= 767) { location.href = url; return; }

  const width  = Math.floor(window.screen.width  * 0.45);
  const height = Math.floor(window.screen.height * 0.80);
  const left   = window.screen.width - width;
  const top    = 0;
  const popup  = window.open(
    url, 'ZoomMeeting',
    `width=${width},height=${height},left=${left},top=${top},toolbar=no,menubar=no,scrollbars=yes,resizable=yes`
  );
  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    window.open(url, '_blank', 'noopener');
    showToast('Popup blocked — Zoom opened in a new tab. Allow popups for side-by-side view.', 'warn');
  }
}

function renderZoomLinks() {
  const school   = state.zoomLinks.filter(l => l.category === 'school');
  const personal = state.zoomLinks.filter(l => l.category === 'personal');

  const renderItem = l => `
    <div class="zoom-meeting-item">
      <div class="zoom-meeting-icon">📹</div>
      <div class="zoom-meeting-info">
        <div class="zoom-meeting-name">${escHtml(l.name)}</div>
        ${l.notes ? `<div class="zoom-meeting-notes">${escHtml(l.notes)}</div>` : ''}
      </div>
      <div class="zoom-meeting-actions">
        <a href="${escHtml(l.url)}" rel="noopener" class="zoom-join-btn">Join</a>
        <button class="zoom-icon-btn zoom-edit-btn"   data-id="${l.id}" title="Edit">✏</button>
        <button class="zoom-icon-btn zoom-delete-btn" data-id="${l.id}" title="Remove">✕</button>
      </div>
    </div>`;

  const schoolEl   = document.getElementById('school-zoom-list');
  const personalEl = document.getElementById('personal-zoom-list');

  if (schoolEl) {
    schoolEl.innerHTML = school.length
      ? school.map(renderItem).join('')
      : '<div class="empty-state">No school meetings saved. Click + Add to save a link.</div>';
  }
  if (personalEl) {
    personalEl.innerHTML = personal.length
      ? personal.map(renderItem).join('')
      : '<div class="empty-state">No personal links yet. Click + Add to save your own.</div>';
  }

  document.querySelectorAll('.zoom-join-btn').forEach(btn =>
    btn.addEventListener('click', e => { e.preventDefault(); openZoomPopup(btn.href); })
  );
  document.querySelectorAll('.zoom-edit-btn').forEach(btn =>
    btn.addEventListener('click', () => openZoomModal(btn.dataset.id))
  );
  document.querySelectorAll('.zoom-delete-btn').forEach(btn =>
    btn.addEventListener('click', () => deleteZoomLink(btn.dataset.id))
  );
}

function openZoomModal(editId = null, category = 'school') {
  zoomModalEditId   = editId;
  zoomModalCategory = category;
  const link = editId ? state.zoomLinks.find(l => l.id === editId) : null;

  document.getElementById('zoom-modal-title').textContent        = editId ? 'Edit Meeting Link' : 'Add Zoom Link';
  document.getElementById('zoom-link-name').value                = link?.name  || '';
  document.getElementById('zoom-link-url').value                 = link?.url   || 'https://zoom.us/j/';
  document.getElementById('zoom-link-notes').value               = link?.notes || '';
  document.getElementById('zoom-link-category').value            = link?.category || category;
  document.getElementById('zoom-modal-delete-btn').style.display = editId ? '' : 'none';

  openModal('zoom-link-modal');
  setTimeout(() => document.getElementById('zoom-link-name').focus(), 80);
}

function saveZoomLink() {
  const name     = document.getElementById('zoom-link-name').value.trim();
  const url      = document.getElementById('zoom-link-url').value.trim();
  const notes    = document.getElementById('zoom-link-notes').value.trim();
  const category = document.getElementById('zoom-link-category').value;

  if (!name) { document.getElementById('zoom-link-name').focus(); return; }
  if (!url)  { document.getElementById('zoom-link-url').focus();  return; }

  const links = [...state.zoomLinks];
  if (zoomModalEditId) {
    const idx = links.findIndex(l => l.id === zoomModalEditId);
    if (idx !== -1) links[idx] = { ...links[idx], name, url, notes, category };
  } else {
    links.push({ id: `zm-${Date.now()}`, name, url, notes, category });
  }

  saveZoomLinks(links);
  renderZoomLinks();
  closeModal('zoom-link-modal');
}

function deleteZoomLink(id) {
  if (!confirm('Remove this Zoom link?')) return;
  saveZoomLinks(state.zoomLinks.filter(l => l.id !== id));
  renderZoomLinks();
}

function deleteZoomLinkFromModal() {
  if (!zoomModalEditId) return;
  if (!confirm('Delete this Zoom link?')) return;
  saveZoomLinks(state.zoomLinks.filter(l => l.id !== zoomModalEditId));
  renderZoomLinks();
  closeModal('zoom-link-modal');
}

// ── Today View Panel Navigation ───────────────────────────────────────────
const PANEL_KEY  = 'ysc-classic-panel';
const PANEL_MAP  = {
  canvas:   '.panel-canvas',
  slack:    '.panel-slack',
  drive:    '.panel-drive',
  calendar: '.panel-calendar',
  grades:   '.panel-grades',
  zoom:     '#panel-zoom',
  // 'chat' is no longer a classic panel — #widget-chat lives in the Home tab
  // (#htv-home). Route chat entry points through window.openChatHome() instead.
};

// Single entry point for "open the AI chat": leave any classic panel, show the
// tab view, land on Home. Used by the sidebar "AI Chat" button, the mobile chat
// float button + drawer item, and the in-app "AI Chatbot" links.
window.openChatHome = function openChatHome() {
  showTodayView();
  if (typeof window.switchToHtvTab === 'function') window.switchToHtvTab('home');
};

let classicActivePanel = localStorage.getItem(PANEL_KEY) || 'canvas';

function setClassicPanel(panelName) {
  if (!PANEL_MAP[panelName]) return;
  classicActivePanel = panelName;
  localStorage.setItem(PANEL_KEY, panelName);

  const panelArea    = document.getElementById('classicPanelArea');
  const tabView      = document.getElementById('hub-tab-view');
  const backBar      = document.getElementById('back-to-today-bar');
  if (panelArea) panelArea.style.display = '';
  if (tabView)   tabView.style.display   = 'none';
  if (backBar)   backBar.style.display   = '';

  document.querySelectorAll('.panel').forEach(p => p.classList.remove('classic-active'));
  document.querySelector(PANEL_MAP[panelName])?.classList.add('classic-active');

  document.querySelectorAll('.classic-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.panel === panelName);
  });
}

function showTodayView() {
  const panelArea = document.getElementById('classicPanelArea');
  const tabView   = document.getElementById('hub-tab-view');
  const backBar   = document.getElementById('back-to-today-bar');
  if (panelArea) panelArea.style.display = 'none';
  if (tabView)   tabView.style.display   = '';
  if (backBar)   backBar.style.display   = 'none';
  document.querySelectorAll('.classic-nav-btn').forEach(btn => btn.classList.remove('active'));
}

// ── Utility ────────────────────────────────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Copy-link event delegation (chat bubbles) ─────────────────────────────
document.addEventListener('click', e => {
  const btn = e.target.closest('.chat-copy-btn');
  if (!btn) return;
  e.preventDefault();
  const url = decodeURIComponent(btn.dataset.url || '');
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    const prev = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = prev; btn.classList.remove('copied'); }, 1500);
  }).catch(() => {});
});

// ── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.refresh-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const actions = {
        refreshCourses:       loadCourses,
        refreshAssignments:   () => state.selectedCourse
                                ? loadCourseDetail(state.selectedCourse.id)
                                : loadAssignments({ fresh: true }),
        refreshAnnouncements: loadAnnouncements,
        refreshChannels:      loadChannels,
        refreshMyFiles:       () => { window.driveLoaded = true; loadMyFiles(); },
        refreshSharedFiles:   () => { window.driveLoaded = true; loadSharedFiles(); },
        refreshGrades:        loadGrades,
      };
      actions[btn.dataset.action]?.();
    });
  });

  // Back to all assignments
  document.getElementById('assignments-back-btn').addEventListener('click', resetCourseView);

  // Focus Mode button delegation (buttons inside AI responses)
  document.getElementById('chat-messages')?.addEventListener('click', e => {
    const btn = e.target.closest('.chat-focus-btn');
    if (!btn) return;
    const assignment = btn.dataset.assignment || '';
    if (window.timerControl) {
      window.timerControl.startCountdown(25 * 60, assignment, { focusMode: true });
    }
    btn.textContent = '⚡ Focus Mode started!';
    btn.disabled = true;
    btn.style.opacity = '.6';
  });

  // Growth tab button delegation (buttons inside AI responses) — separate
  // listener from the Focus Mode one above rather than folding into it,
  // since that one early-returns on a non-matching target. Unlike Focus
  // Mode (which acts in place, inside the chat panel), this needs to leave
  // the chat panel and land on the actual Growth tab, so it reuses
  // showTodayView() (closes the classic panel overlay, same as the real
  // "Back to Today" button) + window.switchToHtvTab('growth') (the same
  // hub-tabs.js navigation already used for the "head to the Growth tab"
  // link in the mentor-unavailable message).
  document.getElementById('chat-messages')?.addEventListener('click', e => {
    const btn = e.target.closest('.chat-growth-btn');
    if (!btn) return;
    showTodayView();
    if (typeof window.switchToHtvTab === 'function') window.switchToHtvTab('growth');
  });

  // Assignment checkbox delegation (buttons inside AI responses) — same
  // completion store as gp_completeTask/gp_uncompleteTask in hub-tabs.js
  // (POST /api/student/game-plan/complete), so toggling here also updates
  // the Home tab's Game Plan checklist, and toggling there is reflected
  // here on the next render via state.gamePlanCompletions.
  document.getElementById('chat-messages')?.addEventListener('click', async e => {
    const btn = e.target.closest('.chat-task-check');
    if (!btn) return;
    const id = btn.dataset.assignmentId;
    if (!id) return;
    const title = btn.dataset.assignmentTitle || '';
    const wasDone = btn.classList.contains('done');
    const completed = !wasDone;
    const dueDate = state.assignments.find(a => String(a.id) === id)?.due_at;

    const paint = (el, isDone) => {
      el.classList.toggle('done', isDone);
      el.setAttribute('aria-pressed', String(isDone));
      el.title = isDone ? 'Mark incomplete' : 'Mark complete';
      el.textContent = isDone ? '✓' : '';
    };
    paint(btn, completed); // optimistic

    try {
      const res = await fetch('/api/student/game-plan/complete', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ assignmentId: id, completed, assignmentTitle: title, dueDate }),
      });
      const data = await res.json();
      if (!data.success) throw new Error('failed');
      if (completed) state.gamePlanCompletions[id] = { completedAt: new Date().toISOString() };
      else delete state.gamePlanCompletions[id];
      // Keep any earlier mention of the same assignment elsewhere in the scrollback in sync.
      document.querySelectorAll(`.chat-task-check[data-assignment-id="${id}"]`).forEach(other => {
        if (other !== btn) paint(other, completed);
      });
      if (typeof window.gp_loadGamePlan === 'function') window.gp_loadGamePlan();
    } catch {
      paint(btn, wasDone); // revert
    }
  });

  initStudyAttachControls();
  initChatImagePasteDrop();

  // Chat send
  document.getElementById('chat-send').addEventListener('click', () => {
    sendChatMessage(document.getElementById('chat-input').value, 'typed');
  });
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage(e.target.value, 'typed');
    }
  });
  document.getElementById('chat-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Calendar nav + event modal
  document.getElementById('cal-prev').addEventListener('click', () => {
    if (state.cal.month === 0) { state.cal.month = 11; state.cal.year--; }
    else state.cal.month--;
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    if (state.cal.month === 11) { state.cal.month = 0; state.cal.year++; }
    else state.cal.month++;
    renderCalendar();
  });
  document.getElementById('event-save-btn').addEventListener('click', saveEvent);
  document.getElementById('event-delete-btn').addEventListener('click', deleteCalEvent);
  document.getElementById('event-cancel-btn').addEventListener('click', () => closeModal('event-modal'));

  // Slack: Find Channels, Add Channel, DMs
  document.getElementById('findChannelsBtn').addEventListener('click', openFindChannels);
  document.getElementById('addChannelBtn').addEventListener('click', () => {
    document.getElementById('add-channel-status').textContent = '';
    document.getElementById('add-channel-status').className = 'modal-status';
    document.getElementById('add-channel-name').value = '';
    openModal('add-channel-modal');
    document.getElementById('add-channel-name').focus();
  });
  document.getElementById('dmBtn').addEventListener('click', loadDMs);

  // Reopen channels mode when clicking refresh while in DM mode
  document.querySelector('[data-action="refreshChannels"]').addEventListener('click', showChannelsMode, { capture: true });

  // Modal close buttons + backdrop click
  document.querySelectorAll('.modal-close-btn').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(overlay.id); });
  });

  // Find channels: live search
  document.getElementById('channel-search-input').addEventListener('input', () => {
    if (allChannelsCache) renderAllChannels(allChannelsCache);
  });

  // Add channel: submit on Enter or button click
  document.getElementById('add-channel-submit').addEventListener('click', submitAddChannel);
  document.getElementById('add-channel-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') submitAddChannel();
  });

  // Slack send
  document.getElementById('slack-send-btn').addEventListener('click', sendSlackMessage);
  document.getElementById('slack-message-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); sendSlackMessage(); }
  });

  // Slack messages — manual refresh button
  document.getElementById('msg-refresh-btn')?.addEventListener('click', async () => {
    if (!state.activeChannel) return;
    const btn = document.getElementById('msg-refresh-btn');
    spin(btn);
    await loadMessages(state.activeChannel);
    unspin(btn);
  });


  // ── Zoom ─────────────────────────────────────────────────────────────────
  state.zoomLinks = loadZoomLinks();
  renderZoomLinks();

  document.getElementById('zoomPanelClose')?.addEventListener('click', () => {
    const fallback = (classicActivePanel === 'zoom' ? 'canvas' : classicActivePanel);
    setClassicPanel(fallback);
  });

  document.getElementById('addSchoolZoomBtn')?.addEventListener('click',   () => openZoomModal(null, 'school'));
  document.getElementById('addPersonalZoomBtn')?.addEventListener('click', () => openZoomModal(null, 'personal'));
  document.getElementById('zoom-save-btn')?.addEventListener('click', saveZoomLink);
  document.getElementById('zoom-modal-delete-btn')?.addEventListener('click', deleteZoomLinkFromModal);
  document.getElementById('zoom-cancel-btn')?.addEventListener('click', () => closeModal('zoom-link-modal'));
  document.getElementById('zoom-link-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') saveZoomLink();
  });
  // ── Back to Today button ──────────────────────────────────────────────────
  // Always lands on Today (one consistent Back target). Previously it restored
  // window._lastHtvTab, but now that Home is a tab and the chat entry points
  // feed _lastHtvTab, "Back to Today" could land on Home — so pin it to Today.
  document.getElementById('back-to-today-btn')?.addEventListener('click', () => {
    showTodayView();
    if (window.switchToHtvTab) window.switchToHtvTab('today');
  });

  // ── Sidebar navigation ────────────────────────────────────────────────────
  document.querySelectorAll('.classic-nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.panel === 'chat') return window.openChatHome();
      setClassicPanel(btn.dataset.panel);
    });
  });

  // Home status-strip mentor chip → open Mentor Chat on the Today tab
  document.getElementById('home-mentor-chip')?.addEventListener('click', () => {
    if (typeof window.openMentorChat === 'function') window.openMentorChat();
  });

  // ── Notification bell ─────────────────────────────────────────────────────
  document.getElementById('notif-bell-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    const dd = document.getElementById('notif-dropdown');
    if (dd) dd.style.display = dd.style.display === 'none' ? '' : 'none';
  });
  document.getElementById('notif-dropdown-close')?.addEventListener('click', () => {
    document.getElementById('notif-dropdown').style.display = 'none';
  });
  document.addEventListener('click', e => {
    const dd   = document.getElementById('notif-dropdown');
    const wrap = document.getElementById('notif-bell-wrap');
    if (dd && wrap && !wrap.contains(e.target)) dd.style.display = 'none';
  });

  // ── Profile menu ──────────────────────────────────────────────────────────
  const profileTrigger  = document.getElementById('profileMenuTrigger');
  const profileDropdown = document.getElementById('profileDropdown');
  profileTrigger?.addEventListener('click', e => {
    e.stopPropagation();
    const open = profileDropdown.style.display !== 'none';
    profileDropdown.style.display = open ? 'none' : 'block';
    profileTrigger.setAttribute('aria-expanded', String(!open));
  });
  document.addEventListener('click', e => {
    if (!document.getElementById('profileMenuWrap')?.contains(e.target)) {
      if (profileDropdown) profileDropdown.style.display = 'none';
    }
  });

  // ── Sign Out confirmation flow ────────────────────────────────────────────
  function showSignOutConfirm() {
    document.getElementById('profileDropdown').style.display = 'none';
    document.getElementById('signout-confirm-overlay').style.display = 'flex';
  }

  async function doSignOut() {
    localStorage.removeItem(NOTIF_KEY);
    try { await fetch('/auth/logout', { method: 'POST' }); } catch {}
    window.location.href = '/login?msg=signedout';
  }

  document.getElementById('profileSignOutBtn')?.addEventListener('click', showSignOutConfirm);
  document.getElementById('mob-signout-btn')?.addEventListener('click', () => {
    // close drawer first, then show confirm
    document.getElementById('mobile-drawer')?.classList.remove('mob-drawer-open');
    document.getElementById('mobile-drawer-overlay')?.classList.remove('mob-drawer-open');
    setTimeout(() => { document.getElementById('mobile-drawer-overlay').style.display = 'none'; }, 260);
    document.body.style.overflow = '';
    showSignOutConfirm();
  });
  document.getElementById('signout-cancel-btn')?.addEventListener('click', () => {
    document.getElementById('signout-confirm-overlay').style.display = 'none';
  });
  document.getElementById('signout-confirm-overlay')?.addEventListener('click', e => {
    if (e.target === e.currentTarget) e.currentTarget.style.display = 'none';
  });
  document.getElementById('signout-do-btn')?.addEventListener('click', doSignOut);

  document.getElementById('topbarSignOutBtn')?.addEventListener('click', showSignOutConfirm);

  // slackConnectProfileBtn: auto-link only resolves a Slack user ID via the bot
  // token — it does not grant a user OAuth token, so a real connect still
  // requires sending the student through /auth/slack.
  // Reconnect Canvas: re-runs the Canvas authorization so this student's token picks up newly enabled permissions
  // (the coach reading Canvas pages/syllabus/modules). Replaces the stored token; nothing is lost.
  document.getElementById('canvasReconnectBtn')?.addEventListener('click', () => { window.location.href = '/auth/canvas'; });
  document.getElementById('slackConnectProfileBtn')?.addEventListener('click', () => {
    window.location.href = '/auth/slack';
  });

  // canvasConnectBtn (Canvas sidebar panel's connect prompt) is wired in
  // initCanvasPanelState() below, since it only exists once the panel's
  // not-connected state is actually rendered.

  // ── Setup wizard buttons ───────────────────────────────────────────────────
  document.getElementById('setupStep1Next')?.addEventListener('click', () => goToSetupStep(3));
  document.getElementById('setupStep2Next')?.addEventListener('click', () => goToSetupStep(3));
  document.getElementById('setupDoneBtn')?.addEventListener('click', closeSetupWizard);
  document.getElementById('setupTourBtn')?.addEventListener('click', () => {
    closeSetupWizard();
    if (typeof window.openHelp === 'function') window.openHelp();
  });

  // Broadcast dismiss is attached dynamically in showBroadcast()

  // ── Outgoing link tracking ────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href]');
    if (!link?.href) return;
    const href = link.href;
    if (href.startsWith('http') && !href.includes('localhost:3000')) {
      trackWebsiteVisit(href, getActivePanel());
    }
  }, true);

  // ── Handle Slack OAuth callback result ────────────────────────────────────
  const _sp = new URLSearchParams(window.location.search);
  const _slackResult = _sp.get('slack');
  if (_slackResult) {
    window.history.replaceState({}, '', '/');
    window._slackJustReturned = true; // maybePromptSlackConnect() skips this load
    if (_slackResult === 'connected') {
      const _slackUser = _sp.get('slackUser') || 'your Slack account';
      showToast(`✓ Signed in to Slack as ${_slackUser}`, 'success');
      setTimeout(async () => {
        await checkSlackAuth();
        // Refresh session user and update profile menu
        const me = await fetch('/api/session/me').then(r => r.json()).catch(() => null);
        if (me?.authenticated) updateProfileSlackStatus(me.services?.slackHasUserToken, me.services?.slackUser);
        // Advance setup wizard to step 3 if it's open
        const step2 = document.getElementById('setup-step-2');
        if (step2?.classList.contains('active')) goToSetupStep(3);
      }, 400);
    } else if (_slackResult === 'denied') {
      showToast('Slack sign-in cancelled.', 'info');
      window._slackDenied = true; // snoozed once the session (and email) is known — see maybePromptSlackConnect()
    } else if (_slackResult === 'error') {
      showToast('Slack sign-in failed. Please try again.', 'error');
    } else if (_slackResult === 'mismatch') {
      // The Slack account signed in on this browser isn't this student's (lib/slack-owner.js) — nothing was linked.
      showToast("That Slack account belongs to someone else. Sign out of Slack in this browser, sign in with your own school account, then try Connect Slack again.", 'error');
    }
  }

  // ── "Add plan to my calendar" from the morning Slack DM ───────────────────
  // The link carries only the date; the server looks the plan up for the signed-in student and returns the usual
  // Confirm card (nothing is added until they confirm). lib/morning-plan.js, routes/morning-message.js.
  const _morningPlan = _sp.get('morningplan');
  if (_morningPlan) {
    window.history.replaceState({}, '', '/');
    setTimeout(async () => {
      if (typeof window.switchToHtvTab === 'function') window.switchToHtvTab('home');
      try {
        const r = await fetch('/api/morning-message/plan/propose', {
          method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: _morningPlan }),
        });
        const body = await r.json().catch(() => ({}));
        if (r.ok && body.card) {
          const bubble = appendBubble('assistant', "Here's today's game plan from your morning message. Untick anything you don't want, then add it to your calendar.");
          appendActionCard(bubble, body.card);
        } else {
          appendBubble('assistant', body.error || "I couldn't load that plan — want me to plan today with you instead?");
        }
      } catch {
        showToast("Couldn't load your plan — check your connection.", 'error');
      }
    }, 1500);
  }

  // ── "Rough day? Make it light" / "Back to normal" from the morning Slack DM ─
  const _lightDay = _sp.get('lightday');
  if (_lightDay === 'on' || _lightDay === 'off') {
    window.history.replaceState({}, '', '/');
    setTimeout(async () => {
      if (typeof window.switchToHtvTab === 'function') window.switchToHtvTab('home');
      try {
        const r = await fetch('/api/light-day/propose', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: _lightDay }) });
        const body = await r.json().catch(() => ({}));
        if (r.ok && body.card) {
          const bubble = appendBubble('assistant', _lightDay === 'on'
            ? "Sorry today's rough. Want to make it a light day? Your plan shrinks to just what's due soonest."
            : "Feeling better? Here's how to go back to your normal plan.");
          appendActionCard(bubble, body.card);
        } else {
          appendBubble('assistant', body.error || "I couldn't set that up — just tell me how you're feeling and we'll adjust.");
        }
      } catch { showToast("Couldn't reach the hub — check your connection.", 'error'); }
    }, 1500);
  }

  // ── "Change this message" link from the morning Slack DM ──────────────────
  if (_sp.get('morning') === 'manage') {
    window.history.replaceState({}, '', '/');
    setTimeout(() => openMorningSettingsModal(), 1500);
  }
  document.getElementById('morningManageBtn')?.addEventListener('click', () => openMorningSettingsModal());

  // ── Handle Canvas OAuth callback result ───────────────────────────────────
  const _canvasResult = _sp.get('canvas');
  if (_canvasResult) {
    window.history.replaceState({}, '', '/');
    if (_canvasResult === 'connected') {
      const _canvasUser = _sp.get('canvasUser') || 'your Canvas account';
      showToast(`✓ Connected to Canvas as ${_canvasUser}`, 'success');
      setTimeout(async () => {
        const me = await fetch('/api/session/me').then(r => r.json()).catch(() => null);
        invalidateCanvasAssignments();   // a brand-new connection: never reuse the not-connected answer
        if (me?.authenticated) initCanvasPanelState(me);
      }, 400);
    } else if (_canvasResult === 'denied') {
      showToast('Canvas connection cancelled.', 'info');
    } else if (_canvasResult === 'error') {
      showToast('Canvas connection failed. Please try again.', 'error');
    }
  }

  // ── Slack nav buttons — clear badge + open pending DM ───────────────────
  const _slackNavBtns = document.querySelectorAll(
    '[data-panel="slack"], .classic-nav-btn[data-panel="slack"], .mob-drawer-item[data-panel="slack"]'
  );
  _slackNavBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      localStorage.setItem(NOTIF_KEY, 'true');
      clearSlackBadge();
      lastKnownDMs = {};
      const pendingDM = window.pendingDMChannelId;
      window.pendingDMChannelId = null;
      if (!pendingDM) return;
      setTimeout(() => { openSlackToChannel(pendingDM); }, 350);
    });
  });

  // ── Session init — replaces localStorage name prompt ─────────────────────
  // Init SlackBadge socket early for Slack notifications (separate from mentor socket).
  if (typeof window.SlackBadge === 'object') window.SlackBadge.init();

  initSession().then(user => {
    if (!user) return; // redirected to /login
    startActivityTracking();
    loadDismissedBroadcasts().then(connectStudentEvents);
    loadGamePlanCompletions();
    checkSlackAuth();
    if (typeof window.SlackNotif === 'object') window.SlackNotif.init(user);
    updateReminderBadge();
    initCanvasPanelState(user);
    // Show setup wizard for first-time logins
    if (user.isFirstLogin) {
      showSetupWizard(user);
    } else {
      maybeShowHomeIntroTip();
    }
    maybePromptSlackConnect(user);
    maybePromptCanvasConnect(user);
    maybePromptCanvasRescope(user);
  });

  // Reveal the page — body starts at opacity:0 to prevent flash of unstyled content
  document.body.classList.add('loaded');

  // ── Load all data at startup ──────────────────────────────────────────────
  // Canvas courses/assignments/announcements load from initCanvasPanelState()
  // once we know whether this student has connected their own Canvas account
  // (see initSession().then(...) below) — not unconditionally here, since
  // loading them before that check would show the not-yet-connected student
  // whatever a stale/absent fetch returns instead of the connect prompt.
  setTimeout(() => initCalendar(), 300);
  // Fallback delegation — fires if renderChannelList hasn't run yet
  const _cl = document.getElementById('channels-list');
  if (_cl && !_cl.dataset.hasListener) {
    _cl.dataset.hasListener = 'true';
    _cl.addEventListener('click', function (e) {
      const item = e.target.closest('.channel-item');
      if (!item) return;
      loadChannelMessages(item.dataset.channelId, item.dataset.channelName);
    });
    console.log('[Slack] Fallback click handler added to #channels-list');
  }
  // Deferred: background panels — load after initial render completes
  setTimeout(() => { loadChannels(); loadGrades(); loadNotifications(); }, 800);
  // Drive: lazy-load only when the panel is first opened (not on every page load)
  document.querySelectorAll('[data-panel="drive"]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!window.driveLoaded) {
        window.driveLoaded = true;
        loadMyFiles();
        loadSharedFiles();
      }
    });
  });

  // ── Canvas sync button ────────────────────────────────────────────────────
  document.getElementById('canvasSyncBtn')?.addEventListener('click', () => syncCanvasToCalendar());

  // ── Auto-sync toggle ──────────────────────────────────────────────────────
  const autoSyncChk = document.getElementById('canvasAutoSync');
  if (autoSyncChk) {
    autoSyncChk.checked = localStorage.getItem(AUTO_SYNC_KEY) === 'true';
    autoSyncChk.addEventListener('change', () => {
      localStorage.setItem(AUTO_SYNC_KEY, autoSyncChk.checked);
      if (autoSyncChk.checked) syncCanvasToCalendar();
    });
    if (autoSyncChk.checked) {
      // Delay auto-sync slightly so initial data loads first
      setTimeout(() => syncCanvasToCalendar(), 1500);
    }
  }
});

// ── Global error handlers — catch uncaught JS errors without crashing the hub ──
window.addEventListener('error', (e) => {
  console.error('Hub JS error:', e.message, e.filename, e.lineno);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error('Unhandled promise rejection:', e.reason);
  e.preventDefault();
});
