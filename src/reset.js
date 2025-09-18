import { state } from './core/state.js';
import { loadMap } from './maps/loader.js';
import { drawCards, ensurePlayerState } from './systems/cards.js';
import { startLoop } from './engine/loop.js';

export async function resetGameKeepSetup(){
  // Preserve playerConfig
  const cfg = JSON.parse(JSON.stringify(state.playerConfig));
  const mapName = state.mapName;
  state.board = new Map();
  state.hexTextureAssignments.clear(); state.hexTerrain.clear();
  state.playerData = {}; state.pieces = []; state.turn = 1; state.currentPlayer = 1; state.selectedPieceId = null;
  state.previewPath = null; state._reachableData = null; state.winner = null;
  state.handLayout = []; state.handLayoutDirty = true; state.pendingHandAdditions = []; state.cardAnimations = []; state.animatingCards.clear();
  state.playerConfig = cfg;
  try { await loadMap('maps/irregular_islands.json'); } catch(e){ console.warn('Map reload failed', e); }
  ensurePlayerState(1); ensurePlayerState(2);
  // Start first turn draw after short delay
  drawCards(state.currentPlayer, 3);
  state.endTurnEnabled = false; setTimeout(()=>{ state.endTurnEnabled = true; }, 800);
}

export function showStartScreenAgain(){
  const el = document.getElementById('startScreen');
  if (!el) return;
  el.classList.remove('hidden');
  state.winner = null; state.winButtons = []; state.cardAnimations = []; state.pendingHandAdditions = []; state.handLayout = []; state.handLayoutDirty = true;
  state._fullResetOnStart = true;
}
