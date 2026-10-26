// Visual layer, JS side: the phase banner between stages, the "GOAL" call during a match, tilt and glare on player cards.
import { st, $, esc, remaining } from "./core.js";

const reduced = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

// ---------- phase banner ----------
// One short full-width banner whenever the room moves to a new stage ("Matchday 4", "Off-season: re-signs").
function phaseText(S) {
  const win = S.window && S.window.open ? ` · window closes ${S.window.left <= 1 ? "at the next kick-off" : "in " + S.window.left + " matchdays"}` : "";
  switch (S.step) {
    case "draft.intro": return ["The pack draft", `${S.N} teams · ${(S.draft && S.draft.total) || 8} packs`];
    case "market.bid": return S.market && S.market.round === 0 ? [S.phase === "offseason" ? "Free agency" : "The market", "Bid for the players nobody kept"] : null;
    case "season.intro": return [`Season ${S.seasonNo}`, `${S.season.total} matchdays`];
    case "md.lineup": return [`Matchday ${S.season.day + 1}`, `Set your line-up${win}`];
    case "md.half1": return ["Kick-off", `Matchday ${S.season.day + 1}`];
    case "md.half": return ["Half-time", "Changes, then the second half"];
    case "md.result": return ["Full time", `Matchday ${S.season.day + 1} of ${S.season.total}`];
    case "season.end": return [S.final ? "The final table" : `Season ${S.seasonNo} complete`, "Champions crowned"];
    case "off.retire": return ["Off-season", "Retirements"];
    case "off.resign": return ["Off-season", "Contracts: re-sign who you want to keep"];
    case "off.rookie.turn": return ["The rookie draft", "Weakest team picks first"];
    case "off.trade": return ["The trade window", "Swap players, items and coins"];
    default: return null;
  }
}
// ---------- one banner at a time ----------
// Kick-off, Goal, Half-time, Full time and the stage banners all go through this queue, so two of them never cover each other.
const q = []; let busy = false;
function runQ() {
  if (busy) return; const j = q.shift(); if (!j) return; busy = true;
  let el = $("#" + j.id); if (!el) { el = document.createElement("div"); el.id = j.id; document.body.appendChild(el); }
  el.className = j.base; void el.offsetWidth;
  el.innerHTML = j.html; el.className = j.base + " go" + (j.quick ? " quick" : "");
  setTimeout(() => { busy = false; runQ(); }, j.ms + 60);
}
function enqueue(j) { if (q.length > 3) q.shift(); q.push(j); runQ(); }
const QUICK = new Set(["md.half1", "md.half", "md.result"]);          // the match banners: a second on screen, then the clock starts
let lastKey = null;
export function phaseBanner(S) {
  if (!S || S.step === "lobby") { lastKey = null; return; }
  const key = S.step + "|" + S.seasonNo + "|" + (S.season ? S.season.day : "") + "|" + (S.phase || "");
  if (key === lastKey) return;
  const first = lastKey === null; lastKey = key;
  if (first || reduced()) return;                                    // not on a page reload
  const t = phaseText(S); if (!t) return;
  const quick = QUICK.has(S.step);
  enqueue({ id: "phasebanner", base: "phasebanner", quick, ms: quick ? 1100 : 2500, html: `<div class="pb-in"><b>${esc(t[0])}</b><span>${esc(t[1])}</span></div>` });
}

// ---------- the GOAL call ----------
export function goalCall(who, team, minute) {
  if (reduced()) return;
  enqueue({ id: "goalcall", base: "goalcall", ms: 2100, html: `<div class="gc-in"><b>GOAL</b><span>${esc(who)} · ${esc(team)} · ${minute}'</span></div>` });
}

// ---------- tilt and glare on cards ----------
let tiltEl = null;
function untilt() { if (tiltEl) { tiltEl.classList.remove("tilt-on"); tiltEl.style.removeProperty("--rx"); tiltEl.style.removeProperty("--ry"); tiltEl = null; } }
document.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch" || reduced()) return;
  const c = e.target.closest && e.target.closest(".pcard.ruby:not(.sm),.pcard.gold:not(.sm)");
  if (!c) return untilt();
  if (tiltEl !== c) { untilt(); tiltEl = c; c.classList.add("tilt-on"); if (!c.querySelector(".glare")) c.insertAdjacentHTML("beforeend", `<span class="glare"></span>`); }
  const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height, max = c.classList.contains("lg") ? 12 : 9;
  c.style.setProperty("--ry", ((x - 0.5) * 2 * max).toFixed(1) + "deg"); c.style.setProperty("--rx", ((0.5 - y) * 2 * max).toFixed(1) + "deg");
  c.style.setProperty("--mx", (x * 100).toFixed(0) + "%"); c.style.setProperty("--my", (y * 100).toFixed(0) + "%");
}, { passive: true });
document.addEventListener("pointerleave", untilt, true);
