import {
  absoluteMinute, describePref, formatTime, furnitureCatalog, furnitureOrder, getClock, getInbox, getOrders, getTenants, isSecure,
  orderDef, prefScore, roomLabel, REP_TIERS, ROLE_NAME, getReputation, getStaff, householdLabel, nextTierAt, repTier, staffCandidates, type Staff, storeCatalog, tenantUnit, unitStats, type PhoneMessage, type Tenant,
  cashText,
} from '@df/shared';
import { settings } from '../settings';
import { canvasFor, iconUrl } from '../engine/assets';
import { furnitureArt } from '../render/RoomRenderer';
import { barWidth, pixelSize } from './pixels';
import type { Game } from '../game/Game';
import { tenantLook } from '../game/entities/TenantNpc';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/** Inner width of the phone's bars, in art pixels (.ph-moodbar). */
const MOODBAR_W = 48;

type AppId = 'messages' | 'tenants' | 'hardware' | 'staff' | 'map' | 'rooms' | 'sleep';

interface AppDef {
  id: AppId;
  name: string;
  icon: string;
  /** Tile colour behind the icon. */
  color: string;
}

const APPS: AppDef[] = [
  { id: 'messages', name: 'Messages', icon: 'ui/phone/messages', color: '#3f9a5a' },
  { id: 'tenants', name: 'Tenants', icon: 'ui/phone/tenants', color: '#d0804a' },
  { id: 'hardware', name: 'Hardware', icon: 'ui/phone/hardware', color: '#c8a038' },
  { id: 'staff', name: 'Staff', icon: 'ui/phone/staff', color: '#3a8a8a' },
  { id: 'map', name: 'Map', icon: 'ui/phone/map', color: '#4a8ac8' },
  { id: 'rooms', name: 'Floorplan', icon: 'ui/phone/floorplan', color: '#7a6ab8' },
  { id: 'sleep', name: 'Sleep', icon: 'ui/phone/sleep', color: '#2c3466' },
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
    el('img', '', this.icon).src = iconUrl('ui/phone');
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
      this.hudClock.innerHTML = `Day ${c.day}<br>${time}`;
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
    return `${this.app}|${this.contact}|${this.history}|${getInbox(st, p.id).messages.length}|${p.cash}|${getOrders(st, p.id).items.length}|${JSON.stringify(getTenants(st))}|${JSON.stringify(getStaff(st))}|${getReputation(st, p.id)}|${this.game.showBoundaries}`;
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
      case 'staff': title.textContent = 'Staff'; return this.renderStaff(body);
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
    // Your standing: it decides who applies (D20 / D44).
    const points = getReputation(st, this.game.session.playerId);
    const next = nextTierAt(points);
    const rep = el('div', 'ph-rep', body);
    el('div', 'ph-rep-tier', rep).textContent = points < 0 ? `Reputation · infamous (applicants stay away)` : `Reputation · tier ${repTier(points)}`;
    el('div', 'ph-rep-sub', rep).textContent = next === null ? `${points} points: the best tenants are coming` : `${points} / ${next} points to tier ${repTier(next)}`;
    const bar = el('div', 'tip-bar ph-moodbar', rep);
    const fill = el('div', '', bar);
    const lo = [...REP_TIERS].reverse().find((m) => m <= points) ?? 0;
    fill.style.width = barWidth(next === null ? 1 : (points - lo) / (next - lo), MOODBAR_W);
    fill.style.background = '#c9a24e';
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
    if (t.evictDay !== undefined) return `Leaving (notice) · ${where}`;
    if (t.displaced) return `Fled next door from ${where}`;
    return t.status === 'applicant' ? `Viewing ${where}` : `${cashText(t.rent)}/day · ${where}`;
  }

  /** One contact: how they feel, what they pay, and what you know they want. Haggling is in person. */
  private renderContact(body: HTMLDivElement, t: Tenant): void {
    const st = this.game.session.state;
    const card = el('div', 'ph-card', body);
    el('img', 'ph-avatar big', card).src = iconUrl(tenantLook(t.id));
    el('div', 'ph-card-name', card).textContent = t.name;
    el('div', 'ph-card-sub', card).textContent = `${t.status === 'applicant' ? 'Applicant' : `Tenant since day ${t.since}`} · tier ${t.tier} · ${householdLabel(t)}`;
    if (t.members && t.members.length > 1) el('div', 'ph-card-sub', card).textContent = t.members.join(', ');
    if (t.arrears) el('div', 'ph-card-sub bad', card).textContent = `Owes ${cashText(t.arrears)} (holding back rent)`;
    if (t.complaint) el('div', 'ph-card-sub bad', card).textContent = `Complaint: ${({ mess: 'the mess', power: 'no power', water: 'no water', insecure: 'monsters at the door' } as const)[t.complaint.issue]} (since day ${t.complaint.since})`;
    el('div', 'ph-card-sub', card).textContent = this.contactLine(t);
    const bar = el('div', 'tip-bar ph-moodbar', card);
    const fill = el('div', '', bar);
    fill.style.width = barWidth(t.mood / 100, MOODBAR_W);
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

  /** The Staff app: who works for you (let them go), and who's looking for work today (hire them). */
  private renderStaff(body: HTMLDivElement): void {
    const g = this.game;
    const st = g.session.state;
    const day = getClock(st).day;
    const hired = Object.values(getStaff(st));
    el('div', 'ph-section', body).textContent = hired.length ? `Working for you · ${cashText(hired.reduce((n, s) => n + s.wage, 0))}/day` : 'Working for you';
    if (!hired.length) el('div', 'ph-empty', body).textContent = 'Nobody yet. Cleaners tidy up mess; handymen fix faults and patch barricades. Wages are paid every night.';
    const row = (s: Staff, label: string, act: () => void) => {
      const r = el('div', 'ph-contact', body);
      el('img', 'ph-avatar', r).src = iconUrl(`ui/phone/${s.role}`);
      const text = el('div', 'ph-contact-text', r);
      el('div', 'ph-contact-name', text).textContent = s.name;
      el('div', 'ph-contact-sub', text).textContent = `${ROLE_NAME[s.role]} · ${cashText(s.wage)}/day`;
      const b = el('button', 'ph-buy', r);
      b.textContent = label;
      b.addEventListener('click', act);
    };
    for (const s of hired) row(s, 'Let go', () => {
      g.dispatch({ type: 'staffRemoved', id: s.id });
      g.toast(`${s.name} packed up and left.`);
      g.syncNpcs();
      this.render();
    });
    el('div', 'ph-section', body).textContent = 'Looking for work today';
    for (const s of staffCandidates(st, day)) row(s, 'Hire', () => {
      g.dispatch({ type: 'staffSet', staff: { ...s, floor: g.floorIndex === 0 ? 1 : g.floorIndex, since: day } });
      g.toast(`${s.name} starts today. They look after your property on Level ${g.floorIndex === 0 ? 1 : g.floorIndex}.`);
      g.syncNpcs();
      this.render();
    });
  }

  /** The Hardware app: buy with cash, delivered to your apartment when the day ends. */
  private renderStore(body: HTMLDivElement): void {
    const g = this.game;
    const p = g.session.player;
    el('div', 'ph-cash', body).textContent = `You have ${cashText(p.cash)}`;
    const pending = getOrders(g.session.state, p.id).items;
    if (pending.length) el('div', 'ph-empty', body).textContent = `Arriving tomorrow morning: ${pending.map((e) => orderDef(e).name).join(', ')}`;
    const row = (icon: string, name: string, title: string, price: number, entry: string) => {
      const r = el('div', 'phone-store-row', body);
      const img = el('img', 'phone-store-icon', r);
      img.src = iconUrl(icon);
      const art = canvasFor(icon);
      pixelSize(img, art.width, art.height);
      const n = el('div', 'phone-store-name', r);
      n.textContent = name;
      n.title = title;
      const buy = el('button', 'ph-buy', r);
      buy.textContent = cashText(price);
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
      row(furnitureArt(def.id, 0).key, def.name, 'Delivered onto your apartment floor. Carry it wherever you like.', def.price!, furnitureOrder(def.id));
    }
  }

  /** Sleep on the spot, after a confirmation. */
  private renderSleep(body: HTMLDivElement): void {
    const g = this.game;
    const secure = isSecure(g.session.state, g.room.info.id);
    const box = el('div', 'ph-confirm', body);
    el('img', 'ph-confirm-icon', box).src = iconUrl('ui/phone/sleep');
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
