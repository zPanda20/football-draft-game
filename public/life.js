// Player-mode life screens: the week's activity, status bars, the shop, headlines, the manager's "may we print this?" card
// and the big news banner every user sees when a story breaks.
import { st, $, esc, send, coins, pl, initials } from "./core.js";

const ui = () => st.ui;
export const lifeHandlers = {
  act(a) {
    if (a.k === "date" && !a.partner && st.S.pm && st.S.pm.life && !st.S.pm.life.married && (st.S.pm.life.opts || []).length) { ui().dateOpen = !ui().dateOpen; return st.render(); }
    send({ t: "act", act: a.k, marry: a.marry === "1", partner: a.partner || undefined }); ui().dateOpen = false;
  },
  turnDown(a) { send({ t: "turnDown", id: a.id }); },
  setPref(a) { const lf = st.S.pm && st.S.pm.life; send({ t: "pref", act: lf && lf.pref === a.k ? null : a.k }); },
  dealYes() { send({ t: "dealRespond", yes: true }); },
  dealNo() { send({ t: "dealRespond", yes: false }); },
  actClear() { send({ t: "act", act: null }); },
  lifeBuy(a) { send({ t: "lifeBuy", id: a.id }); },
  shopToggle() { ui().shopOpen = !ui().shopOpen; st.render(); },
  shopCat(a) { ui().shopCat = a.cat; st.render(); },
  newsYes(a) { send({ t: "newsDecide", id: +a.id, yes: true }); },
  newsNo(a) { send({ t: "newsDecide", id: +a.id, yes: false }); },
  newsClose() { closeBanner(); },
};

const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M" : n >= 1e4 ? Math.round(n / 1e3) + "K" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(Math.round(n)));
const arrow = (n, big = 15) => (n >= big ? "▲▲" : n > 0 ? "▲" : n <= -big ? "▼▼" : n < 0 ? "▼" : "–");
const tone = (n) => (n > 0 ? "up" : n < 0 ? "dn" : "flat");
const bar = (label, v, max, cls, extra = "") => `<div class="lbar ${cls}"><span class="lb-l">${label}</span><span class="lb-t"><i style="width:${Math.max(2, Math.min(100, (v / max) * 100))}%"></i></span><span class="lb-v">${extra}</span></div>`;

function chips(k) {
  const c = st.cat.life.costs[k];
  const out = [];
  if (k === "train") out.push(["Skills", 1, "▲"]);
  if (c.fol) out.push(["Followers", c.fol, arrow(c.fol, 700)]);
  if (c.stam) out.push(["Recovery", c.stam, arrow(c.stam)]);
  if (c.love) out.push(["Love life", c.love, arrow(c.love, 14)]);
  return out.map(([n, v, a]) => `<span class="ch ${tone(v)}">${n} ${a}</span>`).join("");
}

export function lifePanel(S) {
  const pm = S.pm, lf = pm && pm.life; if (!lf) return "";
  const p = pl(pm.pid), info = st.cat.life.acts, coinsNow = pm.coins;
  const cur = lf.act ? lf.act.act : null;
  const partner = lf.partner ? `${esc(lf.partner.name)} · ${lf.married ? "married" : `${lf.partner.dates} date${lf.partner.dates === 1 ? "" : "s"}`}${lf.partner.partier ? " · loves a party" : ""}` : "Single";
  const status = `<div class="lstat">
    <div class="lfol"><b>${fmt(lf.fol)}</b><span>followers</span></div>
    <div class="lbars">${bar("Love life", lf.love, 100, "love", `<small>${partner}</small>`)}${bar("Recovery", Math.round(pm.stam ?? 100), 100, "rec", `<small>energy at kick-off</small>`)}</div>
    <div class="linc"><span class="small mute">Per matchday</span><b>+${lf.base + lf.income.total}</b><span class="tiny mute">${lf.base} wage${lf.income.sponsor ? ` + ${lf.income.sponsor} sponsors` : ""}${lf.income.venue ? ` + ${lf.income.venue} club` : ""}${lf.income.boots ? ` + ${lf.income.boots} boots` : ""}</span></div></div>
    ${lf.lm ? `<div class="small mt">Last match: <b>${lf.lm.gf}–${lf.lm.ga}</b> · ${lf.lm.g ? lf.lm.g + (lf.lm.g === 1 ? " goal" : " goals") + " · " : ""}${lf.lm.a ? lf.lm.a + (lf.lm.a === 1 ? " assist" : " assists") + " · " : ""}rated <b>${lf.lm.r}</b> · <span class="${lf.lm.gain >= 0 ? "up" : "dn"}">${lf.lm.gain >= 0 ? "+" : "−"}${fmt(Math.abs(lf.lm.gain))} followers</span></div>` : ""}
    ${dealLine(lf)}${cabinet(lf)}`;
  let week = "";
  const acts = ["train", "date", "party", "rest", "balance"].map((k) => {
    const cost = lf.costs[k], dis = !lf.open || cost > coinsNow || (k === "party" && pm.susp > 0);
    return `<button class="act ${cur === k && !lf.act.marry ? "sel" : ""}" data-act="act" data-k="${k}" ${dis ? "disabled" : ""} title="${esc(info[k].text)}"><span class="ai">${info[k].icon}</span><b>${esc(info[k].name)}</b><span class="chs">${chips(k)}${cost ? `<span class="ch dn">Money −${cost}</span>` : ""}</span></button>`;
  }).join("");
  const marry = "";
  const last = pm.lastLife ? `<div class="small mute mt">Last week: <b>${esc(info[pm.lastLife.act].name)}</b>${pm.lastLife.cost ? ` (−${pm.lastLife.cost})` : ""}${pm.lastLife.wada ? ` · <span style="color:var(--bad)">flagged by WADA: 2-match ban</span>` : ""}</div>` : "";
  const note = lf.open ? (cur ? `Locked in: <b>${esc(info[cur].name)}</b>${lf.act.marry ? " + proposal" : ""}. The match starts when everyone is ready. <a href="#" data-act="actClear">change</a>` : "Pick your week before kick-off. If you do nothing, it is a Balance week.") : "You pick your week before the next match.";
  week = `<div class="mt"><div class="row wrap" style="gap:8px;justify-content:space-between"><b>Your week</b><span class="small">${note}</span></div><div class="acts mt">${acts}${marry}</div>${datePicker(lf, pm)}${prefRow(lf)}${last}</div>`;
  return `<div class="card lifep"><h3 style="margin:0 0 8px">Life off the pitch</h3>${status}${dealOfferCard(lf)}${week}${shopView(S)}</div>`;
}

// ---------- dating: three people to choose from each week ----------
const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const faceOfPartner = (x, size = 54) => {
  const u = st.cat.art && st.cat.art.partners && st.cat.art.partners[x.id];
  return u ? `<img class="pface" src="${esc(u)}" alt="" width="${size}" height="${size}" loading="lazy">` : `<span class="pface ini" style="width:${size}px;height:${size}px;--h:${hue(x.id)}">${esc(initials(x.name).toUpperCase())}</span>`;
};
function datePicker(lf, pm) {
  if (lf.married || !(lf.opts || []).length || !ui().dateOpen) return lf.married && lf.partner ? `<div class="small mute mt">💍 Married to <b>${esc(lf.partner.name)}</b>. A Date week is a night out with your spouse.</div>` : "";
  const coinsNow = pm.coins, cost = lf.costs.date, cur = lf.act && lf.act.act === "date" ? lf.act.partner : null;
  const cards = lf.opts.map((x) => {
    const can = lf.open && coinsNow >= cost, prop = x.can && lf.open && coinsNow >= cost + lf.wedCost;
    return `<div class="datec ${cur === x.id ? "sel" : ""} ${x.g === "F" ? "gf" : "gm"}">${faceOfPartner(x)}<b>${esc(x.name)}</b>
      <span class="tiny mute">${x.last ? "❤ Your last date · " : ""}${x.dates ? x.dates + " date" + (x.dates === 1 ? "" : "s") : "Not met yet"}</span>
      ${x.rej ? `<span class="tiny ${x.rej >= 2 ? "dn" : "mute"}">Turned down ${x.rej}×${x.rej >= 2 ? " · one more and they are gone" : ""}</span>` : ""}
      <div class="col" style="gap:5px;width:100%"><button class="btn sm pri" data-act="act" data-k="date" data-partner="${x.id}" ${can ? "" : "disabled"}>Take on a date · −${cost}</button>
      ${x.can ? `<button class="btn sm" data-act="act" data-k="date" data-partner="${x.id}" data-marry="1" ${prop ? "" : "disabled"}>💍 Propose · −${cost + lf.wedCost}</button>` : ""}
      <button class="btn sm ghost" data-act="turnDown" data-id="${x.id}" title="Not interested. Turn someone down three times and they never show up again.">Not interested</button></div></div>`;
  }).join("");
  return `<div class="datepick mt"><div class="row wrap" style="gap:8px;justify-content:space-between"><b>Who do you take out?</b><span class="tiny mute">Three people each week. Your last date is always here. Turn someone down 3 times and they are gone for good. Ten dates with one person and you can propose.</span></div><div class="datecards mt">${cards}</div></div>`;
}
function prefRow(lf) {
  const info = st.cat.life.acts, ks = ["train", "date", "party", "rest", "balance"];
  return `<div class="prefrow mt"><span class="small mute">When you are away or run out of time, you mostly…</span><div class="row wrap" style="gap:6px">${ks.map((k) => `<button class="btn sm ${lf.pref === k ? "pri" : ""}" data-act="setPref" data-k="${k}" title="${esc(info[k].text)}">${info[k].icon} ${esc(info[k].name)}</button>`).join("")}</div></div>`;
}
// ---------- boot sponsors ----------
const brandMark = (id, size = 34) => { const b = st.cat.life.brands.find((x) => x.id === id), u = st.cat.art && st.cat.art.brands && st.cat.art.brands[id]; return u ? `<img class="brandlogo" src="${esc(u)}" alt="${esc(b ? b.name : id)}" height="${size}">` : `<span class="brandtxt">${esc(b ? b.name : id)}</span>`; };
function dealOfferCard(lf) {
  const o = lf.offer; if (!o) return "";
  const b = st.cat.life.brands.find((x) => x.id === o.brand);
  return `<div class="dealcard mt">${brandMark(o.brand, 40)}<div class="grow"><b>${esc(b ? b.name : o.brand)} want to sign you</b><div class="small mute">A ${o.seasons}-season boot deal: <b>${o.pay} coins every matchday</b>. Wear a rival's boots under contract and it is a breach: a fine and no deal. Picking one maker over another can start a feud.</div></div><button class="btn pri" data-act="dealYes">Sign</button><button class="btn" data-act="dealNo">No thanks</button></div>`;
}
function dealLine(lf) {
  if (!lf.deal) return "";
  return `<div class="small mt dealline">${brandMark(lf.deal.brand, 20)} <span>Boot deal: <b>+${lf.deal.pay}</b> a matchday · ${lf.deal.left} season${lf.deal.left === 1 ? "" : "s"} left</span></div>`;
}
const TROPHY_ICON = { title: "🏆", ballon: "🌟", boot: "⚽", playmaker: "🎯", glove: "🧤" }, TROPHY_NAME = { title: "League title", ballon: "Ballon d'Or", boot: "Golden Boot", playmaker: "Playmaker", glove: "Golden Glove" };
function cabinet(lf) {
  const t = lf.trophies || []; if (!t.length) return "";
  const by = {}; for (const x of t) by[x.kind] = (by[x.kind] || 0) + 1;
  return `<div class="small mt cab">${Object.entries(by).map(([k, n]) => { const u = st.cat.art && st.cat.art.trophies && st.cat.art.trophies[k]; return `<span class="pill" title="${TROPHY_NAME[k]}">${u ? `<img src="${esc(u)}" alt="" height="16">` : TROPHY_ICON[k]} ${TROPHY_NAME[k]}${n > 1 ? " ×" + n : ""}</span>`; }).join(" ")}</div>`;
}

function shopView(S) {
  const pm = S.pm, lf = pm.life, cats = st.cat.life.cats, items = st.cat.life.shop, cat = ui().shopCat || "car";
  const tabs = cats.map(([k, n]) => `<button class="btn sm ${cat === k ? "pri" : ""}" data-act="shopCat" data-cat="${k}">${esc(n)}</button>`).join("");
  const owned = [...lf.own.cars, lf.own.house, lf.own.yacht, lf.own.plane ? "plane" : null, lf.own.club].filter(Boolean).map((id) => items.find((i) => i.id === id)).filter(Boolean);
  const rows = items.filter((i) => i.cat === cat).map((it) => {
    const s = lf.shop[it.id], can = lf.store && !s.own && !s.better && pm.coins >= s.price;
    const text = it.text || (it.fol ? `+${fmt(it.fol)} followers` : "");
    const act = s.own ? `<span class="pill good">Owned</span>` : s.better ? `<span class="pill">Have better</span>` : `<button class="btn sm pri" data-act="lifeBuy" data-id="${it.id}" ${can ? "" : "disabled"}>Buy · ${s.price}</button>`;
    return `<div class="shoprow"><div class="grow"><b>${esc(it.name)}</b><div class="tiny mute">${esc(text)}</div></div>${act}</div>`;
  }).join("");
  const mine = owned.length ? `<div class="own mt">${owned.map((i) => `<span class="pill">${esc(i.name)}</span>`).join("")}</div>` : "";
  const open = !!ui().shopOpen;
  return `<div class="shop mt"><button class="shophead" data-act="shopToggle"><b>Shop</b> <span class="mute small">cars, houses, yachts, a plane and nightlife</span> <span class="pill">${coins(pm.coins)}</span><span class="grow"></span><span class="mute">${open ? "▲" : "▼"}</span></button>${open ? `<div class="row wrap mt" style="gap:6px">${tabs}</div>${mine}<div class="shoplist mt">${rows}</div>` : ""}</div>`;
}

// A manager is asked before a story about the footballer on his team goes to the whole lobby.
export function newsAsk(S) {
  const a = S.news && S.news.ask; if (!a || !a.length) return "";
  return a.map((n) => `<div class="card newsask"><div class="tiny mute" style="text-transform:uppercase;letter-spacing:.08em">${esc(n.icon)} A story about ${esc(n.name)} is ready</div><b>${esc(n.head)}</b><p class="small mute" style="margin:4px 0 8px">${esc(n.sub)}</p>
    <div class="row" style="gap:8px"><button class="btn pri" data-act="newsYes" data-id="${n.id}">Let it run</button><button class="btn" data-act="newsNo" data-id="${n.id}">Keep it quiet</button></div></div>`).join("");
}
// The Daily Whistle as a front page: the newest story big, with the older ones in columns underneath.
export function frontPage(S, { cols = 6 } = {}) {
  const l = ((S.news && S.news.list) || []).slice().sort((a, b) => (b.pub || 0) - (a.pub || 0));
  const art = (k) => st.cat.art && st.cat.art.news && st.cat.art.news[k];
  const masthead = (() => { const u = st.cat.art && st.cat.art.ui && st.cat.art.ui.masthead; return u ? `<img src="${esc(u)}" alt="The Daily Whistle">` : `<div class="fp-title">The Daily Whistle</div>`; })();
  const where = S.season ? `Season ${S.seasonNo} · Matchday ${S.season.day + 1}` : "";
  const meta = `<div class="fp-meta"><span>${where}</span><span>Est. in the dressing room</span><span>${l.length} ${l.length === 1 ? "story" : "stories"} so far</span></div>`;
  if (!l.length) return `<div class="frontpage">${`<div class="fp-mast">${masthead}</div>`}${meta}<p class="fp-sub" style="padding:18px 16px;border:0">Quiet week. Nothing to report. The editor has gone for lunch.</p></div>`;
  const [lead, ...rest] = l, pic = art(lead.kind);
  const by = (n) => `${n.kind === "rumour" ? "" : esc(n.name) + " · "}${esc(n.club)}`;
  return `<div class="frontpage"><div class="fp-mast">${masthead}</div>${meta}
    <div class="fp-lead"><div><div class="fp-head">${esc(lead.head)}</div><p class="fp-sub">${esc(lead.sub)}</p><div class="tiny" style="margin-top:6px;letter-spacing:.1em;text-transform:uppercase;color:#7a6f55">${by(lead)} · season ${lead.season}, matchday ${lead.day + 1}</div></div>
      <div class="fp-pic" ${pic ? `style="background-image:url('${esc(pic)}')"` : ""}>${pic ? "" : esc(lead.kind === "steroids" ? "💉" : lead.icon)}<em>${esc(KIND[lead.kind] || "News")}</em></div></div>
    ${rest.length ? `<div class="fp-cols">${rest.slice(0, cols).map((n) => `<div class="fp-col"><small>${esc(KIND[n.kind] || "News")} · S${n.season} MD${n.day + 1}</small><b>${esc(n.head)}</b><span>${esc(n.sub.length > 120 ? n.sub.slice(0, 118) + "…" : n.sub)}</span></div>`).join("")}</div>` : ""}</div>`;
}
export function newsCard(S) {
  const l = S.news && S.news.list; if (!l || !l.length) return "";
  if (["md.result", "season.end", "season.intro"].includes(S.step)) return frontPage(S, { cols: 3 });
  return `<div class="card"><h3>Headlines</h3><div class="col" style="gap:8px">${l.slice(-5).reverse().map((n) => `<div class="hl nk-${n.kind}"><span class="hi">${n.kind === "steroids" ? WADA_MARK : esc(n.icon)}</span><div><b>${esc(n.head)}</b><div class="tiny mute">${esc(n.club)} · season ${n.season}, matchday ${n.day + 1}</div></div></div>`).join("")}</div></div>`;
}

// ---------- the banner ----------
export const WADA_MARK = `<img class="wadamark" src="/assets/wada-mark.png" alt="WADA" width="22" height="22">`;
const KIND = { milestone: "Milestone", troll: "Online beef", camera: "Caught on camera", sponsor: "Boots business", trophy: "Silverware", steroids: "Drugs ban", wedding: "Wedding", party: "Night out", drunk: "Scandal", proud: "Praise", yacht: "Yacht party", trouble: "Gossip column", boring: "The big question", rumour: "Rumour mill", fun: "Spotted", club: "Business" };
let queue = [], showing = null, timer = null;
const mast = () => { const u = st.cat.art && st.cat.art.ui && st.cat.art.ui.masthead; return u ? `<img class="nb-mast" src="${esc(u)}" alt="The Daily Whistle">` : "THE DAILY WHISTLE"; };
export function newsTick(S) {
  const n = S.news; if (!n) return;
  if (ui().newsSeen === undefined) { ui().newsSeen = n.top || 0; return; }
  const fresh = n.list.filter((x) => (x.pub || 0) > ui().newsSeen).sort((a, b) => a.pub - b.pub);
  for (const x of fresh) { queue.push(x); ui().newsSeen = Math.max(ui().newsSeen, x.pub); }
  if (!showing) nextBanner();
}
function nextBanner() {
  const n = queue.shift(); if (!n) { showing = null; return; }
  showing = n; clearTimeout(timer);
  let el = $("#newsban"); if (!el) { el = document.createElement("div"); el.id = "newsban"; document.body.appendChild(el); }
  const wada = n.kind === "steroids";
  el.className = "newsban nk-" + n.kind + " in" + (wada ? " wada" : "");
  const pic = st.cat.art && st.cat.art.news && st.cat.art.news[n.kind];
  el.innerHTML = `${pic ? `<div class="nb-pic" style="background-image:url('${esc(pic)}')"></div>` : ""}${wada ? `<div class="nb-wada"><img src="/assets/wada.jpg" alt="World Anti-Doping Agency"></div>` : ""}<div class="nb-in"><div class="nb-top"><span class="nb-k">${esc(n.icon)} ${esc(KIND[n.kind] || "News")}</span><span class="nb-paper">${mast()}</span><button class="nb-x" data-act="newsClose" aria-label="Close">✕</button></div>
    <h2>${esc(n.head)}</h2><p>${esc(n.sub)}</p><div class="nb-by">${n.kind === "rumour" ? "" : esc(n.name) + " · "}${esc(n.club)}${queue.length ? ` · ${queue.length} more` : ""}</div></div>`;
  if (wada) setTimeout(() => { const e = $("#newsban"); if (e && showing === n) e.classList.add("go"); }, 2300);
  timer = setTimeout(closeBanner, wada ? 14000 : 11000);
}
function closeBanner() {
  const el = $("#newsban"); clearTimeout(timer);
  if (el) { el.classList.remove("in"); el.classList.add("out"); setTimeout(() => { showing = null; if (queue.length) nextBanner(); else if (el.parentNode) el.remove(); }, 350); } else { showing = null; if (queue.length) nextBanner(); }
}
