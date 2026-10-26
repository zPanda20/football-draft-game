// Lite mode, one person at a time. Lite is not a different game and not a softer one: whatever a person switches off is
// done for them the way a CPU club would do it (no bonus, no discount), and the screens that go with it are tucked
// under "More". A person can flip any switch back on, or graduate to Full, at any time.
export const LITE_KEYS = ["xi", "subs", "finance", "trades", "stats"];
export const FULL = Object.freeze({ xi: true, subs: true, finance: true, trades: true, stats: true });
export const LITE = Object.freeze({ xi: false, subs: false, finance: false, trades: false, stats: false });
export const liteOf = (p) => (p && p.lite ? p.lite : FULL);
export const isLite = (p) => LITE_KEYS.some((k) => liteOf(p)[k] === false);

export const liteMethods = {
  // { all: true|false } graduates to Full or goes back to Lite; { set: { xi: true, ... } } flips single switches.
  setLite(token, m) {
    const p = this.players.get(token); if (!p || p.mode === "player") return;
    if (m && (m.all === true || m.all === false)) p.lite = { ...(m.all ? FULL : LITE) };
    else if (m && m.set && typeof m.set === "object") { const n = { ...liteOf(p) }; for (const k of LITE_KEYS) if (typeof m.set[k] === "boolean") n[k] = m.set[k]; p.lite = n; }
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
