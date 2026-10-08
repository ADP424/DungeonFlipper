import type { RoomTemplateDef } from '../types';

export default {
  id: 'spike_corridor',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['normal'],
  map: [
    '.................',
    '.r.............r.',
    '.................',
    '^^^^^^.....^^^^^^',
    '^^^^^^..g..^^^^^^',
    '^^^^^^.....^^^^^^',
    '.................',
    '.r.............r.',
    '.................',
  ],
} satisfies RoomTemplateDef;
