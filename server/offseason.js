// Off-season steps for the Room: retirements, development, re-signing, rookie draft, trades, then free agency (the market).
import { standingsOf } from "../engine/fixtures.js";
import { runRetirements, ageAll, botResign, resign, releaseExpired, expiring, introduceRookies, botRookiePick, availableRookies, takeRookie, rookiesToPool } from "../engine/offseason.js";
import { validateOffer, executeOffer, botVerdict } from "../engine/trade.js";
import { feeFor } from "../engine/market.js";

export const offseasonMethods = {
  // ---------- entering ----------
  startOffseason() {
    const g = this.game, N = g.teams.length;
    this.phase = "offseason"; this.trade = null; this.ready = new Set();
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
    const need = this.humanTeams().filter((t) => this.humanFor(t.id) && expiring(g, t.id).length);
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
      if (t.human && this.humanFor(ti)) return;                    // a connected manager decides for themselves
      for (const pk of botResign(g, ti)) { const fee = resign(g, ti, pk.id, pk.len); if (fee !== false) this.resigned.push({ team: ti, id: pk.id, len: pk.len, fee }); }
    });
    const released = releaseExpired(g);
    this.setReveal({ kind: "resign", signed: this.resigned, released });
    this.step = "off.resign.reveal"; this.ready = new Set();
    this.after(this.p(11000), () => this.startRookies());
    this.changed();
  },

  // ---------- rookie draft: one round, worst team first ----------
  startRookies() {
    const g = this.game, D = this.D;
    const ids = introduceRookies(g, g.season, D);
    this.rookiePicks = []; this.rIdx = 0;
    if (!ids.length) return this.startTrade();
    this.rookieTurn();
  },
  rookieTurn() {
    const g = this.game;
    while (this.rIdx < this.worstFirst.length) {
      const ti = this.worstFirst[this.rIdx], t = g.teams[ti], avail = availableRookies(g), p = this.playerOfTeam(ti);
      if (!avail.length || t.players.length >= g.P.money.rosterMax) { this.rookiePicks.push({ team: ti, id: null }); this.rIdx++; continue; }
      if (!t.human || !p || !p.connected || p.auto) {
        const id = botRookiePick(g, avail); takeRookie(g, ti, id); this.rookiePicks.push({ team: ti, id }); this.rIdx++;
        this.step = "off.rookie.turn"; this.changed();
        return void this.after(t.human ? 500 : 140, () => this.rookieTurn());
      }
      this.step = "off.rookie.turn"; this.openWindow();
      this.after(this.settings.rookieSec * 1000, () => this.rookieTimeout());
      return this.changed();
    }
    rookiesToPool(g);
    this.setReveal({ kind: "rookies", picks: this.rookiePicks });
    this.step = "off.rookie.reveal";
    this.after(this.p(10000), () => this.startTrade());
    this.changed();
  },
  rookieTimeout() {
    this.closeWindow();
    const g = this.game, ti = this.worstFirst[this.rIdx], avail = availableRookies(g);
    const id = botRookiePick(g, avail); takeRookie(g, ti, id); this.rookiePicks.push({ team: ti, id }); this.rIdx++;
    this.rookieTurn();
  },
  pickRookie(token, id) {
    const p = this.players.get(token); if (!p || this.step !== "off.rookie.turn" || p.teamId == null) return;
    if (this.worstFirst[this.rIdx] !== p.teamId) return;
    const g = this.game; if (!availableRookies(g).includes(id)) return;
    takeRookie(g, p.teamId, id); this.rookiePicks.push({ team: p.teamId, id }); this.rIdx++;
    this.rookieTurn();
  },

  // ---------- trade window ----------
  startTrade() {
    this.trade = { offers: [], nextId: 1, log: [] }; this.ready = new Set();
    const anyone = this.humanTeams().some((t) => this.humanFor(t.id));
    this.step = "off.trade"; this.openWindow();
    this.after(anyone ? this.settings.tradeSec * 1000 : this.p(1500), () => this.endTrade());
    this.changed();
  },
  endTrade() { this.closeWindow(); for (const o of this.trade.offers) if (o.status === "open") o.status = "expired"; this.startFreeAgency(); },
  cleanAssets(list) {
    return (Array.isArray(list) ? list : []).slice(0, 8).map((a) => (a && a.k === "p" ? { k: "p", id: a.id | 0 } : a && a.k === "i" ? { k: "i", id: String(a.id) } : a && a.k === "c" ? { k: "c", amt: Math.floor(+a.amt || 0) } : null)).filter(Boolean);
  },
  tradeOffer(token, to, give, get) {
    const p = this.players.get(token); if (!p || p.teamId == null || this.step !== "off.trade") return;
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
    executeOffer(g, o); o.status = "accepted";
    this.trade.log.push({ from: o.from, to: o.to, give: o.give, get: o.get });
    this.pushFeed({ kind: "trade", from: o.from, to: o.to });
    for (const x of this.trade.offers) if (x.status === "open" && x !== o && (x.from === o.from || x.from === o.to || x.to === o.from || x.to === o.to)) {
      const e = validateOffer(g, x); if (e) { x.status = "invalid"; x.why = e; }
    }
  },
  tradeRespond(token, id, accept) {
    const p = this.players.get(token); if (!p || this.step !== "off.trade") return;
    const o = this.trade.offers.find((x) => x.id === id && x.to === p.teamId && x.status === "open"); if (!o) return;
    this.settleOffer(o, !!accept); this.changed();
  },
  tradeCancel(token, id) {
    const p = this.players.get(token); if (!p || this.step !== "off.trade") return;
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
