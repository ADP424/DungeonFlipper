import type { LootTableDef } from '../types';
import common from './common';
import tough from './tough';
import boss from './boss';

export default [
  common,
  tough,
  boss,
] satisfies LootTableDef[];
