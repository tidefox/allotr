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

/** Segments in display order; the last two are the money still left. */
export function allocationSegments(
  a: CycleAllocationView,
  labels: AllocationLabels,
): readonly AllocationSegment[] {
  const parts: readonly (readonly [
    keyof AllocationLabels,
    Money,
    AllocationSegment['color'],
  ])[] = [
    ['paidBills', a.paidBills, 'series-2'],
    ['savings', a.savings, 'series-3'],
    ['spent', a.spent, 'series-1'],
    ['other', a.other, 'series-6'],
    ['reserved', a.reserved, 'series-5'],
    ['free', a.free, 'series-4'],
  ];
  return parts.map(([id, amount, color]) => ({
    id,
    label: labels[id],
    amount,
    fraction: segmentShare(amount, a.start),
    shareBp: a.shareBp[id],
    color,
  }));
}
