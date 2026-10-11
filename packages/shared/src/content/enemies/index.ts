import realtor from './realtor';
import realtorGuard from './realtor_guard';
import thug from './thug';
import type { EnemyDef } from '../types';
import dampBlob from './damp_blob';
import rat from './rat';
import ceilingMoth from './ceiling_moth';
import staplerClerk from './stapler_clerk';
import intern from './intern';
import flicker from './flicker';
import securityGuard from './security_guard';
import hrRep from './hr_rep';
import waterCooler from './water_cooler';
import mannequin from './mannequin';

export default [
  dampBlob,
  rat,
  ceilingMoth,
  staplerClerk,
  intern,
  flicker,
  securityGuard,
  hrRep,
  waterCooler,
  mannequin,
  realtor,
  realtorGuard,
  thug,
] satisfies EnemyDef[];
