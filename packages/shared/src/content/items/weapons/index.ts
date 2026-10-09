import type { WeaponDef } from '../../types';
import boxCutter from './box_cutter';
import crowbar from './crowbar';
import sledgehammer from './sledgehammer';
import pipeWrench from './pipe_wrench';
import pushBroom from './push_broom';
import fireAxe from './fire_axe';
import nailGun from './nail_gun';
import rivetGun from './rivet_gun';
import blowtorch from './blowtorch';
import fireExtinguisher from './fire_extinguisher';
import cleaningSpray from './cleaning_spray';
import clawHammer from './claw_hammer';

export default [
  boxCutter,
  crowbar,
  sledgehammer,
  pipeWrench,
  pushBroom,
  fireAxe,
  nailGun,
  rivetGun,
  blowtorch,
  fireExtinguisher,
  cleaningSpray,
  clawHammer,
] satisfies WeaponDef[];
