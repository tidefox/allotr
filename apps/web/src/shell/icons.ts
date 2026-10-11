import type { ComponentType } from 'react';
import {
  IconBankLine,
  IconBarChartBoxLine,
  IconDashboardLine,
  IconExchangeLine,
  IconPieChart2Line,
  IconSettings3Line,
  type IconProps,
} from '@/generated/icons';
import type { ScreenKey } from '../nav-items.ts';

/** Each destination's icon, shared by the navigation and the title strip. */
export const screenIcons: Record<ScreenKey, ComponentType<IconProps>> = {
  dashboard: IconDashboardLine,
  accounts: IconBankLine,
  transactions: IconExchangeLine,
  budget: IconPieChart2Line,
  reports: IconBarChartBoxLine,
  settings: IconSettings3Line,
};
