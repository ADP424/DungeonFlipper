/**
 * Input layer. Gameplay uses only WASD + mouse; dev keys (F-keys, backtick) are for debugging.
 * Game code reads actions (`move`, `primary`, `secondary`…) rather than raw keys.
 */
export class Input {
  private keys = new Set<string>();
  private pressedKeys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  /** Buttons currently down: 0 = left, 2 = right. */
  private buttons = new Set<number>();
  private pressedButtons = new Set<number>();
  private releasedButtons = new Set<number>();
  private wheelAccum = 0;
  /** Set by the UI when the pointer is over a HUD element so clicks don't reach the game. */
  pointerOverUi = false;

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.pressedKeys.add(k);
      this.keys.add(k);
      if (k.startsWith('f') && k.length > 1 && k !== 'f5' && k !== 'f12') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.clear();
    });
    window.addEventListener('pointermove', (e) => {
      const r = this.canvas.getBoundingClientRect();
      this.mouseX = e.clientX - r.left;
      this.mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('pointerdown', (e) => {
      if (this.pointerOverUi) return;
      this.buttons.add(e.button);
      this.pressedButtons.add(e.button);
    });
    window.addEventListener('pointerup', (e) => {
      if (this.buttons.delete(e.button)) this.releasedButtons.add(e.button);
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => {
      this.wheelAccum += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });
  }

  key(k: string): boolean {
    return this.keys.has(k);
  }

  keyPressed(k: string): boolean {
    return this.pressedKeys.has(k);
  }

  moveVector(): { x: number; y: number } {
    let x = 0, y = 0;
    if (this.keys.has('a')) x -= 1;
    if (this.keys.has('d')) x += 1;
    if (this.keys.has('w')) y -= 1;
    if (this.keys.has('s')) y += 1;
    const l = Math.hypot(x, y);
    return l > 0 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  get primary(): boolean { return this.buttons.has(0); }
  get secondary(): boolean { return this.buttons.has(2); }
  get primaryPressed(): boolean { return this.pressedButtons.has(0); }
  get primaryReleased(): boolean { return this.releasedButtons.has(0); }

  /** Wheel steps since last frame (+ down / - up). */
  get wheel(): number { return this.wheelAccum; }

  /** Call once per fixed update, after the game has read edge-triggered inputs. */
  endFrame(): void {
    this.pressedKeys.clear();
    this.pressedButtons.clear();
    this.releasedButtons.clear();
    this.wheelAccum = 0;
  }
}
