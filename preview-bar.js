/* Floating Student / Teacher / Admin switch for the YSC Hub preview — sits over the real page without changing its layout. */
(function () {
  var me = document.currentScript, role = me.dataset.role, p = me.dataset.prefix || '';
  var links = [['student', 'Student', p + 'index.html'], ['teacher', 'Teacher', p + 'teacher/index.html'], ['admin', 'Admin', p + 'admin/index.html']];
  var bar = document.createElement('div');
  bar.setAttribute('role', 'navigation'); bar.setAttribute('aria-label', 'Preview: switch hub');
  bar.style.cssText = 'position:fixed;z-index:2147483000;right:14px;bottom:calc(96px + env(safe-area-inset-bottom,0px));display:flex;align-items:center;gap:4px;' +
    'padding:5px;background:#14141a;border-radius:999px;box-shadow:0 4px 18px rgba(0,0,0,.25);font:600 12px/1 "DM Sans",system-ui,sans-serif;';
  var tag = document.createElement('span');
  tag.textContent = 'Preview · sample data'; tag.style.cssText = 'color:#FFD23D;padding:0 8px 0 10px;white-space:nowrap;';
  bar.appendChild(tag);
  links.forEach(function (l) {
    var a = document.createElement('a');
    a.href = l[2]; a.textContent = l[1];
    var on = l[0] === role;
    if (on) a.setAttribute('aria-current', 'page');
    a.style.cssText = 'text-decoration:none;padding:7px 12px;border-radius:999px;' + (on ? 'background:#FFD23D;color:#14141a;' : 'color:#fff;');
    bar.appendChild(a);
  });
  // Phones: the hub has a bottom nav and a chat box at the bottom, so the switch sits top-right under the header instead.
  function fit() {
    var narrow = window.innerWidth < 768;
    bar.style.bottom = narrow ? 'auto' : 'calc(96px + env(safe-area-inset-bottom,0px))';
    bar.style.top = narrow ? 'calc(74px + env(safe-area-inset-top,0px))' : 'auto';
    bar.style.right = narrow ? '8px' : '14px';
    tag.style.display = narrow ? 'none' : '';
    [].forEach.call(bar.querySelectorAll('a'), function (a) { a.style.padding = narrow ? '6px 10px' : '7px 12px'; });
  }
  function place() { document.body.appendChild(bar); fit(); window.addEventListener('resize', fit); }
  if (document.body) place(); else document.addEventListener('DOMContentLoaded', place);
})();
