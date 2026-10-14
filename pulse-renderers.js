// Pure read-only Student Pulse rendering, identical to Teacher Hub.
// No network, sockets, writes, or messaging controls.
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
