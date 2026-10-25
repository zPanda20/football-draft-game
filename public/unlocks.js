// Cosmetic unlocks: the Enter Code box and the trophy cabinet of plates, plus keeping the browser's collection in sync.
import { st, esc, send, store, toast, crestOfClub, club, longName } from "./core.js";

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
  const n = S.unlockNote; if (n && n.id !== st.ui.unlockNoteId) { st.ui.unlockNoteId = n.id; if (st.ui.unlockNoteSeen) { if (n.plate) plateFx(n.plate); else toast(n.text); } if (n.plate) st.ui.flashPlate = n.plate; }
  st.ui.unlockNoteSeen = true;
}

export const codeClubs = (you) => { const have = new Set((you && you.unlocks) || []); return st.cat.clubs.filter((c) => c.kind === "code" && have.has(c.unlock)); };
export const clubOpen = (c, you) => { const u = c.unlock || (c.kind === "throwback" ? "wayback" : null); return !u || ((you && you.unlocks) || []).includes(u); };

const KIND_SUB = { club: "A new club to play as", pack: (p) => `${p.clubs.length} new clubs to play as`, throwbacks: "Throwback shirts on every club", variant: "An alternate away kit" };
// A plate: gold with its rivets when it is yours, a locked slot when it is not. Also the plate shown in the unlock reveal.
export function plateTile(p, on, flash = false) {
  const cl = st.clubBy[p.clubs[0]];
  if (!on) return `<div class="plate locked"><span class="pl-lock">🔒</span><b>???</b><span class="tiny">${esc(p.hint)}</span></div>`;
  const sw = p.clubs.slice(0, 4).map((s) => st.clubBy[s]).filter(Boolean);
  const art = p.kind === "club" && cl ? crestOfClub(cl, 34) : `<span class="pl-sw">${sw.map((c) => `<i style="background:${c.c1}"></i>`).join("") || "<i></i>"}</span>`;
  return `<div class="plate on ${flash ? "flash" : ""}">${art}<b>${esc(p.name)}</b><span class="tiny">${p.kind === "pack" ? `${p.clubs.length} clubs` : p.kind === "throwbacks" ? "Throwback shirts on every club" : p.kind === "variant" ? "Alternate away kit" : "Club colours"}</span></div>`;
}

// ---------- the unlock reveal: thunder, lightning, the plate slams down ----------
let fxTimer = null;
function closeFx(el) { if (!el || el.classList.contains("out")) return; el.classList.add("out"); setTimeout(() => el.remove(), 380); }
export function plateFx(id) {
  const p = st.cat.plates.find((x) => x.id === id); if (!p) return;
  const old = document.getElementById("platefx"); if (old) old.remove(); clearTimeout(fxTimer);
  const sparks = Array.from({ length: 30 }, (_, i) => `<i style="--a:${Math.round((i / 30) * 360 + (i % 3) * 7)}deg;--d:${110 + ((i * 37) % 170)}px;--s:${3 + ((i * 7) % 6)}px;--t:${(i * 53) % 320}ms"></i>`).join("");
  const sub = KIND_SUB[p.kind]; const subTxt = typeof sub === "function" ? sub(p) : sub || "";
  const el = document.createElement("div"); el.id = "platefx"; el.className = "pfx"; el.setAttribute("role", "dialog"); el.setAttribute("aria-label", `Unlocked: ${p.name}`);
  el.innerHTML = `<div class="pfx-flash"></div>
    <svg class="pfx-bolts" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path class="b b1" pathLength="1" vector-effect="non-scaling-stroke" d="M52 -2 L46 14 L55 18 L44 34 L53 38 L48 46"/>
      <path class="b b2" pathLength="1" vector-effect="non-scaling-stroke" d="M30 -2 L35 10 L27 16 L39 30 L33 36 L47 44"/>
      <path class="b b3" pathLength="1" vector-effect="non-scaling-stroke" d="M72 -2 L66 12 L74 17 L62 31 L68 36 L53 44"/>
    </svg>
    <div class="pfx-stage"><div class="pfx-ring"></div><div class="pfx-ring r2"></div><div class="pfx-sparks">${sparks}</div>
      <div class="pfx-plate">${plateTile(p, true)}<span class="pfx-sheen"></span></div>
      <div class="pfx-text"><div class="pfx-kick">PLATE UNLOCKED</div><div class="pfx-name">${esc(p.name)}</div><div class="pfx-sub">${esc(subTxt)}</div></div></div>
    <div class="pfx-hint">Tap to continue</div>`;
  el.addEventListener("click", () => closeFx(el));
  document.body.appendChild(el);
  fxTimer = setTimeout(() => closeFx(el), 7000);
}

export function enterCode(you) {
  const plates = st.cat.plates, have = new Set((you && you.unlocks) || []);
  const tile = (p) => plateTile(p, have.has(p.id), st.ui.flashPlate === p.id);
  return `<div class="card"><h3>Enter code</h3><div class="row" style="gap:8px"><input id="codein" class="grow" placeholder="Got a code? Type it here" maxlength="40" autocomplete="off" spellcheck="false"><button class="btn pri" data-act="redeem">Unlock</button></div>
    <p class="small mute mt">Codes unlock cosmetic extras: club colours, throwback shirts and alternate kits. They stay on this browser, so you only enter each one once.</p>
    <div class="cabhead mt"><b>Trophy cabinet</b><span class="small mute">${have.size} / ${plates.length} plates</span></div><div class="cabinet mt">${plates.map(tile).join("")}</div>${trophyShelf()}</div>`;
}

// ---------- trophies won in games: kept on this browser and shown under the plates ----------
const KINDS = [["title", "🏆", "League titles"], ["ballon", "🌟", "Ballon d'Or"], ["boot", "⚽", "Golden Boot"], ["playmaker", "🎯", "Playmaker Award"], ["glove", "🧤", "Golden Glove"]];
const WIN_TXT = { ballon: (r) => `${r.g}G ${r.a}A · ${r.rt.toFixed(1)} avg`, boot: (r) => `${r.g} goals`, playmaker: (r) => `${r.a} assists`, glove: (r) => `${r.cs} clean sheets` };
const trophies = () => { try { const l = JSON.parse(store("trophies") || "[]"); return Array.isArray(l) ? l : []; } catch { return []; } };
// Called with every state: at the end of a season, anything the player (or a player on the manager's team) just won is saved once.
export function trophySync(S) {
  const R = S.reveal; if (!R || R.kind !== "season" || !S.teams || S.gid == null) return;
  const you = S.players.find((p) => p.you); if (!you) return;
  const pid = S.pm ? S.pm.pid : null, mine = you.mode === "player" ? S.teams.find((t) => pid != null && t.players.includes(pid)) : S.teams[you.teamId];
  if (!mine && pid == null) return;
  const gid = `${S.room}-${S.gid}`, found = [];
  const add = (kind, extra = {}) => found.push({ id: `${gid}:${R.season}:${kind}`, kind, season: R.season, team: mine ? mine.name : "", club: mine ? mine.club : "", mode: you.mode === "player" ? "player" : "manager", ...extra });
  if (mine && R.champion === mine.id) add("title", { pts: (R.table[0] || {}).pts, full: longName(mine).title });
  const A = R.awards || {};
  for (const [k] of KINDS.slice(1)) {
    const w = A[k] && A[k][0]; if (!w) continue;
    const own = you.mode === "player" ? w.id === pid : mine && w.team === mine.id;
    if (own) add(k, { who: w.name, stat: WIN_TXT[k](w) });
  }
  if (!found.length) return;
  const have = trophies(), ids = new Set(have.map((x) => x.id)), fresh = found.filter((x) => !ids.has(x.id));
  if (!fresh.length) return;
  store("trophies", JSON.stringify([...have, ...fresh.map((x) => ({ ...x, at: Date.now() }))].slice(-400)));
  toast(fresh.length === 1 ? "Trophy added to your cabinet" : `${fresh.length} trophies added to your cabinet`);
}

function trophyShelf() {
  const all = trophies();
  if (!all.length) return `<div class="cabhead mt"><b>Trophies</b><span class="small mute">0 won</span></div><p class="small mute mt">Win a league title, the Golden Boot, the Ballon d'Or and more. They are kept on this browser and shown here.</p>`;
  const rows = KINDS.map(([k, icon, name]) => {
    const l = all.filter((x) => x.kind === k).sort((a, b) => b.at - a.at); if (!l.length) return "";
    const tile = (x) => { const c = st.clubBy[x.club]; return `<div class="trophy ${k}"><span class="tr-i">${icon}</span><div class="grow"><b>${esc(k === "title" ? x.full || x.team : x.who)}</b><span class="tiny mute">${k === "title" ? `Season ${x.season}${x.pts ? ` · ${x.pts} pts` : ""}` : `Season ${x.season} · ${esc(x.stat || "")}`}</span>${k === "title" ? "" : `<span class="tiny mute">${esc(x.team)}</span>`}</div>${c ? crestOfClub(c, 22) : ""}</div>`; };
    return `<div class="trow"><div class="small"><b>${icon} ${name}</b> <span class="mute">×${l.length}</span></div><div class="trophies mt">${l.map(tile).join("")}</div></div>`;
  }).join("");
  return `<div class="cabhead mt"><b>Trophies</b><span class="small mute">${all.length} won</span></div>${rows}`;
}
