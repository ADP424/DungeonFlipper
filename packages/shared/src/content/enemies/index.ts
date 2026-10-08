import type { EnemyDef } from '../types';
import slime from './slime';
import rat from './rat';
import bat from './bat';
import skeletonArcher from './skeleton_archer';
import goblin from './goblin';
import wisp from './wisp';
import knight from './knight';
import cultist from './cultist';
import bogCrab from './bog_crab';
import skeleton from './skeleton';

export default [
  slime,
  rat,
  bat,
  skeletonArcher,
  goblin,
  wisp,
  knight,
  cultist,
  bogCrab,
  skeleton,
] satisfies EnemyDef[];
