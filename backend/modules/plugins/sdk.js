'use strict';

// Served at /api/plugins/sdk.js: the small client a plugin page loads to talk
// to Cadence as the person who opened it (docs/46-plugins.md, "Plugin pages").
// On the web the page runs in an iframe of the app (session cookie + CSRF
// token); on Android it runs in a WebView that hands over the API token and
// the actions through `CadenceBridge`.
module.exports = `(function () {
  'use strict';
  var bridge = window.CadenceBridge || null;
  var csrf = null;
  var WRITES = { POST: 1, PUT: 1, PATCH: 1, DELETE: 1 };

  function url(path) {
    var clean = String(path || '').replace(/^\\/+/, '').replace(/^api\\//, '');
    return '/api/' + clean;
  }

  function csrfToken() {
    if (csrf) return Promise.resolve(csrf);
    return fetch('/api/csrf-token', { credentials: 'same-origin' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { csrf = d.csrfToken || ''; return csrf; })
      .catch(function () { return ''; });
  }

  function request(path, init) {
    var options = Object.assign({}, init || {});
    var method = String(options.method || 'GET').toUpperCase();
    var headers = Object.assign({ Accept: 'application/json' }, options.headers || {});
    if (options.body !== undefined && typeof options.body !== 'string') {
      options.body = JSON.stringify(options.body);
    }
    if (options.body !== undefined && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }
    options.method = method;
    options.credentials = 'same-origin';
    options.redirect = 'manual';
    if (bridge && bridge.token) {
      headers.Authorization = 'Bearer ' + bridge.token();
      options.headers = headers;
      return fetch(url(path), options);
    }
    if (!WRITES[method]) {
      options.headers = headers;
      return fetch(url(path), options);
    }
    return csrfToken().then(function (token) {
      if (token) headers['x-csrf-token'] = token;
      options.headers = headers;
      return fetch(url(path), options);
    });
  }

  function json(path, init) {
    return request(path, init).then(function (response) {
      return response.text().then(function (text) {
        var body = null;
        try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
        if (!response.ok) {
          throw new Error((body && body.error) || ('HTTP ' + response.status));
        }
        return body;
      });
    });
  }

  var TARGETS = { task: 1, note: 1, project: 1, url: 1 };

  function open(target, ref) {
    if (!TARGETS[target] || typeof ref !== 'string' || !ref) return false;
    if (target === 'url' && !/^https?:\\/\\//i.test(ref)) return false;
    if (bridge && bridge.open) {
      bridge.open(target, ref);
    } else {
      window.parent.postMessage({ cadence: 'open', target: target, ref: ref }, window.location.origin);
    }
    return true;
  }

  window.cadence = { fetch: request, json: json, open: open, android: !!bridge };
})();
`;
