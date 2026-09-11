/* 🔴 THE HOME SCREEN ICONS, RENDERED ON THIS MACHINE.
 *
 * Jason wants the app on his phone for tonight's games, and Add to Home
 * Screen needs real PNGs - a manifest pointing at an SVG gets ignored by iOS
 * entirely and is patchy for Android maskables.
 *
 * 🔴 SAME ROUTE AS og-images.mjs, DELIBERATELY. That script already renders
 * HTML to PNG through headless Chrome on this host, for the same reason: a
 * Worker cannot run Chrome, and the container and the mount VM cannot reach
 * the things they would need to. One rendering technique in the repo rather
 * than two.
 *
 *   node tools/icons.mjs
 *
 * 🔴 WHAT THE MARK IS, AND WHY IT IS NOT A FOOTBALL. Jason, on the header:
 * "kill the football." Two attempts at a football glyph were both rejected,
 * and a home screen icon is a harder version of that problem - 40px on a
 * crowded grid, next to apps with a decade of brand recognition. A ball at
 * that size is a brown smudge.
 *
 * So: the monogram, in the signature blue, and nothing else. It reads at
 * 40px, it cannot be mistaken for another app's, and it is the one colour
 * the whole product already uses. No logos anywhere in this app applies to
 * our own mark too.
 *
 * 🔴 THE MASKABLE ONE IS DRAWN DIFFERENTLY, not just re-exported. Android
 * crops a maskable icon to whatever shape the launcher wants - circle,
 * squircle, teardrop - and only the middle 80% is guaranteed to survive. So
 * the maskable version bleeds the blue to every edge and shrinks the
 * monogram into the safe circle; the normal one keeps its own rounded corner
 * and fills more of the square. Exporting one file for both is how a
 * monogram ends up with its corners shaved off.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/* 🔴 RETIRED 2026-09-10 - DO NOT RUN. The monogram above is gone: the icons are
 * Jason's stadium drawings, copied as final from the vault's
 * `Swing Route/Any Given/live/icon/` (see its README). This script writes
 * apple-touch-icon.png, icon-192.png and icon-512.png by the SAME NAMES, so
 * running it would silently put the old AG monogram back over them. */
if (!process.argv.includes('--i-mean-the-old-monogram')) {
  console.error('tools/icons.mjs is retired - the icons are final assets from the vault. Not writing.');
  process.exit(1);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = fileURLToPath(new URL('../public/icons/', import.meta.url));
const tmp = fileURLToPath(new URL('../.icon-tmp.html', import.meta.url));
mkdirSync(out, { recursive: true });

const SIGNATURE = '#4C6EF5';
const FONT = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';

/**
 * @param size    pixels square
 * @param maskable bleed to the edges and shrink into the 80% safe circle
 */
function page(size, maskable) {
  /* 🔴 NOTHING HERE MAY DEPEND ON THE VIEWPORT, and the first version did.
   * `position:absolute; inset:Npx` measures from the initial containing
   * block - and Chrome on Windows CLAMPS its window to a minimum width of
   * around 500px however small you ask. So `--window-size=192,192` rendered
   * into a ~500px viewport, the blue square inset itself from that, and the
   * monogram centred at roughly (250,250) - outside the 192x192 the
   * screenshot then cropped from the top-left. The PNG came out the right
   * size, which is exactly why it looked like a design problem rather than a
   * measurement one.
   *
   * Everything below is sized in absolute pixels off `size`, so the drawing
   * is identical whatever the window does. */
  const inset = maskable ? 0 : Math.round(size * 0.10);
  const box = size - inset * 2;
  const radius = maskable ? 0 : Math.round(size * 0.22);
  const glyph = Math.round(size * (maskable ? 0.34 : 0.42));
  return `<!doctype html><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{background:transparent}
  .w{position:relative;width:${size}px;height:${size}px;overflow:hidden}
  .p{position:absolute;left:${inset}px;top:${inset}px;width:${box}px;height:${box}px;
     border-radius:${radius}px;background:${SIGNATURE};
     display:flex;align-items:center;justify-content:center}
  .m{font:800 ${glyph}px/1 ${FONT};color:#fff;letter-spacing:-.04em;
     /* Optical, not geometric: cap-height type sits low in its line box, so
        centring the BOX leaves the letters looking dropped. */
     position:relative;top:-${Math.round(size * 0.012)}px}
  </style><div class="w"><div class="p"><span class="m">AG</span></div></div>`;
}

const JOBS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-192-maskable.png', size: 192, maskable: true },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  /* iOS ignores the manifest and reads this one. It is also the only one that
     must NOT be transparent - iOS composites a transparent PNG onto black. */
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  { file: 'favicon-32.png', size: 32, maskable: false },
];

for (const j of JOBS) {
  writeFileSync(tmp, page(j.size, j.maskable), 'utf8');
  execFileSync(CHROME, [
    '--headless', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${j.size},${j.size}`,
    `--screenshot=${out}${j.file}`,
    'file:///' + tmp.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  console.log(j.file, statSync(out + j.file).size + ' bytes');
}
rmSync(tmp, { force: true });
console.log('icons in public/icons/');
