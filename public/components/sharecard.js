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
const BG = '#120a0e', INK = '#f4eff0', DIM = '#b6a8ac', GOLD = '#E0A93B', LINE = '#3a2c31';
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

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/**
 * @param state the held live state
 * @param call  a settled call: { label, stake, pays, delta, landed }
 * @returns a PNG Blob, or null if the browser cannot produce one
 */
export async function shareCardBlob(state, call) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return null;

  c.fillStyle = BG; c.fillRect(0, 0, W, H);

  /* --- the mark, completing --- */
  c.font = `800 30px ${FONT}`;
  c.fillStyle = DIM;
  c.fillText('ANY GIVEN ', 72, 96);
  const stem = c.measureText('ANY GIVEN ').width;
  c.fillStyle = GOLD;
  c.fillText('SNAP', 72 + stem, 96);

  /* --- the crests and the matchup --- */
  const league = (state.sport === 'nfl' || String(state.gameId || '').length === 0) ? 'nfl' : 'ncaa';
  const away = state.teams?.[state.awayTeamId], home = state.teams?.[state.homeTeamId];
  const [ai, hi] = await Promise.all([
    load(`/logos/${league}/500-dark/${state.awayTeamId}.png`),
    load(`/logos/${league}/500-dark/${state.homeTeamId}.png`)
  ]);
  let x = 72;
  if (ai) { c.drawImage(ai, x, 150, 84, 84); x += 104; }
  c.font = `600 30px ${FONT}`; c.fillStyle = DIM;
  c.fillText(`${state.awayScore} – ${state.homeScore}`, x, 205); x += c.measureText(`${state.awayScore} – ${state.homeScore}`).width + 24;
  if (hi) { c.drawImage(hi, x, 150, 84, 84); }

  c.font = `600 26px ${FONT}`; c.fillStyle = DIM;
  const match = away && home ? `${away.short} at ${home.short}` : 'the game';
  c.fillText(match, 72, 285);

  /* --- 🔴 THE RESULT, WHICH IS THE ONLY REASON ANYBODY POSTS THIS --- */
  const won = call && call.landed === true;
  c.font = `800 76px ${FONT}`;
  c.fillStyle = INK;
  const verb = won ? 'Called it.' : 'Called it wrong.';
  c.fillText(verb, 72, 380);

  if (call) {
    /* The tile, drawn as the tile — the thing they tapped, at the price it
     * showed BEFORE the tap. That is the product's whole claim and it belongs on
     * the picture. */
    const tw = 470, th = 116, ty = 420;
    roundRect(c, 72, ty, tw, th, 16);
    c.fillStyle = won ? 'rgba(224,169,59,.14)' : 'rgba(255,107,94,.12)';
    c.fill();
    c.lineWidth = 3; c.strokeStyle = won ? GOLD : '#ff6b5e'; c.stroke();

    c.font = `800 34px ${FONT}`; c.fillStyle = INK;
    c.fillText(call.label, 100, ty + 48);
    c.font = `600 24px ${FONT}`; c.fillStyle = won ? GOLD : '#ff6b5e';
    const sign = (call.delta > 0 ? '+' : '') + call.delta;
    c.fillText(`${sign} Marbles · ${call.pays}×`, 100, ty + 88);
  }

  /* --- the foot --- */
  c.font = `700 24px ${FONT}`; c.fillStyle = INK;
  c.fillText('anygiven.app', 72, H - 52);
  c.font = `400 24px ${FONT}`; c.fillStyle = DIM;
  c.fillText('call the play before the snap', 72 + c.measureText('anygiven.app ').width + 14, H - 52);

  c.strokeStyle = LINE; c.lineWidth = 1;
  c.beginPath(); c.moveTo(72, H - 92); c.lineTo(W - 72, H - 92); c.stroke();

  return new Promise((res) => cv.toBlob((b) => res(b), 'image/png'));
}

/**
 * Share it as a FILE where the browser can, and fall back rather than fail.
 *
 * 🔴 THE CAPABILITY CHECK IS canShare({files}), NOT `navigator.share`. Plenty of
 * browsers expose share and refuse files, and the difference only appears as a
 * rejected promise at the moment somebody taps — which is the worst possible
 * time to discover it.
 */
export async function shareResult(state, call, text) {
  const blob = await shareCardBlob(state, call).catch(() => null);
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

/* ------------------------------------------------------------------ *
 * REACTION CARDS
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
  called_it:    { word: 'CALLED IT',   tint: '#E0A93B' }
};

export async function reactionBlob(state, momentKey, line) {
  const m = MOMENTS[momentKey] || MOMENTS.called_it;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  if (!c) return null;

  c.fillStyle = BG; c.fillRect(0, 0, W, H);

  /* A band of the moment's own colour down the left edge — enough to make the
   * card recognisable in a feed at thumbnail size, which is the only size that
   * matters for something people scroll past. */
  c.fillStyle = m.tint; c.fillRect(0, 0, 18, H);

  const league = state.sport === 'nfl' ? 'nfl' : 'ncaa';
  const away = state.teams?.[state.awayTeamId], home = state.teams?.[state.homeTeamId];
  const [ai, hi] = await Promise.all([
    load(`/logos/${league}/500-dark/${state.awayTeamId}.png`),
    load(`/logos/${league}/500-dark/${state.homeTeamId}.png`)
  ]);

  /* 🔴 THE WORD IS THE PICTURE. It is sized to fill, because a reaction card
   * read at thumbnail size has room for exactly one thing. */
  let size = 132;
  c.font = `800 ${size}px ${FONT}`;
  while (c.measureText(m.word).width > W - 200 && size > 56) {
    size -= 6; c.font = `800 ${size}px ${FONT}`;
  }
  c.fillStyle = m.tint;
  c.fillText(m.word, 72, 250);

  if (line) {
    c.font = `600 34px ${FONT}`; c.fillStyle = INK;
    /* One line, trimmed rather than wrapped: a play description that runs to two
     * lines is a paragraph, and this is a reaction. */
    let t = line;
    while (c.measureText(t).width > W - 160 && t.length > 12) t = t.slice(0, -2);
    c.fillText(t + (t.length < line.length ? '…' : ''), 72, 316);
  }

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

export async function shareReaction(state, momentKey, line, text) {
  const blob = await reactionBlob(state, momentKey, line).catch(() => null);
  if (!blob) return 'unsupported';
  const file = new File([blob], 'any-given-snap.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], text }); return 'shared'; }
    catch { return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'any-given-snap.png';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
