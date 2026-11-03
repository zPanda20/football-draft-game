// Player mode on the server: lobby set-up, career cards, offers from teams, half-time effort, CPU fallbacks.
import { makeRng } from "../engine/rng.js";
import { withParams } from "../engine/params.js";
import { rollNumbers, cleanAssign, defaultAssign, createUserPlayer, reviseUserPlayer, dealCard, answerCard, unsigned, signUser, signUserCpu, cpuOffers, cpuTakes, openItemPack, pickPackCard, autoPickPack, ALL_POS } from "../engine/playermode.js";
import { findPlate } from "../engine/unlocks.js";
import { feeFor, rosterRoom, maxLen } from "../engine/market.js";
import { ensureLife, ensureRom, npcState, npcBlock, otherSuitors, isHuman, personOf, trainRec, runActivity, blocked, canMarry, ensureOptions, declineDate, weekChoice, dealAnswer, partnerById, PARTNER_LIST, ACTS, actCost, buyLife, purchaseStory, decideStory, dropPending, lifeIncome, shopItem, SHOP, priceFor, owns, ownsBetter, nightclub, thrMembers, leaveThr } from "../engine/life.js";
import { sendRequest, replyRequest, cancelJoint, askExclusive, breakUp, revealLoyalty, loyaltyWord, exclusiveState, avgQ, goodDates, planWedding, cancelWedding, answerPlan, withdrawPlan, propose, proposalState, proposalChance, oddsWord, holdWeddings, replyBeef, newWeek, tierOf } from "../engine/romance.js";

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
    const g = this.game, p = g.players[pid | 0]; len = Math.max(1, Math.min(maxLen(g, !!g.marketAhead), len | 0 || 1));
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
    let paid = signUser(g, p, o.team, o.len, false, o.fee);
    if (paid === false && o.from === "cpu") paid = signUserCpu(g, p, o.team, o.len, o.fee);       // a computer club stands by its offer
    if (paid === false) { o.status = "failed"; o.why = rosterRoom(g.teams[o.team], g.P) <= 0 ? "Their squad is full now." : "They can no longer afford the fee."; return this.changed(); }
    o.status = "accepted";
    for (const x of this.offers) if (x.pid === p.id && x !== o && x.status === "open") x.status = "closed";
    this.pushFeed({ kind: "signed", team: o.team, id: p.id, len: o.len, paid });
    this.changed();
  },
  // End of every market: a footballer still without a team is placed in an open slot, preferably on a computer team.
  userMarketEnd() {
    const g = this.game, out = [];
    for (const p of unsigned(g)) if (cpuTakes(g, p)) out.push({ id: p.id, team: p.team });
    for (const o of this.offers || []) if (o.status === "open") o.status = "closed";             // the market is over: stale offers go
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
  // Is this footballer (connected, not on auto) the one the room is waiting for right now?
  onPitchNow(u) {
    const g = this.game, p = g.players[u.pid];
    if (this.step !== "md.half" || !this.live || p.team == null) return false;
    const m = this.live.find((x) => x.a === p.team || x.b === p.team); if (!m) return false;
    const l = g.teams[p.team].htLineup || m.lineups[m.a === p.team ? 0 : 1]; return l.gk === p.id || l.out.includes(p.id);
  },
  userNeeds(u) {
    const g = this.game, p = g.players[u.pid]; if (!u.connected || !p) return false;
    switch (this.step) {
      case "md.lineup": return !u.auto && !ensureLife(g, p).act;
      case "md.half": return this.onPitchNow(u) && !(this.efforts && this.efforts.has(p.id));
      case "market.bid": return p.team == null && (this.offers || []).some((o) => o.pid === p.id && o.status === "open");
      default: return false;
    }
  },
  userPlayers() { return [...this.players.values()].filter((p) => this.isPlayerMode(p) && p.pid != null); },
  // Someone who is here and has not picked this week's activity yet.
  lifeOpen() { return this.userPlayers().some((u) => u.connected && !u.auto && !ensureLife(this.game, this.game.players[u.pid]).act); },
  chooseActivity(token, act, partner) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || this.step !== "md.lineup") return;
    const g = this.game, p = g.players[u.pid], L = ensureLife(g, p);
    if (L.act && L.act.joint) cancelJoint(g, p);                       // changing your mind frees the footballer you were going out with
    if (act == null) { L.act = null; return this.changed(); }
    partner = typeof partner === "string" && partner ? partner : null;
    if (act === "date" && !L.married) {
      const ids = ensureOptions(g, p, this.mdIdx);
      if (!partner) partner = L.partner && !isHuman(L.partner.id) && (ids.includes(L.partner.id) || L.partner.excl) ? L.partner.id : ids[0] || null;
    } else if (act === "date" && L.partner && !isHuman(L.partner.id)) partner = L.partner.id;
    else partner = null;
    if (isHuman(partner)) return;                                        // dates with another footballer go through a request
    if (blocked(g, p, act, { partner })) return;
    L.act = { act, partner }; this.changed(); this.maybeGo();
  },
  // ---------- relationships between footballers ----------
  userByPid(pid) { return [...this.players.values()].find((q) => q.pid === pid) || null; },
  privateNote(pid, text) { const q = this.userByPid(pid); if (q) this.notify(text, q.token); },
  deliver(res) { for (const n of (res && res.notes) || []) this.privateNote(n.pid, n.text); },
  romMe(token) { const u = this.players.get(token); return u && this.isPlayerMode(u) && u.pid != null && this.game ? { u, p: this.game.players[u.pid] } : null; },
  loveOpen() { return ["season.intro", "md.lineup", "md.result"].includes(this.step); },
  romAsk(token, to, kind) {
    const me = this.romMe(token); if (!me || !this.loveOpen()) return;
    if (kind === "date" && this.step !== "md.lineup") return;
    const res = sendRequest(this.game, me.p, to | 0, String(kind)); me.u.romNote = res.ok ? "Sent." : res.why;
    this.deliver(res); this.changed();
  },
  romReply(token, id, yes) {
    const me = this.romMe(token); if (!me || !this.loveOpen()) return;
    const R = ensureRom(this.game), r = R.req.find((x) => x.id === id);
    if (r && r.kind === "date" && this.step !== "md.lineup") { r.status = "lapsed"; return this.changed(); }
    const res = replyRequest(this.game, me.p, id | 0, !!yes); me.u.romNote = res.ok ? (yes ? "Done." : "Declined.") : res.why;
    this.deliver(res); this.changed(); if (res.ok && res.yes && r && r.kind === "date") this.maybeGo();
  },
  exclAsk(token) {
    const me = this.romMe(token); if (!me || !this.loveOpen()) return;
    const res = askExclusive(this.game, me.p); me.u.romNote = res.ok ? (res.yes ? "They said yes: you are exclusive." : "They said no. Give it a little time.") : res.why; this.changed();
  },
  endRelationship(token) {
    const me = this.romMe(token); if (!me || !this.loveOpen()) return;
    const res = breakUp(this.game, me.p); me.u.romNote = res.ok ? `You ended it with ${res.name}.` : res.why; this.deliver(res); this.changed();
  },
  leaveThrupple(token) { const me = this.romMe(token); if (!me || !me.p.life || !me.p.life.thr) return; leaveThr(this.game, me.p); this.changed(); },
  revealLoyal(token, id) { const me = this.romMe(token); if (!me) return; revealLoyalty(this.game, me.p, String(id)); this.changed(); },
  guestPool(exceptToken) { return [...this.players.values()].filter((q) => q.token !== exceptToken).map((q) => ({ pub: this.pubOf(q), name: q.name, kind: this.isPlayerMode(q) ? "player" : "manager", club: q.teamName || "", pid: this.isPlayerMode(q) ? q.pid : null })); },
  // Guests: everybody except you and the person you are marrying.
  guestsFor(token, p) { const mate = p.life && p.life.wed && String(p.life.wed.partner).startsWith("u:") ? +String(p.life.wed.partner).slice(2) : null; return this.guestPool(token).filter((x) => x.pid == null || x.pid !== mate); },
  inviteGuests(p, guests, day) {
    for (const gst of guests) { const q = [...this.players.values()].find((x) => this.pubOf(x) === gst.pub); if (q) this.notify(`${p.name} has invited you to their wedding on matchday ${(day | 0) + 1}.`, q.token); }
  },
  // Propose to a listed partner: yes, no and they leave, or no and they need more time.
  propose(token) {
    const me = this.romMe(token); if (!me || !this.loveOpen()) return;
    const res = propose(this.game, me.p);
    me.u.romNote = !res.ok ? res.why : res.yes ? "They said YES! Plan the wedding below." : res.dumped ? `${res.name} said no and ended it.` : `${res.name} needs more time. Try again in about ${res.weeks} weeks.`;
    this.changed();
  },
  weddingPlan(token, tier, day, pubs) {
    const me = this.romMe(token); if (!me || !this.loveOpen()) return;
    const pool = new Map(this.guestsFor(token, me.p).map((x) => [x.pub, x])), guests = (Array.isArray(pubs) ? pubs : []).map(String).filter((x) => pool.has(x)).map((x) => ({ pub: x, name: pool.get(x).name }));
    const res = planWedding(this.game, me.p, { tier: String(tier), day, guests }, { next: this.mdIdx + 1, total: (this.days || []).length });
    me.u.romNote = res.ok ? (res.sent ? "Sent. Waiting for them to agree." : "Wedding booked.") : res.why;
    if (res.ok && res.booked) this.inviteGuests(me.p, guests, day);
    this.deliver(res); this.changed();
  },
  weddingAgree(token, yes) {
    const me = this.romMe(token); if (!me || !this.loveOpen()) return;
    const res = answerPlan(this.game, me.p, !!yes, { next: this.mdIdx + 1, total: (this.days || []).length });
    me.u.romNote = res.ok ? (res.yes ? "Agreed: the wedding is booked." : "You asked for changes.") : res.why;
    if (res.ok && res.booked && res.plan) this.inviteGuests(this.game.players[me.p.id], res.plan.guests, res.plan.day);
    this.deliver(res); this.changed();
  },
  weddingWithdraw(token) { const me = this.romMe(token); if (!me) return; const res = withdrawPlan(this.game, me.p); me.u.romNote = res.ok ? "Plan taken back." : res.why; this.changed(); },
  weddingCancel(token) { const me = this.romMe(token); if (!me) return; const res = cancelWedding(this.game, me.p); me.u.romNote = res.ok ? "Wedding called off." : res.why; this.deliver(res); this.changed(); },
  beefReply(token, mode) {
    const me = this.romMe(token); if (!me) return;
    const res = replyBeef(this.game, me.p, String(mode)); if (!res.ok) return;
    if (res.feud) { const mgr = this.playerOfTeam(res.team); if (mgr) this.notify(`${me.p.name} and ${this.game.teams[res.team].name} are now rivals after an online row.`, mgr.token); }
    this.changed();
  },
  // "Not interested" in one of the three people on offer.
  turnDown(token, pid) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || this.step !== "md.lineup") return;
    if (declineDate(this.game, this.game.players[u.pid], String(pid))) this.changed();
  },
  // What the footballer does by himself in a week he does not choose (idle, away or on auto).
  setPref(token, act) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || !this.game) return;
    ensureLife(this.game, this.game.players[u.pid]).pref = ACTS.includes(act) ? act : null; this.changed();
  },
  // A created footballer opens one of his item packs (any time during the pack draft; what is left is opened for him when the draft ends).
  openItemPack(token) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || !this.step.startsWith("draft.")) return;
    openItemPack(this.game, this.game.players[u.pid]); this.changed();
  },
  packPick(token, idx) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || !this.game) return;
    if (pickPackCard(this.game, this.game.players[u.pid], idx | 0)) this.changed();
  },
  autoOpenPacks() { for (const u of this.userPlayers()) { const p = this.game.players[u.pid]; if (!p) continue; autoPickPack(this.game, p); while (p.packs > 0) { openItemPack(this.game, p); autoPickPack(this.game, p); } } },
  dealRespond(token, yes) {
    const u = this.players.get(token); if (!u || !this.isPlayerMode(u) || u.pid == null || !this.game) return;
    const g = this.game, r = dealAnswer(g, g.players[u.pid], !!yes);
    if (r && r.signed) this.pushFeed({ kind: "sponsor", id: u.pid });
    if (r) this.changed();
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
    newWeek(g); for (const x of this.userPlayers()) x.romNote = null;
    for (const w of holdWeddings(g, this.mdIdx)) {                      // today's weddings: the ceremony pops up for everybody
      g.rom.lastCeremony = w.ev.id;
      for (const pub of w.guests) { const q = [...this.players.values()].find((x) => this.pubOf(x) === pub); if (q) this.notify(`The wedding of ${w.ev.a.name} and ${w.ev.b.name} is happening now!`, q.token); }
      this.pushFeed({ kind: "wedding", id: w.ev.id });
    }
    const us = this.userPlayers(), k = us.length ? Math.max(0, this.mdIdx) % us.length : 0;   // one story a week for the league: take turns who is looked at first
    for (const u of [...us.slice(k), ...us.slice(0, k)]) {
      const p = g.players[u.pid]; if (!p || p.retired) continue;
      const L = ensureLife(g, p); let ch = L.act || weekChoice(g, p, this.mdIdx);
      if (ch.joint) {                                                   // a date with another footballer only happens if they are still coming
        const q = g.players[+String(ch.partner).slice(2)], QA = q && q.life && q.life.act;
        if (!QA || !QA.joint || QA.partner !== "u:" + p.id) ch = { act: "balance", partner: null };
      }
      if (p.team == null) p.stam = 100;
      const res = runActivity(g, p, ch.act, { partner: ch.partner || null, day: this.mdIdx, joint: ch.joint || null });
      u.lastLife = { act: res.act, cost: res.cost, stories: res.stories.map((n) => n.id), wada: res.wada, boost: res.boost, trained: res.trained, date: res.date ? { name: res.date.name, good: res.date.good } : null };
      for (const n of res.stories) {
        if (n.status === "pending") { const mgr = this.playerOfTeam(n.approver); if (!mgr || !mgr.connected || mgr.auto) { n.status = "live"; n.approver = null; n.pub = ++g.pubSeq; } }
      }
      if (res.cheat && isHuman(res.cheat.prev.id)) this.privateNote(+res.cheat.prev.id.slice(2), `${p.name} was seen on a date with ${res.cheat.now.name} while exclusive with you!${res.cheat.dumped ? " It's over." : ""}`);
      if (res.pcheat && isHuman(res.pcheat.partner.id)) this.privateNote(+res.pcheat.partner.id.slice(2), "Rumours say your partner was seen with someone else.");
    }
  },
  lifeView(p, u) {
    const g = this.game, L = ensureLife(g, p);
    const shop = {}; for (const it of SHOP) shop[it.id] = { price: priceFor(g, p, it), own: owns(L, it), better: ownsBetter(L, it) };
    const costs = {}; for (const a of Object.keys(g.P.life.acts)) costs[a] = actCost(g, p, a);
    const inc = lifeIncome(g, p);
    const opts = this.step === "md.lineup" || this.step === "md.result" ? (L.married ? [] : (L.opts ? L.opts.ids : []).map((id) => { const x = partnerById(id); return { id, name: x.name, g: x.g, dates: L.dated[id] || 0, rej: L.rej[id] || 0, last: !!(L.partner && L.partner.id === id), block: npcBlock(g, id, p.id), rivals: otherSuitors(g, id, p.id).map((q) => (g.players[q] || {}).name).filter(Boolean), good: goodDates(L, id), known: !!(L.know && L.know[id]) ? npcState(g, id).loyalty : null }; })) : [];
    const boosts = {}; for (const it of g.items) if (it.life && (p.items[it.id] || 0) > 0) boosts[it.life] = { id: it.id, left: p.items[it.id] };
    const T = trainRec(g, L), tr = { gain: +T.gain.toFixed(2), cap: g.P.life.trainCap, sessions: T.sessions, per: g.P.life.trainGain };
    return { boosts, tr, opts, pref: L.pref, offer: L.offer ? { ...L.offer } : null, deal: L.deal, trophies: L.trophies, matchGain: L.matchGain || 0, lm: p.lastMatch ? { gf: p.lastMatch.gf, ga: p.lastMatch.ga, g: p.lastMatch.g, a: p.lastMatch.a, r: +p.lastMatch.r.toFixed(1), gain: p.lastMatch.gain } : null,
      fol: L.fol, love: L.love, partner: L.partner, married: L.married, own: L.own, cnt: L.cnt, act: L.act, last: L.last, clubName: L.clubName, costs, shop, income: inc, base: g.P.player.income, open: this.step === "md.lineup", store: ["season.intro", "md.lineup", "md.result"].includes(this.step), sCount: L.sCount, rom: this.romView(u, p) };
  },
  // Everything the Relationships panel shows: your partner, the other footballers, requests, thrupple, wedding and online beef.
  romView(u, p) {
    const g = this.game, L = ensureLife(g, p), R = ensureRom(g), P = g.P.life.rom, lineup = this.step === "md.lineup", mine = "u:" + p.id;
    const face = (q) => ({ pid: q.id, name: q.name, img: q.img, g: q.gender === "F" ? "F" : "M" });
    const reqView = (r, side) => { const o = g.players[side === "in" ? r.from : r.to]; if (!o) return null; const mate = r.mate != null ? g.players[r.mate] : null;
      return { id: r.id, kind: r.kind === "thr2" ? "thr" : r.kind, who: face(o), mate: mate ? mate.name : null, cost: r.kind === "date" ? actCost(g, o, "date") * P.dateMult : 0 }; };
    const incoming = R.req.filter((r) => r.status === "open" && r.to === p.id).map((r) => reqView(r, "in")).filter(Boolean);
    const outgoing = R.req.filter((r) => r.status === "open" && r.from === p.id).map((r) => reqView(r, "out")).filter(Boolean);
    const q = L.partner; let partner = null;
    if (q) {
      const D = (L.dq || {})[q.id] || { n: 0, good: 0, sum: 0 }, human = isHuman(q.id), n = human ? null : npcState(g, q.id), ex = exclusiveState(g, p);
      partner = { id: q.id, name: q.name, g: q.g, human: q.human != null ? q.human : null, img: human ? (g.players[+q.id.slice(2)] || {}).img : null, excl: !!q.excl, married: L.married, dates: L.dated[q.id] || 0, n: D.n, good: D.good, avg: D.n ? Math.round((D.sum / D.n) * 100) : 0, cheated: q.cheated || 0,
        loyalty: n && L.know && L.know[q.id] ? { n: n.loyalty, word: loyaltyWord(n.loyalty) } : null, canReveal: !human && (L.dated[q.id] || 0) >= P.revealAt && !(L.know && L.know[q.id]),
        revealAt: P.revealAt, canExcl: ex.can && !human, exclWhy: ex.can ? "" : ex.why, prop: !human && q.excl && !L.married ? (() => { const ps = proposalState(g, p); return { can: ps.can, why: ps.why || "", odds: ps.can ? oddsWord(proposalChance(g, p, q.id)) : null }; })() : null, rivals: human ? [] : otherSuitors(g, q.id, p.id).map((x) => (g.players[x] || {}).name).filter(Boolean) };
    }
    const asked = new Set(R.req.filter((r) => r.status === "open" && r.from === p.id).map((r) => r.to + ":" + (r.kind === "thr2" ? "thr" : r.kind)));
    const people = this.userPlayers().filter((x) => x.pid !== p.id).map((x) => {
      const o = g.players[x.pid], OL = ensureLife(g, o), oq = OL.partner;
      const rel = OL.married ? `Married to ${oq ? oq.name : "?"}` : oq && oq.excl ? `Exclusive with ${oq.name}` : oq ? `Seeing ${oq.name}` : "Single";
      const them = q && q.id === "u:" + o.id, exs = exclusiveState(g, p), afford = (p.coins || 0) >= actCost(g, p, "date") * P.dateMult;
      return { ...face(o), team: o.team != null ? g.teams[o.team].name : "Free agent", rel, thr: !!OL.thr, mine: !!them, exclWithMe: !!(them && q.excl),
        can: { date: lineup && afford && !L.married && !OL.married && !asked.has(o.id + ":date") && !(L.partner && L.partner.excl && !them), excl: !!(them && !q.excl && !L.married && exs.can && OL.partner && OL.partner.id === mine && !asked.has(o.id + ":excl")),
          thr: !L.thr && !OL.thr && !L.married && !(L.partner && L.partner.excl) && !!(OL.partner && (OL.partner.excl || OL.married)) && !asked.has(o.id + ":thr"),
          wed: !!(them && q.excl && !L.married && !OL.married && !OL.wed && OL.partner && OL.partner.excl && proposalState(g, p).can && !asked.has(o.id + ":wed")) },
        why: exs.can ? "" : exs.why };
    });
    const t = L.thr ? R.thr.find((x) => x.id === L.thr) : null;
    const days = []; for (let d = this.mdIdx + 1; d < (this.days || []).length; d++) days.push(d);
    const tn = (id) => (tierOf(g, id) || {}).name || null, pl = L.wed && L.wed.plan ? L.wed.plan : null;
    const w = L.wed ? { ...L.wed, tierName: tn(L.wed.tier), plan: pl ? { ...pl, tierName: tn(pl.tier), mine: pl.by === p.id, byName: (g.players[pl.by] || {}).name || "Your partner" } : null } : null;
    const feuds = R.feuds.filter((f) => f.pid === p.id).map((f) => ({ team: f.team }));
    const bf = L.beef ? { id: L.beef.id, team: L.beef.team, teamName: g.teams[L.beef.team].name, text: L.beef.text } : null;
    return { open: this.loveOpen(), lineup, incoming, outgoing, partner, people, thr: t ? t.members.map((m) => (personOf(g, m) || { name: "?" }).name) : null, wed: w, canPlan: !!(L.wed && L.wed.status === "planning"), tiers: P.tiers, days, next: this.mdIdx + 1, total: (this.days || []).length,
      guests: this.guestsFor(u.token, p), note: u.romNote || null, beef: bf, beefLast: L.beefLast || null, feuds, dateMult: P.dateMult, wedDates: g.P.life.wedding.dates, exclDates: P.exclDates, exclGood: P.exclGood };
  },
  newsView(token) {
    const g = this.game, me = this.players.get(token); if (!g) return null;
    const live = (g.news || []).filter((n) => n.status === "live").map((n) => ({ id: n.id, pub: n.pub, kind: n.kind, icon: n.icon, pid: n.pid, name: n.name, club: n.clubName, src: n.src || null, head: n.head, sub: n.sub, season: n.season, day: n.day }));
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
      return { packs: p.packs || 0, pack: p.pack ? p.pack.cards : null, packLog: (p.packLog || []).slice(-3), pid: p.id, team: p.team, contract: p.contract, pending: c.pending, log: c.log.slice(-8).reverse(), last: u.lastResult || null, offers, onPitch, effort: (this.efforts && this.efforts.get(p.id)) || null, gain: this.gain ? { seq: this.gain.seq, coins: (g.userGain && g.userGain[p.id] ? g.userGain[p.id].total : g.P.player.income), parts: g.userGain ? g.userGain[p.id] : null } : null, stam: Math.round(p.stam ?? 100), life: this.lifeView(p, u), lastLife: u.lastLife || null, coins: Math.round(p.coins || 0), items: p.items || {}, equip: p.equip || [], susp: p.susp || 0, canAnswer: true, market: this.step.startsWith("market."), unsigned: p.team == null, seasonCards: g.P.player.cards };
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
