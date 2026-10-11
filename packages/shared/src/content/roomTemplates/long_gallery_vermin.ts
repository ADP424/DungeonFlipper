import type { RoomTemplateDef } from '../types';

export default {
  id: 'long_gallery_vermin',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.3,
  map: [
    'L................P..........',
    '..#..#...#...##...#...#..#..',
    '.....r...m..........m..r....',
    '..^^^^.....wwwwww.....^^^^..',
    '.....m........r.......m.....',
    '..#..#...#...##...#...#..#..',
    '...........................t',
  ],
  legend: {
    m: { enemy: 'ceiling_moth' },
    r: { enemy: 'rat' },
    L: { furniture: 'floor_lamp' },
    P: { furniture: 'potted_plant' },
    t: { furniture: 'stool' },
  },
} satisfies RoomTemplateDef;
