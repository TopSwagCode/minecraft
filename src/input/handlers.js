import { state } from '../core/state.js';
import { roundAxial, key } from '../core/hex.js';
import { computeReachable } from '../systems/movement.js';
import { terrainOfHex } from '../utils/terrain.js';
import { consumeCard, handEmpty, updateHandUI } from '../systems/cards.js';
import { endTurn } from '../gameExports.js';
import { toggleMusic, toggleMute } from '../game.js';
import { resetGameKeepSetup, showStartScreenAgain } from '../reset.js';
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
  canvas.addEventListener('wheel', onWheel, { passive:false });
}

let dragState = { active:false, startX:0, startY:0, camX:0, camY:0, button:0 };
let touchState = { tracking:false, moved:false, startX:0, startY:0, lastX:0, lastY:0, camX:0, camY:0, lastTapTime:0, longPress:false, longPressTimer:null };
let pinchState = { active:false, startDist:0, startZoom:1, centerX:0, centerY:0 };
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
  const z = state.zoom || 1;
  state.camera.x = dragState.camX + dx / z;
  state.camera.y = dragState.camY + dy / z;
}

// --- Touch Support ---
function onTouchStart(e){
  if (e.touches.length === 1){
    const t = e.touches[0];
    pinchState.active = false;
    touchState.tracking = true; touchState.moved = false; touchState.longPress=false;
    touchState.startX = t.clientX; touchState.startY = t.clientY; touchState.lastX = t.clientX; touchState.lastY = t.clientY;
    touchState.camX = state.camera.x; touchState.camY = state.camera.y;
    clearTimeout(touchState.longPressTimer);
    touchState.longPressTimer = setTimeout(()=>{ touchState.longPress = true; }, 400);
  } else if (e.touches.length === 2){
    touchState.tracking = false; clearTimeout(touchState.longPressTimer);
    const [a,b] = e.touches;
    pinchState.active = true;
    pinchState.startDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    pinchState.startZoom = state.zoom;
    pinchState.centerX = (a.clientX + b.clientX)/2;
    pinchState.centerY = (a.clientY + b.clientY)/2;
  }
  e.preventDefault();
}

function onTouchMove(e){
  if (pinchState.active && e.touches.length === 2){
    const [a,b] = e.touches;
    const newDist = Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
    const scale = newDist / pinchState.startDist;
    const targetZoom = clampZoom(pinchState.startZoom * scale);
    applyZoomAtClientPoint(targetZoom, pinchState.centerX, pinchState.centerY);
    e.preventDefault();
    return;
  }
  if (!touchState.tracking) return;
  const t = e.touches[0];
  touchState.lastX = t.clientX; touchState.lastY = t.clientY;
  const dx = t.clientX - touchState.startX; const dy = t.clientY - touchState.startY;
  const dist2 = dx*dx + dy*dy;
  if (dist2 > TAP_MOVE_TOLERANCE*TAP_MOVE_TOLERANCE){
    touchState.moved = true;
  }
  if (touchState.moved || touchState.longPress){
    state.camera.x = touchState.camX + dx / (state.zoom||1);
    state.camera.y = touchState.camY + dy / (state.zoom||1);
    e.preventDefault();
  } else {
    const { x: localX, y: localY } = toCanvasCoords(t.clientX, t.clientY);
    simulateHover(localX, localY);
  }
}

function onTouchEnd(e){
  clearTimeout(touchState.longPressTimer);
  if (pinchState.active){
    if (e.touches.length < 2) pinchState.active = false;
  }
  if (!touchState.tracking) return;
  const dx = touchState.lastX - touchState.startX; const dy = touchState.lastY - touchState.startY;
  const movedEnough = (dx*dx + dy*dy) > (TAP_MOVE_TOLERANCE*TAP_MOVE_TOLERANCE);
  const wasPan = (movedEnough || touchState.longPress);
  touchState.tracking = false;
  if (!wasPan){
    const { x, y } = toCanvasCoords(touchState.lastX, touchState.lastY);
    simulateClick(x,y);
  }
}

function onTouchCancel(){
  clearTimeout(touchState.longPressTimer);
  touchState.tracking=false; touchState.moved=false; touchState.longPress=false;
}

function processUIClick(x,y, evt){
  // Music button
  const mb = state.musicButton;
  if (x>=mb.x && x<=mb.x+mb.w && y>=mb.y && y<=mb.y+mb.h){
    if (evt && (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey)) toggleMute(); else toggleMusic();
    return true;
  }
  // Win overlay buttons
  if (state.winner && state.winButtons && state.winButtons.length){
    const hit = state.winButtons.find(b => x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h);
    if (hit){
      if (hit.id === 'play-again') resetGameKeepSetup();
      else if (hit.id === 'start-screen') showStartScreenAgain();
      return true;
    }
  }
  // End Turn
  const eb = state.endTurnButton;
  if (state.endTurnEnabled && x>=eb.x && x<=eb.x+eb.w && y>=eb.y && y<=eb.y+eb.h){ endTurn(); return true; }
  return false;
}

function simulateClick(x,y, evt){
  if (state.animating) return;
  if (processUIClick(x,y, evt)) return;
  if (handleCardPointer(x,y,true)) return;
  const axial = roundAxial(pixelToAxial(x,y)); const k = key(axial);
  if (!state.board.has(k)) return;
  const clickedPiece = state.pieces.find(p => p.pos.q===axial.q && p.pos.r===axial.r);
  if (clickedPiece && clickedPiece.player === state.currentPlayer){
    state.selectedPieceId = clickedPiece.id === state.selectedPieceId ? null : clickedPiece.id; state.previewPath=null; return;
  }
  if (state.selectedPieceId != null && !clickedPiece){
    const piece = state.pieces.find(p => p.id === state.selectedPieceId); if (!piece) return;
    computeReachable(piece); const rd = state._reachableData; if (!rd) return;
    const entry = rd.map.get(k); if (!entry) return;
    const { path, cardId } = entry;
    animateMove(piece, path, () => {
      consumeCard(cardId);
      state.previewPath=null; state._reachableData=null;
      if (handEmpty()) state.endTurnEnabled = true;
      if (!hasAnyMoves()) hintNoMoves();
      updateStatus(); updateHandUI();
      const last = path[path.length-1];
      if (!state.winner){
        const terr = terrainOfHex(last.q,last.r);
        if (terr === 'diamond'){ state.winner = state.currentPlayer; state.endTurnEnabled=false; }
      }
    });
  }
}

function onClick(evt){
  if (state.animating) return;
  const { x, y } = toCanvasCoords(evt.clientX, evt.clientY);
  if (processUIClick(x,y, evt)) return;
  simulateClick(x,y, evt);
}

function onMove(evt){
  if (state.animating) return;
  const { x, y } = toCanvasCoords(evt.clientX, evt.clientY);
  // Music hover
  const mb = state.musicButton;
  if (x>=mb.x && x<=mb.x+mb.w && y>=mb.y && y<=mb.y+mb.h){
    state.hoverControl = 'music';
  } else if (state.hoverControl === 'music') {
    state.hoverControl = null;
  }
  // Win buttons hover
  if (state.winner && state.winButtons && state.winButtons.length){
    const hit = state.winButtons.find(b => x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h);
    state.hoverControl = hit ? 'win:'+hit.id : (state.hoverControl && state.hoverControl.startsWith('win:') ? null : state.hoverControl);
    if (hit) return; // suspend board/card hover
  } else {
    // End turn hover
    const b = state.endTurnButton;
    if (state.endTurnEnabled && x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h){
      state.hoverControl = 'endTurn';
      return; // don't treat as board move preview
    } else if (state.hoverControl === 'endTurn') {
      state.hoverControl = null;
    }
  }
  if (state.selectedPieceId == null){ state.previewPath = null; return; }
  const piece = state.pieces.find(p => p.id === state.selectedPieceId); if (!piece){ state.previewPath=null; return; }
  if (handleCardPointer(x,y,false)) return;
  const axial = roundAxial(pixelToAxial(x,y)); const k = key(axial);
  if (!state.board.has(k)){ state.previewPath=null; return; }
  if (state.pieces.some(p=>p.pos.q===axial.q && p.pos.r===axial.r) && !(axial.q===piece.pos.q && axial.r===piece.pos.r)){ state.previewPath=null; return; }
  computeReachable(piece); const rd = state._reachableData; if (!rd){ state.previewPath=null; return; }
  const entry = rd.map.get(k); if (!entry){ state.previewPath=null; return; }
  state.previewPath = entry.path;
}

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

// --- Zoom Helpers ---
function clampZoom(z){ return Math.min(state.maxZoom || 2.2, Math.max(state.minZoom || 0.5, z)); }

function applyZoomAtClientPoint(newZoom, clientX, clientY){
  const canvas = getCanvas();
  const rect = canvas.getBoundingClientRect();
  const before = screenPointToWorld(clientX, clientY, rect);
  state.zoom = newZoom;
  const after = screenPointToWorld(clientX, clientY, rect);
  state.camera.x += before.worldX - after.worldX;
  state.camera.y += before.worldY - after.worldY;
}

function screenPointToWorld(clientX, clientY, rect){
  const canvas = getCanvas();
  if (!rect) rect = canvas.getBoundingClientRect();
  const x = (clientX - rect.left) * (canvas.width/rect.width);
  const y = (clientY - rect.top) * (canvas.height/rect.height);
  const z = state.zoom || 1;
  const cx = canvas.width/2; const cy = canvas.height/2;
  const worldX = (x - cx)/z - state.camera.x;
  const worldY = (y - cy)/z - state.camera.y;
  return { worldX, worldY };
}

function onWheel(e){
  if (e.ctrlKey || e.metaKey){
    return; // allow browser pinch-zoom for page if user intends that
  }
  const delta = -e.deltaY; // wheel up -> zoom in
  const zoomFactor = Math.exp(delta * 0.001);
  const target = clampZoom((state.zoom || 1) * zoomFactor);
  applyZoomAtClientPoint(target, e.clientX, e.clientY);
  e.preventDefault();
}
