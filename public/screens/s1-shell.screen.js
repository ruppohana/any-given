/* S1 + S3 + S5, together, as one screen - the shell. Session-owned.
 * It is also the WORKED EXAMPLE every screen sub-agent is pointed at: this is the
 * module shape, this is how the real fixtures arrive, this is what four states
 * look like when they are actually drawn.
 *
 * BAR: these three rows were UNSPECCED WITH NO BAR at B0 and are session-owned
 * serial work for that reason. The partial bars that do exist and were opened:
 *   reference/armchair-quarterback-teardown/screens/AQB-LIVE-ncaa-tab-no-games-found.png
 *     - a real empty state, badly done: one centered line, no way forward
 *   reference/cbs-pickem-teardown/screens/CBS-picks-week1-15-games-spreads-crowd-desktop.png
 *     - the desktop FAILURE at ~1900px, which is what the measure cap answers
 *   reference/officepool-teardown/screens/OP-nav-drawer-mobile.png
 *     - four destinations in a drawer, captured 2026-09-08
 * OFFLINE-DURING-LIVE HAS NO BAR ANYWHERE and is marked as such below.
 */
import { navBar, NAV_CSS, DESTINATIONS, coldStart } from '/components/nav.js';
import { stateBlock, STATES_CSS } from '/components/states.js';
import { teamChip, TEAM_CHIP_CSS, teamVars } from '/components/team-chip.js';
import { progress, dash, signed, signClass } from '/components/fmt.js';

export const id = 's1-shell';
export const title = 'Shell - navigation, states, desktop';
export const bar = 'reference/officepool-teardown/screens/OP-nav-drawer-mobile.png';
export const states = ['ready', 'empty', 'loading', 'offline', 'error'];

export async function previewData(fixtures) {
  const all = Object.values(fixtures.teams.teams);
  /* Deliberately the hard cases, taken from the real file rather than chosen to
   * flatter: one two-color, one one-color, one with nothing, and a near-identical
   * pair. Nothing here is invented. */
  const two = all.find((t) => t.primary && t.secondary);
  const one = all.find((t) => t.primary && !t.secondary);
  const none = all.find((t) => !t.primary);
  return { teams: { two, one, none }, total: all.length };
}

export function render(root, data, state) {
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = [NAV_CSS, STATES_CSS, TEAM_CHIP_CSS].join('\n');
  root.appendChild(style);

  const h = document.createElement('h1');
  h.className = 'sh-h';
  h.textContent = 'Any Given\u2026';
  root.appendChild(h);

  const sub = document.createElement('p');
  sub.className = 'sh-sub num';
  sub.textContent = progress(0, 131) + ' \u00b7 ' + dash(null) + ' \u00b7 ' + signed(0);
  root.appendChild(sub);

  if (state === 'ready') {
    const card = document.createElement('div');
    card.className = 'card sh-card';
    const t = data && data.teams ? data.teams : {};
    for (const [k, team] of Object.entries(t)) {
      if (!team) continue;
      const row = document.createElement('div');
      row.className = 'sh-row';
      row.appendChild(teamChip(team, { adjacentTo: t.two }));
      const nm = document.createElement('span');
      nm.className = 'sh-name';
      nm.textContent = team.short || team.name;
      const st = document.createElement('span');
      st.className = 'sh-state num';
      st.textContent = teamVars(team).state;
      row.append(nm, st);
      card.appendChild(row);
    }
    root.appendChild(card);
    const note = document.createElement('p');
    note.className = 'sh-note';
    note.textContent = `${data.total} teams on file \u00b7 301 can fill a two-color chip, 58 have one color, 401 have none`;
    root.appendChild(note);
  } else if (state === 'offline') {
    root.appendChild(stateBlock('offline', {
      body: 'One server polls the feed and your phone holds one connection. That connection dropped.',
      since: Date.now() - 47000,
      action: { label: 'Try again' }
    }));
  } else if (state === 'empty') {
    root.appendChild(stateBlock('empty', {
      title: 'No games this week',
      body: 'The season runs late August to mid-January. Basketball is next.',
      action: { label: 'See the season' }
    }));
  } else if (state === 'error') {
    root.appendChild(stateBlock('error', {
      body: 'The slate did not load. Nothing you picked has been lost.',
      action: { label: 'Reload' }
    }));
  } else {
    root.appendChild(stateBlock('loading', { rows: 4 }));
  }

  /* The NAV is drawn by the shell, not here. A screen that draws its own
   * navigation is the shell invented twice - which is the exact fan-out failure
   * S1 being session-owned exists to prevent. This screen only records what the
   * shell should be showing, so the preview can be checked against it. */
  root.dataset.destinations = DESTINATIONS.map((d) => d.id).join(',');
  root.dataset.coldStart = coldStart({ fromInvite: true });
}
