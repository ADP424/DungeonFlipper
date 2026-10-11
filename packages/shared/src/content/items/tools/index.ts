import type { ToolDef } from '../../types';
import forRentSign from './for_rent_sign';
import companyFlag from './company_flag';
import plankBarricade from './plank_barricade';
import securityDoor from './security_door';
import steelDoor from './steel_door';
import blastDoor from './blast_door';
import plywood from './plywood';
import backroomsWallKit from './backrooms_wall_kit';
import drywallKit from './drywall_kit';
import studKit from './stud_kit';
import wireSpool from './wire_spool';
import pipeBundle from './pipe_bundle';
import mop from './mop';

export default [
  forRentSign,
  companyFlag,
  plankBarricade,
  securityDoor,
  steelDoor,
  blastDoor,
  plywood,
  backroomsWallKit,
  drywallKit,
  studKit,
  wireSpool,
  pipeBundle,
  mop,
] satisfies ToolDef[];
