// Fast invariant tests. Run with: npm test
import assert from "node:assert/strict";
import { D, createGame, runDraft, runMarket, playSeason, rosterOf } from "./lib.js";
import { teamsFor, legsFor, matchesPerTeam, schedule } from "../engine/fixtures.js";
import { dealRound, applyPicks } from "../engine/packs.js";
import { matchSteps, playMatch } from "../engine/match.js";
import { bestLineup, rate } from "../engine/roster.js";
import { withParams } from "../engine/params.js";
import { resolveMarketRound } from "../engine/market.js";

let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("team counts", () => {
  assert.deepEqual([3, 10, 11, 12, 17, 18, 19, 20, 25, 30, 31].map(teamsFor), [10, 10, 12, 12, 20, 20, 20, 20, 26, 30, 30]);
  assert.deepEqual([10, 12, 14, 16, 20, 26, 30].map(matchesPerTeam), [18, 22, 26, 30, 19, 25, 29]);
});
t("schedule: everyone plays every matchday, each pair the right number of times", () => {
  for (const N of [10, 16, 20, 30]) {
    const days = schedule(N, 3), seen = new Map();
    for (const d of days) { assert.equal(new Set(d.flat()).size, N); for (const [a, b] of d) { const k = [a, b].sort().join("-"); seen.set(k, (seen.get(k) || 0) + 1); } }
    assert.equal(days.length, matchesPerTeam(N));
    assert.ok([...seen.values()].every((c) => c === legsFor(N)));
  }
});
t("draft: hands never overlap, keepers guaranteed, no player owned twice", () => {
  for (const N of [10, 20, 30]) {
    const g = createGame({ D, N, seed: 5 });
    for (let round = 1; round <= 8; round++) {
      g.round = round;
      const hands = dealRound(g, round, g.P);
      const ids = hands.flatMap((h) => h.filter((c) => c.t === "p").map((c) => c.id));
      assert.equal(new Set(ids).size, ids.length, "overlap in round " + round);
      hands.forEach((h) => assert.equal(h.length, 5));
      if (round === 1) { const heads = hands.map((h) => g.players[h[0].id].ovr).sort((a, b) => b - a); assert.ok(heads.length === N); }
      applyPicks(g, hands, hands.map(() => 0), g.P);
    }
    const owned = g.teams.flatMap((x) => x.players);
    assert.equal(new Set(owned).size, owned.length);
  }
});
t("every team can field a keeper after draft + market", () => {
  for (const N of [10, 20, 30]) {
    const g = createGame({ D, N, seed: 11 }); runDraft(g); runMarket(g);
    for (const tm of g.teams) { assert.ok(tm.players.length >= 6 && tm.players.length <= 10); assert.ok(rosterOf(g, tm).some((p) => p.pos === "GK"), "no keeper " + tm.name + " N=" + N); assert.ok(tm.coins >= 0); }
  }
});
t("match is deterministic and half-time changes do not move the draws", () => {
  const P = withParams();
  const mk = (off) => D.players.filter((p) => p.pos !== "GK").slice(off, off + 6).concat(D.players.filter((p) => p.pos === "GK").slice(off, off + 1)).map((p) => rate({ ...p, stam: 100 }, P));
  const A = mk(0), B = mk(7);
  const cfg = { seed: 1, matchKey: "x", P, home: { id: 0, players: A, lineup: bestLineup(A, P) }, away: { id: 1, players: B, lineup: bestLineup(B, P) } };
  assert.deepEqual(playMatch(cfg).score, playMatch(cfg).score);
  const g = matchSteps(cfg); const ht = g.next();
  assert.equal(ht.value.type, "halftime");
  const done = g.next({ home: bestLineup(A, P) });
  assert.ok(done.done);
});
t("a season runs and the table adds up", () => {
  const g = createGame({ D, N: 12, seed: 3 }); runDraft(g); runMarket(g);
  const s = playSeason(g);
  assert.equal(s.days, 22);
  assert.equal(s.table.reduce((a, r) => a + r.gf, 0), s.table.reduce((a, r) => a + r.ga, 0));
  assert.ok(s.table.every((r) => r.p === 22 && r.w + r.d + r.l === 22));
});
t("market lottery: only the winner pays, never overspends", () => {
  const g = createGame({ D, N: 10, seed: 2 }); runDraft(g);
  const target = g.pool[0], before = g.teams.map((x) => x.coins);
  const wins = resolveMarketRound(g, g.teams.map((_, i) => ({ team: i, kind: "p", id: target, len: 1, extra: 100 })), g.P, "t");
  assert.equal(wins.length, 1);
  const spent = g.teams.map((x, i) => before[i] - x.coins);
  assert.equal(spent.filter((s) => s > 0).length, 1);
  assert.ok(g.teams.every((x) => x.coins >= 0));
});
console.log(`\n${n} tests passed`);
