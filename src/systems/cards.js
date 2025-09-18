import { state } from '../core/state.js';
import { CARD_TYPES } from '../core/constants.js';

// Deck definition now uses card objects: { terrain:'grass'|'sand'|'water', range:number, id:string }
// Starting deck specification (order will be shuffled):
// 2x Grass range 2, 2x Grass range 1, 2x Sand range 1, 2x Water range 1
const STARTING_CARDS = [
  { terrain:'grass', range:2 }, { terrain:'grass', range:2 },
  { terrain:'grass', range:1 }, { terrain:'grass', range:1 },
  { terrain:'sand', range:1 }, { terrain:'sand', range:1 },
  { terrain:'water', range:1 }, { terrain:'water', range:1 },
];

let _cardUid = 1;
function withIds(list){ return list.map(c => ({ ...c, id: 'c'+(_cardUid++) })); }

function awaitImportHandHelpers(){
  // Attempt to access exported function from loaded module (already parsed by browser module graph)
  try {
    // eslint-disable-next-line no-undef
    if (window && window.__HAND_HELPERS__){ return window.__HAND_HELPERS__; }
  } catch(_) {}
  return {};
}

function createShuffledDeck(){
  const arr = withIds(STARTING_CARDS);
  for (let i = arr.length -1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function ensurePlayerState(player){
  if (!state.playerData[player]){
    state.playerData[player] = { deck: createShuffledDeck(), discard: [], hand: [], selectedCard: null };
  }
}

export function drawCards(player, n){
  ensurePlayerState(player);
  const pdata = state.playerData[player];
  for (let i=0;i<n;i++){
    if (pdata.deck.length === 0){
      pdata.deck = createShuffledDeck();
    }
    const card = pdata.deck.pop();
    state.pendingHandAdditions.push(card);
    const canvas = document.getElementById('board');
    if (canvas){
      // Compute intended final slot based on current hand + pending prior to this card
      const futureCount = pdata.hand.length + state.pendingHandAdditions.length; // after all pending
      const index = pdata.hand.length + state.pendingHandAdditions.length - 1; // zero-based
      // Lazy import helper (to avoid circular, rely on global function if loaded)
      const { computeHandSlot } = awaitImportHandHelpers();
      let target = { x: (canvas.width/2)-45, y: canvas.height - 70 };
      if (computeHandSlot){ target = computeHandSlot(futureCount, index, canvas); }
      const from = state.pilePositions?.draw || { x: 10, y: target.y };
  const startDelay = i * 110; // stagger
  state.cardAnimations.push({ id: card.id+'-draw-'+performance.now(), type:'draw', card, from, to: target, t:0, duration:480, startDelay, arcHeight: 40, onComplete: () => {
        // Move from pending to real hand
        const idx = state.pendingHandAdditions.findIndex(c => c.id === card.id);
        if (idx !== -1){
          const [c] = state.pendingHandAdditions.splice(idx,1);
          pdata.hand.push(c);
          state.handLayoutDirty = true;
        }
      }});
      state.animatingCards.add(card.id);
    } else {
      // Fallback: no canvas yet, add immediately
      pdata.hand.push(card);
    }
  }
  state.handLayoutDirty = true;
}

export function consumeCard(cardId){
  const pdata = state.playerData[state.currentPlayer]; if (!pdata) return;
  const idx = pdata.hand.findIndex(c => c.id === cardId);
  if (idx >= 0){
    const [card] = pdata.hand.splice(idx,1);
    pdata.discard.push(card);
    // Animate discard (approx from old layout position to discard pile)
    const canvas = document.getElementById('board');
    if (canvas){
      const lay = state.handLayout.find(l => l.cardId === card.id);
      const from = lay ? { x: lay.x, y: lay.y } : { x: canvas.width/2 - 45, y: canvas.height - 70 };
      const to = state.pilePositions?.discard || { x: canvas.width - 100, y: canvas.height - 70 };
      state.cardAnimations.push({ id: card.id+'-discard-'+performance.now(), type:'discard', card, from, to, t:0, duration:380 });
      state.animatingCards.add(card.id);
    }
    if (pdata.selectedCard === card.id) pdata.selectedCard = null;
    state.handLayoutDirty = true;
  }
}

export function handEmpty(){
  const pdata = state.playerData[state.currentPlayer];
  return !pdata || pdata.hand.length === 0;
}

// Legacy no-op: DOM hand UI removed; rendering handled in view/canvasHand.js
export function updateHandUI(){ /* kept for backward compatibility */ }

export function canEnterTerrain(terrain){
  const pdata = state.playerData[state.currentPlayer]; if (!pdata) return false;
  if (terrain === 'mountain' || terrain === 'unknown') return false;
  if (pdata.selectedCard){
    const card = pdata.hand.find(c => c.id === pdata.selectedCard);
    return !!card && card.terrain === terrain;
  }
  return pdata.hand.some(c => c.terrain === terrain);
}

export function currentSelectedCard(){
  const pdata = state.playerData[state.currentPlayer]; if (!pdata) return null;
  return pdata.hand.find(c => c.id === pdata.selectedCard) || null;
}
export { CARD_TYPES };
