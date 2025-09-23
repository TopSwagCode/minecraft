// Map preview generation: renders a miniature of a map JSON using real hex shapes
// without needing to load the full board into global state. Intended for start screen thumbnails.
// We do a lightweight parse of layout + legend and draw proper pointy-top hexes
// with approximate coloring (and textures when already loaded) to a tiny canvas.

import { TextureRegistry } from '../../textures.js';

// Derive a color based on texture / legend entry similar to classifyTerrain but local (avoid state coupling here)
function inferColorFromTex(tex){
  if (!tex) return '#334155';
  const t = tex.toLowerCase();
  if (t.includes('grass')) return '#166534';
  if (t.includes('sand')) return '#92400e';
  if (t.includes('water')) return '#0e4f6e';
  if (t.includes('mountain') || t.includes('rock')) return '#4b5563';
  if (t.includes('diamond')) return '#0891b2';
  return '#334155';
}

// Build an offscreen canvas preview. Returns the canvas element (caller can append it).
// Options: { maxWidth, maxHeight, tileSize }
export function generateMapPreview(mapJson, options={}){
  const { layout = [], legend = {} } = mapJson || {};
  if (!layout.length) return null;
  // Compute dimensions (#cols = longest line). We treat layout lines as offset rows (staggered every other row)
  const rows = layout.length;
  const cols = Math.max(...layout.map(l => l.length));
  const tileSize = options.tileSize || 8; // radius of hex (corner to center)
  const hexW = Math.sqrt(3) * tileSize; // width corner to corner
  const hexH = 2 * tileSize; // height
  const vertSpacing = 1.5 * tileSize; // vertical distance between hex centers
  const horizSpacing = hexW; // horizontal distance between columns for axial q
  const canvas = document.createElement('canvas');

  // Rough size: width accounts for potential half-offset; add small padding
  const pad = 4;
  canvas.width = Math.ceil(cols * horizSpacing + hexW/2) + pad*2;
  canvas.height = Math.ceil(rows * vertSpacing + tileSize) + pad*2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Background fill (subtle)
  ctx.fillStyle = '#0f1720';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  function drawMiniHex(cx, cy, size, fill, texName){
    const corners = [];
    for (let i=0;i<6;i++){
      const angle = (Math.PI/180)*(60*i - 30);
      corners.push({ x: cx + size*Math.cos(angle), y: cy + size*Math.sin(angle) });
    }
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    for (let i=1;i<6;i++) ctx.lineTo(corners[i].x, corners[i].y);
    ctx.closePath();
    let drewTex = false;
    if (texName && TextureRegistry && TextureRegistry.images && TextureRegistry.images.has(texName)){
      const img = TextureRegistry.images.get(texName);
      if (img){
        ctx.save(); ctx.clip();
        const side = size*2;
        ctx.drawImage(img, cx-size, cy-size, side, side);
        ctx.restore();
        drewTex = true;
      }
    }
    if (!drewTex){ ctx.fillStyle = fill; ctx.fill(); }
    // Outline
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  for (let r=0; r<rows; r++){
    const line = layout[r];
    for (let c=0; c<line.length; c++){
      const ch = line[c];
      if (ch===' ' || ch==='.' || ch==='\t') continue;
      const entry = legend[ch] || {};
      const tex = entry.tex || '';
      const fill = inferColorFromTex(tex);
      // Offset coords: even-r horizontal layout (like earlier simplistic preview)
      const offsetX = (c * horizSpacing) + (r % 2 ? horizSpacing/2 : 0) + pad + hexW/2;
      const offsetY = (r * vertSpacing) + pad + tileSize;
      drawMiniHex(offsetX, offsetY, tileSize*0.95, fill, tex);
    }
  }

  // Auto-scale down if exceeds max dimensions (simple uniform scale into temporary canvas)
  const { maxWidth=180, maxHeight=140 } = options;
  if (canvas.width > maxWidth || canvas.height > maxHeight){
    const scale = Math.min(maxWidth/canvas.width, maxHeight/canvas.height);
    const scaled = document.createElement('canvas');
    scaled.width = Math.max(1, Math.floor(canvas.width * scale));
    scaled.height = Math.max(1, Math.floor(canvas.height * scale));
    const sctx = scaled.getContext('2d');
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
    return scaled;
  }
  return canvas;
}

// Convenience: fetch + generate, with basic caching by path
const _previewCache = new Map();
export async function getMapPreview(path, options={}){
  const key = path + ':' + (TextureRegistry.loaded ? 'tex' : 'notex');
  if (_previewCache.has(key)) return _previewCache.get(key);
  try {
    const res = await fetch(path, { cache:'no-cache' });
    const json = await res.json();
    const canvas = generateMapPreview(json, options) || null;
    if (canvas) _previewCache.set(key, canvas);
    return canvas;
  } catch(e){
    console.warn('Preview generation failed for', path, e);
    return null;
  }
}

// Invalidate when textures finish loading so we can regenerate with textures
if (typeof window !== 'undefined'){
  window.addEventListener('textures-loaded', () => {
    _previewCache.clear();
  });
}
