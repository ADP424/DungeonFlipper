import { registry } from '@df/shared';
import type { Brain } from './brain';
import { ceilingMoth } from './enemies/ceiling_moth';
import { dampBlob } from './enemies/damp_blob';
import { facilityManager } from './enemies/facility_manager';
import { flicker } from './enemies/flicker';
import { hrRep } from './enemies/hr_rep';
import { intern } from './enemies/intern';
import { mannequin } from './enemies/mannequin';
import { rat } from './enemies/rat';
import { realtor } from './enemies/realtor';
import { realtorGuard } from './enemies/realtor_guard';
import { securityGuard } from './enemies/security_guard';
import { staplerClerk } from './enemies/stapler_clerk';
import { thug } from './enemies/thug';
import { waterCooler } from './enemies/water_cooler';

export type { Brain, BrainCtx } from './brain';

/** Brains by id (`EnemyDef.ai.id`). Add a file under `enemies/` and list it here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const brains: Record<string, Brain<any, any>> = {
  rat,
  ceiling_moth: ceilingMoth,
  damp_blob: dampBlob,
  intern,
  mannequin,
  water_cooler: waterCooler,
  flicker,
  stapler_clerk: staplerClerk,
  hr_rep: hrRep,
  security_guard: securityGuard,
  thug,
  realtor,
  realtor_guard: realtorGuard,
  facility_manager: facilityManager,
};

/** Every enemy must have a brain that accepts its params. Throws at startup otherwise, like content validation. */
export function validateBrains(): void {
  const problems: string[] = [];
  for (const def of registry.enemies.all()) {
    const brain = brains[def.ai.id];
    if (!brain) {
      problems.push(`enemy ${def.id}: no brain '${def.ai.id}'`);
      continue;
    }
    try {
      brain.init(def.ai.params ?? {});
    } catch (err) {
      problems.push(`enemy ${def.id}: ${(err as Error).message}`);
    }
  }
  if (problems.length) throw new Error('Enemy brains failed validation:\n' + problems.join('\n'));
}
