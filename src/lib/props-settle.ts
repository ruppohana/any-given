/* READY SETS SETTLE THEMSELVES. Jason, 2026-09-13: "i am not entering anything by
 * hand, if you cannot get the information from their website or something then what
 * good are you?"
 *
 * A ready set names where its answers are published. Once a question has locked, the
 * Worker reads that page, finds the winner, maps it onto one of the question's options
 * and writes the answer into EVERY group that loaded the set (their qids are the
 * set's own: 'emmys-2026-1' ...). Nobody types a result. A commissioner can still
 * enter or change an answer - the settler never overwrites one that is there.
 *
 * 🔴 IT ONLY ANSWERS WHAT THE PAGE STATES. An awards page marks a confirmed winner in
 * bold with a double dagger (‡). No mark, no answer. And the winner has to match
 * exactly ONE option - two or none and the question waits for the next read, rather
 * than guessing. Pure - tested on the real 77th Primetime Emmy Awards page (2025).
 */

const ENT: Record<string, string> = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', ndash: '-', mdash: '-' };
function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** For comparing names: lowercase, no accents, no punctuation, single spaces. */
export function norm(s: string): string {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[‘’´`]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** An awards page's winners: category heading -> the winner's line, for every
 *  category whose first entry is bold and carries the double dagger. The shape is
 *  Wikipedia's awards table: a bold category heading in a <div>, then a list whose
 *  first item is the winner - bold, followed by ‡ - with the other nominees nested. */
export function winnersFromWikiAwards(html: string): Map<string, string> {
  const out = new Map<string, string>();
  /* Parsoid's data-mw attributes carry escaped HTML - with bare '>' in it - so they are
     dropped first, or every [^>]* below stops inside one. Found on the real page. */
  const clean = String(html || '').replace(/\sdata-mw='[^']*'/g, '').replace(/\sdata-mw="[^"]*"/g, '');
  const cells = clean.split(/<td\b[^>]*>/i).slice(1);
  for (const cell of cells) {
    const head = cell.match(/^\s*<div[^>]*>\s*<b\b[^>]*>([\s\S]*?)<\/b>\s*<\/div>/i);
    if (!head) continue;
    const rest = cell.slice(head.index! + head[0].length);
    const first = rest.match(/<li[^>]*>\s*<b\b[^>]*>([\s\S]*?)<\/b>\s*(?:<span[^>]*>)?\s*‡/i);
    if (!first) continue;
    out.set(text(head[1]), text(first[1]));
  }
  return out;
}

/** Every category heading on an awards page, winner or not - so a ready set can be
 *  checked against the page before the night: each of its keys must be a heading. */
export function categoriesFromWikiAwards(html: string): string[] {
  const clean = String(html || '').replace(/\sdata-mw='[^']*'/g, '').replace(/\sdata-mw="[^"]*"/g, '');
  const out: string[] = [];
  for (const cell of clean.split(/<td\b[^>]*>/i).slice(1)) {
    const head = cell.match(/^\s*<div[^>]*>\s*<b\b[^>]*>([\s\S]*?)<\/b>\s*<\/div>/i);
    if (head) out.push(text(head[1]));
  }
  return out;
}

/** The option a winner's line names - the one whose name (the part before a comma:
 *  "Noah Wyle, The Pitt" -> "Noah Wyle") appears in it. Exactly one, or null. */
export function matchOption(options: string[], winnerLine: string): string | null {
  const line = ' ' + norm(winnerLine) + ' ';
  const hits = options.filter((o) => {
    const name = norm(String(o).split(',')[0]);
    return name.length >= 2 && line.includes(' ' + name + ' ');
  });
  if (hits.length === 1) return hits[0];
  /* Two options can share a first part ("Matthew Rhys, Widow's Bay" and "Matthew Rhys,
     The Beast in Me"): then the whole option has to be in the line. */
  const whole = hits.filter((o) => norm(o).split(' ').every((w) => line.includes(' ' + w + ' ')));
  return whole.length === 1 ? whole[0] : null;
}

/** A category heading on the page for a question: the question's `source.key`, or its
 *  text. Headings on the page are full ("Outstanding Lead Actor in a Drama Series"). */
export function findCategory(winners: Map<string, string>, key: string): string | null {
  const k = norm(key);
  for (const [head, line] of winners) if (norm(head) === k) return line;
  return null;
}
