import { registry } from '@df/shared';
import { summon, summonsOf } from '../actions';
import { defineBrain, enter, type Phased } from '../brain';
import { flee, toPlayer } from '../steering';

interface Params {
  /** Keeps at least this far from the player (tiles). */
  safe: number;
  /** Seconds between calls for security, and how long a call takes. */
  callCooldown: number;
  callTime: number;
  /** Who comes, how many at most at once, and how far from the player they walk in (tiles). */
  guard: string;
  maxGuards: number;
  guardDistance: number;
}

interface State extends Phased<'keepAway' | 'call'> {
  callIn: number;
}

/**
 * Once provoked, a realtor doesn't fight: they keep their distance and phone for security, who come
 * in from across the room. Standing still on the phone is the moment to reach them.
 */
export const realtor = defineBrain<Params, State>({
  init: (p) => {
    registry.enemies.get(p.guard);
    return { phase: 'keepAway', t: 0, callIn: 1 };
  },
  update(ctx, s) {
    const { e, game, dt, params: p } = ctx;
    s.t += dt;
    s.callIn -= dt;
    switch (s.phase) {
      case 'keepAway':
        if (toPlayer(ctx).d < p.safe) flee(ctx);
        if (s.callIn <= 0 && summonsOf(ctx) < p.maxGuards) enter(s, 'call');
        break;
      case 'call':
        e.pose('call', p.callTime);
        if (s.t < p.callTime) break;
        {
          const pl = game.player;
          const spot = game.room.randomOpenTile((x, y) => game.room.roomIdAt(x, y) === e.roomId && Math.hypot(x + 0.5 - pl.x, y + 0.5 - pl.y) >= p.guardDistance);
          if (spot) summon(ctx, p.guard, spot.x + 0.5, spot.y + 0.5);
        }
        s.callIn = p.callCooldown;
        enter(s, 'keepAway');
        break;
    }
  },
});
