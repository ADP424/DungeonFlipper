import type { ObstacleDef } from '../types';
import boundaryWall from './boundary_wall';
import stoneWall from './stone_wall';
import stoneWallShort from './stone_wall_short';
import hole from './hole';
import spikes from './spikes';
import woodWall from './wood_wall';
import woodWallShort from './wood_wall_short';
import plasterWall from './plaster_wall';
import plasterWallShort from './plaster_wall_short';
import stairsDown from './stairs_down';
import stairsUp from './stairs_up';

export default [
  boundaryWall,
  stoneWall,
  stoneWallShort,
  hole,
  spikes,
  woodWall,
  woodWallShort,
  plasterWall,
  plasterWallShort,
  stairsDown,
  stairsUp,
] satisfies ObstacleDef[];
