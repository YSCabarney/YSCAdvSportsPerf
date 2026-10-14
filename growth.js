/* YSC Student Hub — Growth Page (Goals, Daily, Weekly, Plan of Attack) */
'use strict';

let growthSaving = false;
let growthLoaded = false;
// The lastUpdated value from the last successful load/save — compared
// against a fresh fetch right before every save so a mentor's edit (via
// routes/teacher.js's new PATCH endpoint) can't be silently overwritten by
// this page's own next wholesale save. Not a merge — just a staleness check;
// the server enforces the same check authoritatively (server.js).
let growthLastUpdated = null;

// ── Add item helpers ───────────────────────────────────────────────────────────
function addGoal() {
  _addItem('goals-container', 'goals-empty', 'goal_', 'goal');
}
function addStep() {
  _addItem('plan-container', 'plan-empty', 'step_', 'step');
}
function addDailyGoal() {
  _addItem('daily-goals-container', 'daily-goals-empty', 'daily_', 'daily');
  updateProgress('daily');
}
function addWeeklyGoal() {
  _addItem('weekly-goals-container', 'weekly-goals-empty', 'weekly_', 'weekly');
  updateProgress('weekly');
}

function _addItem(containerId, emptyId, prefix, type) {
  const container = document.getElementById(containerId);
  const empty     = document.getElementById(emptyId);
  if (!container) return;
  if (empty) empty.style.display = 'none';
  const div = createItemEl(prefix + Date.now(), '', false, type);
  container.appendChild(div);
  div.querySelector('.goal-textarea').focus();
}

// ── Item element factory ───────────────────────────────────────────────────────
const _placeholders = {
  goal:   'Enter your goal...',
  step:   'Enter a step in your plan...',
  daily:  'What will you accomplish today?',
  weekly: 'What will you accomplish this week?',
};

function createItemEl(id, text, completed, type, createdAt) {
  const div = document.createElement('div');
  div.className = 'goal-item' + (completed ? ' completed' : '');
  div.dataset.id        = id;
  div.dataset.type      = type;
  div.dataset.completed = completed ? 'true' : 'false';
  // Found 2026-09-18: this always stamped "now" here, even when re-rendering
  // an EXISTING item loaded from the server — collectItems() then reads that
  // clobbered value back on every save, so every item's real createdAt was
  // silently overwritten with the page's load time on the very next save.
  // Currently has no visible effect (nothing displays/sorts by createdAt for
  // goals/plan/daily/weekly items today), but fixed since it's a one-line
  // safe change and the field would otherwise be quietly meaningless for any
  // future feature built on it. Callers loading existing data now pass the
  // item's real createdAt through; only genuinely new items (the _addItem()
  // call sites, which pass no createdAt) fall back to "now".
  div.dataset.createdAt = createdAt || new Date().toISOString();
  div.innerHTML = `
    <input type="checkbox" class="goal-checkbox" ${completed ? 'checked' : ''} onchange="toggleItem(this)" />
    <textarea class="goal-textarea" placeholder="${_placeholders[type] || 'Enter...'}" rows="1" oninput="autoResize(this)">${text}</textarea>
    <button class="goal-remove-btn" onclick="removeItem(this)" title="Remove">×</button>
  `;
  const ta = div.querySelector('.goal-textarea');
  setTimeout(() => autoResize(ta), 0);
  return div;
}

function autoResize(ta) {
  ta.style.height = 'auto';
  ta.style.height = ta.scrollHeight + 'px';
}

// ── Toggle / remove ────────────────────────────────────────────────────────────
function toggleItem(checkbox) {
  const item = checkbox.closest('.goal-item');
  const isCompleted = checkbox.checked;
  item.dataset.completed = isCompleted ? 'true' : 'false';
  item.classList.toggle('completed', isCompleted);
  const type = item.dataset.type;
  if (type === 'daily' || type === 'weekly') updateProgress(type);
  saveGrowthData();
}

function removeItem(btn) {
  const item = btn.closest('.goal-item');
  const type = item.dataset.type;
  item.remove();
  updateEmptyState(type);
  if (type === 'daily' || type === 'weekly') updateProgress(type);
  saveGrowthData();
}

// ── Empty state ────────────────────────────────────────────────────────────────
const _emptyMap = {
  goal:   { containerId: 'goals-container',        emptyId: 'goals-empty' },
  step:   { containerId: 'plan-container',         emptyId: 'plan-empty' },
  daily:  { containerId: 'daily-goals-container',  emptyId: 'daily-goals-empty' },
  weekly: { containerId: 'weekly-goals-container', emptyId: 'weekly-goals-empty' },
};

function updateEmptyState(type) {
  const { containerId, emptyId } = _emptyMap[type] || {};
  if (!containerId) return;
  const container = document.getElementById(containerId);
  const empty     = document.getElementById(emptyId);
  if (!container || !empty) return;
  empty.style.display = container.querySelectorAll('.goal-item').length === 0 ? 'block' : 'none';
}

// ── Progress bars (daily / weekly) ────────────────────────────────────────────
function updateProgress(type) {
  const containerId = type === 'daily' ? 'daily-goals-container' : 'weekly-goals-container';
  const fillId      = type === 'daily' ? 'daily-progress-fill'   : 'weekly-progress-fill';
  const labelId     = type === 'daily' ? 'daily-progress-label'  : 'weekly-progress-label';

  const container = document.getElementById(containerId);
  if (!container) return;

  const all  = container.querySelectorAll('.goal-item');
  const done = container.querySelectorAll('.goal-item.completed');
  const pct  = all.length > 0 ? Math.round((done.length / all.length) * 100) : 0;

  const fill  = document.getElementById(fillId);
  const label = document.getElementById(labelId);
  if (fill)  fill.style.width   = pct + '%';
  if (label) label.textContent  = `${done.length} of ${all.length} completed`;
}

// ── Completed section toggle (goals / plan) ────────────────────────────────────
function toggleCompleted(type) {
  const containerId = type === 'goals' ? 'completed-goals-container' : 'completed-plan-container';
  const container   = document.getElementById(containerId);
  if (!container) return;
  const isVisible = container.style.display !== 'none';
  container.style.display = isVisible ? 'none' : 'flex';
  const labelId = type === 'goals' ? 'completed-goals-label' : 'completed-plan-label';
  const label   = document.getElementById(labelId);
  if (label) {
    const count = container.querySelectorAll('.goal-item').length;
    const noun  = type === 'goals' ? 'goals' : 'steps';
    label.textContent = isVisible
      ? `Show completed ${noun} (${count})`
      : `Hide completed ${noun} (${count})`;
  }
}

// ── Collect items from DOM ─────────────────────────────────────────────────────
function collectItems(containerId, completedContainerId) {
  const items = [];
  [containerId, completedContainerId].forEach(cid => {
    if (!cid) return;
    const container = document.getElementById(cid);
    if (!container) return;
    container.querySelectorAll('.goal-item').forEach(el => {
      const text = el.querySelector('.goal-textarea')?.value?.trim();
      if (text) {
        items.push({
          id:        el.dataset.id        || ('item_' + Date.now()),
          text,
          completed: el.dataset.completed === 'true',
          createdAt: el.dataset.createdAt || new Date().toISOString(),
        });
      }
    });
  });
  return items;
}

// ── Save ───────────────────────────────────────────────────────────────────────
async function saveGrowthData() {
  if (growthSaving) return;
  growthSaving = true;

  const btn    = document.getElementById('save-growth-btn');
  const status = document.getElementById('growth-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

  const goals      = collectItems('goals-container',        'completed-goals-container');
  const plan       = collectItems('plan-container',         'completed-plan-container');
  const dailyGoals = collectItems('daily-goals-container',  '');
  const weeklyGoals= collectItems('weekly-goals-container', '');

  try {
    // Refetch before save: a mentor may have edited this student's goals
    // (routes/teacher.js's PATCH endpoint) since this page loaded. A real
    // fresh fetch here — not a locally-tracked guess — so the comparison
    // reflects what's actually on the server right now. Not a merge; if it
    // changed, we stop and tell the student to reload rather than trying to
    // reconcile the two versions.
    const freshRes = await fetch('/api/student/growth');
    const fresh    = await freshRes.json();
    if (growthLastUpdated && fresh.lastUpdated && fresh.lastUpdated !== growthLastUpdated) {
      if (status) {
        status.textContent = 'Your goals changed elsewhere — reload the page to see the latest before saving';
        status.style.color = '#cc4444';
        status.style.display = 'inline';
      }
      return;
    }

    const res  = await fetch('/api/student/growth', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ goals, plan, dailyGoals, weeklyGoals, expectedLastUpdated: growthLastUpdated }),
    });
    const data = await res.json();
    if (data.success) {
      growthLastUpdated = data.lastUpdated || growthLastUpdated;
      if (status) { status.textContent = 'Saved ✓'; status.style.color = 'var(--sp-blue)'; status.style.display = 'inline'; }
      setTimeout(() => { if (status) status.style.display = 'none'; }, 2500);
      if (typeof window.loadTodaysFocus === 'function') window.loadTodaysFocus();
    } else if (res.status === 409) {
      // The authoritative server-side check (server.js) caught a change
      // that landed in the narrow window between the refetch above and this
      // POST — same message, same "reload, don't overwrite" resolution.
      if (status) { status.textContent = data.message || 'Your goals changed elsewhere — reload before saving'; status.style.color = '#cc4444'; status.style.display = 'inline'; }
    } else {
      if (status) { status.textContent = 'Could not save — tap to try again'; status.style.color = '#cc4444'; status.style.display = 'inline'; }
    }
  } catch (err) {
    if (status) { status.textContent = 'Network error'; status.style.color = '#cc4444'; status.style.display = 'inline'; }
  } finally {
    growthSaving = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Save Changes →'; }
  }
}

// ── Load ───────────────────────────────────────────────────────────────────────
async function loadGrowthData() {
  if (growthLoaded) return;
  try {
    const res  = await fetch('/api/student/growth');
    const data = await res.json();
    growthLastUpdated = data.lastUpdated || null;

    // Date labels
    const today = new Date();
    const dateEl = document.getElementById('daily-date');
    if (dateEl) dateEl.textContent = today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const monday = new Date(today);
    monday.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const weekEl = document.getElementById('weekly-date');
    if (weekEl) weekEl.textContent = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

    // Existing goals
    const activeGoals    = (data.goals || []).filter(g => !g.completed);
    const completedGoals = (data.goals || []).filter(g =>  g.completed);
    const activeSteps    = (data.plan  || []).filter(p => !p.completed);
    const completedSteps = (data.plan  || []).filter(p =>  p.completed);
    const dailyGoals     = data.dailyGoals  || [];
    const weeklyGoals    = data.weeklyGoals || [];

    const goalsContainer          = document.getElementById('goals-container');
    const planContainer           = document.getElementById('plan-container');
    const completedGoalsContainer = document.getElementById('completed-goals-container');
    const completedPlanContainer  = document.getElementById('completed-plan-container');
    const dailyContainer          = document.getElementById('daily-goals-container');
    const weeklyContainer         = document.getElementById('weekly-goals-container');

    if (goalsContainer) {
      const empty = document.getElementById('goals-empty');
      if (empty) empty.style.display = activeGoals.length === 0 ? 'block' : 'none';
      activeGoals.forEach(g => goalsContainer.appendChild(createItemEl(g.id, g.text, false, 'goal', g.createdAt)));
    }
    const goalsLabel = document.getElementById('completed-goals-label');
    if (completedGoalsContainer && completedGoals.length > 0) {
      completedGoals.forEach(g => completedGoalsContainer.appendChild(createItemEl(g.id, g.text, true, 'goal', g.createdAt)));
      if (goalsLabel) goalsLabel.textContent = `Show completed goals (${completedGoals.length})`;
    } else if (goalsLabel) {
      goalsLabel.textContent = "Nothing completed yet — you've got this";
    }
    if (planContainer) {
      const empty = document.getElementById('plan-empty');
      if (empty) empty.style.display = activeSteps.length === 0 ? 'block' : 'none';
      activeSteps.forEach(p => planContainer.appendChild(createItemEl(p.id, p.text, false, 'step', p.createdAt)));
    }
    const planLabel = document.getElementById('completed-plan-label');
    if (completedPlanContainer && completedSteps.length > 0) {
      completedSteps.forEach(p => completedPlanContainer.appendChild(createItemEl(p.id, p.text, true, 'step', p.createdAt)));
      if (planLabel) planLabel.textContent = `Show completed steps (${completedSteps.length})`;
    } else if (planLabel) {
      planLabel.textContent = 'Nothing completed yet — keep going';
    }
    if (dailyContainer) {
      const empty = document.getElementById('daily-goals-empty');
      if (empty) empty.style.display = dailyGoals.length === 0 ? 'block' : 'none';
      dailyGoals.forEach(g => dailyContainer.appendChild(createItemEl(g.id, g.text, g.completed, 'daily', g.createdAt)));
      updateProgress('daily');
    }
    if (weeklyContainer) {
      const empty = document.getElementById('weekly-goals-empty');
      if (empty) empty.style.display = weeklyGoals.length === 0 ? 'block' : 'none';
      weeklyGoals.forEach(g => weeklyContainer.appendChild(createItemEl(g.id, g.text, g.completed, 'weekly', g.createdAt)));
      updateProgress('weekly');
    }

    growthLoaded = true;
  } catch (err) {
    console.error('[Growth] loadGrowthData error:', err.message);
  }
}

// ── Wire Save button once on load ─────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  const saveBtn = document.getElementById('save-growth-btn');
  if (saveBtn) {
    const fresh = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(fresh, saveBtn);
    fresh.addEventListener('click', saveGrowthData);
  }
});
