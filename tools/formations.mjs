// Formation balance: the same squad plays itself in every pair of formations. With equal players a formation should
// land near 50% against each rival. Also prints goals, shots and possession per formation.
//   node tools/formations.mjs [squads=24] [matchesPerPair=60] ['{"shape":{...}}']
import { loadData } from "../engine/data.js";
import { createGame, runDraft, runMarket, rosterOf } from "../engine/game.js";
import { playMatch } from "../engine/match.js";
import { chooseForFormation, FORMATION_NAMES } from "../engine/roster.js";
import { withParams } from "../engine/params.js";
const NS = +process.argv[2] || 24, R = +process.argv[3] || 60, over = process.argv[4] ? JSON.parse(process.argv[4]) : {};
const D = loadData(), P = withParams(over), F = FORMATION_NAMES;
const squads = [];
for (let s = 0; squads.length < NS; s++) {
  const g = createGame({ D, N: 10, seed: 900 + s, params: over }); runDraft(g); runMarket(g);
  for (const t of g.teams) { const r = rosterOf(g, t); if (r.length >= 8 && squads.length < NS) squads.push(r.map((p) => ({ ...p, stam: 100 }))); }
}
const n = F.length, sc = F.map(() => F.map(() => 0)), cnt = F.map(() => F.map(() => 0));
const agg = F.map(() => ({ gf: 0, ga: 0, sf: 0, sa: 0, poss: 0, m: 0 }));
let seed = 1;
for (const players of squads) {
  const L = F.map((f) => chooseForFormation(players, f, P));
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) for (let k = 0; k < R; k++) {
    const flip = (i + j + k) % 2 === 1, a = flip ? j : i, b = flip ? i : j;
    const res = playMatch({ seed: ++seed, matchKey: "f" + seed, P,
      home: { id: 0, name: "A", players, lineup: L[a], fx: {} }, away: { id: 1, name: "B", players, lineup: L[b], fx: {} } });
    const [ga, gb] = res.score, pa = res.flow.reduce((x, f) => x + f.ph, 0) / res.flow.length;
    for (const [fi, fo, gf, go, sf, so, po] of [[a, b, ga, gb, res.shots[0], res.shots[1], pa], [b, a, gb, ga, res.shots[1], res.shots[0], 1 - pa]]) {
      const me = fi === i && fo === j ? 1 : fi === j && fo === i ? 0 : 1; // orientation: row formation i vs column j
      const rowIsFi = fi === i;
      if (rowIsFi) { sc[i][j] += gf > go ? 1 : gf === go ? 0.5 : 0; cnt[i][j]++; }
      if (i === j && !rowIsFi) { /* mirror counted once via row */ }
      const x = agg[fi]; x.gf += gf; x.ga += go; x.sf += sf; x.sa += so; x.poss += po; x.m++;
    }
  }
}
const pct = (x) => (100 * x).toFixed(0).padStart(4);
console.log("win share of ROW formation vs COLUMN (equal squads; draw = half):");
console.log("".padEnd(11) + F.map((f) => f.slice(0, 9).padStart(10)).join("") + "     avg");
F.forEach((f, i) => {
  const row = F.map((_, j) => sc[i][j] / cnt[i][j]);
  const avg = row.filter((_, j) => j !== i).reduce((a, b) => a + b, 0) / (n - 1);
  console.log(f.padEnd(11) + row.map((v) => pct(v).padStart(10)).join("") + pct(avg).padStart(8));
});
console.log("\nper match:  goals for  goals against  shots for  shots against  possession%");
F.forEach((f, i) => { const x = agg[i]; console.log(f.padEnd(11) + [x.gf / x.m, x.ga / x.m, x.sf / x.m, x.sa / x.m].map((v) => v.toFixed(2).padStart(10)).join("") + (100 * x.poss / x.m).toFixed(1).padStart(12)); });
const all = agg.reduce((a, x) => ({ g: a.g + x.gf, s: a.s + x.sf, m: a.m + x.m }), { g: 0, s: 0, m: 0 });
console.log(`\nall: ${(2 * all.g / all.m).toFixed(2)} goals/match, ${(2 * all.s / all.m).toFixed(2)} shots/match`);
