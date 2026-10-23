// Every tunable number in one place. Balance tests change these, never the code.
export const DEFAULT_PARAMS = {
  // ---- rating -> strength ----
  stretch: { centre: 80, k: 2.2, base: 50 },       // effective = base + (rating - centre) * k  (widens the 81-95 range)
  blendOvr: 0.5,                                    // a player's role score is this share OVR, the rest the role's stat mix

  // ---- position fit (see roster.js) ----
  fit: { perUnit: 0.055, floor: 0.45, gkInOutfield: 0.45, outfieldInGoal: 0.40, widthWeight: 0.7 },

  // ---- match ----
  match: {
    moments: 5,                                     // moments per half (the 52-second match has 2 halves)
    possK: 0.035,                                   // possession swing per control-point difference
    shotBase: 0.9, shotK: 0.028,                    // chance a possession becomes a shot
    goalBase: -0.35, goalK: 0.030,                  // chance a shot beats the keeper
    formSigma: 3.0,                                 // per-match form noise on every team rating, in effective points
    momentSigma: 3.0,                               // extra noise inside each moment
  },

  // ---- stamina ----
  stamina: {
    drainPerHalf: 27,                               // at STA 50 -> 27 * (1.5 - STA/100) per half
    gkDrain: 0.5,                                   // keepers tire at half the rate
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
    gkOwnedWeight: 0.10, stOwnedWeight: 0.70, defOwnedWeight: 0.60, defOwnedAfter: 2,
    gkReserve: 3,                                   // keepers kept back for teams that still have none
    gkGuaranteeRounds: [5, 6],
  },

  // ---- money ----
  money: {
    mvBase: 100, mvPerOvr: 0.157, mvAgeFrom: 30, mvAgePerYear: 0.05, mvAgeMin: 0.4, // market value = 100 * e^(0.157 (ovr-81)), older players cheaper
    lenMult: { 1: 1.0, 2: 1.7, 3: 2.4 },            // fee multiplier by contract length (placeholders)
    startCoins: 450,
    draftContract: 2,                               // seasons on a contract won in the pack draft (no fee)
    rookieContract: 3,
    extraCap: 2.0,                                  // extra coins count up to +200% of the minimum offer
    catchUp: 1.0,                                   // lottery weight 1 / (1 + catchUp * value / mean value)
    incomePerMatch: 20, incomeCatchUp: 0.25,        // base income per match; lowest team earns +25%, highest -0% (linear in table rank)
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
