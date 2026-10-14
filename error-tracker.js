/* YSC Student Hub — Automatic Error Tracker */
'use strict';

(function () {
  const BATCH_DELAY = 3000;  // ms before sending buffered errors
  const SLOW_THRESHOLD = 5000; // ms — panel load is "slow"
  let _queue = [];
  let _timer = null;
  let _browser = '';
  let _device = '';

  // ── Detect browser / device ──────────────────────────────────────────────
  (function detectEnv() {
    const ua = navigator.userAgent;
    if (/Edg\//.test(ua))       _browser = 'Edge';
    else if (/Chrome\//.test(ua)) _browser = 'Chrome';
    else if (/Firefox\//.test(ua)) _browser = 'Firefox';
    else if (/Safari\//.test(ua)) _browser = 'Safari';
    else _browser = 'Other';

    const versionMatch = ua.match(/(Chrome|Firefox|Safari|Edg)\/(\d+)/);
    if (versionMatch) _browser += ' ' + versionMatch[2];

    _device = /Mobi|Android|iPhone|iPad/.test(ua) ? 'Mobile' : 'Desktop';
  })();

  function featureFromPath(path) {
    if (/canvas/i.test(path))   return 'canvas';
    if (/slack/i.test(path))    return 'slack';
    if (/drive|google/i.test(path)) return 'drive';
    if (/calendar/i.test(path)) return 'calendar';
    if (/chat/i.test(path))     return 'chatbot';
    if (/grades/i.test(path))   return 'grades';
    if (/zoom/i.test(path))     return 'zoom';
    if (/timer/i.test(path))    return 'timer';
    if (/auth|session|login/i.test(path)) return 'auth';
    return 'general';
  }

  // The endpoint a report is about, safe to store and group by (incident review 2026-10-12): no query string, and any
  // path segment that identifies something (digits, a UUID, an email) becomes ":id". Slow reports used to carry no
  // endpoint at all, so the admin view said "not recorded".
  function endpointOf(url) {
    let path = String(url || '');
    try { path = new URL(path, window.location.origin).pathname; } catch { path = path.split(/[?#]/)[0]; }
    const isId = seg => /^\d+$|^[0-9a-f-]{16,}$|@|%40/i.test(seg) || (/^[CDGUW][A-Z0-9]{8,}$/.test(seg) && /\d/.test(seg));   // Slack IDs: case-sensitive
    return path.split('/').map(seg => (isId(seg) ? ':id' : seg)).join('/').slice(0, 200);
  }

  function severityFromStatus(status) {
    if (status >= 500) return 'critical';
    if (status >= 400) return 'major';
    return 'minor';
  }

  // Routes whose failures are expected and should never be logged or cause side-effects
  const _silentRoutes = [
    '/api/google/files',
    '/api/google/shared',
    '/api/google/search',
    '/api/prefs',
    '/api/issues/error',   // never track the error-tracker endpoint itself
    '/api/issues/report',
    '/api/slack/dm-check', // polling — expected to fail before Slack is connected
    '/api/slack/auth-status',
  ];

  // ── Queue an error (batched to avoid flooding) ───────────────────────────
  function queueError(entry) {
    // Don't track errors from the error-tracker itself or teacher dashboard
    if (typeof entry.technical === 'string' && entry.technical.includes('/api/issues/error')) return;
    if (window.location.pathname.startsWith('/teacher')) return;
    // Silently ignore known-safe routes that may return errors before auth is ready
    // (failures only — a slow poll is still worth knowing about; it is how the 6–7s Slack DM check was found)
    if (entry.type !== 'slow' && _silentRoutes.some(r => (entry.endpoint || entry.technical || '').startsWith(r) || (entry.technical || '').includes(r))) return;

    _queue.push({ ...entry, browser: _browser, device: _device });
    clearTimeout(_timer);
    _timer = setTimeout(flushQueue, BATCH_DELAY);
  }

  async function flushQueue() {
    if (!_queue.length) return;
    const batch = _queue.splice(0);
    for (const entry of batch) {
      try {
        await fetch('/api/issues/error', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry),
        });
      } catch { /* silent — don't recurse */ }
    }
  }

  // ── Intercept fetch to detect API failures and slow loads ────────────────
  const _originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    const isInternal = url.startsWith('/') || url.startsWith(window.location.origin);

    // Only track internal API calls
    if (!isInternal || !url.startsWith('/api/')) {
      return _originalFetch.apply(this, args);
    }

    const start = Date.now();
    const endpoint = endpointOf(url);

    // Found 2026-09-23 reviewing a real issue export: elapsed here is a
    // plain Date.now() wall-clock diff, which jumps forward by however long
    // the laptop was asleep or the tab was backgrounded mid-request — not
    // real server/network latency. That produced misleading multi-minute
    // "slow load" entries (e.g. the same request logged as 1859s / ~31min)
    // clustered across several unrelated endpoints at once, the signature
    // of a suspend/resume, not a real outage. A per-request visibilitychange
    // listener flags whether the tab was ever hidden while this fetch was
    // in flight, so that case is skipped below instead of misreported.
    let hiddenDuringRequest = document.hidden;
    const onVisibilityChange = () => { if (document.hidden) hiddenDuringRequest = true; };
    document.addEventListener('visibilitychange', onVisibilityChange);

    let res;
    try {
      res = await _originalFetch.apply(this, args);
    } catch (netErr) {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      // Same backgrounding signature as the slow-load case above — browsers
      // commonly abort in-flight fetches when a tab is frozen/suspended, so
      // a "Failed to fetch" right as the tab was hidden is very likely that,
      // not a real connectivity problem (a genuinely broken connection will
      // still surface correctly on the student's next foregrounded request).
      if (!hiddenDuringRequest) {
        queueError({
          feature:   featureFromPath(url),
          type:      'network',
          severity:  'major',
          message:   `Network error: ${endpoint} failed to connect`,
          endpoint,
          technical: netErr.message,
          code:      'NETWORK_ERROR',
        });
      }
      throw netErr;
    }
    document.removeEventListener('visibilitychange', onVisibilityChange);

    const elapsed = Date.now() - start;

    // Log slow loads (>5 seconds) — skip if the tab was hidden/backgrounded
    // at any point during the request (see comment above).
    if (elapsed > SLOW_THRESHOLD && !hiddenDuringRequest) {
      queueError({
        feature:   featureFromPath(url),
        type:      'slow',
        severity:  'minor',
        // Stable message (no seconds in it) so repeats of the same slow endpoint merge into one incident;
        // the time itself travels separately.
        message:   `Slow load: ${endpoint} took over ${SLOW_THRESHOLD / 1000}s to respond`,
        technical: `Elapsed: ${elapsed}ms, Status: ${res.status} — ${endpoint}`,
        code:      'SLOW_RESPONSE',
        endpoint,
        elapsedMs: elapsed,
      });
    }

    // Log HTTP errors. Skipped: 401 (expected before auth is established) and 428 (the hub's "Canvas not connected yet"
    // answer — an expected state, not a fault; logging it made ~70% of the open-issues dashboard noise, 2026-09-25).
    if (!res.ok && res.status !== 401 && res.status !== 428) {
      const feature = featureFromPath(url);
      // A Canvas permission refusal is an API/course-access observation, not
      // evidence that Hub authentication failed. Inspect a clone only.
      let canvasPermissionDenied = false;
      if (feature === 'canvas' && res.status === 403) {
        try { canvasPermissionDenied = (await res.clone().json()).error === 'canvas_permission_denied'; } catch {}
      }
      const type = res.status === 403 && !canvasPermissionDenied ? 'auth' : 'api';
      const severity = canvasPermissionDenied ? 'minor' : severityFromStatus(res.status);

      const messages = {
        401: `Authentication required — session may have expired (${endpoint})`,
        403: `Access denied — insufficient permissions (${endpoint})`,
        404: `Resource not found (${endpoint})`,
        429: `Rate limited — too many requests (${endpoint})`,
        500: `Server error — something went wrong on the server (${endpoint})`,
        502: `Bad gateway — server temporarily unavailable (${endpoint})`,
        503: `Service unavailable (${endpoint})`,
      };

      queueError({
        feature,
        type,
        severity,
        message:   messages[res.status] || `API error ${res.status} on ${endpoint}`,
        technical: `HTTP ${res.status} ${res.statusText} — ${endpoint}`,
        endpoint,
        code:      String(res.status),
      });
    }

    return res;
  };

  // ── Intercept uncaught JS errors ─────────────────────────────────────────
  const _prevOnError = window.onerror;
  window.onerror = function (msg, src, line, col, err) {
    if (typeof msg === 'string' && msg.includes('ResizeObserver')) {
      // Benign browser quirk — skip
    } else {
      const feature = featureFromPath(src || '');
      queueError({
        feature,
        type:      'js',
        severity:  'major',
        message:   `JavaScript error: ${typeof msg === 'string' ? msg.substring(0, 200) : 'Unknown error'}`,
        technical: `${src}:${line}:${col} — ${err?.stack?.substring(0, 500) || msg}`,
        code:      'JS_ERROR',
      });
    }
    if (typeof _prevOnError === 'function') _prevOnError.apply(this, arguments);
    return false;
  };

  // ── Intercept unhandled promise rejections ───────────────────────────────
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason;
    const msg = reason?.message || String(reason) || 'Unhandled promise rejection';
    if (msg.includes('ResizeObserver') || msg.includes('Non-Error')) return;
    queueError({
      feature:   'general',
      type:      'js',
      severity:  'minor',
      message:   `Unhandled error: ${msg.substring(0, 200)}`,
      technical: reason?.stack?.substring(0, 500) || msg,
      code:      'UNHANDLED_REJECTION',
    });
  });

  // ── Monitor session expiry ───────────────────────────────────────────────
  // Watched by the fetch interceptor (401 responses) but also poll on long idle
  let _lastActive = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const idleMs = Date.now() - _lastActive;
    if (idleMs > 28 * 60 * 1000) {
      // Was away for >28 minutes — check if session is still valid
      fetch('/api/session/me').catch(() => {});
    }
  });
  ['click', 'keydown', 'touchstart'].forEach(ev => {
    document.addEventListener(ev, () => { _lastActive = Date.now(); }, { passive: true });
  });

  // ── Expose manual log for use in other scripts ───────────────────────────
  window.ysc = window.ysc || {};
  window.ysc.logError = function (feature, message, technical, severity = 'minor') {
    queueError({ feature, type: 'api', severity, message, technical, code: '' });
  };

  window.ysc.logPanelSlow = function (feature, ms) {
    if (ms > SLOW_THRESHOLD) {
      queueError({
        feature,
        type: 'slow',
        severity: 'minor',
        message: `${feature} panel took ${(ms / 1000).toFixed(1)}s to load`,
        technical: `Load time: ${ms}ms`,
        code: 'PANEL_SLOW',
      });
    }
  };
})();
