// WAG mode on the server: the role, the weekly choice window, requests with human footballers, and the hooks the match loop calls.
// The rules are in engine/wag.js. A WAG is a person in the room with a record in game.wag; it never gets a team or a player record.
import * as W from "../engine/wag.js";
import { deskStory } from "../engine/social.js";
import { makeRng } from "../engine/rng.js";

const OPEN_ACT = "md.lineup";
export const wagMethods = {
  isWagMode(p) { return !!p && p.mode === "wag"; },
  wagUsers() { return [...this.players.values()].filter((p) => this.isWagMode(p) && p.wid != null); },
  // What others may see of a WAG in the player list: a name and a gender. The portrait only goes to its owner.
  wagPub(p, token) { const w = p.wid != null && this.game ? W.wagOf(this.game, p.wid) : null, c = w ? { name: w.name, gender: w.g, img: w.img } : p.wchar || {}; return { name: c.name || p.name, g: c.gender || null, img: p.token === token ? c.img || null : undefined }; },
  wagRec(u) { return u && this.isWagMode(u) && u.wid != null && this.game ? W.wagOf(this.game, u.wid) : null; },
  wagUserOf(wid) { return [...this.players.values()].find((p) => this.isWagMode(p) && p.wid === wid) || null; },
  wagMe(token) { const u = this.players.get(token), w = this.wagRec(u); return w ? { u, w } : null; },
  // ---- lobby / profile ----
  defaultWagChar(token, name) {
    const rr = makeRng(this.code, "wagface", token), g = rr() < 0.5 ? "F" : "M";
    return { name: String(name || "WAG").slice(0, 22), gender: g, img: [Math.floor(rr() * 6), Math.floor(rr() * 6), Math.floor(rr() * 6)].join("-") };
  },
  // The profile can be changed in the lobby, while the others draft and in the pre-season market (and by a late joiner until they join).
  wagEditable(p) { return this.isWagMode(p) && (this.phase === "lobby" || this.phase === "draft" || this.phase === "market" || (p.late && p.wid == null)); },
  setWagChar(token, c) {
    const p = this.players.get(token); if (!p || !this.wagEditable(p) || !c) return;
    const out = p.wid != null && this.game ? W.wagOf(this.game, p.wid) : null, tgt = out || (p.wchar = p.wchar || this.defaultWagChar(token, p.name));
    if (typeof c.name === "string") { const n = c.name.trim().slice(0, 22); if (n) tgt.name = n; }
    if (c.gender === "F" || c.gender === "M") { if (out) out.g = c.gender; else tgt.gender = c.gender; }
    if (typeof c.img === "string" && (/^(\d-\d-\d|f:[\w.-]{1,40})$/.test(c.img) || this.portraitOk(p, c.img))) tgt.img = c.img;
    if (out) p.wchar = { name: out.name, gender: out.g, img: out.img };
    this.changed();
  },
  // After the league exists: every WAG gets their record. Not a team, not a player.
  createWags() {
    const g = this.game;
    for (const p of this.players.values()) {
      if (!this.isWagMode(p) || p.wid != null) continue;
      const c = p.wchar || this.defaultWagChar(p.token, p.name), w = W.createWag(g, { name: c.name, gender: c.gender, img: c.img }); p.wid = w.id;
    }
  },
  lateJoinWag(token) {
    const p = this.players.get(token); if (!p || !p.late || p.wid != null || !this.game || !this.isWagMode(p)) return;
    const c = p.wchar || this.defaultWagChar(token, p.name), w = W.createWag(this.game, { name: c.name, gender: c.gender, img: c.img }); p.wid = w.id;
    this.notify(`${w.name} has joined the game as a WAG.`); this.changed();
  },
  // ---- who the room is waiting for ----
  wagNeeds(u) {
    if (!u.connected || u.wid == null) return false;
    if (this.step === OPEN_ACT) return !u.auto && !((this.wagRec(u) || {}).act);
    if (this.step === "gala.prep" || this.step === "gala.live") return this.galaNeeds(u.wid, u.auto);
    return false;
  },
  wagOpen() { return this.wagUsers().some((u) => u.connected && !u.auto && !(this.wagRec(u) || {}).act); },
  // ---- choices ----
  wagDay() { return this.step === OPEN_ACT ? this.mdIdx : this.mdIdx + 1; },
  wagNote(wid, text) { const u = this.wagUserOf(wid); if (u) this.notify(text, u.token); },
  wagDeliver(notes) { for (const n of notes || []) { if (n.wag != null) this.wagNote(n.wag, n.text); else if (n.pid != null) this.privateNote(n.pid, n.text); } },
  wagAct(token, c) {
    const me = this.wagMe(token); if (!me || this.step !== OPEN_ACT || !c) return;
    const day = this.mdIdx, res = W.setAct(this.game, me.w, c, { day, fixtures: this.days[day] || [] });
    me.u.wagNote = res.ok ? "Saved. It happens at kick-off." : res.why;
    if (res.ok) this.wagDeliver(res.notes);
    this.changed(); if (res.ok) this.maybeGo();
  },
  // The match is its own choice (a ticket, a team, maybe a player), made in the same window as the week's activity.
  wagMatch(token, c) {
    const me = this.wagMe(token); if (!me || this.step !== OPEN_ACT || !c) return;
    const res = W.setMatch(this.game, me.w, c, { fixtures: this.days[this.mdIdx] || [] });
    me.u.wagNote = res.ok ? "Saved. The ticket is paid at kick-off." : res.why; this.changed();
  },
  wagMatchClear(token) { const me = this.wagMe(token); if (!me || this.step !== OPEN_ACT) return; W.clearMatch(me.w); this.changed(); },
  // While the matches are on: the WAG's sequence choice for the beat that is open now. Never holds anything up (see wagHalf / wagFinish).
  wagSeq(token, i) {
    const me = this.wagMe(token); if (!me || !["md.half1", "md.half", "md.half2"].includes(this.step)) return;
    const res = W.seqChoose(this.game, me.w, i | 0); me.u.wagNote = res.ok ? null : res.why; if (res.ok) this.wagDeliver(res.notes); this.changed();
  },
  wagClear(token) { const me = this.wagMe(token); if (!me || this.step !== OPEN_ACT) return; this.wagDeliver(W.clearAct(this.game, me.w)); me.u.wagNote = null; this.changed(); },
  // One door for both sides: a WAG asking a footballer, or a footballer asking a WAG.
  wagWho(token) {
    const u = this.players.get(token); if (!u || !this.game) return null;
    if (this.isWagMode(u)) { const w = this.wagRec(u); return w ? { u, id: w.id } : null; }
    if (this.isPlayerMode(u) && u.pid != null) return { u, id: "u:" + u.pid };
    return null;
  },
  wagAsk(token, to, kind, tier, pub) {
    const me = this.wagWho(token); if (!me || this.step !== OPEN_ACT) return;
    const res = W.sendRequest(this.game, me.id, String(to), String(kind), { tier: String(tier || ""), pub: !!pub, day: this.mdIdx });
    me.u.wagNote = res.ok ? "Sent. They decide before kick-off." : res.why; if (res.ok) this.wagDeliver(res.notes); this.changed();
  },
  wagAnswer(token, id, yes) {
    const me = this.wagWho(token); if (!me || this.step !== OPEN_ACT) return;
    const res = W.replyRequest(this.game, me.id, id | 0, !!yes, { day: this.mdIdx });
    me.u.wagNote = res.ok ? (res.yes ? "Accepted." : "Declined.") : res.why; if (res.ok) this.wagDeliver(res.notes); this.changed(); if (res.ok && res.yes) this.maybeGo();
  },
  wagGift(token, to, tier, pub) {
    const me = this.wagMe(token); if (!me || ![OPEN_ACT, "md.result"].includes(this.step)) return;
    const res = W.sendGift(this.game, me.w, String(to), String(tier), !!pub, { day: this.mdIdx });
    me.u.wagNote = res.ok ? (res.req ? "Sent: they decide whether to accept." : `Gift sent to ${res.name}.`) : res.why; if (res.ok) this.wagDeliver(res.notes); this.changed();
  },
  // A footballer who changes their own week frees the WAG they had said yes to.
  wagFootballerMoved(pid) { this.wagDeliver(W.footballerChangedWeek(this.game, pid)); },
  // ---- hooks from the match loop ----
  // Kick-off: everything chosen is settled once (tickets, dates, content); the league desk gets at most the usual one slot.
  wagKickoff() {
    const g = this.game; if (!g || !g.wag || !Object.keys(g.wag.list).length) return;
    const res = W.kickoff(g, { day: this.mdIdx, fixtures: this.days[this.mdIdx] || [] }); if (res.again) return;
    this.wagDeliver(res.notes); for (const s of res.stories) deskStory(g, s);
    for (const u of this.wagUsers()) u.wagNote = null;
  },
  // Half-time: a first choice nobody made is made for them (the safe one), and the second choice opens. Full time: whatever is left is decided before the result is public.
  wagHalf() { const g = this.game; if (!g || !g.wag) return; this.wagDeliver(W.seqHalf(g, { day: this.mdIdx }).notes); },
  wagFinish() { const g = this.game; if (!g || !g.wag) return; this.wagDeliver(W.seqFinish(g, { day: this.mdIdx }).notes); },
  // Full time: an attendance becomes an encounter, after the result is public. Never touches the match.
  wagAfter() {
    const g = this.game; if (!g || !g.wag || !this.lastDay) return;
    const results = this.lastDay.matches.map((m) => ({ a: m.a, b: m.b, ga: m.score[0], gb: m.score[1] }));
    this.wagDeliver(W.afterMatch(g, { day: this.lastDay.day, results }).notes);
  },
  // ---- what each person sees ----
  wagView(token) {
    const me = this.wagMe(token); if (!me || !this.game) return null;
    const day = this.wagDay(), v = W.viewFor(this.game, me.w, { day, fixtures: this.days ? this.days[day] || [] : [], open: this.step === OPEN_ACT });
    v.note = me.u.wagNote || null; v.auto = !!me.u.auto; v.step = this.step; v.social = this.settings.social !== false; v.chooseOpen = this.step === OPEN_ACT; v.seqLive = ["md.half1", "md.half", "md.half2"].includes(this.step); v.giftOpen = [OPEN_ACT, "md.result"].includes(this.step);
    v.next = day + 1; v.total = (this.days || []).length; v.edit = this.wagEditable(me.u);
    return v;
  },
  // For a footballer: the WAGs in the room, and the requests that involve him.
  wagFor(p) {
    const g = this.game; if (!g || !g.wag) return { list: [], incoming: [], outgoing: [] };
    const id = "u:" + p.id, rq = W.requestsFor(g, id), mineSeeing = new Set(W.seeingOf(g, id).map((x) => x.w));
    const taken = W.committed(g, id);
    return { list: W.wagList(g).map((w) => ({ id: w.id, name: w.name, g: w.g, img: w.img, fol: w.fol, seeing: mineSeeing.has(w.id), asked: rq.outgoing.some((r) => r.who.id === w.id), can: !taken && this.step === OPEN_ACT && (p.coins || 0) >= g.P.social.wag.cost.date })), incoming: rq.incoming, outgoing: rq.outgoing, cost: g.P.social.wag.cost.date, open: this.step === OPEN_ACT, booked: p.life && p.life.act && p.life.act.wag ? { id: p.life.act.wag, name: (W.wagOf(g, p.life.act.wag) || {}).name } : null, taken };
  },
};
