import { state } from '../core/state.js';
import { TextureRegistry } from '../../textures.js';

// Dynamic layout sizing
const PADDING = 10; const GAP = 8; const RADIUS = 10;
const CARD_SIZE_PRESETS = { small:{w:90,h:62}, medium:{w:130,h:90}, large:{w:160,h:110} };
function dims(){ const sel = state.settings?.cardSize || 'medium'; return CARD_SIZE_PRESETS[sel] || CARD_SIZE_PRESETS.medium; }

// Range icon cache (size -> canvas)
const _rangeIconCache = new Map();
function getRangeIcon(size=10){
  if (_rangeIconCache.has(size)) return _rangeIconCache.get(size);
  const c = document.createElement('canvas'); c.width=size; c.height=size; const g=c.getContext('2d');
  g.beginPath(); g.arc(size/2,size/2,size/2 - 0.8,0,Math.PI*2);
  const grd = g.createRadialGradient(size/2,size/2,1,size/2,size/2,size/2); grd.addColorStop(0,'#fff'); grd.addColorStop(0.5,'#ffe3a1'); grd.addColorStop(1,'#d19a27');
  g.fillStyle=grd; g.fill(); g.lineWidth=1; g.strokeStyle='#5a430f'; g.stroke();
  g.beginPath(); g.arc(size/2,size/2,size/2-3,0,Math.PI*2); g.globalAlpha=0.4; g.fillStyle='#000'; g.fill(); g.globalAlpha=1;
  _rangeIconCache.set(size,c); return c;
}

function cardColor(t){ switch(t){ case 'grass': return ['#224a1c','#2d5d27']; case 'sand': return ['#6a5522','#8c722b']; case 'water': return ['#123d63','#1f5d9f']; default: return ['#333','#444']; } }

export function layoutHand(canvas){
  const pdata = state.playerData[state.currentPlayer]; state.handLayout=[]; if (!pdata) return;
  const { w:W, h:H } = dims();
  const totalW = pdata.hand.length * W + Math.max(0,(pdata.hand.length-1))*GAP;
  let startX = (canvas.width - totalW)/2; if (startX < PADDING) startX = PADDING;
  const y = canvas.height - H - PADDING;
  pdata.hand.forEach((card,i)=>{ const x = startX + i*(W+GAP); state.handLayout.push({ cardId: card.id, x, y, w: W, h: H }); });
  state.pilePositions.draw = { x: PADDING, y };
  state.pilePositions.discard = { x: canvas.width - W - PADDING, y };
}

export function computeHandSlot(finalCount, index, canvas){
  const { w:W, h:H } = dims();
  const totalW = finalCount * W + Math.max(0,(finalCount-1))*GAP;
  let startX = (canvas.width - totalW)/2; if (startX < PADDING) startX=PADDING;
  const y = canvas.height - H - PADDING; return { x: startX + index*(W+GAP), y };
}
try { if (window) window.__HAND_HELPERS__ = { computeHandSlot }; } catch(_){ }

export function drawHand(ctx, canvas){
  const pdata = state.playerData[state.currentPlayer]; if (!pdata) return;
  if (state.handLayoutDirty || state.handLayout.length !== pdata.hand.length){ layoutHand(canvas); state.handLayoutDirty=false; }
  const { w:W, h:H } = dims();
  ctx.save();
  drawPile(ctx, state.pilePositions.draw.x, state.pilePositions.draw.y, 'draw', pdata.deck.length, W, H);
  drawPile(ctx, state.pilePositions.discard.x, state.pilePositions.discard.y, 'discard', pdata.discard.length, W, H);
  ctx.font='12px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
  pdata.hand.forEach(card => {
    const lay = state.handLayout.find(l=>l.cardId===card.id); if (!lay) return;
    const texKey = 'hello-'+card.terrain; const img = TextureRegistry?.images?.get(texKey);
    ctx.save(); roundedRect(ctx, lay.x, lay.y, lay.w, lay.h, RADIUS); ctx.clip();
    if (img){
      const iw=img.width, ih=img.height; const scale=Math.max(lay.w/iw, lay.h/ih); const dw=iw*scale, dh=ih*scale; const dx=lay.x+(lay.w-dw)/2, dy=lay.y+(lay.h-dh)/2; ctx.drawImage(img,dx,dy,dw,dh);
      const ov = ctx.createLinearGradient(lay.x,lay.y,lay.x,lay.y+lay.h); ov.addColorStop(0,'rgba(0,0,0,0.15)'); ov.addColorStop(1,'rgba(0,0,0,0.55)'); ctx.fillStyle=ov; ctx.fillRect(lay.x,lay.y,lay.w,lay.h);
    } else { const [c0,c1]=cardColor(card.terrain); const grad=ctx.createLinearGradient(lay.x,lay.y,lay.x+lay.w,lay.y+lay.h); grad.addColorStop(0,c0); grad.addColorStop(1,c1); ctx.fillStyle=grad; ctx.fill(); }
    ctx.restore();
    ctx.lineWidth=(pdata.selectedCard===card.id)?3:1.2; ctx.strokeStyle=(pdata.selectedCard===card.id)?'#fff':'#000'; roundedRect(ctx, lay.x, lay.y, lay.w, lay.h, RADIUS); ctx.stroke();
    if (state.hoverCardId===card.id){ ctx.save(); ctx.fillStyle='rgba(255,255,255,0.07)'; roundedRect(ctx, lay.x, lay.y, lay.w, lay.h, RADIUS); ctx.fill(); ctx.restore(); }
  const iconCount = Math.max(1, card.range || 1);
  let baseMax = 40; // default for small
  if (state.settings?.cardSize === 'medium') baseMax = 48; else if (state.settings?.cardSize === 'large') baseMax = 56;
  const baseMin=10; const shrink = 1/(1+Math.log2(iconCount)); let iconSize = Math.round(baseMax*shrink + (baseMin*(1-shrink)));
    const maxAllowed = Math.floor((lay.w - 16)/iconCount - 4); if (isFinite(maxAllowed) && maxAllowed>0) iconSize = Math.min(iconSize, maxAllowed); if (iconSize<baseMin) iconSize=baseMin;
    const spacing = Math.max(3, Math.min(8, Math.round(iconSize*0.2))); const totalW = iconCount*iconSize + (iconCount-1)*spacing; const startX = lay.x + (lay.w-totalW)/2; const yIcons = lay.y + (lay.h - iconSize)/2;
    let iconImg = TextureRegistry?.images?.get('range-icon-'+card.terrain) || TextureRegistry?.images?.get('range-icon'); if (!iconImg) iconImg = getRangeIcon(iconSize);
    for (let i=0;i<iconCount;i++) ctx.drawImage(iconImg, Math.round(startX + i*(iconSize+spacing)), yIcons, iconSize, iconSize);
  });
  ctx.restore();
  if (state.cardAnimations.length){
    for (const anim of state.cardAnimations){ if (anim.t < (anim.startDelay||0)) continue; const localT = anim.t - (anim.startDelay||0); const prog = Math.min(1, localT/anim.duration); const ease = prog<0.5?2*prog*prog:-1+(4-2*prog)*prog; let x = anim.from.x + (anim.to.x-anim.from.x)*ease; let y = anim.from.y + (anim.to.y-anim.from.y)*ease; if (anim.arcHeight){ const mid=4*ease*(1-ease); y -= anim.arcHeight*mid; } drawAnimatedCard(ctx, anim.card, x, y, prog, anim); }
  }
  drawEndTurnButton(ctx, canvas);
}

function roundedRect(ctx,x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r); ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h); ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r); ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath(); }

export function handleCardPointer(x,y, click=false){
  const pdata = state.playerData[state.currentPlayer]; if (!pdata) return false;
  if (state.handLayoutDirty || state.handLayout.length !== pdata.hand.length){ layoutHand(getCanvasSafe()); state.handLayoutDirty=false; }
  const hit = state.handLayout.find(l => x>=l.x && x<=l.x+l.w && y>=l.y && y<=l.y+l.h);
  if (hit){ state.hoverCardId = hit.cardId; if (click){ pdata.selectedCard = (pdata.selectedCard===hit.cardId)? null : hit.cardId; } return true; }
  if (state.hoverCardId) state.hoverCardId=null; return false;
}
function getCanvasSafe(){ return document.getElementById('board'); }

function drawPile(ctx,x,y,type,count,W,H){ ctx.save(); const layers=Math.min(3,count>0?3:1); for (let i=0;i<layers;i++){ const off=i*2; ctx.fillStyle= type==='draw'? '#1e2a36':'#352222'; ctx.globalAlpha=0.6 + i*0.15; roundedRect(ctx,x+off,y+off,W,H,10); ctx.fill(); ctx.lineWidth=1; ctx.strokeStyle='#000'; ctx.stroke(); } ctx.globalAlpha=1; ctx.fillStyle='#eee'; ctx.font='600 11px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(type==='draw'?'Deck':'Discard', x+W/2, y+H/2 - 6); ctx.fillStyle='#ffd166'; ctx.font='10px system-ui'; ctx.fillText(String(count), x+W/2, y+H/2 + 10); ctx.restore(); }

function drawAnimatedCard(ctx, card, x, y, prog){
  const { w:W, h:H } = dims(); ctx.save(); const texKey='hello-'+card.terrain; const img = TextureRegistry?.images?.get(texKey); const alpha = 0.25 + 0.75*prog; ctx.globalAlpha=alpha; roundedRect(ctx,x,y,W,H,10); ctx.clip(); if (img){ const iw=img.width, ih=img.height; const scale=Math.max(W/iw,H/ih); const dw=iw*scale, dh=ih*scale; const dx=x+(W-dw)/2, dy=y+(H-dh)/2; ctx.drawImage(img,dx,dy,dw,dh); const ov=ctx.createLinearGradient(x,y,x,y+H); ov.addColorStop(0,'rgba(0,0,0,'+(0.25*(1-prog)).toFixed(3)+')'); ov.addColorStop(1,'rgba(0,0,0,'+(0.55*(1-prog)).toFixed(3)+')'); ctx.fillStyle=ov; ctx.fillRect(x,y,W,H);} else { const [c0,c1]=cardColor(card.terrain); const grad=ctx.createLinearGradient(x,y,x+W,y+H); grad.addColorStop(0,c0); grad.addColorStop(1,c1); ctx.fillStyle=grad; ctx.fill(); } ctx.restore(); ctx.save(); ctx.lineWidth=1.4; ctx.strokeStyle='#000'; roundedRect(ctx,x,y,W,H,10); ctx.stroke(); const iconCount=Math.max(1, card.range||1); let baseMax=40; if (state.settings?.cardSize==='medium') baseMax=48; else if (state.settings?.cardSize==='large') baseMax=56; const baseMin=10; const shrink=1/(1+Math.log2(iconCount)); let iconSize=Math.round(baseMax*shrink + (baseMin*(1-shrink))); const maxAllowed=Math.floor((W-16)/iconCount - 4); if (isFinite(maxAllowed)&&maxAllowed>0) iconSize=Math.min(iconSize,maxAllowed); if (iconSize<baseMin) iconSize=baseMin; const spacing=Math.max(3,Math.min(8,Math.round(iconSize*0.2))); const totalW=iconCount*iconSize + (iconCount-1)*spacing; const startX=x + (W-totalW)/2; const yIcons=y + (H-iconSize)/2; let iconImg = TextureRegistry?.images?.get('range-icon-'+card.terrain) || TextureRegistry?.images?.get('range-icon'); if (!iconImg) iconImg=getRangeIcon(iconSize); for (let i=0;i<iconCount;i++) ctx.drawImage(iconImg, Math.round(startX + i*(iconSize+spacing)), yIcons, iconSize, iconSize); ctx.restore(); }

function drawEndTurnButton(ctx, canvas){
  const { h:H } = dims(); const b = state.endTurnButton; b.w=140; b.h=44; b.x = canvas.width - b.w - 16; b.y = canvas.height - (H + PADDING) - b.h - 18; ctx.save(); const enabled = state.endTurnEnabled && !state.winner; ctx.globalAlpha = enabled?0.95:0.45; const isHover = state.hoverControl==='endTurn'; const grad = ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.h); if (isHover && enabled){ grad.addColorStop(0,'#3b82f6'); grad.addColorStop(1,'#1d4ed8'); } else { grad.addColorStop(0,'#2563eb'); grad.addColorStop(1,'#1749b3'); } ctx.fillStyle=grad; roundedRect(ctx,b.x,b.y,b.w,b.h,10); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle = isHover && enabled ? '#163d8c':'#0d285a'; ctx.stroke(); ctx.font='600 16px system-ui'; ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('End Turn', b.x + b.w/2, b.y + b.h/2 + 1); ctx.restore(); }

export function updateCardAnimations(dt){ if (!state.cardAnimations.length) return; for (const anim of state.cardAnimations){ anim.t += dt; } const keep=[]; for (const anim of state.cardAnimations){ if (anim.t >= (anim.startDelay||0)+anim.duration){ if (!anim._done){ anim._done=true; if (typeof anim.onComplete==='function') anim.onComplete(); } state.animatingCards.delete(anim.card.id); } else { keep.push(anim); } } state.cardAnimations = keep; }
    // Clip to rounded rect
