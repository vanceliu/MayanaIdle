import { setRandomSource } from '../../../client/src/core/rng';
import { setClockSource } from '../../../client/src/core/clock';
import { registerBundledMaps } from '../maps';

setRandomSource(() => Math.random());
setClockSource(null);
registerBundledMaps();
