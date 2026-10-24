// Cosmetic unlocks ("plates" in the trophy cabinet). A plate is opened by typing a code; it unlocks club colour schemes,
// the throwback shirts or an alternate kit. Purely cosmetic: nothing here touches the match.
export const normCode = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
export const findPlate = (plates, text) => { const n = normCode(text); return n ? plates.find((p) => p.codes.some((c) => normCode(c) === n)) || null : null; };
// Which plate (if any) a club needs: a code club names its own, throwbacks need "Way Back", and the PSG TWD alt needs its own plate.
export const clubUnlock = (c) => (c ? c.unlock || (c.kind === "throwback" ? "wayback" : null) : null);
export const clubAllowed = (c, unlocked) => { const u = clubUnlock(c); return !u || (unlocked && unlocked.has(u)); };
