import {
  BARRICADE_TIERS, CELL_H, CELL_W, MAX_STACK, TILE_PX, addToHotbar, getTenants, canHold, canStack, countLeft, footprint, itemDef, mergeStack, registry,
  kitAccepts, type FurniturePlacement, type Hotbar, type HotbarSlotId, type ItemInstance,
} from '@df/shared';
import { iconUrl } from '../engine/assets';
import type { Game } from '../game/Game';
import { describeMapBarricade, describeMapRoom, drawFloorMap, hitTestMap, roomBounds } from './MapView';
import { Phone } from './Phone';
import { TenantPanel } from './TenantPanel';
import { PauseMenu } from './PauseMenu';
import { settings } from '../settings';

/**
 * What a hotbar slot shows under its icon: stacks (kits, plywood, rolls) a count in the corner; things
 * with durability (armor, dual-use tools' renovation uses, a pried-off barricade's HP) a bar.
 */
function slotInfo(item: ItemInstance): { count?: number; durability?: number } | null {
  const def = itemDef(item);
  if (def.kind === 'armor') return { durability: Number(item.data.armorHalves ?? 0) / def.halves };
  if (def.kind === 'weapon') return def.tool ? { durability: countLeft(item) / def.tool.uses } : null;
  if (def.kind === 'tool' && typeof item.data.hp === 'number' && def.action.id === 'barricade') {
    const durability = item.data.hp / BARRICADE_TIERS[Number(def.action.params?.tier ?? 1)]!.hp;
    return countLeft(item) > 1 ? { count: countLeft(item), durability } : { durability };
  }
  if (def.kind === 'tool' || def.kind === 'roll') return { count: countLeft(item) };
  if (def.kind === 'kit') return { count: (item.contents ?? []).filter(Boolean).length };
  return null;
}

type SlotRef = { kind: 'hotbar'; id: HotbarSlotId } | { kind: 'container'; index: number };
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
 * HTML overlay UI. Deliberately minimal: hearts + cash, a tiny passive strip, a small minimap and a
 * vertical hotbar that fades until hovered. Everything else lives in panels opened by clicking.
 */
export class Ui {
  readonly root: HTMLDivElement;
  private hearts: HTMLDivElement;
  private cash: HTMLSpanElement;
  private passives: HTMLDivElement;
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
  private upgrades: HTMLDivElement;
  private elevator: HTMLDivElement;
  private tenant: TenantPanel;
  private pause: PauseMenu;
  private confirmEl: HTMLDivElement;
  private drag: { from: SlotRef; item: ItemInstance; ghost: HTMLImageElement } | null = null;
  private last = { hearts: '', cash: -1, passives: '', hotbar: '', storage: '', minimap: '' };
  private bannerTimer = 0;

  constructor(private game: Game) {
    this.root = el('div', 'ui');
    document.getElementById('app')!.appendChild(this.root);

    const tl = el('div', 'ui-topleft', this.root);
    this.hearts = el('div', 'hearts', tl);
    const cashRow = el('div', 'cash', tl);
    const coin = el('img', 'icon', cashRow);
    coin.src = iconUrl('proc:cash');
    this.cash = el('span', '', cashRow);
    this.passives = el('div', 'passives hud', tl);
    this.passives.title = 'Upgrades';
    this.passives.addEventListener('click', () => this.toggleUpgrades(true));

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

    this.upgrades = el('div', 'panel upgrades hud', this.root);
    this.elevator = el('div', 'panel elevator hud', this.root);
    this.tenant = new TenantPanel(game, this.root);
    this.pause = new PauseMenu(this.root);
    this.confirmEl = el('div', 'confirm-backdrop hud', this.root);
    // Escape closes whatever is open (the phone backs out one screen at a time); with nothing open, it pauses.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || e.repeat) return;
      e.preventDefault();
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
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
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
    this.upgrades.classList.remove('open');
    if (this.phone.isOpen) this.phone.toggle(false);
    this.elevator.classList.remove('open');
    this.tenant.close();
  }

  /** A menu or panel is open: clicks don't reach the game and the clock stops. */
  get blocking(): boolean {
    return this.pause.isOpen || this.box != null || this.fullMap.classList.contains('open') || this.upgrades.classList.contains('open') || this.phone.isOpen || this.elevator.classList.contains('open') || this.tenant.isOpen;
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
      this.cash.textContent = `$${s.cash}`;
    }
    const pk = s.passives.join(',');
    if (pk !== this.last.passives) {
      this.last.passives = pk;
      this.renderPassives();
    }
    const hb = JSON.stringify(s.hotbar);
    if (hb !== this.last.hotbar) {
      this.last.hotbar = hb;
      this.renderHotbar();
    }
    this.updateStorage();
    this.updateBoss();
    this.phone.update();
    this.ghostHud();
    this.tenant.update();
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

  // ───────────────────────────── hearts / passives ─────────────────────────────

  private renderHearts(red: number, max: number, armor: number): void {
    this.hearts.innerHTML = '';
    const add = (key: string) => {
      const i = el('img', 'heart', this.hearts);
      i.src = iconUrl(key);
    };
    for (let i = 0; i < Math.ceil(max / 2); i++) {
      const v = red - i * 2;
      add(v >= 2 ? 'proc:heart' : v === 1 ? 'proc:heart_half' : 'proc:heart_empty');
    }
    for (let i = 0; i < Math.ceil(armor / 2); i++) add(armor - i * 2 >= 2 ? 'proc:heart_armor' : 'proc:heart_armor_half');
  }

  private renderPassives(): void {
    this.passives.innerHTML = '';
    for (const id of this.game.session.player.passives) {
      const d = registry.items.get(id);
      const i = el('img', 'passive', this.passives);
      i.src = iconUrl(d.icon);
    }
    this.renderUpgrades();
  }

  private renderUpgrades(): void {
    const u = this.upgrades;
    u.innerHTML = '';
    const head = el('div', 'panel-head', u);
    el('div', 'panel-title', head).textContent = 'Upgrades';
    const x = el('button', 'close', head);
    x.textContent = '×';
    x.addEventListener('click', () => this.toggleUpgrades(false));
    const grid = el('div', 'upgrade-grid', u);
    const counts = new Map<string, number>();
    for (const id of this.game.session.player.passives) counts.set(id, (counts.get(id) ?? 0) + 1);
    if (!counts.size) el('div', 'panel-hint', u).textContent = 'No upgrades yet. Defeat enemies to find some.';
    for (const [id, n] of counts) {
      const d = registry.items.get(id);
      const cell = el('div', 'slot', grid);
      const img = el('img', '', cell);
      img.src = iconUrl(d.icon);
      if (n > 1) el('span', 'badge', cell).textContent = `×${n}`;
      this.attachTooltip(cell, () => `<b>${d.name}</b><br>${d.description}`);
    }
  }

  toggleUpgrades(open: boolean): void {
    this.upgrades.classList.toggle('open', open);
    if (open) this.renderUpgrades();
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
      fill.style.width = `${Math.round(shown.durability * 100)}%`;
      fill.classList.toggle('low', shown.durability <= 0.25);
    }
    slot.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      if (e.shiftKey && this.box != null) return this.quickMove(ref);
      this.startDrag(ref, item, e);
    });
    // Double-click: take it in hand (from the hotbar, a chest or the toolkit).
    slot.addEventListener('dblclick', (e) => {
      e.preventDefault();
      this.equip(ref);
    });
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
      if (this.drag) return;
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

  private startDrag(from: SlotRef, item: ItemInstance, e: PointerEvent): void {
    const ghost = el('img', 'drag-ghost', this.root);
    ghost.src = iconUrl(itemDef(item).icon);
    this.drag = { from, item, ghost };
    this.tooltip.classList.remove('show');
    this.hotbar.classList.add('dragging');
    this.moveGhost(e);
  }

  private moveGhost(e: PointerEvent): void {
    if (!this.drag) return;
    this.drag.ghost.style.left = `${e.clientX}px`;
    this.drag.ghost.style.top = `${e.clientY}px`;
  }

  private onPointerMove(e: PointerEvent): void {
    this.moveGhost(e);
  }

  private onPointerUp(e: PointerEvent): void {
    if (!this.drag) return;
    const { from, item, ghost } = this.drag;
    this.drag = null;
    ghost.remove();
    this.hotbar.classList.remove('dragging');
    if (this.box) this.hotbar.classList.add('dragging');
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const slotEl = target?.closest('[data-slot]') as HTMLElement | null;
    if (slotEl) {
      const [kind, id] = slotEl.dataset.slot!.split(':') as [string, string];
      const to: SlotRef = kind === 'hotbar'
        ? { kind: 'hotbar', id: (/^\d+$/.test(id) ? Number(id) : id) as HotbarSlotId }
        : { kind: 'container', index: Number(id) };
      // A click (no drag) on a toolkit in the hotbar opens it, or closes it again.
      if (sameSlot(from, to) && from.kind === 'hotbar' && itemDef(item).kind === 'kit') return this.toggleKit(from.id);
      this.move(from, to);
      return;
    }
    // Dropped onto the world: put it on the floor.
    if (!target?.closest('.hud')) this.removeFrom(from, item, true);
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

  private move(from: SlotRef, to: SlotRef): void {
    if (sameSlot(from, to)) return;
    const t = this.tx();
    const a = t.read(from);
    const b = t.read(to);
    if (canStack(a, b)) return this.mergeSlots(from, to);
    if (!this.accepts(to, a) || !this.accepts(from, b)) {
      this.game.toast("That doesn't go there");
      return;
    }
    t.write(from, b);
    t.write(to, a);
    t.commit();
    // The open toolkit moved (or went into itself): close it rather than track it.
    if (this.box?.kind === 'kit' && [from, to].some((r) => r.kind === 'hotbar' && r.id === (this.box as { slot: HotbarSlotId }).slot)) this.closeStorage();
  }

  /**
   * Double-click: take an item in hand (armour goes on). Whatever was there goes back where the item
   * came from if it fits there, else into a free hotbar slot.
   */
  private equip(from: SlotRef): void {
    const t = this.tx();
    const item = t.read(from);
    if (!item) return;
    const kind = itemDef(item).kind;
    if (kind === 'kit') return;
    const target: HotbarSlotId | null = kind === 'armor' ? 'armor' : canHold('main', item) ? 'main' : null;
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

  /** Dropping a stack onto a matching one: fill the target, keep any remainder where it came from. */
  private mergeSlots(from: SlotRef, to: SlotRef): void {
    const t = this.tx();
    const src = t.read(from)!, dst = t.read(to)!;
    if (mergeStack(dst, src) === 0) t.write(from, null);
    t.commit();
  }

  private removeFrom(from: SlotRef, item: ItemInstance, drop: boolean): void {
    const t = this.tx();
    t.write(from, null);
    t.commit();
    if (this.box?.kind === 'kit' && from.kind === 'hotbar' && from.id === this.box.slot) this.closeStorage();
    if (drop) this.game.dropItem(item);
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
      this.bossFill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    }
  }

  toast(msg: string): void {
    const t = el('div', 'toast', this.toasts);
    t.textContent = msg;
    setTimeout(() => t.classList.add('fade'), 1800);
    setTimeout(() => t.remove(), 2400);
    while (this.toasts.children.length > 4) this.toasts.firstChild!.remove();
  }

  banner(title: string, sub: string): void {
    this.bannerEl.innerHTML = `<div class="banner-title">${title}</div><div class="banner-sub">${sub}</div>`;
    this.bannerEl.classList.add('show');
    this.bannerTimer = performance.now() + 2600;
  }

  /**
   * HUD drawn over the room (the minimap, phone and clock top-right, the hotbar on the right, the
   * upgrades strip top-left) fades out and lets clicks through while you're near it, so tiles at the
   * room's edges stay reachable. Not while dragging an item or with a chest open (you're using it).
   */
  private ghostHud(): void {
    const g = this.game;
    const r = g.app.canvas.getBoundingClientRect();
    const px = r.left + (g.player.x * TILE_PX - g.cam.x) * g.scale;
    const py = r.top + (g.player.y * TILE_PX - g.cam.y) * g.scale;
    const near = 3.5 * TILE_PX * g.scale;
    const hotbarInUse = !!this.drag || this.box != null;
    for (const e of [this.minimap, this.phone.icon, this.phone.hudClock, this.passives, ...(hotbarInUse ? [] : [this.hotbar])]) {
      const b = e.getBoundingClientRect();
      const dx = Math.max(b.left - px, 0, px - b.right), dy = Math.max(b.top - py, 0, py - b.bottom);
      e.classList.toggle('ghost', settings.fadeHud && Math.hypot(dx, dy) < near);
    }
    if (hotbarInUse) this.hotbar.classList.remove('ghost');
    // The cursor may sit on an element that just became click-through: re-check what's under it.
    if (!this.drag) {
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

  openTenant(id: string): void {
    if (this.phone.isOpen) this.phone.toggle(false);
    this.tenant.open(id);
  }

  /** Hovering a tenant or applicant in the world: who they are, at a glance. */
  private npcHover(): void {
    if (this.drag) return;
    const g = this.game;
    const npc = g.npcUnderCursor();
    const t = npc && getTenants(g.session.state)[npc.tenantId];
    if (!t) {
      if (this.tooltip.dataset.npc) {
        this.tooltip.classList.remove('show');
        delete this.tooltip.dataset.npc;
      }
      return;
    }
    const r = g.app.canvas.getBoundingClientRect();
    this.tooltip.dataset.npc = t.id;
    this.tooltip.innerHTML = `<b>${t.name}</b><br>${t.status === 'applicant' ? 'Applicant: click to haggle' : `Tenant · $${t.rent}/day · mood ${t.mood}`}`;
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

  /** Isaac-style item announcement. */
  announce(name: string, description: string): void {
    this.banner(name, description);
  }

  // ───────────────────────────── maps ─────────────────────────────

  private renderMinimap(): void {
    const c = this.minimap;
    const dpr = window.devicePixelRatio || 1;
    const W = c.clientWidth || 160, H = c.clientHeight || 100;
    if (c.width !== Math.round(W * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const st = this.game.session.state;
    const p = this.game.session.player;
    const floor = st.floors[p.floor]!;
    // Show the current room plus about two default rooms of space around it.
    const b = roomBounds(floor, p.roomId);
    const wc = b.maxX - b.minX + 4, hc = b.maxY - b.minY + 4;
    const cellPx = Math.min(W / wc, H / (hc * MAP_ASPECT));
    drawFloorMap(ctx, W, H, floor, st, p.roomId, this.game.player, {
      cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, cellPx,
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
