import { state } from '../core/state.js';
import { HEX_SIZE, COLORS } from '../core/constants.js';
import { key, axialDistance } from '../core/hex.js';
import { terrainOfHex } from '../utils/terrain.js';
import { computeReachable } from '../systems/movement.js';
import { drawPiece } from '../systems/animation.js';
import { drawHand, layoutHand, handleCardPointer } from './handCanvas.js';
import { drawDiamondRain } from '../systems/diamondRain.js';
import { TextureRegistry } from '../../textures.js';

let canvas, ctx;
export function initBoard(){
  canvas = document.getElementById('board');
  ctx = canvas.getContext('2d');
}
export function getCanvas(){ return canvas; }
export function getContext(){ return ctx; }

export function axialToPixel(q,r){
  const cq = q - (state.boardShift?.q || 0);
  const cr = r - (state.boardShift?.r || 0);
  const baseX = HEX_SIZE * Math.sqrt(3) * (cq + cr / 2);
  const baseY = HEX_SIZE * 1.5 * cr;
  const cx = canvas.width / 2; const cy = canvas.height / 2;
  const z = state.zoom || 1;
  // Apply zoom around canvas center, then camera pan after scaling
  const x = cx + (baseX + state.camera.x) * z;
  const y = cy + (baseY + state.camera.y) * z;
  return { x,y };
}

export function pixelToAxial(x,y){
  const cx = canvas.width/2; const cy = canvas.height/2;
  const z = state.zoom || 1;
  // Undo zoom and center translation, then camera pan
  const px = (x - cx)/z - state.camera.x;
  const py = (y - cy)/z - state.camera.y;
  const qLocal = (Math.sqrt(3)/3 * px - 1/3 * py)/HEX_SIZE;
  const rLocal = (2/3 * py)/HEX_SIZE;
  return { q: qLocal + (state.boardShift?.q || 0), r: rLocal + (state.boardShift?.r || 0) };
}

export function drawBoard(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  drawStaticBackground();
  // Draw hex grid (scaled)
  for (const h of state.board.values()) drawHex(h.q,h.r);
  if (state.selectedPieceId != null){
    const piece = state.pieces.find(p => p.id === state.selectedPieceId);
    if (piece){
      const reachable = computeReachable(piece);
      const occ = new Set(state.pieces.map(p=>key(p.pos))); occ.delete(key(piece.pos));
      for (const d of [{q:1,r:0},{q:1,r:-1},{q:0,r:-1},{q:-1,r:0},{q:-1,r:1},{q:0,r:1}]){
        const nxt = { q: piece.pos.q + d.q, r: piece.pos.r + d.r};
        const k = key(nxt); if (!state.board.has(k) || occ.has(k)) continue;
        if (!reachable.find(r => r.q===nxt.q && r.r===nxt.r)){
          const terrain = terrainOfHex(nxt.q,nxt.r);
          let color = 'rgba(255,0,0,0.35)'; if (terrain==='mountain') color='rgba(160,160,160,0.4)';
          drawHex(nxt.q,nxt.r,{ stroke:'rgba(255,0,0,0.6)', lineWidth:1.5, overlay:{ color, alpha:0.28 }});
        }
      }
      let rd = state._reachableData;
      for (const c of reachable){
  let alpha=0.25; if (rd && rd.map){ const entry = rd.map.get(key(c)); if (entry){ const len = entry.path.length -1; alpha = 0.18 + Math.min(1, len/5)*0.32; } }
        drawHex(c.q,c.r,{ stroke: COLORS.highlight, lineWidth:2, overlay:{ color: COLORS.highlight, alpha } });
      }
    }
  }
  // Removed hover preview path rendering per request.
  for (const p of state.pieces) drawPiece(ctx,p,COLORS,HEX_SIZE * (state.zoom || 1));
  // Celebration particles (if winner)
  drawDiamondRain(ctx);
  //drawHUD(); Maybe delete HUD or have as debug option.
  // UI chrome beneath overlays
  drawMusicButton();
  drawSettingsButton();
  drawHelpButton();
  // Hand (cards) should be below overlay panels
  drawHand(ctx, canvas);
  // Winner overlay sits above board & hand but below help/settings (if we prefer winner topmost, move below overlays)
  if (state.winner){ drawWinOverlay(state.winner); }
  // Draw modal overlays LAST so they sit on top of everything else
  if (state.settings.open){ drawSettingsOverlay(); }
  if (state.help.open){ drawHelpOverlay(); }
}

// Cache background image element after first access
let _bgImg = null; let _bgPattern = null; let _bgLastSize = {w:0,h:0};
function drawStaticBackground(){
  // Choose explicit background texture if registered, else procedural gradient
  if (!_bgImg){
    const bgKey = 'background';
    if (TextureRegistry.images.has(bgKey)) _bgImg = TextureRegistry.images.get(bgKey);
  }
  if (_bgImg){
    ctx.save();
    const scale = Math.max(canvas.width/_bgImg.width, canvas.height/_bgImg.height);
    const dw = _bgImg.width*scale, dh=_bgImg.height*scale;
    const dx = (canvas.width-dw)/2, dy=(canvas.height-dh)/2;
    ctx.globalAlpha=0.95;
    ctx.drawImage(_bgImg, dx, dy, dw, dh);
    ctx.restore();
    return;
  }
  // Procedural gradient fallback if no image
  const g = ctx.createRadialGradient(canvas.width*0.5, canvas.height*0.35, 60, canvas.width*0.5, canvas.height*0.5, Math.max(canvas.width,canvas.height)*0.9);
  g.addColorStop(0,'#1d3144');
  g.addColorStop(0.55,'#0f1922');
  g.addColorStop(1,'#070b0f');
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width,canvas.height);
  // Optional subtle stars/noise
  const noiseDensity = 14; // smaller = more sparse
  ctx.save(); ctx.globalAlpha=0.08; ctx.fillStyle='#2c4761';
  for (let y=0;y<canvas.height;y+=noiseDensity){
    for (let x= (y%2)*5; x<canvas.width; x+=noiseDensity){
      if ((x+y)%3===0) ctx.fillRect(x,y,1,1);
    }
  }
  ctx.restore();
}

function drawHUD(){
  ctx.font='14px system-ui'; ctx.fillStyle='#ccc'; ctx.textAlign='left';
  ctx.fillText(`Turn ${state.turn} - Player ${state.currentPlayer}`,12,20);
  ctx.fillText(`${state.mapName}`,12,38);
  const pdata = state.playerData[state.currentPlayer];
  if (pdata){
    const cardStr = pdata.hand.map(c=>`${c.terrain[0].toUpperCase()}${c.range}`).join(' ') || 'None';
    ctx.fillText(`Cards: ${cardStr}`,12,56);
    if (!hasAnyMoves()) { ctx.fillStyle='#fca5a5'; ctx.fillText('No moves available',12,74); ctx.fillStyle='#ccc'; }
  }
}

function drawMusicButton(){
  const b = state.musicButton;
  b.w = 38; b.h = 38; b.x = canvas.width - b.w - 16; b.y = 12;
  ctx.save();
  const isHover = state.hoverControl === 'music';
  const playing = state.music.enabled && state.music.playing;
  ctx.globalAlpha = 0.9;
  const grad = ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
  grad.addColorStop(0, isHover ? '#10b981' : '#059669');
  grad.addColorStop(1, isHover ? '#047857' : '#03694d');
  if (!playing) { grad.addColorStop(0,'#4b5563'); grad.addColorStop(1,'#374151'); }
  ctx.fillStyle = playing ? grad : '#374151';
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b.x,b.y,b.w,b.h,10) : roundedRectPolyfill(ctx,b.x,b.y,b.w,b.h,10); ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle = isHover ? '#064e3b' : '#1f2937'; ctx.stroke();
  // Icon
  ctx.fillStyle = '#fff'; ctx.translate(b.x + b.w/2, b.y + b.h/2);
  if (playing){
    // Pause icon
    const barW = 5; const gap = 5; const h = 16;
    ctx.fillRect(-gap/2 - barW, -h/2, barW, h);
    ctx.fillRect(gap/2, -h/2, barW, h);
  } else {
    // Play triangle
    ctx.beginPath(); ctx.moveTo(-6,-10); ctx.lineTo(12,0); ctx.lineTo(-6,10); ctx.closePath(); ctx.fill();
  }
  if (state.music.muted){
    ctx.strokeStyle='#f87171'; ctx.lineWidth=3; ctx.beginPath(); ctx.moveTo(-14,-14); ctx.lineTo(14,14); ctx.stroke();
  }
  ctx.restore();
}

function drawSettingsButton(){
  const b = state.settingsButton;
  b.w = 38; b.h = 38; b.x = state.musicButton.x - b.w - 12; b.y = 12;
  const isHover = state.hoverControl === 'settings';
  const open = state.settings.open;
  ctx.save(); ctx.globalAlpha=0.9;
  const grad = ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
  if (open){ grad.addColorStop(0,'#8b5cf6'); grad.addColorStop(1,'#6d28d9'); }
  else if (isHover){ grad.addColorStop(0,'#6366f1'); grad.addColorStop(1,'#4338ca'); }
  else { grad.addColorStop(0,'#4f46e5'); grad.addColorStop(1,'#3730a3'); }
  ctx.fillStyle=grad;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b.x,b.y,b.w,b.h,10) : roundedRectPolyfill(ctx,b.x,b.y,b.w,b.h,10); ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle = isHover || open ? '#312e81' : '#1e1b4b'; ctx.stroke();
  // Cog icon
  ctx.translate(b.x + b.w/2, b.y + b.h/2);
  ctx.rotate(open ? 0.4 : 0);
  ctx.fillStyle='#fff';
  const teeth = 8; const R=12; const r=7; ctx.beginPath();
  for (let i=0;i<teeth;i++){
    const a = (i/teeth)*Math.PI*2; const a2 = ((i+0.5)/teeth)*Math.PI*2;
    const x1 = Math.cos(a)*R, y1 = Math.sin(a)*R; const x2 = Math.cos(a2)*r, y2 = Math.sin(a2)*r;
    if (i===0) ctx.moveTo(x1,y1); ctx.lineTo(x1,y1); ctx.lineTo(x2,y2);
  }
  ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.fillStyle='#1e1b4b'; ctx.arc(0,0,5,0,Math.PI*2); ctx.fill();
  ctx.restore();
}

function drawHelpButton(){
  const b = state.helpButton;
  b.w = 38; b.h = 38; b.x = state.settingsButton.x - b.w - 12; b.y = 12;
  const isHover = state.hoverControl === 'help';
  const open = state.help.open;
  ctx.save(); ctx.globalAlpha=0.9;
  const grad = ctx.createLinearGradient(b.x,b.y,b.x,b.y+b.h);
  if (open){ grad.addColorStop(0,'#f59e0b'); grad.addColorStop(1,'#d97706'); }
  else if (isHover){ grad.addColorStop(0,'#fbbf24'); grad.addColorStop(1,'#f59e0b'); }
  else { grad.addColorStop(0,'#f59e0b'); grad.addColorStop(1,'#b45309'); }
  ctx.fillStyle=grad;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(b.x,b.y,b.w,b.h,10) : roundedRectPolyfill(ctx,b.x,b.y,b.w,b.h,10); ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle = isHover || open ? '#92400e':'#78350f'; ctx.stroke();
  // Question mark icon
  ctx.fillStyle='#fff'; ctx.font='700 22px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillText('?', b.x + b.w/2, b.y + b.h/2 + 1);
  ctx.restore();
}

function drawHelpOverlay(){
  const panelW = Math.min(520, canvas.width - 60);
  const panelH = Math.min(480, canvas.height - 60);
  const x = canvas.width/2 - panelW/2;
  const y = canvas.height/2 - panelH/2;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,canvas.width,canvas.height);
  const grad = ctx.createLinearGradient(x,y,x,y+panelH);
  grad.addColorStop(0,'#1f2937'); grad.addColorStop(1,'#111827');
  ctx.fillStyle=grad; ctx.globalAlpha=0.96;
  ctx.beginPath(); ctx.roundRect?ctx.roundRect(x,y,panelW,panelH,18):roundedRectPolyfill(ctx,x,y,panelW,panelH,18); ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle='#374151'; ctx.stroke(); ctx.globalAlpha=1;
  ctx.fillStyle='#fff'; ctx.font='600 26px system-ui'; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText('How to Play', x + panelW/2, y + 18);
  // Content
  const padX = x + 36; let cursorY = y + 70; const maxWidth = panelW - 72;
  ctx.textAlign='left'; ctx.fillStyle='#d1d5db'; ctx.font='14px system-ui';
  function para(text){ const words=text.split(/\s+/); let line=''; const lh=20; for (const w of words){ const test=line? line+' '+w : w; const m=ctx.measureText(test).width; if (m>maxWidth){ ctx.fillText(line,padX,cursorY); cursorY+=lh; line=w; } else line=test; } if (line){ ctx.fillText(line,padX,cursorY); cursorY+=lh; } cursorY+=4; }
  // Rules summary
  ctx.fillStyle='#fbbf24'; ctx.font='600 15px system-ui'; ctx.fillText('Goal', padX, cursorY+4); cursorY+=26; ctx.fillStyle='#d1d5db'; ctx.font='14px system-ui';
  para('Reach the diamond terrain or fulfill the victory condition by moving your piece strategically across the hex map.');
  ctx.fillStyle='#fbbf24'; ctx.font='600 15px system-ui'; ctx.fillText('Turns', padX, cursorY+4); cursorY+=26; ctx.fillStyle='#d1d5db'; ctx.font='14px system-ui';
  para('Players alternate turns. On your turn select a card from your hand, then choose a reachable path of hexes to move. Range icons on a card show how far movement can extend. Different terrains may influence movement options.');
  // Deck info
  const pdata = state.playerData[state.currentPlayer];
  ctx.fillStyle='#fbbf24'; ctx.font='600 15px system-ui'; ctx.fillText('Tips', padX, cursorY+4); cursorY+=26; ctx.fillStyle='#d1d5db'; ctx.font='14px system-ui';
  para('Use zoom (mouse wheel / pinch) and drag to pan the board for better tactical visibility.');
  // Author info
  ctx.fillStyle='#fbbf24'; ctx.font='600 15px system-ui'; ctx.fillText('About', padX, cursorY+4); cursorY+=26; ctx.fillStyle='#d1d5db'; ctx.font='14px system-ui';
  para('Created by Joshua Ryder (TopSwagCode). This prototype game I created for my son who loves minecraft. It demonstrates a turn-based hex movement & card-range mechanic. Feedback and ideas are welcome!');
  // Close button
  const btnW = 160, btnH = 50; const btnX = x + panelW/2 - btnW/2; const btnY = y + panelH - btnH - 28; const hover = state.hoverControl==='help:close';
  const g = ctx.createLinearGradient(btnX,btnY,btnX,btnY+btnH); if (hover){ g.addColorStop(0,'#3b82f6'); g.addColorStop(1,'#1d4ed8'); } else { g.addColorStop(0,'#2563eb'); g.addColorStop(1,'#1749b3'); }
  ctx.fillStyle=g; ctx.beginPath(); ctx.roundRect?ctx.roundRect(btnX,btnY,btnW,btnH,14):roundedRectPolyfill(ctx,btnX,btnY,btnW,btnH,14); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle= hover? '#163d8c':'#0d285a'; ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font='600 18px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('Close', btnX+btnW/2, btnY+btnH/2+1);
  state._helpInteractive.panelRect = { x, y, w: panelW, h: panelH };
  state._helpInteractive.closeButton = { x: btnX, y: btnY, w: btnW, h: btnH };
  ctx.restore();
}

function drawSettingsOverlay(){
  const panelW = Math.min(440, canvas.width - 60);
  const panelH = 420; // increased to accommodate buttons below card size
  const x = canvas.width/2 - panelW/2;
  const y = canvas.height/2 - panelH/2;
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(0,0,canvas.width,canvas.height);
  const grad = ctx.createLinearGradient(x,y,x,y+panelH);
  grad.addColorStop(0,'#1f2937'); grad.addColorStop(1,'#111827');
  ctx.fillStyle=grad; ctx.globalAlpha=0.96;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x,y,panelW,panelH,18) : roundedRectPolyfill(ctx,x,y,panelW,panelH,18); ctx.fill();
  ctx.lineWidth=2; ctx.strokeStyle='#374151'; ctx.stroke(); ctx.globalAlpha=1;
  ctx.fillStyle='#fff'; ctx.font='600 26px system-ui'; ctx.textAlign='center'; ctx.textBaseline='top';
  ctx.fillText('Settings', x + panelW/2, y + 18);
  // Volume slider
  const sliderX = x + 50; const sliderY = y + 90; const sliderW = panelW - 100; const sliderH = 14;
  const trackRadius = 7;
  const vol = state.music.muted ? 0 : state.music.volume;
  ctx.fillStyle='#1f2937'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sliderX,sliderY,sliderW,sliderH,trackRadius) : roundedRectPolyfill(ctx,sliderX,sliderY,sliderW,sliderH,trackRadius); ctx.fill();
  const fillW = vol * sliderW;
  const gradFill = ctx.createLinearGradient(sliderX,sliderY,sliderX+sliderW,sliderY);
  gradFill.addColorStop(0,'#10b981'); gradFill.addColorStop(1,'#047857');
  ctx.fillStyle=gradFill; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(sliderX,sliderY,fillW,sliderH,trackRadius) : roundedRectPolyfill(ctx,sliderX,sliderY,fillW,sliderH,trackRadius); ctx.fill();
  const knobX = sliderX + fillW; const knobR = 11; ctx.beginPath(); ctx.arc(knobX, sliderY+sliderH/2, knobR, 0, Math.PI*2); ctx.fillStyle='#f0fdfa'; ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#065f46'; ctx.stroke();
  ctx.font='14px system-ui'; ctx.fillStyle='#d1d5db'; ctx.textAlign='left'; ctx.fillText('Music Volume', sliderX, sliderY - 26);
  // Card size buttons
  const sizes = ['small','medium','large'];
  const btnW = (panelW - 100 - 20)/3; const btnH = 46; const btnY = y + 170; let btnX = x + 50;
  state._settingsInteractive.cardSizeButtons = [];
  sizes.forEach(s => {
    const isActive = state.settings.cardSize === s;
    const hover = state.hoverControl === 'card-size:'+s;
    const g = ctx.createLinearGradient(btnX,btnY,btnX,btnY+btnH);
    if (isActive){ g.addColorStop(0,'#2563eb'); g.addColorStop(1,'#1d4ed8'); }
    else if (hover){ g.addColorStop(0,'#374151'); g.addColorStop(1,'#1f2937'); }
    else { g.addColorStop(0,'#283341'); g.addColorStop(1,'#1d2731'); }
    ctx.fillStyle=g; ctx.globalAlpha=0.95; ctx.beginPath(); ctx.roundRect?ctx.roundRect(btnX,btnY,btnW,btnH,12):roundedRectPolyfill(ctx,btnX,btnY,btnW,btnH,12); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle = isActive? '#0d285a':'#111827'; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.font='600 15px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(s[0].toUpperCase()+s.slice(1), btnX+btnW/2, btnY+btnH/2+1);
    state._settingsInteractive.cardSizeButtons.push({ id:s, x:btnX, y:btnY, w:btnW, h:btnH });
    btnX += btnW + 10;
  });
  ctx.fillStyle='#d1d5db'; ctx.font='14px system-ui'; ctx.textAlign='left'; ctx.fillText('Card Size', x+50, btnY - 28);
  // Back to start menu button
  const backW = panelW - 100; const backH = 54; const backX = x + 50;
  // Place resume and return buttons BELOW card size section
  const cardBottom = btnY + btnH; // bottom of card size buttons
  const resumeH = 50; const resumeX = backX; const resumeW = backW;
  const resumeY = cardBottom + 32; // gap below card size
  const backY = resumeY + resumeH + 18; // gap between resume and return
  const hoverResume = state.hoverControl === 'settings:resume';
  const gr = ctx.createLinearGradient(resumeX,resumeY,resumeX,resumeY+resumeH);
  if (hoverResume){ gr.addColorStop(0,'#10b981'); gr.addColorStop(1,'#059669'); } else { gr.addColorStop(0,'#047857'); gr.addColorStop(1,'#065f46'); }
  ctx.fillStyle=gr; ctx.beginPath(); ctx.roundRect?ctx.roundRect(resumeX,resumeY,resumeW,resumeH,14):roundedRectPolyfill(ctx,resumeX,resumeY,resumeW,resumeH,14); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle= hoverResume? '#064e3b':'#033228'; ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font='600 18px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('Resume Game', resumeX+resumeW/2, resumeY+resumeH/2+1);
  state._settingsInteractive.resumeButton = { x: resumeX, y: resumeY, w: resumeW, h: resumeH };
  const hoverBack = state.hoverControl === 'settings:back-start';
  const gb = ctx.createLinearGradient(backX,backY,backX,backY+backH);
  if (hoverBack){ gb.addColorStop(0,'#3b82f6'); gb.addColorStop(1,'#1d4ed8'); }
  else { gb.addColorStop(0,'#2563eb'); gb.addColorStop(1,'#1749b3'); }
  ctx.fillStyle=gb; ctx.beginPath(); ctx.roundRect?ctx.roundRect(backX,backY,backW,backH,14):roundedRectPolyfill(ctx,backX,backY,backW,backH,14); ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle= hoverBack? '#163d8c':'#0d285a'; ctx.stroke();
  ctx.fillStyle='#fff'; ctx.font='600 18px system-ui'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('Return to Start Menu', backX+backW/2, backY+backH/2+1);
  state._settingsInteractive.toStartButton = { x: backX, y: backY, w: backW, h: backH };
  // Save slider interactive regions
  state._settingsInteractive.volumeSlider.track = { x: sliderX, y: sliderY, w: sliderW, h: sliderH };
  state._settingsInteractive.volumeSlider.knob = { x: knobX - knobR, y: sliderY, w: knobR*2, h: sliderH };
  // Store panel rectangle for outside-click detection
  state._settingsInteractive.panelRect = { x, y, w: panelW, h: panelH };
  ctx.restore();
}

function drawWinOverlay(player){
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle = '#fff';
  ctx.font = '48px system-ui';
  ctx.textAlign='center'; ctx.textBaseline='middle';
  const cfg = state.playerConfig && state.playerConfig[player];
  const name = (cfg && cfg.name) ? cfg.name : `Player ${player}`;
  ctx.fillText(`${name} Wins!`, canvas.width/2, canvas.height/2);
  ctx.font='20px system-ui';
  ctx.fillText('Choose an option:', canvas.width/2, canvas.height/2 + 50);

  // Buttons
  const labels = [ { id:'play-again', label:'Play Again' }, { id:'start-screen', label:'Start Setup' } ];
  const btnW = 200, btnH = 50; const gap = 30;
  const totalW = btnW*labels.length + gap*(labels.length-1);
  let startX = canvas.width/2 - totalW/2;
  const y = canvas.height/2 + 120;
  state.winButtons = [];
  ctx.font = '600 20px system-ui';
  labels.forEach((b, idx) => {
    const x = startX + idx*(btnW + gap);
    const isHover = state.hoverControl === 'win:'+b.id;
    const grad = ctx.createLinearGradient(x,y,x,y+btnH);
    if (isHover){
      grad.addColorStop(0,'#3b82f6'); grad.addColorStop(1,'#1d4ed8');
    } else {
      grad.addColorStop(0,'#2563eb'); grad.addColorStop(1,'#1749b3');
    }
    ctx.fillStyle = grad; ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x,y,btnW,btnH,12) : (ctx.save(),roundedRectPolyfill(ctx,x,y,btnW,btnH,12));
    ctx.fill(); ctx.lineWidth=2; ctx.strokeStyle='#0d285a'; ctx.stroke();
    ctx.fillStyle='#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(b.label, x+btnW/2, y+btnH/2+1);
    state.winButtons.push({ id:b.id, label:b.label, x, y, w:btnW, h:btnH });
  });
  ctx.restore();
}

function roundedRectPolyfill(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath(); ctx.restore();
}

// drawPreviewPath removed.

function drawHex(q,r, opts={}){
  const { x,y } = axialToPixel(q,r);
  const z = state.zoom || 1;
  const scaledSize = HEX_SIZE * z;
  const corners=[]; for (let i=0;i<6;i++){ const angle = Math.PI/180*(60*i - 30); const cx = x + scaledSize*Math.cos(angle); const cy = y + scaledSize*Math.sin(angle); corners.push({x:cx,y:cy}); }
  ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y); for (let i=1;i<6;i++) ctx.lineTo(corners[i].x,corners[i].y); ctx.closePath();
  if (state.texturesReady){
    const texName = state.hexTextureAssignments.get(key({q,r}));
    let img = null;
    if (window.TextureRegistry && window.TextureRegistry.images){ img = texName && window.TextureRegistry.images.get(texName); }
    if (img){ ctx.save(); ctx.clip(); const size = scaledSize*2; ctx.drawImage(img,x-scaledSize,y-scaledSize,size,size); ctx.restore(); }
    else { ctx.fillStyle = opts.fill || COLORS.boardFill; ctx.fill(); }
  } else { ctx.fillStyle = opts.fill || COLORS.boardFill; ctx.fill(); }
  // Diamond special highlight overlay ring
  const terr = state.hexTerrain.get(key({q,r}));
  if (terr === 'diamond'){
    ctx.save();
    ctx.lineWidth = 4 * z; ctx.strokeStyle = '#00e5ff';
    ctx.stroke();
    ctx.globalAlpha = 0.22; ctx.fillStyle='#00e5ff';
    ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y); for (let i=1;i<6;i++) ctx.lineTo(corners[i].x,corners[i].y); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
  }
  if (opts.stroke !== false){ ctx.strokeStyle = opts.stroke || COLORS.gridLine; ctx.lineWidth = (opts.lineWidth || 1.2) * z; ctx.stroke(); }
  if (opts.overlay){ ctx.fillStyle = opts.overlay.color; ctx.globalAlpha = opts.overlay.alpha ?? 0.35; ctx.beginPath(); ctx.moveTo(corners[0].x,corners[0].y); for (let i=1;i<6;i++) ctx.lineTo(corners[i].x,corners[i].y); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1; }
}

export function hasAnyMoves(){
  for (const p of state.pieces){ if (p.player !== state.currentPlayer) continue; if (computeReachable(p).length) return true; }
  return false;
}
