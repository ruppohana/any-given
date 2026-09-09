/* PRE-GENERATE A SHARE CARD PER GAME.
 *
 * 🔴 WHY IT IS A FILE AND NOT A FUNCTION. X's crawler fetches og:image once and
 * caches it hard; it will not wait on a Worker rendering an image, and a Worker
 * cannot run headless Chrome anyway. So the card is rendered HERE, on the host
 * that already has Chrome, checked into public/, and served as a static file.
 *
 * It runs before a game, not during one — the card says who is playing and when
 * they kick, which is the information that makes somebody click.
 *
 *   node tools/og-images.mjs nfl:401872656 college-football:401858213
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const base = process.env.AG_BASE || 'https://anygiven.app';
const out = fileURLToPath(new URL('../public/og/', import.meta.url));
mkdirSync(out, { recursive: true });

const keys = process.argv.slice(2);
if (!keys.length) { console.error('usage: node tools/og-images.mjs <sport:gameId> ...'); process.exit(1); }

for (const key of keys) {
  const file = out + key.replace(':', '-') + '.png';
  try {
    execFileSync(CHROME, [
      '--headless', '--disable-gpu', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1200,630',
      /* 🔴 THE DELAY IS NOT OPTIONAL. The card fetches its own state and draws
       * the crests; screenshotting the instant the document loads captures the
       * GENERIC card, which looks like success and is the wrong picture. */
      '--virtual-time-budget=4000',
      `--screenshot=${file}`,
      `${base}/og-card.html?game=${encodeURIComponent(key).replace(/%3A/g, ':')}`
    ], { stdio: 'pipe' });
    const size = existsSync(file) ? statSync(file).size : 0;
    console.log(size > 20000 ? `ok   ${key} -> ${file} (${(size / 1024).toFixed(0)} KB)`
                             : `🔴 ${key} rendered only ${size}b — check the card`);
  } catch (e) {
    console.log(`fail ${key}: ${String(e).slice(0, 80)}`);
  }
}
