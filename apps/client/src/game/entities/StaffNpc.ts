import { UTILITY_KINDS, hashString, type Staff } from '@df/shared';
import { moveAndCollide } from '../../engine/collision';
import type { Game } from '../Game';
import { Actor } from './Entity';

const LOOKS: Record<Staff['role'], string[]> = {
  cleaner: ['npcs/staff/cleaner_1', 'npcs/staff/cleaner_2', 'npcs/staff/cleaner_3'],
  handyman: ['npcs/staff/handyman_1', 'npcs/staff/handyman_2', 'npcs/staff/handyman_3'],
};

/** How long a job takes on the spot, seconds. */
const WORK: Record<Staff['role'], number> = { cleaner: 1.2, handyman: 2.2 };

/**
 * A member of staff, live while you're around (D26): a cleaner walks to the nearest mess and clears
 * it, a handyman to the nearest faulty pipe or wire and fixes it. With nothing to do they potter about.
 */
export class StaffNpc extends Actor {
  readonly staffId: string;
  readonly role: Staff['role'];
  roomId = '';
  private target: { x: number; y: number; job?: { roomId: string; tx: number; ty: number } } | null = null;
  private working = 0;
  private idle = Math.random() * 2;
  private stuck = 0;

  constructor(s: Staff, x: number, y: number) {
    const looks = LOOKS[s.role];
    super(looks[hashString(s.id) % looks.length]!, s.role === 'cleaner' ? 0xd8f0ff : 0xffe8c8);
    this.staffId = s.id;
    this.role = s.role;
    this.x = x;
    this.y = y;
    this.radius = 0.3;
  }

  update(game: Game, dt: number): void {
    this.flash = Math.max(0, this.flash - dt);
    const t = this.target;
    if (t?.job && Math.hypot(t.x - this.x, t.y - this.y) < 0.7) {
      // At the job: work, then do it.
      this.working += dt;
      if (this.working >= WORK[this.role]) {
        this.working = 0;
        this.target = null;
        game.staffDidJob(this.role, t.job.roomId, t.job.tx, t.job.ty);
      }
      return;
    }
    this.working = 0;
    if (!t) {
      this.idle -= dt;
      if (this.idle > 0) return;
      this.idle = 1 + Math.random() * 2;
      this.target = this.findJob(game) ?? this.wander(game);
      return;
    }
    const d = Math.hypot(t.x - this.x, t.y - this.y) || 1;
    const speed = 2.2 * dt;
    const res = moveAndCollide(this.x, this.y, this.radius * 0.9, ((t.x - this.x) / d) * speed, ((t.y - this.y) / d) * speed, game.room.blockerFor('walk', 'enemy'));
    this.stuck = res.x === this.x && res.y === this.y ? this.stuck + dt : 0;
    this.x = res.x;
    this.y = res.y;
    if (this.stuck > 0.6 || (!t.job && d < 0.2)) {
      this.target = null;
      this.stuck = 0;
    }
  }

  /** The nearest thing in the active rooms this role deals with. */
  private findJob(game: Game): StaffNpc['target'] {
    const st = game.session.state;
    let best: StaffNpc['target'] = null;
    let bd = Infinity;
    for (const id of game.room.layout.activeIds) {
      const room = st.rooms[id];
      if (!room || room.ownerId !== game.session.playerId) continue;
      const tiles = this.role === 'cleaner'
        ? Object.keys(room.mess ?? {})
        : Object.entries(room.utilities ?? {}).filter(([, u]) => UTILITY_KINDS.some((k) => u[k]?.fault)).map(([k]) => k);
      for (const k of tiles) {
        const [x, y] = k.split(',').map(Number) as [number, number];
        const dd = Math.hypot(x + 0.5 - this.x, y + 0.5 - this.y);
        if (dd >= bd) continue;
        // A fault inside a wall is worked on from the open tile next to it.
        const L = game.room.layout;
        const at = L.isOpenFloor(x, y) || L.kindAt(x, y) === 'door' ? { x, y } : L.nearestOpenFloor(x + 0.5, y + 0.5);
        if (!at) continue;
        bd = dd;
        best = { x: at.x + 0.5, y: at.y + 0.5, job: { roomId: id, tx: x, ty: y } };
      }
    }
    return best;
  }

  private wander(game: Game): StaffNpc['target'] {
    const L = game.room.layout;
    for (let i = 0; i < 8; i++) {
      const x = Math.floor(this.x + (Math.random() - 0.5) * 8), y = Math.floor(this.y + (Math.random() - 0.5) * 6);
      if (L.isOpenFloor(x, y) && game.room.ownedAt(x, y)) return { x: x + 0.5, y: y + 0.5 };
    }
    return null;
  }
}
