/* YSC Hub preview — sample data for the TEACHER hub. Every person here is fictional.
 * Answers the /api/... calls made by public/teacher/teacher.js + teacher-huddles.js with the same response
 * shapes the real routes return (routes/teacher.js, server.js, lib/*). Writes (POST/PUT/PATCH/DELETE) change
 * the in-memory sample data so buttons visibly work; a page reload starts fresh. */
(function () {
  'use strict';
  var P = window.__YSC_PREVIEW__;
  if (!P || P.role !== 'teacher') return;
  var on = P.on, D = P.dates, NOW = D.NOW;
  var HOUR = 3600000, MIN = 60000;

  // ── dates ──────────────────────────────────────────────────────────────────────────────────────
  var MONDAY = new Date(NOW); MONDAY.setDate(NOW.getDate() - (NOW.getDay() === 0 ? 6 : NOW.getDay() - 1)); MONDAY.setHours(0, 0, 0, 0);
  var _clampN = 0;
  // A time in the sample week (dayIdx 0 = Monday). Anything that would land in the future is pulled back just before now.
  function at(dayIdx, h, m) {
    var d = new Date(MONDAY); d.setDate(MONDAY.getDate() + dayIdx); d.setHours(h, m || 0, 0, 0);
    if (d.getTime() > NOW.getTime() - 3 * MIN) d = new Date(NOW.getTime() - (8 + 19 * (_clampN++)) * MIN);
    return d;
  }
  function ago(hours) { return new Date(NOW.getTime() - hours * HOUR); }
  function iso(d) { return D.iso(d); }
  function ymd(d) { return D.ymd(d); }
  function dayYmd(n) { return ymd(D.addDays(n, 12, 0)); }
  function weekStartYmd(weeksBack) { var d = new Date(MONDAY); d.setDate(d.getDate() - 7 * weeksBack); return ymd(d); }
  var WEEK_START = weekStartYmd(0);
  function nextDow(dow) { // next date (today or later) with getDay() === dow
    var d = new Date(NOW); d.setHours(12, 0, 0, 0);
    var add = (dow - d.getDay() + 7) % 7; if (add === 0) add = 7; d.setDate(d.getDate() + add); return d;
  }
  function dayLabel(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function dec(s) { try { return decodeURIComponent(s); } catch (e) { return s; } }
  function uid(p) { return (p || 'id') + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function textResponse(text, type, filename) {
    return new Response(text, { status: 200, headers: { 'content-type': type, 'content-disposition': 'attachment; filename="' + filename + '"' } });
  }

  // ── people ─────────────────────────────────────────────────────────────────────────────────────
  var ME = { id: 't-elena', username: 'ereyes', name: 'Elena Reyes', email: 'elena.reyes@example.edu', role: 'teacher',
    classes: [{ name: 'Chemistry Adv.', canvasCourseId: '4182', students: [] }], mustChangePassword: false };
  var MENTOR_NAME = 'Coach Reyes';
  var S = [
    { k: 'mia',    name: 'Mia Castellanos', grade: 10, sport: 'Soccer · forward' },
    { k: 'noah',   name: 'Noah Kim',        grade: 10, sport: 'Soccer · goalkeeper' },
    { k: 'sofia',  name: 'Sofia Ortega',    grade: 11, sport: 'Basketball' },
    { k: 'jayden', name: 'Jayden Brooks',   grade: 9,  sport: 'Soccer' },
    { k: 'lena',   name: 'Lena Fischer',    grade: 10, sport: 'Volleyball' },
    { k: 'ethan',  name: 'Ethan Park',      grade: 12, sport: 'Tennis' },
    { k: 'zara',   name: 'Zara Ahmed',      grade: 11, sport: 'Track · 400m' },
    { k: 'leo',    name: 'Leo Martins',     grade: 9,  sport: 'Swimming' },
  ];
  var BY = {}, BY_EMAIL = {}, BY_NAME = {};
  S.forEach(function (s) {
    s.email = s.name.toLowerCase().replace(' ', '.') + '@example.edu';
    BY[s.k] = s; BY_EMAIL[s.email] = s; BY_NAME[s.name] = s;
  });
  function stu(emailParam) { return BY_EMAIL[String(dec(emailParam || '')).toLowerCase()]; }

  // Two mentees are on the hub right now (presence normally arrives over Socket.IO, which the preview stubs out).
  var ONLINE = ['mia', 'zara'];
  window._onlineStudentEmails = window._onlineStudentEmails || new Set();
  ONLINE.forEach(function (k) { window._onlineStudentEmails.add(BY[k].email); });

  // ── Student Monitor ───────────────────────────────────────────────────────────────────────────
  var LAST_SEEN = { mia: 0.05, noah: 3.2, sofia: 5.5, jayden: 20, lena: 26, ethan: 9, zara: 0.02, leo: 47 };
  var FEATURE = { mia: 'chat', zara: 'canvas' };
  on('GET', /^teacher\/students$/, function () {
    return S.map(function (s) {
      var active = ONLINE.indexOf(s.k) >= 0, seen = ago(LAST_SEEN[s.k]).getTime();
      return { studentName: s.name, email: s.email, lastSeen: seen, secondsAgo: Math.round((NOW - seen) / 1000),
        activeFeature: FEATURE[s.k] || '', status: active ? 'active' : 'offline', totalMinutes: active ? (s.k === 'mia' ? 34 : 12) : 0,
        featureTime: active ? { chat: 20, canvas: 9, calendar: 5 } : {}, canMessage: true };
    });
  });
  on('GET', /^teacher\/active-students$/, function () { return { activeEmails: ONLINE.map(function (k) { return BY[k].email; }) }; });

  // Healthy upstream shape from the standalone YSC Check-in app: { date, mentor, mentees:[...] }.
  var LIGHTS = {
    mia:    { light: 'green',  status: 'complete', learning: 'in_class', hasSharedWin: true },
    noah:   { light: 'yellow', status: 'complete', learning: 'async' },
    sofia:  { light: 'yellow', status: 'complete', learning: 'in_class', hasNote: true },
    jayden: { light: 'red',    status: 'complete', learning: 'async', askedForReachOut: true, hasNote: true },
    lena:   { light: 'green',  status: 'complete', learning: 'traveling' },
    ethan:  { light: null,     status: 'pending' },
    zara:   { light: 'green',  status: 'complete', learning: 'in_class' },
    leo:    { light: null,     status: 'pending' },
  };
  on('GET', /^teacher\/checkin-lights$/, function () {
    return { date: ymd(NOW), mentor: ME.email, mentees: S.map(function (s) {
      var l = LIGHTS[s.k];
      return { email: s.email, name: s.name, light: l.light, status: l.status, learning: l.learning || null,
        askedForReachOut: !!l.askedForReachOut, hasNote: !!l.hasNote, hasSharedWin: !!l.hasSharedWin };
    }) };
  });

  // ── identity, settings ────────────────────────────────────────────────────────────────────────
  on('GET', /^teacher\/me$/, function () { return Object.assign({}, ME, { isAdmin: true, pulseEnabled: true }); });

  var NOTIF = { loginSound: true, messageSound: true, volume: 0.25, weeklyDigest: true, mentorInboxSeenAt: ago(30).getTime() };
  on('GET', /^teacher\/notification-settings$/, function () { return Object.assign({}, NOTIF); });
  on('POST', /^teacher\/notification-settings$/, function (m, b) {
    b = b || {};
    ['loginSound', 'messageSound', 'weeklyDigest'].forEach(function (k) { if (typeof b[k] === 'boolean') NOTIF[k] = b[k]; });
    if (typeof b.volume === 'number') NOTIF.volume = b.volume;
    if (b.mentorInboxSeenAt > (NOTIF.mentorInboxSeenAt || 0)) NOTIF.mentorInboxSeenAt = b.mentorInboxSeenAt;
    return { ok: true, prefs: Object.assign({}, NOTIF) };
  });

  var QUICK = { observEdUrl: 'https://canvas.example.edu/courses/5120' };
  on('GET', /^teacher\/quicklinks$/, function () { return Object.assign({}, QUICK); });
  on('POST', /^teacher\/quicklinks$/, function (m, b) {
    var u = String((b && b.observEdUrl) || '').trim();
    if (u && !/^https?:\/\//i.test(u)) return { __status: 400, __body: { error: 'Link must start with http:// or https://' } };
    QUICK.observEdUrl = u; return { ok: true, links: Object.assign({}, QUICK) };
  });

  var TEAM = { members: [
    { id: 'tm1', name: 'Elena Reyes',  role: 'Mentor · Chemistry Adv.', email: 'elena.reyes@example.edu', slackHandle: 'elena.reyes', initials: 'ER', color: '#2B3BFF', availability: 'available' },
    { id: 'tm2', name: 'Marcus Webb',  role: 'Algebra II',              email: 'marcus.webb@example.edu', slackHandle: 'mwebb',       initials: 'MW', color: '#FF8A5B', availability: 'busy' },
    { id: 'tm3', name: 'Daniel Osei',  role: 'English 10',              email: 'daniel.osei@example.edu', slackHandle: 'dosei',       initials: 'DO', color: '#1D7A55', availability: 'available' },
    { id: 'tm4', name: 'Hannah Lee',   role: 'Biology',                 email: 'hannah.lee@example.edu',  slackHandle: 'hlee',        initials: 'HL', color: '#8E44AD', availability: 'offline' },
    { id: 'tm5', name: 'Priya Anand',  role: 'Performance coach',       email: 'priya.anand@example.edu', slackHandle: 'priya.a',     initials: 'PA', color: '#C85A2E', availability: 'available' },
  ] };
  function teamMember(id) { return TEAM.members.filter(function (x) { return x.id === id; })[0]; }
  on('GET', /^teacher\/support-team$/, function () { return JSON.parse(JSON.stringify(TEAM)); });
  on('POST', /^teacher\/support-team$/, function (m, b) { var x = Object.assign({ id: uid('tm'), availability: 'offline' }, b || {}); TEAM.members.push(x); return { ok: true, id: x.id, member: x }; });
  on('PUT', /^teacher\/support-team\/([^/]+)$/, function (m, b) { var x = teamMember(dec(m[1])); if (x) Object.assign(x, b || {}); return { ok: true, member: x }; });
  on('DELETE', /^teacher\/support-team\/([^/]+)$/, function (m) { TEAM.members = TEAM.members.filter(function (x) { return x.id !== dec(m[1]); }); return { ok: true }; });
  on('PATCH', /^teacher\/support-team\/([^/]+)\/availability$/, function (m, b) { var x = teamMember(dec(m[1])); if (x && b) x.availability = b.availability; return { ok: true }; });
  on('PATCH', /^teacher\/availability$/, function (m, b) { if (b && b.availability) TEAM.members[0].availability = b.availability; return { ok: true, availability: b && b.availability }; });

  var SOCCER = { 'u17-girls': { id: 'u17-girls', name: 'U17 Girls', coach: 'Coach Alvarez', upcomingEvent: 'Sat vs. Lakeside FC — 10:00 AM, home', schedule: [
      { id: 'r1', day: 'Monday', date: '', time: '3:30 – 5:30 PM', location: 'Field B', type: 'practice', opponent: '', notes: '' },
      { id: 'r2', day: 'Wednesday', date: '', time: '3:30 – 5:30 PM', location: 'Field B', type: 'practice', opponent: '', notes: 'Bring both kits' },
      { id: 'r3', day: 'Thursday', date: '', time: '4:00 – 5:00 PM', location: 'Film room', type: 'film', opponent: '', notes: '' },
      { id: 'r4', day: 'Saturday', date: dayYmd((6 - NOW.getDay() + 7) % 7 || 7), time: '10:00 AM', location: 'Home — Main Field', type: 'game', opponent: 'Lakeside FC', notes: 'Arrive 9:00 AM' },
    ] },
    'u15-boys': { id: 'u15-boys', name: 'U15 Boys', coach: 'Coach Brandt', upcomingEvent: '', schedule: [
      { id: 'b1', day: 'Tuesday', date: '', time: '4:00 – 6:00 PM', location: 'Field A', type: 'practice', opponent: '', notes: '' },
      { id: 'b2', day: 'Friday', date: '', time: '3:30 – 5:00 PM', location: 'Field A', type: 'training', opponent: '', notes: '' },
    ] } };
  on('GET', /^teacher\/soccer-teams$/, function () { return Object.keys(SOCCER).map(function (k) { return { id: k, name: SOCCER[k].name, coach: SOCCER[k].coach }; }); });
  on('POST', /^teacher\/soccer-teams$/, function (m, b) { var id = uid('team'); SOCCER[id] = { id: id, name: (b && b.name) || 'New team', coach: '', upcomingEvent: '', schedule: [] }; return { ok: true, team: { id: id, name: SOCCER[id].name, coach: '' } }; });
  on('POST', /^teacher\/soccer-teams\/([^/]+)\/preview$/, function () { return { text: 'Sat vs. Lakeside FC — 10:00 AM, home' }; });
  on('GET', /^teacher\/soccer-teams\/([^/]+)$/, function (m) { var t = SOCCER[dec(m[1])]; return t ? Object.assign({}, JSON.parse(JSON.stringify(t)), { suggestedUpcomingEvent: 'Sat vs. Lakeside FC — 10:00 AM, home' }) : { schedule: [], upcomingEvent: '' }; });
  on('PUT', /^teacher\/soccer-teams\/([^/]+)$/, function (m, b) { var t = SOCCER[dec(m[1])]; if (t && b) Object.assign(t, b); return { ok: true }; });
  on('DELETE', /^teacher\/soccer-teams\/([^/]+)$/, function (m) { delete SOCCER[dec(m[1])]; return { ok: true }; });

  var ZOOM = [
    { id: 'z1', label: 'Chemistry Adv. — Live Lab', url: 'https://zoom.us/j/81234567890', forClass: 'Chemistry Adv.', schedule: 'Tue & Thu 10:00 AM ET' },
    { id: 'z2', label: 'Mentor Drop-in', url: 'https://zoom.us/j/84455667788', forClass: 'Mentees', schedule: 'Wed 7:30 PM ET' },
    { id: 'z3', label: 'Chem Test Review', url: 'https://zoom.us/j/89900112233', forClass: 'Chemistry Adv.', schedule: 'Sun before each test, 6:00 PM ET' },
  ];
  on('GET', /^teacher\/zoom$/, function () { return ZOOM.slice(); });
  on('POST', /^teacher\/zoom$/, function (m, b) { var z = Object.assign({ id: uid('z') }, b || {}); ZOOM.push(z); return z; });
  on('PUT', /^teacher\/zoom\/([^/]+)$/, function (m, b) { var z = ZOOM.filter(function (x) { return x.id === dec(m[1]); })[0]; if (z) Object.assign(z, b || {}); return z || {}; });
  on('DELETE', /^teacher\/zoom\/([^/]+)$/, function (m) { ZOOM = ZOOM.filter(function (x) { return x.id !== dec(m[1]); }); return { ok: true }; });
  var ZOOM_CONNECTED = true;
  on('GET', /^teacher\/zoom-connection-status$/, function () { return { connected: ZOOM_CONNECTED }; });
  on('POST', /^teacher\/zoom-disconnect$/, function () { ZOOM_CONNECTED = false; return { ok: true }; });
  on('POST', /^zoom\/meetings$/, function (m, b) { return { topic: (b && b.topic) || 'Instant meeting — Elena Reyes', joinUrl: 'https://zoom.us/j/87766554433', startUrl: 'https://zoom.us/s/87766554433' }; });
  on('GET', /^config\/zoom-url$/, function () { return { url: 'https://zoom.us/j/81234567890' }; });
  on('GET', /^config\/huddle-url$/, function () { return { deepLink: '', webLink: 'https://app.slack.com', error: 'Preview — Slack is not connected' }; });

  // ── Office hours (Settings → Office Hours) ─────────────────────────────────────────────────────
  var OH = { name: 'Elena Reyes', slots: [
    { day: 'tue', start: '15:00', end: '15:45', where: 'Room 204 (Science wing)' },
    { day: 'thu', start: '12:15', end: '12:45', where: 'Zoom — link in Canvas' },
  ], updatedAt: iso(ago(150)) };
  on('GET', /^teacher\/office-hours$/, function () { return { email: ME.email, name: OH.name, slots: OH.slots.slice(), updatedAt: OH.updatedAt }; });
  on('PUT', /^teacher\/office-hours$/, function (m, b) {
    b = b || {}; var slots = Array.isArray(b.slots) ? b.slots : [];
    for (var i = 0; i < slots.length; i++) if (!slots[i].start || !slots[i].end || slots[i].end <= slots[i].start) return { __status: 400, __body: { error: 'Each time needs an end after its start.' } };
    OH.name = String(b.name || OH.name); OH.slots = slots.map(function (s) { return { day: s.day, start: s.start, end: s.end, where: String(s.where || '').trim() }; });
    OH.updatedAt = iso(NOW); return { ok: true, name: OH.name, slots: OH.slots, updatedAt: OH.updatedAt };
  });
  var thu = nextDow(4), tue = nextDow(2);
  var BOOKINGS = [
    { id: 'ohb-1', studentName: 'Noah Kim', when: dayLabel(thu) + ', 12:15 PM–12:30 PM ET', startUtc: iso(new Date(thu.setHours(12, 15))), topic: 'Limiting reagent problems from the stoichiometry set — I keep getting the wrong one.', where: 'Zoom — link in Canvas', status: 'requested', teacherNote: '', isMentor: true },
    { id: 'ohb-2', studentName: 'Sofia Ortega', when: dayLabel(tue) + ', 3:00 PM–3:20 PM ET', startUtc: iso(new Date(tue.setHours(15, 0))), topic: 'Go over my lab report draft before Friday.', where: 'Room 204 (Science wing)', status: 'accepted', teacherNote: 'Bring the data table too!', isMentor: true },
  ];
  function gcal(b) { return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Office hours: ' + b.studentName) + '&details=' + encodeURIComponent(b.topic); }
  function ohView(b) { var v = Object.assign({}, b); if (b.status === 'accepted') v.gcalUrl = gcal(b); return v; }
  on('GET', /^teacher\/office-hours\/requests$/, function () {
    return { pending: BOOKINGS.filter(function (b) { return b.status === 'requested'; }).map(ohView),
      upcoming: BOOKINGS.filter(function (b) { return b.status === 'accepted'; }).map(ohView),
      recent: BOOKINGS.filter(function (b) { return b.status === 'declined'; }).map(ohView) };
  });
  on('GET', /^teacher\/office-hours\/pending-count$/, function () { return { pending: BOOKINGS.filter(function (b) { return b.status === 'requested'; }).length }; });
  on('POST', /^teacher\/office-hours\/requests\/([^/]+)\/(accept|decline)$/, function (m, b) {
    var bk = BOOKINGS.filter(function (x) { return x.id === dec(m[1]); })[0];
    if (!bk) return { __status: 404, __body: { error: 'That request is no longer open.' } };
    if (bk.status !== 'requested') return { __status: 409, __body: { error: 'That request was already answered.' } };
    bk.status = m[2] === 'accept' ? 'accepted' : 'declined'; bk.teacherNote = String((b && b.note) || '').slice(0, 200);
    return { ok: true, booking: ohView(bk), notified: true };
  });

  // ── Mentor Chat conversations (Messages → Mentor Inbox + the card conversation panel) ──────────
  // [hoursAgo, role, text]. Sofia, Zara and Jayden have a message waiting for a reply.
  var CONVO_SRC = {
    mia: [[52, 'student', 'Hi Coach! Do you think I can move my chem quiz retake to Thursday? We have a scrimmage Wednesday.'],
          [51, 'mentor', 'Yes — I told Ms. Lee too. Use Wednesday morning for the practice set and you\'ll be ready.'],
          [27, 'student', 'Retake done!! Got way more of the mole problems right this time 🙌'],
          [26.5, 'mentor', 'That\'s the work paying off, Mia. Proud of you. What helped most?']],
    noah: [[70, 'mentor', 'Hey Noah — saw the stoichiometry set is due Friday. Want to grab office hours Thursday?'],
           [68, 'student', 'Yeah that would help. I always pick the wrong limiting reagent.'],
           [67, 'mentor', 'Request a Thursday slot from the hub and bring two problems you got stuck on.']],
    sofia: [[30, 'mentor', 'How are you feeling about the week? Looks like a lot is due Thursday and Friday.'],
            [29, 'student', 'Honestly a lot. Tournament weekend plus the lab report plus the English essay.'],
            [28.5, 'mentor', 'Let\'s make a plan. Can you list the three things due first?'],
            [3.1, 'student', 'Ok I made a study plan with the AI coach for tonight and tomorrow. Can you check if the order makes sense? Lab report first then the essay outline.']],
    jayden: [[49, 'mentor', 'Morning Jayden! How did the first week of Algebra II quizzes go?'],
             [47, 'student', 'Not great tbh'],
             [1.4, 'student', 'Can we talk today? I\'m behind on the history reading and I don\'t know how to catch up. I checked in red.']],
    lena: [[75, 'student', 'We leave for the volleyball tournament Thursday morning, back Sunday night.'],
           [74, 'mentor', 'Thanks for the heads-up. Ask Mr. Osei for the reading ahead of time and plan two study blocks on the bus.'],
           [50, 'student', 'Done, he sent it. Blocks are on my calendar.']],
    ethan: [[96, 'mentor', 'Ethan, how are college apps going alongside the tennis schedule?'],
            [95, 'student', 'Early action essay is almost done. Working from California this week for the tournament.'],
            [94, 'mentor', 'Nice. Remember office hours times show in your time zone now.']],
    zara: [[28, 'mentor', 'Great 400m split on Saturday, Zara!'],
           [27.8, 'student', 'Thank you!! Still sore lol'],
           [0.6, 'student', 'Quick question — the AI coach said I should ask you about the Chem Adv. extra credit lab. Is it still open?']],
    leo: [[120, 'mentor', 'Welcome to the hub, Leo! When you get a minute, connect Canvas from your profile so your assignments show up.'],
          [118, 'student', 'Ok will do after practice']],
  };
  var CONVOS = {};
  S.forEach(function (s) {
    CONVOS[s.email] = (CONVO_SRC[s.k] || []).map(function (r, i) {
      var t = ago(r[0]);
      return { id: 'msg_' + s.k + '_' + i, role: r[1], text: r[2], senderName: r[1] === 'student' ? s.name : MENTOR_NAME, timestamp: iso(t), date: iso(t).slice(0, 10) };
    });
  });
  on('GET', /^mentor\/conversation\/([^/]+)\/transcript$/, function (m, b, url) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    var lines = ['Mentor Chat — ' + s.name, ''].concat((CONVOS[s.email] || []).map(function (x) {
      return '[' + new Date(x.timestamp).toLocaleString() + '] ' + x.senderName + ': ' + x.text; }));
    return textResponse(lines.join('\n'), 'text/plain', 'transcript_' + s.email.split('@')[0] + '.txt');
  });
  on('GET', /^mentor\/conversation\/([^/]+)$/, function (m) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    return { messages: (CONVOS[s.email] || []).slice(), studentEmail: s.email };
  });
  on('POST', /^mentor\/send$/, function (m, b) {
    var s = stu((b && b.studentEmail) || ''); var text = String((b && b.message) || '').trim();
    if (!s) return { __status: 403, __body: { success: false, error: 'Not authorized for this student' } };
    if (!text) return { __status: 400, __body: { success: false, error: 'Message is empty' } };
    var msg = { id: uid('msg'), role: 'mentor', text: text, senderName: MENTOR_NAME, timestamp: iso(new Date()), date: ymd(new Date()) };
    CONVOS[s.email].push(msg);
    return { success: true, delivered: true, id: msg.id };
  });

  var WEEKLY = { text: 'This week is about finishing strong before the long weekend. Pick ONE thing each day you\'re proud of — and tell me about it Friday.', postedAt: iso(at(0, 7, 40)), weekOf: WEEK_START };
  on('GET', /^teacher\/weekly-message$/, function () { return { message: WEEKLY ? Object.assign({}, WEEKLY) : null }; });
  on('POST', /^teacher\/weekly-message$/, function (m, b) {
    var t = String((b && b.text) || '').trim();
    if (!t) return { __status: 400, __body: { error: 'Message text required' } };
    if (t.length > 500) return { __status: 400, __body: { error: 'Message must be 500 characters or less' } };
    WEEKLY = { text: t, postedAt: iso(new Date()), weekOf: WEEK_START }; return { success: true, message: WEEKLY };
  });

  // ── conversation panel: weekly load + study plan ───────────────────────────────────────────────
  // Mon..Fri [total, completed]; 'T' marks a travel day.
  var LOAD = { mia: [[2, 2], [1, 1], [3, 1], [1, 0], [2, 0]], noah: [[1, 1], [2, 1], [2, 0], [3, 0], [1, 0]],
    sofia: [[2, 2], [2, 1], [3, 0], [4, 0], [3, 0]], jayden: [[1, 0], [1, 1], [0, 0], [2, 0], [1, 0]],
    lena: [[2, 2], [1, 1], [2, 1], [3, 0, 'T'], [2, 0, 'T']], ethan: [[1, 1], [2, 2], [1, 0, 'T'], [2, 0, 'T'], [1, 0]],
    zara: [[2, 2], [1, 1], [2, 1], [2, 0], [1, 0]] };
  on('GET', /^teacher\/student-weekly-load\/([^/]+)$/, function (m) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    if (!LOAD[s.k]) return { weeklyLoad: [], completions: [], studentName: s.name, studentEmail: s.email, canvasConnected: false };
    var today = ymd(NOW);
    var wl = LOAD[s.k].map(function (r, i) {
      var d = new Date(MONDAY); d.setDate(MONDAY.getDate() + i);
      return { day: d.toLocaleDateString('en-US', { weekday: 'short' }), date: ymd(d), isToday: ymd(d) === today,
        total: r[0], completed: r[1], pending: r[0] - r[1], isConflict: r[2] === 'T', assignments: [] };
    });
    return { weeklyLoad: wl, completions: [], studentName: s.name, studentEmail: s.email, canvasConnected: true };
  });

  // [dayOffset, start, end, focus, slackReminder]
  var PLAN = {
    mia: [[-3, '19:00', '19:45', 'Chem quiz retake prep — mole conversions', true], [-1, '18:30', '19:15', 'English 10 reading log', false],
          [0, '19:30', '20:15', 'Algebra II problem set 3.4', true], [2, '07:30', '08:00', 'Biology vocab flashcards', false]],
    noah: [[-2, '20:00', '20:45', 'Stoichiometry practice', false], [1, '19:00', '19:45', 'Limiting reagent problems (before office hours)', true]],
    sofia: [[-1, '21:00', '21:45', 'Lab report — data table', true], [0, '20:00', '21:00', 'Lab report — discussion section', true],
            [1, '06:45', '07:30', 'English essay outline', true], [1, '21:00', '21:30', 'Algebra II warm-up set', false], [3, '13:00', '14:00', 'Essay draft (tournament bus)', false]],
    jayden: [[1, '17:30', '18:15', 'History reading — catch up ch. 4', false]],
    lena: [[-2, '19:00', '19:45', 'Read ahead — English 10', true], [2, '09:00', '09:45', 'Bus study block: chem notes', true], [3, '15:00', '15:30', 'Bus study block: algebra', true]],
    ethan: [[-4, '16:00', '16:45', 'College essay revision', false], [0, '17:00', '17:45', 'AP Lit annotations', true], [2, '16:30', '17:30', 'Chem Adv. unit review', false]],
    zara: [[-1, '19:30', '20:15', 'Chem Adv. extra credit lab write-up', false], [1, '19:30', '20:00', 'Biology quiz review', true]],
    leo: [],
  };
  var MENTEE_OH = {
    noah: [{ teacherName: 'Elena Reyes', when: dayLabel(nextDow(4)) + ', 12:15 PM–12:30 PM ET', status: 'requested', topic: 'Limiting reagent problems' }],
    sofia: [{ teacherName: 'Elena Reyes', when: dayLabel(nextDow(2)) + ', 3:00 PM–3:20 PM ET', status: 'accepted', topic: 'Lab report draft' },
            { teacherName: 'Daniel Osei', when: dayLabel(nextDow(3)) + ', 2:30 PM–2:45 PM ET', status: 'requested', topic: 'Essay thesis' }],
    jayden: [{ teacherName: 'Marcus Webb', when: dayLabel(D.addDays(-3, 12)) + ', 1:00 PM–1:15 PM ET', status: 'declined', topic: 'Quiz corrections' }],
    zara: [{ teacherName: 'Hannah Lee', when: dayLabel(D.addDays(-2, 12)) + ', 3:30 PM–3:45 PM ET', status: 'accepted', topic: 'Cell respiration' }],
  };
  on('GET', /^teacher\/student-study-plan\/([^/]+)$/, function (m) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    var pt = s.k === 'ethan';
    return { today: ymd(NOW), blocks: (PLAN[s.k] || []).map(function (r) {
      return { date: dayYmd(r[0]), start: r[1], end: r[2], focus: r[3], slackReminder: r[4], tz: pt ? 'America/Los_Angeles' : 'America/New_York', tzLabel: pt ? 'PT' : 'ET' };
    }), officeHours: MENTEE_OH[s.k] || [] };
  });

  // ── Student Pulse ─────────────────────────────────────────────────────────────────────────────
  var LABELS = { academics: ['Strong', 'Steady', 'Needs a look'], checkin: ['Doing well', 'Could use support', 'Asked for their mentor'], load: ['Light', 'Full', 'Overloaded'] };
  // six-week strips oldest → newest (last = this week); null = no snapshot that week
  var STRIP = {
    mia:    { academics: [0, 0, 1, 0, 0, 0], checkin: [0, 0, 0, 1, 0, 0], load: [1, 1, 0, 1, 2, 1] },
    noah:   { academics: [1, 1, 1, 0, 1, 1], checkin: [0, 1, 1, 0, 1, 1], load: [1, 0, 1, 1, 1, 1] },
    sofia:  { academics: [0, 0, 0, 0, 1, 2], checkin: [1, 0, 1, 1, 1, 1], load: [0, 1, 1, 0, 1, 2] },
    jayden: { academics: [1, 1, null, 1, 1, 1], checkin: [0, 0, 1, 0, 1, 2], load: [0, 0, 0, 1, 0, 0] },
    lena:   { academics: [1, 0, 0, 1, 1, 1], checkin: [0, 0, 0, 0, 0, 0], load: [1, 1, 2, 1, 1, 2] },
    ethan:  { academics: [0, 0, 0, 0, 0, 0], checkin: [0, null, 0, 0, null, null], load: [1, 1, 1, 2, 1, 1] },
    zara:   { academics: [0, 0, 1, 1, 0, 0], checkin: [0, 0, 0, 1, 0, 1], load: [1, 1, 1, 1, 1, 1] },
    leo:    { academics: [null, null, null, null, null, null], checkin: [null, 0, 1, 0, 0, 0], load: [null, null, null, null, null, null] },
  };
  var NO_CANVAS = { leo: true };
  var CALLOUT = { sofia: 'Academics and Load have both moved toward concern for two weeks running.' };
  var ACAD = { mia: [0, 0, 0], noah: [2, 1, 1], sofia: [5, 3, 2], jayden: [3, 1, 1], lena: [2, 1, 0], ethan: [0, 0, 0], zara: [1, 0, 0] };
  var DROPPED = { sofia: 'English 10' };
  var LOADF = { mia: [9, 'Wednesday', 3, 0], noah: [9, 'Thursday', 3, 0], sofia: [14, 'Thursday', 4, 2], jayden: [5, 'Thursday', 2, 0],
    lena: [10, 'Thursday', 3, 2], ethan: [7, 'Tuesday', 2, 2], zara: [8, 'Wednesday', 2, 0] };
  var CHECKINF = {
    mia:    { checkedInCount: 3, totalEligible: 3, frequency: { checkedInCount: 14, totalSchoolDays: 15, green: 12, yellow: 2, red: 0 }, streak: { color: 'green', count: 6 }, topAttention: 'Chemistry quiz retake', topHelpful: 'Check in on my plan', sharedWin: true },
    noah:   { checkedInCount: 2, totalEligible: 3, frequency: { checkedInCount: 11, totalSchoolDays: 15, green: 6, yellow: 5, red: 0 }, streak: { color: 'yellow', count: 2 }, topAttention: 'Stoichiometry', topHelpful: 'Help me plan my week', learningFacts: [{ text: 'Working on his own most days this week' }] },
    sofia:  { checkedInCount: 3, totalEligible: 3, frequency: { checkedInCount: 15, totalSchoolDays: 15, green: 7, yellow: 8, red: 0 }, streak: { color: 'yellow', count: 3 }, topAttention: 'Lab report + English essay', topHelpful: 'Help me plan my week', noteCount: 2 },
    jayden: { checkedInCount: 3, totalEligible: 3, frequency: { checkedInCount: 12, totalSchoolDays: 15, green: 7, yellow: 4, red: 1 }, topAttention: 'History reading', topHelpful: 'Talk to me today', noteCount: 1 },
    lena:   { checkedInCount: 3, totalEligible: 3, allSame: { color: 'green', weeks: 6, count: 27 }, unavailableCount: 0, learningFacts: [{ text: 'Traveling for volleyball Thu–Fri' }], topAttention: 'Staying ahead before the tournament' },
    ethan:  { checkedInCount: 0, totalEligible: 3, frequency: { checkedInCount: 6, totalSchoolDays: 15, green: 6, yellow: 0, red: 0 }, unavailableCount: 1 },
    zara:   { checkedInCount: 3, totalEligible: 3, frequency: { checkedInCount: 15, totalSchoolDays: 15, green: 11, yellow: 4, red: 0 }, sameAnswerWeeks: 0, topAttention: 'Chem extra credit lab', topHelpful: 'Answer a quick question', sharedWin: true },
    leo:    { checkedInCount: 2, totalEligible: 3, frequency: { checkedInCount: 9, totalSchoolDays: 15, green: 7, yellow: 2, red: 0 }, topAttention: 'Getting set up on the hub' },
  };
  function stripFor(k, g) {
    return STRIP[k][g].map(function (lvl, i) {
      var lab = lvl == null ? null : LABELS[g][lvl];
      if (lvl == null && g !== 'checkin' && NO_CANVAS[k]) lab = 'Canvas not connected';
      return { weekStart: weekStartYmd(5 - i), level: lvl, levelLabel: lab };
    });
  }
  function trendFor(k, g) {
    var a = STRIP[k][g], cur = a[5], prev = a[4];
    if (cur == null || prev == null) return null;
    if (cur === prev) return { direction: 'same', label: 'Same as last week' };
    var dir = cur > prev ? 'up' : 'down';
    return { direction: dir, label: dir + ' from ' + LABELS[g][prev] };
  }
  function gaugeFor(k, g) {
    var lvl = STRIP[k][g][5], label = lvl == null ? null : LABELS[g][lvl];
    if (g === 'academics') {
      if (NO_CANVAS[k]) return { level: null, levelLabel: 'Canvas not connected', facts: { canvasConnected: false }, droppedCourse: null, gradeTrendPending: true };
      var a = ACAD[k];
      return { level: lvl, levelLabel: label, droppedCourse: DROPPED[k] || null, gradeTrendPending: false,
        facts: { canvasConnected: true, canvasError: false, missingTotal: a[0], missingNewThisWeek: a[1], lateThisWeek: a[2] } };
    }
    if (g === 'load') {
      if (NO_CANVAS[k]) return { level: null, levelLabel: 'Canvas not connected', facts: { canvasConnected: false } };
      var f = LOADF[k];
      return { level: lvl, levelLabel: label, travelRaised: f[3] > 0,
        facts: { canvasConnected: true, canvasError: false, dueCount: f[0], busiestDay: { count: f[2], weekdayName: f[1] }, includeSport: false,
          checkinAvailableForTravel: true, travelDaysFromCheckin: f[3] } };
    }
    var c = Object.assign({ available: true, unavailableCount: 0, noteCount: 0, learningFacts: [] }, CHECKINF[k]);
    if (lvl == null) return { level: null, levelLabel: 'No check-in', facts: c };
    return { level: lvl, levelLabel: label, facts: c };
  }
  function pulseAsOf(k, g) { return iso(new Date(NOW.getTime() - (2 + (k.length + g.length) % 5) * MIN)); }
  on('GET', /^teacher\/student-pulse\/([^/]+)\/(load|academics|checkin)$/, function (m) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    var g = m[2];
    return { studentEmail: s.email, weekStart: WEEK_START, asOf: pulseAsOf(s.k, g), gauge: gaugeFor(s.k, g),
      strip: stripFor(s.k, g), trend: trendFor(s.k, g), patternCallout: CALLOUT[s.k] || null };
  });
  on('GET', /^teacher\/student-pulse\/([^/]+)$/, function (m) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    return { studentEmail: s.email, studentName: s.name, weekStart: WEEK_START };
  });
  on('GET', /^teacher\/student-pulse-overview$/, function () {
    var G = ['academics', 'checkin', 'load'], EXTRA = { academics: 'canvasNotConnected', load: 'canvasNotConnected', checkin: 'noCheckin' };
    var rings = {};
    G.forEach(function (g) { rings[g] = { 0: 0, 1: 0, 2: 0, noData: 0 }; rings[g][EXTRA[g]] = 0; });
    var mentees = S.map(function (s) {
      var e = { studentEmail: s.email, studentName: s.name }, worse = false, concern = false;
      G.forEach(function (g) {
        var ga = gaugeFor(s.k, g), tr = trendFor(s.k, g);
        e[g] = { level: ga.level, levelLabel: ga.levelLabel, trend: tr };
        var bucket = ga.level != null ? ga.level : ((ga.levelLabel === 'Canvas not connected' || ga.levelLabel === 'No check-in') ? EXTRA[g] : 'noData');
        rings[g][bucket]++;
        if (tr && tr.direction === 'up') worse = true;
        if (ga.level === 2) concern = true;
      });
      e.sortRank = worse ? 0 : concern ? 1 : 2; return e;
    });
    mentees.sort(function (a, b) { return a.sortRank - b.sortRank || a.studentName.localeCompare(b.studentName); });
    return { asOf: iso(new Date(NOW.getTime() - 40 * MIN)), weekStart: WEEK_START, rings: rings, mentees: mentees };
  });

  // ── Chat Log / Prompt Inventory / Analytics ────────────────────────────────────────────────────
  // [student, dayIdx(0=Mon of this week), hour, min, subject, prompt, response, flagReasons, academicIntegrity, visuals]
  var LOG_SRC = [
    ['mia', 0, 8, 12, 'Chemistry', 'Can you quiz me on mole conversions before my retake?', 'Sure! Question 1: How many moles are in 36 g of water? Take your time and show me how you set it up.'],
    ['noah', 0, 9, 40, 'Chemistry', 'what is a limiting reagent and how do i find it', 'Great question. The limiting reagent is the reactant that runs out first. **Step 1:** convert each reactant to moles. What do you get for the first one?'],
    ['sofia', 0, 15, 5, 'Canvas', "What's due this week for all my classes?", "Here's your week:\n- **Lab Report: Reaction Rates** — Thu\n- **Essay outline (English 10)** — Fri\n- **Algebra II 3.4** — Fri\nWant to plan the lab report first?"],
    ['zara', 0, 19, 22, 'Biology', 'Explain cellular respiration like I am a runner', "Think of it as your body's energy pipeline during a 400m: glucose goes in, ATP comes out. Which stage do you think makes the most ATP?", null, false, ['Diagram: cellular respiration']],
    ['jayden', 0, 20, 48, 'History', "I don't know where to start on the chapter 4 reading", "Let's shrink it. Read just the section headings first and tell me which one looks most familiar."],
    ['lena', 1, 7, 55, 'English', 'help me plan reading for the tournament weekend', 'You leave Thursday. If you read 12 pages tonight and 12 Wednesday, you only have 10 left for the bus. Does that sound doable?'],
    ['mia', 1, 10, 3, 'Math', 'how do i factor x^2 + 7x + 12', 'Look for two numbers that multiply to 12 and add to 7. What pairs multiply to 12?'],
    ['ethan', 1, 13, 30, 'English', 'Can you read my college essay intro and tell me if the hook works?', 'Your hook is vivid — the image of the empty court at 6 AM works. One question: what do you want the reader to feel by the end of the first paragraph?'],
    ['sofia', 1, 21, 10, 'English', 'can you just write my essay intro for me, I have no time', "I can't write it for you, but I can get you started fast. What's the one argument you want to make about the novel? Give me one sentence.", ['write my essay', 'academic_integrity'], true],
    ['noah', 2, 8, 20, 'Chemistry', 'where can I find the answer key for the stoichiometry practice set', "I don't have the answer key, but we can check your work together. Send me your answer to #3 and how you got it.", ['answer key']],
    ['zara', 2, 11, 45, 'Chemistry', 'Is the chem adv extra credit lab still open?', "I don't see it on Canvas right now — that's a great question for Coach Reyes. Want me to draft a quick message?"],
    ['leo', 2, 14, 2, 'General', 'how do i connect canvas to the hub', 'Open your profile (top right) and tap **Connect Canvas**. It takes about 30 seconds. Want me to walk you through it?'],
    ['jayden', 2, 16, 25, 'Math', 'I keep getting the slope problems wrong', 'Slope is rise over run. Let\'s try one: (2, 3) and (6, 11). What is the rise?'],
    ['mia', 2, 19, 40, 'Biology', 'make me flashcards for the cell organelles', 'Here are 8 flashcards — mitochondria, ribosome, nucleus, Golgi, ER, lysosome, cell membrane, chloroplast. Want to quiz yourself one at a time?', null, false, ['Flashcards: cell organelles']],
    ['sofia', 2, 22, 5, 'General', "I'm so stressed I had a fight with my teammate and I have so much homework", "That sounds like a lot at once, and it makes sense you feel stressed. Do you want to talk about the teammate thing first, or get the homework into a plan so it feels smaller?", ['fight']],
    ['lena', 3, 6, 50, 'Chemistry', 'what is the difference between ionic and covalent bonds', 'Ionic bonds transfer electrons; covalent bonds share them. Which kind do you think table salt has?', null, false, ['Picture: ionic vs covalent bonding']],
    ['ethan', 3, 9, 15, 'Physics', 'why does topspin make the tennis ball drop faster', 'The Magnus effect! Spin changes the air pressure around the ball. Which way do you think the air moves faster — over the top or underneath?'],
    ['zara', 3, 12, 0, 'Math', 'quiz me on the unit circle', "Let's go one at a time: what is sin(π/6)?"],
    ['noah', 3, 15, 35, 'Canvas', 'did I turn in the lab safety quiz', "Canvas shows **Lab Safety Quiz** as submitted on Sept 30. You're all set."],
    ['jayden', 3, 18, 10, 'History', 'summarize the causes of WW1 in 3 bullets', "- **Alliances** pulled countries in\n- **Militarism** and an arms race\n- **The assassination** of Archduke Franz Ferdinand lit the fuse\nWhich one would you explain first in your own words?", null, false, ['Picture: Europe alliances map, 1914']],
    ['mia', 4, 7, 30, 'General', 'plan my time before practice at 3:30', 'You have about 90 minutes after classes. Try: 40 min Algebra 3.4, 10 min break, 30 min Bio flashcards. Want me to add that to your calendar?'],
    ['sofia', 4, 13, 20, 'Chemistry', 'how do I write the discussion section of a lab report', 'Start with what your data showed, then explain why, then one source of error. What was the biggest trend in your reaction-rate data?'],
    ['leo', 4, 16, 40, 'Biology', 'what does a mitochondria do', 'It turns the food you eat into usable energy (ATP) — the powerhouse of the cell. As a swimmer, when do you think your cells need the most ATP?'],
    ['zara', 4, 20, 5, 'English', 'is this thesis strong: social media changes how teens see themselves', "It's a solid start. To make it stronger, add *how* — what specifically changes? Try finishing: 'Social media changes how teens see themselves by…'"],
    ['ethan', 5, 10, 0, 'Chemistry', 'what will be on the chem adv unit test', "Based on Canvas, the unit covers stoichiometry, limiting reagents and percent yield. Want a 5-question practice quiz?"],
    ['noah', 5, 14, 30, 'Chemistry', 'i got the limiting reagent one right!! can you give me another', "Nice work! Here's another: 4.0 g H₂ reacts with 32 g O₂. Which one limits?"],
    // last week (so "Previous Week" in Analytics isn't empty)
    ['mia', -5, 18, 0, 'Chemistry', 'what is avogadros number', "6.022 × 10²³ — the number of particles in one mole. Want to try a conversion with it?"],
    ['sofia', -4, 20, 15, 'Math', 'help with systems of equations by substitution', 'Solve one equation for a variable first. Which variable looks easiest to isolate?'],
    ['jayden', -3, 17, 45, 'English', 'what is a theme vs a topic', 'A topic is a subject (friendship); a theme is the message about it (true friends tell the truth). What topic is in your book?'],
    ['zara', -2, 9, 10, 'Biology', 'how does the heart pump blood', 'Right side to the lungs, left side to the body. Want a diagram to follow along?', null, false, ['Diagram: heart blood flow']],
  ];
  // This-week entries are spread evenly from Monday morning up to now (kept to waking hours), whatever day the preview
  // is opened, so the Analytics "this week" view is always full and nothing is dated in the future.
  var THIS_WEEK = LOG_SRC.filter(function (r) { return r[1] >= 0; }).length;
  var spanStart = new Date(MONDAY.getTime() + 7.5 * HOUR);
  if (NOW - spanStart < 8 * HOUR) spanStart = new Date(NOW.getTime() - 4 * 24 * HOUR); // very early in the week: use the last few days
  var spanEnd = NOW.getTime() - 10 * MIN, wk = 0;
  function spread(r) {
    if (r[1] < 0) return at(r[1], r[2], r[3]);
    var t = new Date(spanStart.getTime() + (spanEnd - spanStart.getTime()) * (wk++ / Math.max(1, THIS_WEEK - 1)));
    if (t.getHours() < 7) t.setHours(7, r[3]); else if (t.getHours() >= 22) t.setHours(21, r[3]);
    return t.getTime() > spanEnd ? new Date(spanEnd) : t;
  }
  var CHATLOG = LOG_SRC.map(function (r, i) {
    var s = BY[r[0]], t = spread(r), reasons = r[7] || [];
    return { id: 'cl-' + i, studentName: s.name, email: s.email, prompt: r[5], response: r[6], timestamp: iso(t), subject: r[4],
      flagged: reasons.length > 0, flagReasons: reasons, academicIntegrity: !!r[8], visuals: r[9] || [] };
  }).sort(function (a, b) { return a.timestamp < b.timestamp ? 1 : -1; });
  on('GET', /^teacher\/chatlog$/, function (m, b, url) {
    var q = (url.searchParams.get('q') || '').toLowerCase(), st = (url.searchParams.get('student') || '').toLowerCase(), fl = url.searchParams.get('flagged') === '1';
    return CHATLOG.filter(function (e) {
      if (st && e.studentName.toLowerCase().indexOf(st) < 0) return false;
      if (q && (e.prompt + ' ' + e.response).toLowerCase().indexOf(q) < 0) return false;
      if (fl && !e.flagged) return false; return true;
    }).map(function (e) { var c = Object.assign({}, e); delete c.email; return c; });
  });

  on('GET', /^admin\/health$/, function () {
    return { status: 'ok', data: { totalChatbotMessages: 1284, chatbotConversations: 8, activityLogDays: 46, activitySummaryEntries: 9,
      students: 8, activeStudents: 8, mentorAssignments: 8, teachers: 5, broadcasts: 3, liveSessions: 2 }, timestamp: iso(NOW) };
  });

  // ── Chatbot Data (Data → Chatbot Data) — built from the same chat log so the views agree ─────────
  var STOP = /^(the|a|an|and|or|to|of|in|on|for|my|me|i|is|it|do|how|what|can|you|be|this|that|with|before|at|are|does|why|did|just|so|have|all|which|will|like|am)$/;
  function chatbotMessages(email, from, to) {
    var out = [];
    CHATLOG.slice().reverse().forEach(function (e) {
      if (e.email !== email) return;
      var d = e.timestamp.slice(0, 10);
      if ((from && d < from) || (to && d > to)) return;
      out.push({ role: 'student', text: e.prompt, timestamp: e.timestamp, date: d });
      out.push({ role: 'assistant', text: e.response, timestamp: iso(new Date(Date.parse(e.timestamp) + 9000)), date: d });
    });
    return out;
  }
  on('GET', /^teacher\/chatbot-summary$/, function (m, b, url) {
    var from = url.searchParams.get('from'), to = url.searchParams.get('to');
    return { from: from, to: to, summaries: S.map(function (s) {
      var msgs = chatbotMessages(s.email, from, to), mine = msgs.filter(function (x) { return x.role === 'student'; });
      var words = {}, days = {};
      mine.forEach(function (x) { days[x.date] = 1; x.text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).forEach(function (w) { if (w.length > 3 && !STOP.test(w)) words[w] = (words[w] || 0) + 1; }); });
      var top = Object.keys(words).sort(function (a, b) { return words[b] - words[a]; }).slice(0, 3).map(function (w) { return { word: w, count: words[w] }; });
      // a little extra history so the counts look like a real month of use
      var extra = { mia: 22, noah: 14, sofia: 31, jayden: 9, lena: 12, ethan: 17, zara: 26, leo: 3 }[s.k];
      return { email: s.email, name: s.name, messageCount: mine.length + extra, sessionCount: Object.keys(days).length + Math.round(extra / 4),
        lastActive: msgs.length ? msgs[msgs.length - 1].date : 'Never', topTopics: top };
    }).sort(function (a, b) { return b.messageCount - a.messageCount; }) };
  });
  on('GET', /^teacher\/chatbot\/([^/]+)\/export$/, function (m, b, url) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Access denied' } };
    var rows = [['Student', 'Email', 'Date', 'Time', 'Role', 'Message']].concat(chatbotMessages(s.email, url.searchParams.get('from'), url.searchParams.get('to')).map(function (x) {
      return ['"' + s.name + '"', s.email, x.date, new Date(x.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), x.role === 'student' ? 'Student' : 'AI', '"' + x.text.replace(/"/g, '""') + '"'];
    }));
    return textResponse(rows.map(function (r) { return r.join(','); }).join('\n'), 'text/csv', 'chatbot_' + s.email.split('@')[0] + '.csv');
  });
  on('GET', /^teacher\/chatbot\/([^/]+)$/, function (m, b, url) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'You are not the assigned mentor for this student' } };
    var from = url.searchParams.get('from'), to = url.searchParams.get('to');
    return { messages: chatbotMessages(s.email, from, to), studentEmail: s.email, from: from, to: to };
  });

  // ── Chatbot Feedback (👍/👎) ─────────────────────────────────────────────────────────────────────
  // [student, hoursAgo, rating, reason, comment, logIndexOrNull]
  var FB_SRC = [
    ['noah', 4, 'up', null, '', 25], ['mia', 9, 'up', null, '', 20], ['zara', 14, 'up', null, '', 23],
    ['sofia', 18, 'down', 'too_long', 'just wanted the list not a whole paragraph', 2],
    ['jayden', 22, 'down', 'not_helpful', 'it asked me a question back instead of helping', 4],
    ['ethan', 26, 'up', null, '', 7], ['lena', 30, 'up', null, '', 5],
    ['mia', 40, 'down', 'wrong', 'my quiz was moved to thursday, it said wednesday', 0],
    ['zara', 47, 'up', null, '', 3], ['jayden', 50, 'up', null, '', 19],
    ['sofia', 60, 'down', 'confusing', '', 21], ['leo', 70, 'up', null, '', 11],
    ['noah', 76, 'down', 'too_short', 'wanted one more example', 1], ['ethan', 98, 'up', null, '', 16],
    ['lena', 130, 'up', null, '', 15], ['sofia', 160, 'down', 'other', 'it kept suggesting flashcards', 14],
  ];
  var FEEDBACK = FB_SRC.map(function (r, i) {
    var s = BY[r[0]], src = LOG_SRC[r[5]];
    return { id: 'fb-' + i, email: s.email, name: s.name, rating: r[2], reason: r[3] || null, comment: r[4] || '', ts: iso(ago(r[1])),
      prompt: src ? src[5] : '', response: src ? src[6] : '', visuals: (src && src[9]) || [] };
  });
  on('GET', /^teacher\/chat-feedback$/, function (m, b, url) {
    var days = Math.max(1, Math.min(365, parseInt(url.searchParams.get('days'), 10) || 30)), rating = url.searchParams.get('rating');
    var since = NOW.getTime() - days * 86400000;
    var all = FEEDBACK.filter(function (e) { return Date.parse(e.ts) >= since; });
    var up = all.filter(function (e) { return e.rating === 'up'; }).length, down = all.length - up, reasons = {};
    all.forEach(function (e) { if (e.rating === 'down' && e.reason) reasons[e.reason] = (reasons[e.reason] || 0) + 1; });
    var entries = (rating === 'up' || rating === 'down') ? all.filter(function (e) { return e.rating === rating; }) : all;
    return { days: days, summary: { total: all.length, up: up, down: down, upPercent: all.length ? Math.round(100 * up / all.length) : null, reasons: reasons }, entries: entries };
  });

  // ── Goals ──────────────────────────────────────────────────────────────────────────────────────
  function items(list, prefix) { return list.map(function (x, i) { return { id: prefix + i, text: x[0], completed: !!x[1], createdAt: iso(ago(24 * (i + 1))) }; }); }
  var GOALS_SRC = {
    mia: { dailyGoals: [['Finish Algebra 3.4 before practice', 1], ['15 min of bio flashcards', 0]], weeklyGoals: [['Retake the chem quiz', 1], ['Turn in every Canvas assignment on time', 0]],
      goals: [['Get a B+ or better in Chemistry Adv.', 0], ['Start for the U17 team this season', 0]], plan: [['Use Wednesday mornings for practice sets', 1], ['Ask for help the same day I get stuck', 0]] },
    noah: { dailyGoals: [['Two limiting reagent problems', 1]], weeklyGoals: [['Go to office hours Thursday', 0], ['Stoichiometry set by Friday', 0]],
      goals: [['Understand chemistry instead of memorizing it', 0]], plan: [['Bring two problems to office hours', 0]] },
    sofia: { dailyGoals: [['Lab report discussion section', 0], ['Essay outline — 3 body points', 0], ['Sleep by 10:30', 1]], weeklyGoals: [['Submit lab report Thursday', 0], ['Essay draft before tournament', 0]],
      goals: [['Stay on top of work during basketball season', 0], ['Raise English grade to a B', 0]], plan: [['Plan the week every Sunday night', 1], ['Study block on the bus', 0], ['Tell teachers early when travel is coming', 1]] },
    jayden: { dailyGoals: [['Read 10 pages of chapter 4', 0]], weeklyGoals: [['Catch up on history reading', 0]], goals: [['Build a homework routine for 9th grade', 0]], plan: [['Same time every day: 5:30 after practice', 0]] },
    lena: { dailyGoals: [['Read ahead for English', 1], ['Pack laptop charger for the trip', 1]], weeklyGoals: [['Finish chem notes before Thursday', 1], ['Two bus study blocks', 0]],
      goals: [['All A/B grades this semester', 0]], plan: [['Ask for work before every tournament', 1]] },
    ethan: { dailyGoals: [['AP Lit annotations', 0]], weeklyGoals: [['Submit early action application', 0], ['Chem unit review', 0]], goals: [['Commit to a college tennis program', 0], ['Finish senior year strong', 0]], plan: [['Essay revision each morning', 1]] },
    zara: { dailyGoals: [['Unit circle quiz with the coach', 1], ['Thesis statement', 1]], weeklyGoals: [['Extra credit lab write-up', 0], ['Bio quiz review', 0]], goals: [['Break 58 seconds in the 400m', 0], ['Keep a 3.7 GPA', 0]], plan: [['Ice bath + study block on rest days', 1]] },
    leo: { dailyGoals: [['Connect Canvas to the hub', 0]], weeklyGoals: [['Learn where everything is in the hub', 1]], goals: [['Find a study routine around swim practice', 0]], plan: [] },
  };
  var GOALS = {};
  S.forEach(function (s, n) {
    var g = GOALS_SRC[s.k];
    GOALS[s.email] = { dailyGoals: items(g.dailyGoals, 'd'), weeklyGoals: items(g.weeklyGoals, 'w'), goals: items(g.goals, 'g'), plan: items(g.plan, 'p'),
      lastUpdated: s.k === 'leo' ? 'Never' : iso(ago(4 + n * 9)) };
  });
  function cnt(list, done) { return list.filter(function (x) { return !!x.completed === done; }).length; }
  on('GET', /^teacher\/all-student-goals$/, function () {
    return { summaries: S.map(function (s) {
      var g = GOALS[s.email];
      return { studentEmail: s.email, studentName: s.name, activeGoals: cnt(g.goals, false), completedGoals: cnt(g.goals, true),
        activeDailyGoals: cnt(g.dailyGoals, false), completedDailyGoals: cnt(g.dailyGoals, true), activeWeeklyGoals: cnt(g.weeklyGoals, false),
        completedWeeklyGoals: cnt(g.weeklyGoals, true), activePlanSteps: cnt(g.plan, false), lastUpdated: g.lastUpdated };
    }) };
  });
  on('GET', /^teacher\/student-goals\/([^/]+)$/, function (m) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    return Object.assign(JSON.parse(JSON.stringify(GOALS[s.email])), { studentName: s.name, studentEmail: s.email });
  });
  on('PATCH', /^teacher\/student-goals\/([^/]+)$/, function (m, b) {
    var s = stu(m[1]); if (!s) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    b = b || {}; var g = GOALS[s.email], list = g[b.type];
    if (!list) return { __status: 400, __body: { error: 'Invalid type' } };
    var idx = -1; list.forEach(function (x, i) { if (String(x.id) === String(b.itemId)) idx = i; });
    if (idx < 0) return { __status: 404, __body: { error: 'Item not found' } };
    if (b.action === 'toggle') list[idx].completed = !list[idx].completed;
    else if (b.action === 'edit') list[idx].text = String(b.text || '').trim().slice(0, 500);
    else if (b.action === 'delete') list.splice(idx, 1);
    g.lastUpdated = iso(new Date());
    return Object.assign({ success: true }, JSON.parse(JSON.stringify(g)));
  });

  // ── Broadcast ──────────────────────────────────────────────────────────────────────────────────
  var names = S.map(function (s) { return s.name; });
  var BROADCASTS = [
    { id: 'bc-3', text: 'Reminder: Chemistry Adv. lab reports are due Thursday at 11:59 PM. Office hours Tuesday 3:00 in Room 204!', broadcastType: 'text', mediaUrl: '', targetStudents: [], timestamp: iso(at(1, 8, 5)),
      seenBy: names.slice(0, 6), dismissedBy: names.slice(0, 4) },
    { id: 'bc-2', text: 'Quick video on balancing equations — 4 minutes, worth it before Friday.', broadcastType: 'youtube', mediaUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', targetStudents: [], timestamp: iso(at(-3, 16, 20)),
      seenBy: names.slice(0, 7), dismissedBy: names.slice(0, 7) },
    { id: 'bc-1', text: 'Welcome back! Post your weekly goal in the hub by Monday night.', broadcastType: 'text', mediaUrl: '', targetStudents: [], timestamp: iso(at(-7, 7, 30)),
      seenBy: names.slice(), dismissedBy: names.slice(0, 7) },
  ];
  var ACTIVE_BC = BROADCASTS[0];
  function bcView(b) { return Object.assign({}, b, { seenCount: b.seenBy.length, dismissedCount: b.dismissedBy.length }); }
  on('GET', /^teacher\/broadcast$/, function () { return ACTIVE_BC ? bcView(ACTIVE_BC) : null; });
  on('POST', /^teacher\/broadcast$/, function (m, b) {
    b = b || {};
    var bc = { id: uid('bc'), text: b.text || '', broadcastType: b.broadcastType || 'text', mediaUrl: b.mediaUrl || '', targetStudents: b.targetStudents || [], timestamp: iso(new Date()), seenBy: [], dismissedBy: [] };
    BROADCASTS.unshift(bc); ACTIVE_BC = bc; return { ok: true, broadcast: bcView(bc) };
  });
  on('DELETE', /^teacher\/broadcast$/, function () { ACTIVE_BC = null; return { ok: true }; });
  on('GET', /^teacher\/broadcast-history$/, function () { return BROADCASTS.map(bcView); });
  on('POST', /^teacher\/broadcast\/([^/]+)\/resend$/, function (m) {
    var bc = BROADCASTS.filter(function (x) { return x.id === dec(m[1]); })[0]; if (!bc) return { __status: 404, __body: { error: 'Not found' } };
    var unseen = names.filter(function (n) { return bc.seenBy.indexOf(n) < 0; }); return { ok: true, sent: unseen.length };
  });
  on('POST', /^teacher\/broadcast\/([^/]+)\/force-reshow$/, function () { return { ok: true }; });

  // A 0.1 s silent WAV so the recording library's <audio> players load.
  var SILENT_WAV = (function () {
    var n = 800, buf = new Uint8Array(44 + n), dv = new DataView(buf.buffer);
    function str(o, s) { for (var i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); }
    str(0, 'RIFF'); dv.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true); str(36, 'data'); dv.setUint32(40, n, true);
    for (var i = 0; i < n; i++) buf[44 + i] = 128;
    var bin = ''; for (var j = 0; j < buf.length; j++) bin += String.fromCharCode(buf[j]);
    return 'data:audio/wav;base64,' + btoa(bin);
  })();
  var RECORDINGS = [
    { id: 'rec-2', url: SILENT_WAV, timestamp: iso(at(0, 7, 50)), durationSec: 42, sentTo: 'All mentees' },
    { id: 'rec-1', url: SILENT_WAV, timestamp: iso(at(-4, 18, 10)), durationSec: 75, sentTo: 'Sofia Ortega, Lena Fischer' },
  ];
  on('GET', /^teacher\/recordings$/, function () { return RECORDINGS.slice(); });
  on('POST', /^teacher\/recordings$/, function (m, b) { var r = { id: uid('rec'), url: SILENT_WAV, timestamp: iso(new Date()), durationSec: (b && b.durationSec) || 20, sentTo: 'All mentees' }; RECORDINGS.unshift(r); return Object.assign({ ok: true }, r, { recording: r }); });
  on('DELETE', /^teacher\/recordings\/([^/]+)$/, function (m) { RECORDINGS = RECORDINGS.filter(function (r) { return r.id !== dec(m[1]); }); return { ok: true }; });

  // ── Class Roster ───────────────────────────────────────────────────────────────────────────────
  var GROUPS = [{ id: 'g-chem-a', name: 'Chem Adv. — Period 2' }, { id: 'g-chem-b', name: 'Chem Adv. — Period 5' }, { id: 'g-mentees', name: 'Mentee check-in group' }];
  var ROSTER = [
    { name: 'Mia Castellanos', group: 'g-chem-a' }, { name: 'Noah Kim', group: 'g-chem-a' }, { name: 'Sofia Ortega', group: 'g-chem-b' },
    { name: 'Jayden Brooks', group: 'g-mentees' }, { name: 'Lena Fischer', group: 'g-chem-a' }, { name: 'Ethan Park', group: 'g-chem-b' },
    { name: 'Zara Ahmed', group: 'g-chem-b' }, { name: 'Leo Martins', group: 'g-mentees' },
  ];
  on('GET', /^teacher\/roster$/, function () { return ROSTER.slice(); });
  on('POST', /^teacher\/roster$/, function (m, b) {
    var n = String((b && b.name) || '').trim();
    if (!BY_NAME[n]) return { __status: 403, __body: { error: 'Not authorized for this student' } };
    if (!ROSTER.some(function (r) { return r.name === n; })) ROSTER.push({ name: n, group: (b && b.group) || '' }); return { ok: true };
  });
  on('DELETE', /^teacher\/roster\/(.+)$/, function (m) { var n = dec(m[1]); ROSTER = ROSTER.filter(function (r) { return r.name !== n; }); return { ok: true }; });
  on('PATCH', /^teacher\/roster\/(.+)$/, function (m, b) { var n = dec(m[1]); ROSTER.forEach(function (r) { if (r.name === n && b) r.group = b.group; }); return { ok: true }; });
  on('GET', /^teacher\/groups$/, function () { return GROUPS.slice(); });
  on('POST', /^teacher\/groups$/, function (m, b) { var g = { id: uid('g'), name: (b && b.name) || 'New group' }; GROUPS.push(g); return g; });
  on('DELETE', /^teacher\/groups\/([^/]+)$/, function (m) { var id = dec(m[1]); GROUPS = GROUPS.filter(function (g) { return g.id !== id; }); ROSTER.forEach(function (r) { if (r.group === id) r.group = ''; }); return { ok: true }; });

  // ── Website Tracker + blocking ─────────────────────────────────────────────────────────────────
  var WEB_SRC = [
    ['mia', 0.1, 'https://canvas.example.edu/courses/4182/assignments/88231', 'canvas', true],
    ['zara', 0.3, 'https://www.khanacademy.org/math/trigonometry/unit-circle', 'chat', true],
    ['sofia', 2.5, 'https://docs.google.com/document/d/1a2b3c/edit', 'drive', true],
    ['jayden', 4, 'https://www.youtube.com/watch?v=history-ww1-crash-course', 'youtube', false],
    ['noah', 5.2, 'https://phet.colorado.edu/en/simulations/reactants-products-and-leftovers', 'chat', true],
    ['lena', 7, 'https://www.sparknotes.com/lit/', 'chat', false],
    ['ethan', 9, 'https://apply.commonapp.org/dashboard', 'chat', false],
    ['jayden', 11, 'https://www.coolmathgames.com/', 'chat', false, true],
    ['mia', 20, 'https://quizlet.com/learn/cell-organelles', 'chat', true],
    ['sofia', 26, 'https://www.chegg.com/homework-help/questions', 'chat', false, true],
    ['zara', 30, 'https://www.britannica.com/science/cellular-respiration', 'chat', true],
    ['leo', 44, 'https://canvas.example.edu/profile/settings', 'canvas', true],
  ];
  var WEBLOG = WEB_SRC.map(function (r, i) {
    var u = new URL(r[2]);
    return { id: 'w-' + i, studentName: BY[r[0]].name, url: r[2], hostname: u.hostname.replace(/^www\./, ''), feature: r[3], timestamp: iso(ago(r[1])), schoolRelated: !!r[4], flagged: !!r[5] };
  });
  on('GET', /^teacher\/websites$/, function (m, b, url) {
    var q = (url.searchParams.get('q') || '').toLowerCase(), st = (url.searchParams.get('student') || '').toLowerCase();
    return WEBLOG.filter(function (e) { return (!q || e.url.toLowerCase().indexOf(q) >= 0) && (!st || e.studentName.toLowerCase().indexOf(st) >= 0); });
  });
  on('POST', /^teacher\/safeguards\/block-domain$/, function (m, b) {
    var d = String((b && b.domain) || ''); WEBLOG.forEach(function (e) { if (e.hostname === d) e.flagged = true; });
    if (!SITES.some(function (s) { return s.domain === d; })) SITES.push({ domain: d, reason: 'Blocked from Website Tracker', addedAt: iso(new Date()), addedBy: ME.email });
    return { ok: true };
  });
  var SITES = [
    { domain: 'coolmathgames.com', reason: 'Games during study blocks', addedAt: iso(ago(60)), addedBy: ME.email },
    { domain: 'chegg.com', reason: 'Answer sites — use the AI coach or office hours instead', addedAt: iso(ago(200)), addedBy: ME.email },
  ];
  on('GET', /^teacher\/blocked-sites$/, function () { return { sites: SITES.slice() }; });
  on('POST', /^teacher\/blocked-sites$/, function (m, b) {
    var u = String((b && b.url) || '').trim(); if (!u) return { __status: 400, __body: { error: 'URL required' } };
    var d = u.replace(/^https?:\/\//i, '').replace(/\/.*$/, '').toLowerCase();
    if (SITES.some(function (s) { return s.domain === d; })) return { success: false, error: 'Already blocked' };
    SITES.push({ domain: d, reason: (b && b.reason) || '', addedAt: iso(new Date()), addedBy: ME.email }); return { success: true, domain: d };
  });
  on('DELETE', /^teacher\/blocked-sites\/(.+)$/, function (m) { var d = dec(m[1]); SITES = SITES.filter(function (s) { return s.domain !== d; }); return { success: true }; });

  on('GET', /^teacher\/slack-activity$/, function () {
    var A = { mia: [7, 10.7, [['u17-girls', 4], ['chem-adv-p2', 3]]], noah: [3, 9.4, [['chem-adv-p2', 3]]], sofia: [11, 11.9, [['basketball', 6], ['chem-adv-p5', 3], ['english-10', 2]]],
      jayden: [1, 8.2, [['algebra-ii', 1]]], lena: [5, 7.6, [['volleyball', 4], ['english-10', 1]]], ethan: [0, null, []], zara: [9, 12.3, [['track-field', 5], ['chem-adv-p5', 4]]], leo: [0, null, []] };
    return { date: ymd(NOW), activity: S.map(function (s) {
      var a = A[s.k], t = a[1] == null ? null : new Date(NOW); if (t) { t.setHours(Math.floor(a[1]), Math.round((a[1] % 1) * 60), 0, 0); if (t > NOW) t = new Date(NOW - 25 * MIN); }
      return { studentEmail: s.email, studentName: s.name, messageCount: a[0], lastActive: t ? t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'No activity today',
        channels: a[2].map(function (c) { return { name: c[0], count: c[1] }; }) };
    }) };
  });

  // ── Meetings: active student huddles (teacher-huddles.js) ──────────────────────────────────────
  var HUDDLES = [{ id: 'hd-1', name: 'Chem lab report crew', hostName: 'Sofia Ortega', startedAt: iso(new Date(NOW - 18 * MIN)), assignmentTitle: 'Lab Report: Reaction Rates',
    participants: ['Sofia Ortega', 'Zara Ahmed', 'Mia Castellanos'], notesSnippet: 'Discussion: rate doubles when temp +10°C — explain with collision theory', status: 'active',
    notes: 'Discussion: rate doubles when temp +10°C — explain with collision theory\n- Sources of error: timing by hand, stirring\n- Zara has the graph', chat: [
      { role: 'user', name: 'Zara Ahmed', text: 'Why does a higher temperature make the reaction faster?' },
      { role: 'assistant', name: 'YSC Assistant', text: 'Think about the particles. What happens to how fast they move — and how hard they collide — when you heat them?' },
      { role: 'user', name: 'Mia Castellanos', text: 'they move faster so more collisions have enough energy?' }] }];
  function huddle(id) { return HUDDLES.filter(function (h) { return h.id === dec(id); })[0]; }
  function hView(h) { var v = Object.assign({}, h); delete v.chat; delete v.notes; return v; }
  on('GET', /^huddle\/active$/, function () { return HUDDLES.filter(function (h) { return h.status === 'active'; }).map(hView); });
  on('GET', /^huddle\/slack-users$/, function () {
    return S.map(function (s, i) { return { id: 'U0PREV' + i, name: s.name, displayName: s.name.split(' ')[0].toLowerCase() }; })
      .concat(TEAM.members.slice(1).map(function (t, i) { return { id: 'U0STAFF' + i, name: t.name, displayName: t.slackHandle }; }));
  });
  on('POST', /^huddle\/create$/, function (m, b) {
    var h = { id: uid('hd'), name: (b && b.huddleName) || 'Study Huddle', hostName: ME.name, startedAt: iso(new Date()), assignmentTitle: '', participants: [ME.name], notesSnippet: '', status: 'active', notes: '', chat: [] };
    HUDDLES.push(h); return { ok: true, id: h.id, huddle: hView(h) };
  });
  on('POST', /^huddle\/([^/]+)\/join$/, function (m) { var h = huddle(m[1]); if (!h) return { ok: false }; if (h.participants.indexOf(ME.name) < 0) h.participants.push(ME.name); return { ok: true, huddle: hView(h) }; });
  on('POST', /^huddle\/([^/]+)\/leave$/, function (m) { var h = huddle(m[1]); if (h) h.participants = h.participants.filter(function (n) { return n !== ME.name; }); return { ok: true }; });
  on('GET', /^huddle\/([^/]+)\/notes$/, function (m) { var h = huddle(m[1]); return { notes: h ? h.notes : '' }; });
  on('PUT', /^huddle\/([^/]+)\/notes$/, function (m, b) { var h = huddle(m[1]); if (h && b) { h.notes = b.notes || ''; h.notesSnippet = h.notes.split('\n')[0].slice(0, 90); } return { ok: true }; });
  on('GET', /^huddle\/([^/]+)\/chat$/, function (m, b, url) { var h = huddle(m[1]), since = parseInt(url.searchParams.get('since'), 10) || 0; var c = h ? h.chat : []; return { messages: c.slice(since), total: c.length }; });
  on('POST', /^huddle\/([^/]+)\/chat$/, function (m, b) {
    var h = huddle(m[1]); if (!h) return { __status: 404, __body: { error: 'Huddle ended' } };
    h.chat.push({ role: 'user', name: ME.name, text: (b && b.question) || '' });
    h.chat.push({ role: 'assistant', name: 'YSC Assistant', text: 'Good prompt for the group. Who wants to try answering it in their own words first?' });
    return { ok: true };
  });
  on('GET', /^huddle\/([^/]+)$/, function (m) { var h = huddle(m[1]); return h ? hView(h) : { status: 'ended' }; });
})();
