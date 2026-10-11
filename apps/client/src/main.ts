import { Application } from 'pixi.js';
import { registerAllContent, registry } from '@df/shared';
import { canvasFor, loadAssets } from './engine/assets';
import { validateBrains } from './game/behaviors';
import { Game } from './game/Game';
import { Session } from './game/Session';

async function main(): Promise<void> {
  registerAllContent();
  validateBrains();
  const host = document.getElementById('app')!;
  const app = new Application();
  await app.init({ preference: 'webgl', resizeTo: window, background: 0x0b0a10, antialias: false, roundPixels: true, autoDensity: true, resolution: window.devicePixelRatio || 1 });
  host.prepend(app.canvas);
  await loadAssets();
  const session = await Session.boot();
  document.getElementById('loading')?.remove();
  const game = new Game(app, session);
  if (import.meta.env.DEV) {
    Object.assign(window, { game, df: { registry, canvasFor } });
    console.info('[DungeonFlipper] dev keys: F2 random item · F3 +50 cash · F4 kill room · F6 heal · F7 random furniture · F8 next floor · F9 reset world · F10 +1 hour · Shift+F10 to 11:45 PM');
  }
}

main().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = `Failed to start: ${(e as Error).message}`;
});
