import type { RoomTemplateDef } from '../types';
import safeRoom from './safe_room';
import stairsDownRoom from './stairs_down_room';
import stairsUpRoom from './stairs_up_room';
import bossBoneWarden from './boss_bone_warden';
import pillars from './pillars';
import spikeCorridor from './spike_corridor';
import pitIsland from './pit_island';
import lowWallCover from './low_wall_cover';
import goblinDen from './goblin_den';
import hauntedHall from './haunted_hall';
import longGallery from './long_gallery';
import knightBarracks from './knight_barracks';
import tallShaft from './tall_shaft';
import cryptColumn from './crypt_column';
import greatHall from './great_hall';
import lBend from './l_bend';

export default [
  safeRoom,
  stairsDownRoom,
  stairsUpRoom,
  bossBoneWarden,
  pillars,
  spikeCorridor,
  pitIsland,
  lowWallCover,
  goblinDen,
  hauntedHall,
  longGallery,
  knightBarracks,
  tallShaft,
  cryptColumn,
  greatHall,
  lBend,
] satisfies RoomTemplateDef[];
