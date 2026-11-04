// The social layer on the server: manager style, the inbox of situations, public comments, and the hooks the match loop calls.
// The rules live in engine/situations.js and engine/social.js; this file only checks who may do what, and when.
import { socialTick, recordStarts, afterMatch, benchOrders, listFor, answer, makeComment, commentState, commentLines, reputation, seasonEndSocial, socialOn, noteParty } from "../engine/situations.js";
import { ensureSoc, mgrOf, setStyle, styleOf, STYLES, bossName, trustOf, trustWord, mrel, REL_WORD, archiveFor, temper, TEMPER_TEXT } from "../engine/social.js";

const OPEN = ["md.lineup", "md.result"];
export const socialMethods = {
  socialEnabled() { return !!this.game && this.settings.social !== false; },
  // The engine knows teams, not people: give it the owners' names and the lobby switch.
  wireSocial() {
    const g = this.game; if (!g) return;
    g.socialOn = this.settings.social !== false; g.galaOn = this.settings.gala !== false;
    g.ownerName = (id) => { const p = this.playerOfTeam(id); return p ? p.name : null; };
  },
  isManager(p) { return !!p && !this.isPlayerMode(p) && p.teamId != null; },
  // Manager style: chosen in the lobby (or until the first kick-off); it only bends how trust moves.
  setStyleFor(token, style) {
    const p = this.players.get(token); if (!p || this.isPlayerMode(p)) return;
    const s = STYLES[style] ? style : null;
    if (this.game && !(this.game.season === 1 && this.mdIdx <= 0 && this.phase !== "offseason")) return;
    p.style = s; if (this.game && p.teamId != null) setStyle(this.game, p.teamId, s);
    this.changed();
  },
  applyStyles() { for (const p of this.players.values()) if (p.teamId != null && p.style) setStyle(this.game, p.teamId, p.style); },
  // ---- hooks from the match loop ----
  socialDay() {
    const g = this.game; this.wireSocial();
    const out = socialTick(g, { day: this.mdIdx, total: this.days.length, fixtures: this.days[this.mdIdx] || [], table: this.shownTable || [] });
    for (const s of out.sits) { const m = this.playerOfTeam(s.team); if (m) this.notify("New in your inbox: something needs your attention (Social bar above your line-up).", m.token); }
  },
  socialStarts() {
    if (!this.socialEnabled()) return;
    const starts = [];
    for (const m of this.live || []) [0, 1].forEach((i) => { const t = m.sides[i]; if (t.human) { const l = m.lineups[i]; starts.push({ team: t.id, ids: [l.gk, ...l.out] }); } });
    this.socialNotes(recordStarts(this.game, this.mdIdx, starts, this.days.length));
  },
  socialAfter() {
    if (!this.game || !this.lastDay) return;
    const results = this.lastDay.matches.map((m) => ({ a: m.a, b: m.b, ga: m.score[0], gb: m.score[1], goals: m.goals || [] }));
    this.socialNotes(afterMatch(this.game, { day: this.lastDay.day, results }));
  },
  socialNotes(notes) { for (const n of notes || []) { if (n.team != null) { const m = this.playerOfTeam(n.team); if (m) this.notify(n.text, m.token); } else if (n.pid != null) this.privateNote(n.pid, n.text); } },
  // Players a manager has ordered out: the line-up is rebuilt without them (never leaving a team without a keeper).
  benchBan(team, recs) {
    const ban = this.socialEnabled() ? benchOrders(this.game, team.id, this.mdIdx) : new Set();
    if (!ban.size) return null;
    const rr = recs.filter((r) => !ban.has(r.id)); return rr.some((r) => r.pos === "GK") && rr.length >= 6 ? rr : null;
  },
  // ---- choices ----
  base() { return this.step === "md.lineup" ? this.mdIdx : this.mdIdx + 1; },
  socialAnswer(token, id, opt) {
    const u = this.players.get(token); if (!u || !this.game || !OPEN.includes(this.step)) return;
    const who = this.isPlayerMode(u) ? { pid: u.pid } : { team: u.teamId };
    const res = answer(this.game, id | 0, String(opt), who, { base: this.base() });
    u.socNote = res.ok ? res.msg : res.why; if (res.ok) this.socialNotes(res.notes); this.changed();
  },
  socialComment(token, kind, line, target) {
    const u = this.players.get(token); if (!this.isManager(u) || !this.game || !OPEN.includes(this.step)) return;
    const base = this.base(), fx = (this.days || [])[base] || null, f = fx ? fx.find((x) => x[0] === u.teamId || x[1] === u.teamId) : null, opp = f ? (f[0] === u.teamId ? f[1] : f[0]) : null;
    const res = makeComment(this.game, u.teamId, { kind: String(kind), line: String(line), target: target == null ? null : target | 0, opp, matchDay: base });
    u.socNote = res.ok ? res.msg : res.why; if (res.ok) this.socialNotes(res.notes); this.changed();
  },
  // ---- what each person sees ----
  socialView(token) {
    const g = this.game, u = this.players.get(token); if (!g || !u) return null;
    const on = this.settings.social !== false;
    if (this.isPlayerMode(u)) {
      if (u.pid == null) return null;
      const p = g.players[u.pid], team = p ? p.team : null;
      return { on, role: "player", inbox: on ? listFor(g, { pid: u.pid }, this.base()) : [], mgr: team != null && g.teams[team].human ? { team, boss: bossName(g, team), trust: trustWord(trustOf(g, team, u.pid)) } : null, archive: archiveFor(g, { pid: u.pid, team }, 8), note: u.socNote || null, open: OPEN.includes(this.step) };
    }
    if (u.teamId == null) return null;
    const t = g.teams[u.teamId], m = mgrOf(g, t.id), day = this.step === "md.lineup" ? this.mdIdx : this.mdIdx + 1, cs = commentState(g, t.id, this.mdIdx);
    const fx = (this.days || [])[day] || null, f = fx ? fx.find((x) => x[0] === t.id || x[1] === t.id) : null, opp = f ? (f[0] === t.id ? f[1] : f[0]) : null;
    const others = this.humanTeams().filter((x) => x.id !== t.id).map((x) => ({ team: x.id, name: x.name, boss: bossName(g, x.id), rel: mrel(g, t.id, x.id), word: REL_WORD[mrel(g, t.id, x.id)], said: m.season.targets.includes(x.id) }));
    const squadMood = t.players.map((id) => g.players[id]).filter((p) => p && !p.retired).map((p) => ({ id: p.id, name: p.name, pos: p.pos, ovr: p.ovr, user: !!p.user, t: trustOf(g, t.id, p.id), word: trustWord(trustOf(g, t.id, p.id)), temper: p.user ? null : TEMPER_TEXT[temper(g, p.id)] })).filter((x) => x.t !== 0).sort((a, b) => a.t - b.t).slice(0, 8);
    return { on, role: "manager", style: m.style, styles: Object.entries(STYLES).map(([id, s]) => ({ id, name: s.name, blurb: s.blurb })), canStyle: g.season === 1 && this.mdIdx <= 0 && this.phase !== "offseason", rep: reputation(g, t.id),
      inbox: on ? listFor(g, { team: t.id }, this.base()) : [], comment: { ...cs, lines: commentLines(), opp: opp != null && opp !== t.id ? { team: opp, name: g.teams[opp].name } : null, day, others },
      promises: m.promises.filter((x) => x.status === "open").map((x) => ({ pid: x.pid, name: (g.players[x.pid] || {}).name, due: x.due + 1 })), mood: squadMood, archive: archiveFor(g, { team: t.id }, 10), note: u.socNote || null, open: OPEN.includes(this.step) };
  },
};
export { seasonEndSocial, noteParty };
