/* THE SIGN-IN SHEET - email, a six-digit code, done.
 *
 * Jason, 2026-09-10: "no, i want their email" / "otherwise i can log in for
 * you and tank your picks." The server decides who needs to sign in
 * (src/auth.ts, REQUIRE_EMAIL); this sheet is only ever the answer to it.
 *
 * TWO STEPS, NO PASSWORD. Step one asks for the address and the 18-or-older
 * confirmation - the app is 18+ (settled.md, "18+, taken honestly"; Jason:
 * "i thought we were asking 18+ for apple"). Step two
 * takes the code from the email. Nothing else is asked - no name, no birthday,
 * no password to invent and forget.
 *
 * apiFetch() is how a screen talks to an endpoint that may need a person: it
 * sends the session when there is one, and when the server answers
 * 401 email_required it opens this sheet and, once signed in, retries once.
 * So a screen never has to know whether sign-in is switched on.
 */

const CSS = `
.ag-si-scrim { position: fixed; inset: 0; z-index: 60; background: rgba(8, 10, 14, .55);
  display: grid; align-items: end; justify-items: center; }
.ag-si { width: min(560px, 100%); box-sizing: border-box; padding: 20px 18px calc(22px + env(safe-area-inset-bottom, 0px));
  background: var(--card); color: var(--fg); border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, .3); display: grid; gap: 12px; }
.ag-si-h { margin: 0; font-size: var(--t-section); font-weight: 800; }
.ag-si-b { margin: 0; font-size: var(--t-body); color: var(--dim); line-height: 1.4; }
.ag-si-in { font: inherit; font-size: 17px; min-height: var(--tap-min, 44px); padding: 0 12px;
  border: 1px solid var(--line); border-radius: var(--radius-button, 10px); background: var(--bg); color: var(--fg); }
.ag-si-code { letter-spacing: .35em; text-align: center; font-weight: 800; }
.ag-si-age { display: flex; gap: 10px; align-items: center; font-size: var(--t-body); }
.ag-si-age input { width: 20px; height: 20px; }
.ag-si-go { font: inherit; font-weight: 800; min-height: var(--tap-min, 44px); border: 0;
  border-radius: var(--radius-button, 10px); background: var(--accent); color: var(--on-accent); }
.ag-si-go:disabled { background: var(--track); color: var(--dim); }
.ag-si-err { margin: 0; font-size: var(--t-micro); font-weight: 700; color: var(--down); }
.ag-si-alt { justify-self: center; border: 0; background: none; font: inherit; font-size: var(--t-micro);
  color: var(--dim); text-decoration: underline; padding: 4px 8px; }
.ag-si-fine { margin: 0; font-size: var(--t-micro); color: var(--dim); text-align: center; }
.ag-si-fine a { color: var(--dim); }
`;

function injectCss() {
  if (document.getElementById('ag-signin-css')) return;
  const s = document.createElement('style');
  s.id = 'ag-signin-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const get = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const put = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private window */ } };

export function sessionToken() { return get('ag.session'); }
export function signedInEmail() { return get('ag.email'); }

function deviceId() {
  let v = get('ag.device');
  if (!v) { v = 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36); put('ag.device', v); }
  return v;
}

/** Headers with the session attached, when there is one. */
export function authHeaders(h) {
  const t = sessionToken();
  return t ? Object.assign({}, h || {}, { authorization: 'Bearer ' + t }) : Object.assign({}, h || {});
}

/** fetch() for endpoints that may need a person. See the header comment. */
export async function apiFetch(url, opts) {
  const o = Object.assign({}, opts || {});
  o.headers = authHeaders(o.headers);
  let res = await fetch(url, o);
  if (res.status === 401) {
    let body = null;
    try { body = await res.clone().json(); } catch { body = null; }
    if (body && body.error === 'email_required' && await openSignIn()) {
      o.headers = authHeaders(opts && opts.headers);
      res = await fetch(url, o);
    }
  }
  return res;
}

let OPEN = null;

/** Opens the sheet. Resolves true once signed in, false if dismissed. */
export function openSignIn(reason) {
  if (OPEN) return OPEN;
  injectCss();
  OPEN = new Promise((resolve) => {
    const scrim = document.createElement('div');
    scrim.className = 'ag-si-scrim';
    const box = document.createElement('div');
    box.className = 'ag-si';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    scrim.appendChild(box);
    const close = (ok) => { scrim.remove(); OPEN = null; resolve(ok); };
    scrim.addEventListener('click', (e) => { if (e.target === scrim) close(false); });

    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    let email = '';

    const stepEmail = (errMsg) => {
      box.textContent = '';
      box.appendChild(el('h2', 'ag-si-h', 'Play with your email'));
      box.appendChild(el('p', 'ag-si-b', reason
        || 'We’ll send you a 6-digit code. No password, and your picks can’t be made by anyone else.'));
      const inp = el('input', 'ag-si-in');
      inp.type = 'email'; inp.autocomplete = 'email'; inp.inputMode = 'email';
      inp.placeholder = 'you@example.com'; inp.value = email || signedInEmail();
      const age = el('label', 'ag-si-age');
      const cb = document.createElement('input'); cb.type = 'checkbox';
      age.append(cb, document.createTextNode('I’m 18 or older'));
      const go = el('button', 'ag-si-go', 'Send code'); go.type = 'button';
      const err = el('p', 'ag-si-err', errMsg || '');
      go.onclick = async () => {
        email = inp.value.trim();
        if (!email) { inp.focus(); return; }
        if (!cb.checked) { err.textContent = 'You need to be 18 or older to play.'; return; }
        go.disabled = true; go.textContent = 'Sending…'; err.textContent = '';
        try {
          const r = await fetch('/api/auth/start', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, ageOk: true }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) { go.disabled = false; go.textContent = 'Send code'; err.textContent = j.error || 'That didn’t work. Try again.'; return; }
          stepCode();
        } catch { go.disabled = false; go.textContent = 'Send code'; err.textContent = 'No connection. Try again in a moment.'; }
      };
      box.append(inp, age, go, err);
      const fine = el('p', 'ag-si-fine');
      fine.append(document.createTextNode('We only use it to sign you in. '));
      const a = el('a', null, 'Privacy'); a.href = '/privacy.html'; a.target = '_blank'; a.rel = 'noopener';
      fine.appendChild(a);
      box.appendChild(fine);
      setTimeout(() => inp.focus(), 50);
    };

    const stepCode = () => {
      box.textContent = '';
      box.appendChild(el('h2', 'ag-si-h', 'Check your email'));
      box.appendChild(el('p', 'ag-si-b', 'Enter the 6-digit code we sent to ' + email + '.'));
      const inp = el('input', 'ag-si-in ag-si-code');
      inp.inputMode = 'numeric'; inp.autocomplete = 'one-time-code'; inp.maxLength = 6; inp.placeholder = '••••••';
      const go = el('button', 'ag-si-go', 'Verify'); go.type = 'button';
      const err = el('p', 'ag-si-err', '');
      go.onclick = async () => {
        const code = inp.value.replace(/\D/g, '');
        if (code.length !== 6) { err.textContent = 'The code is 6 digits.'; return; }
        go.disabled = true; go.textContent = 'Checking…'; err.textContent = '';
        try {
          const r = await fetch('/api/auth/verify', { method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ email, code, deviceId: deviceId() }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok || !j.token) { go.disabled = false; go.textContent = 'Verify'; err.textContent = j.error || 'That code didn’t work.'; return; }
          put('ag.session', j.token);
          put('ag.email', j.email || email);
          close(true);
        } catch { go.disabled = false; go.textContent = 'Verify'; err.textContent = 'No connection. Try again in a moment.'; }
      };
      inp.addEventListener('input', () => { if (inp.value.replace(/\D/g, '').length === 6) go.click(); });
      const alt = el('button', 'ag-si-alt', 'Use a different email'); alt.type = 'button';
      alt.onclick = () => stepEmail();
      box.append(inp, go, err, alt);
      setTimeout(() => inp.focus(), 50);
    };

    stepEmail();
    document.body.appendChild(scrim);
  });
  return OPEN;
}
