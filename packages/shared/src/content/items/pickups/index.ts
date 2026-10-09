import type { PickupDef } from '../../types';
import halfSandwich from './half_sandwich';
import sandwich from './sandwich';
import cash from './cash';

export default [
  halfSandwich,
  sandwich,
  cash,
] satisfies PickupDef[];
