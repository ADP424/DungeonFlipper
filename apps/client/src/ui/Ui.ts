import {
  CELL_H, CELL_W, MAX_STACK, canHold, canStack, countLeft, footprint, itemDef, mergeStack, registry,
  type FurniturePlacement, type HotbarSlotId, type ItemInstance,
} from '@df/shared';
import { iconUrl } from '../engine/assets';
import type { Game } from '../game/Game';
import { drawFloorMap, roomBounds } from './MapView';

type SlotRef = { kind: 'hotbar'; id: HotbarSlotId } | { kind: 'container'; index: number };

const MAP_ASPECT = (CELL_H / CELL_W) * 1.25;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/**
 * HTML overlay UI. Deliberately minimal: hearts + gold, a tiny passive strip, a small minimap and a
 * vertical hotbar that fades until hovered. Everything else lives in panels opened by clicking.
 */
export class Ui {
  readonly root: HTMLDivElement;
  private hearts: HTMLDivElement;
  private gold: HTMLSpanElement;
  private passives: HTMLDivElement;
  private minimap: HTMLCanvasElement;
  private hotbar: HTMLDivElement;
  private bossBar: HTMLDivElement;
  private bossFill: HTMLDivElement;
  private bossName: HTMLDivElement;
  private toasts: HTMLDivElement;
  private bannerEl: HTMLDivElement;
  private tooltip: HTMLDivElement;
  private storage: HTMLDivElement;
  private storageGrid: HTMLDivElement;
  private storageTitle: HTMLDivElement;
  private storageUid: string | null = null;
  private fullMap: HTMLDivElement;
  private fullCanvas: HTMLCanvasElement;
  private fullVp = { cx: 0, cy: 0, cellPx: 40 };
  private upgrades: HTMLDivElement;
  private drag: { from: SlotRef; item: ItemInstance; ghost: HTMLImageElement } | null = null;
  private last = { hearts: '', gold: -1, passives: '', hotbar: '', storage: '', minimap: '' };
  private bannerTimer = 0;

  constructor(private game: Game) {
    this.root = el('div', 'ui');
    document.getElementById('app')!.appendChild(this.root);

    const tl = el('div', 'ui-topleft hud', this.root);
    this.hearts = el('div', 'hearts', tl);
    const goldRow = el('div', 'gold', tl);
    const coin = el('img', 'icon', goldRow);
    coin.src = iconUrl('proc:coin');
    this.gold = el('span', '', goldRow);
    this.passives = el('div', 'passives', tl);
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
    const hint = el('div', 'panel-hint', this.storage);
    hint.textContent = 'Drag items between the chest and your hotbar.';

    this.fullMap = el('div', 'fullmap hud', this.root);
    this.fullCanvas = el('canvas', '', this.fullMap);
    const fx = el('button', 'close', this.fullMap);
    fx.textContent = '×';
    fx.addEventListener('click', () => this.toggleFullMap(false));
    const fhint = el('div', 'map-hint', this.fullMap);
    fhint.textContent = 'Drag to pan · scroll to zoom · right-click to close';
    this.setupFullMapControls();

    this.upgrades = el('div', 'panel upgrades hud', this.root);

    // Clicks on HUD elements must not reach the game.
    this.root.addEventListener('pointerover', (e) => {
      game.input.pointerOverUi = !!(e.target as HTMLElement).closest('.hud');
    });
    this.root.addEventListener('pointerout', () => (game.input.pointerOverUi = false));
    window.addEventListener('pointermove', (e) => this.onPointerMove(e));
    window.addEventListener('pointerup', (e) => this.onPointerUp(e));
  }

  get blocking(): boolean {
    return this.storageUid != null || this.fullMap.classList.contains('open') || this.upgrades.classList.contains('open');
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
    if (s.gold !== this.last.gold) {
      this.last.gold = s.gold;
      this.gold.textContent = String(s.gold);
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
    const mk = `${s.roomId}:${Math.round(pl.x * 2)}:${Math.round(pl.y * 2)}`;
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
    const f = this.currentContainer();
    return f?.contents?.[ref.index] ?? null;
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
    const badge = this.badgeFor(item);
    if (badge) el('span', 'badge', slot).textContent = badge;
    slot.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.startDrag(ref, item, e);
    });
    this.attachTooltip(slot, () => this.describe(item));
  }

  private badgeFor(item: ItemInstance): string {
    const def = itemDef(item);
    if (def.kind === 'tool' || def.kind === 'roll') return String(countLeft(item));
    if (def.kind === 'armor') return String(Number(item.data.armorHalves ?? 0) / 2);
    return '';
  }

  private describe(item: ItemInstance): string {
    const def = itemDef(item);
    let extra = '';
    if (def.kind === 'tool') extra = `<br><i>${countLeft(item)} uses left (stacks to ${MAX_STACK})</i>`;
    if (def.kind === 'roll') extra = `<br><i>${countLeft(item)} left (stacks to ${MAX_STACK})</i>`;
    if (def.kind === 'armor') extra = `<br><i>${Number(item.data.armorHalves ?? 0) / 2} armor hearts</i>`;
    if (def.kind === 'weapon') {
      const a = def.attack;
      extra = a.type === 'melee'
        ? `<br><i>${a.pattern} · reach ${a.range} · dmg ${a.damage} · ${a.cooldown}s</i>`
        : `<br><i>ranged · dmg ${a.damage} · ${a.cooldown}s</i>`;
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
    const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const slotEl = target?.closest('[data-slot]') as HTMLElement | null;
    if (slotEl) {
      const [kind, id] = slotEl.dataset.slot!.split(':') as [string, string];
      const to: SlotRef = kind === 'hotbar'
        ? { kind: 'hotbar', id: (/^\d+$/.test(id) ? Number(id) : id) as HotbarSlotId }
        : { kind: 'container', index: Number(id) };
      this.move(from, to);
      return;
    }
    // Dropped onto the world: put it on the floor.
    if (!target?.closest('.hud')) this.removeFrom(from, item, true);
  }

  private move(from: SlotRef, to: SlotRef): void {
    if (from.kind === to.kind && (from.kind === 'hotbar' ? from.id === (to as typeof from).id : from.index === (to as typeof from).index)) return;
    const a = this.slotItem(from);
    const b = this.slotItem(to);
    if (canStack(a, b)) return this.mergeSlots(from, to);
    const accepts = (ref: SlotRef, it: ItemInstance | null) => (ref.kind === 'hotbar' ? canHold(ref.id, it) : canHold(0, it));
    if (!accepts(to, a) || !accepts(from, b)) {
      this.game.toast("That doesn't go there");
      return;
    }
    const hb = structuredClone(this.game.session.player.hotbar);
    const f = this.currentContainer();
    const contents = f?.contents ? structuredClone(f.contents) : null;
    const write = (ref: SlotRef, it: ItemInstance | null) => {
      if (ref.kind === 'hotbar') {
        if (typeof ref.id === 'number') hb.slots[ref.id] = it;
        else hb[ref.id] = it;
      } else if (contents) contents[ref.index] = it;
    };
    write(from, b);
    write(to, a);
    this.game.setHotbar(hb);
    if (contents && f && (from.kind === 'container' || to.kind === 'container')) this.game.setContainer(f.uid, contents);
  }

  /** Dropping a stack onto a matching one: fill the target, keep any remainder where it came from. */
  private mergeSlots(from: SlotRef, to: SlotRef): void {
    const hb = structuredClone(this.game.session.player.hotbar);
    const f = this.currentContainer();
    const contents = f?.contents ? structuredClone(f.contents) : null;
    const at = (ref: SlotRef): ItemInstance | null =>
      ref.kind === 'hotbar' ? (typeof ref.id === 'number' ? hb.slots[ref.id] ?? null : hb[ref.id]) : contents?.[ref.index] ?? null;
    const src = at(from)!, dst = at(to)!;
    if (mergeStack(dst, src) === 0) {
      if (from.kind === 'hotbar') {
        if (typeof from.id === 'number') hb.slots[from.id] = null;
        else hb[from.id] = null;
      } else if (contents) contents[from.index] = null;
    }
    this.game.setHotbar(hb);
    if (contents && f && (from.kind === 'container' || to.kind === 'container')) this.game.setContainer(f.uid, contents);
  }

  private removeFrom(from: SlotRef, item: ItemInstance, drop: boolean): void {
    if (from.kind === 'hotbar') {
      const hb = structuredClone(this.game.session.player.hotbar);
      if (typeof from.id === 'number') hb.slots[from.id] = null;
      else hb[from.id] = null;
      this.game.setHotbar(hb);
    } else {
      const f = this.currentContainer();
      if (!f?.contents) return;
      const contents = structuredClone(f.contents);
      contents[from.index] = null;
      this.game.setContainer(f.uid, contents);
    }
    if (drop) this.game.dropItem(item);
  }

  // ───────────────────────────── storage ─────────────────────────────

  private currentContainer(): FurniturePlacement | undefined {
    if (!this.storageUid) return undefined;
    return this.game.room.layout.state.furniture.find((f) => f.uid === this.storageUid);
  }

  openStorage(f: FurniturePlacement): void {
    this.storageUid = f.uid;
    this.storageTitle.textContent = registry.furniture.get(f.defId).name;
    this.storage.classList.add('open');
    this.hotbar.classList.add('dragging');
    this.last.storage = '';
  }

  closeStorage(): void {
    this.storageUid = null;
    this.storage.classList.remove('open');
    this.hotbar.classList.remove('dragging');
  }

  private updateStorage(): void {
    if (!this.storageUid) return;
    const f = this.currentContainer();
    if (!f) return this.closeStorage();
    const def = registry.furniture.get(f.defId);
    const { w, h } = footprint(def, f.rot);
    const pl = this.game.player;
    if (Math.hypot(f.x + w / 2 - pl.x, f.y + h / 2 - pl.y) > 3.2) return this.closeStorage();
    const key = JSON.stringify(f.contents);
    if (key === this.last.storage) return;
    this.last.storage = key;
    this.tooltip.classList.remove('show');
    this.storageGrid.innerHTML = '';
    (f.contents ?? []).forEach((item, i) => {
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
    drawFloorMap(ctx, W, H, floor, st.rooms, p.roomId, this.game.player, {
      cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2, cellPx,
    });
  }

  toggleFullMap(open: boolean): void {
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
    drawFloorMap(ctx, W, H, st.floors[p.floor]!, st.rooms, p.roomId, this.game.player, this.fullVp);
    ctx.fillStyle = '#d8ccb4';
    ctx.font = '16px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Floor ${p.floor}`, 16, 28);
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
      if (!dragging) return;
      this.fullVp.cx -= (e.clientX - dragging.x) / this.fullVp.cellPx;
      this.fullVp.cy -= (e.clientY - dragging.y) / (this.fullVp.cellPx * MAP_ASPECT);
      dragging = { x: e.clientX, y: e.clientY };
      this.renderFullMap();
    });
    c.addEventListener('pointerup', () => (dragging = null));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const f = e.deltaY > 0 ? 1 / 1.15 : 1.15;
      this.fullVp.cellPx = Math.max(8, Math.min(160, this.fullVp.cellPx * f));
      this.renderFullMap();
    }, { passive: false });
  }
}
