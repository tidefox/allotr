import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { sessionQuery } from '@/lib/session';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';
import { navItems, settingsItem } from '../nav-items.ts';
import { screenIcons } from './icons.ts';

// Phone: a bottom tab bar. 600–999: a 72 px rail. From 1000: a 212 px
// sidebar. All three render from `navItems`, and `1`–`5` jump to the same
// entries (docs/ui.md §3, §5). The pieces sit in the shell grid's row tracks:
//   logo block  = summary bar row
//   nav rows    = title strip row height (sidebar)
//   settings row = command line row (same top edge)

const itemBase =
  'group press flex min-w-0 items-center text-text-muted hover:text-text aria-[current=page]:bg-primary aria-[current=page]:text-on-primary aria-[current=page]:hover:bg-primary aria-[current=page]:hover:text-on-primary';

// The tab bar and rail show the short label; the link is still named in
// full for assistive technology, as the sidebar shows it.
function NavLabel({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span aria-hidden="true" className="max-w-full truncate wide:hidden">
        {short}
      </span>
      <span className="sr-only wide:not-sr-only wide:truncate">{full}</span>
    </>
  );
}

function Key({ children }: { children: string }) {
  return (
    <kbd className="ml-auto hidden font-num text-tiny text-text-muted group-aria-[current=page]:text-on-primary wide:inline">
      {children}
    </kbd>
  );
}

function Who() {
  const session = useQuery(sessionQuery);
  const name = session.data?.user.name;
  if (name === undefined) return null;
  return (
    <p className="mt-[3px] hidden max-w-full truncate text-tiny text-text-muted wide:block">
      {name}
    </p>
  );
}

export function Navigation() {
  const SettingsIcon = screenIcons.settings;
  return (
    <>
      <div
        data-slot="logo"
        className="hidden flex-col items-center justify-center border-r border-b border-seam bg-chrome medium:col-start-1 medium:row-start-1 medium:flex wide:items-start wide:px-4"
      >
        <Link
          to="/"
          aria-label={t('shell.logo')}
          className="flex min-h-hit min-w-hit items-center justify-center gap-1.5 text-[1.125rem] font-bold tracking-[0.01em]"
        >
          <span aria-hidden="true" className="text-primary">
            ▍
          </span>
          <span className="hidden wide:inline">{t('shell.wordmark')}</span>
        </Link>
        <Who />
      </div>
      <nav
        aria-label={t('nav.label')}
        data-slot="nav"
        className={cn(
          'col-start-1 row-start-6 grid grid-cols-5 border-t border-seam bg-chrome',
          'medium:row-span-2 medium:row-start-2 medium:flex medium:flex-col medium:border-t-0 medium:border-r',
        )}
      >
        {navItems.map((item, index) => {
          const Icon = screenIcons[item.key];
          return (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === '/' }}
              className={cn(
                itemBase,
                'h-[2.875rem] flex-col justify-center gap-0.5 text-[0.625rem]',
                'medium:h-[3.625rem] medium:shrink-0 medium:text-tiny',
                'wide:h-strip wide:flex-row wide:justify-start wide:gap-3 wide:border-b wide:px-4 wide:text-[0.8125rem]',
              )}
            >
              <Icon className="size-[1.125rem] shrink-0 medium:size-5 wide:size-[1.0625rem]" />
              <NavLabel short={t(item.short)} full={t(item.label)} />
              <Key>{String(index + 1)}</Key>
            </Link>
          );
        })}
      </nav>
      <div
        data-slot="settings"
        className="hidden border-t border-r border-seam bg-chrome medium:col-start-1 medium:row-start-4 medium:flex"
      >
        <Link
          to={settingsItem.to}
          aria-label={t(settingsItem.label)}
          className={cn(
            itemBase,
            'h-full w-full flex-row justify-center gap-2',
            'wide:justify-start wide:gap-3 wide:px-4 wide:text-[0.8125rem]',
          )}
        >
          <SettingsIcon className="size-5 shrink-0 wide:size-[1.0625rem]" />
          <span aria-hidden="true" className="hidden truncate wide:inline">
            {t(settingsItem.label)}
          </span>
          <Key>,</Key>
        </Link>
      </div>
    </>
  );
}
