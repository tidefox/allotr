import { uuidv5 } from '@allotr/shared';

/**
 * The id of a write no person typed, derived from its content so devices
 * that run the same job offline produce the same id and the events dedupe
 * (ADR 0034). `key` is `"<job>:<key>:<period>"`.
 */
export function deterministicId(ledgerId: string, key: string): string {
  return uuidv5(ledgerId, key);
}
