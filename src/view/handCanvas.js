import { state } from '../core/state.js';
import { COLORS } from '../core/constants.js';
import { TextureRegistry } from '../../textures.js';

// Layout constants
const CARD_W = 130; // increased from 90
const CARD_H = 90;  // increased from 60
const PADDING = 10;
const GAP = 8;
const RADIUS = 10;
// Range icon (generated) cache
const _rangeIconCache = new Map(); // key: size -> canvas

function getRangeIcon(size=10){
  if (_rangeIconCache.has(size)) return _rangeIconCache.get(size);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(size/2, size/2, size/2 - 0.8, 0, Math.PI*2);
  const grd = g.createRadialGradient(size/2, size/2, 1, size/2, size/2, size/2);
  grd.addColorStop(0,'#fff'); grd.addColorStop(0.5,'#ffe3a1'); grd.addColorStop(1,'#d19a27');
  g.fillStyle = grd; g.fill();
  g.lineWidth = 1; g.strokeStyle = '#5a430f'; g.stroke();
  g.beginPath(); g.arc(size/2, size/2, size/2 - 3, 0, Math.PI*2);
  g.globalAlpha=0.4; g.fillStyle='#000'; g.fill(); g.globalAlpha=1;
  _rangeIconCache.set(size,c);
  return c;
}

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
    const texKey = 'hello-' + card.terrain; // expected naming convention
    const img = TextureRegistry && TextureRegistry.images && TextureRegistry.images.get(texKey);
    ctx.save();
    // Clip to rounded rect
    roundedRect(ctx, lay.x, lay.y, lay.w, lay.h, RADIUS);
    ctx.clip();
    if (img){
      // Cover-fit the image inside card area
      const iw = img.width, ih = img.height;
      const scale = Math.max(lay.w/iw, lay.h/ih);
      const dw = iw * scale; const dh = ih * scale;
      const dx = lay.x + (lay.w - dw)/2; const dy = lay.y + (lay.h - dh)/2;
      ctx.drawImage(img, dx, dy, dw, dh);
      // Subtle dark-to-transparent gradient overlay for text readability
      const overlay = ctx.createLinearGradient(lay.x, lay.y, lay.x, lay.y + lay.h);
      overlay.addColorStop(0, 'rgba(0,0,0,0.15)');
      overlay.addColorStop(1, 'rgba(0,0,0,0.55)');
      ctx.fillStyle = overlay; ctx.fillRect(lay.x, lay.y, lay.w, lay.h);
    } else {
      // Fallback gradient (image not yet loaded)
      const [c0,c1] = cardColor(card.terrain);
      const grad = ctx.createLinearGradient(lay.x, lay.y, lay.x+lay.w, lay.y+lay.h);
      grad.addColorStop(0,c0); grad.addColorStop(1,c1);
      ctx.fillStyle = grad; ctx.fill();
    }
    ctx.restore();
    // Border / selection outline
    ctx.lineWidth = (pdata.selectedCard === card.id)?3:1.2;
    ctx.strokeStyle = (pdata.selectedCard === card.id)?'#fff':'#000';
    roundedRect(ctx, lay.x, lay.y, lay.w, lay.h, RADIUS); ctx.stroke();
    if (state.hoverCardId === card.id){
      ctx.save(); ctx.fillStyle='rgba(255,255,255,0.07)';
      roundedRect(ctx, lay.x, lay.y, lay.w, lay.h, RADIUS); ctx.fill(); ctx.restore();
    }
    // Draw movement range icons (one per range) centered vertically
  const iconCount = Math.max(1, card.range || 1);
  // Adaptive size: start large, reduce logarithmically-ish as iconCount grows
  const baseMax = 40; // new bigger maximum
  const baseMin = 10;
  // Soft shrink factor: bigger drop early, slower later
  const shrink = 1 / (1 + Math.log2(iconCount)); // 1 ->1, 2 -> ~0.5, 4 -> ~0.33, 8 -> ~0.25
  let iconSize = Math.round(baseMax * shrink + (baseMin * (1-shrink)));
  // Ensure they still fit horizontally; adjust downward if overflowing
  const maxAllowed = Math.floor((lay.w - 16) / iconCount - 4);
  if (isFinite(maxAllowed) && maxAllowed > 0) iconSize = Math.min(iconSize, maxAllowed);
  if (iconSize < baseMin) iconSize = baseMin;
  const spacing = Math.max(3, Math.min(8, Math.round(iconSize * 0.2)));
    const totalW = iconCount * iconSize + (iconCount-1)*spacing;
    const startX = lay.x + (lay.w - totalW)/2;
    const yIcons = lay.y + (lay.h - iconSize)/2;
    let iconImg = null;
    if (TextureRegistry && TextureRegistry.images){
      const specificKey = 'range-icon-' + card.terrain;
      iconImg = TextureRegistry.images.get(specificKey) || TextureRegistry.images.get('range-icon');
    }
    if (!iconImg) iconImg = getRangeIcon(iconSize);
    for (let i=0;i<iconCount;i++){
      ctx.drawImage(iconImg, Math.round(startX + i*(iconSize+spacing)), yIcons, iconSize, iconSize);
    }
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
  const texKey = 'hello-' + card.terrain;
  const img = TextureRegistry && TextureRegistry.images && TextureRegistry.images.get(texKey);
  const alpha = 0.25 + 0.75*prog;
  ctx.globalAlpha = alpha;
  // Background (image or gradient)
  roundedRect(ctx,x,y,w,h,10); ctx.clip();
  if (img){
    const iw = img.width, ih = img.height;
    const scale = Math.max(w/iw, h/ih);
    const dw = iw * scale; const dh = ih * scale;
    const dx = x + (w - dw)/2; const dy = y + (h - dh)/2;
    ctx.drawImage(img, dx, dy, dw, dh);
    // Dark overlay scaling with (1-prog) for slight fade-in
    const overlay = ctx.createLinearGradient(x,y,x,y+h);
    overlay.addColorStop(0,'rgba(0,0,0,'+(0.25*(1-prog)).toFixed(3)+')');
    overlay.addColorStop(1,'rgba(0,0,0,'+(0.55*(1-prog)).toFixed(3)+')');
    ctx.fillStyle = overlay; ctx.fillRect(x,y,w,h);
  } else {
    const [c0,c1] = cardColor(card.terrain);
    const grad = ctx.createLinearGradient(x,y,x+w,y+h);
    grad.addColorStop(0,c0); grad.addColorStop(1,c1);
    ctx.fillStyle = grad; ctx.fill();
  }
  ctx.restore();
  // Border
  ctx.save();
  ctx.lineWidth=1.4; ctx.strokeStyle='#000';
  roundedRect(ctx,x,y,w,h,10); ctx.stroke();
  // Overlay range icons (centered) for animated card
  const iconCount = Math.max(1, card.range || 1);
  const baseMax = 40; const baseMin = 10;
  const shrink = 1 / (1 + Math.log2(iconCount));
  let iconSize = Math.round(baseMax * shrink + (baseMin * (1-shrink)));
  const maxAllowed = Math.floor((w - 16) / iconCount - 4);
  if (isFinite(maxAllowed) && maxAllowed > 0) iconSize = Math.min(iconSize, maxAllowed);
  if (iconSize < baseMin) iconSize = baseMin;
  const spacing = Math.max(3, Math.min(8, Math.round(iconSize * 0.2)));
  const totalW = iconCount * iconSize + (iconCount-1)*spacing;
  const startX = x + (w - totalW)/2; const yIcons = y + (h - iconSize)/2;
  let iconImg = null;
  if (TextureRegistry && TextureRegistry.images){
    const specificKey = 'range-icon-' + card.terrain;
    iconImg = TextureRegistry.images.get(specificKey) || TextureRegistry.images.get('range-icon');
  }
  if (!iconImg) iconImg = getRangeIcon(iconSize);
  for (let i=0;i<iconCount;i++) ctx.drawImage(iconImg, Math.round(startX + i*(iconSize+spacing)), yIcons, iconSize, iconSize);
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
