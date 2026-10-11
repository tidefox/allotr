import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from 'react-aria-components';
import type { GoalView, LocalDate } from '@allotr/shared';
import { Chart } from '@/charts/chart';
import { Amount } from '@/components/amount';
import {
  Bar,
  SkeletonTile,
  seriesBg,
  type SeriesColor,
} from '@/components/bars';
import { BracketButton, stripButtonClass } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { MenuButton, MenuItem } from '@/components/menu';
import { EmptyState } from '@/components/states';
import { IconAddLine, IconFlagLine, IconMore2Line } from '@/generated/icons';
import { formatDay } from '@/features/today/format';
import {
  goalsQuery,
  poolQueryKeys,
  poolsQuery,
  updateGoal,
} from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { accountsQuery, todayQuery } from '@/lib/ledger';
import { progressText } from '@/lib/share-text';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { StripControls } from '@/shell/strip-controls';
import { barFraction } from '@/shell/summary-math';
import { GoalSheet } from './goal-sheet.tsx';
import { goalChart } from './goals-model.ts';
import { TabFailed } from './tab-failed.tsx';

const locale = 'en';

// Goals (docs/ui.md §6): one tile per goal with the figure, a bar, where
// it is held and the line from today's balance to the target. Every figure
// is the server's; the bar and the share are a ratio of two of them. A new
// goal starts from `[+ goal]` in the title strip.
export function GoalsTab() {
  const goals = useQuery(goalsQuery);
  const today = useQuery(todayQuery);
  const pools = useQuery(poolsQuery);
  const accounts = useQuery(accountsQuery);
  const [adding, setAdding] = useState(false);
  const list = goals.data?.goals;
  const add = () => {
    setAdding(true);
  };
  const where = (goal: GoalView): string =>
    (goal.poolId === null
      ? accounts.data?.accounts.find((a) => a.id === goal.accountId)?.name
      : pools.data?.pools.find((p) => p.id === goal.poolId)?.name) ?? '';

  let body;
  if (goals.isError) {
    body = (
      <Tile title={t('budgetGoalsIous.goals.title')} icon={IconFlagLine}>
        <TabFailed
          retry={() => {
            void goals.refetch();
          }}
        />
      </Tile>
    );
  } else if (list === undefined) {
    body = <SkeletonTile rows={4} />;
  } else if (list.length === 0) {
    body = (
      <Tile
        title={t('budgetGoalsIous.goals.title')}
        icon={IconFlagLine}
        span={3}
      >
        <EmptyState
          title={t('budgetGoalsIous.goals.empty')}
          hint={t('budgetGoalsIous.goals.emptyHint')}
          action={
            <BracketButton icon={IconAddLine} onPress={add}>
              {t('budgetGoalsIous.goals.addShort')}
            </BracketButton>
          }
        />
      </Tile>
    );
  } else {
    body = list.map((goal, index) => (
      <GoalTile
        key={goal.id}
        goal={goal}
        today={today.data?.today}
        where={where(goal)}
        color={`series-${String((index % 8) + 1)}` as SeriesColor}
        // An odd last goal fills the row at two columns (`fill2`).
        fill={list.length % 2 === 1 && index === list.length - 1}
      />
    ));
  }

  return (
    <>
      <StripControls>
        <Button
          className={stripButtonClass}
          aria-label={t('budgetGoalsIous.goals.addLabel')}
          onPress={add}
        >
          <IconAddLine className="size-[1.15em] shrink-0" />
          <span className="compact:hidden">
            {t('budgetGoalsIous.goals.addShort')}
          </span>
        </Button>
      </StripControls>
      <Grid className="min-h-full">{body}</Grid>
      <GoalSheet
        open={adding}
        onClose={() => {
          setAdding(false);
        }}
      />
    </>
  );
}

function GoalTile({
  goal,
  today,
  where,
  color,
  fill,
}: {
  goal: GoalView;
  today: LocalDate | undefined;
  where: string;
  color: SeriesColor;
  fill: boolean;
}) {
  const queryClient = useQueryClient();
  const archive = useMutation({
    mutationFn: () => updateGoal(goal.id, { archived: true }),
    onSuccess: () => {
      for (const queryKey of poolQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
    },
  });
  const fraction = barFraction(goal.saved.amountMinor, goal.target.amountMinor);
  const chart = today === undefined ? null : goalChart(goal, today, locale);
  const target = formatMoney(goal.target, 'symbol', locale);
  const date =
    goal.targetOn === null ? null : formatTerminalMonth(goal.targetOn);
  return (
    <Tile
      title={goal.name}
      icon={IconFlagLine}
      className={cn(fill && 'cols2:col-span-full cols3:col-span-1')}
      actions={
        <MenuButton
          variant="bracket"
          icon={IconMore2Line}
          label={t('budgetGoalsIous.goals.actionsOf', { name: goal.name })}
          title={goal.name}
        >
          <MenuItem
            id="archive"
            label={t('budgetGoalsIous.goals.archive')}
            onAction={() => {
              archive.mutate();
            }}
          />
        </MenuButton>
      }
      bodyClassName="flex flex-col gap-2"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-big leading-[1.15] font-semibold tracking-[-0.01em]">
          <Amount amount={goal.saved} locale={locale} />
        </span>
        <span className="num truncate text-text-muted">
          {t('budgetGoalsIous.goals.savedOf', {
            target,
            percent: progressText(goal.progressBp),
          })}
        </span>
      </div>
      <Bar
        value={fraction}
        fillClassName={seriesBg[color]}
        label={t('budgetGoalsIous.goals.progress', { name: goal.name })}
      />
      <p className="truncate text-[0.75rem] text-text-muted">
        {[
          where,
          goal.reached
            ? t('budgetGoalsIous.goals.reached')
            : date === null
              ? t('budgetGoalsIous.goals.noDate')
              : t('budgetGoalsIous.goals.by', { date }),
          goal.monthlyNeeded === null
            ? ''
            : t('budgetGoalsIous.goals.perMonth', {
                amount: formatMoney(goal.monthlyNeeded, 'symbol', locale),
              }),
        ]
          .filter((part) => part !== '')
          .join(' · ')}
      </p>
      {goal.missingRates.length > 0 ? (
        <p className="font-sans text-small text-text-muted">
          {t('budgetGoalsIous.goals.missingRates', {
            currency: goal.target.currency,
          })}
        </p>
      ) : null}
      {chart === null || goal.targetOn === null ? (
        <p className="font-sans text-small text-text-muted">
          {t('budgetGoalsIous.goals.chart.noDate')}
        </p>
      ) : (
        <Chart
          label={t('budgetGoalsIous.goals.chart.summary', {
            name: goal.name,
            saved: formatMoney(goal.saved, 'symbol', locale),
            target,
            date: formatDay(goal.targetOn, locale),
          })}
          series={[
            {
              id: 'goal',
              label: goal.name,
              color,
              points: chart.points,
              area: true,
              endLabel: target,
            },
          ]}
          yTicks={chart.yTicks}
          xTicks={chart.xTicks}
          height={90}
          grow
          table={{
            caption: t('budgetGoalsIous.goals.chart.caption', {
              name: goal.name,
            }),
            headers: [
              t('budgetGoalsIous.goals.chart.day'),
              t('budgetGoalsIous.goals.chart.value'),
            ],
            rows: [
              [
                t('budgetGoalsIous.goals.chart.today'),
                formatMoney(goal.saved, 'symbol', locale),
              ],
              [formatDay(goal.targetOn, locale), target],
            ],
          }}
        />
      )}
      {archive.isError ? (
        <p role="alert" className="text-small text-negative">
          {t('budgetGoalsIous.loadFailed')}
        </p>
      ) : null}
    </Tile>
  );
}

/** "mar 2027": a target month, lower case. */
function formatTerminalMonth(date: LocalDate): string {
  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(new Date(`${date}T00:00:00Z`))
    .toLowerCase();
}
