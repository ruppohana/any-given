/* THE SHARE CARD, DRAWN IN THE BROWSER AS A REAL IMAGE FILE.
 *
 * 🔴 WHY A CANVAS AND NOT THE og:image. Jason: "Can I not generate a custom
 * image?" Not through X's web intent — /intent/tweet takes text, url, hashtags
 * and via, and there is no media parameter; attaching one needs the API with
 * OAuth. The og:image is the workaround, and it has a hard limit: it is ONE
 * picture per URL, cached hard by the crawler. It can say which game is on. It
 * can never say what YOU just called.
 *
 * Web Share Level 2 can. `navigator.share({ files: [...] })` hands the share
 * sheet an actual file, and choosing X drops it into the composer as a genuine
 * attachment. Safari on iOS has supported it since 15, which is the device this
 * gets used on.
 *
 * 🔴 EVERYTHING IT DRAWS IS SAME-ORIGIN. The crests come from /logos/, which we
 * self-host — a canvas that has drawn one cross-origin image is TAINTED, and
 * toBlob on a tainted canvas throws SecurityError. Hot-linking ESPN would have
 * made this feature impossible, which is a second reason the scrape was worth
 * doing.
 */

const W = 1200, H = 630;
const BG = '#120a0e', INK = '#f4eff0', DIM = '#b6a8ac', GOLD = '#E0A93B';
const FONT = '-apple-system, "Segoe UI", system-ui, sans-serif';

function load(src) {
  return new Promise((res) => {
    const i = new Image();
    /* No crossOrigin attribute: these are same-origin and asking for CORS on a
     * same-origin request is a way to fail for no reason. */
    i.onload = () => res(i);
    i.onerror = () => res(null);       // a missing crest is a gap, never a throw
    i.src = src;
  });
}

/* 🔴 TEXT WRAPS; IT IS NEVER CUT. Jason, 2026-09-11: "if there is a second line
 * or third line of text we cannot just show. …" So a line is broken on words to
 * fit, and when it still runs past `most` lines the type steps down a size
 * rather than ending in an ellipsis. Only a sentence too long for the smallest
 * size is cut, and a cleaned play line never is. */
function wrapLines(c, text, max) {
  const out = [];
  let cur = '';
  for (const w of String(text).split(/\s+/)) {
    const t = cur ? cur + ' ' + w : w;
    if (cur && c.measureText(t).width > max) { out.push(cur); cur = w; } else cur = t;
  }
  if (cur) out.push(cur);
  return out;
}
function fitLines(c, text, weight, sizes, most, max) {
  let lines = [], size = sizes[0];
  for (size of sizes) {
    c.font = `${weight} ${size}px ${FONT}`;
    lines = wrapLines(c, text, max);
    if (lines.length <= most) return { lines, size };
  }
  return { lines: lines.slice(0, most), size };
}

/* ------------------------------------------------------------------ *
 * THE CARD
 * ------------------------------------------------------------------ */

/**
 * 🔴 A PICTURE ABOUT THE GAME THAT HAPPENS TO CARRY US. Jason: "Can we not make
 * generic touchdown images? For people to hit during the game... It would be
 * awesome advertising, no?" Yes, and the reason it works is the reason an advert
 * usually does not: NOBODY POSTS AN ADVERT, and everybody posts a touchdown.
 *
 * The card is the moment, at the size a moment deserves, with the real score and
 * the real crests on it — and the wordmark in the corner where a broadcaster
 * would put a bug. If it is good enough to send because SEATTLE JUST SCORED, the
 * app travels with it for free. If it is a poster for us with a score on it, it
 * gets sent by nobody and we have learned nothing.
 *
 * They are drawn from the SAME state the board is drawn from, so the score on a
 * shared picture is the score the app was showing — including the delay. A
 * reaction card that leaks a play the sender has not seen would be the one place
 * this app spoils its own mechanic.
 */
export const MOMENTS = {
  touchdown:    { word: 'TOUCHDOWN',   tint: '#3fbf6a' },
  turnover:     { word: 'TURNOVER',    tint: '#ff6b5e' },
  fourth_down:  { word: 'THEY WENT FOR IT', tint: '#E0A93B' },
  field_goal:   { word: 'IT IS GOOD',  tint: '#E0A93B' },
  big_play:     { word: 'HOUSE CALL',  tint: '#E0A93B' },
  called_it:    { word: 'CALLED IT',   tint: '#E0A93B' },
  /* Jason, 2026-09-11: "We want people to post to x and share texts. Fun facts,
   * scores, turnovers. Final scores." */
  final:        { word: 'FINAL',       tint: '#E0A93B' },
  fun_fact:     { word: 'DID YOU KNOW', tint: '#5b8def' }
};

/** One layout for every card: the word, the line under it, the score, the bug. */
async function drawCard(state, m, line, isFact) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return null;

  c.fillStyle = BG; c.fillRect(0, 0, W, H);

  /* A band of the moment's own color down the left edge — enough to make the
   * card recognizable in a feed at thumbnail size, which is the only size that
   * matters for something people scroll past. */
  c.fillStyle = m.tint; c.fillRect(0, 0, 18, H);

  const league = state.sport === 'nfl' ? 'nfl' : 'ncaa';
  const away = state.teams?.[state.awayTeamId], home = state.teams?.[state.homeTeamId];
  const [ai, hi] = await Promise.all([
    load(`/logos/${league}/500-dark/${state.awayTeamId}.png`),
    load(`/logos/${league}/500-dark/${state.homeTeamId}.png`)
  ]);

  if (isFact && line) {
    /* 🔴 A FACT CARD IS THE FACT. A fun or odd fact is a sentence of up to 140
     * characters, so it gets the big type, and the crests and matchup sit under
     * it, small. */
    c.font = `800 64px ${FONT}`; c.fillStyle = m.tint;
    c.fillText(m.word, 72, 150);
    const f = fitLines(c, line, 700, [44, 38, 32], 5, W - 160);
    c.fillStyle = INK;
    f.lines.forEach((t, i) => c.fillText(t, 72, 226 + i * (f.size + 14)));
    let fx = 72;
    const fy = 488;
    if (ai) { c.drawImage(ai, fx, fy, 64, 64); fx += 76; }
    if (hi) { c.drawImage(hi, fx, fy, 64, 64); fx += 80; }
    if (away && home) {
      c.font = `600 28px ${FONT}`; c.fillStyle = DIM;
      c.fillText(`${away.short} at ${home.short}`, fx, fy + 44);
    }
  } else {
    /* The line under the word wraps to three, and the WORD moves up to make
     * room - the score band below stays where it is, so every card in a feed
     * has its score in the same place. */
    const f = line ? fitLines(c, line, 600, [34, 30, 26], 3, W - 160) : { lines: [], size: 34 };
    const lh = f.size + 10;
    const wordY = 250 - lh * Math.max(0, f.lines.length - 1);

    /* 🔴 THE WORD IS THE PICTURE. It is sized to fill, because a card read at
     * thumbnail size has room for exactly one thing. */
    let size = 132;
    c.font = `800 ${size}px ${FONT}`;
    while (c.measureText(m.word).width > W - 200 && size > 56) {
      size -= 6; c.font = `800 ${size}px ${FONT}`;
    }
    c.fillStyle = m.tint;
    c.fillText(m.word, 72, wordY);

    c.font = `600 ${f.size}px ${FONT}`; c.fillStyle = INK;
    f.lines.forEach((t, i) => c.fillText(t, 72, wordY + 66 + i * lh));

    /* The score, big, with the crests either side. */
    let x = 72;
    if (ai) { c.drawImage(ai, x, 384, 92, 92); x += 112; }
    c.font = `800 88px ${FONT}`; c.fillStyle = INK;
    const sc = `${state.awayScore} – ${state.homeScore}`;
    c.fillText(sc, x, 458); x += c.measureText(sc).width + 28;
    if (hi) { c.drawImage(hi, x, 384, 92, 92); }

    if (away && home) {
      c.font = `600 26px ${FONT}`; c.fillStyle = DIM;
      c.fillText(`${away.short} at ${home.short}`, 72, 520);
    }
  }

  /* The bug, bottom right, where a broadcaster puts one. */
  c.font = `800 26px ${FONT}`;
  const bug = 'ANY GIVEN ', tail = 'SNAP';
  const bw = c.measureText(bug).width + c.measureText(tail).width;
  c.fillStyle = DIM; c.fillText(bug, W - 72 - bw, H - 56);
  c.fillStyle = GOLD; c.fillText(tail, W - 72 - bw + c.measureText(bug).width, H - 56);
  c.font = `400 20px ${FONT}`; c.fillStyle = DIM;
  const u = 'anygiven.app';
  c.fillText(u, W - 72 - c.measureText(u).width, H - 26);

  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

export function reactionBlob(state, momentKey, line) {
  return drawCard(state, MOMENTS[momentKey] || MOMENTS.called_it, line, momentKey === 'fun_fact');
}

/**
 * The brag: a call that landed.
 *
 * 🔴 THE CALL IS THE WORD. Jason, 2026-09-11: "Called it and called it wrong
 * seem stupid." The old card led with "Called it." and put the call in a small
 * box underneath. Now it is the same card as TOUCHDOWN, with the thing they
 * called as the word - PASS, FIRST DOWN - and the product's whole claim as the
 * line: the price it showed BEFORE the snap, and what it paid. There is no
 * losing version: the brag is only offered for a call that landed, and nobody
 * posts the one they lost.
 *
 * @param call a settled call: { label, stake, pays, delta, landed }
 */
export function shareCardBlob(state, call) {
  if (!call) return reactionBlob(state, 'called_it', '');
  const sign = (call.delta > 0 ? '+' : '') + call.delta;
  const line = call.landed === true
    ? `Before the snap, at ${call.pays}×. ${sign} Marbles.`
    : `Before the snap, at ${call.pays}×.`;
  return drawCard(state, { word: String(call.label || '').toUpperCase(), tint: GOLD }, line, false);
}

/**
 * Share it as a FILE where the browser can, and fall back rather than fail.
 *
 * 🔴 THE CAPABILITY CHECK IS canShare({files}), NOT `navigator.share`. Plenty of
 * browsers expose share and refuse files, and the difference only appears as a
 * rejected promise at the moment somebody taps — which is the worst possible
 * time to discover it.
 */
async function shareBlob(blob, text) {
  if (!blob) return 'unsupported';
  const file = new File([blob], 'any-given-snap.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; }
    catch { return 'cancelled'; }      // they closed the sheet; not a failure
  }

  /* No file sharing: hand them the picture instead of nothing. */
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'any-given-snap.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}

export async function shareResult(state, call, text) {
  return shareBlob(await shareCardBlob(state, call).catch(() => null), text);
}

export async function shareReaction(state, momentKey, line, text) {
  return shareBlob(await reactionBlob(state, momentKey, line).catch(() => null), text);
}
