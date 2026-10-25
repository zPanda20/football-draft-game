// Substitution plans: a manager sets, between matches, the changes he wants made at half-time. They happen on their own
// unless he overrides them in the half-time window (which shows the plan already applied).
//   plan = { on, tired: { on, below }, subs: [{ out, in, when }] }
//   when: "always" | "tired" (the player coming off is below the tired line) | "losing" | "drawing" | "winning"
// A plan only ever uses what is there: a swap whose player is not on the pitch, or whose replacement is suspended, already
// playing or the wrong kind (outfield player for the keeper, or the reverse), is skipped. Pure functions, no randomness.
import { FORMATIONS, fitMult, fatigue } from "./roster.js";

export const WHEN = ["always", "tired", "losing", "drawing", "winning"];
export const MAX_SUBS = 4;
export const emptyPlan = () => ({ on: true, tired: { on: false, below: 45 }, subs: [] });

// What the server keeps: ids are whole numbers of players on the team (a half-filled row stays so the editor can finish it).
export function cleanPlan(raw, teamIds) {
  const ok = new Set(teamIds), id = (x) => (x != null && Number.isInteger(+x) && ok.has(+x) ? +x : null);
  const r = raw && typeof raw === "object" ? raw : {};
  const below = Math.max(20, Math.min(80, Math.round(+(r.tired && r.tired.below) || 45)));
  const subs = (Array.isArray(r.subs) ? r.subs : []).slice(0, MAX_SUBS).map((s) => ({ out: id(s && s.out), in: id(s && s.in), when: WHEN.includes(s && s.when) ? s.when : "always" }));
  return { on: r.on !== false, tired: { on: !!(r.tired && r.tired.on), below }, subs };
}

// lineup: the first-half XI. recs: the squad with half-time stamina in `stam` (suspended players left out).
// score: [own goals, opposing goals] at half-time. Returns the second-half lineup and what was changed.
export function applyPlan(plan, lineup, recs, score, P) {
  const lu = { formation: lineup.formation, gk: lineup.gk, out: lineup.out.slice() };
  const changes = [];
  if (!plan || plan.on === false) return { lineup: { ...lu, bench: benchOf(lu, recs) }, changes };
  const by = new Map(recs.map((p) => [p.id, p])), slots = FORMATIONS[lu.formation];
  const inXI = () => new Set([lu.gk, ...lu.out].filter((x) => x != null));
  const below = (plan.tired && plan.tired.below) || 45, lead = score[0] - score[1];
  const holds = { always: () => true, tired: (p) => p.stam < below, losing: () => lead < 0, drawing: () => lead === 0, winning: () => lead > 0 };
  const swapped = new Set();
  const swap = (outId, inId, why) => {
    if (outId === lu.gk) lu.gk = inId; else lu.out[lu.out.indexOf(outId)] = inId;
    swapped.add(outId); swapped.add(inId); changes.push({ out: outId, in: inId, why });
  };
  for (const s of plan.subs || []) {
    const o = by.get(s.out), i = by.get(s.in);
    if (!o || !i || s.out == null || s.in == null) continue;
    const x = inXI(); if (!x.has(s.out) || x.has(s.in) || swapped.has(s.out) || swapped.has(s.in)) continue;
    if ((s.out === lu.gk) !== (i.pos === "GK")) continue;                       // keepers only come on for keepers
    if (!(holds[s.when] || holds.always)(o)) continue;
    swap(s.out, s.in, s.when || "always");
  }
  if (plan.tired && plan.tired.on) {
    const worth = (p, slot) => fitMult(p.pos, slot, P) * p.ovr * fatigue(p.stam, P);
    const order = lu.out.map((id, k) => ({ id, k })).filter((e) => e.id != null && by.has(e.id) && !swapped.has(e.id) && by.get(e.id).stam < below).sort((a, b) => by.get(a.id).stam - by.get(b.id).stam);
    for (const e of order) {
      const cur = by.get(e.id), slot = slots[e.k], x = inXI();
      const cand = recs.filter((p) => !x.has(p.id) && !swapped.has(p.id) && p.pos !== "GK" && p.stam > cur.stam).map((p) => ({ p, w: worth(p, slot) })).sort((a, b) => b.w - a.w || a.p.id - b.p.id)[0];
      if (cand && cand.w > worth(cur, slot)) swap(e.id, cand.p.id, "tired");
    }
  }
  return { lineup: { ...lu, bench: benchOf(lu, recs) }, changes };
}
const benchOf = (lu, recs) => { const x = new Set([lu.gk, ...lu.out].filter((v) => v != null)); return recs.filter((p) => !x.has(p.id)).map((p) => p.id); };
