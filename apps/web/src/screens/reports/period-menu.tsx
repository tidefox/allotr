import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { addDays, daysBetween, type LocalDate } from '@allotr/shared';
import { MenuButton, MenuRadioItem } from '@/components/menu';
import { formatTerminalDate } from '@/features/today/format';
import { cyclesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { REPORT_PERIODS, type ReportPeriod } from './reports-search.ts';
import { useReportRange } from './use-report-range.ts';

const locale = 'en';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** "sep 25 – oct 22 · day 15/28": the period's dates, and how far a running one is. */
export function periodText(
  period: ReportPeriod,
  cycles: readonly {
    openedOn: LocalDate;
    lastDay: LocalDate;
    payday: LocalDate;
  }[],
  today: LocalDate,
): string | null {
  let from: LocalDate | undefined;
  let to: LocalDate | undefined;
  let length = 0;
  let running = false;
  if (period === 'cycle') {
    const open = cycles[0];
    if (open === undefined) return null;
    from = open.openedOn;
    to = addDays(open.payday, -1);
    length = daysBetween(open.openedOn, open.payday);
    running = true;
  } else if (period === 'last-cycle') {
    const last = cycles[1];
    if (last === undefined) return null;
    from = last.openedOn;
    to = last.lastDay;
  } else {
    const [year, month] =
      period === 'month'
        ? [Number(today.slice(0, 4)), Number(today.slice(5, 7))]
        : lastMonthOf(today);
    from = `${String(year)}-${pad(month)}-01` as LocalDate;
    length = new Date(Date.UTC(year, month, 0)).getUTCDate();
    to = `${String(year)}-${pad(month)}-${pad(length)}` as LocalDate;
    running = period === 'month';
  }
  const dates = t('reportsShell.span', {
    from: formatTerminalDate(from, locale),
    to: formatTerminalDate(to, locale),
  });
  if (!running) return dates;
  const day = Math.min(length, Math.max(1, daysBetween(from, today) + 1));
  return `${dates} · ${t('reportsShell.day', { day, length })}`;
}

function lastMonthOf(today: LocalDate): [number, number] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  return month === 1 ? [year - 1, 12] : [year, month - 1];
}

/**
 * The toolbar under the sub-tabs (the locked design's `toolbar`): the
 * period menu and the dates it covers. Dates only, never money.
 */
export function PeriodToolbar() {
  const { period, today } = useReportRange();
  const cycles = useQuery(cyclesQuery);
  const navigate = useNavigate();
  const text =
    today === undefined || cycles.data === undefined
      ? null
      : periodText(period, cycles.data.cycles, today);
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2 border-r border-b bg-chrome px-3 py-1.5 text-title text-text-muted">
      <MenuButton
        label={t('reportsShell.period.label')}
        value={t(`reportsShell.period.${period}`)}
        selectionMode="single"
        selectedKeys={new Set([period])}
        onSelectionChange={(keys) => {
          const next = keys === 'all' ? undefined : [...keys][0];
          const picked = REPORT_PERIODS.find((p) => p === next);
          if (picked === undefined) return;
          void navigate({
            to: '.',
            search: (prev: object) => ({
              ...prev,
              period: picked === 'cycle' ? undefined : picked,
            }),
          });
        }}
      >
        {REPORT_PERIODS.map((p: ReportPeriod) => (
          <MenuRadioItem key={p} id={p} label={t(`reportsShell.period.${p}`)} />
        ))}
      </MenuButton>
      {text === null ? null : <span>{text}</span>}
    </div>
  );
}
