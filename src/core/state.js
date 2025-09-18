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
  playerConfig: {
    1: { color: '#3b82f6', avatar: 'player-1' },
    2: { color: '#ef4444', avatar: 'player-2' }
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
};
