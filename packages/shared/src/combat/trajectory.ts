import type { MovementKind, ProjectileDef, TrajectoryKind } from '../content/types';

/**
 * How a projectile fired by something moving this way travels: a straight shot fired from the air
 * flies `high`, over short walls and low furniture; anything else as its def says.
 */
export const shotTrajectory = (def: ProjectileDef, by: MovementKind): TrajectoryKind =>
  def.trajectory === 'straight' && by === 'fly' ? 'high' : def.trajectory;
