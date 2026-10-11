import { daysBetween, type LocalDate } from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Tag, type TagTone } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { MenuButton, MenuItem } from '@/components/menu';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { EmptyState } from '@/components/states';
import { IconErrorWarningLine, IconMore2Line } from '@/generated/icons';
import { formatMoney } from '@/lib/format-money';
import { todayQuery } from '@/lib/ledger';
import { markRead, remindersQuery } from '@/lib/reminders';
import { t } from '@/messages/t';
import { openBudgetSheet } from '@/screens/budget/sheets/store';
import { TileFailed } from './tile-failed.tsx';
import { attentionItems, type AttentionItem } from './needs-attention-model.ts';

const locale = 'en';
const WEEKLY_REVIEW = '#weekly-review';

const columns: readonly RowColumn[] = [
  { width: 'auto' },
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: 'auto' },
];

type Presented = Readonly<{
  tag: string;
  tone: TagTone;
  text: string;
  action: string;
  href: string;
}>;

function present(item: AttentionItem, today: LocalDate): Presented {
  switch (item.kind) {
    case 'payday-overdue':
      return {
        tag: t('dashboardTiles.needsAttention.tagPayday'),
        tone: 'warning',
        text: t('dashboardTiles.needsAttention.payday'),
        action: t('dashboardTiles.needsAttention.actionPayday'),
        href: '/settings/money',
      };
    case 'bill-due': {
      const late = daysBetween(item.dueOn, today);
      return {
        tag:
          late > 0
            ? t('dashboardTiles.needsAttention.tagLate', { days: late })
            : t('dashboardTiles.needsAttention.tagToday'),
        tone: late > 0 ? 'negative' : 'warning',
        text: t('dashboardTiles.needsAttention.billDue', {
          name: item.name,
          amount: formatMoney(item.amount, 'symbol', locale),
        }),
        action: t('dashboardTiles.needsAttention.actionBill'),
        href: '/budget/bills',
      };
    }
    case 'missing-rate':
      return {
        tag: t('dashboardTiles.needsAttention.tagRate'),
        tone: 'muted',
        text: t('dashboardTiles.needsAttention.missingRate', {
          currency: item.currency,
        }),
        action: t('dashboardTiles.needsAttention.actionRate'),
        href: '/settings/money',
      };
    case 'reminder':
      return {
        tag:
          item.reminderKind === 'weekly_review'
            ? t('dashboardTiles.needsAttention.tagReview')
            : t('dashboardTiles.needsAttention.tagIou'),
        tone: 'muted',
        text: item.body,
        action: t('dashboardTiles.needsAttention.actionOpen'),
        // The weekly review is a sheet, not a page.
        href: item.reminderKind === 'weekly_review' ? WEEKLY_REVIEW : item.url,
      };
  }
}

// "Needs attention" (docs/ui.md §6): a tag, the text, an action and a ⋮ menu
// per item, from today's figures and the unread reminders.
export function NeedsAttentionTile() {
  const today = useQuery(todayQuery);
  const reminders = useQuery(remindersQuery);
  const router = useRouter();
  const queryClient = useQueryClient();
  const read = useMutation({
    mutationFn: (id: string) => markRead([id]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
  });
  const readAll = useMutation({
    mutationFn: () => markRead(undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reminders'] }),
  });
  const title = t('dashboardTiles.needsAttention.title');

  if (today.isError || reminders.isError) {
    return (
      <Tile title={title}>
        <TileFailed
          retry={() => {
            void today.refetch();
            void reminders.refetch();
          }}
        />
      </Tile>
    );
  }
  if (today.data === undefined || reminders.data === undefined) {
    return <SkeletonTile />;
  }

  const items = attentionItems(today.data, reminders.data.reminders);
  const go = (href: string) => {
    if (href === WEEKLY_REVIEW) openBudgetSheet('weekly-review');
    else void router.navigate({ href });
  };

  return (
    <Tile
      title={title}
      icon={IconErrorWarningLine}
      subtitle={items.length === 0 ? undefined : String(items.length)}
      actions={
        items.some((item) => item.kind === 'reminder') ? (
          <BracketButton
            isDisabled={readAll.isPending}
            onPress={() => {
              readAll.mutate();
            }}
          >
            {t('dashboardTiles.needsAttention.markAllRead')}
          </BracketButton>
        ) : undefined
      }
      bodyClassName="px-0 pb-0"
    >
      {items.length === 0 ? (
        <EmptyState
          title={t('dashboardTiles.needsAttention.empty')}
          hint={t('dashboardTiles.needsAttention.emptyHint')}
        />
      ) : (
        <div>
          {items.map((item) => {
            const view = present(item, today.data.today);
            return (
              <Row
                key={item.id}
                columns={columns}
                cells={[
                  <Tag key="tag" tone={view.tone}>
                    {view.tag}
                  </Tag>,
                  <span key="text" className="font-sans">
                    {view.text}
                  </span>,
                  <BracketButton
                    key="action"
                    onPress={() => {
                      go(view.href);
                    }}
                  >
                    {view.action}
                  </BracketButton>,
                  <MenuButton
                    key="more"
                    label={t('dashboardTiles.needsAttention.more')}
                    icon={IconMore2Line}
                    variant="bracket"
                  >
                    <MenuItem
                      id="open"
                      label={view.action}
                      onAction={() => {
                        go(view.href);
                      }}
                    />
                    {item.kind === 'reminder' ? (
                      <MenuItem
                        id="read"
                        label={t('dashboardTiles.needsAttention.markRead')}
                        onAction={() => {
                          read.mutate(item.reminderId);
                        }}
                      />
                    ) : null}
                  </MenuButton>,
                ]}
              />
            );
          })}
        </div>
      )}
    </Tile>
  );
}
