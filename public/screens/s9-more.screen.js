/* S9 - MORE. The sixth tab: everything that is not a game, a slate, your picks
 * or the standings.
 *
 * Jason, 2026-09-11: "i did not see the linked pages in the setting tab. we can
 * add another icon at the end of the bar for all the other pages?" The rules
 * screen was reachable only by typing #/rules, the home-screen walkthrough was
 * new, and the links put into #/settings sat on a screen nobody lands on - the
 * ⋮ menu is where settings actually are.
 *
 * A list of doors and nothing else. Each row says where it goes and what is
 * there, in one line, so nobody opens the wrong one to find out. Nothing on it
 * is data, so it can never be sample data either (`noSample`).
 */

export const id = 's9-more';
export const title = 'More - rules, the home screen walkthrough, privacy';
export const bar = null;
export const states = ['ready'];

const ROWS = [
  { h: 'Rules and how it works', b: 'Scoring, ties, cancelled games and what a call pays.', href: '#/rules' },
  { h: 'Put Any Given on your home screen', b: 'Step by step, with pictures. It opens full screen, like an app.', href: '/home-screen.html' },
  { h: 'Privacy', b: 'What we collect, why, and what we never do with it.', href: '/privacy.html' }
];

export async function previewData() {
  return { noSample: true };
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function render(root, data, state) {
  root.innerHTML = '';
  root.classList.add('scr-s9-more');

  const list = el('nav', 'card s9-list');
  list.setAttribute('aria-label', 'More');
  for (const r of ROWS) {
    const a = el('a', 's9-row');
    a.href = r.href;
    a.appendChild(el('span', 's9-t', r.h));
    a.appendChild(el('span', 's9-chev', '›'));
    a.appendChild(el('span', 's9-b', r.b));
    list.appendChild(a);
  }
  root.appendChild(list);
}
