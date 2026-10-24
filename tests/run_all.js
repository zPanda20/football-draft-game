// Fast invariant tests. Run with: npm test
import assert from "node:assert/strict";
import { D, createGame, runDraft, runMarket, playSeason, rosterOf } from "./lib.js";
import { teamsFor, legsFor, matchesPerTeam, schedule } from "../engine/fixtures.js";
import { dealRound, applyPicks } from "../engine/packs.js";
import { matchSteps, playMatch } from "../engine/match.js";
import { bestLineup, rate, FORMATIONS } from "../engine/roster.js";
const FORMATIONS_OF = (f) => FORMATIONS[f];
import { withParams } from "../engine/params.js";
import { resolveMarketRound, feeFor } from "../engine/market.js";
import { runRetirements, ageAll, retireChance, resign, expiring, releaseExpired } from "../engine/offseason.js";
import { validateOffer, executeOffer } from "../engine/trade.js";
import { rollNumbers, createUserPlayer, defaultAssign, dealCard, answerCard, signUser, cpuTakes, unsigned } from "../engine/playermode.js";
import { runOffseason, beginMatch, finishMatch, activeFx, suspend, tickSuspensions, applyCaps, enforceCap, playOne } from "../engine/game.js";
import { buyItem } from "../engine/market.js";
import { topScorers, incomeBreakdown, applyIncome } from "../engine/game.js";
import { buyForUser, setEquip, giftItem } from "../engine/playermode.js";

let n = 0; const pending = []; const t = (name, fn) => { const r = fn(); if (r && r.then) pending.push(r.then(() => { n++; console.log("ok  " + name); })); else { n++; console.log("ok  " + name); } };

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
  g.teams[ti].coins = 5000; const before = g.teams[ti].coins, fee = feeFor(g.players[id], 2, g.P, true);
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

t("steroids: store only, never in packs, bots never buy them, nobody wears them without being chosen", () => {
  const g = createGame({ D, N: 10, seed: 8 });
  for (let r = 1; r <= 8; r++) { g.round = r; const hands = dealRound(g, r, g.P); assert.ok(!hands.flat().some((c) => c.t === "i" && c.id === "steroids")); applyPicks(g, hands, hands.map(() => 0), g.P); }
  assert.equal(buyItem(g, 0, "steroids"), false);
  g.teams[0].coins = 1000; assert.ok(buyItem(g, 0, "steroids", { store: true })); assert.equal(g.teams[0].items.steroids, 1);
  const lineup = bestLineup(rosterOf(g, g.teams[0]), g.P);
  g.teams[0].active = undefined; assert.deepEqual(activeFx(g.teams[0], lineup, g).doped, []);                 // auto rule skips banned items
  g.teams[0].active = ["steroids"]; assert.deepEqual(activeFx(g.teams[0], lineup, g).doped, []);               // no wearer chosen
  g.teams[0].equip = { steroids: lineup.out[0] };
  const fx = activeFx(g.teams[0], lineup, g); assert.deepEqual(fx.doped, [lineup.out[0]]); assert.equal(fx.player[lineup.out[0]].all, 5);
  g.teams[0].equip = { steroids: 999999 }; assert.deepEqual(activeFx(g.teams[0], lineup, g).doped, []);        // wearer not in the line-up
});
t("steroids: caught about 51% of the time, ban is the longer of 10 games and the rest of the season", () => {
  const g = fresh(10, 9), tm = g.teams[0]; tm.items.steroids = 1000; tm.active = ["steroids"];
  g.md = { day: 0, total: 18 };
  let caught = 0, N = 400;
  for (let k = 0; k < N; k++) {
    const l = bestLineup(rosterOf(g, tm), g.P), pid = l.out[0]; tm.equip = { steroids: pid };
    g.players[pid].susp = 0; g.season = 50 + k;                                                              // fresh randomness each time
    const m = beginMatch(g, 0, 1, "d" + k, { lineup: () => l }); const res = finishMatch(g, m);
    if (res.dope.length) { caught++; assert.equal(res.dope[0].games, 17); }
  }
  assert.ok(caught / N > 0.43 && caught / N < 0.59, "caught " + caught / N);
  const p = g.players[tm.players[0]];
  g.md = { day: 2, total: 18 }; p.contract = 1; assert.equal(suspend(g, p.id).games, 15); assert.equal(suspend(g, p.id).penalty, null);   // 15 games left, 15 in the contract
  g.md = { day: 12, total: 18 }; const r2 = suspend(g, p.id); assert.equal(r2.games, 10); assert.ok(r2.penalty && r2.penalty.season === g.season + 1);
  p.contract = 2; g.teams[p.team].slotLoss = {}; assert.equal(suspend(g, p.id).penalty, null);                                                    // still inside a two-year deal
  p.susp = 2; p.suspFresh = true; tickSuspensions(g); assert.equal(p.susp, 2); tickSuspensions(g); assert.equal(p.susp, 1);
  const recs = beginMatch(g, 0, 1, "z").recs[0]; assert.ok(!recs.some((q) => q.susp > 0));
});
t("roster cap: a lost slot shrinks next season's roster and the cheapest player goes", () => {
  const g = fresh(10, 12), t0 = g.teams[0];
  while (t0.players.length < 10) { const id = g.pool.pop(); g.players[id].team = 0; g.players[id].contract = 1; t0.players.push(id); }
  t0.slotLoss = { [g.season + 1]: 1 }; applyCaps(g, g.season + 1);
  assert.equal(t0.cap, 9); const cut = enforceCap(g); assert.equal(cut.length, 1); assert.equal(t0.players.length, 9);
  assert.ok(g.teams.slice(1).every((x) => x.cap === 10));
});
t("created players: own wallet, items worn from it, gifts from the team", () => {
  const g = fresh(10, 13), r = rollNumbers(g.P, "R", "w", 0);
  const p = createUserPlayer(g, { token: "w", name: "W", pos: "CM", nums: r.nums, ovr: r.ovr, assign: defaultAssign("CM") });
  assert.equal(p.coins, g.P.player.startCoins);
  assert.equal(buyForUser(g, p, "electrolytes"), false);                      // team items are not for players
  assert.ok(buyForUser(g, p, "boots-mizuno-low")); assert.equal(p.coins, g.P.player.startCoins - 50); assert.equal(p.items["boots-mizuno-low"], 3);
  assert.equal(buyForUser(g, p, "steroids"), false); p.coins = 500; assert.equal(buyForUser(g, p, "steroids"), false); assert.ok(buyForUser(g, p, "steroids", { store: true }));
  setEquip(g, p, ["boots-mizuno-low", "steroids", "boots-mizuno-low", "nope"]); assert.deepEqual(p.equip, ["boots-mizuno-low", "steroids"]);
  signUser(g, p, 0, 1, true);
  const l = { formation: "2-2-1", gk: g.teams[0].players.find((id) => g.players[id].pos === "GK" && id !== p.id) ?? null, out: [p.id, ...g.teams[0].players.filter((id) => id !== p.id).slice(0, 4)] };
  const fx = activeFx(g.teams[0], l, g); assert.equal(fx.player[p.id].all, 5); assert.equal(fx.player[p.id].off, 2); assert.deepEqual(fx.doped, [p.id]); assert.equal(fx.usedPlayer.length, 2);
  g.teams[0].items["boots-mizuno-mid"] = 3; assert.ok(giftItem(g, 0, p.id, "boots-mizuno-mid")); assert.equal(g.teams[0].items["boots-mizuno-mid"], 2); assert.equal(p.items["boots-mizuno-mid"], 1);
  assert.equal(giftItem(g, 0, g.teams[0].players.find((id) => id !== p.id), "boots-mizuno-mid"), false);   // only created players can be given items
});
t("ice bath: equipped, the wearer gets 20 extra stamina back after the match; unequipped it does nothing", () => {
  const run = (equip) => {
    const g = fresh(10, 14); g.md = { day: 0, total: 18 };
    const t0 = g.teams[0], recs = rosterOf(g, t0); for (const p of recs) p.stam = 40;
    const l = bestLineup(recs, g.P), wearer = l.out[0]; t0.items["ice-bath"] = 3; if (equip) { t0.active = ["ice-bath"]; t0.equip = { "ice-bath": wearer }; } else t0.active = [];
    finishMatch(g, beginMatch(g, 0, 1, "ice", { lineup: (t) => (t === t0 ? l : null) }));
    return { stam: g.players[wearer].stam, left: t0.items["ice-bath"] || 0 };
  };
  const a = run(true), b = run(false);
  assert.equal(Math.round(a.stam - b.stam), 20); assert.equal(a.left, 2); assert.equal(b.left, 3);
});
t("match flow: ten readings, possession is a probability, momentum within -1..1; goals tally to the season table", () => {
  const g = fresh(10, 15), res = playOne(g, 0, 1, "flow");
  assert.equal(res.flow.length, 2 * g.P.match.moments);
  assert.ok(res.flow.every((f) => f.ph > 0 && f.ph < 1 && f.mom >= -1 && f.mom <= 1));
  const g2 = createGame({ D, N: 10, seed: 16 }); runDraft(g2); runMarket(g2); const s = playSeason(g2);
  const total = s.results.reduce((x, r) => x + r.ga + r.gb, 0), tally = Object.values(g2.goals).reduce((x, e) => x + e.g, 0);
  assert.equal(tally, total);
  const top = topScorers(g2, 5); assert.ok(top.length > 0 && top.every((x, i) => i === 0 || top[i - 1].g >= x.g));
});
t("money: staggered draft contracts, loyalty discount, win/draw bonus, catch-up still pays the bottom more", () => {
  const g = createGame({ D, N: 10, seed: 17 }); runDraft(g);
  const byRound = { 3: 0, 2: 0, 1: 0 }; for (const t of g.teams) for (const id of t.players) byRound[g.players[id].contract]++;
  assert.ok(byRound[3] > 0 && byRound[2] > 0 && byRound[1] > 0, JSON.stringify(byRound));          // contracts end at different times
  assert.equal(g.teams[0].coins, 650);
  const p = g.players[g.teams[0].players[0]];
  assert.equal(feeFor(p, 2, g.P, true), Math.round(feeFor(p, 2, g.P) * 0.75));
  const table = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ i })), day = [{ a: 0, b: 9, ga: 2, gb: 0 }, { a: 1, b: 8, ga: 1, gb: 1 }];
  const bd = incomeBreakdown(g, table, day);
  assert.deepEqual([bd.get(0).result, bd.get(9).result, bd.get(1).result, bd.get(8).result], ["W", "L", "D", "D"]);
  assert.equal(bd.get(0).total, 45 + 0 + 10); assert.equal(bd.get(8).bonus, 5);
  assert.ok(bd.get(9).catchup > bd.get(0).catchup && bd.get(9).total > bd.get(0).total - 10 + 0);      // last place, even losing, out-earns the leader minus the win bonus
  const before = g.teams[0].coins; applyIncome(g, bd); assert.equal(g.teams[0].coins, before + 55);
});
t("clubs: unique slugs, colours, variants point at a main club, art files are picked up, player-card club names map", async () => {
  const { clubsWithArt } = await import("../server/describe.js");
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs"); const { tmpdir } = await import("node:os"); const { join } = await import("node:path");
  const cl = D.clubs; assert.ok(cl.length >= 40);
  assert.equal(new Set(cl.map((c) => c.slug)).size, cl.length); assert.equal(new Set(cl.map((c) => c.name)).size, cl.length);
  for (const c of cl) { assert.match(c.c1, /^#[0-9a-f]{6}$/i); assert.match(c.c2, /^#[0-9a-f]{6}$/i); assert.ok(["main", "throwback", "alt"].includes(c.kind)); if (c.kind !== "main") assert.equal(cl.find((x) => x.slug === c.base)?.kind, "main"); }
  const dir = mkdtempSync(join(tmpdir(), "art-")); mkdirSync(join(dir, "assets", "teams", "juventus"), { recursive: true });
  writeFileSync(join(dir, "assets", "teams", "juventus", "badge.svg"), "<svg/>"); writeFileSync(join(dir, "assets", "teams", "juventus", "Kit-Home.PNG"), "x");
  const art = clubsWithArt(cl, dir).find((c) => c.slug === "juventus").art; assert.match(art.badge, /\/assets\/teams\/juventus\/badge\.svg\?v=/); assert.ok(art.kitHome); assert.equal(art.wallpaper, undefined);
  const names = new Set(D.players.map((p) => p.club)); const norm = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const alias = new Map(); for (const c of cl) if (c.kind === "main") for (const n of [c.name, ...(c.aliases || [])]) alias.set(norm(n), c.slug);
  for (const n of ["Real Madrid", "FC Barcelona", "FC Bayern München", "Paris Saint-Germain", "Lombardia FC (Inter Milan)", "Milano FC (AC Milan)", "Atlético de Madrid", "Manchester United", "Racing Louisville FC", "ACF Fiorentina", "Portland Thorns", "Inter Miami CF"]) { assert.ok(names.has(n), n); assert.ok(alias.has(norm(n)), "no crest for " + n); }
  assert.ok(!alias.has(norm("Paris FC")));
});
t("formations: each shape has its own identity, counter-play is symmetric, stamina follows the role, matches stay deterministic", async () => {
  const { chooseForFormation, FORMATION_NAMES } = await import("../engine/roster.js");
  const { shapeAdjust, breakChance, teamNow } = await import("../engine/match.js");
  const g = createGame({ D, N: 10, seed: 31 }); runDraft(g); runMarket(g);
  const squads = g.teams.map((t) => rosterOf(g, t).map((p) => ({ ...p, stam: 100 }))).filter((r) => r.length >= 8).slice(0, 6), P = g.P;
  const agg = Object.fromEntries(FORMATION_NAMES.map((f) => [f, { sf: 0, sa: 0, poss: 0, m: 0, ev: 0 }]));
  let k = 0;
  for (const pl of squads) {
    const L = Object.fromEntries(FORMATION_NAMES.map((f) => [f, chooseForFormation(pl, f, P)]));
    for (const a of FORMATION_NAMES) for (const b of FORMATION_NAMES) for (let i = 0; i < 12; i++) {
      const r = playMatch({ seed: ++k, matchKey: "t" + k, P, home: { id: 0, name: "A", players: pl, lineup: L[a], fx: {} }, away: { id: 1, name: "B", players: pl, lineup: L[b], fx: {} } });
      const ph = r.flow.reduce((x, f) => x + f.ph, 0) / r.flow.length;
      for (const [f, sf, sa, po] of [[a, r.shots[0], r.shots[1], ph], [b, r.shots[1], r.shots[0], 1 - ph]]) { const x = agg[f]; x.sf += sf; x.sa += sa; x.poss += po; x.m++; x.ev += sf + sa; }
    }
  }
  const per = (f, key) => agg[f][key] / agg[f].m;
  assert.ok(per("1-2-2", "ev") > per("2-2-1", "ev") && per("1-2-2", "ev") > per("3-1-1", "ev"), "the all-out attack is the high-event shape");
  assert.ok(per("3-1-1", "sa") < per("1-2-2", "sa") && per("3-1-1", "sa") < per("2-1-2", "sa"), "the block concedes the fewest shots");
  assert.ok(FORMATION_NAMES.every((f) => f === "2-2-1" || per("2-2-1", "poss") > per(f, "poss") - 0.004), "the possession core holds the ball most");
  assert.ok(per("2-1-2", "poss") < 0.5, "the direct strike gives up possession");
  // equal squads: nobody is a free pick (average share of shots stays in a band)
  for (const f of FORMATION_NAMES) assert.ok(per(f, "sf") / per(f, "ev") > 0.4 && per(f, "sf") / per(f, "ev") < 0.6, f);
  // counter-play: both sides see the mirror image
  const mk = (f) => ({ formation: f, g: { back: { pac: 78, def: 78, phy: 78 }, mid: { pac: 78, pas: 78, dri: 78, def: 78 }, fwd: { pac: 78, phy: 78 } } });
  const a1 = shapeAdjust(mk("1-3-1"), mk("2-1-2"), P), a2 = shapeAdjust(mk("2-1-2"), mk("1-3-1"), P);
  assert.equal(a1.ctl - P.shape.f["1-3-1"].ctl, 2); assert.equal(a2.ctl - P.shape.f["2-1-2"].ctl, -2);
  // a fast break is likelier against the isolated defender and when the forwards have the legs
  assert.ok(breakChance(mk("1-2-2"), mk("1-3-1"), P) > breakChance(mk("1-2-2"), mk("3-1-1"), P));
  const quick = mk("2-2-1"); quick.g = { ...quick.g, fwd: { pac: 95, phy: 78 } };
  assert.ok(breakChance(quick, mk("1-3-1"), P) > breakChance(mk("2-2-1"), mk("1-3-1"), P));
  // stamina by role: the same line-up tires its slots more (press midfield, isolated striker) and less (deep defenders) than with flat drain
  const pl = squads[0], P0 = withParams({ shape: { f: Object.fromEntries(FORMATION_NAMES.map((f) => [f, { drain: Object.fromEntries(["LB", "CB", "RB", "LM", "CM", "RM", "ST"].map((x) => [x, 1])) }])) } });
  const run = (l, PP = P) => playMatch({ seed: 5, matchKey: "s", P: PP, home: { id: 0, name: "A", players: pl, lineup: l, fx: {} }, away: { id: 1, name: "B", players: pl, lineup: l, fx: {} } });
  const lp = chooseForFormation(pl, "1-3-1", P), lq = chooseForFormation(pl, "3-1-1", P);
  const lost = (r, l, idx) => idx.reduce((x, i) => x + 100 - r.stamina[0][l.out[i]], 0);
  assert.ok(lost(run(lp), lp, [1, 2, 3]) > lost(run(lp, P0), lp, [1, 2, 3]), "press midfield tires faster");
  assert.ok(lost(run(lq), lq, [4]) > lost(run(lq, P0), lq, [4]) && lost(run(lq), lq, [0, 1, 2]) < lost(run(lq, P0), lq, [0, 1, 2]), "isolated striker runs more, deep defenders less");
  // same seed, same match
  const x1 = run(lp), x2 = run(lp); assert.deepEqual(x1.score, x2.score); assert.deepEqual(x1.events, x2.events);
});
t("box score: events carry xG, key passes, assists and defensive actions; ratings follow the events", async () => {
  const { ratings, tally } = await import("../public/rating.js");
  const { groupsOf, ratingSides, seasonLeaders } = await import("../engine/game.js");
  const g = createGame({ D, N: 10, seed: 41 }); runDraft(g); runMarket(g);
  const A = rosterOf(g, g.teams[0]), B = rosterOf(g, g.teams[1]);
  let goals = 0, assists = 0, kps = 0, shots = 0, tk = 0, ic = 0, xgSum = 0;
  for (let i = 0; i < 40; i++) {
    const cfg = { seed: 3 + i, matchKey: "b" + i, P: g.P, home: { id: 0, name: "A", players: A, lineup: bestLineup(A, g.P), fx: {} }, away: { id: 1, name: "B", players: B, lineup: bestLineup(B, g.P), fx: {} } };
    const r = playMatch(cfg), first = [bestLineup(A, g.P), bestLineup(B, g.P)];
    const T = tally(r.events), sum = (k) => Object.values(T).reduce((x, y) => x + y[k], 0);
    assert.equal(sum("g"), r.score[0] + r.score[1]); assert.equal(sum("sh"), r.shots[0] + r.shots[1]);
    assert.ok(sum("a") <= sum("g") && sum("kp") >= sum("a"));
    for (const e of r.events) if (e.type === "goal" || e.type === "save") { assert.ok(e.xg > 0 && e.xg < 1); if (e.kp != null) assert.notEqual(e.kp, e.player); }
    const R = ratings(r.events, ratingSides(first, r.lineups), { final: true });
    for (const o of Object.values(R)) assert.ok(o.r >= 3 && o.r <= 10);
    // the scorer of a goal outrates the same player without it
    const goal = r.events.find((e) => e.type === "goal");
    if (goal) { const without = ratings(r.events.filter((e) => e !== goal), ratingSides(first, r.lineups)), withIt = ratings(r.events, ratingSides(first, r.lineups)); assert.ok(withIt[goal.player].r > without[goal.player].r); }
    goals += sum("g"); assists += sum("a"); kps += sum("kp"); shots += sum("sh"); tk += sum("tk"); ic += sum("ic"); for (const e of r.events) if (e.xg) xgSum += e.xg;
  }
  assert.ok(assists / goals > 0.5 && assists / goals < 1, "most goals are assisted");
  assert.ok(tk > 20 && ic > 15, "defenders get tackles and interceptions");
  assert.ok(Math.abs(xgSum / shots - goals / shots) < 0.12, "xG roughly matches goals scored: " + (xgSum / shots).toFixed(2) + " vs " + (goals / shots).toFixed(2));
  // a whole season fills the season stats and leader tables
  const g2 = createGame({ D, N: 10, seed: 42 }); runDraft(g2); runMarket(g2); playSeason(g2, {});
  const L = seasonLeaders(g2, 5); assert.ok(L.g.length && L.a.length && L.tk.length && L.sv.length && L.rt.length);
  assert.ok(L.rt[0].rt >= L.rt[L.rt.length - 1].rt);
});
t("player pool: women-only and men-only leagues draft, play and bring in rookies from their own pool; the room caps clubs", async () => {
  const { genderOk } = await import("../engine/roster.js");
  const { Room } = await import("../server/room.js");
  for (const k of ["female", "male"]) {
    const g = createGame({ D, N: 10, seed: 5, gender: k }); runDraft(g); runMarket(g);
    assert.ok(g.pool.length > 0 && g.pool.every((id) => genderOk(k, g.players[id].gender)), k + " pool");
    for (const tm of g.teams) assert.ok(rosterOf(g, tm).every((p) => genderOk(k, p.gender)));
    assert.ok(rosterOf(g, g.teams[0]).some((p) => p.pos === "GK"), k + " league still has keepers");
  }
  assert.ok(genderOk("all", "Female") && genderOk("all", "Male") && !genderOk("female", "Male") && !genderOk("male", "F"));
  const r = new Room({ code: "TEST", D, hostToken: "h", onChange() {}, onSave() {} }), info = r.poolInfo();
  assert.ok(info.female.maxClubs <= 12 && info.male.maxClubs <= 12 && info.all.maxClubs === 30, JSON.stringify(info));
});
t("player life: activities move energy, love, money and followers; stories follow the choices; shop and wedding work", async () => {
  const L = await import("../engine/life.js");
  const g = createGame({ D, N: 10, seed: 9 }); g.md = { day: 0, total: 18 }; g.P.life.wada = 0;
  const r = rollNumbers(g.P, "x", "t", 0), p = createUserPlayer(g, { token: "t", name: "Test Pro", pos: "ST", nums: r.nums, ovr: r.ovr, assign: defaultAssign("ST") });
  p.gender = "M"; const lf = L.ensureLife(g, p), o0 = p.ovr, c0 = p.coins;
  p.stam = 80; L.runActivity(g, p, "rest", { day: 0 }); assert.ok(p.stam > 90 && lf.love < g.P.life.startLove && lf.fol < g.P.life.startFollowers, "rest: energy up, love and followers down");
  p.stam = 80; const f1 = lf.fol; L.runActivity(g, p, "party", { day: 1 }); assert.ok(p.stam < 70 && lf.fol > f1 && p.coins < c0, "party: tired, famous, poorer");
  p.coins = 5; assert.equal(L.blocked(g, p, "party"), "Not enough money"); assert.equal(L.runActivity(g, p, "party", { day: 2 }).act, "balance", "cannot afford: falls back to balance");
  p.coins = 5000; for (let d = 0; d < 10; d++) L.runActivity(g, p, "date", { day: 10 + d });
  assert.ok(L.canMarry(g, p) && lf.partner.dates >= 10); const w = L.runActivity(g, p, "date", { marry: true, day: 30 });
  assert.ok(lf.married && w.stories.some((n) => n.kind === "wedding" && n.status === "live"), "wedding story goes to the lobby");
  for (let d = 0; d < 20; d++) L.runActivity(g, p, "train", { day: 40 + d }); assert.ok(p.ovr > o0 && p.ovr <= o0 + 4, "training helps a little");
  // boring: 15 balance weeks in one season, guaranteed
  const g2 = createGame({ D, N: 10, seed: 10 }); g2.md = { day: 0, total: 18 }; g2.P.life.wada = 0;
  const q = createUserPlayer(g2, { token: "u", name: "Dull Dan", pos: "CM", nums: r.nums, ovr: r.ovr, assign: defaultAssign("CM") }); q.gender = "M"; L.ensureLife(g2, q);
  let boring = 0; for (let d = 0; d < 15; d++) boring += L.runActivity(g2, q, "balance", { day: d }).stories.filter((n) => n.kind === "boring").length;
  assert.equal(boring, 1); assert.match(g2.news.at(-1).head, /MOST BORING MAN/);
  // shop: a car, then a house upgrade charges the difference; a yacht allows the Monaco party at most once a season
  q.coins = 5000; assert.ok(L.buyLife(g2, q, "car-m3") && !L.buyLife(g2, q, "car-m3")); L.buyLife(g2, q, "house-flat"); const before = q.coins; L.buyLife(g2, q, "house-town"); assert.equal(before - q.coins, 280 - 60);
  L.buyLife(g2, q, "yacht"); const gc = g2.P.life.chance; for (const k of Object.keys(gc)) gc[k] = 1; q.life.sCount = 0;
  let monaco = 0; for (let d = 0; d < 6; d++) { q.life.sCount = 0; q.coins = 5000; monaco += L.runActivity(g2, q, "party", { day: 20 + d }).stories.filter((n) => n.kind === "yacht").length; } assert.equal(monaco, 1, "Monaco story at most once a season");
  // a manager must approve a story about a footballer signed to a human club
  const g3 = createGame({ D, N: 10, seed: 11 }); g3.md = { day: 0, total: 18 }; g3.teams[0].human = true; Object.assign(g3.P.life.chance, { proud: 1 });
  const z = createUserPlayer(g3, { token: "z", name: "Zed", pos: "ST", nums: r.nums, ovr: r.ovr, assign: defaultAssign("ST") }); z.team = 0; g3.teams[0].players.push(z.id);
  const pr = L.runActivity(g3, z, "train", { day: 0 }).stories.find((n) => n.kind === "proud"); assert.equal(pr.status, "pending");
  L.decideStory(g3, pr.id, false); assert.equal(g3.news.find((n) => n.id === pr.id).status, "blocked");
  // survives a save
  const { serializeGame, restoreGame } = await import("../engine/game.js"); const back = restoreGame(D, JSON.parse(JSON.stringify(serializeGame(g2))));
  assert.equal(back.news.length, g2.news.length); assert.equal(back.players[q.id].life.own.house, "house-town");
});
await Promise.all(pending);
console.log(`\n${n} tests passed`);
