// Tests for the mid-season gala engine: one-time start, room shapes, invitations, seating, interactions, roundup, save/restore. Run with: node tests/gala_unit.js
import assert from "node:assert/strict";
import { D, createGame, runDraft, runMarket } from "./lib.js";
import { serializeGame, restoreGame } from "../engine/game.js";
import * as SO from "../engine/social.js";
import * as GA from "../engine/gala.js";
import * as L from "../engine/life.js";
import { rollNumbers, createUserPlayer, defaultAssign } from "../engine/playermode.js";
import { withParams } from "../engine/params.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const P0 = withParams({});
// humans = managers' team ids; nf = footballers (users). Returns the game and the footballers.
function world({ humans = [0, 1], nf = 0, seed = 11 } = {}) {
  const g = createGame({ D, N: 10, seed }); runDraft(g); runMarket(g);
  for (const i of humans) { g.teams[i].human = true; g.teams[i].name = "Team " + i; }
  g.socialOn = true; g.galaOn = true; g.ownerName = (i) => ["Ann", "Bob", "Cy"][i] || null;
  const us = [];
  for (let i = 0; i < nf; i++) { const r = rollNumbers(P0, "room", "tok" + i, 0), p = createUserPlayer(g, { token: "tok" + i, name: "Fb" + i, pos: "CM", nums: r.nums, ovr: r.ovr, assign: defaultAssign("CM"), gender: i % 2 ? "F" : "M" }); p.coins = 900; L.ensureLife(g, p); L.ensureOptions(g, p, 3); us.push(p); }
  L.ensureRom(g); g.weekDay = 3; g.season = g.season || 1;
  return { g, us };
}
const begin = (g, humans, us) => GA.galaBegin(g, { managers: humans, players: us.map((p) => p.id) }, 3);
const live = (g) => { const notes = GA.galaSeat(g); return notes; };

t("the gala starts once per season and never twice", () => {
  const { g, us } = world({ nf: 2 });
  assert.ok(begin(g, [0, 1], us));
  assert.equal(begin(g, [0, 1], us), null, "second start refused");
  assert.equal(SO.ensureSoc(g).galaDone[g.season], true);
  g.season = 2; assert.ok(begin(g, [0, 1], us), "a new season has its own gala");
});
t("the gala day is the middle of the schedule", () => { assert.equal(GA.galaDay(18), 8); assert.equal(GA.galaDay(4), -1); });

t("manager-only room: managers sit down, toast, no dating options exist at all", () => {
  const { g } = world(); begin(g, [0, 1], []); live(g);
  const G = GA.galaOf(g), o = GA.optionsFor(g, GA.mk(0));
  assert.equal(G.att[GA.mk(0)].kind, "manager");
  assert.ok(o.some((x) => x.id === "toast:gracious") && !o.some((x) => x.kind === "romance"));
  assert.equal(GA.invite(g, { id: 99, life: {} }, "x").ok, false, "a manager cannot invite a date");
  const r = GA.pick(g, GA.mk(0), "toast:gracious"); assert.ok(r.ok);
  assert.equal(GA.pick(g, GA.mk(0), "toast:boast").ok, false, "one interaction only");
  const res = GA.galaResolve(g); assert.ok(res.roundup && res.roundup.lines.length >= 1);
});
t("managers on bad terms who share a table can reconcile only when the other agrees", () => {
  const { g } = world(); SO.setMrel(g, 0, 1, -1, "test"); g.P.social.gala.tableSize = 6; begin(g, [0, 1], []); live(g);
  const o = GA.optionsFor(g, GA.mk(0)).find((x) => x.kind === "reconcile"); assert.ok(o, "reconcile offered between sour managers");
  GA.pick(g, GA.mk(0), o.id); const pr = GA.promptsFor(g, GA.mk(1)); assert.equal(pr.length, 1);
  GA.respond(g, GA.mk(1), pr[0].id, "yes"); GA.galaResolve(g);
  assert.equal(SO.mrel(g, 0, 1), 0, "relations eased");
  // refused
  const w2 = world(); SO.setMrel(w2.g, 0, 1, -1, "test"); begin(w2.g, [0, 1], []); live(w2.g);
  GA.pick(w2.g, GA.mk(0), "reconcile:" + GA.mk(1)); GA.respond(w2.g, GA.mk(1), GA.promptsFor(w2.g, GA.mk(1))[0].id, "no"); GA.galaResolve(w2.g);
  assert.equal(SO.mrel(w2.g, 0, 1), -1, "no change when refused");
});
t("an unanswered question changes nothing and the gala still finishes", () => {
  const { g } = world(); SO.setMrel(g, 0, 1, -1, "test"); begin(g, [0, 1], []); live(g);
  GA.pick(g, GA.mk(0), "reconcile:" + GA.mk(1)); const r = GA.galaResolve(g);
  assert.equal(SO.mrel(g, 0, 1), -1); assert.equal(GA.galaOf(g).status, "end"); assert.ok(r.roundup);
  const again = GA.galaResolve(g); assert.deepEqual(again.notes, [], "resolving twice does nothing"); assert.equal(SO.mrel(g, 0, 1), -1);
});
t("a public confrontation is a story, a refused reconcile stays private", () => {
  const { g } = world(); SO.setMrel(g, 0, 1, -1, "test"); begin(g, [0, 1], []); live(g);
  const before = g.news.length; GA.pick(g, GA.mk(0), "confront:" + GA.mk(1)); GA.respond(g, GA.mk(1), GA.promptsFor(g, GA.mk(1))[0].id, "stand"); GA.galaResolve(g);
  assert.ok(g.news.length > before && g.news.some((x) => /GALA|CLASH|SCENE/i.test(x.head)), "the row is in the paper");
  assert.equal(SO.mrel(g, 0, 1), -2, "the rift deepens");
  const w = world(); SO.setMrel(w.g, 0, 1, -1, "t"); begin(w.g, [0, 1], []); live(w.g); const nb = w.g.news.length;
  GA.pick(w.g, GA.mk(0), "reconcile:" + GA.mk(1)); GA.respond(w.g, GA.mk(1), GA.promptsFor(w.g, GA.mk(1))[0].id, "no"); const res = GA.galaResolve(w.g);
  assert.ok(!w.g.news.slice(nb).some((x) => /AND .* (CLASH|BURY)/.test(x.head)));
  const priv = res.roundup.lines.filter((l) => l.tag === "private"); assert.ok(priv.length && priv.every((l) => l.keys.includes(GA.mk(0))), "private line carries who may read it");
});
t("a boast is stored and checked at season end (kept or thrown back)", () => {
  const { g } = world(); begin(g, [0, 1], []); live(g); GA.pick(g, GA.mk(0), "toast:boast"); GA.galaResolve(g);
  assert.ok(SO.ensureSoc(g).galaBoast[0]);
  const table = [{ i: 5 }, { i: 6 }, { i: 7 }, { i: 0 }]; const nb = g.news.length; const out = GA.checkBoasts(g, table);
  assert.equal(out.length, 1); assert.ok(g.news.length > nb); assert.equal(SO.ensureSoc(g).galaBoast[0], undefined, "checked once");
  assert.equal(GA.checkBoasts(g, table).length, 0);
});

t("footballer-only room: guests, dates and seating; managers never appear", () => {
  const { g, us } = world({ humans: [], nf: 3 }); begin(g, [], us);
  const G = GA.galaOf(g); assert.ok(Object.values(G.att).every((a) => a.kind === "player"));
  const id = L.ensureLife(g, us[0]).opts.ids[0]; const r = GA.invite(g, us[0], id); assert.ok(r.ok, r.why);
  GA.galaSeat(g); assert.equal(G.status, "live");
  const all = G.tables.flatMap((x) => x.seats); assert.equal(new Set(all).size, all.length, "nobody sits twice");
  assert.ok(Object.keys(G.att).every((k) => all.includes(k)), "everybody has a seat");
  for (const u of us) assert.ok(!GA.optionsFor(g, GA.fk(u.id)).some((o) => /^(reconcile|dispute):m/.test(o.id)));
});
t("a listed person accepts at most one gala invitation; the others are told and it is remembered", () => {
  const { g, us } = world({ humans: [], nf: 3 }); begin(g, [], us);
  const id = L.PARTNER_LIST[0].id; for (const p of us) { L.ensureLife(g, p).opts.ids = [id]; assert.ok(GA.invite(g, p, id).ok); }
  const notes = GA.galaSeat(g), G = GA.galaOf(g);
  const acc = G.invites.filter((i) => i.status === "accepted"); assert.ok(acc.length <= 1);
  assert.equal(G.invites.filter((i) => i.status === "open").length, 0, "nothing left open");
  assert.ok(notes.length >= 3 || acc.length === 0);
  for (const i of G.invites.filter((x) => x.status === "declined")) assert.ok(SO.memOf(g, i.from).rej.some((r) => r.id === id));
  const guests = Object.values(G.att).filter((a) => a.kind === "guest"); assert.equal(guests.length, acc.length);
});
t("two footballers invite the same footballer: the first yes counts, the other is told", () => {
  const { g, us } = world({ humans: [], nf: 3 }); begin(g, [], us);
  const [a, b, c] = us; assert.ok(GA.invite(g, a, "u:" + c.id).ok); assert.ok(GA.invite(g, b, "u:" + c.id).ok);
  const G = GA.galaOf(g), ia = G.invites.find((i) => i.from === a.id), ib = G.invites.find((i) => i.from === b.id);
  const r = GA.answerInvite(g, c, ib.id, true); assert.ok(r.ok);
  assert.equal(ia.status, "closed"); assert.ok(r.notes.some((x) => x.pid === a.id && /another/.test(x.text)), "the other inviter is told");
  assert.equal(GA.answerInvite(g, c, ia.id, true).ok, false, "the closed invitation cannot be accepted");
  assert.ok(SO.memOf(g, a.id).rej.some((x) => x.id === "u:" + c.id));
  GA.galaSeat(g); assert.equal(G.dates[b.id].human, c.id); assert.equal(G.dates[a.id], undefined);
  assert.ok(GA.tableOf(G, GA.fk(b.id)).seats.includes(GA.fk(c.id)), "dates share a table");
});
t("invitation limits and eligibility", () => {
  const { g, us } = world({ humans: [], nf: 2 }); begin(g, [], us);
  assert.equal(GA.invite(g, us[0], "n:nobody").ok, false);
  const L0 = L.ensureLife(g, us[0]); L0.married = true; assert.equal(GA.invite(g, us[0], "u:" + us[1].id).ok, false, "married footballers bring their spouse");
  GA.galaSeat(g); assert.equal(GA.invite(g, us[1], "u:" + us[0].id).ok, false, "closed after the preparation");
});
t("seat requests are honoured at most twice per person, and the organisers use real history", () => {
  const { g, us } = world({ humans: [0, 1, 2], nf: 3 }); g.P.social.gala.tableSize = 3; g.P.social.gala.dramaSeat = 1; begin(g, [0, 1, 2], us);
  const d = GA.mk(2); for (const k of [GA.mk(0), GA.mk(1), GA.fk(us[0].id)]) assert.ok(GA.seatRequest(g, k, d).ok);
  assert.equal(GA.seatRequest(g, d, d).ok, false, "not yourself"); assert.equal(GA.seatRequest(g, "zzz", d).ok, false);
  GA.galaSeat(g); const G = GA.galaOf(g), tb = GA.tableOf(G, d);
  const asked = [GA.mk(0), GA.mk(1), GA.fk(us[0].id)].filter((k) => tb.seats.includes(k)); assert.ok(asked.length <= 2, "limit of two");
  assert.ok(tb.seats.length <= 3);
  const h = GA.history(g, G); assert.ok(Array.isArray(h));
});
t("exes are seated together when the organisers know about it (drama seating)", () => {
  const { g, us } = world({ humans: [], nf: 6 }); g.P.social.gala.tableSize = 2; g.P.social.gala.dramaSeat = 1;
  SO.remember(g, us[0].id, "ex", { id: "u:" + us[1].id, name: us[1].name }); begin(g, [], us); GA.galaSeat(g);
  const G = GA.galaOf(g); assert.equal(GA.tableOf(G, GA.fk(us[0].id)).id, GA.tableOf(G, GA.fk(us[1].id)).id);
  assert.ok(G.tags.some((x) => x.why === "are exes"));
});
t("a footballer's dance with a human needs consent; footballers only", () => {
  const { g, us } = world({ humans: [0], nf: 2 }); g.P.social.gala.tableSize = 6; begin(g, [0], us); GA.galaSeat(g);
  const a = GA.fk(us[0].id), b = GA.fk(us[1].id);
  assert.ok(GA.optionsFor(g, a).some((o) => o.id === "romance:" + b));
  assert.ok(!GA.optionsFor(g, GA.mk(0)).some((o) => o.kind === "romance"), "managers have no romantic options");
  assert.equal(GA.pick(g, GA.mk(0), "romance:" + a).ok, false);
  const love0 = L.ensureLife(g, us[1]).love; GA.pick(g, a, "romance:" + b); GA.respond(g, b, GA.promptsFor(g, b)[0].id, "yes"); GA.galaResolve(g);
  assert.ok(L.ensureLife(g, us[1]).love > love0);
});
t("a dance nobody agrees to changes nothing and is only known to the two", () => {
  const { g, us } = world({ humans: [], nf: 2 }); begin(g, [], us); GA.galaSeat(g);
  const a = GA.fk(us[0].id), b = GA.fk(us[1].id), love0 = L.ensureLife(g, us[1]).love, nb = g.news.length;
  GA.pick(g, a, "romance:" + b); const r = GA.galaResolve(g);
  assert.equal(L.ensureLife(g, us[1]).love, love0); assert.equal(g.news.length, nb);
  assert.ok(r.roundup.lines.filter((l) => l.tag === "private").every((l) => l.keys.includes(a) && l.keys.includes(b)));
});
t("a manager and their own sulking footballer can clear the air at the gala", () => {
  const { g, us } = world({ humans: [0], nf: 1 }); us[0].team = 0; g.teams[0].players.push(us[0].id);
  SO.addTrust(g, 0, us[0].id, -2); begin(g, [0], us); GA.galaSeat(g);
  const o = GA.optionsFor(g, GA.mk(0)).find((x) => x.kind === "reconcile" && x.with === GA.fk(us[0].id)); assert.ok(o, "offered to the manager");
  GA.pick(g, GA.mk(0), o.id); GA.respond(g, GA.fk(us[0].id), GA.promptsFor(g, GA.fk(us[0].id))[0].id, "yes"); GA.galaResolve(g);
  assert.equal(SO.trustOf(g, 0, us[0].id), 0);
});
t("at most three gala stories reach the league desk", () => {
  const { g } = world({ humans: [0, 1, 2], nf: 0 }); for (const [a, b] of [[0, 1], [1, 2], [0, 2]]) SO.setMrel(g, a, b, -1, "t");
  begin(g, [0, 1, 2], []); GA.galaSeat(g); const nb = g.news.length;
  GA.pick(g, GA.mk(0), "toast:boast"); GA.pick(g, GA.mk(1), "confront:" + GA.mk(2)); GA.pick(g, GA.mk(2), "reconcile:" + GA.mk(0)); GA.galaResolve(g);
  assert.ok(g.news.length - nb <= g.P.social.gala.maxStories);
});
t("save and restore in the middle of a gala keeps everything, and resolution still works once", () => {
  const { g, us } = world({ humans: [0, 1], nf: 1 }); SO.setMrel(g, 0, 1, -1, "t"); begin(g, [0, 1], us); GA.galaSeat(g);
  GA.pick(g, GA.mk(0), "reconcile:" + GA.mk(1));
  const snap = JSON.parse(JSON.stringify(serializeGame(g))); const g2 = restoreGame(D, snap); g2.galaOn = true;
  const G2 = GA.galaOf(g2); assert.equal(G2.status, "live"); assert.equal(G2.prompts.length, 1);
  GA.respond(g2, GA.mk(1), G2.prompts[0].id, "yes"); GA.galaResolve(g2); assert.equal(SO.mrel(g2, 0, 1), 0);
  assert.equal(begin(g2, [0, 1], us), null, "a restored game does not hold a second gala");
});
t("an old save with no gala state is fine", () => {
  const { g } = world(); delete g.soc; assert.equal(GA.galaOf(g), null); assert.deepEqual(GA.optionsFor(g, GA.mk(0)), []); assert.equal(GA.galaResolve(g).roundup, null);
  assert.equal(GA.pick(g, GA.mk(0), "toast:gracious").ok, false);
});
t("nobody can act in the wrong step", () => {
  const { g, us } = world({ nf: 1 }); begin(g, [0, 1], us);
  assert.equal(GA.pick(g, GA.mk(0), "toast:gracious").ok, false, "not live yet"); GA.galaSeat(g);
  assert.equal(GA.seatRequest(g, GA.mk(0), GA.mk(1)).ok, false, "seating is set"); assert.equal(GA.respond(g, GA.mk(0), 1, "yes").ok, false);
  GA.galaResolve(g); assert.equal(GA.pick(g, GA.mk(0), "toast:gracious").ok, false, "over");
});
console.log(`\n${n} gala tests passed`);
