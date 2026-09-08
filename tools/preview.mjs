/* THE PREVIEW HARNESS - fixture-driven, NO NETWORK, rendered in a real browser.
 *
 * Requirement 7.5: layout bugs are invisible to tests. Five in one week were
 * invisible to 300+ passing tests and obvious in one screenshot, including one
 * that charged the user twice. So every screen in this app closes by being LOOKED
 * AT, at 393px, and this is the thing that makes that possible without a feed.
 *
 * It AUTO-DISCOVERS public/screens/*.screen.js. There is no index file, on
 * purpose: two sub-agents editing one registry is the recorded loss mode, so the
 * registry does not exist.
 *
 * It hands each screen the REAL fixtures and nothing else. A screen that wants
 * data those do not contain has found a capture job, not a licence to invent one.
 *
 *   node tools/preview.mjs           -> http://127.0.0.1:8788
 *   /                                -> the index: every screen, every state
 *   /<screen-id>/<state>             -> one screen in one state
 */
import { createServer } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname, dirname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT || 8788);
const MIME = { '.js': 'text/javascript', '.ts': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
               '.html': 'text/html' };

/* 🔴 A SCREEN MUST BE ABLE TO RUN THE REAL MODULES. Raised by L7, and it was a
 * hole in this file: src/lib/*.ts was served as application/octet-stream, so a
 * browser would not execute it and every screen had to hand-carry a snapshot of
 * its module's output across the gap. A screen judged against a snapshot is a
 * screen judged against something a model wrote - rule zero, one level up.
 *
 * Node 24 strips types without a build step, so the browser gets real JavaScript
 * from the real file. No bundler, no dist/, nothing to keep in sync. */
async function serveSource(p) {
  const src = await readFile(p, 'utf8');
  if (!p.endsWith('.ts')) return src;
  return stripTypeScriptTypes(src, { mode: 'strip', sourceMap: false });
}

async function screens() {
  const dir = join(ROOT, 'public', 'screens');
  if (!existsSync(dir)) return [];
  const files = (await readdir(dir)).filter((f) => f.endsWith('.screen.js'));
  const out = [];
  for (const f of files) {
    /* Read the metadata as TEXT, never by importing. A screen module is BROWSER
     * code - its imports are server-absolute ('/components/nav.js') and Node
     * cannot resolve them. Importing it here made the harness crash on every
     * request and report the failure as a 500 with no cause. */
    const src = await readFile(join(dir, f), 'utf8');
    const grab = (re) => { const m = src.match(re); return m ? m[1] : null; };
    const one = (k) => { const i = src.indexOf('export const ' + k + ' = '); if (i < 0) return null; const rest = src.slice(i + ('export const ' + k + ' = ').length); const q = rest[0]; if (q !== "'" && q !== '"' && q !== '`') return null; const end = rest.indexOf(q, 1); return end < 0 ? null : rest.slice(1, end); };
    const arr = (src.match(/export\s+const\s+states\s*=\s*\[([^\]]*)\]/) || [])[1];
    out.push({
      file: f,
      id: one('id') || f.replace('.screen.js', ''),
      title: one('title') || f,
      bar: one('bar'),
      states: arr ? arr.split(',').map((s) => s.trim().replace(/^['"`]|['"`]$/g, '')).filter(Boolean) : ['ready']
    });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

const page = (s, state) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${s.title} - ${state}</title>
<link rel="stylesheet" href="/styles/tokens.css">
<link rel="stylesheet" href="/styles/shell.css">
<link rel="stylesheet" href="/screens/${s.id}.css">
</head><body>
<div class="ag-shell"><main class="ag-main" id="root"></main><div id="nav"></div></div>
<script type="module">
import * as screen from '/screens/${s.file}';
/* THE SHELL DRAWS THE NAVIGATION, NOT THE SCREEN. S1 is session-owned and built
 * once; a screen that draws its own nav is a shell invented twice. */
import { navBar, NAV_CSS } from '/components/nav.js';
const navStyle = document.createElement('style');
navStyle.textContent = NAV_CSS;
document.head.appendChild(navStyle);
/* A screen may opt OUT of navigation by exporting chrome = 'none'. Raised by
 * L1: a COLD LAUNCH has no navigation - there is nowhere to navigate to yet, and
 * drawing a bottom bar on the first screen a stranger sees is the shell asserting
 * an app they have not entered. The harness drew it unconditionally. */
const navSlot = document.getElementById('nav');
if (screen.chrome === 'none') navSlot.remove();
else navSlot.replaceWith(navBar('slate', { liveAvailable: false, liveReason: 'No game in progress', hrefFor: (d) => '#' + d.id }));
const fixtures = {
  teams: await (await fetch('/fixtures/teams.json')).json(),
  games: ['real-utep-at-ou','real-ball-at-osu','real-bois-at-ore']
};
fixtures.load = async (n) => (await fetch('/fixtures/' + n + '-260905-final.json')).json();
const root = document.getElementById('root');
const data = screen.previewData ? await screen.previewData(fixtures, ${JSON.stringify(state)}) : {};
screen.render(root, data, ${JSON.stringify(state)});
</script>
</body></html>`;

const index = (list) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Any Given - preview</title>
<link rel="stylesheet" href="/styles/tokens.css">
<style>
 body{padding:16px;max-width:760px;margin:0 auto}
 h1{font-size:var(--t-section);margin:0 0 4px}
 p.sub{color:var(--dim);margin:0 0 18px;font-size:var(--t-body)}
 .row{border:1px solid var(--line);border-radius:var(--radius-card);background:var(--card);padding:12px;margin-bottom:10px}
 .row b{font-size:var(--t-emph)}
 .bar{color:var(--dim);font-size:var(--t-micro);display:block;margin:2px 0 8px;word-break:break-all}
 .nobar{color:var(--down);font-weight:600}
 a.s{display:inline-block;margin:0 6px 6px 0;padding:6px 10px;border:1px solid var(--line);
     border-radius:var(--radius-button);text-decoration:none;color:var(--fg);font-size:var(--t-micro)}
 .empty{color:var(--dim)}
</style></head><body>
<h1>Any Given - preview</h1>
<p class="sub">Fixture-driven, no network. <b>Measure at 393px in a real browser before claiming a layout works.</b></p>
${list.length ? list.map((s) => `<div class="row"><b>${s.id}</b> - ${s.title}
<span class="bar">${s.bar ? 'bar: ' + s.bar : '<span class="nobar">NO BAR DECLARED - this screen should not have been dispatched</span>'}</span>
${s.states.map((st) => `<a class="s" href="/${s.id}/${st}">${st}</a>`).join('')}</div>`).join('')
: '<p class="empty">No screens yet. A screen is <code>public/screens/&lt;id&gt;.screen.js</code>; the harness finds it automatically.</p>'}
</body></html>`;

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1');
    const path = decodeURIComponent(url.pathname);

    if (path === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(index(await screens()));
    }
    for (const base of ['public', '']) {
      const p = join(ROOT, base, path);
      if (p.startsWith(ROOT) && existsSync(p) && extname(p)) {
        const type = MIME[extname(p)] || 'application/octet-stream';
        const isText = type.startsWith('text/') || type.endsWith('json');
        res.writeHead(200, { 'content-type': type + (isText ? '; charset=utf-8' : '') });
        return res.end(isText ? await serveSource(p) : await readFile(p));
      }
    }
    const [, id, state] = path.split('/');
    const s = (await screens()).find((x) => x.id === id);
    if (s) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(page(s, state && s.states.includes(state) ? state : s.states[0]));
    }
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('no such screen: ' + id);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(e && e.stack || e));
  }
}).listen(PORT, '127.0.0.1', () => {
  console.log(`preview  http://127.0.0.1:${PORT}   (393px is the design width)`);
});
