/* PUT A SPONSOR BANNER ON A PRIVATE POOL - or take it off.
 *
 * Jason, 2026-09-12: "send a banner and we can put it on your private pool."
 * A business sends a banner; once it is APPROVED (no gambling ads, no prize
 * offers, nothing that touches play - decisions/pools-are-free-2026-09-12.md),
 * the image goes in public/sponsors/, ships with the next deploy, and this sets
 * it on the pool:
 *
 *   node tools/sponsor.mjs <poolId> --name "Joe's Bar" --image joes-bar.png --url https://joesbar.com
 *   node tools/sponsor.mjs <poolId> --clear
 *
 * It writes three columns on the pool row (migrations/0008_pool_sponsor.sql)
 * through wrangler, on the live database. Only this machine can run it - no
 * user can set a banner.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const pool = args.find((a) => !a.startsWith('--'));
const flag = (n) => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1]; };
const clear = args.includes('--clear');

if (!pool || !/^[A-Za-z0-9_-]{4,64}$/.test(pool)) {
  console.error('usage: node tools/sponsor.mjs <poolId> --name "Name" --image file.png --url https://... | --clear');
  process.exit(1);
}
const q = (s) => "'" + String(s).split("'").join("''") + "'";

let sql;
if (clear) {
  sql = `UPDATE pool SET sponsor_name = NULL, sponsor_image = NULL, sponsor_url = NULL WHERE id = ${q(pool)};`;
} else {
  const name = flag('name'), image = flag('image'), url = flag('url');
  if (!name || !image) { console.error('--name and --image are required'); process.exit(1); }
  const file = image.startsWith('/sponsors/') ? image.slice('/sponsors/'.length) : image;
  if (!/^[a-z0-9][a-z0-9._-]*\.(png|jpg|jpeg|webp)$/.test(file)) { console.error('image must be a png/jpg/webp file name in public/sponsors/'); process.exit(1); }
  if (!existsSync(fileURLToPath(new URL('../public/sponsors/' + file, import.meta.url)))) {
    console.error('public/sponsors/' + file + ' is not there - add it, deploy, then set it'); process.exit(1);
  }
  if (url && !url.startsWith('https://')) { console.error('--url must be https'); process.exit(1); }
  sql = `UPDATE pool SET sponsor_name = ${q(name)}, sponsor_image = ${q('/sponsors/' + file)}, sponsor_url = ${url ? q(url) : 'NULL'} WHERE id = ${q(pool)};`;
}

console.log(sql);
/* 🔴 This machine's wrangler login is refused for D1 (code 7403, found
   2026-09-12 - deploys work, the database does not). When that happens the SQL
   above is the whole job: run it through the Cloudflare D1 connector or the
   dashboard's D1 console. */
try {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', 'anygiven', '--remote', '--command', sql],
    { encoding: 'utf8', shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  console.log(out.split('\n').filter((l) => /changes|rows_written|success/i.test(l)).join('\n') || out.slice(-400));
} catch (e) {
  const msg = String((e && (e.stderr || e.stdout || e.message)) || e);
  console.error(msg.includes('7403')
    ? 'wrangler is not authorized for D1 here (7403). Run the SQL above through the D1 connector or the dashboard.'
    : msg.slice(-600));
  process.exit(1);
}
