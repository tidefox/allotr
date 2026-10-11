import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  paydayRules,
  type ExchangeRateView,
  type LedgerSettingsView,
  type TodayView,
} from '@allotr/shared';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Grid, Stack, Tile } from '@/components/layout';
import { Row } from '@/components/row';
import { EmptyState } from '@/components/states';
import { IconAddLine, IconCoinsLine } from '@/generated/icons';
import { formatDay } from '@/features/today/format';
import { localeSample, timeZoneOptions } from '@/features/settings/region.ts';
import { useCurrencyOptions } from '@/lib/currency-options';
import { ledgerSettingsQuery, todayQuery } from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import {
  createRate,
  deleteRate,
  invalidate,
  rateQueryKeys,
  ratesQuery,
} from '@/lib/settings';
import { t } from '@/messages/t';
import {
  ChoiceField,
  TextField,
} from '@/screens/transactions/detail/fields.tsx';
import {
  parsePaydayOverride,
  paydayDays,
  toRateBody,
  usesPaydayDay,
  type RateErrors,
} from './money-model.ts';
import {
  ChoiceRow,
  EditSheet,
  Failed,
  FormRow,
  Note,
  PlannedRow,
  SaveError,
  useSaveSettings,
  useSheet,
} from './setting-parts.tsx';

const locale = 'en';

// Settings, money (docs/ui.md §6): the default currency and region, the
// payday rule, the budget period and daily number, and exchange rates. The
// currency display mode is planned (ADR 0029) and only noted here. Figures
// come from the server; nothing is computed in the browser.
export function MoneyTab() {
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const rates = useQuery(ratesQuery);
  if (settings.data === undefined) {
    return settings.isError ? (
      <Grid>
        <Tile title={t('settingsMoney.title')} icon={IconCoinsLine}>
          <Failed
            retry={() => {
              void settings.refetch();
            }}
          />
        </Tile>
      </Grid>
    ) : (
      <Grid>
        <SkeletonTile rows={4} />
        <SkeletonTile rows={4} />
        <SkeletonTile rows={3} />
      </Grid>
    );
  }
  return (
    <Stack className="min-h-full">
      <Tile title={t('settingsMoney.title')} icon={IconCoinsLine}>
        <div className="-mx-3 -mb-2.5 flex flex-col">
          <RegionRows settings={settings.data} />
          <PaydayRows settings={settings.data} />
          <PlanRows settings={settings.data} />
        </div>
      </Tile>
      <RatesTile
        settings={settings.data}
        today={today.data}
        rates={rates.data?.rates}
        failed={rates.isError}
        retry={() => {
          void rates.refetch();
        }}
      />
    </Stack>
  );
}

function RegionRows({ settings }: { settings: LedgerSettingsView }) {
  const save = useSaveSettings();
  const [editing, open, close] = useSheet();
  const currencies = useCurrencyOptions(locale);
  const zones = useMemo(() => timeZoneOptions(settings.timeZone), [settings]);
  return (
    <>
      <ChoiceRow
        label={t('settingsMoney.region.currency')}
        value={settings.defaultCurrency}
        choices={currencies.map((c) => ({ id: c.code, label: c.label }))}
        hint={t('settingsMoney.region.currencyHint')}
        onChange={(defaultCurrency) => {
          if (defaultCurrency !== settings.defaultCurrency)
            save.mutate({ defaultCurrency });
        }}
      />
      <PlannedRow
        label={t('settingsMoney.region.display')}
        value={t('settingsMoney.region.displayValue')}
      />
      <FormRow
        label={t('settingsMoney.region.locale')}
        value={settings.locale}
        hint={t('settingsMoney.region.localeHint')}
        onOpen={() => {
          open(true);
        }}
      />
      <ChoiceRow
        label={t('settingsMoney.region.timeZone')}
        value={settings.timeZone}
        choices={zones.map((zone) => ({ id: zone, label: zone }))}
        hint={t('settingsMoney.region.timeZoneHint')}
        onChange={(timeZone) => {
          if (timeZone !== settings.timeZone) save.mutate({ timeZone });
        }}
      />
      <SaveError error={save.error} />
      {editing === null ? null : (
        <LocaleSheet settings={settings} onClose={close} />
      )}
    </>
  );
}

function LocaleSheet({
  settings,
  onClose,
}: {
  settings: LedgerSettingsView;
  onClose: () => void;
}) {
  const save = useSaveSettings();
  const [text, setText] = useState(settings.locale);
  const sample = localeSample(text.trim(), settings.defaultCurrency);
  return (
    <EditSheet
      title={t('settingsMoney.region.localeTitle')}
      onClose={onClose}
      pending={save.isPending}
      error={save.error}
      onSubmit={() => {
        const next = text.trim();
        if (next === settings.locale) {
          onClose();
          return;
        }
        save.mutate({ locale: next }, { onSuccess: onClose });
      }}
    >
      <TextField
        label={t('settingsMoney.region.locale')}
        value={text}
        onChange={(value) => {
          setText(value);
          if (save.isError) save.reset();
        }}
        autoFocus
      />
      <p className="font-ui text-small text-text-muted">
        {sample === null
          ? t('settingsMoney.region.localeUnknown')
          : t('settingsMoney.region.localeSample', { sample })}
      </p>
    </EditSheet>
  );
}

function PaydayRows({ settings }: { settings: LedgerSettingsView }) {
  const save = useSaveSettings();
  const [editing, open, close] = useSheet();
  const rule = settings.paydayRule;
  return (
    <>
      <ChoiceRow
        label={t('settingsMoney.payday.rule')}
        value={rule}
        choices={paydayRules.map((r) => ({
          id: r,
          label: t(`settingsMoney.payday.rules.${r}`),
        }))}
        hint={t(`settingsMoney.payday.ruleHints.${rule}`)}
        onChange={(next) => {
          const paydayRule = paydayRules.find((r) => r === next);
          if (paydayRule !== undefined && paydayRule !== rule)
            save.mutate({ paydayRule });
        }}
      />
      {usesPaydayDay(rule) ? (
        <ChoiceRow
          label={
            rule === 'manual'
              ? t('settingsMoney.payday.dayManual')
              : t('settingsMoney.payday.day')
          }
          value={String(settings.paydayDay)}
          choices={paydayDays.map((n) => ({ id: String(n), label: String(n) }))}
          hint={t('settingsMoney.payday.dayHint')}
          onChange={(day) => {
            if (Number(day) !== settings.paydayDay)
              save.mutate({ paydayDay: Number(day) });
          }}
        />
      ) : null}
      <FormRow
        label={t('settingsMoney.payday.override')}
        value={
          settings.paydayOverride === null
            ? t('settingsMoney.payday.overrideNone')
            : formatDay(settings.paydayOverride, locale)
        }
        hint={t('settingsMoney.payday.overrideHint')}
        onOpen={() => {
          open(true);
        }}
      />
      <SaveError error={save.error} />
      {editing === null ? null : (
        <OverrideSheet settings={settings} onClose={close} />
      )}
    </>
  );
}

function OverrideSheet({
  settings,
  onClose,
}: {
  settings: LedgerSettingsView;
  onClose: () => void;
}) {
  const save = useSaveSettings();
  const [text, setText] = useState(settings.paydayOverride ?? '');
  const [invalid, setInvalid] = useState(false);
  return (
    <EditSheet
      title={t('settingsMoney.payday.overrideTitle')}
      onClose={onClose}
      pending={save.isPending}
      error={save.error}
      extra={
        settings.paydayOverride === null ? null : (
          <BracketButton
            tone="destructive"
            isDisabled={save.isPending}
            onPress={() => {
              save.mutate({ paydayOverride: null }, { onSuccess: onClose });
            }}
          >
            {t('settingsMoney.payday.overrideClear')}
          </BracketButton>
        )
      }
      onSubmit={() => {
        const parsed = parsePaydayOverride(text);
        if (parsed === 'invalid') {
          setInvalid(true);
          return;
        }
        setInvalid(false);
        save.mutate({ paydayOverride: parsed }, { onSuccess: onClose });
      }}
    >
      <TextField
        label={t('settingsMoney.payday.overrideLabel')}
        value={text}
        placeholder={t('settingsMoney.payday.overridePlaceholder')}
        onChange={(value) => {
          setText(value);
          setInvalid(false);
          if (save.isError) save.reset();
        }}
        error={invalid ? t('settingsMoney.payday.overrideInvalid') : undefined}
        autoFocus
      />
      <p className="font-ui text-small text-text-muted">
        {t('settingsMoney.payday.overrideHint')}
      </p>
    </EditSheet>
  );
}

function PlanRows({ settings }: { settings: LedgerSettingsView }) {
  const save = useSaveSettings();
  const modes = ['free', 'pool-minus-bills', 'daily-budgets'] as const;
  const periods = ['cycle', 'month'] as const;
  return (
    <>
      <ChoiceRow
        label={t('settingsMoney.plan.period')}
        value={settings.budgetPeriod}
        choices={periods.map((p) => ({
          id: p,
          label: t(`settingsMoney.plan.periods.${p}`),
        }))}
        hint={t('settingsMoney.plan.periodHint')}
        onChange={(next) => {
          const budgetPeriod = periods.find((p) => p === next);
          if (
            budgetPeriod !== undefined &&
            budgetPeriod !== settings.budgetPeriod
          )
            save.mutate({ budgetPeriod });
        }}
      />
      <ChoiceRow
        label={t('settingsMoney.plan.mode')}
        value={settings.dailyMode}
        choices={modes.map((m) => ({
          id: m,
          label: t(`settingsMoney.plan.modes.${m}`),
        }))}
        hint={t(`settingsMoney.plan.modeHints.${settings.dailyMode}`)}
        onChange={(next) => {
          const dailyMode = modes.find((m) => m === next);
          if (dailyMode !== undefined && dailyMode !== settings.dailyMode)
            save.mutate({ dailyMode });
        }}
      />
      <ChoiceRow
        label={t('settingsMoney.plan.countSavings')}
        value={settings.countSavingsInDaily ? 'on' : 'off'}
        choices={[
          { id: 'off', label: t('settingsMoney.plan.off') },
          { id: 'on', label: t('settingsMoney.plan.on') },
        ]}
        hint={t('settingsMoney.plan.countSavingsHint')}
        onChange={(next) => {
          const countSavingsInDaily = next === 'on';
          if (countSavingsInDaily !== settings.countSavingsInDaily)
            save.mutate({ countSavingsInDaily });
        }}
      />
      <SaveError error={save.error} />
    </>
  );
}

const rateColumns = [
  { width: 'minmax(0,1fr)' },
  { width: '9rem', from: 'medium' },
  { width: 'auto' },
] as const;

function RatesTile({
  settings,
  today,
  rates,
  failed,
  retry,
}: {
  settings: LedgerSettingsView;
  today: TodayView | undefined;
  rates: readonly ExchangeRateView[] | undefined;
  failed: boolean;
  retry: () => void;
}) {
  const [adding, open, close] = useSheet();
  const missing = today?.missingRates ?? [];
  return (
    <Tile
      title={t('settingsMoney.rates.title')}
      subtitle={t('settingsMoney.rates.subtitle', {
        currency: settings.defaultCurrency,
      })}
      span={2}
      bodyClassName="px-0 pb-0"
      actions={
        <PrimaryButton
          icon={IconAddLine}
          onPress={() => {
            open(true);
          }}
        >
          {t('settingsMoney.rates.add')}
        </PrimaryButton>
      }
    >
      {missing.length === 0 ? null : (
        <Note tone="warning">
          {t('settingsMoney.rates.missing', {
            currencies: missing.join(', '),
            currency: settings.defaultCurrency,
          })}
        </Note>
      )}
      {failed ? (
        <Failed retry={retry} />
      ) : rates === undefined ? (
        <p role="status" className="px-3 py-2 text-small text-text-muted">
          {t('settingsMoney.common.loading')}
        </p>
      ) : rates.length === 0 ? (
        <EmptyState
          title={t('settingsMoney.rates.title')}
          hint={t('settingsMoney.rates.none')}
        />
      ) : (
        <div role="list" aria-label={t('settingsMoney.rates.listLabel')}>
          {rates.map((rate) => (
            <RateRow key={rate.id} rate={rate} />
          ))}
        </div>
      )}
      {adding === null ? null : (
        <RateSheet
          settings={settings}
          suggested={missing[0]}
          today={today?.today}
          onClose={close}
        />
      )}
    </Tile>
  );
}

function RateRow({ rate }: { rate: ExchangeRateView }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => deleteRate(rate.id),
    onSuccess: () => invalidate(queryClient, rateQueryKeys),
  });
  const label = t('settingsMoney.rates.item', {
    base: rate.base,
    quote: rate.quote,
    rate: rate.rate,
  });
  const day = formatDay(rate.asOf, locale);
  return (
    <div role="listitem">
      <Row
        columns={rateColumns}
        cells={[
          <span key="l">{label}</span>,
          <span key="d" className="text-text-muted">
            {t('settingsMoney.rates.from', { day })}
            {rate.source === 'implied'
              ? ` · ${t('settingsMoney.rates.implied')}`
              : ''}
          </span>,
          <BracketButton
            key="x"
            tone="destructive"
            isDisabled={remove.isPending}
            aria-label={t('settingsMoney.rates.deleteLabel', { label, day })}
            onPress={() => {
              remove.mutate();
            }}
          >
            {t('settingsMoney.rates.delete')}
          </BracketButton>,
        ]}
      />
      {remove.isError ? (
        <p role="alert" className="px-3 py-1 text-small text-negative">
          {errorMessage(remove.error)}
        </p>
      ) : null}
    </div>
  );
}

function RateSheet({
  settings,
  suggested,
  today,
  onClose,
}: {
  settings: LedgerSettingsView;
  suggested: string | undefined;
  today: string | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const currencies = useCurrencyOptions(locale);
  const [base, setBase] = useState(suggested ?? '');
  const [quote, setQuote] = useState<string>(settings.defaultCurrency);
  const [rate, setRate] = useState('');
  const [asOf, setAsOf] = useState(today ?? '');
  const [errors, setErrors] = useState<RateErrors>({});
  const choices = currencies.map((c) => ({ id: c.code, label: c.label }));
  const save = useMutation({
    mutationFn: createRate,
    onSuccess: async () => {
      await invalidate(queryClient, rateQueryKeys);
      onClose();
    },
  });
  const changed = () => {
    setErrors({});
    if (save.isError) save.reset();
  };
  const message = (key: RateErrors[keyof RateErrors]) =>
    key === undefined ? undefined : t(`settingsMoney.rates.errors.${key}`);
  return (
    <EditSheet
      title={t('settingsMoney.rates.addTitle')}
      onClose={onClose}
      pending={save.isPending}
      error={save.error}
      submitLabel={t('settingsMoney.rates.save')}
      onSubmit={() => {
        const result = toRateBody({ base, quote, rate, asOf });
        if ('errors' in result) {
          setErrors(result.errors);
          return;
        }
        save.mutate(result.body);
      }}
    >
      <ChoiceField
        label={t('settingsMoney.rates.base')}
        value={base}
        choices={choices}
        placeholder={t('settingsMoney.rates.choose')}
        error={message(errors.base)}
        onChange={(id) => {
          setBase(id);
          changed();
        }}
      />
      <ChoiceField
        label={t('settingsMoney.rates.quote')}
        value={quote}
        choices={choices}
        placeholder={t('settingsMoney.rates.choose')}
        error={message(errors.quote)}
        onChange={(id) => {
          setQuote(id);
          changed();
        }}
      />
      <TextField
        label={
          base === '' || quote === ''
            ? t('settingsMoney.rates.rate')
            : t('settingsMoney.rates.rateOf', { base, quote })
        }
        value={rate}
        inputMode="decimal"
        placeholder="1.0856"
        error={message(errors.rate)}
        onChange={(value) => {
          setRate(value);
          changed();
        }}
      />
      <TextField
        label={t('settingsMoney.rates.asOf')}
        value={asOf}
        placeholder="YYYY-MM-DD"
        error={message(errors.asOf)}
        onChange={(value) => {
          setAsOf(value);
          changed();
        }}
      />
      <p className="font-ui text-small text-text-muted">
        {t('settingsMoney.rates.asOfHint')}
      </p>
    </EditSheet>
  );
}
