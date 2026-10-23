// Tanking test: does deliberately losing season 1 (worst line-up every match) pay off later?
// Same seeds, team 0 either plays honestly or throws season 1. Compares points and titles over the next seasons.
import { setup, playSeason, rosterOf, teamStrength, fmt } from "./lib.js";
import { runOffseason } from "../engine/game.js";
import { D } from "./lib.js";
const G = +process.argv[2] || 100, N = +process.argv[3] || 10, S = +process.argv[4] || 3;
const params = process.argv[5] ? JSON.parse(process.argv[5]) : {};
function worst(roster) {
  const gkP = roster.filter((p) => p.pos !== "GK").sort((a, b) => a.ovr - b.ovr)[0] || roster[0];
  const rest = roster.filter((p) => p !== gkP).sort((a, b) => a.ovr - b.ovr).slice(0, 5);
  return { formation: "2-2-1", gk: gkP.id, out: rest.map((p) => p.id) };
}
function run(seed, tank) {
  const g = setup({ N, seed, params });
  const hooks = { lineup: (t, r) => (tank && g.season === 1 && t.id === 0 ? worst(r) : null), halftime: (t, r) => (tank && g.season === 1 && t.id === 0 ? worst(r) : null) };
  const out = [];
  for (let s = 1; s <= S; s++) {
    const str = g.teams.map((t) => teamStrength(rosterOf(g, t), g.P)), rank = [...str].sort((a, b) => b - a).indexOf(str[0]) + 1;
    const res = playSeason(g, hooks);
    const row = res.table.find((r) => r.i === 0);
    out.push({ pts: row.pts, pos: res.table.findIndex((r) => r.i === 0) + 1, title: res.champion.id === 0, rank, coins: g.teams[0].coins });
    if (s < S) runOffseason(g, D, { table: res.table });
  }
  return out;
}
const sum = (rows, f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
const A = [], B = [];
for (let k = 0; k < G; k++) { A.push(run(7000 + k, false)); B.push(run(7000 + k, true)); }
console.log(`${G} games, N=${N}, ${S} seasons. Team 0 honest vs tanking season 1.`);
for (let s = 0; s < S; s++) {
  const f = (arr, fn) => fmt(sum(arr, (r) => fn(r[s])), 2);
  console.log(`season ${s + 1}: points ${f(A, (x) => x.pts)} vs ${f(B, (x) => x.pts)} | position ${f(A, (x) => x.pos)} vs ${f(B, (x) => x.pos)} | titles ${fmt(100 * sum(A, (r) => +r[s].title), 0)}% vs ${fmt(100 * sum(B, (r) => +r[s].title), 0)}% | roster strength rank at start ${f(A, (x) => x.rank)} vs ${f(B, (x) => x.rank)} | coins after ${f(A, (x) => x.coins)} vs ${f(B, (x) => x.coins)}`);
}
const tot = (arr, a, b) => fmt(sum(arr, (r) => r.slice(a, b).reduce((x, y) => x + y.pts, 0)), 1);
console.log(`points seasons 2-${S}: honest ${tot(A, 1, S)} | tank ${tot(B, 1, S)} ; all seasons: honest ${tot(A, 0, S)} | tank ${tot(B, 0, S)}`);
console.log(`titles over seasons 2-${S}: honest ${fmt(100 * sum(A, (r) => r.slice(1).filter((x) => x.title).length), 0)}% | tank ${fmt(100 * sum(B, (r) => r.slice(1).filter((x) => x.title).length), 0)}% (per game, sum over seasons)`);
