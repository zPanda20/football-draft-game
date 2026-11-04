// The mid-season gala on the server: when it is held, who is on the guest list, the three timed steps (prepare, live, roundup) and what each person sees.
// The rules are in engine/gala.js. Every transition checks the step it expects, so a late timer or a double click can never run one twice or leave the room stuck.
import { galaBegin, galaSeat, galaResolve, galaOf, galaDay, invite, answerInvite, withdrawInvite, seatRequest, optionsFor, pick, respond, promptsFor, attendeesOf, tableOf, mk, fk, gk, history } from "../engine/gala.js";
import { ensureSoc, bossName, teamName, trustOf } from "../engine/social.js";
import { ensureLife, partnerById, isHuman } from "../engine/life.js";

export const STEPS = ["gala.prep", "gala.live", "gala.end"];
export const galaMethods = {
  galaEnabled() { return !!this.game && this.settings.gala !== false; },
  // Connected managers and footballers: the guest list. Someone who is away is simply not invited.
  galaPeople() {
    const g = this.game, managers = this.humanTeams().filter((t) => this.humanFor(t.id)).map((t) => t.id);
    const players = this.userPlayers().filter((u) => u.connected && g.players[u.pid] && !g.players[u.pid].retired).map((u) => u.pid);
    return { managers, players };
  },
  galaKey(token) { const u = this.players.get(token); if (!u) return null; if (this.isPlayerMode(u)) return u.pid != null ? fk(u.pid) : null; return u.teamId != null ? mk(u.teamId) : null; },
  galaUserOf(key) { return [...this.players.values()].find((u) => this.galaKey(u.token) === key) || null; },
  galaDue() {
    const g = this.game; if (!this.galaEnabled() || this.step !== "md.result") return false;
    const S = ensureSoc(g), total = this.days.length, day = galaDay(total);
    if (day < 0 || S.galaDone[g.season] || this.mdIdx < day || this.mdIdx > total - 3) return false;
    const p = this.galaPeople(); return p.managers.length + p.players.length >= g.P.social.gala.minUsers;
  },
  // called when the full-time screen has been shown: the gala, or on to the next matchday
  afterResult() { if (this.galaDue()) this.startGala(); else this.nextMatchday(); },
  startGala() {
    const g = this.game, K = g.P.social.gala, G = galaBegin(g, this.galaPeople(), this.mdIdx); if (!G) return this.nextMatchday();
    this.step = "gala.prep"; this.ready = new Set(); this.openWindow();
    for (const u of this.players.values()) { const k = this.galaKey(u.token); if (k && G.att[k]) this.notify("The mid-season gala is tonight. Invite a date, ask to share a table, then get ready (Gala screen).", u.token); }
    this.after(K.prepSec * 1000, () => this.galaLive());
    this.changed();
  },
  galaLive() {
    if (this.step !== "gala.prep") return; const g = this.game, G = galaOf(g), K = g.P.social.gala; if (!G) return this.nextMatchday();
    this.closeWindow(); this.deliverGala(galaSeat(g));
    this.step = "gala.live"; this.openWindow();
    for (const u of this.players.values()) {                                  // a manager on Auto raises a gracious toast; an Auto footballer simply attends
      const k = this.galaKey(u.token); if (k && G.att[k] && u.auto && !this.isPlayerMode(u) && !G.picks[k]) pick(g, k, "toast:gracious");
    }
    this.after(K.liveSec * 1000, () => this.galaEnd());
    this.changed(); this.galaCheck();
  },
  galaEnd() {
    if (this.step !== "gala.live") return; const g = this.game, K = g.P.social.gala;
    this.closeWindow(); const res = galaResolve(g); this.deliverGala(res.notes);
    for (const u of this.players.values()) { const k = this.galaKey(u.token); if (k && galaOf(g).att[k]) this.notify("The gala is over: see the roundup.", u.token); }
    this.step = "gala.end"; this.after(K.endSec * 1000, () => this.galaFinish());
    this.changed();
  },
  galaFinish() { if (this.step !== "gala.end") return; this.nextMatchday(); },
  deliverGala(notes) { for (const n of notes || []) { if (n.team != null) { const m = this.playerOfTeam(n.team); if (m) this.notify(n.text, m.token); } else if (n.pid != null) this.privateNote(n.pid, n.text); } },
  // Who the room is still waiting for: not ready yet (prepare), or no interaction chosen / an open question to answer (live).
  galaNeeds(key, auto) {
    const G = galaOf(this.game); if (!G || !G.att[key]) return false;
    if (auto) return false;
    if (this.step === "gala.prep") return !this.ready.has(key);
    if (this.step === "gala.live") return !G.picks[key] || G.prompts.some((p) => p.to === key && p.status === "open");
    return false;
  },
  // Close a step early when every guest is done (a short beat so the last click can be seen).
  galaCheck() {
    const g = this.game, G = galaOf(g); if (!G || this.paused) return;
    const st0 = this.step; if (st0 !== "gala.prep" && st0 !== "gala.live") return;
    const open = [...this.players.values()].some((u) => { const k = this.galaKey(u.token); return k && G.att[k] && u.connected && this.galaNeeds(k, u.auto); });
    if (open) return;
    if (st0 === "gala.prep") this.after(1200, () => { if (this.step === st0) this.galaLive(); });
    else this.after(1600, () => { if (this.step === st0) this.galaEnd(); });
  },
  // ---- choices ----
  galaGuard(token, steps) { const k = this.galaKey(token), G = this.game && galaOf(this.game); if (!k || !G || !steps.includes(this.step) || G.season !== this.game.season || !G.att[k]) return null; return { k, G, u: this.players.get(token) }; },
  galaInvite(token, to) {
    const x = this.galaGuard(token, ["gala.prep"]); if (!x || !this.isPlayerMode(x.u)) return;
    const res = invite(this.game, this.game.players[x.u.pid], String(to)); x.u.galaNote = res.ok ? "Invitation sent." : res.why; if (res.ok) this.deliverGala(res.notes); this.changed();
  },
  galaAnswer(token, id, yes) {
    const x = this.galaGuard(token, ["gala.prep"]); if (!x || !this.isPlayerMode(x.u)) return;
    const res = answerInvite(this.game, this.game.players[x.u.pid], id | 0, !!yes); x.u.galaNote = res.ok ? (res.yes ? "You are going together." : "Declined.") : res.why; if (res.ok) this.deliverGala(res.notes); this.changed();
  },
  galaWithdraw(token, id) { const x = this.galaGuard(token, ["gala.prep"]); if (!x || !this.isPlayerMode(x.u)) return; const r = withdrawInvite(this.game, this.game.players[x.u.pid], id | 0); x.u.galaNote = r.ok ? "Withdrawn." : r.why; this.changed(); },
  galaSeatReq(token, target) {
    const x = this.galaGuard(token, ["gala.prep"]); if (!x) return;
    const r = seatRequest(this.game, x.k, target ? String(target) : null); x.u.galaNote = r.ok ? (target ? "Seating request noted. The organisers will try, but there are no promises." : "Request withdrawn.") : r.why; this.changed();
  },
  galaReady(token, on) { const x = this.galaGuard(token, ["gala.prep"]); if (!x) return; if (on === false) this.ready.delete(x.k); else this.ready.add(x.k); this.changed(); this.galaCheck(); },
  galaPick(token, optId) {
    const x = this.galaGuard(token, ["gala.live"]); if (!x) return;
    const id = String(optId);
    let res; if (id === "pass") { if (x.G.picks[x.k]) res = { ok: false, why: "You have used your one interaction." }; else { x.G.picks[x.k] = { opt: "pass", kind: "pass", with: null }; res = { ok: true, notes: [] }; } } else res = pick(this.game, x.k, id);
    x.u.galaNote = res.ok ? (id === "pass" ? "You are enjoying the evening." : res.opt && res.opt.needs ? "Asked. Waiting for their answer." : "Done.") : res.why;
    if (res.ok) this.deliverGala(res.notes); this.changed(); this.galaCheck();
  },
  galaRespond(token, id, mode) {
    const x = this.galaGuard(token, ["gala.live"]); if (!x) return;
    const r = respond(this.game, x.k, id | 0, String(mode)); x.u.galaNote = r.ok ? "Answered." : r.why; this.changed(); this.galaCheck();
  },
  // ---- what each person sees ----
  galaView(token) {
    const g = this.game, G = g && galaOf(g); if (!G || G.season !== g.season || !STEPS.includes(this.step)) return null;
    const me = this.galaKey(token), u = this.players.get(token), mine = me && G.att[me] ? G.att[me] : null;
    const nameOf = (k) => (G.att[k] ? G.att[k].name : "?");
    const att = attendeesOf(G).map((a) => ({ you: a.key === me, key: a.key, name: a.name, kind: a.kind, team: a.team ?? null, club: a.team != null ? teamName(g, a.team) : null, host: a.host ?? null, acted: !!G.picks[a.key], ready: this.ready.has(a.key), table: G.status === "prep" ? null : (tableOf(G, a.key) || {}).id ?? null }));
    const v = { status: G.status, step: this.step, you: me, attending: !!mine, kind: mine ? mine.kind : null, att, note: u && u.galaNote || null, ready: !!(me && this.ready.has(me)) };
    if (mine && G.status === "prep") {
      v.seatReq = G.seatReq[me] || null; v.seatLimit = g.P.social.gala.seatPerTarget;
      if (mine.kind === "player") {
        const p = g.players[mine.pid], L = ensureLife(g, p), cur = L.partner;
        const npc = ((L.opts && L.opts.ids) || []).concat(cur && !((L.opts && L.opts.ids) || []).includes(cur.id) ? [cur.id] : []).map((id) => partnerById(id)).filter(Boolean);
        v.people = npc.map((i) => ({ id: i.id, name: i.name }));
        v.invites = G.invites.filter((i) => i.from === mine.pid || i.to === "u:" + mine.pid).map((i) => ({ id: i.id, status: i.status, out: i.from === mine.pid, who: isHuman(i.to) ? (g.players[+i.to.slice(2)] || {}).name : (partnerById(i.to) || {}).name, withId: isHuman(i.to) ? i.to : i.to, from: g.players[i.from].name }));
        v.humans = att.filter((a) => a.kind === "player" && a.key !== me).map((a) => ({ id: "u:" + g.players[+a.key.slice(1)].id, name: a.name }));
        v.maxInvites = g.P.social.invite.maxOpen;
      }
    }
    if (mine && G.status === "live") {
      const tb = tableOf(G, me); v.table = tb ? tb.seats.map((k) => ({ key: k, name: nameOf(k), kind: G.att[k].kind })) : [];
      v.tables = G.tables.map((t) => ({ id: t.id, seats: t.seats.map((k) => ({ key: k, name: nameOf(k), kind: G.att[k].kind })) }));
      v.pick = G.picks[me] ? { opt: G.picks[me].opt } : null; v.options = G.picks[me] ? [] : optionsFor(g, me); v.prompts = promptsFor(g, me);
      v.date = mine.kind === "player" && G.dates[mine.pid] ? (G.dates[mine.pid].npc ? (partnerById(G.dates[mine.pid].npc) || {}).name : nameOf(fk(G.dates[mine.pid].human))) : null;
    }
    if (G.status === "live" && !mine) v.tables = G.tables.map((t) => ({ id: t.id, seats: t.seats.map((k) => ({ key: k, name: nameOf(k), kind: G.att[k].kind })) }));
    if (G.status === "end" && G.roundup) {
      v.roundup = { head: G.roundup.head, lines: G.roundup.lines.filter((l) => l.tag !== "private" || (me && (l.keys || []).includes(me))).map((l) => ({ text: l.text, tag: l.tag })) };
      v.tables = G.tables.map((t) => ({ id: t.id, seats: t.seats.map((k) => ({ key: k, name: nameOf(k), kind: G.att[k].kind })) }));
    }
    return v;
  },
};
