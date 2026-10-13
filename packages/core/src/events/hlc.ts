import { hlcSchema, type EventEnvelope } from '@allotr/shared';

// Hybrid logical clock (ADR 0033). A reading is the physical time in ms, a
// counter that breaks ties within one ms and the node, which is the author
// id. Readings only move forward on one node, and a reading is always after
// every reading it has received, so the order agrees with cause and effect
// even when device clocks disagree. All functions take `now` (ms since the
// epoch) as input: core never reads the clock.

export type HlcErrorCode =
  'hlc.invalid' | 'hlc.drift' | 'hlc.counter_overflow' | 'hlc.time_overflow';

export class HlcError extends Error {
  override readonly name = 'HlcError';
  readonly code: HlcErrorCode;

  constructor(code: HlcErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type Hlc = Readonly<{
  /** Milliseconds since the epoch. */
  ms: number;
  /** Order among readings in the same millisecond. */
  counter: number;
  /** The author that produced the reading. */
  node: string;
}>;

/** The encoded form: 12 hex digits of ms, 4 of counter, then the node. */
export const MAX_HLC_MS = 2 ** 48 - 1;
export const MAX_HLC_COUNTER = 0xffff;

/**
 * How far ahead of local time a remote reading may be. One reading far in
 * the future would drag every later reading after it, so it is refused
 * instead. An hour covers ordinary clock error, but not a clock set to the
 * wrong year.
 */
export const DEFAULT_MAX_DRIFT_MS = 60 * 60 * 1000;

export type HlcOptions = Readonly<{ maxDriftMs?: number }>;

const hex = (value: number, width: number) =>
  value.toString(16).padStart(width, '0');

function checkMs(ms: number): void {
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new HlcError('hlc.invalid', 'The time must be a whole number of ms.');
  }
  if (ms > MAX_HLC_MS) {
    throw new HlcError(
      'hlc.time_overflow',
      'The time is beyond the clock range.',
    );
  }
}

/** The first reading of a node, at time `now`. */
export function hlcStart(node: string, now: number): Hlc {
  const start = { ms: now, counter: 0, node };
  formatHlc(start);
  return start;
}

/** Text that sorts with plain `<` in clock order; never use localeCompare. */
export function formatHlc(hlc: Hlc): string {
  checkMs(hlc.ms);
  if (
    !Number.isInteger(hlc.counter) ||
    hlc.counter < 0 ||
    hlc.counter > MAX_HLC_COUNTER
  ) {
    throw new HlcError('hlc.invalid', 'The counter is out of range.');
  }
  const text = `${hex(hlc.ms, 12)}-${hex(hlc.counter, 4)}-${hlc.node}`;
  if (!hlcSchema.safeParse(text).success) {
    throw new HlcError('hlc.invalid', 'The node is not a valid author id.');
  }
  return text;
}

export function parseHlc(text: string): Hlc {
  if (!hlcSchema.safeParse(text).success) {
    throw new HlcError('hlc.invalid', 'Not a clock reading.');
  }
  return {
    ms: Number.parseInt(text.slice(0, 12), 16),
    counter: Number.parseInt(text.slice(13, 17), 16),
    node: text.slice(18),
  };
}

export function isHlc(text: string): boolean {
  return hlcSchema.safeParse(text).success;
}

// The reading after (ms, counter) at the later of the given times.
function next(node: string, ms: number, counter: number, sameMs: boolean): Hlc {
  if (!sameMs) return { ms, counter: 0, node };
  if (counter >= MAX_HLC_COUNTER) {
    throw new HlcError(
      'hlc.counter_overflow',
      'Too many events in one millisecond.',
    );
  }
  return { ms, counter: counter + 1, node };
}

/** The reading for a new local event: after `local` and not before `now`. */
export function tick(local: Hlc, now: number): Hlc {
  checkMs(now);
  const ms = Math.max(local.ms, now);
  return next(local.node, ms, local.counter, ms === local.ms);
}

/**
 * The reading after seeing a remote event: after both `local` and `remote`
 * and not before `now`, on the local node. Refuses a remote reading more
 * than `maxDriftMs` ahead of `now`.
 */
export function receive(
  local: Hlc,
  remote: Hlc,
  now: number,
  options: HlcOptions = {},
): Hlc {
  checkMs(now);
  const maxDriftMs = options.maxDriftMs ?? DEFAULT_MAX_DRIFT_MS;
  if (remote.ms - now > maxDriftMs) {
    throw new HlcError(
      'hlc.drift',
      'The remote clock is too far ahead of this device. Check the date and time on the device that wrote it.',
    );
  }
  const ms = Math.max(local.ms, remote.ms, now);
  const counter = Math.max(
    ms === local.ms ? local.counter : -1,
    ms === remote.ms ? remote.counter : -1,
  );
  return next(local.node, ms, counter, counter >= 0);
}

type Ordered = Pick<EventEnvelope, 'hlc' | 'author' | 'seq'>;

/**
 * The total order of the fold: by `hlc`, then `author`, then `seq`. Strings
 * compare in code-unit order, the same as SQLite's BINARY collation.
 */
export function compareEvents(a: Ordered, b: Ordered): -1 | 0 | 1 {
  if (a.hlc !== b.hlc) return a.hlc < b.hlc ? -1 : 1;
  if (a.author !== b.author) return a.author < b.author ? -1 : 1;
  if (a.seq !== b.seq) return a.seq < b.seq ? -1 : 1;
  return 0;
}
