/* Build the fixture shell into a folder a STATIC HOST can serve.
 *
 * WHY IT EXISTS. tools/preview.mjs strips TypeScript at request time, which is
 * right for local work and is a thing no static host does. Four screens import
 * src/lib/*.ts directly, so on Cloudflare Pages the browser would be handed raw
 * TypeScript and refuse it - the screens would render their error state and the
 * cause would be invisible.
 *
 * So this emits .js beside every .ts and rewrites the import specifiers to match.
 * It is not a bundler and it adds no dependency: Node strips the types, the
 * output is the same modules, and nothing is minified or renamed. What ships is
 * what you read.
 *
 *   node tools/build-static.mjs   ->  dist/
 */
import { stripTypeScriptTypes } from 'node:module';
import { readdir, readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname, dirname, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DIST = join(ROOT, 'dist');

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(p));
    else out.push(p);
  }
  return out;
}

/* A screen says `import ... from '/src/lib/pool.ts'`. On disk that becomes
 * pool.js, so the specifier has to move with it. Only OUR paths are touched -
 * a bare specifier would be an npm package and there are none. */
const retarget = (src) => src.replace(/(from\s+['"])(\/[^'"]+)\.ts(['"])/g, '$1$2.js$3');

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });

/* 1 - the client, verbatim except for the import specifiers. */
for (const file of await walk(join(ROOT, 'public'))) {
  const rel = relative(join(ROOT, 'public'), file);
  const dest = join(DIST, rel);
  await mkdir(dirname(dest), { recursive: true });
  if (['.js', '.html', '.css'].includes(extname(file))) {
    await writeFile(dest, retarget(await readFile(file, 'utf8')));
  } else {
    await cp(file, dest);
  }
}

/* 2 - the modules, type-stripped, at the same paths the screens ask for. */
let stripped = 0;
for (const file of await walk(join(ROOT, 'src'))) {
  if (extname(file) !== '.ts') continue;
  const rel = relative(ROOT, file).replace(/\.ts$/, '.js');
  const dest = join(DIST, rel);
  await mkdir(dirname(dest), { recursive: true });
  const js = stripTypeScriptTypes(await readFile(file, 'utf8'), { mode: 'strip', sourceMap: false });
  await writeFile(dest, retarget(js));
  stripped++;
}

/* 3 - the fixtures. Read-only, and the whole reason any of it renders. */
await cp(join(ROOT, 'fixtures'), join(DIST, 'fixtures'), { recursive: true });

/* 4 - the entry. index.html is the app; a bare / must reach it. */
if (!existsSync(join(DIST, 'index.html'))) throw new Error('no index.html in the build');

const files = await walk(DIST);
const bytes = (await Promise.all(files.map(async (f) => (await readFile(f)).length)))
  .reduce((a, b) => a + b, 0);
console.log(`dist/  ${files.length} files, ${(bytes / 1048576).toFixed(2)} MB, ${stripped} modules stripped`);
console.log('deploy:  npx wrangler pages deploy dist --project-name any-given');

/* 🔴 A BUILD STAMP ON EVERY CODE URL, BECAUSE "HARD REFRESH" IS NOT A DEPLOY
 * STRATEGY. Written 2026-09-09 during the opener, after Jason spent the evening
 * reporting bugs that were already fixed - a stale module told him halftime was
 * "the end of the quarter" and the delay chip said 774s while the card two
 * inches below it, from the same state object, said 47s.
 *
 * 🔴 THE HEADERS WERE ALREADY RIGHT AND IT STILL HAPPENED. Assets serve
 * `max-age=0, must-revalidate`, which is correct and which a browser is
 * entitled to satisfy from its own module map for the life of a page. The only
 * thing a client cannot ignore is a DIFFERENT URL.
 *
 * So the screen modules and stylesheets are loaded with `?v=<stamp>`, the stamp
 * changes on every build, and a deploy invalidates by name rather than by
 * politeness. The unstamped files stay on disk, so anything importing them
 * directly still works.
 *
 * It costs one cache miss per deploy per client, which is exactly what a deploy
 * should cost. */
const BUILD_STAMP_INJECTED = true;
{
  const stamp = Date.now().toString(36);
  const idx = join(DIST, 'index.html');
  if (existsSync(idx)) {
    writeFileSync(idx, readFileSync(idx, 'utf8').replace('</head>',
      `<script>window.__BUILD__=${JSON.stringify(stamp)}</script></head>`));
  }
  const appjs = join(DIST, 'app.js');
  if (existsSync(appjs)) {
    let a = readFileSync(appjs, 'utf8');
    a = a.replace("import('/screens/' + name + '.screen.js')",
                  "import('/screens/' + name + '.screen.js?v=' + (window.__BUILD__ || ''))");
    a = a.replace("const href = '/screens/' + name + '.css';",
                  "const href = '/screens/' + name + '.css?v=' + (window.__BUILD__ || '');");
    writeFileSync(appjs, a);
  }
  console.log('build stamp', stamp);
}
