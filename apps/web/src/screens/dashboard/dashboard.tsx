import { Link } from '@tanstack/react-router';
import { Grid, Tile } from '@/components/layout';
import { EmptyState } from '@/components/states';
import { useLedgerReady } from '@/lib/session';
import { t } from '@/messages/t';
import { BudgetSheets } from '@/screens/budget/sheets/budget-sheets';
import { BudgetsTile } from './tiles/budgets.tsx';
import { CycleAllocationTile } from './tiles/cycle-allocation.tsx';
import { EmergencyFundTile } from './tiles/emergency-fund.tsx';
import { NeedsAttentionTile } from './tiles/needs-attention.tsx';
import { NetWorthTile } from './tiles/net-worth.tsx';
import { NextSevenDaysTile } from './tiles/next-seven-days.tsx';
import { PoolsTile } from './tiles/pools.tsx';
import { ThisCycleTile } from './tiles/this-cycle.tsx';
import { TodaysEntriesTile } from './tiles/todays-entries.tsx';

// The Dashboard (docs/ui.md §6): default tile order and sizes, no layout
// editor yet. Every figure comes from the server. The order is by what the
// user acts on: the daily number, what needs attention, what was logged
// today, the budgets and the week ahead, then the cycle's allocation and
// the slower figures.
export function Dashboard() {
  // While a user is held to two-factor enrolment the server refuses ledger
  // reads, so no tile mounts (and queries) until the hold is over.
  if (!useLedgerReady()) return <HeldForTwoFactor />;
  return (
    <>
      <Grid className="min-h-full">
        <ThisCycleTile />
        <NeedsAttentionTile />
        <TodaysEntriesTile />
        <BudgetsTile />
        <NextSevenDaysTile />
        <CycleAllocationTile />
        <PoolsTile />
        <EmergencyFundTile />
        <NetWorthTile />
      </Grid>
      <BudgetSheets />
    </>
  );
}

function HeldForTwoFactor() {
  return (
    <Tile title={t('nav.dashboard')}>
      <EmptyState
        title={t('settingsAccount.twoFactor.heldTitle')}
        hint={t('settingsAccount.twoFactor.required')}
        action={
          <Link
            to="/settings/$sub"
            params={{ sub: 'account' }}
            className="press inline-flex h-8 min-w-8 items-center justify-center px-1 text-small text-primary"
          >
            {t('settingsAccount.twoFactor.goTo')}
          </Link>
        }
      />
    </Tile>
  );
}
