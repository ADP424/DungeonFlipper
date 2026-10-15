import {
  BARRICADE_TIERS, CELL_H, CELL_W, MAX_STACK, TILE_PX, addToHotbar, getTenants, canHold, canStack, countLeft, footprint, itemDef, mergeStack, registry,
  isStackable, kitAccepts, uid, getRealtors, stanceOf, STANCE_NAME, type FurniturePlacement, type Hotbar, type HotbarSlotId, type ItemInstance,
  cashText,
} from '@df/shared';
import { canvasFor, iconUrl } from '../engine/assets';
import { barWidth, pixelSize } from './pixels';
import type { Game } from '../game/Game';
import { describeMapBarricade, describeMapRoom, drawFloorMap, hitTestMap, roomBounds } from './MapView';
import { Phone } from './Phone';
import { TenantPanel } from './TenantPanel';
import { RealtorPanel } from './RealtorPanel';
import { PauseMenu } from './PauseMenu';
import { settings } from '../settings';

/**
 * What a hotbar slot shows under its icon: stacks (kits, plywood, rolls) a count in the corner; things
 * with durability (armor, dual-use tools' renovation uses, a pried-off barricade's HP) a bar; a toolkit a
 * grey bar for how full it is.
 */
function slotInfo(item: ItemInstance): { count?: number; durability?: number; fullness?: number } | null {
  const def = itemDef(item);
  const worn = (d: number) => (d < 1 ? d : undefined);
  const stacked = (n: number) => (n > 1 ? n : undefined);
  if (def.kind === 'kit') return { fullness: (item.contents ?? []).filter(Boolean).length / def.slots };
  if (def.kind === 'armor') return { durability: worn(Number(item.data.armorHalves ?? 0) / def.halves) };
  if (def.kind === 'weapon') return def.tool ? { durability: worn(countLeft(item) / def.tool.uses) } : null;
  if (def.kind === 'tool' && typeof item.data.hp === 'number' && def.action.id === 'barricade') {
    return { count: stacked(countLeft(item)), durability: worn(item.data.hp / BARRICADE_TIERS[Number(def.action.params?.tier ?? 1)]!.hp) };
  }
  if (def.kind === 'tool' || def.kind === 'roll') return { count: stacked(countLeft(item)) };
  return null;
}

/** Show an icon at its art's own size (hearts and the cash symbol can be any size). */
const artSize = (img: HTMLImageElement, key: string) => {
  const art = canvasFor(key);
  pixelSize(img, art.width, art.height);
};

/** Inner widths of the hotbar's durability bars and the boss bar, in art pixels (styles.css). */
const USAGE_W = 12;
/** The minimap, in art pixels. */
const MINIMAP_W = 36;
const MINIMAP_H = 27;
const BOSS_W = 118;

/** Tool actions you work with in your main hand; everything else you'd place or apply (flags, kits, signs, rolls) goes in the off hand. */
const MAIN_HAND_ACTIONS = new Set(['clean', 'layUtility', 'demolish']);
/** Weapons and working tools go in the main hand on a double-click; placeables and materials in the off hand. */
function mainHandItem(item: ItemInstance): boolean {
  const def = itemDef(item);
  return def.kind === 'weapon' || (def.kind === 'tool' && MAIN_HAND_ACTIONS.has(def.action.id));
}

type SlotRef = { kind: 'hotbar'; id: HotbarSlotId } | { kind: 'container'; index: number };
const refKey = (r: SlotRef) => (r.kind === 'hotbar' ? `h:${r.id}` : `c:${r.index}`);
type Box = { kind: 'furniture'; uid: string } | { kind: 'kit'; slot: HotbarSlotId };

const sameSlot = (a: SlotRef, b: SlotRef) =>
  a.kind === b.kind && (a.kind === 'hotbar' ? a.id === (b as typeof a).id : a.index === (b as typeof a).index);
const hotbarAt = (hb: Hotbar, id: HotbarSlotId): ItemInstance | null => (typeof id === 'number' ? hb.slots[id] ?? null : hb[id]);
function setHotbarAt(hb: Hotbar, id: HotbarSlotId, it: ItemInstance | null): void {
  if (typeof id === 'number') hb.slots[id] = it;
  else hb[id] = it;
}

const MAP_ASPECT = (CELL_H / CELL_W) * 1.25;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/**
 * HTML overlay UI. Deliberately minimal: hearts + cash, a small minimap and a
 * vertical hotbar that fades until hovered. Everything else lives in panels opened by clicking.
 */
export class Ui {
  readonly root: HTMLDivElement;
  private hearts: HTMLDivElement;
  private cash: HTMLSpanElement;
  private minimap: HTMLCanvasElement;
  private hotbar: HTMLDivElement;
  private bossBar: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossName: HTMLDivElement;
  private toasts: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private fadeEl: HTMLDivElement;
  private phone: Phone;
  private tooltip: HTMLDivElement;
  private storage: HTMLDivElement;
  private storageGrid: HTMLDivElement;
  private storageTitle: HTMLDivElement;
  private storageHint!: HTMLDivElement;
  /** The open container: a chest in the room, or a toolkit in the hotbar. */
  private box: Box | null = null;
  private fullMap: HTMLDivElement;
  private fullCanvas: HTMLCanvasElement;
  private fullVp = { cx: 0, cy: 0, cellPx: 40 };
  private elevator: HTMLDivElement;
  private tenant: TenantPanel;
  private realtor: RealtorPanel;
  private pause: PauseMenu;
  private confirmEl: HTMLDivElement;
  /** What you've picked up and are holding on the mouse (inventory clicks), and where from. */
  private cursor: { item: ItemInstance; from: SlotRef; ghost: HTMLDivElement } | null = null;
  private lastClick = { key: '', t: 0 };
  private mouse = { x: 0, y: 0 };
  private last = { hearts: '', cash: -1, hotbar: '', storage: '', minimap: '' };
  private bannerTimer = 0;

  constructor(private game: Game) {
    this.root = el('div', 'ui');
    document.getElementById('app')!.appendChild(this.root);

    const tl = el('div', 'ui-topleft', this.root);
    this.hearts = el('div', 'hearts', tl);
    const cashRow = el('div', 'cash', tl);
    const coin = el('img', 'icon', cashRow);
    coin.src = iconUrl('ui/cash');
    artSize(coin, 'ui/cash');
    this.cash = el('span', '', cashRow);

    this.minimap = el('canvas', 'minimap hud', this.root);
    this.minimap.title = 'Open map';
    this.minimap.addEventListener('click', () => this.toggleFullMap(true));
    // The HUD scales with the window, so the map canvases must re-render at their new size.
    window.addEventListener('resize', () => {
      this.last.minimap = '';
      if (this.fullMap.classList.contains('open')) this.renderFullMap();
    });

    this.hotbar = el('div', 'hotbar hud', this.root);

    this.bossBar = el('div', 'bossbar', this.root);
    this.bossName = el('div', 'bossname', this.bossBar);
    const track = el('div', 'bosstrack', this.bossBar);
    this.bossFill = el('div', 'bossfill', track);

    // The phone and the tenant panel share the right side: one closes the other.
    this.phone = new Phone(game, this.root, () => this.toggleFullMap(true), () => this.tenant?.close());
    // Above the HUD, below toasts and banners (the "Day N" banner shows over the dark screen).
    this.fadeEl = el('div', 'fade', this.root);
    this.toasts = el('div', 'toasts', this.root);
    this.bannerEl = el('div', 'banner', this.root);
    this.tooltip = el('div', 'tooltip', this.root);

    this.storage = el('div', 'panel storage hud', this.root);
    const sh = el('div', 'panel-head', this.storage);
    this.storageTitle = el('div', 'panel-title', sh);
    const sx = el('button', 'close', sh);
    sx.textContent = '×';
    sx.addEventListener('click', () => this.closeStorage());
    this.storageGrid = el('div', 'storage-grid', this.storage);
    this.storageHint = el('div', 'panel-hint', this.storage);

    this.fullMap = el('div', 'fullmap hud', this.root);
    this.fullCanvas = el('canvas', '', this.fullMap);
    const fx = el('button', 'close', this.fullMap);
    fx.textContent = '×';
    fx.addEventListener('click', () => this.toggleFullMap(false));
    const fhint = el('div', 'map-hint', this.fullMap);
    fhint.textContent = 'Drag to pan · scroll to zoom · right-click to close';
    this.setupFullMapControls();

    this.elevator = el('div', 'panel elevator hud', this.root);
    this.tenant = new TenantPanel(game, this.root);
    this.realtor = new RealtorPanel(game, this.root);
    this.pause = new PauseMenu(this.root);
    this.confirmEl = el('div', 'confirm-backdrop hud', this.root);
    // Escape closes whatever is open (the phone backs out one screen at a time); with nothing open, it pauses.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.repeat) return;
      e.preventDefault();
      if (this.cursor) return this.returnCursor();
      if (this.pause.isOpen) this.pause.toggle(false);
      else if (this.confirmEl.classList.contains('open')) this.confirmEl.classList.remove('open');
      else if (this.phone.isOpen) this.phone.back();
      else if (this.blocking) this.closePanels();
      else this.pause.toggle(true);
    });

    // Clicks on HUD elements must not reach the game.
    this.root.addEventListener('pointerover', (e) => {
      game.input.pointerOverUi = !!(e.target as HTMLElement).closest('.hud');
    });
    this.root.addEventListener('pointerout', () => (game.input.pointerOverUi = false));
    window.addEventListener('pointermove', (e) => this.moveCursor(e.clientX, e.clientY));
    // Holding something and clicking the world (anything but the HUD): drop it at your feet.
    window.addEventListener('pointerdown', (e) => {
      if (!this.cursor) return;
      const target = e.target as HTMLElement;
      if (target.closest('.slot') || target.closest('.hud')) return;
      e.stopPropagation();
      e.preventDefault();
      const item = this.cursor.item;
      this.clearCursor();
      this.game.dropItem(item);
    }, true);
    window.addEventListener('blur', () => this.returnCursor());
    window.addEventListener('pagehide', () => this.returnCursor());
  }

  /** The Escape menu, the phone or a confirmation is up: the game doesn't simulate at all. */
  get paused(): boolean {
    return this.pause.isOpen || this.phone.isOpen || this.confirmEl.classList.contains('open');
  }

  /** Ask before doing something you can't take back (going to bed). The game waits while it's up. */
  confirm(title: string, text: string, yes: string, onYes: () => void): void {
    const b = this.confirmEl;
    b.replaceChildren();
    const p = el('div', 'panel confirm open', b);
    el('div', 'pause-title', p).textContent = title;
    el('div', 'confirm-text', p).textContent = text;
    const btns = el('div', 'confirm-btns', p);
    const no = el('button', 'pause-btn', btns);
    no.textContent = 'Not yet';
    no.addEventListener('click', () => b.classList.remove('open'));
    const ok = el('button', 'pause-btn primary', btns);
    ok.textContent = yes;
    ok.addEventListener('click', () => {
      b.classList.remove('open');
      onYes();
    });
    b.classList.add('open');
  }

  /** Close every panel and overlay (Escape). */
  private closePanels(): void {
    this.closeStorage();
    if (this.fullMap.classList.contains('open')) this.toggleFullMap(false);
    if (this.phone.isOpen) this.phone.toggle(false);
    this.elevator.classList.remove('open');
    this.tenant.close();
    this.realtor.close();
  }

  /** A menu or panel is open: clicks don't reach the game and the clock stops. */
  get blocking(): boolean {
    return this.pause.isOpen || this.box != null || this.fullMap.classList.contains('open') || this.phone.isOpen || this.elevator.classList.contains('open') || this.tenant.isOpen || this.realtor.isOpen;
  }

  // ───────────────────────────── per-frame ─────────────────────────────

  update(): void {
    const s = this.game.session.player;
    const pl = this.game.player;
    const max = pl.maxRedHalves();
    const armor = s.hotbar.armor ? Number(s.hotbar.armor.data.armorHalves ?? 0) : 0;
    const hk = `${s.redHalves}/${max}/${armor}`;
    if (hk !== this.last.hearts) {
      this.last.hearts = hk;
      this.renderHearts(s.redHalves, max, armor);
    }
    if (s.cash !== this.last.cash) {
      this.last.cash = s.cash;
      this.cash.textContent = `${s.cash}`;
    }
    const hb = JSON.stringify(s.hotbar);
    if (hb !== this.last.hotbar) {
      this.last.hotbar = hb;
      this.renderHotbar();
    }
    this.updateStorage();
    this.updateBoss();
    this.phone.update();
    if (this.cursor && this.paused) this.returnCursor();
    this.ghostHud();
    this.tenant.update();
    this.realtor.update();
    this.npcHover();
    const mk = `${s.roomId}:${Math.round(pl.x * 2)}:${Math.round(pl.y * 2)}:${this.game.session.changes}`;
    if (mk !== this.last.minimap) {
      this.last.minimap = mk;
      this.renderMinimap();
      if (this.fullMap.classList.contains('open')) this.renderFullMap();
    }
    if (this.bannerTimer > 0 && performance.now() > this.bannerTimer) {
      this.bannerEl.classList.remove('show');
      this.bannerTimer = 0;
    }
  }

  onRoomChanged(): void {
    this.closeStorage();
    this.elevator.classList.remove('open');
    this.last.minimap = '';
  }

  // ───────────────────────────── hearts ─────────────────────────────────────────

  private renderHearts(red: number, max: number, armor: number): void {
    this.hearts.innerHTML = '';
    const add = (key: string) => {
      const i = el('img', 'heart', this.hearts);
      i.src = iconUrl(key);
      artSize(i, key);
    };
    for (let i = 0; i < Math.ceil(max / 2); i++) {
      const v = red - i * 2;
      add(v >= 2 ? 'ui/hearts/full' : v === 1 ? 'ui/hearts/half' : 'ui/hearts/empty');
    }
    for (let i = 0; i < Math.ceil(armor / 2); i++) add(armor - i * 2 >= 2 ? 'ui/hearts/armor' : 'ui/hearts/armor_half');
  }

  // ───────────────────────────── hotbar ─────────────────────────────

  private slotItem(ref: SlotRef): ItemInstance | null {
    if (ref.kind === 'hotbar') {
      const hb = this.game.session.player.hotbar;
      return typeof ref.id === 'number' ? hb.slots[ref.id] ?? null : hb[ref.id];
    }
    return this.boxContents()?.[ref.index] ?? null;
  }

  private renderHotbar(): void {
    const hb = this.game.session.player.hotbar;
    // Slots are rebuilt, so a tooltip for a removed element would never get its pointerleave.
    this.tooltip.classList.remove('show');
    this.hotbar.innerHTML = '';
    const make = (id: HotbarSlotId, label?: string) => {
      const slot = el('div', 'slot', this.hotbar);
      if (label) slot.classList.add('equip');
      slot.dataset.slot = `hotbar:${id}`;
      if (label) el('span', 'slot-label', slot).textContent = label;
      const item = typeof id === 'number' ? hb.slots[id] ?? null : hb[id];
      this.fillSlot(slot, item, { kind: 'hotbar', id });
    };
    make('main', 'L');
    make('off', 'R');
    make('armor', 'A');
    el('div', 'divider', this.hotbar);
    hb.slots.forEach((_, i) => make(i));
  }

  private fillSlot(slot: HTMLElement, item: ItemInstance | null, ref: SlotRef): void {
    slot.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      e.preventDefault();
      this.slotClick(ref, e.button === 2, e.shiftKey);
    });
    slot.addEventListener('contextmenu', (e) => e.preventDefault());
    if (!item) return;
    const def = itemDef(item);
    const img = el('img', '', slot);
    img.src = iconUrl(def.icon);
    img.draggable = false;
    const shown = slotInfo(item);
    if (shown?.count !== undefined) el('span', 'badge', slot).textContent = String(shown.count);
    if (shown?.durability !== undefined) {
      const bar = el('div', 'usage', slot);
      const fill = el('div', 'usage-fill', bar);
      fill.style.width = barWidth(shown.durability, USAGE_W);
      fill.classList.toggle('low', shown.durability <= 0.25);
    }
    if (shown?.fullness !== undefined) {
      const fill = el('div', 'usage-fill kit', el('div', 'usage', slot));
      fill.style.width = barWidth(shown.fullness, USAGE_W);
    }
    this.attachTooltip(slot, () => this.describe(item));
  }


  private describe(item: ItemInstance): string {
    const def = itemDef(item);
    let extra = '';
    if (def.kind === 'tool') extra = typeof item.data.hp === 'number'
      ? `<br><i>Pried off: ${Math.round(item.data.hp)} HP left (doesn't stack with new ones)</i>`
      : `<br><i>${countLeft(item)} uses left (stacks to ${MAX_STACK})</i>`;
    if (def.kind === 'roll') extra = `<br><i>${countLeft(item)} left (stacks to ${MAX_STACK})</i>`;
    if (def.kind === 'kit') {
      const inside = (item.contents ?? []).filter((x): x is ItemInstance => !!x).map((x) => itemDef(x).name);
      extra = `<br><i>${inside.length ? inside.join(', ') : 'Empty'} (${inside.length}/${def.slots})</i>`;
    }
    if (def.kind === 'armor') extra = `<br><i>${Number(item.data.armorHalves ?? 0) / 2} armor hearts</i>`;
    if (def.kind === 'weapon') {
      const a = def.attack;
      extra = a.type === 'melee'
        ? `<br><i>${a.pattern} · reach ${a.range} · dmg ${a.damage} · ${a.cooldown}s</i>`
        : `<br><i>ranged · dmg ${a.damage} · ${a.cooldown}s</i>`;
      if (def.tool) extra += `<br><i>${countLeft(item)} renovation uses left (fighting doesn't wear it)</i>`;
    }
    return `<b>${def.name}</b><br>${def.description}${extra}`;
  }

  private attachTooltip(elm: HTMLElement, html: () => string): void {
    elm.addEventListener('pointerenter', () => {
      if (this.cursor) return;
      this.tooltip.innerHTML = html();
      this.tooltip.classList.add('show');
      const r = elm.getBoundingClientRect();
      const tw = this.tooltip.offsetWidth;
      const left = r.left - tw - 8 > 0 ? r.left - tw - 8 : r.right + 8;
      this.tooltip.style.left = `${left}px`;
      this.tooltip.style.top = `${Math.max(4, r.top)}px`;
    });
    elm.addEventListener('pointerleave', () => this.tooltip.classList.remove('show'));
  }

  // ───────────────────────────── the cursor (Minecraft-style inventory) ─────────────────────────────

  /**
   * Inventory clicks, as in Minecraft:
   *   left click   – pick up a stack; holding something, put it all down (topping up a matching stack,
   *                  or swapping with whatever's there)
   *   right click  – pick up half a stack; holding something, put down just one. On a toolkit in the
   *                  hotbar: open it, or (holding a tool) put the tool inside
   *   shift+click  – send it across to the open chest / toolkit, or back
   *   double-click – take it in hand (weapons and working tools: main hand; the rest: off hand)
   * Clicking the world while holding something drops it at your feet.
   */
  private slotClick(ref: SlotRef, right: boolean, shift: boolean): void {
    const now = performance.now();
    const key = refKey(ref);
    // A double-click is a pick-up and a put-back on the same slot in quick succession: take it in hand.
    const double = !right && !shift && !!this.cursor && this.lastClick.key === key && now - this.lastClick.t < 350;
    this.lastClick = { key: '', t: 0 };
    if (double) {
      this.putDown(ref, false);
      return this.equip(ref);
    }
    if (shift && !this.cursor && this.box) return this.quickMove(ref);
    if (this.cursor) return this.putDown(ref, right);
    const t = this.tx();
    const slot = t.read(ref);
    if (!slot) return;
    if (right && itemDef(slot).kind === 'kit' && ref.kind === 'hotbar') return this.toggleKit(ref.id);
    if (right && isStackable(slot) && countLeft(slot) > 1) {
      // Half the stack (rounded up) comes with you.
      const take = Math.ceil(countLeft(slot) / 2);
      slot.data.count = countLeft(slot) - take;
      t.commit();
      return this.pickUp({ ...structuredClone(slot), uid: uid(), data: { ...slot.data, count: take } }, ref);
    }
    t.write(ref, null);
    t.commit();
    if (this.box?.kind === 'kit' && ref.kind === 'hotbar' && ref.id === this.box.slot) this.closeStorage();
    this.pickUp(slot, ref);
    if (!right) this.lastClick = { key, t: now };
  }

  /** Put down what you're holding on a slot: all of it, or (`one`) just one. */
  private putDown(ref: SlotRef, one: boolean): void {
    const c = this.cursor;
    if (!c) return;
    const held = c.item;
    const t = this.tx();
    const slot = t.read(ref);
    // A tool onto a toolkit (right click): it goes inside.
    if (one && slot && itemDef(slot).kind === 'kit' && kitAccepts(held)) {
      const i = slot.contents?.findIndex((x) => !x) ?? -1;
      if (i < 0) return this.game.toast('The toolkit is full');
      slot.contents![i] = held;
      t.commit();
      return this.clearCursor();
    }
    if (!slot) {
      if (!this.accepts(ref, held)) return this.game.toast("That doesn't go there");
      if (one && isStackable(held) && countLeft(held) > 1) {
        t.write(ref, { ...structuredClone(held), uid: uid(), data: { ...held.data, count: 1 } });
        held.data.count = countLeft(held) - 1;
        t.commit();
        return this.refreshCursor();
      }
      t.write(ref, held);
      t.commit();
      return this.clearCursor();
    }
    if (canStack(slot, held)) {
      if (one) {
        if (countLeft(slot) >= MAX_STACK) return;
        slot.data.count = countLeft(slot) + 1;
        held.data.count = countLeft(held) - 1;
      } else mergeStack(slot, held);
      t.commit();
      return countLeft(held) > 0 ? this.refreshCursor() : this.clearCursor();
    }
    // Something else is there: swap.
    if (!this.accepts(ref, held)) return this.game.toast("That doesn't go there");
    t.write(ref, held);
    t.commit();
    this.clearCursor();
    this.pickUp(slot, ref);
  }

  private pickUp(item: ItemInstance, from: SlotRef): void {
    this.clearCursor();
    const ghost = el('div', 'cursor-item', this.root);
    el('img', '', ghost).src = iconUrl(itemDef(item).icon);
    el('span', 'badge', ghost);
    this.cursor = { item, from, ghost };
    this.refreshCursor();
    this.moveCursor(this.mouse.x, this.mouse.y);
    this.tooltip.classList.remove('show');
    this.hotbar.classList.add('dragging');
  }

  private refreshCursor(): void {
    const c = this.cursor;
    if (!c) return;
    const n = slotInfo(c.item)?.count;
    c.ghost.querySelector('.badge')!.textContent = n ? String(n) : '';
  }

  private clearCursor(): void {
    this.cursor?.ghost.remove();
    this.cursor = null;
    if (!this.box) this.hotbar.classList.remove('dragging');
  }

  private moveCursor(x: number, y: number): void {
    this.mouse = { x, y };
    if (!this.cursor) return;
    this.cursor.ghost.style.left = `${x}px`;
    this.cursor.ghost.style.top = `${y}px`;
  }

  /** Put what you're holding back (where it came from, else anywhere in the hotbar, else at your feet). */
  private returnCursor(): void {
    const c = this.cursor;
    if (!c) return;
    const t = this.tx();
    if (!t.read(c.from) && this.accepts(c.from, c.item)) t.write(c.from, c.item);
    else if (!addToHotbar(t.hb, c.item)) {
      this.clearCursor();
      return this.game.dropItem(c.item);
    }
    t.commit();
    this.clearCursor();
  }

  /**
   * A working copy of the hotbar and of the open container's contents (a chest's, or the toolkit's,
   * which lives inside that copy of the hotbar), to read and write slots in and then commit at once.
   */
  private tx(): {
    hb: Hotbar; contents: (ItemInstance | null)[] | null;
    read(ref: SlotRef): ItemInstance | null; write(ref: SlotRef, it: ItemInstance | null): void; commit(): void;
  } {
    const hb = structuredClone(this.game.session.player.hotbar);
    const box = this.box;
    const chest = box?.kind === 'furniture' ? this.game.room.layout.findFurniture(box.uid)?.f : undefined;
    const kit = box?.kind === 'kit' ? hotbarAt(hb, box.slot) : null;
    const contents = chest?.contents ? structuredClone(chest.contents) : kit?.contents ?? null;
    return {
      hb, contents,
      read: (ref) => (ref.kind === 'hotbar' ? hotbarAt(hb, ref.id) : contents?.[ref.index] ?? null),
      write: (ref, it) => {
        if (ref.kind === 'hotbar') setHotbarAt(hb, ref.id, it);
        else if (contents) contents[ref.index] = it;
      },
      commit: () => {
        this.game.setHotbar(hb);
        if (chest && contents) this.game.setContainer(chest.uid, contents);
      },
    };
  }

  /** Whether a slot may take an item: hotbar slots by kind, a chest anything, a toolkit only gear. */
  private accepts(ref: SlotRef, it: ItemInstance | null): boolean {
    if (ref.kind === 'hotbar') return canHold(ref.id, it);
    return this.box?.kind === 'kit' ? kitAccepts(it) : canHold(0, it);
  }

  /**
   * Double-click: take an item in hand (weapons and tools in the main hand, rolls in the off hand;
   * armour goes on). Whatever was there goes back where the item
   * came from if it fits there, else into a free hotbar slot.
   */
  private equip(from: SlotRef): void {
    const t = this.tx();
    const item = t.read(from);
    if (!item) return;
    const kind = itemDef(item).kind;
    if (kind === 'kit') return;
    // Weapons and tools go in the main hand (left click); anything else you can hold (rolls) in the right.
    const target: HotbarSlotId | null = kind === 'armor' ? 'armor' : mainHandItem(item) ? 'main' : canHold('off', item) ? 'off' : null;
    if (!target) return this.game.toast("You can't hold that");
    if (from.kind === 'hotbar' && from.id === target) return;
    const prev = hotbarAt(t.hb, target);
    t.write(from, null);
    setHotbarAt(t.hb, target, item);
    if (prev) {
      if (this.accepts(from, prev)) t.write(from, prev);
      else {
        const i = t.hb.slots.findIndex((s) => !s);
        if (i < 0) return this.game.toast("No room for what you're holding");
        t.hb.slots[i] = prev;
      }
    }
    t.commit();
  }

  /**
   * Shift-click with a chest or the toolkit open: send an item across, from the hotbar into it or back.
   * Stacks top up matching stacks first, then take the first free slot; what doesn't fit stays put.
   */
  private quickMove(from: SlotRef): void {
    const t = this.tx();
    if (!t.contents) return;
    const item = t.read(from);
    if (!item) return;
    let moved = false;
    if (from.kind === 'hotbar') {
      if (!this.accepts({ kind: 'container', index: 0 }, item)) return this.game.toast("That doesn't go in there");
      if (this.box?.kind === 'kit' && from.id === this.box.slot) return;
      for (const s of t.contents) if (canStack(s, item) && mergeStack(s!, item) === 0) break;
      moved = countLeft(item) === 0 && canStack(item, item);
      if (!moved) {
        const i = t.contents.findIndex((s) => !s);
        if (i >= 0) {
          t.contents[i] = item;
          moved = true;
        }
      }
      if (moved) t.write(from, null);
    } else {
      // Into the hotbar's general slots (the toolkit itself is one of them, so take a copy out first).
      t.write(from, null);
      moved = addToHotbar(t.hb, item);
      if (!moved) t.write(from, item);
    }
    if (!moved) this.game.toast(from.kind === 'hotbar' ? "There's no room in there" : 'Your hotbar is full');
    t.commit();
  }

  // ───────────────────────────── storage (chests and the toolkit) ─────────────────────────────

  /** The open container's contents, as stored. */
  private boxContents(): (ItemInstance | null)[] | null {
    const box = this.box;
    if (!box) return null;
    if (box.kind === 'furniture') return this.game.room.layout.findFurniture(box.uid)?.f.contents ?? null;
    return hotbarAt(this.game.session.player.hotbar, box.slot)?.contents ?? null;
  }

  openStorage(f: FurniturePlacement): void {
    this.openBox({ kind: 'furniture', uid: f.uid }, registry.furniture.get(f.defId).name, 'Drag items between the chest and your hotbar. Shift-click to send one across; double-click to take it in hand.');
  }

  /** Open (or close) the toolkit in a hotbar slot. */
  private toggleKit(slot: HotbarSlotId): void {
    if (this.box?.kind === 'kit' && this.box.slot === slot) return this.closeStorage();
    const kit = hotbarAt(this.game.session.player.hotbar, slot);
    if (!kit) return;
    this.openBox({ kind: 'kit', slot }, itemDef(kit).name, 'Holds tools, rolls and tool-weapons. Double-click one to take it in hand.');
  }

  private openBox(box: Box, title: string, hint: string): void {
    this.box = box;
    this.storageTitle.textContent = title;
    this.storageHint.textContent = hint;
    this.storage.classList.add('open');
    this.storage.classList.toggle('kit', box.kind === 'kit');
    this.hotbar.classList.add('dragging');
    this.last.storage = '';
  }

  closeStorage(): void {
    this.returnCursor();
    this.box = null;
    this.storage.classList.remove('open');
    this.hotbar.classList.remove('dragging');
  }

  private updateStorage(): void {
    const box = this.box;
    if (!box) return;
    const contents = this.boxContents();
    if (!contents) return this.closeStorage();
    if (box.kind === 'furniture') {
      // A chest closes when you walk away from it; the toolkit comes with you.
      const f = this.game.room.layout.findFurniture(box.uid)!.f;
      const { w, h } = footprint(registry.furniture.get(f.defId), f.rot);
      const pl = this.game.player;
      if (Math.hypot(f.x + w / 2 - pl.x, f.y + h / 2 - pl.y) > 3.2) return this.closeStorage();
    }
    const key = JSON.stringify(contents);
    if (key === this.last.storage) return;
    this.last.storage = key;
    this.tooltip.classList.remove('show');
    this.storageGrid.innerHTML = '';
    contents.forEach((item, i) => {
      const slot = el('div', 'slot', this.storageGrid);
      slot.dataset.slot = `container:${i}`;
      this.fillSlot(slot, item, { kind: 'container', index: i });
    });
  }

  // ───────────────────────────── boss / toasts / banners ─────────────────────────────

  private updateBoss(): void {
    const boss = this.game.room.enemies.find((e) => e.def.boss && !e.dead);
    this.bossBar.classList.toggle('show', !!boss);
    if (boss) {
      this.bossName.textContent = boss.def.boss!.title;
      this.bossFill.style.width = barWidth(boss.hp / boss.maxHp, BOSS_W);
    }
  }

  toast(msg: string): void {
    const t = el('div', 'toast', this.toasts);
    t.textContent = msg;
    setTimeout(() => t.classList.add('fade'), 1800);
    setTimeout(() => t.remove(), 2400);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
  }

  /** A place's name, shown briefly on arrival. */
  banner(title: string): void {
    this.bannerEl.innerHTML = `<div class="banner-title">${title}</div>`;
    this.bannerEl.classList.add('show');
    this.bannerTimer = performance.now() + 2600;
  }

  /**
   * HUD drawn over the room (the minimap, phone and clock, the hotbar on the right) fades out and lets clicks through while you're near it, so tiles at the
   * room's edges stay reachable. Not while dragging an item or with a chest open (you're using it).
   */
  private ghostHud(): void {
    const g = this.game;
    const r = g.app.canvas.getBoundingClientRect();
    const px = r.left + (g.player.x * TILE_PX - g.cam.x) * g.scale;
    const py = r.top + (g.player.y * TILE_PX - g.cam.y) * g.scale;
    const near = 3.5 * TILE_PX * g.scale;
    const hotbarInUse = !!this.cursor || this.box != null;
    for (const e of [this.minimap, this.phone.icon, this.phone.hudClock, ...(hotbarInUse ? [] : [this.hotbar])]) {
      const b = e.getBoundingClientRect();
      const dx = Math.max(b.left - px, 0, px - b.right), dy = Math.max(b.top - py, 0, py - b.bottom);
      e.classList.toggle('ghost', settings.fadeHud && Math.hypot(dx, dy) < near);
    }
    if (hotbarInUse) this.hotbar.classList.remove('ghost');
    // The cursor may sit on an element that just became click-through: re-check what's under it.
    if (!this.cursor) {
      const under = document.elementFromPoint(r.left + g.input.mouseX, r.top + g.input.mouseY);
      g.input.pointerOverUi = !!under?.closest('.hud');
    }
  }

  /** The elevator's floor buttons. */
  openElevator(floors: number[], current: number, pick: (floor: number) => void): void {
    const p = this.elevator;
    p.replaceChildren();
    const head = el('div', 'panel-head', p);
    el('div', 'panel-title', head).textContent = 'Elevator';
    const x = el('button', 'close', head);
    x.textContent = '×';
    x.addEventListener('click', () => p.classList.remove('open'));
    const grid = el('div', 'elevator-buttons', p);
    for (const f of floors) {
      const b = el('button', 'elevator-btn', grid);
      b.textContent = String(f);
      b.disabled = f === current;
      b.title = f === current ? 'You are here' : `Ride to floor ${f}'s lobby`;
      b.addEventListener('click', () => {
        p.classList.remove('open');
        pick(f);
      });
    }
    p.classList.add('open');
  }

  openRealtor(id: string): void {
    if (this.phone.isOpen) this.phone.toggle(false);
    this.tenant.close();
    this.realtor.open(id);
  }

  openTenant(id: string): void {
    if (this.phone.isOpen) this.phone.toggle(false);
    this.tenant.open(id);
  }

  /** Hovering a tenant or applicant in the world: who they are, at a glance. */
  private npcHover(): void {
    if (this.cursor) return;
    const g = this.game;
    const npc = g.npcUnderCursor();
    const t = npc && getTenants(g.session.state)[npc.tenantId];
    const rn = !t ? g.realtorUnderCursor() : undefined;
    const rr = rn?.realtorId ? getRealtors(g.session.state)[rn.realtorId] : undefined;
    if (rr) {
      const r = g.app.canvas.getBoundingClientRect();
      this.tooltip.dataset.npc = rr.id;
      this.tooltip.innerHTML = `<b>${rr.name}</b><br>Realtor · ${STANCE_NAME[stanceOf(rr)]}: click to talk`;
      this.tooltip.classList.add('show');
      this.tooltip.style.left = `${r.left + g.input.mouseX + 14}px`;
      this.tooltip.style.top = `${r.top + g.input.mouseY + 14}px`;
      return;
    }
    if (!t) {
      if (this.tooltip.dataset.npc) {
        this.tooltip.classList.remove('show');
        delete this.tooltip.dataset.npc;
      }
      return;
    }
    const r = g.app.canvas.getBoundingClientRect();
    this.tooltip.dataset.npc = t.id;
    this.tooltip.innerHTML = `<b>${t.name}</b><br>${t.status === 'applicant' ? 'Applicant: click to haggle' : `Tenant · ${cashText(t.rent)}/day · mood ${t.mood}`}`;
    this.tooltip.classList.add('show');
    this.tooltip.style.left = `${r.left + g.input.mouseX + 14}px`;
    this.tooltip.style.top = `${r.top + g.input.mouseY + 14}px`;
  }

  openPhone(app: 'messages' | null = null): void {
    this.phone.toggle(true, app);
  }

  /** Fade the whole screen to black (sleeping) or back. */
  fade(dark: boolean): void {
    this.fadeEl.classList.toggle('dark', dark);
  }

  // ───────────────────────────── maps ─────────────────────────────

  private renderMinimap(): void {
    // Drawn at art-pixel resolution (one canvas pixel per art pixel) and shown at the game's pixel size.
    const c = this.minimap;
    const W = MINIMAP_W, H = MINIMAP_H;
    if (c.width !== W) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d')!;
    const st = this.game.session.state;
    const p = this.game.session.player;
    const floor = st.floors[p.floor]!;
    // Show the current room plus about two default rooms of space around it.
    const b = roomBounds(floor, p.roomId);
    const wc = b.maxX - b.minX + 4, hc = b.maxY - b.minY + 4;
    const cellPx = Math.min(W / wc, H / (hc * MAP_ASPECT));
    drawFloorMap(ctx, W, H, floor, st, p.roomId, this.game.player, {
      cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, cellPx, pixel: true,
    });
  }

  toggleFullMap(open: boolean): void {
    if (!open) this.tooltip.classList.remove('show');
    this.fullMap.classList.toggle('open', open);
    if (open) {
      const pl = this.game.player;
      this.fullVp = { cx: pl.x / CELL_W, cy: pl.y / CELL_H, cellPx: 44 };
      this.renderFullMap();
    }
  }

  private renderFullMap(): void {
    const c = this.fullCanvas;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth, H = c.clientHeight;
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = this.game.session.state;
    const p = this.game.session.player;
    drawFloorMap(ctx, W, H, st.floors[p.floor]!, st, p.roomId, this.game.player, this.fullVp);
    ctx.fillStyle = '#d8ccb4';
    ctx.font = '16px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText(p.floor === 0 ? 'Home' : `Level ${p.floor}`, 16, 28);
  }

  /** Hovering the full map: what's under the cursor (a room's status, a barricade's durability). */
  private mapHover(e: PointerEvent): void {
    const c = this.fullCanvas;
    const r = c.getBoundingClientRect();
    const st = this.game.session.state;
    const p = this.game.session.player;
    const hit = hitTestMap(c.clientWidth, c.clientHeight, st.floors[p.floor]!, st, p.roomId, this.fullVp, e.clientX - r.left, e.clientY - r.top);
    if (!hit) {
      this.tooltip.classList.remove('show');
      return;
    }
    this.tooltip.innerHTML = hit.kind === 'room' ? describeMapRoom(st, hit.room, p.id) : describeMapBarricade(st, hit);
    this.tooltip.classList.add('show');
    const tw = this.tooltip.offsetWidth, th = this.tooltip.offsetHeight;
    this.tooltip.style.left = `${Math.min(window.innerWidth - tw - 4, e.clientX + 14)}px`;
    this.tooltip.style.top = `${Math.min(window.innerHeight - th - 4, e.clientY + 14)}px`;
  }

  private setupFullMapControls(): void {
    let dragging: { x: number; y: number } | null = null;
    const c = this.fullCanvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button === 2) return this.toggleFullMap(false);
      dragging = { x: e.clientX, y: e.clientY };
      c.setPointerCapture(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (!dragging) return this.mapHover(e);
      this.fullVp.cx -= (e.clientX - dragging.x) / this.fullVp.cellPx;
      this.fullVp.cy -= (e.clientY - dragging.y) / (this.fullVp.cellPx * MAP_ASPECT);
      dragging = { x: e.clientX, y: e.clientY };
      this.renderFullMap();
    });
    c.addEventListener('pointerup', () => (dragging = null));
    c.addEventListener('pointerleave', () => this.tooltip.classList.remove('show'));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      this.fullVp.cellPx = Math.max(8, Math.min(160, this.fullVp.cellPx * f));
      this.renderFullMap();
    }, { passive: false });
  }
}
