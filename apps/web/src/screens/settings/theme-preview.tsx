import type { CSSProperties } from 'react';
import { money, type Role } from '@allotr/shared';
import { formatMoney } from '@/lib/format-money';
import { roleProperties } from '@/lib/theme-mode';
import { t } from '@/messages/t';

// A small Today in a theme's resolved role colours. The roles are set as
// custom properties on this box only, so the page around it keeps its own
// theme. It is a picture: the editor says the same in words, so screen
// readers skip it and nothing in it takes focus. The amounts are made up.

const locale = typeof navigator === 'undefined' ? 'en' : navigator.language;

function amount(amountMinor: number): string {
  return formatMoney(money(amountMinor, 'EUR'), 'symbol', locale);
}

/** The roles as a style that paints this element and what is inside it. */
export function roleStyle(
  roles: Readonly<Record<Role, string>>,
): CSSProperties {
  return Object.fromEntries(roleProperties(roles));
}

export function ThemePreview({
  roles,
  testId,
}: {
  roles: Readonly<Record<Role, string>>;
  testId?: string;
}) {
  return (
    <div
      aria-hidden="true"
      data-testid={testId}
      style={roleStyle(roles)}
      className="grid gap-px border border-outline-variant bg-canvas p-3 text-text"
    >
      <div className="border border-outline-variant bg-card p-3">
        <p className="text-small text-text-muted">{t('themes.previewHero')}</p>
        <p className="text-[1.75rem] leading-none font-bold text-hero-ok">
          {amount(4250)}
        </p>
        <p className="text-tiny text-text-muted">{t('themes.previewMuted')}</p>
      </div>
      <ul className="border border-outline-variant bg-card">
        <li className="flex justify-between gap-3 border-b border-outline-variant px-3 py-1.5">
          <span className="min-w-0 truncate font-ui">
            {t('themes.previewCaption')}
          </span>
          <span className="shrink-0 whitespace-nowrap text-negative">
            {amount(-1890)}
          </span>
        </li>
        <li className="flex justify-between gap-3 px-3 py-1.5">
          <span className="min-w-0 truncate font-ui">
            {t('themes.previewIncome')}
          </span>
          <span className="shrink-0 whitespace-nowrap text-positive">
            {amount(210000)}
          </span>
        </li>
      </ul>
      <p className="bg-danger-container px-3 py-1.5 text-small text-on-danger-container">
        {t('themes.previewOver', { amount: amount(1200) })}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex h-8 items-center bg-primary px-3 text-small font-semibold text-on-primary outline-2 outline-offset-2 outline-ring">
          {t('themes.previewPrimary')}
        </span>
        <span className="inline-flex h-8 items-center border border-outline px-3 text-small text-negative">
          {t('themes.previewDanger')}
        </span>
        <span className="bg-inverse px-2 py-1 text-tiny text-on-inverse">
          {amount(1200)}
        </span>
      </div>
    </div>
  );
}
