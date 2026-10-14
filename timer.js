// ── YSC Academy Timer Widget ───────────────────────────────────────────────
// Handles countdown timer, stopwatch, alarm clock, and Pomodoro mode.
// All instances share state via localStorage. Floating panel is the primary UI.

(function () {
'use strict';

// ── Constants ─────────────────────────────────────────────────────────────
const LS_KEY    = 'ysc-timer-v1';

const POMO_WORK  = 25 * 60;
const POMO_SHORT =  5 * 60;
const POMO_LONG  = 15 * 60;

// ── Shared state ──────────────────────────────────────────────────────────
const S = {
  mode: 'countdown',
  cd: { total: 25 * 60, remaining: 25 * 60, running: false, label: '', startedAt: null, isFocusMode: false },
  sw: { elapsed: 0, running: false, startedAt: null, laps: [] },
  pm: { active: false, cycle: 1, phase: 'work', sessionsToday: 0, lastDate: '' },
  alarms: [],
};

let _cdTimer = null;
let _swTimer = null;

// ── Persistence ───────────────────────────────────────────────────────────
function save() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      mode: S.mode,
      cd: { ...S.cd, running: false },
      sw: { elapsed: S.sw.elapsed, laps: S.sw.laps, running: false, startedAt: null },
      pm: S.pm,
    }));
  } catch {}
}

function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.cd) {
      Object.assign(S.cd, saved.cd);
      S.cd.running = false;
    }
    if (saved.sw) Object.assign(S.sw, saved.sw);
    if (saved.pm) Object.assign(S.pm, saved.pm);
    if (saved.mode) S.mode = saved.mode;
  } catch {}
}

// ── Audio engine (Web Audio API synth — no external files) ────────────────
let _actx = null;
function actx() {
  if (!_actx) _actx = new (window.AudioContext || window.webkitAudioContext)();
  return _actx;
}

function note(ctx, freq, t, dur, type = 'sine', vol = 0.3) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(ctx.destination);
  o.type = type; o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.start(t); o.stop(t + dur + 0.05);
}

function playSound(type = 'chime') {
  try {
    const ctx = actx();
    const t   = ctx.currentTime;
    if (type === 'chime') {
      // Gentle D5 → A4 → F#4 arpeggio
      note(ctx, 587.3, t,       0.5, 'sine', 0.3);
      note(ctx, 440.0, t + 0.3, 0.5, 'sine', 0.25);
      note(ctx, 369.9, t + 0.6, 0.8, 'sine', 0.2);
    } else if (type === 'bell') {
      note(ctx, 659.3, t,        0.4, 'square', 0.12);
      note(ctx, 659.3, t + 0.55, 0.4, 'square', 0.10);
    } else if (type === 'beep') {
      [0, 0.25, 0.5].forEach(d => note(ctx, 880, t + d, 0.15, 'sine', 0.28));
    } else if (type === 'tone') {
      // Ascending C-E-G-C arpeggio
      [261.6, 329.6, 392.0, 523.3].forEach((f, i) =>
        note(ctx, f, t + i * 0.18, 0.35, 'sine', 0.28));
    }
  } catch (e) {
    console.warn('[Timer] sound error:', e.message);
  }
}

// ── Browser notification ───────────────────────────────────────────────────
function browserNotif(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    const n = new Notification('⏰ ' + title, { body, icon: '/favicon.ico', tag: 'ysc-timer' });
    n.onclick = () => { window.focus(); n.close(); };
  }
}

// ── Timer fire popup ───────────────────────────────────────────────────────
const ENCOURAGE = [
  "Great work staying focused! Take a short break — you earned it! 🌟",
  "You did it! Excellent concentration. Stretch and recharge! ☀️",
  "Timer complete! You're crushing it today! 💪",
  "Focus session done! You should be proud of that effort! 🎉",
];

// opts.reflection + opts.onReflect(outcome): turns Focus Mode completion from
// a one-way celebration into a closed coaching loop — see onCDDone() above and
// the 'ysc:focusModeComplete' listener in app.js, which routes the answer into
// a real chat message so the coach can actually respond to it.
function showFirePopup(title, msg, sound, opts = {}) {
  playSound(sound || 'chime');
  browserNotif(title, msg);
  document.getElementById('timer-fire-popup')?.remove();
  const el = document.createElement('div');
  el.id = 'timer-fire-popup';
  el.className = 'timer-fire-popup';
  el.innerHTML = `
    <div class="timer-fire-card">
      <div class="timer-fire-icon">⏰</div>
      <div class="timer-fire-title">${esc(title)}</div>
      <div class="timer-fire-msg">${esc(msg)}</div>
      ${opts.brainBreak ? `<button class="tfire-btn tfire-brainbreak">🏁 Brain break: 5-min hurdle race</button>` : ''}
      ${opts.reflection ? `
      <div class="timer-fire-reflect">What's the status?</div>
      <div class="timer-fire-btns">
        <button class="tfire-btn tfire-reflect-done">✅ Got it done</button>
        <button class="tfire-btn tfire-reflect-stuck">🤔 Still stuck</button>
      </div>` : `
      <div class="timer-fire-btns">
        <button class="tfire-btn tfire-ok">✓ Got it</button>
        ${opts.snooze ? `<button class="tfire-btn tfire-snooze">💤 +5 min</button>` : ''}
      </div>`}
    </div>`;
  document.body.appendChild(el);
  el.querySelector('.tfire-brainbreak')?.addEventListener('click', () => { el.remove(); window.BrainBreak?.open?.(); });
  if (opts.reflection) {
    el.querySelector('.tfire-reflect-done').onclick  = () => { el.remove(); opts.onReflect?.('done'); };
    el.querySelector('.tfire-reflect-stuck').onclick = () => { el.remove(); opts.onReflect?.('stuck'); };
    return;
  }
  el.querySelector('.tfire-ok').onclick = () => el.remove();
  if (opts.snooze) el.querySelector('.tfire-snooze').onclick = () => { el.remove(); opts.snooze(); };
}

// ── Helpers ────────────────────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function pad(n) { return String(n).padStart(2, '0'); }

function fmtCD(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function fmtSW(ms) {
  const s  = Math.floor(ms / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  const h  = Math.floor(s / 3600);
  const m  = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(ss)}.${pad(cs)}`
    : `${pad(m)}:${pad(ss)}.${pad(cs)}`;
}

function studentName() {
  return (window.getStudentName && window.getStudentName())
      || localStorage.getItem('ysc-student-name') || '';
}

async function api(url, opts = {}) {
  const n = studentName();
  const r = await fetch(url, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(n ? { 'X-Student-Name': n } : {}),
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

async function logSession(type, durationMs, label) {
  try { await api('/api/timer/sessions', { method: 'POST', body: JSON.stringify({ type, durationMs, label: label || '' }) }); } catch {}
}

// ── Panel open / close ────────────────────────────────────────────────────
let _open = false;

function openPanel() {
  const p = document.getElementById('timer-float-panel');
  if (!p) return;
  _open = true;
  p.style.display = 'flex';
  refreshPanel();
}
function closePanel() {
  const p = document.getElementById('timer-float-panel');
  if (p) p.style.display = 'none';
  _open = false;
}
function togglePanel() { _open ? closePanel() : openPanel(); }

// ── Mode routing ──────────────────────────────────────────────────────────
function setMode(mode) {
  S.mode = mode;
  document.querySelectorAll('.timer-mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));
  refreshPanel();
  save();
}

function refreshPanel() {
  const body = document.getElementById('timer-panel-body');
  if (!body) return;
  if (S.mode === 'countdown') renderCD(body);
  else if (S.mode === 'stopwatch') renderSW(body);
  else renderAlarmPanel(body);
}

// ── Time display color (>50% navy, 10-50% amber, ≤10% red) ───────────────
function timeColor(frac) {
  if (frac > 0.5)  return '#0D1B8E';
  if (frac > 0.1)  return '#BA7517';
  return '#E24B4A';
}

// ── Countdown ─────────────────────────────────────────────────────────────
function renderCD(el) {
  const cd   = S.cd;
  const frac = cd.total > 0 ? cd.remaining / cd.total : 0;
  const col  = timeColor(frac);
  const pct  = (frac * 100).toFixed(1);

  el.innerHTML = `
    <div class="tcd">
      <input class="tcd-label" id="tcd-label" type="text" maxlength="40"
        placeholder="Label: Study, Essay, Practice…" value="${esc(cd.label)}"/>

      <div class="tcd-pomo-row">
        <div class="tcd-divider"></div>
        <button class="tpreset-pomo" id="tcd-pomo">🍅 Pomodoro Mode</button>
        <div class="tcd-divider"></div>
      </div>

      <div class="tcd-time-display${cd.running ? ' tpulse' : ''}" id="tcd-disp" style="color:${col}">${fmtCD(cd.remaining)}</div>

      <div class="tcd-bar-wrap">
        <div class="tcd-bar" id="tcd-bar" style="width:${pct}%;background:${col}"></div>
      </div>

      <div class="tcd-presets">
        <button class="tpreset" data-s="300">5m</button>
        <button class="tpreset" data-s="600">10m</button>
        <button class="tpreset" data-s="1500">25m</button>
        <button class="tpreset" data-s="2700">45m</button>
        <button class="tpreset" data-s="3600">60m</button>
      </div>

      <div class="tcd-inputs">
        <label>H<input type="number" id="tcd-h" min="0" max="23" value="${Math.floor(cd.total/3600)}"/></label>
        <label>M<input type="number" id="tcd-m" min="0" max="59" value="${Math.floor((cd.total%3600)/60)}"/></label>
        <label>S<input type="number" id="tcd-s" min="0" max="59" value="${cd.total%60}"/></label>
      </div>

      <div class="tctrl">
        <button class="tctrl-btn treset" id="tcd-reset">↺ Reset</button>
        <button class="tctrl-btn tmain" id="tcd-start">
          ${cd.running ? '⏸ Pause' : (cd.remaining < cd.total && cd.remaining > 0 ? '▶ Resume' : '▶ Start')}
        </button>
      </div>
      ${S.pm.active ? renderPomoBar() : ''}
    </div>`;

  el.querySelector('#tcd-label').oninput = e => { S.cd.label = e.target.value; save(); };

  el.querySelectorAll('.tpreset').forEach(b =>
    b.addEventListener('click', () => { cdPause(); cdSetTotal(parseInt(b.dataset.s)); renderCD(el); })
  );

  el.querySelector('#tcd-pomo').onclick  = () => startPomo(el);
  el.querySelector('#tcd-start').onclick = () => S.cd.running ? cdPause() : cdStart(el);
  el.querySelector('#tcd-reset').onclick = () => cdReset(el);

  ['#tcd-h','#tcd-m','#tcd-s'].forEach(id =>
    el.querySelector(id)?.addEventListener('change', () => {
      if (S.cd.running) return;
      const h = +el.querySelector('#tcd-h').value || 0;
      const m = +el.querySelector('#tcd-m').value || 0;
      const s = +el.querySelector('#tcd-s').value || 0;
      cdSetTotal(h * 3600 + m * 60 + s);
      renderCD(el);
    })
  );
}

function cdSetTotal(secs) {
  S.cd.total = Math.max(1, secs);
  S.cd.remaining = S.cd.total;
  S.cd.startedAt = null;
  save();
}

function cdStart(el) {
  if (S.cd.remaining <= 0) S.cd.remaining = S.cd.total;
  S.cd.running   = true;
  S.cd.startedAt = Date.now();
  save();
  if (document.getElementById('tcd-start')) document.getElementById('tcd-start').textContent = '⏸ Pause';
  document.querySelector('.tcd-time-display')?.classList.add('tpulse');
  clearInterval(_cdTimer);
  _cdTimer = setInterval(() => {
    S.cd.remaining = Math.max(0, S.cd.remaining - 1);
    cdUpdateDisplay();
    save();
    if (S.cd.remaining <= 0) {
      cdPause();
      onCDDone(el);
    }
  }, 1000);
}

function cdPause() {
  S.cd.running   = false;
  S.cd.startedAt = null;
  clearInterval(_cdTimer); _cdTimer = null;
  const btn = document.getElementById('tcd-start');
  if (btn) btn.textContent = S.cd.remaining > 0 ? '▶ Resume' : '▶ Start';
  document.querySelector('.tcd-time-display')?.classList.remove('tpulse');
  save();
}

function cdReset(el) {
  cdPause();
  S.cd.remaining  = S.cd.total;
  S.pm.active = false;
  save();
  renderCD(el);
}

function cdUpdateDisplay() {
  const cd   = S.cd;
  const frac = cd.total > 0 ? cd.remaining / cd.total : 0;
  const col  = timeColor(frac);
  const d    = document.getElementById('tcd-disp');
  if (d) { d.textContent = fmtCD(cd.remaining); d.style.color = col; }
  const bar  = document.getElementById('tcd-bar');
  if (bar)  { bar.style.width = (frac * 100).toFixed(1) + '%'; bar.style.background = col; }
}

function onCDDone(el) {
  if (S.pm.active) { onPomoDone(el); return; }
  const label = S.cd.label || 'Timer';
  const msg   = ENCOURAGE[Math.floor(Math.random() * ENCOURAGE.length)];
  const wasFocusMode = S.cd.isFocusMode;
  const breakEarned = !!window.BrainBreak?.earn?.(S.cd.total);   // 25+ min → a 5-minute brain-break game (if enabled)
  showFirePopup(label + ' — Done!', msg, 'chime', wasFocusMode ? {
    reflection: true, brainBreak: breakEarned,
    onReflect: (outcome) => document.dispatchEvent(new CustomEvent('ysc:focusModeComplete', { detail: { label, outcome } })),
  } : { brainBreak: breakEarned });
  logSession('countdown', S.cd.total, S.cd.label);
  S.cd.remaining = S.cd.total;
  S.cd.isFocusMode = false; // one-shot — a manually re-run/continued countdown isn't a fresh Focus Mode session
  renderCD(el);
}

// ── Pomodoro ───────────────────────────────────────────────────────────────
function renderPomoBar() {
  const p = S.pm;
  const phaseLabel = p.phase === 'work' ? '📖 Study' : p.phase === 'short-break' ? '☕ Short Break' : '🌴 Long Break';
  return `
    <div class="tpomo-bar">
      <div class="tpomo-dots">${[1,2,3,4].map(i =>
        `<span class="tpomo-dot${i <= (p.phase === 'work' ? p.cycle - 1 : p.cycle) ? ' done' : ''}"></span>`
      ).join('')}</div>
      <div class="tpomo-info">${phaseLabel} · Session ${p.cycle} of 4</div>
      ${p.sessionsToday > 0 ? `<div class="tpomo-streak">🔥 ${p.sessionsToday} Pomodoros today</div>` : ''}
    </div>`;
}

function startPomo(el) {
  const today = new Date().toDateString();
  if (S.pm.lastDate !== today) { S.pm.sessionsToday = 0; S.pm.lastDate = today; }
  S.pm.active = true; S.pm.cycle = 1; S.pm.phase = 'work';
  S.cd.total     = POMO_WORK;
  S.cd.remaining = POMO_WORK;
  S.cd.label     = '🍅 Pomodoro Study';
  save(); renderCD(el);
  showFirePopup('Pomodoro Started!', "Focus time! You have 25 minutes. Let's make them count! 🍅", 'tone');
  setTimeout(() => cdStart(el), 400);
}

function onPomoDone(el) {
  const p = S.pm;
  if (p.phase === 'work') {
    p.sessionsToday++;
    logSession('pomodoro', POMO_WORK, 'Pomodoro Work');
    if (p.cycle >= 4) {
      p.phase = 'long-break';
      S.cd.total = POMO_LONG; S.cd.remaining = POMO_LONG;
      S.cd.label = '🌴 Long Break';
      showFirePopup('Incredible!', 'You completed 4 Pomodoro cycles! Enjoy a 15-minute long break. 🎉', 'tone', { brainBreak: !!window.BrainBreak?.earn?.(POMO_WORK) });
    } else {
      p.phase = 'short-break';
      S.cd.total = POMO_SHORT; S.cd.remaining = POMO_SHORT;
      S.cd.label = '☕ Short Break';
      showFirePopup('Break Time!', `Amazing work! Take a 5-minute break — you earned it! (Cycle ${p.cycle} of 4 ✓)`, 'chime', { brainBreak: !!window.BrainBreak?.earn?.(POMO_WORK) });
    }
  } else if (p.phase === 'short-break') {
    p.cycle++;
    p.phase = 'work';
    S.cd.total = POMO_WORK; S.cd.remaining = POMO_WORK;
    S.cd.label = `🍅 Pomodoro Study ${p.cycle}`;
    showFirePopup('Back to Focus!', `Break over! Study session ${p.cycle} of 4 — you've got this! 💪`, 'tone');
  } else {
    // Long break over
    p.active = false; p.cycle = 1; p.phase = 'work';
    S.cd.total = POMO_WORK; S.cd.remaining = POMO_WORK; S.cd.label = '';
    showFirePopup('All Done!', 'Long break over. Want to start another Pomodoro set? You\'re on fire! 🚀', 'tone');
    save(); renderCD(el); return;
  }
  save(); renderCD(el);
  setTimeout(() => cdStart(el), 1800);
}

// ── Stopwatch ─────────────────────────────────────────────────────────────
function renderSW(el) {
  const sw = S.sw;
  el.innerHTML = `
    <div class="tsw">
      <div class="tsw-display${sw.running ? ' tring-pulse' : ''}" id="tsw-disp">${fmtSW(sw.elapsed)}</div>
      <div class="tctrl">
        <button class="tctrl-btn treset" id="tsw-reset">↺ Reset</button>
        <button class="tctrl-btn tmain" id="tsw-start">${sw.running ? '⏸ Stop' : (sw.elapsed > 0 ? '▶ Resume' : '▶ Start')}</button>
        <button class="tctrl-btn tlap" id="tsw-lap" ${sw.running ? '' : 'disabled'}>⏱ Lap</button>
      </div>
      <div class="tsw-laps" id="tsw-laps">${renderLapHTML(sw.laps)}</div>
    </div>`;
  el.querySelector('#tsw-start').onclick = () => sw.running ? swStop() : swStart(el);
  el.querySelector('#tsw-reset').onclick = () => swReset(el);
  el.querySelector('#tsw-lap').onclick   = () => swLap();
}

function renderLapHTML(laps) {
  if (!laps.length) return '<div class="tsw-laps-empty">Lap times will appear here</div>';
  let lapTotal = 0;
  return `<div class="tsw-laps-head"><span>Lap</span><span>Split</span><span>Total</span></div>` +
    laps.slice().reverse().map(l => {
      return `<div class="tsw-lap-row">
        <span class="tsw-lap-n">Lap ${l.n}</span>
        <span class="tsw-lap-split">${fmtSW(l.split)}</span>
        <span class="tsw-lap-total">${fmtSW(l.total)}</span>
      </div>`;
    }).join('');
}

function swStart(el) {
  S.sw.running   = true;
  S.sw.startedAt = Date.now() - S.sw.elapsed;
  document.getElementById('tsw-start')?.textContent === undefined ||
    (document.getElementById('tsw-start').textContent = '⏸ Stop');
  document.getElementById('tsw-lap')?.removeAttribute('disabled');
  document.getElementById('tsw-disp')?.classList.add('tring-pulse');
  clearInterval(_swTimer);
  _swTimer = setInterval(() => {
    S.sw.elapsed = Date.now() - S.sw.startedAt;
    const d = document.getElementById('tsw-disp');
    if (d) d.textContent = fmtSW(S.sw.elapsed);
  }, 50);
}

function swStop() {
  S.sw.running = false;
  clearInterval(_swTimer); _swTimer = null;
  const btn = document.getElementById('tsw-start');
  if (btn) btn.textContent = '▶ Resume';
  document.getElementById('tsw-lap')?.setAttribute('disabled', '');
  document.getElementById('tsw-disp')?.classList.remove('tring-pulse');
  save();
}

function swReset(el) {
  swStop();
  S.sw.elapsed = 0; S.sw.startedAt = null; S.sw.laps = [];
  save(); renderSW(el);
}

function swLap() {
  if (!S.sw.running) return;
  const prevTotal = S.sw.laps.length ? S.sw.laps[S.sw.laps.length - 1].total : 0;
  S.sw.laps.push({ n: S.sw.laps.length + 1, total: S.sw.elapsed, split: S.sw.elapsed - prevTotal });
  const lapsEl = document.getElementById('tsw-laps');
  if (lapsEl) lapsEl.innerHTML = renderLapHTML(S.sw.laps);
}

// ── Alarm Clock ───────────────────────────────────────────────────────────
async function renderAlarmPanel(el) {
  el.innerHTML = '<div class="loading" style="padding:20px">Loading alarms…</div>';
  let alarms = [];
  try { alarms = await api('/api/timer/alarms'); S.alarms = alarms; }
  catch { alarms = S.alarms || []; }

  el.innerHTML = `
    <div class="talarm">
      <div class="talarm-form">
        <div class="talarm-row">
          <input type="time" id="tal-time" class="tal-time" value="07:00"/>
          <input type="text" id="tal-label" class="tal-label" placeholder="Label…" maxlength="40"/>
        </div>
        <div class="talarm-row">
          <div class="tal-days">
            ${['Su','Mo','Tu','We','Th','Fr','Sa'].map((d,i)=>`
              <label class="tal-day-chip">
                <input type="checkbox" value="${i}" ${i>=1&&i<=5?'checked':''}/>
                ${d}
              </label>`).join('')}
          </div>
          <select id="tal-sound" class="tal-sound">
            <option value="chime">🎵 Chime</option>
            <option value="bell">🔔 Bell</option>
            <option value="beep">📢 Beep</option>
            <option value="tone">🎶 Tone</option>
          </select>
        </div>
        <button class="tctrl-btn tmain tal-add-btn" id="tal-add">＋ Add Alarm</button>
      </div>
      <div class="tal-list" id="tal-list">
        ${alarms.length ? alarms.map(renderAlarmItem).join('') :
          '<div class="tal-empty">No alarms yet. Add one above!</div>'}
      </div>
    </div>`;

  el.querySelector('#tal-add').onclick = () => addAlarm(el);

  el.querySelectorAll('.tal-toggle-input').forEach(cb =>
    cb.addEventListener('change', async () => {
      const id = cb.dataset.id;
      try { await api(`/api/timer/alarms/${id}`, { method:'PUT', body: JSON.stringify({ enabled: cb.checked }) }); }
      catch {}
    })
  );

  el.querySelectorAll('.tal-del').forEach(btn =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try { await api(`/api/timer/alarms/${id}`, { method:'DELETE' }); } catch {}
      btn.closest('.tal-item')?.remove();
      S.alarms = S.alarms.filter(a => a.id !== id);
    })
  );
}

function renderAlarmItem(a) {
  const [hh, mm] = a.time.split(':').map(Number);
  const ampm = hh >= 12 ? 'PM' : 'AM';
  const h12  = (hh % 12) || 12;
  const dayAbbr = ['Su','Mo','Tu','We','Th','Fr','Sa'];
  const dayStr = a.days.length === 7 ? 'Every day'
    : a.days.length === 5 && !a.days.includes(0) && !a.days.includes(6) ? 'Weekdays'
    : a.days.map(d => dayAbbr[d]).join(', ');
  return `
    <div class="tal-item" data-id="${a.id}">
      <div class="tal-item-left">
        <div class="tal-item-time">${h12}:${pad(mm)} ${ampm}</div>
        <div class="tal-item-meta">${a.label ? `<b>${esc(a.label)}</b> · ` : ''}${dayStr}</div>
      </div>
      <div class="tal-item-right">
        <label class="tal-toggle" title="${a.enabled?'On':'Off'}">
          <input type="checkbox" class="tal-toggle-input" data-id="${a.id}" ${a.enabled?'checked':''}/>
          <span class="tal-toggle-track"><span class="tal-toggle-thumb"></span></span>
        </label>
        <button class="tal-del" data-id="${a.id}" title="Delete">✕</button>
      </div>
    </div>`;
}

async function addAlarm(el) {
  const time  = document.getElementById('tal-time')?.value || '07:00';
  const label = document.getElementById('tal-label')?.value?.trim() || '';
  const sound = document.getElementById('tal-sound')?.value || 'chime';
  const days  = [...document.querySelectorAll('.tal-day-chip input:checked')].map(c => +c.value);
  if (!days.length) { alert('Select at least one day.'); return; }
  try {
    const alarm = await api('/api/timer/alarms', { method:'POST', body: JSON.stringify({ time, label, sound, days }) });
    S.alarms.push(alarm);
    playSound(sound);
    renderAlarmPanel(el);
  } catch (e) { alert('Could not save: ' + e.message); }
}

// ── Alarm fire (from SSE dispatch) ────────────────────────────────────────
function onAlarmFire(alarm) {
  showFirePopup(
    alarm.label || 'Alarm',
    `Your alarm is going off! ${alarm.label ? alarm.label + ' — ' : ''}time to get to it! 💪`,
    alarm.sound || 'chime',
    {
      snooze: async () => {
        try { await api(`/api/timer/alarms/${alarm.id}/snooze`, { method: 'POST' }); } catch {}
      }
    }
  );
}

// ── Chatbot control API (window.timerControl) ─────────────────────────────
window.timerControl = {
  // opts.focusMode: true only from the two real Focus Mode triggers (chat
  // [[FOCUS:...]] button, Today tab's ⚡ button) — NOT from the timer
  // widget's own manual countdown UI. Gates the post-completion reflection
  // prompt in onCDDone() below, so a plain "set a 25-min timer" doesn't get
  // asked what's still stuck on an assignment that was never named.
  startCountdown(secs, label, opts = {}) {
    openPanel();
    S.mode = 'countdown';
    cdSetTotal(secs);
    if (label) S.cd.label = label;
    S.cd.isFocusMode = !!opts.focusMode;
    save();
    document.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'countdown'));
    const body = document.getElementById('timer-panel-body');
    if (body) { renderCD(body); setTimeout(() => cdStart(body), 300); }
  },
  startPomodoro() {
    openPanel();
    S.mode = 'countdown';
    document.querySelectorAll('.timer-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === 'countdown'));
    const body = document.getElementById('timer-panel-body');
    if (body) startPomo(body);
  },
  stopTimer() { cdPause(); swStop(); },
  getStatus() {
    if (S.mode === 'countdown' && S.cd.running)
      return { type:'countdown', remaining: S.cd.remaining, label: S.cd.label };
    if (S.mode === 'stopwatch' && S.sw.running)
      return { type:'stopwatch', elapsed: S.sw.elapsed };
    if (S.pm.active)
      return { type:'pomodoro', cycle: S.pm.cycle, phase: S.pm.phase, remaining: S.cd.remaining };
    return { type:'none' };
  },
};

// ── SSE alarm dispatch (app.js adds 'ysc:alarm' CustomEvent) ─────────────
document.addEventListener('ysc:alarm', e => onAlarmFire(e.detail));

// ── Init ──────────────────────────────────────────────────────────────────
function init() {
  load();

  document.getElementById('timer-nav-btn')?.addEventListener('click', togglePanel);
  document.getElementById('timer-panel-close')?.addEventListener('click', closePanel);

  document.querySelectorAll('.timer-mode-btn').forEach(btn =>
    btn.addEventListener('click', () => setMode(btn.dataset.mode))
  );

  // Active mode highlight on load
  document.querySelectorAll('.timer-mode-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === S.mode)
  );
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
