import { state } from '../core/state.js';
import { axialDistance, key } from '../core/hex.js';
import { classifyTerrain } from '../utils/terrain.js';
import { PIECES_PER_SIDE } from '../core/constants.js';

export async function loadMap(path){
  const res = await fetch(path, { cache:'no-cache' });
  if (!res.ok) throw new Error('Map load failed '+path);
  const data = await res.json();
  applyMapData(data);
}

function applyMapData(map){
  state.board = new Map();
  if (Array.isArray(map.cells) && map.cells.length){
    for (const c of map.cells){ if (typeof c.q==='number' && typeof c.r==='number'){ state.board.set(key({q:c.q,r:c.r}), { q:c.q, r:c.r }); } }
  } else if (Array.isArray(map.layout)) {
    buildBoardFromLayout(map);
  } else if (typeof map.radius === 'number') {
    generateRadius(map.radius);
  }
  state.hexTextureAssignments.clear(); state.hexTerrain.clear();
  if (Array.isArray(map.layout) && map.legend){
    for (const h of state.board.values()){
      if (h._symbol && map.legend[h._symbol] && map.legend[h._symbol].tex){
        state.hexTextureAssignments.set(key(h), map.legend[h._symbol].tex);
        state.hexTerrain.set(key(h), classifyTerrain(map.legend[h._symbol].tex));
      }
    }
    state.texturesReady = true; // textures assumed referenced by external loader
  } else {
    // Fallback procedural rings based on distance (similar to legacy)
    const center = { q:0, r:0 };
    for (const h of state.board.values()){
      const dist = axialDistance(center, h);
      let tag = 'grass'; if (dist <= 1) tag = 'water'; else if (dist >= 4) tag = 'sand';
      state.hexTextureAssignments.set(key(h), `hello-${tag}`);
      state.hexTerrain.set(key(h), classifyTerrain(tag));
    }
    state.texturesReady = true;
  }
  state.mapName = map.name || 'Unnamed Map';
  computeBoardShift();
  if (map.pieces && map.pieces.p1 && map.pieces.p2) {
    let id = 1;
    state.pieces = [
      ...map.pieces.p1.map(c => ({ id: id++, player:1, pos:{ q:c.q, r:c.r } })),
      ...map.pieces.p2.map(c => ({ id: id++, player:2, pos:{ q:c.q, r:c.r } })),
    ];
  } else {
    // Spawn heuristic if not provided
    spawnPieces();
  }
}

function buildBoardFromLayout(map){
  const layout = map.layout;
  for (let row=0; row<layout.length; row++){
    const line = layout[row];
    for (let col=0; col<line.length; col++){
      const ch = line[col]; if (ch===' ' || ch==='.' || ch==='\t') continue;
      const r = row; const q = col - ((row + (row & 1)) >> 1);
      state.board.set(key({q,r}), { q, r, _symbol: ch });
    }
  }
}

function generateRadius(radius){
  const center = { q:0, r:0 };
  for (let q=-radius; q<=radius; q++){
    for (let r=-radius; r<=radius; r++){
      const c = { q,r }; if (axialDistance(center,c) <= radius){ state.board.set(key(c), c); }
    }
  }
}

function computeBoardShift(){
  const qs = [], rs=[]; for (const h of state.board.values()){ qs.push(h.q); rs.push(h.r); }
  if (!qs.length){ state.boardShift = { q:0, r:0 }; return; }
  const minQ = Math.min(...qs), maxQ = Math.max(...qs); const minR = Math.min(...rs), maxR = Math.max(...rs);
  state.boardShift = { q: (minQ + maxQ)/2, r: (minR + maxR)/2 };
}

function spawnPieces(){
  // Simple heuristic: choose lowest r values for Player1, highest r for Player2
  const hexes = [...state.board.values()];
  hexes.sort((a,b)=>a.r-b.r);
  const p1 = hexes.slice(0, PIECES_PER_SIDE);
  const p2 = hexes.slice(-PIECES_PER_SIDE);
  let id = 1;
  state.pieces = [
    ...p1.map(c=>({ id: id++, player:1, pos:{ q:c.q, r:c.r } })),
    ...p2.map(c=>({ id: id++, player:2, pos:{ q:c.q, r:c.r } })),
  ];
}
