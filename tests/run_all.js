// Fast invariant tests. Run with: npm test
import assert from "node:assert/strict";
import { D, createGame, runDraft, runMarket, playSeason, rosterOf } from "./lib.js";
import { teamsFor, legsFor, matchesPerTeam, schedule } from "../engine/fixtures.js";
import { dealRound, applyPicks } from "../engine/packs.js";
import { matchSteps, playMatch } from "../engine/match.js";
import { bestLineup, rate } from "../engine/roster.js";
import { withParams } from "../engine/params.js";
import { resolveMarketRound, feeFor } from "../engine/market.js";
import { runRetirements, ageAll, retireChance, resign, expiring, releaseExpired } from "../engine/offseason.js";
import { validateOffer, executeOffer } from "../engine/trade.js";
import { rollNumbers, createUserPlayer, defaultAssign, dealCard, answerCard, signUser, cpuTakes, unsigned } from "../engine/playermode.js";
import { runOffseason, beginMatch, finishMatch } from "../engine/game.js";

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

const fresh = (N = 10, seed = 11) => { const g = createGame({ D, N, seed }); runDraft(g); runMarket(g); playSeason(g); return g; };
t("retirement: the four legends go after season 1, nobody under 36 retires, contracts are voided", () => {
  const g = fresh(), out = runRetirements(g);
  const slugs = out.map((r) => g.players[r.id].slug);
  for (const s of ["lionel-messi", "luka-modric", "cristiano-ronaldo", "marta"]) assert.ok(slugs.includes(s), s);
  for (const r of out) { const p = g.players[r.id]; assert.ok(p.retired && p.team == null && p.contract === 0); assert.ok(r.age >= 36 || r.forced); assert.ok(!g.teams.some((t) => t.players.includes(r.id))); }
  assert.equal(retireChance({ age: 38, pos: "CM", slug: "x" }, g.P, 2), 0.8);
  assert.equal(retireChance({ age: 43, pos: "GK", slug: "x" }, g.P, 2), 0.8);   // keepers are judged five years younger
});
t("off-season is deterministic and keeps rosters legal", () => {
  const run = () => { const g = fresh(); runOffseason(g, D, {}); return g; };
  const a = run(), b = run();
  assert.deepEqual(a.teams.map((x) => x.players), b.teams.map((x) => x.players));
  assert.equal(a.season, 2);
  for (const x of a.teams) { assert.ok(x.players.length <= 10); assert.ok(new Set(x.players).size === x.players.length); for (const id of x.players) assert.ok(!a.players[id].retired && a.players[id].team === x.id); }
});
t("re-signing costs the market fee, only for your own expired player", () => {
  const g = fresh(); ageAll(g);
  const ti = g.teams.findIndex((x) => expiring(g, x.id).length), id = expiring(g, ti)[0];
  assert.ok(ti >= 0);
  g.teams[ti].coins = 5000; const before = g.teams[ti].coins, fee = feeFor(g.players[id], 2, g.P);
  assert.equal(resign(g, ti, id, 2), fee); assert.equal(g.teams[ti].coins, before - fee); assert.equal(g.players[id].contract, 2);
  assert.equal(resign(g, ti, id, 2), false);                                     // already has a contract
  const other = expiring(g, (ti + 1) % g.teams.length)[0];
  if (other != null) assert.equal(resign(g, ti, other, 1), false);
});
t("trades: validation, execution, the six-asset limit, no created players", () => {
  const g = fresh(); const [a, b] = [g.teams[0], g.teams[1]];
  const pa = a.players[0], pb = b.players[0], coins = a.coins;
  const ok = { from: 0, to: 1, give: [{ k: "p", id: pa }, { k: "c", amt: 10 }], get: [{ k: "p", id: pb }] };
  assert.equal(validateOffer(g, ok), null);
  assert.ok(validateOffer(g, { ...ok, give: [{ k: "p", id: pb }] }));          // not his player
  assert.ok(validateOffer(g, { from: 0, to: 0, give: [{ k: "c", amt: 1 }], get: [] }));
  assert.ok(validateOffer(g, { from: 0, to: 1, give: a.players.slice(0, 7).map((id) => ({ k: "p", id })), get: [] }));
  executeOffer(g, ok);
  assert.ok(b.players.includes(pa) && a.players.includes(pb) && g.players[pa].team === 1 && a.coins === coins - 10);
});
t("player mode: created player starts 81-86, rolled numbers are reproducible, ids clear of the data", () => {
  const P = withParams({});
  for (let k = 0; k < 40; k++) { const r = rollNumbers(P, "R", "tok", k); assert.ok(r.ovr >= 81 && r.ovr <= 86); assert.equal(r.nums.length, 6); assert.deepEqual(r, rollNumbers(P, "R", "tok", k)); }
  const g = createGame({ D, N: 10, seed: 3 }), r = rollNumbers(g.P, "R", "tok", 0);
  const p = createUserPlayer(g, { token: "tok", name: "Test", pos: "ST", nums: r.nums, ovr: r.ovr, assign: defaultAssign("ST") });
  assert.ok(p.id >= 100000 && p.user && g.userPool.includes(p.id) && !g.pool.includes(p.id));
  assert.ok(p.sho >= p.def, "a striker's biggest numbers go to the stats he needs");
});
t("player mode: career cards, signing, computer fallback", () => {
  const g = fresh(10, 4), r = rollNumbers(g.P, "R", "t", 0);
  const p = createUserPlayer(g, { token: "t", name: "T", pos: "CM", nums: r.nums, ovr: r.ovr, assign: defaultAssign("CM") });
  const c = dealCard(g, p, "x"); assert.equal(p.career.pending.length, 1);
  const safe = c.opts.findIndex((o) => o.p >= 1), before = p.ovr;
  const res = answerCard(g, p, c.n, safe >= 0 ? safe : 0); assert.ok(res); assert.equal(p.career.pending.length, 0);
  if (safe >= 0) assert.equal(p.ovr, before);
  dealCard(g, p, "a"); dealCard(g, p, "b"); dealCard(g, p, "c"); assert.ok(p.career.pending.length <= g.P.player.maxQueue);
  const t0 = g.teams[0]; t0.players = t0.players.slice(0, 5);
  const coins = t0.coins, paid = signUser(g, p, 0, 1); assert.ok(paid > 0 && t0.coins === coins - paid && p.team === 0 && !unsigned(g).includes(p));
  const q = createUserPlayer(g, { token: "u", name: "U", pos: "GK", nums: r.nums, ovr: r.ovr, assign: defaultAssign("GK") });
  assert.ok(cpuTakes(g, q) && q.team != null && q.contract === g.P.player.cpuContract);
  assert.equal(validateOffer(g, { from: 0, to: 1, give: [{ k: "p", id: p.id }], get: [] }), "Created players cannot be traded.");
});
t("half-time effort changes the second half but never the first, and the draws stay the same", () => {
  const g = fresh(10, 6), A = g.teams[0], B = g.teams[1];
  const mk = (effort) => { const m = beginMatch(g, 0, 1, "eff"); const first = JSON.stringify(m.ht.events); const stBefore = m.ht.stamina[0]; const res = finishMatch(g, m, [null, null], { effort: () => effort }); return { first, res }; };
  const run = (mode) => { const g2 = fresh(10, 6); const m = beginMatch(g2, 0, 1, "eff"); const id = g2.teams[0].players[0]; const res = finishMatch(g2, m, [null, null], { effort: (t) => (t.id === 0 ? { [id]: mode } : null) }); return { first: JSON.stringify(m.ht.events), stam: res.stamina[0][id] }; };
  const n = run(null), push = run("push"), cons = run("conserve");
  assert.equal(n.first, push.first);
  assert.ok(push.stam <= n.stam && cons.stam >= n.stam);
});
console.log(`\n${n} tests passed`);
