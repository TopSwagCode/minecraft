import { state } from '../core/state.js';
import { roundAxial, key } from '../core/hex.js';
import { computeReachable } from '../systems/movement.js';
import { terrainOfHex } from '../utils/terrain.js';
import { canEnterTerrain, consumeCard, handEmpty, updateHandUI } from '../systems/cards.js';
import { animateMove } from '../systems/animation.js';
import { hasAnyMoves, getCanvas, pixelToAxial } from '../view/board.js';
import { handleCardPointer } from '../view/handCanvas.js';

export function attachInput(){
  const canvas = getCanvas();
  canvas.addEventListener('click', onClick);
  canvas.addEventListener('mousemove', onMove);
  canvas.addEventListener('mouseleave', () => { state.previewPath = null; });
  // Camera panning via drag (middle or right mouse, or hold space + left)
  canvas.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onDragMove);
  canvas.addEventListener('contextmenu', e => { if (dragState.active) { e.preventDefault(); } });
  // Touch controls
  canvas.addEventListener('touchstart', onTouchStart, { passive:false });
  canvas.addEventListener('touchmove', onTouchMove, { passive:false });
  canvas.addEventListener('touchend', onTouchEnd, { passive:false });
  canvas.addEventListener('touchcancel', onTouchCancel, { passive:false });
}

let dragState = { active:false, startX:0, startY:0, camX:0, camY:0, button:0 };
let touchState = { tracking:false, moved:false, startX:0, startY:0, lastX:0, lastY:0, camX:0, camY:0, lastTapTime:0, longPress:false, longPressTimer:null };
const TAP_MOVE_TOLERANCE = 14; // px tolerance for distinguishing tap vs pan

function isPanningTrigger(evt){
  return evt.button === 1 || evt.button === 2 || (evt.button === 0 && (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey));
}

function onMouseDown(evt){
  if (!isPanningTrigger(evt)) return;
  dragState.active = true; dragState.startX = evt.clientX; dragState.startY=evt.clientY;
  dragState.camX = state.camera.x; dragState.camY = state.camera.y; dragState.button = evt.button;
  evt.preventDefault();
}
function onMouseUp(evt){
  if (dragState.active){ dragState.active=false; }
}
function onDragMove(evt){
  if (!dragState.active) return;
  const dx = evt.clientX - dragState.startX; const dy = evt.clientY - dragState.startY;
  state.camera.x = dragState.camX + dx; state.camera.y = dragState.camY + dy;
}

// --- Touch Support ---
function onTouchStart(e){
  if (e.touches.length !== 1) return; // ignore multi-touch (future zoom)
  const t = e.touches[0];
  touchState.tracking = true; touchState.moved = false; touchState.longPress=false;
  touchState.startX = t.clientX; touchState.startY = t.clientY; touchState.lastX = t.clientX; touchState.lastY = t.clientY;
  touchState.camX = state.camera.x; touchState.camY = state.camera.y;
  // Long press to enter panning mode explicitly
  clearTimeout(touchState.longPressTimer);
  touchState.longPressTimer = setTimeout(()=>{ touchState.longPress = true; }, 400);
  // Prevent synthetic mouse events so we only rely on touch logic
  e.preventDefault();
}
function onTouchMove(e){
  if (!touchState.tracking) return;
  const t = e.touches[0];
  touchState.lastX = t.clientX; touchState.lastY = t.clientY;
  const dx = t.clientX - touchState.startX; const dy = t.clientY - touchState.startY;
  const dist2 = dx*dx + dy*dy;
  if (dist2 > TAP_MOVE_TOLERANCE*TAP_MOVE_TOLERANCE){
    touchState.moved = true;
  }
  // If moved enough or longPress activated: treat as pan
  if (touchState.moved || touchState.longPress){
    state.camera.x = touchState.camX + dx; state.camera.y = touchState.camY + dy;
    e.preventDefault();
  } else {
    // Hover-like preview while finger is still (simulate onMove)
    const { x: localX, y: localY } = toCanvasCoords(t.clientX, t.clientY);
    simulateHover(localX, localY);
  }
}
function onTouchEnd(e){
  clearTimeout(touchState.longPressTimer);
  if (!touchState.tracking) return;
  const dx = touchState.lastX - touchState.startX; const dy = touchState.lastY - touchState.startY;
  const movedEnough = (dx*dx + dy*dy) > (TAP_MOVE_TOLERANCE*TAP_MOVE_TOLERANCE);
  const wasPan = (movedEnough || touchState.longPress);
  touchState.tracking = false;
  if (!wasPan){
    // Treat as tap -> click equivalent using final coordinates
    const { x, y } = toCanvasCoords(touchState.lastX, touchState.lastY);
    simulateClick(x,y);
  }
}
function onTouchCancel(){
  clearTimeout(touchState.longPressTimer);
  touchState.tracking=false; touchState.moved=false; touchState.longPress=false;
}

function simulateClick(x,y){
  if (state.animating) return;
  // Card click first
  if (handleCardPointer(x,y,true)) return;
  const axial = roundAxial(pixelToAxial(x,y));
  const k = key(axial);
  if (!state.board.has(k)) return;
  const clickedPiece = state.pieces.find(p => p.pos.q===axial.q && p.pos.r===axial.r);
  if (clickedPiece && clickedPiece.player === state.currentPlayer){
    state.selectedPieceId = clickedPiece.id === state.selectedPieceId ? null : clickedPiece.id;
    state.previewPath = null; return;
  }
  if (state.selectedPieceId != null && !clickedPiece){
    const piece = state.pieces.find(p => p.id === state.selectedPieceId); if (!piece) return;
    computeReachable(piece); const rd = state._reachableData; if (!rd) return;
    const entry = rd.map.get(k); if (entry){
      const { path, cardId } = entry;
      animateMove(piece, path, () => {
        consumeCard(cardId);
        state.previewPath = null; state._reachableData = null;
        if (handEmpty()) document.getElementById('endTurnBtn').disabled = false;
        if (!hasAnyMoves()) hintNoMoves();
        updateStatus(); updateHandUI();
        const last = path[path.length-1];
        if (!state.winner){
          const terr = terrainOfHex(last.q,last.r);
          if (terr === 'diamond') { state.winner = state.currentPlayer; document.getElementById('endTurnBtn').disabled = true; }
        }
      });
    }
  }
}

function simulateHover(x,y){
  if (state.animating) return;
  // Card hover first
  if (handleCardPointer(x,y,false)) return;
  if (state.selectedPieceId == null){ state.previewPath = null; return; }
  const piece = state.pieces.find(p => p.id === state.selectedPieceId); if (!piece){ state.previewPath=null; return; }
  const axial = roundAxial(pixelToAxial(x,y)); const k = key(axial);
  if (!state.board.has(k)){ state.previewPath=null; return; }
  if (state.pieces.some(p=>p.pos.q===axial.q && p.pos.r===axial.r) && !(axial.q===piece.pos.q && axial.r===piece.pos.r)){ state.previewPath=null; return; }
  computeReachable(piece); const rd = state._reachableData; if (!rd){ state.previewPath=null; return; }
  const entry = rd.map.get(k); if (!entry){ state.previewPath=null; return; }
  state.previewPath = entry.path;
}

function onClick(evt){
  if (state.animating) return;
  const { x, y } = toCanvasCoords(evt.clientX, evt.clientY);
  if (handleCardPointer(x,y,true)) return;
  const axial = roundAxial(pixelToAxial(x,y));
  const k = key(axial);
  if (!state.board.has(k)) return;
  const clickedPiece = state.pieces.find(p => p.pos.q===axial.q && p.pos.r===axial.r);
  if (clickedPiece && clickedPiece.player === state.currentPlayer){
    state.selectedPieceId = clickedPiece.id === state.selectedPieceId ? null : clickedPiece.id;
    state.previewPath = null; return;
  }
  if (state.selectedPieceId != null && !clickedPiece){
    const piece = state.pieces.find(p => p.id === state.selectedPieceId); if (!piece) return;
    computeReachable(piece); const rd = state._reachableData; if (!rd) return;
    const entry = rd.map.get(k); if (entry){
      const { path, cardId } = entry;
      animateMove(piece, path, () => {
        consumeCard(cardId);
        state.previewPath = null; state._reachableData = null;
        if (handEmpty()) document.getElementById('endTurnBtn').disabled = false;
        if (!hasAnyMoves()) hintNoMoves();
        updateStatus(); updateHandUI();
        // Win condition: entering diamond hex
        const last = path[path.length -1];
        if (!state.winner){
          const terr = terrainOfHex(last.q,last.r);
            if (terr === 'diamond') {
              state.winner = state.currentPlayer;
              // Disable further interaction
              document.getElementById('endTurnBtn').disabled = true;
            }
        }
      });
    }
  }
}

function onMove(evt){
  if (state.animating) return;
  if (state.selectedPieceId == null){ state.previewPath = null; return; }
  const piece = state.pieces.find(p => p.id === state.selectedPieceId); if (!piece){ state.previewPath=null; return; }
  const { x, y } = toCanvasCoords(evt.clientX, evt.clientY);
  if (handleCardPointer(x,y,false)) return;
  const axial = roundAxial(pixelToAxial(x,y)); const k = key(axial);
  if (!state.board.has(k)){ state.previewPath=null; return; }
  if (state.pieces.some(p=>p.pos.q===axial.q && p.pos.r===axial.r) && !(axial.q===piece.pos.q && axial.r===piece.pos.r)){ state.previewPath=null; return; }
  computeReachable(piece); const rd = state._reachableData; if (!rd){ state.previewPath=null; return; }
  const entry = rd.map.get(k); if (!entry){ state.previewPath=null; return; }
  state.previewPath = entry.path;
}

// Bridge pixel->axial using inline math (duplicated from original; could centralize)
// pixelToAxial now imported from board module

function hintNoMoves(){
  const status = document.getElementById('status');
  if (status && !status.textContent.includes('No valid moves')) status.textContent += ' | No valid moves';
}

function updateStatus(){
  const pdata = state.playerData[state.currentPlayer];
  const counts = pdata ? ['grass','sand','water'].map(t=>{
    const n = pdata.hand.filter(c=>c.terrain===t).length;
    return `${t[0].toUpperCase()+t.slice(1)}:${n}`;
  }).join(' ') : '';
  const status = document.getElementById('status');
  if (status) status.textContent = `Player ${state.currentPlayer} | Cards ${counts}`;
}

// Convert viewport client coordinates into canvas internal coordinate space (handles CSS scaling)
function toCanvasCoords(clientX, clientY){
  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}
