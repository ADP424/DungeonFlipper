import type { RollDef } from '../../types';

export default {
  id: 'roll_wallpaper_rose',
  kind: 'roll',
  name: 'Rose Wallpaper',
  description: 'Papers walls in rooms you own. A tall wall costs 2, a low wall 1.',
  icon: 'proc:roll:wallpaper_rose',
  surface: 'wallpaper_rose',
  coverage: 32,
} satisfies RollDef;
