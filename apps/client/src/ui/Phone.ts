import {
  absoluteMinute, describePref, formatTime, furnitureCatalog, furnitureOrder, getClock, getInbox, getOrders, getTenants, isSecure,
  orderDef, prefScore, roomLabel, storeCatalog, tenantUnit, unitStats, type PhoneMessage, type Tenant,
} from '@df/shared';
import { settings } from '../settings';
import { iconUrl } from '../engine/assets';
import type { Game } from '../game/Game';
import { tenantLook } from '../game/entities/TenantNpc';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

const PHONE_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="1" width="8" height="14" rx="1.5" fill="currentColor"/>' +
  '<rect x="5" y="3" width="6" height="9" fill="#14121a"/><rect x="7" y="13" width="2" height="1" fill="#14121a"/></svg>';

type AppId = 'messages' | 'tenants' | 'hardware' | 'map' | 'rooms' | 'sleep';

interface AppDef {
  id: AppId;
  name: string;
  icon: string;
  /** Tile colour behind the icon. */
  color: string;
}

const APPS: AppDef[] = [
  { id: 'messages', name: 'Messages', icon: 'proc:app_messages', color: '#3f9a5a' },
  { id: 'tenants', name: 'Tenants', icon: 'proc:app_tenants', color: '#d0804a' },
  { id: 'hardware', name: 'Hardware', icon: 'proc:app_hardware', color: '#c8a038' },
  { id: 'map', name: 'Map', icon: 'proc:app_map', color: '#4a8ac8' },
  { id: 'rooms', name: 'Floorplan', icon: 'proc:app_rooms', color: '#7a6ab8' },
  { id: 'sleep', name: 'Sleep', icon: 'proc:app_sleep', color: '#2c3466' },
];

/**
 * The in-world smartphone. A small icon under the minimap shows the time; clicking it brings the phone
 * up in the middle of the screen and pauses the game. Its home screen has an app per function:
 * Messages (today's, with the full history a tap away), Tenants (your contacts), Hardware (orders),
 * Map, Floorplan (true room boundaries) and Sleep (with a confirmation).
 */
export class Phone {
  readonly icon: HTMLDivElement;
  readonly hudClock: HTMLDivElement;
  private badge: HTMLDivElement;
  private backdrop: HTMLDivElement;
  private statusTime: HTMLSpanElement;
  private statusDay: HTMLSpanElement;
  private screen: HTMLDivElement;
  private app: AppId | null = null;
  /** The contact open in the Tenants app. */
  private contact: string | null = null;
  /** Messages: show every day, not just today. */
  private history = false;
  private last = { time: '', badge: -1, render: '' };

  constructor(private game: Game, root: HTMLElement, private openMap: () => void, private onOpen: () => void = () => {}) {
    this.icon = el('div', 'phone-icon hud', root);
    this.icon.innerHTML = PHONE_SVG;
    this.icon.addEventListener('click', () => this.toggle(!this.isOpen));
    this.hudClock = el('div', 'hud-clock', root);
    this.badge = el('div', 'phone-badge', this.icon);

    // Clicking outside the phone puts it away.
    this.backdrop = el('div', 'ph-backdrop hud', root);
    this.backdrop.addEventListener('pointerdown', (e) => {
      if (e.target === this.backdrop) this.toggle(false);
    });
    const device = el('div', 'ph-device', this.backdrop);
    const status = el('div', 'ph-status', device);
    this.statusTime = el('span', 'ph-time', status);
    this.statusDay = el('span', 'ph-day', status);
    this.screen = el('div', 'ph-screen', device);
    const home = el('button', 'ph-home', device);
    home.title = 'Home';
    home.addEventListener('click', () => this.goHome());
  }

  get isOpen(): boolean {
    return this.backdrop.classList.contains('open');
  }

  /** Bring the phone up (optionally straight into an app) or put it away. */
  toggle(open: boolean, app: AppId | null = null): void {
    this.backdrop.classList.toggle('open', open);
    this.icon.classList.toggle('open', open);
    this.app = open ? app : null;
    this.contact = null;
    this.history = false;
    if (!open) return;
    this.onOpen();
    this.render();
  }

  /** Escape: back out of a contact or an app first, then put the phone away. */
  back(): void {
    if (this.contact) this.contact = null;
    else if (this.app) this.app = null;
    else return this.toggle(false);
    this.render();
  }

  private goHome(): void {
    this.app = null;
    this.contact = null;
    this.history = false;
    this.render();
  }

  private openApp(id: AppId): void {
    if (id === 'map') {
      this.toggle(false);
      this.openMap();
      return;
    }
    if (id === 'rooms') {
      this.game.toggleBoundaries();
      this.game.toast(this.game.showBoundaries ? 'Floorplan on: true room boundaries are outlined' : 'Floorplan off');
      this.render();
      return;
    }
    this.app = id;
    this.render();
  }

  update(): void {
    const st = this.game.session.state;
    const c = getClock(st);
    const time = formatTime(c.minute, settings.clock24);
    if (`${c.day} ${time}` !== this.last.time) {
      this.last.time = `${c.day} ${time}`;
      this.hudClock.textContent = `Day ${c.day} · ${time}`;
      this.statusTime.textContent = time;
      this.statusDay.textContent = `Day ${c.day}`;
      this.icon.classList.toggle('late', c.minute >= 22 * 60);
    }
    const box = getInbox(st, this.game.session.playerId);
    if (box.unread !== this.last.badge) {
      this.last.badge = box.unread;
      this.badge.textContent = box.unread > 9 ? '9+' : String(box.unread);
      this.badge.style.display = box.unread > 0 ? '' : 'none';
      const urgent = box.messages.slice(-box.unread).some((m) => m.severity !== 'info');
      this.icon.classList.toggle('buzz', box.unread > 0 && urgent);
    }
    // Re-render when what the open screen shows changes (a delivery, a tenant moving in…).
    if (this.isOpen && this.renderKey() !== this.last.render) this.render();
  }

  private renderKey(): string {
    const st = this.game.session.state;
    const p = this.game.session.player;
    return `${this.app}|${this.contact}|${this.history}|${getInbox(st, p.id).messages.length}|${p.cash}|${getOrders(st, p.id).items.length}|${JSON.stringify(getTenants(st))}|${this.game.showBoundaries}`;
  }

  private render(): void {
    this.last.render = this.renderKey();
    const s = this.screen;
    s.replaceChildren();
    s.className = `ph-screen ${this.app ?? 'home'}`;
    if (!this.app) return this.renderHome();
    const bar = el('div', 'ph-appbar', s);
    const back = el('button', 'ph-back', bar);
    back.textContent = '‹';
    back.title = 'Back';
    back.addEventListener('click', () => this.back());
    const title = el('div', 'ph-apptitle', bar);
    const body = el('div', 'ph-body', s);
    switch (this.app) {
      case 'messages': title.textContent = 'Messages'; return this.renderMessages(body);
      case 'tenants': {
        const t = this.contact ? getTenants(this.game.session.state)[this.contact] : undefined;
        title.textContent = t ? t.name : 'Tenants';
        return t ? this.renderContact(body, t) : this.renderContacts(body);
      }
      case 'hardware': title.textContent = 'Hardware'; return this.renderStore(body);
      case 'sleep': title.textContent = 'Sleep'; return this.renderSleep(body);
    }
  }

  private renderHome(): void {
    const st = this.game.session.state;
    const grid = el('div', 'ph-grid', this.screen);
    const unread = getInbox(st, this.game.session.playerId).unread;
    const applicants = Object.values(getTenants(st)).filter((t) => t.status === 'applicant').length;
    for (const a of APPS) {
      const b = el('button', 'ph-app', grid);
      const tile = el('div', 'ph-app-tile', b);
      tile.style.background = a.color;
      el('img', 'ph-app-icon', tile).src = iconUrl(a.icon);
      const n = a.id === 'messages' ? unread : a.id === 'tenants' ? applicants : 0;
      if (n) el('div', 'ph-app-badge', tile).textContent = n > 9 ? '9+' : String(n);
      if (a.id === 'rooms' && this.game.showBoundaries) b.classList.add('on');
      el('div', 'ph-app-name', b).textContent = a.name;
      b.addEventListener('click', () => this.openApp(a.id));
    }
  }

  /** Today's messages (the night's digest counts as today); older ones are a tap away. */
  private renderMessages(body: HTMLDivElement): void {
    const g = this.game;
    const box = getInbox(g.session.state, g.session.playerId);
    if (box.unread > 0) g.dispatch({ type: 'messagesRead', playerId: g.session.playerId });
    const startOfToday = (getClock(g.session.state).day - 1) * 1440;
    const today = box.messages.filter((m) => absoluteMinute(m) >= startOfToday);
    const shown = this.history ? box.messages : today;
    const older = box.messages.length - today.length;
    if (!this.history && older > 0) {
      const more = el('button', 'ph-more', body);
      more.textContent = `↑ ${older} earlier message${older === 1 ? '' : 's'}`;
      more.addEventListener('click', () => {
        this.history = true;
        this.render();
      });
    }
    if (!shown.length) el('div', 'ph-empty', body).textContent = box.messages.length ? 'Nothing new today.' : 'No messages yet.';
    let day = -1;
    for (const m of shown) {
      const d = m.minute >= 1440 ? m.day + 1 : m.day;
      if (this.history && d !== day) {
        day = d;
        el('div', 'ph-dayline', body).textContent = `Day ${d}`;
      }
      this.messageRow(body, m);
    }
    // Read like a chat: newest at the bottom.
    body.scrollTop = body.scrollHeight;
  }

  private messageRow(parent: HTMLElement, m: PhoneMessage): void {
    const row = el('div', `ph-msg ${m.severity}`, parent);
    el('div', 'ph-msg-meta', row).textContent = `${m.from ? `${m.from} · ` : ''}${formatTime(m.minute, settings.clock24)}`;
    el('div', 'ph-msg-text', row).textContent = m.text;
  }

  /** Everyone renting from you, and everyone viewing a listing, as contacts. */
  private renderContacts(body: HTMLDivElement): void {
    const st = this.game.session.state;
    const all = Object.values(getTenants(st)).sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'living' ? -1 : 1));
    if (!all.length) {
      el('div', 'ph-empty', body).textContent = 'No contacts yet. Put a For Rent sign in a room you own with a bed in it, and applicants will turn up.';
      return;
    }
    for (const t of all) {
      const row = el('button', 'ph-contact', body);
      el('img', 'ph-avatar', row).src = iconUrl(tenantLook(t.id));
      const text = el('div', 'ph-contact-text', row);
      el('div', 'ph-contact-name', text).textContent = t.name;
      el('div', 'ph-contact-sub', text).textContent = this.contactLine(t);
      const mood = el('div', 'ph-mood-dot', row);
      mood.style.background = moodColor(t.mood);
      mood.title = `Mood ${t.mood}`;
      row.addEventListener('click', () => {
        this.contact = t.id;
        this.render();
      });
    }
  }

  private contactLine(t: Tenant): string {
    const st = this.game.session.state;
    const unit = tenantUnit(st, t);
    const where = unit ? roomLabel(st.floors[unit.floor]!.rooms[unit.rooms[0]!]!) : 'nowhere';
    if (t.trapped !== undefined) return `TRAPPED in ${where}`;
    if (t.displaced) return `Fled next door from ${where}`;
    return t.status === 'applicant' ? `Viewing ${where}` : `$${t.rent}/day · ${where}`;
  }

  /** One contact: how they feel, what they pay, and what you know they want. Haggling is in person. */
  private renderContact(body: HTMLDivElement, t: Tenant): void {
    const st = this.game.session.state;
    const card = el('div', 'ph-card', body);
    el('img', 'ph-avatar big', card).src = iconUrl(tenantLook(t.id));
    el('div', 'ph-card-name', card).textContent = t.name;
    el('div', 'ph-card-sub', card).textContent = `${t.status === 'applicant' ? 'Applicant' : `Tenant since day ${t.since}`} · tier ${t.tier}`;
    el('div', 'ph-card-sub', card).textContent = this.contactLine(t);
    const bar = el('div', 'tip-bar ph-moodbar', card);
    const fill = el('div', '', bar);
    fill.style.width = `${Math.max(0, Math.min(100, t.mood))}%`;
    fill.style.background = moodColor(t.mood);
    const unit = tenantUnit(st, t);
    const stats = unit ? unitStats(st, unit) : null;
    if (stats) el('div', 'ph-card-sub', card).textContent = `${stats.power ? '⚡ Power' : '✗ No power'} · ${stats.water ? '💧 Water' : '✗ No water'}`;
    el('div', 'ph-section', body).textContent = 'What they want';
    t.prefs.forEach((p, i) => {
      const row = el('div', 'ph-pref', body);
      if (i >= t.known) {
        row.textContent = '? Talk to them to find out';
        row.classList.add('unknown');
        return;
      }
      const ok = stats ? prefScore(p, stats) > 0 : false;
      row.textContent = `${ok ? '✓' : '✗'} ${describePref(p)}`;
      row.classList.add(ok ? 'good' : 'bad');
    });
    el('div', 'ph-hint', body).textContent = t.status === 'applicant'
      ? 'They\'re waiting at the place. Go talk to them to agree a rent.'
      : 'Visit them to talk or change the rent.';
  }

  /** The Hardware app: buy with cash, delivered to your apartment when the day ends. */
  private renderStore(body: HTMLDivElement): void {
    const g = this.game;
    const p = g.session.player;
    el('div', 'ph-cash', body).textContent = `You have $${p.cash}`;
    const pending = getOrders(g.session.state, p.id).items;
    if (pending.length) el('div', 'ph-empty', body).textContent = `Arriving tomorrow morning: ${pending.map((e) => orderDef(e).name).join(', ')}`;
    const row = (icon: string, name: string, title: string, price: number, entry: string) => {
      const r = el('div', 'phone-store-row', body);
      el('img', 'phone-store-icon', r).src = iconUrl(icon);
      const n = el('div', 'phone-store-name', r);
      n.textContent = name;
      n.title = title;
      const buy = el('button', 'ph-buy', r);
      buy.textContent = `$${price}`;
      buy.disabled = p.cash < price;
      buy.addEventListener('click', () => {
        g.dispatch({ type: 'orderPlaced', playerId: p.id, items: [entry], cost: price });
        g.toast(`Ordered: ${name}. It arrives at your apartment tomorrow morning.`);
        this.render();
      });
    };
    el('div', 'ph-section', body).textContent = 'Supplies';
    for (const def of storeCatalog()) row(def.icon, def.name, def.description, def.price!, def.id);
    el('div', 'ph-section', body).textContent = 'Furniture · set down in your apartment';
    for (const def of furnitureCatalog()) {
      const icon = typeof def.sprite === 'string' ? def.sprite : def.sprite.tiles[0]![0]!;
      row(icon, def.name, 'Delivered onto your apartment floor. Carry it wherever you like.', def.price!, furnitureOrder(def.id));
    }
  }

  /** Sleep on the spot, after a confirmation. */
  private renderSleep(body: HTMLDivElement): void {
    const g = this.game;
    const secure = isSecure(g.session.state, g.room.info.id);
    const box = el('div', 'ph-confirm', body);
    el('img', 'ph-confirm-icon', box).src = iconUrl('proc:app_sleep');
    if (!secure) {
      el('div', 'ph-confirm-text', box).textContent = "You can't sleep here: it isn't secure. Get somewhere safe first (your apartment, or a room you own that's cleared and barricaded).";
      return;
    }
    el('div', 'ph-confirm-text', box).textContent = 'Sleep here until morning? You\'ll only partly rest away from your own bed.';
    const btns = el('div', 'ph-confirm-btns', box);
    const no = el('button', 'ph-btn', btns);
    no.textContent = 'Not yet';
    no.addEventListener('click', () => this.goHome());
    const yes = el('button', 'ph-btn primary', btns);
    yes.textContent = 'Sleep';
    yes.addEventListener('click', () => {
      this.toggle(false);
      g.sleepHere();
    });
  }
}

function moodColor(mood: number): string {
  return mood > 60 ? '#7ad05a' : mood > 30 ? '#e0b040' : '#e05040';
}
