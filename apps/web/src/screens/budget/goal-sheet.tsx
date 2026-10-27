import {
  formatMoneyInput,
  type CreateGoalBody,
  type GoalView,
} from '@allotr/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { amountExample } from '@/features/quick-entry/draft';
import {
  createGoal,
  goalsQuery,
  poolQueryKeys,
  updateGoal,
} from '@/lib/budgets';
import { accountsQuery, todayQuery } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import { poolsQuery } from '@/lib/budgets';
import {
  ChoiceField,
  TextField,
} from '@/screens/transactions/detail/fields.tsx';
import { toGoalBody, whereChoices, type GoalField } from './goals-model.ts';

const locale = 'en';

/** A new goal (an earmark on a savings pool or account), or `goal` edited. */
export function GoalSheet({
  open,
  goal,
  onClose,
}: {
  open: boolean;
  goal?: GoalView | undefined;
  onClose: () => void;
}) {
  const goals = useQuery(goalsQuery);
  const pools = useQuery(poolsQuery);
  const accounts = useQuery(accountsQuery);
  const today = useQuery(todayQuery);
  const loaded =
    goals.data !== undefined &&
    pools.data !== undefined &&
    accounts.data !== undefined &&
    today.data !== undefined;
  return (
    <Sheet
      isOpen={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      title={t(
        goal === undefined
          ? 'budgetGoalsIous.goals.form.title'
          : 'budgetGoalsIous.goals.form.editTitle',
      )}
      closeLabel={t('budgetGoalsIous.close')}
    >
      {loaded ? (
        <GoalForm
          key={goal?.id}
          goal={goal}
          choices={whereChoices(
            goals.data.goals,
            pools.data.pools,
            accounts.data.accounts,
            (name) => t('budgetGoalsIous.goals.form.pool', { name }),
          )}
          currency={today.data.available.currency}
          onClose={onClose}
        />
      ) : (
        <p role="status" className="px-3 py-4 text-small text-text-muted">
          {t('budgetGoalsIous.payday.loading')}
        </p>
      )}
    </Sheet>
  );
}

function GoalForm({
  goal,
  choices,
  currency,
  onClose,
}: {
  goal: GoalView | undefined;
  choices: ReturnType<typeof whereChoices>;
  currency: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(goal?.name ?? '');
  const [where, setWhere] = useState('');
  const [amount, setAmount] = useState(
    goal === undefined ? '' : formatMoneyInput(goal.target, locale),
  );
  const [date, setDate] = useState(goal?.targetOn ?? '');
  const [errors, setErrors] = useState<Partial<Record<GoalField, true>>>({});
  const add = useMutation({
    mutationFn: (body: CreateGoalBody) =>
      goal === undefined
        ? createGoal(body)
        : updateGoal(goal.id, {
            name: body.name,
            targetMinor: body.target.amountMinor,
            targetOn: body.targetOn ?? null,
          }),
    onSuccess: () => {
      for (const queryKey of poolQueryKeys)
        void queryClient.invalidateQueries({ queryKey });
      onClose();
    },
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    // An edit keeps its earmark, so the picker is skipped.
    const result = toGoalBody(
      { name, where: goal === undefined ? where : 'pool:-', amount, date },
      goal?.target.currency ?? currency,
      locale,
    );
    setErrors(result.ok ? {} : result.errors);
    if (result.ok) add.mutate(result.body);
  };
  const error = (field: GoalField, key: string | undefined) =>
    errors[field] === true ? key : undefined;

  if (goal === undefined && choices.length === 0)
    return (
      <p className="px-3 py-4 font-sans text-small">
        {t('budgetGoalsIous.goals.form.none')}
      </p>
    );

  return (
    <form className="flex flex-col gap-3 p-3" noValidate onSubmit={submit}>
      <TextField
        label={t('budgetGoalsIous.goals.form.name')}
        value={name}
        autoFocus
        error={error('name', t('budgetGoalsIous.goals.form.errors.name'))}
        onChange={setName}
      />
      {goal === undefined ? (
        <ChoiceField
          label={t('budgetGoalsIous.goals.form.where')}
          value={where}
          choices={choices}
          placeholder={t('budgetGoalsIous.goals.form.wherePlaceholder')}
          error={error('where', t('budgetGoalsIous.goals.form.errors.where'))}
          onChange={setWhere}
        />
      ) : null}
      <TextField
        label={t('budgetGoalsIous.goals.form.amount')}
        value={amount}
        inputMode="decimal"
        error={error(
          'amount',
          t('budgetGoalsIous.goals.form.errors.amount', {
            example: amountExample(goal?.target.currency ?? currency, locale),
          }),
        )}
        onChange={setAmount}
      />
      <TextField
        label={t('budgetGoalsIous.goals.form.date')}
        value={date}
        placeholder={t('budgetGoalsIous.goals.form.datePlaceholder')}
        error={error('date', t('budgetGoalsIous.goals.form.errors.date'))}
        onChange={setDate}
      />
      {add.isError ? (
        <p role="alert" className="text-small text-negative">
          {describeProblem(add.error).message}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        <BracketButton onPress={onClose}>
          {t('budgetGoalsIous.cancel')}
        </BracketButton>
        <PrimaryButton type="submit" isDisabled={add.isPending}>
          {add.isPending
            ? t('budgetGoalsIous.saving')
            : t(
                goal === undefined
                  ? 'budgetGoalsIous.goals.form.submit'
                  : 'budgetGoalsIous.goals.form.save',
              )}
        </PrimaryButton>
      </div>
    </form>
  );
}
