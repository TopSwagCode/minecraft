import { state } from '../core/state.js';
import { key } from '../core/hex.js';

export function classifyTerrain(tex){
  if (!tex) return 'unknown';
  const t = String(tex).toLowerCase();
  if (t.includes('grass')) return 'grass';
  if (t.includes('sand')) return 'sand';
  if (t.includes('water')) return 'water';
  if (t.includes('mountain') || t.includes('rock')) return 'mountain';
  if (t.includes('diamond')) return 'diamond';
  return 'unknown';
}

export function terrainOfHex(q,r){
  const k = key({q,r});
  if (state.hexTerrain.has(k)) return state.hexTerrain.get(k);
  const tex = state.hexTextureAssignments.get(k) || '';
  const t = classifyTerrain(tex);
  state.hexTerrain.set(k, t);
  return t;
}
