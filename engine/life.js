// Player-mode life: what a created footballer does between matches, what he can buy, and the news stories that follow.
// Pure and seeded: the same choices with the same seed always give the same stories. Everything numeric lives in params.life.
import { makeRng, clamp } from "./rng.js";
import { rate } from "./roster.js";
import { loveWeek, secretDate, committed, likeOf } from "./affair.js";

export const ACTS = ["train", "date", "party", "rest", "balance"];
export const ACT_INFO = {
  train: { name: "Train hard", icon: "🏋️", text: "Skills up, followers up. Leaves you tired and your love life cold." },
  date: { name: "Date", icon: "💘", text: "Love life up. Costs a little money and some energy. Good dates lead to going exclusive, and then a wedding you plan yourself. You can also ask another footballer out (you pay)." },
  party: { name: "Party", icon: "🪩", text: "Followers up, but it costs money, energy and love life. Small chance of a drugs flag (2-match ban)." },
  rest: { name: "Rest", icon: "🛌", text: "The best recovery there is. Love life and followers drift down." },
  balance: { name: "Balance", icon: "⚖️", text: "A normal week. Almost nothing changes." },
};

// ---------- shop ----------
export const SHOP = [
  { id: "car-gr86", cat: "car", name: "Toyota GR86", price: 40, fol: 150 },
  { id: "car-golfr", cat: "car", name: "Volkswagen Golf R", price: 70, fol: 300 },
  { id: "car-m3", cat: "car", name: "BMW M3", price: 120, fol: 600 },
  { id: "car-amg", cat: "car", name: "Mercedes-AMG GT", price: 190, fol: 1000 },
  { id: "car-911", cat: "car", name: "Porsche 911 GT3", price: 270, fol: 1500 },
  { id: "car-296", cat: "car", name: "Ferrari 296 GTB", price: 400, fol: 2500 },
  { id: "car-revuelto", cat: "car", name: "Lamborghini Revuelto", price: 520, fol: 3500 },
  { id: "house-flat", cat: "house", name: "City flat", price: 120, rec: 2, text: "+2 recovery every matchday" },
  { id: "house-town", cat: "house", name: "Townhouse", price: 280, rec: 4, text: "+4 recovery every matchday" },
  { id: "house-mansion", cat: "house", name: "Mansion", price: 600, rec: 6, fol: 1500, text: "+6 recovery every matchday" },
  { id: "yacht", cat: "yacht", name: "Yacht", price: 700, fol: 4000, text: "Throw a party on it" },
  { id: "yacht-mega", cat: "yacht", name: "Mega yacht", price: 1800, fol: 12000, text: "Helipad. Obviously." },
  { id: "plane", cat: "plane", name: "Private plane", price: 1500, fol: 8000, rec: 3, text: "+3 recovery every matchday" },
  { id: "club-bar", cat: "club", name: "Neighbourhood bar", price: 300, income: 6, party: 0.3, text: "+6 coins a matchday when you do not Party. Party costs 30% less" },
  { id: "club-club", cat: "club", name: "Nightclub", price: 700, income: 14, party: 0.5, text: "+14 coins a matchday when you do not Party. Party costs 50% less" },
  { id: "club-gents", cat: "club", name: "Gentlemen's club", price: 1200, income: 24, party: 0.6, text: "+24 coins a matchday when you do not Party. Party costs 60% less" },
];
export const shopItem = (id) => SHOP.find((s) => s.id === id);
export const SHOP_CATS = [["car", "Cars"], ["house", "Houses"], ["yacht", "Yachts"], ["plane", "Private plane"], ["club", "Nightlife"]];

// ---------- state ----------
// The people a footballer can date. Art for each goes in public/assets/partners/<id>.png (square, face and shoulders).
export const PARTNER_LIST = [
  ["sofia-marquez", "Sofia Marquez", "F"], ["camille-dubois", "Camille Dubois", "F"], ["amara-okafor", "Amara Okafor", "F"], ["zoe-whitfield", "Zoe Whitfield", "F"],
  ["ingrid-larsen", "Ingrid Larsen", "F"], ["nia-adeyemi", "Nia Adeyemi", "F"], ["priya-nair", "Priya Nair", "F"], ["freya-holm", "Freya Holm", "F"],
  ["mei-tanaka", "Mei Tanaka", "F"], ["valentina-rossi", "Valentina Rossi", "F"], ["aaliyah-brooks", "Aaliyah Brooks", "F"], ["elena-petrova", "Elena Petrova", "F"],
  ["jordan-blake", "Jordan Blake", "M"], ["kenji-aoki", "Kenji Aoki", "M"], ["luca-bianchi", "Luca Bianchi", "M"], ["mateo-silva", "Mateo Silva", "M"],
  ["theo-martin", "Theo Martin", "M"], ["dani-costa", "Dani Costa", "M"], ["rafael-duarte", "Rafael Duarte", "M"], ["marcus-reid", "Marcus Reid", "M"],
  ["omar-haddad", "Omar Haddad", "M"], ["anders-nilsson", "Anders Nilsson", "M"], ["diego-fuentes", "Diego Fuentes", "M"], ["jamal-carter", "Jamal Carter", "M"],
].map(([id, name, g]) => ({ id, name, g }));
export const partnerById = (id) => PARTNER_LIST.find((x) => x.id === id) || null;
// ---------- the shared love life ----------
// Everything about the people you can date is shared by every footballer in the room: who is seeing whom, who is exclusive,
// who got their heart broken, who is married, and each person's hidden loyalty.
export function ensureRom(game) {
  if (!game.rom) game.rom = { week: 0, npc: {}, req: [], reqSeq: 0, thr: [], thrSeq: 0, events: [], evSeq: 0, feuds: [] };
  const R = game.rom; R.npc = R.npc || {}; R.req = R.req || []; R.thr = R.thr || []; R.events = R.events || []; R.feuds = R.feuds || [];
  return R;
}
export function npcState(game, id) {
  const R = ensureRom(game);
  if (!R.npc[id]) R.npc[id] = { loyalty: 8 + Math.floor(makeRng(game.seed, "loyal", id)() * 88), excl: null, cool: 0, married: null, seen: [] };
  return R.npc[id];
}
export const isHuman = (id) => typeof id === "string" && id.startsWith("u:");
// Anybody you can be with: one of the listed people, or another footballer in the room ("u:<id>").
export function personOf(game, id) {
  if (isHuman(id)) { const q = game.players[+id.slice(2)]; return q ? { id, name: q.name, g: q.gender === "F" ? "F" : "M", human: q.id, img: q.img } : null; }
  return partnerById(id);
}
// The other members of the thrupple this footballer is in (ids), or [].
export function thrMembers(game, p) {
  const L = p.life; if (!L || !L.thr) return [];
  const t = ensureRom(game).thr.find((x) => x.id === L.thr); if (!t) return [];
  return t.members.filter((m) => m !== "u:" + p.id);
}
// One footballer's relationship with `id` ends. The ex's side is cleared too; a broken heart makes a listed person unavailable for a while.
export function leave(game, p, id, { cool = false } = {}) {
  const L = ensureLife(game, p), R = ensureRom(game);
  if (L.partner && L.partner.id === id) L.partner = null;
  L.dated[id] = Math.floor((L.dated[id] || 0) / 2);
  if (L.dq && L.dq[id]) { L.dq[id].n = Math.floor(L.dq[id].n / 2); L.dq[id].good = Math.floor(L.dq[id].good / 2); L.dq[id].sum /= 2; }
  if (isHuman(id)) {
    const q = game.players[+id.slice(2)], QL = q && q.life;
    if (QL && QL.partner && QL.partner.id === "u:" + p.id) { QL.partner = null; QL.love = clamp(QL.love - 15, 0, 100); }
    if (QL && QL.act && QL.act.partner === "u:" + p.id) QL.act = null;
  } else { const n = npcState(game, id); if (n.excl === p.id) n.excl = null; if (cool) n.cool = R.week + game.P.life.rom.dumpHeart; }
  if (L.act && L.act.partner === id) L.act = null;
  if (L.wed && L.wed.partner === id) L.wed = null;
  if (isHuman(id)) { const q = game.players[+id.slice(2)]; if (q && q.life && q.life.wed && q.life.wed.partner === "u:" + p.id) q.life.wed = null; }
  if (L.thr) leaveThr(game, p);
}
export function leaveThr(game, p) {
  const L = p.life, R = ensureRom(game); if (!L || !L.thr) return;
  const t = R.thr.find((x) => x.id === L.thr); L.thr = null;
  if (!t) return;
  t.members = t.members.filter((m) => m !== "u:" + p.id);
  const rest = t.members.filter(isHuman);
  if (t.members.length < 3 || rest.length === 0) { for (const m of t.members) if (isHuman(m)) { const q = game.players[+m.slice(2)]; if (q && q.life) q.life.thr = null; } R.thr = R.thr.filter((x) => x !== t); }
}
// Why this person cannot be dated by this footballer right now (or null).
export function npcBlock(game, id, pid) {
  if (isHuman(id)) return null;
  const n = npcState(game, id), R = ensureRom(game);
  if (n.married != null && n.married !== pid) return "Married";
  if (n.excl != null && n.excl !== pid) return "Taken";
  if (n.cool > R.week) return "Heartbroken";
  return null;
}
// Other footballers who took this person out lately.
export function otherSuitors(game, id, pid) {
  const R = ensureRom(game), n = npcState(game, id), lim = R.week - game.P.life.rom.seeWeeks;
  return [...new Set(n.seen.filter((x) => x.pid !== pid && x.week > lim).map((x) => x.pid))];
}
// Boot makers that can sign a footballer. Logos go in public/assets/brands/<id>.png. `rival` is who they would love to annoy.
// `rank` is how big the maker is: 1 = budget label, 2 = established, 3 = global giant. Bigger makers only come knocking at higher follower tiers.
export const BOOT_BRANDS = [
  { id: "nike", name: "Nike", rival: "adidas", rank: 3 }, { id: "adidas", name: "Adidas", rival: "puma", rank: 3 },
  { id: "puma", name: "Puma", rival: "adidas", rank: 3 }, { id: "mizuno", name: "Mizuno", rival: "nike", rank: 2 },
  { id: "newbalance", name: "New Balance", rival: "nike", rank: 2 }, { id: "on", name: "ON", rival: "nike", rank: 2 },
  { id: "umbro", name: "Umbro", rival: "puma", rank: 1 }, { id: "reebok", name: "Reebok", rival: "adidas", rank: 1 },
  { id: "lotto", name: "Lotto", rival: "mizuno", rank: 1 }, { id: "joma", name: "Joma", rival: "lotto", rank: 1 },
  { id: "skechers", name: "Skechers", rival: "nike", rank: 1 },
];
// Which makers may offer at each deal tier (0 = first small deal, 3 = the biggest).
export const DEAL_RANKS = [[1, 1], [1, 2], [2, 3], [3, 3]];
export const brandById = (id) => BOOT_BRANDS.find((x) => x.id === id) || null;
export const brandOfItem = (itemId) => { const m = /^boots-([a-z]+)-/.exec(itemId || ""); return m ? m[1] : null; };
const CLUBNAMES = ["Offside", "The Back Post", "Extra Time", "VAR Room", "Golden Boot", "Stoppage", "Nutmeg", "Top Bins", "The Dugout", "Panenka"];
export function ensureLife(game, p) {
  const P = game.P.life;
  if (!p.life) p.life = { fol: P.startFollowers, love: P.startLove, partner: null, married: false, own: { cars: [], house: null, yacht: null, plane: false, club: null }, cnt: { train: 0, date: 0, party: 0, rest: 0, balance: 0 }, sCount: 0, flags: {}, act: null, dated: {}, rej: {}, opts: null, pref: null, hit: {}, trophies: [], deal: null, offer: null, last: null, clubName: null };
  const L = p.life; L.dated = L.dated || {}; L.rej = L.rej || {}; L.hit = L.hit || {}; L.trophies = L.trophies || [];
  return L;
}
export const resetSeason = (game) => {
  for (const p of Object.values(game.players)) if (p.user && p.life) {
    const L = p.life; L.cnt = { train: 0, date: 0, party: 0, rest: 0, balance: 0 }; L.sCount = 0; L.flags = {}; L.act = null; L.opts = null; L.beef = null;
    if (L.wed && L.wed.status === "planned" && L.wed.season !== game.season) { p.coins = (p.coins || 0) + (L.wed.paid || 0); L.wed = null; }   // a wedding that never happened is refunded
    if (L.wed && L.wed.status === "agreeing") { L.wed.status = "planning"; L.wed.plan = null; }   // a plan waiting for a yes was for last season's matchdays
  }
};

export function nightclub(life) { return life.own.club ? shopItem(life.own.club) : null; }
export function actCost(game, p, act) {
  const L = ensureLife(game, p), base = game.P.life.acts[act].cost;
  const club = nightclub(L);
  return Math.round(act === "party" && club ? base * (1 - club.party) : base);
}
export const WEDDING_COST = (game) => game.P.life.wedding.cost;
// A wedding can be planned with an exclusive partner you have been out with often enough (P.life.wedding.dates).
export function canMarry(game, p, pid) {
  const L = ensureLife(game, p); if (L.married || L.wed) return false;
  const q = L.partner; if (!q || !q.excl || (pid && pid !== q.id)) return false;
  return (L.dated[q.id] || 0) >= game.P.life.wedding.dates;
}
// Why this choice cannot be made right now (or null).
export function blocked(game, p, act, { partner = null, joint = null, secret = false } = {}) {
  if (!ACTS.includes(act)) return "unknown";
  if (secret) {                                                            // a secret date (an affair): only while committed, with someone from this week's list
    const SL = ensureLife(game, p); if (act !== "date" || !partner) return "unknown";
    if (!committed(SL)) return "Secret dates are for people in a relationship";
    if (partner === SL.partner.id) return "That is your partner";
    if (!(SL.opts && SL.opts.ids.includes(partner)) && !(SL.affair && SL.affair.id === partner)) return "That person is not on your list";
    const b = npcBlock(game, partner, p.id); if (b) return b;
    if ((p.coins || 0) < actCost(game, p, "date")) return "Not enough money";
    return null;
  }
  const L = ensureLife(game, p), cost = actCost(game, p, act) * (act === "date" && joint && joint.pay ? game.P.life.rom.dateMult : joint && !joint.pay ? 0 : 1);
  if (act === "party" && p.susp > 0) return "You are suspended";
  if (act === "date" && partner && isHuman(partner)) { if (!joint) return "Ask them first"; }
  else if (act === "date" && partner) {
    if (!L.married && !(L.opts && L.opts.ids.includes(partner)) && !(L.partner && L.partner.id === partner)) return "That person is not on your list";
    const b = npcBlock(game, partner, p.id); if (b) return b;
  }
  if ((p.coins || 0) < cost) return "Not enough money";
  return null;
}

// ---------- who you can date ----------
// Each week there are three people to choose from, at least one of each gender. The last person you dated is always one
// of them (unless you turned them down three times); anyone you specifically turn down three times never comes back.
function genOptions(game, p, day, keep, salt) {
  const L = ensureLife(game, p), r = makeRng(game.seed, "dates", p.id, game.season, day, salt || 0), list = keep.slice();
  if (!list.length && L.partner && L.partner.id && !isHuman(L.partner.id) && !L.married && (L.rej[L.partner.id] || 0) < 3 && !npcBlock(game, L.partner.id, p.id)) list.push(L.partner.id);
  const gone = new Set((L.opts && L.opts.gone) || []);
  const pool = PARTNER_LIST.filter((x) => !list.includes(x.id) && (!L.married || !L.partner || x.id !== L.partner.id) && (L.rej[x.id] || 0) < 3 && !gone.has(x.id) && !npcBlock(game, x.id, p.id));
  while (list.length < 3 && pool.length) {
    const gs = list.map((id) => (partnerById(id) || { g: "F" }).g), slots = 3 - list.length, needF = !gs.includes("F"), needM = !gs.includes("M"), need = (needF ? 1 : 0) + (needM ? 1 : 0);
    let c = pool;
    if (need >= slots) c = pool.filter((x) => x.g === (needF ? "F" : "M"));
    if (!c.length) c = pool;
    const pick = c[Math.floor(r() * c.length)]; list.push(pick.id); pool.splice(pool.indexOf(pick), 1);
  }
  return list;
}
export function ensureOptions(game, p, day) {
  const L = ensureLife(game, p);
  if (!L.opts || L.opts.day !== day || L.opts.season !== game.season) L.opts = { day, season: game.season, ids: genOptions(game, p, day, [], 0), gone: [], n: 0 };
  return L.opts.ids;
}
// "Not interested": counts against that person; a replacement takes the slot.
export function declineDate(game, p, pid) {
  const L = ensureLife(game, p); if (!L.opts || !L.opts.ids.includes(pid)) return false;
  L.rej[pid] = (L.rej[pid] || 0) + 1;
  L.opts.gone.push(pid); L.opts.ids = L.opts.ids.filter((x) => x !== pid); L.opts.n++;
  L.opts.ids = genOptions(game, p, L.opts.day, L.opts.ids, L.opts.n);
  if (L.act && L.act.partner === pid) L.act = null;
  return true;
}
// What happens in a week where nothing was chosen: the preferred activity (most of the time), otherwise a plain Balance week.
export function weekChoice(game, p, day) {
  const L = ensureLife(game, p), r = makeRng(game.seed, "pref", p.id, game.season, day);
  if (L.pref && r() < game.P.life.prefChance) {
    const partner = L.pref !== "date" ? null : L.partner && !isHuman(L.partner.id) && (L.married || L.partner.excl || (L.opts && L.opts.ids.includes(L.partner.id))) && !npcBlock(game, L.partner.id, p.id) ? L.partner.id : L.married || (L.partner && L.partner.excl) ? null : (ensureOptions(game, p, day)[0] || null);
    if (!blocked(game, p, L.pref, { partner })) return { act: L.pref, partner };
  }
  return { act: "balance", partner: null };
}

// ---------- buying ----------
export function buyLife(game, p, id) {
  const it = shopItem(id), L = ensureLife(game, p); if (!it) return false;
  const o = L.own; let price = it.price;
  if (it.cat === "car") { if (o.cars.includes(id)) return false; }
  else if (it.cat === "house") { const cur = o.house && shopItem(o.house); if (cur && cur.price >= it.price) return false; if (cur) price -= Math.round(cur.price * 0.5); }
  else if (it.cat === "yacht") { const cur = o.yacht && shopItem(o.yacht); if (cur && cur.price >= it.price) return false; if (cur) price -= Math.round(cur.price * 0.5); }
  else if (it.cat === "plane") { if (o.plane) return false; }
  else if (it.cat === "club") { const cur = nightclub(L); if (cur && cur.price >= it.price) return false; if (cur) price -= Math.round(cur.price * 0.5); }
  if ((p.coins || 0) < price) return false;
  p.coins -= price; L.fol += it.fol || 0;
  if (it.cat === "car") o.cars.push(id); else if (it.cat === "house") o.house = id; else if (it.cat === "yacht") o.yacht = id; else if (it.cat === "plane") o.plane = true; else if (it.cat === "club") { o.club = id; if (!L.clubName) L.clubName = CLUBNAMES[Math.floor(makeRng(game.seed, "clubname", p.id)() * CLUBNAMES.length)]; }
  return { price, item: it };
}
// Selling a car or a house gives back a share of its price (params.player.sellBack). The followers it brought stay.
export const sellPrice = (game, it) => Math.round(it.price * game.P.player.sellBack);
export function sellLife(game, p, id) {
  const it = shopItem(id), L = ensureLife(game, p); if (!it || (it.cat !== "car" && it.cat !== "house")) return false;
  const o = L.own;
  if (it.cat === "car") { const i = o.cars.indexOf(id); if (i < 0) return false; o.cars.splice(i, 1); }
  else { if (o.house !== id) return false; o.house = null; }
  const price = sellPrice(game, it); p.coins = (p.coins || 0) + price;
  return { price, item: it };
}
export const priceFor = (game, p, it) => {
  const L = ensureLife(game, p), o = L.own, cur = it.cat === "house" ? o.house && shopItem(o.house) : it.cat === "yacht" ? o.yacht && shopItem(o.yacht) : it.cat === "club" ? nightclub(L) : null;
  return cur && cur.price < it.price ? it.price - Math.round(cur.price * 0.5) : it.price;
};
export const owns = (L, it) => (it.cat === "car" ? L.own.cars.includes(it.id) : it.cat === "plane" ? L.own.plane : L.own[it.cat === "club" ? "club" : it.cat] === it.id);
export const ownsBetter = (L, it) => { const cur = it.cat === "house" ? L.own.house : it.cat === "yacht" ? L.own.yacht : it.cat === "club" ? L.own.club : null; const c = cur && shopItem(cur); return !!(c && c.price >= it.price); };

// ---------- the week ----------
// Pay a day's income to a user player: sponsors follow followers; a club pays on the nights you did not go out.
export function lifeIncome(game, p) {
  const L = ensureLife(game, p), P = game.P.life, club = nightclub(L);
  const sponsor = Math.min(P.sponsor.cap, Math.floor(L.fol / P.sponsor.per));
  const venue = club && L.last && L.last.act !== "party" ? club.income : 0;
  const boots = L.deal && L.deal.left > 0 ? L.deal.pay : 0;
  return { sponsor, venue, boots, total: sponsor + venue + boots };
}

const who = (p) => (p.gender === "F" || p.gender === "Female" ? "Woman" : p.gender === "M" || p.gender === "Male" ? "Man" : "Footballer");
const fem = (p) => p.gender === "F" || p.gender === "Female";
const he = (p) => (fem(p) ? "She" : "He"), his = (p) => (fem(p) ? "her" : "his"), him = (p) => (fem(p) ? "her" : "him");
const club = (game, p) => (p.team != null ? game.teams[p.team].name : "Free agent");
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const carOf = (L) => { const c = L.own.cars.map(shopItem).sort((a, b) => b.price - a.price)[0]; return c ? c.name : "car"; };
const partnerOf = (L) => (L.partner ? L.partner.name : "a mystery companion");

// Story table. `g` stories always happen when their condition is met; the rest need a roll and share the season cap.
// At most `P.life.perWeek` (one) story is printed a week for the whole league. When several qualify, the one with the higher
// `prio` is printed and the others are overwritten: steroids 5, wedding 4, boring 3, then scandals and fun. A `g` story that
// is overwritten still happens (the ban, the marriage, its follower and love-life effects); only its headline is dropped.
// Each build() returns { head, sub, fx: { fol, love, coins } }.
const STORIES = [
  { id: "boring", g: true, prio: 3, kind: "boring", icon: "😴", when: (c) => c.act === "balance" && c.L.cnt.balance === c.P.boringAt,
    build: (c) => ({ head: `MOST BORING ${who(c.p).toUpperCase()} IN THE LEAGUE?`, sub: `${c.p.name} has had a perfectly balanced week ${c.P.boringAt} times this season. Team-mates: "${he(c.p)}'s fine. ${he(c.p)}'s just... fine."`, fx: { fol: -400 } }) },
  { id: "wedding", g: true, prio: 4, kind: "wedding", icon: "💍", when: (c) => c.wedding,
    build: (c) => ({ head: `WEDDING BELLS: ${c.p.name.toUpperCase()} SAYS "I DO"`, sub: `${c.p.name} and ${partnerOf(c.L)} tie the knot after ${c.L.partner.dates} dates. The ${club(c.game, c.p)} dressing room is "emotional". Honeymoon: one rest day.`, fx: { fol: 3000, love: 25 } }) },
  { id: "wada", g: true, prio: 5, kind: "steroids", icon: "🧪", when: (c) => c.wada,
    build: (c) => ({ head: `WADA FLAG: ${c.p.name.toUpperCase()} SIDELINED`, sub: `${c.p.name} (${club(c.game, c.p)}) misses the next ${c.P.wadaBan} matches after a flagged test. Camp insists "it was the protein shake".`, fx: { fol: -2500 } }) },
  { id: "drunk", prio: 2, chance: (c) => c.P.chance.drunk, kind: "drunk", icon: "🚨", when: (c) => c.act === "party" && c.L.own.cars.length > 0 && c.L.cnt.party >= c.P.drunkAt && !c.L.flags.drunk,
    build: (c) => ({ head: `${c.p.name.toUpperCase()} IN DRINK-DRIVING SCANDAL`, sub: `The ${carOf(c.L)} was found on the wrong side of the road. ${club(c.game, c.p)} are "very disappointed" and a fine is on the way.`, fx: { fol: -2500, coins: -30 }, flag: "drunk" }) },
  { id: "proud", prio: 1, chance: (c) => c.P.chance.proud, kind: "proud", icon: "👏", approval: true, when: (c) => c.act === "train" && !c.L.flags.proud,
    build: (c) => ({ head: `"SO PROUD OF ${his(c.p).toUpperCase()} WORK RATE": ${club(c.game, c.p).toUpperCase()} PRAISE ${c.p.name.toUpperCase()}`, sub: `Last one in, last one out. The coaching staff say ${c.p.name} is "setting the standard" at ${club(c.game, c.p)}.`, fx: { fol: 900 }, flag: "proud" }) },
  { id: "monaco", prio: 2, chance: (c) => c.P.chance.monaco, kind: "yacht", icon: "🛥️", when: (c) => c.act === "party" && !!c.L.own.yacht && !c.game.newsFlags["monaco" + c.game.season],
    build: (c) => ({ head: `${c.p.name.toUpperCase()} HOSTS THE MONACO GP YACHT PARTY`, sub: `The paddock turns up, a driver DJs, and nobody remembers who won the race. Champagne bill: "undisclosed, and large".`, fx: { fol: 5000, coins: -80 }, gflag: "monaco" }) },
  { id: "trouble", prio: 1, chance: (c) => c.P.chance.trouble, kind: "trouble", icon: "💔", when: (c) => c.act === "party" && c.married,
    build: (c) => ({ head: `TROUBLE IN PARADISE FOR ${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()}`, sub: `Another late night out and a very quiet breakfast. Friends say "they are working through it". The dog has picked a side.`, fx: { fol: 700, love: -30 } }) },
  { id: "jet", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "✈️", when: (c) => c.act === "train" && c.L.own.plane && !c.L.flags.jet,
    build: (c) => ({ head: `${c.p.name.toUpperCase()} LANDS PRIVATE JET AT TRAINING GROUND`, sub: `Groundstaff were "mildly concerned" as the plane taxied past the cones. The gaffer is not amused. The fans are.`, fx: { fol: 1800 }, flag: "jet" }) },
  { id: "yachtdate", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "🛥️", when: (c) => c.act === "date" && !(c.date && c.date.secret) && !!c.L.own.yacht && c.L.partner && c.L.partner.dates >= 3 && !c.L.flags.yachtdate,
    build: (c) => ({ head: `LOVE ON THE WATER: ${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()}`, sub: `A sunset, a very long deck and one tiny sofa. Photographers on jet skis got the shots.`, fx: { fol: 1100, love: 8 }, flag: "yachtdate" }) },
  { id: "kebab", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "🍟", when: (c) => c.act === "date" && !(c.date && c.date.secret) && !!c.L.partner && !c.L.flags.kebab,
    build: (c) => ({ head: `CHIPS AND LOVE: ${c.p.name.toUpperCase()} SPOTTED WITH ${partnerOf(c.L).toUpperCase()}`, sub: `Sharing a tray of chips at 11pm. Staff say the ${club(c.game, c.p)} ${c.p.pos} tipped well and asked for extra sauce.`, fx: { fol: 800 }, flag: "kebab" }) },
  { id: "owner", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "🎧", when: (c) => c.act === "party" && !!nightclub(c.L) && !c.L.flags.owner,
    build: (c) => ({ head: `OWNER'S SET: ${c.p.name.toUpperCase()} TAKES OVER THE DECKS AT ${(c.L.clubName || "OFFSIDE").toUpperCase()}`, sub: `A 3am set of nothing but stadium anthems goes viral. Management (also ${c.p.name}) approve the overtime.`, fx: { fol: 2500 }, flag: "owner" }) },
  { id: "sleep", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "🛌", when: (c) => c.act === "rest" && c.L.cnt.rest >= c.P.sleepAt && !c.L.flags.sleep,
    build: (c) => ({ head: `${c.p.name.toUpperCase()} HAS BEEN IN BED SINCE TUESDAY`, sub: `A fourteen-hour nap before the next fixture. The physio calls it "elite recovery". The sofa is jealous.`, fx: { fol: 350 }, flag: "sleep" }) },
  { id: "gym", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "💪", when: (c) => c.act === "train" && c.L.cnt.train >= c.P.gymAt && !c.L.flags.gym,
    build: (c) => ({ head: `GYM RAT ALERT: ${c.p.name.toUpperCase()} LOCKED IN THE GYM`, sub: `Cleaners found ${him(c.p)} still doing calf raises at midnight. The floodlights were switched off "as a hint".`, fx: { fol: 500 }, flag: "gym" }) },
  { id: "wild", prio: 1, chance: (c) => c.P.chance.wild, kind: "party", icon: "🍾", when: (c) => c.act === "party",
    build: (c, r) => ({ head: pick(r, [`WILD NIGHT OUT: ${c.p.name.toUpperCase()} SPOTTED AT 4AM`, `${c.p.name.toUpperCase()} DANCES ON A TABLE. IT HOLDS.`, `STARS OUT: ${c.p.name.toUpperCase()} LEADS THE CONGA LINE`]), sub: pick(r, [`Witnesses say the ${club(c.game, c.p)} ${c.p.pos} was "in great spirits" and had lost one shoe.`, `Fans filmed it all. The group chat has not recovered.`, `A kebab was involved. So was a traffic cone.`]), fx: { fol: 1500 } }) },
  // ---- more nights out: the more a footballer goes out, the more the papers have to say ----
  { id: "habit", prio: 1, chance: (c) => c.P.chance.party2, kind: "party", src: "tmz", icon: "🪩", when: (c) => c.act === "party" && c.L.cnt.party >= 3 && !c.L.flags.habit,
    build: (c, r) => ({ head: pick(r, [`${c.p.name.toUpperCase()} OUT AGAIN: THE ${ordinal(c.L.cnt.party).toUpperCase()} NIGHT THIS SEASON`, `IS ${c.p.name.toUpperCase()} EVER AT HOME?`, `PARTY ANIMAL ALERT: ${c.p.name.toUpperCase()} HAS A TABLE AT EVERY CLUB IN TOWN`]), sub: pick(r, [`The ${club(c.game, c.p)} ${c.p.pos} was seen leaving at 5am with a pizza box, one shoe and a bouncer's hat. ${he(c.p)} says ${he(c.p).toLowerCase()} "was networking". Nobody asked who with.`, `Door staff now greet ${him(c.p)} by name and the cloakroom has stopped asking for a ticket. A source says the DJ plays ${his(c.p)} song by default.`, `Fans have started a spreadsheet. It has columns for the venue, the time and "approximate hydration". It is on version nine.`]), fx: { fol: 1200 }, flag: "habit" }) },
  { id: "bounce", prio: 1, chance: (c) => c.P.chance.party2, kind: "party", src: "sun", icon: "🚪", when: (c) => c.act === "party" && c.L.cnt.party >= 4 && !c.L.flags.bounce,
    build: (c, r) => ({ head: pick(r, [`BOUNCER SAYS NO: ${c.p.name.toUpperCase()} TURNED AWAY AT THE DOOR`, `"NOT TONIGHT, ${c.p.name.split(" ").slice(-1)[0].toUpperCase()}": THE QUEUE FILMS IT ALL`]), sub: pick(r, [`${c.p.name} offered an autograph, a signed shirt and, at one point, a hug. The doorman said the dress code was "shoes, ideally two". ${he(c.p)} got in via the kitchen.`, `A queue of two hundred cheered as the ${club(c.game, c.p)} ${c.p.pos} was asked to "step to the side, mate". The video has more views than the match highlights.`]), fx: { fol: 1000 }, flag: "bounce" }) },
  { id: "tab", prio: 1, chance: (c) => c.P.chance.party2, kind: "party", src: "sun", icon: "🧾", when: (c) => c.act === "party" && c.L.cnt.party >= 5 && !c.L.flags.tab,
    build: (c, r) => ({ head: pick(r, [`THE BILL: ${c.p.name.toUpperCase()}'S NIGHT OUT COSTS MORE THAN A RIGHT-BACK`, `${c.p.name.toUpperCase()} LEAVES A TIP THAT IS ALSO A TRANSFER FEE`]), sub: pick(r, [`One bottle came with sparklers, a second came with a small ceremony. The receipt has been framed by the waiter and pinned above the till. ${c.p.name} "doesn't remember the second half".`, `Staff report a tab of "more zeroes than the scoreboard on a bad day". The ${club(c.game, c.p)} finance department is "not mad, just disappointed".`]), fx: { fol: 1400, coins: -15 }, flag: "tab" }) },
  { id: "stagedive", prio: 1, chance: (c) => c.P.chance.party2, kind: "party", src: "tmz", icon: "🎤", when: (c) => c.act === "party" && c.L.cnt.party >= 6 && !c.L.flags.stagedive,
    build: (c, r) => ({ head: pick(r, [`${c.p.name.toUpperCase()} JOINS THE BAND, THEN THE CROWD`, `TAKE THE MIC AWAY: ${c.p.name.toUpperCase()}'S KARAOKE REVIVAL OF A BREAKUP SONG`]), sub: pick(r, [`Footage shows ${c.p.name} stage-diving into a crowd that had clearly not agreed to it. A man in a kilt was "very understanding". The band wants ${him(c.p)} to stop and also to come back.`, `${he(c.p)} sang something about "a defender who did me wrong". Nobody knows which one. Several defenders have been in touch.`]), fx: { fol: 1800 }, flag: "stagedive" }) },
  { id: "walk", prio: 1, chance: (c) => c.P.chance.party2, kind: "party", src: "tmz", icon: "🥾", when: (c) => c.act === "party" && c.L.cnt.party >= 2 && !c.L.flags.walk,
    build: (c, r) => ({ head: pick(r, [`WALK OF SHAME: ${c.p.name.toUpperCase()} PAPPED IN LAST NIGHT'S KIT`, `${c.p.name.toUpperCase()} OUT AT 7AM IN SUNGLASSES AND ONE SOCK`]), sub: pick(r, [`The ${club(c.game, c.p)} ${c.p.pos} was caught on camera leaving a flat "that was not mine", holding a stranger's jacket and a loaf of bread. The bread is, apparently, "a long story".`, `A paparazzo at a petrol station: "Best shot of the year. He asked me for a lift." ${c.p.name}'s agent says ${he(c.p).toLowerCase()} was "on a motivational run". In heels.`]), fx: { fol: 1300 }, flag: "walk" }) },
  { id: "pplus", prio: 1, chance: (c) => c.P.chance.party2, kind: "party", src: "tmz", icon: "🍸", when: (c) => c.act === "party" && !!c.L.partner && !c.L.flags.pplus,
    build: (c, r) => ({ head: pick(r, [`${c.p.name.toUpperCase()} PARTIES WHILE ${partnerOf(c.L).toUpperCase()} WAITS AT HOME`, `"I'LL BE HOME BY TEN": ${c.p.name.toUpperCase()}, AT TWO`]), sub: pick(r, [`${partnerOf(c.L)} has left four voicemails and a note on the fridge that just says "no". Friends say the relationship "has had a lot of nights like this".`, `The takeaway ${partnerOf(c.L)} ordered for two was eaten by one. ${c.p.name} walked in at dawn with a straw hat and a story. The story is not good.`]), fx: { fol: 900, love: -4 }, flag: "pplus" }) },
  // ---- dating gossip: the tabloids love a couple ----
  { id: "newlove", prio: 1, chance: (c) => c.P.chance.gossip, kind: "fun", src: "tmz", icon: "💘", when: (c) => c.act === "date" && !!c.date && !c.date.secret && (c.L.dated[c.date.id] || 0) === 1 && !c.L.flags.newlove,
    build: (c, r) => ({ head: pick(r, [`NEW LOVE? ${c.p.name.toUpperCase()} AND ${c.date.name.toUpperCase()} SPOTTED TOGETHER`, `WHO IS ${c.date.name.toUpperCase()}? ${c.p.name.toUpperCase()}'S MYSTERY DINNER DATE`]), sub: pick(r, [`They shared a dessert, a very long glance and, according to the waiter, "the kind of silence that costs a lot". A photographer in the plant pot has the pictures.`, `${c.p.name} and ${c.date.name} left separately, in the same taxi. The taxi driver has a podcast now.`]), fx: { fol: 1000 }, flag: "newlove" }) },
  { id: "baddate", prio: 1, chance: (c) => c.P.chance.gossip, kind: "fun", src: "tmz", icon: "🥶", when: (c) => c.act === "date" && !!c.date && !c.date.secret && !c.date.good && !c.L.flags.baddate,
    build: (c, r) => ({ head: pick(r, [`DATE DISASTER: ${c.date.name.toUpperCase()} WALKS OUT ON ${c.p.name.toUpperCase()} BETWEEN COURSES`, `AWKWARD: ${c.p.name.toUpperCase()}'S DATE WITH ${c.date.name.toUpperCase()} GOES FULL OFFSIDE TRAP`]), sub: pick(r, [`Diners say ${c.p.name} spent twenty minutes on the offside rule, then forty on ${his(c.p)} own highlights. ${c.date.name} "asked for the bill, and a different life".`, `A waiter reports "three attempts at a compliment, two at a joke and one at a magic trick". ${c.date.name} left through the kitchen. ${c.p.name} finished both desserts.`]), fx: { fol: 1100, love: -3 }, flag: "baddate" }) },
  { id: "sparks", prio: 1, chance: (c) => c.P.chance.gossip, kind: "fun", src: "tmz", icon: "🔥", when: (c) => c.act === "date" && !!c.date && !c.date.secret && c.date.good && (c.L.dated[c.date.id] || 0) >= 4 && !c.L.flags.sparks,
    build: (c, r) => ({ head: pick(r, [`SPARKS FLY: ${c.p.name.toUpperCase()} AND ${c.date.name.toUpperCase()} CAN'T KEEP THEIR HANDS OFF EACH OTHER`, `GET A ROOM: ${c.p.name.toUpperCase()} AND ${c.date.name.toUpperCase()} AT THE CORNER TABLE`]), sub: pick(r, [`The couple were asked to leave a rooftop bar "for the sake of the other diners, and the plants". Both say it was "an unusually warm evening". It was snowing.`, `A fellow diner: "I came for the tapas and got a rom-com." ${c.p.name} and ${c.date.name} left a very large tip and a slightly smaller coat.`]), fx: { fol: 1400, love: 4 }, flag: "sparks" }) },
  { id: "ringshop", prio: 2, chance: (c) => c.P.chance.gossip, kind: "wedding", src: "tmz", icon: "💍", when: (c) => !!c.L.partner && !c.L.married && !!c.L.partner.excl && (c.L.dated[c.L.partner.id] || 0) >= c.P.wedding.dates - 1 && !c.L.flags.ringshop,
    build: (c, r) => ({ head: pick(r, [`RING SHOPPING? ${c.p.name.toUpperCase()} SPOTTED IN A JEWELLER'S`, `${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()}: IS A PROPOSAL COMING?`]), sub: pick(r, [`The ${club(c.game, c.p)} ${c.p.pos} spent forty minutes in a Mayfair jeweller's "holding things up to the light and sweating". The sales assistant says ${he(c.p).toLowerCase()} asked if there was "a student discount".`, `A source says ${c.p.name} "has been practising a speech in the shower". The shower has declined to comment.`]), fx: { fol: 1600 }, flag: "ringshop" }) },
  { id: "coldwar", prio: 2, chance: (c) => c.P.chance.gossip, kind: "trouble", src: "tmz", icon: "🧊", when: (c) => !!c.L.partner && committed(c.L) && (c.L.partner.cold || 0) >= 2 && !c.L.flags.coldwar,
    build: (c, r) => ({ head: pick(r, [`THE COLD WAR: ${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()} HAVEN'T BEEN SEEN TOGETHER IN WEEKS`, `IS IT OVER? ${partnerOf(c.L).toUpperCase()} UNFOLLOWS HALF OF ${c.p.name.toUpperCase()}'S FRIENDS`]), sub: pick(r, [`The ${club(c.game, c.p)} ${c.p.pos} was seen at a petrol station "buying the saddest bunch of flowers imaginable". ${partnerOf(c.L)}'s friends say it "needs more than a bunch of flowers".`, `${partnerOf(c.L)} has deleted every photo with ${c.p.name}, kept the one with the dog and, in a bold move, kept the dog.`]), fx: { fol: 800 }, flag: "coldwar" }) },
  { id: "holiday", prio: 1, chance: (c) => c.P.chance.gossip, kind: "fun", src: "tmz", icon: "🏝️", when: (c) => c.act === "date" && !!c.date && !c.date.secret && c.L.married && !c.L.flags.holiday,
    build: (c, r) => ({ head: pick(r, [`LOVE ON THE BEACH: ${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()} ON A WEEKEND AWAY`, `SECOND HONEYMOON? ${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()} SPOTTED IN A VERY SMALL HOTEL ROOM`]), sub: pick(r, [`The married couple were snapped at a spa, in matching robes, looking "suspiciously relaxed" and "like people who aren't checking their phones". The ${club(c.game, c.p)} physio is delighted.`, `A fellow guest: "They ordered room service four times and the Do Not Disturb sign has been up since Friday." The pictures are, regrettably, tasteful.`]), fx: { fol: 1500, love: 5 }, flag: "holiday" }) },
  // ---- style press: GQ, Harper's Bazaar and Vogue only write about the properly famous (one piece per magazine per season) ----
  { id: "gq", prio: 2, chance: (c) => c.P.chance.style, kind: "style", src: "gq", icon: "🕴️", when: (c) => c.L.fol >= c.P.style.gq && !c.L.flags["gq" + c.game.season],
    build: (c, r) => ({ head: pick(r, [`GQ BEST DRESSED: ${c.p.name.toUpperCase()} MAKES THE LIST`, `${c.p.name.toUpperCase()} IN GQ: "THE SUIT THAT LAUNCHED A THOUSAND TRANSFER RUMOURS"`, `GQ PROFILE: ${c.p.name.toUpperCase()} ON TAILORING, TUNNELS AND TRAINERS`]), sub: pick(r, [`${club(c.game, c.p)}'s ${c.p.pos} poses in a double-breasted blazer and says ${he(c.p).toLowerCase()} "only wears things ${he(c.p).toLowerCase()} could sprint in". Fans have counted the buttons.`, `Eight pages, one watch, no shin pads. The shoot reportedly ran two hours over because ${he(c.p).toLowerCase()} kept asking the photographer about the offside rule.`, `Style editors call it "football's quiet luxury". The ${club(c.game, c.p)} kit man calls it "a lot of dry cleaning".`]), flag: "gq" + c.game.season, fx: { fol: 2500 } }) },
  { id: "bazaar", prio: 2, chance: (c) => c.P.chance.style, kind: "style", src: "bazaar", icon: "👗", when: (c) => c.L.fol >= c.P.style.bazaar && !c.L.flags["bazaar" + c.game.season] && (c.L.own.house || c.L.own.cars.length > 0 || !!c.L.partner),
    build: (c, r) => ({ head: pick(r, [`HARPER'S BAZAAR: A WEEKEND WITH ${c.p.name.toUpperCase()}`, `${c.p.name.toUpperCase()} OPENS THE WARDROBE FOR HARPER'S BAZAAR`, `HARPER'S BAZAAR: THE ${c.p.name.split(" ").slice(-1)[0].toUpperCase()} EFFECT ON THE HIGH STREET`]), sub: pick(r, [`${he(c.p)} talks about ${his(c.p)} favourite coat, ${his(c.p)} least favourite away trip, and why every pair of shoes is "basically a cleat in disguise".`, `The magazine says one jacket worn on the touchline sold out in a day. ${club(c.game, c.p)}'s shop is now asking for a word.`, `A photo essay on the training ground, the kitchen and a very patient dog. The dog gets most of the column inches.`]), flag: "bazaar" + c.game.season, fx: { fol: 3500 } }) },
  { id: "vogue", prio: 3, chance: (c) => c.P.chance.style, kind: "style", src: "vogue", icon: "📖", when: (c) => c.L.fol >= c.P.style.vogue && !c.L.flags["vogue" + c.game.season],
    build: (c, r) => ({ head: pick(r, [`VOGUE COVER: ${c.p.name.toUpperCase()} STEPS OUT OF THE STADIUM`, `${c.p.name.toUpperCase()} IS ON THE COVER OF VOGUE`, `VOGUE: THE FOOTBALLER WHO CHANGED WHAT A FOOTBALLER LOOKS LIKE`]), sub: pick(r, [`Ten pages, three outfits and one very quiet ${club(c.game, c.p)} press officer. The editor calls ${c.p.name} "the most photographed ${c.p.pos} in the world".`, `The cover line asks if ${c.p.name} is "football's first true fashion house". ${club(c.game, c.p)} supporters have asked for the shirt-sponsor money instead.`, `Shot over two days in Paris between training sessions. The interview runs on the cost of a haircut and the ${c.p.pos} position in equal measure.`]), flag: "vogue" + c.game.season, fx: { fol: 9000 } }) },
  // ---- milestones, rivals, sponsors, wedding and relationship gossip ----
  { id: "m100k", g: true, retry: true, prio: 4, kind: "milestone", icon: "📈", when: (c) => c.L.fol >= 100000 && !c.L.hit.m100k,
    build: (c) => ({ head: `100K AND COUNTING: ${c.p.name.toUpperCase()} HITS SIX FIGURES`, sub: `${c.p.name} passes 100,000 followers. ${club(c.game, c.p)}'s social media intern has been given "a raise, and a nap". The sponsors have noticed.`, fx: { coins: c.P.milestone.m100k }, hit: "m100k" }) },
  { id: "m1m", g: true, retry: true, prio: 5, kind: "milestone", icon: "🚀", when: (c) => c.L.fol >= 1000000 && !c.L.hit.m1m,
    build: (c) => ({ head: `ONE MILLION: ${c.p.name.toUpperCase()} IS A GLOBAL BRAND`, sub: `${c.p.name} reaches 1,000,000 followers. A fan account has already made a documentary. Agents are "queuing round the block". Possibly one agent. Standing on a box.`, fx: { coins: c.P.milestone.m1m }, hit: "m1m" }) },
  { id: "troll", prio: 1, chance: (c) => c.P.chance.troll, kind: "troll", icon: "🤡", when: (c) => !!c.p.lastMatch && !c.p.lastMatch.trolled && c.p.lastMatch.opp != null && (c.p.lastMatch.gf < c.p.lastMatch.ga || c.p.lastMatch.r < 6),
    build: (c, r) => {
      const lm = c.p.lastMatch, rival = c.game.teams[lm.opp].name; lm.trolled = true;
      const R = ensureRom(c.game), head = pick(r, [`${rival.toUpperCase()} TROLL ${c.p.name.toUpperCase()} ONLINE`, `${rival.toUpperCase()}'S SOCIAL TEAM GOES AFTER ${c.p.name.toUpperCase()}`, `"DID YOU SEE ${c.p.name.toUpperCase()}?" ${rival.toUpperCase()} HAVE ENTERED THE CHAT`]),
        sub = pick(r, [`After the ${lm.gf}-${lm.ga}, ${rival} posted a slow-motion replay of the ${c.p.pos}'s afternoon set to sad violins. ${club(c.game, c.p)} replied with a clown emoji. The internet took sides.`, `${rival}'s admin changed their profile picture to a very small ${c.p.name}. It has 40,000 likes and one apology that was not an apology.`, `${rival} sent a "get well soon" message after the ${lm.gf}-${lm.ga}. Nobody was ill. Everybody understood.`]);
      if (!c.L.beef) c.L.beef = { id: (R.beefSeq = (R.beefSeq || 0) + 1), team: lm.opp, text: sub, season: c.game.season };          // the footballer can answer it (Relationships & beef panel)
      return { head, sub, fx: { fol: 1500 } };
    } },
  { id: "camera", prio: 3, chance: (c) => c.P.chance.camera, kind: "camera", icon: "📸", when: (c) => !!c.wrong,
    build: (c, r) => {
      const w = c.wrong; c.L.dated[w.prev.id] = Math.floor((c.L.dated[w.prev.id] || 0) / 2);
      return { head: `CAUGHT ON CAMERA: ${c.p.name.toUpperCase()} WITH ${w.now.name.toUpperCase()} — NOT ${w.prev.name.toUpperCase()}`, sub: pick(r, [`Photographers outside a quiet restaurant got the shot. ${w.prev.name} saw it before breakfast. The group chat has gone silent.`, `${w.now.name} says they are "just friends". The fingers say otherwise. ${w.prev.name} has unfollowed everyone.`, `A very long dinner, one shared dessert and a hand that did not move. ${w.prev.name} has "no comment", repeated for forty minutes.`]), fx: { fol: 2200, love: -20 } };
    } },
  { id: "cheat", g: true, prio: 4, kind: "camera", icon: "🚨", when: (c) => !!c.cheat,
    build: (c, r) => { const w = c.cheat;
      return { head: `CHEATING SCANDAL: ${c.p.name.toUpperCase()} AND ${w.now.name.toUpperCase()}, ${w.prev.name.toUpperCase()} IS NOT AMUSED`, sub: w.dumped ? pick(r, [`${w.prev.name} saw the pictures before breakfast and has moved out. ${c.p.name} says it was "a misunderstanding". The photographer says it was a very clear photograph.`, `Exclusive, then not. ${w.prev.name} has blocked ${c.p.name} everywhere and the group chat has been renamed.`]) : pick(r, [`${w.prev.name} has "decided to forgive, for now". The paparazzi have decided to stay.`, `Pictures everywhere. ${w.prev.name} stays, but the sofa has become a bed. ${c.p.name} is on a very short leash.`]), fx: { fol: -Math.round(c.L.fol * 0.03) + 2500, love: -12 } }; } },
  { id: "pcheat", g: true, prio: 4, kind: "camera", icon: "💔", when: (c) => !!c.pcheat,
    build: (c, r) => { const w = c.pcheat.partner;
      return { head: `${w.name.toUpperCase()} CAUGHT CHEATING ON ${c.p.name.toUpperCase()}`, sub: pick(r, [`A phone left on a table in a coffee shop. ${c.p.name} knows. You can end it from the Relationships panel.`, `${w.name} was seen on a "friends only" dinner that was not friends only. ${c.p.name}'s agent is "monitoring the situation".`, `A very long hug in a very short alley. ${w.name} says it was a cousin. The cousin has a different surname.`]), fx: { fol: 2000, love: -25 } }; } },
  { id: "leak", prio: 3, chance: (c) => c.P.chance.leak, kind: "wedding", icon: "📋", when: (c) => c.leakLeft > 0 && c.L.married && !c.L.hit.leak,
    build: (c, r) => ({ head: `GUEST LIST LEAKED: WHO IS COMING TO ${c.p.name.toUpperCase()}'S WEDDING?`, sub: pick(r, [`The list reportedly runs to 140 names, including the gaffer, three agents, ${partnerOf(c.L)}'s ex and a goalkeeper nobody remembers inviting. The caterers have been "spoken to".`, `Seating plan, menu and a table of rival defenders have all hit the papers. ${club(c.game, c.p)} deny the stag do ever happened. There are photos.`, `Someone has seen the guest list. It includes ${c.p.name}'s old school coach and a table marked only "DO NOT SEAT NEAR EACH OTHER".`]), fx: { fol: 3500, love: -8 }, hit: "leak" }) },
  { id: "feud", g: true, retry: true, prio: 3, kind: "sponsor", icon: "🥊", when: (c) => !!c.L.hit.feud && (c.L.hit.feud.season < c.game.season || c.L.hit.feud.day <= c.day),
    build: (c, r) => { const f = c.L.hit.feud, b = brandById(f.brand); delete c.L.hit.feud;
      return { head: `${b.name.toUpperCase()} V ${c.p.name.toUpperCase()}: THE BOOT WAR IS ON`, sub: f.why === "breach" ? `${c.p.name} was seen in ${b.name} boots while under contract with ${brandById(f.other).name}. Lawyers, a fine and a lot of thumbs-down emojis are in play.` : pick(r, [`${b.name} are "disappointed" ${c.p.name} chose ${brandById(f.other).name}. Their billboard now just says "WE REMEMBER". It is outside the training ground.`, `${b.name}'s marketing chief called ${brandById(f.other).name} "a fancy sock company" on live TV. ${c.p.name} replied with one eyebrow.`]), fx: { fol: f.why === "breach" ? 1200 : 3000, coins: f.why === "breach" ? -c.P.breachFine : 0 } }; } },
];
// Which paper or magazine carries each kind of story (public/assets/sources/<id>.png). A story can name its own with `src`.
export const SOURCE_OF = { party: "sun", drunk: "sun", camera: "tmz", trouble: "tmz", dm: "tmz", rumour: "sun", fun: "sun", club: "sun", troll: "athletic", boring: "athletic", proud: "athletic", milestone: "athletic", sponsor: "telegraph", yacht: "telegraph", wedding: "telegraph", steroids: "lequipe", trophy: "lequipe", style: "gq" };
const kindIcon = Object.fromEntries(STORIES.map((s) => [s.kind, s.icon]));
export { kindIcon };

// The tabloid follow-up to a failed party drugs test: what the papers say about the night out that led to it.
function wadaParty(game, p, r) {
  const L = ensureLife(game, p), P_ = p.name.toUpperCase(), where = L.own.yacht ? "a yacht party" : nightclub(L) ? `${(L.clubName || "Offside").toUpperCase()}'s VIP booth` : "a very long night out", n = L.cnt.party;
  return mk(game, p, { force: true, prio: 5, abs: true, kind: "party", src: "tmz", icon: "🍾", head: pick(r, [`PARTY ANIMAL: ${P_} BANNED AFTER NIGHT OUT`, `FROM THE VIP SECTION TO THE SIDELINES: ${P_}`, `${P_}'S WILD NIGHTS CAUGHT UP WITH ${him(p).toUpperCase()}`]),
    sub: pick(r, [`Insiders say the drugs-test flag followed ${where}, ${n > 1 ? `the ${ordinal(n)} night out this season` : "a night nobody remembers"}. Sources claim ${he(p).toLowerCase()} was "dancing on a banquette and asking strangers if they had seen ${his(p)} other shoe".`, `Witnesses put ${p.name} at ${where} until sunrise, carrying a bottle the size of a toddler. The WADA ban "is a surprise to nobody who owns a phone", says one fan account.`, `Photographs from ${where} are all over the internet. ${p.name} is in most of them. So, regrettably, is a traffic cone. The ${club(game, p)} are "reviewing the situation".`]), fx: { fol: 1500 } });
}
const ordinal = (n) => n + (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][Math.min(n % 10, 4)] || "th");

// A club buying a nightclub is news on its own.
export function purchaseStory(game, p, it) {
  const L = ensureLife(game, p);
  if (it.cat === "club") return mk(game, p, { prio: 2, kind: "club", icon: "🪩", head: `${p.name.toUpperCase()} OPENS "${(L.clubName || "OFFSIDE").toUpperCase()}"`, sub: `${it.name} opening night: velvet rope, a trophy cabinet behind the bar and a menu with a "Hat-trick Hotdog". The ${club(game, p)} squad have a booth.`, fx: { fol: 2500 } });
  if (it.cat === "plane") return mk(game, p, { prio: 1, kind: "fun", icon: "✈️", head: `${p.name.toUpperCase()} BUYS A PRIVATE PLANE`, sub: `It has a bed, a PlayStation and one very confused flight attendant. Away days just got a lot more comfortable.`, fx: { fol: 3000 } });
  return null;
}
// ---- the weekly news slot ----
const weekSlot = (game) => { const key = game.season + ":" + (game.weekDay ?? (game.md ? game.md.day : 0)); if (!game.weekNews || game.weekNews.key !== key) game.weekNews = { key, ids: [] }; return game.weekNews; };
// Can a story of this priority be printed this week? { free } when there is room, { replace: story } when it would
// overwrite a smaller one, null when the week is already taken by something at least as big.
export function weekRoom(game, prio) {
  const held = weekSlot(game).ids.map((id) => (game.news || []).find((n) => n.id === id)).filter((n) => n && (n.status === "live" || n.status === "pending"));
  if (held.length < (game.P.life.perWeek || 1)) return { free: true };
  const low = held.slice().sort((a, b) => a.prio - b.prio || a.id - b.id)[0];
  return low.prio < prio ? { replace: low } : null;
}
function overwrite(game, n) {
  n.status = "replaced"; n.approver = null;
  const p = game.players[n.pid], L = p && p.life;
  if (!n.abs) {                                             // a random story that never ran: undo what it did
    if (p && n.fx) applyFx(game, p, { fol: -(n.fx.fol || 0), love: -(n.fx.love || 0), coins: -(n.fx.coins || 0) });
    if (L) { L.sCount = Math.max(0, (L.sCount || 0) - 1); if (n.flag) delete L.flags[n.flag]; }
    if (n.gflag && game.newsFlags) delete game.newsFlags[n.gflag + n.season];
  }
}
export function mk(game, p, s) {
  const room = s.force ? { free: true } : weekRoom(game, s.prio ?? 0); if (!room) return null;
  if (room.replace) overwrite(game, room.replace);
  game.newsSeq = (game.newsSeq || 0) + 1; game.pubSeq = game.pubSeq || 0;
  const status = s.approval && p.team != null && game.teams[p.team].human ? "pending" : "live";
  const n = { id: game.newsSeq, season: game.season, day: s.day ?? game.weekDay ?? (game.md ? game.md.day : 0), kind: s.kind, icon: s.icon, pid: p.id, name: p.name, team: p.team, clubName: club(game, p), src: s.src || SOURCE_OF[s.kind] || null, head: s.head, sub: s.sub, status, approver: status === "pending" ? p.team : null, prio: s.prio ?? 0, abs: !!s.abs, fx: s.fx || null, flag: s.flag || null, gflag: s.gflag || null };
  if (status === "live") n.pub = ++game.pubSeq;
  (game.news = game.news || []).push(n); if (game.news.length > 60) game.news.shift();
  if (!s.force) weekSlot(game).ids.push(n.id);
  if (s.fx) applyFx(game, p, s.fx);
  return n;
}
export function applyFx(game, p, fx) {
  const L = ensureLife(game, p);
  if (fx.fol) L.fol = Math.max(0, Math.round(L.fol + fx.fol));
  if (fx.love) L.love = clamp(L.love + fx.love, L.married ? 10 : 0, 100);
  if (fx.coins) p.coins = Math.max(0, Math.round((p.coins || 0) + fx.coins));
}
// Any player caught for steroids is news, whoever controls him.
export function steroidStory(game, d) {
  const p = game.players[d.pid], t = d.team != null ? game.teams[d.team].name : "No club";
  return mk(game, p, { prio: 5, abs: true, kind: "steroids", icon: "🧪", head: `DOPING SHOCK: ${p.name.toUpperCase()} BANNED`, sub: `${t}'s ${p.pos} fails a drugs test and is out for ${d.games} games. The lab says the sample was "very clear". Not in a good way.` });
}
// A club that keeps getting away with it: more than P.steroids.rumourAfter uncaught uses in one season starts a rumour about the club (not a player).
// Returns the story, or null when the week's slot is taken by something bigger (it is tried again on that club's next uncaught use).
export function rumourStory(game, d) {
  const p = game.players[d.pid], t = game.teams[d.team]; if (!p || !t) return null;
  const n = mk(game, p, { prio: 5, abs: true, kind: "rumour", icon: "🕵️", head: `RUMOURS OF SHADY GOINGS-ON AT ${t.name.toUpperCase()}`, sub: `Sources say the ${t.name} medical room is "unusually busy" and the lab keeps asking awkward questions. The club says it is "aware of no wrongdoing". Nobody has been caught. Yet.` });
  if (n) (game.dopeRumour = game.dopeRumour || {})[d.key] = true;
  return n;
}
// A story waiting on a manager: yes publishes, no buries it.
export function decideStory(game, id, yes) {
  const n = (game.news || []).find((x) => x.id === id && x.status === "pending"); if (!n) return null;
  n.status = yes ? "live" : "blocked"; n.approver = null; if (yes) n.pub = ++game.pubSeq;
  if (!yes) { const p = game.players[n.pid]; if (p && p.life) p.life.sCount = Math.max(0, p.life.sCount - 1); }
  return n;
}
export const dropPending = (game) => { for (const n of game.news || []) if (n.status === "pending") { n.status = "blocked"; n.approver = null; } };

// Resolve one matchday's choice for one user player. Returns { act, cost, stories, wada }.
export function runActivity(game, p, act, { day = 0, partner = null, joint = null, secret = false } = {}) {
  const P = game.P.life, L = ensureLife(game, p), R = ensureRom(game);
  game.weekDay = day;
  if (blocked(game, p, act, { partner, joint, secret })) { act = "balance"; partner = null; joint = null; secret = false; }
  const a = { ...P.acts[act] }, r = makeRng(game.seed, "life", p.id, game.season, day);
  const boost = lifeBoost(game, p, act);                                    // Flowers, Ziplock baggie or Pre-workout: one is used up this week
  if (boost) { p.items[boost.id]--; if (p.items[boost.id] <= 0) delete p.items[boost.id]; if (boost.fx.stam) a.stam += boost.fx.stam; if (boost.fx.love) a.love += boost.fx.love; if (boost.fx.fol) a.fol = Math.round(a.fol * boost.fx.fol); }
  const cost = act === "date" && joint ? (joint.pay ? actCost(game, p, act) * P.rom.dateMult : 0) : actCost(game, p, act);
  p.coins = Math.max(0, (p.coins || 0) - cost);
  L.cnt[act]++;
  // stamina is "recovery": it moves the player's starting energy for this match
  const home = (L.own.house ? shopItem(L.own.house).rec || 0 : 0) + (L.own.plane ? 3 : 0);
  p.stam = clamp((p.stam ?? 100) + a.stam + home, 0, 100);
  // love life
  let love = a.love;
  if (act === "party" && L.partner && L.partner.partier) love = P.partyLoveWithPartier;
  let wrong = null, cheat = null, date = null;
  if (act === "date" && secret) {                                           // a secret date: nobody but you knows (yet)
    const info = personOf(game, partner) || PARTNER_LIST[0];
    const q = clamp(0.4 + makeRng(game.seed, "sdq", p.id, partner, R.week)() * 0.5 + (boost && boost.fx.love ? 0.15 : 0), 0.05, 1), good = q >= P.rom.goodAt;
    date = { id: info.id || partner, name: info.name, g: info.g, q: +q.toFixed(2), good, rivals: 0, secret: true };
    love += good ? 4 : -2;
    if (!isHuman(partner)) { const n = npcState(game, partner); n.seen.push({ pid: p.id, week: R.week }); if (n.seen.length > 12) n.seen.shift(); }
  } else if (act === "date") {
    const prev = L.partner, id = L.married && prev ? prev.id : (partner || (prev && prev.id) || (L.opts && L.opts.ids[0]) || PARTNER_LIST[0].id), info = personOf(game, id) || PARTNER_LIST[0];
    const thr = L.thr && thrMembers(game, p).includes(id);
    // quality of the date: luck, flowers, how happy you are, and anyone else who has been taking this person out
    const rivals = isHuman(id) ? 0 : otherSuitors(game, id, p.id).length;
    const qs = isHuman(id) ? [p.id, +id.slice(2)].sort().join("-") : p.id;
    let q = 0.4 + makeRng(game.seed, "dq", qs, id.startsWith("u:") ? "" : id, R.week)() * 0.45 + (boost && boost.fx.love ? 0.15 : 0) + (isHuman(id) ? 0 : (L.love - 50) / 250) - P.rom.rivalQ * rivals + (thr ? 0.05 : 0);
    q = clamp(q, 0.05, 1); const good = q >= P.rom.goodAt;
    const D = (L.dq = L.dq || {})[id] = (L.dq || {})[id] || { n: 0, good: 0, sum: 0 };
    D.n++; D.sum += q; if (good) D.good++;
    date = { id, name: info.name, q: +q.toFixed(2), good, rivals };
    if (!isHuman(id)) { const n = npcState(game, id); n.seen.push({ pid: p.id, week: R.week }); if (n.seen.length > 12) n.seen.shift(); }
    if (!prev || prev.id !== id) {
      if (prev && prev.excl && !L.married) {                               // going out with someone else while exclusive: a cheating scandal
        const dumped = makeRng(game.seed, "dump", p.id, R.week)() < P.rom.dumpCheat;
        cheat = { prev: { ...prev }, now: info, dumped };
        if (dumped) leave(game, p, prev.id, { cool: true });
        else { L.love = clamp(L.love - 10, 0, 100); if (isHuman(prev.id)) { const o = game.players[+prev.id.slice(2)]; if (o && o.life) o.life.love = clamp(o.life.love - 15, 0, 100); } }
      } else if (prev && !L.married && (L.dated[prev.id] || 0) >= P.cameraAt) wrong = { prev, now: info };
      if (!cheat || cheat.dumped) L.partner = { id, name: info.name, g: info.g, partier: isHuman(id) ? false : makeRng(game.seed, "partier", p.id, id)() < P.partnerParty, dates: L.dated[id] || 0, ...(isHuman(id) ? { human: +id.slice(2) } : {}) };
    }
    L.dated[id] = (L.dated[id] || 0) + 1; if (L.partner && L.partner.id === id) L.partner.dates = L.dated[id];
    if (good && L.partner && L.partner.id === id) love += 3;
    if (thr) love += P.rom.thrLove;
    if (!good) love -= 6;
  }
  if (L.hit.wedLeft > 0) L.hit.wedLeft--;
  L.love = clamp(L.love + love, L.married ? 10 : 0, 100);
  if (L.partner && !L.married && !L.partner.excl && L.love <= 0) L.partner = null;     // the relationship fizzles out
  L.fol = Math.max(0, Math.round(L.fol + a.fol * (1 + Math.max(0, p.ovr - 80) / 40)));
  let trained = null;
  if (act === "train") {                                                    // steady skill gains: a few skill points a session, at most +trainCap overall a season
    const T = trainRec(game, L), room = Math.max(0, P.trainCap - T.gain), gain = Math.min(room, P.trainGain * (boost && boost.fx.gain ? boost.fx.gain : 1));
    if (gain > 0) {
      T.gain += gain; T.sessions++;
      p.ovrf = (p.ovrf ?? p.ovr) + gain;
      const foc = FOCUS_STATS(p.pos), k = foc[Math.floor(r() * foc.length)], up = boost && boost.fx.gain ? 1 : r() < P.trainStat ? 1 : 0;
      p[k] = clamp(p[k] + up, 30, 99);
      const before = p.ovr; p.ovr = clamp(Math.round(p.ovrf), 40, 99); p.tier = p.ovr >= 90 ? "ruby" : p.ovr >= 85 ? "gold" : "silver"; rate(p, game.P);
      trained = { stat: up ? k : null, ovr: p.ovr - before, gain, capped: T.gain >= P.trainCap - 1e-9 };
    } else trained = { stat: null, ovr: 0, gain: 0, capped: true };
  }
  // a partner with a roving eye (hidden loyalty) may cheat on you
  let pcheat = null;
  if (L.partner && !isHuman(L.partner.id) && (L.partner.excl || L.married)) {
    const n = npcState(game, L.partner.id);
    if (n.loyalty < P.rom.cheatBelow) {
      const ch = P.rom.cheatMax * (1 - n.loyalty / P.rom.cheatBelow) * (act === "date" && date && date.id === L.partner.id ? 0.4 : 1);
      if (makeRng(game.seed, "pcheat", p.id, L.partner.id, R.week)() < ch) { pcheat = { partner: { ...L.partner } }; L.partner.cheated = (L.partner.cheated || 0) + 1; }
    }
  }
  let wada = false;
  if (act === "party" && r() < (boost && boost.fx.wada ? boost.fx.wada : P.wada)) { wada = true; p.susp = Math.max(p.susp || 0, P.wadaBan); }
  const c = { game, p, act, L, P, r, married: L.married, wedding: false, wada, wrong, cheat, pcheat, date, day, leakLeft: L.hit.wedLeft || 0 };
  const out = [];
  // Everything that qualifies this week; the biggest story is the one printed (see the story table).
  const cands = [];
  for (const s of STORIES) {
    if (!s.when(c)) continue;
    if (!s.g) { if (L.sCount >= P.maxStories) continue; if (r() >= s.chance(c)) continue; }
    cands.push(s);
  }
  cands.sort((a, b) => b.prio - a.prio);
  let printed = false;
  for (const s of cands) {
    const can = !printed && weekRoom(game, s.prio);
    if (!can && (!s.g || s.retry)) continue;                                                // a random story that loses the week simply does not happen
    const b = s.build(c, r);
    if (b.flag) L.flags[b.flag] = true; if (b.hit) L.hit[b.hit] = true; if (b.gflag) (game.newsFlags = game.newsFlags || {})[b.gflag + game.season] = true;
    if (!can) { if (b.fx) applyFx(game, p, b.fx); continue; }                  // a certain event overwritten by a bigger one still happens, quietly
    if (!s.g) L.sCount++;
    const n = mk(game, p, { kind: s.kind, src: s.src, icon: s.icon, approval: s.approval, prio: s.prio, abs: !!s.g, ...b });
    if (n) { out.push(n); printed = true; }
  }
  // a flagged test at a party is a gift to the tabloids: the very next headline after the WADA announcement is theirs
  if (wada) { const f = wadaParty(game, p, r); if (f) out.push(f); }
  if (secret && date) secretDate(game, p, date, makeRng(game.seed, "heat", p.id, R.week));
  const lov = loveWeek(game, p, { act, date, secret: !!(secret && date), r });
  L.last = { act, cost, day, boost: boost ? boost.id : null, trained, date: date ? { name: date.name, good: date.good, q: date.q, rivals: date.rivals, secret: !!date.secret } : null };
  L.act = null;
  boots(game, p, day, r);
  return { act, cost, stories: out, wada, boost: boost ? boost.id : null, trained, date, cheat, pcheat, love: lov };
}
// The life item that goes with this week's activity (the first one the footballer holds), or null.
const BOOST_KEY = { flowers: "flowers", "ziplock-baggie": "ziplock", "pre-workout": "pre" };
export function lifeBoost(game, p, act) {
  const it = game.items.find((i) => i.life === act && ((p.items || {})[i.id] || 0) > 0); if (!it) return null;
  return { id: it.id, fx: game.P.life.boost[BOOST_KEY[it.id]] || {} };
}
// This season's training so far (resets when a new season starts).
export function trainRec(game, L) {
  if (!L.tr || L.tr.season !== game.season) L.tr = { season: game.season, gain: 0, sessions: 0 };
  return L.tr;
}
// Stats a position cares about most (top three), used for where training goes.
const FOC = { ST: ["sho", "pac", "dri"], CAM: ["pas", "dri", "sho"], CM: ["pas", "dri", "def"], CDM: ["def", "pas", "phy"], CB: ["def", "phy", "pac"], RB: ["def", "pac", "pas"], LB: ["def", "pac", "pas"], RM: ["pac", "dri", "pas"], LM: ["pac", "dri", "pas"], LW: ["pac", "dri", "sho"], RW: ["pac", "dri", "sho"], GK: ["pac", "sho", "dri"] };
const FOCUS_STATS = (pos) => FOC[pos] || FOC.CM;


// ---------- boot sponsors ----------
// A boot maker makes an offer when the followers reach each tier. Take it and you earn a fee every matchday. Wear a rival's boots
// under contract and it is a breach (fine, deal over); picking one maker over another can start a feud.
export function dealOffer(game, p, day) {
  const L = ensureLife(game, p), T = game.P.life.deals;
  if (L.offer) return null;
  const next = (L.hit.tier ?? -1) + 1; if (next >= T.length || L.fol < T[next].fol) return null;
  const r = makeRng(game.seed, "deal", p.id, next), cur = L.deal && L.deal.brand;
  const [lo, hi] = DEAL_RANKS[Math.min(next, DEAL_RANKS.length - 1)], choices = BOOT_BRANDS.filter((b) => b.id !== cur && b.rank >= lo && b.rank <= hi); const b = choices[Math.floor(r() * choices.length)];
  L.hit.tier = next;
  if (L.deal && L.deal.pay >= T[next].pay) return null;                          // already on better money
  L.offer = { brand: b.id, tier: next, pay: T[next].pay, seasons: T[next].seasons, day };
  return L.offer;
}
export function dealAnswer(game, p, yes) {
  const L = ensureLife(game, p), o = L.offer; if (!o) return null;
  L.offer = null; if (!yes) return { signed: false };
  const old = L.deal, b = brandById(o.brand), rival = brandById(b.rival);
  L.deal = { brand: o.brand, pay: o.pay, left: o.seasons, tier: o.tier };
  const feudWith = old && old.brand !== o.brand ? old.brand : rival && rival.id !== o.brand && makeRng(game.seed, "feud", p.id, o.tier)() < game.P.life.feudChance ? rival.id : null;
  if (feudWith) L.hit.feud = { brand: feudWith, other: o.brand, day: (game.weekDay ?? 0) + 1, why: "choice", season: game.season };
  const n = mk(game, p, { prio: 2, kind: "sponsor", icon: "👟", head: `${p.name.toUpperCase()} SIGNS WITH ${b.name.toUpperCase()}`, sub: `A ${o.seasons}-season boot deal worth ${o.pay} coins a matchday. ${b.name} say ${p.name} is "the face of the next generation". The old boots have been "retired with honours".`, fx: { fol: 2000 + 1000 * o.tier } });
  return { signed: true, story: n };
}
// Called every matchday before kick-off: offers, and breaches of the current deal.
function boots(game, p, day, r) {
  const L = ensureLife(game, p), P = game.P.life;
  if (L.deal && L.deal.left > 0) {
    const worn = (p.equip || []).map(brandOfItem).filter((b) => b && brandById(b) && b !== L.deal.brand);
    if (worn.length) { L.hit.feud = { brand: worn[0], other: L.deal.brand, day: day + 1, why: "breach", season: game.season }; p.coins = Math.max(0, (p.coins || 0) - P.breachFine); L.deal = null; }
  }
  dealOffer(game, p, day);
}
// A season is over: the contract has one season less to run.
export function seasonEndLife(game, p) {
  const L = ensureLife(game, p);
  if (L.deal) { L.deal.left--; if (L.deal.left <= 0) L.deal = null; }
  L.offer = null;
}

// ---------- followers from the pitch ----------
// line = { g, a, r (rating), potm, win }. Good games, goals and assists add followers; a bad game costs a few.
export function matchGain(game, p, line) {
  const F = game.P.life.fans, L = ensureLife(game, p);
  let d = line.g * F.goal + line.a * F.assist + (line.win ? F.win : 0) + (line.potm ? F.potm : 0) + (line.g >= 3 ? F.hatTrick : 0);
  d += line.r >= F.greatAt ? F.great : line.r >= F.goodAt ? F.good : line.r < F.badAt ? -F.bad : 0;
  L.fol = Math.max(0, Math.round(L.fol + d)); L.matchGain = d;
  return d;
}
// ---------- trophies ----------
const TROPHY_NAME = { title: "THE LEAGUE TITLE", ballon: "THE BALLON D'OR", boot: "THE GOLDEN BOOT", playmaker: "THE PLAYMAKER AWARD", glove: "THE GOLDEN GLOVE" };
export function trophyWon(game, p, kind, day = 0) {
  const L = ensureLife(game, p), T = game.P.life.trophy[kind]; if (!T) return null;
  L.trophies.push({ season: game.season, kind });
  game.weekDay = 100 + L.trophies.length;                                  // its own news slot: the season is over
  const n = mk(game, p, { prio: 6, abs: true, kind: "trophy", icon: kind === "title" ? "🏆" : kind === "ballon" ? "🌟" : kind === "boot" ? "⚽" : kind === "glove" ? "🧤" : "🎯",
    head: `${p.name.toUpperCase()} WINS ${TROPHY_NAME[kind]}`, sub: kind === "title" ? `${club(game, p)} are champions and ${p.name} is carried round the pitch. Followers: "a lot". Mascot: "overwhelmed".` : `${p.name} collects ${TROPHY_NAME[kind].replace("THE ", "the ").toLowerCase()} for season ${game.season}. The trophy has been put on a shelf, then moved to a better shelf.`, fx: { fol: T.fol, coins: T.coins }, day });
  if (!n) applyFx(game, p, { fol: T.fol, coins: T.coins });
  return n;
}
