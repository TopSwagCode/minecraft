import { state } from '../core/state.js';
import { HEX_DIRS, add, key } from '../core/hex.js';
import { terrainOfHex } from '../utils/terrain.js';

// Computes reachable destinations for selected piece & caches paths
export function computeReachable(piece){
  const pdata = state.playerData[state.currentPlayer];
  if (!pdata) return [];
  const selectedCard = pdata.selectedCard ? pdata.hand.find(c=>c.id===pdata.selectedCard) : null;
  const candidateCards = selectedCard ? [selectedCard] : [...pdata.hand];
  const occ = new Set(state.pieces.map(p => key(p.pos)));
  occ.delete(key(piece.pos));
  const destMap = new Map();
  for (const card of candidateCards){
    const maxRange = Math.max(1, card.range|0);
    const frontier = [{ c: piece.pos, depth: 0 }];
    const came = new Map(); came.set(key(piece.pos), null);
    while (frontier.length){
      const cur = frontier.shift();
      if (cur.depth === maxRange) continue;
      for (const d of HEX_DIRS){
        const nxt = add(cur.c, d); const k = key(nxt);
        if (!state.board.has(k) || occ.has(k) || came.has(k)) continue;
        const terr = terrainOfHex(nxt.q,nxt.r);
        // Allow entering 'diamond' special tile with ANY card (one step at a time)
        const isDiamond = terr === 'diamond';
        if (!isDiamond && terr !== card.terrain) continue;
        came.set(k, cur.c); const depth = cur.depth + 1;
        const path = [nxt]; let back = cur.c; while (back) { path.unshift(back); back = came.get(key(back)); }
        if (!destMap.has(k) || destMap.get(k).path.length > path.length){ destMap.set(k, { path, cardId: card.id, terrain: card.terrain, diamond: isDiamond }); }
        if (depth < maxRange) frontier.push({ c: nxt, depth });
      }
    }
  }
  if (piece.id === state.selectedPieceId){ state._reachableData = { map: destMap }; }
  return [...destMap.values()].map(v => v.path[v.path.length - 1]);
}
