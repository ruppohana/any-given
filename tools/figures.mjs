/* JASON'S STICK FIGURES -> THE CALL CARDS' MASKS.
 *
 * Jason drew the art himself (2026-09-11: "I drew theses"), so it is ours to ship.
 * The sources are in art/figures/: the first sheet (passer, ball carrier, kicker)
 * and the library he sent after ("Look these over") - players, referee signals,
 * field objects and the chain crew.
 *
 * Each figure is cut out, made an alpha mask (black line = opaque, white paper =
 * clear) and set in a canvas the shape of the tile or pill it sits behind, against
 * the tile's INNER edge, so the text keeps the outer edge and the figures face
 * each other across the card. The CSS fills the mask with --fg, so one file serves
 * light and dark.
 *
 * 🔴 EVERY FIGURE ON A CARD SHARES ONE SCALE. Jason: "Helmets the same size on
 * adjacent cards." One factor per card - the largest that still fits them all.
 *
 *   node tools/figures.mjs    -> public/art/fig-*.png
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ART = join(ROOT, 'art', 'figures');
const OUT = join(ROOT, 'public', 'art');
mkdirSync(OUT, { recursive: true });

const SHEET = 'jason-sheet-2026-09-11.png', LIB = 'jason-library-2026-09-11.png';
const PICKS = 'jason-picks-2026-09-11.png', CREW = 'jason-chain-crew-2026-09-11.png';
const FD = 'jason-first-down-signal-2026-09-11.png';
const DM = 'jason-down-markers-2026-09-11.png';
/* Where each figure sits on its 1536x1024 sheet - tight enough that labels and
 * neighbours stay out. Checked on a contact sheet before use. */
const FIG = {
  passer: [SHEET, { left: 285, top: 15, width: 340, height: 330 }],
  runner: [SHEET, { left: 350, top: 355, width: 320, height: 283 }],
  kicker: [SHEET, { left: 265, top: 647, width: 345, height: 338 }],
  tackle: [LIB, { left: 10, top: 245, width: 160, height: 150 }],
  fumble: [LIB, { left: 312, top: 255, width: 185, height: 140 }],
  punt: [LIB, { left: 1050, top: 245, width: 130, height: 150 }],
  puntReturn: [LIB, { left: 1180, top: 260, width: 140, height: 135 }],
  droppedPass: [LIB, { left: 1335, top: 250, width: 185, height: 145 }],
  celebration: [LIB, { left: 895, top: 440, width: 130, height: 155 }],
  fgAttempt: [LIB, { left: 148, top: 445, width: 175, height: 148 }],
  goalPosts: [LIB, { left: 360, top: 440, width: 115, height: 155 }],
  tdSignal: [LIB, { left: 30, top: 640, width: 110, height: 155 }],
  ballOnTee: [LIB, { left: 650, top: 870, width: 70, height: 100 }],
  run2: [PICKS, { left: 1150, top: 40, width: 300, height: 270 }],
  /* The linesman with the "1" pole and the chain running off toward his partner -
   * the whole three-man crew is too wide to share a card with anybody. */
  chainCrew: [CREW, { left: 575, top: 265, width: 430, height: 630 }],
  /* Jason, "First down signal": the referee pointing the way the offense is
   * going - the front-facing one of the two he drew. */
  fdSignal: [FD, { left: 175, top: 120, width: 610, height: 770 }],
  /* The down box showing 4 - stopped on third down means fourth down is next.
   * Jason: "The stopped image does not work" (the tackle, and the sack before it). */
  downFour: [DM, { left: 850, top: 235, width: 138, height: 610 }]
};
/* 🔴 THE SHEETS ARE DRAWN AT DIFFERENT SIZES, so "one scale per card" is really
 * "one HELMET size per card". A helmet (or a referee's capped head) measures
 * about this many pixels across on each sheet; objects on a sheet - goal posts,
 * the ball on the tee - take that sheet's unit, so they stay in proportion. */
/* Calibrated 2026-09-11 against the rendered cards, after Jason: "3 has a scale
 * problem. 4 has a scale problem." With the first guesses (LIB 48, PICKS 75, CREW
 * 105) the Run 2 helmet drew 80px to the tackle's 62, and the linesman's capped
 * head 55px to the tackle's 38 - so the library's helmets are smaller than guessed. */
/* The down-marker sheet has no helmets; its unit makes the box and pole stand as
 * tall as the pointing referee beside it. */
const UNIT = { [SHEET]: 110, [LIB]: 40, [PICKS]: 81, [CREW]: 127, [FD]: 175, [DM]: 136 };

/* The canvases. A script-card pill is two tiles tall; a two-across tile is about
 * 1.65 wide to 1 tall; a three-across tile about 1 to 1. */
const PILL = { W: 330, H: 352, pill: true }, TILE = { W: 330, H: 200 }, WIDE = { W: 660, H: 200 };

/* Per card: the canvas, then one entry per tile in the card's own tile order -
 * [figure, flop (so it faces the middle), inner edge]. File: fig-<card>-<n>.png,
 * except the first two cards, which keep the names they shipped with. */
/* The library cards' figures stop at two thirds of the tile's height, so a head
 * stays under the label - at 84% the referee's cap sat in "They get it". The two
 * cards Jason approved first keep the default. */
const LOW = 0.66;
const CARDS = [
  ['script', PILL, [['passer', false, 'right', 'fig-pass.png'], ['runner', true, 'left', 'fig-run.png']]],
  /* LOW now too - Jason, 2026-09-11, on Go for it / Kick: "Scale and head cut
   * off problem." At the old 84% cap the upright kicker stood 168px of a 200px
   * tile, head 22px from the top edge and a size bigger than every other card's
   * figures. At LOW it matches them and clears the top. */
  ['fourth_down', TILE, [['runner', false, 'right', 'fig-go.png'], ['kicker', true, 'left', 'fig-kick.png']], LOW],
  ['explosive', TILE, [['run2', false, 'right'], ['tackle', true, 'left']], LOW],
  ['first_down', TILE, [['chainCrew', false, 'right'], ['tackle', true, 'left']], LOW],
  /* "They are stopped": the sack figure read as a runner, and the tackle did not
   * work either (Jason). The down box turning to 4 says it without a player. */
  ['third_down', TILE, [['fdSignal', false, 'right'], ['downFour', false, 'left']], LOW],
  ['kickoff_return', TILE, [['puntReturn', false, 'right'], ['ballOnTee', false, 'left']], LOW],
  ['drive_end', TILE, [['tdSignal', false, 'right'], ['goalPosts', false, 'left'], ['punt', false, 'right'], ['fumble', true, 'left']], LOW],
  ['drive_breakout', TILE, [['run2', false, 'right'], ['tackle', true, 'left']], LOW],
  ['three_and_out', TILE, [['punt', false, 'right'], ['fdSignal', true, 'left']], LOW],
  /* Two across, then Nothing the full width of the card (.is-3stack) - so its
   * canvas is twice as wide, with the figure at the far right. */
  ['redzone_outcome', TILE, [['celebration', false, 'right'], ['fgAttempt', false, 'left'],
    ['droppedPass', false, 'right', null, WIDE]], LOW]
];

async function cut(name, flop) {
  const [file, box] = FIG[name];
  let img = sharp(join(ART, file)).extract(box);
  if (flop) img = img.flop();
  /* 🔴 THE PAPER IS WHITE - SAY SO. trim() otherwise takes the top-left pixel as
   * the background, and a figure flipped so its helmet lands in that corner was
   * trimmed down to a 32x27 scrap of itself. */
  const buf = await sharp(await img.png().toBuffer()).trim({ background: '#ffffff', threshold: 40 }).png().toBuffer();
  const m = await sharp(buf).metadata();
  return { buf, w: m.width, h: m.height, unit: UNIT[file] };
}
/* The largest scale at which a figure stays inside 56% of the canvas width and
 * 84% of its height - clear of the words and the payout on the outer side. */
const fit = (c, box, hmax = 0.84) => Math.min((box.W * 0.56) / c.w, (box.H * hmax) / c.h);

async function place(c, scale, side, box, file) {
  const { data, info } = await sharp(c.buf).resize({ width: Math.max(1, Math.round(c.w * scale)) })
    .greyscale().raw().toBuffer({ resolveWithObject: true });
  const N = info.width * info.height, rgba = Buffer.alloc(N * 4);
  for (let p = 0; p < N; p++) rgba[p * 4 + 3] = 255 - data[p * info.channels];
  const fig = await sharp(rgba, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  /* 16px off the tile's edge, not 6. Jason, 2026-09-11: "The helmet is cut off
   * the dude on the left." The art was whole; at 6px the tackler's helmet sat
   * against the tile's rounded border on a phone and read as sliced. */
  const EDGE = 16;
  const left = side === 'right' ? box.W - info.width - EDGE : side === 'left' ? EDGE : Math.round((box.W - info.width) / 2);
  /* In a tall pill the figure straddles the seam, so it reads as one picture
   * over both taps; in a single tile it stands on the bottom edge. */
  const top = box.pill ? Math.round((box.H - info.height) / 2) : box.H - info.height - Math.round(box.H * 0.05);
  await sharp({ create: { width: box.W, height: box.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: fig, left, top }]).png({ compressionLevel: 9 }).toFile(join(OUT, file));
  console.log('wrote public/art/' + file, `${info.width}x${info.height} in ${box.W}x${box.H}`);
}

for (const [card, box, tiles, hmax] of CARDS) {
  const cuts = await Promise.all(tiles.map(([name, flop]) => cut(name, flop)));
  /* The largest helmet, in canvas pixels, at which every figure on the card
   * still fits; each figure is then scaled so its helmet is exactly that. */
  const helmet = Math.min(...cuts.map((c, k) => fit(c, tiles[k][4] || box, hmax) * c.unit));
  for (let k = 0; k < tiles.length; k++) {
    const [, , side, file, own] = tiles[k];
    await place(cuts[k], helmet / cuts[k].unit, side, own || box, file || `fig-${card}-${k + 1}.png`);
  }
}
