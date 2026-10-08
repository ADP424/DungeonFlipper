import type { WeaponDef } from '../../types';
import dagger from './dagger';
import shortSword from './short_sword';
import broadsword from './broadsword';
import mace from './mace';
import spear from './spear';
import battleAxe from './battle_axe';
import shortbow from './shortbow';
import crossbow from './crossbow';
import fireWand from './fire_wand';
import frostStaff from './frost_staff';
import alchemistFlask from './alchemist_flask';

export default [
  dagger,
  shortSword,
  broadsword,
  mace,
  spear,
  battleAxe,
  shortbow,
  crossbow,
  fireWand,
  frostStaff,
  alchemistFlask,
] satisfies WeaponDef[];
