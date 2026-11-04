// Tests for WAG mode (stage 1): a WAG is not a footballer; attendance, dates, competition, requests, gifts, privacy, gala, save. Run with: node tests/wag_unit.js
import assert from "node:assert/strict";
import { D, createGame, runDraft, runMarket } from "./lib.js";
import { serializeGame, restoreGame, beginMatch } from "../engine/game.js";
import * as SO from "../engine/social.js";
import * as GA from "../engine/gala.js";
import * as L from "../engine/life.js";
import * as W from "../engine/wag.js";
import { scandals } from "../engine/clubrel.js";
import { rollNumbers, createUserPlayer, defaultAssign } from "../engine/playermode.js";
import { withParams } from "../engine/params.js";

let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };
const P0 = withParams({});
const FX = [[0, 1], [2, 3], [4, 5], [6, 7], [8, 9]];
function world({ nf = 0, nw = 1, seed = 11 } = {}) {
  const g = createGame({ D, N: 10, seed }); runDraft(g); runMarket(g);
  g.socialOn = true; g.galaOn = true; g.ownerName = () => null; g.weekDay = 2; g.season = g.season || 1;
  L.ensureRom(g); SO.ensureSoc(g);
  const us = [];
  for (let i = 0; i < nf; i++) { const r = rollNumbers(P0, "room", "tok" + i, 0), p = createUserPlayer(g, { token: "tok" + i, name: "Fb" + i, pos: "CM", nums: r.nums, ovr: r.ovr, assign: defaultAssign("CM"), gender: i % 2 ? "F" : "M" }); p.coins = 900; p.team = i; L.ensureLife(g, p); L.ensureOptions(g, p, 2); us.push(p); }
  const ws = []; for (let i = 0; i < nw; i++) ws.push(W.createWag(g, { name: "Wag" + i, gender: "F" }));
  return { g, us, ws };
}
const NPC = (g, team) => Object.values(g.players).filter((p) => !p.user && !p.retired && p.team === team && W.fbOk(g, p.id)).sort((a, b) => b.ovr - a.ovr)[0];
const kick = (g, day = 2) => W.kickoff(g, { day, fixtures: FX });
const after = (g, day = 2, res = [{ a: 0, b: 1, ga: 2, gb: 1 }]) => W.afterMatch(g, { day, results: res });

t("a WAG is not a footballer: no player record, no team, no wages, no football fields", () => {
  const { g, ws } = world(); const before = Object.keys(g.players).length;
  const w = W.createWag(g, { name: "Zed", gender: "M" });
  assert.equal(Object.keys(g.players).length, before, "no player record added");
  assert.ok(!g.teams.some((t) => t.players.includes(w.id)));
  for (const k of ["team", "contract", "wage", "ovr", "pos", "stam", "items", "career"]) assert.ok(!(k in w), "no " + k);
  assert.ok(w.id.startsWith("w") && w.coins > 0 && w.fol > 0);
  assert.equal(W.isWag(w.id), true); assert.equal(W.isWag("u:1"), false); assert.equal(W.personOf(g, w.id).wag, true);
});
t("setAct: choose a match, a team, a target; money is not taken until kick-off", () => {
  const { g, ws } = world(); const w = ws[0], c0 = w.coins, tg = NPC(g, 0);
  assert.equal(W.setAct(g, w, { act: "attend", fixture: 0, team: 5 }, { day: 2, fixtures: FX }).ok, false, "team must be in the fixture");
  assert.equal(W.setAct(g, w, { act: "attend", fixture: 9, team: 0 }, { day: 2, fixtures: FX }).ok, false, "fixture must exist");
  assert.equal(W.setAct(g, w, { act: "attend", fixture: 0, team: 1, target: W.fbId(tg.id) }, { day: 2, fixtures: FX }).ok, false, "target must play for the supported team");
  assert.ok(W.setAct(g, w, { act: "attend", fixture: 0, team: 0, target: W.fbId(tg.id) }, { day: 2, fixtures: FX }).ok);
  assert.equal(w.coins, c0, "nothing paid yet");
  assert.equal(W.setAct(g, w, { act: "nonsense" }, { day: 2, fixtures: FX }).ok, false);
  const poor = W.createWag(g, { name: "P" }); poor.coins = 5; assert.equal(W.setAct(g, poor, { act: "attend", fixture: 0, team: 0 }, { day: 2, fixtures: FX }).ok, false, "cannot afford a ticket");
});
t("kick-off settles the ticket once (a second kick-off call for the same day does nothing)", () => {
  const { g, ws } = world(); const w = ws[0], c0 = w.coins;
  W.setAct(g, w, { act: "attend", fixture: 0, team: 0 }, { day: 2, fixtures: FX });
  const a = kick(g); assert.equal(w.coins, c0 - g.P.social.wag.cost.attend); assert.ok(w.attending && !w.attending.done);
  const b = kick(g); assert.ok(b.again); assert.equal(w.coins, c0 - g.P.social.wag.cost.attend, "never charged twice");
  assert.equal(w.cnt.attend, 1);
});
t("attendance resolves once, after the result: a contact for the NEXT matchday, never the same day", () => {
  const { g, ws } = world(); const w = ws[0]; g.P.social.wag.attend.meet = 1;
  const tg = NPC(g, 0); W.setAct(g, w, { act: "attend", fixture: 0, team: 0, target: W.fbId(tg.id) }, { day: 2, fixtures: FX }); kick(g);
  assert.equal(w.contacts.length, 0, "no encounter before the match is over");
  const r = after(g); assert.equal(w.contacts.length, 1); assert.equal(w.contacts[0].id, W.fbId(tg.id));
  assert.equal(W.activeContacts(w, 2).length, 0, "no free same-week date"); assert.equal(W.activeContacts(w, 3).length, 1);
  assert.ok(r.notes.some((x) => x.wag === w.id));
  const again = after(g); assert.equal(again.notes.length, 0, "a second call changes nothing"); assert.equal(w.contacts.length, 1);
  // a WAG cannot invite the contact on the same matchday...
  assert.equal(W.reachable(g, w, W.fbId(tg.id), 2) && W.activeContacts(w, 2).length > 0, false);
});
t("attendance never reads or changes football results: the same match plays out identically", () => {
  const A = world(), B = world(); A.g.P.social.wag.attend.meet = 1;
  const rec = (g) => { const m = beginMatch(g, 0, 1, "0-0-1", {}); return JSON.stringify([m.ht.score, m.ht.events.length]); };
  const base = rec(B.g);
  W.setAct(A.g, A.ws[0], { act: "attend", fixture: 0, team: 0 }, { day: 2, fixtures: FX }); kick(A.g); after(A.g);
  assert.equal(rec(A.g), base, "football RNG untouched by WAG activity");
});
t("a miss gives followers only; a hit needs the meeting roll (seeded, repeatable)", () => {
  const run = () => { const { g, ws } = world({ seed: 31 }); g.P.social.wag.attend.meet = 0.5; W.setAct(g, ws[0], { act: "attend", fixture: 0, team: 0 }, { day: 2, fixtures: FX }); kick(g); after(g); return ws[0].contacts.map((c) => c.id).join(); };
  assert.equal(run(), run(), "same seed, same encounter");
  const { g, ws } = world(); g.P.social.wag.attend.meet = 0; g.P.social.wag.attend.fameCap = 0; g.P.social.wag.attend.win = 0; g.P.social.wag.attend.target = 0;
  W.setAct(g, ws[0], { act: "attend", fixture: 0, team: 0 }, { day: 2, fixtures: FX }); kick(g); const f0 = ws[0].fol; after(g); assert.equal(ws[0].contacts.length, 0); assert.ok(ws[0].fol > f0);
});
t("content pays a capped amount a few times a season", () => {
  const { g, ws } = world(); const w = ws[0], K = g.P.social.wag.content;
  for (let d = 0; d < K.perSeason; d++) { W.setAct(g, w, { act: "content" }, { day: d, fixtures: FX }); const c = w.coins; kick(g, d); assert.ok(w.coins > c && w.coins - c <= K.maxPay); }
  assert.equal(W.setAct(g, w, { act: "content" }, { day: 9, fixtures: FX }).ok, false, "season cap reached");
});
t("two WAGs competing for one roster footballer: one invitation wins, the other is told and not charged", () => {
  const { g, ws } = world({ nw: 2 }); const [a, b] = ws, tg = NPC(g, 0), id = W.fbId(tg.id);
  for (const w of ws) w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 9, via: "match" });
  for (const w of ws) assert.ok(W.setAct(g, w, { act: "date", partner: id }, { day: 2, fixtures: FX }).ok);
  const ca = a.coins, cb = b.coins; g.P.social.wag.date.accept = -1;
  const res = kick(g);
  const spent = [ca - a.coins, cb - b.coins].sort((x, y) => x - y);
  assert.deepEqual(spent, [0, g.P.social.wag.cost.date], "exactly one pays");
  const loser = a.coins === ca ? a : b; assert.ok(res.notes.some((x) => x.wag === loser.id && /not charged/.test(x.text)));
  assert.equal(W.seeingOf(g, id).length, 1, "the footballer is seeing exactly one WAG");
  assert.ok(SO.memOf(g, loser.id).rej.length >= 1 && SO.memOf(g, loser.id).rival.length >= 1, "a rejection and a rival are remembered");
});
t("a roster footballer already seeing a WAG cannot be booked by another", () => {
  const { g, ws } = world({ nw: 2 }); const [a, b] = ws, tg = NPC(g, 0), id = W.fbId(tg.id);
  for (const w of ws) w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 99, via: "match" });
  g.P.social.wag.date.accept = -1; W.setAct(g, a, { act: "date", partner: id }, { day: 2, fixtures: FX }); kick(g, 2);
  assert.equal(W.takenBy(g, id), a.id);
  const r = W.setAct(g, b, { act: "date", partner: id }, { day: 3, fixtures: FX }); assert.equal(r.ok, false); assert.match(r.why, /seeing someone/);
});
t("a human footballer must say yes: request, accept, booked, kick-off runs the date once and charges the payer once", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0], p = us[0], me = "u:" + p.id, c0 = w.coins;
  assert.equal(W.setAct(g, w, { act: "date", partner: me }, { day: 2, fixtures: FX }).ok, false, "cannot book without a yes");
  const s = W.sendRequest(g, w.id, me, "date", { day: 2 }); assert.ok(s.ok); assert.equal(W.sendRequest(g, w.id, me, "date", { day: 2 }).ok, false, "no duplicate");
  assert.equal(W.requestsFor(g, me).incoming.length, 1);
  const r = W.replyRequest(g, me, s.req.id, true, { day: 2 }); assert.ok(r.ok && r.yes);
  assert.equal(p.life.act.wag, w.id); assert.equal(w.act.partner, me);
  assert.equal(W.replyRequest(g, me, s.req.id, true).ok, false, "answering twice does nothing");
  kick(g); assert.equal(c0 - w.coins, g.P.social.wag.cost.date, "charged once");
  assert.equal(W.pairOf(g, w.id, me).dates, 1, "one date");
  kick(g); assert.equal(W.pairOf(g, w.id, me).dates, 1, "still one date");
});
t("the one who is asked pays nothing: a WAG's invitation is paid by the WAG; a footballer's invitation by the footballer", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0], p = us[0], me = "u:" + p.id, cost = g.P.social.wag.cost.date;
  const c0 = w.coins, p0 = p.coins; const s = W.sendRequest(g, w.id, me, "date", { day: 2 }); W.replyRequest(g, me, s.req.id, true); kick(g);
  assert.equal(c0 - w.coins, cost); assert.equal(p.coins, p0);
  const w2 = W.createWag(g, { name: "W2" }); const c1 = w2.coins, p1 = p.coins;
  const s2 = W.sendRequest(g, me, w2.id, "date", { day: 3 }); assert.ok(s2.ok); W.replyRequest(g, w2.id, s2.req.id, true); kick(g, 3);
  assert.equal(p1 - p.coins, cost); assert.equal(w2.coins, c1);
});
t("competing invitations to the same human footballer: the first yes counts, others are told and keep their money", () => {
  const { g, us, ws } = world({ nf: 1, nw: 2 }); const [a, b] = ws, p = us[0], me = "u:" + p.id;
  const ra = W.sendRequest(g, a.id, me, "date", { day: 2 }), rb = W.sendRequest(g, b.id, me, "date", { day: 2 });
  const y = W.replyRequest(g, me, ra.req.id, true); assert.ok(y.ok);
  assert.ok(y.notes.some((x) => x.wag === b.id && /another invitation/.test(x.text)));
  assert.equal(W.replyRequest(g, me, rb.req.id, true).ok, false, "second yes is refused: no double booking");
  const cb = b.coins; kick(g); assert.equal(b.coins, cb, "the loser is never charged");
});
t("a footballer who changes plans frees the WAG; nobody is charged", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0], p = us[0], me = "u:" + p.id;
  const s = W.sendRequest(g, w.id, me, "date", { day: 2 }); W.replyRequest(g, me, s.req.id, true);
  p.life.act = { act: "train", partner: null }; const notes = W.footballerChangedWeek(g, p.id);
  assert.equal(w.act, null); assert.ok(notes.some((x) => x.wag === w.id)); const c = w.coins; kick(g); assert.equal(w.coins, c);
});
t("a WAG who changes plans frees the footballer", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0], p = us[0], me = "u:" + p.id;
  const s = W.sendRequest(g, w.id, me, "date", { day: 2 }); W.replyRequest(g, me, s.req.id, true); assert.ok(p.life.act.wag);
  W.setAct(g, w, { act: "quiet" }, { day: 2, fixtures: FX }); assert.equal(p.life.act, null);
});
t("requests lapse at kick-off", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0], me = "u:" + us[0].id; const s = W.sendRequest(g, w.id, me, "date", { day: 2 });
  kick(g); assert.equal(W.requestsFor(g, me).incoming.length, 0); assert.equal(W.replyRequest(g, me, s.req.id, true).ok, false);
});
t("gifts: private by default to a roster footballer, capped, and a human decides", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0], tg = NPC(g, 0), id = W.fbId(tg.id); w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 9 });
  const news0 = (g.news || []).length, c0 = w.coins;
  const r = W.sendGift(g, w, id, "flowers", false); assert.ok(r.ok); assert.equal(c0 - w.coins, g.P.social.gift.tiers.flowers.price); assert.equal((g.news || []).length, news0, "private gift: no story");
  assert.ok(W.sendGift(g, w, id, "flowers", false).ok); assert.equal(W.sendGift(g, w, id, "flowers", false).ok, false, "per-day cap");
  w.gifts.n = 0; const me = "u:" + us[0].id, s = W.sendGift(g, w, me, "flowers", false); assert.ok(s.ok && s.req, "a human footballer gets a request"); const c1 = w.coins;
  assert.equal(c1, w.coins, "not paid until accepted"); const a = W.replyRequest(g, me, s.req.id, true); assert.ok(a.ok); assert.equal(c1 - w.coins, g.P.social.gift.tiers.flowers.price);
  const s2 = W.sendGift(g, w, me, "watch", false); assert.ok(s2.ok); const c2 = w.coins; W.replyRequest(g, me, s2.req.id, false); assert.equal(w.coins, c2, "returned gift costs nothing");
  assert.equal(W.sendGift(g, w, "f:999999", "flowers", false).ok, false);
});
t("WAG gossip is a rumour, never a footballer's confirmed club scandal", () => {
  const { g, ws } = world(); const w = ws[0], tg = NPC(g, 0), id = W.fbId(tg.id); g.P.social.wag.story.firstDate = 1; g.P.social.wag.date.accept = -1;
  w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 9 }); W.setAct(g, w, { act: "date", partner: id }, { day: 2, fixtures: FX });
  const res = kick(g); assert.ok(res.stories.length >= 1 && res.stories[0].tag === "rumour"); for (const s of res.stories) SO.deskStory(g, s);
  assert.equal(scandals(g, tg), 0, "no scandal counted"); assert.ok(!(g.news || []).some((x) => x.kind === "scandal"));
});
t("a roster footballer's social identity survives a transfer and ends on retirement", () => {
  const { g, ws } = world(); const w = ws[0], tg = NPC(g, 0), id = W.fbId(tg.id); g.P.social.wag.date.accept = -1;
  w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 99 }); W.setAct(g, w, { act: "date", partner: id }, { day: 2, fixtures: FX }); kick(g, 2);
  assert.equal(W.pairOf(g, w.id, id).status, "seeing");
  const t0 = g.teams[0]; t0.players = t0.players.filter((x) => x !== tg.id); tg.team = 3; g.teams[3].players.push(tg.id);
  kick(g, 3); assert.equal(W.pairOf(g, w.id, id).status, "seeing", "still the same couple at the new club"); assert.equal(W.personOf(g, id).team, 3);
  tg.retired = true; kick(g, 4); assert.equal(W.pairOf(g, w.id, id).status, "ended", "ends on retirement"); assert.equal(W.takenBy(g, id), null);
  assert.ok(SO.memOf(g, w.id).ex.length >= 1);
});
t("a neglected bond fades and a relationship can end", () => {
  const { g, ws } = world(); const w = ws[0], tg = NPC(g, 0), id = W.fbId(tg.id); g.P.social.wag.date.accept = -1;
  w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 99 }); W.setAct(g, w, { act: "date", partner: id }, { day: 2, fixtures: FX }); kick(g, 2);
  let day = 3; while (W.pairOf(g, w.id, id).status === "seeing" && day < 40) kick(g, day++); assert.equal(W.pairOf(g, w.id, id).status, "ended");
});
t("idle / uncreated / disconnected fallbacks: no choice means a quiet week, nothing paid, kick-off still completes", () => {
  const { g, ws } = world({ nw: 3 }); const c = ws.map((w) => w.coins); const r = kick(g);
  ws.forEach((w, i) => { assert.equal(w.coins, c[i]); assert.equal(w.last.act, "quiet"); assert.equal(w.act, null); });
  assert.deepEqual(kick(g, 3).notes.filter((x) => x.pid != null), []);
});
t("scene: a few roster footballers are always on offer so the market is never empty", () => {
  const { g, ws } = world(); const sc = W.scene(g, ws[0], 2); assert.equal(sc.length, g.P.social.wag.attend.scene); assert.deepEqual(sc, W.scene(g, ws[0], 2), "stable for the day");
  assert.ok(W.setAct(g, ws[0], { act: "date", partner: sc[0] }, { day: 2, fixtures: FX }).ok);
  assert.equal(W.setAct(g, ws[0], { act: "date", partner: "f:999999" }, { day: 2, fixtures: FX }).ok, false);
});
t("privacy: a view holds only your own record; requests are visible only to the two people", () => {
  const { g, us, ws } = world({ nf: 2, nw: 2 }); const [a, b] = ws, me = "u:" + us[0].id;
  const s = W.sendRequest(g, a.id, me, "date", { day: 2 }); W.sendGift(g, b, me, "flowers", false);
  const va = W.viewFor(g, a, { day: 2, fixtures: FX, open: true }), vb = W.viewFor(g, b, { day: 2, fixtures: FX, open: true });
  assert.equal(va.outgoing.length, 1); assert.equal(vb.outgoing.length, 1); assert.equal(va.id, a.id);
  assert.ok(!JSON.stringify(va).includes(b.name) && !JSON.stringify(vb).includes(a.name), "no other WAG appears in my view");
  assert.ok(!("contacts" in W.wagPeople(g)[0]) && !("act" in W.wagPeople(g)[0]), "the public WAG list holds no private fields");
  assert.equal(W.requestsFor(g, "u:" + us[1].id).incoming.length, 0, "an unrelated footballer sees nothing");
  assert.equal(W.requestsFor(g, a.id).incoming.length, 0);
  assert.equal(va.coins, Math.round(a.coins)); assert.ok(!("coins" in W.wagPeople(g)[0]));
  void s;
});
t("save round trip keeps WAGs, pairs and requests; an old save without WAGs loads and works", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0]; const s = W.sendRequest(g, w.id, "u:" + us[0].id, "date", { day: 2 }); void s;
  const tg = NPC(g, 0), id = W.fbId(tg.id); g.P.social.wag.date.accept = -1; w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 99 }); W.setAct(g, w, { act: "date", partner: id }, { day: 2, fixtures: FX }); kick(g);
  const snap = JSON.parse(JSON.stringify(serializeGame(g))); const g2 = restoreGame(D, snap);
  assert.deepEqual(g2.wag.list[w.id].coins, w.coins); assert.ok(W.pairOf(g2, w.id, id)); assert.equal(g2.wag.kick, g.wag.kick);
  delete snap.wag; const old = restoreGame(D, snap); assert.equal(old.wag, undefined); assert.deepEqual(W.wagList(old), []);
  assert.equal(W.kickoff(old, { day: 2, fixtures: FX }).notes.length, 0, "no WAGs: nothing happens"); assert.ok(W.ensureWag(old));
});
t("gala: a WAG sits, toasts and dances with a human footballer; no guest is made for them", () => {
  const { g, us, ws } = world({ nf: 1 }); const w = ws[0], p = us[0];
  GA.galaBegin(g, { managers: [], players: [p.id], wags: [w.id] }, 2); GA.galaSeat(g);
  const G = GA.galaOf(g); assert.equal(G.att[w.id].kind, "wag"); assert.equal(G.order.filter((k) => G.att[k].kind === "guest").length, 0);
  assert.equal(G.order.filter((k) => k === w.id).length, 1, "listed once");
  const o = GA.optionsFor(g, w.id); assert.ok(o.some((x) => x.id === "toast:gracious") && o.some((x) => x.id === "toast:joke"));
  const dance = o.find((x) => x.kind === "romance"); assert.ok(dance, "can ask the footballer at the table to dance");
  const pk = GA.pick(g, w.id, dance.id); assert.ok(pk.ok); assert.ok(pk.notes.some((x) => x.pid === p.id));
  const pr = GA.promptsFor(g, GA.fk(p.id)); GA.respond(g, GA.fk(p.id), pr[0].id, "yes");
  const f0 = w.fol; const res = GA.galaResolve(g); assert.ok(res.roundup); assert.ok(w.fol > f0);
  assert.equal(GA.galaResolve(g).notes.length, 0, "resolves once");
});
t("gala: a WAG-only gala still resolves", () => {
  const { g, ws } = world(); GA.galaBegin(g, { managers: [], players: [], wags: [ws[0].id] }, 2); GA.galaSeat(g); GA.pick(g, ws[0].id, "toast:gracious"); const r = GA.galaResolve(g); assert.ok(r.roundup);
});
t("gifts are refused when Social events are switched off; dating still works", () => {
  const { g, ws } = world(); const w = ws[0], tg = NPC(g, 0), id = W.fbId(tg.id); w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 9 }); g.socialOn = false;
  const r = W.sendGift(g, w, id, "flowers", false); assert.equal(r.ok, false); assert.match(r.why, /switched off/);
  assert.ok(W.setAct(g, w, { act: "date", partner: id }, { day: 2, fixtures: FX }).ok, "a date does not need the social switch");
});
t("a WAG never appears in the roster, pool, lineups, stats, training or wages, however much they do", () => {
  const { g, us, ws } = world({ nf: 1, nw: 2 }); const players0 = Object.keys(g.players).length, pool0 = g.pool.length, ids = ws.map((w) => w.id);
  for (let d = 0; d < 6; d++) { for (const w of ws) { w.contacts.push({ id: W.fbId(NPC(g, 0).id), name: "x", team: 0, made: 0, from: 0, until: 99 }); W.setAct(g, w, { act: d % 2 ? "attend" : "content", fixture: 0, team: 0 }, { day: d, fixtures: FX }); } kick(g, d); after(g, d); }
  assert.equal(Object.keys(g.players).length, players0); assert.equal(g.pool.length, pool0);
  for (const t of g.teams) for (const id of ids) assert.ok(!t.players.includes(id) && !(t.lineup && JSON.stringify(t.lineup).includes('"' + id + '"')));
  for (const id of ids) { assert.ok(!(id in (g.stats || {}))); assert.ok(!(id in g.players)); }
});
t("a released footballer is still the same person to the people seeing them", () => {
  const { g, ws } = world(); const w = ws[0], tg = NPC(g, 0), id = W.fbId(tg.id); g.P.social.wag.date.accept = -1;
  w.contacts.push({ id, name: tg.name, team: 0, made: 0, from: 0, until: 99 }); W.setAct(g, w, { act: "date", partner: id }, { day: 2, fixtures: FX }); kick(g, 2);
  g.teams[0].players = g.teams[0].players.filter((x) => x !== tg.id); tg.team = null; kick(g, 3);
  assert.equal(W.pairOf(g, w.id, id).status, "seeing"); assert.equal(W.personOf(g, id).team, null); assert.equal(W.takenBy(g, id), w.id);
});
console.log(`\n${n} WAG tests passed`);
