// High-level game bootstrap tying subsystems together (WIP modular refactor)
import { state } from './core/state.js';
import { HEX_SIZE, COLORS } from './core/constants.js';
import { startLoop, onUpdate, onRender } from './engine/loop.js';
import { updateAnimations } from './systems/animation.js';
import { updateDiamondRain } from './systems/diamondRain.js';
import { initBoard, drawBoard } from './view/board.js';
import { loadMap } from './maps/loader.js';
import { loadAllTextures, TextureRegistry } from '../textures.js';
import { attachInput } from './input/handlers.js';
import { drawCards, ensurePlayerState, handEmpty, updateHandUI } from './systems/cards.js';
import { classifyTerrain } from './utils/terrain.js';

// Temporary: map loading & texture assignment kept minimal here
function assignTextures(){ /* TODO: move texture rules into dedicated module */ }

function startTurn(){
  state.selectedPieceId = null;
  ensurePlayerState(state.currentPlayer);
  const pdata = state.playerData[state.currentPlayer];
  pdata.hand = []; pdata.selectedCard = null;
  drawCards(state.currentPlayer, 3);
  document.getElementById('endTurnBtn').disabled = false;
  updateHandUI();
  // Auto-select the first available piece for the active player
  const first = state.pieces.find(p => p.player === state.currentPlayer);
  if (first) state.selectedPieceId = first.id;
}

function endTurn(){
  const pdata = state.playerData[state.currentPlayer];
  if (pdata){ pdata.discard.push(...pdata.hand); pdata.hand=[]; pdata.selectedCard=null; }
  state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
  state.turn++; startTurn();
}

async function init(){
  initBoard();
  attachInput();
  document.getElementById('endTurnBtn').addEventListener('click', endTurn);
  try {
    await loadMap('maps/irregular_islands.json');
  } catch (e) { console.warn('Map load failed, continuing with empty board', e); }
  // Load textures before first draw so board renders with images
  try { await loadAllTextures(); state.texturesReady = true; } catch(e){ console.warn('Texture load issue', e); }
  setupStartScreen();
  onUpdate(dt => { updateAnimations(dt); updateDiamondRain(dt, document.getElementById('board')); });
  onRender(() => drawBoard());
  startLoop();
}

window.addEventListener('DOMContentLoaded', init);

function setupStartScreen(){
  const el = document.getElementById('startScreen');
  if (!el){ startTurn(); return; }
  // Preset selectable colors
  const presetColors = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899'];
  // Build avatar tile lists from registry (player-* keys) or fallback pattern
  function buildAvatarGrid(){
    const keys = [...TextureRegistry.sources.keys()].filter(k => /^player-/.test(k));
    const list = keys.length ? keys : ['player-1','player-2'];
    for (const pid of [1,2]){
      const container = document.getElementById(`p${pid}AvatarList`);
      const hidden = document.getElementById(`p${pid}AvatarValue`);
      if (!container || !hidden) continue;
      container.innerHTML='';
      list.forEach(k => {
        const div = document.createElement('div');
        div.className='avatar-item';
        const imgEl = document.createElement('img');
        // Use loaded image or resolve src from registry sources
        let src = null;
        if (TextureRegistry.images.has(k)) src = TextureRegistry.sources.get(k);
        else src = TextureRegistry.sources.get(k) || `src/assets/images/players/${k.replace('player-','player')}.png`;
        imgEl.src = src;
        imgEl.alt = k;
        div.appendChild(imgEl);
        if (state.playerConfig[pid].avatar === k) div.classList.add('selected');
        div.addEventListener('click', () => {
          hidden.value = k;
          state.playerConfig[pid].avatar = k; // live preview
          // clear selection
          container.querySelectorAll('.avatar-item').forEach(it=>it.classList.remove('selected'));
            div.classList.add('selected');
        });
        container.appendChild(div);
      });
      hidden.value = state.playerConfig[pid].avatar;
    }
  }
  buildAvatarGrid();
  function buildColorPickers(){
    for (const pid of [1,2]){
      const listEl = document.getElementById(`p${pid}ColorList`);
      const hidden = document.getElementById(`p${pid}ColorValue`);
      if (!listEl || !hidden) continue;
      listEl.innerHTML='';
      presetColors.forEach(col => {
        const div = document.createElement('div');
        div.className='color-item';
        div.style.setProperty('--c', col);
        if (hidden.value.toLowerCase() === col.toLowerCase()) div.classList.add('selected');
        div.title = col;
        div.addEventListener('click', () => {
          hidden.value = col;
          state.playerConfig[pid].color = col; // live preview
          listEl.querySelectorAll('.color-item').forEach(it=>it.classList.remove('selected'));
          div.classList.add('selected');
        });
        listEl.appendChild(div);
      });
    }
  }
  buildColorPickers();
  const form = document.getElementById('playerSetupForm');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const data = new FormData(form);
    for (const pid of [1,2]){
      state.playerConfig[pid].color = data.get(`p${pid}Color`) || state.playerConfig[pid].color;
      state.playerConfig[pid].avatar = data.get(`p${pid}Avatar`) || state.playerConfig[pid].avatar;
    }
    el.classList.add('hidden');
    startTurn();
  });
}
