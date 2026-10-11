import type { ComponentType, ReactNode } from 'react';
import type { IconProps } from '@/generated/icons';
import { cn } from '@/lib/utils';
import { LeftBar } from './bars.tsx';

export type Stat = Readonly<{
  label: string;
  icon?: ComponentType<IconProps>;
  figure: ReactNode;
  sub?: ReactNode;
  bar?: Readonly<{ fraction: number; label: string }>;
  /** Edge colour of the primary (first) stat. */
  tone?: 'positive' | 'primary' | 'neutral';
}>;

/** Four stat tiles: 2 × 2 on compact, in a row from medium. */
export function Stats({ stats }: { stats: readonly Stat[] }) {
  return (
    <div className="grid grid-cols-2 border-t border-l medium:grid-cols-4">
      {stats.map(({ label, icon: Icon, figure, sub, bar, tone }, index) => {
        const highlight = index === 0 && tone !== 'neutral';
        return (
          <div
            key={label}
            className={cn(
              'flex min-w-0 flex-col justify-center border-r border-b px-3.5 py-2.5 compact:px-2.5 compact:py-[7px] wide:px-[1.125rem] wide:py-3.5',
              highlight && 'border-l-[3px]',
              highlight &&
                (tone === 'positive'
                  ? 'border-l-positive'
                  : 'border-l-primary'),
            )}
          >
            <div className="flex items-center gap-1.5 text-[0.7188rem] leading-[1.45] text-text-muted">
              {Icon === undefined ? null : (
                <Icon className="size-[1.15em] shrink-0" />
              )}
              <span className="truncate">{label}</span>
            </div>
            <div
              className={cn(
                // The size comes before `leading-*`: cn() lets a later size
                // reset the line height.
                highlight ? 'text-stat tracking-[-0.01em]' : 'text-stat-sub',
                'my-0.5 truncate leading-[1.45] font-semibold',
                highlight && tone === 'positive' && 'text-positive',
              )}
            >
              {figure}
            </div>
            {sub === undefined ? null : (
              <div className="truncate text-tiny leading-[1.45] text-text-muted">
                {sub}
              </div>
            )}
            {bar === undefined ? null : (
              <LeftBar
                fraction={bar.fraction}
                label={bar.label}
                className="mt-1"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Up to four label-over-figure pairs (`kfig`), each as wide as its content
 * and truncated with "…" when the row runs out of room.
 */
export function KeyFigures({
  figures,
}: {
  figures: readonly Readonly<{
    label: string;
    figure: ReactNode;
    /** The figure's colour: `text` by default. */
    tone?: 'muted' | 'positive' | 'negative';
  }>[];
}) {
  return (
    <dl className="mb-2.5 grid grid-cols-[repeat(4,minmax(0,max-content))] gap-x-[1.625rem] gap-y-1.5 compact:mb-1.5 compact:gap-x-3.5 compact:gap-y-1">
      {figures.slice(0, 4).map(({ label, figure, tone }) => (
        <div key={label} className="flex min-w-0 flex-col">
          <dt className="truncate text-tiny leading-[1.45] text-text-muted">
            {label}
          </dt>
          <dd
            className={cn(
              'truncate text-[1.125rem] compact:text-[0.875rem] wide:text-[1.375rem]',
              'leading-[1.45] font-semibold',
              tone === 'muted' && 'text-text-muted',
              tone === 'positive' && 'text-positive',
              tone === 'negative' && 'text-negative',
            )}
          >
            {figure}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** `14 entries · spent $1,201.60 · …`: one truncated line from server figures. */
export function SummaryLine({
  parts,
  className,
}: {
  parts: readonly ReactNode[];
  className?: string;
}) {
  return (
    <p className={cn('truncate text-small text-text-muted', className)}>
      {parts.flatMap((part, index) =>
        index === 0
          ? [part]
          : [<span key={`sep-${String(index)}`}> · </span>, part],
      )}
    </p>
  );
}
