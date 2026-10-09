import type { SurfaceDef } from '../types';

/** The default Backrooms wall: endless mono-yellow wallpaper. */
export default {
  id: 'wallpaper_yellow',
  name: 'Mono-Yellow Wallpaper',
  applies: 'wall',
  pattern: { style: 'stripes', base: 0xc9b458, accent: 0xbca84c },
} satisfies SurfaceDef;
