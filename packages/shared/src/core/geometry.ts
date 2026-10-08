export interface Vec2 { x: number; y: number }

export const vec = (x = 0, y = 0): Vec2 => ({ x, y });
export const len = (v: Vec2): number => Math.hypot(v.x, v.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export function norm(v: Vec2): Vec2 {
  const l = len(v);
  return l > 1e-9 ? { x: v.x / l, y: v.y / l } : { x: 0, y: 0 };
}
export const fromAngle = (a: number, l = 1): Vec2 => ({ x: Math.cos(a) * l, y: Math.sin(a) * l });
export const angleOf = (v: Vec2): number => Math.atan2(v.y, v.x);

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const degToRad = (d: number): number => (d * Math.PI) / 180;

export const tileKey = (x: number, y: number): string => `${x},${y}`;
export function parseTileKey(k: string): [number, number] {
  const i = k.indexOf(',');
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
}
