// Off-season steps for the Room: retirements, development, re-signing, rookie draft, trades, then free agency (the market).
import { liteOf } from "./lite.js";
import { standingsOf } from "../engine/fixtures.js";
import { runRetirements, ageAll, botResign, resign, releaseExpired, expiring, introduceRookies, botRookiePick, availableRookies, takeRookie, rookieDraftStart, rookieDraftEnd, rookiePack, rookieTake, botRookieMove } from "../engine/offseason.js";
import { validateOffer, executeOffer, botVerdict } from "../engine/trade.js";
import { feeFor } from "../engine/market.js";
import { applyCaps } from "../engine/game.js";

export const offseasonMethods = {
  // ---------- entering ----------
  startOffseason() {
    const g = this.game, N = g.teams.length;
    this.phase = "offseason"; g.marketAhead = true; this.trade = null; this.ready = new Set(); applyCaps(g, g.season + 1);
    this.worstFirst = standingsOf(this.results, N).map((r) => r.i).reverse();
    this.retired = runRetirements(g);
    this.setReveal({ kind: "retire", season: g.season, list: this.retired });
    this.step = "off.retire";
    this.after(this.p(18000), () => this.develop());
    this.changed();
  },
  develop() {
    const g = this.game;
    const moves = ageAll(g).filter((m) => g.players[m.id].team != null);
    this.setReveal({ kind: "age", season: g.season, moves });
    this.step = "off.age";
    this.after(this.p(11000), () => this.startResign());
    this.changed();
  },

  // ---------- re-signing ----------
  startResign() {
    const g = this.game;
    this.resigned = []; this.ready = new Set();
    const need = this.humanTeams().filter((t) => { const h = this.humanFor(t.id); return h && liteOf(h).finance && expiring(g, t.id).length; });   // Lite without the finance tabs: the club re-signs for them, like a CPU club
    if (!need.length) return this.finishResign();
    this.step = "off.resign"; this.openWindow();
    this.after(this.settings.resignSec * 1000, () => this.finishResign());
    this.changed();
  },
  resignPlayer(token, id, len) {
    const p = this.players.get(token); if (!p || p.teamId == null || this.step !== "off.resign") return;
    const fee = resign(this.game, p.teamId, id, len | 0);
    if (fee === false) return;
    this.resigned.push({ team: p.teamId, id, len: len | 0, fee });
    this.changed();
  },
  finishResign() {
    this.closeWindow();
    const g = this.game;
    g.teams.forEach((t, ti) => {
      { const h = t.human && this.humanFor(ti); if (h && liteOf(h).finance) return; }   // a connected manager decides for themselves (Lite without finance leaves it to the club)
      for (const pk of botResign(g, ti)) { const fee = resign(g, ti, pk.id, pk.len); if (fee !== false) this.resigned.push({ team: ti, id: pk.id, len: pk.len, fee }); }
    });
    const released = releaseExpired(g);
    this.setReveal({ kind: "resign", signed: this.resigned, released });
    this.step = "off.resign.reveal"; this.ready = new Set();
    this.after(this.p(11000), () => this.startRookies());
    this.changed();
  },

  // ---------- rookie pack draft: worst team first; take a leftover, open a pack of three unseen rookies, or abstain ----------
  startRookies() {
    const g = this.game, D = this.D;
    const ids = introduceRookies(g, g.season, D);
    this.rookiePicks = []; this.rIdx = 0; this.rStage = "choose"; this.rPack = null; this.rPacks = []; this.rLast = null;
    if (!ids.length) { g.rookies = []; return this.startTrade(); }
    rookieDraftStart(g);
    this.rookieTurn();
  },
  rookieCan(ti) { const g = this.game, d = g.rdraft, t = g.teams[ti]; return t.players.length < (t.cap ?? g.P.money.rosterMax) && (d.left.length || d.unopened.length); },
  rookieDone(ti, id, how, extra = {}) { this.rookiePicks.push({ team: ti, id, how, ...extra }); this.rIdx++; this.rStage = "choose"; this.rPack = null; },
  // A CPU club (or a manager on Auto / not connected) takes its turn.
  botRookie(ti) {
    const g = this.game, mv = botRookieMove(g, ti);
    if (mv.act === "pass") return void this.rookieDone(ti, null, "pass");
    if (mv.act === "pick") { rookieTake(g, ti, mv.id); this.rLast = { team: ti, ids: [], took: mv.id }; return void this.rookieDone(ti, mv.id, "left"); }
    const pk = rookiePack(g), id = botRookiePick(g, pk); rookieTake(g, ti, id);
    this.rPacks.push({ team: ti, ids: pk }); this.rLast = { team: ti, ids: pk, took: id }; this.rookieDone(ti, id, "pack", { pack: pk });
  },
  rookieTurn() {
    const g = this.game;
    while (this.rIdx < this.worstFirst.length) {
      const ti = this.worstFirst[this.rIdx], t = g.teams[ti], p = this.playerOfTeam(ti);
      this.rStage = "choose"; this.rPack = null;
      if (!this.rookieCan(ti)) { this.rookieDone(ti, null, "none"); continue; }
      if (!t.human || !p || !p.connected || p.auto) {
        this.botRookie(ti); this.step = "off.rookie.turn"; this.changed();
        return void this.after(t.human ? 500 : 260, () => this.rookieTurn());
      }
      this.step = "off.rookie.turn"; this.openWindow();
      this.after(this.settings.rookieSec * 1000, () => this.rookieTimeout());
      return this.changed();
    }
    const end = rookieDraftEnd(g);
    this.setReveal({ kind: "rookies", picks: this.rookiePicks, packs: this.rPacks, toPool: end.toPool, carry: end.carry.length });
    this.step = "off.rookie.reveal";
    this.after(this.p(10000), () => this.startTrade());
    this.changed();
  },
  rookieTimeout() {
    this.closeWindow();
    const g = this.game, ti = this.worstFirst[this.rIdx];
    if (this.rStage === "pack" && this.rPack) { const id = botRookiePick(g, this.rPack); rookieTake(g, ti, id); this.rLast = { team: ti, ids: this.rPack, took: id }; this.rPacks.push({ team: ti, ids: this.rPack }); this.rookieDone(ti, id, "pack", { pack: this.rPack }); }
    else this.botRookie(ti);
    this.rookieTurn();
  },
  onClock(token) { const p = this.players.get(token); return p && p.teamId != null && this.step === "off.rookie.turn" && this.worstFirst[this.rIdx] === p.teamId ? p : null; },
  // Choose: take a leftover (stage "choose") or keep one rookie of the pack just opened (stage "pack").
  pickRookie(token, id) {
    const p = this.onClock(token); if (!p) return;
    const g = this.game, ti = p.teamId, d = g.rdraft;
    if (this.rStage === "pack") {
      if (!this.rPack || !this.rPack.includes(id)) return;
      rookieTake(g, ti, id); this.rPacks.push({ team: ti, ids: this.rPack }); this.rLast = { team: ti, ids: this.rPack, took: id }; this.rookieDone(ti, id, "pack", { pack: this.rPack });
    } else {
      if (!d.left.includes(id) || !this.rookieCan(ti)) return;
      rookieTake(g, ti, id); this.rLast = { team: ti, ids: [], took: id }; this.rookieDone(ti, id, "left");
    }
    this.closeWindow(); this.rookieTurn();
  },
  // Open a fresh pack: its rookies are shown to everybody and the club keeps one of them (the rest join the leftovers).
  openRookiePack(token) {
    const p = this.onClock(token); if (!p || this.rStage !== "choose") return;
    const g = this.game; if (!g.rdraft.unopened.length || !this.rookieCan(p.teamId)) return;
    this.rPack = rookiePack(g); this.rStage = "pack"; this.openWindow();
    this.after(this.settings.rookieSec * 1000, () => this.rookieTimeout());
    this.changed();
  },
  // Abstain: no rookie for this club (an opened pack stays on the table for the others).
  passRookie(token) {
    const p = this.onClock(token); if (!p) return;
    if (this.rStage === "pack" && this.rPack) this.rPacks.push({ team: p.teamId, ids: this.rPack });
    this.rookieDone(p.teamId, null, "pass"); this.closeWindow(); this.rookieTurn();
  },

  // ---------- trade window ----------
  startTrade() {
    this.trade = { offers: [], nextId: 1, log: [] }; this.ready = new Set();
    const anyone = this.humanTeams().some((t) => this.humanFor(t.id));
    this.step = "off.trade"; this.openWindow();
    for (const p of this.players.values()) if (this.passive(p) && p.teamId != null) this.ready.add(p.teamId);     // Lite without the trade tabs sits the window out
    const open = this.humanTeams().some((t) => this.humanFor(t.id) && !this.ready.has(t.id));
    this.after(anyone && open ? this.settings.tradeSec * 1000 : this.p(1500), () => this.endTrade());
    this.changed();
  },
  endTrade() { this.closeWindow(); for (const o of this.trade.offers) if (o.status === "open") o.status = "expired"; this.startFreeAgency(); },
  cleanAssets(list) {
    return (Array.isArray(list) ? list : []).slice(0, 8).map((a) => (a && a.k === "p" ? { k: "p", id: a.id | 0 } : a && a.k === "i" ? { k: "i", id: String(a.id) } : a && a.k === "c" ? { k: "c", amt: Math.floor(+a.amt || 0) } : null)).filter(Boolean);
  },
  tradeOffer(token, to, give, get) {
    const p = this.players.get(token); if (!p || p.teamId == null || !this.tradeOpen() || !this.trade) return;
    const g = this.game, o = { id: this.trade.nextId++, from: p.teamId, to: to | 0, give: this.cleanAssets(give), get: this.cleanAssets(get), status: "open", at: Date.now() };
    const err = validateOffer(g, o);
    if (err) { o.status = "invalid"; o.why = err; this.trade.offers.push(o); return this.changed(); }
    this.trade.offers.push(o);
    const target = g.teams[o.to], tp = this.playerOfTeam(o.to);
    if (!target.human || !tp || !tp.connected) this.settleOffer(o, botVerdict(g, o));   // CPU (or absent) managers answer at once
    this.changed();
  },
  settleOffer(o, accept) {
    const g = this.game;
    if (!accept) { o.status = "declined"; return; }
    const err = validateOffer(g, o);
    if (err) { o.status = "invalid"; o.why = err; return; }
    executeOffer(g, o); o.status = "accepted"; if (this.phase === "season") { this.purgeRoster(o.from); this.purgeRoster(o.to); }
    this.trade.log.push({ from: o.from, to: o.to, give: o.give, get: o.get });
    this.pushFeed({ kind: "trade", from: o.from, to: o.to });
    for (const x of this.trade.offers) if (x.status === "open" && x !== o && (x.from === o.from || x.from === o.to || x.to === o.from || x.to === o.to)) {
      const e = validateOffer(g, x); if (e) { x.status = "invalid"; x.why = e; }
    }
  },
  tradeRespond(token, id, accept) {
    const p = this.players.get(token); if (!p || !this.tradeOpen() || !this.trade) return;
    const o = this.trade.offers.find((x) => x.id === id && x.to === p.teamId && x.status === "open"); if (!o) return;
    this.settleOffer(o, !!accept); this.changed();
  },
  tradeCancel(token, id) {
    const p = this.players.get(token); if (!p || !this.tradeOpen() || !this.trade) return;
    const o = this.trade.offers.find((x) => x.id === id && x.from === p.teamId && x.status === "open"); if (!o) return;
    o.status = "cancelled"; this.changed();
  },
  tradeView(me) {
    const t = this.trade; if (!t) return null;
    const mine = me != null ? me.teamId : -1;
    return { offers: t.offers.filter((o) => o.from === mine || o.to === mine).slice(-12), log: t.log.slice(-10), max: this.game.P.trade.maxAssets };
  },

  // ---------- free agency, then the new season ----------
  startFreeAgency() { this.trade = this.trade; this.startMarket("fa"); },
};
