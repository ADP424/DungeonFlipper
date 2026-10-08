import type { RoomTemplateDef } from '../types';

/** The pre-owned home room on floor 1. Respawn point. */
export default {
  id: 'safe_room',
  cells: [{ cx: 0, cy: 0 }],
  tags: ['safe'],
  startsOwned: true,
  floorSurface: 'wood_oak',
  map: [
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
    '.................',
  ],
  furniture: [
    { def: 'bed', x: 1, y: 0 },
    { def: 'dresser', x: 2, y: 0 },
    {
      def: 'storage_chest',
      x: 13,
      y: 0,
      contents: ['shortbow', 'hammer', 'plank_bundle', 'plaster_kit', 'roll_wallpaper_rose', 'roll_carpet_crimson', 'leather_armor'],
    },
    { def: 'candelabra', x: 15, y: 0 },
    { def: 'table', x: 12, y: 7 },
    { def: 'chair', x: 11, y: 7 },
    { def: 'potted_plant', x: 0, y: 8 },
    { def: 'torch_stand', x: 16, y: 8 },
  ],
} satisfies RoomTemplateDef;
