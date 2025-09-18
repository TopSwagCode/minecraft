import { state } from '../core/state.js';
import { axialToPixel } from '../view/board.js';

export function animateMove(piece, path, onDone){
  if (!path || path.length < 2) return;
  state.animating = true;
  piece._anim = {
    path,
    segment: 0,
    t: 0,
    duration: 250,
    currentFrom: path[0],
    currentTo: path[1],
    onDone
  };
}

export function updateAnimations(dt){
  let any = false;
  for (const piece of state.pieces){
    if (!piece._anim) continue;
    any = true;
    const a = piece._anim;
    a.t += dt / a.duration;
    if (a.t >= 1){
      piece.pos = a.currentTo;
      a.segment++;
      if (a.segment >= a.path.length - 1){
        delete piece._anim;
        if (a.onDone) a.onDone();
      } else {
        a.currentFrom = a.path[a.segment];
        a.currentTo = a.path[a.segment + 1];
        a.t = 0;
      }
    }
  }
  state.animating = any;
}

export function drawPiece(ctx, p, colors, HEX_SIZE){
  let x,y;
  if (p._anim){
    const a = p._anim.currentFrom; const b = p._anim.currentTo; const t = p._anim.t;
    const pa = axialToPixel(a.q,a.r); const pb = axialToPixel(b.q,b.r);
    x = pa.x + (pb.x - pa.x)*t; y = pa.y + (pb.y - pa.y)*t;
  } else {
    const pos = axialToPixel(p.pos.q,p.pos.r); x=pos.x; y=pos.y;
  }
  const radius = HEX_SIZE * 0.45;
  const isSelected = p.id === state.selectedPieceId;
  // Background circle
  ctx.beginPath(); ctx.arc(x,y,radius,0,Math.PI*2);
  const cfg = state.playerConfig[p.player] || {};
  const base = cfg.color || (p.player === 1 ? colors.p1 : colors.p2);
  // derive light by blending with white
  function lighten(hex){
    try {
      const m = hex.replace('#','');
      const r = parseInt(m.substring(0,2),16), g=parseInt(m.substring(2,4),16), b=parseInt(m.substring(4,6),16);
      const lr = Math.min(255, Math.round(r + (255-r)*0.45));
      const lg = Math.min(255, Math.round(g + (255-g)*0.45));
      const lb = Math.min(255, Math.round(b + (255-b)*0.45));
      return `rgb(${lr},${lg},${lb})`;
    } catch(e){ return colors.p1Light; }
  }
  const light = lighten(base);
  const grd = ctx.createLinearGradient(x-radius,y-radius,x+radius,y+radius);
  grd.addColorStop(0, light); grd.addColorStop(1, base);
  ctx.fillStyle = grd; ctx.fill();

  // Player avatar texture if available
  let drewAvatar = false;
  if (window.TextureRegistry && window.TextureRegistry.images){
  const texKey = cfg.avatar || (p.player === 1 ? 'player-1' : 'player-2');
    const img = window.TextureRegistry.images.get(texKey);
    if (img){
      drewAvatar = true;
      ctx.save();
      ctx.beginPath(); ctx.arc(x,y,radius*0.82,0,Math.PI*2); ctx.closePath(); ctx.clip();
      const size = radius*1.7; // scale inside
      ctx.drawImage(img, x-size/2, y-size/2, size, size);
      ctx.restore();
    }
  }
  if (!drewAvatar){
    // subtle inner circle to show absence
    ctx.beginPath(); ctx.arc(x,y,radius*0.75,0,Math.PI*2); ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.lineWidth=2; ctx.stroke();
  }

  // Selection outline
  ctx.lineWidth = isSelected ? 4 : 2;
  ctx.strokeStyle = isSelected ? colors.highlight : '#111';
  ctx.stroke();

  // ID overlay (only if no avatar texture)
  if (!drewAvatar){
    ctx.font = `${Math.floor(radius*0.65)}px system-ui`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = colors.textShadow; ctx.shadowBlur = 6;
    ctx.fillText(String(p.id), x, y+0.5);
    ctx.shadowBlur = 0;
  }
}
