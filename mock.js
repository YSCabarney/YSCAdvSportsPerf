/* YSC Hub preview — a fake back end for the REAL Student, Teacher and Admin hub pages.
 * The pages, styles and scripts in this folder are copies of the live hub's front end; this file answers their
 * /api/... requests with sample data (every person here is fictional) and stands in for Socket.IO and server events.
 * Nothing is sent anywhere: no request leaves the browser. */
(function () {
  'use strict';
  var ROLE = (document.currentScript && document.currentScript.dataset.role) || 'student';
  window.__YSC_PREVIEW__ = { role: ROLE, unknown: [] };

  // ── dates relative to "now", so the sample week is always this week ──────────────────────────────
  var NOW = new Date();
  function iso(d) { return new Date(d).toISOString(); }
  function addDays(n, h, m) { var d = new Date(NOW); d.setDate(d.getDate() + n); d.setHours(h == null ? 23 : h, m == null ? 59 : m, 0, 0); return d; }
  function ymd(d) { var x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }

  var R = []; // routes: [method, RegExp on the path after /api/, handler(match, body, url) -> data | {__status, __body}]
  function on(method, re, fn) { R.push([method, re, fn]); }
  window.__YSC_PREVIEW__.on = on;
  window.__YSC_PREVIEW__.dates = { NOW: NOW, iso: iso, addDays: addDays, ymd: ymd };

  function json(data, status) {
    return new Response(JSON.stringify(data), { status: status || 200, headers: { 'content-type': 'application/json' } });
  }
  var realFetch = window.fetch ? window.fetch.bind(window) : null;
  window.fetch = function (input, init) {
    init = init || {};
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = (init.method || (input && input.method) || 'GET').toUpperCase();
    var u; try { u = new URL(url, location.href); } catch (e) { return realFetch(input, init); }
    var i = u.pathname.indexOf('/api/');
    if (i < 0 || u.origin !== location.origin) return realFetch(input, init);
    var path = u.pathname.slice(i + 5);
    var body = null; try { body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : init.body; } catch (e) { body = init.body; }
    for (var k = 0; k < R.length; k++) {
      var r = R[k];
      if (r[0] !== '*' && r[0] !== method) continue;
      var m = path.match(r[1]);
      if (!m) continue;
      var out = r[2](m, body, u);
      if (out instanceof Response) return Promise.resolve(out);
      if (out && out.__status) return Promise.resolve(json(out.__body || {}, out.__status));
      return new Promise(function (res) { setTimeout(function () { res(json(out === undefined ? {} : out)); }, 60); });
    }
    window.__YSC_PREVIEW__.unknown.push(method + ' ' + path);
    return Promise.resolve(json(method === 'GET' ? [] : { ok: true }));
  };

  // Server events + Socket.IO: quiet stand-ins (the preview has no live server).
  function FakeES() { this.readyState = 1; var self = this; setTimeout(function () { self.onopen && self.onopen({}); }, 0); }
  FakeES.prototype.addEventListener = function () {};
  FakeES.prototype.removeEventListener = function () {};
  FakeES.prototype.close = function () { this.readyState = 2; };
  window.EventSource = FakeES;
  var sock = { id: 'preview', connected: true, on: function () { return sock; }, once: function () { return sock; }, off: function () { return sock; },
    emit: function () { return sock; }, disconnect: function () {}, connect: function () { return sock; }, io: { on: function () {} } };
  window.io = function () { return sock; };
  if (navigator.sendBeacon) navigator.sendBeacon = function () { return true; };

  // Sign in/out, "Connect Canvas/Slack" and other server pages don't exist in the preview: cancel those navigations
  // (Navigation API, where the browser has it) and say so, instead of landing on a broken page.
  function previewNote(text) {
    var n = document.getElementById('ysc-preview-note');
    if (!n) {
      n = document.createElement('div'); n.id = 'ysc-preview-note'; n.setAttribute('role', 'status');
      n.style.cssText = 'position:fixed;z-index:2147483001;left:50%;top:18px;transform:translateX(-50%);background:#14141a;color:#fff;' +
        'padding:10px 16px;border-radius:12px;font:600 13px/1.4 "DM Sans",system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.25);max-width:90vw;text-align:center;';
      document.body.appendChild(n);
    }
    n.textContent = text; n.hidden = false;
    clearTimeout(previewNote.t); previewNote.t = setTimeout(function () { n.hidden = true; }, 3200);
  }
  window.__YSC_PREVIEW__.note = previewNote;
  // Exports and other server files open in a new tab, which the fake fetch can't answer.
  var realOpen = window.open;
  window.open = function (url) {
    try {
      var to = new URL(url, location.href);
      if (to.origin === location.origin && to.pathname.indexOf('/api/') >= 0) { previewNote('Downloads and exports aren\u2019t part of this preview.'); return null; }
    } catch (e) {}
    return realOpen.apply(window, arguments);
  };
  if (window.navigation && window.navigation.addEventListener) {
    window.navigation.addEventListener('navigate', function (e) {
      try {
        var to = new URL(e.destination.url);
        if (to.origin === location.origin && /\/(login|auth|logout)\b|\/teacher\/login/.test(to.pathname) && e.cancelable) {
          e.preventDefault();
          previewNote('That opens a real sign-in or connection page, which isn\u2019t part of this preview.');
        }
      } catch (err) {}
    });
  }
})();
