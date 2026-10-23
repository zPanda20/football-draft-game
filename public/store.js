// The item store: open between matches for managers (team coins) and created players (their own wallet).
import { st, esc, itemCard, coins } from "./core.js";

export function storeCard(S) {
  if (!S.store || !S.store.open) return "";
  const mgr = S.me, pm = S.pm; if (!mgr && !pm) return "";
  const have = mgr ? mgr.coins : pm.coins, owned = mgr ? mgr.items || {} : pm.items || {};
  const stock = S.store.stock || {};
  const list = st.cat.items.filter((i) => i.supply == null && (!i.storeOnly || (stock[i.id] || 0) > 0) && (mgr || i.scope === "player"));
  const rare = list.filter((i) => i.storeOnly), ord = list.filter((i) => !i.storeOnly);
  const one = (i) => `<div class="col" style="gap:6px;width:170px">${itemCard(i, { cls: i.storeOnly ? "rare" : "" })}<button class="btn sm ${i.storeOnly ? "bad" : ""}" data-act="buyItem" data-id="${i.id}" ${have < i.price ? "disabled" : ""}>Buy · ${i.price}${owned[i.id] ? ` (have ${owned[i.id]})` : ""}</button></div>`;
  return `<div class="card"><div class="row wrap"><h3 style="margin:0">Item store</h3><div class="grow"></div><span>${mgr ? "Team coins" : "Your coins"} ${coins(have)}</span></div>
    <p class="small mute mt">Open between matches. ${mgr ? "Items go to the team; player items can be handed to a created player on your squad." : "Players' items are worn by you in the next match (equip them in your panel)."}</p>
    ${rare.length ? `<h3 class="mt">Just in</h3><div class="hand" style="justify-content:flex-start">${rare.map(one).join("")}</div>` : ""}
    <h3 class="mt">Always in stock</h3><div class="hand" style="justify-content:flex-start">${ord.map(one).join("")}</div></div>`;
}
