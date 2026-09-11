/* THE SIGN-IN SHEET - email, a six-digit code, a name and a handle.
 *
 * Jason, 2026-09-10: "no, i want their email" / "otherwise i can log in for
 * you and tank your picks." Then: "sign in needs to know first name and last
 * name and handle, and verify if the handle is taken." The server decides who
 * needs to sign in (src/auth.ts, REQUIRE_EMAIL); this sheet is only ever the
 * answer to it - or the menu's "Sign in with email".
 *
 * THREE STEPS, NO PASSWORD. Step one asks for the address and the 18-or-older
 * confirmation - the app is 18+ (settled.md, "18+, taken honestly"; Jason:
 * "i thought we were asking 18+ for apple"). Step two takes the code from the
 * email. Step three - only for an account that has no handle yet - asks for
 * first name, last name and a handle, and says whether the handle is free as
 * it is typed. A returning account with a profile never sees step three.
 *
 * apiFetch() is how a screen talks to an endpoint that may need a person: it
 * sends the session when there is one, and when the server answers 401
 * email_required or profile_required it opens this sheet and, once done,
 * retries once. So a screen never has to know whether sign-in is switched on.
 */

const CSS = `
.ag-si-scrim { position: fixed; inset: 0; z-index: 60; background: rgba(8, 10, 14, .55);
  display: grid; align-items: end; justify-items: center; }
.ag-si { width: min(560px, 100%); box-sizing: border-box; padding: 20px 18px calc(22px + env(safe-area-inset-bottom, 0px));
  background: var(--card); color: var(--fg); border-radius: var(--radius-card) var(--radius-card) 0 0;
  box-shadow: 0 -8px 30px rgba(0, 0, 0, .3); display: grid; gap: 12px; max-height: 92vh; overflow: auto; }
.ag-si-h { margin: 0; font-size: var(--t-section); font-weight: 800; }
.ag-si-b { margin: 0; font-size: var(--t-body); color: var(--dim); line-height: 1.4; }
.ag-si-in { font: inherit; font-size: 17px; min-height: var(--tap-min, 44px); padding: 0 12px; box-sizing: border-box; width: 100%;
  border: 1px solid var(--line); border-radius: var(--radius-button, 10px); background: var(--bg); color: var(--fg); }
.ag-si-code { letter-spacing: .35em; text-align: center; font-weight: 800; }
.ag-si-two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.ag-si-lab { display: grid; gap: 4px; font-size: var(--t-micro); font-weight: 700; color: var(--dim); }
.ag-si-handle { position: relative; }
.ag-si-handle .ag-si-in { padding-left: 26px; }
.ag-si-at { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--dim); font-weight: 700; }
.ag-si-avail { min-height: 16px; font-size: var(--t-micro); font-weight: 700; color: var(--dim); }
.ag-si-avail[data-ok="true"] { color: var(--up); }
.ag-si-avail[data-ok="false"] { color: var(--down); }
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
export function signedInHandle() { return get('ag.handle'); }

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
    const why = body && body.error;
    if ((why === 'email_required' || why === 'profile_required') && await openSignIn()) {
      o.headers = authHeaders(opts && opts.headers);
      res = await fetch(url, o);
    }
  }
  return res;
}

/* The handle becomes the name on every board - the live board reads ag.name. */
function rememberProfile(p) {
  if (!p) return;
  if (p.handle) { put('ag.handle', p.handle); put('ag.name', JSON.stringify(p.handle)); }
}

let OPEN = null;

/** Opens the sheet. Resolves true once signed in with a profile, false if dismissed. */
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
          if (j.needsProfile) { stepProfile(); return; }
          rememberProfile(j);
          close(true);
        } catch { go.disabled = false; go.textContent = 'Verify'; err.textContent = 'No connection. Try again in a moment.'; }
      };
      inp.addEventListener('input', () => { if (inp.value.replace(/\D/g, '').length === 6) go.click(); });
      const alt = el('button', 'ag-si-alt', 'Use a different email'); alt.type = 'button';
      alt.onclick = () => stepEmail();
      box.append(inp, go, err, alt);
      setTimeout(() => inp.focus(), 50);
    };

    /* STEP THREE - who you are on the board. The handle is checked as it is
       typed (debounced), and the button only lights when the name fields are
       filled and the latest answer for the handle being shown is "free". */
    const stepProfile = (prefill) => {
      const pf = prefill || {};
      box.textContent = '';
      box.appendChild(el('h2', 'ag-si-h', 'Pick your handle'));
      box.appendChild(el('p', 'ag-si-b', 'Your handle is what your group sees on the standings.'));
      const mk = (label, attrs) => {
        const l = el('label', 'ag-si-lab', label);
        const i = el('input', 'ag-si-in');
        Object.assign(i, attrs);
        l.appendChild(i);
        return [l, i];
      };
      const [fl, first] = mk('First name', { autocomplete: 'given-name', value: pf.first || '' });
      const [ll, last] = mk('Last name', { autocomplete: 'family-name', value: pf.last || '' });
      const two = el('div', 'ag-si-two'); two.append(fl, ll);
      const hl = el('label', 'ag-si-lab', 'Handle');
      const hw = el('div', 'ag-si-handle');
      const handle = el('input', 'ag-si-in');
      handle.autocomplete = 'username'; handle.autocapitalize = 'none'; handle.spellcheck = false;
      handle.maxLength = 20; handle.placeholder = 'yourname'; handle.value = pf.handle || '';
      hw.append(el('span', 'ag-si-at', '@'), handle);
      hl.appendChild(hw);
      const avail = el('div', 'ag-si-avail', '');
      const go = el('button', 'ag-si-go', 'Save'); go.type = 'button'; go.disabled = true;
      const err = el('p', 'ag-si-err', '');

      let asked = '', free = false, timer = null;
      const refresh = () => {
        go.disabled = !(first.value.trim() && last.value.trim() && free && asked === handle.value.trim());
      };
      const check = async () => {
        const h = handle.value.trim();
        asked = h; free = false; refresh();
        if (!h) { avail.textContent = ''; delete avail.dataset.ok; return; }
        avail.textContent = 'Checking…'; delete avail.dataset.ok;
        try {
          const r = await fetch('/api/auth/handle?h=' + encodeURIComponent(h), { headers: authHeaders() });
          const j = await r.json().catch(() => ({}));
          if (asked !== h) return;                 /* a newer keystroke owns the answer */
          free = !!j.available;
          avail.dataset.ok = free ? 'true' : 'false';
          avail.textContent = free ? '@' + h + ' is available' : (j.reason || 'That handle is taken.');
        } catch { avail.textContent = 'Couldn’t check. Try again.'; }
        refresh();
      };
      handle.addEventListener('input', () => {
        handle.value = handle.value.replace(/[^A-Za-z0-9_]/g, '');
        free = false; refresh();
        clearTimeout(timer); timer = setTimeout(check, 350);
      });
      first.addEventListener('input', refresh);
      last.addEventListener('input', refresh);

      go.onclick = async () => {
        go.disabled = true; go.textContent = 'Saving…'; err.textContent = '';
        try {
          const r = await fetch('/api/auth/profile', { method: 'POST',
            headers: authHeaders({ 'content-type': 'application/json' }),
            body: JSON.stringify({ first: first.value, last: last.value, handle: handle.value.trim() }) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) {
            go.textContent = 'Save'; err.textContent = j.error || 'That didn’t save. Try again.';
            if (j.field === 'handle') { free = false; avail.dataset.ok = 'false'; avail.textContent = j.error || ''; }
            refresh();
            return;
          }
          rememberProfile(j);
          close(true);
        } catch { go.textContent = 'Save'; err.textContent = 'No connection. Try again in a moment.'; refresh(); }
      };
      box.append(two, hl, avail, go, err);
      if (handle.value) check();
      setTimeout(() => first.focus(), 50);
    };

    /* Already signed in? Then the only thing left can be the profile. */
    const token = sessionToken();
    if (token) {
      fetch('/api/auth/me', { headers: authHeaders() })
        .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (ok && j.needsProfile) stepProfile(j);
          else if (ok) { rememberProfile(j); close(true); }
          else { try { localStorage.removeItem('ag.session'); } catch { /* fine */ } stepEmail(); }
        })
        .catch(() => stepEmail());
    } else {
      stepEmail();
    }
    document.body.appendChild(scrim);
  });
  return OPEN;
}
