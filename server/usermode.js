// Player mode on the server: lobby set-up, career cards, offers from teams, half-time effort, CPU fallbacks.
import { makeRng } from "../engine/rng.js";
import { withParams } from "../engine/params.js";
import { rollNumbers, cleanAssign, defaultAssign, createUserPlayer, reviseUserPlayer, dealCard, answerCard, unsigned, signUser, cpuOffers, cpuTakes, ALL_POS } from "../engine/playermode.js";
import { findPlate } from "../engine/unlocks.js";
import { feeFor, rosterRoom } from "../engine/market.js";
import { ensureLife, runActivity, blocked, canMarry, actCost, WEDDING_COST, buyLife, purchaseStory, decideStory, dropPending, lifeIncome, shopItem, SHOP, priceFor, owns, ownsBetter, nightclub } from "../engine/life.js";

const P0 = withParams({});
export const usermodeMethods = {
  // ---------- lobby ----------
  isPlayerMode(p) { return p && p.mode === "player"; },
  setMode(token, mode) {
    const p = this.players.get(token); if (!p || this.phase !== "lobby") return;
    if (mode === "player") {
      if (p.mode === "player") return;
      p.mode = "player"; p.club = null; p.teamName = "";
      const r = rollNumbers(P0, this.code, token, 0);
      const g = this.settings.pool === "female" ? "F" : "M", rr = makeRng(this.code, "face", token);
      p.char = { name: p.name, pos: "CM", nums: r.nums, ovr: r.ovr, assign: defaultAssign("CM"), rolls: 0, nat: "", gender: g, img: [Math.floor(rr() * 6), Math.floor(rr() * 6), Math.floor(rr() * 6)].join("-") };
    } else { p.mode = "manager"; p.char = null; }
  },
  // A footballer can be edited in the lobby and while the others draft; once the market opens he is as he is.
  editable(p) { return (this.phase === "lobby" || this.phase === "draft") && this.isPlayerMode(p) && p.char; },
  syncChar(p) { if (this.phase === "draft" && p.pid != null) { const u = this.game.players[p.pid]; if (u) reviseUserPlayer(this.game, u, p.char); } },
  rollChar(token) {
    const p = this.players.get(token); if (!p || !this.editable(p)) return;
    if (p.char.rolls >= P0.player.rerolls) return;
    p.char.rolls++;
    const r = rollNumbers(P0, this.code, token, p.char.rolls);
    p.char.nums = r.nums; p.char.ovr = r.ovr; p.char.assign = defaultAssign(p.char.pos);
    this.syncChar(p);
  },
  setChar(token, c) {
    const p = this.players.get(token); if (!p || !this.editable(p) || !c) return;
    if (typeof c.name === "string") { const n = c.name.trim().slice(0, 22); if (n) p.char.name = n; }
    if (typeof c.pos === "string" && ALL_POS.includes(c.pos)) { if (c.pos !== p.char.pos) p.char.assign = defaultAssign(c.pos); p.char.pos = c.pos; }
    if (c.assign) p.char.assign = cleanAssign(c.assign);
    if (typeof c.nat === "string" && (c.nat === "" || /^[A-Za-z' .-]{1,30}$/.test(c.nat))) p.char.nat = c.nat;
    const pool = this.settings.pool;
    if (c.gender === "F" || c.gender === "M") p.char.gender = pool === "female" ? "F" : pool === "male" ? "M" : c.gender;
    if (typeof c.img === "string" && /^(\d-\d-\d|f:[\w.-]{1,40})$/.test(c.img)) p.char.img = c.img;
    this.syncChar(p);
  },
  // The host changed the pool: footballers who no longer fit the league switch to the gender it uses.
  fitCharsToPool() { const g = this.settings.pool === "female" ? "F" : this.settings.pool === "male" ? "M" : null; if (g) for (const q of this.players.values()) if (q.char) q.char.gender = g; },
  // After the league exists: every player-mode user gets his footballer.
  createUserPlayers() {
    const g = this.game;
    for (const p of this.players.values()) {
      if (!this.isPlayerMode(p)) continue;
      if (!p.char) this.setMode(p.token, "player");
      const up = createUserPlayer(g, { token: p.token, ...p.char });
      p.pid = up.id;
      this.baseOf.set(up.id, up);
    }
  },

  // ---------- offers (managers to players) ----------
  startOffers() {
    const g = this.game;
    this.offers = []; this.offerSeq = 1;
    for (const p of unsigned(g)) for (const o of cpuOffers(g, p, this.marketKind + this.marketRound)) this.offers.push({ id: this.offerSeq++, team: o.team, pid: p.id, len: o.len, fee: o.fee, from: "cpu", status: "open" });
  },
  openOffer(teamId, pid, len) {
    return (this.offers || []).find((o) => o.team === teamId && o.pid === pid && o.status === "open" && o.len === len);
  },
  makeOffer(token, pid, len) {
    const m = this.players.get(token); if (!m || m.teamId == null || !this.step.startsWith("market.")) return;
    const g = this.game, p = g.players[pid | 0]; len = Math.max(1, Math.min(3, len | 0 || 1));
    if (!p || !p.user || p.team != null || !(g.userPool || []).includes(p.id)) return;
    const t = g.teams[m.teamId];
    if (rosterRoom(t, g.P) <= 0) return;
    const mine = this.offers.filter((o) => o.team === t.id && o.status === "open");
    if (mine.length >= g.P.player.maxOpenOffers) return;
    this.offers = this.offers.filter((o) => !(o.team === t.id && o.pid === p.id && o.status === "open"));
    const fee = feeFor(p, len, g.P);
    if (fee > t.coins) return;
    this.offers.push({ id: this.offerSeq++, team: t.id, pid: p.id, len, fee, from: "human", status: "open", at: Date.now() });
    this.changed();
  },
  withdrawOffer(token, id) {
    const m = this.players.get(token); if (!m || m.teamId == null) return;
    const o = (this.offers || []).find((x) => x.id === id && x.team === m.teamId && x.status === "open"); if (!o) return;
    o.status = "withdrawn"; this.changed();
  },
  respondOffer(token, id, accept) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || !this.step.startsWith("market.")) return;
    const g = this.game, o = (this.offers || []).find((x) => x.id === id && x.pid === u.pid && x.status === "open"); if (!o) return;
    const p = g.players[u.pid];
    if (!accept) { o.status = "declined"; return this.changed(); }
    const paid = signUser(g, p, o.team, o.len);
    if (paid === false) { o.status = "failed"; return this.changed(); }
    o.status = "accepted";
    for (const x of this.offers) if (x.pid === p.id && x !== o && x.status === "open") x.status = "closed";
    this.pushFeed({ kind: "signed", team: o.team, id: p.id, len: o.len, paid });
    this.changed();
  },
  // End of a market: a player still without a team is taken by a CPU team after the first off-season.
  userMarketEnd() {
    const g = this.game, out = [];
    if (this.marketKind !== "fa") return out;
    for (const p of unsigned(g)) if (cpuTakes(g, p)) out.push({ id: p.id, team: p.team });
    return out;
  },

  // ---------- career cards and half-time effort ----------
  dealCareerCards() {
    const g = this.game, every = Math.max(1, Math.floor((this.days || []).length / g.P.player.cards));
    if ((this.mdIdx + 1) % every !== 0 || this.mdIdx + 1 > every * g.P.player.cards) return;
    for (const p of this.players.values()) if (this.isPlayerMode(p) && p.pid != null) dealCard(g, g.players[p.pid], "d" + this.mdIdx);
  },
  answerCareer(token, n, opt) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || !this.game) return;
    const res = answerCard(this.game, this.game.players[u.pid], n | 0, opt | 0);
    if (res) { u.lastResult = res; this.changed(); }
  },
  setEffort(token, mode) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || this.step !== "md.half") return;
    if (!this.efforts) this.efforts = new Map();
    if (mode === "push" || mode === "conserve") this.efforts.set(u.pid, mode); else this.efforts.delete(u.pid);
    this.changed();
  },
  effortHook(team) {
    if (!this.efforts || !this.efforts.size) return null;
    const out = {}; for (const id of team.players) if (this.efforts.has(id)) out[id] = this.efforts.get(id);
    return Object.keys(out).length ? out : null;
  },

  // ---------- cosmetic unlocks ----------
  redeem(token, text) {
    const p = this.players.get(token); if (!p || this.phase !== "lobby") return;
    const plate = findPlate(this.D.plates || [], text);
    if (!plate) { this.unlockNote = { id: (this.unlockNote ? this.unlockNote.id : 0) + 1, token, ok: false, text: "That code does not open anything." }; return this.changed(); }
    (p.unlocks = p.unlocks || new Set()).add(plate.id);
    this.unlockNote = { id: (this.unlockNote ? this.unlockNote.id : 0) + 1, token, ok: true, plate: plate.id, text: `Unlocked: ${plate.name}` };
    this.changed();
  },
  // A browser tells us the plates it already holds (they live in its local storage). Only real plate ids count.
  setUnlocks(token, ids) {
    const p = this.players.get(token); if (!p) return;
    const ok = new Set((this.D.plates || []).map((x) => x.id)); p.unlocks = new Set(ids.filter((i) => ok.has(i)));
    this.changed();
  },

  // ---------- life between matches ----------
  userPlayers() { return [...this.players.values()].filter((p) => this.isPlayerMode(p) && p.pid != null); },
  // Someone who is here and has not picked this week's activity yet.
  lifeOpen() { return this.userPlayers().some((u) => u.connected && !u.auto && !ensureLife(this.game, this.game.players[u.pid]).act); },
  chooseActivity(token, act, marry) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || this.step !== "md.lineup") return;
    const g = this.game, p = g.players[u.pid], L = ensureLife(g, p);
    if (act == null) { L.act = null; return this.changed(); }
    marry = !!marry && canMarry(g, p);
    if (blocked(g, p, act, { marry })) return;
    L.act = { act, marry }; this.changed(); this.maybeGo();
  },
  lifeBuy(token, id) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || !this.game) return;
    if (!["season.intro", "md.lineup", "md.result"].includes(this.step)) return;
    const g = this.game, p = g.players[u.pid], r = buyLife(g, p, id); if (!r) return;
    purchaseStory(g, p, r.item);
    this.changed();
  },
  newsDecide(token, id, yes) {
    const u = this.players.get(token); if (!u || u.teamId == null || !this.game) return;
    const n = (this.game.news || []).find((x) => x.id === id); if (!n || n.status !== "pending" || n.approver !== u.teamId) return;
    decideStory(this.game, id, !!yes); this.changed();
  },
  // Everyone's chosen week plays out just before the match: money, energy, love, followers, and whatever it makes the papers print.
  resolveLife() {
    const g = this.game; dropPending(g);
    const us = this.userPlayers(), k = us.length ? Math.max(0, this.mdIdx) % us.length : 0;   // one story a week for the league: take turns who is looked at first
    for (const u of [...us.slice(k), ...us.slice(0, k)]) {
      const p = g.players[u.pid]; if (!p || p.retired) continue;
      const L = ensureLife(g, p), ch = L.act || { act: "balance", marry: false };
      if (p.team == null) p.stam = 100;
      const res = runActivity(g, p, ch.act, { marry: ch.marry, day: this.mdIdx });
      u.lastLife = { act: res.act, cost: res.cost, stories: res.stories.map((n) => n.id), wada: res.wada };
      for (const n of res.stories) {
        if (n.status === "pending") { const mgr = this.playerOfTeam(n.approver); if (!mgr || !mgr.connected || mgr.auto) { n.status = "live"; n.approver = null; n.pub = ++g.pubSeq; } }
      }
    }
  },
  lifeView(p) {
    const g = this.game, L = ensureLife(g, p);
    const shop = {}; for (const it of SHOP) shop[it.id] = { price: priceFor(g, p, it), own: owns(L, it), better: ownsBetter(L, it) };
    const costs = {}; for (const a of Object.keys(g.P.life.acts)) costs[a] = actCost(g, p, a);
    const inc = lifeIncome(g, p);
    return { fol: L.fol, love: L.love, partner: L.partner, married: L.married, own: L.own, cnt: L.cnt, act: L.act, last: L.last, clubName: L.clubName, canMarry: canMarry(g, p), costs, shop, income: inc, base: g.P.player.income, open: this.step === "md.lineup", store: ["season.intro", "md.lineup", "md.result"].includes(this.step), sCount: L.sCount, wedCost: WEDDING_COST(g) };
  },
  newsView(token) {
    const g = this.game, me = this.players.get(token); if (!g) return null;
    const live = (g.news || []).filter((n) => n.status === "live").map((n) => ({ id: n.id, pub: n.pub, kind: n.kind, icon: n.icon, pid: n.pid, name: n.name, club: n.clubName, head: n.head, sub: n.sub, season: n.season, day: n.day }));
    const ask = me && me.teamId != null ? (g.news || []).filter((n) => n.status === "pending" && n.approver === me.teamId).map((n) => ({ id: n.id, icon: n.icon, name: n.name, head: n.head, sub: n.sub })) : [];
    return { list: live.slice(-30), ask, top: live.reduce((m, n) => Math.max(m, n.pub || 0), 0) };
  },

  // ---------- view parts ----------
  userView(token) {
    const u = this.players.get(token), g = this.game; if (!u || !g) return null;
    if (this.isPlayerMode(u) && u.pid != null) {
      const p = g.players[u.pid], c = p.career || { pending: [], log: [] };
      const offers = (this.offers || []).filter((o) => o.pid === p.id && (o.status === "open" || o.status === "accepted")).map((o) => ({ id: o.id, team: o.team, len: o.len, fee: o.fee, from: o.from, status: o.status }));
      let onPitch = false;
      if (this.step === "md.half" && this.live && p.team != null) { const m = this.live.find((x) => x.a === p.team || x.b === p.team); if (m) { const l = g.teams[p.team].htLineup || m.lineups[m.a === p.team ? 0 : 1]; onPitch = l.gk === p.id || l.out.includes(p.id); } }
      return { pid: p.id, team: p.team, contract: p.contract, pending: c.pending, log: c.log.slice(-8).reverse(), last: u.lastResult || null, offers, onPitch, effort: (this.efforts && this.efforts.get(p.id)) || null, gain: this.gain ? { seq: this.gain.seq, coins: (g.userGain && g.userGain[p.id] ? g.userGain[p.id].total : g.P.player.income), parts: g.userGain ? g.userGain[p.id] : null } : null, stam: Math.round(p.stam ?? 100), life: this.lifeView(p), lastLife: u.lastLife || null, coins: Math.round(p.coins || 0), items: p.items || {}, equip: p.equip || [], susp: p.susp || 0, canAnswer: true, market: this.step.startsWith("market."), unsigned: p.team == null, seasonCards: g.P.player.cards };
    }
    return null;
  },
  seekersView(me) {
    const g = this.game; if (!g || !this.step.startsWith("market.")) return null;
    const mine = new Map((this.offers || []).filter((o) => me && o.team === me.teamId && o.status === "open").map((o) => [o.pid + ":" + o.len, o]));
    return unsigned(g).map((p) => {
      const owner = [...this.players.values()].find((q) => q.pid === p.id);
      return { id: p.id, owner: owner ? owner.name : "", fees: [1, 2, 3].map((l) => feeFor(p, l, g.P)), mine: [1, 2, 3].filter((l) => mine.has(p.id + ":" + l)), n: (this.offers || []).filter((o) => o.pid === p.id && o.status === "open").length };
    });
  },
};
