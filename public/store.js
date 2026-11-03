// The item store: open between matches for managers (team coins) and created players (their own wallet).
import { st, esc, itemCard, coins, send } from "./core.js";
import { lifeShopTab } from "./life.js";

export const storeHandlers = { scout() { send({ t: "scout" }); } };
// A footballer has ONE shop: gear and boosters (the items) next to cars, houses, yachts, a plane and nightlife.
function playerShop(S) {
  const pm = S.pm, lf = pm.life, have = pm.coins, owned = pm.items || {}, stock = S.store.stock || {};
  const tabs = [["gear", "Gear & boosters"], ...st.cat.life.cats], tab = tabs.some(([k]) => k === (st.ui.shopTab || "gear")) ? st.ui.shopTab || "gear" : "gear";
  const list = st.cat.items.filter((i) => i.scope === "player" && (i.supply == null || (stock[i.id] || 0) > 0) && (!i.storeOnly || (stock[i.id] || 0) > 0));
  const one = (i) => `<div class="col" style="gap:6px;width:170px">${itemCard(i, { cls: i.storeOnly || i.supply != null ? "rare" : "" })}${i.supply != null ? `<div class="tiny" style="text-align:center;color:var(--acc)">⭐ One-of-a-kind pair, just in</div>` : ""}<button class="btn sm ${i.storeOnly ? "bad" : ""}" data-act="buyItem" data-id="${i.id}" ${have < i.price ? "disabled" : ""}>Buy · ${i.price}${owned[i.id] ? ` (have ${owned[i.id]})` : ""}</button></div>`;
  const rare = list.filter((i) => i.storeOnly || i.supply != null), boost = list.filter((i) => i.life), gear = list.filter((i) => !i.life && !i.storeOnly && i.supply == null);
  const gearTab = `${rare.length ? `<h4 class="shh">Just in</h4><div class="hand" style="justify-content:flex-start">${rare.map(one).join("")}</div>` : ""}
    <h4 class="shh">Boosters for your week <span class="tiny mute">used up automatically on the matching activity</span></h4><div class="hand" style="justify-content:flex-start">${boost.map(one).join("")}</div>
    <h4 class="shh">Match gear <span class="tiny mute">wear up to ${st.cat.rules.playerItemCap ?? 2} in a match</span></h4><div class="hand" style="justify-content:flex-start">${gear.map(one).join("")}</div>`;
  return `<div class="card shopcard"><div class="row wrap"><h3 style="margin:0">Shop</h3><div class="grow"></div><span>Your coins ${coins(have)}</span></div>
    <p class="small mute mt">Open between matches. Everything you buy is paid from your own wallet.</p>
    <div class="row wrap shoptabs mt" style="gap:6px">${tabs.map(([k, n]) => `<button class="btn sm ${tab === k ? "pri" : ""}" data-act="shopTab" data-tab="${k}">${esc(n)}</button>`).join("")}</div>
    <div class="mt">${tab === "gear" ? gearTab : lifeShopTab(S, tab)}</div></div>`;
}
export function storeCard(S) {
  if (!S.store || !S.store.open) return "";
  const mgr = S.me, pm = S.pm; if (!mgr && !pm) return "";
  if (!mgr && pm && pm.life) return playerShop(S);
  const have = mgr ? mgr.coins : pm.coins, owned = mgr ? mgr.items || {} : pm.items || {};
  const stock = S.store.stock || {};
  const list = st.cat.items.filter((i) => (i.supply == null || (stock[i.id] || 0) > 0) && (!i.storeOnly || (stock[i.id] || 0) > 0) && (mgr || i.scope === "player") && !(mgr && i.life));
  const rare = list.filter((i) => i.storeOnly || i.supply != null), ord = list.filter((i) => !i.storeOnly && i.supply == null);
  const one = (i) => `<div class="col" style="gap:6px;width:170px">${itemCard(i, { cls: i.storeOnly || i.supply != null ? "rare" : "" })}${i.supply != null ? `<div class="tiny" style="text-align:center;color:var(--acc)">⭐ One-of-a-kind pair, just in</div>` : ""}<button class="btn sm ${i.storeOnly ? "bad" : ""}" data-act="buyItem" data-id="${i.id}" ${have < i.price ? "disabled" : ""}>Buy · ${i.price}${owned[i.id] ? ` (have ${owned[i.id]})` : ""}</button></div>`;
  const sc = S.me && S.me.scout, scoutCard = sc ? `<div class="card" style="padding:12px 14px"><div class="row wrap"><b>🔭 Scouting network</b><span class="pill">${sc.level} / ${sc.cost.length}</span><div class="grow"></div>${sc.level < sc.cost.length ? `<button class="btn sm" data-act="scout" ${have < sc.cost[sc.level] ? "disabled" : ""}>Level ${sc.level + 1} · ${sc.cost[sc.level]}</button>` : `<span class="small mute">Full network</span>`}</div><p class="small mute" style="margin:6px 0 0">A long-term investment: every rookie-draft pack you open holds ${sc.level ? sc.level + " extra player" + (sc.level > 1 ? "s" : "") + " now" : "one more player per level"}, for the rest of the game.</p></div>` : "";
  return `${scoutCard}<div class="card"><div class="row wrap"><h3 style="margin:0">Item store</h3><div class="grow"></div><span>${mgr ? "Team coins" : "Your coins"} ${coins(have)}</span></div>
    <p class="small mute mt">Open between matches. ${mgr ? "Items go to the team; player items can be handed to a created player on your squad." : "Players' items are worn by you in the next match (equip them in your panel)."}</p>
    ${rare.length ? `<h3 class="mt">Just in</h3><div class="hand" style="justify-content:flex-start">${rare.map(one).join("")}</div>` : ""}
    <h3 class="mt">Always in stock</h3><div class="hand" style="justify-content:flex-start">${ord.map(one).join("")}</div></div>`;
}
