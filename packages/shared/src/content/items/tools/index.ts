import type { ToolDef } from '../../types';
import hammer from './hammer';
import plankBundle from './plank_bundle';
import plasterKit from './plaster_kit';
import woodKit from './wood_kit';

export default [
  hammer,
  plankBundle,
  plasterKit,
  woodKit,
] satisfies ToolDef[];
