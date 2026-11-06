// The WAG week: the full set of activities, the separate match choice, the non-player date pool, the match-time sequences, brand and business.
// Run with: node tests/wag_week.js
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { D, createGame, runDraft, runMarket } from "./lib.js";
import { serializeGame, restoreGame } from "../engine/game.js";
import * as SO from "../engine/social.js";
import * as L from "../engine/life.js";
import * as W from "../engine/wag.js";
import { rollNumbers, createUserPlayer, defaultAssign } from "../engine/playermode.js";
import { withParams } from "../engine/params.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const P0 = withParams({}), FX = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
function world({ nf = 0, nw = 1, seed = 11 } = {}) {
  const g = createGame({ D, N: 10, seed }); runDraft(g); runMarket(g);
  g.P = JSON.parse(JSON.stringify(g.P)); g.socialOn = true; g.galaOn = true; g.ownerName = () => null; g.weekDay = 2; g.season = g.season || 1; L.ensureRom(g); SO.ensureSoc(g);
  const us = []; for (let i = 0; i < nf; i++) { const r = rollNumbers(P0, "room", "tok" + i, 0), p = createUserPlayer(g, { token: "tok" + i, name: "Fb" + i, pos: "CM", nums: r.nums, ovr: r.ovr, assign: defaultAssign("CM"), gender: i % 2 ? "F" : "M" }); p.coins = 900; p.team = i; L.ensureLife(g, p); L.ensureOptions(g, p, 2); us.push(p); }
  const ws = []; for (let i = 0; i < nw; i++) ws.push(W.createWag(g, { name: "Wag" + i, gender: "F" }));
  return { g, us, ws };
}
const NPC = (g, team) => Object.values(g.players).filter((p) => !p.user && !p.retired && p.team === team && W.fbOk(g, p.id)).sort((a, b) => b.ovr - a.ovr)[0];
const kick = (g, day = 2) => W.kickoff(g, { day, fixtures: FX });
const act = (g, w, c, day = 2) => W.setAct(g, w, c, { day, fixtures: FX });

t("a WAG has the footballer's options (date, party, quiet night in, content, business) and none of training", () => {
  assert.deepEqual(Object.keys(W.ACTS), ["date", "party", "quiet", "content", "business"]);
  const { g, ws } = world(); const w = ws[0];
  for (const a of ["party", "quiet", "content", "business"]) assert.ok(act(g, w, { act: a }).ok, a);
  for (const bad of ["train", "attend", "rest", "balance", ""]) assert.equal(act(g, w, { act: bad }).ok, false, bad);
  w.coins = 5; assert.equal(act(g, w, { act: "party" }).ok, false, "cannot afford a night out");
});

t("the match is its own choice, taken alongside any activity, and is charged once at kick-off", () => {
  const { g, ws } = world(); const w = ws[0], c0 = w.coins;
  assert.ok(act(g, w, { act: "quiet" }).ok); assert.ok(W.setMatch(g, w, { fixture: 0, team: 1 }, { fixtures: FX }).ok);
  assert.ok(w.act && w.match, "both are held at once"); assert.equal(w.coins, c0, "nothing is taken until kick-off");
  kick(g); kick(g); assert.equal(w.coins, c0 - g.P.social.wag.cost.attend, "the ticket, once");
  assert.ok(w.attending && w.attending.team === 1 && !w.attending.done); assert.equal(w.match, null, "the choice is spent");
  assert.equal(W.setMatch(g, w, { fixture: 0, team: 7 }, { fixtures: FX }).ok, false);
  W.clearMatch(w); assert.equal(w.match, null);
});

t("the pool: three people who are not players, both genders, stable for the matchday, with a cheaper date", () => {
  const { g, ws } = world(); const w = ws[0], o = W.npcOpts(g, w, 2);
  assert.equal(o.length, 3); assert.ok(o.some((x) => x.g === "F") && o.some((x) => x.g === "M")); assert.deepEqual(o.map((x) => x.id), W.npcOpts(g, w, 2).map((x) => x.id));
  assert.notDeepEqual(o.map((x) => x.id), W.npcOpts(g, w, 3).map((x) => x.id), "a new pool on another day");
  const id = "n:" + o[0].id; assert.equal(act(g, w, { act: "date", partner: "n:nobody" }).ok, false);
  const c0 = w.coins, f0 = w.fol, b0 = w.brand; assert.ok(act(g, w, { act: "date", partner: id }).ok); kick(g);
  assert.equal(w.coins, c0 - g.P.social.wag.cost.dateNpc, "cheaper than a player date"); assert.ok(g.P.social.wag.cost.dateNpc < g.P.social.wag.cost.date);
  assert.ok(w.fol > f0 && w.fol - f0 < 0.4 * g.P.social.wag.date.fol * 1.5 + 1, "followers barely move: " + (w.fol - f0)); assert.equal(w.brand, b0, "no brand");
  assert.equal(Object.keys(g.wag.pairs).length, 0, "no relationship record, no headlines"); assert.equal(g.wag.ledger.at(-1).why, "date");
  const pv = W.viewFor(g, w, { day: 2, fixtures: FX, open: true }); assert.equal(pv.pool.filter((x) => x.kind === "npc").length, 3);
  for (const x of pv.pool) assert.ok(x.id && x.name, "every pool entry has a name for the picture card");
});

t("a footballer's number puts that footballer in the pool, a stranger is not there, and a date with a player moves status more", () => {
  const { g, ws } = world(); const w = ws[0], tg = NPC(g, 0), id = W.fbId(tg.id);
  assert.ok(!W.viewFor(g, w, { day: 2, fixtures: FX }).pool.some((x) => x.id === id) || W.scene(g, w, 2).includes(id));
  g.P.social.wag.attend.scene = 0; assert.ok(!W.viewFor(g, w, { day: 2, fixtures: FX }).pool.some((x) => x.id === id), "not met, not in the pool");
  w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 9 });
  const e = W.viewFor(g, w, { day: 2, fixtures: FX }).pool.find((x) => x.id === id); assert.ok(e && e.kind === "contact" && e.pid === tg.id && e.name === tg.name, "contact is in the pool, with the player id for the card");
  w.contacts = [{ id, name: tg.name, team: 0, made: 0, from: 5, until: 9 }]; assert.ok(!W.viewFor(g, w, { day: 2, fixtures: FX }).pool.some((x) => x.id === id), "a number that is not ready yet is not offered");
  w.contacts = [{ id, name: tg.name, team: 0, made: 0, from: 0, until: 9 }]; g.P.social.wag.date.accept = -1; const b0 = w.brand, f0 = w.fol;
  assert.ok(act(g, w, { act: "date", partner: id }).ok); kick(g); assert.ok(w.fol - f0 >= g.P.social.wag.date.fol * 0.5 * 0.99, "a player date is worth more followers");
  assert.ok(w.brand >= b0);
});

t("a human footballer must say yes, and then appears as a booked date", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0], me = "u:" + us[0].id;
  assert.equal(act(g, w, { act: "date", partner: me }).ok, false);
  const pv = W.viewFor(g, w, { day: 2, fixtures: FX }); assert.ok(pv.pool.find((x) => x.id === me && x.kind === "human" && x.pid === us[0].id), "the human footballer is in the pool, to be asked");
  const q = W.sendRequest(g, w.id, me, "date", { day: 2 }); assert.ok(q.ok); const r = W.replyRequest(g, me, q.req.id, true, { day: 2 }); assert.ok(r.yes);
  assert.equal(w.act.partner, me); kick(g); assert.equal(w.last.act, "date");
});

t("a quiet night in warms whoever you see, and the scene's regard when you see nobody", () => {
  const { g, ws } = world(); const w = ws[0], r0 = w.rapport; act(g, w, { act: "quiet" }); kick(g);
  assert.equal(w.rapport, r0 + g.P.social.wag.quiet.rapport); assert.equal(w.cnt.quiet, 1);
  const tg = NPC(g, 0), id = W.fbId(tg.id); g.P.social.wag.date.accept = -1; w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 99 });
  act(g, w, { act: "date", partner: id }, 3); kick(g, 3); const pr = W.pairOf(g, w.id, id), b0 = pr.bond; act(g, w, { act: "quiet" }, 4); kick(g, 4); assert.equal(pr.bond, b0 + g.P.social.wag.quiet.bond);
});

t("every WAG gets the matchday menu at kick-off: two picks a half, one if they are at the match", () => {
  const { g, ws } = world({ nw: 2 }); const [a, b] = ws; act(g, a, { act: "quiet" }); act(g, b, { act: "party" }); W.setMatch(g, b, { fixture: 0, team: 0 }, { fixtures: FX }); kick(g);
  const S = g.P.social.wag.seq; assert.equal(a.sq.left, S.slots); assert.equal(b.sq.left, S.slotsAt); assert.equal(b.sq.at, true);
  const v = W.viewFor(g, a, { day: 2, fixtures: FX }).seq; assert.ok(v.menu.length >= 16, "a large menu: " + v.menu.length); assert.equal(v.cats.length, 4);
  for (const m of v.menu) assert.ok(m.name && m.desc && m.icon, m.id + " has words"); assert.equal(v.left, 2);
  assert.equal(W.viewFor(g, b, { day: 2, fixtures: FX }).seq.focus, "party", "the week's main thing is the focus");
});

t("a menu pick resolves at once, once per match, within the picks left, and costs what it says", () => {
  const { g, ws } = world(); const w = ws[0]; act(g, w, { act: "quiet" }); kick(g);
  const f0 = w.fol; const r1 = W.seqChoose(g, w, "trend"); assert.ok(r1.ok && r1.entry.beat === 0 && w.sq.left === 1); assert.ok(w.fol !== f0, "followers moved");
  assert.equal(W.seqChoose(g, w, "trend").ok, false, "once per match"); assert.equal(W.seqChoose(g, w, "nope").ok, false, "not on the menu");
  assert.ok(W.seqChoose(g, w, "kits").ok && w.sq.left === 0); const r3 = W.seqChoose(g, w, "gossip"); assert.equal(r3.ok, false); assert.match(r3.why, /first half/, "no more picks until half-time");
  W.seqHalf(g, { day: 2 }); assert.equal(w.sq.beat, 1); assert.equal(w.sq.left, 2); assert.equal(W.seqHalf(g, { day: 2 }).notes.length, 0, "half-time runs once"); assert.equal(w.sq.left, 2);
  w.coins = 10; const v = W.viewFor(g, w, { day: 2, fixtures: FX }).seq; assert.equal(v.menu.find((m) => m.id === "vip").can, false); const bad = W.seqChoose(g, w, "vip"); assert.equal(bad.ok, false); assert.match(bad.why, /30 coins/); assert.equal(w.coins, 10);
  w.coins = 100; assert.ok(W.seqChoose(g, w, "vip").ok); assert.ok(w.coins <= 70, "paid for the table");
  assert.ok(W.seqChoose(g, w, "bath").ok && w.sq.left === 0); W.seqFinish(g, { day: 2 }); assert.ok(w.sq.done); assert.equal(W.seqChoose(g, w, "dance").ok, false, "the menu closes at full time");
  assert.ok(w.sq.log.length === 4 && w.sq.log.every((x) => x.text.length > 10), "every pick was told as a little story");
});

t("nothing is chosen for a WAG: an idle one just has a quiet match, and finishing is idempotent", () => {
  const { g, ws } = world({ nw: 2 }); const [a, b] = ws; act(g, a, { act: "content" }); act(g, b, { act: "quiet" }); kick(g); const c0 = a.coins, f0 = a.fol;
  assert.equal(W.seqHalf(g, { day: 2 }).notes.length, 0); assert.equal(W.seqFinish(g, { day: 2 }).notes.length, 0); assert.equal(W.seqFinish(g, { day: 2 }).notes.length, 0);
  assert.ok(a.sq.done && a.sq.log.length === 0 && a.coins === c0 && a.fol === f0, "no hidden picks");
});

t("the week's focus makes its category's actions a bit better and a bit likelier", () => {
  const run = (focus) => { const { g, ws } = world({ seed: 4 }); const w = ws[0]; act(g, w, { act: focus }); kick(g); g.P.social.wag.menu.find((m) => m.id === "trend").p = 1; const f0 = w.fol; W.seqChoose(g, w, "trend"); return w.fol - f0; };
  assert.ok(run("content") > run("quiet"), "a content week gets more out of 'trend': " + run("content") + " vs " + run("quiet"));
});

t("results depend only on the seed: same picks, same outcome; brand raises the odds", () => {
  const run = (brand) => { const { g, ws } = world({ seed: 5 }); const w = ws[0]; w.brand = brand; act(g, w, { act: "quiet" }); kick(g); return [W.seqChoose(g, w, "collab").entry.text, W.seqChoose(g, w, "prank").entry.text].join("|"); };
  assert.equal(run(10), run(10));
  let lo = 0, hi = 0; for (let s = 1; s <= 200; s++) { const a = world({ seed: s }), b = world({ seed: s }); a.ws[0].brand = 0; b.ws[0].brand = 100; for (const q of [a, b]) { act(q.g, q.ws[0], { act: "quiet" }); kick(q.g); } lo += W.seqChoose(a.g, a.ws[0], "collab").entry.ok ? 1 : 0; hi += W.seqChoose(b.g, b.ws[0], "collab").entry.ok ? 1 : 0; }
  assert.ok(hi > lo, `a big brand lands more often (${hi} vs ${lo})`);
});

t("business: progress becomes levels, levels pay every matchday, a bigger brand pays more", () => {
  const { g, ws } = world(); const w = ws[0]; const B = g.P.social.wag.biz; w.coins = 2000;
  assert.equal(W.bizIncome(g, w), 0);
  for (let d = 0; d < 6 && !w.biz.lvl; d++) { act(g, w, { act: "business" }, d); kick(g, d); W.seqFinish(g, { day: d }); }
  assert.ok(w.biz.lvl >= 1, "the business opens"); const inc = W.bizIncome(g, w); assert.ok(inc > 0); w.brand = 90; assert.ok(W.bizIncome(g, w) > inc);
  const c0 = w.coins; act(g, w, { act: "quiet" }, 20); const res = kick(g, 20); assert.ok(w.coins >= c0 + inc, "paid at kick-off"); assert.ok(res.notes.some((x) => /brought in/.test(x.text)));
  w.biz = { lvl: B.max, prog: 2 }; W.kickoff(g, { day: 21, fixtures: FX }); assert.ok(w.biz.lvl <= B.max);
});

t("content respects the season limit in both versions and the quick version is worth less", () => {
  const A = world(), B = world(); const a = A.ws[0], b = B.ws[0];
  act(A.g, a, { act: "content" }); kick(A.g); const full = a.fol - 3000; W.seqFinish(A.g, { day: 2 });
  act(B.g, b, { act: "content" }); W.setMatch(B.g, b, { fixture: 0, team: 0 }, { fixtures: FX }); kick(B.g); const quick = b.fol - 3000;
  assert.ok(quick < full && quick > 0, `quick ${quick} < full ${full}`);
  const K = A.g.P.social.wag.content; for (let d = 3; d < 3 + K.perSeason; d++) { if (act(A.g, a, { act: "content" }, d).ok) { kick(A.g, d); W.seqFinish(A.g, { day: d }); } }
  assert.equal(act(A.g, a, { act: "content" }, 30).ok, false);
});

t("a party can lead to a contact, who then shows in the pool next matchday", () => {
  let found = null;
  for (let s = 1; s <= 60 && !found; s++) { const { g, ws } = world({ seed: s }); const w = ws[0]; w.coins = 500; w.brand = 100; act(g, w, { act: "party" }); kick(g); W.seqChoose(g, w, "afterparty"); if (w.contacts.length) found = { g, w }; }
  assert.ok(found, "an afterparty gave someone's number"); const c = found.w.contacts[0]; assert.equal(c.via, "party"); assert.equal(c.from, 3);
  assert.ok(!W.activeContacts(found.w, 2).length && W.activeContacts(found.w, 3).length, "from the next matchday only");
  assert.ok(W.viewFor(found.g, found.w, { day: 3, fixtures: FX }).pool.some((x) => x.id === c.id && x.kind === "contact"));
});

t("Folarin Balogun is in the pool at 84 and is often on the scene for a WAG; only a WAG who has him taken, or already has his number, loses him", () => {
  const rec = D.players.find((p) => p.slug === "folarin-balogun"); assert.ok(rec && rec.ovr === 84 && rec.pos === "ST" && rec.nat === "United States" && rec.age === 25 && rec.club === "AS Monaco" && rec.tier === "silver");
  assert.ok(existsSync(new URL("../public/assets/players/folarin-balogun.png", import.meta.url)), "his photo is in assets/players");
  const { g, ws } = world({ nw: 2 }); const b = Object.values(g.players).find((p) => p.slug === "folarin-balogun"); assert.ok(b && b.ovr === 84, "he is in the game at 84");
  const id = "f:" + b.id, days = 100, n = g.P.social.wag.attend.scene; let seen = 0;
  for (let d = 0; d < days; d++) { const sc = W.scene(g, ws[0], d); assert.equal(sc.length, n, "the scene is still " + n + " people"); assert.equal(new Set(sc).size, n); if (sc.includes(id)) seen++; }
  assert.ok(seen >= 55 && seen <= 90, `often on the scene (${seen}/${days} matchdays)`);
  assert.deepEqual(W.scene(g, ws[0], 7), W.scene(g, ws[0], 7), "same seed, same scene");
  const other = Array.from({ length: days }, (_, d) => W.scene(g, ws[1], d).includes(id)).filter(Boolean).length; assert.ok(other >= 55, "and for every WAG (" + other + ")");
  ws[0].contacts = [{ id, name: b.name, team: b.team, made: 0, from: 0, until: 999, via: "match" }]; assert.ok(!W.scene(g, ws[0], 3).includes(id), "a WAG who already has his number does not see him twice");
  ws[0].contacts = []; g.P.social.wag.stars = []; assert.ok(Array.from({ length: days }, (_, d) => W.scene(g, ws[1], d).includes(id)).filter(Boolean).length < 30, "without the setting he is an ordinary name on the list");
});

t("the football RNG is untouched: a week of sequences changes no match result", () => {
  const a = world({ seed: 9 }), b = world({ seed: 9 }); const w = b.ws[0]; act(b.g, w, { act: "party" }); kick(b.g); W.seqChoose(b.g, w, "afterparty"); W.seqChoose(b.g, w, "vip"); W.seqHalf(b.g, { day: 2 }); W.seqFinish(b.g, { day: 2 });
  assert.deepEqual(serializeGame(a.g).players, serializeGame(b.g).players, "players are not touched");
  assert.equal(JSON.stringify(a.g.teams.map((x) => x.coins ?? 0)), JSON.stringify(b.g.teams.map((x) => x.coins ?? 0)));
});

t("old saves load: a WAG saved without the new fields gets them, and the whole thing survives a save", () => {
  const { g, ws } = world(); const w = ws[0]; for (const k of ["brand", "rapport", "biz", "match", "sq"]) delete w[k]; delete w.cnt.party; delete w.cnt.business;
  const g2 = restoreGame(D, JSON.parse(JSON.stringify(serializeGame(g)))); const v = W.wagOf(g2, w.id);
  assert.ok(v.brand > 0 && v.biz && v.biz.lvl === 0 && v.sq === null && v.match === null && v.cnt.party === 0);
  act(g2, v, { act: "content" }); kick(g2); assert.ok(v.sq);
  const g3 = restoreGame(D, JSON.parse(JSON.stringify(serializeGame(g2)))); assert.ok(W.wagOf(g3, w.id).sq && W.wagOf(g3, w.id).sq.left === 2);
  assert.ok(JSON.stringify(W.viewFor(g3, W.wagOf(g3, w.id), { day: 3, fixtures: FX })).length > 100);
});

t("privacy: a WAG's view carries its own menu state only, and no hidden numbers", () => {
  const { g, ws } = world({ nw: 2 }); act(g, ws[0], { act: "content" }); kick(g);
  const mine = JSON.stringify(W.viewFor(g, ws[0], { day: 2, fixtures: FX })), theirs = JSON.stringify(W.viewFor(g, ws[1], { day: 2, fixtures: FX }));
  assert.ok(/"seq":\{"title":"Matchday menu"/.test(mine) && /"seq":\{"title":"Matchday menu"/.test(theirs) && !JSON.parse(theirs).seq.log.length, "each sees only their own menu state"); W.seqChoose(g, ws[0], "trend"); assert.ok(JSON.parse(JSON.stringify(W.viewFor(g, ws[1], { day: 2, fixtures: FX }))).seq.log.length === 0 && JSON.stringify(W.viewFor(g, ws[0], { day: 2, fixtures: FX })).includes('"trend"'));
  assert.ok(!/"p":0\.\d/.test(mine) && !/"x":\{/.test(mine), "chances and failure effects are not sent");
});

console.log(`\n${n} WAG week tests passed`);
