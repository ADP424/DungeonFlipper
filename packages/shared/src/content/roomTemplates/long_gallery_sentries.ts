import type { RoomTemplateDef } from '../types';

export default {
  id: 'long_gallery_sentries',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }],
  tags: ['normal'],
  difficulty: 2,
  map: [
    'W................W..........',
    '..#..#...#...##...#...#..#..',
    '.....s........g.......s.....',
    '..^^^^.....wwwwww.....^^^^..',
    '..............s.............',
    '..#..#...#...##...#...#..#..',
    '...........................B',
  ],
  legend: {
    g: { enemy: 'security_guard' },
    s: { enemy: 'stapler_clerk' },
    B: { furniture: 'storage_box' },
    W: { furniture: 'work_light' },
  },
} satisfies RoomTemplateDef;
