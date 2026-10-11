import { CELL_H, CELL_W, cellCenter } from '../core/constants';
import { furniture as furnitureReg, items as itemReg } from '../content/registry';
import type { FurnitureDef, ItemDef } from '../content/types';
import type { Rng } from '../core/rng';
import { registerDaily } from './advance';
import type { Command } from './commands';
import { APARTMENT_FLOOR } from './difficulty';
import { createItem } from './items';
import { RoomLayout } from './layout';
import type { WorldState } from './types';

/**
 * The phone's Hardware app: anything with a `price` can be ordered with cash, and arrives at your
 * apartment when the day ends (it's waiting when you wake up). Items are left on the floor to pick
 * up; furniture is set down on a free spot (it never goes in an inventory).
 */
export interface Orders {
  /** Item def ids, or `f:<furniture def id>` (ids can name both an item and a furniture). */
  items: string[];
}

/** Order entry for a piece of furniture. */
export const furnitureOrder = (id: string): string => `f:${id}`;

/** The item or furniture def an order entry names. */
export function orderDef(entry: string): ItemDef | FurnitureDef {
  return entry.startsWith('f:') ? furnitureReg.get(entry.slice(2)) : itemReg.get(entry);
}

export const ordersKey = (playerId: string): string => `orders:${playerId}`;

export function getOrders(state: WorldState, playerId: string): Orders {
  return (state.globals[ordersKey(playerId)] as Orders | undefined) ?? { items: [] };
}

/** Items the Hardware app sells, cheapest first. */
export function storeCatalog(): ItemDef[] {
  return itemReg.all().filter((d) => d.price !== undefined).sort((a, b) => a.price! - b.price!);
}

/** Furniture the Hardware app sells, cheapest first. */
export function furnitureCatalog(): FurnitureDef[] {
  return furnitureReg.all().filter((d) => d.price !== undefined).sort((a, b) => a.price! - b.price!);
}

/** Deliver every pending order to its owner's apartment, laid out near the room's centre. */
export function deliverOrders(state: WorldState, ctx: { day: number; rng: Rng }): Command[] {
  const out: Command[] = [];
  const home = state.floors[APARTMENT_FLOOR];
  if (!home) return out;
  const room = home.rooms[home.lobbyRoomId]!;
  const c = room.cells[0]!;
  // Furniture goes down one piece at a time on a scratch copy of the room, so pieces don't overlap
  // each other or whoever is standing (or asleep) in the apartment.
  const scratch = structuredClone(state.rooms[room.id]!);
  for (const p of Object.values(state.players)) {
    if (p.floor === APARTMENT_FLOOR && p.roomId === room.id) scratch.tileOverrides[`${Math.floor(p.x)},${Math.floor(p.y)}`] = 'concrete_wall';
  }
  for (const key of Object.keys(state.globals)) {
    if (!key.startsWith('orders:')) continue;
    const playerId = key.slice('orders:'.length);
    const orders = getOrders(state, playerId);
    if (!orders.items.length) continue;
    const remaining: string[] = [];
    let delivered = 0;
    orders.items.forEach((entry, i) => {
      const uid = `order${ctx.day}-${i}-${Math.floor(ctx.rng.next() * 2 ** 31).toString(36)}`;
      if (entry.startsWith('f:')) {
        const def = furnitureReg.get(entry.slice(2));
        const spot = new RoomLayout(room, scratch).findFurnitureSpot(def, cellCenter(c).x, cellCenter(c).y + 1);
        if (!spot) return void remaining.push(entry);
        const placement = { uid, defId: def.id, x: spot.x, y: spot.y, rot: 0 };
        scratch.furniture.push(placement);
        out.push({ type: 'furniturePlaced', roomId: room.id, placement });
      } else {
        out.push({
          type: 'groundItemAdded', roomId: room.id,
          item: { uid, x: c.cx * CELL_W + 3 + (i % 5) * 0.8, y: c.cy * CELL_H + 5 + Math.floor(i / 5) * 0.8, item: createItem(entry, `${uid}i`) },
        });
      }
      delivered++;
    });
    out.push({ type: 'ordersDelivered', playerId, remaining });
    const parts = [];
    if (delivered) parts.push(`Your order (${delivered} item${delivered > 1 ? 's' : ''}) was left in your apartment.`);
    if (remaining.length) parts.push(`No room for ${remaining.map((e) => orderDef(e).name).join(', ')}: we'll try again tomorrow. Clear some floor.`);
    out.push({
      type: 'messagePosted', playerId,
      message: { id: `delivery${ctx.day}-${playerId}`, day: ctx.day, minute: 24 * 60, severity: 'info', from: 'Hardware', text: parts.join(' ') },
    });
  }
  return out;
}

export function registerStore(): void {
  registerDaily('store', deliverOrders);
}
