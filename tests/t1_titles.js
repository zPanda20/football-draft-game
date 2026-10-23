// Who wins the title? By pre-season roster strength rank. Targets: strongest roster ~30%, top third ~70% (N=20).
import { setup, playSeason, rosterOf, teamStrength, table, fmt } from "./lib.js";
const G = +process.argv[2] || 200, N = +process.argv[3] || 20;
const params = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const byRank = new Array(N).fill(0), ptsRank = new Array(N).fill(0), arch = {}, archN = {};
let third = 0, goals = 0, matches = 0, draws = 0, last = 0;
for (let k = 0; k < G; k++) {
  const g = setup({ N, seed: 9000 + k, params });
  const str = g.teams.map((t) => teamStrength(rosterOf(g, t), g.P));
  const rank = str.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map((x) => x[1]);
  const s = playSeason(g);
  const champ = s.champion.id, pos = rank.indexOf(champ);
  byRank[pos]++; if (pos < Math.ceil(N / 3)) third++;
  s.table.forEach((row) => { ptsRank[rank.indexOf(row.i)] += row.pts; });
  arch[s.champion.bot] = (arch[s.champion.bot] || 0) + 1; g.teams.forEach((t) => (archN[t.bot] = (archN[t.bot] || 0) + 1));
  for (const m of s.results) { goals += m.ga + m.gb; matches++; if (m.ga === m.gb) draws++; }
}
console.log(`${G} seasons, N=${N}`);
console.log(`strongest roster wins ${fmt(100 * byRank[0] / G, 0)}%, top third wins ${fmt(100 * third / G, 0)}%; goals/match ${fmt(goals / matches, 2)}, draws ${fmt(100 * draws / matches, 0)}%`);
table(byRank.map((c, i) => [i + 1, fmt(100 * c / G, 1) + "%", fmt(ptsRank[i] / G, 1)]).slice(0, 10), ["roster rank", "titles", "avg pts"]);
table(Object.keys(arch).map((a) => [a, fmt(archN[a] / G, 1), fmt(100 * arch[a] / G, 0) + "%", fmt(100 * arch[a] / archN[a], 1) + "%"]), ["bot", "teams/season", "share", "per team"]);
