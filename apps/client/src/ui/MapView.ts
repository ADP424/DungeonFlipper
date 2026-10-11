import { TIP_BAR_W, barWidth } from './pixels';
import {
  BARRICADE_TIERS, CELL_H, CELL_W, SIGN, STANCE_NAME, getRealtors, stanceOf, barricadeKit, cellKey, findSign, getClock, getTenants, isSecure, openings, partnerDoor, registry,
  roomLabel, securityNeeds,
  type Barricade, type DoorInfo, type FloorState, type RoomInfo, type WorldState,
} from '@df/shared';
import { canvasFor } from '../engine/assets';
import { tenantLook } from '../game/entities/TenantNpc';

export interface MapViewport {
  /** Centre of the view, in cell units. */
  cx: number;
  cy: number;
  /** Pixels per cell. */
  cellPx: number;
  /**
   * Draw on whole pixels (the minimap, drawn at art-pixel resolution): cells, doors and lines snap
   * to the pixel grid, and the text icons and faces, too small to read, are left out.
   */
  pixel?: boolean;
}

/**
 * Draws a floor map from its sparse cell grid. Rooms are drawn at their true shapes (merged
 * cells), so the same renderer serves the minimap and the full-screen map at any size.
 */
export function drawFloorMap(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  floor: FloorState,
  world: WorldState,
  currentRoomId: string,
  player: { x: number; y: number },
  vp: MapViewport,
): void {
  const rooms = world.rooms;
  ctx.clearRect(0, 0, w, h);
  const { s, cellH, gap, toX, toY } = geometry(w, h, vp);
  // Owned rooms joined by knocked-through walls read as one space: their cells merge, and each such
  // group (a unit's footprint at map scale) gets a thick outline. Original boundaries are forgotten.
  const group = ownedGroups(floor, world);
  // Units read at a glance: rented ones (blue, with their tenants' faces) and ones for rent (green, $).
  const unitKey = (roomId: string) => group.get(roomId)?.key ?? roomId;
  const rented = new Map<string, string[]>();
  const faces: { roomId: string; look: string }[] = [];
  const takenSigns = new Set<string>();
  for (const t of Object.values(getTenants(world))) {
    const sign = t.status === 'living' ? findSign(world, t.signUid) : null;
    if (!sign || sign.floor !== floor.index) continue;
    takenSigns.add(t.signUid);
    rented.set(unitKey(sign.roomId), [...(rented.get(unitKey(sign.roomId)) ?? []), t.id]);
    faces.push({ roomId: sign.roomId, look: tenantLook(t.id) });
  }
  const forRent = new Set<string>();
  const signRooms = new Set<string>();
  for (const info of Object.values(floor.rooms)) {
    const st = rooms[info.id];
    if (!st?.ownerId) continue;
    for (const f of st.furniture) {
      if (f.defId !== SIGN || f.data?.closed === true || takenSigns.has(f.uid)) continue;
      forRent.add(unitKey(info.id));
      signRooms.add(info.id);
    }
  }

  for (const info of Object.values(floor.rooms)) {
    const st = rooms[info.id];
    if (!st?.discovered && info.id !== currentRoomId) continue;
    const current = info.id === currentRoomId;
    // Owned: gold when secure, amber when not, red with monsters inside. Unowned rooms darken toward red
    // the harder they are (difficulty is fixed at generation).
    const danger = Math.min(1, info.difficulty / 10);
    const rival = st?.ownerId && st.ownerId !== world.ownerId ? getRealtors(world)[st.ownerId] : undefined;
    const owned = rival ? '#7a52a8' : st?.ownerId
      ? st.monsters.length ? '#b84a3a'
        : rented.has(unitKey(info.id)) ? '#4f7fc4'
        : forRent.has(unitKey(info.id)) ? '#4f9a5c'
        : isSecure(world, info.id) ? '#c9a24e' : '#d0813a'
      : null;
    // Unowned rooms read as cleared (light) only while they're empty; repopulated ones go dark again.
    const cleared = !!st?.visited && !st.monsters.length;
    // Monsters and units keep their colour even where you stand (the red dot shows you); otherwise the
    // room you're in is drawn light.
    const unitFill = !!st?.ownerId && (st.monsters.length > 0 || rented.has(unitKey(info.id)) || forRent.has(unitKey(info.id)));
    const lit = current && !unitFill;
    const fill = lit ? '#f2ead8' : owned ?? (cleared ? mix('#8a8070', '#8a3a30', danger) : mix('#3d3833', '#5a1e1e', danger));
    ctx.fillStyle = fill;
    const cells = group.get(info.id)?.cells ?? new Set(info.cells.map((c) => cellKey(c.cx, c.cy)));
    for (const c of info.cells) {
      const x = toX(c.cx), y = toY(c.cy);
      // Extend into neighbouring cells of the same room so merged rooms read as one shape.
      const right = cells.has(cellKey(c.cx + 1, c.cy)) ? gap : 0;
      const down = cells.has(cellKey(c.cx, c.cy + 1)) ? gap : 0;
      if (vp.pixel) ctx.fillRect(x, y, s - gap + right, cellH - gap + down);
      else ctx.fillRect(x + gap / 2, y + gap / 2, s - gap + right, cellH - gap + down);
    }
    if (st?.visited || current) {
      // Doors bridge the gap between neighbouring rooms; barricaded ones are drawn thicker, coloured by wear.
      for (const d of info.doors) {
        const b = st?.barricades[`${d.x},${d.y}`];
        const r = doorRect(d, w, h, vp, !!b);
        ctx.fillStyle = b ? wearColor(b) : '#d8ccb4';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        if (b && !vp.pixel) {
          ctx.strokeStyle = '#1a1410';
          ctx.lineWidth = 1;
          ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
        }
      }
    }
    // Icons
    const icon = rival && rival.officeRoomId === info.id ? '◆' : info.tags.includes('boss') ? '☠' : info.tags.includes('stairsDown') ? '▼' : info.tags.includes('safe') ? '⌂' : info.tags.includes('lobby') ? '▲'
      : signRooms.has(info.id) && !faces.some((f) => f.roomId === info.id) ? '¤' : '';
    if (icon && !vp.pixel && (st?.discovered || current)) {
      const c0 = info.cells.reduce((a, c) => ({ cx: a.cx + c.cx / info.cells.length, cy: a.cy + c.cy / info.cells.length }), { cx: 0, cy: 0 });
      ctx.fillStyle = lit ? '#2a2420' : '#f2ead8';
      ctx.font = `${Math.max(8, Math.floor(Math.min(s, cellH) * 0.55))}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, toX(c0.cx + 0.5), toY(c0.cy + 0.5));
    }
  }
  // Thick borders around owned spaces (rooms merged through openings outline as one).
  ctx.strokeStyle = '#f0d890';
  ctx.lineWidth = vp.pixel ? 1 : Math.max(1.5, s * 0.05);
  ctx.beginPath();
  const drawn = new Set<string>();
  for (const [id, g] of group) {
    if (drawn.has(g.key) || !(rooms[id]?.discovered || id === currentRoomId)) continue;
    drawn.add(g.key);
    for (const k of g.cells) {
      const [cx, cy] = k.split(',').map(Number) as [number, number];
      // On whole pixels the cell's fill runs from its corner to the gap; the line is drawn on its edge pixels.
      const x0 = vp.pixel ? toX(cx) + 0.5 : toX(cx) + gap / 2, y0 = vp.pixel ? toY(cy) + 0.5 : toY(cy) + gap / 2;
      const x1 = vp.pixel ? toX(cx + 1) - gap - 0.5 : toX(cx + 1) - gap / 2, y1 = vp.pixel ? toY(cy + 1) - gap - 0.5 : toY(cy + 1) - gap / 2;
      if (!g.cells.has(cellKey(cx, cy - 1))) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
      if (!g.cells.has(cellKey(cx, cy + 1))) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
      if (!g.cells.has(cellKey(cx - 1, cy))) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
      if (!g.cells.has(cellKey(cx + 1, cy))) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
    }
  }
  ctx.stroke();
  // Tenants' faces in the rooms they rent (side by side when a room has several).
  const byRoom = new Map<string, string[]>();
  for (const f of faces) byRoom.set(f.roomId, [...(byRoom.get(f.roomId) ?? []), f.look]);
  ctx.imageSmoothingEnabled = false;
  // Faces are drawn at whole device pixels per art pixel, on the device pixel grid (the context is
  // scaled by the pixel ratio).
  const dpr = ctx.getTransform().a;
  const snap = (v: number) => Math.round(v * dpr) / dpr;
  for (const [roomId, looks] of vp.pixel ? [] : byRoom) {
    const info = floor.rooms[roomId];
    if (!info || !(rooms[roomId]?.discovered || roomId === currentRoomId)) continue;
    const c0 = info.cells.reduce((a, c) => ({ cx: a.cx + c.cx / info.cells.length, cy: a.cy + c.cy / info.cells.length }), { cx: 0, cy: 0 });
    const size = (16 * Math.max(1, Math.floor((Math.min(s, cellH) * 0.62 * dpr) / 16))) / dpr;
    const total = looks.length * size + (looks.length - 1) * 2;
    looks.forEach((look, i) => {
      const x = snap(toX(c0.cx + 0.5) - total / 2 + i * (size + 2)), y = snap(toY(c0.cy + 0.5) - size / 2);
      ctx.fillStyle = 'rgba(20, 24, 40, 0.55)';
      ctx.beginPath();
      ctx.arc(x + size / 2, y + size / 2, size / 2 + 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(canvasFor(look), x, y, size, size);
    });
  }
  // Player
  const px = toX(player.x / CELL_W), py = toY(player.y / CELL_H);
  ctx.fillStyle = '#e0303c';
  if (vp.pixel) {
    ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 2, 2);
    return;
  }
  ctx.beginPath();
  ctx.arc(px, py, Math.max(2, s * 0.09), 0, Math.PI * 2);
  ctx.fill();
}

/** Map layout: pixels per cell (cells drawn a little squarer than their true 19:11, which reads better). */
function geometry(w: number, h: number, vp: MapViewport) {
  const s = vp.pixel ? Math.max(3, Math.floor(vp.cellPx)) : vp.cellPx;
  const cellH = vp.pixel ? Math.max(2, Math.round(s * (CELL_H / CELL_W) * 1.25)) : s * (CELL_H / CELL_W) * 1.25;
  let ox = w / 2 - vp.cx * s, oy = h / 2 - vp.cy * cellH;
  if (vp.pixel) {
    ox = Math.round(ox);
    oy = Math.round(oy);
  }
  return {
    s, cellH,
    gap: vp.pixel ? 1 : Math.max(1, s * 0.08),
    toX: (cx: number) => ox + cx * s,
    toY: (cy: number) => oy + cy * cellH,
    fromX: (px: number) => (px - ox) / s,
    fromY: (py: number) => (py - oy) / cellH,
  };
}

/** Where a door is drawn: a bridge across the gap between two rooms (wider when barricaded). */
function doorRect(d: DoorInfo, w: number, h: number, vp: MapViewport, barricaded: boolean): { x: number; y: number; w: number; h: number } {
  const { s, gap, toX, toY } = geometry(w, h, vp);
  if (vp.pixel) {
    // A door is a 2-pixel bridge over the 1-pixel gap (3 thick when barricaded), on whole pixels.
    const dw = 2, th = barricaded ? 3 : 1;
    const fx = (d.x + 0.5) / CELL_W, fy = (d.y + 0.5) / CELL_H;
    if (d.dir === 'e' || d.dir === 'w') {
      const ex = Math.floor(d.x / CELL_W) + (d.dir === 'e' ? 1 : 0);
      return { x: toX(ex) - 1 - (th >> 1), y: Math.round(toY(fy) - dw / 2), w: th, h: dw };
    }
    const ey = Math.floor(d.y / CELL_H) + (d.dir === 's' ? 1 : 0);
    return { x: Math.round(toX(fx) - dw / 2), y: toY(ey) - 1 - (th >> 1), w: dw, h: th };
  }
  const dw = Math.max(2, s * (barricaded ? 0.32 : 0.2));
  const th = barricaded ? gap + Math.max(3, s * 0.08) : gap + 2;
  const fx = (d.x + 0.5) / CELL_W, fy = (d.y + 0.5) / CELL_H;
  if (d.dir === 'e' || d.dir === 'w') {
    const ex = Math.floor(d.x / CELL_W) + (d.dir === 'e' ? 1 : 0);
    return { x: toX(ex) - th / 2, y: toY(fy) - dw / 2, w: th, h: dw };
  }
  const ey = Math.floor(d.y / CELL_H) + (d.dir === 's' ? 1 : 0);
  return { x: toX(fx) - dw / 2, y: toY(ey) - th / 2, w: dw, h: th };
}

function wearColor(b: Barricade): string {
  const k = b.hp / BARRICADE_TIERS[b.tier]!.hp;
  return k > 0.66 ? '#7ad05a' : k > 0.33 ? '#e0b040' : '#e05040';
}

export type MapHit = { kind: 'room'; room: RoomInfo } | { kind: 'barricade'; room: RoomInfo; door: DoorInfo; barricade: Barricade };

/** What's under a point of the map: a barricade (checked first: it sits on top) or a room. */
export function hitTestMap(
  w: number, h: number, floor: FloorState, world: WorldState, currentRoomId: string, vp: MapViewport, mx: number, my: number,
): MapHit | null {
  const visible = (id: string) => id === currentRoomId || !!world.rooms[id]?.discovered;
  for (const info of Object.values(floor.rooms)) {
    const st = world.rooms[info.id];
    if (!st || (!st.visited && info.id !== currentRoomId)) continue;
    for (const d of info.doors) {
      const b = st.barricades[`${d.x},${d.y}`];
      if (!b) continue;
      const r = doorRect(d, w, h, vp, true);
      const pad = 3;
      if (mx >= r.x - pad && mx <= r.x + r.w + pad && my >= r.y - pad && my <= r.y + r.h + pad) return { kind: 'barricade', room: info, door: d, barricade: b };
    }
  }
  const { fromX, fromY } = geometry(w, h, vp);
  const id = floor.cells[cellKey(Math.floor(fromX(mx)), Math.floor(fromY(my)))];
  const info = id ? floor.rooms[id] : undefined;
  return info && visible(info.id) ? { kind: 'room', room: info } : null;
}

/** Tooltip for a room on the map: what it is, and its status. (Owned rooms may get names later.) */
export function describeMapRoom(world: WorldState, info: RoomInfo, playerId: string): string {
  const st = world.rooms[info.id]!;
  const name = roomLabel(info).replace(/^the /, '');
  const title = name[0]!.toUpperCase() + name.slice(1);
  const lines: string[] = [];
  if (info.tags.includes('home')) lines.push('Home. Always safe.');
  else if (st.ownerId === playerId) {
    if (st.monsters.length) lines.push(`<span class="bad">Yours, but monsters got in (${st.monsters.length}).</span>`);
    else if (isSecure(world, info.id)) lines.push('<span class="good">Yours · secure</span>');
    else {
      const need = securityNeeds(world, info);
      lines.push(`<span class="warn">Yours · not secure: ${need.doors} door${need.doors === 1 ? ' needs' : 's need'} a barricade (tier ${need.tier}+)</span>`);
    }
    if (st.insecureSince !== undefined) {
      const lastDay = st.insecureSince + 1;
      lines.push(`<span class="bad">Lost at the end of ${lastDay === getClock(world).day ? 'today' : `day ${lastDay}`} unless secured.</span>`);
    }
  } else if (st.ownerId) {
    const r = getRealtors(world)[st.ownerId];
    lines.push(r ? `${r.name}'s ${r.officeRoomId === info.id ? 'office' : 'property'} · ${STANCE_NAME[stanceOf(r)].toLowerCase()}` : 'Someone else\'s property.');
  }
  else if (!st.visited) lines.push('Unexplored.');
  else if (st.monsters.length) lines.push(`Monsters inside (${st.monsters.length}).`);
  else lines.push('Cleared · unclaimed. Plant a company flag to claim it.');
  if (!info.tags.includes('home')) lines.push(`<i>Difficulty ${info.difficulty.toFixed(1)}</i>`);
  return `<b>${title}</b><br>${lines.join('<br>')}`;
}

/** Tooltip for a barricade on the map: kind and durability (with a bar). */
export function describeMapBarricade(world: WorldState, hit: Extract<MapHit, { kind: 'barricade' }>): string {
  const b = hit.barricade;
  const max = BARRICADE_TIERS[b.tier]!.hp;
  const kit = barricadeKit(b.tier);
  const name = kit ? registry.items.get(kit).name : `Tier ${b.tier} barricade`;
  const k = Math.max(0, Math.min(1, b.hp / max));
  const other = partnerDoor(world, hit.room.id, `${hit.door.x},${hit.door.y}`);
  const between = other ? ` between ${roomLabel(hit.room)} and ${roomLabel(world.floors[world.rooms[other.roomId]!.floor]!.rooms[other.roomId]!)}` : '';
  return `<b>${name}</b> (tier ${b.tier})<br>${Math.ceil(b.hp)} / ${max} HP${between ? `<br><i>${between.trim()}</i>` : ''}`
    + `<div class="tip-bar"><div style="width:${barWidth(k, TIP_BAR_W)};background:${wearColor(b)}"></div></div>`;
}

/**
 * Owned rooms grouped by same-owner connections through knocked-through walls (doorways keep them
 * apart: they divide units). Each room maps to its group's merged cells.
 */
function ownedGroups(floor: FloorState, world: WorldState): Map<string, { key: string; cells: Set<string> }> {
  const out = new Map<string, { key: string; cells: Set<string> }>();
  for (const info of Object.values(floor.rooms)) {
    const owner = world.rooms[info.id]?.ownerId;
    if (!owner || out.has(info.id)) continue;
    const members = [info.id];
    const g = { key: info.id, cells: new Set<string>() };
    for (let i = 0; i < members.length; i++) {
      const r = floor.rooms[members[i]!]!;
      out.set(r.id, g);
      for (const c of r.cells) g.cells.add(cellKey(c.cx, c.cy));
      for (const o of openings(world, r)) {
        if (!members.includes(o.toRoom) && world.rooms[o.toRoom]?.ownerId === owner) members.push(o.toRoom);
      }
    }
  }
  return out;
}

/** Bounding box of a room's cells, in cells. */
export function roomBounds(floor: FloorState, roomId: string): { minX: number; minY: number; maxX: number; maxY: number } {
  const cells = floor.rooms[roomId]!.cells;
  return {
    minX: Math.min(...cells.map((c) => c.cx)),
    minY: Math.min(...cells.map((c) => c.cy)),
    maxX: Math.max(...cells.map((c) => c.cx)) + 1,
    maxY: Math.max(...cells.map((c) => c.cy)) + 1,
  };
}

/** Blend two #rrggbb colours. */
function mix(a: string, b: string, t: number): string {
  const p = (h: string, i: number) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
  return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('');
}
