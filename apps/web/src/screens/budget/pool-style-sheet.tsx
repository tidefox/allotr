import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import type { CategoryColour, CategoryIcon } from '@allotr/shared';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { ColourField, IconField } from '@/components/style-fields';
import { poolQueryKeys, updatePool } from '@/lib/budgets';
import { t } from '@/messages/t';
import type { PoolTile } from './pools-model.ts';

/**
 * A pool's colour and icon, each clearable back to Auto (the series at its
 * place, and its kind's icon). Nothing here changes a figure.
 */
export function PoolStyleSheet({
  pool,
  onClose,
}: {
  pool: Pick<PoolTile, 'id' | 'name' | 'storedColour' | 'storedIcon'>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [colour, setColour] = useState<CategoryColour | null>(
    pool.storedColour,
  );
  const [icon, setIcon] = useState<CategoryIcon | null>(pool.storedIcon);
  const save = useMutation({
    mutationFn: (body: {
      colour?: CategoryColour | null;
      icon?: CategoryIcon | null;
    }) => updatePool(pool.id, body),
    onSuccess: async () => {
      await Promise.all(
        poolQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
      onClose();
    },
  });
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (colour === pool.storedColour && icon === pool.storedIcon) {
      onClose();
      return;
    }
    save.mutate({
      ...(colour === pool.storedColour ? {} : { colour }),
      ...(icon === pool.storedIcon ? {} : { icon }),
    });
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t('budgetPools.style.title', { name: pool.name })}
      closeLabel={t('quickEntry.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <ColourField value={colour} onChange={setColour} />
        <p className="font-sans text-small text-text-muted">
          {t('budgetPools.style.hint')}
        </p>
        <IconField value={icon} colour={colour} onChange={setIcon} />
        {save.isError ? (
          <p role="alert" className="text-small text-negative">
            {t('budgetPools.style.failed')}
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
