import { state, savePersistedSettings } from '../core/state.js';
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
  // Begin volume slider drag if inside knob while settings open
  if (state.settings.open){
    const { x, y } = toCanvasCoords(evt.clientX, evt.clientY);
    const slider = state._settingsInteractive.volumeSlider;
    if (slider && slider.track){
      const k = slider.knob;
      if (k && x>=k.x && x<=k.x+k.w && y>=k.y-8 && y<=k.y+k.h+8){
        slider.dragging = true; evt.preventDefault(); return;
      }
    }
  }
  if (!isPanningTrigger(evt)) return;
  dragState.active = true; dragState.startX = evt.clientX; dragState.startY=evt.clientY;
  dragState.camX = state.camera.x; dragState.camY = state.camera.y; dragState.button = evt.button;
  evt.preventDefault();
}

function onMouseUp(evt){
  if (dragState.active){ dragState.active=false; }
  if (state._settingsInteractive.volumeSlider.dragging){ state._settingsInteractive.volumeSlider.dragging=false; }
}

function onDragMove(evt){
  if (state._settingsInteractive.volumeSlider.dragging){
    const { x, y } = toCanvasCoords(evt.clientX, evt.clientY);
    const slider = state._settingsInteractive.volumeSlider;
    const t = slider.track;
    const rel = Math.min(1, Math.max(0, (x - t.x)/t.w));
    slider.value = rel; state.music.volume = rel; state.music.muted = rel===0; if (state.music.audio){ state.music.audio.volume = state.music.muted ? 0 : state.music.volume; }
    return;
  }
  if (!dragState.active) return;
  const dx = evt.clientX - dragState.startX; const dy = evt.clientY - dragState.startY;
  const z = state.zoom || 1;
  state.camera.x = dragState.camX + dx / z;
  state.camera.y = dragState.camY + dy / z;
}

// --- Touch Support ---
function onTouchStart(e){
  // Settings volume slider knob detection
  if (state.settings.open){
    const inter = state._settingsInteractive;
    const slider = inter.volumeSlider;
    if (slider && slider.knob){
      const t = e.touches[0];
      const canvas = getCanvas();
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width; const scaleY = canvas.height / rect.height;
      const cx = (t.clientX - rect.left) * scaleX; const cy = (t.clientY - rect.top) * scaleY;
      if (cx>=slider.knob.x && cx<=slider.knob.x+slider.knob.w && cy>=slider.knob.y-10 && cy<=slider.knob.y+slider.knob.h+10){
        slider.dragging = true; slider._dragOffset = cx - (slider.knob.x + slider.knob.w/2);
      } else if (slider.track && cx>=slider.track.x && cx<=slider.track.x+slider.track.w && cy>=slider.track.y-12 && cy<=slider.track.y+slider.track.h+12){
        // Tap on track jumps and starts drag
        const rel = (cx - slider.track.x) / slider.track.w; const v = Math.min(1, Math.max(0, rel));
        state.music.volume = v; state.music.muted = v===0; if (state.music.audio){ state.music.audio.volume = state.music.muted?0:state.music.volume; }
        slider.dragging = true; slider._dragOffset = 0;
      }
    }
  }
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
  if (state.settings.open){
    const inter = state._settingsInteractive; const slider = inter.volumeSlider;
    if (slider && slider.dragging && slider.track){
      const [t] = e.touches; const canvas = getCanvas(); const rect = canvas.getBoundingClientRect(); const scaleX = canvas.width/rect.width; const cx = (t.clientX - rect.left)*scaleX;
      const rel = (cx - slider.track.x) / slider.track.w; const v = Math.min(1, Math.max(0, rel));
      state.music.volume = v; state.music.muted = v===0; if (state.music.audio){ state.music.audio.volume = state.music.muted?0:state.music.volume; }
      e.preventDefault();
      return; // do not treat as pan
    }
  }
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
  if (state.settings.open && state._settingsInteractive.volumeSlider.dragging){ state._settingsInteractive.volumeSlider.dragging=false; }
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
  if (state.settings.open && state._settingsInteractive.volumeSlider.dragging){ state._settingsInteractive.volumeSlider.dragging=false; }
  clearTimeout(touchState.longPressTimer);
  touchState.tracking=false; touchState.moved=false; touchState.longPress=false;
}

function processUIClick(x,y, evt){
  // Settings open overlay priority
  if (state.help.open){
    const inter = state._helpInteractive;
    // Close button
    const cb = inter.closeButton;
    if (cb && x>=cb.x && x<=cb.x+cb.w && y>=cb.y && y<=cb.y+cb.h){ state.help.open=false; return true; }
    // Outside click closes
    const pr = inter.panelRect;
    if (pr){ const inside = x>=pr.x && x<=pr.x+pr.w && y>=pr.y && y<=pr.y+pr.h; if (!inside){ state.help.open=false; return true; } }
  }
  if (state.settings.open){
    // Interactions inside overlay
    const inter = state._settingsInteractive;
    // Resume button
    const rb = inter.resumeButton;
    if (rb && x>=rb.x && x<=rb.x+rb.w && y>=rb.y && y<=rb.y+rb.h){
      state.settings.open = false; return true;
    }
    // Card size buttons
    const hitSize = inter.cardSizeButtons.find(b => x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h);
    if (hitSize){
      if (state.settings.cardSize !== hitSize.id){ state.settings.cardSize = hitSize.id; state.handLayoutDirty = true; savePersistedSettings(); }
      return true;
    }
    // Return to start
    const back = inter.toStartButton;
    if (back && x>=back.x && x<=back.x+back.w && y>=back.y && y<=back.y+back.h){
      state.settings.open = false; state.handLayoutDirty = true; // ensure layout recalculates if size changed
      showStartScreenAgain();
      return true;
    }
    // Volume slider interactions (click sets position)
    const slider = inter.volumeSlider;
    if (slider.track && x>=slider.track.x && x<=slider.track.x+slider.track.w && y>=slider.track.y-10 && y<=slider.track.y+slider.track.h+10){
      const rel = (x - slider.track.x) / slider.track.w; const v = Math.min(1, Math.max(0, rel));
      state.music.volume = v; state.music.muted = v===0; if (state.music.audio){ state.music.audio.volume = state.music.muted ? 0 : state.music.volume; } savePersistedSettings();
      return true;
    }
    // Click outside panel closes settings (use stored panelRect)
    const pr = inter.panelRect;
    if (pr){
      const inside = x>=pr.x && x<=pr.x+pr.w && y>=pr.y && y<=pr.y+pr.h;
      if (!inside){ state.settings.open=false; return true; }
    }
  }
  // Music button
  const mb = state.musicButton;
  if (x>=mb.x && x<=mb.x+mb.w && y>=mb.y && y<=mb.y+mb.h){
    if (evt && (evt.metaKey || evt.ctrlKey || evt.shiftKey || evt.altKey)) toggleMute(); else toggleMusic();
    return true;
  }
  // Settings button
  const sb = state.settingsButton;
  if (x>=sb.x && x<=sb.x+sb.w && y>=sb.y && y<=sb.y+sb.h){
    const next = !state.settings.open;
    state.settings.open = next;
    if (next){ state.help.open = false; }
    if (state.settings.open){
      state._settingsInteractive.volumeSlider.value = state.music.muted ? 0 : state.music.volume;
    }
    return true;
  }
  // Help button
  const hb = state.helpButton;
  if (x>=hb.x && x<=hb.x+hb.w && y>=hb.y && y<=hb.y+hb.h){
    const next = !state.help.open; state.help.open = next; if (next){ state.settings.open = false; }
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
  // Animate the card being played from its hand slot to the target hex before the piece moves
  const lastHex = path[path.length-1];
  // Retrieve the real card object (will be removed after animation completes)
  const pdata = state.playerData[state.currentPlayer];
  const cardObj = pdata ? pdata.hand.find(c => c.id === cardId) : null;
    const canvas = document.getElementById('board');
    let handFrom = { x: canvas ? canvas.width/2 - 45 : 400, y: canvas ? canvas.height - 70 : 620 };
    // Locate layout slot for card to get exact starting position
    if (state.handLayout && state.handLayout.length){
      const lay = state.handLayout.find(l => l.cardId === cardId);
      if (lay){ handFrom = { x: lay.x, y: lay.y }; }
    }
    // Convert axial lastHex to approximate on-hand canvas coordinates (reuse axialToPixel via board.js)
    try {
      // dynamic import already loaded module environment; rely on global function if exposed
      // We import lazily to avoid circular reference inside handlers.
      const { axialToPixel } = window.__BOARD_HELPERS__ || {};
      if (axialToPixel){
        const p = axialToPixel(lastHex.q,lastHex.r);
        // Card should land slightly above hex center to suggest playing
        var targetCardY = p.y - 50; // float above
        var targetCardX = p.x - CARD_W/2 || p.x - 65; // center horizontally (fallback)
        // Provide a gentle arc
  state.cardAnimations.push({ id: cardId+'-play-'+performance.now(), type:'play', card: cardObj || { id: cardId, terrain: terrainOfHex(lastHex.q,lastHex.r), range: piece.moveRange || 1 }, from: handFrom, to: { x: targetCardX, y: targetCardY }, t:0, duration:420, arcHeight: 55, onComplete: () => {
          // Once card animation finishes, start the piece movement and then discard the card
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
        }});
      } else {
        // Fallback: if axialToPixel not available just proceed with original logic
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
    } catch(e){
      // On error just run original move logic
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
  // Help overlay hover logic
  if (state.help.open){
    const inter = state._helpInteractive; state.hoverControl=null;
    const cb = inter.closeButton; if (cb && x>=cb.x && x<=cb.x+cb.w && y>=cb.y && y<=cb.y+cb.h) state.hoverControl='help:close';
    return; // suspend other hovers while help open
  }
  // Settings overlay hover logic if open
  if (state.settings.open){
    const inter = state._settingsInteractive;
    state.hoverControl = null;
    if (inter.resumeButton){ const b = inter.resumeButton; if (x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h) state.hoverControl='settings:resume'; }
    if (!state.hoverControl && inter.cardSizeButtons){
      const hit = inter.cardSizeButtons.find(b=>x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h);
      if (hit) state.hoverControl='card-size:'+hit.id;
    }
    if (!state.hoverControl && inter.toStartButton){ const b=inter.toStartButton; if (x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h) state.hoverControl='settings:back-start'; }
    // Slider hover not strictly necessary; keep existing pointer style
    return; // don't process normal game hover while settings open
  }
  if (state.settings.open){
    let hovered = false;
    const inter = state._settingsInteractive;
    // Card size buttons
    const cs = inter.cardSizeButtons.find(b => x>=b.x && x<=b.x+b.w && y>=b.y && y<=b.y+b.h);
    if (cs){ state.hoverControl = 'card-size:'+cs.id; hovered=true; }
    const back = inter.toStartButton;
    if (!hovered && back && x>=back.x && x<=back.x+back.w && y>=back.y && y<=back.y+back.h){ state.hoverControl='settings:back-start'; hovered=true; }
    // Slider knob hover
    const knob = inter.volumeSlider.knob; if (!hovered && knob && x>=knob.x && x<=knob.x+knob.w && y>=knob.y-8 && y<=knob.y+knob.h+8){ state.hoverControl='settings:volume'; hovered=true; }
    if (!hovered && state.hoverControl && (state.hoverControl.startsWith('card-size:') || state.hoverControl.startsWith('settings:') )) state.hoverControl=null;
    return; // suspend other hovers when settings open
  }
  // Music hover
  const mb = state.musicButton;
  if (x>=mb.x && x<=mb.x+mb.w && y>=mb.y && y<=mb.y+mb.h){
    state.hoverControl = 'music';
  } else if (state.hoverControl === 'music') {
    state.hoverControl = null;
  }
  // Settings button hover
  const sb = state.settingsButton;
  if (x>=sb.x && x<=sb.x+sb.w && y>=sb.y && y<=sb.y+sb.h){ state.hoverControl='settings'; }
  else if (state.hoverControl === 'settings') state.hoverControl=null;
  // Help button hover
  const hb = state.helpButton;
  if (x>=hb.x && x<=hb.x+hb.w && y>=hb.y && y<=hb.y+hb.h){ state.hoverControl='help'; }
  else if (state.hoverControl === 'help') state.hoverControl=null;
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
