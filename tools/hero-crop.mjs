/* HERO CROPS - Jason's stadium renders into the Home hero's images.
 *
 *   node tools/hero-crop.mjs
 *
 * Jason, 2026-09-11: "i will make more stadiums, but they should be random and
 * never the same 1 two times in a row." So adding one is: drop the render in
 * art/hero/, run this, ship. The Home screen reads public/hero/list.json and
 * picks at random from whatever is in it.
 *
 * For every *.png directly in art/hero/ (not art/hero/versions/), sorted by name:
 *   1. key out the white background - a flood fill from the image edges through
 *      pixels whose darkest channel is >= 244, so the stadium's own light-gray
 *      roofs, which never touch the edge through white, are left alone; the
 *      pixels bordering the cut get alpha from how white they are, a soft edge
 *   2. crop the "wide" frame - 1416 x 944 from (60, 0) on a 1536 x 1024 render,
 *      scaled for any other size - with 100px of transparent air added on top
 *   3. write public/hero/hero-N.webp, 1200 wide, with alpha
 * Then public/hero/list.json, the order the files were written.
 *
 * The narrow crop that shipped before this one is kept in
 * art/hero/versions/cutout-narrow/ with its own README.
 */
import sharp from 'sharp';
import { readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'art', 'hero');
const OUT = join(ROOT, 'public', 'hero');

async function cutOut(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, N = W * H;
  const bg = new Uint8Array(N);
  const mn = (p) => Math.min(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
  const q = new Int32Array(N);
  let head = 0, tail = 0;
  const push = (p) => { if (!bg[p] && mn(p) >= 244) { bg[p] = 1; q[tail++] = p; } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (head < tail) {
    const p = q[head++], x = p % W, y = (p / W) | 0;
    if (x > 0) push(p - 1);
    if (x < W - 1) push(p + 1);
    if (y > 0) push(p - W);
    if (y < H - 1) push(p + W);
  }
  for (let p = 0; p < N; p++) {
    if (bg[p]) { data[p * 4 + 3] = 0; continue; }
    const x = p % W, y = (p / W) | 0;
    const edge = (x > 0 && bg[p - 1]) || (x < W - 1 && bg[p + 1]) || (y > 0 && bg[p - W]) || (y < H - 1 && bg[p + W]);
    if (edge) {
      const m = mn(p);
      if (m >= 224) data[p * 4 + 3] = Math.round(Math.min(255, (255 - m) / 31 * 255));
    }
  }
  return { raw: data, W, H };
}

const files = readdirSync(SRC)
  .filter((f) => f.toLowerCase().endsWith('.png') && statSync(join(SRC, f)).isFile())
  .sort();
if (!files.length) { console.log('no renders in art/hero/'); process.exit(1); }

const list = [];
let i = 0;
for (const f of files) {
  i++;
  const { raw, W, H } = await cutOut(join(SRC, f));
  const sx = W / 1536, sy = H / 1024;
  const crop = await sharp(raw, { raw: { width: W, height: H, channels: 4 } })
    .extract({ left: Math.round(60 * sx), top: 0, width: Math.round(1416 * sx), height: Math.round(944 * sy) })
    .extend({ top: Math.round(100 * sy), background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png().toBuffer();
  const name = 'hero-' + i + '.webp';
  await sharp(crop).resize({ width: 1200 }).webp({ quality: 80, alphaQuality: 90 }).toFile(join(OUT, name));
  list.push('/hero/' + name);
  console.log(f, '->', name, statSync(join(OUT, name)).size, 'bytes');
}
writeFileSync(join(OUT, 'list.json'), JSON.stringify(list) + '\n');
console.log('list.json:', list.length, 'stadiums');
