// One game room: lobby, pack draft, pre-season market, season. The server is the referee; browsers only send choices.
import { makeRng, shuffle } from "../engine/rng.js";
import { createGame, restoreGame, serializeGame, rosterOf, autoFill, beginMatch, finishMatch, halftimeRecs, payIncome } from "../engine/game.js";
import { dealRound, applyPicks } from "../engine/packs.js";
import { resolveMarketRound, buyItem, marketValue, feeFor, catchUpWeights } from "../engine/market.js";
import { botDraftPick, botMarketBid, botItemBuys } from "../engine/bots.js";
import { teamsFor, schedule, standingsOf } from "../engine/fixtures.js";
import { bestLineup, chooseForFormation, FORMATION_NAMES, FORMATIONS } from "../engine/roster.js";
import { sanitizeLineup } from "../engine/match.js";
import { expiring, availableRookies } from "../engine/offseason.js";
import { offseasonMethods } from "./offseason.js";

export const PACES = [1.4, 1, 0.7, 0.5]; // seconds-multiplier per speed level: Relaxed, Normal, Fast, Turbo
const DEFAULTS = { minTeams: 10, pace: 1, draftSec: 30, marketSec: 30, lineupSec: 20, halfSec: 15, seasons: 4, resignSec: 40, rookieSec: 25, tradeSec: 120 };
const KEEP_FEED = 40;
const IDLE_MS = 6000;   // how long the room waits for idle players once nobody else is left to act
const MARKET_ROUNDS = 8;
const HALF_MS = 26000;  // playback length of one half on every screen

export class Room {
  constructor({ code, D, hostToken, onChange, onSave }) {
    this.code = code; this.D = D; this.clubBySlug = new Map(D.clubs.map((c) => [c.slug, c]));
    this.hostToken = hostToken; this.onChange = onChange; this.onSave = onSave || (() => {});
    this.created = Date.now();
    this.players = new Map();          // token -> person
    this.settings = { ...DEFAULTS };
    this.phase = "lobby"; this.step = "lobby";
    this.game = null; this.paused = false;
    this.deadline = null; this.timer = null; this.remaining = null; this.pending = null; this.dur = null;
    this.reveal = null; this.revealSeq = 0; this.feed = []; this.chat = [];
    this.picks = new Map(); this.bids = new Map(); this.ready = new Set();
    this.mdIdx = -1; this.results = []; this.shownTable = null; this.live = null;
    this.baseOf = new Map([...D.players, ...(D.rookies || []).flatMap((c) => c.players)].map((p) => [p.id, p]));
  }

  // ---------- timing ----------
  after(ms, fn) { this.afterRaw(ms / (+process.env.TEST_SPEED || 1), fn); }
  afterRaw(ms, fn) {
    this.clearTimer(); this.shortened = null;
    this.pending = fn; this.remaining = ms; this.dur = ms;
    if (this.paused) { this.deadline = null; return; }
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => this.fire(), ms);
  }
  fire() { const fn = this.pending; this.clearTimer(); if (fn) fn(); }
  clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; this.pending = null; this.deadline = null; }
  skip() { if (this.pending) { this.skipping = true; this.fire(); this.skipping = false; } }
  // After a server restart a restored room waits for someone to connect, then carries on from its checkpoint.
  kick() {
    if (!this.restored) return; this.restored = false;
    if (this.step === "market.done") this.after(15000, () => this.beginSeason());
    else if (this.step === "season.end" && !this.final) this.after(60000, () => this.startOffseason());
    this.changed();
  }
  pause() { if (this.paused) return; this.paused = true; if (this.timer) { clearTimeout(this.timer); this.timer = null; this.remaining = Math.max(0, this.deadline - Date.now()); this.deadline = null; } this.changed(); }
  resume() {
    if (!this.paused) return; this.paused = false;
    if (this.pending) { this.deadline = Date.now() + this.remaining; this.timer = setTimeout(() => this.fire(), this.remaining); }
    this.changed();
  }
  changed() { this.settle(); this.onChange(this); }
  p(ms) { return ms * this.settings.pace; }

  // ---------- idle players ----------
  // A manager who lets three choice windows run out without touching anything goes idle. The room stops waiting for
  // them: when only idle managers are left to act, the running timer is cut short. Any click brings them back.
  humanFor(id) { const p = this.playerOfTeam(id); return p && p.connected ? p : null; }
  waitingOn() {
    if (!this.game || this.paused) return [];
    const out = [], add = (p) => { if (p) out.push(p); };
    for (const t of this.humanTeams()) {
      const p = this.humanFor(t.id); if (!p) continue;
      switch (this.step) {
        case "draft.pick": { const h = this.picks.get(t.id); if (!(h && h.locked)) add(p); break; }
        case "market.bid": { const b = this.bids.get(t.id); if (!t.marketDone && !(b && b.locked)) add(p); break; }
        case "md.lineup": case "md.half": if (!this.ready.has(t.id) && !p.auto) add(p); break;
        case "off.resign": if (expiring(this.game, t.id).length && !this.ready.has(t.id)) add(p); break;
        case "off.trade": if (!this.ready.has(t.id)) add(p); break;
        case "off.rookie.turn": if (this.worstFirst[this.rIdx] === t.id && !p.auto) add(p); break;
      }
    }
    return out;
  }
  openWindow() { for (const p of this.players.values()) p.acted = false; this.skipping = false; }
  closeWindow() {
    if (this.skipping) return;
    for (const p of this.waitingOn()) if (!p.acted) { p.missed = (p.missed || 0) + 1; if (p.missed >= 3) p.idle = true; }
  }
  touch(p) { p.acted = true; p.missed = 0; }
  wake(p) {
    if (!p || !p.idle) return;
    p.idle = false; p.missed = 0;
    if (this.shortened) { const s = this.shortened; this.afterRaw(Math.max(s.left, 8000 / (+process.env.TEST_SPEED || 1)), s.fn); }
  }
  shorten(ms) {
    if (!this.pending || this.paused || this.shortened || !this.deadline) return;
    ms = ms / (+process.env.TEST_SPEED || 1);
    const left = this.deadline - Date.now(); if (left <= ms) return;
    const fn = this.pending; this.afterRaw(ms, fn); this.shortened = { fn, left };
  }
  settle() { if (this.shortened || !this.pending || this.paused) return; const w = this.waitingOn(); if (w.length && w.every((p) => p.idle)) this.shorten(IDLE_MS); }

  // ---------- people ----------
  humanTeams() { return this.game ? this.game.teams.filter((t) => t.human) : []; }
  playerOfTeam(id) { for (const p of this.players.values()) if (p.teamId === id) return p; return null; }
  isHost(token) { return token === this.hostToken; }

  addPlayer(token, name) {
    let p = this.players.get(token);
    if (p) { p.connected = true; if (name && this.phase === "lobby") p.name = name; return p; }
    if (this.phase !== "lobby") return null;
    if (this.players.size >= 30) return null;
    p = { token, name: String(name || "Manager").slice(0, 24), teamName: "", club: null, teamId: null, connected: true, auto: false };
    this.players.set(token, p);
    return p;
  }
  setClub(token, slug) {
    const p = this.players.get(token); if (!p || this.phase !== "lobby") return;
    if (!this.clubBySlug.has(slug)) return;
    for (const q of this.players.values()) if (q !== p && q.club === slug) return;
    p.club = slug;
    if (!p.teamName || this.D.clubs.some((c) => c.name === p.teamName)) p.teamName = this.clubBySlug.get(slug).name;
  }
  setTeamName(token, name) {
    const p = this.players.get(token); if (!p) return;
    name = String(name || "").trim().slice(0, 28); if (!name) return;
    p.teamName = name;
    if (this.game && p.teamId != null) this.game.teams[p.teamId].name = name;
  }
  setSettings(token, s) {
    if (!this.isHost(token) || this.phase !== "lobby") return;
    const num = (k, lo, hi) => { if (s[k] != null && isFinite(+s[k])) this.settings[k] = Math.max(lo, Math.min(hi, +s[k])); };
    if (s.pace != null) this.settings.pace = this.nearestPace(+s.pace);
    num("minTeams", 10, 30); num("draftSec", 10, 120); num("marketSec", 10, 120); num("lineupSec", 8, 90); num("halfSec", 8, 60); num("resignSec", 10, 120); num("rookieSec", 10, 90); num("tradeSec", 30, 600);
    if (s.seasons != null) this.settings.seasons = Math.max(1, Math.min(this.D.rookies.length + 1, Math.round(+s.seasons) || 4));
  }
  nearestPace(v) { return PACES.reduce((b, x) => (Math.abs(x - v) < Math.abs(b - v) ? x : b), PACES[1]); }
  setPace(token, v) {
    if (!this.isHost(token) || !isFinite(+v)) return;
    this.applyPace(this.nearestPace(+v), "The host set the speed");
  }
  applyPace(pace, who) {
    if (pace === this.settings.pace) return;
    this.settings.pace = pace; this.speedVotes = new Map();
    const names = { 1.4: "Relaxed", 1: "Normal", 0.7: "Fast", 0.5: "Turbo" };
    this.paceNote = { id: (this.paceNote ? this.paceNote.id : 0) + 1, text: `${who}: speed is now ${names[pace]}` };
    this.changed();
  }
  voteSpeed(token, dir) {
    const p = this.players.get(token); if (!p || p.teamId == null || this.phase === "lobby") return;
    if (dir !== "up" && dir !== "down") return;
    if (!this.speedVotes) this.speedVotes = new Map();
    if (this.speedVotes.get(token) === dir) this.speedVotes.delete(token); else this.speedVotes.set(token, dir);
    const humans = [...this.players.values()].filter((q) => q.teamId != null && q.connected);
    const need = Math.floor(humans.length / 2) + 1, tally = { up: 0, down: 0 };
    for (const [tk, d] of this.speedVotes) { const q = this.players.get(tk); if (q && q.connected) tally[d]++; }
    const i = PACES.indexOf(this.settings.pace);
    if (tally.up >= need && i < PACES.length - 1) return this.applyPace(PACES[i + 1], "The room voted");
    if (tally.down >= need && i > 0) return this.applyPace(PACES[i - 1], "The room voted");
    this.changed();
  }
  addChat(token, text) {
    const p = this.players.get(token); text = String(text || "").trim().slice(0, 160); if (!p || !text) return;
    this.chat.push({ t: Date.now(), name: p.name, team: p.teamId, text });
    if (this.chat.length > 60) this.chat.shift();
  }
  setAuto(token, on) { const p = this.players.get(token); if (!p) return; p.auto = !!on; this.changed(); if (p.auto && p.teamId != null) this.markReady(p.teamId, true); }

  // ---------- start ----------
  start(token, seed = Math.floor(Math.random() * 1e9)) {
    if (!this.isHost(token) || this.phase !== "lobby" || !this.players.size) return;
    const humans = [...this.players.values()];
    const N = teamsFor(Math.max(this.settings.minTeams, humans.length));
    const rr = makeRng(seed, "room");
    const game = createGame({ D: this.D, N, seed });
    const used = new Set(humans.map((h) => h.club).filter(Boolean));
    const free = shuffle(this.D.clubs.map((c) => c.slug).filter((s) => !used.has(s)), rr);
    const slots = shuffle([...Array(N).keys()], rr);
    humans.forEach((p, i) => {
      const t = game.teams[slots[i]]; t.human = true; t.bot = "balanced"; p.teamId = t.id;
      if (!p.club) p.club = free.shift();
      t.club = p.club; t.name = p.teamName || this.clubBySlug.get(p.club).name;
    });
    for (const t of game.teams) if (!t.human) { t.club = free.shift(); t.name = this.clubBySlug.get(t.club).name; }
    this.game = game; this.seed = seed;
    this.startDraft();
  }

  // ---------- pack draft ----------
  startDraft() {
    this.phase = "draft"; this.draftRound = 0;
    this.step = "draft.intro";
    this.after(5000, () => this.nextDraftRound());
    this.changed();
  }
  nextDraftRound() {
    const g = this.game;
    this.draftRound++; g.round = this.draftRound;
    this.hands = dealRound(g, this.draftRound, g.P);
    this.picks = new Map();
    this.step = "draft.pick"; this.openWindow();
    const sec = this.draftRound === 1 ? 1.5 * this.settings.draftSec : this.settings.draftSec;
    this.after(sec * 1000, () => this.resolveDraft());
    this.changed();
  }
  pickCard(token, idx) {
    const p = this.players.get(token); if (!p || this.step !== "draft.pick" || p.teamId == null) return;
    const cur = this.picks.get(p.teamId); if (cur && cur.locked) return;
    if (!(idx >= 0 && idx < this.hands[p.teamId].length)) return;
    this.picks.set(p.teamId, { idx: idx | 0, locked: false });
    this.changed();
  }
  lockCard(token, on = true) {
    const p = this.players.get(token); if (!p || this.step !== "draft.pick" || p.teamId == null) return;
    const h = this.picks.get(p.teamId); if (!h) return;
    h.locked = on; this.changed();
    if (on && this.allLocked()) this.after(1200, () => this.resolveDraft());
  }
  allLocked() {
    for (const t of this.humanTeams()) {
      const p = this.playerOfTeam(t.id); if (!p || !p.connected) continue;
      const h = this.picks.get(t.id); if (!h || !h.locked) return false;
    }
    return true;
  }
  resolveDraft() {
    this.closeWindow();
    const g = this.game, P = g.P;
    const choose = g.teams.map((t) => { const h = t.human ? this.picks.get(t.id) : null; return h ? h.idx : botDraftPick(g, t.id, this.hands[t.id], P, this.draftRound); });
    const hands = this.hands;
    const got = applyPicks(g, hands, choose, P);
    this.setReveal({ kind: "draft", round: this.draftRound, picks: got.map((c, ti) => ({ team: ti, card: c, idx: choose[ti] })) });
    for (const [ti, c] of got.entries()) if (c) this.pushFeed({ kind: "draft", team: ti, card: c, round: this.draftRound });
    this.step = "draft.reveal";
    const last = this.draftRound >= g.P.packs.rounds;
    this.after(this.p(last ? 9000 : 7500), () => (last ? this.startMarket() : this.nextDraftRound()));
    this.changed();
  }

  // ---------- pre-season market (market-value lottery) ----------
  startMarket(kind = "pre") {
    const g = this.game;
    this.marketKind = kind;
    g.round = 0; this.phase = kind === "pre" ? "market" : "offseason"; this.marketRound = -1; this.quiet = 0;
    for (const t of g.teams) t.marketDone = false;
    this.nextMarketRound();
  }
  nextMarketRound() {
    const g = this.game;
    this.marketRound++;
    const anyHuman = this.humanTeams().some((t) => !t.marketDone && this.humanFor(t.id));
    // bots bid now (they see the pool as it is); humans bid during the window
    this.botBids = [];
    g.teams.forEach((t, ti) => { if (t.human) return; const b = botMarketBid(g, ti, g.P, this.marketRound); if (b) this.botBids.push(b); });
    if (!anyHuman && !this.botBids.length) return this.finishMarket();
    if (this.marketRound >= MARKET_ROUNDS) return this.finishMarket();
    this.bids = new Map();
    this.step = "market.bid"; this.openWindow();
    this.after(anyHuman ? this.settings.marketSec * 1000 : this.p(2500), () => this.resolveMarket());
    this.changed();
  }
  // bid = { kind: "p"|"i", id, len, extra }
  placeBid(token, b, lock) {
    const p = this.players.get(token); if (!p || this.step !== "market.bid" || p.teamId == null) return;
    const t = this.game.teams[p.teamId]; if (t.marketDone) return;
    const cur = this.bids.get(t.id); if (cur && cur.locked) return;
    const kind = b && b.kind === "i" ? "i" : "p";
    const target = kind === "p" ? this.game.players[b.id] : this.game.items.find((i) => i.id === b.id);
    if (!target) return;
    if (kind === "p" && !this.game.pool.includes(target.id)) return;
    this.bids.set(t.id, { kind, id: b.id, len: Math.max(1, Math.min(3, b.len | 0 || 1)), extra: Math.max(0, b.extra | 0), locked: !!lock });
    this.changed();
    if (lock && this.allBidsIn()) this.after(1200, () => this.resolveMarket());
  }
  lockBid(token) {
    const p = this.players.get(token); if (!p || this.step !== "market.bid" || p.teamId == null) return;
    const h = this.bids.get(p.teamId); if (!h) return; h.locked = true; this.changed();
    if (this.allBidsIn()) this.after(1200, () => this.resolveMarket());
  }
  unlockBid(token) { const p = this.players.get(token); const h = p && this.bids.get(p.teamId); if (h && this.step === "market.bid") { h.locked = false; this.changed(); } }
  // "I'm done shopping": sit out the rest of the market.
  marketPass(token) {
    const p = this.players.get(token); if (!p || p.teamId == null || this.phase !== "market") return;
    this.game.teams[p.teamId].marketDone = true; this.bids.delete(p.teamId); this.changed();
    if (this.step === "market.bid" && this.allBidsIn()) this.after(1200, () => this.resolveMarket());
  }
  allBidsIn() {
    for (const t of this.humanTeams()) {
      const p = this.playerOfTeam(t.id); if (!p || !p.connected || t.marketDone) continue;
      const h = this.bids.get(t.id); if (!h || !h.locked) return false;
    }
    return true;
  }
  buy(token, itemId) {
    const p = this.players.get(token); if (!p || p.teamId == null || this.step !== "market.bid") return;
    if (buyItem(this.game, p.teamId, itemId)) this.changed();
  }
  resolveMarket() {
    this.closeWindow();
    const g = this.game, bids = [...this.botBids];
    for (const [ti, b] of this.bids) { const t = g.teams[ti]; if (b.locked || (b.id != null && this.playerOfTeam(ti)?.connected)) bids.push({ team: ti, ...b }); }
    const humanBid = [...this.bids.keys()].length > 0;
    this.quiet = humanBid ? 0 : (this.quiet || 0) + 1;
    const wins = resolveMarketRound(g, bids, g.P, "live" + this.marketRound);
    const tally = bids.reduce((m, b) => { const k = b.kind + ":" + b.id; m[k] = (m[k] || 0) + 1; return m; }, {});
    this.setReveal({ kind: "market", round: this.marketRound, wins: wins.map((w) => ({ team: w.team, kind: w.kind, id: w.id, paid: w.paid, len: w.len, contested: w.contested, lost: w.lost })), bidders: bids.map((b) => ({ team: b.team, kind: b.kind, id: b.id })), tally });
    for (const w of wins) this.pushFeed({ kind: "market", team: w.team, what: w.kind, id: w.id, paid: w.paid, len: w.len });
    this.step = "market.reveal";
    const stop = !wins.length && (this.quiet >= 2 || !this.humanTeams().some((t) => !t.marketDone));
    this.after(this.p(wins.length ? 6000 : 2500), () => (stop ? this.finishMarket() : this.nextMarketRound()));
    this.changed();
  }
  finishMarket() {
    const g = this.game;
    g.teams.forEach((t, ti) => { if (!t.human) for (const id of botItemBuys(g, ti, g.P)) buyItem(g, ti, id); });
    autoFill(g);
    if (this.marketKind === "fa") { g.season += 1; for (const t of g.teams) { t.marketDone = false; t.filled = 0; } }
    this.step = "market.done";
    this.setReveal({ kind: "squads", fa: this.marketKind === "fa" });
    this.save("preseason");
    this.after(this.p(14000), () => this.beginSeason());
    this.changed();
  }

  // ---------- season ----------
  beginSeason() {
    const g = this.game;
    this.phase = "season"; this.mdIdx = -1; this.results = []; this.days = schedule(g.teams.length, g.seed + g.season);
    this.shownTable = standingsOf([], g.teams.length);
    for (const t of g.teams) { t.lineup = null; t.htLineup = null; t.active = undefined; }
    this.step = "season.intro";
    this.setReveal({ kind: "intro", season: g.season, days: this.days.length });
    this.after(this.p(8000), () => this.nextMatchday());
    this.changed();
  }
  nextMatchday() {
    const g = this.game;
    this.mdIdx++;
    if (this.mdIdx >= this.days.length) return this.endSeason();
    this.ready = new Set(); this.live = null;
    for (const t of g.teams) t.htLineup = null;
    this.step = "md.lineup"; this.openWindow();
    for (const p of this.players.values()) if (p.auto && p.teamId != null) this.ready.add(p.teamId);
    const anyone = this.humanTeams().some((t) => this.humanFor(t.id));
    this.after(anyone ? this.settings.lineupSec * 1000 : this.p(2500), () => this.firstHalf());
    this.changed();
  }
  // Lineup for a team: a human's saved choice (unless on auto), otherwise the CPU's best.
  lineupHook(team, recs) {
    if (team.human && team.lineup && !this.playerOfTeam(team.id)?.auto) return sanitizeLineup(team.lineup, recs, this.game.P);
    return null;
  }
  setLineup(token, l) {
    const p = this.players.get(token); if (!p || p.teamId == null) return;
    if (!l || !FORMATIONS[l.formation]) return;
    const t = this.game.teams[p.teamId], recs = rosterOf(this.game, t);
    if (this.step === "md.lineup") t.lineup = sanitizeLineup(l, recs, this.game.P);
    else if (this.step === "md.half") t.htLineup = sanitizeLineup(l, recs, this.game.P);
    else return;
    this.changed();
  }
  // "Best XI" or a new formation: the engine picks the best players for it (using half-time stamina in the break).
  lineupAuto(token, formation) {
    const p = this.players.get(token); if (!p || p.teamId == null) return;
    const g = this.game, t = g.teams[p.teamId];
    let recs;
    if (this.step === "md.lineup") recs = rosterOf(g, t);
    else if (this.step === "md.half" && this.live) { const m = this.live.find((x) => x.a === t.id || x.b === t.id); if (!m) return; recs = halftimeRecs(m, m.a === t.id ? 0 : 1); }
    else return;
    const l = formation && FORMATIONS[formation] ? chooseForFormation(recs, formation, g.P) : bestLineup(recs, g.P);
    const clean = { formation: l.formation, gk: l.gk, out: l.out, bench: l.bench };
    if (this.step === "md.lineup") t.lineup = clean; else t.htLineup = clean;
    this.changed();
  }
  setActiveItems(token, ids) {
    const p = this.players.get(token); if (!p || p.teamId == null || this.step !== "md.lineup") return;
    const t = this.game.teams[p.teamId];
    t.active = (Array.isArray(ids) ? ids : []).filter((id) => t.items[id] > 0).slice(0, this.game.P.items.activeCap);
    this.changed();
  }
  markReady(teamId, on = true) {
    if (on) this.ready.add(teamId); else this.ready.delete(teamId);
    const next = { "md.lineup": () => this.firstHalf(), "md.half": () => this.secondHalf(), "off.resign": () => this.finishResign(), "off.trade": () => this.endTrade() }[this.step];
    if (on && next) {
      const open = this.humanTeams().some((t) => this.humanFor(t.id) && !this.ready.has(t.id) && !this.playerOfTeam(t.id)?.auto && (this.step !== "off.resign" || expiring(this.game, t.id).length));
      if (!open) { const st0 = this.step; this.after(900, () => { if (this.step === st0) next(); }); }
    }
    this.changed();
  }
  setReady(token, on = true) { const p = this.players.get(token); if (!p || p.teamId == null) return; this.markReady(p.teamId, on); }

  firstHalf() {
    this.closeWindow();
    const g = this.game, day = this.days[this.mdIdx];
    const hooks = { lineup: (t, recs) => this.lineupHook(t, recs) };
    this.live = day.map(([a, b], k) => beginMatch(g, a, b, `${this.mdIdx}-${a}-${b}`, hooks));
    this.ready = new Set(); this.openWindow();
    this.setReveal({ kind: "half1", day: this.mdIdx, matches: this.live.map((m) => ({ a: m.a, b: m.b, lineups: m.lineups.map((l) => ({ formation: l.formation, gk: l.gk, out: l.out })), score: m.ht.score, events: m.ht.events })) });
    this.step = "md.half1";
    this.after(this.p(HALF_MS), () => this.halftime());
    this.changed();
  }
  halftime() {
    this.step = "md.half"; this.openWindow(); this.ready = new Set();
    for (const p of this.players.values()) if (p.auto && p.teamId != null) this.ready.add(p.teamId);
    const anyone = this.humanTeams().some((t) => this.humanFor(t.id));
    this.after(anyone ? this.settings.halfSec * 1000 : this.p(1500), () => this.secondHalf());
    this.changed();
  }
  secondHalf() {
    this.closeWindow();
    const g = this.game, day = this.mdIdx, matches = [];
    for (const m of this.live) {
      const changes = [0, 1].map((i) => {
        const t = m.sides[i], p = this.playerOfTeam(t.id);
        if (!t.human || (p && p.auto)) return null;               // CPU (or a manager on auto) re-picks with half-time stamina
        return t.htLineup || m.lineups[i];                         // a manager who does nothing keeps the first-half lineup
      });
      const res = finishMatch(g, m, changes);
      this.results.push({ day, a: m.a, b: m.b, ga: res.score[0], gb: res.score[1] });
      matches.push({ a: m.a, b: m.b, score: res.score, shots: res.shots, scorers: res.scorers, events: res.events.filter((e) => e.half === 1), lineups: res.lineups.map((l) => ({ formation: l.formation, gk: l.gk, out: l.out })) });
    }
    this.pendingTable = standingsOf(this.results, g.teams.length);
    payIncome(g, this.pendingTable);
    this.setReveal({ kind: "half2", day, matches });
    this.step = "md.half2";
    this.after(this.p(HALF_MS), () => this.showResult());
    this.changed();
  }
  showResult() {
    this.shownTable = this.pendingTable;
    this.step = "md.result";
    this.after(this.p(6000), () => this.nextMatchday());
    this.changed();
  }
  endSeason() {
    const g = this.game, table = standingsOf(this.results, g.teams.length);
    this.step = "season.end"; this.phase = "season";
    g.history = g.history || []; g.history.push({ season: g.season, champion: table[0].i, pts: table[0].pts, table: table.slice(0, 3).map((r) => r.i) });
    this.final = g.season >= this.settings.seasons;
    this.setReveal({ kind: "season", season: g.season, champion: table[0].i, table, final: this.final });
    this.save("seasonEnd");
    if (!this.final) this.after(120000, () => this.startOffseason());
    this.changed();
  }
  continueGame(token) {
    if (!this.isHost(token)) return;
    if (this.step === "season.end" && !this.final) this.startOffseason(); else this.skip();
  }

  // ---------- reveals, feed, persistence ----------
  setReveal(r) { this.revealSeq++; this.reveal = { seq: this.revealSeq, ...r }; }
  pushFeed(e) { this.feed.push({ ...e, n: ++this.feedN || (this.feedN = 1) }); if (this.feed.length > KEEP_FEED) this.feed.shift(); }

  save(kind) {
    const snap = {
      code: this.code, hostToken: this.hostToken, seed: this.seed, settings: this.settings, kind, created: this.created,
      game: serializeGame(this.game),
      players: [...this.players.values()].map((p) => ({ token: p.token, name: p.name, teamName: p.teamName, club: p.club, teamId: p.teamId, auto: p.auto })),
      results: this.results, days: this.days,
    };
    this.onSave(this, snap);
  }
  static restore(snap, { D, onChange, onSave }) {
    const room = new Room({ code: snap.code, D, hostToken: snap.hostToken, onChange, onSave });
    room.created = snap.created; room.seed = snap.seed; room.settings = { ...DEFAULTS, ...snap.settings };
    room.game = restoreGame(D, snap.game);
    for (const sp of snap.players) room.players.set(sp.token, { ...sp, connected: false });
    room.results = snap.results || []; room.days = snap.days || [];
    room.shownTable = standingsOf(room.results, room.game.teams.length);
    if (snap.kind === "seasonEnd") { room.phase = "season"; room.step = "season.end"; room.mdIdx = room.days.length; room.final = room.game.season >= room.settings.seasons; room.setReveal({ kind: "season", season: room.game.season, champion: room.shownTable[0].i, table: room.shownTable, final: room.final }); }
    else { room.phase = "market"; room.step = "market.done"; room.setReveal({ kind: "squads" }); }
    room.restored = true;
    return room;
  }

  // ---------- views ----------
  teamPub(t) {
    const p = this.playerOfTeam(t.id);
    return { id: t.id, name: t.name, owner: p ? p.name : null, club: t.club, human: !!t.human, connected: t.human ? !!(p && p.connected) : true, idle: !!(p && p.idle), auto: !!(p && p.auto), players: t.players, ready: this.ready.has(t.id), done: !!t.marketDone, items: this.step === "off.trade" ? t.items : undefined };
  }
  // The live record for a player: only what differs from the data file is sent beyond the basics.
  pdyn(id) {
    const p = this.game.players[id], b = this.baseOf.get(id) || p;
    const o = { o: p.ovr, a: p.age, s: Math.round(p.stam), c: p.contract, t: p.team, mv: marketValue(p, this.game.P) };
    if (p.ovr !== b.ovr || p.pac !== b.pac || p.sho !== b.sho || p.pas !== b.pas || p.dri !== b.dri || p.def !== b.def || p.phy !== b.phy || p.sta !== b.sta) o.st = [p.pac, p.sho, p.pas, p.dri, p.def, p.phy, p.sta];
    if (p.pos !== b.pos) o.pos = p.pos;
    if (p.pot) o.pot = p.pot;
    return o;
  }

  view(token) {
    const g = this.game, me = this.players.get(token);
    const v = {
      room: this.code, phase: this.phase, step: this.step, paused: this.paused,
      deadline: this.deadline, dur: this.dur, now: Date.now(), settings: this.settings, host: this.isHost(token),
      players: [...this.players.values()].map((p) => ({ you: p.token === token, name: p.name, teamName: p.teamName, club: p.club, teamId: p.teamId, connected: p.connected, host: p.token === this.hostToken, auto: p.auto, idle: !!p.idle })),
      chat: this.chat.slice(-30), reveal: this.reveal, feed: this.feed,
      clubsTaken: this.phase === "lobby" ? [...this.players.values()].filter((p) => p.club).map((p) => p.club) : [],
    };
    { const humans = [...this.players.values()].filter((q) => q.teamId != null && q.connected), votes = { up: 0, down: 0 };
      for (const [tk, d] of this.speedVotes || []) { const q = this.players.get(tk); if (q && q.connected) votes[d]++; }
      v.speed = { pace: this.settings.pace, levels: PACES, votes, need: Math.floor(humans.length / 2) + 1, mine: (this.speedVotes && this.speedVotes.get(token)) || null, note: this.paceNote || null }; }
    if (!g) return v;
    v.N = g.teams.length; v.seasonNo = g.season;
    v.teams = g.teams.map((t) => this.teamPub(t));
    v.table = this.shownTable || [];
    // live player records for everyone who is on a team (compact)
    const ids = new Set(); for (const t of g.teams) for (const id of t.players) ids.add(id);
    if (this.step.startsWith("market.")) for (const id of g.pool) ids.add(id);
    if (this.step.startsWith("off.rookie") && g.rookies) for (const id of g.rookies) ids.add(id);
    if (this.step === "draft.pick" && me && me.teamId != null) for (const c of this.hands[me.teamId]) if (c.t === "p") ids.add(c.id);
    if (this.reveal && this.reveal.kind === "resign") for (const x of this.reveal.released) ids.add(x.id);
    if (this.reveal && this.reveal.kind === "draft") for (const pk of this.reveal.picks) if (pk.card && pk.card.t === "p") ids.add(pk.card.id);
    v.pd = Object.fromEntries([...ids].map((id) => [id, this.pdyn(id)]));
    if (this.phase === "draft" && this.draftRound) v.draft = { round: this.draftRound, total: g.P.packs.rounds, locked: [...this.picks].filter(([, h]) => h.locked).map(([id]) => id), humans: this.humanTeams().map((t) => t.id) };
    if (this.step.startsWith("market.")) {
      const w = catchUpWeights(g, g.P);
      v.market = { round: this.marketRound, total: MARKET_ROUNDS, pool: g.pool, supply: g.supply, locked: [...this.bids].filter(([, b]) => b.locked).map(([id]) => id), odds: w.map((x) => +x.toFixed(3)) };
    }
    if (this.phase === "offseason" && this.step.startsWith("off.rookie")) v.rookies = { avail: availableRookies(g), order: this.worstFirst, idx: this.rIdx, picks: this.rookiePicks };
    if (this.phase === "offseason" && this.step === "off.trade" && !me) v.tradeLog = this.trade ? this.trade.log.slice(-10) : [];
    v.history = g.history || []; v.final = !!this.final;
    if (this.phase === "season") v.season = { day: this.mdIdx, total: (this.days || []).length, fixtures: (this.days || [])[this.mdIdx] || null, results: this.results.filter((r) => r.day >= this.mdIdx - 0).map((r) => ({ day: r.day, a: r.a, b: r.b, ga: r.ga, gb: r.gb })) };
    if (me && me.teamId != null) {
      const t = g.teams[me.teamId];
      const mv = { teamId: t.id, coins: t.coins, items: t.items, auto: me.auto, idle: !!me.idle, active: t.active ?? null, income: t.income };
      if (this.step === "draft.pick") { mv.hand = this.hands[t.id]; const h = this.picks.get(t.id); mv.pick = h ? { idx: h.idx, locked: h.locked } : null; }
      if (this.step.startsWith("market.")) {
        const b = this.bids.get(t.id); mv.bid = b || null; mv.done = !!t.marketDone;
        mv.rosterRoom = g.P.money.rosterMax - t.players.length;
      }
      if (this.phase === "season") {
        mv.lineup = t.lineup || bestLineup(rosterOf(g, t), g.P);
        if (this.live) {
          const k = this.live.findIndex((m) => m.a === t.id || m.b === t.id);
          if (k >= 0) {
            const m = this.live[k], side = m.a === t.id ? 0 : 1;
            mv.match = { index: k, side, opponent: side ? m.a : m.b, lineup: m.lineups[side], halftime: this.step === "md.half" ? { score: m.ht.score, stamina: m.ht.stamina[side], lineup: t.htLineup || m.lineups[side] } : null };
          }
        }
      }
      if (this.phase === "offseason") {
        if (this.step === "off.resign") mv.resign = expiring(g, t.id).map((id) => { const p = g.players[id]; return { id, fees: [1, 2, 3].map((l) => feeFor(p, l, g.P)) }; });
        if (this.step === "off.rookie.turn") mv.myTurn = this.worstFirst[this.rIdx] === t.id;
        if (this.step === "off.trade") mv.trade = this.tradeView(me);
      }
      v.me = mv;
      v.formations = Object.fromEntries(FORMATION_NAMES.map((f) => [f, FORMATIONS[f]]));
    }
    return v;
  }
}

Object.assign(Room.prototype, offseasonMethods);
