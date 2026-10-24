// Cosmetic unlocks: the Enter Code box and the trophy cabinet of plates, plus keeping the browser's collection in sync.
import { st, esc, send, store, toast, crestOfClub } from "./core.js";

export const unlockHandlers = {
  redeem() { const el = document.getElementById("codein"); const v = el ? el.value.trim() : ""; if (!v) return; send({ t: "redeem", code: v }); if (el) el.value = ""; },
  codeKey(a, el) { /* enter key handled in app.js keydown */ },
};

const stored = () => { try { return JSON.parse(store("plates") || "[]"); } catch { return []; } };
// Called with every lobby state: the browser remembers plates between games; the server only knows them once told.
export function unlockSync(S) {
  const you = S.players.find((p) => p.you); if (!you || S.step !== "lobby" || !you.unlocks) return;
  const have = new Set(you.unlocks), mem = stored(), all = [...new Set([...mem, ...you.unlocks])];
  if (all.length !== mem.length) store("plates", JSON.stringify(all));
  const missing = mem.filter((id) => !have.has(id) && st.cat.plates.some((p) => p.id === id));
  if (missing.length && st.ui.syncKey !== missing.join()) { st.ui.syncKey = missing.join(); send({ t: "unlocks", ids: all }); }
  const n = S.unlockNote; if (n && n.id !== st.ui.unlockNoteId) { st.ui.unlockNoteId = n.id; if (st.ui.unlockNoteSeen) toast(n.text); if (n.plate) st.ui.flashPlate = n.plate; }
  st.ui.unlockNoteSeen = true;
}

export const codeClubs = (you) => { const have = new Set((you && you.unlocks) || []); return st.cat.clubs.filter((c) => c.kind === "code" && have.has(c.unlock)); };
export const clubOpen = (c, you) => { const u = c.unlock || (c.kind === "throwback" ? "wayback" : null); return !u || ((you && you.unlocks) || []).includes(u); };

export function enterCode(you) {
  const plates = st.cat.plates, have = new Set((you && you.unlocks) || []);
  const tile = (p) => {
    const on = have.has(p.id), cl = st.clubBy[p.clubs[0]], flash = st.ui.flashPlate === p.id;
    if (!on) return `<div class="plate locked"><span class="pl-lock">🔒</span><b>???</b><span class="tiny">${esc(p.hint)}</span></div>`;
    const sw = p.clubs.slice(0, 4).map((s) => st.clubBy[s]).filter(Boolean);
    const art = p.kind === "club" && cl ? crestOfClub(cl, 34) : `<span class="pl-sw">${sw.map((c) => `<i style="background:${c.c1}"></i>`).join("") || "<i></i>"}</span>`;
    return `<div class="plate on ${flash ? "flash" : ""}">${art}<b>${esc(p.name)}</b><span class="tiny">${p.kind === "pack" ? `${p.clubs.length} clubs` : p.kind === "throwbacks" ? "Throwback shirts on every club" : p.kind === "variant" ? "Alternate kit" : "Club colours"}</span></div>`;
  };
  return `<div class="card"><h3>Enter code</h3><div class="row" style="gap:8px"><input id="codein" class="grow" placeholder="Got a code? Type it here" maxlength="40" autocomplete="off" spellcheck="false"><button class="btn pri" data-act="redeem">Unlock</button></div>
    <p class="small mute mt">Codes unlock cosmetic extras: club colours, throwback shirts and alternate kits. They stay on this browser, so you only enter each one once.</p>
    <div class="cabhead mt"><b>Trophy cabinet</b><span class="small mute">${have.size} / ${plates.length} plates</span></div><div class="cabinet mt">${plates.map(tile).join("")}</div></div>`;
}
