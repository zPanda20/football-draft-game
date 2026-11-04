// The social layer's shared state: manager style, trust, manager-to-manager relations, story threads and the league news desk.
// Everything here is plain data in `game.soc`, so it is saved with the game and old saves simply start empty.
// Rules for the situations that use it live in situations.js, the footballers' market in market2.js, the gala in gala.js.
import { makeRng } from "./rng.js";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const STYLES = {
  direct: { name: "Straight talker", blurb: "Hard answers cost you less trust: a refusal or a fine lands one step softer." },
  diplomat: { name: "Diplomat", blurb: "Kind answers earn extra trust, and a toast or an apology at the gala is more likely to be accepted." },
  showman: { name: "Showman", blurb: "The press loves you: your public statements get printed first. A broken promise costs more." },
};
export const TEMPERS = ["calm", "proud", "loyal", "restless"];
export const TEMPER_TEXT = { calm: "Calm", proud: "Proud", loyal: "Loyal", restless: "Restless" };

export function ensureSoc(game) {
  if (!game.soc) game.soc = {};
  const S = game.soc;
  S.seq = S.seq || 0; S.mgr = S.mgr || {}; S.trust = S.trust || {}; S.rel = S.rel || {}; S.threads = S.threads || []; S.inbox = S.inbox || [];
  S.desk = S.desk || { key: "", ids: [] }; S.queue = S.queue || []; S.after = S.after || []; S.bench = S.bench || {}; S.seen = S.seen || {};
  S.lastSit = S.lastSit || {}; S.cool = S.cool || {}; S.used = S.used || {}; S.mem = S.mem || {}; S.galaDone = S.galaDone || {}; S.partyFlags = S.partyFlags || {}; S.excl = S.excl || {};
  return S;
}
export const nid = (game) => ++ensureSoc(game).seq;
export function mgrOf(game, team) {
  const S = ensureSoc(game);
  if (!S.mgr[team]) S.mgr[team] = { style: null, cnt: {}, season: { comments: 0, last: -9, targets: [], preds: [] }, promises: [], boasts: [] };
  const m = S.mgr[team]; m.cnt = m.cnt || {}; m.season = m.season || { comments: 0, last: -9, targets: [], preds: [] }; m.promises = m.promises || []; m.boasts = m.boasts || [];
  return m;
}
export const bump = (game, team, k, n = 1) => { const c = mgrOf(game, team).cnt; c[k] = (c[k] || 0) + n; return c[k]; };
export const styleOf = (game, team) => mgrOf(game, team).style;
export function setStyle(game, team, style) {
  if (style != null && !STYLES[style]) return false;
  mgrOf(game, team).style = style || null; return true;
}
// Who the newspapers call the manager: the owner's name when the room supplied one, otherwise the team.
export const bossName = (game, team) => (game.ownerName && game.ownerName(team)) || (game.teams[team] ? game.teams[team].name : "The manager");
export const teamName = (game, team) => (game.teams[team] ? game.teams[team].name : "the club");

// A squad player's temperament: fixed for the whole game, from the seed.
export const temper = (game, pid) => TEMPERS[Math.floor(makeRng(game.seed, "temper", pid)() * TEMPERS.length)];

// ---------- trust: one meter per player and manager ----------
export function trustOf(game, team, pid) { const t = ensureSoc(game).trust[pid]; return t && t.team === team ? t.v : 0; }
export function addTrust(game, team, pid, d) {
  const S = ensureSoc(game), K = game.P.social.trust; let t = S.trust[pid];
  if (!t || t.team !== team) t = S.trust[pid] = { team, v: 0 };
  t.v = clamp(t.v + d, K.min, K.max); return t.v;
}
export const trustWord = (v) => (v >= 1 ? "Trusting" : v === 0 ? "Neutral" : v === -1 ? "Wary" : "Bitter");

// How the manager's style bends a trust change. `soft` answers (reassure, explain, promise) and `hard` ones (dismiss, fine, bench, compete) differ.
export function styleAdj(style, kind, d) {
  if (style === "direct" && kind === "hard" && d < 0) return d + 1;
  if (style === "diplomat" && kind === "soft" && d >= 0) return d + 1;
  return d;
}

// ---------- manager to manager: a few states, not a meter ----------
export const REL_WORD = { 1: "Friendly", 0: "Neutral", "-1": "Sour", "-2": "Feud" };
export const relKey = (a, b) => (a < b ? a + "|" + b : b + "|" + a);
export function mrel(game, a, b) { const S = ensureSoc(game), r = S.rel[relKey(a, b)]; return r ? r.s : 0; }
export function setMrel(game, a, b, s, why) {
  const S = ensureSoc(game), k = relKey(a, b), r = S.rel[k] || (S.rel[k] = { s: 0, hist: [] });
  r.s = clamp(s, -2, 1); r.hist.push({ s: r.s, season: game.season, day: game.weekDay ?? 0, why: why || "" }); if (r.hist.length > 6) r.hist.shift();
  return r.s;
}
export const stepRel = (game, a, b, d, why) => setMrel(game, a, b, mrel(game, a, b) + d, why);

// ---------- threads: the shared history of a connected story ----------
// A thread belongs to the people in `who` (pids as numbers, teams as "t3"). Entries are public unless they carry `priv`: only those
// people see a private entry in their archive, and none of it is printed until a reveal, a witness or a leak turns it into news.
export function openThread(game, kind, who, text, opts = {}) {
  const S = ensureSoc(game), th = { id: nid(game), kind, who: who.slice(), season: game.season, day: game.weekDay ?? 0, status: "open", hist: [], ...(opts.meta ? { meta: opts.meta } : {}) };
  S.threads.push(th); if (S.threads.length > game.P.social.threads.keep) S.threads.shift();
  if (text) addHist(game, th.id, text, opts);
  return th;
}
export const threadOf = (game, id) => ensureSoc(game).threads.find((t) => t.id === id) || null;
export function addHist(game, id, text, opts = {}) {
  const th = threadOf(game, id); if (!th) return null;
  th.hist.push({ season: game.season, day: game.weekDay ?? 0, text, ...(opts.priv ? { priv: true } : {}), ...(opts.tag ? { tag: opts.tag } : {}) });
  if (th.hist.length > game.P.social.threads.hist) th.hist.shift();
  return th;
}
export const closeThread = (game, id, text) => { const th = threadOf(game, id); if (!th) return; if (text) addHist(game, id, text); th.status = "closed"; };
// Recent threads a viewer may read: public lines for everybody, private ones for the people involved.
export function archiveFor(game, { team = null, pid = null } = {}, n = 12) {
  const S = ensureSoc(game), mine = (th) => th.who.some((w) => (typeof w === "string" ? w === "t" + team : w === pid));
  return S.threads.slice(-n * 2).reverse().map((th) => {
    const lines = th.hist.filter((h) => !h.priv || mine(th)).map((h) => ({ season: h.season, day: h.day, text: h.text, tag: h.tag || null, priv: !!h.priv }));
    return { id: th.id, kind: th.kind, status: th.status, lines };
  }).filter((t) => t.lines.length).slice(0, n);
}

// ---------- the league desk: its own weekly slot, so scandals and league stories do not overwrite each other ----------
const deskKey = (game) => game.season + ":" + (game.weekDay ?? 0);
const deskSlot = (game) => { const S = ensureSoc(game), k = deskKey(game); if (S.desk.key !== k) S.desk = { key: k, ids: [] }; return S.desk; };
// Pick a variant that was not used recently for this kind of story.
export function variant(game, kind, arr, ...salt) {
  const S = ensureSoc(game), used = S.used[kind] || (S.used[kind] = []), r = makeRng(game.seed, "var", kind, game.season, game.weekDay ?? 0, ...salt);
  let i = Math.floor(r() * arr.length), tries = 0;
  while (used.includes(i) && tries++ < arr.length) i = (i + 1) % arr.length;
  used.push(i); if (used.length > Math.min(5, arr.length - 1)) used.shift();
  return arr[i];
}
function emit(game, s) {
  game.newsSeq = (game.newsSeq || 0) + 1; game.pubSeq = game.pubSeq || 0;
  const p = s.pid != null ? game.players[s.pid] : null, t = s.team != null ? game.teams[s.team] : p && p.team != null ? game.teams[p.team] : null;
  const n = { id: game.newsSeq, season: game.season, day: s.day ?? game.weekDay ?? (game.md ? game.md.day : 0), kind: s.kind || "league", icon: s.icon || "📰", pid: p ? p.id : null, name: p ? p.name : s.name || null, team: t ? t.id : null, clubName: t ? t.name : "",
    src: s.src || "athletic", head: s.head, sub: s.sub, status: "live", approver: null, prio: s.prio ?? 2, abs: true, fx: null, flag: null, gflag: null, tag: s.tag || "confirmed", thread: s.thread || null };
  n.pub = ++game.pubSeq;
  (game.news = game.news || []).push(n); if (game.news.length > 60) game.news.shift();
  if (s.thread) addHist(game, s.thread, s.head, { tag: n.tag });
  return n;
}
// Print a league story, or hold it for next week. Nothing is silently overwritten: a story that does not fit joins a short queue
// (highest priority first, a few weeks at most) and the lowest one leaves quietly when the queue is full.
export function deskStory(game, s) {
  const S = ensureSoc(game), K = game.P.social.desk, slot = deskSlot(game), st = s.thread ? threadOf(game, s.thread) : null;
  if (st && st.status === "closed" && !s.force) return null;
  const sh = (s.showman ? 1 : 0); s = { ...s, prio: (s.prio ?? 2) + sh };
  if (s.force || slot.ids.length < K.perWeek) { const n = emit(game, s); slot.ids.push(n.id); return n; }
  S.queue.push({ ...s, born: S.queueWeek || 0 });
  S.queue.sort((a, b) => b.prio - a.prio); while (S.queue.length > K.queue) S.queue.pop();
  return null;
}
// A new week opens the slot again: the best story still waiting goes out (a thread that ended in the meantime drops its story).
export function drainDesk(game, week) {
  const S = ensureSoc(game), K = game.P.social.desk; S.queueWeek = week;
  S.queue = S.queue.filter((q) => week - (q.born || 0) <= K.queueLife);
  const slot = deskSlot(game);
  while (slot.ids.length < K.perWeek && S.queue.length) {
    const q = S.queue.shift(), th = q.thread ? threadOf(game, q.thread) : null;
    if (th && th.status === "closed") continue;
    if (q.pid != null && game.players[q.pid] && game.players[q.pid].retired) continue;
    slot.ids.push(emit(game, q).id);
  }
}
// Stories that must wait until a match is over (results are never leaked early): queued during the matchday, printed at full time.
export function later(game, s) { ensureSoc(game).after.push(s); }
export function flushLater(game) {
  const S = ensureSoc(game), list = S.after; S.after = [];
  for (const s of list) deskStory(game, s);
  return list.length;
}

// ---------- relationship memory: exes, turned-down invitations, rival suitors, gifts, affairs that came out ----------
export function memOf(game, pid) {
  const S = ensureSoc(game), m = S.mem[pid] || (S.mem[pid] = {});
  for (const k of ["ex", "rej", "rival", "gift", "affair"]) m[k] = m[k] || [];
  return m;
}
export function remember(game, pid, kind, entry) {
  if (pid == null) return null;
  const m = memOf(game, pid), list = m[kind]; if (!list) return null;
  list.push({ season: game.season, day: game.weekDay ?? 0, ...entry });
  const cap = game.P.social.invite.memory; if (list.length > cap) list.splice(0, list.length - cap);
  return entry;
}
export const hasMem = (game, pid, kind, pred) => memOf(game, pid)[kind].some(pred);
// A person's fondness for a footballer, from gifts: small, capped, and it fades a point a week.
export function fondOf(game, p, id) {
  const f = p.life && p.life.fav && p.life.fav[id]; if (!f) return 0;
  const wk = game.rom ? game.rom.week : 0; return Math.max(0, f.v - Math.max(0, wk - f.week));
}
export function addFond(game, p, id, d) {
  const L = p.life, wk = game.rom ? game.rom.week : 0; L.fav = L.fav || {};
  L.fav[id] = { v: Math.min(game.P.social.gift.cap ?? 30, fondOf(game, p, id) + d), week: wk };
}
