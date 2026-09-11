/* 🔴 A REAL PHONE RENDER, AS A FILE. `chrome --window-size=390,...` is not a
 * phone: desktop Chrome has a minimum window width of about 500px, so a
 * "390" window lays the page out at ~500 and the screenshot crops the right
 * edge. Found 2026-09-10 when a new-visitor screenshot showed the menu, the
 * copy and the fifth nav icon cut off - on a page that renders perfectly on
 * Jason's phone.
 *
 * So this drives a fresh headless Chrome over the DevTools protocol and
 * emulates the device - width, height, 3x pixels, mobile, an iPhone user
 * agent - which is what makes the layout happen at phone width. A fresh
 * profile every run: no storage, no stored league, no invite. That IS the
 * first visit.
 *
 *   node tools/shot.mjs --url https://anygiven.app/ --out first.png
 *   node tools/shot.mjs --url ... --out full.png --full      whole page
 *   options: --w 390 --h 844 --wait 8000
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i < 0 ? d : process.argv[i + 1]; };
const url = arg('url', 'https://anygiven.app/');
const out = arg('out', 'shot.png');
const w = Number(arg('w', 390)), h = Number(arg('h', 844));
const full = process.argv.includes('--full');
const wait = Number(arg('wait', 8000));
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'ag-shot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ch = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
  `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, 'about:blank'], { stdio: 'ignore' });
let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch { /* not up yet */ }
}
if (!target) { console.error('chrome never offered a page target'); ch.kill(); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });

await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 3, mobile: true });
await send('Emulation.setUserAgentOverride', { userAgent:
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' });
await send('Page.enable');
await send('Page.navigate', { url });
await sleep(wait);

let params = { format: 'png' };
if (full) {
  const m = await send('Page.getLayoutMetrics');
  const cs = m.result.cssContentSize || m.result.contentSize;
  params = { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: Math.ceil(cs.height), scale: 1 } };
}
const shot = await send('Page.captureScreenshot', params);
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
ws.close(); ch.kill(); await sleep(400);
try { rmSync(prof, { recursive: true, force: true }); } catch { /* chrome still letting go */ }
console.log('wrote', out, `${w}x${h}@3x`, full ? '(full page)' : '(first screen)');
