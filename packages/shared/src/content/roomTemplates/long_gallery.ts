import type { RoomTemplateDef } from '../types';

export default {
  id: 'long_gallery',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }],
  tags: ['normal'],
  difficulty: 0.8,
  map: [
    'L................F..........',
    '..#..#...#...##...#...#..#..',
    '.....r...m....i....m..r.....',
    '..^^^^.....wwwwww.....^^^^..',
    '.....r........i.......r.....',
    '..#..#...#...##...#...#..#..',
    '...........................C',
  ],
  legend: {
    i: { enemy: 'intern' },
    m: { enemy: 'ceiling_moth' },
    r: { enemy: 'rat' },
    C: { furniture: 'chair' },
    F: { furniture: 'fern' },
    L: { furniture: 'floor_lamp' },
  },
} satisfies RoomTemplateDef;
