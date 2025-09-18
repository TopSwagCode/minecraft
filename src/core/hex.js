// Core hex math utilities (pointy-top axial)
export const HEX_DIRS = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 }
];

export function axialDistance(a, b) {
  return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
}
export function add(a,b){ return { q: a.q + b.q, r: a.r + b.r }; }
export function key(c){ return `${c.q},${c.r}`; }

export function roundAxial(f) {
  let x = f.q; let z = f.r; let y = -x - z;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const xDiff = Math.abs(rx - x);
  const yDiff = Math.abs(ry - y);
  const zDiff = Math.abs(rz - z);
  if (xDiff > yDiff && xDiff > zDiff) rx = -ry - rz; else if (yDiff > zDiff) ry = -rx - rz; else rz = -rx - ry;
  return { q: rx, r: rz };
}
