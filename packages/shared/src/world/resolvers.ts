import { registerSecuring } from './securing';
import { registerStore } from './store';
import { registerTenants } from './tenants';
import { registerUtilities } from './utilities';

let registered = false;

/** Register every off-screen process with the clock (`advanceClock`). Idempotent. */
export function registerAllResolvers(): void {
  if (registered) return;
  registered = true;
  registerSecuring();
  registerStore();
  registerTenants();
  registerUtilities();
}
