import {
  setupSteps,
  type SetupState,
  type SetupStep,
  type TodayView,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Stack, Tile } from '@/components/layout';
import { formatLongDay } from '@/features/today/format';
import { formatMoney } from '@/lib/format-money';
import { accountsQuery, ledgerSettingsQuery, todayQuery } from '@/lib/ledger';
import { errorMessage } from '@/lib/problem';
import { billsQuery } from '@/lib/settings';
import {
  afterStep,
  followingStep,
  nextStep,
  previousStep,
  saveSetup,
  setupQuery,
} from '@/lib/setup';
import { t } from '@/messages/t';
import { FormMessage } from './auth-fields.tsx';
import {
  AccountsStep,
  BillsStep,
  PaydayStep,
  RegionStep,
} from './setup-steps.tsx';

function useSaveSetup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveSetup,
    onSuccess: (saved) => {
      queryClient.setQueryData(setupQuery.queryKey, saved);
    },
  });
}

// The end of setup (spec §11.7): the first daily number, with the days to
// payday under it. The figure is the server's.
function FirstNumber({
  today,
  locale,
  onGo,
}: {
  today: TodayView;
  locale: string;
  onGo: () => void;
}) {
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    body.current?.focus();
  }, []);
  return (
    <Stack>
      <Tile title={t('setup.reveal.title')} primary bodyClassName="pt-3">
        <div
          ref={body}
          role="group"
          tabIndex={-1}
          aria-label={t('setup.reveal.title')}
          className="flex max-w-md flex-col gap-3 outline-none"
        >
          <p className="font-ui text-small text-text-muted">
            {t('setup.reveal.intro')}
          </p>
          <p data-testid="first-number" className="num text-hero text-hero-ok">
            {formatMoney(today.leftToday, 'symbol', locale)}
          </p>
          <p className="text-small">
            {today.overdue
              ? t('cycle.overdue')
              : t('cycle.payday', {
                  date: formatLongDay(today.cycleEnd, locale),
                  count: today.daysLeft,
                })}
          </p>
          <div>
            <PrimaryButton onPress={onGo}>{t('setup.reveal.go')}</PrimaryButton>
          </div>
        </div>
      </Tile>
    </Stack>
  );
}

// Setup after first sign-in (FR-W7): currency and region, payday, spending
// accounts, savings, bills, then Today with a first daily number. Progress
// is saved after every step, so signing in again resumes where it stopped.
// It renders in the shell's content, so the rest of the app stays reachable.
export function SetupScreen() {
  const setup = useQuery(setupQuery);
  const settings = useQuery(ledgerSettingsQuery);
  const today = useQuery(todayQuery);
  const accounts = useQuery(accountsQuery);
  const bills = useQuery(billsQuery);
  const save = useSaveSetup();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const stepBody = useRef<HTMLDivElement>(null);
  const [announcement, setAnnouncement] = useState('');
  // A step the user went Back to; otherwise the first one not handled.
  const [viewing, setViewing] = useState<SetupStep | null>(null);
  const step =
    setup.data === undefined ? null : (viewing ?? nextStep(setup.data));
  const shown = useRef<SetupStep | null>(null);
  const [revealed, setRevealed] = useState(false);

  // A new step takes focus, and its label says where the user is.
  useEffect(() => {
    if (step === null) return;
    if (shown.current !== null && shown.current !== step)
      stepBody.current?.focus();
    shown.current = step;
  }, [step]);

  if (revealed && settings.data !== undefined && today.data !== undefined)
    return (
      <FirstNumber
        today={today.data}
        locale={settings.data.locale}
        onGo={() => {
          void navigate({ to: '/' });
        }}
      />
    );

  if (
    setup.data === undefined ||
    settings.data === undefined ||
    today.data === undefined ||
    accounts.data === undefined ||
    bills.data === undefined ||
    step === null
  ) {
    const failed = [setup, settings, today, accounts, bills].find(
      (query) => query.isError,
    );
    return (
      <Stack>
        <Tile title={t('setup.title')} primary>
          {failed === undefined ? (
            <p
              role="status"
              className="py-2 font-ui text-small text-text-muted"
            >
              {t('setup.loading')}
            </p>
          ) : (
            <div role="alert" className="flex items-center gap-2 py-2">
              <span className="text-small text-negative">
                {errorMessage(failed.error)}
              </span>
              <BracketButton
                onPress={() => {
                  void failed.refetch();
                }}
              >
                {t('errors.retry')}
              </BracketButton>
            </div>
          )}
        </Tile>
      </Stack>
    );
  }

  const state = setup.data;
  // Finishing the last step shows the first number; skipping the rest
  // goes straight to Today.
  const go = (next: SetupState, reveal: boolean) => {
    save.mutate(next, {
      onSuccess: (saved) => {
        if (!saved.finished) {
          // Moving on from a step reached with Back shows the one after it.
          if (viewing !== null) setViewing(followingStep(step));
          return;
        }
        if (!reveal) {
          void navigate({ to: '/' });
          return;
        }
        void queryClient
          .invalidateQueries({ queryKey: todayQuery.queryKey })
          .then(() => {
            setRevealed(true);
          });
      },
    });
  };
  const handled = () => {
    setAnnouncement('');
    go(afterStep(state, step), true);
  };
  const props = {
    busy: save.isPending,
    onNext: handled,
    onSkip: handled,
  };
  const number = setupSteps.indexOf(step) + 1;
  const before = previousStep(step);
  const stepTitle = t('setup.step', {
    n: number,
    total: setupSteps.length,
    title: t(`setup.${step}.title`),
  });

  return (
    <Stack>
      <Tile title={stepTitle} subtitle={t('setup.title')} primary>
        <div
          key={step}
          ref={stepBody}
          role="group"
          tabIndex={-1}
          aria-label={stepTitle}
          className="flex flex-col gap-3 pt-3 outline-none"
        >
          <p className="max-w-prose font-ui text-small text-text-muted">
            {t(`setup.${step}.intro`)}
          </p>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
          {step === 'region' ? (
            <RegionStep
              settings={settings.data}
              detect={!state.handled.includes('region')}
              {...props}
            />
          ) : step === 'payday' ? (
            <PaydayStep settings={settings.data} {...props} />
          ) : step === 'spending' || step === 'savings' ? (
            <AccountsStep
              key={step}
              group={step === 'spending' ? 'on' : 'off'}
              accounts={accounts.data.accounts}
              settings={settings.data}
              today={today.data.today}
              onAnnounce={setAnnouncement}
              {...props}
            />
          ) : (
            <BillsStep
              bills={bills.data.bills}
              accounts={accounts.data.accounts}
              locale={settings.data.locale}
              onAnnounce={setAnnouncement}
              {...props}
            />
          )}
          <FormMessage
            message={save.isError ? errorMessage(save.error) : null}
          />
          {before === null ? null : (
            <div>
              <BracketButton
                isDisabled={save.isPending}
                onPress={() => {
                  setAnnouncement('');
                  save.reset();
                  setViewing(before);
                }}
              >
                {t('setup.back')}
              </BracketButton>
            </div>
          )}
        </div>
      </Tile>
      <Tile title={t('setup.skipRest')}>
        <div className="flex flex-col items-start gap-1 pt-2">
          {step === 'region' ? (
            <p className="max-w-prose font-ui text-small text-text-muted">
              {t('setup.importHint')}
            </p>
          ) : null}
          <BracketButton
            isDisabled={save.isPending}
            aria-describedby="setup-skip-rest-hint"
            onPress={() => {
              go({ ...state, finished: true }, false);
            }}
          >
            {t('setup.skipRest')}
          </BracketButton>
          <p
            id="setup-skip-rest-hint"
            className="max-w-prose font-ui text-small text-text-muted"
          >
            {t('setup.skipRestHint')}
          </p>
        </div>
      </Tile>
    </Stack>
  );
}
