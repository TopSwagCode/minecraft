// High-level game bootstrap tying subsystems together (WIP modular refactor)
import { state } from './core/state.js';
import { HEX_SIZE, COLORS } from './core/constants.js';
import { startLoop, onUpdate, onRender } from './engine/loop.js';
import { updateAnimations } from './systems/animation.js';
import { updateDiamondRain } from './systems/diamondRain.js';
import { initBoard, drawBoard } from './view/board.js';
import { updateCardAnimations } from './view/handCanvas.js';
import { loadMap } from './maps/loader.js';
import { loadAllTextures, TextureRegistry } from '../textures.js';
import { attachInput } from './input/handlers.js';
import { drawCards, ensurePlayerState, handEmpty, updateHandUI } from './systems/cards.js';
import { classifyTerrain } from './utils/terrain.js';

// Temporary: map loading & texture assignment kept minimal here
function assignTextures(){ /* TODO: move texture rules into dedicated module */ }

function startTurn(options={}){
  const { delayDrawMs = 0 } = options;
  state.selectedPieceId = null;
  ensurePlayerState(state.currentPlayer);
  const pdata = state.playerData[state.currentPlayer];
  pdata.hand = []; pdata.selectedCard = null; state.handLayoutDirty = true;
  state.endTurnEnabled = false; // will be enabled after draw animations settle or when hand empties
  if (delayDrawMs > 0){
    setTimeout(()=>{ drawCards(state.currentPlayer, 3); }, delayDrawMs);
  } else {
    drawCards(state.currentPlayer, 3);
  }
  // Enable end turn button once cards are all landed (poll simple)
  setTimeout(()=>{ state.endTurnEnabled = true; }, delayDrawMs + 900);
  // Clear legacy hand container (no longer used)
  const handDiv = document.getElementById('hand'); if (handDiv) handDiv.innerHTML='';
  updateHandUI(); // no-op kept for compatibility
  // Auto-select the first available piece for the active player
  const first = state.pieces.find(p => p.player === state.currentPlayer);
  if (first) state.selectedPieceId = first.id;
}

export function endTurn(){
  const pdata = state.playerData[state.currentPlayer];
  const visibleCards = pdata ? [...pdata.hand] : [];
  if (!pdata || (visibleCards.length === 0 && state.pendingHandAdditions.length === 0)){
    state.currentPlayer = state.currentPlayer === 1 ? 2 : 1; state.turn++; startTurn({ delayDrawMs: 400 }); return;
  }
  // Include any pending (in-flight draw) cards: treat them as if they were in hand for discard
  const allCards = [...visibleCards, ...state.pendingHandAdditions];
  // Snapshot starting positions before clearing hand
  const canvas = document.getElementById('board');
  const startPositions = new Map();
  for (const c of visibleCards){
    const lay = state.handLayout.find(l => l.cardId === c.id);
    if (lay) startPositions.set(c.id, { x: lay.x, y: lay.y });
  }
  // Fallback for any pending cards (approx center)
  const fallback = { x: (canvas ? canvas.width/2 : 400) - 45, y: ((canvas ? canvas.height : 700) - 70) };
  // Immediately clear hand so cards are not rendered in two places
  pdata.hand = []; pdata.selectedCard = null; state.pendingHandAdditions = []; state.handLayoutDirty = true;
  const discardPos = state.pilePositions?.discard || { x: (canvas ? canvas.width - 100 : 800), y: (canvas ? canvas.height - 70 : 600) };
  const total = allCards.length;
  let completed = 0; const maxArc = 60;
  allCards.forEach((card, idx) => {
    const from = startPositions.get(card.id) || fallback;
    const spread = Math.min(70, 20 * total);
    const angle = (-spread/2) + (spread/(total-1||1))*idx;
    const to = { x: discardPos.x + (idx-total/2)*2, y: discardPos.y + (idx-total/2)*1.5 };
    state.cardAnimations.push({ id: card.id+'-discard-'+performance.now(), type:'discard', card, from, to, t:0, duration:420, startDelay: idx*70, arcHeight: maxArc * (0.3 + 0.7*Math.abs((idx-(total-1)/2)/((total-1)/2||1))), rotation: angle * Math.PI/180, onComplete: () => {
      pdata.discard.push(card);
      completed++;
      if (completed === total){
        setTimeout(()=>{
          state.currentPlayer = state.currentPlayer === 1 ? 2 : 1;
          state.turn++; startTurn({ delayDrawMs: 450 });
        }, 180);
      }
    }});
  });
}

// --- Background Music Management ---
function initMusicSystem(){
  // Defer actual playback until first user interaction (required by many browsers)
  const tryInitAudio = () => {
    if (state.music.audio) return; // already created
    const audio = new Audio();
    // Provide a default royalty-free style loop suggestion path; user can replace file
    audio.src = 'music/background.ogg'; // Ensure this file exists or replace path
    audio.loop = true;
    audio.volume = state.music.muted ? 0 : state.music.volume;
    state.music.audio = audio;
    if (state.music.enabled){
      audio.play().then(()=>{ state.music.playing = true; }).catch(()=>{/* ignored until user gesture */});
    }
  };
  const userGesture = () => {
    state.music.userInteracted = true;
    tryInitAudio();
    if (state.music.audio && state.music.enabled && !state.music.playing){
      state.music.audio.play().then(()=>{ state.music.playing=true; }).catch(()=>{});
    }
    window.removeEventListener('pointerdown', userGesture);
    window.removeEventListener('keydown', userGesture);
  };
  window.addEventListener('pointerdown', userGesture, { once:false });
  window.addEventListener('keydown', userGesture, { once:false });
}

export function toggleMusic(){
  if (!state.music.audio){
    // Force creation attempt (if user already interacted it'll succeed)
    const audio = new Audio();
    audio.src = 'music/background.mp3';
    audio.loop = true; audio.volume = state.music.muted ? 0 : state.music.volume;
    state.music.audio = audio;
  }
  state.music.enabled = !state.music.enabled;
  if (state.music.audio){
    if (state.music.enabled){
      state.music.audio.play().then(()=>{ state.music.playing=true; }).catch(()=>{});
    } else {
      state.music.audio.pause();
      state.music.playing = false;
    }
  }
}

export function toggleMute(){
  state.music.muted = !state.music.muted;
  if (state.music.audio){
    state.music.audio.volume = state.music.muted ? 0 : state.music.volume;
  }
}

function updateLoadingProgress(done, total){
  const pct = total === 0 ? 0 : Math.round((done/total)*100);
  const bar = document.getElementById('loadingBarFill');
  const label = document.getElementById('loadingPercent');
  if (bar) bar.style.width = pct + '%';
  if (label) label.textContent = pct + '%';
}

async function loadAssetsWithProgress(){
  // Collect sources (already registered). We'll load manually for progress.
  const entries = [...TextureRegistry.sources.entries()];
  let loaded = 0; updateLoadingProgress(0, entries.length);
  const promises = entries.map(([name, url]) => new Promise(res => {
    const img = new Image();
    img.onload = () => { TextureRegistry.images.set(name,img); loaded++; updateLoadingProgress(loaded, entries.length); res(); };
    img.onerror = () => { console.warn('Failed texture', name); loaded++; updateLoadingProgress(loaded, entries.length); res(); };
    img.src = url;
  }));
  await Promise.all(promises);
  TextureRegistry.loaded = true; state.texturesReady = true;
}

async function init(){
  initBoard();
  attachInput();
  initMusicSystem();
  const loadingEl = document.getElementById('loadingScreen');
  // Map + textures sequentially; could parallelize but keep progress semantics simple.
  try {
    await loadMap('maps/irregular_islands.json');
  } catch (e) { console.warn('Map load failed, continuing with empty board', e); }
  try {
    await loadAssetsWithProgress();
  } catch(e){ console.warn('Texture load issue', e); }
  // Small delay for aesthetic polish
  await new Promise(r => setTimeout(r, 250));
  if (loadingEl){ loadingEl.classList.add('fade-out'); setTimeout(()=>loadingEl.remove(), 600); }
  setupStartScreen();
  onUpdate(dt => { updateAnimations(dt); updateCardAnimations(dt); updateDiamondRain(dt, document.getElementById('board')); });
  onRender(() => drawBoard());
  startLoop();
}

window.addEventListener('DOMContentLoaded', init);

function setupStartScreen(){
  const el = document.getElementById('startScreen');
  if (!el){ startTurn({ delayDrawMs: 400 }); return; }
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
    if (state._fullResetOnStart){
      // Re-initialize board & pieces to ensure clean state
      (async ()=>{
        try { await loadMap('maps/irregular_islands.json'); } catch(e){ console.warn('Map reload failed', e); }
        state.turn = 1; state.currentPlayer = 1; state.selectedPieceId = null; state.winner = null; state.winButtons = [];
        state.playerData = {}; state.handLayout=[]; state.handLayoutDirty=true; state.pendingHandAdditions=[]; state.cardAnimations=[]; state.animatingCards.clear();
        state._fullResetOnStart = false;
        startTurn({ delayDrawMs: 500 });
      })();
    } else {
      // Delay card draw slightly so menu fade out finishes before animation
      startTurn({ delayDrawMs: 500 });
    }
  });
}
