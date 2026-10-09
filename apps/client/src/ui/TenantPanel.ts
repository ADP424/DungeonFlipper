import {
  MAX_OFFER, describePref, getClock, getTenants, haggle, prefScore, roomLabel, tenantUnit, unitStats, valuation,
  type Tenant,
} from '@df/shared';
import type { Game } from '../game/Game';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

/**
 * Talking to a tenant or applicant: what they want (what you know of it), how they feel, and the
 * haggling (D18): offer a rent, they accept, counter, or refuse. Three strikes and an applicant walks.
 */
export class TenantPanel {
  private panel: HTMLDivElement;
  private id: string | null = null;
  private reaction = '';
  private counter: number | null = null;
  private offer = 6;
  private last = '';

  constructor(private game: Game, root: HTMLElement) {
    this.panel = el('div', 'panel tenant hud', root);
  }

  get isOpen(): boolean {
    return !!this.id;
  }

  open(id: string): void {
    const t = getTenants(this.game.session.state)[id];
    if (!t) return;
    this.id = id;
    this.reaction = t.status === 'applicant' ? `"Nice place. What are you asking?"` : '';
    this.counter = null;
    this.offer = t.status === 'living' ? t.rent : 6;
    this.panel.classList.add('open');
    this.render();
  }

  close(): void {
    this.id = null;
    this.panel.classList.remove('open');
  }

  /** Re-render when the record changes (a day passed, they moved in…). */
  update(): void {
    if (!this.id) return;
    const t = getTenants(this.game.session.state)[this.id];
    if (!t) return this.close();
    const k = JSON.stringify(t);
    if (k !== this.last) this.render();
  }

  private render(): void {
    const g = this.game;
    const st = g.session.state;
    const t = getTenants(st)[this.id!];
    if (!t) return this.close();
    this.last = JSON.stringify(t);
    const unit = tenantUnit(st, t);
    const s = unit ? unitStats(st, unit) : null;
    const where = unit ? roomLabel(st.floors[unit.floor]!.rooms[unit.rooms[0]!]!) : 'nowhere';
    const p = this.panel;
    p.replaceChildren();

    const head = el('div', 'panel-head', p);
    el('div', 'panel-title', head).textContent = t.name;
    const x = el('button', 'close', head);
    x.textContent = '×';
    x.addEventListener('click', () => this.close());

    el('div', 'tenant-line', p).textContent = t.status === 'applicant'
      ? `Applicant (tier ${t.tier}) · looking at ${where}`
      : `Tenant (tier ${t.tier}) · $${t.rent}/day · ${where}`;
    const mood = el('div', 'tip-bar tenant-mood', p);
    const fill = el('div', '', mood);
    fill.style.width = `${Math.max(0, Math.min(100, t.mood))}%`;
    fill.style.background = t.mood > 60 ? '#7ad05a' : t.mood > 30 ? '#e0b040' : '#e05040';

    el('div', 'phone-section', p).textContent = 'What they want';
    t.prefs.forEach((pref, i) => {
      const row = el('div', 'tenant-pref', p);
      if (i >= t.known) {
        row.textContent = '? (talk to them to find out)';
        row.classList.add('unknown');
        return;
      }
      const ok = s ? prefScore(pref, s) > 0 : false;
      row.textContent = `${describePref(pref)} ${ok ? '✓' : '✗'}`;
      row.classList.add(ok ? 'good' : 'bad');
    });

    if (s) {
      el('div', 'phone-section', p).textContent = 'The place';
      const facts = [
        `${s.area} tiles`, `${s.beds} bed${s.beds === 1 ? '' : 's'}`,
        s.secure ? 'secure' : 'not secure', s.connected ? 'reachable from the lobby' : 'cut off from the lobby',
        s.quiet ? 'quiet' : 'monsters next door',
        s.power ? 'power' : 'no power', s.water ? 'running water' : 'no water',
      ];
      el('div', 'tenant-line', p).textContent = facts.join(' · ');
    }

    if (this.reaction) el('div', 'tenant-reaction', p).textContent = this.reaction;

    const today = getClock(st).day;
    const value = s ? valuation(t, s) : 0;
    const set = (patch: Partial<Tenant>) => g.dispatch({ type: 'tenantSet', tenant: { ...t, ...patch } });

    // The rent slider: an offer to an applicant, or a new rent for a tenant.
    const row = el('div', 'tenant-offer', p);
    const slider = el('input', '', row);
    slider.type = 'range';
    slider.min = '1';
    slider.max = String(MAX_OFFER);
    slider.value = String(this.offer);
    const label = el('span', '', row);
    label.textContent = `$${this.offer}/day`;
    slider.addEventListener('input', () => {
      this.offer = Number(slider.value);
      label.textContent = `$${this.offer}/day`;
    });
    const btns = el('div', 'phone-apps', p);

    if (t.status === 'applicant') {
      const offerBtn = el('button', 'phone-app', btns);
      offerBtn.textContent = 'Offer';
      offerBtn.addEventListener('click', () => {
        const r = haggle(value, this.offer);
        if (r.result === 'accept') return this.moveIn(t, this.offer, r.mood - 10 * t.strikes);
        const strikes = t.strikes + 1;
        if (strikes >= 3) {
          g.dispatch({ type: 'tenantRemoved', id: t.id });
          g.toast(`${t.name} walked off.`);
          g.syncNpcs();
          return this.close();
        }
        this.counter = r.result === 'counter' ? r.counter! : null;
        this.reaction = r.result === 'counter' ? `"Hmm. How about $${r.counter} a day?"` : `"That's way too much."`;
        set({ strikes });
      });
      if (this.counter !== null) {
        const deal = el('button', 'phone-app', btns);
        deal.textContent = `Deal at $${this.counter}`;
        deal.addEventListener('click', () => this.moveIn(t, this.counter!, 45 - 10 * t.strikes));
      }
    } else {
      const propose = el('button', 'phone-app', btns);
      propose.textContent = 'Ask for this rent';
      propose.addEventListener('click', () => {
        if (this.offer === t.rent) return;
        if (this.offer <= value) {
          this.reaction = this.offer < t.rent ? '"Oh! Thanks."' : '"…Fine."';
          set({ rent: this.offer, mood: Math.max(0, Math.min(100, t.mood + (this.offer < t.rent ? 5 : -5))) });
        } else {
          this.reaction = '"Not a chance."';
          set({ mood: Math.max(0, t.mood - 15) });
        }
      });
      const talk = el('button', 'phone-app', btns);
      talk.textContent = 'Talk';
      talk.disabled = t.lastTalk === today || t.known >= t.prefs.length;
      talk.title = talk.disabled ? 'Nothing new to learn today' : 'Learn something they care about';
      talk.addEventListener('click', () => {
        const learned = t.prefs[t.known];
        this.reaction = learned ? `They mention: ${describePref(learned).toLowerCase()}.` : '';
        set({ known: Math.min(t.prefs.length, t.known + 1), lastTalk: today });
      });
    }
  }

  private moveIn(t: Tenant, rent: number, mood: number): void {
    const g = this.game;
    g.dispatch({ type: 'tenantSet', tenant: { ...t, status: 'living', rent, mood: Math.max(10, Math.min(100, Math.round(mood))), strikes: 0, since: getClock(g.session.state).day } });
    g.toast(`${t.name} is moving in for $${rent}/day.`);
    this.reaction = '"It\'s a deal."';
    this.counter = null;
    g.syncNpcs();
    this.render();
  }
}
