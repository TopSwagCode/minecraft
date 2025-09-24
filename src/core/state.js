// Central mutable game state object
export const state = {
  board: new Map(),
  pieces: [],
  currentPlayer: 1,
  selectedPieceId: null,
  turn: 1,
  animating: false,
  previewPath: null,
  texturesReady: false,
  hexTextureAssignments: new Map(),
  hexTerrain: new Map(),
  mapName: 'Default',
  boardShift: { q:0, r:0 },
  playerData: {},
  _reachableData: null,
  winner: null,
  camera: { x: 0, y: 0 }, // pixel offsets for panning
  zoom: 1, // board/piece scale
  minZoom: 0.5,
  maxZoom: 2.2,
  playerConfig: {
    1: { color: '#3b82f6', avatar: 'player-1', name: 'Player 1' },
    2: { color: '#ef4444', avatar: 'player-2', name: 'Player 2' }
  },
  // UI (canvas) card layout cache for click detection
  handLayout: [], // [{cardId,x,y,w,h}]
  hoverCardId: null,
  handLayoutDirty: true,
  cardAnimations: [], // {id,type,card,from:{x,y},to:{x,y},t,duration}
  pilePositions: { draw:{x:0,y:0}, discard:{x:0,y:0} },
  animatingCards: new Set(),
  pendingHandAdditions: [], // cards drawn but not yet landed
  endTurnEnabled: true,
  endTurnButton: { x: 0, y: 0, w: 140, h: 44 },
  winButtons: [], // populated when winner exists [{id,label,x,y,w,h}]
  hoverControl: null, // 'endTurn' or 'win:play-again' etc
  _fullResetOnStart: false,
  // Background music state
  music: {
    enabled: true,
    playing: false,
    userInteracted: false, // becomes true after first pointer interaction to satisfy autoplay policies
    volume: 0.5,
    audio: null,
    muted: false,
  },
  musicButton: { x:0, y:0, w:38, h:38 },
  // Settings UI state
  settings: {
    open: false,
    cardSize: 'medium', // small | medium | large
  },
  settingsButton: { x:0, y:0, w:38, h:38 },
  // Help / Rules overlay state
  help: {
    open: false,
  },
  helpButton: { x:0, y:0, w:38, h:38 },
  _helpInteractive: {
    closeButton: null, // {x,y,w,h}
    panelRect: null,
  },
  // Derived interactive regions for settings overlay (rebuilt each frame when open)
  _settingsInteractive: {
    cardSizeButtons: [], // {id,label,x,y,w,h}
    backButton: null, // {x,y,w,h}
    volumeSlider: { track:null, knob:null, dragging:false, value:0.5 },
    toStartButton: null,
    resumeButton: null,
    panelRect: null, // {x,y,w,h}
  },
};

// --- Settings persistence (localStorage)
// Stored under key 'hexGameSettings'
// Fields:
//   cardSize: 'small' | 'medium' | 'large'
//   volume: number (0..1)
//   muted: boolean
// Load early (after state import) in main game init to restore user preferences.
const SETTINGS_STORAGE_KEY = 'hexGameSettings';

export function loadPersistedSettings(){
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    if (typeof data.cardSize === 'string' && ['small','medium','large'].includes(data.cardSize)){
      state.settings.cardSize = data.cardSize;
    }
    if (typeof data.volume === 'number' && data.volume >=0 && data.volume <=1){
      state.music.volume = data.volume;
      // Sync slider default value
      state._settingsInteractive.volumeSlider.value = data.volume;
      if (state.music.audio) state.music.audio.volume = data.volume;
    }
    if (typeof data.muted === 'boolean'){
      state.music.muted = data.muted;
      if (state.music.audio) state.music.audio.muted = data.muted;
    }
  } catch(e){ /* ignore */ }
}

export function savePersistedSettings(){
  try {
    const payload = {
      cardSize: state.settings.cardSize,
      volume: state.music.volume,
      muted: state.music.muted,
    };
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  } catch(e){ /* ignore */ }
}
