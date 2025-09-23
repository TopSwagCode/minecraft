// Texture scaffold: simple loader and registry
// Usage:
//   import or include after game.js (or before draw calls) and use registerTextureSource / loadAllTextures

export const TextureRegistry = {
  sources: new Map(), // name -> url
  images: new Map(),  // name -> HTMLImageElement
  loaded: false,
};
if (typeof window !== 'undefined') {
  window.TextureRegistry = TextureRegistry;
}

export function registerTextureSource(name, url) {
  TextureRegistry.sources.set(name, url);
}

export function loadAllTextures() {
  const promises = [];
  for (const [name, url] of TextureRegistry.sources.entries()) {
    promises.push(new Promise(res => {
      const img = new Image();
      img.onload = () => { TextureRegistry.images.set(name, img); res(); };
      img.onerror = () => { console.warn('Failed to load texture', name, url); res(); };
      img.src = url;
    }));
  }
  return Promise.all(promises).then(() => { TextureRegistry.loaded = true; });
}
if (typeof window !== 'undefined') {
  window.loadAllTextures = loadAllTextures;
}

// Default example registrations (now under src/assets/images). Adjust if bundler rewrites paths.
export function registerDefaultTextures(basePath = 'src/assets/images') {
  const baseVariants = [basePath, basePath.replace(/^src\//,'')]; // try with and without leading src/
  const tryRegister = (name, relative) => {
    for (const b of baseVariants) {
      const url = `${b}/${relative}`;
      if (!TextureRegistry.sources.has(name)) {
        registerTextureSource(name, url);
        break; // stop after first variant used
      }
    }
  };
  // Static background (new) - must be named background.png in assets
  tryRegister('background', 'background.png');
  // Core terrain set
  tryRegister('hello-grass', 'hello_grass.png');
  tryRegister('hello-water', 'hello_water.png');
  tryRegister('hello-sand',  'hello_sand.png');
  tryRegister('hello-mountain',  'hello_mountain.png');
  tryRegister('hello-diamond', 'hello_diamond.png');
  // Diamond rain sprite (used for win celebration)
  tryRegister('diamond-sprite', 'diamond.png');
  // Player piece avatars
  tryRegister('player-1', 'players/steve.png');
  tryRegister('player-2', 'players/alex.png');
  tryRegister('player-3', 'players/villager.png');
  tryRegister('player-4', 'players/enderman.png');
  tryRegister('player-5', 'players/zombie.png');
  tryRegister('player-6', 'players/skeleton.png');
  // Range icon (user can replace file path or provide alternative format like webp)
  tryRegister('range-icon', 'range_icon.webp');
  // Terrain specific range icons (optional overrides)
  tryRegister('range-icon-grass', 'range_icon_grass.png');
  tryRegister('range-icon-water', 'range_icon_water.png');
  tryRegister('range-icon-sand', 'range_icon_sand.png');
  tryRegister('range-icon-mountain', 'range_icon_mountain.webp');
  tryRegister('range-icon-diamond', 'range_icon_diamond.webp');
}

// Auto-register if running in browser and not already populated
if (typeof window !== 'undefined' && TextureRegistry.sources.size === 0) {
  registerDefaultTextures();
}

// Optional debug helper to verify textures after loadAllTextures
if (typeof window !== 'undefined') {
  const _dbg = function(){
    console.table([...TextureRegistry.images.keys()].map(k => ({ key: k })));
    const missing = ['player-1','player-2','player-3','player-4','player-5','player-6'].filter(k => !TextureRegistry.images.has(k));
    if (missing.length) console.warn('Missing player textures:', missing);
  };
  // Attach both as property and global symbol for convenience
  window.debugListTextures = _dbg;
  try { globalThis.debugListTextures = _dbg; } catch(_) {}
  if (!('debugListTextures' in window)) {
    console.warn('[textures] Failed to expose debugListTextures on window');
  } else {
    console.log('[textures] debugListTextures available via window.debugListTextures()');
  }

  // Fallback auto-registration for player avatars if they were absent in earlier builds
  function ensurePlayerAvatars() {
    const havePlayers = TextureRegistry.sources.has('player-1') && TextureRegistry.sources.has('player-2');
    if (havePlayers) return false;
    // Try to infer base path from an existing terrain texture
    let basePrefix = '';
    const sample = TextureRegistry.sources.get('hello-grass');
    if (sample) {
      basePrefix = sample.replace(/hello_grass\.png.*/,'');
    }
    // Common guesses if inference failed
    const guesses = [basePrefix, 'images/', 'assets/images/', 'src/assets/images/'];
    let registered = false;
    for (const g of guesses) {
      if (!g) continue;
      const p1 = g.endsWith('/') ? g + 'players/player1.png' : g + 'players/player1.png';
      const p2 = g.endsWith('/') ? g + 'players/player2.png' : g + 'players/player2.png';
      // Simple heuristic: only accept if g appears in an existing source OR is the first non-empty guess
      const valid = [...TextureRegistry.sources.values()].some(v => v.startsWith(g)) || g === guesses[0];
      if (valid) {
        if (!TextureRegistry.sources.has('player-1')) registerTextureSource('player-1', p1);
        if (!TextureRegistry.sources.has('player-2')) registerTextureSource('player-2', p2);
        registered = true;
        break;
      }
    }
    // If textures already loaded earlier, load the new avatar images immediately
    if (registered && TextureRegistry.loaded) {
      const newOnes = ['player-1','player-2'].filter(k => !TextureRegistry.images.has(k));
      newOnes.forEach(name => {
        const url = TextureRegistry.sources.get(name);
        if (!url) return;
        const img = new Image();
        img.onload = () => { TextureRegistry.images.set(name, img); };
        img.onerror = () => console.warn('Failed to late-load avatar', name, url);
        img.src = url;
      });
    }
    return registered;
  }
  window.ensurePlayerAvatars = ensurePlayerAvatars;
  try { globalThis.ensurePlayerAvatars = ensurePlayerAvatars; } catch(_) {}
  // Attempt immediately (harmless if already present)
  ensurePlayerAvatars();

  // NEW: Ensure core terrain textures present if they disappeared (e.g., manual edits)
  (function ensureTerrainSet(){
    const terrainKeys = ['hello-grass','hello-water','hello-sand','hello-mountain','hello-diamond'];
    const missing = terrainKeys.filter(k => !TextureRegistry.sources.has(k));
    if (!missing.length) return;
    // Reuse player avatar inference logic for base path guess
    let base = '';
    const existingAny = [...TextureRegistry.sources.values()][0];
    if (existingAny) {
      const slash = existingAny.lastIndexOf('/');
      if (slash !== -1) base = existingAny.slice(0, slash+1);
    }
    if (!base) base = 'images/';
    missing.forEach(m => {
      const name = m.replace('hello-','');
      registerTextureSource(m, base + (m === 'hello-mountain' ? 'hello_mountain.png' : `hello_${name}.png`));
    });
    if (TextureRegistry.loaded){
      missing.forEach(m => {
        const url = TextureRegistry.sources.get(m); if (!url) return;
        const img = new Image(); img.onload = () => TextureRegistry.images.set(m,img); img.onerror = () => console.warn('Failed reload terrain tex', m, url); img.src = url; });
    }
  })();
}
