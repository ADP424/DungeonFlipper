import { registerSecuring } from './securing';
import { registerStore } from './store';
import { registerTenants } from './tenants';
import { registerStaff } from './staff';
import { registerRealtors } from './realtors';
import { registerUtilities } from './utilities';

let registered = false;

/** Register every off-screen process with the clock (`advanceClock`). Idempotent. */
export function registerAllResolvers(): void {
  if (registered) return;
  registered = true;
  registerSecuring();
  registerStore();
  // Staff work before tenants judge their units.
  registerStaff();
  registerTenants();
  registerRealtors();
  registerUtilities();
}
