import { useParams } from '@tanstack/react-router';
import { BillsTab } from './bills-tab.tsx';
import { BudgetsTab } from './budgets-tab.tsx';
import { CoverOrderTab } from './cover-order-tab.tsx';
import { GoalsTab } from './goals-tab.tsx';
import { IousTab } from './ious-tab.tsx';
import { PoolsTab } from './pools-tab.tsx';
import { BudgetSheets } from './sheets/budget-sheets.tsx';

// Budget (docs/ui.md §6): one component per sub-tab, picked by the address.
export function BudgetScreen() {
  return (
    <>
      <SubTab />
      {/* The payday plan and weekly review, opened from any sub-tab. */}
      <BudgetSheets />
    </>
  );
}

function SubTab() {
  const { sub } = useParams({ strict: false });
  switch (sub) {
    case 'pools':
      return <PoolsTab />;
    case 'bills':
      return <BillsTab />;
    case 'goals':
      return <GoalsTab />;
    case 'ious':
      return <IousTab />;
    case 'cover-order':
      return <CoverOrderTab />;
    default:
      return <BudgetsTab />;
  }
}
