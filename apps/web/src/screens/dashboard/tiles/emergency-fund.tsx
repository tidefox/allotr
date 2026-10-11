import { useQuery } from '@tanstack/react-query';
import { Amount } from '@/components/amount';
import { Bar, SkeletonTile } from '@/components/bars';
import { Tile } from '@/components/layout';
import { IconShieldCheckLine } from '@/generated/icons';
import { formatMoney } from '@/lib/format-money';
import { emergencyFundQuery } from '@/lib/plan';
import { shareText } from '@/lib/share-text';
import { t } from '@/messages/t';
import { TileFailed } from './tile-failed.tsx';

const locale = 'en';

// The emergency fund (docs/ui.md §6): what savings hold against the target,
// the months they cover, this cycle's change and the cycles to go. Every
// figure is the server's.
export function EmergencyFundTile() {
  const fund = useQuery(emergencyFundQuery);
  const data = fund.data;

  return (
    <Tile
      title={t('dashboardTiles.emergencyFund.title')}
      icon={IconShieldCheckLine}
    >
      {fund.isError ? (
        <TileFailed
          retry={() => {
            void fund.refetch();
          }}
        />
      ) : data === undefined ? (
        <SkeletonTile />
      ) : (
        <div className="grid gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-big leading-[1.15] font-semibold tracking-[-0.01em]">
              <Amount amount={data.saved} locale={locale} />
            </span>
            <span className="num truncate text-text-muted">
              {t('dashboardTiles.emergencyFund.of', {
                target: formatMoney(data.target, 'symbol', locale),
                share: shareText(data.progressBasisPoints),
              })}
            </span>
          </div>
          <Bar
            value={data.progressBasisPoints / 10000}
            fillClassName="bg-info"
            label={t('dashboardTiles.emergencyFund.progress')}
          />
          <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3.5 gap-y-1.5">
            <dt className="text-text-muted">
              {t('dashboardTiles.emergencyFund.covers')}
            </dt>
            <dd className="truncate text-right font-sans">
              {data.monthsCovered === null
                ? t('dashboardTiles.emergencyFund.noHistory')
                : t('dashboardTiles.emergencyFund.coversValue', {
                    months: String(Math.round(data.monthsCovered * 10) / 10),
                  })}
            </dd>
            <dt className="text-text-muted">
              {t('dashboardTiles.emergencyFund.thisCycle')}
            </dt>
            <dd className="truncate text-right">
              <Amount
                amount={data.addedThisCycle}
                kind="change"
                locale={locale}
              />
            </dd>
            <dt className="text-text-muted">
              {t('dashboardTiles.emergencyFund.atThisRate')}
            </dt>
            <dd className="truncate text-right font-sans">
              {data.cyclesToTarget === null
                ? '–'
                : data.cyclesToTarget === 0
                  ? t('dashboardTiles.emergencyFund.reached')
                  : t('dashboardTiles.emergencyFund.cyclesValue', {
                      count: data.cyclesToTarget,
                    })}
            </dd>
          </dl>
        </div>
      )}
    </Tile>
  );
}
