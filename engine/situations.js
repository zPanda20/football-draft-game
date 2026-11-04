// Manager situations: a benched player asks for minutes, a top player objects to a signing, a squad player is out partying, another
// manager criticises your tactics. They arise from real squad and fixture state, wait in the manager's inbox without stopping the room,
// and lapse quietly. Every answer shows its consequence first (trust, a headline, a fine) and the consequences are small and capped.
import { makeRng } from "./rng.js";
import { ensureSoc, mgrOf, bump, styleOf, bossName, teamName, temper, TEMPER_TEXT, trustOf, addTrust, trustWord, styleAdj, mrel, setMrel, stepRel, openThread, addHist, closeThread, threadOf, deskStory, drainDesk, later, flushLater, variant, nid } from "./social.js";
import { addRel } from "./clubrel.js";
import { applyFx, ensureLife } from "./life.js";

const sign = (n) => (n > 0 ? "+" + n : String(n));
const up = (s) => String(s).toUpperCase();
const fem = (p) => p && (p.gender === "F" || p.gender === "Female");
const he = (p) => (fem(p) ? "she" : "he"), his = (p) => (fem(p) ? "her" : "his"), him = (p) => (fem(p) ? "her" : "him");
const LINE = { GK: "GK", CB: "DEF", LB: "DEF", RB: "DEF", CDM: "MID", CM: "MID", CAM: "MID", LM: "MID", RM: "MID" };
const lineOf = (pos) => LINE[pos] || "ATT";
const day0 = (game) => game.weekDay ?? 0;
export const socialOn = (game) => game.socialOn !== false;
const squad = (game, t) => game.teams[t].players.map((id) => game.players[id]).filter((p) => p && !p.retired);
const pTag = (game, pid) => (game.players[pid] || {}).name || "A player";

// ---------- what each answer does to trust, by temperament ----------
// calm / proud / loyal / restless. Kind: soft answers (kind words) and hard ones (refusals, fines) are bent by the manager's style.
const TR = {
  promise: { kind: "soft", d: { calm: 1, proud: 1, loyal: 1, restless: 1 } },
  explain: { kind: "soft", d: { calm: 0, proud: -1, loyal: 0, restless: 0 } },
  dismiss: { kind: "hard", d: { calm: -1, proud: -2, loyal: -1, restless: -1 } },
  reassure: { kind: "soft", d: { calm: 1, proud: 1, loyal: 1, restless: 0 } },
  back: { kind: "hard", d: { calm: -1, proud: -2, loyal: 0, restless: -1 } },
  compete: { kind: "hard", d: { calm: 0, proud: -1, loyal: 0, restless: 1 } },
  defend: { kind: "soft", d: { calm: 1, proud: 1, loyal: 1, restless: 1 } },
  fine: { kind: "hard", d: { calm: 0, proud: -2, loyal: -1, restless: -1 } },
  bench: { kind: "hard", d: { calm: -1, proud: -2, loyal: -1, restless: -1 } },
};
function dTrust(game, team, pid, key) {
  const row = TR[key], t = temper(game, pid); return { d: styleAdj(styleOf(game, team), row.kind, row.d[t]), temper: t };
}
// Apply a trust change. A footballer who has really fallen out with the club also feels it in his club relationship (a small, one-off nudge).
function moveTrust(game, team, pid, d) {
  const before = trustOf(game, team, pid), now = addTrust(game, team, pid, d), p = game.players[pid];
  if (p && p.user && p.team === team) { if (before > -2 && now <= -2) addRel(game, p, team, -4); else if (before < 2 && now >= 2) addRel(game, p, team, 4); }
  return now;
}
const trustLine = (game, team, pid, d) => `${pTag(game, pid)}: trust ${d ? sign(d) : "unchanged"}, now ${trustWord(trustOf(game, team, pid)).toLowerCase()}.`;
const REACT = {
  bench: { calm: "accepts it with a nod", proud: "storms out of the meeting", loyal: "says he'll wait his turn", restless: "mutters about other clubs" },
};

// ---------- creating a situation ----------
function mkSit(game, s) {
  const S = ensureSoc(game), K = game.P.social, day = day0(game);
  const sit = { id: nid(game), status: "open", season: game.season, day, expires: day + (s.expireDays ?? K.expireDays), to: "mgr", ...s };
  S.inbox.push(sit); if (S.inbox.length > 40) S.inbox.splice(0, S.inbox.length - 40);
  if (sit.to === "mgr" && sit.kind !== "comment") S.lastSit[sit.team] = day;
  return sit;
}

// ---------- the tick: runs when a matchday opens ----------
// ctx = { day, fixtures: [[a, b], ...], table: standings rows (best first) }.
export function socialTick(game, ctx) {
  const S = ensureSoc(game), K = game.P.social, day = ctx.day; game.weekDay = day; if (ctx.total) game.seasonDays = ctx.total;
  drainDesk(game, season_week(game, day));
  const out = { sits: [], stories: 0 };
  for (const s of S.inbox) if (s.status === "open" && (s.season !== game.season || day >= s.expires)) lapse(game, s);
  S.inbox = S.inbox.filter((s) => s.status === "open" || (s.closed != null && s.season === game.season && day - s.closed < 6));
  // squads: who is new since last matchday (the first matchday of a season is only a baseline)
  const fresh = {};
  for (const t of game.teams) {
    if (!t.human) continue;
    const cur = t.players.slice(), prev = S.seen[t.id];
    if (prev && S.seenSeason === game.season && day > 0) fresh[t.id] = cur.filter((id) => !prev.includes(id));
    S.seen[t.id] = cur;
  }
  S.seenSeason = game.season;
  if (!socialOn(game)) return out;
  const rank = new Map((ctx.table || []).map((r, i) => [r.i, i]));
  const fixOf = (t) => (ctx.fixtures || []).find((f) => f[0] === t || f[1] === t);
  for (const t of game.teams) {
    if (!t.human) continue;
    const open = S.inbox.filter((s) => s.status === "open" && s.to === "mgr" && s.team === t.id && s.kind !== "comment").length;
    if (open >= K.maxOpen || day - (S.lastSit[t.id] ?? -9) < K.gap) continue;
    const f = fixOf(t.id), opp = f ? (f[0] === t.id ? f[1] : f[0]) : null;
    const sit = partyUser(game, t, day, opp) || signingSit(game, t, day, fresh[t.id] || []) || partyNpc(game, t, day, opp, rank) || benchSit(game, t, day);
    if (sit) out.sits.push(sit);
  }
  out.stories += meetingPreviews(game, ctx);
  return out;
}
const season_week = (game, day) => game.season * 100 + day;

function benchSit(game, t, day) {
  const S = ensureSoc(game), K = game.P.social.bench, sq = squad(game, t.id).filter((p) => !p.user && !(p.susp > 0));
  if (sq.length < 7) return null;
  const sorted = sq.slice().sort((a, b) => b.ovr - a.ovr), ref = sorted[Math.min(sorted.length - 1, 4)].ovr;
  const mine = mgrOf(game, t.id);
  const cands = sq.filter((p) => { const b = S.bench[p.id]; return b && b.team === t.id && b.n >= K.after && p.ovr >= ref - K.ovrGap && (S.cool["bench" + p.id] ?? -99) <= day && !mine.promises.some((x) => x.pid === p.id && x.status === "open") && trustOf(game, t.id, p.id) > -3; });
  if (!cands.length) return null;
  cands.sort((a, b) => S.bench[b.id].n - S.bench[a.id].n || b.ovr - a.ovr);
  const p = cands[0], th = openThread(game, "bench", [p.id, "t" + t.id], `${p.name} has missed out ${S.bench[p.id].n} matchdays in a row and has asked ${bossName(game, t.id)} for a start.`, { priv: true });
  S.cool["bench" + p.id] = day + K.cooldown - (trustOf(game, t.id, p.id) < 0 ? 2 : 0);
  return mkSit(game, { kind: "bench", team: t.id, pid: p.id, thread: th.id, ctx: { n: S.bench[p.id].n } });
}
function signingSit(game, t, day, fresh) {
  const S = ensureSoc(game), K = game.P.social.signing;
  if (!fresh.length) return null;
  const top = squad(game, t.id).filter((p) => !fresh.includes(p.id)).sort((a, b) => b.ovr - a.ovr).slice(0, K.topN);
  let best = null;
  for (const id of fresh) {
    const n = game.players[id]; if (!n || n.retired || n.team !== t.id) continue;
    for (const inc of top) if (lineOf(inc.pos) === lineOf(n.pos) && n.ovr >= inc.ovr - K.gap && (S.cool["sign" + inc.id] ?? -99) <= day && (!best || inc.ovr > best.inc.ovr)) best = { inc, n };
  }
  if (!best) return null;
  S.cool["sign" + best.inc.id] = day + K.cooldown;
  const th = openThread(game, "sign", [best.inc.id, best.n.id, "t" + t.id], `${teamName(game, t.id)} signed ${best.n.name} (${best.n.pos}, ${best.n.ovr}). ${best.inc.name} (${best.inc.pos}, ${best.inc.ovr}) is not thrilled.`, { priv: true });
  return mkSit(game, { kind: "sign", team: t.id, pid: best.inc.id, other: best.n.id, thread: th.id, ctx: { ovr: best.inc.ovr, nOvr: best.n.ovr } });
}
function important(game, t, opp, rank) {
  if (opp == null) return false;
  if (mrel(game, t, opp) < 0) return true;
  const a = rank.get(t), b = rank.get(opp);
  return a != null && b != null && (b < 3 || (a < 3 && Math.abs(a - b) <= 3));
}
function partyNpc(game, t, day, opp, rank) {
  const S = ensureSoc(game), K = game.P.social.party;
  if (day < 1 || opp == null || (S.cool["party" + t.id] ?? -99) > day || !important(game, t.id, opp, rank)) return null;
  const r = makeRng(game.seed, "partyn", t.id, game.season, day); if (r() >= K.chance) return null;
  const sq = squad(game, t.id).filter((p) => !p.user && !(p.susp > 0)).sort((a, b) => b.ovr - a.ovr).slice(0, 6); if (!sq.length) return null;
  const p = sq[Math.floor(r() * sq.length)];
  S.cool["party" + t.id] = day + K.cooldown;
  const th = openThread(game, "party", [p.id, "t" + t.id], `${p.name} was seen out the night before ${teamName(game, t.id)} face ${teamName(game, opp)}.`, { priv: true, meta: { pid: p.id, team: t.id, opp } });
  return mkSit(game, { kind: "party", team: t.id, pid: p.id, thread: th.id, ctx: { src: "npc", opp, day } });
}
// A footballer on a manager's team partied last week and it made the papers: the manager has to say something.
function partyUser(game, t, day, opp) {
  const S = ensureSoc(game);
  for (const [pid, f] of Object.entries(S.partyFlags)) {
    const p = game.players[pid]; if (!p || p.team !== t.id || f.used || f.season !== game.season || f.day !== day - 1) continue;
    f.used = true;
    const th = openThread(game, "party", [p.id, "t" + t.id], f.head, { meta: { pid: p.id, team: t.id, opp } });
    return mkSit(game, { kind: "party", team: t.id, pid: p.id, thread: th.id, ctx: { src: "user", head: f.head, opp, day } });
  }
  return null;
}
// Called when a footballer's week was a night out and the papers printed something about it.
export function noteParty(game, p, head) {
  if (!socialOn(game) || p.team == null || !game.teams[p.team].human) return;
  ensureSoc(game).partyFlags[p.id] = { team: p.team, season: game.season, day: day0(game), head, used: false };
}

// ---------- the options, with their consequences stated up front ----------
export function optionsFor(game, sit, base) {
  const K = game.P.social, team = sit.team, pid = sit.pid, st = styleOf(game, team), p = game.players[pid];
  const tr = (key) => { const x = dTrust(game, team, pid, key); return { ...x, txt: `Trust ${x.d ? sign(x.d) : "unchanged"} (${TEMPER_TEXT[x.temper].toLowerCase()} temperament${st ? `, ${st === "direct" ? "straight talker" : st} style` : ""}).` }; };
  if (sit.kind === "bench") {
    const last = (game.seasonDays || 99) - 1, b0 = base ?? sit.day;
    const out = K.bench.promiseDays.map((n) => { const x = tr("promise"), due = Math.min(last, b0 + n - 1) + 1; return { id: "p" + n, label: `Promise a start within ${n} matchdays`, tone: "soft", preview: `${x.txt} He must start by matchday ${due}. Keep it and trust rises again; break it and he loses ${bump0(st)} trust and the papers may hear. A suspension, sale or retirement cancels it with no penalty.` }; });
    out.push({ id: "explain", label: "Explain that the line-up is working", tone: "soft", preview: `${tr("explain").txt} No promise, nothing printed.` });
    out.push({ id: "dismiss", label: "Dismiss the complaint", tone: "hard", preview: `${tr("dismiss").txt} Private, but a proud player may talk.` });
    return out;
  }
  if (sit.kind === "sign") {
    const n = game.players[sit.other];
    return [
      { id: "reassure", label: `Reassure ${p.name}`, tone: "soft", preview: `${tr("reassure").txt} ${n ? n.name : "The newcomer"} is unaffected.` },
      { id: "back", label: `Back ${n ? n.name : "the newcomer"}`, tone: "hard", preview: `${p.name}: ${tr("back").txt} ${n ? n.name : "The newcomer"}: trust +1.` },
      { id: "compete", label: `Tell ${p.name} to compete`, tone: "hard", preview: `${tr("compete").txt} Restless players like a challenge.` },
    ];
  }
  if (sit.kind === "party") {
    const user = !!(p && p.user), out = [{ id: "defend", label: `Defend ${p ? p.name : "him"} in public`, tone: "soft", preview: `${tr("defend").txt} A public statement goes in the paper, and the next result decides whether it ages well.` }];
    const amt = fineFor(game, p);
    if (amt > 0 || !user) out.push({ id: "fine", label: user ? `Fine ${p.name} ${amt} coins` : `Fine ${p ? p.name : "him"}`, tone: "hard", preview: `${tr("fine").txt} ${user ? `${amt} coins leave ${his(p)} wallet (it goes to charity, not to you). ${p.name} chooses how to react.` : "It goes to charity. Private, unless a proud player talks."}` });
    out.push({ id: "bench", label: `Bench ${p ? p.name : "him"} for ${K.party.benchGames === 1 ? "the next match" : K.party.benchGames + " matches"}`, tone: "hard", preview: `${tr("bench").txt} ${p ? p.name : "He"} is left out of the XI automatically. ${user ? `${p.name} chooses how to react.` : ""}` });
    return out;
  }
  if (sit.kind === "comment") {
    return [
      { id: "calm", label: "Rise above it (public)", tone: "soft", preview: "A dignified public reply. Things stay sour, nobody escalates, and the paper notes who kept their cool." },
      { id: "fire", label: "Hit back (public)", tone: "hard", preview: "A public retort. This becomes a feud: the next time you meet, the paper will be there. Neither of you gains anything from it." },
      { id: "private", label: "Speak privately", tone: "soft", preview: "A quiet word. The row is over, nothing is printed, and you are back to neutral." },
      { id: "match", label: "Leave it for the match to settle", tone: "soft", preview: "No answer. If you play them, the paper calls it a grudge match, and the result settles it." },
    ];
  }
  if (sit.kind === "react") {
    return [
      { id: "accept", label: "Take it on the chin", tone: "soft", preview: "Nothing changes. The matter is closed." },
      { id: "apologise", label: "Apologise", tone: "soft", preview: "Trust with your manager +1." },
      { id: "push", label: "Push back in private", tone: "hard", preview: "Trust with your manager −1. Your manager is told." },
      { id: "public", label: "Go public", tone: "hard", preview: `Trust −1, +${K.react.fol} followers, and your side of it is in the paper.` },
    ];
  }
  return [];
}
const bump0 = (st) => (st === "showman" ? "3 trust" : "2 trust");
const fineFor = (game, p) => { if (!p || !p.user) return 0; const K = game.P.social.party; return Math.max(0, Math.min(K.fine, Math.floor((p.coins || 0) * K.fineShare))); };

export function listFor(game, { team = null, pid = null } = {}, base) {
  const S = ensureSoc(game);
  return S.inbox.filter((s) => s.status === "open" && ((s.to === "mgr" && team != null && s.team === team) || (s.to === "player" && pid != null && s.toPid === pid))).map((s) => viewSit(game, s, base));
}
function viewSit(game, s, base0) {
  const p = s.pid != null ? game.players[s.pid] : null, o = s.other != null && s.kind === "sign" ? game.players[s.other] : null;
  const base = { id: s.id, kind: s.kind, pid: s.pid ?? null, name: p ? p.name : null, pos: p ? p.pos : null, ovr: p ? p.ovr : null, user: !!(p && p.user), expires: s.expires, day: s.day, opts: optionsFor(game, s, base0), temper: p && !p.user && s.to === "mgr" ? TEMPER_TEXT[temper(game, p.id)] : null, trust: p && s.to === "mgr" ? trustWord(trustOf(game, s.team, p.id)) : null };
  if (s.kind === "bench") return { ...base, title: `${p.name} wants a start`, why: `Has missed out ${s.ctx.n} matchdays in a row${p.ovr ? ` (rated ${p.ovr})` : ""}. The request is private.`, vis: "private" };
  if (s.kind === "sign") return { ...base, other: o ? { id: o.id, name: o.name, pos: o.pos, ovr: o.ovr } : null, title: `${p.name} is unhappy about the new signing`, why: `${o ? o.name : "A newcomer"} (${o ? o.pos : "?"}, ${o ? o.ovr : "?"}) plays ${o ? "the same position" : "in his area"} and is close to ${p.name} (${p.pos}, ${p.ovr}).`, vis: "private" };
  if (s.kind === "party") return { ...base, title: `${p.name} was out the night before a big match`, why: s.ctx.src === "user" ? `The papers have it: "${s.ctx.head}".` : `A dressing-room whisper ahead of ${teamName(game, s.ctx.opp)}. Not public yet.`, vis: s.ctx.src === "user" ? "public" : "rumour", opp: s.ctx.opp ?? null };
  if (s.kind === "comment") return { ...base, title: `${bossName(game, s.ctx.from)} criticised your tactics`, why: `In public: ${s.ctx.quote}`, vis: "public", from: s.ctx.from };
  if (s.kind === "react") return { ...base, title: s.ctx.title, why: s.ctx.why, vis: "private" };
  return base;
}

// ---------- answering ----------
function lapse(game, s) {
  s.status = "lapsed"; s.closed = day0(game);
  const th = s.thread ? threadOf(game, s.thread) : null;
  if (s.kind === "bench") { moveTrust(game, s.team, s.pid, -1); if (th) closeThread(game, th.id, `${pTag(game, s.pid)}'s request went unanswered.`); }
  else if (s.kind === "comment") { if (th) addHist(game, th.id, "No reply: the match will decide."); }
  else if (th) closeThread(game, th.id, "Left unanswered.");
}
export function answer(game, id, optId, who = {}, ctx = {}) {
  const S = ensureSoc(game), sit = S.inbox.find((x) => x.id === id);
  if (!sit || sit.status !== "open") return { ok: false, why: "That is already settled." };
  if (!socialOn(game)) return { ok: false, why: "Social events are switched off." };
  if (sit.to === "mgr" ? who.team !== sit.team : who.pid !== sit.toPid) return { ok: false, why: "That is not yours to answer." };
  const opt = optionsFor(game, sit, ctx.base).find((o) => o.id === optId); if (!opt) return { ok: false, why: "Unknown choice." };
  sit.status = "done"; sit.closed = day0(game); sit.pick = optId;
  const res = RESOLVE[sit.kind](game, sit, optId, ctx) || {};
  return { ok: true, notes: res.notes || [], msg: res.msg || "Done." };
}
const RESOLVE = {
  bench(game, sit, opt, ctx) {
    const { team, pid } = sit, p = game.players[pid], th = sit.thread, boss = bossName(game, team), mgr = mgrOf(game, team), T = temper(game, pid);
    if (opt[0] === "p") {
      const days = +opt.slice(1), x = dTrust(game, team, pid, "promise"), last = (game.seasonDays || 99) - 1, b0 = ctx.base ?? sit.day, due = Math.min(last, b0 + days - 1);
      moveTrust(game, team, pid, x.d);
      mgr.promises.push({ id: nid(game), pid, made: b0, due, days, status: "open", thread: th, season: game.season });
      addHist(game, th, `${boss} promised ${p.name} a start within ${days} matchdays (by matchday ${due + 1}).`, { priv: true });
      return { msg: `Promise made: ${p.name} must start by matchday ${due + 1}.`, notes: [{ team, text: `${p.name} ${REACT.bench[T].replace("he'll", he(p) + "'ll")}, but takes you at your word. ${trustLine(game, team, pid, x.d)}` }] };
    }
    const key = opt === "explain" ? "explain" : "dismiss", x = dTrust(game, team, pid, key); moveTrust(game, team, pid, x.d);
    closeThread(game, th, `${boss} ${key === "explain" ? "explained the line-up is working" : "dismissed the complaint"}. ${p.name} ${REACT.bench[T]}.`);
    if (key === "dismiss" && T === "proud") later(game, { kind: "league", icon: "🗣️", pid, head: variant(game, "benchLeak", [`${up(p.name)} "NOT HAPPY" AT ${up(teamName(game, team))}`, `DRESSING-ROOM WHISPERS: ${up(p.name)} WANTS MORE MINUTES`, `${up(p.name)}'S PATIENCE WEARING THIN AT ${up(teamName(game, team))}`]), sub: `Sources say ${p.name} went to the manager asking for a start and "did not like the answer". ${boss} had no comment. ${p.name} had several, none of them printable.`, tag: "rumour", prio: 1, src: "sun" });
    return { msg: key === "explain" ? "You explained yourself." : "You waved it away.", notes: [{ team, text: `${p.name} ${REACT.bench[T]}. ${trustLine(game, team, pid, x.d)}` }] };
  },
  sign(game, sit, opt) {
    const { team, pid } = sit, p = game.players[pid], n = game.players[sit.other], th = sit.thread, T = temper(game, pid), notes = [], x = dTrust(game, team, pid, opt);
    moveTrust(game, team, pid, x.d);
    if (opt === "back" && n) moveTrust(game, team, n.id, 1);
    closeThread(game, th, `${bossName(game, team)} ${{ reassure: `reassured ${p.name}`, back: `backed ${n ? n.name : "the newcomer"}`, compete: `told ${p.name} to compete` }[opt]}.`);
    notes.push({ team, text: trustLine(game, team, pid, x.d) });
    if (p.user && opt !== "reassure") notes.push(...reactFor(game, p, team, "sign", `Your manager backed ${n ? n.name : "the new signing"} for your position.`, "Not what you hoped to hear."));
    if (!p.user && opt === "back" && T === "proud") later(game, { kind: "league", icon: "🧳", pid, head: variant(game, "signAnnoy", [`${up(p.name)} FUMING AS ${up(n ? n.name : "NEWCOMER")} ARRIVES`, `${up(p.name)} GIVES ${up(teamName(game, team))} A LOOK AFTER ${up(n ? n.name : "NEW")} SIGNING`]), sub: `${p.name} was told the club is backing the new arrival. A source says ${he(p)} took it "like a free kick to the face".`, tag: "rumour", prio: 1, src: "sun" });
    return { msg: "Said.", notes };
  },
  party(game, sit, opt, ctx = {}) {
    const { team, pid } = sit, p = game.players[pid], th = sit.thread, boss = bossName(game, team), T = temper(game, pid), x = dTrust(game, team, pid, opt), notes = [{ team, text: trustLine(game, team, pid, x.d) }];
    moveTrust(game, team, pid, x.d);
    const d = day0(game), matchDay = ctx.base ?? sit.ctx.matchDay ?? d, thr = threadOf(game, th);
    if (opt === "defend") {
      bump(game, team, "defend"); if (thr) thr.meta = { ...thr.meta, defend: true, day: matchDay, pid };
      deskStory(game, { thread: th, kind: "league", icon: "🛡️", pid, team, prio: 4, showman: styleOf(game, team) === "showman", tag: "statement", src: "sun",
        head: variant(game, "defend", [`${up(boss)} BACKS ${up(p.name)}: "HE'S A PROFESSIONAL"`, `${up(boss)} DEFENDS ${up(p.name)} OVER NIGHT OUT`, `"LEAVE ${up(p.name)} ALONE": ${up(boss)} STANDS BY ${up(him(p))}`]),
        sub: `${boss} says ${p.name} "does what ${he(p)} does on ${his(p)} own time" and is "absolutely ready" for ${sit.ctx.opp != null ? teamName(game, sit.ctx.opp) : "the next match"}. The next result will decide whether that looks wise.` });
      return { msg: "You backed him in public.", notes };
    }
    if (opt === "fine") {
      bump(game, team, "fines");
      if (p.user) { const amt = fineFor(game, p); p.coins = Math.max(0, (p.coins || 0) - amt); notes.push({ pid, text: `${boss} fined you ${amt} coins for the night out (it goes to charity).` }); notes.push(...reactFor(game, p, team, "fine", `${boss} fined you for the night out.`, `${amt} coins paid.`)); }
      addHist(game, th, `${boss} fined ${p.name}${p.user ? "" : " (to charity)"}.`, { priv: true });
      if (!p.user && T === "proud" && makeRng(game.seed, "fineLeak", pid, game.season, d)() < 0.4) later(game, { kind: "league", icon: "🧾", pid, head: variant(game, "fineLeak", [`${up(p.name)} FINED BY ${up(boss)}, SAY SOURCES`, `${up(boss)} HITS ${up(p.name)} WHERE IT HURTS: THE WALLET`]), sub: `A dressing-room source says the club quietly fined ${p.name} after a night out. ${p.name} is said to be "not impressed". The club says it does not discuss internal matters, and then discusses them for a while.`, tag: "rumour", prio: 2, src: "sun" });
      return { msg: "The fine is paid.", notes };
    }
    bump(game, team, "bench"); const mgr = mgrOf(game, team);
    mgr.benchOrders = (mgr.benchOrders || []).filter((o) => o.day !== matchDay); mgr.benchOrders.push({ pid, day: matchDay, games: game.P.social.party.benchGames });
    addHist(game, th, `${boss} benched ${p.name} for the next match.`, { priv: true });
    if (p.user) notes.push({ pid, text: `${boss} is leaving you out of the next match after the night out.` }, ...reactFor(game, p, team, "bench", `${boss} benched you after the night out.`, "You are out of the next XI."));
    if (makeRng(game.seed, "benchStory", pid, game.season, d)() < 0.5) later(game, { kind: "league", icon: "🪑", pid, thread: th, head: variant(game, "benchNight", [`${up(p.name)} LEFT OUT AFTER NIGHT OUT`, `${up(boss)} DROPS ${up(p.name)}: "SELECTION"`, `SOMEBODY HAS BEEN DROPPED. IT IS ${up(p.name)}. THE REASON IS "TACTICAL"`]), sub: `${boss} says it is purely a football decision. ${p.name} was last seen in the papers, not on the team sheet.`, tag: "rumour", prio: 2, src: "sun" });
    return { msg: "He is out of the next XI.", notes };
  },
  comment(game, sit, opt) {
    const { team } = sit, from = sit.ctx.from, th = sit.thread, boss = bossName(game, team), ob = bossName(game, from), notes = [{ team: from, text: `${boss} answers: ${{ calm: "a calm public reply", fire: "a public hit back", private: "a private word", match: "no reply, the match will decide" }[opt]}.` }];
    if (opt === "private") { setMrel(game, team, from, 0, "private word"); closeThread(game, th, `${boss} and ${ob} cleared the air in private.`); bump(game, team, "praise", 0); return { msg: "You sorted it out in private.", notes }; }
    if (opt === "match") { addHist(game, th, `${boss} left it for the match to settle.`); const thr = threadOf(game, th); if (thr) thr.meta = { ...thr.meta, grudge: true }; return { msg: "You will settle it on the pitch.", notes }; }
    const fire = opt === "fire"; if (fire) setMrel(game, team, from, -2, "public row");
    bump(game, team, "jab", fire ? 1 : 0);
    deskStory(game, { thread: th, kind: "league", icon: fire ? "🔥" : "🧊", team, prio: fire ? 4 : 3, showman: styleOf(game, team) === "showman", tag: "statement", src: "athletic",
      head: fire ? variant(game, "fire", [`${up(boss)} FIRES BACK AT ${up(ob)}`, `"PHYSICIAN, HEAL THYSELF": ${up(boss)} V ${up(ob)}`, `${up(boss)} AND ${up(ob)} ARE NOW NOT SPEAKING (VERY LOUDLY)`]) : variant(game, "calm", [`${up(boss)} REFUSES TO TAKE ${up(ob)}'S BAIT`, `${up(boss)} ON ${up(ob)}: "I WISH HIM WELL"`]),
      sub: fire ? `${boss} said ${ob}'s ${teamName(game, from)} "should look at their own results before lecturing anyone". The next meeting between ${teamName(game, team)} and ${teamName(game, from)} is now a Big Match, officially, because the paper says so.` : `Asked about ${ob}'s comments, ${boss} said ${he0(game, team)} "has a lot of respect for everyone in the league". Nobody believed it, which is the whole point of the phrase.` });
    const thr = threadOf(game, th); if (thr) thr.meta = { ...thr.meta, grudge: fire };
    return { msg: fire ? "You hit back. It is a feud now." : "You kept your cool.", notes };
  },
  react(game, sit, opt) {
    const { pid, team } = sit.ctx, p = game.players[pid], boss = bossName(game, team), notes = [];
    if (opt === "apologise") { moveTrust(game, team, pid, 1); notes.push({ team, text: `${p.name} apologised. ${trustLine(game, team, pid, 1)}` }); }
    if (opt === "push" || opt === "public") { moveTrust(game, team, pid, -1); notes.push({ team, text: `${p.name} ${opt === "push" ? "pushed back in private" : "went public"} about your decision. ${trustLine(game, team, pid, -1)}` }); }
    if (opt === "public") {
      applyFx(game, p, { fol: game.P.social.react.fol });
      deskStory(game, { kind: "league", icon: "📣", pid, team, prio: 3, tag: "statement", src: "sun", thread: sit.thread,
        head: variant(game, "goPublic", [`${up(p.name)} HITS BACK AT ${up(boss)}`, `"I WAS TREATED UNFAIRLY": ${up(p.name)} TALKS`, `${up(p.name)} V ${up(boss)}: ${up(his(p))} SIDE OF THE STORY`]),
        sub: `${p.name} says ${sit.ctx.what}. ${boss} says ${he0(game, team)} "will deal with that in-house". The paper has already dealt with it on page three.` });
    } else if (sit.thread) closeThread(game, sit.thread, `${p.name} ${opt === "accept" ? "took it on the chin" : opt === "apologise" ? "apologised" : "pushed back in private"}.`);
    return { msg: "Your reaction is noted.", notes };
  },
};
const he0 = () => "he";
// A footballer controlled by a person gets to choose how to react to a decision by the manager (fine, bench, being passed over).
function reactFor(game, p, team, what, why, effect) {
  const S = ensureSoc(game), th = openThread(game, "react", [p.id, "t" + team], `${p.name} reacted to ${bossName(game, team)}'s decision (${what}).`, { priv: true });
  mkSit(game, { kind: "react", to: "player", toPid: p.id, team, pid: p.id, thread: th.id, expireDays: 2, ctx: { pid: p.id, team, title: `${bossName(game, team)} made a decision about you`, why: `${why} ${effect}`, what: { fine: "the fine was unfair", bench: "being dropped was a punishment, not a football decision", sign: "the club is not backing them" }[what] } });
  return [{ pid: p.id, text: "Your manager's decision is waiting for your reaction (Relationships, Manager)." }];
}

// ---------- promises and the bench count: the line-ups are known at kick-off ----------
export function recordStarts(game, day, starts, total) {
  const S = ensureSoc(game), notes = [], K = game.P.social;
  game.seasonDays = total || game.seasonDays;
  for (const { team, ids } of starts) {
    const t = game.teams[team], set = new Set(ids);
    for (const pid of t.players) {
      const p = game.players[pid]; if (!p || p.retired || p.susp > 0) continue;
      const b = S.bench[pid]; if (!b || b.team !== team) S.bench[pid] = { team, n: set.has(pid) ? 0 : 1 }; else b.n = set.has(pid) ? 0 : b.n + 1;
    }
    const mgr = mgrOf(game, team);
    for (const pr of mgr.promises) {
      if (pr.status !== "open") continue;
      const p = game.players[pr.pid], th = pr.thread, boss = bossName(game, team);
      if (!p || p.retired || p.team !== team) { pr.status = "void"; if (th) closeThread(game, th, `The promise to ${pTag(game, pr.pid)} fell away: ${p && p.retired ? "retired" : "moved on"}.`); notes.push({ team, text: `Your promise to ${pTag(game, pr.pid)} no longer applies (${p && p.retired ? "retired" : "left the club"}). No penalty.` }); continue; }
      if (set.has(pr.pid)) {
        pr.status = "kept"; bump(game, team, "kept"); const x = moveTrust(game, team, pr.pid, 1);
        if (th) closeThread(game, th, `${boss} kept ${his(p)} word: ${p.name} started on matchday ${day + 1}.`);
        notes.push({ team, text: `You kept your promise: ${p.name} starts. ${trustLine(game, team, pr.pid, 1)}` });
        if (makeRng(game.seed, "keptStory", pr.id)() < 0.4) later(game, { kind: "league", icon: "🤝", pid: pr.pid, head: variant(game, "kept", [`${up(boss)} KEEPS HIS WORD: ${up(p.name)} STARTS`, `${up(p.name)} FINALLY GETS ${up(his(p))} CHANCE`]), sub: `${boss} promised ${p.name} a start and, in a development football has not seen before, delivered. ${p.name} was "just happy to be involved", which is what they all say.`, tag: "confirmed", prio: 2, src: "athletic" });
        continue;
      }
      if (day >= pr.due) {
        if (p.susp > 0) { pr.status = "void"; if (th) closeThread(game, th, `${p.name} was suspended when the promise fell due, so it did not count.`); notes.push({ team, text: `Your promise to ${p.name} is void: ${he(p)} is suspended.` }); continue; }
        pr.status = "broken"; bump(game, team, "broken"); const pen = styleOf(game, team) === "showman" ? -3 : -2; moveTrust(game, team, pr.pid, pen);
        notes.push({ team, text: `You broke your promise to ${p.name}. ${trustLine(game, team, pr.pid, pen)}` });
        if (th) addHist(game, th, `${p.name} did not start by matchday ${pr.due + 1}: the promise was broken.`, { priv: true });
        later(game, { kind: "league", icon: "⏳", pid: pr.pid, thread: th, head: variant(game, "broken", [`${up(p.name)} STILL WAITING: ${up(boss)} BREAKS START PROMISE`, `"YOUR CHANCE WILL COME": IT DID NOT. ${up(p.name)} BENCHED AGAIN`, `PROMISE BROKEN: ${up(p.name)} LEFT OUT ONCE MORE`]), sub: `${boss} told ${p.name} ${pr.days} matchdays ago that a start was coming. It has not come. ${p.name}'s agent calls it "a lesson in how promises work".`, tag: "statement", prio: 5, src: "sun", showman: styleOf(game, team) === "showman" });
        continue;
      }
      if (!pr.warned && pr.due - day === 1 && day > pr.made && makeRng(game.seed, "warm", pr.id)() < 0.7) {
        pr.warned = true; const wk = day - pr.made + 1;
        later(game, { kind: "league", icon: "🔥", pid: pr.pid, thread: th, head: variant(game, "warm", [`MANAGER INSISTS "YOUR CHANCE WILL COME" AS ${up(p.name)} ENTERS WEEK ${wk} OF WARMING UP`, `${up(p.name)} WARMS UP FOR THE ${wk === 2 ? "SECOND" : "THIRD"} STRAIGHT WEEK. THE PROMISE REMAINS "UNDER REVIEW"`]), sub: `${boss} reportedly promised ${p.name} a start within ${pr.days} matchdays. One matchday remains, a source says. ${p.name} has stretched everything ${he(p)} owns.`, tag: "rumour", prio: 3, src: "sun" });
      }
    }
  }
  return notes;
}
// Players a manager has ordered out of this matchday's XI (the server removes them from his line-up).
export function benchOrders(game, team, day) {
  return new Set(mgrOf(game, team).benchOrders ? mgrOf(game, team).benchOrders.filter((o) => day >= o.day && day < o.day + o.games).map((o) => o.pid) : []);
}

// ---------- public comments: predictions, criticism, praise ----------
const LINES = {
  predict: { easy: ["Easy win", "This should be an easy three points."], cruise: ["Two or three goals", "I'd be disappointed if we didn't win by two or three."], respect: ["Respect, then victory", "We respect them. We'll still beat them."], bold: ["Write it down", "Write it down: we win, and we win well."] },
  jab: { negative: ["Negative football", "That was negative football. They came to defend, not to play."], longball: ["Long balls", "A lot of long balls and a lot of hope."], bus: ["Parked the bus", "They parked the bus. Then they parked a second one."], museum: ["Museum tactics", "Those tactics belong in a museum."] },
  praise: { coached: ["Well coached", "A very well-coached side. I mean it."], respect: ["Real respect", "I have enormous respect for what he's building."], fair: ["Fair play", "They beat us fair and square. Fair play to them."], bright: ["Brightest manager", "One of the brightest managers in this league."] },
};
export const commentLines = () => Object.fromEntries(Object.entries(LINES).map(([k, v]) => [k, Object.entries(v).map(([id, [label]]) => ({ id, label }))]));
export function commentState(game, team, day) {
  const K = game.P.social.comment, m = mgrOf(game, team), s = m.season;
  if (!socialOn(game)) return { can: false, why: "Social events are switched off." };
  if (s.comments >= K.perSeason) return { can: false, why: `You have used your ${K.perSeason} public comments this season.` };
  if (day - s.last < K.cooldown) return { can: false, why: `Wait ${K.cooldown - (day - s.last)} more matchday${K.cooldown - (day - s.last) === 1 ? "" : "s"} before the next comment.` };
  return { can: true, left: K.perSeason - s.comments };
}
// kind: predict (about the next opponent), jab (criticise another manager's tactics), praise. `matchDay` is the fixture a prediction is about.
export function makeComment(game, team, { kind, line, target, opp, matchDay }) {
  const K = game.P.social.comment, m = mgrOf(game, team), day = day0(game), st = commentState(game, team, day);
  if (!st.can) return { ok: false, why: st.why };
  const L = LINES[kind] && LINES[kind][line]; if (!L) return { ok: false, why: "Pick one of the lines." };
  const boss = bossName(game, team), me = teamName(game, team);
  if (kind === "predict") {
    if (opp == null || opp === team) return { ok: false, why: "You can only predict the result of your next match." };
    if (m.boasts.some((b) => b.opp === opp && b.season === game.season && b.day === matchDay)) return { ok: false, why: "You have already predicted this one." };
  } else {
    if (target == null || target === team || !game.teams[target] || !game.teams[target].human) return { ok: false, why: "Pick another manager." };
    if (kind === "jab" && m.season.targets.includes(target)) return { ok: false, why: "You have already had your say about that manager this season." };
  }
  m.season.comments++; m.season.last = day;
  const them = kind === "predict" ? teamName(game, opp) : teamName(game, target), ob = kind === "predict" ? null : bossName(game, target);
  const th = openThread(game, kind === "predict" ? "predict" : "comment", [`t${team}`, `t${kind === "predict" ? opp : target}`], `${boss} said: "${L[1]}"`);
  const showman = styleOf(game, team) === "showman";
  if (kind === "predict") {
    bump(game, team, "pred"); m.boasts.push({ opp, day: matchDay ?? day, season: game.season, line, thread: th.id, margin: line === "cruise" || line === "bold" ? 2 : 1, status: "open" });
    const story = deskStory(game, { thread: th.id, kind: "league", icon: "🎤", team, prio: 3, showman, tag: "statement", src: "athletic",
      head: variant(game, "predict", [`${up(boss)} PREDICTS: "${up(L[1].replace(/[."]/g, ""))}"`, `${up(boss)} CALLS IT: ${up(me)} TO BEAT ${up(them)}`, `${up(boss)} ON ${up(them)}: "${up(L[0])}"`]),
      sub: `Before the match with ${them}, ${boss} told reporters: "${L[1]}" The newspaper has written it down, put it in a drawer and will be taking it out again on Saturday.` });
    return { ok: true, story, msg: "The press has your prediction." };
  }
  if (kind === "praise") {
    bump(game, team, "praise"); stepRel(game, team, target, 1, "praise"); m.season.targets.push(target); const story = deskStory(game, { thread: th.id, kind: "league", icon: "🤝", team, prio: 2, showman, tag: "statement", src: "athletic", head: variant(game, "praise", [`${up(boss)} PRAISES ${up(ob)}: "${up(L[1].replace(/[."]/g, ""))}"`, `${up(boss)} TIPS HIS HAT TO ${up(ob)}`]), sub: `${boss} says of ${ob}'s ${them}: "${L[1]}" A rare thing in football: a compliment with no hidden knife. Probably.` });
    return { ok: true, story, notes: [{ team: target, text: `${boss} praised you in public: "${L[1]}"` }], msg: "Kind words noted." };
  }
  bump(game, team, "jab"); m.season.targets.push(target); stepRel(game, team, target, -1, "criticism");
  const story = deskStory(game, { thread: th.id, kind: "league", icon: "🗯️", team, prio: 4, showman, tag: "statement", src: "athletic",
    head: variant(game, "jab", [`${up(boss)} SLAMS ${up(ob)}'S TACTICS: "${up(L[0])}"`, `${up(boss)} TAKES AIM AT ${up(them)}`, `${up(boss)} ON ${up(them)}: "${up(L[1].replace(/[."]/g, ""))}"`]),
    sub: `"${L[1]}" said ${boss}. ${ob} is expected to reply, in public, in private or with a performance. ${them} have been asked to comment and have declined, loudly.` });
  const sit = mkSit(game, { kind: "comment", team: target, to: "mgr", thread: th.id, ctx: { from: team, quote: `"${L[1]}"`, line }, expireDays: 3 });
  return { ok: true, story, sit, notes: [{ team: target, text: `${boss} criticised your tactics in public. Answer it in your inbox.` }], msg: "Said. The other manager can answer." };
}

// ---------- after a match: callbacks that need the result ----------
// info = { day, results: [{ a, b, ga, gb, goals: [{ player, team }] }] }. Nothing here is called before full time.
export function afterMatch(game, info) {
  const S = ensureSoc(game), day = info.day, notes = [];
  const res = (t) => info.results.find((r) => r.a === t || r.b === t);
  const mine = (r, t) => (r.a === t ? [r.ga, r.gb] : [r.gb, r.ga]);
  for (const t of game.teams) {
    if (!t.human) continue;
    const m = mgrOf(game, t.id), r = res(t.id); if (!r) continue;
    const [gf, ga] = mine(r, t.id), boss = bossName(game, t.id), them = teamName(game, r.a === t.id ? r.b : r.a), score = `${gf}-${ga}`;
    for (const b of m.boasts) {
      if (b.status !== "open" || b.day !== day) continue;
      const opp = r.a === t.id ? r.b : r.a; if (opp !== b.opp) continue;
      const lost = gf < ga, drew = gf === ga, win = gf > ga; b.status = win ? "held" : "missed";
      if (win) { closeThread(game, b.thread, `${boss}'s prediction held: ${score}.`); if (gf - ga >= b.margin && makeRng(game.seed, "heldStory", b.thread)() < 0.5) later(game, { kind: "league", icon: "🎯", team: t.id, head: variant(game, "held", [`${up(boss)} CALLS IT RIGHT: ${up(teamName(game, t.id))} ${gf}-${ga} ${up(them)}`, `PREDICTION LANDS: ${up(boss)} "NEVER DOUBTED IT"`]), sub: `${boss} said it would be ${LINES.predict[b.line][1].toLowerCase()} It was. The newspaper has reluctantly taken the quote back out of the drawer and polished it.`, tag: "confirmed", prio: 3, src: "athletic", thread: b.thread }); continue; }
      bump(game, t.id, "predMiss");
      later(game, { kind: "league", icon: "🍽️", team: t.id, thread: b.thread, head: lost && ga - gf >= 2 ? variant(game, "eat", [`${up(boss)} EATS HIS WORDS: ${up(teamName(game, t.id))} ${gf}-${ga} ${up(them)}`, `"EASY WIN"? ${up(them)} ${ga}-${gf} ${up(teamName(game, t.id))} SAYS OTHERWISE`, `THE PREDICTION, THE DRAWER, AND NOW THE SCOREBOARD: ${gf}-${ga}`]) : variant(game, "eatSmall", [`${up(boss)}'S PREDICTION DOES NOT SURVIVE ${up(them)}`, `${up(them)} ${drew ? "HOLD" : "BEAT"} ${up(teamName(game, t.id))}: SO MUCH FOR "${up(LINES.predict[b.line][0])}"`]),
        sub: `${boss} said before the match: "${LINES.predict[b.line][1]}" The final score was ${score}. The newspaper has put the quote on the front page, next to the result, for comparison.`, tag: "confirmed", prio: lost && ga - gf >= 2 ? 5 : 3, src: "sun", showman: styleOf(game, t.id) === "showman" });
    }
    for (const th of S.threads) {   // a defended star: did the match make the manager look wise?
      if (th.kind !== "party" || th.status === "closed" || !th.meta || !th.meta.defend || th.meta.day !== day || th.meta.team !== t.id) continue;
      const p = game.players[th.meta.pid]; if (!p) continue;
      const scored = r.goals.some((g) => g.player === p.id), winner = r.goals.length && gf > ga;
      if (scored && gf >= ga) { closeThread(game, th.id, `${p.name} scored${gf > ga ? " the winner" : ""}: the defence was vindicated.`); later(game, { kind: "league", icon: "⚽", pid: p.id, head: variant(game, "vind", [`${up(p.name)} SCORES, ${up(boss)} SMILES: "WHAT DID I SAY?"`, `DEFENDED BY ${up(boss)}, ${up(p.name)} REPAYS ${up(his(p))} FAITH WITH A GOAL`]), sub: `${boss} stood up for ${p.name} after the night out. ${p.name} then scored in the ${score} against ${them}. ${boss} "never doubted it", in the way people say that when they very much doubted it.`, tag: "confirmed", prio: 4, src: "sun" }); }
      else if (gf < ga) { closeThread(game, th.id, `${p.name} did not deliver and ${teamName(game, t.id)} lost ${score}.`); later(game, { kind: "league", icon: "🤦", pid: p.id, head: variant(game, "regret", [`${up(boss)}'S DEFENCE OF ${up(p.name)} LOOKS SHAKY AFTER ${gf}-${ga}`, `NO GOAL, NO POINTS: ${up(p.name)} LETS ${up(boss)} DOWN`]), sub: `${boss} backed ${p.name} in public. ${teamName(game, t.id)} then lost ${score} to ${them}, and ${p.name} did not score. The paper is "just asking questions". Several.`, tag: "confirmed", prio: 4, src: "sun" }); }
      else closeThread(game, th.id, `The match ended ${score}: nothing more to say.`);
    }
  }
  // grudge matches: two managers who have fallen out meet, and the match settles it
  for (const r of info.results) {
    if (!game.teams[r.a].human || !game.teams[r.b].human) continue;
    const s = mrel(game, r.a, r.b); if (s >= 0) continue;
    const w = r.ga > r.gb ? r.a : r.gb > r.ga ? r.b : null, l = w == null ? null : w === r.a ? r.b : r.a;
    if (w == null) { later(game, { kind: "league", icon: "🤝", team: r.a, head: `${up(teamName(game, r.a))} ${r.ga}-${r.gb} ${up(teamName(game, r.b))}: THE GRUDGE MATCH ENDS SQUARE`, sub: `Nobody won and nobody backed down. ${bossName(game, r.a)} and ${bossName(game, r.b)} shook hands "firmly". The paper counted the fingers.`, tag: "confirmed", prio: 3, src: "athletic" }); continue; }
    stepRel(game, w, l, 1, "settled on the pitch");
    later(game, { kind: "league", icon: "🏁", team: w, head: variant(game, "grudge", [`${up(bossName(game, w))} GETS THE LAST WORD: ${up(teamName(game, w))} BEAT ${up(teamName(game, l))}`, `THE FEUD MEETS THE PITCH: ${up(teamName(game, w))} ${Math.max(r.ga, r.gb)}-${Math.min(r.ga, r.gb)} ${up(teamName(game, l))}`]), sub: `${bossName(game, w)} and ${bossName(game, l)} had traded words before this one. ${teamName(game, w)} did the talking where it counts. ${bossName(game, l)}, asked for comment, "needed a minute".`, tag: "confirmed", prio: 4, src: "athletic" });
  }
  flushLater(game);
  return notes;
}
// The week before a grudge match, the paper reminds everyone.
function meetingPreviews(game, ctx) {
  const S = ensureSoc(game); let n = 0;
  for (const f of ctx.fixtures || []) {
    const [a, b] = f; if (!game.teams[a].human || !game.teams[b].human) continue;
    const s = mrel(game, a, b), key = "meet" + [a, b].sort().join("-");
    if (s >= 0 || S.cool[key] === game.season) continue;
    S.cool[key] = game.season;
    const x = deskStory(game, { kind: "league", icon: "⚔️", team: a, prio: 3, tag: "confirmed", src: "athletic", head: variant(game, "meet", [`${up(teamName(game, a))} V ${up(teamName(game, b))}: THIS ONE IS PERSONAL`, `GRUDGE MATCH: ${up(bossName(game, a))} FACES ${up(bossName(game, b))}`]), sub: `${bossName(game, a)} and ${bossName(game, b)} have history in this league. Both say it is "just another game". Both are lying, but politely.` });
    if (x) n++;
  }
  return n;
}

// ---------- reputation ----------
export function reputation(game, team) {
  const c = mgrOf(game, team).cnt, w = [];
  if ((c.kept || 0) >= 2 && !(c.broken || 0)) w.push("Man of his word"); if ((c.broken || 0) >= 2) w.push("Promise-breaker");
  if ((c.fines || 0) >= 3) w.push("Disciplinarian"); if ((c.defend || 0) >= 2) w.push("Player's champion");
  if ((c.jab || 0) + (c.pred || 0) >= 3) w.push("Loudmouth"); if ((c.praise || 0) + (c.toast || 0) >= 3) w.push("Gentleman");
  if ((c.predMiss || 0) >= 2) w.push("Eats his words");
  return { words: w.slice(0, 3), counts: c };
}

// ---------- season end ----------
export function seasonEndSocial(game) {
  const S = ensureSoc(game);
  for (const s of S.inbox) if (s.status === "open") { s.status = "lapsed"; s.closed = 99; }
  for (const t of Object.keys(S.mgr)) { const m = S.mgr[t]; m.season = { comments: 0, last: -9, targets: [], preds: [] }; m.benchOrders = []; for (const pr of m.promises) if (pr.status === "open") { pr.status = "void"; if (pr.thread) closeThread(game, pr.thread, "The season ended before the promise fell due."); } m.promises = m.promises.filter((x) => x.status === "open"); m.boasts = m.boasts.filter((b) => b.status === "open" && b.season === game.season + 1); }
  for (const k of Object.keys(S.rel)) { const r = S.rel[k]; if (r.s < 0 && r.s > -2) r.s = 0; else if (r.s === -2) r.s = -1; }
  S.bench = {}; S.partyFlags = {}; S.after = [];
}
