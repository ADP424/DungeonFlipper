import type { ObstacleDef } from '../types';
import backroomsWall from './backrooms_wall';
import backroomsWallShort from './backrooms_wall_short';
import concreteWall from './concrete_wall';
import concreteWallShort from './concrete_wall_short';
import missingFloor from './missing_floor';
import brokenGlass from './broken_glass';
import timberWall from './timber_wall';
import timberWallShort from './timber_wall_short';
import drywall from './drywall';
import drywallShort from './drywall_short';
import stairsDown from './stairs_down';
import stairsUp from './stairs_up';

export default [
  backroomsWall,
  backroomsWallShort,
  concreteWall,
  concreteWallShort,
  missingFloor,
  brokenGlass,
  timberWall,
  timberWallShort,
  drywall,
  drywallShort,
  stairsDown,
  stairsUp,
] satisfies ObstacleDef[];
