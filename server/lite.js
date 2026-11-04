// Lite mode, one person at a time. Lite is not a different game and not a softer one: whatever a person switches off is
// done for them the way a CPU club would do it (no bonus, no discount), and the screens that go with it are tucked
// under "More". A person can flip any switch back on, or graduate to Full, at any time.
export const LITE_KEYS = ["xi", "subs", "finance", "trades", "stats"];
export const FULL = Object.freeze({ xi: true, subs: true, finance: true, trades: true, stats: true });
export const LITE = Object.freeze({ xi: false, subs: false, finance: false, trades: false, stats: false });
// Lite is a path: Season 1 = draft, market, your own line-up and half-time changes, all with hints; Season 2 adds the auto-sub plan
// and the stats screens; Season 3 hands over re-signs and trades. `p.path` marks a Lite person, `p.over` holds any switch they flipped
// themselves, `p.stage` (1-3) is kept up to date by the room. A person who is not on the path keeps their plain switches in `p.lite`.
export const PATH = Object.freeze({
  1: Object.freeze({ xi: true, subs: true, finance: false, trades: false, stats: false, plan: false }),
  2: Object.freeze({ xi: true, subs: true, finance: false, trades: false, stats: true, plan: true }),
  3: Object.freeze({ xi: true, subs: true, finance: true, trades: true, stats: true, plan: true }),
});
export const stageFor = (season, step) => Math.max(1, Math.min(3, (season || 0) + (String(step || "").startsWith("off.") ? 1 : 0) || 1));
export const liteOf = (p) => (p && p.path ? { ...PATH[p.stage || 1], ...(p.over || {}) } : p && p.lite ? p.lite : FULL);
export const isLite = (p) => !!(p && p.path) || LITE_KEYS.some((k) => liteOf(p)[k] === false);

export const liteMethods = {
  // Called on every change: Lite people move up a stage when the season (or the off-season before it) does.
  syncStages() { for (const p of this.players.values()) if (p.path) p.stage = stageFor(this.game ? this.game.season : 0, this.step); },
  // { all: true|false } graduates to Full or goes back to Lite; { set: { xi: true, ... } } flips single switches.
  setLite(token, m) {
    const p = this.players.get(token); if (!p || p.mode === "player" || p.mode === "wag") return;
    if (m && (m.all === true || m.all === false)) { if (m.all) { p.path = false; p.over = {}; p.lite = { ...FULL }; } else { p.path = true; p.over = {}; p.lite = undefined; p.stage = stageFor(this.game ? this.game.season : 0, this.step); } }
    else if (m && m.set && typeof m.set === "object") {
      if (p.path) { const o = { ...(p.over || {}) }; for (const k of LITE_KEYS) if (typeof m.set[k] === "boolean") o[k] = m.set[k]; p.over = o; }
      else { const n = { ...liteOf(p) }; for (const k of LITE_KEYS) if (typeof m.set[k] === "boolean") n[k] = m.set[k]; p.lite = n; }
    }
    else return;
    this.changed();
    // A switch turned off mid-step hands the job over at once: nothing is left waiting on the screen the person just hid.
    if (p.teamId != null && this.passive(p)) { const step = this.step; if (["md.half", "off.trade", "off.resign"].includes(step)) this.markReady(p.teamId, true); }
  },
  // True when this person's job at the current step is done for them (Auto, or the matching switch is off).
  passive(p) {
    if (!p) return false; if (p.auto) return true;
    const l = liteOf(p);
    switch (this.step) { case "md.half": return !l.subs; case "off.trade": return !l.trades; case "off.resign": return !l.finance; }
    return false;
  },
};
