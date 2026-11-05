# Football Draft Game

Browser multiplayer 6-a-side football draft game, for a room full of laptops. Same architecture as the Driver Draft Game: one authoritative Node process, `ws` WebSockets, a vanilla JS client (no build step) and a pure, deterministic engine.

## Run it

```
npm install
npm start            # http://localhost:3000  (PORT and DATA_DIR are read from the environment)
```

Open the page, create a game, share the 4-letter code. `/screen?room=CODE` is the big-screen view with no controls.

## What is in it

- **Lobby**: up to 30 people. Each one either manages a club or plays as a footballer. Computer clubs fill the league to the minimum (always an even number; 17 to 19 become 20).
- **Pack draft**: 8 packs of 5, simultaneous picks, no overlapping hands, a headliner in every first pack, a dial that helps weaker rosters, a keeper guarantee.
- **Money**: 650 start coins, 45 base income per matchday plus a catch-up share for teams low in the table and +10 for a win or +5 for a draw (shown as a small animation after full time). Draft contracts run 3/3/2/2/2/1/1/1 years by pack round; re-signing your own player costs 75% of the normal fee.
- **Market**: a market-value lottery for free agents and items (offer at least market value times the contract multiplier, extra coins raise your tickets, only the winner pays).
- **Season**: round-robin, 3-1-0 table. Each match is two simulated halves with a half-time window for substitutions, formation and items. Live momentum and possession graphs, a results screen with every scorer and minute, a Player of the Match for every game, season stats for every player (goals, assists, chances created, shots, xG, tackles, interceptions, saves, clean sheets, wins, average rating, POTM awards), end-of-season awards (Ballon d'Or, Golden Boot, Playmaker, Golden Glove), a substitution plan managers set between matches that runs at half-time unless overridden, and an item store that is open between matches (with rare Steroids, and Ice Baths for post-match stamina).
- **Off-season**: retirements, ageing, re-signing, the rookie pack draft (worst team first: open a pack of three and keep one, take a leftover, or abstain; unopened rookies wait a year without ageing), a trade window, then free agency. The History card holds the all-time table and every past season.
- **Lite mode** (per person): the club plays like a CPU club for whatever is switched off (XI, half-time changes, re-signing, trades, stats). No bonus, no softer economy; `npm run lite` prints the numbers. A "?" button opens the start guide on every screen.
- **Player mode**: a person creates a footballer (rolled numbers, 81 to 86 overall), grows him with career cards, takes offers from managers and computer clubs, and chooses push or conserve at half-time.
- **Social layer** (lobby switch "Social events"): managers pick an optional style (Straight talker, Diplomat, Showman) and carry one trust meter per player (Bitter / Wary / Neutral / Trusting; players are Calm, Proud, Loyal or Restless). Situations arrive in an inbox that never blocks a match: a benched player asks for minutes, a player objects to a signing, a night out before a big match, a rival's public jab. Every option shows its consequence first. Promises are tracked (kept, broken, void) and enforced in the line-up. Public comments (predict, jab, praise) use fixed lines with cooldowns and a season cap. News carries a tag (confirmed / rumour / statement), follow-up stories hang on a thread, and results are never mentioned before full time. League stories have their own weekly slot and a short queue, so scandals and league news do not overwrite each other. Code: `engine/social.js`, `engine/situations.js`, `server/social.js`.
- **Deeper dating** (same switch, footballers only): dinner invitations to listed people (they pick at most one invitation per matchday, losers are not charged and are told), competing date requests between footballers, gifts (flowers, watch, jewel; private by default, can be noticed, can be made public, limited per week and per season), and relationship memory (exes, turned-down invitations, rival suitors). Managers are never part of dating. Code: `engine/market2.js`, `engine/life.js`, `engine/romance.js`.
- **Mid-season gala** (lobby switch "Gala dinner", on by default; old saves default to off): one dinner per season for every connected manager and footballer after the first half of the fixtures. A preparation window (footballers invite one date, everyone can ask for a seat beside someone: at most two requests per guest are honoured and the organisers seat people with real history together), then one main interaction each (toast, boast, make peace, confront, talk shop, and for footballers only a dance), then a roundup (at most three stories). Anything that needs another person waits for their answer; unanswered means nothing happens. Idle, disconnected and Auto players never block it. Code: `engine/gala.js`, `server/gala.js`, `public/social.js`.
- **WAG mode** (a third role in the lobby): a WAG is a person in the dating market, not a footballer: no club, squad place, contract, wages, training, injuries or packs, and never a human manager for league size. Each matchday, in the line-up window, a WAG makes up to two separate choices. (1) **One main thing**: a date, go out partying, a quiet night in, shoot content or build a business (no training). (2) **A match** (optional): a ticket (paid once at kick-off), a team to support and an optional player to hope to meet; it is frozen at kick-off and resolves once after full time with its own seeded RNG (a chance of a contact for the NEXT matchday only). A date draws from a pool: three people who are not players each matchday (the same dating partners footballers meet, cheaper, hardly any effect on status), plus footballers once you have their number, footballers on the scene, anyone you are seeing, and human footballers (who must say yes: the first yes counts, others are told and not charged). Roster footballers settle invitations like dinners (best score wins; losers not charged). Players appear in the pool with their player cards, others with their portrait. **While the matches are on**, a WAG who did not choose a match and picked content, a night out or business gets two short choices on the match timers: one open in the first half, one from half-time to full time. Each is a small decision (cost, coins, followers, brand, relationships, business progress, sometimes a new number) with a chance that depends a little on brand. Unanswered choices are made for the WAG (the safe option, never one they cannot pay for) at half-time and before the result is public, so nothing ever waits for a WAG, and everyone returns to the menu together. A WAG who goes to a match gets a quick, half-value version of the week's activity instead. Brand pays a little each matchday; a business is built level by level and pays every matchday. A WAG can view every team's roster as player cards. Gifts are private by default. WAG gossip is only ever a rumour or a plain item, never a footballer's club scandal. WAGs join the gala, join late, reconnect, can be on Auto, idle or disconnected without holding any match, and a room of WAGs alone still plays. Code: `engine/wag.js` (rules), `engine/wagseq.js` (the words of the match-time choices), `server/wag.js`, `public/wag.js`, with small adapters in `engine/gala.js`, `server/usermode.js` and `server/room.js` (half-time and full-time hooks). Not built yet (stages 2 to 4): incidents and evidence, WAGsnark, rivalries, the off-season villa, financial stories, gold-digger plots, manager affairs and pregnancy. Parameters are labelled defaults in `engine/params.js` (`social.wag`, including `seqs` for every match-time option).
- **Thunder plate portraits**: a plate of kind `portrait` in `data/unlocks.json` unlocks photos (files in `public/assets/portraits/`) that a footballer or a WAG can wear as their profile picture. The server only accepts a portrait once its plate is unlocked. The "Inner Circle" plate holds eight; the files carry neutral names on purpose.
- Idle and disconnected managers are handled (the room stops waiting for them), pace voting, pause and skip for the host, checkpoints saved to `DATA_DIR` and restored on restart.

## Layout

```
engine/    pure game rules (no I/O): params, roster/fit/ratings, match, fixtures, packs, market, bots,
           offseason (retire, age, re-sign, rookies), trade, playermode
server/    room state machine (room.js, offseason.js, usermode.js), WebSocket entry (index.js), static catalogue (describe.js)
public/    the browser client (app.js, draft.js, market.js, match.js, off.js, pm.js, core.js, style.css)
data/      players.json, rookies.json, items.json, teams.json
tests/     invariants (run_all.js), end-to-end over WebSockets (e2e.js, pm_e2e.js), balance simulations
tools/     build_players.py (spreadsheet to players.json), gen_placeholder_rookies.py
```

Team art (badge, wallpaper, home/away/third kits) is dropped into `public/assets/teams/<club>/`; see the README there, and `npm run assets` for what is missing.

Player portraits go in `public/assets/players/`, named after the player's `slug` in `data/players.json` (e.g. `kylian-mbappe.png`; png, webp, svg or jpg). A card shows the portrait in place of the initials; a transparent cutout of the head and shoulders works best, roughly square. Reload the page after adding files. Photos for footballers a person creates in the lobby are separate: those go in `public/assets/faces/`.

Boot-maker logos are white shapes in `public/assets/brands/<id>.png`; the client paints them in the user's club colours (deals) or with the card texture of the boot's quality (items). Newspaper and magazine mastheads are in `public/assets/sources/<id>.png` (sun, athletic, telegraph, lequipe, gq, bazaar, vogue).

Card textures are `public/assets/cards/ruby.jpg` (90+), `gold.jpg` (85 to 89), `silver.jpg` and `legend.jpg` (reserved for the legends draft); the old gradients show underneath if a file is missing.

All tunable numbers live in `engine/params.js`. Balance tests change those, never the code.

## Tests and balance checks

```
npm test                         # fast invariant tests, social layer (tests/social_unit.js), gala (tests/gala_unit.js), WAG rules (tests/wag_unit.js, tests/wag_week.js) and the Inner Circle portrait plate (tests/portrait_plate.js)
npm run e2e                      # real server, WebSocket clients, two seasons incl. off-season, player mode, late join and the gala in five room shapes (tests/gala_e2e.js), plus six WAG room shapes (tests/wag_e2e.js) and a restart from both checkpoints (tests/wag_restore_e2e.js)
node tests/wag_browser.cjs       # Playwright: a WAG and a footballer in real browsers (needs Playwright; PLAYWRIGHT=/path/to/playwright)
node tests/wag_week_browser.cjs  # Playwright: the WAG week (activity cards, date pool with portraits, rosters as player cards, match-time choices)
node tests/portrait_browser.cjs  # Playwright: the three codes, every plate portrait loads and can be worn by a footballer and a WAG
node tests/t1_titles.js 300 20   # title odds by roster strength (targets: strongest ~30%, top third ~70% in a 20-team league)
node tests/tank.js 100 10 3      # does losing season 1 on purpose pay?
node tests/seasons.js            # multi-season supply and strength drift
```

`TEST_SPEED=10` divides every server timer, which is how the end-to-end tests run a season in seconds.

## Data still to come

- Real STA column (every player is 80 for now), final rookie classes (the five in `data/rookies.json` are generated placeholders), final item list.
- Rebuild the player file: `python3 tools/build_players.py <xlsx> data/players.json`.
