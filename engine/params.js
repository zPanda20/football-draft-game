// Every tunable number in one place. Balance tests change these, never the code.
export const DEFAULT_PARAMS = {
  // ---- rating -> strength ----
  stretch: { centre: 80, k: 2.2, base: 50 },       // effective = base + (rating - centre) * k  (widens the 81-95 range)
  blendOvr: 0.5,                                    // a player's role score is this share OVR, the rest the role's stat mix

  // ---- position fit (see roster.js) ----
  fit: { perUnit: 0.055, lineUnit: 0.02, sideUnit: 0.03, floor: 0.45, gkInOutfield: 0.45, outfieldInGoal: 0.40, widthWeight: 0.7 },

  // ---- match ----
  match: {
    moments: 5,                                     // moments per half (the 52-second match has 2 halves)
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
    dialStrength: 1.0, dialClamp: 1.0,              // how hard weaker rosters are favoured in later packs
    needBoost: 1.6,                                 // weight for a striker / defender the team has none of yet
    gkOwnedWeight: 0.10, stOwnedWeight: 0.70, defOwnedWeight: 0.60, defOwnedAfter: 2,
    gkReserve: 3,                                   // keepers kept back for teams that still have none
    gkGuaranteeRounds: [4, 5, 6, 7, 8],
  },

  // ---- money ----
  money: {
    mvBase: 100, mvPerOvr: 0.157, mvAgeFrom: 30, mvAgePerYear: 0.05, mvAgeMin: 0.4, // market value = 100 * e^(0.157 (ovr-81)), older players cheaper
    lenMult: { 1: 1.0, 2: 1.7, 3: 2.4 },            // fee multiplier by contract length (placeholders)
    startCoins: 650,
    draftContract: 2,                               // fallback length of a contract won in the pack draft (no fee)
    draftContracts: [3, 3, 2, 2, 2, 1, 1, 1],       // by pack round: early picks get longer deals, so contracts end at different times
    resignMult: 0.75,                               // re-signing your own expiring player costs this share of the normal fee
    rookieContract: 3,
    extraCap: 2.0,                                  // extra coins count up to +200% of the minimum offer
    catchUp: 1.0,                                   // lottery weight 1 / (1 + catchUp * value / mean value)
    incomePerMatch: 45, incomeCatchUp: 0.35,        // base income per match; the lowest team earns +35% on top, the highest +0% (linear in table rank)
    winBonus: 10, drawBonus: 5,                     // paid on top of the base, win or draw
    rosterMax: 10, rosterMin: 6,
  },

  // ---- ageing, retirement, rookies ----
  age: {
    retire: { 36: 0.20, 37: 0.40, 38: 0.60, 39: 0.80, 40: 1.0 }, // chance by the age a player turns that off-season (40+ = certain)
    gkShift: 5,                                     // keepers are judged 5 years younger
    guaranteed: ["lionel-messi", "luka-modric", "cristiano-ronaldo", "marta"], // retire after the first season
    drift: { 21: 2.5, 22: 2.0, 23: 1.5, 24: 1.0, 25: 0.5, 28: 0, 29: -0.3, 30: -0.8, 31: -1.2, 32: -1.6, 33: -2.0, 34: -2.4, 35: -3.0 }, // mean OVR change at that age (linear between points)
    noise: 0.9,                                     // season-to-season randomness (OVR points)
    paceDecline: 1.4, phyDecline: 1.0, staAfter: 28, staPerYear: 0.8, // stat shape of decline
    potential: { low: 0.55, med: 1.0, high: 1.5 },  // multiplies the growth of a young player
  },
  rookies: { classSize: 34, placeholder: true },
  seasons: 4,                                       // default length of a game (needs one rookie class per off-season)
  trade: { maxAssets: 6, botMargin: 1.10 },

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
    itemCap: 2,                                     // items a created player can wear in one match
    cpuContract: 2,                                 // seasons on the deal a CPU team gives an unsigned player (no fee)
  },

  // ---- items ----
  items: { activeCap: 3 },
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
    trainGain: 0.15, trainStat: 0.7,                // overall points per Train hard (about 7 sessions per point); chance a stat moves too
    partnerParty: 0.3, partyLoveWithPartier: 3,     // a new partner is a party-er this often; partying with one costs no love life
    wada: 0.04, wadaBan: 2,                         // Party: chance of a flagged test, and the ban in matches
    sponsor: { per: 2000, cap: 40 },                // coins a matchday = followers / per, up to cap
    wedding: { dates: 10, cost: 60 },
    boringAt: 15, drunkAt: 5, sleepAt: 4, gymAt: 8, maxStories: 3, perWeek: 1,
    chance: { wild: 0.12, drunk: 0.2, proud: 0.1, monaco: 0.15, trouble: 0.12, fun: 0.1 },
  },
  // ---- season awards (Ballon d'Or weights add to 1; each part is measured against the best in the league) ----
  awards: { minShare: 0.5, gloveShare: 0.4, base: 6.0, ovrFloor: 60, weights: { rating: 0.30, contrib: 0.25, potm: 0.17, wins: 0.20, star: 0.08 } },
  steroids: { chance: 0.22, stock: 1, price: 300, catchChance: 0.51, ban: 10 },
};

export function withParams(over = {}) {
  const deep = (a, b) => {
    const o = Array.isArray(a) ? a.slice() : { ...a };
    for (const k of Object.keys(b || {})) o[k] = b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) ? deep(a[k] || {}, b[k]) : b[k];
    return o;
  };
  return deep(DEFAULT_PARAMS, over);
}
