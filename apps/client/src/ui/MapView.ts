import { CELL_H, CELL_W, cellKey, type FloorState, type RoomState } from '@df/shared';

export interface MapViewport {
  /** Centre of the view, in cell units. */
  cx: number;
  cy: number;
  /** Pixels per cell. */
  cellPx: number;
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
  rooms: Record<string, RoomState>,
  currentRoomId: string,
  player: { x: number; y: number },
  vp: MapViewport,
): void {
  ctx.clearRect(0, 0, w, h);
  const s = vp.cellPx;
  // Cells are drawn a little squarer than their true 19:11 ratio, which reads better on a map.
  const cellH = s * (CELL_H / CELL_W) * 1.25;
  const ox = w / 2 - vp.cx * s, oy = h / 2 - vp.cy * cellH;
  const gap = Math.max(1, s * 0.08);
  const toX = (cx: number) => ox + cx * s;
  const toY = (cy: number) => oy + cy * cellH;

  for (const info of Object.values(floor.rooms)) {
    const st = rooms[info.id];
    if (!st?.discovered && info.id !== currentRoomId) continue;
    const current = info.id === currentRoomId;
    const fill = current ? '#f2ead8' : !st?.visited ? '#3d3833' : st.owned ? '#c9a24e' : '#8a8070';
    ctx.fillStyle = fill;
    const cells = new Set(info.cells.map((c) => cellKey(c.cx, c.cy)));
    for (const c of info.cells) {
      const x = toX(c.cx), y = toY(c.cy);
      // Extend into neighbouring cells of the same room so merged rooms read as one shape.
      const right = cells.has(cellKey(c.cx + 1, c.cy)) ? gap : 0;
      const down = cells.has(cellKey(c.cx, c.cy + 1)) ? gap : 0;
      ctx.fillRect(x + gap / 2, y + gap / 2, s - gap + right, cellH - gap + down);
    }
    if (st?.visited || current) {
      // Doors bridge the gap between neighbouring rooms.
      ctx.fillStyle = '#d8ccb4';
      const dw = Math.max(2, s * 0.2);
      for (const d of info.doors) {
        const fx = (d.x + 0.5) / CELL_W, fy = (d.y + 0.5) / CELL_H;
        if (d.dir === 'e' || d.dir === 'w') {
          const ex = Math.floor(d.x / CELL_W) + (d.dir === 'e' ? 1 : 0);
          ctx.fillRect(toX(ex) - gap / 2 - 1, toY(fy) - dw / 2, gap + 2, dw);
        } else {
          const ey = Math.floor(d.y / CELL_H) + (d.dir === 's' ? 1 : 0);
          ctx.fillRect(toX(fx) - dw / 2, toY(ey) - gap / 2 - 1, dw, gap + 2);
        }
      }
    }
    // Icons
    const icon = info.tags.includes('boss') ? '☠' : info.tags.includes('stairsDown') ? '▼' : info.tags.includes('stairsUp') ? '▲' : info.tags.includes('safe') ? '⌂' : '';
    if (icon && (st?.discovered || current)) {
      const c0 = info.cells.reduce((a, c) => ({ cx: a.cx + c.cx / info.cells.length, cy: a.cy + c.cy / info.cells.length }), { cx: 0, cy: 0 });
      ctx.fillStyle = current ? '#2a2420' : '#f2ead8';
      ctx.font = `${Math.max(8, Math.floor(Math.min(s, cellH) * 0.55))}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(icon, toX(c0.cx + 0.5), toY(c0.cy + 0.5));
    }
  }
  // Player
  const px = toX(player.x / CELL_W), py = toY(player.y / CELL_H);
  ctx.fillStyle = '#e0303c';
  ctx.beginPath();
  ctx.arc(px, py, Math.max(2, s * 0.09), 0, Math.PI * 2);
  ctx.fill();
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
