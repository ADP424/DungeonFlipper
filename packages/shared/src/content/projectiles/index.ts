import type { ProjectileDef } from '../types';
import arrow from './arrow';
import bolt from './bolt';
import fireball from './fireball';
import frostOrb from './frost_orb';
import fireFlask from './fire_flask';
import enemyArrow from './enemy_arrow';
import magicOrb from './magic_orb';
import bone from './bone';
import slimeGlob from './slime_glob';

export default [
  arrow,
  bolt,
  fireball,
  frostOrb,
  fireFlask,
  enemyArrow,
  magicOrb,
  bone,
  slimeGlob,
] satisfies ProjectileDef[];
