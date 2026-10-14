/* YSC Teacher Dashboard */

// Circuit breaker: a 401/403 here normally means "session expired, go log
// in again" -- but if something on the server keeps rejecting an otherwise
// valid session (as happened when /all-today was mounted under the wrong
// auth check), every reload re-triggers the same redirect, forever, with
// no visible error. Cap redirects within a short window and fail loud
// instead of silently looping.
const AUTH_REDIRECT_KEY    = 'ysc_teacher_auth_redirect';
const AUTH_REDIRECT_WINDOW_MS = 15000;
const AUTH_REDIRECT_MAX    = 3;

function handleAuthFailure() {
  const now = Date.now();
  let record;
  try { record = JSON.parse(sessionStorage.getItem(AUTH_REDIRECT_KEY)); } catch { record = null; }
  if (!record || now - record.first > AUTH_REDIRECT_WINDOW_MS) record = { first: now, count: 0 };
  record.count += 1;
  sessionStorage.setItem(AUTH_REDIRECT_KEY, JSON.stringify(record));
  if (record.count > AUTH_REDIRECT_MAX) {
    document.body.innerHTML = `
      <div style="max-width:440px;margin:15vh auto;padding:32px;font-family:system-ui,sans-serif;text-align:center;color:var(--sp-ink)">
        <h2 style="color:#dc2626;margin-bottom:12px">Teacher Hub can't load right now</h2>
        <p>Sign-in keeps failing in a way reloading won't fix. Please contact your hub administrator instead of retrying.</p>
      </div>`;
    return;
  }
  location.href = '/teacher/login';
}

const api = async (path, opts = {}) => {
  const res = await fetch(path, { credentials: 'include', ...opts });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) { handleAuthFailure(); return null; }
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}` + (text ? ': ' + text.slice(0, 120) : ''));
  }
  sessionStorage.removeItem(AUTH_REDIRECT_KEY);
  return res.json();
};

const state = {
  activePanel: 'students',
  students: [],
  checkinLights: {},   // lowercased student email -> light summary from the YSC Check-in app
  checkinLightsAt: 0,  // epoch ms of the last successful sync (0 = never)
  checkinLightsOk: null, // null until first attempt, then true/false
  chatlog: [],
  chatlogFlagged: false,
  websites: [],
  safeguards: {},
  roster: [],
  groups: [],
  broadcastActive: null,
  broadcastType: 'text',
  broadcastTarget: 'all',
  events: null,
};

// ── Quick Fix Library data ────────────────────────────────────────────────────
// QUICK_FIX_LIBRARY removed — library is now stored server-side in data/learned-library.json
// Legacy placeholder to avoid reference errors during transition
const QUICK_FIX_LIBRARY_LEGACY = [
  {
    category: 'General Maintenance (legacy — see Quick Fix Library tab)',
    icon: '🔧',
    items: [
      {
        title: 'Restart server cleanly',
        desc: 'Stop and restart the hub server, checking for startup errors',
        prompt: `Please help me restart the YSC Student Hub server cleanly.\n\n1. Check if the server process is running and stop it gracefully\n2. Check that all required .env variables are set\n3. Run npm install to ensure dependencies are current\n4. Start the server: node server.js\n5. Confirm it responds at http://localhost:3000\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
      {
        title: 'Check all API connections',
        desc: 'Verify Canvas, Slack, Google, and Anthropic integrations are working',
        prompt: `Please check all API connections for the YSC Student Hub.\n\nTest each integration:\n1. Canvas — make a test call using the CANVAS_ACCESS_TOKEN in routes/canvas.js\n2. Slack — verify the SLACK_BOT_TOKEN is valid with correct scopes\n3. Google OAuth — check the configuration in server.js is correct\n4. Anthropic — verify ANTHROPIC_API_KEY works in routes/chat.js\n\nReport: ✅ Working / ❌ Error / ⚠️ Warning for each, and fix any issues found.\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
      {
        title: 'Clear old error log data',
        desc: 'Remove old logged errors to keep the dashboard fast',
        prompt: `Please help me clean up old error log data from the YSC Student Hub.\n\n1. Find where error logs are stored (likely data/errors/ or similar)\n2. Show me a summary of how many entries exist and their date range\n3. Archive or delete entries older than 30 days\n4. Preserve all open/in-progress issues regardless of age\n5. Report how much data was cleaned up\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
    ],
  },
  {
    category: 'Performance',
    icon: '⚡',
    items: [
      {
        title: 'Check for slow API routes',
        desc: 'Find which routes are taking too long and optimize them',
        prompt: `Please investigate performance issues in the YSC Student Hub API routes.\n\n1. Check routes/ folder for routes that make multiple sequential API calls\n2. Look for missing timeouts (calls that might hang indefinitely)\n3. Check routes/canvas.js for server-side filtering opportunities to reduce data\n4. Look for missing caching on frequently-called routes\n5. Suggest and implement specific optimizations\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
      {
        title: 'Optimize Canvas assignment fetching',
        desc: 'Speed up Canvas API calls for students with many assignments',
        prompt: `Please optimize the Canvas assignment fetching in routes/canvas.js.\n\nStudents experience slow load times when Canvas has many assignments.\nPlease:\n1. Review the current Canvas API calls and their parameters\n2. Ensure we're filtering by appropriate date ranges or enrollment status\n3. Add pagination if not already implemented\n4. Consider adding a short server-side cache (5-minute TTL) for assignment lists\n5. Implement the optimization without breaking existing functionality\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
      {
        title: 'Find and fix memory leaks',
        desc: 'Check for interval or event listener leaks that degrade performance',
        prompt: `Please check the YSC Student Hub for memory leaks or performance degradation.\n\n1. Check public/personalization.js and public/teacher/teacher.js for setInterval calls that might accumulate\n2. Look for event listeners added inside functions that run on every render (like renderKnownList)\n3. Check if teacher.js clears intervals when switching panels\n4. Look for large data arrays that grow without bounds\n5. Suggest and implement fixes for any issues found\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
    ],
  },
  {
    category: 'Security',
    icon: '🔒',
    items: [
      {
        title: 'Audit for exposed secrets',
        desc: 'Check that API keys are not in code, logs, or git history',
        prompt: `Please audit the YSC Student Hub for exposed secrets or security issues.\n\n1. Confirm .env is in .gitignore and has never been committed to git\n2. Search all .js files for any hardcoded API keys or tokens\n3. Check that secrets are not logged to console in server output\n4. Verify all API tokens are server-side only (never sent to the browser)\n5. Check the public/ folder for any accidentally exposed sensitive data\n\nDo NOT display actual secret values — just confirm they're secure or flag issues.\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
      {
        title: 'Review OAuth token scopes',
        desc: 'Verify Google and Slack request only the minimum required scopes',
        prompt: `Please review the OAuth token scopes used by the YSC Student Hub.\n\n1. Check server.js for the Google OAuth scope list — verify minimum required scopes\n2. Check the Slack OAuth user_scope parameter — verify minimum required scopes\n3. Confirm the Canvas API token has read-only access where appropriate\n4. Flag any scopes that appear more permissive than necessary\n\nReport any over-privileged scopes and suggest the minimum required set.\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
      {
        title: 'Check session security',
        desc: 'Verify session configuration is secure for school use',
        prompt: `Please review the session security configuration in the YSC Student Hub (server.js).\n\nCheck:\n1. Session secret is set via environment variable (not hardcoded)\n2. Cookie settings: httpOnly: true, secure in production, sameSite: 'lax'\n3. Session expiry is appropriate (currently 30 days)\n4. Session regeneration happens after login to prevent session fixation\n5. No sensitive data is stored in session beyond what's necessary\n\nIdentify any security improvements and implement them.\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
    ],
  },
  {
    category: 'New School Year',
    icon: '🎒',
    items: [
      {
        title: 'Reset all student preferences',
        desc: 'Clear saved prefs for all students so they start fresh',
        prompt: `Please help me reset student preferences for the new school year.\n\n1. List all files in data/prefs/ (one per student)\n2. For each file, clear: layout, panelVisibility, and any theme preferences\n3. Preserve: any preferences that should carry over (e.g., personal settings the student chose)\n4. Do not delete the files — just clear the relevant keys\n5. Report what was reset and for how many students\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
      {
        title: 'Add new students to Google Cloud',
        desc: 'Add new student emails as OAuth test users so they can sign in',
        prompt: `I need to add new students as Google OAuth test users for the new school year.\n\nPlease:\n1. Walk me through the exact steps in Google Cloud Console to add test users\n2. Explain where to find: console.cloud.google.com → APIs & Services → OAuth consent screen → Test users\n3. Let me know the maximum number of test users allowed in Testing mode\n4. Advise if/when we should consider publishing the app to remove the test user limit\n\nNote: This requires changes in Google Cloud Console, not in the code.\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
      {
        title: 'New year readiness check',
        desc: 'Full system check to ensure everything works for new students',
        prompt: `Please do a full new-school-year readiness check for the YSC Student Hub.\n\nVerify each of the following:\n1. Canvas API token is valid and fetches current course assignments\n2. Slack bot token is valid and the bot is in the right channels\n3. Google OAuth redirect URIs are correct for localhost:3000\n4. Anthropic API key has credit and chatbot responds\n5. SESSION_SECRET is set and secure (not default value)\n6. Check npm dependencies for known security advisories\n7. Error logs from last year have been archived or cleared\n8. All student prefs from last year have been reset\n\nReport each as ✅ Ready / ❌ Needs attention, and fix what you can automatically.\n\nWorking directory: ~/Desktop/ysc-student-hub`,
      },
    ],
  },
];

const TEACHER_NOTIF_DEFAULTS = { loginSound: true, messageSound: true, volume: 0.25, weeklyDigest: true };

// ── Sidebar section config ────────────────────────────────────────────────────
const SIDEBAR_SECTIONS = {
  students: { panels: ['students', 'chatlog', 'broadcast', 'huddles', 'roster', 'websites'] },
  messages: { panels: ['mentor-inbox'], badgeId: 'sidebar-badge-messages' },
  goals:    { panels: ['student-goals'] },
  data:     { panels: ['analytics', 'prompts', 'chatbot-data', 'chat-feedback'] },
  settings: { panels: ['people', 'office-hours', 'zoom', 'notifications', 'quicklinks'] },
};

// Icon classes match the sidebar buttons in index.html exactly (ti-users,
// ti-message-dots, etc.) — reused here, not restyled, so the section header
// visually reads as "this is what that sidebar icon means" rather than a
// separately-designed label.
const SECTION_META = {
  students: { icon: 'ti-users',         label: 'Students' },
  messages: { icon: 'ti-message-dots',  label: 'Messages' },
  goals:    { icon: 'ti-target',        label: 'Goals' },
  data:     { icon: 'ti-chart-bar',     label: 'Data' },
  settings: { icon: 'ti-settings',      label: 'Settings' },
};

const PANEL_LABELS = {
  'students':       'Student Monitor',
  'chatlog':        'Chat Log',
  'broadcast':      'Broadcast',
  'huddles':        'Meetings',
  'roster':         'Class Roster',
  'websites':       'Website Tracker',
  'mentor-inbox':   'Mentor Inbox',
  'student-goals':  'Student Goals',
  'analytics':      'Analytics',
  'prompts':        'Prompt Inventory',
  'chatbot-data':   'Chatbot Data',
  'chat-feedback':  'Chatbot Feedback',
  'people':         'Support Team',
  'zoom':           'Zoom Links',
  'notifications':  'Notifications',
  'quicklinks':     'Quick Links',
  'office-hours':   'Office Hours',
};

// ── Panel switching ───────────────────────────────────────────────────────────
function switchPanel(name) {
  state.activePanel = name;
  // Keep hidden tabbar in sync for any legacy selectors
  document.querySelectorAll('.nav-btn, .th-tab').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  // Update sub-nav active tab
  document.querySelectorAll('.th-subnav-tab').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  const panelEl = document.getElementById(`panel-${name}`);
  if (panelEl) panelEl.style.display = '';
  loadPanel(name);
  // Student Monitor only: keep the check-in light dots self-refreshing.
  if (name === 'students') startCheckinLightsRefresh();
  else stopCheckinLightsRefresh();
}

let _dataRefreshInterval = null;

function startDataRefresh() {
  if (_dataRefreshInterval) return;
  _dataRefreshInterval = setInterval(() => {
    const activePanel = state.activePanel;
    if (activePanel === 'analytics') loadAnalytics();
    else if (activePanel === 'chatbot-data') loadChatbotSummary();
  }, 30000);
  console.log('[Data] Auto-refresh started — 30s interval');
}

function stopDataRefresh() {
  if (_dataRefreshInterval) {
    clearInterval(_dataRefreshInterval);
    _dataRefreshInterval = null;
    console.log('[Data] Auto-refresh stopped');
  }
}

// ── Check-in lights auto-refresh (Student Monitor only) ──────────────────────
// Dedicated 30s poll for loadCheckinLights(), plus an immediate pull on entry.
// startPolling()'s 15s loop already refreshes the dots via loadStudents() while
// this panel is open; this is the belt-and-suspenders path that also survives a
// change to that loop. Runs only while the Student Monitor panel is the visible
// panel AND the tab is in the foreground; stopped otherwise (see switchPanel and
// the visibilitychange handler in DOMContentLoaded). Fire-and-forget:
// loadCheckinLights() swallows its own errors and never blocks the grid render;
// the server proxy caps upstream calls at one per 20s regardless of caller.
let _checkinLightsInterval = null;

function startCheckinLightsRefresh() {
  if (_checkinLightsInterval) return;
  if (document.visibilityState !== 'visible') return;
  if (state.activePanel !== 'students') return;
  // Pull once right away so re-entering the panel (or foregrounding the tab
  // after a while) shows current dots without waiting a full interval.
  loadCheckinLights();
  _checkinLightsInterval = setInterval(loadCheckinLights, 30000);
}

function stopCheckinLightsRefresh() {
  if (!_checkinLightsInterval) return;
  clearInterval(_checkinLightsInterval);
  _checkinLightsInterval = null;
}

async function refreshAllDataStatus(evt) {
  // NOTE: uses api(), not a raw fetch() — api() routes an expired/invalid
  // session (401/403) through handleAuthFailure() -> redirect to login,
  // same as every other data call in this file. The old raw fetch() here
  // silently no-op'd on an expired session with zero visible feedback,
  // which is exactly what looked like "refresh does nothing."
  const btn = evt?.target || document.querySelector('.data-status-bar button');
  const originalLabel = btn ? btn.textContent : null;
  if (btn) { btn.disabled = true; btn.textContent = '↻ Refreshing…'; }
  try {
    const json = await api('/api/admin/health');
    if (!json) return; // api() already redirected to login on auth failure
    const d = json.data || {};
    const chatbotEl  = document.getElementById('data-status-chatbot');
    const activityEl = document.getElementById('data-status-activity');
    const updatedEl  = document.getElementById('data-status-updated');
    if (chatbotEl)  chatbotEl.textContent  = `Chatbot: ${d.totalChatbotMessages ?? '—'} msgs · ${d.chatbotConversations ?? '—'} students`;
    if (activityEl) activityEl.textContent = `Activity: ${d.activityLogDays ?? '—'} days · ${d.activitySummaryEntries ?? '—'} users`;
    if (updatedEl)  updatedEl.textContent  = `Last updated: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (err) {
    console.warn('[Data] refreshAllDataStatus error:', err.message);
    const updatedEl = document.getElementById('data-status-updated');
    if (updatedEl) updatedEl.textContent = 'Last updated: refresh failed — try again';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

// Keeps the slim "you are here" bar above the sub-nav in sync with the
// active sidebar section — pure display update, no effect on SIDEBAR_SECTIONS
// or panel-switching behavior.
function updateSectionHeader(sectionName) {
  const meta = SECTION_META[sectionName];
  if (!meta) return;
  const header = document.getElementById('th-section-header');
  if (!header) return;
  const icon = header.querySelector('i');
  if (icon) icon.className = `ti ${meta.icon}`;
  const label = document.getElementById('th-section-header-label');
  if (label) label.textContent = meta.label;
}

function switchSection(sectionName) {
  state.activeSection = sectionName;
  document.querySelectorAll('.th-sidebar-btn').forEach(b => b.classList.toggle('active', b.dataset.section === sectionName));
  updateSectionHeader(sectionName);
  const section = SIDEBAR_SECTIONS[sectionName];
  if (!section) return;
  // Rebuild sub-nav for this section
  const subnav = document.getElementById('th-subnav');
  if (subnav) {
    subnav.innerHTML = section.panels.map(panel => {
      const labelBadge = _getSubnavBadge(panel);
      return `<button class="th-subnav-tab" data-panel="${panel}">${PANEL_LABELS[panel] || panel}${labelBadge}</button>`;
    }).join('');
    subnav.querySelectorAll('.th-subnav-tab').forEach(btn => {
      btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
    });
  }
  if (sectionName === 'data') {
    startDataRefresh();
    refreshAllDataStatus();
  } else {
    stopDataRefresh();
  }
  switchPanel(section.panels[0]);
}

function _getSubnavBadge(panel) {
  if (panel === 'office-hours') return _ohPending > 0 ? ` <span class="nav-badge">${_ohPending}</span>` : '';
  let el = null;
  if (panel === 'mentor-inbox')   el = document.getElementById('mentor-inbox-nav-badge');
  if (!el || el.style.display === 'none') return '';
  const n = el.textContent.trim();
  return n && n !== '0' ? ` <span class="nav-badge">${n}</span>` : '';
}

// Keeps the small inline badge next to a sub-nav tab's own label (e.g.
// "Mentor Inbox [1]") in sync with live badge-source changes. Without this,
// _getSubnavBadge() only ever gets re-evaluated inside switchSection()'s
// one-time subnav.innerHTML rebuild — a message marked read (or a new one
// arriving) while the teacher is already sitting on that section left the
// tab's own badge stuck at whatever it showed when the section was last
// entered, even though the underlying unread count was already correct.
// Only touches each tab's badge span, not the button itself, so the
// switchPanel() click listener already attached to the button survives.
function _refreshLiveSubnavBadges() {
  document.querySelectorAll('.th-subnav-tab[data-panel]').forEach(btn => {
    const panel = btn.dataset.panel;
    const existing = btn.querySelector('.nav-badge');
    if (existing) existing.remove();
    const badgeHTML = _getSubnavBadge(panel);
    if (badgeHTML) btn.insertAdjacentHTML('beforeend', badgeHTML);
  });
}

// Office-hour requests waiting for THIS teacher's answer (Phase 2c) — on the Settings sidebar button and the
// Office Hours sub-nav tab, so a request isn't missed when the Slack DM is. Polled every 2 minutes while visible.
let _ohPending = 0;
async function refreshOfficeHoursBadge() {
  try {
    const res = await fetch('/api/teacher/office-hours/pending-count', { credentials: 'include' });
    if (!res.ok) return;
    _ohPending = Number((await res.json()).pending) || 0;
  } catch { return; }
  const b = document.getElementById('sidebar-badge-settings');
  if (b) { b.textContent = _ohPending; b.style.display = _ohPending > 0 ? '' : 'none'; }
  const tab = document.querySelector('.th-subnav-tab[data-panel="office-hours"]');
  if (tab) {
    tab.querySelector('.nav-badge')?.remove();
    if (_ohPending > 0) tab.insertAdjacentHTML('beforeend', ` <span class="nav-badge">${_ohPending}</span>`);
  }
}
setInterval(() => { if (document.visibilityState === 'visible') refreshOfficeHoursBadge(); }, 120000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshOfficeHoursBadge(); });

function updateSidebarBadges() {
  // Messages section: mentor-inbox unread count
  const miEl  = document.getElementById('mentor-inbox-nav-badge');
  const msgTotal = miEl?.style.display !== 'none' ? (parseInt(miEl?.textContent) || 0) : 0;
  const msgBadge = document.getElementById('sidebar-badge-messages');
  if (msgBadge) {
    if (msgTotal > 0) { msgBadge.textContent = msgTotal; msgBadge.style.display = ''; }
    else { msgBadge.style.display = 'none'; }
  }
}

function loadPanel(name) {
  if (name === 'students') loadStudents();
  else if (name === 'chatlog') loadChatlog();
  else if (name === 'broadcast') loadBroadcast();
  else if (name === 'huddles') { loadHuddlesPanel(); checkZoomConnection(); }
  else if (name === 'roster') loadRoster();
  else if (name === 'websites') loadWebsites();
  else if (name === 'prompts') loadPromptInventory();
  else if (name === 'analytics') loadAnalytics();
  else if (name === 'mentor-inbox') Promise.resolve(window.loadMentorInboxHistory?.()).then(() => window.markMentorInboxSeen?.());
  else if (name === 'people') loadPeoplePanel();
  else if (name === 'zoom')         loadZoomPanel();
  else if (name === 'notifications') loadNotificationsPanel();
  else if (name === 'quicklinks')    loadQuicklinksPanel();
  else if (name === 'office-hours')  loadOfficeHoursPanel();
  else if (name === 'chatbot-data')  loadChatbotSummary();
  else if (name === 'chat-feedback') loadChatFeedback();
  else if (name === 'student-goals') loadAllStudentGoals();
}

// ── Students ──────────────────────────────────────────────────────────────────
async function loadStudents() {
  const students = await api('/api/teacher/students');
  if (!students) return;
  state.students = students;

  const count  = students.length;
  const active = students.filter(s => s.status === 'active').length;
  document.getElementById('student-count').textContent = `${count} students · ${active} active`;

  // Expose for checkUnreadMessages — only students this teacher can actually
  // message. Fetching conversation history for non-assigned students would
  // both 403 (server now enforces this) and pull message content into the
  // browser for a student this teacher isn't the mentor for.
  window.currentAssignments = students
    .filter(s => s.email && s.canMessage)
    .map(s => ({ studentEmail: s.email, studentName: s.studentName }));

  renderStudentCards();
  // Layer the check-in light dots in a beat later — this call goes through a
  // proxy to a separate app and must never hold up the Student Monitor render.
  loadCheckinLights();
}

// Check-in light dots, fed by the standalone YSC Check-in app via
// GET /api/teacher/checkin-lights (a requireTeacher-gated server proxy). That
// endpoint returns [] on any misconfig/upstream failure, so this is
// best-effort: on anything unexpected we just leave the dots off and the
// Student Monitor is otherwise unaffected.
async function loadCheckinLights() {
  let raw;
  try {
    raw = await api('/api/teacher/checkin-lights');
  } catch (err) {
    // Non-2xx other than 401/403 (api() throws these).
    console.warn('[checkin-lights] fetch failed:', err.message);
    raw = undefined;
  }
  // A healthy response is ALWAYS the upstream object { date, mentor, mentees:[...] }.
  //   - undefined  -> api() threw (5xx / network)
  //   - null       -> api() hit 401/403 (and is already redirecting to login)
  //   - bare []    -> the server proxy's misconfig / upstream-failure fallback
  // None of those are a real sync — mark the status unavailable and KEEP the
  // last-known dots rather than blanking the grid on a transient blip.
  const ok = raw && !Array.isArray(raw) && Array.isArray(raw.mentees);
  if (!ok) {
    state.checkinLightsOk = false;
    renderClFreshness();
    return;
  }
  const byEmail = {};
  for (const c of raw.mentees) {
    if (c && c.email) byEmail[String(c.email).toLowerCase()] = c;
  }
  state.checkinLights = byEmail;
  state.checkinLightsAt = Date.now();
  state.checkinLightsOk = true;
  renderStudentCards();
  renderClFreshness();
}

// "Check-in status updated 12s ago" line under the Student Monitor title.
// The dots come from a ~30s poll through a proxy to a separate app (not the
// 5s presence poll), so the cadence is made visible rather than implied.
function renderClFreshness() {
  const el = document.getElementById('cl-updated');
  if (!el) return;
  if (state.checkinLightsOk === false) { el.textContent = 'sync unavailable — retrying'; return; }
  if (!state.checkinLightsAt)          { el.textContent = 'syncing…'; return; }
  const secs = Math.round((Date.now() - state.checkinLightsAt) / 1000);
  el.textContent = secs < 10 ? 'updated just now'
    : secs < 90 ? `updated ${secs}s ago`
    : `updated ${Math.round(secs / 60)}m ago`;
}
// Keep the relative time honest between polls.
setInterval(renderClFreshness, 10000);

function renderStudentCard(s) {
  const email      = s.email || '';
  const name       = s.studentName || s.name || email;
  const cardId     = cardIdFor(email);
  const safeName   = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  // canMessage is assignment-based (server-enforced too) — only the ability to
  // open Mentor Chat is gated. Defaults true when the server didn't send it
  // (e.g. cached shape) so this never silently blocks messaging that was
  // previously allowed.
  const canMessage = s.canMessage !== false;

  return `
    <div class="student-card" id="${cardId}" data-email="${esc(email)}" data-student="${esc(name)}"
         onclick="openStudentConvo('${esc(email)}', '${safeName}', ${canMessage})">
      <div class="sc-name" title="${esc(name)}">${esc(name)}</div>
      <div class="sc-status-row">
        ${checkinLightHTML(email)}
        <div class="sc-presence-dot offline" id="dot-${cardId}"></div>
        <span class="sc-presence-label offline" id="label-${cardId}">Offline</span>
      </div>
      <div class="sc-tag-row">
        ${canMessage
          ? `<span class="sc-msg-tag" id="msgtag-${cardId}" style="display:none;" data-count="0">0 msg</span>`
          : `<span class="sc-tag" style="background:transparent;color:var(--sp-muted);border:0.5px solid var(--sp-ink);">Not your mentee</span>`}
      </div>
      ${canMessage && window._pulseEnabled ? `
      <div class="sc-actions-row">
        <button type="button" class="sc-pulse-btn" title="Open Student Pulse"
                onclick="event.stopPropagation(); openStudentPulse('${esc(email)}', '${safeName}')">
          <i class="ti ti-activity" aria-hidden="true"></i> Pulse
        </button>
      </div>` : ''}
    </div>
  `;
}

function renderStudentCards() {
  const wrap = document.getElementById('students-table');
  if (!wrap) return;
  const students = state.students || [];

  const searchQ      = (document.getElementById('sc-search-input')?.value || '').toLowerCase().trim();
  const activeFilter = document.querySelector('.sc-filter-btn.active')?.dataset.filter || 'all';

  let filtered = students;
  if (searchQ) {
    filtered = filtered.filter(s => (s.studentName || '').toLowerCase().includes(searchQ));
  }
  if (activeFilter === 'messages') {
    filtered = filtered.filter(s => {
      const cardId = cardIdFor(s.email);
      const msgTag = document.getElementById('msgtag-' + cardId);
      return msgTag && parseInt(msgTag.dataset.count || '0') > 0;
    });
  }

  if (!filtered.length) {
    wrap.innerHTML = `<div class="empty-state">${students.length ? 'No students match this filter.' : 'No students connected yet.<br>Students will appear here when they open the hub.'}</div>`;
    return;
  }

  const cards = filtered.map(s => renderStudentCard(s)).join('');

  wrap.innerHTML = `<div class="sc-grid">${cards}</div>`;

  // Restore online indicators that arrived before this render
  const online = window._onlineStudentEmails;
  if (online?.size > 0) {
    online.forEach(email => _applyOnlineToCard(email));
  }

  fitStudentCardNames();
}

// ── Student card name fitting ───────────────────────────────────────────────
// .sc-name wraps normally between words (never mid-word — see teacher.css).
// That alone is enough for multi-word names. The one case it can't solve on
// its own is a SINGLE word/token too wide for the card at the base font size
// (e.g. "Featherstonehaugh-Abernathy") — normal wrapping has nowhere to
// break, so the word would just overflow the card. This measures the
// longest token in each name against the card's real current width (which
// varies with the responsive .sc-grid column count) and, only when needed,
// shrinks the font in small steps before finally falling back to a
// single-line ellipsis truncation with the full name already set as the
// title attribute (renderStudentCard sets that on every card, not just the
// truncated ones, so hover always works).
const SC_NAME_FONT_STEPS = [16, 15, 14, 13, 12];
let _scNameMeasureCanvas = null;

function _scLongestTokenWidth(tokens, fontSizePx, fontFamily, fontWeight) {
  if (!_scNameMeasureCanvas) _scNameMeasureCanvas = document.createElement('canvas');
  const ctx = _scNameMeasureCanvas.getContext('2d');
  ctx.font = `${fontWeight} ${fontSizePx}px ${fontFamily}`;
  let max = 0;
  for (const t of tokens) {
    const w = ctx.measureText(t).width;
    if (w > max) max = w;
  }
  return max;
}

function fitSingleStudentName(el) {
  const fullName = el.getAttribute('title') || el.textContent || '';
  const tokens = fullName.split(/\s+/).filter(Boolean);
  el.style.fontSize = '';
  el.classList.remove('sc-name-ellipsis');
  if (!tokens.length) return;

  const containerWidth = el.clientWidth;
  if (!containerWidth) return; // not laid out yet (e.g. hidden panel)

  const cs = getComputedStyle(el);
  for (const size of SC_NAME_FONT_STEPS) {
    if (_scLongestTokenWidth(tokens, size, cs.fontFamily, cs.fontWeight) <= containerWidth) {
      if (size !== SC_NAME_FONT_STEPS[0]) el.style.fontSize = size + 'px';
      return;
    }
  }
  // Even the smallest step can't fit the longest token — last resort.
  el.style.fontSize = SC_NAME_FONT_STEPS[SC_NAME_FONT_STEPS.length - 1] + 'px';
  el.classList.add('sc-name-ellipsis');
}

function fitStudentCardNames() {
  document.querySelectorAll('#students-table .sc-name').forEach(fitSingleStudentName);
}

// The grid is responsive (repeat(auto-fill, minmax(200px, 1fr))), so a
// window resize can change each card's actual width without any re-render —
// re-measure on resize, debounced since resize fires continuously.
let _scNameResizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_scNameResizeTimer);
  _scNameResizeTimer = setTimeout(fitStudentCardNames, 150);
});

function _applyOnlineToCard(email) {
  const cardId = cardIdFor(email);
  const dot    = document.getElementById('dot-' + cardId);
  const label  = document.getElementById('label-' + cardId);
  const card   = document.getElementById(cardId);
  if (dot)   { dot.className   = 'sc-presence-dot online'; }
  if (label) { label.textContent = 'Active'; label.className = 'sc-presence-label online'; }
  if (card)  card.classList.add('active-now');
}

function _applyOfflineToCard(email) {
  const cardId = cardIdFor(email);
  const dot    = document.getElementById('dot-' + cardId);
  const label  = document.getElementById('label-' + cardId);
  const card   = document.getElementById(cardId);
  if (dot)   { dot.className   = 'sc-presence-dot offline'; }
  if (label) { label.textContent = 'Offline'; label.className = 'sc-presence-label offline'; }
  if (card)  card.classList.remove('active-now');
}

function updateStudentCardUnread(studentEmail) {
  const cardId = cardIdFor(studentEmail);
  const card   = document.getElementById(cardId);
  const msgTag = document.getElementById('msgtag-' + cardId);
  if (!card || !msgTag) return;
  const currentCount = parseInt(msgTag.dataset.count || '0') + 1;
  msgTag.dataset.count  = currentCount;
  msgTag.textContent    = currentCount + ' msg';
  msgTag.style.display  = 'inline-block';
  card.classList.add('has-message');
}

async function checkActiveStudents() {
  try {
    const res  = await fetch('/api/teacher/active-students', { credentials: 'include' });
    const data = await res.json();
    (data.activeEmails || []).forEach(email => {
      window._onlineStudentEmails?.add(email);
      _applyOnlineToCard(email);
    });
  } catch (err) {
    console.warn('[checkActiveStudents] error:', err.message);
  }
}

async function checkUnreadMessages() {
  try {
    const assignments = window.currentAssignments || [];
    for (const a of assignments) {
      if (!a.studentEmail) continue;
      const res  = await fetch('/api/mentor/conversation/' + encodeURIComponent(a.studentEmail), { credentials: 'include' });
      const data = await res.json();
      const msgs = data.messages || [];
      const studentMsgs = msgs.filter(m => m.role === 'student');
      if (!studentMsgs.length) continue;
      const cardId = cardIdFor(a.studentEmail);
      const msgTag = document.getElementById('msgtag-' + cardId);
      const card   = document.getElementById(cardId);
      if (msgTag) {
        msgTag.textContent   = studentMsgs.length + ' msg';
        msgTag.style.display = 'inline-block';
        msgTag.dataset.count = studentMsgs.length;
      }
      if (card) card.classList.add('has-message');
    }
  } catch (err) {
    console.warn('[checkUnreadMessages] error:', err.message);
  }
}

async function loadMyStudents() {
  await loadStudents();
  await checkActiveStudents();
  await checkUnreadMessages();
}

async function openStudentConvo(studentEmail, studentName, canMessage = true) {
  const panel     = document.getElementById('convo-panel');
  const titleEl   = document.getElementById('convo-title');
  const thread    = document.getElementById('convo-thread');
  const inputArea = document.querySelector('.convo-input-area');
  if (!panel || !thread) { console.error('[Convo] panel elements not found'); return; }

  panel.dataset.activeStudent     = studentEmail || '';
  panel.dataset.studentName       = studentName  || '';
  panel.dataset.activeStudentName = studentName  || '';
  if (titleEl) titleEl.textContent = `// Conversation with ${studentName || studentEmail || 'Student'}`;
  panel.style.display = 'flex';
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  loadStudentWeeklyLoad(studentEmail, studentName);
  loadStudentStudyPlan(studentEmail, studentName);

  // Mentor-Chat-specific empty state — you can see this student's general card,
  // but messaging (including reading past messages) is assigned-mentor-only.
  // The server enforces this too (GET/POST /api/mentor/*), this just avoids an
  // unnecessary round-trip and shows a clear, honest reason instead of a blank
  // or confusing thread.
  if (!canMessage) {
    if (inputArea) inputArea.style.display = 'none';
    thread.innerHTML = '<div style="padding:14px;font-family:var(--sp-font-body);font-size:14px;color:var(--sp-muted);text-align:center;">You\'re not the assigned mentor for this student — contact an admin to be assigned before messaging them.</div>';
    return;
  }
  if (inputArea) inputArea.style.display = '';

  try {
    localStorage.setItem('lastActiveStudentEmail', studentEmail || '');
    localStorage.setItem('lastActiveStudentName',  studentName  || '');
  } catch {}

  // Clear card unread badge
  const cardId = cardIdFor(studentEmail);
  const msgTag = document.getElementById('msgtag-' + cardId);
  const card   = document.getElementById(cardId);
  if (msgTag) { msgTag.textContent = '0 msg'; msgTag.style.display = 'none'; msgTag.dataset.count = '0'; }
  if (card)   card.classList.remove('has-message');
  if (window._teacherMsgMap?.[studentName]) delete window._teacherMsgMap[studentName];

  thread.innerHTML = '<div style="padding:14px;font-family:var(--sp-font-body);font-size:14px;color:var(--sp-muted);">Loading conversation…</div>';

  try {
    const res  = await fetch('/api/mentor/conversation/' + encodeURIComponent(studentEmail), { credentials: 'include' });
    const data = await res.json();
    const msgs = data.messages || [];

    if (!msgs.length) {
      thread.innerHTML = '<div style="color:var(--sp-muted);font-family:var(--sp-font-label);font-size:12px;text-align:center;padding:28px 0;letter-spacing:0.06em">No message history yet</div>';
    } else {
      thread.innerHTML = '';
      msgs.forEach(msg => appendMessage(msg));
    }
    thread.scrollTop = thread.scrollHeight;
    console.log('[Convo] Loaded', msgs.length, 'messages for:', studentEmail);
  } catch (err) {
    thread.innerHTML = '<div style="padding:14px;font-family:var(--sp-font-body);font-size:14px;color:var(--sp-muted);">Could not load conversation. Try again.</div>';
    console.error('[Convo] load error:', err.message);
  }

  document.getElementById('convo-input')?.focus();
}

// Phase 1c (docs/act-and-pace-plan.md): study blocks the mentee planned with the coach. Mentor-only route
// (/api/teacher/student-study-plan). Counts and times only — the hub can't tell whether a block was actually studied.
// Phase 2c — the mentee's office-hour requests/bookings with their teachers (times in Eastern).
function ohRows(list) {
  if (!Array.isArray(list) || !list.length) return '';
  const label = 'font-family:var(--sp-font-label);font-size:10px;color:var(--sp-muted);letter-spacing:0.08em;';
  const st = { requested: 'waiting for the teacher', accepted: 'accepted', declined: 'declined', expired: 'no answer in time' };
  return `<div style="${label}margin:10px 0 4px;">// office hours</div>` + list.slice(0, 6).map(b =>
    `<div style="font-family:var(--sp-font-body);font-size:13px;color:var(--sp-ink);padding:3px 0;">` +
      `<span style="color:var(--sp-muted);">${escHtml(b.when)}</span> · ${escHtml(b.teacherName)} — ${escHtml(st[b.status] || b.status)}` +
      `${b.topic ? `<div style="color:var(--sp-muted);font-size:12px;">“${escHtml(b.topic)}”</div>` : ''}</div>`).join('');
}

async function loadStudentStudyPlan(studentEmail, studentName) {
  const el = document.getElementById('student-study-plan');
  if (!el) return;
  el.innerHTML = '';
  try {
    const res = await fetch('/api/teacher/student-study-plan/' + encodeURIComponent(studentEmail), { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json();
    const blocks = Array.isArray(data.blocks) ? data.blocks : [];
    const upcoming = blocks.filter(b => b.date >= data.today);
    const pastCount = blocks.length - upcoming.length;
    const fmt = t => { if (!/^\d\d:\d\d$/.test(t || '')) return ''; let [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return `${h}:${String(m).padStart(2, '0')} ${ap}`; };
    const day = d => new Date(d + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
    const label = 'font-family:var(--sp-font-label);font-size:10px;color:var(--sp-muted);letter-spacing:0.08em;';
    const rows = upcoming.slice(0, 8).map(b =>
      `<div style="display:flex;gap:8px;font-family:var(--sp-font-body);font-size:13px;color:var(--sp-ink);padding:3px 0;">` +
        `<span style="white-space:nowrap;color:var(--sp-muted);">${escHtml(day(b.date))} ${escHtml(fmt(b.start))}${b.end ? '–' + escHtml(fmt(b.end)) : ''}${b.tzLabel && b.tzLabel !== 'ET' ? ' ' + escHtml(b.tzLabel) : ''}</span>` +
        `<span>${escHtml(b.focus)}${b.slackReminder ? ' <span title="Slack reminder on">🔔</span>' : ''}</span></div>`).join('');
    const empty = `<div style="font-family:var(--sp-font-body);font-size:13px;color:var(--sp-muted);">No study blocks coming up.</div>`;
    el.innerHTML = `<div style="padding:10px 16px 10px;">` +
      `<div style="${label}margin-bottom:6px;">// ${escHtml(studentName || studentEmail)} study plan</div>` +
      (upcoming.length ? rows : empty) +
      (upcoming.length > 8 ? `<div style="${label}margin-top:4px;">+${upcoming.length - 8} more</div>` : '') +
      `<div style="${label}margin-top:6px;">${pastCount} block${pastCount === 1 ? '' : 's'} planned in the last 7 days</div>` +
      ohRows(data.officeHours) +
      `</div>`;
  } catch (err) {
    el.innerHTML = '';
    console.error('[StudyPlan] error:', err.message);
  }
}

async function loadStudentWeeklyLoad(studentEmail, studentName) {
  const container = document.getElementById('student-weekly-load');
  if (!container) return;
  container.innerHTML = '<div style="padding:10px 16px;font-family:var(--sp-font-label);font-size:11px;color:var(--sp-muted);letter-spacing:0.06em">Loading weekly load…</div>';
  try {
    const res = await fetch('/api/teacher/student-weekly-load/' + encodeURIComponent(studentEmail), { credentials: 'include' });
    if (!res.ok) { container.innerHTML = ''; return; }
    const data = await res.json();
    if (data.canvasConnected === false) {
      container.innerHTML = `<div style="padding:10px 16px;font-family:var(--sp-font-label);font-size:11px;color:var(--sp-muted);letter-spacing:0.06em">${escHtml(studentName || 'This student')} hasn't connected their Canvas account yet.</div>`;
      return;
    }
    const days = data.weeklyLoad || [];
    if (!days.length) { container.innerHTML = ''; return; }

    const maxTotal = Math.max(...days.map(d => d.total), 1);

    let barsHtml = '';
    days.forEach(d => {
      const pctDone     = Math.round((d.completed / maxTotal) * 100);
      const pctPending  = d.isConflict
        ? Math.round((d.pending  / maxTotal) * 100)
        : Math.round((d.pending  / maxTotal) * 100);
      const totalPct    = Math.round((d.total    / maxTotal) * 100);
      const barH        = Math.max(totalPct, 4);

      let segHtml = '';
      if (d.total === 0) {
        segHtml = `<div style="flex:1;height:${barH}px;box-sizing:border-box;background:var(--sp-tint);border:2px solid var(--sp-ink);border-radius:2px 2px 0 0;"></div>`;
      } else if (d.isConflict) {
        segHtml = `<div style="display:flex;flex-direction:column;flex:1;height:${barH}px;border-radius:2px 2px 0 0;overflow:hidden;">` +
          (d.completed ? `<div style="flex:${d.completed};background:var(--sp-online);"></div>` : '') +
          `<div style="flex:${d.pending};background:var(--sp-coral);"></div>` +
          `</div>`;
      } else if (d.isToday) {
        segHtml = `<div style="display:flex;flex-direction:column;flex:1;height:${barH}px;border-radius:2px 2px 0 0;overflow:hidden;">` +
          (d.completed ? `<div style="flex:${d.completed};background:var(--sp-online);"></div>` : '') +
          `<div style="flex:${d.pending};background:var(--sp-blue);"></div>` +
          `</div>`;
      } else {
        segHtml = `<div style="display:flex;flex-direction:column;flex:1;height:${barH}px;border-radius:2px 2px 0 0;overflow:hidden;">` +
          (d.completed ? `<div style="flex:${d.completed};background:var(--sp-online);"></div>` : '') +
          `<div style="flex:${d.pending};background:var(--sp-muted);"></div>` +
          `</div>`;
      }

      barsHtml += `<div style="display:flex;flex-direction:column;align-items:center;flex:1;gap:3px;">` +
        `<div style="font-family:var(--sp-font-label);font-size:9px;color:var(--sp-muted);">${d.total > 0 ? d.total : ''}</div>` +
        `<div style="display:flex;flex-direction:column;width:100%;height:48px;justify-content:flex-end;">${segHtml}</div>` +
        `<div style="font-family:var(--sp-font-label);font-size:9px;color:${d.isToday ? 'var(--sp-blue)' : 'var(--sp-muted)'};letter-spacing:0.04em;">${d.day}</div>` +
        `</div>`;
    });

    container.innerHTML =
      `<div style="padding:10px 16px 8px;">` +
        `<div style="font-family:var(--sp-font-label);font-size:10px;color:var(--sp-muted);letter-spacing:0.08em;margin-bottom:8px;">// ${studentName || studentEmail} weekly load</div>` +
        `<div style="display:flex;align-items:flex-end;gap:4px;height:64px;">${barsHtml}</div>` +
        `<div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;">` +
          `<div style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--sp-blue);"></div><span style="font-family:var(--sp-font-label);font-size:9px;color:var(--sp-muted);">Today</span></div>` +
          `<div style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--sp-muted);"></div><span style="font-family:var(--sp-font-label);font-size:9px;color:var(--sp-muted);">Upcoming</span></div>` +
          `<div style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--sp-coral);"></div><span style="font-family:var(--sp-font-label);font-size:9px;color:var(--sp-muted);">Travel</span></div>` +
          `<div style="display:flex;align-items:center;gap:4px;"><div style="width:8px;height:8px;border-radius:50%;background:var(--sp-online);"></div><span style="font-family:var(--sp-font-label);font-size:9px;color:var(--sp-muted);">Done</span></div>` +
        `</div>` +
      `</div>`;
  } catch (err) {
    container.innerHTML = '';
    console.error('[WeeklyLoad] error:', err.message);
  }
}

// ── Student Pulse ────────────────────────────────────────────────────────────
// Mentor-only gauge panel. Phase 1 (Load): panel shell, no cutoffs yet — see
// lib/student-pulse-gauges.js on the server for why that gauge's level is
// always null right now. Phase 2 (Academics, added here): a real level from
// day one, since those rules were already fully approved. Check-in (Phase 3)
// joins this panel later with its own render function, same reusable
// renderPulseGaugeCard() shape the two gauges below already share.

// LOCKED FORMAT — deliberate, must stay identical across every Pulse gauge:
// three zones, left to right, blue = good, yellow = OK, red/coral = mentor
// should reach out. The needle always points at the zone matching the
// level (index 0/1/2 into these same arrays). Load/Academics/Check-in each
// have their own level-decision logic (what counts as "good" vs "mentor
// should reach out" differs per source), but they all render through this
// one shared zone shape — do not give any gauge its own reversed order or
// its own color set, even if a new gauge's "natural" reading seems to want
// one (this is exactly the mistake Check-in's own direction had until
// 2026-10, fixed specifically so this rule could be locked here).
const PULSE_ZONE_LABELS = {
  load: ['Light', 'Full', 'Overloaded'],
  academics: ['Strong', 'Steady', 'Needs a look'],
  checkin: ['Doing well', 'Could use support', 'Asked for their mentor'],
};
const PULSE_ZONE_COLORS = ['#BFC4FF', 'var(--sp-yellow)', 'var(--sp-coral)'];

// Builds an SVG arc `d` attribute for a stroke-band segment between two
// angles (standard math convention: 0°=right, 90°=up; converted to SVG's
// y-down coordinate space here). Used for all three gauge zones — a small
// shared helper rather than hand-writing each path's coordinates.
function _pulseArcPath(cx, cy, r, startAngle, endAngle) {
  const toXY = deg => {
    const rad = deg * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
  };
  const start = toXY(startAngle);
  const end   = toXY(endAngle);
  const largeArc = Math.abs(startAngle - endAngle) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

// Compact semicircle gauge, ~130px wide. zoneColors/zoneLabels go low-to-high
// concern, left-to-right on the arc. level: null (no cutoffs/no reading yet —
// zones render at reduced strength, no needle) or 0|1|2 (index into the 3
// zones — full-strength zones + a needle pointing into the matching one).
// zoneLabels are never drawn as text around the arc (that's what clipped/
// collided before) — they're only attached as native SVG <title> tooltips.
function renderPulseGaugeSvg(level, zoneColors, zoneLabels) {
  const cx = 65, cy = 64, r = 46, band = 16;
  const outerR = r + band / 2, innerR = r - band / 2;
  const zoneAngles = [[180, 120], [120, 60], [60, 0]];
  const zoneMidAngle = [150, 90, 30];
  const dimmed = level === null || level === undefined;

  // Thin ink rim lines (outer + inner edge only, not a filled band) frame the
  // whole shape without sitting *behind* the colored zones. A filled ink band
  // there used to make the "reduced strength" dimmed zones (opacity < 1)
  // blend against near-black ink instead of the white card background,
  // reading as muddy/dark instead of faded — the zones now paint directly
  // on the card's own white background, so dimming actually fades to white.
  const outlineSvg = [outerR, innerR].map(rr =>
    `<path d="${_pulseArcPath(cx, cy, rr, 180, 0)}" fill="none"
      stroke="var(--sp-ink)" stroke-width="2" stroke-linecap="butt"></path>`
  ).join('');

  const zonesSvg = zoneAngles.map(([a, b], i) => {
    const color = zoneColors[i] || 'var(--sp-tint)';
    const label = (zoneLabels || [])[i];
    return `<path d="${_pulseArcPath(cx, cy, r, a, b)}" fill="none"
      stroke="${color}" stroke-width="${band}" stroke-linecap="butt"
      opacity="${dimmed ? 0.35 : 1}">${label ? `<title>${esc(label)}</title>` : ''}</path>`;
  }).join('');

  // Thin ink dividers at both ends and the two internal zone boundaries, so
  // the three zones read as distinct segments even when none is "lit."
  const dividersSvg = [180, 120, 60, 0].map(a => {
    const rad = a * Math.PI / 180;
    const x1 = cx + innerR * Math.cos(rad), y1 = cy - innerR * Math.sin(rad);
    const x2 = cx + outerR * Math.cos(rad), y2 = cy - outerR * Math.sin(rad);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--sp-ink)" stroke-width="2"></line>`;
  }).join('');

  let needleSvg = '';
  if (!dimmed) {
    const rad = zoneMidAngle[level] * Math.PI / 180;
    const nx = cx + (r - 2) * Math.cos(rad);
    const ny = cy - (r - 2) * Math.sin(rad);
    needleSvg = `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="var(--sp-ink)" stroke-width="3" stroke-linecap="round"></line>`;
  }

  // Hub always shows, lit or not — a small yellow disc with an ink border.
  const hubSvg = `<circle cx="${cx}" cy="${cy}" r="7" fill="var(--sp-yellow)" stroke="var(--sp-ink)" stroke-width="2"></circle>`;

  // Zones paint first (so their opacity blends against the card's white
  // background, not against ink), then the thin rim lines on top — full
  // opacity regardless of dim state, so the outline reads crisp either way.
  return `<svg viewBox="0 0 130 80" class="pulse-gauge-svg">${zonesSvg}${outlineSvg}${dividersSvg}${needleSvg}${hubSvg}</svg>`;
}

// Single reusable gauge-card renderer — Load and Academics both call this
// exact same function (Check-in will be the third), each only supplying its
// own title/level/zoneColors/zoneLabels/facts/source. subtitle is optional —
// Load uses it for "Schoolwork only" so a mentor knows sport/travel aren't
// counted yet; most gauges won't need one.
// strip: [{weekStart, level, levelLabel}] oldest-to-newest, 6 entries, gaps
// (no snapshot that week) rendered as an empty outlined dot — Phase 4.
// trend: {direction:'up'|'down'|'same', label} vs. last week, or null.
function renderPulseGaugeCard({ icon, title, subtitle, level, levelLabel, zoneColors, zoneLabels, facts, source, note, strip, trend }) {
  const svg = renderPulseGaugeSvg(level, zoneColors, zoneLabels);
  const hasLevel = level !== null && level !== undefined;
  const levelMarkup = hasLevel
    ? `<div class="pulse-level-text">${esc(levelLabel)}</div>`
    : `<span class="pulse-level-pill pulse-level-pending">${esc(levelLabel || 'No data yet')}</span>`;

  const trendMarkup = trend
    ? `<div class="pulse-trend">${trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'} ${esc(trend.label)}</div>`
    : '';

  const stripDots = (strip || []).map(w => {
    if (w.level === null || w.level === undefined) {
      return `<span class="pulse-strip-dot pulse-strip-dot-empty" title="${esc(fmtPulseWeekStart(w.weekStart))}: no data"></span>`;
    }
    return `<span class="pulse-strip-dot" style="background:${zoneColors[w.level] || '#ccc'}" title="${esc(fmtPulseWeekStart(w.weekStart))}: ${esc(w.levelLabel)}"></span>`;
  }).join('');
  const stripMarkup = stripDots ? `<div class="pulse-strip">${stripDots}</div>` : '';

  return `
    <div class="pulse-gauge-card">
      <div class="pulse-gauge-visual">${svg}</div>
      <div class="pulse-gauge-body">
        <div class="pulse-gauge-title"><i class="ti ti-${esc(icon)}" aria-hidden="true"></i> ${esc(title)}${subtitle ? `<span class="pulse-gauge-subtitle">${esc(subtitle)}</span>` : ''}</div>
        ${levelMarkup}
        ${trendMarkup}
        <div class="pulse-facts">${(facts || []).join('')}</div>
        ${note ? `<div class="pulse-note">${esc(note)}</div>` : ''}
        ${stripMarkup}
        <div class="pulse-source">Source: ${esc(source)}</div>
      </div>
    </div>`;
}

// Every fact line goes through this one helper so the text always wraps
// inside the card — the icon is a fixed-width sibling and the text itself
// is wrapped in its own span with min-width:0 (see .pulse-fact-text in
// teacher.css). A bare text node next to a flex-shrink:0 icon, with no
// wrapping span, keeps its own default min-width:auto and overflows the
// card's right edge instead of wrapping — confirmed live on the Check-in
// card, which has the longest fact lines of the three gauges.
function pulseFact(icon, html) {
  return `<div class="pulse-fact"><i class="ti ti-${icon}" aria-hidden="true"></i><span class="pulse-fact-text">${html}</span></div>`;
}

function renderPulseLoadCard(gauge, strip, trend) {
  const f = gauge.facts || {};

  const factLines = [];
  if (f.canvasConnected && !f.canvasError) {
    factLines.push(pulseFact('clipboard-list', `${f.dueCount ?? '—'} assignment${f.dueCount === 1 ? '' : 's'} due this week`));
    if (f.busiestDay) {
      factLines.push(pulseFact('calendar-event', `${f.busiestDay.count} due ${esc(f.busiestDay.weekdayName)}`));
    }
    // Sport/travel facts only when PULSE_INCLUDE_SPORT=true — see
    // lib/student-pulse-gauges.js. Off by default, so these are null and
    // simply never added.
    if (f.includeSport) {
      factLines.push(pulseFact('run', `${f.sessions ?? '—'} training session${f.sessions === 1 ? '' : 's'} this week`));
      factLines.push(pulseFact('plane', `${f.travelDays ?? '—'} travel day${f.travelDays === 1 ? '' : 's'} this week`));
    }
    // Travel from the Check-in app's own answers — a separate source from
    // the (currently off) team-schedule travelDays above. Only shown when
    // Check-in was actually reachable; otherwise the subtitle says so
    // instead of showing a fact built on nothing.
    if (f.checkinAvailableForTravel) {
      factLines.push(pulseFact('plane', `Travelling ${f.travelDaysFromCheckin} day${f.travelDaysFromCheckin === 1 ? '' : 's'} this week (from check-in)`));
    }
  }

  // Only blame check-in specifically when Canvas IS connected but check-in
  // isn't — if Canvas itself is disconnected, the card's level already
  // says so via the pill; the travel question never even got asked (see
  // computeLoadFacts, which skips the check-in fetch entirely in that
  // case), so claiming "check-in unavailable" there would misattribute it.
  const subtitle = !f.canvasConnected
    ? 'Schoolwork only'
    : f.checkinAvailableForTravel
      ? 'Schoolwork + travel'
      : 'Schoolwork only — check-in unavailable';

  return renderPulseGaugeCard({
    icon: 'gauge',
    title: 'Load',
    subtitle,
    level: gauge.level,
    levelLabel: gauge.levelLabel || 'Canvas not connected',
    zoneColors: PULSE_ZONE_COLORS,
    zoneLabels: PULSE_ZONE_LABELS.load,
    facts: factLines,
    source: f.canvasError ? 'Canvas unavailable' : f.canvasConnected ? 'From Canvas' : 'Canvas not connected',
    note: [gauge.partialNote, (f.includeSport && !f.hasTeamSchedule) ? 'No team schedule on file for this student.' : null].filter(Boolean).join(' ') || null,
    strip, trend,
  });
}

function renderPulseAcademicsCard(gauge, strip, trend) {
  const f = gauge.facts || {};

  const factLines = (f.canvasConnected && !f.canvasError) ? [
    pulseFact('alert-triangle', `${f.missingTotal ?? '—'} assignment${f.missingTotal === 1 ? '' : 's'} missing right now`),
    pulseFact('calendar-plus', `${f.missingNewThisWeek ?? '—'} new this week`),
    pulseFact('clock-exclamation', `${f.lateThisWeek ?? '—'} late submission${f.lateThisWeek === 1 ? '' : 's'} this week`),
  ] : [];

  let note = null;
  if (f.canvasConnected && !f.canvasError) {
    if (gauge.droppedCourse) note = `${gauge.droppedCourse}'s letter grade dropped since last week.`;
    else if (gauge.gradeTrendPending) note = 'Grade trend starts next week.';
  }
  if (gauge.partialNote) note = note ? `${note} ${gauge.partialNote}` : gauge.partialNote;

  return renderPulseGaugeCard({
    icon: 'book',
    title: 'Academics',
    level: gauge.level,
    levelLabel: gauge.levelLabel || 'Canvas not connected',
    zoneColors: PULSE_ZONE_COLORS,
    zoneLabels: PULSE_ZONE_LABELS.academics,
    facts: factLines,
    source: f.canvasError ? 'Canvas unavailable' : f.canvasConnected ? 'Canvas' : 'Canvas not connected',
    note,
    strip, trend,
  });
}

const PULSE_LIGHT_LABEL = { green: 'Green', yellow: 'Yellow', red: 'Red' };

function renderPulseCheckinCard(gauge, strip, trend) {
  const f = gauge.facts || {};
  const factLines = [];

  if (f.available) {
    factLines.push(pulseFact('checklist', `Checked in ${f.checkedInCount ?? '—'} of ${f.totalEligible ?? '—'} days`));
    if (f.unavailableCount > 0) {
      factLines.push(pulseFact('plane-departure', `Not able to do school ${f.unavailableCount} day${f.unavailableCount === 1 ? '' : 's'} this week`));
    }

    // Collapsed per the approved fix: a single-color window gets ONE fact;
    // a mixed window gets the real frequency+breakdown, and the streak only
    // when it's not just restating that same dominant color.
    if (f.allSame) {
      factLines.push(pulseFact('chart-bar', `${esc(PULSE_LIGHT_LABEL[f.allSame.color] || f.allSame.color)} every day for ${f.allSame.weeks} week${f.allSame.weeks === 1 ? '' : 's'} (${f.allSame.count} check-in${f.allSame.count === 1 ? '' : 's'})`));
    } else if (f.frequency) {
      factLines.push(pulseFact('chart-bar', `Checked in ${f.frequency.checkedInCount} of the last ${f.frequency.totalSchoolDays} school days · green ${f.frequency.green}, yellow ${f.frequency.yellow}, red ${f.frequency.red}`));
      if (f.streak) {
        factLines.push(pulseFact('flame', `${esc(PULSE_LIGHT_LABEL[f.streak.color] || f.streak.color)} ${f.streak.count} days running`));
      }
    }

    if (f.sameAnswerWeeks) {
      factLines.push(pulseFact('repeat', `Same answer for ${f.sameAnswerWeeks} weeks`));
    }
    for (const lf of (f.learningFacts || [])) {
      factLines.push(pulseFact('school', esc(lf.text)));
    }
    if (f.topAttention) {
      factLines.push(pulseFact('target-arrow', `Most picked focus this week: ${esc(f.topAttention)}`));
    }
    if (f.topHelpful) {
      factLines.push(pulseFact('hand-stop', `Most picked way to help: ${esc(f.topHelpful)}`));
    }
    if (f.noteCount > 0) {
      factLines.push(pulseFact('note', `Left you a note ${f.noteCount} time${f.noteCount === 1 ? '' : 's'} this week`));
    }
    if (f.sharedWin) {
      factLines.push(pulseFact('trophy', 'Shared a win'));
    }
  }

  return renderPulseGaugeCard({
    icon: 'message-circle',
    title: 'Check-in',
    level: gauge.level,
    levelLabel: gauge.levelLabel || 'Check-in data unavailable',
    zoneColors: PULSE_ZONE_COLORS,
    zoneLabels: PULSE_ZONE_LABELS.checkin,
    facts: factLines,
    source: f.available ? 'From YSC Check-in' : 'Check-in data unavailable',
    note: null,
    strip, trend,
  });
}

function fmtPulseAsOf(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// weekStart is a plain "YYYY-MM-DD" NY-local date string (see nyWeekStart() on
// the server) — anchored at noon UTC before formatting so the day never shifts
// under a local timezone conversion, same convention used elsewhere in this app.
function fmtPulseWeekStart(ymd) {
  if (!ymd) return '';
  const d = new Date(ymd + 'T12:00:00Z');
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function renderPulseGaugeLoading(title, icon) {
  return `
    <div class="pulse-gauge-card">
      <div class="pulse-gauge-visual"></div>
      <div class="pulse-gauge-body">
        <div class="pulse-gauge-title"><i class="ti ti-${esc(icon)}" aria-hidden="true"></i> ${esc(title)}</div>
        <span class="pulse-level-pill pulse-level-pending">Loading…</span>
      </div>
    </div>`;
}

// The three gauges are fetched from three separate endpoints, in parallel,
// each rendered into its own slot the moment IT resolves — not awaited
// together. The old single combined endpoint awaited Load, then Academics,
// then Check-in sequentially inside one handler, so the panel's total wait
// was the SUM of three independently slow network calls (10-15s); this is
// the MAX of whichever is slowest, and the other two appear immediately.
async function openStudentPulse(studentEmail, studentName) {
  const modal   = document.getElementById('pulse-modal');
  const titleEl = document.getElementById('pulse-modal-title');
  const bodyEl  = document.getElementById('pulse-modal-body');
  if (!modal || !bodyEl) return;

  titleEl.textContent = `Student Pulse — ${studentName || studentEmail}`;
  bodyEl.innerHTML = `
    <div class="pulse-asof" id="pulse-asof-line">Loading…</div>
    <div id="pulse-pattern-callout"></div>
    <div class="pulse-gauges-row">
      <div id="pulse-card-academics">${renderPulseGaugeLoading('Academics', 'book')}</div>
      <div id="pulse-card-checkin">${renderPulseGaugeLoading('Check-in', 'message-circle')}</div>
      <div id="pulse-card-load">${renderPulseGaugeLoading('Load', 'gauge')}</div>
    </div>
  `;
  modal.style.display = 'flex';

  let headerSet = false;
  const setHeader = (data) => {
    if (headerSet) return;
    headerSet = true;
    const asOfLine = document.getElementById('pulse-asof-line');
    if (asOfLine) asOfLine.textContent = `As of ${fmtPulseAsOf(data.asOf)} · Week of ${fmtPulseWeekStart(data.weekStart)}`;
  };

  // First gauge response to carry a real pattern callout wins — all three
  // compute the identical cross-gauge check from the same stored history
  // (see pulseWeekExtras() server-side), so it doesn't matter which one
  // resolves first.
  let calloutSet = false;
  const setPatternCallout = (data) => {
    if (calloutSet || !data.patternCallout) return;
    calloutSet = true;
    const slot = document.getElementById('pulse-pattern-callout');
    if (slot) slot.innerHTML = `<div class="pulse-pattern-callout"><i class="ti ti-trending-up" aria-hidden="true"></i> ${esc(data.patternCallout)}</div>`;
  };

  const loadOne = async (gaugeName, slotId, renderFn) => {
    const slot = document.getElementById(slotId);
    try {
      const res = await fetch(`/api/teacher/student-pulse/${encodeURIComponent(studentEmail)}/${gaugeName}`, { credentials: 'include' });
      if (res.status === 403) {
        if (slot) slot.innerHTML = '<div class="empty-state">Not authorized.</div>';
        return;
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      setHeader(data);
      setPatternCallout(data);
      if (slot) slot.innerHTML = renderFn(data.gauge, data.strip, data.trend);
    } catch (err) {
      console.error(`[StudentPulse] ${gaugeName} load error:`, err.message);
      if (slot) slot.innerHTML = `<div class="pulse-gauge-card"><div class="empty-state">Could not load ${esc(gaugeName)}.</div></div>`;
    }
  };

  // Deliberately not awaited here — fire-and-forget so all three run
  // concurrently instead of one gating the next.
  loadOne('academics', 'pulse-card-academics', renderPulseAcademicsCard);
  loadOne('checkin', 'pulse-card-checkin', renderPulseCheckinCard);
  loadOne('load', 'pulse-card-load', renderPulseLoadCard);
}
window.openStudentPulse = openStudentPulse;

function closeStudentPulse() {
  const modal = document.getElementById('pulse-modal');
  if (modal) modal.style.display = 'none';
}
window.closeStudentPulse = closeStudentPulse;

// ── Pulse overview — all of a mentor's mentees at a glance ──────────────────
// Opens instantly from already-stored snapshots (the server route does no
// Canvas/Check-in calls at all), then refreshes every mentee's three gauges
// in the background, a few at a time, by calling the exact same per-gauge
// routes the individual Pulse panel uses — no separate "refresh" endpoint.
const PULSE_OVERVIEW_GAUGES = ['academics', 'checkin', 'load'];
const PULSE_OVERVIEW_GAUGE_META = {
  academics: { title: 'Academics', icon: 'book' },
  checkin:   { title: 'Check-in',  icon: 'message-circle' },
  load:      { title: 'Load',      icon: 'gauge' },
};

let _pulseOverviewOpen = false;
let _pulseOverviewGen = 0; // bumped on every open/close so a stale background refresh can't write into a closed/reopened panel

// A null level mixes two genuinely different things: "the source answered
// with a real, known, honest empty state" (Check-in reached the student,
// who simply had no check-ins this week; Canvas/Load and Academics have no
// such empty-but-known state of their own, but DO share "Canvas not
// connected") vs. "we have nothing to go on at all" (never computed yet, or
// the source itself couldn't be reached). The former gets its own neutral-
// colored ring segment per gauge; the latter stays the plain "No data" count
// for all three — mirrors the exact same split made server-side in
// routes/teacher.js's pulseOverviewBucketFor().
const PULSE_OVERVIEW_EXTRA_BUCKET = {
  academics: { key: 'canvasNotConnected', matchLabel: 'Canvas not connected', displayLabel: 'Canvas not connected' },
  load:      { key: 'canvasNotConnected', matchLabel: 'Canvas not connected', displayLabel: 'Canvas not connected' },
  checkin:   { key: 'noCheckin',          matchLabel: 'No check-in',          displayLabel: 'No check-in this week' },
};
const PULSE_OVERVIEW_NEUTRAL_COLOR = '#C7CCD6';

function pulseOverviewBucketFor(gaugeName, g) {
  if (!g || g.level === null || g.level === undefined) {
    const extra = PULSE_OVERVIEW_EXTRA_BUCKET[gaugeName];
    if (extra && g?.levelLabel === extra.matchLabel) return extra.key;
    return 'noData';
  }
  return g.level;
}

// Clockwise-from-top arc path for the ring SVGs (a pie/donut convention,
// distinct from the gauge semicircle's left-to-right convention above).
function _pulseRingArcPath(cx, cy, r, startDeg, endDeg) {
  const toXY = deg => {
    const rad = (deg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const start = toXY(startDeg);
  // Clamp just short of a full 360° sweep — an SVG arc whose start and end
  // points coincide (a genuine 100%-one-color ring) renders as nothing at
  // all, a well-known degenerate case for circular arcs specifically.
  const end = toXY(Math.min(endDeg, startDeg + 359.9));
  const largeArc = (endDeg - startDeg) > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function renderPulseOverviewRing(gaugeName, counts) {
  const meta = PULSE_OVERVIEW_GAUGE_META[gaugeName];
  const labels = PULSE_ZONE_LABELS[gaugeName];
  const extra = PULSE_OVERVIEW_EXTRA_BUCKET[gaugeName];
  const extraCount = counts[extra.key] || 0;
  // The extra bucket (a real, known, honest empty state) is part of the
  // ring's own proportions, same as any level — only "No data" (genuinely
  // nothing to go on) stays outside the ring entirely, per the approved fix.
  const total = (counts[0] || 0) + (counts[1] || 0) + (counts[2] || 0) + extraCount;
  const cx = 50, cy = 50, r = 38, band = 16;
  const segments = [
    [0, PULSE_ZONE_COLORS[0], labels[0]],
    [1, PULSE_ZONE_COLORS[1], labels[1]],
    [2, PULSE_ZONE_COLORS[2], labels[2]],
    [extra.key, PULSE_OVERVIEW_NEUTRAL_COLOR, extra.displayLabel],
  ];

  let ringSvg;
  if (!total) {
    ringSvg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--sp-tint)" stroke-width="${band}"></circle>`;
  } else {
    let angle = 0;
    ringSvg = segments.map(([key, color, label]) => {
      const count = counts[key] || 0;
      if (!count) return '';
      const sweep = (count / total) * 360;
      const path = _pulseRingArcPath(cx, cy, r, angle, angle + sweep);
      angle += sweep;
      return `<path d="${path}" fill="none" stroke="${color}" stroke-width="${band}" stroke-linecap="butt"><title>${esc(label)}: ${count}</title></path>`;
    }).join('');
  }

  // Labelled, never color alone — a text legend under every ring naming
  // each level (and the extra bucket) with its own count, same label set
  // the individual gauge card for this source already uses.
  const legend = segments.map(([key, color, label]) =>
    `<div class="pulse-ring-legend-row"><span class="pulse-ring-dot" style="background:${color}"></span>${esc(label)}: ${counts[key] || 0}</div>`
  ).join('');

  return `
    <div class="pulse-ring-card">
      <div class="pulse-ring-title"><i class="ti ti-${esc(meta.icon)}" aria-hidden="true"></i> ${esc(meta.title)}</div>
      <svg viewBox="0 0 100 100" class="pulse-ring-svg">${ringSvg}</svg>
      <div class="pulse-ring-legend">${legend}
        <div class="pulse-ring-legend-row pulse-ring-legend-nodata">No data: ${counts.noData || 0}</div>
      </div>
    </div>`;
}

function pulseOverviewPill(gaugeName, g) {
  if (!g || g.level === null || g.level === undefined) {
    return `<span class="pulse-overview-pill pulse-overview-pill-nodata">${esc(g?.levelLabel || 'No data yet')}</span>`;
  }
  const arrow = g.trend?.direction === 'up' ? '↑' : g.trend?.direction === 'down' ? '↓' : g.trend?.direction === 'same' ? '→' : '';
  const color = PULSE_ZONE_COLORS[g.level] || '#ccc';
  return `<span class="pulse-overview-pill" style="background:${color}">${esc(g.levelLabel)}${arrow ? ` ${arrow}` : ''}</span>`;
}

function renderPulseOverviewRow(mentee) {
  return `
    <div class="pulse-overview-row" onclick="openStudentPulse('${esc(mentee.studentEmail)}', '${esc(mentee.studentName)}')">
      <div class="pulse-overview-row-name" title="${esc(mentee.studentName)}">${esc(mentee.studentName)}</div>
      <div class="pulse-overview-row-pills">
        ${PULSE_OVERVIEW_GAUGES.map(g => pulseOverviewPill(g, mentee[g])).join('')}
      </div>
    </div>`;
}

function renderPulseOverviewBody(data) {
  const ringsHtml = PULSE_OVERVIEW_GAUGES.map(g => renderPulseOverviewRing(g, data.rings[g])).join('');
  const rowsHtml = data.mentees.length
    ? data.mentees.map(renderPulseOverviewRow).join('')
    : '<div class="empty-state">No mentees assigned yet.</div>';
  return `
    <div class="pulse-asof" id="pulse-overview-asof">As of ${esc(fmtPulseAsOf(data.asOf))} · Week of ${esc(fmtPulseWeekStart(data.weekStart))}<span id="pulse-overview-refreshing"></span></div>
    <div class="pulse-overview-rings-row">${ringsHtml}</div>
    <div class="pulse-overview-list" id="pulse-overview-list">${rowsHtml}</div>
  `;
}

async function refreshOneMenteeGauges(studentEmail) {
  const results = await Promise.allSettled(PULSE_OVERVIEW_GAUGES.map(g =>
    fetch(`/api/teacher/student-pulse/${encodeURIComponent(studentEmail)}/${g}`, { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
  ));
  const updates = {};
  PULSE_OVERVIEW_GAUGES.forEach((g, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value) {
      updates[g] = { level: r.value.gauge.level, levelLabel: r.value.gauge.levelLabel, trend: r.value.trend };
    }
  });
  return updates;
}

// Batches of 4 mentees at a time, refreshing all three gauges per mentee in
// parallel within a batch — the same "a few at a time" shape this app
// already uses for the weekly digest/snapshot checkers, just client-side
// here since this is driven by a teacher having the panel open, not a
// background job. Stops immediately if the panel was closed (or reopened,
// bumping the generation) since the last render.
async function runPulseOverviewRefresh(data, generation) {
  const BATCH = 4;
  const refreshingEl = () => document.getElementById('pulse-overview-refreshing');
  if (refreshingEl()) refreshingEl().textContent = ' · refreshing…';

  for (let i = 0; i < data.mentees.length; i += BATCH) {
    if (generation !== _pulseOverviewGen) return; // panel closed/reopened — abandon
    const batch = data.mentees.slice(i, i + BATCH);
    await Promise.all(batch.map(async mentee => {
      const updates = await refreshOneMenteeGauges(mentee.studentEmail);
      let worsened = false, anyConcern = false;
      for (const g of PULSE_OVERVIEW_GAUGES) {
        if (!updates[g]) { // keep whatever this mentee already had
          if (mentee[g]?.trend?.direction === 'up') worsened = true;
          if (mentee[g]?.level === 2) anyConcern = true;
          continue;
        }
        const newLevel = updates[g].level;
        const oldBucket = pulseOverviewBucketFor(g, mentee[g]);
        const newBucket = pulseOverviewBucketFor(g, updates[g]);
        if (oldBucket !== newBucket) {
          data.rings[g][oldBucket] = (data.rings[g][oldBucket] || 0) - 1;
          data.rings[g][newBucket] = (data.rings[g][newBucket] || 0) + 1;
        }
        mentee[g] = updates[g];
        if (updates[g].trend?.direction === 'up') worsened = true;
        if (newLevel === 2) anyConcern = true;
      }
      mentee.sortRank = worsened ? 0 : anyConcern ? 1 : 2;
    }));

    if (generation !== _pulseOverviewGen) return;
    // Re-sort now that this batch's trends/levels are current, then redraw.
    data.mentees.sort((a, b) => a.sortRank - b.sortRank || a.studentName.localeCompare(b.studentName));
    const bodyEl = document.getElementById('pulse-overview-modal-body');
    if (bodyEl) bodyEl.innerHTML = renderPulseOverviewBody(data);
  }

  if (generation === _pulseOverviewGen && refreshingEl()) {
    const asOfLine = document.getElementById('pulse-overview-asof');
    if (asOfLine) asOfLine.innerHTML = `Updated just now · Week of ${esc(fmtPulseWeekStart(data.weekStart))}`;
  }
}

async function openPulseOverview() {
  const modal = document.getElementById('pulse-overview-modal');
  const bodyEl = document.getElementById('pulse-overview-modal-body');
  if (!modal || !bodyEl) return;

  _pulseOverviewOpen = true;
  const generation = ++_pulseOverviewGen;
  bodyEl.innerHTML = '<div class="loading">Loading…</div>';
  modal.style.display = 'flex';

  try {
    const res = await fetch('/api/teacher/student-pulse-overview', { credentials: 'include' });
    if (res.status === 403) {
      bodyEl.innerHTML = '<div class="empty-state">Pulse is not enabled for your account.</div>';
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (generation !== _pulseOverviewGen) return; // closed while loading
    bodyEl.innerHTML = renderPulseOverviewBody(data);
    runPulseOverviewRefresh(data, generation);
  } catch (err) {
    console.error('[PulseOverview] load error:', err.message);
    bodyEl.innerHTML = `<div class="empty-state">Could not load Pulse overview — ${esc(err.message)}</div>`;
  }
}
window.openPulseOverview = openPulseOverview;

function closePulseOverview() {
  _pulseOverviewOpen = false;
  _pulseOverviewGen++; // abandon any in-flight background refresh
  const modal = document.getElementById('pulse-overview-modal');
  if (modal) modal.style.display = 'none';
}
window.closePulseOverview = closePulseOverview;

// Alias for legacy call-sites
function openConvoPanel(studentEmail, studentName) {
  return openStudentConvo(studentEmail, studentName);
}

function appendMessage(msg) {
  const thread = document.getElementById('convo-thread');
  if (!thread) return;

  // Dedup by message id
  if (msg.id && thread.querySelector(`[data-msg-id="${CSS.escape(msg.id)}"]`)) return;

  // Remove "no history" placeholder
  if (thread.children.length === 1 && thread.firstElementChild?.style?.color === 'rgb(85, 85, 85)') {
    thread.innerHTML = '';
  }

  // Day divider
  const msgDate         = msg.date || (msg.timestamp ? msg.timestamp.split('T')[0] : new Date().toISOString().split('T')[0]);
  const lastDivider     = thread.querySelector('.th-day-divider:last-of-type');
  const lastDividerDate = lastDivider?.dataset?.date;
  if (msgDate !== lastDividerDate) {
    const today     = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let label;
    if (msgDate === today)          label = 'Today';
    else if (msgDate === yesterday) label = 'Yesterday';
    else                            label = new Date(msgDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const divider = document.createElement('div');
    divider.className    = 'th-day-divider';
    divider.dataset.date = msgDate;
    divider.style.cssText = 'display:flex;align-items:center;gap:10px;padding:14px 0 10px;flex-shrink:0;';
    divider.innerHTML =
      `<div style="flex:1;height:0.5px;background:var(--sp-ink);"></div>` +
      `<span style="font-family:var(--sp-font-label);font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--sp-muted);white-space:nowrap;flex-shrink:0;padding:3px 10px;background:var(--sp-ink);border:0.5px solid var(--sp-ink);">${escHtml(label)}</span>` +
      `<div style="flex:1;height:0.5px;background:var(--sp-ink);"></div>`;
    thread.appendChild(divider);
  }

  const isStudent = msg.role === 'student';
  const div = document.createElement('div');
  div.className = 'convo-msg ' + (isStudent ? 'from-student' : 'from-teacher');
  if (msg.id) div.dataset.msgId = msg.id;
  const time = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  div.innerHTML = `
    <div class="convo-msg-label">${isStudent ? escHtml(msg.senderName || 'Student') : escHtml(msg.senderName || 'You')}</div>
    <div class="convo-msg-bubble">${mdLite(msg.text)}</div>
    <div class="convo-msg-time">${time}</div>
  `;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

function sendConvoReply() {
  const panel = document.getElementById('convo-panel');
  const input = document.getElementById('convo-input');
  const text  = input?.value.trim();
  if (!text || !panel) return;

  const studentEmail = panel.dataset.activeStudent     || '';
  const studentName  = panel.dataset.activeStudentName || panel.dataset.studentName || '';

  if (input) input.value = '';

  fetch('/api/mentor/send', {
    method:      'POST',
    credentials: 'include',
    headers:     { 'Content-Type': 'application/json' },
    body:        JSON.stringify({ studentEmail, studentName, message: text }),
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.success) throw new Error(data.error || `Server error (${r.status})`);

    // Only now — after a real success response — does it appear as sent.
    appendMessage({ id: data.id, role: 'mentor', text, senderName: 'You', timestamp: new Date().toISOString() });

    // Clear the unread badge for this student
    if (window._teacherMsgMap?.[studentName]) {
      delete window._teacherMsgMap[studentName];
      renderStudentCards();
    }
  }).catch(err => {
    appendConvoError(`Message not sent — ${err.message}`);
    // Restore the text so the mentor doesn't have to retype it
    if (input) input.value = text;
  });
}

function appendConvoError(text) {
  const thread = document.getElementById('convo-thread');
  if (!thread) return;
  const div = document.createElement('div');
  div.style.cssText = 'align-self:center;margin:8px 0;padding:8px 14px;background:#fff5f5;border:1px solid #fca5a5;border-radius:4px;font-family:var(--sp-font-label);font-size:11px;color:#dc2626;letter-spacing:0.03em;text-align:center;';
  div.textContent = text;
  thread.appendChild(div);
  thread.scrollTop = thread.scrollHeight;
}

// Downloads one of the open student's threads as a readable .txt file:
// which = 'mentor' (mentor <-> student conversation) or 'ai' (AI chatbot
// conversation). fetch() + blob + throwaway <a download>, same pattern as
// downloadChatbotCsv() — never navigates the Teacher Hub tab away.
async function downloadConvoTranscript(which, btn) {
  const panel = document.getElementById('convo-panel');
  const studentEmail = panel?.dataset.activeStudent;
  if (!studentEmail) return;
  if (btn?.dataset.busy) return;
  const label = btn?.textContent;
  if (btn) { btn.dataset.busy = '1'; btn.textContent = 'Preparing…'; }
  try {
    const res = await fetch('/api/mentor/conversation/' + encodeURIComponent(studentEmail) + '/transcript?include=' + encodeURIComponent(which || 'both'), { credentials: 'include' });
    if (!res.ok) {
      let msg = `Download failed (${res.status})`;
      try { msg = (await res.json())?.error || msg; } catch {}
      throw new Error(msg);
    }
    const blob = await res.blob();
    const match = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '');
    const filename = match ? match[1] : `${which === 'ai' ? 'ai-chat' : which === 'mentor' ? 'mentor-chat' : 'transcript'}_${studentEmail.split('@')[0]}.txt`;
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (err) {
    showToast(err.message || 'Download failed');
  } finally {
    if (btn) { delete btn.dataset.busy; btn.textContent = label; }
  }
}

function closeConvo() {
  try {
    localStorage.removeItem('lastActiveStudentEmail');
    localStorage.removeItem('lastActiveStudentName');
  } catch {}
  const panel = document.getElementById('convo-panel');
  if (!panel) return;
  panel.style.display = 'none';
  panel.dataset.activeStudent = '';
}

async function quickBroadcast() {
  const input    = document.getElementById('sc-broadcast-input');
  const statusEl = document.getElementById('sc-broadcast-status');
  const text     = input?.value.trim();
  if (!text) return;

  try {
    await api('/api/teacher/broadcast', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ text, broadcastType: 'text', mediaUrl: '', targetStudents: [], scheduleMs: 0, repeatMinutes: 0 }),
    });
    if (statusEl) { statusEl.textContent = 'Sent!'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
    if (input)    input.value = '';
  } catch {
    if (statusEl) { statusEl.textContent = 'Failed to send'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000); }
  }
}

// ── Chat Log ──────────────────────────────────────────────────────────────────
async function loadChatlog() {
  const q = document.getElementById('chatlog-search')?.value || '';
  const student = document.getElementById('chatlog-student')?.value || '';
  const flagged = state.chatlogFlagged ? '1' : '';
  const params = new URLSearchParams({ q, student, ...(flagged ? { flagged } : {}) });
  const log = await api(`/api/teacher/chatlog?${params}`);
  if (!log) return;
  state.chatlog = log;

  document.getElementById('chatlog-count').textContent = `${log.length} entries`;

  const wrap = document.getElementById('chatlog-list');
  if (!log.length) {
    wrap.innerHTML = '<div class="empty-state">No chat history yet.</div>';
    return;
  }

  wrap.innerHTML = log.map(e => {
    const flagClass = e.academicIntegrity ? 'academic-integrity' : e.flagged ? 'flagged' : '';
    const tags = e.flagReasons.map(r =>
      r === 'academic_integrity'
        ? `<span class="flag-tag integrity">Academic Integrity</span>`
        : `<span class="flag-tag">${esc(r)}</span>`
    ).join('');
    return `<div class="log-entry ${flagClass}" data-id="${esc(e.id)}">
      <div class="log-entry-head">
        <span class="log-student">${esc(e.studentName)}</span>
        <div class="flag-tags">${tags}</div>
        <span class="log-time">${fmtTs(e.timestamp)}</span>
      </div>
      <div class="log-prompt">💬 ${esc(e.prompt)}</div>
      <div class="log-response" id="resp-${esc(e.id)}">🤖 ${mdLite(e.response || '(no response)')}</div>
      ${e.response?.length > 200 ? `<button class="log-expand-btn" onclick="toggleExpand('${esc(e.id)}')">Show more ▼</button>` : ''}
      ${e.visuals?.length ? `<div class="log-visuals" title="Shown to the student along with this reply">Shown with reply: ${esc(e.visuals.join(' · '))}</div>` : ''}
    </div>`;
  }).join('');
}

function toggleExpand(id) {
  const el = document.getElementById(`resp-${id}`);
  const btn = el?.nextElementSibling;
  if (!el) return;
  const expanded = el.classList.toggle('expanded');
  if (btn) btn.textContent = expanded ? 'Show less ▲' : 'Show more ▼';
}

// ── Broadcast ─────────────────────────────────────────────────────────────────
async function loadBroadcast() {
  const active = await api('/api/teacher/broadcast');
  state.broadcastActive = active;
  renderBroadcastPreview(active);
  document.getElementById('clear-broadcast-btn').style.display = active ? '' : 'none';
  loadRecordingLibrary();
  loadBroadcastHistory();
}

async function loadBroadcastHistory() {
  const items = await api('/api/teacher/broadcast-history');
  const wrap = document.getElementById('broadcast-history-list');
  if (!wrap) return;
  if (!items?.length) {
    wrap.innerHTML = '<div class="empty-state">No broadcasts sent yet.</div>';
    return;
  }
  wrap.innerHTML = items.map(b => {
    const activeStudents = state.students.length;
    const unseenCount = Math.max(0, activeStudents - b.seenCount);
    const isActive = state.broadcastActive?.id === b.id;
    const typeLabel =
      b.broadcastType === 'youtube' ? '▶️ YouTube' :
      b.broadcastType === 'audio'   ? '🔊 Audio' :
      b.broadcastType === 'image'   ? '🖼️ Image' : '📝 Text';
    const unseenList = b.seenBy?.length
      ? state.students.filter(s => !b.seenBy.includes(s.studentName)).map(s => s.studentName)
      : [];
    return `
      <div class="bh-entry${isActive ? ' bh-entry-active' : ''}">
        <div class="bh-entry-top">
          <span class="bh-type-badge">${typeLabel}</span>
          ${isActive ? '<span class="bh-active-badge">Active</span>' : ''}
          <span class="bh-ts">${fmtTs(b.timestamp)}</span>
        </div>
        <div class="bh-text">${esc(b.text || b.mediaUrl || '(media)')}</div>
        <div class="bh-stats">
          <span class="bh-stat bh-stat-seen" title="Students who saw this broadcast">
            👁 ${b.seenCount} seen
          </span>
          <span class="bh-stat bh-stat-dismissed" title="Students who dismissed this broadcast">
            ✓ ${b.dismissedCount} dismissed
          </span>
          ${activeStudents > 0 ? `<span class="bh-stat bh-stat-unseen" title="Active students who haven't seen this">⏳ ${unseenCount} not seen</span>` : ''}
        </div>
        ${b.seenBy?.length ? `
          <details class="bh-details">
            <summary>Who's seen it (${b.seenBy.length})</summary>
            <div class="bh-name-list">${b.seenBy.map(n => `<span class="bh-name-chip bh-seen">${esc(n)}</span>`).join('')}</div>
          </details>` : ''}
        ${b.dismissedBy?.length ? `
          <details class="bh-details">
            <summary>Who dismissed it (${b.dismissedBy.length})</summary>
            <div class="bh-name-list">${b.dismissedBy.map(n => `<span class="bh-name-chip bh-dismissed">${esc(n)}</span>`).join('')}</div>
          </details>` : ''}
        ${unseenList.length ? `
          <details class="bh-details">
            <summary>Active students who haven't seen it (${unseenList.length})</summary>
            <div class="bh-name-list">${unseenList.map(n => `<span class="bh-name-chip bh-unseen">${esc(n)}</span>`).join('')}</div>
          </details>` : ''}
        <div class="bh-actions">
          <button class="bh-action-btn bh-resend-btn" data-id="${b.id}" title="Resend only to active students who haven't seen this yet">
            ↻ Resend to Unseen
          </button>
          <button class="bh-action-btn bh-force-btn" data-id="${b.id}" title="Override dismiss — show again to all students, including those who already dismissed it">
            ⚡ Force Reshow All
          </button>
        </div>
      </div>`;
  }).join('');

  // Attach action handlers
  wrap.querySelectorAll('.bh-resend-btn').forEach(btn => {
    btn.addEventListener('click', () => resendBroadcast(btn.dataset.id));
  });
  wrap.querySelectorAll('.bh-force-btn').forEach(btn => {
    btn.addEventListener('click', () => forceReshowBroadcast(btn.dataset.id));
  });
}

async function resendBroadcast(id) {
  const r = await api(`/api/teacher/broadcast/${id}/resend`, { method: 'POST' });
  if (r?.ok) {
    const msg = r.sent === 0
      ? 'All active students have already seen this broadcast.'
      : `Resent to ${r.sent} student${r.sent !== 1 ? 's' : ''} who hadn't seen it.`;
    showBroadcastActionStatus(msg, r.sent > 0 ? 'success' : 'info');
    loadBroadcastHistory();
  }
}

async function forceReshowBroadcast(id) {
  if (!confirm('Force-show this broadcast to ALL students, including those who dismissed it?')) return;
  const r = await api(`/api/teacher/broadcast/${id}/force-reshow`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  if (r?.ok) {
    showBroadcastActionStatus('Broadcast force-reshown to all students.', 'success');
    loadBroadcastHistory();
  }
}

function showBroadcastActionStatus(text, type = 'success') {
  let el = document.getElementById('bh-action-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'bh-action-status';
    el.style.cssText = 'font-size:.82rem;font-weight:600;padding:6px 0;margin-top:8px;';
    document.getElementById('broadcast-history-list')?.after(el);
  }
  el.style.color = type === 'success' ? '#16a34a' : type === 'info' ? 'var(--sp-blue)' : '#dc2626';
  el.textContent = text;
  setTimeout(() => { el.textContent = ''; }, 3500);
}

document.getElementById('refresh-broadcast-history-btn')?.addEventListener('click', loadBroadcastHistory);

function renderBroadcastPreview(msg) {
  const wrap = document.getElementById('active-broadcast-preview');
  if (!msg) {
    wrap.innerHTML = '<div class="no-broadcast">No active broadcast</div>';
    return;
  }
  let mediaHtml = '';
  if (msg.broadcastType === 'image' && msg.mediaUrl) {
    mediaHtml = `<img src="${esc(msg.mediaUrl)}" alt="broadcast image" onerror="this.style.display='none'">`;
  } else if (msg.broadcastType === 'youtube' && msg.mediaUrl) {
    const vid = extractYouTubeId(msg.mediaUrl);
    if (vid) mediaHtml = `<iframe width="100%" height="140" src="https://www.youtube-nocookie.com/embed/${vid}" frameborder="0" allowfullscreen style="border-radius:8px;margin-top:8px"></iframe>`;
  } else if (msg.broadcastType === 'audio' && msg.mediaUrl) {
    mediaHtml = `<audio controls src="${esc(msg.mediaUrl)}" style="width:100%;margin-top:8px"></audio>`;
  }
  const targets = msg.targetStudents?.length ? `<br>Targets: ${msg.targetStudents.join(', ')}` : '';
  wrap.innerHTML = `<div class="preview-msg">
    <div class="preview-text">${esc(msg.text || '')}</div>
    ${mediaHtml}
    <div class="preview-meta">Sent ${fmtTs(msg.timestamp)}${targets}</div>
  </div>`;
}

async function sendBroadcast() {
  const text = document.getElementById('broadcast-text').value.trim();
  const mediaUrl = document.getElementById('broadcast-media-url').value.trim();
  const broadcastType = state.broadcastType;
  const target = document.querySelector('input[name="broadcast-target"]:checked')?.value || 'all';
  const targetStudents = target === 'specific'
    ? (document.getElementById('broadcast-target-students').value || '').split(',').map(s => s.trim()).filter(Boolean)
    : [];

  if (!text && !mediaUrl) {
    document.getElementById('broadcast-status').className = 'save-status error';
    document.getElementById('broadcast-status').textContent = 'Please enter a message or media URL.';
    return;
  }

  const scheduleCheck = document.getElementById('broadcast-schedule-check').checked;
  const scheduleTime = document.getElementById('broadcast-schedule-time').value;
  let scheduleMs = 0;
  if (scheduleCheck && scheduleTime) {
    const diff = new Date(scheduleTime).getTime() - Date.now();
    if (diff > 0) scheduleMs = diff;
  }

  const repeatCheck = document.getElementById('broadcast-repeat-check').checked;
  const repeatMinutes = repeatCheck ? parseInt(document.getElementById('broadcast-repeat-mins').value) || 0 : 0;

  const body = { text, broadcastType, mediaUrl, targetStudents, scheduleMs, repeatMinutes };

  try {
    await api('/api/teacher/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const status = document.getElementById('broadcast-status');
    status.className = 'save-status success';
    status.textContent = scheduleMs > 0 ? '✓ Broadcast scheduled.' : '✓ Broadcast sent to all connected students.';
    setTimeout(() => { status.textContent = ''; }, 3000);
    loadBroadcast();
  } catch (err) {
    document.getElementById('broadcast-status').className = 'save-status error';
    document.getElementById('broadcast-status').textContent = `Error: ${err.message}`;
  }
}

async function clearBroadcast() {
  await api('/api/teacher/broadcast', { method: 'DELETE' });
  document.getElementById('clear-broadcast-btn').style.display = 'none';
  renderBroadcastPreview(null);
}

function extractYouTubeId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

// ── Roster ────────────────────────────────────────────────────────────────────
async function loadRoster() {
  const [roster, groups] = await Promise.all([
    api('/api/teacher/roster'),
    api('/api/teacher/groups'),
  ]);
  if (!roster || !groups) return;
  state.roster = roster;
  state.groups = groups;
  renderGroups();
  renderRosterTable();
  populateGroupSelect();
}

function renderGroups() {
  const wrap = document.getElementById('groups-list');
  wrap.innerHTML = '<h3>Groups</h3>';
  if (!state.groups.length) {
    wrap.innerHTML += '<div style="font-size:.8rem;color:var(--sp-muted);padding:8px 0">No groups yet</div>';
  } else {
    state.groups.forEach(g => {
      const memberCount = state.roster.filter(s => s.group === g.id).length;
      wrap.innerHTML += `<div class="group-item">
        <span>${esc(g.name)} <small style="color:var(--sp-muted)">(${memberCount})</small></span>
        <button class="delete-group-btn" onclick="deleteGroup('${esc(g.id)}')">✕</button>
      </div>`;
    });
  }
}

function renderRosterTable() {
  const wrap = document.getElementById('roster-table');
  if (!state.roster.length) {
    wrap.innerHTML = '<div class="empty-state">No students added yet.<br>Add students above to track their activity.</div>';
    return;
  }

  const session = name => state.students.find(s => s.studentName === name);

  wrap.innerHTML = `<table class="roster-table">
    <thead>
      <tr>
        <th>Name</th>
        <th>Group</th>
        <th>Hub Status</th>
        <th>Session Time</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${state.roster.map(s => {
        const ses = session(s.name);
        const gname = state.groups.find(g => g.id === s.group)?.name || '—';
        return `<tr>
          <td><strong>${esc(s.name)}</strong></td>
          <td>${esc(gname)}</td>
          <td>${ses ? `<div class="status-cell status-${ses.status}"><div class="status-dot"></div>${ses.status}</div>` : '<span style="color:var(--sp-muted)">Offline</span>'}</td>
          <td>${ses ? `${ses.totalMinutes}min` : '—'}</td>
          <td><button class="remove-student-btn" onclick="removeStudent('${esc(s.name)}')">Remove</button></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>`;
}

function populateGroupSelect() {
  const sel = document.getElementById('new-student-group');
  if (!sel) return;
  sel.innerHTML = '<option value="">No group</option>' +
    state.groups.map(g => `<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
}

// Both below use a raw fetch(), not the shared api() helper — api() treats
// ANY 401 or 403 as "session expired" and redirects to /teacher/login with
// no exception (see its own definition above). That's correct for a truly
// dead session, but wrong here: as of 2026-09-22 these routes also return
// 403 for a real, valid session trying to add/remove a name outside the
// teacher's own assigned mentees (the roster's write endpoints previously
// had no such check at all — see routes/teacher.js's own comment on the
// fix). Routing that through api() would silently bounce a signed-in
// teacher to the login page instead of showing them why the action failed.
// Matches sendConvoReply()'s existing pattern for the same reason.
async function addStudent() {
  const name = document.getElementById('new-student-name').value.trim();
  const group = document.getElementById('new-student-group').value;
  if (!name) return;
  try {
    const res = await fetch('/api/teacher/roster', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, group }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    document.getElementById('new-student-name').value = '';
    document.getElementById('add-student-row').style.display = 'none';
    loadRoster();
  } catch (err) {
    showToast(err.message === 'Not authorized for this student'
      ? `"${name}" isn't one of your assigned mentees, so they can't be added here.`
      : `Could not add student — ${err.message}`);
  }
}

async function removeStudent(name) {
  if (!confirm(`Remove ${name} from the roster?`)) return;
  try {
    const res = await fetch(`/api/teacher/roster/${encodeURIComponent(name)}`, { method: 'DELETE', credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    loadRoster();
  } catch (err) {
    showToast(`Could not remove ${name} — ${err.message}`);
  }
}

async function addGroup() {
  const name = prompt('New group name:');
  if (!name?.trim()) return;
  await api('/api/teacher/groups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  loadRoster();
}

async function deleteGroup(id) {
  if (!confirm('Delete this group? Students will be unassigned.')) return;
  await api(`/api/teacher/groups/${id}`, { method: 'DELETE' });
  loadRoster();
}

// ── Websites ──────────────────────────────────────────────────────────────────
async function loadWebsites() {
  const q = document.getElementById('website-search')?.value || '';
  const student = document.getElementById('website-student')?.value || '';
  const params = new URLSearchParams({ q, student });
  const log = await api(`/api/teacher/websites?${params}`);
  if (!log) return;
  state.websites = log;

  document.getElementById('website-count').textContent = `${log.length} visits`;
  renderWebsiteSummary(log);

  const wrap = document.getElementById('website-list');
  if (!log.length) {
    wrap.innerHTML = '<div class="empty-state">No website visits recorded yet.</div>';
    return;
  }

  wrap.innerHTML = log.map(e => {
    const rowClass = e.flagged ? 'flagged' : (!e.schoolRelated ? 'not-school' : '');
    const blockLabel = e.flagged ? 'Blocked' : 'Block';
    const blockDisabled = e.flagged ? 'disabled' : '';
    return `<div class="website-entry ${rowClass}">
      <img class="website-favicon" src="https://www.google.com/s2/favicons?domain=${esc(e.hostname)}&sz=20" alt="" onerror="this.style.display='none'">
      <div class="website-url">
        <div class="website-domain">${esc(e.hostname)}</div>
        <div class="website-full-url" title="${esc(e.url)}">${esc(e.url)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0">
        <span class="website-feature">${esc(e.feature)}</span>
        <div class="website-meta">
          <span class="website-student">${esc(e.studentName)}</span>
          <span class="website-time">${fmtTs(e.timestamp)}</span>
        </div>
        ${!e.flagged ? `<button class="block-domain-btn" onclick="blockDomain('${esc(e.hostname)}')" ${blockDisabled}>🚫 ${blockLabel}</button>` : '<span style="font-size:.75rem;color:#dc2626;font-weight:600">🚫 Blocked</span>'}
      </div>
    </div>`;
  }).join('');
}

function renderWebsiteSummary(log) {
  const wrap = document.getElementById('website-summary');
  const domainCounts = {};
  log.forEach(e => { domainCounts[e.hostname] = (domainCounts[e.hostname] || 0) + 1; });
  const topDomain = Object.entries(domainCounts).sort((a, b) => b[1] - a[1])[0];
  const studentCounts = {};
  log.forEach(e => { studentCounts[e.studentName] = (studentCounts[e.studentName] || 0) + 1; });
  const topStudent = Object.entries(studentCounts).sort((a, b) => b[1] - a[1])[0];
  const flagged = log.filter(e => e.flagged).length;
  const nonSchool = log.filter(e => !e.schoolRelated && !e.flagged).length;

  wrap.innerHTML = `
    <div class="ws-stat"><div class="ws-stat-label">Most Visited</div><div class="ws-stat-val">${topDomain ? esc(topDomain[0]) : '—'}</div></div>
    <div class="ws-stat"><div class="ws-stat-label">Most Active</div><div class="ws-stat-val">${topStudent ? esc(topStudent[0]) : '—'}</div></div>
    <div class="ws-stat"><div class="ws-stat-label">Blocked Sites</div><div class="ws-stat-val" style="color:var(--red)">${flagged}</div></div>
    <div class="ws-stat"><div class="ws-stat-label">Non-School</div><div class="ws-stat-val" style="color:#d97706">${nonSchool}</div></div>
  `;
}

async function blockDomain(hostname) {
  if (!confirm(`Block all students from visiting ${hostname}?`)) return;
  await api('/api/teacher/safeguards/block-domain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ domain: hostname }),
  });
  loadWebsites();
}

// ── Teacher SSE events (real-time flags) ──────────────────────────────────────
function connectTeacherEvents() {
  const es = new EventSource('/api/teacher/events');
  es.onmessage = e => {
    const data = JSON.parse(e.data);
    if (data.type === 'flag' && state.activePanel === 'chatlog') {
      loadChatlog();
    } else if (data.type === 'blocked_site' && state.activePanel === 'websites') {
      loadWebsites();
    }
  };
  es.onerror = () => setTimeout(connectTeacherEvents, 5000);
}

// ── Polling ───────────────────────────────────────────────────────────────────
function startPolling() {
  setInterval(() => {
    if (state.activePanel === 'students') loadStudents();
    else if (state.activePanel === 'chatlog') loadChatlog();
    else if (state.activePanel === 'websites') loadWebsites();
    else if (state.activePanel === 'roster') loadStudents();
    else if (state.activePanel === 'prompts') loadPromptInventory();
    else if (state.activePanel === 'analytics') loadAnalytics();
  }, 15000);
}

// ── Helpers ───────────────────────────────────────────────────────────────────
// Student-card DOM id from an email — was independently duplicated at 9 call
// sites (same drift risk shape as the school-year-cutoff bug: one copy fixed,
// others silently left stale). The `|| ''` guard is new here — several sites
// called .replace() directly on the raw argument with no guard, which would
// throw if it were ever undefined/null; this makes all call sites safe
// uniformly instead of only the ones that happened to guard it themselves.
function cardIdFor(email) {
  return 'card-' + (email || '').replace(/[@.]/g, '_');
}

// Tiny, safe markdown for AI replies shown to teachers: escape first, then bold/italic/inline code
// and "- " list lines. (The coach writes markdown; without this teachers saw raw ** and - characters.)
function mdLite(s) {
  return esc(s)
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>')
    .replace(/`([^`\n]+?)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<>"')]+[^\s<>"').,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>')
    .replace(/^(\s*)[-*] /gm, '$1• ')
    .replace(/(\s)- (?=<strong>)/g, '$1\n• ');
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Small check-in light dot for a student card, from state.checkinLights (fed by
// the standalone YSC Check-in app). Returns '' when there is nothing to show.
//   green / yellow / red  -> filled dot, per the `light` field
//   status 'pending'      -> hollow grey dot ("no check-in yet today")
//   status 'none' / 'excused' / 'absent' / missing -> nothing
// askedForReachOut makes the red dot prominent; hasNote / hasSharedWin add a
// small note / star icon. The endpoint sends NO note or win text, and none is
// shown here — only that they exist.
const CL_TOOLTIP = {
  green:  'Checked in — doing well',
  yellow: 'Checked in — could use a little support',
  red:    'Checked in — asked me to reach out',
};
// Self-reported "how I'm doing school today" mode from the check-in app's
// `learning` field. Fixed allowlist keyed by exact string — anything else
// (null, missing, or a hostile/unknown value) yields no icon, same guard style
// as the `light` value above. The emoji and tooltip are literals here; the
// only external value (cl.learning) is used solely as a lookup key and never
// interpolated into markup.
const CL_LEARNING = new Map([
  ['in_class',    { icon: '🎓', tip: 'In class or meeting with a teacher or mentor' }],
  ['async',       { icon: '🏠', tip: 'Working on their own today' }],
  ['traveling',   { icon: '✈️', tip: 'Traveling for soccer or volleyball — working when they can' }],
  ['unavailable', { icon: '🚫', tip: 'Not able to do school today' }],
]);
function checkinLightHTML(email) {
  const cl = state.checkinLights?.[String(email || '').toLowerCase()];
  if (!cl) return '';

  let dot = '';
  if (cl.light === 'green' || cl.light === 'yellow' || cl.light === 'red') {
    const urgent = cl.light === 'red' && cl.askedForReachOut ? ' cl-dot--urgent' : '';
    dot = `<span class="cl-dot cl-dot--${cl.light}${urgent}" title="${esc(CL_TOOLTIP[cl.light])}"></span>`;
  } else if (cl.status === 'pending') {
    dot = `<span class="cl-dot cl-dot--pending" title="No check-in yet today"></span>`;
  }

  // Learning mode sits between the light dot and the note/win icons. Note that
  // 'unavailable' arrives with status 'absent' (no light) — it must still show
  // its icon here rather than falling into the no-dot path other absent
  // students take, so this is computed independently of `dot`.
  const lm = typeof cl.learning === 'string' ? CL_LEARNING.get(cl.learning) : null;
  const learn = lm
    ? `<span class="cl-icon cl-icon--learning" role="img" title="${esc(lm.tip)}" aria-label="${esc(lm.tip)}">${lm.icon}</span>`
    : '';

  // Nothing worth a row: no light, no pending dot, no recognised learning mode
  // ('none' / 'excused' / a bare 'absent' / an unknown status).
  if (!dot && !learn) return '';

  const note = cl.hasNote      ? `<i class="ti ti-note cl-icon cl-icon--note" title="Left you a note" aria-label="Left you a note"></i>` : '';
  const win  = cl.hasSharedWin ? `<i class="ti ti-star-filled cl-icon cl-icon--win" title="Shared a win" aria-label="Shared a win"></i>` : '';
  return `<span class="cl-wrap">${dot}${learn}${note}${win}</span>`;
}

function fmtTs(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// ── Mentor weekly message ────────────────────────────────────────────────────
async function loadWeeklyMessage() {
  try {
    const res  = await fetch('/api/teacher/weekly-message', { credentials: 'include' });
    const data = await res.json();
    const prevEl    = document.getElementById('wmp-prev');
    const composeEl = document.getElementById('wmp-compose');
    const textEl    = document.getElementById('wmp-prev-text');
    const metaEl    = document.getElementById('wmp-prev-meta');
    if (data.message) {
      if (prevEl)    prevEl.style.display = 'block';
      if (composeEl) composeEl.style.display = 'none';
      if (textEl)    textEl.textContent = '"' + data.message.text + '"';
      if (metaEl)    metaEl.textContent = 'Posted ' + new Date(data.message.postedAt).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    } else {
      if (prevEl)    prevEl.style.display = 'none';
      if (composeEl) composeEl.style.display = 'block';
    }
  } catch (err) {
    console.warn('loadWeeklyMessage error:', err.message);
  }
}

async function postWeeklyMessage() {
  const input    = document.getElementById('weekly-msg-input');
  const statusEl = document.getElementById('wmp-status');
  const btn      = document.querySelector('[onclick="postWeeklyMessage()"]');
  if (!input || !input.value.trim()) return;
  if (btn) btn.disabled = true;
  if (statusEl) { statusEl.textContent = 'Posting...'; statusEl.style.display = 'block'; statusEl.style.color = 'var(--sp-muted)'; }
  try {
    const res = await fetch('/api/teacher/weekly-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: input.value.trim() }),
    });
    const data = await res.json();
    if (data.success) {
      if (statusEl) { statusEl.textContent = 'Posted ✓'; statusEl.style.color = 'var(--sp-blue)'; }
      setTimeout(loadWeeklyMessage, 800);
    } else {
      if (statusEl) { statusEl.textContent = data.error || 'Could not post'; statusEl.style.color = 'var(--sp-muted)'; }
      if (btn) btn.disabled = false;
    }
  } catch (err) {
    if (statusEl) { statusEl.textContent = 'Network error'; statusEl.style.color = 'var(--sp-muted)'; }
    if (btn) btn.disabled = false;
  }
}

function editWeeklyMessage() {
  const prevEl    = document.getElementById('wmp-prev');
  const composeEl = document.getElementById('wmp-compose');
  if (prevEl)    prevEl.style.display = 'none';
  if (composeEl) composeEl.style.display = 'block';
  const input   = document.getElementById('weekly-msg-input');
  const countEl = document.getElementById('wmp-count');
  if (input && countEl) countEl.textContent = input.value.length;
}

// ── Init ──────────────────────────────────────────────────────────────────────
// ── Mentor Inbox — socket.io real-time feed ───────────────────────────────────
(function initMentorInbox() {
  if (typeof io !== 'function') return;

  const socket = io({ reconnection: true, reconnectionAttempts: 5, reconnectionDelay: 2000, reconnectionDelayMax: 10000 });
  window._teacherSocket = socket;
  window._teacherMsgMap = window._teacherMsgMap || {};
  let _unreadCount = 0;
  // "Seen" bookkeeping for the Messages badge. Unread used to mean "card whose reply box hasn't been
  // focused", so the badge could only be cleared by clicking into every card — and since the backlog
  // now loads at page load, a teacher who just LOOKED at the inbox (or never answered an old message)
  // saw the badge forever. Now: opening the Mentor Inbox marks everything seen and remembers when
  // (per browser), and only messages newer than that count as unread on the next page load.
  const _seenKey = () => 'ysc-mentor-inbox-seen:' + String(window.teacherEmail || 'teacher').toLowerCase();
  // Seen time = the later of this browser's copy and the one saved on the teacher's ACCOUNT (notification prefs),
  // so the badge stays cleared across logouts, cleared browser storage, and other computers.
  const _getSeenTs = () => {
    let local = 0;
    try { local = Number(localStorage.getItem(_seenKey())) || 0; } catch { /* private mode etc. */ }
    return Math.max(local, Number(_notifPrefs?.mentorInboxSeenAt) || 0);
  };
  const _setSeenTs = t => { try { localStorage.setItem(_seenKey(), String(t)); } catch { /* private mode etc. */ } };
  function markMentorInboxSeen() {
    document.querySelectorAll('#mentor-inbox-body .smc-unread').forEach(c => c.classList.remove('smc-unread'));
    _unreadCount = 0;
    const now = Date.now();
    _setSeenTs(now);
    _notifPrefs = { ..._notifPrefs, mentorInboxSeenAt: now };
    api('/api/teacher/notification-settings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mentorInboxSeenAt: now }),
    }).catch(() => { /* the local copy still holds; retried on the next open */ });
    updateMentorInboxBadge();
  }
  window.markMentorInboxSeen = markMentorInboxSeen;
  let _totalCount  = 0;

  window._onlineStudentEmails = window._onlineStudentEmails || new Set();

  // Load notification-sound prefs eagerly at page load (not just when the
  // Notifications settings panel is opened) — studentOnline/studentMentorMessage
  // can fire at any time, and _notifPrefs must already reflect the teacher's
  // saved toggle state by then. Defaults apply for the brief window before
  // this resolves.
  window._notifPrefsPromise = loadNotificationPrefs();
  loadQuicklinkButtons();
  // Backfill the Mentor Inbox at page load too (not only when the panel is opened) so the
  // Messages badge shows waiting students right away. Deferred: the loader's guard variable is
  // declared further down this IIFE.
  // Wait for window.teacherEmail (set async from /api/teacher/me): the "seen" timestamp is stored under a
  // key containing it, and reading before it's known looked under a different key — so a fresh login always
  // saw the badge again even after the inbox had been opened.
  (function loadInboxBacklogWhenReady(tries = 0) {
    if (window.teacherEmail || tries >= 20) {
      // ...and for the account-level "last opened" time (part of the notification prefs) to have arrived.
      return Promise.resolve(window._notifPrefsPromise).catch(() => {}).then(() => window.loadMentorInboxHistory?.());
    }
    setTimeout(() => loadInboxBacklogWhenReady(tries + 1), 300);
  })();

  socket.on('connect', () => {
    socket.emit('teacher-hub-join');
    if (window.teacherEmail) socket.emit('registerTeacher', { email: window.teacherEmail });
    console.log('[TeacherHub] Joined teacherHub room');
  });

  socket.on('studentRegistered', () => {
    if (state.activePanel === 'students') loadStudents();
  });

  socket.on('studentOnline', ({ email } = {}) => {
    if (!email) return;
    window._onlineStudentEmails.add(email);
    _applyOnlineToCard(email);
    // Only for this teacher's own mentees (same roster-card check
    // _applyOnlineToCard's DOM update already relies on), and only when the
    // Teacher Hub tab isn't the one currently in focus — a mentee logging in
    // isn't worth interrupting a teacher already actively in the hub for.
    if (_isMyMentee(email) && document.hidden) playNotificationSound('login');
  });

  socket.on('studentOffline', ({ email } = {}) => {
    if (!email) return;
    window._onlineStudentEmails.delete(email);
    _applyOfflineToCard(email);
  });

  socket.on('mentorAssignmentUpdated', (data) => {
    // Re-render student cards so mentor badge/compose areas reflect new assignments
    if (typeof loadMyStudents === 'function') loadMyStudents();
  });

  socket.on('gamePlanTaskUpdate', (data) => {
    const convoPanel = document.getElementById('convo-panel');
    if (convoPanel && convoPanel.style.display !== 'none' &&
        convoPanel.dataset.activeStudent === data.studentEmail) {
      loadStudentWeeklyLoad(data.studentEmail, convoPanel.dataset.studentName || data.studentEmail);
      loadStudentStudyPlan(data.studentEmail, convoPanel.dataset.studentName || data.studentEmail);
    }
    const cardId  = cardIdFor(data.studentEmail);
    const metaEl  = document.getElementById('meta-' + cardId);
    if (metaEl && data.title) {
      metaEl.textContent = data.completed ? `Completed: ${data.title}` : `Uncompleted: ${data.title}`;
    }
  });

  socket.on('studentMentorMessage', (data) => {
    // Server socket delivery is now mentor-scoped. Keep the roster check as
    // UI defense-in-depth (e.g. while an assignment-refresh request is pending).
    // Same roster-card-existence check that already scopes the online-dot
    // display; a teacher with no card for this student sees nothing at all
    // for this event — no inbox card, no unread count, no sound.
    if (!_isMyMentee(data.studentEmail)) return;

    renderStudentMessageCard(data);
    _totalCount++;
    if (state.activePanel === 'mentor-inbox' && !document.hidden) markMentorInboxSeen();   // already looking at it
    else { _unreadCount++; updateMentorInboxBadge(); }

    // Track for student card badges + convo panel routing
    const name = data.studentName || 'Student';
    window._teacherMsgMap[name] = window._teacherMsgMap[name] || { count: 0 };
    window._teacherMsgMap[name].count++;
    window._teacherMsgMap[name].text             = data.text;
    window._teacherMsgMap[name].studentSocketId  = data.studentSocketId;
    window._teacherMsgMap[name].slackDMChannelId = data.slackDMChannelId;
    window._teacherMsgMap[name].studentEmail     = data.studentEmail;

    // Real-time append if the convo panel is open for this student
    const convoPanel = document.getElementById('convo-panel');
    if (convoPanel && convoPanel.style.display !== 'none' &&
        convoPanel.dataset.activeStudent === data.studentEmail) {
      appendMessage({ id: data.msgId, role: 'student', text: data.text, senderName: data.studentName, timestamp: data.timestamp || new Date().toISOString() });
    } else if (data.studentEmail) {
      // Card is not open — update the unread badge on the student card
      updateStudentCardUnread(data.studentEmail);
    }

    // Always fires regardless of tab focus — a mentee message is the
    // higher-priority event (per product decision), unlike the login sound.
    playNotificationSound('message');
  });

  socket.on('analyticsUpdate', (data) => {
    const isDataSection = state.activeSection === 'data';
    const activePanel   = state.activePanel;

    if (data.type === 'login' || data.type === 'logout') {
      if (isDataSection && activePanel === 'analytics') loadAnalytics();
    }
    if (data.type === 'chatbot') {
      if (isDataSection && activePanel === 'chatbot-data') loadChatbotSummary();
    }
    if (data.type === 'goals') {
      if (isDataSection && activePanel === 'student-goals') loadAllStudentGoals();
    }
    // Always update status bar counts if data section is open
    if (isDataSection) refreshAllDataStatus();
  });

  function updateMentorInboxBadge() {
    const navBadge   = document.getElementById('mentor-inbox-nav-badge');
    const countEl    = document.getElementById('unread-count');
    const totalEl    = document.getElementById('mentor-inbox-count');
    if (navBadge) {
      if (_unreadCount > 0) { navBadge.textContent = _unreadCount; navBadge.style.display = 'inline'; }
      else navBadge.style.display = 'none';
    }
    if (countEl) countEl.textContent = _unreadCount + ' unread';
    if (totalEl) totalEl.textContent = _totalCount + ' message' + (_totalCount === 1 ? '' : 's');
  }

  function renderStudentMessageCard(data) {
    const body    = document.getElementById('mentor-inbox-body');
    const emptyEl = document.getElementById('mentor-inbox-empty');
    if (!body) return;
    if (emptyEl) emptyEl.remove();

    // De-dup: a live-pushed message for a student who already has a card here
    // (from the history backfill on panel open, or an earlier live message)
    // replaces it rather than stacking a duplicate — "one row per student,
    // most recent wins," matching the inbox's own read/unread semantic.
    if (data.studentEmail) {
      const existing = body.querySelector(`[data-student-email="${CSS.escape(data.studentEmail)}"]`);
      if (existing) existing.remove();
    }

    const time = data.timestamp
      ? new Date(data.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    const card = document.createElement('div');
    card.className = 'student-message-card smc-unread';
    card.dataset.studentEmail     = data.studentEmail     || '';
    card.dataset.studentName      = data.studentName      || 'Student';

    const header = document.createElement('div');
    header.className = 'smc-header';
    const nameEl = document.createElement('span');
    nameEl.className = 'smc-student';
    nameEl.textContent = data.studentName || 'Student';
    const timeEl = document.createElement('span');
    timeEl.className = 'smc-time';
    timeEl.textContent = time;
    header.appendChild(nameEl);
    header.appendChild(timeEl);

    const textEl = document.createElement('div');
    textEl.className = 'smc-text';
    textEl.innerHTML = mdLite(data.text || '');

    const replyRow = document.createElement('div');
    replyRow.className = 'smc-reply-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'smc-reply-input';
    input.placeholder = 'Reply to ' + escHtml(data.studentName || 'student') + '…';
    const btn = document.createElement('button');
    btn.className = 'smc-reply-btn';
    btn.textContent = 'Send';
    replyRow.appendChild(input);
    replyRow.appendChild(btn);

    card.appendChild(header);
    card.appendChild(textEl);
    card.appendChild(replyRow);
    body.insertBefore(card, body.firstChild);

    // Clicking the input marks card as read
    input.addEventListener('focus', () => {
      if (card.classList.contains('smc-unread')) {
        card.classList.remove('smc-unread');
        _unreadCount = Math.max(0, _unreadCount - 1);
        updateMentorInboxBadge();
      }
    });

    // Send button — POST /api/mentor/send, same endpoint the full conversation
    // panel's sendConvoReply() already uses, not the old teacherReply socket
    // emit. Changed 2026-09-22 while adding history backfill: a backfilled
    // card (rendered from stored conversation history, not a live socket
    // push) has no studentSocketId/slackDMChannelId to route a socket-based
    // reply through — the REST endpoint only needs studentEmail, so it works
    // identically whether the student is currently online or not. This also
    // incidentally fixes a latent fragility in the socket path even for
    // live-pushed cards: it resolved studentEmail via mentorChatStore's
    // in-memory channel-routing table, which is correctly wiped on every
    // server restart (see lib/mentor-chat-store.js's own comment) — a reply
    // to an older live card could have silently failed after any redeploy.
    // Waits for a real success response before showing "Replied ✓", same
    // as before.
    btn.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      btn.disabled = true;
      const originalBtnText = btn.textContent;
      btn.textContent = 'Sending…';

      try {
        const res = await fetch('/api/mentor/send', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentEmail: card.dataset.studentEmail,
            studentName:  card.dataset.studentName,
            message:      text,
          }),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result.success) throw new Error(result.error || `Server error (${res.status})`);

        // Replace reply row with confirmation
        replyRow.remove();
        const confirmed = document.createElement('div');
        confirmed.className = 'smc-replied';
        confirmed.textContent = 'Replied · ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        card.appendChild(confirmed);
        if (window._teacherMsgMap?.[card.dataset.studentName]) {
          delete window._teacherMsgMap[card.dataset.studentName];
        }
      } catch (err) {
        // Revert — leave the typed text in place so the teacher can just retry.
        input.disabled = false;
        btn.disabled = false;
        btn.textContent = originalBtnText;
        showToast(`Could not send reply — ${err.message || 'unknown error'}.`);
      }
    });

    // Enter key sends
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn.click();
    });
  }

  // ── Mentor Inbox history backfill ───────────────────────────────────────
  // Found 2026-09-22 (already flagged in CLAUDE.md 2026-09-18): this panel
  // had NO history fetch at all — renderStudentMessageCard() was only ever
  // called from the studentMentorMessage socket handler above, so a message
  // sent while no teacher was actively connected (or before the teacher's
  // current session started) never appeared here, "No messages yet" shown
  // regardless of real pending messages. The message itself was never lost
  // (still reaches the mentor's Slack DM, per the documented delivery path)
  // — only this in-hub list view was incomplete. Backfills one card per
  // mentee whose most recent message is from the student (i.e. still
  // awaiting a reply); a mentee whose last message is already from the
  // mentor needs no card. Guarded to run once per page load, like
  // loadNotificationPrefs()/loadQuicklinkButtons() elsewhere in this file —
  // live-pushed messages after that keep working exactly as before via the
  // socket handler, with renderStudentMessageCard()'s new de-dup (above)
  // replacing a backfilled card in place rather than duplicating it.
  let _mentorInboxHistoryLoaded = false;
  async function loadMentorInboxHistory() {
    if (_mentorInboxHistoryLoaded) return;
    _mentorInboxHistoryLoaded = true;
    try {
      const students = await api('/api/teacher/students');
      if (!Array.isArray(students)) return;
      const mentees = students.filter(s => s.email && s.canMessage);

      const results = await Promise.all(mentees.map(async s => {
        try {
          const res = await api('/api/mentor/conversation/' + encodeURIComponent(s.email));
          return { student: s, messages: Array.isArray(res?.messages) ? res.messages : [] };
        } catch { return { student: s, messages: [] }; }
      }));

      // Oldest-first insertion, since renderStudentMessageCard() always
      // inserts at the top — ends with the final DOM order most-recent-first,
      // matching how live-pushed cards already stack.
      const pending = results
        .map(({ student, messages }) => ({ student, last: messages[messages.length - 1] }))
        .filter(({ last }) => last && last.role === 'student')
        .sort((a, b) => new Date(a.last.timestamp) - new Date(b.last.timestamp));

      const seenTs = _getSeenTs();
      for (const { student, last } of pending) {
        renderStudentMessageCard({
          studentEmail: student.email,
          studentName:  student.studentName || 'Student',
          text:         last.text,
          timestamp:    last.timestamp,
        });
        _totalCount++;
        if (new Date(last.timestamp).getTime() > seenTs) _unreadCount++;
        else document.querySelector(`#mentor-inbox-body [data-student-email="${CSS.escape(student.email)}"]`)?.classList.remove('smc-unread');
      }
      updateMentorInboxBadge();
    } catch (err) {
      console.warn('[MentorInbox] history backfill failed:', err.message);
    }
  }
  window.loadMentorInboxHistory = loadMentorInboxHistory;
})();

document.addEventListener('DOMContentLoaded', () => {
  // Sidebar section buttons
  document.querySelectorAll('.th-sidebar-btn').forEach(btn => {
    btn.addEventListener('click', () => switchSection(btn.dataset.section));
  });

  // Legacy hidden tab buttons (still wired for any remaining .th-tab selectors)
  document.querySelectorAll('.nav-btn, .th-tab').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });

  // Topbar date
  const dateEl = document.getElementById('th-date');
  if (dateEl) {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  }

  // Connect Zoom (Phase 2 per-teacher OAuth) — wired once here rather than
  // inside loadZoomPanel(), which reruns every time the Zoom Links panel
  // opens and would otherwise stack duplicate listeners on this button.
  // Branches on its own data-connected flag (set by checkZoomConnection())
  // rather than `disabled`, since the connected state is now itself the
  // disconnect trigger — a disabled button couldn't be clicked at all.
  document.getElementById('zoomConnectBtn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.connected === 'true') {
      if (!confirm('Disconnect Zoom? You\'ll need to reconnect before hosting a Meeting SDK session again.')) return;
      btn.disabled = true;
      try {
        await api('/api/teacher/zoom-disconnect', { method: 'POST' });
        showToast('Zoom disconnected.');
      } catch (err) {
        showToast('Failed to disconnect: ' + err.message);
      }
      checkZoomConnection();
    } else {
      window.location.href = '/auth/zoom';
    }
  });

  // ── Handle Zoom OAuth callback result ─────────────────────────────────────
  refreshOfficeHoursBadge();
  const _zoomParams = new URLSearchParams(window.location.search);
  // Deep link from the "Office-hours request" Slack DM (lib/office-hours-bookings.js).
  if (_zoomParams.get('panel') === 'office-hours') {
    window.history.replaceState({}, '', '/teacher');
    switchSection('settings');
    switchPanel('office-hours');
  }
  const _zoomResult = _zoomParams.get('zoom');
  if (_zoomResult) {
    window.history.replaceState({}, '', '/teacher');
    if (_zoomResult === 'connected') {
      const _zoomUser = _zoomParams.get('zoomUser') || 'your Zoom account';
      showToast(`✓ Connected to Zoom as ${_zoomUser}`);
      checkZoomConnection(); // updates the button immediately if Meetings is already the active panel
    } else if (_zoomResult === 'denied') {
      showToast('Zoom connection cancelled.');
    } else if (_zoomResult === 'error') {
      showToast('Zoom connection failed. Please try again.');
    }
  }

  // Manual check-in dot refresh (server still caps upstream calls at one / 20s)
  document.getElementById('cl-refresh-btn')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const el = document.getElementById('cl-updated');
    if (el) el.textContent = 'checking…';
    try { await loadCheckinLights(); } finally { setTimeout(() => { btn.disabled = false; }, 1500); }
  });

  // Student search + filter
  document.getElementById('sc-search-input')?.addEventListener('input', renderStudentCards);
  document.querySelectorAll('.sc-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sc-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderStudentCards();
    });
  });

  // Convo panel — Ctrl/Cmd+Enter to send
  document.getElementById('convo-input')?.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendConvoReply();
  });

  // Quick broadcast strip
  document.getElementById('sc-broadcast-btn')?.addEventListener('click', quickBroadcast);
  document.getElementById('sc-broadcast-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') quickBroadcast();
  });

  // Broadcast type selector
  document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.broadcastType = btn.dataset.type;
      const mediaGroup = document.getElementById('broadcast-media-group');
      const mediaLabel = document.getElementById('broadcast-media-label');
      const recordUI   = document.getElementById('record-ui');
      const sendBtn    = document.getElementById('send-broadcast-btn');

      if (btn.dataset.type === 'text') {
        mediaGroup.style.display = 'none';
        if (recordUI) recordUI.style.display = 'none';
        if (sendBtn)  sendBtn.style.display = '';
      } else if (btn.dataset.type === 'record') {
        mediaGroup.style.display = 'none';
        if (recordUI) { recordUI.style.display = ''; showRecordState('idle'); }
        if (sendBtn)  sendBtn.style.display = 'none'; // send handled by record-send-btn
        loadRecordingLibrary();
      } else {
        mediaGroup.style.display = '';
        if (recordUI) recordUI.style.display = 'none';
        if (sendBtn)  sendBtn.style.display = '';
        mediaLabel.textContent = { image:'Image URL', youtube:'YouTube URL', audio:'Audio URL' }[btn.dataset.type] || 'Media URL';
      }
    });
  });

  // Broadcast target
  document.querySelectorAll('input[name="broadcast-target"]').forEach(r => {
    r.addEventListener('change', () => {
      document.getElementById('target-students-wrap').style.display =
        r.value === 'specific' && r.checked ? '' : 'none';
    });
  });

  // Schedule checkbox
  document.getElementById('broadcast-schedule-check')?.addEventListener('change', e => {
    document.getElementById('broadcast-schedule-time').style.display = e.target.checked ? '' : 'none';
  });

  // Repeat checkbox
  document.getElementById('broadcast-repeat-check')?.addEventListener('change', e => {
    document.getElementById('broadcast-repeat-mins').style.display = e.target.checked ? '' : 'none';
  });

  // Broadcast send/clear
  document.getElementById('send-broadcast-btn')?.addEventListener('click', sendBroadcast);
  document.getElementById('clear-broadcast-btn')?.addEventListener('click', clearBroadcast);

  // Chat log filters
  document.getElementById('chatlog-search')?.addEventListener('input', () => loadChatlog());
  document.getElementById('chatlog-student')?.addEventListener('input', () => loadChatlog());
  document.getElementById('chatlog-flagged-toggle')?.addEventListener('click', function() {
    state.chatlogFlagged = !state.chatlogFlagged;
    this.dataset.active = state.chatlogFlagged ? '1' : '0';
    loadChatlog();
  });

  // Website filters
  document.getElementById('website-search')?.addEventListener('input', () => loadWebsites());
  document.getElementById('website-student')?.addEventListener('input', () => loadWebsites());

  // Roster add/cancel
  document.getElementById('add-student-btn')?.addEventListener('click', () => {
    document.getElementById('add-student-row').style.display = '';
    document.getElementById('new-student-name').focus();
  });
  document.getElementById('cancel-add-student')?.addEventListener('click', () => {
    document.getElementById('add-student-row').style.display = 'none';
  });
  document.getElementById('confirm-add-student')?.addEventListener('click', addStudent);
  document.getElementById('new-student-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addStudent();
  });
  document.getElementById('add-group-btn')?.addEventListener('click', addGroup);

  // Recording buttons
  document.getElementById('record-start-btn')?.addEventListener('click', startRecording);
  document.getElementById('record-stop-btn')?.addEventListener('click', stopRecording);
  document.getElementById('record-rerecord-btn')?.addEventListener('click', reRecord);
  document.getElementById('record-send-btn')?.addEventListener('click', sendRecording);

  // Prompt inventory filters
  ['prompt-search','prompt-student-filter','prompt-subject-filter','prompt-flagged-only','prompt-sort-by'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => renderPromptInventory(state.chatlog || []));
    document.getElementById(id)?.addEventListener('input', () => renderPromptInventory(state.chatlog || []));
  });
  ['prompt-date-from','prompt-date-to'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => renderPromptInventory(state.chatlog || []));
  });
  document.getElementById('prompt-date-clear')?.addEventListener('click', () => {
    document.getElementById('prompt-date-from').value = '';
    document.getElementById('prompt-date-to').value = '';
    renderPromptInventory(state.chatlog || []);
  });
  document.getElementById('export-prompts-btn')?.addEventListener('click', exportPromptsCsv);
  document.getElementById('prompt-modal-close')?.addEventListener('click', () => {
    document.getElementById('prompt-detail-modal').style.display = 'none';
  });

  // Analytics date range + export
  ['analytics-date-from','analytics-date-to'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
      // A manual custom-range edit means "no longer following a specific
      // week" — the prev/next/This Week controls resume relative to today
      // the next time they're used, rather than silently jumping off
      // whatever custom range was just typed in.
      _analyticsWeekOffset = 0;
      updateAnalyticsLabelForCustomRange();
      loadAnalytics();
    });
  });
  document.getElementById('export-analytics-btn')?.addEventListener('click', exportAnalyticsCsv);

  // Week navigation (defaults Analytics to the current week instead of
  // all-time — see getAnalyticsWeekRange()/applyAnalyticsWeek() below)
  document.getElementById('analytics-week-prev')?.addEventListener('click', () => {
    _analyticsWeekOffset -= 1;
    applyAnalyticsWeek();
  });
  document.getElementById('analytics-week-next')?.addEventListener('click', () => {
    if (_analyticsWeekOffset >= 0) return; // no browsing into the future
    _analyticsWeekOffset += 1;
    applyAnalyticsWeek();
  });
  document.getElementById('analytics-week-thisweek')?.addEventListener('click', () => {
    _analyticsWeekOffset = 0;
    applyAnalyticsWeek();
  });
  document.getElementById('analytics-week-custom-toggle')?.addEventListener('click', () => {
    const nowShowing = document.getElementById('analytics-date-from-wrap').style.display !== 'none';
    document.getElementById('analytics-date-from-wrap').style.display = nowShowing ? 'none' : '';
    document.getElementById('analytics-date-to-wrap').style.display   = nowShowing ? 'none' : '';
    document.getElementById('analytics-week-custom-toggle').textContent = nowShowing ? 'Custom range' : 'Hide custom range';
    // Switching back to week-nav mode after a custom-range excursion should
    // show a real week again, not leave whatever custom dates were typed.
    if (nowShowing) applyAnalyticsWeek();
  });
  applyAnalyticsWeek(); // default to the current week on first load

  // Load teacher identity
  fetch('/api/teacher/me').then(r => r.ok ? r.json() : null).then(me => {
    if (!me) return;
    window.teacherEmail = me.email || '';
    window._isAdminTeacher = !!me.isAdmin;
    // Display hint only — renderStudentCard() uses this to decide whether to
    // show the Pulse button at all. The server checks the real flag (and the
    // mentor assignment) again on every Pulse request regardless of this.
    window._pulseEnabled = !!me.pulseEnabled;
    // /me can resolve after the student cards' first render (it's a separate
    // fetch, no fixed ordering) — re-render once it lands so the Pulse button
    // doesn't wait for the next 15s poll to appear for an allowed teacher.
    if (window._pulseEnabled && typeof renderStudentCards === 'function') renderStudentCards();
    const pulseOverviewBtn = document.getElementById('pulse-overview-btn');
    if (pulseOverviewBtn) pulseOverviewBtn.style.display = window._pulseEnabled ? '' : 'none';
    // window._teacherSocket is the socket declared inside initMentorInbox()'s
    // IIFE (exposed there specifically so it's reachable from out here) — a
    // bare `socket` reference here was out of scope and threw silently.
    if (window._teacherSocket?.connected && window.teacherEmail) {
      window._teacherSocket.emit('registerTeacher', { email: window.teacherEmail });
    }
    const idEl   = document.getElementById('teacher-identity');
    const nameEl = document.getElementById('teacher-identity-name');
    const adminLink = document.getElementById('admin-portal-link');
    if (idEl && nameEl) {
      nameEl.textContent = me.name || me.username;
      nameEl.title = me.name || me.username || '';
      idEl.style.display = 'block';
    }
    if (adminLink && me.isAdmin) adminLink.style.display = 'block';
  }).catch(err => console.error('[TeacherIdentity] load failed:', err.message));

  // Weekly mentor message
  document.getElementById('weekly-msg-input')?.addEventListener('input', function() {
    const countEl = document.getElementById('wmp-count');
    if (countEl) countEl.textContent = this.value.length;
  });
  loadWeeklyMessage();

  // Start — initialize sidebar with Students section
  switchSection('students');
  startPolling();
  connectTeacherEvents();

  // Pause/resume the Student Monitor check-in lights poll with tab visibility.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startCheckinLightsRefresh();
    else stopCheckinLightsRefresh();
  });

  // Watch the mentor-inbox badge and keep sidebar + sub-nav badges in sync
  const _miBadge = document.getElementById('mentor-inbox-nav-badge');
  if (_miBadge) {
    new MutationObserver(() => { updateSidebarBadges(); _refreshLiveSubnavBadges(); })
      .observe(_miBadge, { childList: true, attributes: true, attributeFilter: ['style'] });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE 1 — AUDIO RECORDING
// ══════════════════════════════════════════════════════════════════════════════
let _mediaRecorder = null;
let _audioChunks   = [];
let _recordTimer   = null;
let _recordSecs    = 0;
let _audioCtx      = null;
let _analyser      = null;
let _animFrame     = null;
let _recordedBlob  = null;
let _recordedMime  = '';

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    _audioCtx  = new AudioContext();
    _analyser  = _audioCtx.createAnalyser();
    _analyser.fftSize = 256;
    _audioCtx.createMediaStreamSource(stream).connect(_analyser);

    const mimeType = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm']
      .find(m => MediaRecorder.isTypeSupported(m)) || 'audio/webm';
    _recordedMime = mimeType;
    _mediaRecorder = new MediaRecorder(stream, { mimeType });
    _audioChunks = [];

    _mediaRecorder.ondataavailable = e => { if (e.data.size > 0) _audioChunks.push(e.data); };
    _mediaRecorder.onstop = () => {
      _recordedBlob = new Blob(_audioChunks, { type: _recordedMime });
      document.getElementById('record-playback-audio').src = URL.createObjectURL(_recordedBlob);
      document.getElementById('record-final-duration').textContent = fmtDuration(_recordSecs);
      stream.getTracks().forEach(t => t.stop());
      if (_audioCtx) { _audioCtx.close(); _audioCtx = null; }
      cancelAnimationFrame(_animFrame);
      clearInterval(_recordTimer);
      showRecordState('preview');
    };

    _mediaRecorder.start(100);
    _recordSecs = 0;
    clearInterval(_recordTimer);
    _recordTimer = setInterval(() => {
      _recordSecs++;
      const el = document.getElementById('record-timer-display');
      if (el) el.textContent = fmtDuration(_recordSecs);
    }, 1000);

    drawWaveform();
    showRecordState('active');
  } catch {
    alert('Microphone access denied. Please allow microphone access in your browser settings.');
  }
}

function stopRecording() {
  if (_mediaRecorder && _mediaRecorder.state !== 'inactive') _mediaRecorder.stop();
  clearInterval(_recordTimer);
}

function reRecord() {
  _recordedBlob = null;
  const a = document.getElementById('record-playback-audio');
  if (a) a.src = '';
  showRecordState('idle');
}

function showRecordState(s) {
  ['idle','active','preview'].forEach(n => {
    const el = document.getElementById(`record-${n}-state`);
    if (el) el.style.display = n === s ? '' : 'none';
  });
}

function drawWaveform() {
  const canvas = document.getElementById('record-waveform');
  if (!canvas || !_analyser) return;
  const ctx = canvas.getContext('2d');
  const data = new Uint8Array(_analyser.frequencyBinCount);
  const W = canvas.offsetWidth || 200;
  canvas.width = W;
  const H = canvas.height;

  function draw() {
    _animFrame = requestAnimationFrame(draw);
    _analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, W, H);
    const bw = (W / data.length) * 2.5;
    let x = 0;
    for (let i = 0; i < data.length; i++) {
      const h = (data[i] / 255) * H;
      ctx.fillStyle = `hsl(${210 + (i / data.length) * 40}, 75%, 55%)`;
      ctx.fillRect(x, H - h, bw - 1, h);
      x += bw;
    }
  }
  draw();
}

async function sendRecording() {
  if (!_recordedBlob) return;
  const targetVal = document.querySelector('input[name="broadcast-target"]:checked')?.value;
  const targetStudents = targetVal === 'specific'
    ? (document.getElementById('broadcast-target-students')?.value || '').split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const sentTo = targetStudents.length ? targetStudents.join(', ') : 'All Students';

  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    const status = document.getElementById('broadcast-status');

    const result = await api('/api/teacher/recordings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioBase64: base64, mimeType: _recordedMime, durationSec: _recordSecs, sentTo }),
    });
    if (!result?.url) { if (status) { status.className = 'save-status error'; status.textContent = 'Save failed.'; } return; }

    await api('/api/teacher/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Voice message from your teacher', broadcastType: 'audio', mediaUrl: result.url, targetStudents }),
    });

    showRecordState('idle');
    _recordedBlob = null;
    loadBroadcast();
    loadRecordingLibrary();
    if (status) { status.className = 'save-status success'; status.textContent = '✓ Voice broadcast sent!'; setTimeout(() => { status.textContent = ''; }, 3000); }
  };
  reader.readAsDataURL(_recordedBlob);
}

async function loadRecordingLibrary() {
  const list = document.getElementById('recording-library-list');
  if (!list) return;
  const recs = await api('/api/teacher/recordings');
  if (!recs?.length) { list.innerHTML = '<div class="empty-state">No recordings saved yet.</div>'; return; }
  list.innerHTML = recs.map(r => `
    <div class="recording-entry">
      <div class="recording-info">
        <span class="recording-date">${fmtTs(r.timestamp)}</span>
        <span class="recording-duration">${fmtDuration(r.durationSec || 0)}</span>
        <span class="recording-sent-to">→ ${esc(r.sentTo)}</span>
      </div>
      <div class="recording-actions">
        <audio class="recording-audio" controls src="${esc(r.url)}"></audio>
        <button class="btn-primary btn-sm" onclick="reuseRecording('${esc(r.url)}')">📢 Reuse</button>
        <button class="btn-danger btn-sm" onclick="deleteRecording('${esc(r.id)}')">🗑</button>
      </div>
    </div>`).join('');
}

function fmtDuration(secs) {
  const m = Math.floor((secs || 0) / 60);
  const s = (secs || 0) % 60;
  return `${m}:${String(s).padStart(2,'0')}`;
}

async function reuseRecording(url) {
  await api('/api/teacher/broadcast', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Voice message from your teacher', broadcastType: 'audio', mediaUrl: url }),
  });
  loadBroadcast();
}

async function deleteRecording(id) {
  if (!confirm('Delete this recording?')) return;
  await api(`/api/teacher/recordings/${id}`, { method: 'DELETE' });
  loadRecordingLibrary();
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE 2 — PROMPT INVENTORY
// ══════════════════════════════════════════════════════════════════════════════
let _promptInventoryRows = []; // the currently-filtered/sorted table, set by renderPromptInventory()

async function loadPromptInventory() {
  const log = await api('/api/teacher/chatlog');
  if (!log) return;
  state.chatlog = log;
  renderPromptInventory(log);
}

function renderPromptInventory(log) {
  const search    = (document.getElementById('prompt-search')?.value || '').toLowerCase();
  const student   = (document.getElementById('prompt-student-filter')?.value || '').toLowerCase();
  const subject   = document.getElementById('prompt-subject-filter')?.value || '';
  const flagOnly  = document.getElementById('prompt-flagged-only')?.checked || false;
  const dateFrom  = document.getElementById('prompt-date-from')?.value || '';
  const dateTo    = document.getElementById('prompt-date-to')?.value || '';
  const sortBy    = document.getElementById('prompt-sort-by')?.value || 'time-desc';

  let rows = [...(log || [])];
  if (search)   rows = rows.filter(e => e.prompt.toLowerCase().includes(search) || e.response.toLowerCase().includes(search));
  if (student)  rows = rows.filter(e => e.studentName.toLowerCase().includes(student));
  if (subject)  rows = rows.filter(e => e.subject === subject);
  if (flagOnly) rows = rows.filter(e => e.flagged);
  if (dateFrom) rows = rows.filter(e => e.timestamp >= dateFrom);
  if (dateTo)   rows = rows.filter(e => e.timestamp <= dateTo + 'T23:59:59');

  if (sortBy === 'time-asc')  rows.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  else if (sortBy === 'student') rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
  else if (sortBy === 'subject') rows.sort((a, b) => (a.subject || '').localeCompare(b.subject || ''));

  // exportPromptsCsv() reads this instead of the raw, unfiltered state.chatlog —
  // otherwise Export CSV silently ignores every filter above and dumps the
  // entire log regardless of what's actually shown in the table.
  _promptInventoryRows = rows;

  const countEl = document.getElementById('prompts-count');
  if (countEl) countEl.textContent = `${rows.length} prompts`;

  const wrap = document.getElementById('prompt-table-wrap');
  if (!wrap) return;
  if (!rows.length) { wrap.innerHTML = '<div class="empty-state">No prompts match your filters.</div>'; return; }

  wrap.innerHTML = `<table class="student-table prompt-table">
    <thead><tr>
      <th>Time</th><th>Student</th><th>Subject</th><th>Prompt</th><th>Flags</th><th></th>
    </tr></thead>
    <tbody>${rows.map(e => `
      <tr class="${e.flagged ? 'flagged-row' : ''}">
        <td class="ts-cell">${fmtTs(e.timestamp)}</td>
        <td><strong>${esc(e.studentName)}</strong></td>
        <td><span class="subject-tag">${esc(e.subject || 'General')}</span></td>
        <td class="prompt-cell" title="${esc(e.prompt)}">${esc(e.prompt.slice(0,85))}${e.prompt.length > 85 ? '…' : ''}</td>
        <td>${e.flagged ? `<span class="flag-chip">${esc((e.flagReasons || []).slice(0,2).join(', '))}</span>` : ''}</td>
        <td><button class="btn-ghost btn-sm" onclick="showPromptDetail('${esc(e.id)}')">View</button></td>
      </tr>`).join('')}
    </tbody></table>`;
}

function showPromptDetail(id) {
  const entry = (state.chatlog || []).find(e => e.id === id);
  if (!entry) return;
  const modal = document.getElementById('prompt-detail-modal');
  const content = document.getElementById('prompt-detail-content');
  if (!modal || !content) return;
  content.innerHTML = `
    <div class="prompt-detail-header">
      <strong>${esc(entry.studentName)}</strong>
      <span class="subject-tag">${esc(entry.subject || 'General')}</span>
      ${entry.flagged ? `<span class="flag-chip">🚩 ${esc((entry.flagReasons || []).join(', '))}</span>` : ''}
      <span class="muted-ts">${fmtTs(entry.timestamp)}</span>
    </div>
    <div class="prompt-detail-section">
      <div class="prompt-detail-label">Student Prompt</div>
      <div class="prompt-detail-text prompt-bubble">${esc(entry.prompt)}</div>
    </div>
    <div class="prompt-detail-section">
      <div class="prompt-detail-label">AI Response</div>
      <div class="prompt-detail-text response-bubble">${esc(entry.response || '(not recorded)')}</div>
    </div>`;
  modal.style.display = 'flex';
}

function exportPromptsCsv() {
  const log = _promptInventoryRows;
  const headers = ['Date/Time','Student','Subject','Prompt','Response','Flagged','Flag Reasons'];
  const rows = log.map(e => [
    fmtTs(e.timestamp), e.studentName, e.subject || 'General',
    e.prompt, e.response || '', e.flagged ? 'Yes' : 'No',
    (e.flagReasons || []).join('; '),
  ]);
  const csv = [headers, ...rows].map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })),
    download: `ysc-prompts-${new Date().toISOString().slice(0,10)}.csv`,
  });
  a.click();
}

// ══════════════════════════════════════════════════════════════════════════════
//  FEATURE 3 — ANALYTICS
// ══════════════════════════════════════════════════════════════════════════════
const STOPWORDS = new Set([
  'the','a','an','is','are','was','were','be','been','have','has','had','do','does','did',
  'will','would','could','should','may','might','can','and','or','but','if','in','on','at',
  'to','for','of','with','by','from','up','about','into','this','that','these','those',
  'what','which','who','how','when','where','why','not','no','so','as','just','than',
  'then','also','like','get','need','want','know','help','please','any','some','more',
  'much','all','one','two','there','my','your','his','her','its','our','their','i','me',
  'we','you','he','she','it','they','him','us','them','don','doesn','didn','isn','wasn',
]);

const PROMPT_CATEGORIES = [
  { name: 'Assignment Help',      re: /\b(explain|understand|how (do|to|does)|what is|confused|concept)\b/i },
  { name: 'Writing Help',         re: /\b(write|essay|proofread|grammar|improve|feedback|review|paragraph|thesis|draft)\b/i },
  { name: 'YouTube / Video',      re: /\b(youtube|video|tutorial|watch)\b/i },
  { name: 'Missing Assignments',  re: /\b(missing|overdue|late|behind|haven.t|past due)\b/i },
  { name: 'Grade Inquiry',        re: /\b(grade|score|points|rubric|graded|earned)\b/i },
  { name: 'Drive / Files',        re: /\b(file|document|drive|find my|report|doc|word)\b/i },
  { name: 'Canvas / Due Dates',   re: /\b(due|deadline|calendar|schedule|upcoming|canvas)\b/i },
  { name: 'Math Help',            re: /\b(solve|equation|math|algebra|calculus|calculate|formula)\b/i },
  { name: 'Science Help',         re: /\b(biology|chemistry|physics|science|lab|experiment)\b/i },
  { name: 'Academic Integrity',   useFlag: true },
];

function getWordFreq(log, top = 50) {
  const freq = {};
  for (const e of log) {
    for (const w of e.prompt.toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/)) {
      if (w.length > 2 && !STOPWORDS.has(w)) freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq).sort((a,b) => b[1]-a[1]).slice(0, top);
}

// ── Analytics week navigation ─────────────────────────────────────────────────
// Analytics used to default to an unfiltered all-time view — the word cloud,
// top words, and every other chart just averaged over the entire chat log
// forever, so a handful of week-1 conversations could dominate the cloud
// indefinitely even months later. Defaulting to "this week" (and giving a
// way to step back through past weeks) makes the numbers mean "this week",
// matching what a teacher checking in periodically actually wants, while
// "Custom range" still reaches the old any-dates behavior for anyone who
// wants a longer or different window.
let _analyticsWeekOffset = 0; // 0 = current week, -1 = last week, etc.
// The currently-rendered, date-filtered Analytics dataset — exportAnalyticsCsv()
// reads this instead of the shared `state.chatlog`, which belongs to the Chat
// Log / Prompt Inventory panels and is unrelated to whatever Analytics window
// (this week, a past week, or a custom range) is actually on screen.
let _analyticsData = [];

// Same Monday–Sunday convention public/growth.js already uses for its
// weekly-goals date label, so "week" means the same thing everywhere in
// this app.
function getAnalyticsWeekRange(offsetWeeks) {
  const today  = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1) + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  // Local Y/M/D, not toISOString() (which converts to UTC first) — a
  // positive-UTC-offset browser would otherwise roll local midnight back
  // onto the previous calendar day.
  const toISODate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmt       = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return {
    from:  toISODate(monday),
    to:    toISODate(sunday),
    label: `Week of ${fmt(monday)} – ${fmt(sunday)}${sunday.getFullYear() !== today.getFullYear() ? ', ' + sunday.getFullYear() : ''}`,
  };
}

function applyAnalyticsWeek() {
  const { from, to, label } = getAnalyticsWeekRange(_analyticsWeekOffset);
  const fromEl = document.getElementById('analytics-date-from');
  const toEl   = document.getElementById('analytics-date-to');
  if (fromEl) fromEl.value = from;
  if (toEl)   toEl.value   = to;

  const labelEl = document.getElementById('analytics-week-label');
  if (labelEl) labelEl.textContent = _analyticsWeekOffset === 0 ? `${label} (this week)` : label;

  const nextBtn = document.getElementById('analytics-week-next');
  if (nextBtn) nextBtn.disabled = _analyticsWeekOffset >= 0; // no browsing into the future

  loadAnalytics();
}

// Mirrors getAnalyticsWeekRange()'s "MMM D" formatting, but parses an
// already-chosen 'YYYY-MM-DD' input value instead of computing a Monday–Sunday
// span — a hand-typed custom range isn't necessarily a real calendar week, so
// it gets its own "From – To" label rather than reusing the "Week of" wording.
function fmtAnalyticsDate(isoDateStr) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function updateAnalyticsLabelForCustomRange() {
  const labelEl = document.getElementById('analytics-week-label');
  if (!labelEl) return;
  const from = document.getElementById('analytics-date-from')?.value || '';
  const to   = document.getElementById('analytics-date-to')?.value   || '';
  if (!from && !to) { labelEl.textContent = 'All time'; return; }
  const toYear   = to ? Number(to.slice(0, 4)) : null;
  const nowYear  = new Date().getFullYear();
  const yearSfx  = toYear && toYear !== nowYear ? `, ${toYear}` : '';
  labelEl.textContent = `${from ? fmtAnalyticsDate(from) : '…'} – ${to ? fmtAnalyticsDate(to) : '…'}${yearSfx}`;
}

async function loadAnalytics() {
  const log = await api('/api/teacher/chatlog');
  if (!log) return;

  const from = document.getElementById('analytics-date-from')?.value || '';
  const to   = document.getElementById('analytics-date-to')?.value   || '';
  const data = log.filter(e =>
    (!from || e.timestamp >= from) && (!to || e.timestamp <= to + 'T23:59:59')
  );
  _analyticsData = data;

  renderAnalyticsSummary(data);
  renderWordCloud(data);
  renderTopWordsChart(data);
  renderCategoriesChart(data);
  renderDayChart(data);
  renderHourChart(data);
  renderSubjectChart(data);
  renderStudentChart(data);
  renderConcernFlags(data);
}

function renderAnalyticsSummary(data) {
  const el = document.getElementById('analytics-stats');
  if (!el) return;
  const total   = data.length;
  const uniq    = new Set(data.map(e => e.studentName)).size;
  const flagged = data.filter(e => e.flagged).length;
  const integ   = data.filter(e => e.academicIntegrity).length;
  const avg     = uniq ? Math.round(total / uniq) : 0;
  el.innerHTML = [
    { label:'Total Prompts',      value:total },
    { label:'Unique Students',    value:uniq },
    { label:'Flagged Prompts',    value:flagged, warn:flagged>0 },
    { label:'Integrity Flags',    value:integ,   warn:integ>0 },
    { label:'Avg per Student',    value:avg },
  ].map(s => `<div class="analytics-stat${s.warn?' stat-warn':''}">
    <div class="stat-value">${s.value}</div>
    <div class="stat-label">${s.label}</div>
  </div>`).join('');
}

function renderWordCloud(data) {
  const el = document.getElementById('word-cloud');
  if (!el) return;
  const words = getWordFreq(data, 50);
  if (!words.length) { el.innerHTML = '<div class="empty-state" style="padding:20px">No data yet.</div>'; return; }
  const max = words[0][1], min = words[words.length-1][1];
  el.innerHTML = words.map(([word, count]) => {
    const ratio = max === min ? 0.5 : (count-min)/(max-min);
    const size  = (0.8 + ratio * 2.2).toFixed(2);
    const light = Math.round(28 + (1-ratio)*44);
    return `<span class="cloud-word" style="font-size:${size}rem;color:hsl(228,85%,${light}%)" title="${count} uses">${esc(word)}</span>`;
  }).join('');
}

function barChartHtml(entries, colorClass = '') {
  if (!entries.length) return '<div class="empty-state" style="padding:16px">No data.</div>';
  const max = entries[0][1];
  return entries.map(([label, count, extra]) => `
    <div class="chart-row">
      <span class="chart-label" title="${esc(label)}">${esc(label)}</span>
      <div class="chart-track"><div class="chart-bar ${colorClass}" style="width:${(count/max*100).toFixed(1)}%"></div></div>
      <span class="chart-count">${count}${extra ? ` <span class="chart-pct">${extra}</span>` : ''}</span>
    </div>`).join('');
}

function renderTopWordsChart(data) {
  const el = document.getElementById('top-words-chart');
  if (el) el.innerHTML = barChartHtml(getWordFreq(data, 10));
}

function renderCategoriesChart(data) {
  const el = document.getElementById('prompt-categories-chart');
  if (!el) return;
  const counts = {};
  for (const e of data) {
    let hit = false;
    for (const cat of PROMPT_CATEGORIES) {
      if (cat.useFlag) { if (e.academicIntegrity) { counts[cat.name] = (counts[cat.name]||0)+1; hit=true; } }
      else if (cat.re.test(e.prompt)) { counts[cat.name] = (counts[cat.name]||0)+1; hit=true; break; }
    }
    if (!hit) counts['Other'] = (counts['Other']||0)+1;
  }
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,12);
  el.innerHTML = barChartHtml(sorted, 'chart-bar-teal');
}

function renderDayChart(data) {
  const el = document.getElementById('usage-by-day-chart');
  if (!el) return;
  const byDay = {};
  for (const e of data) { const d = e.timestamp?.slice(0,10); if (d) byDay[d]=(byDay[d]||0)+1; }
  const sorted = Object.entries(byDay).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
  if (!sorted.length) { el.innerHTML = '<div class="empty-state" style="padding:16px">No data.</div>'; return; }
  const max = Math.max(...sorted.map(([,v])=>v));
  el.innerHTML = `<div class="day-chart">${sorted.map(([day,count]) =>
    `<div class="day-col" title="${day}: ${count}"><div class="day-bar" style="height:${(count/max*100).toFixed(0)}%"></div><div class="day-label">${day.slice(5)}</div></div>`
  ).join('')}</div>`;
}

function renderHourChart(data) {
  const el = document.getElementById('usage-by-hour-chart');
  if (!el) return;
  const byHour = Array.from({length:24},(_,i)=>[i,0]);
  for (const e of data) { const h = new Date(e.timestamp).getHours(); if (!isNaN(h)) byHour[h][1]++; }
  const max = Math.max(...byHour.map(([,v])=>v)) || 1;
  el.innerHTML = `<div class="hour-chart">${byHour.map(([h,count]) => {
    const lbl = h===0?'12a':h<12?`${h}a`:h===12?'12p':`${h-12}p`;
    return `<div class="hour-col" title="${lbl}: ${count}"><div class="hour-bar" style="height:${(count/max*100).toFixed(0)}%"></div><div class="hour-label">${h%6===0?lbl:''}</div></div>`;
  }).join('')}</div>`;
}

function renderSubjectChart(data) {
  const el = document.getElementById('subject-chart');
  if (!el) return;
  const counts = {};
  for (const e of data) { const s=e.subject||'General'; counts[s]=(counts[s]||0)+1; }
  const total = data.length || 1;
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  el.innerHTML = barChartHtml(sorted.map(([s,c]) => [s,c,`(${(c/total*100).toFixed(0)}%)`]), 'chart-bar-purple');
}

function renderStudentChart(data) {
  const el = document.getElementById('student-activity-chart');
  if (!el) return;
  const counts = {};
  for (const e of data) counts[e.studentName]=(counts[e.studentName]||0)+1;
  const sorted = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  el.innerHTML = barChartHtml(sorted, 'chart-bar-green');
}

function renderConcernFlags(data) {
  const el = document.getElementById('concern-flags-summary');
  if (!el) return;
  const integ  = data.filter(e => e.academicIntegrity).length;
  const flagged = data.filter(e => e.flagged && !e.academicIntegrity).length;
  const reasonCounts = {};
  for (const e of data.filter(e=>e.flagged)) {
    for (const r of e.flagReasons||[]) reasonCounts[r]=(reasonCounts[r]||0)+1;
  }
  const topReasons = Object.entries(reasonCounts).sort((a,b)=>b[1]-a[1]).slice(0,10);
  el.innerHTML = `
    <div class="concern-stats-row">
      <div class="concern-stat${integ>0?' concern-warn':''}">
        <div class="concern-value">${integ}</div>
        <div class="concern-label">Academic Integrity Attempts</div>
      </div>
      <div class="concern-stat${flagged>0?' concern-warn':''}">
        <div class="concern-value">${flagged}</div>
        <div class="concern-label">Other Flagged Prompts</div>
      </div>
    </div>
    ${topReasons.length
      ? `<h4 class="analytics-subsection-title">Most Common Flag Triggers</h4>${barChartHtml(topReasons,'chart-bar-red')}`
      : '<div class="empty-state" style="padding:18px">No flagged prompts yet — great!</div>'}`;
}

function exportAnalyticsCsv() {
  const log = _analyticsData;
  const wordFreq = getWordFreq(log, 50);
  const subjectCounts = {};
  for (const e of log) { const s=e.subject||'General'; subjectCounts[s]=(subjectCounts[s]||0)+1; }
  const studentCounts = {};
  for (const e of log) studentCounts[e.studentName]=(studentCounts[e.studentName]||0)+1;

  const rows = [
    ['=== SUMMARY ==='],
    ['Total Prompts', log.length],
    ['Unique Students', new Set(log.map(e=>e.studentName)).size],
    ['Flagged', log.filter(e=>e.flagged).length],
    ['Integrity Flags', log.filter(e=>e.academicIntegrity).length],
    [],
    ['=== STUDENTS ===','Prompt Count'],
    ...Object.entries(studentCounts).sort((a,b)=>b[1]-a[1]),
    [],
    ['=== SUBJECTS ===','Prompt Count'],
    ...Object.entries(subjectCounts).sort((a,b)=>b[1]-a[1]),
    [],
    ['=== TOP 50 WORDS ===','Count'],
    ...wordFreq,
  ];
  const csv = rows.map(r=>(r||[]).map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = Object.assign(document.createElement('a'),{
    href: URL.createObjectURL(new Blob([csv],{type:'text/csv'})),
    download: `ysc-analytics-${new Date().toISOString().slice(0,10)}.csv`,
  });
  a.click();
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, isHtml = false) {
  let toast = document.getElementById('ysc-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ysc-toast';
    toast.style.cssText = 'position:fixed;bottom:24px;right:24px;background:var(--sp-yellow);color:var(--sp-ink);border:2px solid var(--sp-ink);box-shadow:5px 5px 0 var(--sp-ink);padding:10px 18px;border-radius:40px;font-size:.83rem;font-weight:600;z-index:9999;opacity:0;transition:opacity .2s;display:flex;align-items:center;gap:6px;max-width:400px';
    document.body.appendChild(toast);
  }
  if (isHtml || msg.includes('<')) {
    toast.innerHTML = msg;
  } else {
    toast.textContent = msg;
  }
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = '0'; }, 5000);
}

// ── People Panel / Support Team ───────────────────────────────────────────────

let _currentAvailStatus = 'offline';
let _soccerSchedule     = { schedule: [], upcomingEvent: '' };
let _editingMemberId    = null;

// ── Availability cycle button in sidebar ─────────────────────────────────────
(function initAvailCycleBtn() {
  const btn  = document.getElementById('avail-cycle-btn');
  const dot  = document.getElementById('avail-dot-sm');
  const text = document.getElementById('avail-text-sm');
  if (!btn) return;

  const CYCLE   = ['available', 'busy', 'offline'];
  const LABELS  = { available: 'Available', busy: 'Busy', offline: 'Offline' };

  function applyStatus(status) {
    _currentAvailStatus = status;
    if (dot)  { dot.className = `avail-dot-sm avail-${status}`; }
    if (text) { text.textContent = LABELS[status] || 'Set Availability'; }
  }

  // Load current status
  api('/api/teacher/support-team').then(data => {
    const first = data?.members?.[0];
    if (first) applyStatus(first.availability || 'offline');
  }).catch(() => {});

  btn.addEventListener('click', async () => {
    const prev = _currentAvailStatus;
    const idx  = CYCLE.indexOf(_currentAvailStatus);
    const next = CYCLE[(idx + 1) % CYCLE.length];
    applyStatus(next);
    try {
      await api('/api/teacher/availability', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ availability: next }),
      });
    } catch (err) {
      // applyStatus() above already updated the dot optimistically — a
      // failed request left uncaught here (found via a real pilot-day
      // test) meant the UI kept showing the new status with zero
      // indication it was never actually saved. Roll back so the dot
      // never lies about what's actually persisted server-side.
      applyStatus(prev);
      showToast(`Could not update status — ${err?.message || 'network error'}. Try again.`, false);
    }
  });
})();

// ── People panel ──────────────────────────────────────────────────────────────
async function loadPeoplePanel() {
  await Promise.all([loadTeamMembers(), loadSoccerEditor()]);
  wireAvailButtons();
  wireSoccerEditor();
  wireTeamMemberModal();
}

async function loadTeamMembers() {
  const el = document.getElementById('people-team-list');
  if (!el) return;
  const data = await api('/api/teacher/support-team');
  const members = data?.members || [];

  if (!members.length) {
    el.innerHTML = '<div class="loading">No members yet. Click "+ Add Member" to start.</div>';
    return;
  }

  el.innerHTML = members.map(m => {
    const initials = m.initials || (m.name || 'X')[0];
    const color    = m.color || 'var(--sp-blue)';
    const avail    = m.availability || 'offline';
    return `<div class="people-member-row" data-id="${escHtml(m.id)}">
      <div class="people-avatar" style="background:${escHtml(color)}">
        ${escHtml(initials)}
        <div class="people-avail-dot people-avail-${avail}"></div>
      </div>
      <div class="people-info">
        <div class="people-name">${escHtml(m.name)}</div>
        <div class="people-role">${escHtml(m.role || '')}${m.email ? ` · ${escHtml(m.email)}` : ''}${m.slackHandle ? ` · @${escHtml(m.slackHandle)}` : ''}</div>
      </div>
      <div class="people-actions">
        <select class="people-avail-select" data-member-id="${escHtml(m.id)}">
          <option value="available"${avail === 'available' ? ' selected' : ''}>🟢 Available</option>
          <option value="busy"     ${avail === 'busy'      ? ' selected' : ''}>🔴 Busy</option>
          <option value="offline"  ${avail === 'offline'   ? ' selected' : ''}>⚪ Offline</option>
        </select>
        <button class="btn-ghost btn-sm edit-member-btn" data-id="${escHtml(m.id)}">Edit</button>
        <button class="btn-danger btn-sm del-member-btn" data-id="${escHtml(m.id)}" data-name="${escHtml(m.name)}">Remove</button>
      </div>
    </div>`;
  }).join('');

  // Wire availability selects
  el.querySelectorAll('.people-avail-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = sel.dataset.memberId;
      const chosen   = sel.value;
      const original = members.find(x => x.id === id)?.availability || 'offline';
      try {
        await api(`/api/teacher/support-team/${id}/availability`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ availability: chosen }),
        });
      } catch (err) {
        // The browser already shows `chosen` as selected the instant the
        // dropdown changes — revert it so a failed save doesn't leave the
        // select showing a value that was never actually persisted.
        sel.value = original;
        showToast(`Could not update status — ${err?.message || 'network error'}. Try again.`, false);
        return;
      }
      // Update sidebar dot too if it's the first member
      loadTeamMembers();
    });
  });

  // Edit buttons
  el.querySelectorAll('.edit-member-btn').forEach(btn => {
    btn.addEventListener('click', () => openTeamModal(btn.dataset.id, members));
  });

  // Delete buttons
  el.querySelectorAll('.del-member-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`Remove ${btn.dataset.name} from the support team?`)) return;
      await api(`/api/teacher/support-team/${btn.dataset.id}`, { method: 'DELETE' });
      loadTeamMembers();
    });
  });
}

function wireAvailButtons() {
  document.querySelectorAll('.avail-set-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const status = btn.dataset.status;
      let r;
      try {
        r = await api('/api/teacher/availability', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ availability: status }),
        });
      } catch (err) {
        showToast(`Could not update status — ${err?.message || 'network error'}. Try again.`, false);
        return;
      }
      if (r?.ok) {
        const msg = document.getElementById('avail-status-msg');
        if (msg) { msg.textContent = `Status set to ${status} — students updated in real-time.`; msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 3000); }
        const dot  = document.getElementById('avail-dot-sm');
        const text = document.getElementById('avail-text-sm');
        if (dot)  dot.className = `avail-dot-sm avail-${status}`;
        if (text) text.textContent = ({ available: 'Available', busy: 'Busy', offline: 'Offline' })[status];
        _currentAvailStatus = status;
        loadTeamMembers();
      }
    });
  });
}

function openTeamModal(memberId, members) {
  const modal = document.getElementById('team-member-modal');
  if (!modal) return;
  _editingMemberId = memberId || null;
  const titleEl = document.getElementById('team-modal-title');
  if (titleEl) titleEl.textContent = memberId ? 'Edit Team Member' : 'Add Team Member';

  const member = memberId ? members.find(m => m.id === memberId) : null;
  document.getElementById('tm-id').value       = memberId || '';
  document.getElementById('tm-name').value     = member?.name || '';
  document.getElementById('tm-role').value     = member?.role || '';
  document.getElementById('tm-slack').value    = member?.slackHandle || '';
  document.getElementById('tm-slackid').value  = member?.slackUserId || '';
  document.getElementById('tm-email').value    = member?.email || '';
  document.getElementById('tm-initials').value = member?.initials || '';
  document.getElementById('tm-color').value    = member?.color || '#2B3BFF';
  document.getElementById('tm-error').style.display = 'none';
  modal.style.display = 'flex';
}

function wireTeamMemberModal() {
  const addBtn    = document.getElementById('add-team-member-btn');
  const cancelBtn = document.getElementById('tm-cancel-btn');
  const saveBtn   = document.getElementById('tm-save-btn');
  const modal     = document.getElementById('team-member-modal');

  if (addBtn)    addBtn.addEventListener('click', () => openTeamModal(null, []));
  if (cancelBtn) cancelBtn.addEventListener('click', () => { if (modal) modal.style.display = 'none'; });

  if (saveBtn) saveBtn.addEventListener('click', async () => {
    const name = document.getElementById('tm-name').value.trim();
    const errEl = document.getElementById('tm-error');
    if (!name) { errEl.textContent = 'Name is required.'; errEl.style.display = 'block'; return; }

    const body = {
      name,
      role:       document.getElementById('tm-role').value.trim(),
      slackHandle:document.getElementById('tm-slack').value.trim(),
      slackUserId:document.getElementById('tm-slackid').value.trim(),
      email:      document.getElementById('tm-email').value.trim(),
      initials:   document.getElementById('tm-initials').value.trim() || name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
      color:      document.getElementById('tm-color').value,
    };
    const id = document.getElementById('tm-id').value;
    const url    = id ? `/api/teacher/support-team/${id}` : '/api/teacher/support-team';
    const method = id ? 'PUT' : 'POST';
    const r = await api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r?.ok || r?.id) {
      if (modal) modal.style.display = 'none';
      loadTeamMembers();
    } else {
      errEl.textContent = 'Save failed. Please try again.';
      errEl.style.display = 'block';
    }
  });
}

// Soccer schedule editor — per-team (each student belongs to at most one
// team, set in Admin Hub; this editor shows/edits whichever team is selected
// in the dropdown below, not a single shared schedule).
let _soccerSuggestion = '';
let _soccerTeams      = [];
let _selectedTeamId   = '';

async function loadSoccerEditor() {
  _soccerTeams = await api('/api/teacher/soccer-teams') || [];
  renderTeamSelect();
  if (!_selectedTeamId && _soccerTeams.length) _selectedTeamId = _soccerTeams[0].id;
  await loadSelectedTeam();
}

function renderTeamSelect() {
  const sel = document.getElementById('soccer-team-select');
  if (!sel) return;
  if (!_soccerTeams.length) {
    sel.innerHTML = '<option value="">No teams yet</option>';
    document.getElementById('soccer-team-editor').style.display = 'none';
    document.getElementById('soccer-no-team-msg').style.display = 'block';
    return;
  }
  sel.innerHTML = _soccerTeams.map(t => `<option value="${escHtml(t.id)}"${t.id === _selectedTeamId ? ' selected' : ''}>${escHtml(t.name)}</option>`).join('');
}

async function loadSelectedTeam() {
  if (!_selectedTeamId) return;
  const data = await api(`/api/teacher/soccer-teams/${encodeURIComponent(_selectedTeamId)}`);
  _soccerSchedule = data || { schedule: [], upcomingEvent: '' };
  _soccerSuggestion = data?.suggestedUpcomingEvent || '';
  document.getElementById('soccer-team-editor').style.display = 'block';
  document.getElementById('soccer-no-team-msg').style.display = 'none';
  const nameInput  = document.getElementById('soccer-team-name-input');
  const coachInput = document.getElementById('soccer-team-coach-input');
  if (nameInput)  nameInput.value  = _soccerSchedule.name  || '';
  if (coachInput) coachInput.value = _soccerSchedule.coach || '';
  renderSoccerEditor();
  const upcomingInput = document.getElementById('soccer-upcoming-input');
  if (upcomingInput) {
    // Only auto-fill when nothing's been entered yet — never clobber a
    // teacher's existing (possibly deliberate) manual value.
    upcomingInput.value = _soccerSchedule.upcomingEvent || _soccerSuggestion || '';
  }
  renderSoccerSuggestion();
}

function renderSoccerSuggestion() {
  const row  = document.getElementById('soccer-suggestion-row');
  const text = document.getElementById('soccer-suggestion-text');
  if (!row || !text) return;
  const current = document.getElementById('soccer-upcoming-input')?.value.trim() || '';
  if (_soccerSuggestion && _soccerSuggestion !== current) {
    text.textContent = _soccerSuggestion;
    row.style.display = 'block';
  } else {
    row.style.display = 'none';
  }
}

function renderSoccerEditor() {
  const el = document.getElementById('soccer-editor-rows');
  if (!el) return;
  el.innerHTML = (_soccerSchedule.schedule || []).map((row, i) => `
    <div class="soccer-row" data-row="${i}" data-id="${escHtml(row.id||'')}">
      <div class="soccer-row-top">
        <select class="soccer-day-sel" data-i="${i}" title="Day">
          ${['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => `<option${row.day === d ? ' selected' : ''}>${d}</option>`).join('')}
        </select>
        <input type="date" class="soccer-date-inp" data-i="${i}" value="${escHtml(row.date||'')}" title="Specific date (optional)" />
        <input type="text" class="soccer-time-inp" data-i="${i}" value="${escHtml(row.time||'')}" placeholder="3:30 – 5:00 PM" title="Time" />
        <input type="text" class="soccer-loc-inp" data-i="${i}" value="${escHtml(row.location||'')}" placeholder="Field B" title="Location" />
        <select class="soccer-type-sel" data-i="${i}" title="Type">
          ${['practice','game','film','match','training'].map(t => `<option value="${t}"${row.type === t ? ' selected' : ''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
        </select>
        <button class="del-row-btn" data-i="${i}" title="Remove">×</button>
      </div>
      <div class="soccer-row-bottom">
        <input type="text" class="soccer-opp-inp" data-i="${i}" value="${escHtml(row.opponent||'')}" placeholder="Opponent (games only)" title="Opponent" />
        <input type="text" class="soccer-notes-inp" data-i="${i}" value="${escHtml(row.notes||'')}" placeholder="Coach notes shown to students (e.g. Bring away jersey)" title="Coach notes" />
      </div>
    </div>`).join('');

  el.querySelectorAll('.del-row-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _soccerSchedule.schedule.splice(+btn.dataset.i, 1);
      renderSoccerEditor();
    });
  });
}

function readSoccerEditorRows() {
  const el = document.getElementById('soccer-editor-rows');
  if (!el) return [];
  return Array.from(el.querySelectorAll('.soccer-row')).map(row => ({
    id:       row.dataset.id || '',
    day:      row.querySelector('.soccer-day-sel').value,
    date:     row.querySelector('.soccer-date-inp')?.value?.trim() || '',
    time:     row.querySelector('.soccer-time-inp').value.trim(),
    location: row.querySelector('.soccer-loc-inp').value.trim(),
    type:     row.querySelector('.soccer-type-sel').value,
    opponent: row.querySelector('.soccer-opp-inp')?.value?.trim() || '',
    notes:    row.querySelector('.soccer-notes-inp')?.value?.trim() || '',
  }));
}

function wireSoccerEditor() {
  const addRowBtn        = document.getElementById('add-soccer-row-btn');
  const saveBtn          = document.getElementById('save-soccer-btn');
  const saveMsg          = document.getElementById('soccer-save-msg');
  const upcomingInput    = document.getElementById('soccer-upcoming-input');
  const useSuggestionBtn = document.getElementById('soccer-use-suggestion-btn');
  const recomputeBtn     = document.getElementById('soccer-recompute-btn');
  const teamSelect       = document.getElementById('soccer-team-select');
  const newTeamBtn       = document.getElementById('soccer-new-team-btn');

  if (teamSelect) teamSelect.addEventListener('change', () => {
    _selectedTeamId = teamSelect.value;
    loadSelectedTeam();
  });

  if (newTeamBtn) newTeamBtn.addEventListener('click', async () => {
    const name = prompt('New team name (e.g. "Varsity", "JV", "U16 Boys"):');
    if (!name?.trim()) return;
    const r = await api('/api/teacher/soccer-teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (r?.team) {
      _soccerTeams.push({ id: r.team.id, name: r.team.name, coach: r.team.coach });
      _selectedTeamId = r.team.id;
      renderTeamSelect();
      await loadSelectedTeam();
    }
  });

  if (addRowBtn) addRowBtn.addEventListener('click', () => {
    _soccerSchedule.schedule.push({ day: 'Monday', date: '', time: '', location: '', type: 'practice', opponent: '', notes: '' });
    renderSoccerEditor();
  });

  if (upcomingInput) upcomingInput.addEventListener('input', renderSoccerSuggestion);

  if (useSuggestionBtn) useSuggestionBtn.addEventListener('click', () => {
    if (upcomingInput) upcomingInput.value = _soccerSuggestion;
    renderSoccerSuggestion();
  });

  if (recomputeBtn) recomputeBtn.addEventListener('click', async () => {
    if (!_selectedTeamId) return;
    const schedule = readSoccerEditorRows();
    const r = await api(`/api/teacher/soccer-teams/${encodeURIComponent(_selectedTeamId)}/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule }),
    });
    _soccerSuggestion = r?.text || '';
    renderSoccerSuggestion();
  });

  if (saveBtn) saveBtn.addEventListener('click', async () => {
    if (!_selectedTeamId) return;
    const schedule = readSoccerEditorRows();
    const upcomingEvent = document.getElementById('soccer-upcoming-input')?.value.trim() || '';
    const name  = document.getElementById('soccer-team-name-input')?.value.trim() || '';
    const coach = document.getElementById('soccer-team-coach-input')?.value.trim() || '';
    const r = await api(`/api/teacher/soccer-teams/${encodeURIComponent(_selectedTeamId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule, upcomingEvent, name, coach }),
    });
    if (r?.ok) {
      if (saveMsg) { saveMsg.style.display = 'inline'; setTimeout(() => { saveMsg.style.display = 'none'; }, 2000); }
      // Team name may have changed — keep the dropdown option in sync.
      const teamOpt = _soccerTeams.find(t => t.id === _selectedTeamId);
      if (teamOpt) { teamOpt.name = name; teamOpt.coach = coach; renderTeamSelect(); }
    }
  });
}

// ── Zoom Links Manager ────────────────────────────────────────────────────────
let _zmLinks = [];
let _zmEditing = null;

async function loadZoomPanel() {
  _zmLinks = await api('/api/teacher/zoom') || [];
  renderZoomList();

  document.getElementById('zoom-add-link-btn')?.addEventListener('click', () => openZoomForm(null));
  document.getElementById('zm-save-btn')?.addEventListener('click', saveZoomLink);
  document.getElementById('zm-cancel-btn')?.addEventListener('click', closeZoomForm);

  const zoomBtn = document.getElementById('zoom-btn');
  if (zoomBtn) {
    zoomBtn.addEventListener('click', async () => {
      const orig = zoomBtn.textContent;
      zoomBtn.textContent = 'Opening Zoom...';
      setTimeout(() => { zoomBtn.textContent = orig; }, 2000);
      try {
        const data = await fetch('/api/config/zoom-url', { credentials: 'include' }).then(r => r.json());
        if (data.fallback) console.warn('ZOOM_MEETING_URL not set in .env — opening zoom.us homepage');
        openZoomPopup(data.url);
      } catch {
        openZoomPopup('https://zoom.us');
      }
    });
  }

  const huddleBtn = document.getElementById('huddle-btn');
  if (huddleBtn) {
    huddleBtn.addEventListener('click', async () => {
      const orig = huddleBtn.textContent;
      huddleBtn.textContent = 'Opening Slack...';
      setTimeout(() => { huddleBtn.textContent = orig; }, 2000);
      try {
        const data = await fetch('/api/config/huddle-url', { credentials: 'include' }).then(r => r.json());
        if (!data.deepLink) {
          console.warn('Slack huddle config missing:', data.error);
          window.open(data.webLink, 'HuddleWindow', 'width=1200,height=800,toolbar=no,menubar=no');
          return;
        }
        const webFallback = () => {
          window.open(data.webLink, 'HuddleWindow', 'width=1200,height=800,toolbar=no,menubar=no');
        };
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        iframe.src = data.deepLink;
        document.body.appendChild(iframe);
        setTimeout(() => { document.body.removeChild(iframe); webFallback(); }, 2000);
      } catch {
        window.open('https://app.slack.com', 'HuddleWindow', 'width=1200,height=800,toolbar=no,menubar=no');
      }
    });
  }
}

// ── Teacher Hub notification sounds (mentee login / mentee message) ──────────
// Synthesized via Web Audio (no external sound files, same technique as
// public/slack-notifications.js's Student Hub DM chime) — different
// frequencies from that chime and from each other so login vs. message are
// distinguishable, and distinguishable from the Student Hub's own sound.
let _notifPrefs = { ...TEACHER_NOTIF_DEFAULTS };
let _notifAudioCtx = null;
let _notifAudioUnlocked = false;
let _notifPanelWired = false;

// Browser autoplay policy suspends a freshly-created AudioContext until a
// real user gesture has occurred on the page — scheduling sound on a
// suspended context silently plays nothing, no error thrown. Unlock eagerly
// on the first click/keydown after the Teacher Hub loads, well before any
// server-pushed socket event needs to actually play something.
function _unlockNotifAudio() {
  if (_notifAudioUnlocked) return;
  try {
    _notifAudioCtx = _notifAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (_notifAudioCtx.state === 'suspended') _notifAudioCtx.resume();
    _notifAudioUnlocked = true;
  } catch { /* Web Audio unavailable — playNotificationSound() no-ops safely */ }
}
['click', 'keydown'].forEach(ev => document.addEventListener(ev, _unlockNotifAudio, { once: true, passive: true }));

function playNotificationSound(type) {
  if (type === 'login' && !_notifPrefs.loginSound) return;
  if (type === 'message' && !_notifPrefs.messageSound) return;
  try {
    _notifAudioCtx = _notifAudioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _notifAudioCtx;
    if (ctx.state === 'suspended') ctx.resume();
    const vol  = _notifPrefs.volume ?? 0.25;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.connect(ctx.destination);

    if (type === 'message') {
      // Brighter two-note ascending ping — the higher-priority event.
      [659.25, 880].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
        osc.connect(gain);
        osc.start(ctx.currentTime + i * 0.1);
        osc.stop(ctx.currentTime + i * 0.1 + 0.09);
      });
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.19, 0.05);
    } else {
      // Single soft low note — ambient, lower-priority.
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(392, ctx.currentTime); // G4
      osc.connect(gain);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.25);
      gain.gain.setTargetAtTime(0, ctx.currentTime + 0.1, 0.08);
    }
  } catch { /* Web Audio unavailable — no sound, no error surfaced to the teacher */ }
}

// Same roster-card-existence check that already scopes the online-dot
// display to a teacher's own mentees (_applyOnlineToCard) — reused here as
// the single source of truth for "is this student one of mine," for both
// the sound gating and (in the studentMentorMessage handler) the Mentor
// Inbox rendering fix.
function _isMyMentee(email) {
  if (!email) return false;
  return !!document.getElementById(cardIdFor(email));
}

async function loadNotificationPrefs() {
  try {
    const prefs = await api('/api/teacher/notification-settings');
    if (prefs) _notifPrefs = { ...TEACHER_NOTIF_DEFAULTS, ...prefs };
  } catch { /* keep defaults */ }
}

async function loadNotificationsPanel() {
  await loadNotificationPrefs();

  const loginToggle   = document.getElementById('tn-toggle-login');
  const messageToggle = document.getElementById('tn-toggle-message');
  const volumeInput   = document.getElementById('tn-volume');
  const digestToggle  = document.getElementById('tn-toggle-digest');
  if (loginToggle)   loginToggle.checked   = !!_notifPrefs.loginSound;
  if (messageToggle) messageToggle.checked = !!_notifPrefs.messageSound;
  if (volumeInput)   volumeInput.value     = _notifPrefs.volume ?? 0.25;
  if (digestToggle)  digestToggle.checked  = _notifPrefs.weeklyDigest !== false;

  // Wire listeners once — loadNotificationsPanel() re-runs on every visit to
  // this panel (same as loadZoomPanel()), and re-attaching would stack
  // duplicate handlers, firing the preview sound / save multiple times.
  if (_notifPanelWired) return;
  _notifPanelWired = true;

  async function saveNotifPrefs(savedMsgId = 'tn-save-msg') {
    const body = {
      loginSound:   document.getElementById('tn-toggle-login')?.checked ?? true,
      messageSound: document.getElementById('tn-toggle-message')?.checked ?? true,
      weeklyDigest: document.getElementById('tn-toggle-digest')?.checked ?? true,
      volume:       parseFloat(document.getElementById('tn-volume')?.value ?? '0.25'),
    };
    try {
      const res = await api('/api/teacher/notification-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res?.prefs) _notifPrefs = { ...TEACHER_NOTIF_DEFAULTS, ...res.prefs };
      const msg = document.getElementById(savedMsgId);
      if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 1500); }
    } catch {
      // Flagged 2026-08-24/25, never actually fixed: a failed save silently left the toggle showing
      // the new value while nothing was persisted, then reverted with no explanation on next load —
      // the old comment here ("toggle state stays reflected either way") described the bug as if it
      // were the intended behavior. Revert the controls to the last known-GOOD value (_notifPrefs
      // wasn't mutated by the failed POST) and say so — no network round-trip needed, which matters
      // since a failed save is often a network problem in the first place.
      const loginToggle   = document.getElementById('tn-toggle-login');
      const messageToggle = document.getElementById('tn-toggle-message');
      const volumeInput   = document.getElementById('tn-volume');
      const digestToggle  = document.getElementById('tn-toggle-digest');
      if (loginToggle)   loginToggle.checked   = !!_notifPrefs.loginSound;
      if (messageToggle) messageToggle.checked = !!_notifPrefs.messageSound;
      if (volumeInput)   volumeInput.value     = _notifPrefs.volume ?? 0.25;
      if (digestToggle)  digestToggle.checked  = _notifPrefs.weeklyDigest !== false;
      showToast("Couldn't save — check your connection and try again.");
    }
  }

  document.getElementById('tn-toggle-login')?.addEventListener('change', () => saveNotifPrefs());
  document.getElementById('tn-toggle-message')?.addEventListener('change', () => saveNotifPrefs());
  document.getElementById('tn-volume')?.addEventListener('change', () => saveNotifPrefs());
  document.getElementById('tn-toggle-digest')?.addEventListener('change', () => saveNotifPrefs('tn-digest-save-msg'));
  document.getElementById('tn-preview-login-btn')?.addEventListener('click', () => {
    const wasEnabled = _notifPrefs.loginSound;
    _notifPrefs.loginSound = true; // preview should audibly work even while muted
    playNotificationSound('login');
    _notifPrefs.loginSound = wasEnabled;
  });
  document.getElementById('tn-preview-message-btn')?.addEventListener('click', () => {
    const wasEnabled = _notifPrefs.messageSound;
    _notifPrefs.messageSound = true;
    playNotificationSound('message');
    _notifPrefs.messageSound = wasEnabled;
  });
}

// ── Office hours (Settings → Office Hours) — act + pace plan, Phase 2a ───────
// Each teacher edits only their own weekly times (server keys them by the
// teacher-session email and validates everything again).
const OH_DAYS = [['mon','Monday'],['tue','Tuesday'],['wed','Wednesday'],['thu','Thursday'],['fri','Friday'],['sat','Saturday'],['sun','Sunday']];
let _ohWired = false;

function ohRowHtml(slot = {}) {
  const day = slot.day || 'mon';
  return `<div class="oh-row">
    <select class="stab-input oh-day" aria-label="Day">${OH_DAYS.map(([v, l]) => `<option value="${v}"${v === day ? ' selected' : ''}>${l}</option>`).join('')}</select>
    <input type="time" class="stab-input oh-start" aria-label="Start" value="${esc(slot.start || '15:00')}" step="300" />
    <span class="oh-dash">to</span>
    <input type="time" class="stab-input oh-end" aria-label="End" value="${esc(slot.end || '15:30')}" step="300" />
    <input type="text" class="stab-input oh-where" aria-label="Where" maxlength="120" placeholder="Where (room, Zoom…)" value="${esc(slot.where || '')}" />
    <button type="button" class="oh-remove" aria-label="Remove this time" title="Remove">✕</button>
  </div>`;
}

function ohRefreshEmpty() {
  const rows = document.querySelectorAll('#oh-rows .oh-row').length;
  const empty = document.getElementById('oh-empty');
  if (empty) empty.style.display = rows ? 'none' : 'block';
}

function ohShowError(msg) {
  const el = document.getElementById('oh-error');
  if (!el) return;
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

// Requests students sent from the coach's card (Phase 2b). Accept puts it on the student's calendar and DMs them;
// Decline DMs them (with an optional note). The server only ever returns/accepts this teacher's own requests.
async function loadOfficeHourRequests() {
  const el = document.getElementById('oh-requests');
  if (!el) return;
  let data;
  try { data = await api('/api/teacher/office-hours/requests'); } catch { el.innerHTML = '<div class="tn-row-desc">Could not load requests — try again.</div>'; return; }
  if (!data) return;
  const row = (b, actions) => `<div class="oh-req" data-id="${esc(b.id)}">
      <div class="oh-req-main"><strong>${esc(b.studentName)}</strong>${b.isMentor ? ' <span class="oh-req-tag">mentee</span>' : ''}
        <div class="oh-req-when">${esc(b.when)}${b.where ? ' · ' + esc(b.where) : ''}</div>
        <div class="oh-req-topic">“${esc(b.topic)}”</div>
        ${b.teacherNote ? `<div class="oh-req-note">Your note: ${esc(b.teacherNote)}</div>` : ''}</div>
      ${actions}</div>`;
  const pending = (data.pending || []).map(b => row(b, `<div class="oh-req-actions">
        <input type="text" class="stab-input oh-req-note-in" maxlength="200" placeholder="Optional note to the student" aria-label="Optional note" />
        <button type="button" class="btn-navy oh-accept">Accept</button>
        <button type="button" class="btn-ghost oh-decline">Decline</button>
        <div class="oh-req-msg" role="status"></div></div>`)).join('');
  const upcoming = (data.upcoming || []).map(b => row(b, `<div class="oh-req-status ok">Accepted${/^https:\/\/calendar\.google\.com\//.test(b.gcalUrl || '')
    ? `<br><a class="oh-gcal" href="${esc(b.gcalUrl)}" target="_blank" rel="noopener">Add to Google Calendar</a>` : ''}</div>`)).join('');
  const recent = (data.recent || []).map(b => row(b, `<div class="oh-req-status">${esc({ declined: 'Declined', cancelled: 'Cancelled by student', expired: 'Expired — no answer', accepted: 'Met' }[b.status] || b.status)}</div>`)).join('');
  el.innerHTML = (pending || '<div class="tn-row-desc">No requests waiting.</div>')
    + (upcoming ? `<div class="oh-req-group">Coming up</div>${upcoming}` : '')
    + (recent ? `<div class="oh-req-group">Recent</div>${recent}` : '');
  el.querySelectorAll('.oh-accept, .oh-decline').forEach(btn => btn.addEventListener('click', async () => {
    const box = btn.closest('.oh-req'), msg = box.querySelector('.oh-req-msg');
    const accept = btn.classList.contains('oh-accept');
    box.querySelectorAll('button').forEach(b => { b.disabled = true; });
    msg.textContent = accept ? 'Accepting…' : 'Declining…';
    try {
      const res = await fetch(`/api/teacher/office-hours/requests/${encodeURIComponent(box.dataset.id)}/${accept ? 'accept' : 'decline'}`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: box.querySelector('.oh-req-note-in')?.value || '' }),
      });
      if (res.status === 401 || res.status === 403) { handleAuthFailure(); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { msg.textContent = body.error || 'That didn’t work — try again.'; box.querySelectorAll('button').forEach(b => { b.disabled = false; }); return; }
      showToast(accept ? `Accepted — it's on ${body.booking?.studentName || 'the student'}'s calendar${body.notified ? ' and they got a Slack message' : ''}. Use “Add to Google Calendar” below to add it to yours.` : `Declined${body.notified ? ' — they got a Slack message' : ''}.`);
      loadOfficeHourRequests();
      refreshOfficeHoursBadge();
    } catch { msg.textContent = 'Could not reach the hub — try again.'; box.querySelectorAll('button').forEach(b => { b.disabled = false; }); }
  }));
}

async function loadOfficeHoursPanel() {
  loadOfficeHourRequests();
  const rowsEl = document.getElementById('oh-rows');
  const nameEl = document.getElementById('oh-name');
  ohShowError('');
  try {
    const data = await api('/api/teacher/office-hours');
    if (!data) return;
    if (data.noEmail) ohShowError('This account has no email address, so office hours can’t be saved for it. Sign in with your school Google account instead.');
    if (nameEl) nameEl.value = data.name || '';
    if (rowsEl) rowsEl.innerHTML = (data.slots || []).map(ohRowHtml).join('');
  } catch { ohShowError('Could not load your office hours — try again.'); }
  ohRefreshEmpty();

  if (_ohWired) return;
  _ohWired = true;
  document.getElementById('oh-add-btn')?.addEventListener('click', () => {
    rowsEl?.insertAdjacentHTML('beforeend', ohRowHtml());
    ohRefreshEmpty();
  });
  rowsEl?.addEventListener('click', e => {
    const btn = e.target.closest('.oh-remove');
    if (!btn) return;
    btn.closest('.oh-row')?.remove();
    ohRefreshEmpty();
  });
  document.getElementById('oh-save-btn')?.addEventListener('click', async () => {
    ohShowError('');
    const slots = [...document.querySelectorAll('#oh-rows .oh-row')].map(r => ({
      day: r.querySelector('.oh-day').value,
      start: r.querySelector('.oh-start').value,
      end: r.querySelector('.oh-end').value,
      where: r.querySelector('.oh-where').value,
    }));
    try {
      const res = await fetch('/api/teacher/office-hours', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameEl?.value || '', slots }),
      });
      if (res.status === 401 || res.status === 403) { handleAuthFailure(); return; }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { ohShowError(body.error || 'Could not save — try again.'); return; }
      if (rowsEl) rowsEl.innerHTML = (body.slots || []).map(ohRowHtml).join('');
      ohRefreshEmpty();
      const msg = document.getElementById('oh-save-msg');
      if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 1500); }
    } catch { ohShowError('Could not save — check your connection and try again.'); }
  });
}

// ── Personal quick-access links (Settings → Quick Links) ─────────────────────
let _quicklinksPanelWired = false;

async function loadQuicklinksPanel() {
  const urlInput = document.getElementById('ql-observed-url');
  try {
    const links = await api('/api/teacher/quicklinks');
    if (urlInput) urlInput.value = links?.observEdUrl || '';
  } catch { /* leave input blank on failure — non-critical */ }

  // Guarded wiring, same reason as loadNotificationsPanel() above — this
  // function re-runs on every visit to this panel.
  if (_quicklinksPanelWired) return;
  _quicklinksPanelWired = true;

  document.getElementById('ql-save-btn')?.addEventListener('click', async () => {
    const observEdUrl = document.getElementById('ql-observed-url')?.value.trim() || '';
    try {
      const res = await api('/api/teacher/quicklinks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observEdUrl }),
      });
      if (!res) return; // api() already handled a 401/403 (e.g. session expired)
      const msg = document.getElementById('ql-save-msg');
      if (msg) { msg.style.display = 'block'; setTimeout(() => { msg.style.display = 'none'; }, 1500); }
      applyQuicklinkButtons(res.links?.observEdUrl || '');
    } catch (err) {
      // api() throws (doesn't auto-toast) on a non-401/403 error response —
      // the 400 "must start with http(s)://" validation case lands here.
      showToast(err.message.includes('HTTP 400') ? 'Link must start with http:// or https://' : 'Could not save — try again');
    }
  });
}

// Shows/hides every "Observ Ed" quicklink button — the small topbar one
// (visible from every panel) and the prominent copy on the Student Monitor
// panel head (the default landing screen — added after the topbar-only
// placement turned out not to be visible/findable enough). Called both
// eagerly at page load (loadQuicklinkButtons, below) and right after a
// save, so both reflect the change immediately without a page reload.
const QUICKLINK_BUTTON_IDS = ['observed-quicklink-btn', 'observed-quicklink-btn-home'];
function applyQuicklinkButtons(url) {
  for (const id of QUICKLINK_BUTTON_IDS) {
    const btn = document.getElementById(id);
    if (!btn) continue;
    if (url) { btn.href = url; btn.style.display = ''; }
    else { btn.style.display = 'none'; btn.removeAttribute('href'); }
  }
}

// Loaded eagerly at page load (like loadNotificationPrefs()) so both
// buttons are already correct on first paint, not just after a Settings visit.
async function loadQuicklinkButtons() {
  try {
    const links = await api('/api/teacher/quicklinks');
    applyQuicklinkButtons(links?.observEdUrl || '');
  } catch { /* buttons just stay hidden */ }
}

// Opens a Zoom URL in a popup window rather than a full new tab — same
// width/height/window-name this file's own "Launch Zoom" button (below)
// already used inline; centralized here so "Join as Host" can share it.
// Falls back to a real new tab if the popup is blocked (e.g. not triggered
// from a direct click).
function openZoomPopup(url) {
  if (!url) return;
  const popup = window.open(url, 'ZoomWindow', 'width=1200,height=800,toolbar=no,menubar=no,scrollbars=yes,resizable=yes');
  if (!popup || popup.closed || typeof popup.closed === 'undefined') {
    window.open(url, '_blank', 'noopener');
    showToast('Popup blocked — Zoom opened in a new tab. Allow popups for this site to use the popup window.');
  }
}

// Wired from teacher-huddles.js's DOMContentLoaded block, not here — the
// Start Instant Meeting / Start Class Meeting buttons now live in the
// Meetings panel (#panel-huddles), not this one, so they only need wiring
// once at page load like that panel's other buttons, not on every
// loadZoomPanel() call.
async function startZoomMeeting(kind) {
  const btnId = kind === 'recurring' ? 'zoom-start-class-btn' : 'zoom-start-instant-btn';
  const btn = document.getElementById(btnId);
  const resultEl = document.getElementById('zoom-start-result');
  const orig = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = kind === 'recurring' ? 'Opening...' : 'Starting...'; }

  try {
    const meeting = await api('/api/zoom/meetings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, topic: kind === 'recurring' ? 'Class Meeting' : undefined }),
    });
    if (meeting && resultEl) {
      resultEl.style.display = '';
      resultEl.innerHTML = `
        <div class="zoom-manager-row">
          <div class="zoom-manager-info">
            <div class="zoom-manager-name">${escHtml(meeting.topic || 'Zoom Meeting')}</div>
            <div class="zoom-manager-url">${escHtml(meeting.joinUrl || '')}</div>
          </div>
          <div class="zoom-manager-actions">
            <a href="${escHtml(meeting.startUrl || '')}" rel="noopener" class="btn-sm-navy" id="zoom-join-host-btn">Join as Host →</a>
            <button class="btn-sm-outline" id="zoom-copy-join-btn">Copy Join Link</button>
          </div>
        </div>`;
      document.getElementById('zoom-join-host-btn')?.addEventListener('click', e => {
        e.preventDefault();
        openZoomPopup(meeting.startUrl || '');
      });
      document.getElementById('zoom-copy-join-btn')?.addEventListener('click', () => {
        navigator.clipboard.writeText(meeting.joinUrl || '');
        showToast('Join link copied');
      });
    }
  } catch (err) {
    showToast(err?.message || 'Could not start Zoom meeting');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = orig; }
  }
}

// Toggles the Connect Zoom button between its two states based on whether
// this teacher has a stored per-teacher OAuth token (see routes/teacher.js's
// GET /zoom-connection-status). Called once per Meetings panel open, not on
// loadHuddlesPanel()'s own 30s re-poll — this doesn't change that often.
// Stays enabled in both states: connected, it doubles as the disconnect
// trigger (see the click handler above) so the flow can be reset for
// testing without touching Redis/the file store by hand.
async function checkZoomConnection() {
  const btn = document.getElementById('zoomConnectBtn');
  if (!btn) return;
  try {
    const status = await api('/api/teacher/zoom-connection-status');
    btn.disabled = false;
    if (status?.connected) {
      btn.textContent = '✓ Zoom Connected (click to disconnect)';
      btn.dataset.connected = 'true';
      btn.style.cursor = 'pointer';
      btn.style.opacity = '0.75';
    } else {
      btn.textContent = 'Connect Zoom';
      btn.dataset.connected = 'false';
      btn.style.cursor = 'pointer';
      btn.style.opacity = '1';
    }
  } catch {
    // Non-critical — leave the button in whatever state it was already in.
  }
}

function renderZoomList() {
  const container = document.getElementById('zoom-links-list');
  if (!container) return;

  if (!_zmLinks.length) {
    container.innerHTML = '<div style="color:var(--sp-muted);font-size:.88rem;padding:20px 0">No Zoom links posted yet. Click "+ Add Zoom Link" above to get started.</div>';
    return;
  }

  container.innerHTML = _zmLinks.map(l => `
    <div class="zoom-manager-row" data-id="${escHtml(l.id)}">
      <div class="zoom-manager-info">
        <div class="zoom-manager-name">${escHtml(l.label)}</div>
        ${l.forClass  ? `<div class="zoom-manager-meta">${escHtml(l.forClass)}</div>` : ''}
        ${l.schedule  ? `<div class="zoom-manager-sched">🕐 ${escHtml(l.schedule)}</div>` : ''}
        <div class="zoom-manager-url">${escHtml(l.url)}</div>
      </div>
      <div class="zoom-manager-actions">
        <a href="${escHtml(l.url)}" target="_blank" rel="noopener" class="btn-sm-navy">Test Link</a>
        <button class="btn-sm-outline" onclick="openZoomForm('${escHtml(l.id)}')">Edit</button>
        <button class="btn-sm-danger" onclick="deleteZoomLink('${escHtml(l.id)}')">Delete</button>
      </div>
    </div>`).join('');
}

function openZoomForm(id) {
  _zmEditing = id;
  const link = id ? _zmLinks.find(l => l.id === id) : null;
  document.getElementById('zm-label').value    = link?.label    || '';
  document.getElementById('zm-url').value      = link?.url      || '';
  document.getElementById('zm-class').value    = link?.forClass || '';
  document.getElementById('zm-schedule').value = link?.schedule || '';
  document.getElementById('zm-edit-id').value  = id || '';
  document.getElementById('zoom-link-form').style.display = '';
  document.getElementById('zm-label').focus();
}

function closeZoomForm() {
  _zmEditing = null;
  document.getElementById('zoom-link-form').style.display = 'none';
}

async function saveZoomLink() {
  const label    = document.getElementById('zm-label')?.value.trim();
  const url      = document.getElementById('zm-url')?.value.trim();
  const forClass = document.getElementById('zm-class')?.value.trim();
  const schedule = document.getElementById('zm-schedule')?.value.trim();
  if (!label || !url) { alert('Meeting name and Zoom link are required.'); return; }

  if (_zmEditing) {
    const r = await api(`/api/teacher/zoom/${_zmEditing}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, url, forClass, schedule }),
    });
    if (r) { const idx = _zmLinks.findIndex(l => l.id === _zmEditing); if (idx >= 0) _zmLinks[idx] = r; }
  } else {
    const r = await api('/api/teacher/zoom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, url, forClass, schedule }),
    });
    if (r) _zmLinks.push(r);
  }
  closeZoomForm();
  renderZoomList();
}

async function deleteZoomLink(id) {
  if (!confirm('Delete this Zoom link? Students will no longer see it.')) return;
  await api(`/api/teacher/zoom/${id}`, { method: 'DELETE' });
  _zmLinks = _zmLinks.filter(l => l.id !== id);
  renderZoomList();
}

// ── Chatbot Data panel ────────────────────────────────────────────────────────
let _activeChatbotStudentEmail = null;
let _activeChatbotStudentName  = null;

async function loadChatbotSummary() {
  // Default date range to last 30 days on first open
  const fromEl = document.getElementById('chatbot-from');
  const toEl   = document.getElementById('chatbot-to');
  if (fromEl && !fromEl.value) {
    const today = new Date().toISOString().split('T')[0];
    const ago30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    fromEl.value = ago30;
    toEl.value   = today;
  }

  const params = new URLSearchParams();
  if (fromEl?.value) params.set('from', fromEl.value);
  if (toEl?.value)   params.set('to', toEl.value);

  const tbody = document.getElementById('chatbot-summary-rows');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:var(--sp-muted);text-align:center;padding:20px;">Loading…</td></tr>';

  try {
    const data = await api('/api/teacher/chatbot-summary?' + params.toString());
    renderChatbotSummary(data?.summaries || []);
  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="color:#dc2626;text-align:center;padding:20px;">${esc(err.message)}</td></tr>`;
  }
}

function renderChatbotSummary(summaries) {
  const tbody = document.getElementById('chatbot-summary-rows');
  if (!tbody) return;
  if (!summaries.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--sp-muted);text-align:center;padding:24px;">No chatbot usage found for this date range. Students will appear here after their first AI conversation.</td></tr>';
    return;
  }
  tbody.innerHTML = summaries.map(s => `
    <tr>
      <td>
        <div style="font-weight:600">${esc(s.name)}</div>
        <div style="font-size:.78rem;color:var(--sp-muted);">${esc(s.email)}</div>
      </td>
      <td style="font-family:var(--sp-font-label);font-size:1rem;font-weight:700;color:${s.messageCount > 10 ? 'var(--sp-blue)' : 'inherit'};">${s.messageCount}</td>
      <td style="font-family:var(--sp-font-label);">${s.sessionCount}</td>
      <td style="font-size:.8rem;color:var(--sp-muted);">${esc(s.lastActive)}</td>
      <td>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${(s.topTopics || []).map(t => `<span style="font-family:var(--sp-font-label);font-size:.72rem;background:var(--sp-tint);border:0.5px solid var(--sp-ink);padding:2px 6px;color:var(--sp-muted);">${esc(t.word)} (${t.count})</span>`).join('')}
          ${!s.topTopics?.length ? '<span style="font-size:.78rem;color:var(--sp-muted);">—</span>' : ''}
        </div>
      </td>
      <td>
        <div style="display:flex;gap:6px;">
          <button class="btn-secondary" style="padding:5px 10px;font-size:.78rem;" onclick="openChatbotThread('${esc(s.email)}','${esc(s.name.replace(/'/g,"&#39;"))}')">View</button>
          <button class="btn-secondary" style="padding:5px 10px;font-size:.78rem;color:var(--sp-muted);" onclick="exportStudentChatbotDirect('${esc(s.email)}')">CSV</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function openChatbotThread(studentEmail, studentName) {
  _activeChatbotStudentEmail = studentEmail;
  _activeChatbotStudentName  = studentName;

  const params = new URLSearchParams();
  const fromEl = document.getElementById('chatbot-from');
  const toEl   = document.getElementById('chatbot-to');
  if (fromEl?.value) params.set('from', fromEl.value);
  if (toEl?.value)   params.set('to', toEl.value);

  const panel = document.getElementById('chatbot-thread-panel');
  const title = document.getElementById('chatbot-thread-title');
  const msgs  = document.getElementById('chatbot-thread-messages');
  if (!panel) return;

  if (title) title.textContent = `// ${studentName} — Chat History`;
  panel.style.display = 'block';
  if (msgs) msgs.innerHTML = '<div style="color:var(--sp-muted);font-size:.9rem;padding:8px;">Loading…</div>';

  try {
    const data = await api(`/api/teacher/chatbot/${encodeURIComponent(studentEmail)}?${params.toString()}`);
    const messages = data?.messages || [];
    if (!messages.length) {
      msgs.innerHTML = '<div style="color:var(--sp-muted);font-size:.9rem;padding:8px;">No messages found for this date range.</div>';
      return;
    }
    msgs.innerHTML = messages.map(m => {
      const isStudent = m.role === 'student';
      const time = new Date(m.timestamp).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      return `
        <div style="display:flex;flex-direction:column;gap:3px;max-width:88%;${isStudent ? '' : 'align-self:flex-end;'}">
          <div style="font-family:var(--sp-font-label);font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--sp-muted);${isStudent ? '' : 'text-align:right;'}">${isStudent ? esc(studentName) : 'AI Mentor'} · ${time}</div>
          <div style="padding:10px 14px;border-radius:14px;font-family:var(--sp-font-body);font-size:.9rem;line-height:1.6;${isStudent ? 'background:var(--sp-tint);border:2px solid var(--sp-ink);color:var(--sp-ink);' : 'background:var(--sp-blue);color:var(--sp-paper);'}">${esc(m.text)}</div>
        </div>`;
    }).join('');
    msgs.scrollTop = msgs.scrollHeight;
  } catch (err) {
    if (msgs) msgs.innerHTML = `<div style="color:#dc2626;font-size:.9rem;padding:8px;">${esc(err.message)}</div>`;
  }
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeChatbotThread() {
  const panel = document.getElementById('chatbot-thread-panel');
  if (panel) panel.style.display = 'none';
  _activeChatbotStudentEmail = null;
  _activeChatbotStudentName  = null;
}

function exportActiveStudentChatbot() {
  if (_activeChatbotStudentEmail) exportStudentChatbotDirect(_activeChatbotStudentEmail);
}

// Fetches the export as a blob and saves it via a throwaway <a download>,
// instead of window.location.href navigating the whole Teacher Hub tab away
// to the raw response — on any failure that used to replace the entire
// dashboard with a blank JSON error page and lose all UI state. Also fixes
// exportAllChatbot() below, where a loop of location.href assignments could
// only ever actually complete the LAST student's download, since each new
// assignment aborts whatever in-flight navigation the previous one started.
async function downloadChatbotCsv(studentEmail, params) {
  const url = `/api/teacher/chatbot/${encodeURIComponent(studentEmail)}/export?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `Export failed (${res.status})`;
    try { msg = (await res.json())?.error || msg; } catch {}
    throw new Error(msg);
  }
  const blob = await res.blob();
  const slug = studentEmail.split('@')[0];
  const filename = `chatbot_${slug}_${params.get('from') || 'all'}_to_${params.get('to') || 'today'}.csv`;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
  a.click();
  URL.revokeObjectURL(a.href);
}

async function exportStudentChatbotDirect(studentEmail) {
  const params = new URLSearchParams();
  const fromEl = document.getElementById('chatbot-from');
  const toEl   = document.getElementById('chatbot-to');
  if (fromEl?.value) params.set('from', fromEl.value);
  if (toEl?.value)   params.set('to', toEl.value);
  try {
    await downloadChatbotCsv(studentEmail, params);
  } catch (err) {
    showToast(err.message || 'Export failed');
  }
}

async function exportAllChatbot() {
  const params = new URLSearchParams();
  const fromEl = document.getElementById('chatbot-from');
  const toEl   = document.getElementById('chatbot-to');
  if (fromEl?.value) params.set('from', fromEl.value);
  if (toEl?.value)   params.set('to', toEl.value);
  try {
    const data = await api('/api/teacher/chatbot-summary?' + params.toString());
    const summaries = data?.summaries || [];
    if (!summaries.length) { alert('No chatbot data to export for this date range.'); return; }
    for (const s of summaries) {
      await new Promise(resolve => setTimeout(resolve, 500));
      await downloadChatbotCsv(s.email, params);
    }
  } catch (err) {
    alert('Export failed: ' + err.message);
  }
}

// ── Slack Activity Monitoring ─────────────────────────────────────────────────
async function loadSlackActivity() {
  const container = document.getElementById('slack-activity-table');
  if (!container) return;
  container.innerHTML = '<div style="padding:16px;font-family:var(--sp-font-body);font-size:15px;color:var(--sp-muted);">Loading…</div>';
  try {
    const data = await api('/api/teacher/slack-activity');
    if (!data || data.error || !data.activity || data.activity.length === 0) {
      container.innerHTML = '<div style="padding:16px;font-family:var(--sp-font-body);font-size:15px;color:var(--sp-muted);">' + (data?.error || 'No Slack activity data available.') + '</div>';
      return;
    }
    container.innerHTML = `
      <div style="display:grid;grid-template-columns:1.5fr 80px 120px 1fr;padding:12px 16px;border-bottom:1px solid var(--sp-ink);background:var(--sp-tint);">
        <span style="font-family:var(--sp-font-label);font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--sp-blue);">Student</span>
        <span style="font-family:var(--sp-font-label);font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--sp-blue);">Messages</span>
        <span style="font-family:var(--sp-font-label);font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--sp-blue);">Last Active</span>
        <span style="font-family:var(--sp-font-label);font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--sp-blue);">Top Channels</span>
      </div>
      ${data.activity.map(s => `
        <div style="display:grid;grid-template-columns:1.5fr 80px 120px 1fr;padding:13px 16px;border-bottom:0.5px solid var(--sp-ink);background:var(--sp-paper);align-items:center;gap:12px;" onmouseover="this.style.background='var(--sp-tint)'" onmouseout="this.style.background='var(--sp-paper)'">
          <div>
            <div style="font-family:var(--sp-font-body);font-size:15px;font-weight:600;color:var(--sp-ink);">${esc(s.studentName)}</div>
            <div style="font-family:var(--sp-font-label);font-size:11px;color:var(--sp-muted);">${esc(s.studentEmail)}</div>
          </div>
          <div style="font-family:var(--sp-font-label);font-size:16px;font-weight:700;color:${s.messageCount > 10 ? 'var(--sp-blue)' : 'var(--sp-ink)'};">${s.messageCount}</div>
          <div style="font-family:var(--sp-font-label);font-size:12px;color:var(--sp-muted);">${esc(s.lastActive)}</div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            ${(s.channels || []).map(c => `<span style="font-family:var(--sp-font-label);font-size:11px;background:var(--sp-tint);border:0.5px solid var(--sp-ink);padding:2px 7px;color:var(--sp-muted);">#${esc(c.name)} (${c.count})</span>`).join('')}
          </div>
        </div>
      `).join('')}
    `;
  } catch (err) {
    container.innerHTML = `<div style="padding:16px;font-family:var(--sp-font-body);font-size:14px;color:#cc4444;">Error loading Slack activity: ${esc(err.message)}</div>`;
  }
}

// ── Per-teacher Website Blocking ──────────────────────────────────────────────
async function loadBlockedSites() {
  try {
    const data = await api('/api/teacher/blocked-sites');
    renderBlockedSites(data?.sites || []);
  } catch {}
}

function renderBlockedSites(sites) {
  const container = document.getElementById('blocked-sites-list');
  if (!container) return;
  if (!sites || sites.length === 0) {
    container.innerHTML = '<div style="padding:14px 16px;font-family:var(--sp-font-body);font-size:14px;color:var(--sp-muted);">No sites blocked. Enter a URL above to block it for your students.</div>';
    return;
  }
  container.innerHTML = sites.map(s => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:0.5px solid var(--sp-ink);background:var(--sp-paper);">
      <div>
        <div style="font-family:var(--sp-font-label);font-size:14px;font-weight:700;color:var(--sp-ink);">${esc(s.domain)}</div>
        ${s.reason ? `<div style="font-family:var(--sp-font-body);font-size:12px;color:var(--sp-muted);">${esc(s.reason)}</div>` : ''}
      </div>
      <button onclick="unblockSite('${esc(s.domain)}')" style="background:transparent;border:0.5px solid var(--sp-ink);padding:6px 12px;font-family:var(--sp-font-label);font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--sp-muted);cursor:pointer;" onmouseover="this.style.borderColor='#cc4444';this.style.color='#cc4444'" onmouseout="this.style.borderColor='var(--sp-ink)';this.style.color='var(--sp-muted)'">Unblock</button>
    </div>
  `).join('');
}

async function blockSite() {
  const urlInput    = document.getElementById('block-url-input');
  const reasonInput = document.getElementById('block-reason-input');
  const url         = (urlInput?.value || '').trim();
  const reason      = (reasonInput?.value || '').trim();
  if (!url) return;
  try {
    const data = await api('/api/teacher/blocked-sites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, reason }),
    });
    if (data?.success) {
      if (urlInput)    urlInput.value    = '';
      if (reasonInput) reasonInput.value = '';
      loadBlockedSites();
    } else {
      alert(data?.error || 'Could not block site');
    }
  } catch (err) {
    alert(err.message);
  }
}

async function unblockSite(domain) {
  if (!confirm(`Unblock ${domain}?`)) return;
  try {
    await api(`/api/teacher/blocked-sites/${encodeURIComponent(domain)}`, { method: 'DELETE' });
    loadBlockedSites();
  } catch {}
}

window.blockSite   = blockSite;
window.unblockSite = unblockSite;
window.loadSlackActivity = loadSlackActivity;

window.addEventListener('load', () => {
  loadBlockedSites();
  loadSlackActivity();
  // Restore the last open conversation panel after a page refresh
  try {
    const lastEmail = localStorage.getItem('lastActiveStudentEmail');
    const lastName  = localStorage.getItem('lastActiveStudentName');
    if (lastEmail) openConvoPanel(lastEmail, lastName || lastEmail);
  } catch {}
});

// ── Student Goals Viewer ──────────────────────────────────────────────────────
async function loadAllStudentGoals() {
  const container = document.getElementById('student-goals-summary');
  if (!container) return;
  container.innerHTML = '<div style="padding:16px;font-family:var(--sp-font-body);font-size:14px;color:var(--sp-muted);">Loading…</div>';
  try {
    const data = await api('/api/teacher/all-student-goals');
    renderStudentGoalsSummary(data.summaries || []);
  } catch (err) {
    container.innerHTML = `<div style="padding:16px;color:#cc4444;font-family:var(--sp-font-label);font-size:13px;">Error: ${err.message}</div>`;
  }
}

function renderStudentGoalsSummary(summaries) {
  const container = document.getElementById('student-goals-summary');
  if (!container) return;

  if (!summaries.length) {
    container.innerHTML = '<div style="padding:20px;font-family:var(--sp-font-body);font-size:15px;color:var(--sp-muted);">No students assigned yet.</div>';
    return;
  }

  const header = `<div style="display:grid;grid-template-columns:1.5fr 80px 80px 80px 80px 100px;gap:10px;padding:10px 16px;background:var(--sp-ink);font-family:var(--sp-font-label);font-size:10px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--sp-paper);">
    <div>Student</div>
    <div style="text-align:center;">Daily</div>
    <div style="text-align:center;">Weekly</div>
    <div style="text-align:center;">Goals</div>
    <div style="text-align:center;">Steps</div>
    <div></div>
  </div>`;

  const rows = summaries.map(s => {
    const dailyTotal  = s.completedDailyGoals  + s.activeDailyGoals;
    const weeklyTotal = s.completedWeeklyGoals + s.activeWeeklyGoals;
    const lastUpdated = s.lastUpdated === 'Never' ? 'Never' : new Date(s.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `<div style="display:grid;grid-template-columns:1.5fr 80px 80px 80px 80px 100px;align-items:center;gap:10px;padding:13px 16px;border-bottom:0.5px solid var(--sp-ink);background:var(--sp-paper);" onmouseover="this.style.background='var(--sp-tint)'" onmouseout="this.style.background='var(--sp-paper)'">
      <div>
        <div style="font-family:var(--sp-font-body);font-size:15px;font-weight:600;color:var(--sp-ink);">${s.studentName}</div>
        <div style="font-family:var(--sp-font-label);font-size:10px;color:var(--sp-muted);">Updated: ${lastUpdated}</div>
      </div>
      <div style="text-align:center;font-family:var(--sp-font-label);font-size:15px;font-weight:700;color:${s.completedDailyGoals > 0 ? 'var(--sp-blue)' : 'var(--sp-ink)'};">${s.completedDailyGoals}/${dailyTotal}</div>
      <div style="text-align:center;font-family:var(--sp-font-label);font-size:15px;font-weight:700;color:${s.completedWeeklyGoals > 0 ? 'var(--sp-blue)' : 'var(--sp-ink)'};">${s.completedWeeklyGoals}/${weeklyTotal}</div>
      <div style="text-align:center;font-family:var(--sp-font-label);font-size:15px;font-weight:700;color:var(--sp-ink);">${s.activeGoals}</div>
      <div style="text-align:center;font-family:var(--sp-font-label);font-size:15px;font-weight:700;color:var(--sp-ink);">${s.activePlanSteps}</div>
      <button onclick="viewStudentGoals('${s.studentEmail.replace(/'/g,"\\'")}','${s.studentName.replace(/'/g,"\\'")}');return false;" style="background:var(--sp-ink);border:none;padding:8px 14px;font-family:var(--sp-font-label);font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--sp-paper);cursor:pointer;">View All</button>
    </div>`;
  }).join('');

  container.innerHTML = header + rows;
}

// Tracks which student's detail view is open so mentorToggleGoalItem() can
// refresh it in place after a PATCH without needing to re-derive the
// studentName from rendered DOM text.
let _goalsDetailStudent = { email: null, name: null };

async function viewStudentGoals(studentEmail, studentName) {
  const detail = document.getElementById('student-goals-detail');
  if (!detail) return;
  _goalsDetailStudent = { email: studentEmail, name: studentName };
  detail.style.display = 'block';
  detail.innerHTML = '<div style="padding:16px;font-family:var(--sp-font-body);font-size:14px;color:var(--sp-muted);">Loading…</div>';
  await renderStudentGoalsDetail();
  detail.scrollIntoView({ behavior: 'smooth' });
}

// Re-fetches and re-renders the currently-open student's detail view in
// place — used after a mentor toggle so the UI doesn't need to hand-compute
// the new completed state client-side. Does not touch scroll position or
// show a loading flash, unlike viewStudentGoals() above, since this runs
// after an in-place action, not a fresh open.
async function renderStudentGoalsDetail() {
  const detail = document.getElementById('student-goals-detail');
  const { email: studentEmail, name: studentName } = _goalsDetailStudent;
  if (!detail || !studentEmail) return;
  try {
    // Raw fetch, not the shared api() helper — a 403 here means "this student
    // isn't your mentee" (mentorAssignmentStore scoping in routes/teacher.js),
    // not "your session is invalid." api() treats any 401/403 as a session
    // failure and redirects to /teacher/login, which would silently bounce a
    // validly-signed-in teacher instead of showing them why the request failed.
    const res = await fetch(`/api/teacher/student-goals/${encodeURIComponent(studentEmail)}`, { credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
    detail.innerHTML = `
      <div style="background:var(--sp-ink);padding:12px 18px;display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span style="font-family:var(--sp-font-label);font-size:13px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--sp-blue);">// ${studentName}'s Goals</span>
        <button onclick="document.getElementById('student-goals-detail').style.display='none'" style="font-family:var(--sp-font-label);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:var(--sp-muted);background:transparent;border:none;cursor:pointer;">Close ✕</button>
      </div>
      ${renderGoalSection('Daily Goals', data.dailyGoals || [], 'dailyGoals', studentEmail)}
      ${renderGoalSection('Weekly Goals', data.weeklyGoals || [], 'weeklyGoals', studentEmail)}
      ${renderGoalSection('Goals', data.goals || [], 'goals', studentEmail)}
      ${renderGoalSection('Plan of Attack', data.plan || [], 'plan', studentEmail)}
    `;
  } catch (err) {
    detail.innerHTML = `<div style="padding:16px;color:#cc4444;font-family:var(--sp-font-label);font-size:13px;">Error: ${err.message}</div>`;
  }
}

// Deliberately review-and-modify-only, not create — mentors can toggle,
// edit the wording of, or delete an EXISTING student-created item, but
// there's no "add goal" affordance here. Goal creation stays entirely
// student-owned (public/growth.js); see CLAUDE.md for the reasoning.
// item.text was previously interpolated unescaped here — student-authored
// freeform text rendered straight into a teacher's page with no escaping,
// a real stored-XSS gap. Fixed in the same edit that touched this function
// for the toggle/edit/delete controls below, not left for later.
function renderGoalSection(title, items, type, studentEmail) {
  if (!items || items.length === 0) return '';
  const safeEmail = studentEmail.replace(/'/g, "\\'");
  return `<div style="margin-bottom:10px;background:var(--sp-paper);border:0.5px solid var(--sp-ink);">
    <div style="padding:10px 16px;background:var(--sp-tint);border-bottom:2px solid var(--sp-ink);font-family:var(--sp-font-label);font-size:11px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:var(--sp-ink);">${title}</div>
    ${items.map(item => {
      const safeId = String(item.id).replace(/'/g, "\\'");
      return `<div class="mentor-goal-item" style="display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-bottom:0.5px solid var(--sp-ink);">
        <button onclick="mentorToggleGoalItem('${safeEmail}','${type}','${safeId}',this)" title="${item.completed ? 'Mark not done' : 'Mark done'}" style="width:14px;height:14px;border-radius:50%;background:${item.completed ? 'var(--sp-yellow)' : 'var(--sp-tint)'};flex-shrink:0;margin-top:3px;border:2px solid var(--sp-ink);padding:0;cursor:pointer;"></button>
        <div class="mentor-goal-text" data-raw-text="${escAttr(item.text)}" onclick="mentorEditGoalItem('${safeEmail}','${type}','${safeId}',this)" title="Click to edit" style="flex:1;font-family:var(--sp-font-body);font-size:14px;color:${item.completed ? 'var(--sp-muted)' : 'var(--sp-ink)'};text-decoration:${item.completed ? 'line-through' : 'none'};line-height:1.5;cursor:text;">${esc(item.text)}</div>
        <button onclick="mentorDeleteGoalItem('${safeEmail}','${type}','${safeId}',this)" title="Delete" style="background:transparent;border:none;color:var(--sp-muted);cursor:pointer;font-size:16px;line-height:1;padding:0 2px;flex-shrink:0;">×</button>
      </div>`;
    }).join('')}
  </div>`;
}

function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}

async function mentorPatchGoalItem(studentEmail, type, itemId, body) {
  // Raw fetch, not the shared api() helper — see the comment in
  // renderStudentGoalsDetail() above: a 403 here is per-student mentor-
  // assignment scoping, not a session failure, and shouldn't redirect to login.
  const res = await fetch(`/api/teacher/student-goals/${encodeURIComponent(studentEmail)}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, itemId, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
  return data;
}

async function mentorToggleGoalItem(studentEmail, type, itemId, btn) {
  btn.disabled = true;
  try {
    await mentorPatchGoalItem(studentEmail, type, itemId, { action: 'toggle' });
    // Simplest correct source of truth: re-render from a fresh fetch rather
    // than hand-computing the new completed state client-side — this is a
    // low-frequency mentor action, not a hot path worth optimizing.
    await renderStudentGoalsDetail();
  } catch (err) {
    alert('Could not update: ' + err.message);
    btn.disabled = false;
  }
}

async function mentorDeleteGoalItem(studentEmail, type, itemId, btn) {
  if (!confirm('Delete this item? This cannot be undone.')) return;
  btn.disabled = true;
  try {
    await mentorPatchGoalItem(studentEmail, type, itemId, { action: 'delete' });
    btn.closest('.mentor-goal-item')?.remove();
  } catch (err) {
    alert('Could not delete: ' + err.message);
    btn.disabled = false;
  }
}

function mentorEditGoalItem(studentEmail, type, itemId, el) {
  if (el.querySelector('textarea')) return; // already editing
  const rawText = el.dataset.rawText || '';
  const ta = document.createElement('textarea');
  ta.value = rawText;
  ta.style.cssText = "width:100%;font-family:var(--sp-font-body);font-size:14px;line-height:1.5;border:2px solid var(--sp-ink);border-radius:8px;padding:4px 6px;resize:vertical;";
  const originalHtml = el.innerHTML;
  el.innerHTML = '';
  el.appendChild(ta);
  el.onclick = null;
  ta.focus();
  ta.setSelectionRange(ta.value.length, ta.value.length);

  let settled = false;
  async function commit() {
    if (settled) return;
    settled = true;
    const newText = ta.value.trim();
    if (!newText || newText === rawText) {
      el.innerHTML = originalHtml;
      el.onclick = () => mentorEditGoalItem(studentEmail, type, itemId, el);
      return;
    }
    try {
      await mentorPatchGoalItem(studentEmail, type, itemId, { action: 'edit', text: newText });
      el.dataset.rawText = newText;
      el.textContent = newText;
      el.onclick = () => mentorEditGoalItem(studentEmail, type, itemId, el);
    } catch (err) {
      alert('Could not save edit: ' + err.message);
      el.innerHTML = originalHtml;
      el.onclick = () => mentorEditGoalItem(studentEmail, type, itemId, el);
    }
  }
  ta.addEventListener('blur', commit);
  ta.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); }
    if (e.key === 'Escape') { settled = true; el.innerHTML = originalHtml; el.onclick = () => mentorEditGoalItem(studentEmail, type, itemId, el); }
  });
}


// ── Chatbot Feedback (students' 👍/👎 on coach replies; mentor-scoped server-side) ──────────────
const CF_REASON_LABELS = { wrong: 'Wrong information', not_helpful: "Didn't answer the question", confusing: 'Confusing',
  too_long: 'Too long', too_short: 'Not enough detail', other: 'Something else' };
async function loadChatFeedback() {
  const list = document.getElementById('cf-list'), sum = document.getElementById('cf-summary');
  if (!list) return;
  list.innerHTML = '<div class="empty-state">Loading…</div>';
  const days = document.getElementById('cf-days')?.value || '30';
  const rating = document.getElementById('cf-rating')?.value || '';
  try {
    const data = await api(`/api/teacher/chat-feedback?days=${encodeURIComponent(days)}${rating ? '&rating=' + encodeURIComponent(rating) : ''}`);
    if (!data) { list.innerHTML = '<div class="empty-state">Could not load feedback.</div>'; return; }
    const s = data.summary || {};
    const tile = (label, value, color) => `<div style="padding:8px 18px 8px 0;min-width:110px;"><div style="font-family:var(--sp-font-label);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--sp-muted);">${label}</div><div style="font-family:var(--sp-font-body);font-size:26px;font-weight:700;color:${color};">${value}</div></div>`;
    const reasons = Object.entries(s.reasons || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${esc(CF_REASON_LABELS[k] || k)} ×${n}`).join(' · ');
    sum.innerHTML = tile('Ratings', s.total ?? 0, 'var(--sp-ink)') + tile('👍 Helpful', s.up ?? 0, '#4CAF50') + tile('👎 Not helpful', s.down ?? 0, '#E57373')
      + tile('Positive', s.upPercent == null ? '—' : s.upPercent + '%', 'var(--sp-blue)')
      + (reasons ? `<div style="background:var(--sp-tint);border:var(--sp-border);border-radius:var(--sp-input-radius);padding:12px 18px;flex:1;min-width:220px;"><div style="font-family:var(--sp-font-label);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--sp-muted);">Top complaints</div><div style="color:var(--sp-ink);margin-top:6px;">${reasons}</div></div>` : '');
    const entries = data.entries || [];
    if (!entries.length) {
      list.innerHTML = `<div class="empty-state">${rating === 'down' ? 'No 👎 in this period — nothing flagged.' : 'No feedback yet. Students see a 👍 / 👎 under each coach reply; ratings appear here.'}</div>`;
      return;
    }
    list.innerHTML = entries.map(e => `
      <div class="log-entry ${e.rating === 'down' ? 'flagged' : ''}">
        <div class="log-entry-head">
          <span class="log-student">${esc(e.name)}</span>
          <div class="flag-tags"><span class="flag-tag" style="${e.rating === 'up' ? 'background:#2E7D32;color:var(--sp-paper)' : ''}">${e.rating === 'up' ? '👍 Helpful' : '👎 Not helpful'}</span>${e.reason ? `<span class="flag-tag">${esc(CF_REASON_LABELS[e.reason] || e.reason)}</span>` : ''}</div>
          <span class="log-time">${fmtTs(e.ts)}</span>
        </div>
        <div class="log-prompt">💬 ${esc(e.prompt || '(question not captured)')}</div>
        <div class="log-response expanded">🤖 ${mdLite(e.response || '')}</div>
        ${e.comment ? `<div class="log-prompt" style="margin-top:6px;color:var(--sp-blue);">📝 Student note: ${esc(e.comment)}</div>` : ''}
        ${e.visuals?.length ? `<div class="log-visuals">Shown with reply: ${esc(e.visuals.join(' · '))}</div>` : ''}
      </div>`).join('');
  } catch (err) {
    list.innerHTML = `<div class="empty-state" style="color:#dc2626">${esc(err.message)}</div>`;
  }
}
window.loadChatFeedback = loadChatFeedback;
