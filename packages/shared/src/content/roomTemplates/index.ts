import type { RoomTemplateDef } from '../types';
import apartment from './apartment';
import level1Lobby from './level1_lobby';
import lowerLobby from './lower_lobby';
import stairsDownRoom from './stairs_down_room';
import bossFacilityManager from './boss_facility_manager';
import pillars from './pillars';
import pillarsBlobs from './pillars_blobs';
import pillarsMannequins from './pillars_mannequins';
import glassCorridor from './glass_corridor';
import glassCorridorInterns from './glass_corridor_interns';
import collapsedFloorMoths from './collapsed_floor_moths';
import collapsedFloor from './collapsed_floor';
import lowWallCoverCoolers from './low_wall_cover_coolers';
import lowWallCover from './low_wall_cover';
import lowWallCoverHr from './low_wall_cover_hr';
import internPool from './intern_pool';
import internPoolOvertime from './intern_pool_overtime';
import flickerHall from './flicker_hall';
import flickerHallDark from './flicker_hall_dark';
import ratNest from './rat_nest';
import dampCorner from './damp_corner';
import boilerRoom from './boiler_room';
import pumpRoom from './pump_room';
import showroom from './showroom';
import checkpoint from './checkpoint';
import hrOffice from './hr_office';
import longGallery from './long_gallery';
import longGallerySentries from './long_gallery_sentries';
import securityOffice from './security_office';
import securityOfficeNight from './security_office_night';
import tallShaft from './tall_shaft';
import tallShaftFlickers from './tall_shaft_flickers';
import supplyColumn from './supply_column';
import supplyColumnStaffed from './supply_column_staffed';
import greatHall from './great_hall';
import greatHallShowroom from './great_hall_showroom';
import greatHallShiftChange from './great_hall_shift_change';
import lBend from './l_bend';
import lBendPatrol from './l_bend_patrol';
import longGalleryVermin from './long_gallery_vermin';
import tallShaftMoths from './tall_shaft_moths';
import lBendVermin from './l_bend_vermin';

export default [
  apartment,
  level1Lobby,
  lowerLobby,
  stairsDownRoom,
  bossFacilityManager,
  pillars,
  pillarsBlobs,
  pillarsMannequins,
  glassCorridor,
  glassCorridorInterns,
  collapsedFloorMoths,
  collapsedFloor,
  lowWallCoverCoolers,
  lowWallCover,
  lowWallCoverHr,
  internPool,
  internPoolOvertime,
  flickerHall,
  flickerHallDark,
  ratNest,
  dampCorner,
  boilerRoom,
  pumpRoom,
  showroom,
  checkpoint,
  hrOffice,
  longGallery,
  longGallerySentries,
  securityOffice,
  securityOfficeNight,
  tallShaft,
  tallShaftFlickers,
  supplyColumn,
  supplyColumnStaffed,
  greatHall,
  greatHallShowroom,
  greatHallShiftChange,
  lBend,
  lBendPatrol,
  longGalleryVermin,
  tallShaftMoths,
  lBendVermin,
] satisfies RoomTemplateDef[];
