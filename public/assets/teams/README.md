# Team art

One folder per club (the folder name is the club's `slug` in `data/teams.json`). Drop files in with these names:

| File | Used for |
|------|----------|
| `badge.png` | crest everywhere: tables, fixtures, club picker, and the small badge on player cards in the pack draft |
| `wallpaper.jpg` | page background while you manage (or pick) that club, lightly tinted |
| `kit-home.png` | home kit: lobby preview, line-up header, home side of the live match |
| `kit-away.png` | away kit: lobby preview, away side of the live match |
| `kit-third.png` | third kit: lobby preview, and the kit a side changes into when its colours clash with the opponent's |

`png`, `webp`, `svg`, `jpg` and `jpeg` all work. Transparent PNG or SVG is best for badges and kits. Reload the page after adding files; no restart needed.

A throwback or alt club (e.g. `juventus-throwback`) with no badge or wallpaper of its own borrows the main club's.
An alt marked `"kitsFrom": "base"` in `data/teams.json` (`psg-twd`, `inter-vr46`) is only a new **away kit**: its folder holds just `kit-away.png`, and the home kit, third kit, badge and wallpaper are the main club's.

**Colours follow the kits:** in `data/teams.json`, `c1` is the home kit's colour, `c2` the away kit's and `c3` the third kit's (set `c3` when you add a third kit). A match is drawn in the colours of the kits the two sides wear. If they are too close, the away side changes into its third kit, else the home side does, else the pair of kits that sit furthest apart is used.
Player cards match on the real club name (see `aliases` in `data/teams.json`): a card for a player at Real Madrid shows the `real-madrid` badge.
Run `npm run assets` to see what is still missing.
