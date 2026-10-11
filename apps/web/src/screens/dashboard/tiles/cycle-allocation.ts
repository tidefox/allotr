import type { CycleAllocationView, Money } from '@allotr/shared';
import type { AllocationSegment } from '@/charts/allocation';

// The server sends the six parts of the cycle start and each part's share in
// basis points; the percentage under a segment is that share. The ratio here
// only sizes a bar segment and is never shown. Parts that are negative or
// zero get an empty bar.

export function segmentShare(part: Money, start: Money): number {
  if (start.amountMinor <= 0 || part.amountMinor <= 0) return 0;
  return Math.min(1, part.amountMinor / start.amountMinor);
}

export type AllocationLabels = Readonly<{
  paidBills: string;
  savings: string;
  spent: string;
  other: string;
  reserved: string;
  free: string;
}>;

/**
 * Segments in display order; the last two are the money still left. The
 * `other` part shows only when it is not zero.
 */
export function allocationSegments(
  a: CycleAllocationView,
  labels: AllocationLabels,
): readonly AllocationSegment[] {
  const parts: readonly (readonly [
    keyof AllocationLabels,
    Money,
    AllocationSegment['color'],
  ])[] = [
    ['paidBills', a.paidBills, 'outline'],
    ['savings', a.savings, 'series-2'],
    ['spent', a.spent, 'series-4'],
    ['other', a.other, 'series-3'],
    ['reserved', a.reserved, 'reserved'],
    ['free', a.free, 'success'],
  ];
  return parts
    .filter(([id, amount]) => id !== 'other' || amount.amountMinor !== 0)
    .map(([id, amount, color]) => ({
      id,
      label: labels[id],
      amount,
      fraction: segmentShare(amount, a.start),
      shareBp: a.shareBp[id],
      color,
      ...(id === 'free' ? { positive: true } : {}),
    }));
}
