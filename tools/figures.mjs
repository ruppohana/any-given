/* JASON'S STICK FIGURES -> THE CALL CARDS' MASKS.
 *
 * Jason drew the sheet himself (2026-09-11: "I drew theses"), so it is ours to
 * ship. He picked the left column - "I like the run/pass/kick on the left" - and
 * the call cards use three of them: the passer, the ball carrier and the kicker.
 *
 * Each figure is cut from art/figures/jason-sheet-2026-09-11.png, made an alpha
 * mask (black line = opaque, white paper = clear) and set in a canvas the shape
 * of the tile or pill it sits behind, against the INNER edge, so the text keeps
 * the outer edge and the two figures face each other across the card. The CSS
 * fills the mask with --fg, so one file serves light and dark.
 *
 * 🔴 BOTH FIGURES ON A CARD SHARE ONE SCALE. Jason: "Helmets the same size on
 * adjacent cards." Fitting each figure to its own box scaled them differently;
 * the sheet is drawn at one scale, so one factor per card keeps the helmets equal.
 *
 *   node tools/figures.mjs    -> public/art/fig-*.png
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SHEET = join(ROOT, 'art', 'figures', 'jason-sheet-2026-09-11.png');
const OUT = join(ROOT, 'public', 'art');
mkdirSync(OUT, { recursive: true });

/* Where each figure sits on the 1536x1024 sheet. Tight enough that the next
 * row's helmet and the row above's cleats stay out. */
const BOX = {
  passer: { left: 285, top: 15, width: 340, height: 330 },
  runner: { left: 350, top: 355, width: 320, height: 283 },
  kicker: { left: 265, top: 647, width: 345, height: 338 }
};
/* The canvases: a script-card pill is two tiles tall, a fourth-down tile one. */
const PILL = { W: 330, H: 352 }, TILE = { W: 330, H: 176 };

async function cut(name, flop) {
  let img = sharp(SHEET).extract(BOX[name]);
  if (flop) img = img.flop();
  const buf = await sharp(await img.png().toBuffer()).trim({ threshold: 40 }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, w: m.width, h: m.height };
}
/* The largest scale at which a figure stays inside 56% of the width and 84% of
 * the height - clear of the words and the payout on the outer side. */
const fit = (c, box) => Math.min((box.W * 0.56) / c.w, (box.H * 0.84) / c.h);

async function place(c, scale, side, box, file) {
  const { data, info } = await sharp(c.buf).resize({ width: Math.round(c.w * scale) })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const N = info.width * info.height, rgba = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) rgba[p * 4 + 3] = 255 - data[p * info.channels];
  const fig = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  const left = side === 'right' ? box.W - info.width - 6 : 6;
  /* In a tall pill the figure straddles the seam, so it reads as one picture
   * over both taps; in a single tile it stands on the bottom edge. */
  const top = box === PILL ? Math.round((box.H - info.height) / 2) : box.H - info.height - Math.round(box.H * 0.05);
  await sharp({ create: { width: box.W, height: box.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fig, left, top }]).png({ compressionLevel: 9 }).toFile(join(OUT, file));
  console.log('wrote public/art/' + file, `${info.width}x${info.height} in ${box.W}x${box.H}`);
}

/* Script card: passer in the pass pill (left, facing in), ball carrier flipped
 * to face in from the run pill (right). */
const pass = await cut('passer', false), run = await cut('runner', true);
const s1 = Math.min(fit(pass, PILL), fit(run, PILL));
await place(pass, s1, 'right', PILL, 'fig-pass.png');
await place(run, s1, 'left', PILL, 'fig-run.png');

/* Fourth down: ball carrier behind Go for it (left), kicker flipped behind Kick. */
const go = await cut('runner', false), kick = await cut('kicker', true);
const s2 = Math.min(fit(go, TILE), fit(kick, TILE));
await place(go, s2, 'right', TILE, 'fig-go.png');
await place(kick, s2, 'left', TILE, 'fig-kick.png');
