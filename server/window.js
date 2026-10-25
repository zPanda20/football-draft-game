// The in-season transfer window: for the first few matchdays of a season, between matches, managers can trade with any
// club, sign free agents straight away (no lottery) and drop players (no refund). Then the window shuts.
import { feeFor, maxLen, rosterRoom } from "../engine/market.js";
import { cleanPlan } from "../engine/subplan.js";

const OPEN_STEPS = ["season.intro", "md.lineup", "md.result"];

export const windowMethods = {
  // done = matchdays already played; left = matchdays whose pre-match stage is still to come (the deadline is the kick-off of matchday `total`)
  windowInfo() {
    const g = this.game, W = g ? g.P.transfer.windowWeeks : 0;
    if (!g || this.phase !== "season" || !this.days) return { open: false, total: W, left: 0, done: 0 };
    const done = this.step === "md.result" ? this.mdIdx + 1 : Math.max(0, this.mdIdx), left = Math.max(0, W - done);
    return { open: OPEN_STEPS.includes(this.step) && left > 0, total: W, left, done };
  },
  tradeOpen() { return this.step === "off.trade" || this.windowInfo().open; },
  // free agents shown in the window's shop: the best of the pool
  windowPool() {
    const g = this.game;
    return g.pool.map((id) => g.players[id]).filter((p) => p && !p.retired && !p.user).sort((a, b) => b.ovr - a.ovr || a.id - b.id).slice(0, 150).map((p) => p.id);
  },
  // a roster change (trade, drop) must not leave a stale line-up, plan or worn item behind
  purgeRoster(ti) {
    const t = this.game.teams[ti], has = new Set(t.players);
    if (t.equip) for (const [iid, pid] of Object.entries(t.equip)) if (!has.has(pid)) delete t.equip[iid];
    if (t.plan) t.plan = cleanPlan(t.plan, t.players);
  },
  windowSign(token, pid, len) {
    const p = this.players.get(token); if (!p || p.teamId == null || !this.windowInfo().open) return;
    const g = this.game, t = g.teams[p.teamId], pl = g.players[pid | 0];
    if (!pl || !g.pool.includes(pl.id) || pl.retired || pl.user || rosterRoom(t, g.P) <= 0) return;
    len = Math.max(1, Math.min(maxLen(g, false), len | 0 || 1));
    const fee = feeFor(pl, len, g.P);
    if (t.coins < fee) return;
    t.coins -= fee; pl.team = t.id; pl.contract = len; t.players.push(pl.id); g.pool = g.pool.filter((x) => x !== pl.id);
    this.pushFeed({ kind: "market", team: t.id, what: "p", id: pl.id, paid: fee, len });
    this.changed();
  },
  // Dropping a player: he goes to the free-agent pool, nothing is refunded. A squad keeps its minimum and at least one keeper.
  windowDrop(token, pid) {
    const p = this.players.get(token); if (!p || p.teamId == null || !this.windowInfo().open) return;
    const g = this.game, t = g.teams[p.teamId], pl = g.players[pid | 0];
    if (!pl || pl.user || !t.players.includes(pl.id)) return;
    if (t.players.length <= g.P.money.rosterMin) return this.notify(`A squad needs at least ${g.P.money.rosterMin} players.`);
    if (pl.pos === "GK" && t.players.filter((id) => g.players[id].pos === "GK").length <= 1) return this.notify("You cannot drop your only keeper.");
    t.players = t.players.filter((id) => id !== pl.id); pl.team = null; pl.contract = 0; g.pool.push(pl.id);
    this.purgeRoster(t.id);
    this.pushFeed({ kind: "drop", team: t.id, id: pl.id });
    this.changed();
  },
  expireOffers() { if (this.trade) for (const o of this.trade.offers) if (o.status === "open") o.status = "expired"; },
};
