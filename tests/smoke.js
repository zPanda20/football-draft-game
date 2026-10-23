import { D, setup, playSeason, rosterOf, teamStrength, table, fmt } from "./lib.js";
const N = +process.argv[2] || 20, seed = +process.argv[3] || 1;
const g = setup({ N, seed });
const t0 = Date.now();
const s = playSeason(g);
console.log(`N=${N} seed=${seed}: ${s.days} matchdays, ${s.results.length} matches in ${Date.now() - t0} ms`);
console.log(`goals/match ${fmt(s.results.reduce((a, m) => a + m.ga + m.gb, 0) / s.results.length, 2)}, draws ${fmt(100 * s.results.filter((m) => m.ga === m.gb).length / s.results.length, 0)}%`);
table(s.table.slice(0, 8).map((r, k) => {
  const t = g.teams[r.i];
  return [k + 1, t.name, t.bot, t.players.length, fmt(teamStrength(rosterOf(g, t), g.P)), r.w, r.d, r.l, r.gf + "-" + r.ga, r.pts, t.coins];
}), ["#", "team", "bot", "n", "str", "W", "D", "L", "GF-GA", "pts", "coins"]);
