import { useQuery } from '@tanstack/react-query';
import type { BillView } from '@allotr/shared';
import { Amount } from '@/components/amount';
import { BracketButton } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { IconBillLine } from '@/generated/icons';
import { formatTerminalDate } from '@/features/today/format';
import { accountsQuery, categoriesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';

const locale = 'en';

function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b py-1.5">
      <dt className="text-small text-text-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-sans">{children}</dd>
    </div>
  );
}

/** The right-hand card of the Bills tab: one bill's terms and payments. */
export function BillDetail({
  bill,
  onEdit,
}: {
  bill: BillView;
  onEdit: () => void;
}) {
  const accounts = useQuery(accountsQuery).data?.accounts;
  const categories = useQuery(categoriesQuery).data?.categories;
  const account = accounts?.find((a) => a.id === bill.accountId)?.name ?? '';
  const category =
    categories?.find((c) => c.id === bill.categoryId)?.name ??
    t('billForm.noCategory');
  return (
    <Tile
      title={bill.name}
      icon={IconBillLine}
      subtitle={bill.active ? t('billForm.active') : t('billForm.pausedTitle')}
      actions={
        <BracketButton onPress={onEdit}>{t('billForm.edit')}</BracketButton>
      }
      className="h-full"
    >
      <dl>
        <Fact label={t('settings.bills.account')}>{account}</Fact>
        <Fact label={t('billDetail.amount')}>
          <Amount amount={bill.amount} locale={locale} />
        </Fact>
        {bill.price === null ? null : (
          <Fact label={t('billDetail.price')}>
            <Amount amount={bill.price} locale={locale} />
          </Fact>
        )}
        <Fact label={t('billDetail.reserve')}>
          <Amount amount={bill.reserve} locale={locale} />
        </Fact>
        <Fact label={t('settings.bills.dueDay')}>
          {t('billForm.dueDayValue', { day: bill.dueDay })}
        </Fact>
        <Fact label={t('billForm.category')}>{category}</Fact>
      </dl>
      <h3 className="pt-3 pb-1 text-small text-text-muted">
        {t('billDetail.payments')}
      </h3>
      {bill.payments.length === 0 ? (
        <p className="text-small text-text-muted">{t('billDetail.none')}</p>
      ) : (
        <ul>
          {[...bill.payments]
            .sort((a, b) => b.dueOn.localeCompare(a.dueOn))
            .slice(0, 12)
            .map((p) => (
              <li
                key={p.dueOn}
                className="flex items-baseline justify-between gap-3 border-b py-1.5 text-small"
              >
                <span className="text-text-muted">
                  {formatTerminalDate(p.dueOn, locale)}
                </span>
                {p.paid === null ? (
                  <span className="text-text-muted">
                    {t('billDetail.marked')}
                  </span>
                ) : (
                  <Amount amount={p.paid} locale={locale} />
                )}
              </li>
            ))}
        </ul>
      )}
    </Tile>
  );
}
