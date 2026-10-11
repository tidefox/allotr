import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Tag } from '@/components/buttons';
import { Grid, Stack, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { Columns } from '@/charts/columns';
import {
  IconBarChartBoxLine,
  IconHistoryLine,
  IconSafe2Line,
} from '@/generated/icons';
import { cn } from '@/lib/utils';
import { tabGridClass } from './summary-tab.tsx';
import { cyclesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import {
  cycleRows,
  recentCycles,
  savedColumns,
  spentColumns,
} from './cycles-model.ts';

const locale = 'en';

// Cycle, spent, saved, rate and a note; phones drop the note.
const columns = [
  { width: 'minmax(0,1fr)' },
  { width: '11ch', at: { compact: '10ch' } },
  { width: '10ch', at: { compact: '9ch' } },
  { width: '5ch', at: { compact: '4ch' } },
  { width: '6ch', from: 'medium' },
] as const;

function Failed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 py-2 text-small">
      <span className="text-negative">{t('reportsPlan.loadFailed')}</span>
      <BracketButton onPress={retry}>{t('reportsPlan.retry')}</BracketButton>
    </div>
  );
}

// Cycles (docs/ui.md §6): what each cycle spent and saved, then the table of
// them. Every figure is the cycle snapshot the server sent. There is no
// period menu here: the tab compares recent cycles, and `/v1/cycles` takes
// no range.
export function CyclesTab() {
  const cycles = useQuery(cyclesQuery);
  const list = cycles.data?.cycles;
  if (cycles.isError) {
    return (
      <Stack className="min-h-full">
        <Tile
          title={t('reportsPlan.cycles.table.title')}
          icon={IconHistoryLine}
        >
          <Failed
            retry={() => {
              void cycles.refetch();
            }}
          />
        </Tile>
      </Stack>
    );
  }
  if (list === undefined) {
    return (
      <Stack className="min-h-full">
        <Grid columns={2} className={tabGridClass}>
          <SkeletonTile />
          <SkeletonTile />
        </Grid>
        <SkeletonTile span="full" rows={5} />
      </Stack>
    );
  }
  if (list.length === 0) {
    return (
      <Stack className="min-h-full">
        <Tile
          title={t('reportsPlan.cycles.table.title')}
          icon={IconHistoryLine}
        >
          <EmptyState
            title={t('reportsPlan.cycles.emptyTitle')}
            hint={t('reportsPlan.cycles.emptyHint')}
          />
        </Tile>
      </Stack>
    );
  }
  const recent = recentCycles(list);
  const closed = list.filter((c) => c.closedOn !== null).length;
  return (
    <Stack className="min-h-full">
      <Grid columns={2} className={cn(tabGridClass, 'flex-none')}>
        <Tile
          title={t('reportsPlan.cycles.spent.title')}
          icon={IconBarChartBoxLine}
          bodyClassName="flex flex-col"
        >
          <Columns
            height={120}
            label={t('reportsPlan.cycles.spent.summary')}
            data={spentColumns(recent, locale)}
          />
        </Tile>
        <Tile
          title={t('reportsPlan.cycles.saved.title')}
          icon={IconSafe2Line}
          bodyClassName="flex flex-col"
        >
          <Columns
            height={120}
            label={t('reportsPlan.cycles.saved.summary')}
            data={savedColumns(recent, locale)}
          />
        </Tile>
      </Grid>
      <Tile
        title={t('reportsPlan.cycles.table.title')}
        icon={IconHistoryLine}
        subtitle={t('reportsPlan.cycles.closed', { count: closed })}
        bodyClassName="px-0 pb-0"
      >
        <Row
          className="text-tiny text-text-muted [&>.row-grid]:min-h-6"
          columns={columns}
          cells={[
            t('reportsPlan.cycles.table.cycle'),
            <span key="s" className="block text-right">
              {t('reportsPlan.cycles.table.spent')}
            </span>,
            <span key="v" className="block text-right">
              {t('reportsPlan.cycles.table.saved')}
            </span>,
            <span key="r" className="block text-right">
              {t('reportsPlan.cycles.table.rate')}
            </span>,
            null,
          ]}
        />
        {cycleRows(list, locale).map((row) => (
          <Row
            key={row.key}
            columns={columns}
            cells={[
              <span key="l" className="font-sans">
                {row.label}
              </span>,
              <span key="s" className="block text-right">
                <Amount amount={row.spent} />
              </span>,
              <span key="v" className="block text-right text-positive">
                <Amount amount={row.saved} />
              </span>,
              <span key="r" className="num block text-right">
                {row.rate ?? t('reportsPlan.rate.none')}
              </span>,
              row.amended ? (
                <Tag key="a" tone="warning">
                  {t('reportsPlan.cycles.table.amended')}
                </Tag>
              ) : null,
            ]}
          />
        ))}
      </Tile>
    </Stack>
  );
}
