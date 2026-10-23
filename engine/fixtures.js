// League size and the fixture list. Teams are always an even number so every matchday has everyone playing.
import { makeRng, shuffle } from "./rng.js";

// How many teams a lobby plays with, given the number of human managers (CPU teams fill the rest).
export function teamsFor(managers) {
  let n = Math.max(10, managers);
  if (n % 2) n++;
  if (n >= 17 && n <= 19) n = 20;
  return Math.min(30, n);
}
// 10-16 teams play everyone twice; 20-30 play everyone once.
export const legsFor = (teams) => (teams <= 16 ? 2 : 1);
export const matchesPerTeam = (teams) => (teams - 1) * legsFor(teams);

// Circle-method round robin: returns matchdays, each a list of [teamIndexA, teamIndexB].
export function schedule(teams, seed = 0) {
  const order = shuffle([...Array(teams).keys()], makeRng(seed, "fixtures"));
  const n = teams, rounds = [];
  const arr = order.slice();
  for (let r = 0; r < n - 1; r++) {
    const day = [];
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i], b = arr[n - 1 - i];
      day.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(day);
    arr.splice(1, 0, arr.pop());
  }
  if (legsFor(teams) === 2) {
    const second = rounds.map((d) => d.map(([a, b]) => [b, a]));
    return rounds.concat(second);
  }
  return rounds;
}

// Table: 3-1-0, tie-break goal difference, then goals scored, then team index (stable).
export function standingsOf(results, teams) {
  const rows = [...Array(teams).keys()].map((i) => ({ i, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }));
  for (const m of results) {
    const [a, b] = [rows[m.a], rows[m.b]];
    a.p++; b.p++; a.gf += m.ga; a.ga += m.gb; b.gf += m.gb; b.ga += m.ga;
    if (m.ga > m.gb) { a.w++; b.l++; a.pts += 3; } else if (m.ga < m.gb) { b.w++; a.l++; b.pts += 3; } else { a.d++; b.d++; a.pts++; b.pts++; }
  }
  rows.forEach((r) => (r.gd = r.gf - r.ga));
  return rows.sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.i - y.i);
}
