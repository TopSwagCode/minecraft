import { state } from '../core/state.js';
import { COLORS } from '../core/constants.js';

// Layout constants
const CARD_W = 90;
const CARD_H = 60;
const PADDING = 10;
const GAP = 8;
const RADIUS = 10;

function cardColor(type){
  switch(type){
    case 'grass': return ['#224a1c','#2d5d27'];
    case 'sand': return ['#6a5522','#8c722b'];
    case 'water': return ['#123d63','#1f5d9f'];
    default: return ['#333','#444'];
  }
}

export function layoutHand(canvas){
  const pdata = state.playerData[state.currentPlayer];
  state.handLayout = [];
  if (!pdata) return;
  const totalW = pdata.hand.length * CARD_W + Math.max(0,(pdata.hand.length-1))*GAP;
  // center if fits
  let startX = (canvas.width - totalW)/2;
  if (startX < PADDING) startX = PADDING;
  const y = canvas.height - CARD_H - PADDING;
  pdata.hand.forEach((card, i) => {
    const x = startX + i*(CARD_W + GAP);
    state.handLayout.push({ cardId: card.id, x, y, w: CARD_W, h: CARD_H });
  });
  // Update pile base positions (left & right corners)
  state.pilePositions.draw = { x: PADDING, y };
  state.pilePositions.discard = { x: canvas.width - CARD_W - PADDING, y };
}

export function computeHandSlot(finalCount, index, canvas){
  const totalW = finalCount * CARD_W + Math.max(0, finalCount-1)*GAP;
  let startX = (canvas.width - totalW)/2; if (startX < PADDING) startX = PADDING;
  const y = canvas.height - CARD_H - PADDING;
  return { x: startX + index*(CARD_W + GAP), y };
}

// Expose helper for dynamic access (avoid circular import in cards system)
try { if (window) { window.__HAND_HELPERS__ = { computeHandSlot }; } } catch(_) {}

export function drawHand(ctx, canvas){
  const pdata = state.playerData[state.currentPlayer];
  if (!pdata) return;
  // Rebuild layout if flagged dirty or count mismatch
  if (state.handLayoutDirty || state.handLayout.length !== pdata.hand.length){
    layoutHand(canvas); state.handLayoutDirty = false;
  }
  ctx.save();
  // Draw draw & discard pile placeholders behind hand
  drawPile(ctx, state.pilePositions.draw.x, state.pilePositions.draw.y, 'draw', pdata.deck.length);
  drawPile(ctx, state.pilePositions.discard.x, state.pilePositions.discard.y, 'discard', pdata.discard.length);
  ctx.font = '12px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  pdata.hand.forEach(card => {
    const lay = state.handLayout.find(l => l.cardId === card.id); if (!lay) return;
    const [c0,c1] = cardColor(card.terrain);
    const grad = ctx.createLinearGradient(lay.x, lay.y, lay.x+lay.w, lay.y+lay.h);
    grad.addColorStop(0,c0); grad.addColorStop(1,c1);
    ctx.fillStyle = grad;
    roundedRect(ctx, lay.x, lay.y, lay.w, lay.h, RADIUS);
    ctx.fill();
    ctx.lineWidth = (pdata.selectedCard === card.id)?3:1.2;
    ctx.strokeStyle = (pdata.selectedCard === card.id)?'#fff':'#000';
    ctx.stroke();
    if (state.hoverCardId === card.id){
      ctx.fillStyle='rgba(255,255,255,0.07)';
      roundedRect(ctx, lay.x, lay.y, lay.w, lay.h, RADIUS); ctx.fill();
    }
    // Text
    ctx.fillStyle = '#fff'; ctx.font = '600 13px system-ui';
    ctx.fillText(card.terrain, lay.x + lay.w/2, lay.y + lay.h/2 - 6);
    ctx.fillStyle = '#ffd166'; ctx.font = '10px system-ui';
    ctx.fillText('r'+card.range, lay.x + lay.w/2, lay.y + lay.h/2 + 10);
  });
  ctx.restore();

  // Active card animations overlay
  if (state.cardAnimations.length){
    for (const anim of state.cardAnimations){
      if (anim.t < (anim.startDelay||0)) continue;
      const localT = anim.t - (anim.startDelay||0);
      const prog = Math.min(1, localT / anim.duration);
      const ease = prog<0.5? 2*prog*prog : -1+(4-2*prog)*prog; // easeInOutQuad
      let x = anim.from.x + (anim.to.x - anim.from.x)*ease;
      let y = anim.from.y + (anim.to.y - anim.from.y)*ease;
      if (anim.arcHeight){
        const mid = 4*ease*(1-ease); // parabola peak at 0.5
        y -= anim.arcHeight * mid;
      }
      drawAnimatedCard(ctx, anim.card, x, y, prog, anim);
    }
  }
  drawEndTurnButton(ctx, canvas);
}

function roundedRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

export function handleCardPointer(x,y, click=false){
  const pdata = state.playerData[state.currentPlayer];
  if (!pdata) return false;
  if (state.handLayoutDirty || state.handLayout.length !== pdata.hand.length){
    layoutHand(getCanvasSafe()); state.handLayoutDirty = false;
  }
  const layout = state.handLayout;
  if (!layout.length) return false; // nothing to interact with
  const hit = layout.find(l => x>=l.x && x<=l.x+l.w && y>=l.y && y<=l.y+l.h);
  if (hit){
    state.hoverCardId = hit.cardId;
    if (click){
      const pdata = state.playerData[state.currentPlayer];
      if (pdata){
        pdata.selectedCard = (pdata.selectedCard === hit.cardId)? null : hit.cardId;
        // selection does not change layout
      }
    }
    return true;
  } else {
    if (state.hoverCardId) state.hoverCardId = null;
  }
  return false;
}

function getCanvasSafe(){
  return document.getElementById('board');
}

function drawPile(ctx,x,y,type,count){
  ctx.save();
  const layers = Math.min(3, count>0?3:1);
  for (let i=0;i<layers;i++){
    const off = i*2;
    ctx.fillStyle = type==='draw' ? '#1e2a36' : '#352222';
    ctx.globalAlpha = 0.6 + i*0.15;
    roundedRect(ctx, x+off, y+off, CARD_W, CARD_H, 10);
    ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#000'; ctx.stroke();
  }
  ctx.globalAlpha=1; ctx.fillStyle='#eee'; ctx.font='600 11px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(type==='draw'?'Deck':'Discard', x+CARD_W/2, y+CARD_H/2 - 6);
  ctx.fillStyle = '#ffd166'; ctx.font='10px system-ui';
  ctx.fillText(String(count), x+CARD_W/2, y+CARD_H/2 + 10);
  ctx.restore();
}

function drawAnimatedCard(ctx, card, x, y, prog, anim){
  ctx.save();
  const w = CARD_W, h = CARD_H;
  const [c0,c1] = cardColor(card.terrain);
  const grad = ctx.createLinearGradient(x,y,x+w,y+h);
  grad.addColorStop(0,c0); grad.addColorStop(1,c1);
  ctx.globalAlpha = 0.25 + 0.75*prog;
  ctx.fillStyle = grad; roundedRect(ctx,x,y,w,h,10); ctx.fill();
  ctx.lineWidth=1.4; ctx.strokeStyle='#000'; ctx.stroke();
  if (anim && anim.rotation){
    // Re-draw with rotation (optional) - simple approach: overlay border rotated
  }
  ctx.globalAlpha=1; ctx.fillStyle='#fff'; ctx.font='600 13px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText(card.terrain, x+w/2, y+h/2 - 6);
  ctx.fillStyle='#ffd166'; ctx.font='10px system-ui'; ctx.fillText('r'+card.range, x+w/2, y+h/2 + 10);
  ctx.restore();
}

function drawEndTurnButton(ctx, canvas){
  const b = state.endTurnButton;
  // Position button above piles right side
  b.w = 140; b.h = 44;
  b.x = canvas.width - b.w - 16;
  b.y = canvas.height -  (CARD_H + PADDING) - b.h - 18;
  ctx.save();
  const enabled = state.endTurnEnabled && !state.winner;
  ctx.globalAlpha = enabled ? 0.95 : 0.45;
  const isHover = state.hoverControl === 'endTurn';
  const grad = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  if (isHover && enabled){
    grad.addColorStop(0, '#3b82f6'); grad.addColorStop(1, '#1d4ed8');
  } else {
    grad.addColorStop(0, '#2563eb'); grad.addColorStop(1, '#1749b3');
  }
  ctx.fillStyle = grad;
  roundedRect(ctx, b.x, b.y, b.w, b.h, 10); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = isHover && enabled ? '#163d8c' : '#0d285a'; ctx.stroke();
  ctx.font = '600 16px system-ui'; ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('End Turn', b.x + b.w/2, b.y + b.h/2 + 1);
  ctx.restore();
}

export function updateCardAnimations(dt){
  if (!state.cardAnimations.length) return;
  // dt in ms from loop
  for (const anim of state.cardAnimations){ anim.t += dt; }
  const remaining = [];
  for (const anim of state.cardAnimations){
    if (anim.t >= (anim.startDelay||0) + anim.duration){
      if (!anim._done){
        anim._done = true;
        if (typeof anim.onComplete === 'function') anim.onComplete();
      }
      state.animatingCards.delete(anim.card.id);
    } else {
      remaining.push(anim);
    }
  }
  state.cardAnimations = remaining;
}
