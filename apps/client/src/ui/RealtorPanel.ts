import { TIP_BAR_W, barWidth } from './pixels';
import {
  AMENDS_COST, RELATION, Rng, STANCE_NAME, buyPrice, deriveSeed, furnitureCatalog, furnitureOrder, getClock, getRealtors, getTenants,
  guardsFor, itemDef, realtorRooms, roomLabel, sellPrice, stanceOf, tenantUnit, transferRoom, type Command, type Realtor,
  cashText,
} from '@df/shared';
import type { Game } from '../game/Game';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

type Tab = 'main' | 'sell' | 'buy' | 'stock';

/**
 * Dealing with a rival realtor in person (P8): their temperament, and trade. Sell them a room or buy
 * one of theirs (furniture included), buy from their stock (delivered to your apartment overnight),
 * sell them what you're holding, or make amends to cool things down.
 */
export class RealtorPanel {
  private panel: HTMLDivElement;
  private id: string | null = null;
  private tab: Tab = 'main';
  private line = '';
  private last = '';

  constructor(private game: Game, root: HTMLElement) {
    this.panel = el('div', 'panel tenant realtor hud', root);
  }

  get isOpen(): boolean {
    return !!this.id;
  }

  open(id: string): void {
    const r = getRealtors(this.game.session.state)[id];
    if (!r) return;
    this.id = id;
    this.tab = 'main';
    const s = stanceOf(r);
    this.line = s === 'amiable' ? '"Neighbour! What can I do for you?"' : s === 'competitive' ? '"Oh. You. Make it quick."' : '"You\'ve got some nerve coming in here."';
    this.panel.classList.add('open');
    this.render();
  }

  close(): void {
    this.id = null;
    this.panel.classList.remove('open');
  }

  update(): void {
    if (!this.id) return;
    const st = this.game.session.state;
    const r = getRealtors(st)[this.id];
    if (!r) return this.close();
    const key = JSON.stringify([r, this.game.session.player.cash, this.game.session.changes]);
    if (key !== this.last) this.render();
  }

  private render(): void {
    const g = this.game;
    const st = g.session.state;
    const r = getRealtors(st)[this.id!];
    if (!r) return this.close();
    this.last = JSON.stringify([r, g.session.player.cash, g.session.changes]);
    const p = this.panel;
    p.replaceChildren();
    const head = el('div', 'panel-head', p);
    el('div', 'panel-title', head).textContent = r.name;
    const x = el('button', 'close', head);
    x.textContent = '×';
    x.addEventListener('click', () => this.close());

    const stance = stanceOf(r);
    const rooms = realtorRooms(st, r.id);
    el('div', 'tenant-line', p).textContent = `Realtor · ${STANCE_NAME[stance]} · ${rooms.length} room${rooms.length === 1 ? '' : 's'}${guardsFor(rooms.length) ? ` · ${guardsFor(rooms.length)} guard${guardsFor(rooms.length) > 1 ? 's' : ''}` : ''}`;
    const bar = el('div', 'tip-bar tenant-mood', p);
    const fill = el('div', '', bar);
    fill.style.width = barWidth((r.relation + 100) / 200, TIP_BAR_W);
    fill.style.background = stance === 'amiable' ? '#7ad05a' : stance === 'competitive' ? '#e0b040' : '#e05040';
    el('div', 'tenant-line', p).textContent = stance === 'amiable'
      ? 'Keeps to themselves.'
      : stance === 'competitive'
        ? 'Undercuts your listings and woos your unhappy tenants.'
        : 'Undercuts you, poaches your tenants, and sends thugs to rob you.';
    if (this.line) el('div', 'tenant-reaction', p).textContent = this.line;

    const btns = el('div', 'phone-apps', p);
    const tab = (t: Tab, label: string) => {
      const b = el('button', 'phone-app', btns);
      b.textContent = label;
      b.classList.toggle('on', this.tab === t);
      b.addEventListener('click', () => {
        this.tab = this.tab === t ? 'main' : t;
        this.render();
      });
    };
    tab('sell', 'Sell a room');
    tab('buy', 'Buy a room');
    tab('stock', 'Stock');
    const held = g.session.player.hotbar.main;
    if (held) {
      const worth = sellValue(held.defId);
      const b = el('button', 'phone-app', btns);
      b.textContent = `Sell ${itemDef(held).name} (${cashText(worth)})`;
      b.addEventListener('click', () => {
        const hb = structuredClone(g.session.player.hotbar);
        hb.main = null;
        g.setHotbar(hb);
        g.addCash(worth);
        this.line = '"I\'ll find a use for it."';
        this.render();
      });
    }
    if (stance !== 'amiable') {
      const cost = AMENDS_COST[stance];
      const b = el('button', 'phone-app', btns);
      b.textContent = `Make amends (${cashText(cost)})`;
      b.disabled = g.session.player.cash < cost;
      b.title = 'A peace offering: warms them up a step';
      b.addEventListener('click', () => {
        g.addCash(-cost);
        this.relate(r, RELATION.amends);
        this.line = stance === 'hostile' ? '"...Fine. Truce. For now."' : '"Well. That\'s more like it."';
        this.render();
      });
    }

    const list = el('div', 'realtor-list', p);
    if (this.tab === 'sell') this.renderSell(list, r);
    if (this.tab === 'buy') this.renderBuy(list, r, rooms);
    if (this.tab === 'stock') this.renderStock(list, r);
  }

  /** Your rooms on their floor that you could sell: not the lobby, nobody living in them. */
  private renderSell(list: HTMLDivElement, r: Realtor): void {
    const g = this.game;
    const st = g.session.state;
    const floor = st.floors[r.floor]!;
    const lived = new Set<string>();
    for (const t of Object.values(getTenants(st))) for (const id of tenantUnit(st, t)?.rooms ?? []) lived.add(id);
    const rooms = Object.values(floor.rooms).filter((info) => st.rooms[info.id]?.ownerId === g.session.playerId && !info.tags.includes('lobby') && !lived.has(info.id));
    if (!rooms.length) el('div', 'tenant-line', list).textContent = 'You have nothing on this floor to sell them (lobbies and rooms with tenants are off the table).';
    for (const info of rooms) {
      const price = sellPrice(st, r, info.id);
      this.row(list, roomLabel(info), `Sell · ${cashText(price)}`, r.cash < price ? "They can't afford it" : '', () => {
        this.apply([
          ...transferRoom(st, info.id, r.id),
          { type: 'playerUpdated', playerId: g.session.playerId, patch: { cash: g.session.player.cash + price } },
        ]);
        this.relate(getRealtors(g.session.state)[r.id]!, RELATION.soldRoom, -price);
        this.line = '"Pleasure doing business."';
      });
    }
  }

  private renderBuy(list: HTMLDivElement, r: Realtor, rooms: string[]): void {
    const g = this.game;
    const st = g.session.state;
    const floor = st.floors[r.floor]!;
    const forSale = rooms.filter((id) => id !== r.officeRoomId);
    if (!forSale.length) el('div', 'tenant-line', list).textContent = '"The office isn\'t for sale."';
    for (const id of forSale) {
      const price = buyPrice(st, id);
      this.row(list, roomLabel(floor.rooms[id]!), `Buy · ${cashText(price)}`, g.session.player.cash < price ? "You can't afford it" : '', () => {
        this.apply([
          ...transferRoom(st, id, g.session.playerId),
          { type: 'playerUpdated', playerId: g.session.playerId, patch: { cash: g.session.player.cash - price } },
        ]);
        this.relate(getRealtors(g.session.state)[r.id]!, RELATION.boughtRoom, price);
        this.line = '"Don\'t let the monsters in."';
      });
    }
  }

  /** Their stock: a few better-than-hardware pieces, changing daily; delivered overnight like orders. */
  private renderStock(list: HTMLDivElement, r: Realtor): void {
    const g = this.game;
    const st = g.session.state;
    const day = getClock(st).day;
    const rng = new Rng(deriveSeed(st.seed, `stock:${r.id}:${day}`));
    const pool = furnitureCatalog().filter((d) => (d.value ?? 0) >= 3);
    const offers = rng.shuffle(pool).slice(0, 4);
    for (const d of offers) {
      const price = Math.round(d.price! * 1.25);
      this.row(list, d.name, cashText(price), g.session.player.cash < price ? "You can't afford it" : '', () => {
        g.dispatch({ type: 'orderPlaced', playerId: g.session.playerId, items: [furnitureOrder(d.id)], cost: price });
        g.toast(`Bought: ${d.name}. ${r.name} will have it sent to your apartment overnight.`);
        this.line = '"Good eye."';
      });
    }
  }

  private row(list: HTMLDivElement, name: string, label: string, disabledWhy: string, act: () => void): void {
    const row = el('div', 'phone-store-row', list);
    el('div', 'phone-store-name', row).textContent = name;
    const b = el('button', 'phone-app', row);
    b.textContent = label;
    b.disabled = !!disabledWhy;
    b.title = disabledWhy;
    b.addEventListener('click', () => {
      act();
      this.render();
    });
  }

  private apply(cmds: Command[]): void {
    for (const c of cmds) this.game.dispatch(c);
    this.game.refreshArea();
  }

  /** Change how they feel about you (and their cash). */
  private relate(r: Realtor, delta: number, cash = 0): void {
    this.game.dispatch({ type: 'realtorSet', realtor: { ...r, relation: Math.max(-100, Math.min(100, r.relation + delta)), cash: r.cash + cash } });
  }
}

/** What a realtor gives you for an item: half its shop price, or a little cash. */
function sellValue(defId: string): number {
  const price = itemDef({ uid: '', defId, data: {} }).price;
  return price ? Math.max(1, Math.round(price / 2)) : 3;
}
