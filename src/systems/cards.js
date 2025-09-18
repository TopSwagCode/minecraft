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
    pdata.hand.push(pdata.deck.pop());
  }
}

export function consumeCard(cardId){
  const pdata = state.playerData[state.currentPlayer]; if (!pdata) return;
  const idx = pdata.hand.findIndex(c => c.id === cardId);
  if (idx >= 0){
    const [card] = pdata.hand.splice(idx,1);
    pdata.discard.push(card);
    if (pdata.selectedCard === card.id) pdata.selectedCard = null;
  }
}

export function handEmpty(){
  const pdata = state.playerData[state.currentPlayer];
  return !pdata || pdata.hand.length === 0;
}

export function updateHandUI(){
  const handDiv = document.getElementById('hand');
  const pdata = state.playerData[state.currentPlayer];
  if (!handDiv || !pdata) return;
  handDiv.innerHTML='';
  pdata.hand.forEach(card => {
    const btn = document.createElement('div');
    btn.className = 'card'; btn.dataset.type = card.terrain;
    if (pdata.selectedCard === card.id) btn.classList.add('selected');
    btn.innerHTML = `<span>${card.terrain}</span><span class="small">r${card.range}</span>`;
    btn.addEventListener('click', () => {
      pdata.selectedCard = (pdata.selectedCard === card.id) ? null : card.id;
      updateHandUI();
    });
    handDiv.appendChild(btn);
  });
}

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
