import { hashString, type Tenant } from '@df/shared';
import { moveAndCollide } from '../../engine/collision';
import type { Game } from '../Game';
import { Actor } from './Entity';

/** Looks (art/npcs/tenants/look_N.png), picked per tenant. */
const LOOKS = Array.from({ length: 9 }, (_, i) => `npcs/tenants/look_${i + 1}`);

/** A tenant's sprite: the same face in the world and in your phone's contacts. */
export function tenantLook(id: string): string {
  return LOOKS[hashString(id) % LOOKS.length]!;
}

/**
 * A tenant or applicant, live while their unit is near the camera (off-screen they're abstract).
 * They wander their unit, stand by their bed at night, and keep away from monsters.
 */
export class TenantNpc extends Actor {
  readonly tenantId: string;
  /** The room their sign is in (for streaming). */
  roomId = '';
  /** Floor tiles of their unit ("x,y"), where they may wander. */
  private tiles: [number, number][];
  private target: { x: number; y: number } | null = null;
  private wait = Math.random() * 2;
  /** Where they stand at night (by their bed), if they have one. */
  bedSpot: { x: number; y: number } | null = null;

  /** Which member of the household (0 is who you deal with; 2+ are kids). */
  readonly member: number;

  constructor(t: Tenant, x: number, y: number, unitTiles: string[], member = 0) {
    super(member ? tenantLook(`${t.id}:${member}`) : tenantLook(t.id), t.status === 'applicant' ? 0xe0e0f0 : 0xffffff);
    this.member = member;
    this.tenantId = t.id;
    this.x = x;
    this.y = y;
    this.radius = 0.3;
    this.tiles = unitTiles.map((k) => k.split(',').map(Number) as [number, number]);
  }

  update(game: Game, dt: number, restAt: { x: number; y: number } | null): void {
    let speed = 1.6;
    let dx = 0, dy = 0;
    const threat = game.room.enemies.find((e) => !e.dead && Math.hypot(e.x - this.x, e.y - this.y) < 3.5);
    if (threat) {
      // Keep away from monsters.
      const d = Math.hypot(this.x - threat.x, this.y - threat.y) || 1;
      dx = (this.x - threat.x) / d;
      dy = (this.y - threat.y) / d;
      speed = 3.2;
      this.target = null;
    } else {
      if (!this.target || Math.hypot(this.target.x - this.x, this.target.y - this.y) < 0.2) {
        this.target = null;
        this.wait -= dt;
        if (this.wait <= 0) {
          this.wait = 1.5 + Math.random() * 3;
          this.target = restAt ?? this.pickSpot();
        }
      }
      if (this.target) {
        const d = Math.hypot(this.target.x - this.x, this.target.y - this.y) || 1;
        dx = (this.target.x - this.x) / d;
        dy = (this.target.y - this.y) / d;
      }
    }
    const kn = this.knockStep(dt);
    const res = moveAndCollide(this.x, this.y, this.footing(0.9), dx * speed * dt + kn.dx, dy * speed * dt + kn.dy, game.room.blockerFor('walk', 'enemy'));
    if (this.target && res.x === this.x && res.y === this.y && (dx || dy)) this.target = null;
    this.x = res.x;
    this.y = res.y;
    this.flash = Math.max(0, this.flash - dt);
  }

  /** A nearby tile of their unit to wander to. */
  private pickSpot(): { x: number; y: number } | null {
    const near = this.tiles.filter(([x, y]) => Math.abs(x + 0.5 - this.x) + Math.abs(y + 0.5 - this.y) < 7);
    const pool = near.length ? near : this.tiles;
    if (!pool.length) return null;
    const [x, y] = pool[Math.floor(Math.random() * pool.length)]!;
    return { x: x + 0.5, y: y + 0.5 };
  }
}
