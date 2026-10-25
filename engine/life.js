// Player-mode life: what a created footballer does between matches, what he can buy, and the news stories that follow.
// Pure and seeded: the same choices with the same seed always give the same stories. Everything numeric lives in params.life.
import { makeRng, clamp } from "./rng.js";
import { rate } from "./roster.js";

export const ACTS = ["train", "date", "party", "rest", "balance"];
export const ACT_INFO = {
  train: { name: "Train hard", icon: "🏋️", text: "Skills up, followers up. Leaves you tired and your love life cold." },
  date: { name: "Date", icon: "💘", text: "Love life up. Costs a little money and some energy. Ten dates with one partner and you can propose." },
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
// Boot makers that can sign a footballer. Logos go in public/assets/brands/<id>.png. `rival` is who they would love to annoy.
export const BOOT_BRANDS = [
  { id: "nike", name: "Nike", rival: "adidas" }, { id: "adidas", name: "Adidas", rival: "puma" },
  { id: "puma", name: "Puma", rival: "adidas" }, { id: "mizuno", name: "Mizuno", rival: "nike" },
];
export const brandById = (id) => BOOT_BRANDS.find((x) => x.id === id) || null;
export const brandOfItem = (itemId) => { const m = /^boots-([a-z]+)-/.exec(itemId || ""); return m ? m[1] : null; };
const CLUBNAMES = ["Offside", "The Back Post", "Extra Time", "VAR Room", "Golden Boot", "Stoppage", "Nutmeg", "Top Bins", "The Dugout", "Panenka"];
export function ensureLife(game, p) {
  const P = game.P.life;
  if (!p.life) p.life = { fol: P.startFollowers, love: P.startLove, partner: null, married: false, own: { cars: [], house: null, yacht: null, plane: false, club: null }, cnt: { train: 0, date: 0, party: 0, rest: 0, balance: 0 }, sCount: 0, flags: {}, act: null, dated: {}, rej: {}, opts: null, pref: null, hit: {}, trophies: [], deal: null, offer: null, last: null, clubName: null };
  const L = p.life; L.dated = L.dated || {}; L.rej = L.rej || {}; L.hit = L.hit || {}; L.trophies = L.trophies || [];
  return L;
}
export const resetSeason = (game) => { for (const p of Object.values(game.players)) if (p.user && p.life) { p.life.cnt = { train: 0, date: 0, party: 0, rest: 0, balance: 0 }; p.life.sCount = 0; p.life.flags = {}; p.life.act = null; p.life.opts = null; } };

export function nightclub(life) { return life.own.club ? shopItem(life.own.club) : null; }
export function actCost(game, p, act) {
  const L = ensureLife(game, p), base = game.P.life.acts[act].cost;
  const club = nightclub(L);
  return Math.round(act === "party" && club ? base * (1 - club.party) : base);
}
export const WEDDING_COST = (game) => game.P.life.wedding.cost;
// Ten dates with the same person (the one named, or otherwise the last one) and you can propose.
export function canMarry(game, p, pid) {
  const L = ensureLife(game, p); if (L.married) return false;
  const id = pid || (L.partner && L.partner.id);
  return !!(id && (L.dated[id] || 0) >= game.P.life.wedding.dates);
}
// Why this choice cannot be made right now (or null).
export function blocked(game, p, act, { marry = false, partner = null } = {}) {
  if (!ACTS.includes(act)) return "unknown";
  const L = ensureLife(game, p), cost = actCost(game, p, act) + (marry ? WEDDING_COST(game) : 0);
  if (act === "party" && p.susp > 0) return "You are suspended";
  if (marry && !(act === "date" && canMarry(game, p, partner))) return "No wedding yet";
  if (act === "date" && partner && !L.married && !(L.opts && L.opts.ids.includes(partner))) return "That person is not on your list";
  if ((p.coins || 0) < cost) return "Not enough money";
  return null;
}

// ---------- who you can date ----------
// Each week there are three people to choose from, at least one of each gender. The last person you dated is always one
// of them (unless you turned them down three times); anyone you specifically turn down three times never comes back.
function genOptions(game, p, day, keep, salt) {
  const L = ensureLife(game, p), r = makeRng(game.seed, "dates", p.id, game.season, day, salt || 0), list = keep.slice();
  if (!list.length && L.partner && L.partner.id && (L.rej[L.partner.id] || 0) < 3) list.push(L.partner.id);
  const gone = new Set((L.opts && L.opts.gone) || []);
  const pool = PARTNER_LIST.filter((x) => !list.includes(x.id) && (L.rej[x.id] || 0) < 3 && !gone.has(x.id));
  while (list.length < 3 && pool.length) {
    const gs = list.map((id) => partnerById(id).g), slots = 3 - list.length, needF = !gs.includes("F"), needM = !gs.includes("M"), need = (needF ? 1 : 0) + (needM ? 1 : 0);
    let c = pool;
    if (need >= slots) c = pool.filter((x) => x.g === (needF ? "F" : "M"));
    if (!c.length) c = pool;
    const pick = c[Math.floor(r() * c.length)]; list.push(pick.id); pool.splice(pool.indexOf(pick), 1);
  }
  return list;
}
export function ensureOptions(game, p, day) {
  const L = ensureLife(game, p);
  if (L.married) { L.opts = null; return []; }
  if (!L.opts || L.opts.day !== day || L.opts.season !== game.season) L.opts = { day, season: game.season, ids: genOptions(game, p, day, [], 0), gone: [], n: 0 };
  return L.opts.ids;
}
// "Not interested": counts against that person; a replacement takes the slot.
export function declineDate(game, p, pid) {
  const L = ensureLife(game, p); if (L.married || !L.opts || !L.opts.ids.includes(pid)) return false;
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
    const partner = L.pref === "date" && !L.married ? (L.partner && L.opts && L.opts.ids.includes(L.partner.id) ? L.partner.id : (ensureOptions(game, p, day)[0] || null)) : null;
    if (!blocked(game, p, L.pref, { partner })) return { act: L.pref, marry: false, partner };
  }
  return { act: "balance", marry: false, partner: null };
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
  { id: "yachtdate", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "🛥️", when: (c) => c.act === "date" && !!c.L.own.yacht && c.L.partner && c.L.partner.dates >= 3 && !c.L.flags.yachtdate,
    build: (c) => ({ head: `LOVE ON THE WATER: ${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()}`, sub: `A sunset, a very long deck and one tiny sofa. Photographers on jet skis got the shots.`, fx: { fol: 1100, love: 8 }, flag: "yachtdate" }) },
  { id: "kebab", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "🍟", when: (c) => c.act === "date" && !!c.L.partner && !c.L.flags.kebab,
    build: (c) => ({ head: `CHIPS AND LOVE: ${c.p.name.toUpperCase()} SPOTTED WITH ${partnerOf(c.L).toUpperCase()}`, sub: `Sharing a tray of chips at 11pm. Staff say the ${club(c.game, c.p)} ${c.p.pos} tipped well and asked for extra sauce.`, fx: { fol: 800 }, flag: "kebab" }) },
  { id: "owner", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "🎧", when: (c) => c.act === "party" && !!nightclub(c.L) && !c.L.flags.owner,
    build: (c) => ({ head: `OWNER'S SET: ${c.p.name.toUpperCase()} TAKES OVER THE DECKS AT ${(c.L.clubName || "OFFSIDE").toUpperCase()}`, sub: `A 3am set of nothing but stadium anthems goes viral. Management (also ${c.p.name}) approve the overtime.`, fx: { fol: 2500 }, flag: "owner" }) },
  { id: "sleep", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "🛌", when: (c) => c.act === "rest" && c.L.cnt.rest >= c.P.sleepAt && !c.L.flags.sleep,
    build: (c) => ({ head: `${c.p.name.toUpperCase()} HAS BEEN IN BED SINCE TUESDAY`, sub: `A fourteen-hour nap before the next fixture. The physio calls it "elite recovery". The sofa is jealous.`, fx: { fol: 350 }, flag: "sleep" }) },
  { id: "gym", prio: 0, chance: (c) => c.P.chance.fun, kind: "fun", icon: "💪", when: (c) => c.act === "train" && c.L.cnt.train >= c.P.gymAt && !c.L.flags.gym,
    build: (c) => ({ head: `GYM RAT ALERT: ${c.p.name.toUpperCase()} LOCKED IN THE GYM`, sub: `Cleaners found ${him(c.p)} still doing calf raises at midnight. The floodlights were switched off "as a hint".`, fx: { fol: 500 }, flag: "gym" }) },
  { id: "wild", prio: 1, chance: (c) => c.P.chance.wild, kind: "party", icon: "🍾", when: (c) => c.act === "party",
    build: (c, r) => ({ head: pick(r, [`WILD NIGHT OUT: ${c.p.name.toUpperCase()} SPOTTED AT 4AM`, `${c.p.name.toUpperCase()} DANCES ON A TABLE. IT HOLDS.`, `STARS OUT: ${c.p.name.toUpperCase()} LEADS THE CONGA LINE`]), sub: pick(r, [`Witnesses say the ${club(c.game, c.p)} ${c.p.pos} was "in great spirits" and had lost one shoe.`, `Fans filmed it all. The group chat has not recovered.`, `A kebab was involved. So was a traffic cone.`]), fx: { fol: 1500 } }) },
  // ---- milestones, rivals, sponsors, wedding and relationship gossip ----
  { id: "m100k", g: true, retry: true, prio: 4, kind: "milestone", icon: "📈", when: (c) => c.L.fol >= 100000 && !c.L.hit.m100k,
    build: (c) => ({ head: `100K AND COUNTING: ${c.p.name.toUpperCase()} HITS SIX FIGURES`, sub: `${c.p.name} passes 100,000 followers. ${club(c.game, c.p)}'s social media intern has been given "a raise, and a nap". The sponsors have noticed.`, fx: { coins: c.P.milestone.m100k }, hit: "m100k" }) },
  { id: "m1m", g: true, retry: true, prio: 5, kind: "milestone", icon: "🚀", when: (c) => c.L.fol >= 1000000 && !c.L.hit.m1m,
    build: (c) => ({ head: `ONE MILLION: ${c.p.name.toUpperCase()} IS A GLOBAL BRAND`, sub: `${c.p.name} reaches 1,000,000 followers. A fan account has already made a documentary. Agents are "queuing round the block". Possibly one agent. Standing on a box.`, fx: { coins: c.P.milestone.m1m }, hit: "m1m" }) },
  { id: "troll", prio: 1, chance: (c) => c.P.chance.troll, kind: "troll", icon: "🤡", when: (c) => !!c.p.lastMatch && !c.p.lastMatch.trolled && c.p.lastMatch.opp != null && (c.p.lastMatch.gf < c.p.lastMatch.ga || c.p.lastMatch.r < 6),
    build: (c, r) => {
      const lm = c.p.lastMatch, rival = c.game.teams[lm.opp].name; lm.trolled = true;
      return { head: pick(r, [`${rival.toUpperCase()} TROLL ${c.p.name.toUpperCase()} ONLINE`, `${rival.toUpperCase()}'S SOCIAL TEAM GOES AFTER ${c.p.name.toUpperCase()}`, `"DID YOU SEE ${c.p.name.toUpperCase()}?" ${rival.toUpperCase()} HAVE ENTERED THE CHAT`]),
        sub: pick(r, [`After the ${lm.gf}-${lm.ga}, ${rival} posted a slow-motion replay of the ${c.p.pos}'s afternoon set to sad violins. ${club(c.game, c.p)} replied with a clown emoji. The internet took sides.`, `${rival}'s admin changed their profile picture to a very small ${c.p.name}. It has 40,000 likes and one apology that was not an apology.`, `${rival} sent a "get well soon" message after the ${lm.gf}-${lm.ga}. Nobody was ill. Everybody understood.`]), fx: { fol: 1500 } };
    } },
  { id: "camera", prio: 3, chance: (c) => c.P.chance.camera, kind: "camera", icon: "📸", when: (c) => !!c.wrong,
    build: (c, r) => {
      const w = c.wrong; c.L.dated[w.prev.id] = Math.floor((c.L.dated[w.prev.id] || 0) / 2);
      return { head: `CAUGHT ON CAMERA: ${c.p.name.toUpperCase()} WITH ${w.now.name.toUpperCase()} — NOT ${w.prev.name.toUpperCase()}`, sub: pick(r, [`Photographers outside a quiet restaurant got the shot. ${w.prev.name} saw it before breakfast. The group chat has gone silent.`, `${w.now.name} says they are "just friends". The fingers say otherwise. ${w.prev.name} has unfollowed everyone.`, `A very long dinner, one shared dessert and a hand that did not move. ${w.prev.name} has "no comment", repeated for forty minutes.`]), fx: { fol: 2200, love: -20 } };
    } },
  { id: "leak", prio: 3, chance: (c) => c.P.chance.leak, kind: "wedding", icon: "📋", when: (c) => c.leakLeft > 0 && c.L.married && !c.L.hit.leak,
    build: (c, r) => ({ head: `GUEST LIST LEAKED: WHO IS COMING TO ${c.p.name.toUpperCase()}'S WEDDING?`, sub: pick(r, [`The list reportedly runs to 140 names, including the gaffer, three agents, ${partnerOf(c.L)}'s ex and a goalkeeper nobody remembers inviting. The caterers have been "spoken to".`, `Seating plan, menu and a table of rival defenders have all hit the papers. ${club(c.game, c.p)} deny the stag do ever happened. There are photos.`, `Someone has seen the guest list. It includes ${c.p.name}'s old school coach and a table marked only "DO NOT SEAT NEAR EACH OTHER".`]), fx: { fol: 3500, love: -8 }, hit: "leak" }) },
  { id: "feud", g: true, retry: true, prio: 3, kind: "sponsor", icon: "🥊", when: (c) => !!c.L.hit.feud && (c.L.hit.feud.season < c.game.season || c.L.hit.feud.day <= c.day),
    build: (c, r) => { const f = c.L.hit.feud, b = brandById(f.brand); delete c.L.hit.feud;
      return { head: `${b.name.toUpperCase()} V ${c.p.name.toUpperCase()}: THE BOOT WAR IS ON`, sub: f.why === "breach" ? `${c.p.name} was seen in ${b.name} boots while under contract with ${brandById(f.other).name}. Lawyers, a fine and a lot of thumbs-down emojis are in play.` : pick(r, [`${b.name} are "disappointed" ${c.p.name} chose ${brandById(f.other).name}. Their billboard now just says "WE REMEMBER". It is outside the training ground.`, `${b.name}'s marketing chief called ${brandById(f.other).name} "a fancy sock company" on live TV. ${c.p.name} replied with one eyebrow.`]), fx: { fol: f.why === "breach" ? 1200 : 3000, coins: f.why === "breach" ? -c.P.breachFine : 0 } }; } },
];
const kindIcon = Object.fromEntries(STORIES.map((s) => [s.kind, s.icon]));
export { kindIcon };

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
function mk(game, p, s) {
  const room = weekRoom(game, s.prio ?? 0); if (!room) return null;
  if (room.replace) overwrite(game, room.replace);
  game.newsSeq = (game.newsSeq || 0) + 1; game.pubSeq = game.pubSeq || 0;
  const status = s.approval && p.team != null && game.teams[p.team].human ? "pending" : "live";
  const n = { id: game.newsSeq, season: game.season, day: s.day ?? game.weekDay ?? (game.md ? game.md.day : 0), kind: s.kind, icon: s.icon, pid: p.id, name: p.name, team: p.team, clubName: club(game, p), head: s.head, sub: s.sub, status, approver: status === "pending" ? p.team : null, prio: s.prio ?? 0, abs: !!s.abs, fx: s.fx || null, flag: s.flag || null, gflag: s.gflag || null };
  if (status === "live") n.pub = ++game.pubSeq;
  (game.news = game.news || []).push(n); if (game.news.length > 60) game.news.shift();
  weekSlot(game).ids.push(n.id);
  if (s.fx) applyFx(game, p, s.fx);
  return n;
}
function applyFx(game, p, fx) {
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
export function runActivity(game, p, act, { marry = false, day = 0, partner = null } = {}) {
  const P = game.P.life, L = ensureLife(game, p);
  game.weekDay = day;
  if (blocked(game, p, act, { marry, partner })) { act = "balance"; marry = false; partner = null; }
  const a = P.acts[act], r = makeRng(game.seed, "life", p.id, game.season, day);
  const cost = actCost(game, p, act) + (marry ? WEDDING_COST(game) : 0);
  p.coins = Math.max(0, (p.coins || 0) - cost);
  L.cnt[act]++;
  // stamina is "recovery": it moves the player's starting energy for this match
  const home = (L.own.house ? shopItem(L.own.house).rec || 0 : 0) + (L.own.plane ? 3 : 0);
  p.stam = clamp((p.stam ?? 100) + a.stam + home, 0, 100);
  // love life
  let love = a.love;
  if (act === "party" && L.partner && L.partner.partier) love = P.partyLoveWithPartier;
  let wrong = null;
  if (act === "date") {
    const prev = L.partner, id = L.married && prev ? prev.id : (partner || (prev && prev.id) || (L.opts && L.opts.ids[0]) || PARTNER_LIST[0].id), info = partnerById(id);
    if (!prev || prev.id !== id) {
      // a new face: remember who it was before (cheating on someone you have been seeing is the paparazzi's favourite)
      if (prev && !L.married && (L.dated[prev.id] || 0) >= P.cameraAt) wrong = { prev, now: info };
      L.partner = { id, name: info.name, g: info.g, partier: makeRng(game.seed, "partier", p.id, id)() < P.partnerParty, dates: L.dated[id] || 0 };
    }
    L.dated[id] = (L.dated[id] || 0) + 1; L.partner.dates = L.dated[id];
  }
  if (L.hit.wedLeft > 0) L.hit.wedLeft--;
  L.love = clamp(L.love + love, L.married ? 10 : 0, 100);
  if (L.partner && !L.married && L.love <= 0) L.partner = null;             // the relationship fizzles out
  L.fol = Math.max(0, Math.round(L.fol + a.fol * (1 + Math.max(0, p.ovr - 80) / 40)));
  if (act === "train") {                                                    // small, steady skill gains
    p.ovrf = (p.ovrf ?? p.ovr) + P.trainGain;
    const foc = FOCUS_STATS(p.pos), k = foc[Math.floor(r() * foc.length)];
    p[k] = clamp(p[k] + (r() < P.trainStat ? 1 : 0), 30, 99);
    p.ovr = clamp(Math.round(p.ovrf), 40, 99); p.tier = p.ovr >= 90 ? "ruby" : p.ovr >= 85 ? "gold" : "silver"; rate(p, game.P);
  }
  let wada = false;
  if (act === "party" && r() < P.wada) { wada = true; p.susp = Math.max(p.susp || 0, P.wadaBan); }
  const c = { game, p, act, L, P, r, married: L.married, wedding: !!marry, wada, wrong, day, leakLeft: L.hit.wedLeft || 0 };
  if (marry) { L.married = true; L.hit.wedLeft = P.leakWeeks + 1; L.opts = null; }
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
    const n = mk(game, p, { kind: s.kind, icon: s.icon, approval: s.approval, prio: s.prio, abs: !!s.g, ...b });
    if (n) { out.push(n); printed = true; }
  }
  L.last = { act, cost, day, wed: !!marry };
  L.act = null;
  boots(game, p, day, r);
  return { act, cost, stories: out, wada };
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
  const choices = BOOT_BRANDS.filter((b) => b.id !== cur); const b = choices[Math.floor(r() * choices.length)];
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
