// The mid-season gala: one dinner a season for every user. A short preparation window (footballers invite a date, anyone may ask to sit
// with someone), a seating plan built from requests and from the league's real history, one main interaction each, and a roundup.
// People are keys: "m<team>" a manager, "f<pid>" a footballer, "g<pid>" the guest a footballer brought. Rules only; the room runs the clock.
import { makeRng, shuffle } from "./rng.js";
import { ensureSoc, mgrOf, bump, styleOf, bossName, teamName, trustOf, addTrust, mrel, setMrel, stepRel, openThread, addHist, closeThread, deskStory, variant, memOf, remember, nid } from "./social.js";
import { ensureLife, ensureRom, npcState, isHuman, partnerById, applyFx } from "./life.js";
import { dinnerScore } from "./market2.js";

const up = (s) => String(s).toUpperCase();
const fail = (why) => ({ ok: false, why });
export const mk = (t) => "m" + t, fk = (pid) => "f" + pid, gk = (pid) => "g" + pid;
// The matchday after which the gala is held: the middle of the schedule (after the first half has been played).
export const galaDay = (total) => (total >= 6 ? Math.floor(total / 2) - 1 : -1);
export const galaOn = (game) => game.galaOn !== false;
export const galaOf = (game) => ensureSoc(game).gala || null;

// ---------- opening it ----------
// people = { managers: [teamId], players: [pid] }. Marks the season done straight away, so it can never start twice.
export function galaBegin(game, people, day) {
  const S = ensureSoc(game); if (S.galaDone[game.season]) return null;
  S.galaDone[game.season] = true;
  const G = S.gala = { season: game.season, day, status: "prep", att: {}, order: [], invites: [], dates: {}, seatReq: {}, tables: [], tags: [], picks: {}, prompts: [], ready: [], roundup: null, notes: [] };
  for (const t of people.managers) { G.att[mk(t)] = { key: mk(t), kind: "manager", team: t, name: bossName(game, t) }; G.order.push(mk(t)); }
  for (const pid of people.players) { const p = game.players[pid]; if (!p) continue; G.att[fk(pid)] = { key: fk(pid), kind: "player", pid, team: p.team, name: p.name }; G.order.push(fk(pid)); }
  return G;
}
const att = (G, key) => (G ? G.att[key] : null);
export const attendeesOf = (G) => G.order.map((k) => G.att[k]).filter(Boolean);

// ---------- invitations to a date ----------
// A footballer may invite one eligible person: a listed person (decided at the end of the preparation by the same scoring as a dinner, so rivals
// compete) or another footballer (who must say yes). Two open invitations at most; only one date can be accepted.
export function invite(game, p, toId) {
  const G = galaOf(game); if (!G || G.status !== "prep") return fail("Invitations are closed.");
  if (!att(G, fk(p.id))) return fail("You are not on the guest list.");
  const K = game.P.social.invite, L = ensureLife(game, p), mine = G.invites.filter((i) => i.from === p.id && i.status === "open");
  if (mine.length >= K.maxOpen) return fail(`You can have ${K.maxOpen} invitations out at once.`);
  if (mine.some((i) => i.to === toId)) return fail("Already invited.");
  if (L.married && !(L.partner && L.partner.id === toId)) return fail("Married footballers bring their spouse.");
  if (L.partner && L.partner.excl && L.partner.id !== toId) return fail("You are exclusive with someone else.");
  if (isHuman(toId)) {
    const q = game.players[+toId.slice(2)]; if (!q || q.id === p.id || !att(G, fk(q.id))) return fail("They are not coming.");
    const QL = ensureLife(game, q); if (QL.married || (QL.partner && QL.partner.excl && QL.partner.id !== "u:" + p.id)) return fail(`${q.name} is in a relationship.`);
  } else {
    const info = partnerById(toId); if (!info) return fail("Unknown person.");
    if (!(L.opts && L.opts.ids.includes(toId)) && !(L.partner && L.partner.id === toId)) return fail("They are not on your list this week.");
    const n = npcState(game, toId), R = ensureRom(game); if (n.married != null && n.married !== p.id) return fail("Married."); if (n.excl != null && n.excl !== p.id) return fail("Taken."); if (n.cool > R.week) return fail("Heartbroken.");
  }
  const inv = { id: nid(game), from: p.id, to: toId, status: "open" }; G.invites.push(inv);
  const out = { ok: true, inv, notes: [] };
  if (isHuman(toId)) out.notes.push({ pid: +toId.slice(2), text: `${p.name} invites you to the gala as their date. Accept or decline (Gala).` });
  return out;
}
// A footballer answers an invitation. The last yes counts: an earlier acceptance is released, and its inviter is told.
export function answerInvite(game, q, id, yes) {
  const G = galaOf(game); if (!G || G.status !== "prep") return fail("Invitations are closed.");
  const inv = G.invites.find((i) => i.id === id && i.to === "u:" + q.id && i.status === "open"); if (!inv) return fail("Gone");
  const from = game.players[inv.from], notes = [];
  if (!yes) { inv.status = "declined"; remember(game, inv.from, "rej", { id: "u:" + q.id, name: q.name, what: "gala" }); return { ok: true, yes: false, notes: [{ pid: inv.from, text: `${q.name} declined your gala invitation.` }] }; }
  for (const o of G.invites) {
    if (o === inv || o.to !== "u:" + q.id) continue;
    if (o.status === "accepted") { o.status = "released"; notes.push({ pid: o.from, text: `${q.name} accepted another gala invitation instead of yours.` }); remember(game, o.from, "rej", { id: "u:" + q.id, name: q.name, what: "gala", by: from.name }); remember(game, o.from, "rival", { id: "u:" + q.id, name: from.name, over: q.name, pid: from.id }); }
    else if (o.status === "open") { o.status = "closed"; notes.push({ pid: o.from, text: `${q.name} accepted another gala invitation instead of yours.` }); remember(game, o.from, "rej", { id: "u:" + q.id, name: q.name, what: "gala", by: from.name }); }
  }
  inv.status = "accepted"; notes.push({ pid: inv.from, text: `${q.name} said yes: you are going to the gala together.` });
  return { ok: true, yes: true, notes };
}
export const withdrawInvite = (game, p, id) => { const G = galaOf(game), inv = G && G.invites.find((i) => i.id === id && i.from === p.id && i.status === "open"); if (!inv) return fail("Gone"); inv.status = "withdrawn"; return { ok: true }; };

// ---------- seating requests ----------
export function seatRequest(game, key, target) {
  const G = galaOf(game); if (!G || G.status !== "prep") return fail("Seating is set.");
  if (!att(G, key)) return fail("You are not on the guest list.");
  if (target == null || target === "") { delete G.seatReq[key]; return { ok: true }; }
  if (target === key || !att(G, target)) return fail("Pick another guest.");
  G.seatReq[key] = target; return { ok: true };
}

// ---------- closing the preparation: dates settle, seats are drawn ----------
export function galaSeat(game) {
  const G = galaOf(game), K = game.P.social.gala, notes = [], R = ensureRom(game); if (!G) return notes;
  // listed people: each accepts at most one of the footballers who asked; the best-scored invitation wins (same weighing as a dinner)
  const byNpc = new Map();
  for (const i of G.invites) if (i.status === "open" && !isHuman(i.to)) { if (!byNpc.has(i.to)) byNpc.set(i.to, []); byNpc.get(i.to).push(i); }
  for (const [id, list] of byNpc) {
    const info = partnerById(id), name = info.name, sc = list.map((i) => ({ i, p: game.players[i.from], s: dinnerScore(game, game.players[i.from], id, "gala" + game.season) })).sort((a, b) => b.s - a.s || a.i.from - b.i.from), win = sc[0].s >= game.P.social.gift.accept ? sc[0] : null;
    for (const x of sc) {
      if (win && x === win) { x.i.status = "accepted"; notes.push({ pid: x.p.id, text: `${name} accepted your gala invitation.` }); continue; }
      x.i.status = "declined"; notes.push({ pid: x.p.id, text: win ? `${name} is going with ${win.p.name} instead.` : `${name} politely declined your gala invitation.` });
      remember(game, x.p.id, "rej", { id, name, what: "gala", by: win ? win.p.name : null }); if (win) remember(game, x.p.id, "rival", { id, name: win.p.name, over: name, pid: win.p.id });
    }
    if (win && sc.length > 1) remember(game, win.p.id, "rival", { id, name: sc[1].p.name, over: name, pid: sc[1].p.id });
  }
  for (const i of G.invites) if (i.status === "open") { i.status = "lapsed"; if (isHuman(i.to)) notes.push({ pid: i.from, text: `${(game.players[+i.to.slice(2)] || {}).name || "They"} did not answer your gala invitation.` }); }
  // dates: one per footballer (the first accepted invitation counts)
  for (const i of G.invites.slice().sort((a, b) => a.id - b.id)) {
    if (i.status !== "accepted" || G.dates[i.from]) continue;
    if (isHuman(i.to)) { const q = +i.to.slice(2); if (G.dates[q]) { i.status = "released"; notes.push({ pid: i.from, text: "Your date turned out to be going with someone else." }); continue; } G.dates[i.from] = { human: q }; G.dates[q] = { human: i.from }; }
    else { const info = partnerById(i.to); G.dates[i.from] = { npc: i.to }; G.att[gk(i.from)] = { key: gk(i.from), kind: "guest", host: i.from, npc: i.to, name: info.name }; G.order.push(gk(i.from)); }
  }
  seat(game, G, K);
  G.status = "live"; G.notes = notes; return notes;
}
// People who should sit together because of real history, with the reason (the seating plan and the roundup both use it).
export function history(game, G) {
  const out = [], seen = new Set();
  const add = (a, b, why, w) => { const k = [a, b].sort().join("|"); if (a === b || seen.has(k + why)) return; seen.add(k + why); out.push({ a, b, why, w }); };
  const us = attendeesOf(G).filter((x) => x.kind !== "guest");
  for (const x of us) for (const y of us) {
    if (x.key >= y.key) continue;
    if (x.kind === "manager" && y.kind === "manager" && mrel(game, x.team, y.team) < 0) add(x.key, y.key, "rows", 3);
    for (const [m, f] of [[x, y], [y, x]]) if (m.kind === "manager" && f.kind === "player" && f.team === m.team && trustOf(game, m.team, f.pid) <= -1) add(m.key, f.key, "fell out with their manager", 3);
    if (x.kind === "player" && y.kind === "player") {
      const mx = memOf(game, x.pid), my = memOf(game, y.pid), idX = "u:" + x.pid, idY = "u:" + y.pid;
      if (mx.ex.some((e) => e.id === idY)) add(x.key, y.key, "are exes", 4);
      if (mx.rival.some((e) => e.pid === y.pid) || my.rival.some((e) => e.pid === x.pid)) add(x.key, y.key, "are rival suitors", 3);
      if (mx.rej.some((e) => e.id === idY && e.what !== "gift") || my.rej.some((e) => e.id === idX)) add(x.key, y.key, "turned each other down", 2);
    }
  }
  for (const g of attendeesOf(G).filter((z) => z.kind === "guest")) for (const y of us) if (y.kind === "player" && y.pid !== g.host && memOf(game, y.pid).ex.some((e) => e.id === g.npc)) add(g.key, y.key, "arrived with their ex", 5);
  return out.sort((a, b) => b.w - a.w || (a.a + a.b < b.a + b.b ? -1 : 1));
}
function seat(game, G, K) {
  const r = makeRng(game.seed, "gala", game.season), keys = G.order.slice();
  // units: a footballer and their date sit together
  const unitOf = new Map(), units = [];
  for (const k of keys) {
    if (unitOf.has(k)) continue;
    const a = G.att[k], mate = a.kind === "guest" ? fk(a.host) : a.kind === "player" && G.dates[a.pid] ? (G.dates[a.pid].human != null ? fk(G.dates[a.pid].human) : G.att[gk(a.pid)] ? gk(a.pid) : null) : null;
    const u = [k]; if (mate && !unitOf.has(mate) && G.att[mate]) u.push(mate);
    for (const x of u) unitOf.set(x, u); units.push(u);
  }
  const nT = Math.max(1, Math.ceil(keys.length / K.tableSize)), cap = Math.max(2, Math.ceil(keys.length / nT)), tables = Array.from({ length: nT }, (_, i) => ({ id: i, seats: [] })), at = new Map();
  const place = (u, t) => { if (u.some((x) => at.has(x))) return true; if (tables[t].seats.length + u.length > cap) return false; for (const x of u) { tables[t].seats.push(x); at.set(x, t); } return true; };
  const tagOf = (a, b, why) => G.tags.push({ a, b, why });
  const tryTogether = (a, b) => {
    const ua = unitOf.get(a), ub = unitOf.get(b); if (!ua || !ub) return false;
    if (at.has(a) && at.has(b)) return at.get(a) === at.get(b);
    if (at.has(a)) return place(ub, at.get(a)); if (at.has(b)) return place(ua, at.get(b));
    const t = tables.findIndex((x) => x.seats.length + ua.length + (ua === ub ? 0 : ub.length) <= cap && x.seats.length === Math.min(...tables.filter((y) => y.seats.length + ua.length + ub.length <= cap).map((y) => y.seats.length)));
    if (t < 0) return false; return place(ua, t) && (ua === ub || place(ub, t));
  };
  // 1) seat requests (mutual first), at most K.seatPerTarget honoured for any one person
  const reqs = Object.entries(G.seatReq).filter(([a, b]) => G.att[a] && G.att[b]), honoured = {};
  reqs.sort(([a1, b1], [a2, b2]) => (G.seatReq[b2] === a2 ? 1 : 0) - (G.seatReq[b1] === a1 ? 1 : 0) || (a1 < a2 ? -1 : 1));
  for (const [a, b] of reqs) { if ((honoured[b] || 0) >= K.seatPerTarget) continue; if (tryTogether(a, b)) { honoured[b] = (honoured[b] || 0) + 1; tagOf(a, b, "asked to sit together"); } }
  // 2) real history: the organisers cannot resist (at most two pairs)
  let drama = 0; for (const h of history(game, G)) { if (drama >= 2) break; if (r() < K.dramaSeat && tryTogether(h.a, h.b)) { drama++; tagOf(h.a, h.b, h.why); } }
  // 3) everybody else, shuffled
  for (const u of shuffle(units, r)) { if (u.some((x) => at.has(x))) continue; let t = 0; for (let i = 1; i < nT; i++) if (tables[i].seats.length < tables[t].seats.length) t = i; if (!place(u, t)) { const f = tables.findIndex((x) => x.seats.length + u.length <= cap); place(u, f < 0 ? t : f); } }
  G.tables = tables.map((t) => ({ id: t.id, seats: t.seats }));
}
export const tableOf = (G, key) => G.tables.find((t) => t.seats.includes(key)) || null;

// ---------- the main interaction ----------
// The options a person has, from where they sit and what the league remembers. Each says what it needs and what it will cost or change.
export function optionsFor(game, key) {
  const G = galaOf(game), me = att(G, key); if (!G || !me || me.kind === "guest") return [];
  const tb = tableOf(G, key), K = game.P.social.gala, out = [], mates = tb ? tb.seats.filter((k) => k !== key && G.att[k] && G.att[k].kind !== "guest").map((k) => G.att[k]) : [];
  const nm = (x) => x.name;
  if (me.kind === "manager") {
    out.push({ id: "toast:gracious", label: "Raise a gracious toast", kind: "toast", preview: `A kind word for the room. It can soften a sour relationship with a manager at your table. Costs nothing.` });
    out.push({ id: "toast:boast", label: "Make a bold boast", kind: "toast", preview: `"We will finish in the top three." The newspaper writes it down and checks at the end of the season: it either looks great or it is thrown back at you.` });
  } else {
    out.push({ id: "toast:gracious", label: "Say a few kind words", kind: "toast", preview: `Safe and warm: +${K.toastFol / 2} followers.` });
    out.push({ id: "toast:joke", label: "Tell a joke in the speech", kind: "toast", preview: `A coin toss: it lands (+${K.toastFol} followers) or it does not (−${K.jokeHit}).` });
  }
  for (const o of mates) {
    if (me.kind === "manager" && o.kind === "manager") {
      const rel = mrel(game, me.team, o.team);
      if (rel < 0) { out.push({ id: "reconcile:" + o.key, with: o.key, kind: "reconcile", needs: true, label: `Reconcile with ${nm(o)}`, preview: `You are on bad terms. If ${nm(o)} agrees, things ease a step (more with a Diplomat). If not, nothing changes and it stays private.` }); out.push({ id: "confront:" + o.key, with: o.key, kind: "confront", needs: true, label: `Confront ${nm(o)}`, preview: `Say it to their face. If they stand firm it is a public scene and the rift deepens; if they back down you win the room. Either way it is remembered.` }); }
      out.push({ id: "dispute:" + o.key, with: o.key, kind: "dispute", needs: true, label: `Talk shop with ${nm(o)}`, preview: `A professional argument about tactics. If ${nm(o)} engages, you end up on better terms.` });
    }
    if (me.kind === "manager" && o.kind === "player" && o.team === me.team) {
      const tr = trustOf(game, me.team, o.pid);
      if (tr <= -1) out.push({ id: "reconcile:" + o.key, with: o.key, kind: "reconcile", needs: true, label: `Make peace with ${nm(o)}`, preview: `${nm(o)} is ${tr <= -2 ? "bitter" : "wary"} after recent decisions. If they agree, trust is back to neutral (+1).` });
      out.push({ id: "dispute:" + o.key, with: o.key, kind: "dispute", needs: true, label: `Discuss ${nm(o)}'s situation`, preview: `Minutes, role, the future. If ${nm(o)} engages, trust +1.` });
    }
    if (me.kind === "player" && o.kind === "manager" && o.team === me.team) {
      const tr = trustOf(game, o.team, me.pid);
      if (tr <= -1) out.push({ id: "reconcile:" + o.key, with: o.key, kind: "reconcile", needs: true, label: `Clear the air with ${nm(o)}`, preview: `You and your manager have fallen out. If they agree, trust is back to neutral.` });
      out.push({ id: "dispute:" + o.key, with: o.key, kind: "dispute", needs: true, label: `Raise something with ${nm(o)}`, preview: `Talk about your role at the club. If ${nm(o)} engages, trust +1.` });
    }
    if (me.kind === "player" && o.kind === "player") {
      const m = memOf(game, me.pid), ex = m.ex.some((e) => e.id === "u:" + o.pid), riv = m.rival.some((e) => e.pid === o.pid) || memOf(game, o.pid).rival.some((e) => e.pid === me.pid);
      if (ex || riv || m.rej.some((e) => e.id === "u:" + o.pid)) out.push({ id: "reconcile:" + o.key, with: o.key, kind: "reconcile", needs: true, label: `Make peace with ${nm(o)}`, preview: `${ex ? "Your ex" : "A rival"}. If ${nm(o)} agrees, the air clears. If not, it stays between you two.` });
      if (riv) out.push({ id: "confront:" + o.key, with: o.key, kind: "confront", needs: true, label: `Confront ${nm(o)}`, preview: `You both went after the same person. A public scene is worth followers to both of you, and the rivalry gets worse.` });
      const L = ensureLife(game, game.players[me.pid]), OL = ensureLife(game, game.players[o.pid]);
      if (!L.married && !OL.married && !(L.partner && L.partner.excl && L.partner.id !== "u:" + o.pid) && !(OL.partner && OL.partner.excl && OL.partner.id !== "u:" + me.pid)) out.push({ id: "romance:" + o.key, with: o.key, kind: "romance", needs: true, label: `Ask ${nm(o)} to dance`, preview: `Both of you must agree. A dance warms things up (love +${K.danceLove}); it can get noticed.` });
    }
  }
  if (me.kind === "player") {
    const d = G.dates[me.pid];
    if (d && d.npc) out.push({ id: "romance:" + gk(me.pid), with: gk(me.pid), kind: "romance", label: `Slow dance with ${partnerById(d.npc).name}`, preview: `Love +${K.danceLove}${ensureLife(game, game.players[me.pid]).partner && ensureLife(game, game.players[me.pid]).partner.id === d.npc ? `, bond +${K.danceBond}` : ""}.` });
  }
  return out;
}
// Choose the one main interaction. When the other person is a user they are asked; nothing happens until they answer or time runs out.
export function pick(game, key, optId) {
  const G = galaOf(game); if (!G || G.status !== "live") return fail("The gala is not on.");
  if (G.picks[key]) return fail("You have used your one interaction.");
  const o = optionsFor(game, key).find((x) => x.id === optId); if (!o) return fail("That is not available.");
  G.picks[key] = { opt: o.id, kind: o.kind, with: o.with || null };
  const notes = [];
  if (o.needs && o.with) {
    const t = att(G, o.with);
    if (t && t.kind !== "guest") { G.prompts.push({ id: nid(game), from: key, to: o.with, kind: o.kind, status: "open" }); const me = att(G, key); notes.push(t.kind === "manager" ? { team: t.team, text: `${me.name} would like to ${PROMPT[o.kind]} (Gala).` } : { pid: t.pid, text: `${me.name} would like to ${PROMPT[o.kind]} (Gala).` }); }
  }
  return { ok: true, notes, opt: o };
}
const PROMPT = { reconcile: "clear the air with you", confront: "have a word with you", dispute: "talk shop with you", romance: "dance with you" };
export function promptsFor(game, key) {
  const G = galaOf(game); if (!G) return [];
  return G.prompts.filter((p) => p.to === key && p.status === "open").map((p) => ({ id: p.id, from: att(G, p.from).name, kind: p.kind, text: PROMPT[p.kind], modes: p.kind === "confront" ? [["stand", "Stand your ground"], ["back", "Back down"]] : [["yes", "Yes"], ["no", "No thanks"]] }));
}
export function respond(game, key, id, mode) {
  const G = galaOf(game); if (!G || G.status !== "live") return fail("The gala is not on.");
  const p = G.prompts.find((x) => x.id === id && x.to === key && x.status === "open"); if (!p) return fail("Gone");
  const ok = p.kind === "confront" ? ["stand", "back"].includes(mode) : ["yes", "no"].includes(mode); if (!ok) return fail("Pick an answer.");
  p.status = "done"; p.mode = mode; return { ok: true };
}
// Everybody who has not yet used their interaction or answered a question (the room waits for these, until the clock runs out).
export const pendingKeys = (game) => { const G = galaOf(game); if (!G || G.status !== "live") return []; return G.order.filter((k) => G.att[k].kind !== "guest" && (!G.picks[k] || false)).concat(G.prompts.filter((p) => p.status === "open").map((p) => p.to)); };

// ---------- resolution ----------
// Applies every interaction once. Returns { notes, roundup }. Calling it again does nothing.
export function galaResolve(game) {
  const G = galaOf(game), K = game.P.social.gala; if (!G || G.status === "end" || G.status === "prep") return { notes: [], roundup: G ? G.roundup : null };
  const S = ensureSoc(game), notes = [], lines = [], r = makeRng(game.seed, "galaR", game.season);
  const who = (k) => G.att[k], N = (k) => who(k).name, T = (k) => (who(k).kind === "manager" ? who(k).team : who(k).kind === "player" ? who(k).team : null);
  const say = (text, w = 1, o = {}) => lines.push({ text, w, vis: o.priv ? "private" : "public", keys: o.keys || [], tag: o.tag || "confirmed", ...(o.story ? { story: o.story } : {}) });
  const noteTo = (k, text) => { const x = who(k); if (!x) return; if (x.kind === "manager") notes.push({ team: x.team, text }); else if (x.kind === "player") notes.push({ pid: x.pid, text }); };
  const fol = (k, d) => { const x = who(k); if (x && x.kind === "player") applyFx(game, game.players[x.pid], { fol: d }); };
  const resp = (a, b, kind) => G.prompts.find((p) => p.from === a && p.to === b && p.kind === kind);
  for (const key of G.order) {
    const pk = G.picks[key]; const me = who(key); if (!pk || !me) continue;
    const [kind, arg] = pk.opt.split(":"), other = pk.with && who(pk.with);
    if (kind === "toast") {
      if (me.kind === "manager") {
        bump(game, me.team, "toast");
        if (arg === "boast") { S.galaBoast = S.galaBoast || {}; S.galaBoast[me.team] = { season: game.season, rank: 3, name: me.name }; say(`${me.name} told the room ${teamName(game, me.team)} will finish in the top three. The newspaper wrote it down.`, 3 + (styleOf(game, me.team) === "showman" ? 1 : 0), { keys: [key], tag: "statement", story: { icon: "📣", head: variant(game, "boast", [`${up(me.name)} BOASTS: "${up(teamName(game, me.team))} WILL FINISH IN THE TOP THREE"`, `GALA BOAST: ${up(me.name)} PROMISES A TOP-THREE FINISH`]), sub: `Raising a glass at the mid-season gala, ${me.name} said ${teamName(game, me.team)} would finish in the top three. The newspaper has put the quote in a drawer labelled "later".` } });
        } else {
          let eased = 0; const dip = styleOf(game, me.team) === "diplomat";
          const tb = tableOf(G, key); for (const k of tb ? tb.seats : []) { const o = who(k); if (o && o.kind === "manager" && o.team !== me.team && mrel(game, me.team, o.team) < 0 && makeRng(game.seed, "toast", me.team, o.team, game.season)() < (dip ? 0.7 : 0.35)) { stepRel(game, me.team, o.team, 1, "gala toast"); eased++; } }
          say(`${me.name} gave a gracious toast${eased ? `, and relations with ${eased === 1 ? "a rival manager" : "rival managers"} warmed up` : ""}.`, eased ? 2 : 1, { keys: [key] });
        }
      } else {
        const joke = arg === "joke", lands = joke && r() < 0.55;
        fol(key, joke ? (lands ? K.toastFol : -K.jokeHit) : K.toastFol / 2);
        say(joke ? (lands ? `${me.name}'s joke killed. In a good way. The room is still laughing.` : `${me.name}'s joke did not land. A fork was heard to drop.`) : `${me.name} said a few kind words and got a warm round of applause.`, joke ? 2 : 1, { keys: [key], story: joke && lands ? { icon: "🎤", head: `${up(me.name)} BRINGS THE HOUSE DOWN AT THE GALA`, sub: `${me.name} was asked to say a few words and delivered a joke so good the head waiter applauded. Twice.` } : null });
      }
      continue;
    }
    if (!other) continue;
    const pr = resp(key, pk.with, kind), tgtGuest = other.kind === "guest";
    const answered = !!(pr && pr.status === "done");
    if (kind === "romance") {
      const accepted = tgtGuest || (answered && pr.mode === "yes");
      if (!accepted) { say(`${N(key)} asked ${N(pk.with)} to dance. ${answered ? "A polite no." : "Nobody answered."}`, 1, { priv: true, keys: [key, pk.with] }); remember(game, me.pid, "rej", { id: "u:" + other.pid, name: other.name, what: "dance" }); noteTo(key, `${N(pk.with)} did not dance with you.`); continue; }
      const a = game.players[me.pid], L = ensureLife(game, a); L.love = Math.min(100, L.love + K.danceLove);
      if (tgtGuest) { if (L.partner && L.partner.id === other.npc) L.partner.bond = Math.min(100, (L.partner.bond || 0) + K.danceBond); say(`${me.name} slow-danced the night away with ${other.name}.`, 1, { keys: [key] }); }
      else {
        const b = game.players[other.pid], BL = ensureLife(game, b); BL.love = Math.min(100, BL.love + K.danceLove);
        const pair = L.partner && L.partner.id === "u:" + b.id; if (pair) { L.partner.bond = Math.min(100, (L.partner.bond || 0) + K.danceBond); if (BL.partner && BL.partner.id === "u:" + a.id) BL.partner.bond = Math.min(100, (BL.partner.bond || 0) + K.danceBond); }
        const dated = G.dates[me.pid] && G.dates[me.pid].human === other.pid;
        say(pair || dated ? `${me.name} and ${other.name} danced together, and did not look at anyone else.` : `${me.name} and ${other.name} danced. People noticed.`, pair ? 3 : 2, { keys: [key, pk.with], tag: pair || dated ? "confirmed" : "rumour", story: { icon: "💃", head: pair || dated ? `${up(me.name)} AND ${up(other.name)}: THE GALA'S FIRST DANCE` : `WHO WAS ${up(me.name)} DANCING WITH? ${up(other.name)}, SAY WITNESSES`, sub: pair || dated ? `Together at the gala, together on the floor. Insiders call it "very sweet" and "a bit much".` : `Several guests report the dance was "longer than a dance needs to be". ${me.name} and ${other.name} have both said "it was only a dance".` } });
        remember(game, me.pid, "rival", { id: "u:" + b.id, name: other.name, over: "the dance floor", pid: b.id, soft: true });
      }
      continue;
    }
    if (kind === "reconcile") {
      if (!(answered && pr.mode === "yes")) { say(`${N(key)} tried to clear the air with ${N(pk.with)}. It was not the moment.`, 1, { priv: true, keys: [key, pk.with] }); noteTo(key, `${N(pk.with)} was not ready to talk.`); continue; }
      if (me.kind === "manager" && other.kind === "manager") { const dip = styleOf(game, me.team) === "diplomat", cur = mrel(game, me.team, other.team); setMrel(game, me.team, other.team, cur <= -2 && !dip ? -1 : 0, "gala reconciliation"); say(`${me.name} and ${other.name} shook hands at the gala and "agreed to move on".`, 3, { keys: [key, pk.with], story: { icon: "🤝", head: variant(game, "reconcile", [`${up(me.name)} AND ${up(other.name)} BURY THE HATCHET`, `PEACE AT THE GALA: ${up(me.name)} AND ${up(other.name)} SHAKE HANDS`]), sub: `After weeks of trading words in public, the two managers were seated at the same table and found, to everybody's disappointment, that they got on.` } }); }
      else if ((me.kind === "manager" && other.kind === "player") || (me.kind === "player" && other.kind === "manager")) { const m = me.kind === "manager" ? me : other, f = me.kind === "manager" ? other : me; const t = trustOf(game, m.team, f.pid); addTrust(game, m.team, f.pid, t < 0 ? -t : 1); say(`${m.name} and ${f.name} spoke privately at the gala and cleared the air.`, 2, { priv: true, keys: [key, pk.with] }); noteTo(m.key, `You made peace with ${f.name}: trust is back to neutral.`); noteTo(f.key, `You made peace with ${m.name}.`); }
      else { const a = game.players[me.pid], b = game.players[other.pid]; ensureLife(game, a).love = Math.min(100, ensureLife(game, a).love + 3); ensureLife(game, b).love = Math.min(100, ensureLife(game, b).love + 3); const m = memOf(game, me.pid); m.rival = m.rival.filter((e) => e.pid !== other.pid); const m2 = memOf(game, other.pid); m2.rival = m2.rival.filter((e) => e.pid !== me.pid); say(`${me.name} and ${other.name} made peace at the gala.`, 2, { keys: [key, pk.with] }); }
      continue;
    }
    if (kind === "confront") {
      const stood = answered && pr.mode === "stand", backed = answered && pr.mode === "back";
      if (backed || !answered) { fol(key, 300); say(backed ? `${me.name} had words with ${other.name}, who backed down.` : `${me.name} said what was on their mind to ${other.name}, who said nothing.`, 2, { priv: true, keys: [key, pk.with] }); noteTo(key, `${other.name} ${backed ? "backed down" : "said nothing"}.`); continue; }
      if (me.kind === "manager" && other.kind === "manager") stepRel(game, me.team, other.team, -1, "gala scene"); else if (me.kind === "player" && other.kind === "player") { remember(game, me.pid, "rival", { id: "u:" + other.pid, name: other.name, over: "the gala", pid: other.pid }); remember(game, other.pid, "rival", { id: "u:" + me.pid, name: me.name, over: "the gala", pid: me.pid }); }
      fol(key, K.sceneFol); fol(pk.with, K.sceneFol);
      say(`${me.name} and ${other.name} had a very public row at the gala.`, 5, { keys: [key, pk.with], tag: "confirmed", story: { icon: "🍷", head: variant(game, "scene", [`SCENE AT THE GALA: ${up(me.name)} AND ${up(other.name)} CLASH`, `${up(me.name)} V ${up(other.name)}: A GLASS WAS RAISED, THEN A VOICE`, `GALA DINNER, COURSE TWO: ${up(me.name)} AND ${up(other.name)} DO NOT AGREE`]), sub: `Guests say it started over the starter and ended over the main. Neither backed down. The waiter has been offered "a lot" to talk.` } });
      continue;
    }
    if (kind === "dispute") {
      if (!(answered && pr.mode === "yes")) { say(`${N(key)} wanted to talk shop with ${N(pk.with)}. It went nowhere.`, 1, { priv: true, keys: [key, pk.with] }); continue; }
      if (me.kind === "manager" && other.kind === "manager") { stepRel(game, me.team, other.team, 1, "gala shop talk"); say(`${me.name} and ${other.name} argued tactics for forty minutes and left on better terms.`, 2, { keys: [key, pk.with] }); }
      else { const m = me.kind === "manager" ? me : other, f = me.kind === "manager" ? other : me; addTrust(game, m.team, f.pid, 1); say(`${m.name} and ${f.name} talked about ${f.name}'s role over dessert.`, 1, { priv: true, keys: [key, pk.with] }); noteTo(m.key, `${f.name} appreciated the conversation (trust +1).`); noteTo(f.key, `${m.name} listened (trust +1).`); }
    }
  }
  for (const p of G.prompts) if (p.status === "open") p.status = "lapsed";
  // the roundup: the most notable public moments become the headline and (at most K.maxStories) real stories; private moments are only for the people in them
  const pub = lines.filter((l) => l.vis === "public").sort((a, b) => b.w - a.w), SEATED = { "arrived with their ex": (a, b) => `${a.name} arrived with ${b.name}'s ex and was seated beside them. Nobody ordered dessert.`, "are exes": (a, b) => `${a.name} and ${b.name}, who used to date, were seated at the same table.`, rows: (a, b) => `${a.name} and ${b.name}, who have been trading words in public, were seated together.`, "are rival suitors": (a, b) => `${a.name} and ${b.name}, who both pursued the same person, were seated together.`, "fell out with their manager": (a, b) => `${a.name} and ${b.name}, who recently fell out, were seated together.` };
  for (const t of G.tags.filter((t) => SEATED[t.why]).slice(0, 2)) { const a = who(t.a), b = who(t.b); if (a && b) pub.push({ text: SEATED[t.why](a, b), w: 2, vis: "public", keys: [t.a, t.b], tag: "rumour" }); }
  const top = pub.slice().sort((a, b) => b.w - a.w), stories = top.filter((l) => l.story).slice(0, K.maxStories);
  const th = openThread(game, "gala", G.order.map((k) => (who(k).kind === "manager" ? "t" + who(k).team : who(k).kind === "player" ? who(k).pid : null)).filter((x) => x != null), `The season ${game.season} gala.`);
  for (const l of stories) deskStory(game, { force: true, thread: th.id, kind: "league", icon: l.story.icon, team: who(l.keys[0]).kind === "manager" ? who(l.keys[0]).team : null, pid: who(l.keys[0]).kind === "player" ? who(l.keys[0]).pid : null, prio: 3, tag: l.tag, src: "athletic", head: l.story.head, sub: l.story.sub });
  const names = (k) => (who(k) ? who(k).name : "?");
  const head = variant(game, "galaHead", [`GALA NIGHT: ${stories.length ? up(top[0].text.split(".")[0]) : "A QUIET EVENING, BY FOOTBALL STANDARDS"}`, `MID-SEASON GALA: ${stories.length ? "THE FULL STORY" : "EVERYONE BEHAVED. WE ARE DISAPPOINTED"}`]);
  G.roundup = { head, lines: [...pub.slice(0, 6).map((l) => ({ text: l.text, tag: l.tag })), ...lines.filter((l) => l.vis === "private").map((l) => ({ text: l.text, tag: "private", keys: l.keys }))], kept: pub.length };
  G.status = "end";
  return { notes, roundup: G.roundup };
}
// A boast is checked when the season ends.
export function checkBoasts(game, table) {
  const S = ensureSoc(game), out = []; if (!S.galaBoast) return out;
  for (const [team, b] of Object.entries(S.galaBoast)) {
    if (b.season !== game.season) continue; const pos = (table || []).findIndex((r) => r.i === +team) + 1; if (!pos) continue;
    delete S.galaBoast[team];
    const kept = pos <= b.rank;
    out.push(deskStory(game, { force: true, kind: "league", icon: kept ? "✅" : "🙈", team: +team, prio: 4, tag: "confirmed", src: kept ? "athletic" : "sun",
      head: kept ? `${up(b.name)} DELIVERS ON THE GALA BOAST: ${up(teamName(game, +team))} FINISH ${pos}${["th", "st", "nd", "rd"][pos] && pos < 4 ? ["", "st", "nd", "rd"][pos] : "th"}` : `${up(b.name)}'S GALA BOAST: ${up(teamName(game, +team))} FINISH ${pos}${pos === 1 ? "ST" : pos === 2 ? "ND" : pos === 3 ? "RD" : "TH"}`,
      sub: kept ? `Back at the gala, ${b.name} said top three. The newspaper has taken the quote out of the drawer, a little disappointed it was true.` : `Back at the gala, ${b.name} promised a top-three finish. The newspaper has taken the quote out of the drawer and put it on the front page, in a frame.` }));
  }
  return out;
}
