/* Sample data for the YSC Hub preview. Every student, teacher and number here is fictional. */
(function () {
  var P = window.__YSC_PREVIEW__, on = P.on, D = P.dates;
  if (P.role !== 'student') return;
  // The one-time "Home is your new starting point" tip would cover the preview's first screen.
  try { localStorage.setItem('ysc-home-intro-seen', '1'); } catch (e) {}
  // 📎 uploads: nothing leaves the browser; the file is acknowledged by name so the chat shows it attached.
  var upN = 0;
  on('POST', /^study-uploads(\/drive)?$/, function (m, body) {
    var name = (body && (body.name || body.fileName)) || 'study-notes.pdf';
    var isImg = /\.(png|jpe?g|gif|webp)$/i.test(name);
    return { ok: true, upload: { id: 'preview-upload-' + (++upN), name: name, kind: isImg ? 'image' : 'text', chars: isImg ? 0 : 1840, pages: isImg ? null : 2 } };
  });
  on('DELETE', /^study-uploads\/[^/]+$/, function () { return { ok: true }; });
  // ── who is signed in ────────────────────────────────────────────────────────────────────────────
  on('GET', /^session\/me$/, function () {
    return { authenticated: true, name: 'Mia Castellanos', email: 'mia.castellanos@example.edu', photo: '', isFirstLogin: false,
      hasGoogleToken: true, slackAutoLinked: true,
      services: { google: true, canvas: true, canvasUser: 'Mia Castellanos', canvasNeedsRescope: false, slack: true,
        slackUser: 'mia.castellanos', slackUserId: 'U0PREVIEW1', slackHasUserToken: true, brainBreak: false } };
  });
})();
