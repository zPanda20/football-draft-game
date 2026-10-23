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
  // the real-world club names on player cards -> the game's club (so cards can show its badge)
  st.clubAlias = {};
  for (const c of st.cat.clubs) if (c.kind === "main") for (const n of [c.name, ...(c.aliases || [])]) st.clubAlias[norm(n)] = c.slug;
}
const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const clubByName = (name) => (st.clubAlias && st.clubBy[st.clubAlias[norm(name)]]) || null;
// A piece of team art (badge, wallpaper, kitHome...). Badges and wallpapers fall back to the main club for a throwback or alt.
export function art(c, kind) {
  for (let x = c, n = 0; x && n < 3; x = x.base && (kind === "badge" || kind === "wallpaper") ? st.clubBy[x.base] : null, n++) if (x.art && x.art[kind]) return x.art[kind];
  return null;
}
export const team = (id) => (st.S && st.S.teams ? st.S.teams[id] : null);
export const myTeam = () => (st.S && st.S.me ? team(st.S.me.teamId) : null);
export const club = (t) => (t && st.clubBy[t.club]) || null;

// A player as the room sees him right now: the data-file record plus whatever has changed.
export function pl(id) {
  const d = st.S && st.S.pd && st.S.pd[id];
  let b = st.idx[id];
  if (!b && d && d.u) b = { id, name: d.u.name, nat: d.u.nat, club: d.u.club || "Free Agent", pos: d.u.pos, ovr: d.o, age: d.a, st: d.st || [0, 0, 0, 0, 0, 0, 0], user: true };
  if (!b) return null;
  if (!d) return { ...b, stam: 100, contract: 0, mv: 0, team: null, susp: 0 };
  const s = d.st || b.st;
  return { ...b, ovr: d.o, age: d.a, stam: d.s, contract: d.c, team: d.t, mv: d.mv, pos: d.pos || b.pos, st: s, pot: d.pot || b.pot, susp: d.sp || 0 };
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
export function clubBadge(name, size = 22) {
  const c = clubByName(name), img = c && art(c, "badge");
  if (img) return `<img class="cbadge img" src="${esc(img)}" alt="${esc(name)}" title="${esc(name)}" style="--s:${size}px" loading="lazy">`;
  if (c) return `<span class="cbadge tc" style="--s:${size}px;--a:${c.c1};--b:${c.c2}" title="${esc(name)}">${esc(c.short.slice(0, 3))}</span>`;
  return `<span class="cbadge" style="--s:${size}px;--h:${hue(name)}" title="${esc(name)}">${esc(initials(name).toUpperCase())}</span>`;
}
export function crestOfClub(c, size = 24) {
  const img = c && art(c, "badge");
  if (img) return `<img class="crest img" src="${esc(img)}" alt="" style="--s:${size}px" loading="lazy">`;
  const a = c ? c.c1 : "#555", b = c ? c.c2 : "#ddd";
  return `<span class="crest" style="--s:${size}px;--a:${a};--b:${b}"></span>`;
}
export const crest = (t, size = 24) => crestOfClub(club(t), size);
export function kitImg(c, kind, h = 70) {
  const u = c && art(c, kind); return u ? `<img class="kit" src="${esc(u)}" alt="" style="height:${h}px" loading="lazy">` : "";
}
// Colour helpers (hex "#rrggbb").
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const lum = (h) => { const v = rgb(h).map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
export const colorDist = (a, b) => { const [r1, g1, b1] = rgb(a), [r2, g2, b2] = rgb(b); return Math.sqrt(2 * (r1 - r2) ** 2 + 4 * (g1 - g2) ** 2 + 3 * (b1 - b2) ** 2); };
const lighten = (h, k = 0.45) => "#" + rgb(h).map((x) => Math.round(x + (255 - x) * k).toString(16).padStart(2, "0")).join("");
// The two colours a match is drawn in: the home side's main colour, and the away side's main colour unless it is too
// close to the home side's (or too dark to see), in which case the away side's secondary colour.
export function matchColors(home, away) {
  const vis = (h) => lum(h) > 0.07, ok = (a, b) => colorDist(a, b) > 110;
  const h = home ? (vis(home.c1) ? home.c1 : vis(home.c2) ? home.c2 : lighten(home.c1)) : "#3ddc84";
  if (!away) return [h, "#ffb020"];
  const cands = [away.c1, away.c2].filter(vis);
  const a = cands.find((c) => ok(c, h)) || cands.sort((x, y) => colorDist(y, h) - colorDist(x, h))[0] || lighten(away.c1);
  return [h, ok(a, h) ? a : "#ffb020"];
}
// A kit next to a crest: the club's uploaded kit if there is one, else a simple shirt in its colours.
// side 0 = home kit, 1 = away kit (a plain shirt swaps its colours so the two sides differ).
export function shirt(c, side = 0, h = 22) {
  const up = c && art(c, side ? "kitAway" : "kitHome");
  if (up) return `<img class="kit k1" src="${esc(up)}" alt="" style="height:${h}px">`;
  let a = c ? c.c1 : "#777", b = c ? c.c2 : "#ddd";
  if (side) [a, b] = [b, a];
  return `<svg class="kit k1" viewBox="0 0 100 100" style="height:${h}px;width:${h}px" aria-hidden="true"><path d="M30 8L4 26l10 16 12-6v52h48V36l12 6 10-16L70 8c-4 8-12 12-20 12S34 16 30 8z" fill="${a}" stroke="rgba(0,0,0,.55)" stroke-width="4" stroke-linejoin="round"/><path d="M38 40h24v7H38z" fill="${b}" opacity=".9"/></svg>`;
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
    <div class="ctop"><div class="covr">${p.ovr}<small>${esc(p.pos)}</small></div><div class="cflag">${flag(p.nat)}${clubBadge(p.club, size === "sm" ? 18 : size === "lg" ? 28 : 22)}</div></div>
    <div class="cface"><span class="init">${esc(initials(p.name).toUpperCase())}</span></div>
    <div class="cname">${esc(p.name)}</div>
    ${stats}${opts.tag || p.susp ? `<div class="ctag">${p.susp ? `Suspended · ${p.susp} games` : opts.tag}</div>` : ""}</div>`;
}
export function miniPlayer(id, extra = "") {
  const p = pl(id); if (!p) return "";
  return `<span class="mini ${tierOf(p.ovr)}"><i>${p.ovr}</i><b>${esc(p.pos)}</b><span class="nm">${esc(p.name)}</span>${p.susp ? `<span class="pill bad tiny" title="Suspended">SUSP ${p.susp}</span>` : ""}${extra}</span>`;
}
export function itemCard(it, opts = {}) {
  const i = typeof it === "string" ? st.items[it] : it; if (!i) return "";
  return `<div class="icard ${i.tier || ""} ${opts.cls || ""}" data-iid="${esc(i.id)}"><div class="iname">${esc(i.name)}</div><div class="itext">${esc(i.text)}</div><div class="imeta">${i.scope === "player" ? "player" : "team"} · ${i.uses}× use${i.uses > 1 ? "s" : ""}${i.supply != null ? " · only " + i.supply : ""}</div>${opts.tag ? `<div class="ctag">${opts.tag}</div>` : ""}</div>`;
}

export function remaining() { const S = st.S; if (!S || S.paused || !S.deadline) return null; return Math.max(0, S.deadline - now()); }
export function fmtClock(ms) { const s = Math.ceil(ms / 1000); return s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : String(s); }
export const coins = (n) => `<span class="coin">${Math.round(n)}<i></i></span>`;
// The club whose colours, wallpaper and kits the page wears: your team, or the one you are choosing in the lobby.
export function myClub() {
  const S = st.S, t = myTeam(); if (t) return club(t);
  const you = S && S.players && S.players.find((p) => p.you);
  return you && you.club ? st.clubBy[you.club] || null : null;
}
export function applyTheme() {
  const c = myClub(), r = document.documentElement.style;
  r.setProperty("--acc", c ? lift(c.c1, c.c2) : "#3ddc84");
  const w = c && art(c, "wallpaper"), bg = document.getElementById("bg");
  if (bg) { bg.style.setProperty("--wall", w ? `url("${w}")` : "none"); bg.classList.toggle("wall", !!w); }
}
// the club's main colour if it shows on the dark interface, otherwise its second colour
function lift(a, b) {
  const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  return lum(a) > 0.12 ? a : lum(b) > 0.12 ? b : "#3ddc84";
}
