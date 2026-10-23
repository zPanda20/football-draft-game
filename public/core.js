// Shared state and helpers for every screen.
export const st = { S: null, cat: null, idx: {}, clubBy: {}, token: "", watch: false, room: null, off: 0, ws: null, ui: { sort: "ovr", pos: "all", q: "", bidLen: 1, bidExtra: 0, mkTab: "players", sel: null }, render: () => {} };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export function store(k, v) { try { if (v === undefined) return localStorage.getItem("fdg." + k); if (v === null) localStorage.removeItem("fdg." + k); else localStorage.setItem("fdg." + k, v); } catch (e) { return null; } }
export function send(m) { const w = st.ws; if (w && w.readyState === 1) w.send(JSON.stringify({ token: st.token, ...m })); }
export const now = () => Date.now() + st.off;
export function toast(msg) { const t = $("#toast"); if (!t) return; const d = document.createElement("div"); d.textContent = msg; t.appendChild(d); setTimeout(() => d.remove(), 3500); }

export function buildIndex() {
  st.idx = {}; for (const p of st.cat.players) st.idx[p.id] = p;
  st.items = Object.fromEntries(st.cat.items.map((i) => [i.id, i]));
  st.clubBy = Object.fromEntries(st.cat.clubs.map((c) => [c.slug, c]));
}
export const team = (id) => (st.S && st.S.teams ? st.S.teams[id] : null);
export const myTeam = () => (st.S && st.S.me ? team(st.S.me.teamId) : null);
export const club = (t) => (t && st.clubBy[t.club]) || null;

// A player as the room sees him right now: the data-file record plus whatever has changed.
export function pl(id) {
  const b = st.idx[id]; if (!b) return null;
  const d = st.S && st.S.pd && st.S.pd[id];
  if (!d) return { ...b, stam: 100, contract: 0, mv: 0, team: null };
  const s = d.st || b.st;
  return { ...b, ovr: d.o, age: d.a, stam: d.s, contract: d.c, team: d.t, mv: d.mv, pos: d.pos || b.pos, st: s };
}

// ---------- flags, badges, cards ----------
const ISO = { Argentina: "AR", Australia: "AU", Austria: "AT", Belgium: "BE", Brazil: "BR", Cameroon: "CM", Canada: "CA", Chile: "CL", Colombia: "CO", Croatia: "HR", Czechia: "CZ", Denmark: "DK", Ecuador: "EC", Egypt: "EG", France: "FR", Georgia: "GE", Germany: "DE", Ghana: "GH", Greece: "GR", Guinea: "GN", Haiti: "HT", Hungary: "HU", Iceland: "IS", Italy: "IT", "Ivory Coast": "CI", Jamaica: "JM", Japan: "JP", Kosovo: "XK", Malawi: "MW", Mexico: "MX", Morocco: "MA", Netherlands: "NL", Nigeria: "NG", Norway: "NO", Poland: "PL", Portugal: "PT", "Republic of Ireland": "IE", Russia: "RU", Serbia: "RS", Slovakia: "SK", Slovenia: "SI", "South Korea": "KR", Spain: "ES", Sweden: "SE", Switzerland: "CH", Turkey: "TR", "United States": "US", Uruguay: "UY", Zambia: "ZM" };
const tag = (s) => String.fromCodePoint(0x1f3f4, ...[...s].map((c) => 0xe0000 + c.charCodeAt(0)), 0xe007f);
export function flag(nat) {
  if (nat === "England") return tag("gbeng"); if (nat === "Scotland") return tag("gbsct");
  const c = ISO[nat]; return c ? String.fromCodePoint(...[...c].map((x) => 0x1f1e6 + x.charCodeAt(0) - 65)) : "🏳️";
}
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
export const initials = (n) => { const w = String(n).split(/\s+/).filter(Boolean); return ((w[0] || "")[0] || "") + (w.length > 1 ? w[w.length - 1][0] : (w[0] || "")[1] || ""); };
export const clubBadge = (name, size = 22) => `<span class="cbadge" style="--s:${size}px;--h:${hue(name)}" title="${esc(name)}">${esc(initials(name).toUpperCase())}</span>`;
export function crest(t, size = 24) {
  const c = club(t); const a = c ? c.c1 : "#555", b = c ? c.c2 : "#ddd";
  return `<span class="crest" style="--s:${size}px;--a:${a};--b:${b}"></span>`;
}
export function chip(t, size = 22, owner = false) {
  if (!t) return "";
  return `<span class="tchip">${crest(t, size)}<span class="n">${esc(t.name)}${owner && t.owner ? ` <span class="own">(${esc(t.owner)})</span>` : ""}</span></span>`;
}
export const tierOf = (ovr) => (ovr >= 90 ? "ruby" : ovr >= 85 ? "gold" : "silver");
export const STATS = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY", "STA"];
export const GKSTATS = ["DIV", "HAN", "KIC", "REF", "SPE", "POS", "STA"];

// The player card. opts: { size: "lg"|"md"|"sm", back: bool, cls: "" , tag: html }
export function card(id, opts = {}) {
  const p = pl(id); if (!p) return "";
  const gk = p.pos === "GK", labels = gk ? GKSTATS : STATS;
  const t = tierOf(p.ovr), size = opts.size || "md";
  const stats = size === "sm" ? "" : `<div class="cstats">${labels.map((l, i) => `<span><b>${p.st[i]}</b>${l}</span>`).join("")}</div>`;
  return `<div class="pcard ${t} ${size} ${opts.cls || ""}" data-pid="${id}">
    <div class="ctop"><div class="covr">${p.ovr}<small>${esc(p.pos)}</small></div><div class="cflag">${flag(p.nat)}${clubBadge(p.club, size === "sm" ? 16 : 20)}</div></div>
    <div class="cface"><span class="init">${esc(initials(p.name).toUpperCase())}</span></div>
    <div class="cname">${esc(p.name)}</div>
    ${stats}${opts.tag ? `<div class="ctag">${opts.tag}</div>` : ""}</div>`;
}
export function miniPlayer(id, extra = "") {
  const p = pl(id); if (!p) return "";
  return `<span class="mini ${tierOf(p.ovr)}"><i>${p.ovr}</i><b>${esc(p.pos)}</b><span class="nm">${esc(p.name)}</span>${extra}</span>`;
}
export function itemCard(it, opts = {}) {
  const i = typeof it === "string" ? st.items[it] : it; if (!i) return "";
  return `<div class="icard ${i.tier || ""} ${opts.cls || ""}" data-iid="${esc(i.id)}"><div class="iname">${esc(i.name)}</div><div class="itext">${esc(i.text)}</div><div class="imeta">${i.scope === "player" ? "player" : "team"} · ${i.uses}× use${i.uses > 1 ? "s" : ""}${i.supply != null ? " · only " + i.supply : ""}</div>${opts.tag ? `<div class="ctag">${opts.tag}</div>` : ""}</div>`;
}

export function remaining() { const S = st.S; if (!S || S.paused || !S.deadline) return null; return Math.max(0, S.deadline - now()); }
export function fmtClock(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : String(s); }
export const coins = (n) => `<span class="coin">${Math.round(n)}<i></i></span>`;
export function applyTheme() {
  const t = myTeam(), c = club(t), r = document.documentElement.style;
  r.setProperty("--acc", c ? lift(c.c1, c.c2) : "#3ddc84");
}
// the club's main colour if it shows on the dark interface, otherwise its second colour
function lift(a, b) {
  const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  return lum(a) > 0.12 ? a : lum(b) > 0.12 ? b : "#3ddc84";
}
