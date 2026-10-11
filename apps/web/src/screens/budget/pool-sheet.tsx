import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { PoolView } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { ChoiceField, TextField } from '@/components/form-fields';
import { Sheet } from '@/components/sheet';
import { ApiError } from '@/lib/api';
import { createPool, poolQueryKeys, updatePool } from '@/lib/budgets';
import { t } from '@/messages/t';

type Kind = PoolView['kind'];

/**
 * Names a new pool (and says whether it is spending or savings, which sets
 * whether it counts toward the daily number at first), or renames an
 * existing one. The kind is fixed once the pool exists. The server trims
 * the name and refuses a duplicate (`pool_name_taken`).
 */
export function PoolSheet({
  pool,
  onClose,
}: {
  /** Omit to create a pool. */
  pool?: Pick<PoolView, 'id' | 'name'>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(pool?.name ?? '');
  const [kind, setKind] = useState<Kind>('spending');
  const [problem, setProblem] = useState<'required' | 'taken' | null>(null);
  const save = useMutation({
    mutationFn: (trimmed: string) =>
      pool === undefined
        ? createPool({ name: trimmed, kind })
        : updatePool(pool.id, { name: trimmed }),
    onSuccess: async () => {
      await Promise.all(
        poolQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.problem.code === 'pool_name_taken')
        setProblem('taken');
    },
  });

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (save.isPending) return;
    const trimmed = name.trim();
    if (trimmed === '') {
      setProblem('required');
      return;
    }
    if (trimmed === pool?.name) {
      onClose();
      return;
    }
    setProblem(null);
    save.mutate(trimmed);
  };

  const failed = save.isError && problem !== 'taken';
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open && !save.isPending) onClose();
      }}
      title={
        pool === undefined
          ? t('budgetPools.edit.newTitle')
          : t('budgetPools.edit.renameTitle', { name: pool.name })
      }
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <TextField
          label={t('budgetPools.edit.name')}
          value={name}
          autoFocus
          onChange={(value) => {
            setName(value);
            setProblem(null);
            if (save.isError) save.reset();
          }}
          error={
            problem === 'required'
              ? t('budgetPools.edit.nameRequired')
              : problem === 'taken'
                ? t('budgetPools.edit.nameTaken')
                : undefined
          }
        />
        {pool === undefined ? (
          <>
            <ChoiceField
              label={t('budgetPools.edit.kind')}
              value={kind}
              choices={(['spending', 'savings'] as const).map((id) => ({
                id,
                label: t(`budgetPools.edit.kinds.${id}`),
              }))}
              placeholder={t('budgetPools.edit.kinds.spending')}
              onChange={(value) => {
                setKind(value === 'savings' ? 'savings' : 'spending');
              }}
            />
            <p className="font-sans text-small text-text-muted">
              {t('budgetPools.edit.kindHint')}
            </p>
          </>
        ) : null}
        {failed ? (
          <p role="alert" className="text-small text-negative">
            {t('budgetPools.edit.failed')}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('budgetPools.style.cancel')}
          </BracketButton>
          <PrimaryButton type="submit" isDisabled={save.isPending}>
            {save.isPending
              ? t('budgetPools.style.saving')
              : t('budgetPools.style.save')}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}
