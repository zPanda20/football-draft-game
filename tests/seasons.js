// Several seasons in a row with CPU managers: does supply hold up, who retires, how does quality drift?
import { D, createGame, runDraft, runMarket, playSeason, rosterOf, table, fmt } from "./lib.js";
import { runOffseason } from "../engine/game.js";
const N = +process.argv[2] || 20, S = +process.argv[3] || 5, seed = +process.argv[4] || 1;
const g = createGame({ D, N, seed });
runDraft(g); runMarket(g);
const rows = [];
const avgTop = (n) => { const l = Object.values(g.players).filter((p) => !p.retired && p.team != null).map((p) => p.ovr).sort((a, b) => b - a).slice(0, n); return l.reduce((a, b) => a + b, 0) / l.length; };
for (let s = 1; s <= S; s++) {
  const sea = playSeason(g);
  const champ = sea.champion;
  const before = { top30: avgTop(30), owned: Object.values(g.players).filter((p) => p.team != null).length };
  if (s === S) { rows.push([s, champ.name, fmt(before.top30), "-", "-", "-", "-", "-"]); break; }
  const o = runOffseason(g, D);
  const short = g.teams.filter((t) => t.filled).length;
  const gkTeams = g.teams.filter((t) => rosterOf(g, t).some((p) => p.pos === "GK")).length;
  rows.push([s, champ.name, fmt(before.top30), o.retired.length, o.released.length, g.pool.length, short, `${gkTeams}/${N}`]);
  g.teams.forEach((t) => (t.filled = 0));
  if (s === 1) console.log("retired after season 1:", o.retired.filter((r) => r.forced).map((r) => g.players[r.id].name).join(", "));
}
table(rows, ["season", "champion", "top-30 ovr", "retired", "released", "pool", "auto-filled", "have GK"]);
console.log("coins:", g.teams.map((t) => Math.round(t.coins)).join(" "));
console.log("roster sizes:", g.teams.map((t) => t.players.length).join(" "));
