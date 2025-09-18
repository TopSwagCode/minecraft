import { HEX_SIZE, COLORS, CARD_TYPES } from '../core/constants.js';
import { key } from '../core/hex.js';
import { computeReachable } from '../systems/movement.js';
import { handEmpty, summarizeHand, terrainOfHex } from '../utils/terrain.js';

// axial <-> pixel conversion (boardShift on state)
export function axialToPixel(q,r,state){
  const cq = q - (state.boardShift?.q || 0);
  const cr = r - (state.boardShift?.r || 0);
  const cx = state.canvas.width / 2;
  const cy = state.canvas.height / 2;
  const x = HEX_SIZE * Math.sqrt(3) * (cq + cr / 2) + cx;
  const y = HEX_SIZE * 1.5 * cr + cy;
  return { x, y };
}

export function draw(state){
  const { ctx, canvas } = state;
  ctx.clearRect(0,0,canvas.width,canvas.height);
  for (const h of state.board.values()) drawHex(state, h.q, h.r);

  if (state.selectedPieceId != null){
    const piece = state.pieces.find(p => p.id === state.selectedPieceId);
    if (piece){
      const reachable = computeReachable(state, piece);
      const occ = new Set(state.pieces.map(p => key(p.pos)));
      occ.delete(key(piece.pos));
      for (const d of state.HEX_DIRS) {
        const nxt = { q: piece.pos.q + d.q, r: piece.pos.r + d.r };
        const k = key(nxt);
        if (!state.board.has(k) || occ.has(k)) continue;
        if (!reachable.find(r => r.q === nxt.q && r.r === nxt.r)) {
          const terrain = terrainOfHex(state, nxt.q, nxt.r);
            let color = 'rgba(255,0,0,0.35)';
            if (terrain === 'mountain') color = 'rgba(160,160,160,0.4)';
            drawHex(state, nxt.q, nxt.r, { stroke: 'rgba(255,0,0,0.6)', lineWidth: 1.5, overlay: { color, alpha: 0.28 } });
        }
      }
      let rd = state._reachableData;
      for (const c of reachable){
        let alpha = 0.25;
        if (rd && rd.map){
          const entry = rd.map.get(key(c));
          if (entry){
            const len = entry.path.length - 1;
            alpha = 0.18 + Math.min(1, len/5) * 0.32;
          }
        }
        drawHex(state, c.q, c.r, { stroke: COLORS.highlight, lineWidth: 2, overlay: { color: COLORS.highlight, alpha } });
      }
    }
  }

  if (state.previewPath && state.previewPath.length > 1){
    ctx.save();
    ctx.lineWidth = 6; ctx.lineCap='round'; ctx.lineJoin='round';
    ctx.strokeStyle='rgba(0,0,0,0.55)';
    ctx.beginPath();
    for (let i=0;i<state.previewPath.length;i++){
      const { x, y } = axialToPixel(state.previewPath[i].q, state.previewPath[i].r, state);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.lineWidth=3;
    const grad = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
    grad.addColorStop(0,'#ffe08a'); grad.addColorStop(1,'#ffb347');
    ctx.strokeStyle=grad; ctx.beginPath();
    for (let i=0;i<state.previewPath.length;i++){
      const { x, y } = axialToPixel(state.previewPath[i].q, state.previewPath[i].r, state);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    for (let i=1;i<state.previewPath.length;i++){
      const { x, y } = axialToPixel(state.previewPath[i].q, state.previewPath[i].r, state);
      ctx.beginPath(); ctx.fillStyle='#ffd166'; ctx.arc(x,y,6,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='#553300'; ctx.font='10px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(String(i), x, y+0.5);
    }
    ctx.restore();
  }

  for (const p of state.pieces) drawPiece(state, p);

  // HUD
  ctx.font='14px system-ui'; ctx.fillStyle='#ccc'; ctx.textAlign='left';
  ctx.fillText(`Turn ${state.turn} - Player ${state.currentPlayer}`, 12, 20);
  ctx.fillText(`${state.mapName}`, 12, 38);
  const pdata = state.playerData[state.currentPlayer];
  if (pdata){
    ctx.fillText(`Cards: ${pdata.hand.join(', ') || 'None'}`, 12, 56);
    if (!state.hasAnyMovesFn(state)){
      ctx.fillStyle='#fca5a5'; ctx.fillText('No moves available', 12, 74); ctx.fillStyle='#ccc';
    }
  }
}

function drawHex(state,q,r,opts={}){
  const { ctx } = state;
  const { x, y } = axialToPixel(q,r,state);
  const corners = [];
  for (let i=0;i<6;i++){
    const angle = Math.PI/180 * (60 * i - 30);
    const cx = x + HEX_SIZE * Math.cos(angle);
    const cy = y + HEX_SIZE * Math.sin(angle);
    corners.push({x:cx,y:cy});
  }
  ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y);
  for (let i=1;i<6;i++) ctx.lineTo(corners[i].x,corners[i].y); ctx.closePath();
  if (state.texturesReady){
    const texName = state.hexTextureAssignments.get(key({q,r}));
    let img = null;
    const reg = state.TextureRegistryRef || (window.TextureRegistry || {});
    if (reg && reg.images) img = texName && reg.images.get(texName);
    if (img){
      ctx.save(); ctx.clip(); const size = HEX_SIZE * 2;
      ctx.drawImage(img, x-HEX_SIZE, y-HEX_SIZE, size, size); ctx.restore();
    } else { ctx.fillStyle = opts.fill || COLORS.boardFill; ctx.fill(); }
  } else { ctx.fillStyle = opts.fill || COLORS.boardFill; ctx.fill(); }
  if (opts.stroke !== false){ ctx.strokeStyle = opts.stroke || COLORS.gridLine; ctx.lineWidth = opts.lineWidth || 1.2; ctx.stroke(); }
  if (opts.overlay){
    ctx.fillStyle = opts.overlay.color; ctx.globalAlpha = opts.overlay.alpha ?? 0.35;
    ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y); for (let i=1;i<6;i++) ctx.lineTo(corners[i].x,corners[i].y); ctx.closePath(); ctx.fill(); ctx.globalAlpha=1;
  }
}

function drawPiece(state,p){
  const { ctx } = state;
  let x,y;
  if (p._anim){
    const a = p._anim.currentFrom; const b = p._anim.currentTo; const t = p._anim.t;
    const pa = axialToPixel(a.q,a.r,state); const pb = axialToPixel(b.q,b.r,state);
    x = pa.x + (pb.x - pa.x)*t; y = pa.y + (pb.y - pa.y)*t;
  } else { ({x,y} = axialToPixel(p.pos.q,p.pos.r,state)); }
  const radius = HEX_SIZE * 0.45;
  const isSelected = p.id === state.selectedPieceId;
  ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2);
  const base = p.player === 1 ? COLORS.p1 : COLORS.p2;
  const light = p.player === 1 ? COLORS.p1Light : COLORS.p2Light;
  const grd = ctx.createLinearGradient(x-radius,y-radius,x+radius,y+radius);
  grd.addColorStop(0,light); grd.addColorStop(1,base);
  ctx.fillStyle=grd; ctx.fill(); ctx.lineWidth = isSelected ? 4 : 2; ctx.strokeStyle = isSelected ? COLORS.highlight : '#111'; ctx.stroke();
  ctx.font=`${Math.floor(radius*0.9)}px system-ui`; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillStyle='#fff'; ctx.shadowColor=COLORS.textShadow; ctx.shadowBlur=6; ctx.fillText(String(p.id), x, y+1); ctx.shadowBlur=0;
}
