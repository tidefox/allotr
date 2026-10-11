import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { formatTerminalDay } from '@/features/today/format';
import { todayQuery } from '@/lib/ledger';
import { useLedgerReady } from '@/lib/session';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import {
  navItems,
  settingsItem,
  subTabs,
  type ScreenKey,
  type SubTabScreen,
} from '../nav-items.ts';
import { IconSettings3Line } from '@/generated/icons';
import { screenIcons } from './icons.ts';
import { isoWeek } from './summary-math.ts';

const locale = 'en';

/** The screen a path belongs to. */
export function screenOf(pathname: string): ScreenKey {
  if (pathname.startsWith(settingsItem.to)) return 'settings';
  const match = navItems
    .filter((item) => item.to !== '/')
    .find((item) => pathname === item.to || pathname.startsWith(`${item.to}/`));
  return match?.key ?? 'dashboard';
}

function hasSubTabs(screen: ScreenKey): screen is SubTabScreen {
  return screen in subTabs;
}

/** Where a sub-tab lives. Accounts' first sub-tab is the bare path. */
export function subTabPath(screen: SubTabScreen, sub: string): string {
  if (screen === 'accounts')
    return sub === 'all' ? '/accounts' : `/accounts/${sub}`;
  return `/${screen}/${sub}`;
}

const label = {
  dashboard: 'nav.dashboard',
  accounts: 'nav.accounts',
  transactions: 'nav.transactions',
  budget: 'nav.budget',
  reports: 'nav.reports',
  settings: 'nav.settings',
} as const satisfies Record<ScreenKey, Parameters<typeof t>[0]>;

// The title strip (docs/ui.md §3): the screen's icon and name, then its
// sub-tabs as route links (selected = filled `primary`) or, on the
// dashboard, the day's context line. A screen's own controls (search,
// period, filter) mount into `#strip-controls` through `StripControls`. On
// phones the name is hidden and a gear opens Settings.
export function TitleStrip() {
  const { pathname } = useLocation();
  const screen = screenOf(pathname);
  const Icon = screenIcons[screen];
  return (
    <div
      data-slot="strip"
      className="col-start-1 row-start-2 flex h-strip min-w-0 items-stretch border-b bg-canvas medium:col-start-2"
    >
      <div className="flex shrink-0 items-center gap-[7px] border-r px-3 font-semibold">
        <Icon
          aria-hidden="true"
          className="size-[1.15em] shrink-0 text-primary"
        />
        <h1 className="truncate compact:sr-only">{t(label[screen])}</h1>
      </div>
      {hasSubTabs(screen) ? (
        <nav
          aria-label={t('shell.tabs.label')}
          className="scroll flex min-w-0 flex-1 items-stretch"
        >
          {subTabs[screen].map((sub) => {
            const to = subTabPath(screen, sub);
            const active =
              pathname === to ||
              (screen === 'accounts' &&
                sub === 'all' &&
                pathname === '/accounts');
            return (
              <Link
                key={sub}
                to={to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'press flex min-w-hit shrink-0 items-center border-r px-3 whitespace-nowrap',
                  active
                    ? 'bg-primary font-semibold text-on-primary hover:bg-primary'
                    : 'text-text-muted hover:text-text',
                )}
              >
                {t(`shell.tabs.${sub}`)}
              </Link>
            );
          })}
        </nav>
      ) : screen === 'dashboard' ? (
        <StripContext />
      ) : null}
      <div id="strip-controls" className="ml-auto flex min-w-0 items-stretch" />
      <Link
        to={settingsItem.to}
        aria-label={t('nav.settings')}
        className="press flex min-w-10 items-center justify-center border-l px-3 text-text-muted hover:text-text medium:hidden"
      >
        <IconSettings3Line className="size-[1.15em]" />
      </Link>
    </div>
  );
}

/** "fri oct 09 · week 41 · payday fri oct 23", counted from dates. */
function StripContext() {
  const ready = useLedgerReady();
  const today = useQuery({ ...todayQuery, enabled: ready }).data;
  return (
    <p className="flex min-w-0 flex-1 items-center px-3 text-text-muted">
      <span className="truncate">
        {today === undefined
          ? null
          : t('shell.strip.context', {
              date: formatTerminalDay(today.today, locale),
              week: isoWeek(today.today),
              payday: formatTerminalDay(today.cycleEnd, locale),
            })}
      </span>
    </p>
  );
}
