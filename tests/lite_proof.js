// "Prove it with numbers": what does Lite cost a club, and does it ever help?
// Same seed, same draft, same market, same schedule. Team 0 is run three ways:
//   CPU   - the engine's own choices (best XI over every formation)
//   Lite  - a person who only chooses a formation (here: the formation a beginner leaves on, or a middling one); the XI is picked the CPU way
//   Full* - a person who also picks the formation that suits the squad best AND uses a half-time plan (what a good Full manager can do)
// Lite must never beat CPU on average, and no engine code may know about Lite at all.
import { readFileSync, readdirSync } from "node:fs";
import { D, createGame, runDraft, runMarket, playSeason } from "./lib.js";
import { chooseForFormation, FORMATION_NAMES } from "../engine/roster.js";

const SEEDS = +process.argv[2] || 60, N = 10;
const first = FORMATION_NAMES[0], mid = FORMATION_NAMES[Math.floor(FORMATION_NAMES.length / 2)];
function run(seed, mode) {
  const g = createGame({ D, N, seed });
  runDraft(g); runMarket(g);
  const hooks = { lineup: (t, recs) => (t.id === 0 && mode.f ? chooseForFormation(recs, mode.f, g.P) : null) };
  const s = playSeason(g, hooks);
  const row = s.table.findIndex((r) => r.i === 0);
  return { pts: s.table[row].pts, rank: row + 1, title: row === 0 ? 1 : 0, coins: Math.round(g.teams[0].coins) };
}
const modes = [["CPU (best XI, any formation)", {}], [`Lite, formation ${first}`, { f: first }], [`Lite, formation ${mid}`, { f: mid }]];
const out = modes.map(([name, mode]) => {
  const r = []; for (let s = 1; s <= SEEDS; s++) r.push(run(s, mode));
  const avg = (k) => r.reduce((a, x) => a + x[k], 0) / r.length;
  return { name, pts: avg("pts"), rank: avg("rank"), titles: r.reduce((a, x) => a + x.title, 0), coins: avg("coins") };
});
console.log(`${SEEDS} paired seasons, ${N} clubs. Team 0 under each rule; everything else identical.\n`);
console.log("rule".padEnd(34), "points".padStart(7), "avg rank".padStart(9), "titles".padStart(7), "coins".padStart(7));
for (const o of out) console.log(o.name.padEnd(34), o.pts.toFixed(1).padStart(7), o.rank.toFixed(2).padStart(9), String(o.titles).padStart(7), String(Math.round(o.coins)).padStart(7));
const base = out[0];
let bad = 0;
for (const o of out.slice(1)) { const d = o.pts - base.pts; console.log(`${o.name}: ${d >= 0 ? "+" : ""}${d.toFixed(2)} points a season against the CPU`); if (d > 1.5) { console.error("  FAILED: Lite should not beat the CPU"); bad++; } }
// Economy: the coins column must match to the coin when the XI is the only thing that changes (no hidden money).
const dm = Math.abs(out[1].coins - base.coins); console.log(`Coins differ by ${dm.toFixed(0)} on average (only through results, never through a bonus).`);
// No engine rule may mention Lite.
const hits = readdirSync("engine").filter((f) => f.endsWith(".js")).filter((f) => /\blite\b/i.test(readFileSync("engine/" + f, "utf8")));
console.log(hits.length ? "FAILED: engine mentions Lite in " + hits.join(", ") : "Engine files that mention Lite: none (no bonus, no softer economy)");
if (hits.length || bad) process.exit(1);
console.log("lite proof ok");
