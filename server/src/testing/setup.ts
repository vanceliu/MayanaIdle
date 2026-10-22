import { setRandomSource } from '../../../client/src/core/rng';
import { setClockSource } from '../../../client/src/core/clock';
import { registerBundledMaps } from '../maps';
import { setPasswordHashCost } from '../auth';

setRandomSource(() => Math.random());
setClockSource(null);
registerBundledMaps();
setPasswordHashCost({ iterations: 1, memorySize: 8 });
