/* YSC Hub preview — sample data for the STUDENT hub. Every person, course and message here is fictional.
 * Response shapes mirror server.js / routes/*.js and what app.js, hub-tabs.js, growth.js and
 * slack-notifications.js actually read. Dates are relative to "now" so the sample week is always this week. */
(function () {
  'use strict';
  var P = window.__YSC_PREVIEW__;
  if (!P || P.role !== 'student') return;
  var on = P.on, D = P.dates, NOW = D.NOW;

  // ── helpers ──────────────────────────────────────────────────────────────────────────────────────
  var CANVAS = 'https://canvas.example.edu';
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function at(n, h, m) { return D.addDays(n, h, m); }
  function isoAt(n, h, m) { return D.iso(at(n, h, m)); }
  function ymdAt(n) { return D.ymd(at(n, 12, 0)); }
  function ago(mins) { return new Date(NOW.getTime() - mins * 60000); }
  function slackTs(d) { return (d.getTime() / 1000).toFixed(6); }
  function untilDow(dow) { return (dow - NOW.getDay() + 7) % 7; }          // 0..6 days until that weekday
  function weekOffset(dow) { var mon = -((NOW.getDay() + 6) % 7); return mon + ((dow + 6) % 7); } // this Mon–Sun week
  function shortDay(n) { return at(n, 12, 0).toLocaleDateString('en-US', { weekday: 'short' }); }
  function longDay(n) { return n === 0 ? 'today' : n === 1 ? 'tomorrow' : DAYS[at(n, 12, 0).getDay()]; }
  function fmt12(h, m) { var ap = h >= 12 ? 'PM' : 'AM'; return ((h + 11) % 12 + 1) + ':' + String(m || 0).padStart(2, '0') + ' ' + ap; }
  function uid(p) { return p + '-' + Math.random().toString(36).slice(2, 9); }

  var ME = { name: 'Mia Castellanos', email: 'mia.castellanos@example.edu', slackId: 'U0PREVIEW1' };
  var MENTOR = { name: 'Coach Elena Reyes', first: 'Elena', email: 'elena.reyes@example.edu' };
  var COURSES = [
    { id: 101, name: 'Chemistry Adv.', code: 'CHEM-ADV', teacher: 'Elena Reyes', score: 91.4, grade: 'A-' },
    { id: 102, name: 'Algebra II', code: 'ALG2', teacher: 'Marcus Webb', score: 86.2, grade: 'B' },
    { id: 103, name: 'English 10', code: 'ENG10', teacher: 'Daniel Osei', score: 88.7, grade: 'B+' },
    { id: 104, name: 'Biology', code: 'BIO', teacher: 'Hannah Lee', score: 82.5, grade: 'B-' },
  ];
  function course(id) { for (var i = 0; i < COURSES.length; i++) if (COURSES[i].id === id) return COURSES[i]; return null; }

  // ── Canvas assignments (this week + a little history) ───────────────────────────────────────────
  var THU = untilDow(4);
  var A = [
    // [id, course, name, dueOffsetDays, hour, min, points, state, type]
    [2001, 101, 'Lab Report — Reaction Rates', THU, 23, 59, 50, 'unsubmitted', 'online_upload'],
    [2002, 103, 'Of Mice and Men — Chapter 4 Reading Response', 0, 23, 59, 20, 'unsubmitted', 'online_text_entry'],
    [2003, 102, 'Problem Set 3.4 — Quadratic Functions', 1, 23, 59, 25, 'unsubmitted', 'online_upload'],
    [2004, 104, 'Cell Transport Lab Questions', 3, 23, 59, 30, 'unsubmitted', 'online_text_entry'],
    [2005, 103, 'Argumentative Essay — Outline', 5, 23, 59, 40, 'unsubmitted', 'online_upload'],
    [2006, 102, 'Unit 3 Quiz — Quadratics', 6, 23, 59, 30, 'unsubmitted', 'online_quiz'],
    [2007, 101, 'Moles & Molar Mass Worksheet', -2, 23, 59, 20, 'graded', 'online_upload'],
    [2008, 102, 'Problem Set 3.3 — Factoring', -1, 23, 59, 25, 'submitted', 'online_upload'],
    [2009, 104, 'Osmosis Lab Write-up', -4, 23, 59, 40, 'graded', 'online_upload'],
    [2010, 103, 'Vocabulary Unit 5', -3, 23, 59, 15, 'submitted', 'online_quiz'],
    [2011, 104, 'Cell Membrane Diagram', -2, 23, 59, 20, 'unsubmitted', 'online_upload'],   // the one missing item
  ];
  var ASSIGNMENTS = A.map(function (r) {
    var c = course(r[1]), due = at(r[3], r[4], r[5]);
    var done = r[7] === 'submitted' || r[7] === 'graded';
    return {
      id: r[0], name: r[2], due_at: D.iso(due), points_possible: r[6], course_id: r[1], courseId: r[1], course_name: c.name,
      html_url: CANVAS + '/courses/' + r[1] + '/assignments/' + r[0], submission_types: [r[8]], assignment_group_id: r[1] * 10 + 1,
      groupWeight: null, groupName: null,
      submission: { workflow_state: r[7], submitted_at: done ? D.iso(new Date(due.getTime() - 5 * 3600000)) : null, missing: false },
    };
  }).sort(function (a, b) { return new Date(a.due_at) - new Date(b.due_at); });
  function byId(id) { for (var i = 0; i < ASSIGNMENTS.length; i++) if (ASSIGNMENTS[i].id === id) return ASSIGNMENTS[i]; return null; }
  function link(id) { var a = byId(id); return '[' + a.name + '](' + a.html_url + ')'; }

  on('GET', /^canvas\/assignments$/, function () { return ASSIGNMENTS; });
  on('GET', /^canvas\/courses$/, function () {
    return COURSES.map(function (c) {
      return { id: c.id, name: c.name, course_code: c.code, html_url: CANVAS + '/courses/' + c.id, term: { name: 'Fall 2026' } };
    });
  });
  on('GET', /^canvas\/courses\/(\d+)\/detail$/, function (m) {
    var c = course(+m[1]);
    return { assignments: ASSIGNMENTS.filter(function (a) { return a.course_id === +m[1]; }),
      grades: c ? { current_score: c.score, current_grade: c.grade } : null };
  });
  on('GET', /^canvas\/grades$/, function () {
    return { grades: COURSES.map(function (c) {
      return { id: c.id, name: c.name, html_url: CANVAS + '/courses/' + c.id + '/grades', current_score: c.score, current_grade: c.grade };
    }), missingCount: 1 };
  });
  var GROUPS = {
    101: [['Labs', 40], ['Tests', 35], ['Homework', 25]], 102: [['Tests & Quizzes', 50], ['Problem Sets', 35], ['Participation', 15]],
    103: [['Essays', 45], ['Reading Responses', 30], ['Vocabulary', 25]], 104: [['Labs', 40], ['Tests', 40], ['Classwork', 20]],
  };
  var RECENT = {
    101: [['Moles & Molar Mass Worksheet', 18, 20, 2007], ['Unit 2 Test — Atomic Structure', 87, 100, 1990]],
    102: [['Problem Set 3.2 — Graphing Parabolas', 22, 25, 1991], ['Unit 2 Quiz — Linear Systems', 25, 30, 1992]],
    103: [['Vocabulary Unit 4', 14, 15, 1993], ['Personal Narrative — Final Draft', 36, 40, 1994]],
    104: [['Osmosis Lab Write-up', 33, 40, 2009], ['Cell Structure Quiz', 24, 30, 1995]],
  };
  on('GET', /^canvas\/grades\/(\d+)\/detail$/, function (m) {
    var id = +m[1];
    return {
      groups: (GROUPS[id] || []).map(function (g) { return { name: g[0], group_weight: g[1] }; }),
      recentGraded: (RECENT[id] || []).map(function (r) {
        return { name: r[0], points_possible: r[2], html_url: CANVAS + '/courses/' + id + '/assignments/' + r[3], submission: { score: r[1] } };
      }),
    };
  });
  on('GET', /^canvas\/announcements$/, function () {
    return [
      { title: 'Lab report rubric posted — read before Thursday', context_name: 'Chemistry Adv.', posted_at: D.iso(ago(140)), html_url: CANVAS + '/courses/101/discussion_topics/301' },
      { title: 'Unit 3 Quiz moved to next week', context_name: 'Algebra II', posted_at: D.iso(ago(60 * 20)), html_url: CANVAS + '/courses/102/discussion_topics/302' },
      { title: 'Bring your copy of Of Mice and Men on Friday', context_name: 'English 10', posted_at: D.iso(ago(60 * 30)), html_url: CANVAS + '/courses/103/discussion_topics/303' },
      { title: 'Microscope sign-up sheet for the cell lab', context_name: 'Biology', posted_at: D.iso(ago(60 * 52)), html_url: CANVAS + '/courses/104/discussion_topics/304' },
    ];
  });
  on('GET', /^canvas\/notifications$/, function () {
    var now = new Date(), today = D.ymd(now), in7 = now.getTime() + 7 * 86400000;
    var wkStart = new Date(now); wkStart.setDate(now.getDate() - now.getDay()); wkStart.setHours(0, 0, 0, 0);
    var wkEnd = wkStart.getTime() + 7 * 86400000;
    function f(a) { return { id: a.id, name: a.name, courseName: a.course_name, dueAt: a.due_at, url: a.html_url, points: a.points_possible }; }
    var open = function (a) { var s = a.submission.workflow_state; return s === 'unsubmitted'; };
    var dueToday = ASSIGNMENTS.filter(function (a) { return D.ymd(a.due_at) === today; }).map(f);
    var upcoming = ASSIGNMENTS.filter(function (a) { var t = new Date(a.due_at).getTime(); return t > now && t <= in7; }).map(f);
    var missing = ASSIGNMENTS.filter(function (a) { return new Date(a.due_at) < now && open(a); }).map(f);
    var week = ASSIGNMENTS.filter(function (a) { var t = new Date(a.due_at).getTime(); return t >= wkStart && t < wkEnd; });
    return { dueToday: dueToday, upcoming: upcoming, missing: missing, todayCount: dueToday.length, upcomingCount: upcoming.length,
      weekCount: week.length, missingCount: missing.length, nextDue: upcoming[0] || null };
  });
  on('POST', /^calendar\/sync-canvas$/, function () { return { added: [], updated: [] }; });

  // ── Home opener: game plan, mentor message, yesterday, morning offer ────────────────────────────
  var completions = {};
  completions['2008'] = { completedAt: D.iso(at(-1, 20, 40)), date: ymdAt(-1) };
  completions['2010'] = { completedAt: D.iso(at(-1, 21, 15)), date: ymdAt(-1) };

  function gpItem(a) {
    var c = course(a.course_id), mins = a.submission_types[0].indexOf('quiz') >= 0 ? 20 : Math.min(120, Math.max(15, Math.round(a.points_possible * 1.5)));
    return { id: a.id, title: a.name, course: c.name, courseCode: c.code, courseId: c.id, due: a.due_at, dueDate: D.ymd(a.due_at),
      daysUntilDue: Math.ceil((new Date(a.due_at) - NOW) / 86400000), submissionType: a.submission_types[0], pointsPossible: a.points_possible,
      estimatedMinutes: mins, canvasUrl: a.html_url };
  }
  on('GET', /^student\/game-plan$/, function () {
    var weekEnd = NOW.getTime() + 7 * 86400000;
    var list = ASSIGNMENTS.filter(function (a) {
      var t = new Date(a.due_at).getTime();
      return t > NOW.getTime() && t <= weekEnd && a.submission.workflow_state === 'unsubmitted' && !completions[String(a.id)];
    }).map(gpItem);
    var tasks = list.slice(0, 5).map(function (a) {
      var tag = a.daysUntilDue <= 1 ? (a.dueDate === D.ymd(NOW) ? 'Due today' : 'Due tomorrow') : 'This week';
      return { label: a.title + ' — ' + a.course, tag: tag, tagClass: a.daysUntilDue <= 1 ? 'gp-tag-today' : 'gp-tag-week',
        canvasUrl: a.canvasUrl, estimatedMinutes: a.estimatedMinutes, id: a.id, dueDate: a.dueDate };
    });
    var practiceToday = NOW.getDay() === 2 || NOW.getDay() === 4;
    var parts = [];
    parts.push(practiceToday
      ? 'Morning, Mia — you have **practice at 4:00** today, so knock out your **English reading response** before you head to the field.'
      : 'Morning, Mia — no practice today, so this is a great window for your **English reading response** (due tonight).');
    parts.push('Your **Chemistry lab report** is due ' + longDay(THU) + ' — a 45-minute block tonight on the data analysis keeps it from piling up.');
    parts.push('And with the **match vs. Orlando Youth on Saturday**, getting ahead now means Friday\'s travel day stays stress-free.');
    var bars = [];
    for (var i = 0; i < 5; i++) {
      var off = weekOffset(i + 1);
      bars.push({ day: DAYS[i + 1].slice(0, 3), date: ymdAt(off), count: ASSIGNMENTS.filter(function (a) { return D.ymd(a.due_at) === ymdAt(off); }).length });
    }
    return { aiVoice: '\n  ' + parts.join(' ') + '\n', tasks: tasks, weeklyLoadData: bars, canvasAssignments: list, canvasConnected: true,
      travelConflict: null, travelDays: [ymdAt(weekOffset(5))] };
  });
  on('GET', /^student\/game-plan\/completions$/, function () { return { completions: completions }; });
  on('POST', /^student\/game-plan\/complete$/, function (m, b) {
    var id = String((b && b.assignmentId) || '');
    if (b && b.completed) completions[id] = { completedAt: new Date().toISOString(), date: D.ymd(new Date()), title: b.assignmentTitle || '' };
    else delete completions[id];
    return { success: true, completions: completions };
  });

  var weekMon = at(weekOffset(1), 12, 0);
  on('GET', /^student\/mentor-weekly-message$/, function () {
    return { message: { text: 'Proud of how you handled last week, Mia — you asked for help *before* the deadline, and that is a real skill. ' +
      'This week: protect one study block on travel day, and come find me Thursday if the lab data looks weird. You\'ve got this. ⚽🧪',
      weekOf: D.ymd(weekMon), mentorName: MENTOR.name, postedAt: D.iso(at(weekOffset(1), 7, 45)) } };
  });
  on('GET', /^student\/yesterday-recap$/, function () {
    try { localStorage.removeItem('ysc-recap-day'); } catch (e) { /* preview: show the recap on every load */ }
    return { today: D.ymd(NOW), yesterday: ymdAt(-1), completedCount: 2, completed: ['Problem Set 3.3 — Factoring', 'Vocabulary Unit 5'],
      mentor: { name: 'Elena', replies: 1 }, hasContent: true };
  });
  var morning = { exists: false, slackReachable: true };
  on('GET', /^morning-message$/, function () { return morning; });
  on('PUT', /^morning-message$/, function (m, b) {
    morning = Object.assign({ exists: true, enabled: true, slackReachable: true }, b || {});
    return Object.assign({ ok: true }, morning);
  });
  on('POST', /^morning-message\/test$/, function () { return { ok: true, sent: true }; });
  on('POST', /^student\/timezone$/, function (m, b) {
    var tz = (b && b.tz) || 'America/New_York';
    return { ok: true, tz: tz };
  });

  // ── Memory chip ───────────────────────────────────────────────────────────────────────────────────
  var MEMORIES = [
    { id: 'mem-1', text: 'Wants to play college soccer — hoping to be recruited by junior year', createdAt: D.iso(at(-21, 18, 0)) },
    { id: 'mem-2', text: 'Studies best in short 25-minute blocks with music off', createdAt: D.iso(at(-12, 19, 30)) },
    { id: 'mem-3', text: 'Finds chemistry math (rate calculations) the trickiest part', createdAt: D.iso(at(-5, 20, 10)) },
  ];
  on('GET', /^chat\/memories$/, function () { return { memories: MEMORIES }; });
  on('DELETE', /^chat\/memories\/(.+)$/, function (m) {
    MEMORIES = MEMORIES.filter(function (x) { return x.id !== decodeURIComponent(m[1]); });
    return { ok: true, memories: MEMORIES };
  });

  // ── Mentor (Coach Elena Reyes) ─────────────────────────────────────────────────────────────────
  on('GET', /^student\/my-mentor$/, function () { return { mentor: { name: MENTOR.name, email: MENTOR.email } }; });
  on('GET', /^student\/mentor-presence$/, function () { return { online: true }; });
  on('GET', /^student\/blocked-sites$/, function () { return { sites: [] }; });
  var CONVO = [
    { id: 'mc-1', role: 'mentor', senderName: MENTOR.name, text: 'Hi Mia! How did the Algebra test feel? Anything you want to go over before the next unit?', timestamp: D.iso(at(-3, 8, 12)) },
    { id: 'mc-2', role: 'student', senderName: ME.name, text: 'It went ok! I think I messed up the systems word problem but the rest felt good.', timestamp: D.iso(at(-3, 15, 2)) },
    { id: 'mc-3', role: 'mentor', senderName: MENTOR.name, text: 'That is a great self-check. Mr. Webb has office hours Tue/Thu — bring that problem and ask him to walk the setup with you.', timestamp: D.iso(at(-3, 15, 40)) },
    { id: 'mc-4', role: 'student', senderName: ME.name, text: 'Will do. Also — is it ok if I turn the chem lab report in from the bus on Friday?', timestamp: D.iso(at(-1, 19, 5)) },
    { id: 'mc-5', role: 'mentor', senderName: MENTOR.name, text: 'It\'s due *Thursday* night, so let\'s aim to finish before travel. Want to do a quick check-in after school tomorrow on your data table? 📊', timestamp: D.iso(at(-1, 20, 18)) },
  ];
  on('GET', /^student\/conversation-history$/, function () { return { messages: CONVO }; });
  on('POST', /^mentor\/student-message$/, function (m, b) {
    CONVO.push({ id: uid('mc'), role: 'student', senderName: ME.name, text: (b && b.message) || '', timestamp: new Date().toISOString() });
    return { ok: true, success: true };
  });
  on('POST', /^mentor\/send-message$/, function () { return { ok: true, mentorName: MENTOR.name }; });

  // ── Team tab ("Mia's Team") ──────────────────────────────────────────────────────────────────────
  on('GET', /^people\/support-team$/, function () {
    return { members: [
      { id: 'm-1', name: MENTOR.name, role: 'Mentor · Chemistry Adv.', email: MENTOR.email, hasSlack: true, availability: 'available', initials: 'ER', color: '#0D1B8E' },
      { id: 'm-2', name: 'Marcus Webb', role: 'Algebra II', email: 'marcus.webb@example.edu', hasSlack: true, availability: 'busy', initials: 'MW', color: '#2B3BFF' },
      { id: 'm-3', name: 'Daniel Osei', role: 'English 10', email: 'daniel.osei@example.edu', hasSlack: true, availability: 'available', initials: 'DO', color: '#C85A2E' },
      { id: 'm-4', name: 'Hannah Lee', role: 'Biology', email: 'hannah.lee@example.edu', hasSlack: true, availability: 'offline', initials: 'HL', color: '#27ae60' },
    ] };
  });
  on('POST', /^people\/open-dm\/(.+)$/, function () { return { ok: true, channelId: 'D0PREV0001' }; });
  on('GET', /^people\/my-teachers$/, function () {
    return { slackConnected: true, teachers: [
      { name: 'Elena Reyes', courses: ['Chemistry Adv.'], onAllCourses: false, officeHours: ['Mon 3:15 PM–4:00 PM ET · Room 214', 'Thu 7:30 AM–8:00 AM ET · Room 214'] },
      { name: 'Marcus Webb', courses: ['Algebra II'], onAllCourses: false, officeHours: ['Tue 3:15 PM–3:45 PM ET · Room 108', 'Thu 3:15 PM–3:45 PM ET · Zoom'] },
      { name: 'Daniel Osei', courses: ['English 10'], onAllCourses: false, officeHours: ['Wed 12:10 PM–12:40 PM ET · Library'] },
      { name: 'Hannah Lee', courses: ['Biology'], onAllCourses: false, officeHours: ['Mon 12:10 PM–12:40 PM ET · Lab 3', 'Thu 3:15 PM–4:00 PM ET · Lab 3'] },
    ] };
  });
  on('POST', /^people\/message-teacher$/, function (m, b) { return { ok: true, teacher: (b && b.teacher) || 'your teacher' }; });

  function ohWhen(n, h, m, mins) { var d = at(n, h, m); return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', ' + fmt12(h, m) + '–' + fmt12(h + Math.floor((m + mins) / 60), (m + mins) % 60) + ' ET'; }
  var LEE_DAY = Math.max(1, untilDow(4)); // Biology office hours, Thu (or next one)
  var WEBB_DAY = untilDow(2) || 7;       // Algebra office hours, next Tue
  var OH = [
    { id: 'oh-1', teacherName: 'Hannah Lee', when: ohWhen(LEE_DAY, 15, 15, 20), status: 'accepted', where: 'Lab 3', topic: 'Catching up on the cell membrane diagram',
      teacherNote: 'Bring your notes from Monday — we\'ll fix it together.', canCancel: true },
    { id: 'oh-2', teacherName: 'Marcus Webb', when: ohWhen(WEBB_DAY, 15, 15, 15), status: 'requested', where: 'Room 108', topic: 'Setting up systems word problems', canCancel: true },
  ];
  on('GET', /^people\/office-hour-requests$/, function () { return { requests: OH }; });
  on('POST', /^people\/office-hour-requests\/(.+)\/cancel$/, function (m) {
    var id = decodeURIComponent(m[1]);
    OH = OH.filter(function (r) { return r.id !== id; });
    EVENTS = EVENTS.filter(function (e) { return e.bookingId !== id; });
    return { ok: true };
  });

  var OW = [
    { id: 'ow-1', course: 'APEX Spanish II', title: 'Unidad 3 Quiz — Preterite vs. Imperfect', dueYmd: ymdAt(weekOffset(5)), done: false, createdAt: D.iso(at(-4, 18, 0)) },
    { id: 'ow-2', course: 'APEX Spanish II', title: 'Unidad 3 Vocabulary Practice', dueYmd: ymdAt(-2), done: true, createdAt: D.iso(at(-8, 18, 0)) },
  ];
  on('GET', /^outside-work$/, function () { return { items: OW }; });
  on('POST', /^outside-work$/, function (m, b) {
    b = b || {};
    if (!b.course || !b.title || !b.dueYmd) return { __status: 400, __body: { error: 'Add a course, an assignment and a due date.' } };
    var item = { id: uid('ow'), course: String(b.course), title: String(b.title), dueYmd: b.dueYmd, done: false, createdAt: new Date().toISOString() };
    OW.push(item);
    return { ok: true, item: item };
  });
  on('PATCH', /^outside-work\/(.+)$/, function (m, b) {
    OW.forEach(function (i) { if (i.id === decodeURIComponent(m[1])) i.done = !!(b && b.done); });
    return { ok: true };
  });
  on('DELETE', /^outside-work\/(.+)$/, function (m) {
    OW = OW.filter(function (i) { return i.id !== decodeURIComponent(m[1]); });
    return { ok: true };
  });

  on('GET', /^people\/soccer-schedule$/, function () {
    var fri = weekOffset(5), sat = weekOffset(6);
    return {
      id: 'team-u16g', name: 'YSC U16 Girls', coach: 'Coach Ortiz',
      upcomingEvent: 'Match vs. Orlando Youth — Saturday 10:00 AM',
      schedule: [
        { id: 's-1', day: 'Tuesday', time: '4:00 – 6:00 PM', location: 'Field 2', type: 'practice' },
        { id: 's-2', day: 'Thursday', time: '4:00 – 6:00 PM', location: 'Field 2', type: 'practice' },
        { id: 's-3', day: 'Friday', date: ymdAt(fri), time: '1:00 – 4:30 PM', location: 'Bus to Orlando (leaves main lot)', type: 'travel' },
        { id: 's-4', day: 'Saturday', date: ymdAt(sat), time: '10:00 – 11:45 AM', location: 'Orlando Youth Sports Park', type: 'game', opponent: 'Orlando Youth' },
      ],
    };
  });
  on('GET', /^prefs$/, function () { return { soccerNotes: { 's-4': { note: 'Pack shin guards + the white kit', attending: true } }, soccerCalIds: {} }; });
  on('POST', /^prefs$/, function () { return { ok: true }; });
  var MY_EVENTS = [
    { id: 'my-1', type: 'training', repeat: 'weekly', days: ['Wednesday'], title: 'Strength & conditioning', location: 'School gym', startTime: '18:30', endTime: '19:30' },
  ];
  on('GET', /^people\/my-schedule$/, function () { return { events: MY_EVENTS }; });
  on('POST', /^people\/my-schedule$/, function (m, b) { var ev = Object.assign({ id: uid('my') }, b || {}); MY_EVENTS.push(ev); return { ok: true, event: ev }; });
  on('PUT', /^people\/my-schedule\/(.+)$/, function (m, b) {
    MY_EVENTS = MY_EVENTS.map(function (e) { return e.id === decodeURIComponent(m[1]) ? Object.assign({}, e, b || {}, { id: e.id }) : e; });
    return { ok: true };
  });
  on('DELETE', /^people\/my-schedule\/(.+)$/, function (m) { MY_EVENTS = MY_EVENTS.filter(function (e) { return e.id !== decodeURIComponent(m[1]); }); return { ok: true }; });

  // ── Calendar ─────────────────────────────────────────────────────────────────────────────────────
  function hm(h, m) { return String(h).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0'); }
  var EVENTS = [];
  [0, 7].forEach(function (w) {
    EVENTS.push({ id: 'ev-pr-tue' + w, title: '⚽ Team practice', type: 'sport', date: ymdAt(weekOffset(2) + w), startTime: '16:00', endTime: '18:00', description: 'Field 2' });
    EVENTS.push({ id: 'ev-pr-thu' + w, title: '⚽ Team practice', type: 'sport', date: ymdAt(weekOffset(4) + w), startTime: '16:00', endTime: '18:00', description: 'Field 2' });
    EVENTS.push({ id: 'ev-sc-wed' + w, title: '🏋️ Strength & conditioning', type: 'sport', date: ymdAt(weekOffset(3) + w), startTime: '18:30', endTime: '19:30', description: 'School gym' });
  });
  EVENTS.push({ id: 'ev-travel', title: '🚌 Travel to Orlando', type: 'sport', date: ymdAt(weekOffset(5)), startTime: '13:00', endTime: '16:30', description: 'Bus leaves the main lot at 1:00 PM' });
  EVENTS.push({ id: 'ev-match', title: '⚽ Match vs. Orlando Youth', type: 'sport', date: ymdAt(weekOffset(6)), startTime: '10:00', endTime: '11:45', description: 'Orlando Youth Sports Park — white kit' });
  var studyDay = NOW.getHours() >= 19 ? 1 : 0;
  EVENTS.push({ id: 'ev-study-1', title: '📚 Lab report — data analysis', type: 'study', source: 'coach-plan', date: ymdAt(studyDay), startTime: '19:00', endTime: '19:45', description: 'Study block from your coach plan' });
  EVENTS.push({ id: 'ev-study-2', title: '📚 Problem Set 3.4', type: 'study', source: 'coach-plan', date: ymdAt(studyDay + 1), startTime: '19:15', endTime: '20:00', description: 'Study block from your coach plan' });
  EVENTS.push({ id: 'ev-oh-1', bookingId: 'oh-1', title: '🙋 Office hours with Hannah Lee', type: 'appointment', source: 'office-hours', date: ymdAt(LEE_DAY), startTime: '15:15', endTime: '15:35', description: 'Lab 3 — catching up on the cell membrane diagram' });
  EVENTS.push({ id: 'ev-ow-1', title: '📝 APEX Spanish II: Unidad 3 Quiz — due', type: 'assignment', date: ymdAt(weekOffset(5)), startTime: '', endTime: '', description: 'Outside Canvas' });
  EVENTS.push({ id: 'ev-dentist', title: 'Orthodontist', type: 'appointment', date: ymdAt(weekOffset(1) + 7), startTime: '08:00', endTime: '08:45', description: 'Late arrival — told Coach Reyes' });
  EVENTS.forEach(function (e) { e.studentEmail = ME.email; });
  on('GET', /^calendar\/events$/, function () { return EVENTS; });
  on('POST', /^calendar\/events$/, function (m, b) {
    var ev = Object.assign({ id: uid('ev'), type: 'reminder', startTime: '', endTime: '', description: '' }, b || {}, { studentEmail: ME.email });
    EVENTS.push(ev);
    return ev;
  });
  on('PUT', /^calendar\/events\/(.+)$/, function (m, b) {
    var saved = null;
    EVENTS = EVENTS.map(function (e) { if (e.id !== decodeURIComponent(m[1])) return e; saved = Object.assign({}, e, b || {}, { id: e.id }); return saved; });
    return saved || { __status: 404, __body: { error: 'Not found' } };
  });
  on('DELETE', /^calendar\/events\/(.+)$/, function (m) { EVENTS = EVENTS.filter(function (e) { return e.id !== decodeURIComponent(m[1]); }); return { ok: true }; });

  on('GET', /^reminders$/, function () {
    return [
      { id: 'rem-1', title: 'Bring lab goggles back to Ms. Reyes', message: 'Return the goggles you borrowed', scheduledFor: isoAt(1, 7, 30), status: 'pending', studentName: ME.name },
      { id: 'rem-2', title: 'Pack for Orlando trip', message: 'Uniform, shin guards, charger, Spanish workbook', scheduledFor: isoAt(Math.max(1, weekOffset(4)), 20, 0), status: 'pending', studentName: ME.name },
    ];
  });
  on('POST', /^reminders\/(.+)\/(dismiss|snooze)$/, function () { return { ok: true }; });

  // ── Growth tab ───────────────────────────────────────────────────────────────────────────────────
  var growth = {
    lastUpdated: D.iso(at(-2, 21, 0)),
    goals: [
      { id: 'g-1', text: 'Raise my Biology grade to a B+ by the end of the quarter', completed: false, createdAt: D.iso(at(-20, 18, 0)) },
      { id: 'g-2', text: 'Turn every Chemistry lab in on time this semester', completed: false, createdAt: D.iso(at(-30, 18, 0)) },
      { id: 'g-3', text: 'Read 20 minutes a night for English', completed: false, createdAt: D.iso(at(-14, 18, 0)) },
      { id: 'g-4', text: 'Finish the soccer recruiting profile video', completed: true, createdAt: D.iso(at(-40, 18, 0)) },
    ],
    plan: [
      { id: 'p-1', text: 'Go to Ms. Lee\'s office hours on Thursday', completed: false, createdAt: D.iso(at(-3, 18, 0)) },
      { id: 'p-2', text: 'Start the lab report data table the night it is assigned', completed: true, createdAt: D.iso(at(-6, 18, 0)) },
      { id: 'p-3', text: 'Make flashcards for cell transport vocab', completed: false, createdAt: D.iso(at(-2, 18, 0)) },
    ],
    dailyGoals: [
      { id: 'd-1', text: 'Finish the Chapter 4 reading response', completed: false, createdAt: D.iso(at(0, 7, 0)) },
      { id: 'd-2', text: '45 minutes on the lab report', completed: false, createdAt: D.iso(at(0, 7, 0)) },
      { id: 'd-3', text: 'Stretch + foam roll after conditioning', completed: true, createdAt: D.iso(at(0, 7, 0)) },
    ],
    weeklyGoals: [
      { id: 'w-1', text: 'Submit the Reaction Rates lab report', completed: false, createdAt: D.iso(weekMon) },
      { id: 'w-2', text: 'Catch up on the cell membrane diagram', completed: false, createdAt: D.iso(weekMon) },
      { id: 'w-3', text: 'APEX Spanish quiz before the bus on Friday', completed: false, createdAt: D.iso(weekMon) },
    ],
  };
  on('GET', /^student\/growth$/, function () { return growth; });
  on('POST', /^student\/growth$/, function (m, b) {
    b = b || {};
    ['goals', 'plan', 'dailyGoals', 'weeklyGoals'].forEach(function (k) { if (Array.isArray(b[k])) growth[k] = b[k]; });
    growth.lastUpdated = new Date().toISOString();
    return { success: true, lastUpdated: growth.lastUpdated };
  });
  on('GET', /^student\/todays-focus$/, function () {
    return { day: DAYS[NOW.getDay()], date: NOW.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      focus: { label: "Today's focus", text: 'Finish the Chapter 4 reading response' }, allItems: [] };
  });
  on('POST', /^chat\/recovery-plan$/, function (m, b) {
    var name = (b && b.name) || 'this assignment';
    return { steps: [
      { step: 1, time: '10 min', action: 'Open "' + name + '" in Canvas and re-read the directions and rubric.' },
      { step: 2, time: '25 min', action: 'Sketch the membrane: phospholipid bilayer first, then add the proteins, cholesterol and labels.' },
      { step: 3, time: '10 min', action: 'Check each label against your notes, then upload a clear photo to Canvas.' },
      { step: 4, time: '2 min', action: 'Send Ms. Lee a quick note that it is in — and bring questions to Thursday office hours.' },
    ], bestTime: 'Tonight, 6:00–6:45 PM (before conditioning)', encouragement: 'One focused block is all this needs — you already know this material.' };
  });

  // ── Slack ────────────────────────────────────────────────────────────────────────────────────────
  on('GET', /^slack\/auth-status$/, function () {
    return { connected: true, hasUserToken: true, autoLinked: true, userId: ME.slackId, userName: 'Mia Castellanos', teamId: 'T0PREVIEW',
      grantedScopes: ['chat:write', 'channels:history', 'channels:read', 'im:history', 'im:read', 'im:write', 'users:read'] };
  });
  on('GET', /^slack\/dm-check$/, function () { return { hasNewDMs: false, dms: [] }; });
  function msg(user, name, text, minsAgo) { return { ts: slackTs(ago(minsAgo)), user: user, userName: name, text: text }; }
  var SLACK = {
    C0CHEM01: { name: 'chem-adv-reyes', msgs: [
      msg('U0REYES', MENTOR.name, 'Reminder: lab reports are due *Thursday at 11:59 PM*. The rubric is pinned in Canvas — the analysis section is worth the most points.', 95),
      msg('U0NOAH', 'Noah Kim', 'Do we graph rate vs. temperature or rate vs. concentration?', 70),
      msg('U0REYES', MENTOR.name, 'Great question Noah — both! Figure 1 is concentration, Figure 2 is temperature.', 62),
      msg(ME.slackId, ME.name, 'Thank you!! That clears it up', 58),
    ] },
    C0ALG201: { name: 'alg2-webb', msgs: [
      msg('U0WEBB', 'Marcus Webb', 'Heads up: the Unit 3 Quiz is now next week. Use the extra time on 3.4 — #7 and #12 are the tricky ones.', 60 * 20),
      msg('U0SOFIA', 'Sofia Ortega', 'Anyone want to study in the library Thursday morning?', 60 * 6),
    ] },
    C0SOCCER: { name: 'u16-girls-soccer', msgs: [
      msg('U0ORTIZ', 'Coach Ortiz', 'Bus for Orlando leaves at 1:00 sharp Friday. White kit Saturday. Bring homework — there will be a quiet hour at the hotel.', 35),
      msg('U0SOFIA', 'Sofia Ortega', 'Can we bring a speaker on the bus?? 🎶', 30),
      msg('U0ORTIZ', 'Coach Ortiz', 'Headphones only on the bus 😄', 22),
    ] },
    C0ENG101: { name: 'english10-osei', msgs: [
      msg('U0OSEI', 'Daniel Osei', 'Chapter 4 response prompt: How does Crooks\' loneliness shape the way he treats Lennie? 200 words, cite one quote.', 60 * 26),
    ] },
    D0PREV0001: { name: 'Coach Elena Reyes', msgs: [
      msg('U0REYES', MENTOR.name, 'Want to do a quick check-in after school tomorrow on your data table?', 60 * 15),
    ] },
  };
  function newestFirst(list) { return list.slice().sort(function (a, b) { return parseFloat(b.ts) - parseFloat(a.ts); }); }
  on('GET', /^slack\/channels$/, function () {
    return Object.keys(SLACK).filter(function (id) { return id[0] === 'C'; }).map(function (id) {
      var last = newestFirst(SLACK[id].msgs)[0];
      return { id: id, name: SLACK[id].name, is_member: true, lastTs: last.ts, lastMessagePreview: last.text.slice(0, 80), lastMessageUser: last.userName };
    });
  });
  on('GET', /^slack\/all-channels$/, function () {
    return Object.keys(SLACK).filter(function (id) { return id[0] === 'C'; }).map(function (id) {
      return { id: id, name: SLACK[id].name, is_member: true, num_members: 18, purpose: '' };
    }).concat([{ id: 'C0CLUBS1', name: 'clubs-and-activities', is_member: false, num_members: 64, purpose: 'Club news and sign-ups' }]);
  });
  on('POST', /^slack\/join-channel$/, function () { return { ok: true }; });
  on('GET', /^slack\/messages\/(.+)$/, function (m) {
    var ch = SLACK[decodeURIComponent(m[1])];
    return ch ? newestFirst(ch.msgs) : [];
  });
  on('POST', /^slack\/send$/, function (m, b) {
    var id = b && b.channel, d = new Date();
    if (!SLACK[id]) SLACK[id] = { name: id, msgs: [] };
    var item = { ts: slackTs(d), user: ME.slackId, userName: ME.name, text: (b && b.text) || '' };
    SLACK[id].msgs.push(item);
    return { ok: true, ts: item.ts };
  });
  on('GET', /^slack\/members$/, function () {
    return [
      { id: 'U0ORTIZ', name: 'Coach Ortiz', title: 'U16 Girls Head Coach' },
      { id: 'U0OSEI', name: 'Daniel Osei', title: 'English 10' },
      { id: 'U0REYES', name: 'Elena Reyes', title: 'Chemistry Adv. · Mentor' },
      { id: 'U0LEE', name: 'Hannah Lee', title: 'Biology' },
      { id: 'U0WEBB', name: 'Marcus Webb', title: 'Algebra II' },
      { id: 'U0NOAH', name: 'Noah Kim', title: 'Student' },
      { id: 'U0SOFIA', name: 'Sofia Ortega', title: 'Student' },
    ];
  });
  on('GET', /^slack\/dms$/, function () { return [{ id: 'D0PREV0001', user: 'U0REYES', userName: 'Elena Reyes' }]; });
  on('POST', /^slack\/open-dm$/, function (m, b) {
    var id = (b && b.userId) === 'U0REYES' ? 'D0PREV0001' : 'D0' + String((b && b.userId) || 'X').slice(2) + '1';
    if (!SLACK[id]) SLACK[id] = { name: 'Direct Message', msgs: [] };
    return { ok: true, channelId: id };
  });
  on('POST', /^slack\/mark-dm-read$/, function () { return { ok: true }; });
  on('GET', /^slack-notifications\/settings$/, function () {
    return { enabled: true, browserPush: false, sounds: false, volume: 0.25, mutedChannels: [], dndEnabled: true, dndStart: '08:00', dndEnd: '15:00', dmOnly: false, teacherOnly: false };
  });
  on('POST', /^slack-notifications\/settings$/, function () { return { ok: true }; });
  var unread = { C0SOCCER: { count: 2, isDM: false }, C0CHEM01: { count: 1, isDM: false } };
  on('GET', /^slack-notifications\/poll$/, function () { return { unreadCounts: unread }; });
  on('POST', /^slack-notifications\/mark-read$/, function (m, b) { if (b && b.channelId) delete unread[b.channelId]; return { ok: true }; });
  on('POST', /^slack-notifications\/mark-all-read$/, function () { unread = {}; return { ok: true }; });
  on('GET', /^slack-notifications\/history$/, function () {
    return [
      { id: 'n-1', channelId: 'C0SOCCER', channelName: 'u16-girls-soccer', isDM: false, isTeacher: true, senderName: 'Coach Ortiz', senderInitials: 'CO', text: 'Bus for Orlando leaves at 1:00 sharp Friday.', receivedAt: D.iso(ago(35)), read: false },
      { id: 'n-2', channelId: 'C0CHEM01', channelName: 'chem-adv-reyes', isDM: false, isTeacher: true, senderName: MENTOR.name, senderInitials: 'ER', text: 'Great question Noah — both!', receivedAt: D.iso(ago(62)), read: false },
    ];
  });
  on('GET', /^slack-badge\/poll$/, function () { return { total: 3, dmNotifications: [] }; });

  // ── Drive ────────────────────────────────────────────────────────────────────────────────────────
  function file(id, name, mime, mins) { return { id: id, name: name, mimeType: mime, modifiedTime: D.iso(ago(mins)), webViewLink: 'https://docs.google.com/document/d/' + id + '/edit', owners: [{ displayName: ME.name }] }; }
  on('GET', /^drive\/files$/, function () {
    return { files: [
      file('prev-doc-1', 'Reaction Rates Lab — Data Table', 'application/vnd.google-apps.spreadsheet', 90),
      file('prev-doc-2', 'Lab Report Draft — Reaction Rates', 'application/vnd.google-apps.document', 60 * 18),
      file('prev-doc-3', 'Of Mice and Men — Reading Notes', 'application/vnd.google-apps.document', 60 * 26),
      file('prev-doc-4', 'Argumentative Essay Brainstorm', 'application/vnd.google-apps.document', 60 * 50),
      file('prev-doc-5', 'Recruiting Highlights — Fall', 'application/vnd.google-apps.presentation', 60 * 24 * 6),
    ] };
  });
  on('GET', /^drive\/shared$/, function () {
    var f1 = file('prev-sh-1', 'Chem Adv. — Lab Report Rubric', 'application/pdf', 60 * 40); f1.owners = [{ displayName: 'Elena Reyes' }];
    var f2 = file('prev-sh-2', 'Biology Unit 3 Study Guide', 'application/vnd.google-apps.document', 60 * 72); f2.owners = [{ displayName: 'Hannah Lee' }];
    return { files: [f1, f2] };
  });

  // ── Small fire-and-forget endpoints ──────────────────────────────────────────────────────────────
  on('POST', /^tracker\/ping$/, function () { return { ok: true }; });
  on('POST', /^tracker\/website$/, function () { return { ok: true }; });
  on('GET', /^tracker\/broadcast\/dismissed$/, function () { return { ids: [] }; });
  on('POST', /^tracker\/broadcast\/(dismiss|seen)$/, function () { return { ok: true }; });
  on('GET', /^youtube\/search$/, function () { return { items: [] }; });
  on('POST', /^chat\/feedback$/, function (m, b) { return { ok: true, id: (b && b.id) || uid('fb') }; });

  // Study guide "Download PDF": a tiny real one-page PDF built in the browser.
  function makePdf(lines) {
    function esc(s) { return String(s).replace(/[^\x20-\x7e]/g, '-').replace(/([\\()])/g, '\\$1'); }
    var body = 'BT /F1 12 Tf 54 740 Td 16 TL ' + lines.slice(0, 40).map(function (l) { return '(' + esc(l) + ') Tj T*'; }).join(' ') + ' ET';
    var objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
      '<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
    var out = '%PDF-1.4\n', offs = [];
    objs.forEach(function (o, i) { offs.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var x = out.length;
    out += 'xref\n0 6\n0000000000 65535 f \n' + offs.map(function (o) { return String(o).padStart(10, '0') + ' 00000 n \n'; }).join('');
    out += 'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n' + x + '\n%%EOF';
    return new Response(new Blob([out], { type: 'application/pdf' }), { status: 200, headers: { 'content-type': 'application/pdf' } });
  }
  on('POST', /^chat\/study-guide\/pdf$/, function (m, sg) {
    var lines = [(sg && sg.title) || 'Study Guide', ''];
    ((sg && sg.sections) || []).forEach(function (s) {
      if (s.heading) lines.push(s.heading.toUpperCase());
      (s.items || []).forEach(function (it) { lines.push((it.type === 'bullet' ? '-  ' : '   ') + it.text); });
      lines.push('');
    });
    return makePdf(lines);
  });

  // ── The AI coach: a small keyword script streamed exactly like routes/chat.js ─────────────────────
  // SSE lines are `data: {json}\n\n`; app.js handles 'text' chunks, then action_proposal / suggested_chips /
  // open_question / study_guide / flashcards, and renders everything on 'done'.
  function streamReply(text, extras) {
    var enc = new TextEncoder(), words = text.match(/\S+\s*|\s+/g) || [text];
    var chunks = [];
    for (var i = 0; i < words.length; i += 3) chunks.push(words.slice(i, i + 3).join(''));
    var stream = new ReadableStream({
      start: function (ctl) {
        var k = 0;
        function send(o) { ctl.enqueue(enc.encode('data: ' + JSON.stringify(o) + '\n\n')); }
        function tick() {
          if (k < chunks.length) { send({ type: 'text', text: chunks[k++] }); setTimeout(tick, 28 + Math.random() * 30); return; }
          (extras || []).forEach(send);
          send({ type: 'done' });
          ctl.close();
        }
        setTimeout(tick, 650);   // "thinking" pause, so the typing dots show
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' } });
  }
  function chips(list, guiding) { return { type: 'suggested_chips', chips: list, isGuiding: guiding !== false }; }

  var ACTIONS = {};   // proposal id -> { kind, ... }
  function blockLabel(n, h1, m1, h2, m2, focus) { return shortDay(n) + ', ' + fmt12(h1, m1) + '–' + fmt12(h2, m2) + ' · ' + focus; }

  var STUDY_GUIDE = {
    title: 'Reaction Rates — Chemistry Adv.',
    sections: [
      { heading: 'Key idea', items: [
        { type: 'paragraph', text: 'Reaction rate is how fast reactants turn into products — measured as the change in concentration over time (mol/L·s).' } ] },
      { heading: 'What speeds a reaction up', items: [
        { type: 'bullet', text: 'Higher concentration — more particles, more collisions.' },
        { type: 'bullet', text: 'Higher temperature — particles move faster AND more collisions have enough energy (activation energy).' },
        { type: 'bullet', text: 'More surface area — powder reacts faster than a chunk.' },
        { type: 'bullet', text: 'A catalyst — lowers the activation energy without being used up.' } ] },
      { heading: 'Collision theory in 3 steps', items: [
        { type: 'numbered', text: 'Particles must collide.' },
        { type: 'numbered', text: 'They must collide with enough energy (≥ activation energy).' },
        { type: 'numbered', text: 'They must collide in the right orientation.' } ] },
      { heading: 'For your lab report', items: [
        { type: 'bullet', text: 'Rate = Δ[concentration] ÷ Δtime — show one sample calculation in your analysis.' },
        { type: 'bullet', text: 'Figure 1: rate vs. concentration. Figure 2: rate vs. temperature.' },
        { type: 'bullet', text: 'Explain each trend using collision theory — that is the "why" the rubric wants.' } ] },
    ],
  };
  var FLASHCARDS = { title: 'Reaction Rates', cards: [
    { front: 'Reaction rate', back: 'Change in concentration of a reactant or product per unit time' },
    { front: 'Activation energy', back: 'The minimum energy colliding particles need to react' },
    { front: 'Catalyst', back: 'Speeds up a reaction by lowering activation energy; not used up' },
    { front: 'Why does heat speed up a reaction?', back: 'Faster particles collide more often, and more collisions have enough energy' },
    { front: 'Surface area effect', back: 'More exposed surface means more collisions per second' },
  ] };

  function coach(userText) {
    var t = String(userText || '').toLowerCase();

    if (/flash ?cards?/.test(t)) {
      return streamReply('Here\'s a quick deck on **reaction rates** — five cards, the ones most likely to show up in your lab analysis. Try saying each answer out loud before you flip it. 🔁',
        [{ type: 'flashcards', flashcards: FLASHCARDS }, chips(['Quiz me on reaction rates', 'Make a study guide instead', 'Plan time for the lab report'])]);
    }
    if (/quiz me/.test(t)) {
      return streamReply('Let\'s go — one question at a time. 🧪\n\n**Question 1:** In your lab, you raised the temperature of the solution and the reaction sped up. Using collision theory, *why* did that happen?',
        [{ type: 'open_question' }]);
    }
    if (/study guide|reaction rate|lab report|help me with lab/.test(t)) {
      return streamReply('Good call getting ahead of this — your ' + link(2001) + ' is due **' + longDay(THU) + '**.\n\n' +
        'I put together a one-page study guide on **reaction rates** below. The part that earns the most points on Ms. Reyes\'s rubric is the analysis, so focus on the last section: ' +
        'explain *why* each trend happens using collision theory, not just *what* happened.\n\nWhich part of your data feels shakiest right now?',
        [{ type: 'study_guide', studyGuide: STUDY_GUIDE }, chips(['My rate calculations', 'Explaining the temperature trend', 'Make flashcards', 'Quiz me on reaction rates'])]);
    }
    if (/essay|write my|write it for me|do my homework|give me the answers?/.test(t)) {
      return streamReply('I can\'t write it for you — but I can definitely help you write something you\'re proud of. ✍️\n\n' +
        'Your ' + link(2005) + ' is due ' + longDay(5) + ', and an outline only needs three things: a claim, your reasons, and the evidence for each. Let\'s start with the claim.\n\n' +
        'If you had to take a side in one sentence — **what do you actually believe about your topic, and why?**',
        [{ type: 'open_question' }]);
    }
    if (/office hours?/.test(t)) {
      var id = uid('act');
      var n = LEE_DAY;
      ACTIONS[id] = { kind: 'office_hours', teacher: 'Hannah Lee' };
      return streamReply('Office hours are a great move — teachers love when students come in *before* things snowball. 🙌\n\n' +
        'Ms. Lee has open office hours **' + DAYS[at(n, 12, 0).getDay()] + ' 3:15–4:00 PM in Lab 3**. I drafted a request below for a 20-minute slot about your ' + link(2011) +
        '. Nothing is sent until you tap **Send request** — and you can edit what you ask for by telling me.',
        [{ type: 'action_proposal', action: { id: id, kind: 'office_hours',
            summary: '🙋 Office hours with Hannah Lee — ' + ohWhen(n, 15, 40, 20),
            note: 'Your note for Hannah Lee: “Can we go over the cell membrane diagram I missed?” · Where: Lab 3. Hannah Lee will accept or decline — you\'ll get a Slack message either way.' } },
         chips(['What should I bring?', 'Make a plan for the rest of the week'], false)]);
    }
    if (/behind|plan|due|catch up|everything|this week|what.?s next|help with assignments|my week/.test(t)) {
      var pid = uid('act'), d0 = NOW.getHours() >= 19 ? 1 : 0;
      var blocks = [   // [dayOffset, h1, m1, h2, m2, focus]
        [d0, 18, 0, 18, 30, 'Of Mice and Men — Chapter 4 Reading Response'],
        [d0, 19, 45, 20, 30, 'Lab Report — Reaction Rates: data analysis'],
        [d0 + 1, 19, 15, 20, 0, 'Problem Set 3.4 — Quadratic Functions'],
        [Math.max(d0 + 1, THU), 7, 30, 8, 0, 'Lab Report — final read-through before submitting'],
      ].sort(function (a, b) { return (a[0] - b[0]) || (a[1] * 60 + a[2]) - (b[1] * 60 + b[2]); });
      var items = blocks.map(function (x) { return blockLabel(x[0], x[1], x[2], x[3], x[4], x[5]); });
      ACTIONS[pid] = { kind: 'study_plan', items: items, dayOffsets: blocks.map(function (x) { return x[0]; }),
        times: blocks.map(function (x) { return [hm(x[1], x[2]), hm(x[3], x[4])]; }) };
      return streamReply('Here\'s your week, most urgent first — you\'re in better shape than it feels. 💪\n\n' +
        '**Due soon**\n' +
        '- ' + link(2002) + ' — English 10, due **tonight**\n' +
        '- ' + link(2003) + ' — Algebra II, due **' + longDay(1) + '**\n' +
        '- ' + link(2001) + ' — Chemistry Adv., due **' + longDay(THU) + '**\n' +
        '- ' + link(2004) + ' — Biology, due **' + longDay(3) + '**\n' +
        '- ' + link(2005) + ' — English 10, due **' + longDay(5) + '**\n\n' +
        '**Catch up**\n' +
        '- ' + link(2011) + ' — Biology, was due 2 days ago. One 30-minute block fixes this one.\n\n' +
        'Tap the box next to anything you finish. With practice Thursday and the bus to Orlando Friday, I\'d front-load the lab report — I sketched a plan below that fits around your practices.',
        [{ type: 'action_proposal', action: { id: pid, kind: 'study_plan', summary: '📚 This week\'s game plan (ET)', items: items,
            note: 'Built around practice (Tue/Thu 4–6 PM) and conditioning (Wed 6:30 PM).', canRemind: true } },
         chips(['Start with the reading response', 'Help me with the lab report', 'Ask Ms. Lee about office hours'])]);
    }
    if (/stress|overwhelm|tired|anxious|too much/.test(t)) {
      return streamReply('That makes total sense — a test week plus a travel weekend is a lot to carry. 💙\n\n' +
        'Let\'s shrink it. You don\'t need to solve the whole week right now, just the *next* 30 minutes. Which one would take the most weight off your shoulders if it were done?',
        [chips(['The lab report', 'The English response', 'Just help me plan the week', 'Talk to Coach Reyes'])]);
    }
    if (/morning (slack )?message/.test(t)) {
      return streamReply('Love it! ☀️ The morning message is a quick Slack note with what\'s due, your practices and games, and a note from Coach Reyes.\n\nWhat time should it arrive?',
        [chips(['6:45 AM', '7:00 AM', '7:30 AM', 'Weekdays only'])]);
    }
    if (/^help me with (.+)/.test(t)) {
      return streamReply('Let\'s do it. 🎯 Before we dive in — what\'s the very first step you think this one needs? Even a guess is a great start.',
        [{ type: 'open_question' }]);
    }
    return streamReply('Got it! I\'m here for whatever you need — planning your week, breaking down an assignment, quizzing you before a test, or drafting a message to a teacher. ⚽📚\n\n' +
      'Right now your biggest win would be the **English reading response** (due tonight). Want to knock that out first, or start somewhere else?',
      [chips(['Show me everything due', 'Make a study guide on reaction rates', 'Book office hours with Ms. Lee'])]);
  }

  on('POST', /^chat\/message$/, function (m, body) {
    var msgs = (body && body.messages) || [];
    var last = msgs.length ? msgs[msgs.length - 1].content : '';
    return coach(typeof last === 'string' ? last : '');
  });

  on('POST', /^chat\/actions\/([^/]+)\/(confirm|cancel)$/, function (m, b) {
    var id = decodeURIComponent(m[1]), a = ACTIONS[id];
    if (!a) return { __status: 404, __body: { error: 'This expired.' } };
    if (a.done) return { __status: 409, __body: { error: 'Already handled.' } };
    a.done = true;
    if (m[2] === 'cancel') return { status: 'cancelled' };
    if (a.kind === 'study_plan') {
      var sel = (b && Array.isArray(b.selected)) ? b.selected : a.items.map(function (_, i) { return i; });
      sel.forEach(function (i) {
        EVENTS.push({ id: uid('ev'), title: '📚 ' + a.items[i].split(' · ')[1], type: 'study', source: 'coach-plan', date: ymdAt(a.dayOffsets[i]),
          startTime: a.times[i][0], endTime: a.times[i][1], description: 'Study block from your coach plan', slackReminder: !!(b && b.remind), studentEmail: ME.email });
      });
      return { status: 'confirmed', added: sel.length, reminders: !!(b && b.remind), skipped: [] };
    }
    if (a.kind === 'office_hours') {
      OH.push({ id: uid('oh'), teacherName: a.teacher, when: ohWhen(LEE_DAY, 15, 40, 20), status: 'requested', where: 'Lab 3',
        topic: 'Going over the cell membrane diagram', canCancel: true });
      return { status: 'confirmed', teacher: a.teacher };
    }
    return { status: 'confirmed' };
  });
})();
