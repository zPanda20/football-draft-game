// Every tunable number in one place. Balance tests change these, never the code.
export const DEFAULT_PARAMS = {
  // ---- rating -> strength ----
  stretch: { centre: 80, k: 4.2, base: 50, gkRef: 84 },       // effective = base + (rating - centre) * k. 4.2 (was 2.2) widens the quality gap: strongest squad wins ~34% of titles, top third ~80% (10 teams)
  blendOvr: 0.5,                                    // a player's role score is this share OVR, the rest the role's stat mix

  // ---- position fit (see roster.js) ----
  fit: { perUnit: 0.055, lineUnit: 0.02, sideUnit: 0.03, floor: 0.45, gkInOutfield: 0.45, outfieldInGoal: 0.40, widthWeight: 0.7 },

  // ---- match ----
  match: {
    moments: 5,                                     // moments per half (the 52-second match has 2 halves)
    secondHalf: [0.1, 0.3, 0.5, 0.7, 0.8, 0.9, 0.98], // where the second half's moments fall (share of the half): three of them in the last ten minutes (81', 86', 89')
    possK: 0.035,                                   // possession swing per control-point difference
    shotBase: 0.9, shotK: 0.028,                    // chance a possession becomes a shot
    goalBase: -0.62, goalK: 0.030,                  // chance a shot beats the keeper
    formSigma: 3.0,                                 // per-match form noise on every team rating, in effective points
    momentSigma: 3.0,                               // extra noise inside each moment
  },

  // ---- formation identities (see match.js: shapeAdjust, matchups) ----
  // All numbers are effective rating points unless noted. `shotFor` / `shotAgainst` shift the shot chance (logit) of
  // that team's own shots / of the shots it concedes. `counter` / `exposed` set the odds of a fast break when that
  // team has the ball / when it is the one defending. `drain` multiplies stamina loss by slot. The lens numbers turn
  // a line's raw stats (relative to `ref`) into rating points.
  shape: {
    ref: 78,
    goalDef: 0.3,                                   // share of the goal check carried by the defence (the keeper has the rest)
    duelK: 0.3, duelCap: 6,                         // back line PHYSICAL against the forwards' PHYSICAL, points per stat point
    breakK: 0.05, breakShot: 1.2,                   // fast break: logit per PACE point of gap; shot-chance bonus (defence is bypassed)
    f: {
      "2-1-2":      { atk: 1, def: 0, ctl: -1, shotFor: 0.5, shotAgainst: 0, counter: -2.2, exposed: 0, drain: { CM: 1.6 }, feed: 0.2 },
      "2-2-1":      { atk: -3, def: -2, ctl: 3.5, shotFor: 0, shotAgainst: -0.1, counter: -2.2, exposed: 0, duel: 1.5, retain: 0.2 },
      "3-1-1":      { atk: 0.5, def: 4, ctl: 0, shotFor: -0.1, shotAgainst: -0.35, counter: -0.3, exposed: -1.5, drain: { LB: 0.85, CB: 0.85, RB: 0.85, ST: 1.4 }, stack: 0.25 },
      "1-3-1":      { atk: 0, def: -4, ctl: 5, shotFor: 0, shotAgainst: 0, counter: -1.5, exposed: 1.0, drain: { LM: 1.25, CM: 1.25, RM: 1.25 }, press: 0.3 },
      "1-2-2":      { atk: 5, def: -5, ctl: 0, shotFor: 0.25, shotAgainst: 0.25, counter: -1.2, exposed: 1.3, drain: { CM: 1.15 }, rush: 0.25 },
      "2-2-1 wide": { atk: 3, def: 0, ctl: 0, shotFor: 0.15, shotAgainst: 0.1, counter: -2.0, exposed: 0.6, drain: { LM: 1.15, RM: 1.15, LB: 1.1, RB: 1.1 }, rush: 0.2 },
    },
    // Counter-play: [shape A, shape B, A's bonus, B's bonus]. Small on purpose.
    vs: [
      ["1-3-1", "2-1-2", { ctl: 2 }, { ctl: -2 }],             // a three-man midfield starves the lone playmaker
      ["2-2-1", "2-1-2", { ctl: 1 }, { ctl: -1 }],
      ["1-3-1", "2-2-1", { ctl: 2 }, { ctl: -2 }],             // the press disrupts the square
      ["3-1-1", "1-2-2", { def: 3 }, { atk: -3 }],             // three deep defenders against two strikers
      ["2-2-1 wide", "3-1-1", { atk: 2 }, { def: -2 }],        // width pulls the block apart
      ["2-2-1 wide", "1-3-1", { atk: 3 }, { def: -3 }],        // width beats a central overload
    ],
  },

  // ---- box score ----
  stats: { defActShot: 0.4, defActMove: 0.8, tackleShare: 0.55, creator: 0.85, creatorBreak: 0.5 }, // chance a moment has a tackle or interception; share that are tackles; chance a shot comes from a pass

  // ---- stamina ----
  stamina: {
    drainPerHalf: 27,                               // at STA 50 -> 27 * (1.5 - STA/100) per half
    gk: { base: 2, below: 62, slope: 0.7 },         // keepers barely tire: base per half, plus slope per STA point below `below` (only weak-STA keepers feel it)
    fatigueK: 0.35,                                 // rating multiplier = 1 - fatigueK * (1 - stamina/100)
    recoverPlayed: 45, recoverRest: 75,             // points regained between matches (more with higher STA)
    staRecoverK: 0.25,                              // +/- per STA point away from 70
    lowStamina: 45,                                 // bots sub a player off below this at half-time
  },

  // ---- draft packs ----
  packs: {
    size: 5, rounds: 8, playerRounds: 6, mixedPlayers: 3,
    headlinerMin: 20,                               // headliners come from the top max(this, teams) players
    r1Boost: 0.8,                                   // round-1 packs lean to the best players
    dialStrength: 0.6, dialClamp: 1.0,              // how hard weaker rosters are favoured in later packs
    needBoost: 1.6,                                 // weight for a striker / defender the team has none of yet
    gkOwnedWeight: 0.10, stOwnedWeight: 0.70, defOwnedWeight: 0.60, defOwnedAfter: 2,
    gkReserve: 3,                                   // keepers kept back for teams that still have none
    gkGuaranteeRounds: [4, 5, 6, 7, 8],
  },

  // ---- money ----
  money: {
    mvBase: 100, mvPerOvr: 0.157, mvAgeFrom: 30, mvAgePerYear: 0.05, mvAgeMin: 0.4, // market value = 100 * e^(0.157 (ovr-81)), older players cheaper
    mvStarFrom: 88, mvStarPerOvr: 0.078,            // above this rating the curve flattens, so 95+ stars are dear but not out of reach (95 = about 520, 99 = about 710)
    lenMult: { 1: 1.0, 2: 1.6, 3: 2.1 },            // fee multiplier by contract length: a 3-year deal costs 0.70 of the one-year price per season
    startCoins: 800,
    draftContract: 2,                               // fallback length of a contract won in the pack draft (no fee)
    draftContracts: [3, 3, 2, 2, 2, 1, 1, 1],       // by pack round: early picks get longer deals, so contracts end at different times
    loyalty: 0.06, loyaltyMax: 3,                   // each season a player stays (after the first) takes 6% off the re-sign fee, up to 3 seasons: a core you keep gets cheaper
    resignMult: 0.65,                               // re-signing your own expiring player costs this share of the normal fee
    rookieContract: 3,
    extraCap: 2.0,                                  // extra coins count up to +200% of the minimum offer
    catchUp: 0.6,                                   // lottery weight 1 / (1 + catchUp * value / mean value)
    incomePerMatch: 54, incomeCatchUp: 0.2,        // base income per match; the lowest team earns +35% on top, the highest +0% (linear in table rank)
    seasonBoost: { 3: 1.3, 5: 1.3 },              // income multiplier in these seasons (the re-sign cliff years)
    refMatches: 24,                                 // a season of this many matches earns the plain income; fewer matches earn more per match (clamped), so short leagues are not squeezed
    winBonus: 10, drawBonus: 5,                     // paid on top of the base, win or draw
    rosterMax: 10, rosterMin: 6,
  },

  // ---- ageing, retirement, rookies ----
  age: {
    retire: { 36: 0.20, 37: 0.40, 38: 0.60, 39: 0.80, 40: 1.0 }, // chance by the age a player turns that off-season (40+ = certain)
    gkShift: 5, gkSlow: 0.6,                                    // keepers are judged 5 years younger, and what they lose is scaled by this on top
    guaranteed: ["lionel-messi", "luka-modric", "cristiano-ronaldo", "marta"], // retire after the first season
    drift: { 21: 2.5, 22: 2.0, 23: 1.5, 24: 1.0, 25: 0.5, 28: 0, 29: -0.3, 30: -0.8, 31: -1.2, 32: -1.6, 33: -2.0, 34: -2.4, 35: -3.0 }, // mean OVR change at that age (linear between points)
    noise: 0.9,                                     // season-to-season randomness (OVR points)
    paceDecline: 1.4, phyDecline: 1.0, staAfter: 28, staPerYear: 0.8, // stat shape of decline
    potential: { low: 0.55, med: 1.0, high: 1.5 },  // multiplies the growth of a young player
  },
  rookies: { classSize: 34, placeholder: true, pack: 3, alwaysHigh: ["endrick", "gilberto-mora", "cavan-sullivan"] },   // the rookie draft opens packs of `pack` unseen players; these three always have high potential
  scout: { cost: [150, 300] },                      // scouting network levels (coins, once): +1 player in each of your rookie-draft packs per level
  seasons: 4,                                       // default length of a game (needs one rookie class per off-season)
  trade: { maxAssets: 6, botMargin: 1.10 },
  lineup: { earlyDays: 2, earlySec: 20 },           // the first two matchdays of a season give this many extra seconds to set the line-up
  transfer: { windowWeeks: 5, extraSec: 15 },       // in-season window: open before matchdays 1..5 and between them; the line-up timer gets this many extra seconds while it is open

  // ---- player mode (a human plays one footballer instead of managing a team) ----
  player: {
    start: [81, 86],                                // starting overall of a created player
    rerolls: 2,                                     // extra rolls of the six numbers
    spread: [14, 8, 3, -3, -9, -15],                // the six numbers are start + these (plus noise), then the user assigns them
    cards: 3,                                       // career cards per season
    maxQueue: 2,                                    // unanswered cards pile up to this many; older ones lapse
    push: { bonus: 2.5, drain: 1.35 },              // half-time choice: +rating for the second half, faster stamina drain
    conserve: { bonus: -0.5, drain: 0.6 },
    offersPerMarket: 3,                             // CPU teams that make an offer when a market opens
    maxOpenOffers: 3,                               // per manager
    startCoins: 150, income: 15,                    // a created player's own wallet: start and per matchday
    itemCap: 4,                                     // items a created player can wear in one match
    packs: 3, packCards: 3, packCoins: [30, 60],                  // item packs a created player opens during the pack draft (one item or a small coin bonus in each)
    sellBack: 0.65,                                 // selling a car or a house gives back this share of its price
    signShare: 1,                                   // share of the signing fee a manager pays that goes to the footballer's own wallet (1 = all of it)
    cpuContract: 2,                                 // seasons on the deal a CPU team gives an unsigned player (no fee)
  },

  // ---- items ----
  items: { activeCap: 3, eliteChance: 0.18 },   // eliteChance: how often one of the one-of-a-kind top boots (if any are left) turns up in the store
  // Steroids: store-only, shows up now and then. Caught means a suspension of max(ban, games left this season).
  // Player-mode life between matches (engine/life.js). stam is the "recovery" the activities move.
  life: {
    startFollowers: 3000, startLove: 40,
    acts: {
      train: { stam: -12, love: -3, fol: 300, cost: 0 },
      date: { stam: -5, love: 12, fol: 0, cost: 12 },
      party: { stam: -22, love: -10, fol: 900, cost: 28 },
      rest: { stam: 18, love: -6, fol: -150, cost: 0 },
      balance: { stam: 2, love: 0, fol: 0, cost: 0 },
    },
    trainGain: 0.25, trainStat: 0.85, trainCap: 2,  // overall points per Train hard (4 sessions a point), the most training adds in one season, and the chance a skill moves up in a session
    boost: { flowers: { love: 8 }, ziplock: { fol: 1.6, stam: -10, wada: 0.10 }, pre: { gain: 1.75, stam: -4 } },   // what the life items do (Flowers on a Date, Ziplock baggie on a Party, Pre-workout on Train hard)
    partnerParty: 0.3, partyLoveWithPartier: 3,     // a new partner is a party-er this often; partying with one costs no love life
    wada: 0.04, wadaBan: 2,                         // Party: chance of a flagged test, and the ban in matches
    sponsor: { per: 2000, cap: 40 },                // coins a matchday = followers / per, up to cap
    wedding: { dates: 6, cost: 60 },                 // dates with an exclusive partner before the wedding can be planned (the cost is the cheapest ceremony)
    cameraAt: 3, leakWeeks: 3, prefChance: 0.8,       // dated someone this often before a new face counts as cheating; weeks the wedding guest list can leak; how often the preferred activity is picked when you choose nothing
    milestone: { m100k: 80, m1m: 400 },             // coins that come with the follower milestones
    fans: { goal: 700, assist: 450, win: 150, potm: 1200, hatTrick: 2500, goodAt: 7.5, good: 600, greatAt: 8.5, great: 1500, badAt: 5.5, bad: 500 }, // followers from a match
    trophy: { title: { fol: 120000, coins: 150 }, ballon: { fol: 300000, coins: 300 }, boot: { fol: 100000, coins: 100 }, playmaker: { fol: 100000, coins: 100 }, glove: { fol: 100000, coins: 100 } },
    deals: [{ fol: 15000, pay: 6, seasons: 2 }, { fol: 60000, pay: 12, seasons: 2 }, { fol: 250000, pay: 22, seasons: 3 }, { fol: 1000000, pay: 36, seasons: 3 }], // boot-maker offers by followers
    rom: {
      together: { love: 4, bond: 8, fol: 1.25 },   // doing a party, a training session or a quiet night with your partner (both footballers): love, bond, follower boost
      dateMult: 2,                                  // a date with another user player: the one who asks pays this many times a normal date
      goodAt: 0.55,                                 // a date this good counts as a success
      exclDates: 3, exclGood: 2,                    // dates, and good dates, needed before you can ask for exclusive
      exclBase: 0.12, exclQ: 0.5, exclLoyal: 0.28, exclRival: 0.12, exclCool: 2,  // the partner's answer: base + dates + loyalty - others she is seeing; weeks before asking again
      revealAt: 3,                                  // dates before a partner's hidden loyalty can be looked up
      seeWeeks: 4, rivalQ: 0.12,                    // another footballer counts as "also seeing" a person for this many weeks; date quality lost for each of them
      cheatBelow: 55, cheatMax: 0.16,               // a partner with loyalty under this may cheat each week (the chance grows towards cheatMax at 0)
      dumpCheat: 0.6, dumpHeart: 3,                 // chance a cheated-on partner leaves; weeks a heartbroken partner is unavailable
      thrLove: 6, thrAsk: 0.15, thrOpen: 0.5,      // extra love from dates in a thrupple; base chance a partner is open to it and how much a low loyalty adds
      reqWeeks: 1,                                  // a request lapses after the matchday it was sent
      propBase: 0.05, propQ: 0.45, propLove: 0.2, propLoyal: 0.2, propGood: 0.1, propCheat: 0.2,   // chance a proposal is accepted: base + how the dates went + love + loyalty + share of good dates - cheating
      propDump: 0.35, propDumpLow: 0.25, propCool: 3,   // when she says no: chance she also ends it (more likely the worse the relationship was), and weeks before you can ask again
      tiers: [
        { id: "quiet", name: "Registry office", cost: 60, fol: 1500, love: 10, guests: 6, text: "A quiet signing and a sandwich." },
        { id: "classic", name: "Classic wedding", cost: 160, fol: 6000, love: 14, guests: 20, text: "Church, marquee, band." },
        { id: "lavish", name: "Lavish celebration", cost: 360, fol: 20000, love: 18, guests: 60, text: "A castle, fireworks and a horse." },
        { id: "royal", name: "Wedding of the century", cost: 800, fol: 70000, love: 24, guests: 200, text: "Helicopters, a choir and a documentary crew." },
      ],
    },
    // Relationships need looking after (engine/affair.js): a bond with the partner that decays when ignored, secret dates (an affair) that build a risk of being caught, and divorce.
    club: {                                      // how clubs feel about a footballer (-100..100)
      beef: { high: 3, funny: -4, petty: -12, rude: -25, ignore: 0 }, feud: -20,   // answering a club that trolled him
      scandalHit: -10, fireAt: 3, fireChance: 0.5, fireStep: 0.25, fireRel: -85, fireHit: -15,   // scandals at one club in a season: from fireAt on, the club may end his contract when the off-season opens
      refuseAt: -60, weekly: 1,                // a club at or below refuseAt will not sign him; a matchday with the club adds weekly
    },
    upkeep: { start: 60, grace: 2, decayExcl: 4, decayMarried: 3, date: { good: 10, ok: 6, bad: 1 }, like: 6, warnAt: 40, leaveAt: 22, leaveExcl: 0.4, leaveMarried: 0.3 },   // bond gains from a date (good/ok/bad) or a thing they enjoy; weeks you can ignore them for free; yearly decay; the partner may walk out under leaveAt
    affair: { heatDate: 14, heatRand: 8, heatFame: 10, cool: 7, rumourAt: 45, catchFrom: 20, catchK: 1.0, catchMax: 0.85, leaveExcl: 0.7, leaveMarried: 0.55, bondHit: 35, publicDates: 3, publicLove: 40, love: 12 },   // secret dates: risk of being caught climbs with each one and cools off slowly; what happens when caught
    divorce: { share: 0.2, cool: 3 },                // the one at fault pays this share of their wallet in the settlement
    dm: { max: 140, leakFol: 1200, subjectFol: 2500, subjectLove: -10, bondHit: 20 },   // a leaked DM: followers for the leaker and the person it came from, what it costs them in love life and with their partner
    beef: { chance: 0.35, replies: { high: { fol: 400, feud: 0, love: 0 }, funny: { fol: 1500, feud: 0.12, love: 0 }, petty: { fol: 1800, feud: 0.5, love: 0 }, rude: { fol: 3200, feud: 0.9, love: -4 }, ignore: { fol: 0, feud: 0, love: 0 } } },
    feudChance: 0.6, breachFine: 40,
    boringAt: 15, drunkAt: 5, sleepAt: 4, gymAt: 8, maxStories: 5, perWeek: 1,
    chance: { party2: 0.28, gossip: 0.3, wild: 0.12, drunk: 0.2, proud: 0.1, monaco: 0.15, trouble: 0.12, fun: 0.1, troll: 0.3, camera: 0.6, leak: 0.5, style: 0.35 },
    style: { gq: 40000, bazaar: 100000, vogue: 250000 },    // followers needed before a style magazine writes about the player
  },
  // ---- season awards (Ballon d'Or weights add to 1; each part is measured against the best in the league) ----
  awards: { minShare: 0.5, gloveShare: 0.4, base: 6.0, ovrFloor: 60, weights: { rating: 0.30, contrib: 0.25, potm: 0.17, wins: 0.20, star: 0.08 } },
  // ---- social layer: manager situations, story threads, invitations, gifts and the mid-season gala. Every cost is small and capped on purpose. ----
  social: {
    trust: { min: -2, max: 2 },                    // one meter per player and manager: Bitter -2, Wary -1, Neutral 0, Trusting 1+
    gap: 2, maxOpen: 3, expireDays: 3,             // matchdays between two new situations for one manager; how many may wait at once; how long one waits before it lapses (counts as no answer)
    bench: { after: 3, cooldown: 6, ovrGap: 9, promiseDays: [2, 3, 4], warmAt: 2 },       // matchdays on the bench before he asks; matchdays before the same player asks again; how close to the XI he must be; days you may promise; a callback story when this many days are left
    signing: { gap: 2, topN: 6, cooldown: 8 },     // a signing is a threat when he is this close to (or above) a top-N player in the same position
    party: { chance: 0.3, cooldown: 8, fine: 15, fineShare: 0.1, benchGames: 1 },   // a squad player seen partying before a big match (per team, per 8 matchdays); fine for a footballer is capped at a share of his wallet and goes to charity, not the manager
    comment: { cooldown: 2, perSeason: 4, perTarget: 1, lines: 4 },   // public comments: gap between two, season cap, per target manager per season
    desk: { perWeek: 1, queue: 4, queueLife: 3 }, // league stories get their own slot; extra ones wait in a short queue instead of being overwritten
    threads: { keep: 40, hist: 8 },
    react: { fol: 600 },                           // a footballer going public about a manager's decision
    // the footballers' market: invitations, gifts and memory
    invite: { dinnerMult: 1.5, bond: 4, fol: 600, maxOpen: 2, memory: 12 },   // a dinner costs this many dates; extra bond on top of a date; followers when it is a public night out
    gift: { tiers: { flowers: { price: 12, like: 5 }, watch: { price: 45, like: 11 }, jewel: { price: 120, like: 18 } }, perTarget: 3, perWeek: 2, fade: 0.5, cap: 30, fondQ: 300, accept: 0.3, noticeChance: 0.35, publicFol: 900, jealous: 14 },
    // WAG mode (Stage 1). Labelled defaults to tune: a WAG has no football income, a finite starting purse and a few capped ways to earn.
    wag: { startCoins: 400, startFol: 3000, startBrand: 10, startRapport: 10, age: 24,
      cost: { attend: 25, date: 60, dateNpc: 30, party: 40 },               // ticket (paid once, at kick-off); a date is paid only when it happens (the pool is cheaper than a footballer)
      content: { perSeason: 8, base: 30, folDiv: 4000, maxPay: 90, fol: 250, brandPay: 0.15, brand: 1 },   // the quick version of "make content": pay grows a little with followers and brand, capped
      party: { fol: 500, brand: 0 },                                         // the quick version of a night out (a sequence replaces it when there is no match)
      quiet: { bond: 3, rapport: 1 },                                        // a quiet night in: a little warmth with whoever you are seeing (or with the scene)
      npc: { pool: 3, mult: 0.2, rapport: 1 },                               // dating someone from the pool: followers worth this share of a date with a player, no brand
      brand: { max: 100, passiveDiv: 20 },                                   // brand points give passive coins each matchday (1 per this many points)
      biz: { base: 1, perLevel: 3, max: 5, income: 8, brandMult: 0.005 },             // progress per level, top level, coins per level per matchday, +0.5% per brand point
      atMatch: 0.5,                                                          // a content, party or business week spent at a match is a quick version worth this share
      seq: { slots: 2, slotsAt: 1, chance: 0.0016, cap: 0.1, focus: 1.25, focusP: 0.05 },   // picks per half (one if you are at the match); an action's chance rises by this per brand point (at most cap); actions in the category of your week's main thing are worth this much more
      attend: { meet: 0.3, target: 0.2, fame: 0.00002, fameCap: 0.1, win: 0.05, fol: 150, contactDays: 3, scene: 2 },   // meeting chance; bonus for naming someone; per follower; capped; supported team won; followers for a day out
      stars: [{ slug: "folarin-balogun", p: 0.6 }],                           // footballers who are often "on the scene": each matchday, this chance that they take one of the scene's places (if they are free)
      date: { good: 0.55, bondStart: 15, bondGood: 10, bondBad: 2, decayAfter: 2, decay: 4, end: 8, fol: 300, brand: 1, contactBonus: 0.15, accept: 0.38, rejRecover: 3, maxOpen: 3 },   // bond goes up with good dates and fades if you neglect it; the scene's regard adds a little to a date's score
      gift: { maxPerWeek: 2 },                                                // price, fade and caps come from social.gift
      gala: { toastFol: 400, jokeHit: 300, danceBond: 3 },
      story: { firstDate: 0.5 },
      // What a WAG can do while the match is on: a menu of actions, a few picks per half. Numbers only; the words are in engine/wagseq.js.
      // cat: content | party | business | friends. cost: coins to pay now. c f b r prog: coins, followers, brand, relationships (bond with whoever you see, else the scene's regard), business progress.
      // p: chance it works (brand helps a little); x: what happens when it does not; meet: a new contact when it works. An action can be used once per match.
      menu: [
        { id: "trend", cat: "content", cost: 0, c: 20, f: 300, p: 0.9, x: { f: 50 } },
        { id: "collab", cat: "content", cost: 0, c: 55, f: 100, b: 2, p: 0.65, x: { c: 10, b: -2 } },
        { id: "prank", cat: "content", cost: 0, f: 450, b: 1, r: -1, p: 0.6, x: { f: -150, b: -2, r: -2 } },
        { id: "kits", cat: "content", cost: 0, f: 350, b: 1, p: 0.8, x: { f: 60 } },
        { id: "fit", cat: "content", cost: 10, f: 250, b: 2, p: 0.85, x: { f: 50 } },
        { id: "vip", cat: "party", cost: 30, f: 500, b: 1, p: 0.8, x: { f: 100 } },
        { id: "karaoke", cat: "party", cost: 0, f: 300, r: 2, p: 0.7, x: { f: -100, b: -1 } },
        { id: "afterparty", cat: "party", cost: 25, f: 200, r: 2, p: 0.7, meet: 1, x: { f: 50 } },
        { id: "dance", cat: "party", cost: 0, f: 250, b: 1, p: 0.75, x: { f: 100 } },
        { id: "batch", cat: "business", cost: 20, prog: 1, p: 0.95, x: { prog: 0.5 } },
        { id: "bigorder", cat: "business", cost: 60, prog: 3, p: 0.7, x: {} },
        { id: "ads", cat: "business", cost: 25, f: 400, prog: 1, p: 0.8, x: { f: 100 } },
        { id: "investor", cat: "business", cost: 0, prog: 1, b: 2, p: 0.5, x: { b: -1 } },
        { id: "merch", cat: "business", cost: 15, c: 35, prog: 0.5, p: 0.8, x: { c: 10 } },
        { id: "gossip", cat: "friends", cost: 0, f: 50, r: 3, p: 0.9, x: { r: 1 } },
        { id: "playlist", cat: "friends", cost: 0, r: 4, p: 0.75, x: { r: -1 } },
        { id: "dog", cat: "friends", cost: 30, f: 600, b: 2, r: 1, p: 0.5, x: { f: 100 } },
        { id: "bath", cat: "friends", cost: 0, r: 1, p: 1, x: {} },
        { id: "predict", cat: "friends", cost: 0, f: 50, r: 2, p: 0.5, x: { r: -1 } },
      ] },
    // the gala
    gala: { prepSec: 40, liveSec: 55, endSec: 14, tableSize: 6, seatPerTarget: 2, dramaSeat: 0.7, boastFol: 800, maxStories: 3, toastTrust: 1, minUsers: 1, toastFol: 400, jokeHit: 300, sceneFol: 700, danceLove: 6, danceBond: 3 },
  },
  steroids: { chance: 0.22, stock: 1, price: 30, catchChance: 0.51, ban: 10, rumourAfter: 3 },   // cheap on purpose: the risk is the price. More than rumourAfter uncaught uses by one club in a season starts a rumour story
};

export function withParams(over = {}) {
  const deep = (a, b) => {
    const o = Array.isArray(a) ? a.slice() : { ...a };
    for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? deep(a[k] || {}, b[k]) : b[k];
    return o;
  };
  return deep(DEFAULT_PARAMS, over);
}
