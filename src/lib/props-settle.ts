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

/* 🔴 REALITY TV: THE CAST TABLE'S FINISH COLUMN. Survivor's contestants table ends each
 * row with the finish ("1st voted out", "Sole Survivor"); Dancing with the Stars' couples
 * table has a status cell ("Eliminated 1st & 2nd", shared by two rows with rowspan, or
 * "Winners"). One row per person, the name in the row's <th>. Read on the real Survivor 50
 * and DWTS season 34 pages. */
/* The Traitors adds its own finishes: "Murdered (Episode 2)", "Banished (Episode 2)",
   "Winner (Episode 12)" - and a role cell, "Faithful" or "Traitor" (the real season 4
   page, read 2026-09-13). */
const FINISH = /^(Sole Survivor|Runner-up|\d+(st|nd|rd|th) voted out|Winners?\b|Runners-up|Third place|Fourth place|Eliminated|Withdrew|Medically evacuated|Quit|Murdered|Banished)/i;
const ROLE = /^(Faithful|Traitor)\b/i;

/** Every person in a cast table with the finish written against them ('' while still in),
 *  their role where the table has one (The Traitors), and the episode the finish names. */
export function castRows(html: string): { name: string; status: string; role: string; episode: number | null }[] {
  const clean = String(html || '').replace(/\sdata-mw='[^']*'/g, '').replace(/\sdata-mw="[^"]*"/g, '');
  const out: { name: string; status: string; role: string; episode: number | null }[] = [];
  let carry = '', left = 0;
  for (const tr of clean.split(/<tr\b[^>]*>/i).slice(1)) {
    const th = tr.match(/^\s*<th\b[^>]*scope="row"[^>]*>([\s\S]*?)<\/th>/i);
    if (!th) continue;
    const name = text(th[1].split(/<br\b/i)[0]);
    if (!name) continue;
    let status = '', role = '';
    for (const td of tr.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/gi)) {
      const t = text(td[2]);
      if (!role && ROLE.test(t)) { role = t; continue; }
      if (status || !FINISH.test(t)) continue;
      status = t;
      const rs = Number((td[1].match(/rowspan="(\d+)"/i) || [])[1]) || 1;
      carry = t; left = rs - 1;
    }
    if (!status && left > 0) { status = carry; left--; }
    const ep = status.match(/\(Episode (\d+)\)/i);
    out.push({ name, status, role, episode: ep ? Number(ep[1]) : null });
  }
  return out;
}

/** What a cast table settles: 'winner' and 'first-out', each a name - or 'void' when
 *  two people went out first together (a double elimination), which no single pick can
 *  have called. Absent while the page does not say. */
export function answersFromCast(kind: string, rows: { name: string; status: string; role?: string; episode?: number | null }[]): Record<string, string> {
  const out: Record<string, string> = {};
  /* 🔴 THE TRAITORS: the first murdered and the first banished are whoever went at the
     LOWEST episode - two in the same episode (a double murder) voids, since no single
     pick called it. "Does a Traitor win?" is Yes the moment any winner's role is
     Traitor, No when every winner is Faithful; nothing until a winner is written. */
  if (kind === 'wiki-traitors') {
    const firstOf = (re: RegExp) => {
      const hit = rows.filter((r) => re.test(r.status) && r.episode != null);
      if (!hit.length) return null;
      const min = Math.min(...hit.map((r) => r.episode as number));
      const names = [...new Set(hit.filter((r) => r.episode === min).map((r) => r.name))];
      return names.length === 1 ? names[0] : 'void';
    };
    const m = firstOf(/^Murdered/i); if (m) out['first-murdered'] = m;
    const b = firstOf(/^Banished/i); if (b) out['first-banished'] = b;
    const winners = rows.filter((r) => /^Winners?\b/i.test(r.status));
    if (winners.length) out['traitor-wins'] = winners.some((r) => /^Traitor/i.test(r.role || '')) ? 'Yes' : 'No';
    return out;
  }
  /* 🔴 DWTS: ONLY THE COUPLES TABLE. Its status carries a date ("Winners on November 25,
     2025", "Eliminated 1st & 2nd on September 23, 2025"); later tables on the same page
     repeat "Winners" against past champions' pairings ("Robert & Witney", "Jordan & Apolo
     Anton Ohno") with no date. Found on the real season 34 page, where they read as five
     winners. So a DWTS finish counts only with its date, and only for one person's name. */
  if (kind === 'wiki-dwts') {
    rows = rows.filter((r) => !r.name.includes('&') && /\bon [A-Z][a-z]+ \d{1,2}, \d{4}\b/.test(r.status));
  }
  /* By NAME, once each: a page can list the same couple in more than one table (found on
     DWTS season 34 - the winner appeared twice and read as two winners). */
  const pick = (re: RegExp) => [...new Set(rows.filter((r) => re.test(r.status)).map((r) => r.name))];
  const winners = kind === 'wiki-survivor' ? pick(/^Sole Survivor/i) : pick(/^Winners?\b/i);
  if (winners.length === 1) out.winner = winners[0];
  const first = kind === 'wiki-survivor' ? pick(/^1st voted out/i) : pick(/Eliminated 1st\b/i);
  if (first.length === 1) out['first-out'] = first[0];
  else if (first.length > 1) out['first-out'] = 'void';
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

/* 🔴 A MEDAL TABLE - the cycling Road World Championships (Jason, 2026-09-13: "do the
 * cycling worlds next"). The championships page carries a "Medal summary" whose first
 * table is the elite events: one row per event - the event's name (with a "details"
 * link), then Gold (rider and nation, then a time), Silver, Bronze. Under-23 and junior
 * tables follow with the same event names, so only the Elite table is read. The row
 * exists only once the race is run. Read on the real 2024 and 2025 pages. */
export function medalsFromWiki(html: string): Map<string, string> {
  const out = new Map<string, string>();
  const clean = String(html || '').replace(/\sdata-mw='[^']*'/g, '').replace(/\sdata-mw="[^"]*"/g, '');
  const at = clean.search(/>\s*Elite events\s*</i);
  if (at < 0) return out;
  const table = clean.slice(at).split(/<\/table>/i)[0];
  for (const tr of table.split(/<tr\b[^>]*>/i).slice(1)) {
    const cells = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
    if (cells.length < 2) continue;
    const event = text(cells[0]).replace(/\s*details\s*$/i, '').trim();
    const gold = text(cells[1]);
    if (event && gold && !out.has(event)) out.set(event, gold);
  }
  return out;
}

/** The gold line for a question's event key: the same event name ("Men's road race"),
 *  or for 'relay' whichever elite event is the mixed relay. */
export function findEvent(medals: Map<string, string>, key: string): string | null {
  const k = norm(key);
  for (const [event, line] of medals) {
    const n = norm(event);
    if (n === k || (k === 'relay' && /\brelay\b/.test(n))) return line;
  }
  return null;
}

/* The catch-all option a race question carries, for a winner nobody listed. */
export const OTHER_OPTION = /^(someone else|another nation)$/i;

/** The option a result line settles: the option it names; or, when the question has a
 *  catch-all ("Someone else") and the line names none of the listed riders, the
 *  catch-all. 🔴 A listed rider's SURNAME in the line with no full match (a spelling the
 *  page uses and the option does not - "Katarzyna" for "Kasia") answers nothing and
 *  waits, rather than paying the catch-all for a rider who was on the list. */
export function pickOption(options: string[], line: string): string | null {
  const named = options.filter((o) => !OTHER_OPTION.test(o));
  const hit = matchOption(named, line);
  if (hit) return hit;
  const other = options.find((o) => OTHER_OPTION.test(o));
  if (!other) return null;
  const l = ' ' + norm(line) + ' ';
  const near = named.some((o) => {
    const last = norm(String(o).split(',')[0]).split(' ').pop() || '';
    return last.length >= 3 && l.includes(' ' + last + ' ');
  });
  return near ? null : other;
}

/** A category heading on the page for a question: the question's `source.key`, or its
 *  text. Headings on the page are full ("Outstanding Lead Actor in a Drama Series"). */
export function findCategory(winners: Map<string, string>, key: string): string | null {
  const k = norm(key);
  for (const [head, line] of winners) if (norm(head) === k) return line;
  return null;
}
