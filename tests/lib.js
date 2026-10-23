import { loadData } from "../engine/data.js";
import { createGame, runDraft, runMarket, playSeason, rosterOf } from "../engine/game.js";
import { teamStrength } from "../engine/roster.js";
export const D = loadData();
export const fmt = (x, d = 1) => (x == null || Number.isNaN(x) ? "-" : x.toFixed(d));
export function table(rows, head) {
  const all = [head, ...rows].map((r) => r.map(String));
  const w = head.map((_, i) => Math.max(...all.map((r) => r[i].length)));
  all.forEach((r, k) => { console.log(r.map((c, i) => (i ? c.padStart(w[i]) : c.padEnd(w[i]))).join("  ")); if (k === 0) console.log(w.map((n) => "-".repeat(n)).join("  ")); });
}
export function setup(opts) { const g = createGame({ D, ...opts }); runDraft(g); runMarket(g); return g; }
export { createGame, runDraft, runMarket, playSeason, rosterOf, teamStrength };
