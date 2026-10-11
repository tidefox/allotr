import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  entryTimesSchema,
  formatMoneyInput,
  type LedgerSettingsView,
  type TagView,
} from '@allotr/shared';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Grid, Stack, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { IconAddLine, IconSettings3Line } from '@/generated/icons';
import {
  payKind,
  percentText,
  toPayYourselfFirst,
  type PayKind,
} from '@/features/settings/plan-draft.ts';
import { formatMoney } from '@/lib/format-money';
import { ledgerSettingsQuery, tagsQuery } from '@/lib/ledger';
import { createTag, invalidate, renameTag, tagQueryKeys } from '@/lib/settings';
import { t } from '@/messages/t';
import {
  ChoiceField,
  TextField,
} from '@/screens/transactions/detail/fields.tsx';
import { parseTagName, parseWhole } from './policies-model.ts';
import {
  ChoiceRow,
  EditSheet,
  Failed,
  FormRow,
  Note,
  SaveError,
  useSaveSettings,
  useSheet,
} from './setting-parts.tsx';

// Settings, policies (docs/ui.md §6): the rules around the plan (payday
// savings line, emergency fund, IOU write-off), what entries ask for, how
// Reports summarises, and tags. Every value row opens a menu or a sheet.
export function PoliciesTab() {
  const settings = useQuery(ledgerSettingsQuery);
  const tags = useQuery(tagsQuery);
  if (settings.data === undefined) {
    return settings.isError ? (
      <Grid>
        <Tile title={t('settingsPolicies.title')} icon={IconSettings3Line}>
          <Failed
            retry={() => {
              void settings.refetch();
            }}
          />
        </Tile>
      </Grid>
    ) : (
      <Grid>
        <SkeletonTile rows={3} />
        <SkeletonTile rows={2} />
        <SkeletonTile rows={2} />
      </Grid>
    );
  }
  return (
    <Stack className="min-h-full">
      <Tile title={t('settingsPolicies.title')} icon={IconSettings3Line}>
        <div className="-mx-3 -my-2 flex flex-col">
          <PlanRows settings={settings.data} />
          <EntriesRows settings={settings.data} />
          <ReportsRows settings={settings.data} />
        </div>
      </Tile>
      <TagsTile
        tags={tags.data?.tags}
        failed={tags.isError}
        retry={() => {
          void tags.refetch();
        }}
      />
    </Stack>
  );
}

type PlanSheet = 'pay' | 'months' | 'writeOff';

function PlanRows({ settings }: { settings: LedgerSettingsView }) {
  const [sheet, open, close] = useSheet<PlanSheet>();
  const pay = settings.payYourselfFirst;
  const paySummary =
    pay === null
      ? t('settingsPolicies.payday.summary.none')
      : pay.kind === 'fixed'
        ? t('settingsPolicies.payday.summary.fixed', {
            amount: formatMoney(pay.amount),
          })
        : t('settingsPolicies.payday.summary.percent', {
            percent: percentText(pay.basisPoints),
          });
  return (
    <>
      <FormRow
        label={t('settingsPolicies.payday.payFirst')}
        value={paySummary}
        hint={t('settingsPolicies.payday.payFirstHint')}
        onOpen={() => {
          open('pay');
        }}
      />
      <FormRow
        label={t('settingsPolicies.payday.months')}
        value={t('settingsPolicies.payday.monthsValue', {
          count: settings.emergencyMonths,
        })}
        hint={t('settingsPolicies.payday.monthsHint')}
        onOpen={() => {
          open('months');
        }}
      />
      <FormRow
        label={t('settingsPolicies.payday.writeOff')}
        value={t('settingsPolicies.payday.writeOffValue', {
          count: settings.iouWriteOffAfterDays,
        })}
        hint={t('settingsPolicies.payday.writeOffHint')}
        onOpen={() => {
          open('writeOff');
        }}
      />
      {sheet === 'pay' ? (
        <PaySheet settings={settings} onClose={close} />
      ) : null}
      {sheet === 'months' ? (
        <NumberSheet
          title={t('settingsPolicies.payday.monthsTitle')}
          label={t('settingsPolicies.payday.monthsLabel')}
          hint={t('settingsPolicies.payday.monthsHint')}
          invalid={t('settingsPolicies.payday.monthsInvalid')}
          initial={settings.emergencyMonths}
          min={1}
          max={24}
          field="emergencyMonths"
          onClose={close}
        />
      ) : null}
      {sheet === 'writeOff' ? (
        <NumberSheet
          title={t('settingsPolicies.payday.writeOffTitle')}
          label={t('settingsPolicies.payday.writeOffLabel')}
          hint={t('settingsPolicies.payday.writeOffHint')}
          invalid={t('settingsPolicies.payday.writeOffInvalid')}
          initial={settings.iouWriteOffAfterDays}
          min={1}
          max={3650}
          field="iouWriteOffAfterDays"
          onClose={close}
        />
      ) : null}
    </>
  );
}

function NumberSheet({
  title,
  label,
  hint,
  invalid,
  initial,
  min,
  max,
  field,
  onClose,
}: {
  title: string;
  label: string;
  hint: string;
  invalid: string;
  initial: number;
  min: number;
  max: number;
  field: 'emergencyMonths' | 'iouWriteOffAfterDays';
  onClose: () => void;
}) {
  const save = useSaveSettings();
  const [text, setText] = useState(String(initial));
  const [bad, setBad] = useState(false);
  return (
    <EditSheet
      title={title}
      onClose={onClose}
      pending={save.isPending}
      error={save.error}
      onSubmit={() => {
        const value = parseWhole(text, min, max);
        if (value === null) {
          setBad(true);
          return;
        }
        setBad(false);
        if (value === initial) {
          onClose();
          return;
        }
        save.mutate({ [field]: value }, { onSuccess: onClose });
      }}
    >
      <TextField
        label={label}
        value={text}
        inputMode="numeric"
        error={bad ? invalid : undefined}
        onChange={(value) => {
          setText(value);
          setBad(false);
          if (save.isError) save.reset();
        }}
        autoFocus
      />
      <p className="font-ui text-small text-text-muted">{hint}</p>
    </EditSheet>
  );
}

function initialPayText(settings: LedgerSettingsView): string {
  const pay = settings.payYourselfFirst;
  if (pay === null) return '';
  return pay.kind === 'percent'
    ? percentText(pay.basisPoints)
    : formatMoneyInput(pay.amount, settings.locale);
}

function PaySheet({
  settings,
  onClose,
}: {
  settings: LedgerSettingsView;
  onClose: () => void;
}) {
  const save = useSaveSettings();
  const [kind, setKind] = useState<PayKind>(payKind(settings.payYourselfFirst));
  const [text, setText] = useState(initialPayText(settings));
  const [bad, setBad] = useState(false);
  const kinds = ['none', 'fixed', 'percent'] as const;
  return (
    <EditSheet
      title={t('settingsPolicies.payday.payFirstTitle')}
      onClose={onClose}
      pending={save.isPending}
      error={save.error}
      onSubmit={() => {
        const payYourselfFirst = toPayYourselfFirst(
          kind,
          text,
          settings.defaultCurrency,
          settings.locale,
        );
        if (payYourselfFirst === 'invalid') {
          setBad(true);
          return;
        }
        setBad(false);
        save.mutate({ payYourselfFirst }, { onSuccess: onClose });
      }}
    >
      <ChoiceField
        label={t('settingsPolicies.payday.kind')}
        value={kind}
        choices={kinds.map((k) => ({
          id: k,
          label: t(`settingsPolicies.payday.kinds.${k}`),
        }))}
        placeholder={t('settingsPolicies.payday.kinds.none')}
        onChange={(id) => {
          setKind(kinds.find((k) => k === id) ?? 'none');
          setBad(false);
        }}
      />
      {kind === 'none' ? null : (
        <TextField
          label={
            kind === 'percent'
              ? t('settingsPolicies.payday.percent')
              : t('settingsPolicies.payday.fixed')
          }
          value={text}
          inputMode="decimal"
          error={bad ? t('settingsPolicies.payday.invalid') : undefined}
          onChange={(value) => {
            setText(value);
            setBad(false);
            if (save.isError) save.reset();
          }}
          autoFocus
        />
      )}
      <p className="font-ui text-small text-text-muted">
        {t('settingsPolicies.payday.payFirstHint')}
      </p>
    </EditSheet>
  );
}

function EntriesRows({ settings }: { settings: LedgerSettingsView }) {
  const save = useSaveSettings();
  return (
    <>
      <ChoiceRow
        label={t('settingsPolicies.entries.times')}
        value={settings.entryTimes}
        choices={entryTimesSchema.options.map((o) => ({
          id: o,
          label: t(`settingsPolicies.entries.timesOptions.${o}`),
        }))}
        hint={t('settingsPolicies.entries.timesHint')}
        onChange={(id) => {
          const entryTimes = entryTimesSchema.options.find((o) => o === id);
          if (entryTimes !== undefined && entryTimes !== settings.entryTimes)
            save.mutate({ entryTimes });
        }}
      />
      <SaveError error={save.error} />
    </>
  );
}

function ReportsRows({ settings }: { settings: LedgerSettingsView }) {
  const save = useSaveSettings();
  const periods = ['cycle', 'month'] as const;
  const cards = ['top', 'all'] as const;
  return (
    <>
      <ChoiceRow
        label={t('settingsPolicies.reports.period')}
        value={settings.reportPeriod}
        choices={periods.map((p) => ({
          id: p,
          label: t(`settingsPolicies.reports.periods.${p}`),
        }))}
        hint={t('settingsPolicies.reports.periodHint')}
        onChange={(id) => {
          const reportPeriod = periods.find((p) => p === id);
          if (
            reportPeriod !== undefined &&
            reportPeriod !== settings.reportPeriod
          )
            save.mutate({ reportPeriod });
        }}
      />
      <ChoiceRow
        label={t('settingsPolicies.reports.cards')}
        value={settings.categoryCards}
        choices={cards.map((c) => ({
          id: c,
          label: t(`settingsPolicies.reports.cardsOptions.${c}`),
        }))}
        hint={t('settingsPolicies.reports.cardsHint')}
        onChange={(id) => {
          const categoryCards = cards.find((c) => c === id);
          if (
            categoryCards !== undefined &&
            categoryCards !== settings.categoryCards
          )
            save.mutate({ categoryCards });
        }}
      />
      <SaveError error={save.error} />
    </>
  );
}

const tagColumns = [{ width: 'minmax(0,1fr)' }, { width: 'auto' }] as const;

function TagsTile({
  tags,
  failed,
  retry,
}: {
  tags: readonly TagView[] | undefined;
  failed: boolean;
  retry: () => void;
}) {
  // `null` closed, `'new'` adding, or the tag being renamed.
  const [editing, open, close] = useSheet<TagView | 'new'>();
  return (
    <Tile
      title={t('settingsPolicies.tags.title')}
      subtitle={t('settingsPolicies.tags.subtitle')}
      bodyClassName="px-0 pb-0"
      actions={
        <PrimaryButton
          icon={IconAddLine}
          onPress={() => {
            open('new');
          }}
        >
          {t('settingsPolicies.tags.add')}
        </PrimaryButton>
      }
    >
      {failed ? (
        <Failed retry={retry} />
      ) : tags === undefined ? (
        <p role="status" className="px-3 py-2 text-small text-text-muted">
          {t('settingsMoney.common.loading')}
        </p>
      ) : tags.length === 0 ? (
        <EmptyState
          title={t('settingsPolicies.tags.title')}
          hint={t('settingsPolicies.tags.none')}
        />
      ) : (
        <div role="list" aria-label={t('settingsPolicies.tags.listLabel')}>
          {tags.map((tag) => (
            <div key={tag.id} role="listitem">
              <Row
                columns={tagColumns}
                cells={[
                  <span key="n" className="font-sans">
                    {tag.name}
                  </span>,
                  <BracketButton
                    key="r"
                    aria-label={t('settingsPolicies.tags.renameLabel', {
                      name: tag.name,
                    })}
                    onPress={() => {
                      open(tag);
                    }}
                  >
                    {t('settingsPolicies.tags.rename')}
                  </BracketButton>,
                ]}
              />
            </div>
          ))}
        </div>
      )}
      <Note>{t('settingsPolicies.tags.deleteNote')}</Note>
      {editing === null ? null : (
        <TagSheet tag={editing === 'new' ? null : editing} onClose={close} />
      )}
    </Tile>
  );
}

function TagSheet({
  tag,
  onClose,
}: {
  tag: TagView | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(tag?.name ?? '');
  const [bad, setBad] = useState(false);
  const save = useMutation({
    mutationFn: (value: string) =>
      tag === null ? createTag(value) : renameTag(tag.id, value),
    onSuccess: async () => {
      await invalidate(queryClient, tagQueryKeys);
      onClose();
    },
  });
  return (
    <EditSheet
      title={
        tag === null
          ? t('settingsPolicies.tags.addTitle')
          : t('settingsPolicies.tags.renameTitle', { name: tag.name })
      }
      submitLabel={
        tag === null
          ? t('settingsPolicies.tags.submitAdd')
          : t('settingsMoney.common.save')
      }
      onClose={onClose}
      pending={save.isPending}
      error={save.error}
      onSubmit={() => {
        const value = parseTagName(name);
        if (value === null) {
          setBad(true);
          return;
        }
        setBad(false);
        if (tag !== null && value === tag.name) {
          onClose();
          return;
        }
        save.mutate(value);
      }}
    >
      <TextField
        label={t('settingsPolicies.tags.name')}
        value={name}
        error={bad ? t('settingsPolicies.tags.nameInvalid') : undefined}
        onChange={(value) => {
          setName(value);
          setBad(false);
          if (save.isError) save.reset();
        }}
        autoFocus
      />
    </EditSheet>
  );
}
