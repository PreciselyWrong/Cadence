'use strict';

// The one page of the authorization flow a person sees. Server-rendered
// like the billing pay page, so it needs neither the web app nor /api.

const escapeHtml = (value) =>
    String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const FORWARDED_FIELDS = [
    'response_type',
    'client_id',
    'redirect_uri',
    'code_challenge',
    'code_challenge_method',
    'state',
    'scope',
    'resource',
];

const STYLE = `
body { font-family: system-ui, sans-serif; background: #f9fafb; color: #111827; margin: 0; padding: 16px; }
main { max-width: 420px; margin: 10vh auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
h1 { font-size: 1.25rem; margin: 0 0 12px; }
p { line-height: 1.5; }
label { display: block; margin: 12px 0 4px; font-size: 0.9rem; }
input[type=email], input[type=password], input[type=text] { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 1rem; }
.error { background: #fef2f2; color: #991b1b; padding: 8px 12px; border-radius: 8px; }
.actions { display: flex; gap: 8px; margin-top: 20px; }
button { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #d1d5db; font-size: 1rem; cursor: pointer; background: #fff; }
button[value=allow] { background: #2563eb; border-color: #2563eb; color: #fff; }
code { word-break: break-all; }
@media (prefers-color-scheme: dark) {
  body { background: #111827; color: #f9fafb; }
  main { background: #1f2937; border-color: #374151; }
  input[type=email], input[type=password], input[type=text] { background: #111827; color: #f9fafb; border-color: #4b5563; }
  button { background: #374151; color: #f9fafb; border-color: #4b5563; }
}`;

function send(res, status, redirectOrigin, body) {
    // Overrides the app-wide CSP: browsers apply form-action to the redirect
    // that follows the form post, so the client's origin must be allowed.
    const formAction = redirectOrigin ? `'self' ${redirectOrigin}` : "'self'";
    res.setHeader(
        'Content-Security-Policy',
        `default-src 'none'; style-src 'unsafe-inline'; form-action ${formAction}; frame-ancestors 'none'; base-uri 'none'`
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.status(status)
        .type('html')
        .send(
            `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Connect to Cadence</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${body}
</main>
</body>
</html>`
        );
}

function renderConsent(res, { client, params, error, status = 200 }) {
    const redirect = new URL(params.redirect_uri);
    const hidden = FORWARDED_FIELDS.filter(
        (field) => typeof params[field] === 'string'
    )
        .map(
            (field) =>
                `<input type="hidden" name="${field}" value="${escapeHtml(params[field])}">`
        )
        .join('\n');
    send(
        res,
        status,
        redirect.origin,
        `<h1>Connect an assistant to Cadence</h1>
<p>An app calling itself <strong>${escapeHtml(client.name)}</strong> asks to read and change your Cadence tasks, projects, notes and habits through MCP.</p>
<p>After you allow it, you go back to <strong>${escapeHtml(redirect.host)}</strong>.</p>
${error ? `<p class="error" role="alert">${escapeHtml(error)}</p>` : ''}
<form method="post" action="/oauth/authorize" autocomplete="on">
${hidden}
<label for="email">Email</label>
<input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label>
<input id="password" name="password" type="password" autocomplete="current-password" required>
<label for="mfa_code">Two-factor code (if two-factor sign-in is on)</label>
<input id="mfa_code" name="mfa_code" type="text" inputmode="numeric" autocomplete="one-time-code">
<div class="actions">
<button type="submit" name="decision" value="deny" formnovalidate>Deny</button>
<button type="submit" name="decision" value="allow">Allow</button>
</div>
</form>`
    );
}

function renderError(res, message, status = 400) {
    send(
        res,
        status,
        null,
        `<h1>Cannot connect</h1>
<p class="error" role="alert">${escapeHtml(message)}</p>
<p>Start again from the app you are connecting.</p>`
    );
}

module.exports = { renderConsent, renderError, escapeHtml };
