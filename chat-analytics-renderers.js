// Pure read-only Teacher Hub analytics rendering; takes the displayed dataset.
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

