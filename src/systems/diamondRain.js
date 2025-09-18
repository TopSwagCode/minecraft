import { state } from '../core/state.js';

// Simple particle structure: {x,y,vy,rot,vr,size,img}
const diamonds = [];
let lastSpawn = 0;
const SPAWN_INTERVAL = 60; // ms between spawns
const MAX_PARTICLES = 120;

export function resetDiamondRain(){
  diamonds.length = 0; lastSpawn = 0;
}

function spawn(canvas){
  if (!canvas) return;
  if (diamonds.length >= MAX_PARTICLES) return;
  const img = window.TextureRegistry && window.TextureRegistry.images.get('diamond-sprite');
  const x = Math.random()*canvas.width;
  const size = 24 + Math.random()*52; // 24 - 76 px
  const vy = 60 + Math.random()*140; // fall speed
  const rot = Math.random()*Math.PI*2;
  const vr = (Math.random()*0.6 - 0.3); // rotation speed
  diamonds.push({x, y: -size, vy, rot, vr, size, img});
}

export function updateDiamondRain(dt, canvas){
  if (!state.winner) return;
  lastSpawn += dt;
  while (lastSpawn > SPAWN_INTERVAL){
    spawn(canvas); lastSpawn -= SPAWN_INTERVAL;
  }
  for (let i=diamonds.length-1; i>=0; i--){
    const d = diamonds[i];
    d.y += d.vy * (dt/1000);
    d.rot += d.vr * (dt/1000);
    // Remove only after fully leaving viewport
    if (d.y - d.size/2 > (canvas?.height||0)){ diamonds.splice(i,1); }
  }
}

export function drawDiamondRain(ctx){
  if (!state.winner) return;
  for (const d of diamonds){
    const img = d.img;
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.rot);
    const s = d.size;
    if (img){
      ctx.globalAlpha = 0.85;
      ctx.drawImage(img, -s/2, -s/2, s, s);
    } else {
      // fallback diamond shape
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = '#00e5ff';
      ctx.beginPath();
      ctx.moveTo(0,-s/2);
      ctx.lineTo(s/2,0);
      ctx.lineTo(0,s/2);
      ctx.lineTo(-s/2,0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}
