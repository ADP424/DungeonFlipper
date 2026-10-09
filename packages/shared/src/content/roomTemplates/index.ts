import type { RoomTemplateDef } from '../types';
import level1Lobby from './level1_lobby';
import apartment from './apartment';
import stairsDownRoom from './stairs_down_room';
import lowerLobby from './lower_lobby';
import bossFacilityManager from './boss_facility_manager';
import pillars from './pillars';
import glassCorridor from './glass_corridor';
import collapsedFloor from './collapsed_floor';
import lowWallCover from './low_wall_cover';
import internPool from './intern_pool';
import flickerHall from './flicker_hall';
import longGallery from './long_gallery';
import securityOffice from './security_office';
import tallShaft from './tall_shaft';
import supplyColumn from './supply_column';
import greatHall from './great_hall';
import lBend from './l_bend';

export default [
  level1Lobby,
  apartment,
  stairsDownRoom,
  lowerLobby,
  bossFacilityManager,
  pillars,
  glassCorridor,
  collapsedFloor,
  lowWallCover,
  internPool,
  flickerHall,
  longGallery,
  securityOffice,
  tallShaft,
  supplyColumn,
  greatHall,
  lBend,
] satisfies RoomTemplateDef[];
