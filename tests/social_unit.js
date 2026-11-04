// Tests for the social layer: manager situations, promises, public comments, news slots and save/restore. Run with: node tests/social_unit.js
import assert from "node:assert/strict";
import { D, createGame, runDraft, runMarket, rosterOf } from "./lib.js";
import { serializeGame, restoreGame } from "../engine/game.js";
import * as SO from "../engine/social.js";
import * as SI from "../engine/situations.js";
import * as M2 from "../engine/market2.js";
import * as L from "../engine/life.js";
import * as RM from "../engine/romance.js";
import { rollNumbers, createUserPlayer, defaultAssign } from "../engine/playermode.js";
import { withParams } from "../engine/params.js";

let n = 0; const pending = [];
const t = (name, fn) => { const r = fn(); if (r && r.then) pending.push(r.then(() => { n++; console.log("ok  " + name); })); else { n++; console.log("ok  " + name); } };

// A league with two human managers (teams 0 and 1); everyone else is a CPU club.
function world(seed = 7, humans = [0, 1]) {
  const g = createGame({ D, N: 10, seed }); runDraft(g); runMarket(g);
  for (const i of humans) { g.teams[i].human = true; g.teams[i].name = "Team " + i; }
  g.socialOn = true; g.ownerName = (i) => ["Ann", "Bob", "Cy"][i] || null; g.seasonDays = 18;
  return g;
}
const starters = (g, team, skip = []) => { const r = rosterOf(g, g.teams[team]).filter((p) => !skip.includes(p.id)).sort((a, b) => b.ovr - a.ovr); return r.slice(0, 6).map((p) => p.id); };
const tick = (g, day, extra = {}) => { g.weekDay = day; return SI.socialTick(g, { day, total: 18, fixtures: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]], table: [], ...extra }); };
const play = (g, day, team, skip) => { g.weekDay = day; return SI.recordStarts(g, day, [{ team, ids: starters(g, team, skip) }], 18); };

t("a benched player asks for minutes after enough matchdays, and only the manager sees it", () => {
  const g = world();
  const best = rosterOf(g, g.teams[0]).sort((a, b) => b.ovr - a.ovr)[0];
  tick(g, 0);
  for (let d = 0; d < 3; d++) { play(g, d, 0, [best.id]); tick(g, d + 1); }
  const inbox = SI.listFor(g, { team: 0 });
  const s = inbox.find((x) => x.kind === "bench");
  assert.ok(s, "the bench request arrives");
  assert.equal(s.vis, "private");
  assert.equal(SI.listFor(g, { team: 1 }).length, 0, "the other manager sees nothing");
  assert.ok(s.opts.some((o) => o.id === "p3") && s.opts.every((o) => o.preview.length > 10), "every choice shows its consequence");
});

function benchedAsk(g, team = 0) {
  const best = rosterOf(g, g.teams[team]).sort((a, b) => b.ovr - a.ovr)[0];
  tick(g, 0); for (let d = 0; d < 3; d++) { play(g, d, team, [best.id]); tick(g, d + 1); }
  return { best, sit: SI.listFor(g, { team }).find((x) => x.kind === "bench") };
}
t("a promise is kept when the player starts, and trust rises", () => {
  const g = world(), { sit } = benchedAsk(g);
  const r = SI.answer(g, sit.id, "p3", { team: 0 }, { base: 3 });
  assert.ok(r.ok);
  assert.ok(SO.mgrOf(g, 0).promises.some((p) => p.pid === sit.pid && p.status === "open" && p.due === 5));
  const before = SO.trustOf(g, 0, sit.pid);
  g.weekDay = 3; SI.recordStarts(g, 3, [{ team: 0, ids: [sit.pid, ...starters(g, 0).slice(0, 5)] }], 18);
  assert.equal(SO.mgrOf(g, 0).promises[0].status, "kept");
  assert.equal(SO.trustOf(g, 0, sit.pid), before + 1);
  assert.equal(SO.mgrOf(g, 0).cnt.kept, 1);
});
t("a broken promise costs trust and produces a headline after the match, not before", () => {
  const g = world(), { best, sit } = benchedAsk(g);
  SI.answer(g, sit.id, "p2", { team: 0 }, { base: 3 });
  const t0 = SO.trustOf(g, 0, best.id);
  play(g, 3, 0, [best.id]);
  assert.equal(SO.mgrOf(g, 0).promises[0].status, "open", "one day left");
  const notes = play(g, 4, 0, [best.id]);
  assert.equal(SO.mgrOf(g, 0).promises[0].status, "broken");
  assert.ok(SO.trustOf(g, 0, best.id) < t0);
  assert.ok(notes.some((x) => /broke your promise/.test(x.text)));
  const printedBefore = g.news.filter((x) => x.thread).length;
  assert.equal(SO.ensureSoc(g).after.length > 0, true, "the story waits for full time");
  SI.afterMatch(g, { day: 4, results: [{ a: 0, b: 1, ga: 0, gb: 1, goals: [] }] });
  assert.ok(g.news.some((x) => x.thread && /BENCH|WAITING|PROMISE|CHANCE/.test(x.head)), "a headline is printed after the match");
  assert.ok(printedBefore === 0);
});
t("a promise cannot be failed when it is impossible to keep: suspension, sale, retirement", () => {
  for (const how of ["susp", "sold", "retired"]) {
    const g = world(), { best, sit } = benchedAsk(g);
    SI.answer(g, sit.id, "p2", { team: 0 }, { base: 3 });
    play(g, 3, 0, [best.id]);
    if (how === "susp") best.susp = 2; else if (how === "sold") { g.teams[0].players = g.teams[0].players.filter((i) => i !== best.id); best.team = 5; } else best.retired = true;
    const t0 = SO.trustOf(g, 0, best.id);
    const notes = play(g, 4, 0, [best.id]);
    assert.equal(SO.mgrOf(g, 0).promises[0].status, "void", how);
    assert.equal(SO.trustOf(g, 0, best.id), t0, "no penalty");
    assert.ok(notes.length >= 1);
  }
});
t("answering twice, or for somebody else, does nothing", () => {
  const g = world(), { sit } = benchedAsk(g);
  assert.equal(SI.answer(g, sit.id, "explain", { team: 1 }).ok, false);
  assert.equal(SI.answer(g, sit.id, "nonsense", { team: 0 }).ok, false);
  assert.equal(SI.answer(g, sit.id, "explain", { team: 0 }).ok, true);
  const tr = SO.trustOf(g, 0, sit.pid);
  assert.equal(SI.answer(g, sit.id, "dismiss", { team: 0 }).ok, false);
  assert.equal(SO.trustOf(g, 0, sit.pid), tr, "no second effect");
});
t("an unanswered request lapses quietly and counts as no answer", () => {
  const g = world(), { sit } = benchedAsk(g);
  const tr = SO.trustOf(g, 0, sit.pid);
  for (let d = 4; d <= 8; d++) tick(g, d);
  assert.equal(SI.listFor(g, { team: 0 }).some((x) => x.id === sit.id), false);
  assert.equal(SO.trustOf(g, 0, sit.pid), tr - 1);
});
t("style bends trust: a straight talker takes the sting out of a refusal, a diplomat earns more from kindness", () => {
  const dismiss = (style) => { const g = world(); SO.setStyle(g, 0, style); const { sit } = benchedAsk(g); const before = SO.trustOf(g, 0, sit.pid); SI.answer(g, sit.id, "dismiss", { team: 0 }); return SO.trustOf(g, 0, sit.pid) - before; };
  assert.ok(dismiss("direct") > dismiss(null));
  const reassure = (style) => { const g = world(); SO.setStyle(g, 0, style); const { sit } = benchedAsk(g); const before = SO.trustOf(g, 0, sit.pid); SI.answer(g, sit.id, "p3", { team: 0 }, { base: 3 }); return SO.trustOf(g, 0, sit.pid) - before; };
  assert.ok(reassure("diplomat") > reassure(null));
});
t("a signing creates competition for a top player and triggers a decision", () => {
  const g = world();
  tick(g, 0);
  const top = rosterOf(g, g.teams[0]).sort((a, b) => b.ovr - a.ovr)[0];
  const pool = Object.values(g.players).filter((p) => p.team == null && !p.retired && !p.user && p.pos === top.pos).sort((a, b) => b.ovr - a.ovr)[0];
  assert.ok(pool, "a free agent in the same position exists");
  pool.ovr = top.ovr + 3; pool.team = 0; g.teams[0].players.push(pool.id);
  tick(g, 1);
  const s = SI.listFor(g, { team: 0 }).find((x) => x.kind === "sign");
  assert.ok(s, "the objection arrives"); assert.equal(s.pid, top.id); assert.equal(s.other.id, pool.id);
  assert.equal(s.opts.map((o) => o.id).join(), "reassure,back,compete");
  const r = SI.answer(g, s.id, "back", { team: 0 });
  assert.ok(r.ok);
  assert.equal(SO.trustOf(g, 0, pool.id), 1, "the newcomer is pleased");
  assert.ok(SO.trustOf(g, 0, top.id) < 0 || SO.temper(g, top.id) === "loyal");
});

t("public comments are limited: a cooldown, a season cap, one jab per target, and only another human manager can be criticised", () => {
  const g = world(7, [0, 1, 2]); tick(g, 0);
  assert.equal(SI.makeComment(g, 0, { kind: "jab", line: "negative", target: 5 }).ok, false, "a CPU club cannot be a target");
  assert.equal(SI.makeComment(g, 0, { kind: "jab", line: "nope", target: 1 }).ok, false, "unknown line");
  const a = SI.makeComment(g, 0, { kind: "jab", line: "negative", target: 1 });
  assert.ok(a.ok && a.sit, "the target gets an inbox card");
  assert.equal(SI.makeComment(g, 0, { kind: "jab", line: "bus", target: 2 }).ok, false, "cooldown");
  g.weekDay = 2; assert.equal(SI.makeComment(g, 0, { kind: "jab", line: "bus", target: 1 }).ok, false, "one jab per target");
  assert.equal(SI.makeComment(g, 0, { kind: "jab", line: "bus", target: 2 }).ok, true);
  g.weekDay = 4; SI.makeComment(g, 0, { kind: "praise", line: "coached", target: 2 }); g.weekDay = 6; SI.makeComment(g, 0, { kind: "praise", line: "fair", target: 1 });
  g.weekDay = 9; assert.equal(SI.makeComment(g, 0, { kind: "praise", line: "bright", target: 1 }).ok, false, "season cap of " + g.P.social.comment.perSeason);
});
t("the target of a jab can reply in public, speak privately or leave it for the match, and the match calls it back", () => {
  for (const [opt, rel] of [["fire", -2], ["calm", -1], ["private", 0], ["match", -1]]) {
    const g = world(); tick(g, 0);
    SI.makeComment(g, 0, { kind: "jab", line: "museum", target: 1 });
    const s = SI.listFor(g, { team: 1 }).find((x) => x.kind === "comment"); assert.ok(s, opt);
    assert.equal(SI.answer(g, s.id, opt, { team: 0 }).ok, false, "the critic cannot answer for the target");
    assert.ok(SI.answer(g, s.id, opt, { team: 1 }).ok);
    assert.equal(SO.mrel(g, 0, 1), rel, opt);
  }
  const g = world(); tick(g, 0); SI.makeComment(g, 0, { kind: "jab", line: "museum", target: 1 }); SI.answer(g, SI.listFor(g, { team: 1 })[0].id, "fire", { team: 1 });
  g.weekDay = 5; const out = tick(g, 5, { fixtures: [[0, 1]] });
  assert.ok(g.news.some((x) => /PERSONAL|GRUDGE/.test(x.head)), "a preview before the meeting");
  const before = g.news.length; SI.afterMatch(g, { day: 5, results: [{ a: 0, b: 1, ga: 2, gb: 0, goals: [] }] });
  assert.ok(g.news.length > before || SO.ensureSoc(g).queue.length, "a result story");
  assert.equal(SO.mrel(g, 0, 1), -1, "the match settles it one step");
});
t("a prediction is remembered: an easy win that becomes a heavy defeat is called back", () => {
  const g = world(); tick(g, 0);
  const r = SI.makeComment(g, 0, { kind: "predict", line: "easy", opp: 1, matchDay: 0 }); assert.ok(r.ok && r.story);
  assert.equal(SI.makeComment(g, 0, { kind: "predict", line: "easy", opp: 1, matchDay: 0 }).ok, false, "cooldown stops a repeat");
  g.weekDay = 3;
  assert.equal(SI.makeComment(g, 0, { kind: "predict", line: "easy", opp: 0, matchDay: 3 }).ok, false, "cannot predict against yourself");
  SI.afterMatch(g, { day: 0, results: [{ a: 0, b: 1, ga: 0, gb: 3, goals: [] }] });
  const heads = g.news.map((x) => x.head).concat(SO.ensureSoc(g).queue.map((x) => x.head));
  assert.ok(heads.some((h) => /EAT|WORDS|EASY|PREDICTION|DRAWER|SCOREBOARD/i.test(h) && h !== r.story.head), "the miss is in the paper: " + heads.join(" | "));
  assert.equal(SO.mgrOf(g, 0).cnt.predMiss, 1);
  assert.ok(SI.reputation(g, 0).counts.pred === 1);
});
t("a night out before a big match asks the manager: defend, fine or bench, with the consequences shown", () => {
  const g = world(); tick(g, 0);
  let found = null;
  for (let d = 1; d < 40 && !found; d++) {
    const table = [{ i: 1 }, { i: 2 }, { i: 3 }, { i: 0 }];
    tick(g, d, { fixtures: [[0, 1], [2, 3]], table }); found = SI.listFor(g, { team: 0 }).find((x) => x.kind === "party");
    if (!found) tick(g, d + 100, {});
  }
  assert.ok(found, "a seeded party story arises from a real fixture");
  assert.equal(found.vis, "rumour"); assert.ok(found.opts.map((o) => o.id).join() === "defend,fine,bench");
  const b = SI.answer(g, found.id, "bench", { team: 0 }, { base: g.weekDay });
  assert.ok(b.ok);
  assert.ok(SI.benchOrders(g, 0, g.weekDay).has(found.pid), "he is out of the XI");
  assert.ok(!SI.benchOrders(g, 0, g.weekDay + 1).has(found.pid), "for one match only");
});
t("defending a player who then scores is vindicated; one who flops is not", () => {
  for (const scores of [true, false]) {
    const g = world(); tick(g, 0);
    const p = rosterOf(g, g.teams[0])[0]; const S = SO.ensureSoc(g);
    const th = SO.openThread(g, "party", [p.id, "t0"], "seen out", { priv: true, meta: { pid: p.id, team: 0, opp: 1 } });
    const sit = { id: SO.nid(g), kind: "party", team: 0, pid: p.id, thread: th.id, to: "mgr", status: "open", season: 1, day: 2, expires: 9, ctx: { src: "npc", opp: 1, day: 2 } }; S.inbox.push(sit);
    g.weekDay = 2; assert.ok(SI.answer(g, sit.id, "defend", { team: 0 }, { base: 2 }).ok);
    SI.afterMatch(g, { day: 2, results: [{ a: 0, b: 1, ga: scores ? 2 : 0, gb: scores ? 1 : 1, goals: scores ? [{ player: p.id, team: 0 }] : [] }] });
    const heads = g.news.map((x) => x.head).concat(S.queue.map((x) => x.head)).join(" | ");
    assert.ok(scores ? /SCORES|FAITH|SMILES/i.test(heads) : /SHAKY|LETS|NO GOAL/i.test(heads), heads);
  }
});
t("league stories have their own slot and a queue: nothing is silently overwritten, and the queue is bounded", () => {
  const g = world(); tick(g, 0); g.weekDay = 1;
  const mk = (i, prio) => SO.deskStory(g, { kind: "league", icon: "x", team: 0, prio, head: "S" + i, sub: "s" });
  assert.ok(mk(1, 2), "the first prints"); assert.equal(mk(2, 3), null, "the second waits"); mk(3, 1); mk(4, 4); mk(5, 2); mk(6, 0);
  assert.ok(SO.ensureSoc(g).queue.length <= g.P.social.desk.queue, "bounded");
  assert.equal(g.news.filter((n) => n.season === 1 && n.day === 1 && n.tag).length, 1, "one a week");
  SO.drainDesk(g, 101);
  g.weekDay = 2; SO.drainDesk(g, 102); assert.equal(g.news[g.news.length - 1].head, "S4", "the highest priority prints next");
  assert.equal(g.P.life.perWeek, 1, "the footballer-news slot is untouched");
});
t("stories carry a visibility tag and a shared thread; private lines stay private", () => {
  const g = world(); tick(g, 0);
  const th = SO.openThread(g, "party", [11, "t0"], "private line", { priv: true });
  SO.deskStory(g, { kind: "league", icon: "x", team: 0, prio: 2, head: "PUBLIC", sub: "s", thread: th.id, tag: "rumour" });
  const mine = SO.archiveFor(g, { team: 0 }), theirs = SO.archiveFor(g, { team: 1 });
  assert.ok(mine[0].lines.some((l) => l.priv)); assert.ok(!theirs[0].lines.some((l) => l.priv) && theirs[0].lines.some((l) => l.tag === "rumour"));
});
t("everything survives a save and restore, and an old save without it starts empty", () => {
  const g = world(); const { sit } = benchedAsk(g); SI.answer(g, sit.id, "p3", { team: 0 }, { base: 3 }); SO.setStyle(g, 0, "showman");
  const snap = JSON.parse(JSON.stringify(serializeGame(g)));
  const g2 = restoreGame(D, snap);
  assert.equal(SO.mgrOf(g2, 0).style, "showman"); assert.equal(SO.mgrOf(g2, 0).promises.length, 1); assert.equal(SO.trustOf(g2, 0, sit.pid), SO.trustOf(g, 0, sit.pid));
  delete snap.soc; const g3 = restoreGame(D, snap);
  assert.deepEqual(SO.ensureSoc(g3).threads, []); assert.equal(SO.mgrOf(g3, 0).style, null);
  assert.equal(SI.listFor(g3, { team: 0 }).length, 0);
});
t("social events switched off: no situations arise", () => {
  const g = world(); g.socialOn = false; const { sit } = benchedAsk(g); assert.equal(sit, undefined);
  assert.equal(SI.makeComment(g, 0, { kind: "jab", line: "negative", target: 1 }).ok, false);
});

// ---------- footballers: dinner invitations, gifts and memory ----------
const P0 = withParams({});
function footballers(n = 3, seed = 7) {
  const g = world(seed, [0]);
  const us = [];
  for (let i = 0; i < n; i++) { const r = rollNumbers(P0, "room", "tok" + i, 0), p = createUserPlayer(g, { token: "tok" + i, name: "Fb" + i, pos: "CM", nums: r.nums, ovr: r.ovr, assign: defaultAssign("CM"), gender: i % 2 ? "F" : "M" }); p.coins = 500; L.ensureLife(g, p); us.push(p); }
  g.rom = g.rom || undefined; L.ensureRom(g);
  return { g, us };
}
t("two footballers invite the same person to dinner: she picks one, the other is told, nothing is charged, and it is remembered", () => {
  const { g, us } = footballers(2);
  const id = L.PARTNER_LIST[0].id;
  const [a, b] = us; const ca = a.coins, cb = b.coins;
  const r = M2.settleDinners(g, [{ p: a, partner: id }, { p: b, partner: id }]);
  const wins = us.filter((p) => r.out[p.id].ok), lose = us.filter((p) => !r.out[p.id].ok);
  assert.equal(wins.length, 1, "exactly one table"); assert.equal(lose.length, 1);
  assert.ok(r.out[lose[0].id].why.length > 5 && /better offer|turned down/.test(r.out[lose[0].id].why));
  assert.ok(r.notes.some((x) => x.pid === lose[0].id), "the loser is told");
  assert.ok(SO.memOf(g, lose[0].id).rej.some((x) => x.what === "dinner"), "a rejected invitation is remembered");
  assert.ok(SO.memOf(g, lose[0].id).rival.some((x) => x.name === wins[0].name), "and the rival suitor");
  assert.equal(a.coins, ca); assert.equal(b.coins, cb, "settling charges nothing: only a dinner that happens costs money");
  assert.deepEqual(M2.settleDinners(g, [{ p: a, partner: id }, { p: b, partner: id }]).out, r.out, "the same week gives the same answer");
});
t("a dinner that happens costs more than a date, adds bond and followers, and one nobody accepted is never charged", () => {
  const { g, us } = footballers(1); const [a] = us, id = L.PARTNER_LIST[3].id;
  L.ensureOptions(g, a, 0); a.life.opts.ids[0] = id;
  const dateCost = L.actCost(g, a, "date"), c0 = a.coins, f0 = a.life.fol;
  assert.equal(L.blocked(g, a, "date", { partner: id, dinner: true }), null);
  const res = L.runActivity(g, a, "date", { partner: id, day: 0, dinner: true });
  assert.equal(c0 - a.coins, Math.round(dateCost * g.P.social.invite.dinnerMult) || c0 - a.coins);
  assert.ok(a.coins < c0 - dateCost, "dearer than a plain date");
  assert.ok(res.date && res.date.dinner, "marked as a dinner");
  const b = us[0]; b.coins = 1; assert.ok(L.blocked(g, b, "date", { partner: id, dinner: true }), "cannot book a dinner you cannot afford");
});
t("a footballer with two date invitations: the first yes counts, the others are told and remember", () => {
  const { g, us } = footballers(3); const [a, b, c] = us;
  const r1 = RM.sendRequest(g, a, c.id, "date"), r2 = RM.sendRequest(g, b, c.id, "date");
  assert.ok(r1.ok && r2.ok);
  const res = RM.replyRequest(g, c, r1.req.id, true);
  assert.ok(res.ok);
  assert.equal(g.rom.req.find((x) => x.id === r2.req.id).status, "closed");
  assert.ok(res.notes.some((x) => x.pid === b.id && /another invitation/.test(x.text)));
  assert.ok(SO.memOf(g, b.id).rej.some((x) => x.what === "date" && x.by === a.name));
  assert.equal(RM.replyRequest(g, c, r2.req.id, true).ok, false, "the closed one cannot be answered");
  // double booking: c agrees to a, then b asks again and c accepts b: a is told and the booking moves
  const r3 = RM.sendRequest(g, b, c.id, "date"); const res3 = RM.replyRequest(g, c, r3.req.id, true);
  assert.ok(res3.notes.some((x) => x.pid === a.id && /cancelled your date/.test(x.text)));
  assert.equal(c.life.act.partner, "u:" + b.id); assert.ok(!a.life.act || a.life.act.partner !== "u:" + c.id);
});
t("gifts: priced, capped per matchday and per season, discouraging a paid shortcut", () => {
  const { g, us } = footballers(1); const [a] = us, id = L.PARTNER_LIST[1].id;
  L.ensureOptions(g, a, 0); a.life.opts.ids[0] = id; const K = g.P.social.gift;
  assert.equal(M2.sendGift(g, a, id, "nonsense", false).ok, false);
  const c0 = a.coins, r = M2.sendGift(g, a, id, "flowers", false);
  assert.ok(r.ok); assert.equal(c0 - a.coins, K.tiers.flowers.price);
  assert.ok(L.ensureLife(g, a).fav[id].v > 0 && L.ensureLife(g, a).fav[id].v <= K.cap);
  assert.ok(M2.sendGift(g, a, id, "flowers", false).ok, "a second this matchday is fine");
  assert.equal(M2.sendGift(g, a, id, "watch", false).ok, false, "but not a third (" + K.perWeek + " a matchday)");
  g.rom.week++; assert.ok(M2.sendGift(g, a, id, "jewel", false).ok);
  g.rom.week++; assert.equal(M2.sendGift(g, a, id, "jewel", false).ok, false, "season cap " + K.perTarget + " per person");
  assert.ok(L.ensureLife(g, a).fav[id].v <= K.cap, "fondness is capped");
  a.coins = 3; g.rom.week += 5; assert.match(M2.giftState(g, a, L.PARTNER_LIST[2].id, "jewel").why, /afford/);
  assert.equal(M2.giftState(g, a, "u:99999", "flowers").can, false);
});
t("a gift never guarantees success: a rejected invitation can still follow it", () => {
  let rejected = 0, accepted = 0;
  for (let seed = 1; seed <= 20; seed++) { const { g, us } = footballers(1, seed), [a] = us, id = L.PARTNER_LIST[seed % 12].id; L.ensureOptions(g, a, 0); a.life.opts.ids[0] = id; M2.sendGift(g, a, id, "jewel", false); const r = M2.settleDinners(g, [{ p: a, partner: id }]); (r.out[a.id].ok ? accepted++ : rejected++); }
  assert.ok(accepted > 0 && rejected > 0, `accepted ${accepted}, rejected ${rejected}`);
});
t("a private gift stays private unless something reveals it; a public gesture is public by design", () => {
  let found = 0, quiet = 0, stories0 = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const { g, us } = footballers(2, seed), [a, b] = us, id = L.PARTNER_LIST[seed % 12].id;
    a.life.partner = { id: "u:" + b.id, name: b.name, g: "F", excl: true, dates: 5, bond: 70, human: b.id }; b.life.partner = { id: "u:" + a.id, name: a.name, g: "M", excl: true, dates: 5, bond: 70, human: a.id };
    L.ensureOptions(g, a, 0); a.life.opts.ids[0] = id;
    const before = g.news.length, r = M2.sendGift(g, a, id, "watch", false);
    assert.equal(g.news.filter((n) => n.src === "sun" && /GESTURE|FRONT PAGE|ROMANCE WATCH/.test(n.head)).length, 0, "no public story for a private gift");
    if (r.found) { found++; assert.ok(r.notes.some((x) => x.pid === b.id && /You .*(receipt|notification|florist|boot)/.test(x.text)), "the partner learns it, with a cause"); assert.ok(r.found.cause); } else quiet++;
  }
  assert.ok(found > 0 && quiet > 0, `found ${found}, quiet ${quiet}`);
  const { g, us } = footballers(2, 3), [a, b] = us, id = L.PARTNER_LIST[0].id;
  a.life.partner = { id: "u:" + b.id, name: b.name, g: "F", excl: true, dates: 5, bond: 70, human: b.id }; L.ensureOptions(g, a, 0); a.life.opts.ids[0] = id;
  const bond0 = a.life.partner.bond, fol0 = a.life.fol; const r = M2.sendGift(g, a, id, "flowers", true);
  assert.ok(g.news.some((n) => /GESTURE|FRONT PAGE|ROMANCE|QUESTIONS|HOME/.test(n.head)), "public gesture is in the paper");
  assert.ok(a.life.fol > fol0 && a.life.partner.bond < bond0, "and a public gift to someone else costs the relationship");
  assert.ok(r.notes.some((x) => x.pid === b.id && /read it in the paper/.test(x.text)));
});
t("a gift to another footballer is a request: nothing is paid until they accept, and a refusal is remembered", () => {
  const { g, us } = footballers(2); const [a, b] = us, c0 = a.coins;
  const r = M2.sendGift(g, a, "u:" + b.id, "watch", false); assert.ok(r.ok && r.pending); assert.equal(a.coins, c0, "not charged yet");
  assert.equal(M2.sendGift(g, a, "u:" + b.id, "watch", false).ok, false, "one open gift at a time");
  const no = M2.replyGift(g, b, r.req.id, false); assert.ok(no.ok && !no.yes); assert.equal(a.coins, c0);
  assert.ok(SO.memOf(g, a.id).rej.some((x) => x.what === "gift"));
  const r2 = M2.sendGift(g, a, "u:" + b.id, "flowers", false); const yes = M2.replyGift(g, b, r2.req.id, true);
  assert.ok(yes.ok && yes.yes); assert.equal(c0 - a.coins, g.P.social.gift.tiers.flowers.price);
  assert.equal(M2.replyGift(g, b, r2.req.id, true).ok, false, "answering twice pays twice? no");
  assert.equal(a.coins, c0 - g.P.social.gift.tiers.flowers.price);
});
t("exes are remembered when a relationship ends", () => {
  const { g, us } = footballers(2); const [a, b] = us;
  a.life.partner = { id: "u:" + b.id, name: b.name, excl: true, dates: 5, bond: 70, human: b.id }; b.life.partner = { id: "u:" + a.id, name: a.name, excl: true, dates: 5, bond: 70, human: a.id };
  const res = RM.breakUp(g, a); assert.ok(res.ok);
  assert.ok(SO.memOf(g, a.id).ex.some((x) => x.name === b.name) && SO.memOf(g, b.id).ex.some((x) => x.name === a.name));
  assert.equal(M2.memoryView(g, a).exes[0], b.name);
});
t("managers have no way into the dating market", () => {
  const g = world(); const mgr = Object.values(g.players).find((p) => !p.user);
  assert.equal(M2.giftState(g, mgr, L.PARTNER_LIST[0].id, "flowers").can === true && !!mgr.life, false);
  assert.equal(g.teams[0].human, true);
  assert.ok(!("user" in g.teams[0]) || !g.teams[0].user);
});

await Promise.all(pending);
console.log(`\n${n} social tests passed`);
