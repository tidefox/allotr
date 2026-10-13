export {
  compareEvents,
  DEFAULT_MAX_DRIFT_MS,
  formatHlc,
  HlcError,
  hlcStart,
  isHlc,
  MAX_HLC_COUNTER,
  MAX_HLC_MS,
  parseHlc,
  receive,
  tick,
  type Hlc,
  type HlcErrorCode,
  type HlcOptions,
} from './hlc.ts';
export { deterministicId } from './ids.ts';
export type { EventEnvelope } from '@allotr/shared';
