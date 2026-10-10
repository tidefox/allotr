import type {
  ConvertToIouBody,
  CreateIouBody,
  RepaymentBody,
  UpdateIouBody,
  WriteOffBody,
} from '@allotr/shared';
import { queryOptions } from '@tanstack/react-query';
import { call } from './api.ts';
import { endpoints } from './endpoints.ts';

// IOUs and split bills (ADR 0024). They change free money and net worth,
// so they sit under ['today'] and refresh with any entry.

/** Open and settled ones, so a settled IOU's payments can be undone. */
export const allIousQuery = queryOptions({
  queryKey: ['today', 'ious', 'all'],
  queryFn: () => call(endpoints.ious, { query: { status: 'all' } }),
});

/** What an IOU change touches: figures, entries and balances. */
export const iouQueryKeys = [
  ['today'],
  ['transactions'],
  ['accounts'],
] as const;

export function createIou(body: CreateIouBody, idempotencyKey?: string) {
  return call(endpoints.createIou, {
    body,
    ...(idempotencyKey === undefined
      ? {}
      : { headers: { 'idempotency-key': idempotencyKey } }),
  });
}

export function repayIous(body: RepaymentBody) {
  return call(endpoints.repayIous, { body });
}

/** Splits a logged expense with people, or lends all of it. */
export function convertToIou(
  id: string,
  body: ConvertToIouBody,
  idempotencyKey: string,
) {
  return call(endpoints.convertToIou, {
    params: { id },
    body,
    headers: { 'idempotency-key': idempotencyKey },
  });
}

export function writeOffIou(id: string, body: WriteOffBody) {
  return call(endpoints.writeOffIou, { params: { id }, body });
}

export function updateIou(id: string, body: UpdateIouBody) {
  return call(endpoints.updateIou, { params: { id }, body });
}
