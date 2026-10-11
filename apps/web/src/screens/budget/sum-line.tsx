import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// The locked design's `sumline`: short muted labels with their figures in
// `text`, wrapping on narrow tiles. Every figure is the server's.

export type SumPart = Readonly<{
  key: string;
  label: string;
  value: ReactNode;
  /** A coloured figure, for example owed to you in `positive`. */
  tone?: 'positive' | 'negative';
}>;

export function SumLine({
  parts,
  className,
}: {
  parts: readonly SumPart[];
  className?: string;
}) {
  return (
    <p
      className={cn(
        'flex flex-wrap gap-x-[1.125rem] gap-y-1 pt-0.5 pb-1.5 text-[0.75rem] text-text-muted',
        className,
      )}
    >
      {parts.map((part) => (
        <span key={part.key}>
          {part.label}{' '}
          <b
            className={cn(
              'font-semibold tabular-nums',
              part.tone === 'positive'
                ? 'text-positive'
                : part.tone === 'negative'
                  ? 'text-negative'
                  : 'text-text',
            )}
          >
            {part.value}
          </b>
        </span>
      ))}
    </p>
  );
}
