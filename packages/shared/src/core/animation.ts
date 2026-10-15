/**
 * The animation standard: frames per second of each speed art may animate at. Nothing changes frame
 * faster than `fastest`, and every speed's frames last a whole number of 1/24 s beats, so animations
 * at different speeds stay in step with each other. Anything that flips art on a timer names one of
 * these instead of its own number.
 */
export const ANIM_FPS = { fastest: 12, fast: 8, medium: 4, slow: 2, slowest: 1 } as const;
export type AnimSpeed = keyof typeof ANIM_FPS;

/** How many frames an animation at `speed` has gone through after `seconds` (wrap or clamp it to the frames there are). */
export const frameAt = (seconds: number, speed: AnimSpeed): number => Math.floor(seconds * ANIM_FPS[speed]);
