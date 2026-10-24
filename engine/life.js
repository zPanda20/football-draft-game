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
const PARTNERS = ["Sofia Marquez", "Jordan Blake", "Camille Dubois", "Kenji Aoki", "Amara Okafor", "Luca Bianchi", "Zoe Whitfield", "Mateo Silva", "Ingrid Larsen", "Nia Adeyemi", "Theo Martin", "Priya Nair", "Dani Costa", "Freya Holm", "Rafael Duarte", "Mei Tanaka"];
const CLUBNAMES = ["Offside", "The Back Post", "Extra Time", "VAR Room", "Golden Boot", "Stoppage", "Nutmeg", "Top Bins", "The Dugout", "Panenka"];
export function ensureLife(game, p) {
  const P = game.P.life;
  if (!p.life) p.life = { fol: P.startFollowers, love: P.startLove, partner: null, married: false, own: { cars: [], house: null, yacht: null, plane: false, club: null }, cnt: { train: 0, date: 0, party: 0, rest: 0, balance: 0 }, sCount: 0, flags: {}, act: null, last: null, clubName: null };
  return p.life;
}
export const resetSeason = (game) => { for (const p of Object.values(game.players)) if (p.user && p.life) { p.life.cnt = { train: 0, date: 0, party: 0, rest: 0, balance: 0 }; p.life.sCount = 0; p.life.flags = {}; p.life.act = null; } };

export function nightclub(life) { return life.own.club ? shopItem(life.own.club) : null; }
export function actCost(game, p, act) {
  const L = ensureLife(game, p), base = game.P.life.acts[act].cost;
  const club = nightclub(L);
  return Math.round(act === "party" && club ? base * (1 - club.party) : base);
}
export const WEDDING_COST = (game) => game.P.life.wedding.cost;
export function canMarry(game, p) { const L = ensureLife(game, p); return !!(L.partner && !L.married && L.partner.dates >= game.P.life.wedding.dates); }
// Why this choice cannot be made right now (or null).
export function blocked(game, p, act, { marry = false } = {}) {
  if (!ACTS.includes(act)) return "unknown";
  const L = ensureLife(game, p), cost = actCost(game, p, act) + (marry ? WEDDING_COST(game) : 0);
  if (act === "party" && p.susp > 0) return "You are suspended";
  if (marry && !(act === "date" && canMarry(game, p))) return "No wedding yet";
  if ((p.coins || 0) < cost) return "Not enough money";
  return null;
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
  return { sponsor, venue, total: sponsor + venue };
}

const who = (p) => (p.gender === "F" || p.gender === "Female" ? "Woman" : p.gender === "M" || p.gender === "Male" ? "Man" : "Footballer");
const fem = (p) => p.gender === "F" || p.gender === "Female";
const he = (p) => (fem(p) ? "She" : "He"), his = (p) => (fem(p) ? "her" : "his"), him = (p) => (fem(p) ? "her" : "him");
const club = (game, p) => (p.team != null ? game.teams[p.team].name : "Free agent");
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
const carOf = (L) => { const c = L.own.cars.map(shopItem).sort((a, b) => b.price - a.price)[0]; return c ? c.name : "car"; };
const partnerOf = (L) => (L.partner ? L.partner.name : "a mystery companion");

// Story table. `g` stories always run when their condition is met; the rest need a roll and share the season cap.
// Each build() returns { head, sub, fx: { fol, love, coins } }.
const STORIES = [
  { id: "boring", g: true, kind: "boring", icon: "😴", when: (c) => c.act === "balance" && c.L.cnt.balance === c.P.boringAt,
    build: (c) => ({ head: `MOST BORING ${who(c.p).toUpperCase()} IN THE LEAGUE?`, sub: `${c.p.name} has had a perfectly balanced week ${c.P.boringAt} times this season. Team-mates: "${he(c.p)}'s fine. ${he(c.p)}'s just... fine."`, fx: { fol: -400 } }) },
  { id: "wedding", g: true, kind: "wedding", icon: "💍", when: (c) => c.wedding,
    build: (c) => ({ head: `WEDDING BELLS: ${c.p.name.toUpperCase()} SAYS "I DO"`, sub: `${c.p.name} and ${partnerOf(c.L)} tie the knot after ${c.L.partner.dates} dates. The ${club(c.game, c.p)} dressing room is "emotional". Honeymoon: one rest day.`, fx: { fol: 3000, love: 25 } }) },
  { id: "wada", g: true, kind: "steroids", icon: "🧪", when: (c) => c.wada,
    build: (c) => ({ head: `WADA FLAG: ${c.p.name.toUpperCase()} SIDELINED`, sub: `${c.p.name} (${club(c.game, c.p)}) misses the next ${c.P.wadaBan} matches after a flagged test. Camp insists "it was the protein shake".`, fx: { fol: -2500 } }) },
  { id: "drunk", chance: (c) => c.P.chance.drunk, kind: "drunk", icon: "🚨", when: (c) => c.act === "party" && c.L.own.cars.length > 0 && c.L.cnt.party >= c.P.drunkAt && !c.L.flags.drunk,
    build: (c) => ({ head: `${c.p.name.toUpperCase()} IN DRINK-DRIVING SCANDAL`, sub: `The ${carOf(c.L)} was found on the wrong side of the road. ${club(c.game, c.p)} are "very disappointed" and a fine is on the way.`, fx: { fol: -2500, coins: -30 }, flag: "drunk" }) },
  { id: "proud", chance: (c) => c.P.chance.proud, kind: "proud", icon: "👏", approval: true, when: (c) => c.act === "train" && !c.L.flags.proud,
    build: (c) => ({ head: `"SO PROUD OF ${his(c.p).toUpperCase()} WORK RATE": ${club(c.game, c.p).toUpperCase()} PRAISE ${c.p.name.toUpperCase()}`, sub: `Last one in, last one out. The coaching staff say ${c.p.name} is "setting the standard" at ${club(c.game, c.p)}.`, fx: { fol: 900 }, flag: "proud" }) },
  { id: "monaco", chance: (c) => c.P.chance.monaco, kind: "yacht", icon: "🛥️", when: (c) => c.act === "party" && !!c.L.own.yacht && !c.game.newsFlags["monaco" + c.game.season],
    build: (c) => ({ head: `${c.p.name.toUpperCase()} HOSTS THE MONACO GP YACHT PARTY`, sub: `The paddock turns up, a driver DJs, and nobody remembers who won the race. Champagne bill: "undisclosed, and large".`, fx: { fol: 5000, coins: -80 }, gflag: "monaco" }) },
  { id: "trouble", chance: (c) => c.P.chance.trouble, kind: "trouble", icon: "💔", when: (c) => c.act === "party" && c.married,
    build: (c) => ({ head: `TROUBLE IN PARADISE FOR ${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()}`, sub: `Another late night out and a very quiet breakfast. Friends say "they are working through it". The dog has picked a side.`, fx: { fol: 700, love: -30 } }) },
  { id: "jet", chance: (c) => c.P.chance.fun, kind: "fun", icon: "✈️", when: (c) => c.act === "train" && c.L.own.plane && !c.L.flags.jet,
    build: (c) => ({ head: `${c.p.name.toUpperCase()} LANDS PRIVATE JET AT TRAINING GROUND`, sub: `Groundstaff were "mildly concerned" as the plane taxied past the cones. The gaffer is not amused. The fans are.`, fx: { fol: 1800 }, flag: "jet" }) },
  { id: "yachtdate", chance: (c) => c.P.chance.fun, kind: "fun", icon: "🛥️", when: (c) => c.act === "date" && !!c.L.own.yacht && c.L.partner && c.L.partner.dates >= 3 && !c.L.flags.yachtdate,
    build: (c) => ({ head: `LOVE ON THE WATER: ${c.p.name.toUpperCase()} AND ${partnerOf(c.L).toUpperCase()}`, sub: `A sunset, a very long deck and one tiny sofa. Photographers on jet skis got the shots.`, fx: { fol: 1100, love: 8 }, flag: "yachtdate" }) },
  { id: "kebab", chance: (c) => c.P.chance.fun, kind: "fun", icon: "🍟", when: (c) => c.act === "date" && !!c.L.partner && !c.L.flags.kebab,
    build: (c) => ({ head: `CHIPS AND LOVE: ${c.p.name.toUpperCase()} SPOTTED WITH ${partnerOf(c.L).toUpperCase()}`, sub: `Sharing a tray of chips at 11pm. Staff say the ${club(c.game, c.p)} ${c.p.pos} tipped well and asked for extra sauce.`, fx: { fol: 800 }, flag: "kebab" }) },
  { id: "owner", chance: (c) => c.P.chance.fun, kind: "fun", icon: "🎧", when: (c) => c.act === "party" && !!nightclub(c.L) && !c.L.flags.owner,
    build: (c) => ({ head: `OWNER'S SET: ${c.p.name.toUpperCase()} TAKES OVER THE DECKS AT ${(c.L.clubName || "OFFSIDE").toUpperCase()}`, sub: `A 3am set of nothing but stadium anthems goes viral. Management (also ${c.p.name}) approve the overtime.`, fx: { fol: 2500 }, flag: "owner" }) },
  { id: "sleep", chance: (c) => c.P.chance.fun, kind: "fun", icon: "🛌", when: (c) => c.act === "rest" && c.L.cnt.rest >= c.P.sleepAt && !c.L.flags.sleep,
    build: (c) => ({ head: `${c.p.name.toUpperCase()} HAS BEEN IN BED SINCE TUESDAY`, sub: `A fourteen-hour nap before the next fixture. The physio calls it "elite recovery". The sofa is jealous.`, fx: { fol: 350 }, flag: "sleep" }) },
  { id: "gym", chance: (c) => c.P.chance.fun, kind: "fun", icon: "💪", when: (c) => c.act === "train" && c.L.cnt.train >= c.P.gymAt && !c.L.flags.gym,
    build: (c) => ({ head: `GYM RAT ALERT: ${c.p.name.toUpperCase()} LOCKED IN THE GYM`, sub: `Cleaners found ${him(c.p)} still doing calf raises at midnight. The floodlights were switched off "as a hint".`, fx: { fol: 500 }, flag: "gym" }) },
  { id: "wild", chance: (c) => c.P.chance.wild, kind: "party", icon: "🍾", when: (c) => c.act === "party",
    build: (c, r) => ({ head: pick(r, [`WILD NIGHT OUT: ${c.p.name.toUpperCase()} SPOTTED AT 4AM`, `${c.p.name.toUpperCase()} DANCES ON A TABLE. IT HOLDS.`, `STARS OUT: ${c.p.name.toUpperCase()} LEADS THE CONGA LINE`]), sub: pick(r, [`Witnesses say the ${club(c.game, c.p)} ${c.p.pos} was "in great spirits" and had lost one shoe.`, `Fans filmed it all. The group chat has not recovered.`, `A kebab was involved. So was a traffic cone.`]), fx: { fol: 1500 } }) },
];
const kindIcon = Object.fromEntries(STORIES.map((s) => [s.kind, s.icon]));
export { kindIcon };

// A club buying a nightclub is news on its own.
export function purchaseStory(game, p, it) {
  const L = ensureLife(game, p);
  if (it.cat === "club") return mk(game, p, { kind: "club", icon: "🪩", head: `${p.name.toUpperCase()} OPENS "${(L.clubName || "OFFSIDE").toUpperCase()}"`, sub: `${it.name} opening night: velvet rope, a trophy cabinet behind the bar and a menu with a "Hat-trick Hotdog". The ${club(game, p)} squad have a booth.`, fx: { fol: 2500 } });
  if (it.cat === "plane") return mk(game, p, { kind: "fun", icon: "✈️", head: `${p.name.toUpperCase()} BUYS A PRIVATE PLANE`, sub: `It has a bed, a PlayStation and one very confused flight attendant. Away days just got a lot more comfortable.`, fx: { fol: 3000 } });
  return null;
}
function mk(game, p, s) {
  game.newsSeq = (game.newsSeq || 0) + 1; game.pubSeq = game.pubSeq || 0;
  const status = s.approval && p.team != null && game.teams[p.team].human ? "pending" : "live";
  const n = { id: game.newsSeq, season: game.season, day: game.md ? game.md.day : 0, kind: s.kind, icon: s.icon, pid: p.id, name: p.name, team: p.team, clubName: club(game, p), head: s.head, sub: s.sub, status, approver: status === "pending" ? p.team : null };
  if (status === "live") n.pub = ++game.pubSeq;
  (game.news = game.news || []).push(n); if (game.news.length > 60) game.news.shift();
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
  return mk(game, p, { kind: "steroids", icon: "🧪", head: `DOPING SHOCK: ${p.name.toUpperCase()} BANNED`, sub: `${t}'s ${p.pos} fails a drugs test and is out for ${d.games} games. The lab says the sample was "very clear". Not in a good way.` });
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
export function runActivity(game, p, act, { marry = false, day = 0 } = {}) {
  const P = game.P.life, L = ensureLife(game, p);
  if (blocked(game, p, act, { marry })) { act = "balance"; marry = false; }
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
  if (act === "date") {
    if (!L.partner) L.partner = { name: pick(r, PARTNERS), partier: r() < P.partnerParty, dates: 0 };
    L.partner.dates++;
  }
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
  const c = { game, p, act, L, P, r, married: L.married, wedding: !!marry, wada };
  if (marry) L.married = true;
  const out = [];
  for (const s of STORIES) {
    if (!s.when(c)) continue;
    if (!s.g) { if (L.sCount >= P.maxStories) continue; if (r() >= s.chance(c)) continue; }
    const b = s.build(c, r);
    if (b.flag) L.flags[b.flag] = true; if (b.gflag) (game.newsFlags = game.newsFlags || {})[b.gflag + game.season] = true;
    if (!s.g) L.sCount++;
    out.push(mk(game, p, { kind: s.kind, icon: s.icon, approval: s.approval, ...b }));
    if (!s.g) break;                                                           // at most one random story a week
  }
  L.last = { act, cost, day, wed: !!marry };
  L.act = null;
  return { act, cost, stories: out, wada };
}
// Stats a position cares about most (top three), used for where training goes.
const FOC = { ST: ["sho", "pac", "dri"], CAM: ["pas", "dri", "sho"], CM: ["pas", "dri", "def"], CDM: ["def", "pas", "phy"], CB: ["def", "phy", "pac"], RB: ["def", "pac", "pas"], LB: ["def", "pac", "pas"], RM: ["pac", "dri", "pas"], LM: ["pac", "dri", "pas"], LW: ["pac", "dri", "sho"], RW: ["pac", "dri", "sho"], GK: ["pac", "sho", "dri"] };
const FOCUS_STATS = (pos) => FOC[pos] || FOC.CM;
