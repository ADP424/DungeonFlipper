import type { ArmorDef } from '../../types';
import leatherArmor from './leather_armor';
import chainmail from './chainmail';
import plateArmor from './plate_armor';

export default [
  leatherArmor,
  chainmail,
  plateArmor,
] satisfies ArmorDef[];
