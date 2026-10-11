import type { RoomTemplateDef } from '../types';

export default {
  id: 'great_hall_showroom',
  cells: [{ cx: 0, cy: 0 }, { cx: 1, cy: 0 }, { cx: 0, cy: 1 }, { cx: 1, cy: 1 }],
  tags: ['normal'],
  difficulty: 1.5,
  map: [
    'L.................L.........',
    '..##...................##...',
    '..##......n.....n......##...',
    '............................',
    '.......OOOO......OOOO.......',
    '.......OOOO..f...OOOO.......',
    '....n....................n..',
    '...........S....S...........',
    '............................',
    '....n....................n..',
    '.......OOOO......OOOO.......',
    '.......OOOO..f...OOOO.......',
    '............................',
    '..##...................##...',
    '..##...................##...',
    '....Y......................P',
  ],
  legend: {
    f: { enemy: 'flicker' },
    n: { enemy: 'mannequin' },
    L: { furniture: 'floor_lamp' },
    P: { furniture: 'potted_plant' },
    S: { furniture: 'sofa' },
    Y: { furniture: 'upright_piano' },
  },
} satisfies RoomTemplateDef;
