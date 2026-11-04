// Footballer matchday screens. Same tiles as before, arranged to fit the first screen:
//   between matches: card, news, shop and table on the left; your week, status and relationships on the right.
//   during a match:  card (with Kit / Relationships), table and Golden Boot on the left; the live match on the right.
// Teams and chat sit underneath. The scores ticker runs along the bottom like a broadcast.
import { st, esc, team, card, coins, chip, crest } from "./core.js";
import { pmBits, pmKit } from "./pm.js";
import { lifeParts, newsCard, frontPage } from "./life.js";
import { relPanel } from "./romance.js";
import { playerSocial } from "./social.js";
import { storeCard } from "./store.js";
import { tablePanel, bootPanel, leadersPanel, scoreTicker } from "./match.js";

const HUB = new Set(["md.lineup", "season.intro"]);
const STEPS = new Set(["md.lineup", "season.intro", "md.half1", "md.half", "md.half2", "md.result"]);
export const pmLayoutOn = (S) => !!(S && S.pm && !S.me && !st.watch && STEPS.has(S.step));
export const pmHubStep = (S) => HUB.has(S.step);

export const pmScreenHandlers = {
  pmOver(a) { st.ui.pmOver = a.k; st.render(); },
  pmOverClose() { st.ui.pmOver = null; st.render(); },
};

const ord = (n) => n + (["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "th");
function nextLine(S) {
  const pm = S.pm; if (!S.season) return "";
  const fx = pm.team != null ? (S.season.fixtures || []).find(([a, b]) => a === pm.team || b === pm.team) : null;
  const rank = pm.team != null ? (S.table || []).findIndex((r) => r.i === pm.team) : -1, row = rank >= 0 ? S.table[rank] : null;
  const opp = fx ? (fx[0] === pm.team ? fx[1] : fx[0]) : null;
  return `Matchday ${S.season.day + 1} of ${S.season.total}${fx && team(opp) ? ` · ${fx[0] === pm.team ? "Home" : "Away"} v ${chip(team(opp), 18)}` : ""}${row ? ` · ${ord(rank + 1)} · ${row.pts} pts` : ""}`;
}

// The footballer's card with the shortcuts that open the other tiles.
function cardTile(S, hub) {
  const pm = S.pm, lf = pm.life, R = lf && lf.rom;
  const worn = pm.equip ? pm.equip.length : 0, cap = st.cat.rules.playerItemCap ?? 2, reqs = R ? (R.incoming || []).length : 0;
  const open = !!(S.store && S.store.open);
  const btn = (k, ic, txt, pill = "") => `<button class="btn" data-act="pmOver" data-k="${k}">${ic} ${txt}${pill}</button>`;
  return `<div class="card pmcardtile">${card(pm.pid, { size: "lg", info: true })}<div class="pmbtns">
    ${btn("kit", "🎒", "Kit", ` <span class="pill tiny">${worn}/${cap} worn</span>`)}
    ${hub ? "" : btn("rel", "💞", "Relationships", reqs ? ` <span class="pill bad tiny">${reqs}</span>` : "")}
    ${!hub && open ? btn("shop", "🛒", "Shop") : ""}
    ${hub ? "" : btn("news", "📰", "News")}
    ${btn("table", "📊", "Table &amp; stats")}</div></div>`;
}
function tableTile(S) {
  const h = typeof innerHeight === "number" ? innerHeight : 900, t = tablePanel(S, h < 760 ? 7 : h < 860 ? 8 : 10, false, S.pm.team);   // fewer rows on a short screen so the tile fits the first fold
  return t ? t : `<div class="card"><h3>League table</h3><p class="small mute">No matches played yet.</p></div>`;
}
function newsTile(S) {
  const l = (S.news && S.news.list) || [];
  const rows = l.slice(-3).reverse().map((n) => `<div class="hl nk-${n.kind}"><span class="hi">${esc(n.icon)}</span><div><b>${esc(n.head)}</b><div class="tiny mute">${esc(n.club)} · matchday ${n.day + 1}</div></div></div>`).join("");
  return `<div class="card"><h3>News</h3>${rows ? `<div class="col" style="gap:8px">${rows}</div><button class="btn sm mt" data-act="pmOver" data-k="news">The Daily Whistle</button>` : `<p class="small mute">Quiet week. Nothing to report.</p>`}</div>`;
}
function shopTile(S) {
  const open = !!(S.store && S.store.open), rare = open && Object.values(S.store.stock || {}).some((n) => n > 0);
  return `<button class="hubtile pmshop" data-act="pmOver" data-k="shop" ${open ? "" : "disabled"}><span class="ic">🛒</span><b>Shop</b><span class="sub">${Math.round(S.pm.coins)} coins${rare ? ` · <span class="rarepip">rare item</span>` : ""}${open ? "" : " · closed"}</span></button>`;
}
// Who he is and where he plays, then the week to choose, then the life status.
function topTile(S) {
  const b = pmBits(S); if (!b) return "";
  const { pm, p } = b, t = pm.team != null ? team(pm.team) : null, L = lifeParts(S);
  return `<div class="card pmp pmtop"><div class="pmhead2">${t ? `<span class="pmcrest">${crest(t, 64)}</span>` : ""}<div class="grow col" style="gap:5px;min-width:0"><h3 style="margin:0">${esc(p.name)} <span class="mute small">${esc(p.pos)} · ${p.age}y · OVR ${p.ovr}</span></h3><div class="small">${b.status}</div><div class="small mute">${nextLine(S)}</div><div class="row wrap" style="gap:8px"><span class="pill">${coins(pm.coins)}</span>${b.ban}</div>${b.last}</div></div>
    ${b.extra}${L ? `${L.offer}${L.week}<div class="pmstat mt"><h3>Life off the pitch</h3>${L.status}</div>` : ""}</div>`;
}

function overlay(S) {
  const k = st.ui.pmOver; if (!k) return "";
  const closed = `<div class="card"><p class="mute">The shop is closed right now. It opens between matches.</p></div>`;
  const body = k === "kit" ? pmKit(S) : k === "rel" ? relPanel(S) : k === "shop" ? storeCard(S) || closed : k === "table" ? tablePanel(S, 99, false) + leadersPanel(S, 10) : k === "news" ? frontPage(S, { cols: 9 }) : "";
  if (!body) return "";
  const title = { kit: "Your kit", rel: "Relationships", shop: "Shop", table: "League table and stats", news: "The Daily Whistle" }[k];
  return `<div class="pmov"><div class="pmov-bg" data-act="pmOverClose"></div><div class="pmov-in" role="dialog" aria-label="${title}"><div class="pmov-bar"><b>${title}</b><button class="btn sm" data-act="pmOverClose">Close ✕</button></div><div class="pmov-body" data-keep="pmov">${body}</div></div></div>`;
}

// right: the match view's own content (empty between matches).
export function pmScreen(S, ctx, right) {
  if (st.ui.pmOverStep !== S.step) { st.ui.pmOverStep = S.step; st.ui.pmOver = null; }
  const hub = HUB.has(S.step), b = pmBits(S);
  let L, R;
  if (hub) {
    L = `${cardTile(S, true)}<div class="pmL2"><div class="col" style="gap:14px">${newsTile(S)}${shopTile(S)}</div>${tableTile(S)}</div>`;
    R = `${topTile(S)}${playerSocial(S)}${relPanel(S)}`;
  } else {
    L = `${cardTile(S, false)}${tableTile(S)}${bootPanel(S, 5)}`;
    R = `${b && b.extra ? `<div class="card pmp pmalerts">${b.extra}</div>` : ""}${playerSocial(S)}${right}${S.step === "md.result" ? newsCard(S) : ""}`;
  }
  const below = `${hub ? bootPanel(S, 5) : ""}${ctx.teamsList(S)}${ctx.chatCard(S)}`;
  return `<div class="pmgrid"><div class="pmL">${L}</div><div class="pmR">${R}</div></div><div class="pmbelow">${below}</div><div class="pmtkbar">${hub ? scoreTicker(S) : ""}</div>${overlay(S)}`;
}
