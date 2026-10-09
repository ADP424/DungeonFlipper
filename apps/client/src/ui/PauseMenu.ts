import { setSetting, settings, type Settings } from '../settings';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, parent?: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  parent?.appendChild(e);
  return e;
}

const TOGGLES: [keyof Settings, string][] = [
  ['clock24', '24-hour clock'],
  ['screenShake', 'Screen shake'],
  ['fadeHud', 'Fade the HUD near the player'],
];

/**
 * The Escape menu: pauses everything (simulation and the clock). Settings live here; the main menu
 * (saves, multiplayer) will hang off it later.
 */
export class PauseMenu {
  private backdrop: HTMLDivElement;
  private panel: HTMLDivElement;
  private view: 'main' | 'settings' = 'main';

  constructor(root: HTMLElement) {
    this.backdrop = el('div', 'pause-backdrop', root);
    this.panel = el('div', 'panel pause', this.backdrop);
  }

  get isOpen(): boolean {
    return this.backdrop.classList.contains('open');
  }

  toggle(open = !this.isOpen): void {
    this.backdrop.classList.toggle('open', open);
    this.panel.classList.toggle('open', open);
    this.view = 'main';
    if (open) this.render();
  }

  private render(): void {
    const p = this.panel;
    p.replaceChildren();
    el('div', 'pause-title', p).textContent = this.view === 'main' ? 'Paused' : 'Settings';
    const list = el('div', 'pause-list', p);
    const button = (label: string, onClick: () => void, disabled = false, title = '') => {
      const b = el('button', 'pause-btn', list);
      b.textContent = label;
      b.disabled = disabled;
      b.title = title;
      b.addEventListener('click', onClick);
      return b;
    };
    if (this.view === 'main') {
      button('Resume', () => this.toggle(false));
      button('Settings', () => {
        this.view = 'settings';
        this.render();
      });
      button('Main menu', () => {}, true, 'Coming soon: saves and multiplayer');
      return;
    }
    for (const [key, label] of TOGGLES) {
      const row = el('label', 'pause-toggle', list);
      const box = el('input', '', row);
      box.type = 'checkbox';
      box.checked = settings[key];
      box.addEventListener('change', () => setSetting(key, box.checked));
      el('span', '', row).textContent = label;
    }
    button('Back', () => {
      this.view = 'main';
      this.render();
    });
  }
}
