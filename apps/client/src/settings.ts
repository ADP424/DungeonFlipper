/**
 * Per-device preferences (not part of the world save): kept in localStorage, read live by the game.
 * Change them through `setSetting` so they're saved.
 */
export interface Settings {
  /** Show times as 23:45 instead of 11:45 PM. */
  clock24: boolean;
  /** Shake the screen on big hits. */
  screenShake: boolean;
  /** Fade HUD elements the player walks behind. */
  fadeHud: boolean;
}

const KEY = 'df.settings';
const DEFAULTS: Settings = { clock24: false, screenShake: true, fadeHud: true };

function load(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export const settings: Readonly<Settings> = load();

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  (settings as Settings)[key] = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private mode): the setting still applies for this session.
  }
}
