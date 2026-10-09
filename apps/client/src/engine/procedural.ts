/**
 * Procedurally drawn 16×16 textures for anything the CC0 packs don't cover. Keys are `proc:<name>`
 * (optionally `proc:<name>:<arg>`). Add a drawer here to add a new procedural sprite.
 */
import { registry } from '@df/shared';

export type Drawer = (ctx: CanvasRenderingContext2D, arg: string | undefined) => void;

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
function shade(n: number, f: number): string {
  const r = Math.min(255, Math.max(0, Math.round(((n >> 16) & 255) * f)));
  const g = Math.min(255, Math.max(0, Math.round(((n >> 8) & 255) * f)));
  const b = Math.min(255, Math.max(0, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}
function px(ctx: CanvasRenderingContext2D, color: string, x: number, y: number, w = 1, h = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
function pixels(ctx: CanvasRenderingContext2D, rows: string[], palette: Record<string, string>, ox = 0, oy = 0) {
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = palette[row[x]!];
      if (c) px(ctx, c, ox + x, oy + y);
    }
  });
}

const MATERIAL: Record<string, { base: number; light: number; dark: number }> = {
  stone: { base: 0x8a93a6, light: 0xb4bccb, dark: 0x5a6273 },
  wood: { base: 0x9a6a3c, light: 0xc08a54, dark: 0x6a4424 },
  plaster: { base: 0xd8cfbf, light: 0xf0e9dc, dark: 0xa89e8c },
};

export function drawPattern(ctx: CanvasRenderingContext2D, style: string, base: number, accent: number) {
  px(ctx, hex(base), 0, 0, 16, 16);
  const a = hex(accent);
  switch (style) {
    case 'stripes':
      for (let x = 0; x < 16; x += 4) px(ctx, a, x, 0, 2, 16);
      break;
    case 'damask':
      for (const [x, y] of [[4, 4], [12, 12]] as const) {
        px(ctx, a, x - 1, y - 2, 2, 4);
        px(ctx, a, x - 2, y - 1, 4, 2);
        px(ctx, shade(accent, 1.2), x - 1, y - 1, 2, 2);
      }
      break;
    case 'diamond':
      for (let i = 0; i < 8; i++) {
        px(ctx, a, 8 + i, i, 1, 1); px(ctx, a, 8 - i, i, 1, 1);
        px(ctx, a, i, 8 + i, 1, 1); px(ctx, a, 15 - i, 8 + i, 1, 1);
      }
      break;
    case 'checker':
      for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x += 4) if (((x + y) / 4) % 2 === 0) px(ctx, a, x, y, 4, 4);
      break;
    case 'weave':
      for (let y = 0; y < 16; y += 2) for (let x = (y / 2) % 2; x < 16; x += 2) px(ctx, a, x, y, 1, 1);
      px(ctx, shade(base, 0.8), 0, 0, 16, 1);
      break;
    case 'planks':
      for (let y = 0; y < 16; y += 4) {
        px(ctx, a, 0, y + 3, 16, 1);
        const off = (y / 4) % 2 === 0 ? 5 : 11;
        px(ctx, a, off, y, 1, 3);
        px(ctx, shade(base, 1.12), 0, y, 16, 1);
      }
      break;
    default:
      break;
  }
}

export const drawers: Record<string, Drawer> = {
  short_wall(ctx, arg) {
    const m = MATERIAL[arg ?? 'stone']!;
    px(ctx, 'rgba(0,0,0,0.35)', 1, 14, 15, 2);
    px(ctx, hex(m.dark), 0, 7, 16, 8);
    px(ctx, hex(m.base), 0, 4, 16, 4);
    px(ctx, hex(m.light), 0, 4, 16, 1);
    if (arg === 'stone') { px(ctx, hex(m.base), 4, 10, 1, 4); px(ctx, hex(m.base), 11, 8, 1, 3); px(ctx, hex(m.base), 0, 11, 16, 1); }
    if (arg === 'wood') for (let x = 3; x < 16; x += 5) px(ctx, hex(m.base), x, 8, 1, 7);
  },
  tall_wall(ctx, arg) {
    const m = MATERIAL[arg ?? 'stone']!;
    px(ctx, hex(m.base), 0, 0, 16, 16);
    px(ctx, hex(m.light), 0, 0, 16, 3);
    px(ctx, hex(m.dark), 0, 15, 16, 1);
    if (arg === 'wood') for (let x = 0; x < 16; x += 4) px(ctx, hex(m.dark), x, 3, 1, 12);
    if (arg === 'plaster') { px(ctx, hex(m.dark), 3, 7, 1, 1); px(ctx, hex(m.dark), 11, 10, 2, 1); px(ctx, hex(m.light), 0, 13, 16, 1); }
  },
  hole(ctx) {
    px(ctx, '#0b0a10', 0, 0, 16, 16);
    px(ctx, '#15131c', 2, 2, 12, 12);
  },
  hole_top(ctx) {
    px(ctx, '#0b0a10', 0, 0, 16, 16);
    px(ctx, '#3a2a26', 0, 0, 16, 3);
    px(ctx, '#251b19', 0, 3, 16, 2);
  },
  arrow(ctx) {
    px(ctx, '#c8a070', 3, 7, 9, 1);
    px(ctx, '#d0d4dc', 12, 6, 2, 3); px(ctx, '#d0d4dc', 14, 7, 1, 1);
    px(ctx, '#e8e8e8', 1, 6, 2, 1); px(ctx, '#e8e8e8', 1, 8, 2, 1);
  },
  bolt(ctx) {
    px(ctx, '#7a5a3a', 3, 7, 9, 2);
    px(ctx, '#dfe4ee', 12, 6, 3, 4);
  },
  fireball(ctx) {
    ctx.fillStyle = '#ff6a20'; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd060'; ctx.beginPath(); ctx.arc(8, 8, 3, 0, Math.PI * 2); ctx.fill();
    px(ctx, '#fff6d0', 7, 7, 2, 2);
  },
  frost_orb(ctx) {
    ctx.fillStyle = '#4aa8ff'; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bfe8ff'; ctx.beginPath(); ctx.arc(8, 8, 3, 0, Math.PI * 2); ctx.fill();
    px(ctx, '#ffffff', 6, 6, 2, 2);
  },
  magic_orb(ctx) {
    ctx.fillStyle = '#8030d0'; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d090ff'; ctx.beginPath(); ctx.arc(8, 8, 3, 0, Math.PI * 2); ctx.fill();
  },
  slime_glob(ctx) {
    ctx.fillStyle = '#4c9a3a'; ctx.beginPath(); ctx.arc(8, 8, 4.5, 0, Math.PI * 2); ctx.fill();
    px(ctx, '#9ad86a', 6, 6, 2, 2);
  },
  flask(ctx) {
    pixels(ctx, [
      '......aa......',
      '......aa......',
      '.....bbbb.....',
      '....bccccb....',
      '...bccddccb...',
      '...bcddddcb...',
      '...bccddccb...',
      '....bbbbbb....',
    ], { a: '#8a6a4a', b: '#3a2a2a', c: '#ff7a30', d: '#ffd070' }, 1, 4);
  },
  bone(ctx) {
    px(ctx, '#ece6d6', 4, 7, 8, 2);
    px(ctx, '#ece6d6', 2, 6, 2, 4); px(ctx, '#ece6d6', 12, 6, 2, 4);
    px(ctx, '#b8b0a0', 4, 8, 8, 1);
  },
  mace(ctx) {
    px(ctx, '#7a5a3a', 7, 6, 2, 9);
    ctx.fillStyle = '#9aa3b4'; ctx.beginPath(); ctx.arc(8, 5, 4, 0, Math.PI * 2); ctx.fill();
    px(ctx, '#d0d6e0', 6, 3, 2, 2);
    px(ctx, '#5a6273', 3, 4, 1, 2); px(ctx, '#5a6273', 12, 4, 1, 2); px(ctx, '#5a6273', 7, 0, 2, 1);
  },
  bow(ctx) {
    ctx.strokeStyle = '#9a6a3c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(4, 8, 7, -1.2, 1.2); ctx.stroke();
    px(ctx, '#e8e0d0', 6, 2, 1, 12);
  },
  crossbow(ctx) {
    px(ctx, '#7a5230', 7, 3, 2, 12);
    px(ctx, '#9aa3b4', 2, 5, 12, 2);
    px(ctx, '#e8e0d0', 3, 7, 10, 1);
    px(ctx, '#5a3a20', 7, 13, 2, 2);
  },
  armor(ctx, arg) {
    const col = arg === 'leather' ? [0x8a5a34, 0xb07a4a] : arg === 'chain' ? [0x8a93a6, 0xc0c8d6] : [0xa0a8b8, 0xe0e6f0];
    pixels(ctx, [
      '..aa......aa..',
      '.abba....abba.',
      '.abbbaaaabbba.',
      '..abbbbbbbba..',
      '..abbbbbbbba..',
      '..abbbbbbbba..',
      '..abbbbbbbba..',
      '..abbbbbbbba..',
      '...aaaaaaaa...',
    ], { a: shade(col[0]!, 0.7), b: hex(col[0]!) }, 1, 3);
    if (arg === 'chain') for (let y = 6; y < 11; y += 2) for (let x = 4; x < 12; x += 2) px(ctx, hex(col[1]!), x, y);
    if (arg === 'plate') { px(ctx, hex(col[1]!), 5, 6, 6, 1); px(ctx, hex(col[1]!), 7, 7, 2, 4); }
    if (arg === 'leather') px(ctx, '#d0a060', 7, 6, 2, 5);
  },
  planks(ctx) {
    for (let i = 0; i < 3; i++) {
      px(ctx, '#9a6a3c', 2, 4 + i * 3, 12, 2);
      px(ctx, '#6a4424', 2, 6 + i * 3, 12, 1);
    }
    px(ctx, '#d0b080', 5, 3, 1, 10); px(ctx, '#d0b080', 10, 3, 1, 10);
  },
  kit(ctx, arg) {
    const m = MATERIAL[arg ?? 'wood']!;
    px(ctx, hex(m.dark), 2, 6, 12, 8);
    px(ctx, hex(m.base), 3, 7, 10, 6);
    px(ctx, hex(m.light), 3, 7, 10, 1);
    // trowel
    px(ctx, '#c0c8d6', 9, 2, 5, 3); px(ctx, '#7a5a3a', 7, 4, 2, 2);
  },
  roll(ctx, arg) {
    const s = arg ? registry.surfaces.tryGet(arg) : undefined;
    const base = s?.pattern.base ?? 0x888888;
    const accent = s?.pattern.accent ?? 0xaaaaaa;
    px(ctx, shade(base, 0.7), 3, 3, 10, 10);
    ctx.save();
    ctx.beginPath(); ctx.rect(4, 4, 8, 8); ctx.clip();
    drawPattern(ctx, s?.pattern.style ?? 'solid', base, accent);
    ctx.restore();
    px(ctx, shade(base, 0.5), 3, 3, 10, 1);
    ctx.fillStyle = shade(base, 0.6); ctx.beginPath(); ctx.ellipse(12.5, 8, 1.6, 5, 0, 0, Math.PI * 2); ctx.fill();
    px(ctx, '#2a2020', 12, 7, 1, 2);
  },
  heart(ctx) { heartShape(ctx, '#e0303c', '#ff8a8a', 2); },
  heart_half(ctx) { heartShape(ctx, '#e0303c', '#ff8a8a', 1); },
  heart_empty(ctx) { heartShape(ctx, '#3a1418', '#3a1418', 2, '#1a0a0c'); },
  heart_armor(ctx) { heartShape(ctx, '#a0a8b4', '#e0e6ee', 2); },
  heart_armor_half(ctx) { heartShape(ctx, '#a0a8b4', '#e0e6ee', 1); },
  heart_container(ctx) {
    heartShape(ctx, '#e0303c', '#ff8a8a', 2);
    px(ctx, '#ffe070', 7, 5, 2, 6); px(ctx, '#ffe070', 5, 7, 6, 2);
  },
  // Utilities (P6): sources, fixtures and the tools that lay pipe and wire.
  generator_l(ctx) {
    px(ctx, '#2a2e2a', 1, 4, 15, 11); px(ctx, '#4a6a4a', 2, 5, 14, 9); px(ctx, '#5f845f', 2, 5, 14, 2);
    for (let y = 8; y < 13; y += 2) px(ctx, '#2f442f', 4, y, 9, 1);
    px(ctx, '#d8d0b0', 3, 2, 3, 3); px(ctx, '#2a2e2a', 4, 1, 1, 1);
  },
  generator_r(ctx) {
    px(ctx, '#2a2e2a', 0, 4, 15, 11); px(ctx, '#4a6a4a', 0, 5, 14, 9); px(ctx, '#5f845f', 0, 5, 14, 2);
    px(ctx, '#1a1c1a', 4, 8, 6, 4); px(ctx, '#80ff90', 5, 9, 2, 2); px(ctx, '#ffd040', 8, 9, 1, 2);
  },
  water_main(ctx) {
    px(ctx, '#3a4a5a', 5, 3, 6, 12); px(ctx, '#5a7a9a', 6, 4, 4, 10); px(ctx, '#8ab0d0', 6, 4, 1, 10);
    px(ctx, '#c8323c', 3, 5, 10, 2); px(ctx, '#e85a60', 3, 5, 10, 1); px(ctx, '#3a4a5a', 7, 2, 2, 3);
  },
  sink(ctx) {
    px(ctx, '#8a8f99', 2, 6, 12, 8); px(ctx, '#e8ecf2', 2, 5, 12, 2); px(ctx, '#b8c4d0', 4, 7, 8, 4);
    px(ctx, '#9aa6b4', 7, 2, 2, 4); px(ctx, '#9aa6b4', 7, 2, 4, 1);
  },
  toilet(ctx) {
    px(ctx, '#d8dce4', 4, 2, 8, 5); px(ctx, '#f2f4f8', 4, 2, 8, 1);
    px(ctx, '#d8dce4', 3, 7, 10, 6); px(ctx, '#b8c0cc', 5, 8, 6, 4); px(ctx, '#c8ccd4', 5, 13, 6, 2);
  },
  fridge(ctx) {
    px(ctx, '#c8ccd4', 3, 0, 10, 16); px(ctx, '#eef0f4', 4, 1, 8, 14); px(ctx, '#aab0bc', 4, 6, 8, 1);
    px(ctx, '#7a808c', 10, 2, 1, 3); px(ctx, '#7a808c', 10, 8, 1, 4);
  },
  toolkit(ctx) {
    px(ctx, '#7a1e1e', 1, 6, 14, 8); px(ctx, '#c8323c', 1, 6, 14, 3); px(ctx, '#e85a60', 1, 6, 14, 1);
    px(ctx, '#3a3a40', 5, 3, 6, 1); px(ctx, '#3a3a40', 5, 3, 1, 3); px(ctx, '#3a3a40', 10, 3, 1, 3);
    px(ctx, '#d8d0b0', 7, 8, 2, 2);
  },
  wire_spool(ctx) {
    px(ctx, '#7a5a3a', 3, 3, 10, 2); px(ctx, '#7a5a3a', 3, 11, 10, 2);
    px(ctx, '#e8a020', 4, 5, 8, 6); for (let y = 5; y < 11; y += 2) px(ctx, '#b87810', 4, y, 8, 1);
    px(ctx, '#e8a020', 12, 7, 3, 1); px(ctx, '#ffd040', 14, 6, 1, 1);
  },
  pipe_bundle(ctx) {
    for (let i = 0; i < 3; i++) {
      px(ctx, '#5a7a9a', 2, 4 + i * 3, 12, 2); px(ctx, '#8ab0d0', 2, 4 + i * 3, 12, 1);
      px(ctx, '#3a4a5a', 13, 3 + i * 3, 2, 4);
    }
    px(ctx, '#c8323c', 6, 3, 1, 10);
  },
  // Phone app icons: light glyphs, drawn over the app tile's colour (styles.css).
  app_messages(ctx) {
    pixels(ctx, [
      '.wwwwwwwwww.', 'wwwwwwwwwwww', 'wwbbwwbbwwbb', 'wwbbwwbbwwbb', 'wwwwwwwwwwww', '.wwwwwwwwww.', '..ww........', '.w..........',
    ], { w: '#fffaf0', b: '#5a8ad8' }, 2, 3);
  },
  app_map(ctx) {
    pixels(ctx, [
      'aaaabbbbaaaa', 'aaaabbbbaaaa', 'aacabbbbaaaa', 'aaaabbbbacaa', 'aaaabbcbaaaa', 'acaabbbbaaaa', 'aaaabbbbaaca', 'aaaabbbbaaaa', 'aaaabbbbaaaa',
    ], { a: '#fffaf0', b: '#d8e8c8', c: '#c8323c' }, 2, 3);
  },
  app_hardware(ctx) {
    pixels(ctx, [
      '.....hhhhh..', '....hhhhhh..', '....hhhh....', '....shh.....', '...ss.......', '..ss........', '.ss.........', 'ss..........',
    ], { h: '#d8dce4', s: '#c8a070' }, 2, 4);
  },
  app_tenants(ctx) {
    pixels(ctx, [
      '....ffff....', '...ffffff...', '...ffffff...', '...ffffff...', '....ffff....', '.....ff.....', '..cccccccc..', '.cccccccccc.', '.cccccccccc.',
    ], { f: '#ffe0c0', c: '#fffaf0' }, 2, 3);
  },
  app_sleep(ctx) {
    pixels(ctx, [
      '...mmm......', '..mm........', '.mm.........', '.mm......zzz', '.mm.......z.', '.mm......zzz', '..mm........', '...mmmm.....', '.....mmm....',
    ], { m: '#fff2b0', z: '#fffaf0' }, 2, 3);
  },
  app_rooms(ctx) {
    pixels(ctx, [
      'ww.ww.ww.ww.', 'w..........w', '.....w......', 'w....w.....w', '.....w......', 'w..........w', '.wwwww.ww...', 'w....w.....w', '.....w......', 'ww.ww.ww.ww.',
    ], { w: '#fffaf0' }, 2, 3);
  },
  cash(ctx) {
    // A folded dollar bill.
    px(ctx, '#2e5a2a', 1, 4, 14, 8); px(ctx, '#6fb05a', 2, 5, 12, 6); px(ctx, '#9bd47e', 2, 5, 12, 1);
    ctx.strokeStyle = '#2e5a2a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(8, 8, 2.2, 0, Math.PI * 2); ctx.stroke();
    px(ctx, '#2e5a2a', 7.5, 5.5, 1, 5);
  },
  coin(ctx) {
    ctx.fillStyle = '#b8860b'; ctx.beginPath(); ctx.arc(8, 8, 5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd34a'; ctx.beginPath(); ctx.arc(8, 8, 4, 0, Math.PI * 2); ctx.fill();
    px(ctx, '#fff2a8', 6, 5, 2, 2); px(ctx, '#b8860b', 7, 6, 2, 5);
  },
  boots(ctx) {
    pixels(ctx, ['..aaa.....', '..aba.....', '..aba.....', '..abaa....', '..abbba...', '..abbbbaa.', '..aaaaaaa.'], { a: '#4a2e18', b: '#8a5a34' }, 3, 4);
    px(ctx, '#ffe070', 2, 5, 2, 1); px(ctx, '#ffe070', 1, 7, 2, 1);
  },
  whetstone(ctx) {
    px(ctx, '#5a6273', 2, 9, 12, 4); px(ctx, '#8a93a6', 2, 9, 12, 1);
    px(ctx, '#c0c8d6', 5, 3, 1, 6); px(ctx, '#c0c8d6', 6, 2, 1, 2);
  },
  feather(ctx) {
    for (let i = 0; i < 10; i++) px(ctx, '#e8e0d0', 3 + i, 12 - i, 2, 2);
    px(ctx, '#a0886a', 3, 13, 1, 1);
    for (let i = 2; i < 9; i++) px(ctx, '#c8beac', 5 + i, 13 - i, 1, 1);
  },
  gloves(ctx) {
    pixels(ctx, ['.a.a.a..', '.a.a.a..', 'aaaaaaa.', 'abbbbbaa', 'abbbbba.', 'abbbbba.', '.aaaaa..'], { a: '#5a3a20', b: '#a07040' }, 4, 4);
  },
  twin(ctx) {
    px(ctx, '#c8a070', 2, 5, 9, 1); px(ctx, '#d0d4dc', 11, 4, 2, 3);
    px(ctx, '#c8a070', 2, 10, 9, 1); px(ctx, '#d0d4dc', 11, 9, 2, 3);
  },
  reach(ctx) {
    px(ctx, '#c0c8d6', 2, 7, 12, 2); px(ctx, '#ffffff', 2, 7, 12, 1);
    px(ctx, '#ffe070', 12, 4, 1, 8); px(ctx, '#ffe070', 13, 5, 1, 6);
  },
  /** Two halves of a 1×2 bed, matching the Kenney indoor palette. */
  bed_top(ctx) {
    px(ctx, '#7a4e2c', 1, 0, 14, 16);
    px(ctx, '#b8875a', 2, 1, 12, 3);
    px(ctx, '#7a4e2c', 2, 4, 12, 1);
    px(ctx, '#e8dcc0', 3, 5, 10, 4);
    px(ctx, '#ffffff', 4, 5, 8, 1);
    px(ctx, '#c8622a', 2, 10, 12, 6);
    px(ctx, '#e0804a', 2, 10, 12, 1);
    px(ctx, '#e8dcc0', 2, 9, 12, 1);
  },
  bed_bottom(ctx) {
    px(ctx, '#7a4e2c', 1, 0, 14, 16);
    px(ctx, '#c8622a', 2, 0, 12, 12);
    px(ctx, '#a84e20', 2, 11, 12, 1);
    px(ctx, '#e0804a', 4, 4, 8, 1);
    px(ctx, '#b8875a', 1, 12, 14, 3);
    px(ctx, '#5a3a20', 1, 15, 14, 1);
  },
  /** A For Rent sign on a little stand. */
  sign(ctx) {
    px(ctx, '#5a4a3a', 7, 8, 2, 8);
    px(ctx, '#3a2e24', 5, 14, 6, 2);
    px(ctx, '#e8e0c8', 2, 2, 12, 7);
    px(ctx, '#b02020', 2, 2, 12, 2);
    px(ctx, '#3a3a3a', 4, 5, 8, 1); px(ctx, '#3a3a3a', 4, 7, 5, 1);
  },
  /** The company flag (item icon and planted flag). */
  flag(ctx) {
    px(ctx, '#5a4a3a', 3, 1, 1, 15);
    px(ctx, '#3a2e24', 2, 14, 3, 2);
    px(ctx, '#d0a030', 4, 2, 9, 6);
    px(ctx, '#f0d070', 4, 2, 9, 1);
    px(ctx, '#7a2a20', 6, 4, 2, 2); px(ctx, '#7a2a20', 9, 4, 2, 2);
  },
  /** Barricades by tier: planks, a security door, a steel door, a blast door. */
  barricade(ctx, arg) {
    const tier = Number(arg ?? 1);
    if (tier === 1) {
      px(ctx, '#5a3a20', 1, 0, 14, 16);
      for (const y of [2, 7, 12]) { px(ctx, '#b8875a', 0, y, 16, 3); px(ctx, '#8a5a30', 0, y + 2, 16, 1); }
      px(ctx, '#d0d0d0', 3, 3, 1, 1); px(ctx, '#d0d0d0', 12, 8, 1, 1); px(ctx, '#d0d0d0', 4, 13, 1, 1);
      return;
    }
    const body = tier === 2 ? '#8a7a5a' : tier === 3 ? '#7a828e' : '#4a525e';
    const edge = tier === 2 ? '#5a4a30' : tier === 3 ? '#4a525e' : '#2a2e36';
    px(ctx, edge, 0, 0, 16, 16);
    px(ctx, body, 1, 1, 14, 14);
    if (tier === 4) for (let i = 0; i < 16; i += 4) px(ctx, '#d0b030', i, 13, 2, 2);
    px(ctx, '#d0c890', 11, 7, 2, 2);
  },
  /** Damage overlay: 1 = cracked, 2 = badly cracked. */
  cracks(ctx, arg) {
    const n = Number(arg ?? 1);
    const lines = [[3, 2], [4, 3], [4, 4], [5, 5], [11, 9], [10, 10], [10, 11], [9, 12]];
    for (const [x, y] of lines.slice(0, n === 1 ? 4 : 8)) px(ctx, '#1a1410', x!, y!, 1, 1);
    if (n > 1) { px(ctx, '#1a1410', 7, 6, 2, 1); px(ctx, '#1a1410', 12, 3, 1, 3); }
  },
  /** The portal: a glowing crack in the wall. */
  portal(ctx) {
    px(ctx, '#3a3020', 5, 1, 6, 15);
    const crack = [[8, 1], [7, 3], [8, 5], [9, 7], [8, 9], [7, 11], [8, 13], [8, 15]];
    for (const [x, y] of crack) {
      px(ctx, '#fff4c0', x!, y!, 2, 2);
      px(ctx, '#e8c860', x! - 1, y!, 1, 2);
      px(ctx, '#e8c860', x! + 2, y!, 1, 2);
    }
  },
  /** Lobby elevator: steel doors with a floor indicator. */
  elevator(ctx) {
    px(ctx, '#4a4e58', 1, 0, 14, 16);
    px(ctx, '#8a909c', 2, 3, 12, 13);
    px(ctx, '#b4bac6', 2, 3, 5, 13); px(ctx, '#b4bac6', 9, 3, 5, 13);
    px(ctx, '#3a3e48', 7, 3, 2, 13);
    px(ctx, '#1a1c22', 5, 1, 6, 1);
    px(ctx, '#ffb040', 7, 1, 2, 1);
    px(ctx, '#2a2c32', 1, 15, 14, 1);
  },
  shadow(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(8, 8, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
  },
  white(ctx) { px(ctx, '#ffffff', 0, 0, 16, 16); },
};

const HEART = [
  '.ooo.ooo.',
  'ohhfofffo',
  'ohffffffo',
  'offffffffo'.slice(0, 9),
  '.offfffo.',
  '..offfo..',
  '...ofo...',
  '....o....',
];

/** A 9×8 heart; `halves` 1 fills only the left half. */
function heartShape(ctx: CanvasRenderingContext2D, fill: string, hi: string, halves: number, outline = '#2a0a0e') {
  const ox = 3, oy = 4;
  HEART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === 'o') px(ctx, outline, ox + x, oy + y);
      else if (ch === 'f' || ch === 'h') {
        const filled = halves === 2 || x <= 4;
        px(ctx, filled ? (ch === 'h' ? hi : fill) : '#3a1418', ox + x, oy + y);
      }
    }
  });
}

/** Radial light gradient (white), used additively by the lighting renderer. */
export function drawLight(size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  // A broad, bright core with a long tail, so lights carry across a room.
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.65, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return c;
}
