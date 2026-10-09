import type { FurniturePlacement } from '@df/shared';
import type { Game } from '../Game';

/** What happens when the player clicks a piece of furniture with a `use` (FurnitureDef.use). */
export type FurnitureUse = (game: Game, f: FurniturePlacement, params: Record<string, unknown>) => void;

export const furnitureUses: Record<string, FurnitureUse> = {
  /** The apartment bed: sleep until morning, fully rested. */
  sleepHome: (game) => game.sleepInHomeBed(),
  /** A For Rent sign: open or close the listing. */
  toggleListing: (game, f) => game.toggleListing(f.uid),
  /** Lobby elevator: pick a floor whose lobby you've reached. */
  elevator: (game) => {
    const floors = game.elevatorFloors();
    if (floors.length < 2) return game.toast('The buttons for other floors are dark. Find the stairs down first.');
    game.ui.openElevator(floors, game.floorIndex, (f) => game.rideElevator(f));
  },
};
