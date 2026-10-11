import type { ProjectileDef } from '../types';
import nail from './nail';
import rivet from './rivet';
import torchFlame from './torch_flame';
import foamCloud from './foam_cloud';
import sprayBottle from './spray_bottle';
import staple from './staple';
import memo from './memo';
import clipboard from './clipboard';
import waterGlob from './water_glob';
import droplet from './droplet';
import pen from './pen';
import thrownStapler from './thrown_stapler';
import taserDart from './taser_dart';

export default [
  nail,
  rivet,
  torchFlame,
  foamCloud,
  sprayBottle,
  staple,
  memo,
  clipboard,
  waterGlob,
  droplet,
  pen,
  thrownStapler,
  taserDart,
] satisfies ProjectileDef[];
