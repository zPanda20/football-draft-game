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
// A piece of team art (badge, wallpaper, kitHome...). Badges and wallpapers fall back to the main club for a throwback or
// alt. An alt marked kitsFrom "base" (PSG TWD, Inter The Doctor) is only a new away kit: every other kit is the main club's.
export function art(c, kind) {
  const all = c && c.kitsFrom === "base";
  for (let x = c, n = 0; x && n < 3; x = x.base && (kind === "badge" || kind === "wallpaper" || all) ? st.clubBy[x.base] : null, n++) if (x.art && x.art[kind]) return x.art[kind];
  return null;
}
export const team = (id) => (st.S && st.S.teams ? st.S.teams[id] : null);
export const myTeam = () => (st.S && st.S.me ? team(st.S.me.teamId) : null);
export const club = (t) => (t && st.clubBy[t.club]) || null;

// A player as the room sees him right now: the data-file record plus whatever has changed.
export function pl(id) {
  const d = st.S && st.S.pd && st.S.pd[id];
  let b = st.idx[id];
  if (!b && d && d.u) b = { id, name: d.u.name, nat: d.u.nat, club: d.u.club || "Free Agent", pos: d.u.pos, img: d.u.img, g: d.u.g, ovr: d.o, age: d.a, st: d.st || [0, 0, 0, 0, 0, 0, 0], user: true };
  if (!b) return null;
  if (!d) return { ...b, stam: 100, contract: 0, mv: 0, team: null, susp: 0 };
  const s = d.st || b.st;
  return { ...b, ovr: d.o, age: d.a, stam: d.s, contract: d.c, team: d.t, mv: d.mv, pos: d.pos || b.pos, st: s, pot: d.pot || b.pot, susp: d.sp || 0, x: d.x || null };
}

// ---------- flags, badges, cards ----------
const ISO = { Argentina: "AR", Australia: "AU", Austria: "AT", Belgium: "BE", Brazil: "BR", Cameroon: "CM", Canada: "CA", Chile: "CL", Colombia: "CO", Croatia: "HR", Czechia: "CZ", Denmark: "DK", Ecuador: "EC", Egypt: "EG", France: "FR", Georgia: "GE", Germany: "DE", Ghana: "GH", Greece: "GR", Guinea: "GN", Haiti: "HT", Hungary: "HU", Iceland: "IS", Italy: "IT", "Ivory Coast": "CI", Jamaica: "JM", Japan: "JP", Kosovo: "XK", Malawi: "MW", Mexico: "MX", Morocco: "MA", Netherlands: "NL", Nigeria: "NG", Norway: "NO", Poland: "PL", Portugal: "PT", "Republic of Ireland": "IE", Russia: "RU", Serbia: "RS", Slovakia: "SK", Slovenia: "SI", "South Korea": "KR", Spain: "ES", Sweden: "SE", Switzerland: "CH", Turkey: "TR", "United States": "US", Uruguay: "UY", Zambia: "ZM" };
export const ISO_NATIONS = [...Object.keys(ISO), "England", "Scotland"].sort();
const tag = (s) => String.fromCodePoint(0x1f3f4, ...[...s].map((c) => 0xe0000 + c.charCodeAt(0)), 0xe007f);
// A drawn face for created footballers: skin, hair style and hair colour picked in the lobby ("s-h-c").
export const SKIN = ["#f6d7b8", "#e9b98f", "#d19a6b", "#b07a4f", "#8a5a3b", "#5e3b25"], HAIRC = ["#1b1612", "#4a3222", "#8a5a2b", "#d6b15a", "#b5432b", "#cfcfcf"];
export const HAIR_NAMES = ["Shaved", "Short", "Long", "Afro", "Mohawk", "Bun"];
export function avatar(code, size = 56, g = "M") {
  const [s, h, c] = String(code || "0-0-0").split("-").map((x) => (+x | 0) % 6), sk = SKIN[s], hc = HAIRC[c];
  const hair = [
    "",
    `<path d="M20 31c0-12 7-18 12-18s12 6 12 18c-3-6-8-8-12-8s-9 2-12 8z" fill="${hc}"/>`,
    `<path d="M18 36c-2-16 6-24 14-24s16 8 14 24l-3 16h-5l1-18c-3-4-6-6-7-8-2 2-5 4-8 6l1 20h-5z" fill="${hc}"/>`,
    `<circle cx="32" cy="24" r="16" fill="${hc}"/>`,
    `<path d="M29 12h6l2 14h-10z" fill="${hc}"/>`,
    `<path d="M20 30c0-11 6-16 12-16s12 5 12 16c-4-5-8-7-12-7s-8 2-12 7z" fill="${hc}"/><circle cx="32" cy="10" r="5.5" fill="${hc}"/>`,
  ][h];
  const back = h === 2 || h === 3 ? hair : "";
  return `<svg class="avatar" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="rgba(255,255,255,.14)"/><path d="M10 62c1-12 9-17 22-17s21 5 22 17z" fill="${g === "F" ? "#c0508a" : "#2c6cb0"}"/><rect x="27" y="36" width="10" height="11" rx="4" fill="${sk}"/>${back}<ellipse cx="32" cy="29" rx="12" ry="14" fill="${sk}"/>${h === 3 ? "" : h === 2 ? "" : hair}<circle cx="27.5" cy="29" r="1.5" fill="#1b1612"/><circle cx="36.5" cy="29" r="1.5" fill="#1b1612"/><path d="M27.5 35c2.5 2.4 6.5 2.4 9 0" stroke="#1b1612" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>`;
}
export const faceOf = (img, size = 56, g = "M") => (img && img.startsWith("f:") ? `<img class="avatar" src="/assets/faces/${encodeURIComponent(img.slice(2))}" width="${size}" height="${size}" alt="">` : avatar(img, size, g));
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
// ---------- kits and colour clashes ----------
// A club's colours are its kits': c1 = home, c2 = away, c3 = third (where it has one). An alt that only brings a new
// away kit takes the rest from its main club.
export function kitColor(c, kind) {
  if (!c) return null;
  if (kind === "kitHome") return c.c1;
  if (kind === "kitAway") return c.c2;
  const base = c.kitsFrom === "base" && c.base ? st.clubBy[c.base] : null;
  return c.c3 || (base && base.c3) || null;
}
export const CLASH = 175;      // weighted colour distance at or below which two shirts are too alike
// Which kits two clubs wear in a match: home in its home kit and away in its away kit unless they clash (or are close),
// then the away side changes to its third kit; if that does not help, the home side changes to its third; if neither does,
// the pair of kits that sit furthest apart. swap says who changed: "away", "home" or null.
export function kitsFor(home, away) {
  const base = { h: "kitHome", a: "kitAway", swap: null, clash: false };
  if (!home || !away) return base;
  const d = (hk, ak) => { const x = kitColor(home, hk), y = kitColor(away, ak); return x && y ? colorDist(x, y) : -1; };
  if (d("kitHome", "kitAway") > CLASH) return base;
  for (const [hk, ak, swap] of [["kitHome", "kitThird", "away"], ["kitThird", "kitAway", "home"]]) if (d(hk, ak) > CLASH) return { h: hk, a: ak, swap, clash: false };
  const ks = ["kitHome", "kitAway", "kitThird"];
  let best = { h: "kitHome", a: "kitAway", dist: d("kitHome", "kitAway") };
  for (const hk of ks) for (const ak of ks) { const x = d(hk, ak); if (x > best.dist) best = { h: hk, a: ak, dist: x }; }
  return { h: best.h, a: best.a, swap: best.h === "kitHome" && best.a === "kitAway" ? null : best.a !== "kitAway" ? "away" : "home", clash: best.dist <= CLASH };
}
// The two colours a match is drawn in: the colours of the kits each side wears. A colour too dark to read on the page
// (black, navy, port wine) is drawn a little lighter, not swapped for another one.
export function matchColors(home, away) {
  const show = (h) => (lum(h) > 0.07 ? h : lighten(h, 0.35));
  if (!home) return ["#3ddc84", "#ffb020"];
  if (!away) return [show(home.c1), "#ffb020"];
  const k = kitsFor(home, away), h = show(kitColor(home, k.h) || home.c1), a = show(kitColor(away, k.a) || away.c2);
  return [h, colorDist(a, h) > 120 ? a : "#ffb020"];
}
// A kit next to a crest: the club's uploaded kit if there is one, else a simple shirt in its colours.
// side 0 = home kit, 1 = away kit, or a kit name ("kitHome", "kitAway", "kitThird"). A plain shirt swaps its colours for the away kit.
export function shirt(c, side = 0, h = 22) {
  const kind = typeof side === "string" ? side : side ? "kitAway" : "kitHome";
  const up = c && (art(c, kind) || (kind === "kitThird" ? art(c, "kitAway") : null));
  if (up) return `<img class="kit k1" src="${esc(up)}" alt="" style="height:${h}px">`;
  let a = c ? c.c1 : "#777", b = c ? c.c2 : "#ddd";
  if (kind === "kitAway") [a, b] = [b, a]; else if (kind === "kitThird") { a = (c && kitColor(c, "kitThird")) || b; b = c ? c.c1 : "#ddd"; }
  return `<svg class="kit k1" viewBox="0 0 100 100" style="height:${h}px;width:${h}px" aria-hidden="true"><path d="M30 8L4 26l10 16 12-6v52h48V36l12 6 10-16L70 8c-4 8-12 12-20 12S34 16 30 8z" fill="${a}" stroke="rgba(0,0,0,.55)" stroke-width="4" stroke-linejoin="round"/><path d="M38 40h24v7H38z" fill="${b}" opacity=".9"/></svg>`;
}
export function chip(t, size = 22, owner = false) {
  if (!t) return "";
  return `<span class="tchip">${crest(t, size)}<span class="n">${esc(t.name)}${owner && t.owner ? ` <span class="own">(${esc(t.owner)})</span>` : ""}</span></span>`;
}
// Position colours: keepers orange, defence yellow, midfield green, attack blue.
export const posGroup = (pos) => (pos === "GK" ? "gk" : ["CB", "LB", "RB"].includes(pos) ? "def" : ["LW", "RW", "ST"].includes(pos) ? "att" : "mid");
export const tierOf = (ovr) => (ovr >= 90 ? "ruby" : ovr >= 85 ? "gold" : "silver");
export const STATS = ["PAC", "SHO", "PAS", "DRI", "DEF", "PHY", "STA"];
export const GKSTATS = ["DIV", "HAN", "KIC", "REF", "SPE", "POS", "STA"];

// The player card. opts: { size: "lg"|"md"|"sm", back: bool, cls: "" , tag: html }
export function card(id, opts = {}) {
  const p = pl(id); if (!p) return "";
  const gk = p.pos === "GK", labels = gk ? GKSTATS : STATS;
  const t = tierOf(p.ovr), size = opts.size || "md";
  const pic = !p.img && p.slug && st.cat && st.cat.pics ? st.cat.pics[p.slug] : null; // real-player portrait, if one was dropped into assets/players
  const stats = size === "sm" ? "" : `<div class="cstats">${labels.map((l, i) => `<span><b>${p.st[i]}</b>${l}</span>`).join("")}</div>`;
  return `<div class="pcard ${t} ${size} pgb-${posGroup(p.pos)} ${opts.cls || ""}" data-pid="${id}">
    <div class="ctop"><div class="covr">${p.ovr}<small>${esc(p.pos)}</small></div><div class="cflag">${flag(p.nat)}${clubBadge(p.club, size === "sm" ? 18 : size === "lg" ? 28 : 22)}</div></div>
    <div class="cface">${p.img ? `<span class="init av">${faceOf(p.img, size === "sm" ? 38 : 58, p.g)}</span>` : pic ? `<img class="cpic" src="${esc(pic)}" alt="" loading="lazy">` : `<span class="init">${esc(initials(p.name).toUpperCase())}</span>`}</div>
    <div class="cname">${esc(p.name)}</div>
    ${stats}${opts.tag || p.susp ? `<div class="ctag">${p.susp ? `Suspended · ${p.susp} games` : opts.tag}</div>` : ""}</div>`;
}
export function miniPlayer(id, extra = "") {
  const p = pl(id); if (!p) return "";
  return `<span class="mini ${tierOf(p.ovr)} pgb-${posGroup(p.pos)}"><i>${p.ovr}</i><b>${esc(p.pos)}</b><span class="nm">${esc(p.name)}</span>${p.susp ? `<span class="pill bad tiny" title="Suspended">SUSP ${p.susp}</span>` : ""}${extra}</span>`;
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
// the club's main colour if it shows on the dark interface, otherwise its second colour, otherwise the main colour lightened
function lift(a, b) {
  const lum = (h) => { const v = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  return lum(a) > 0.12 ? a : lum(b) > 0.12 ? b : lighten(a, 0.5);
}
