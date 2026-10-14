import type { CreateTransactionBody } from '@allotr/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { postEntryNotices } from '@/lib/entry-notices';
import {
  createTransaction,
  editTransaction,
  entryQueryKeys,
} from '@/lib/ledger';

/**
 * Records a new entry, or with `editId` replaces that one (a reversal plus
 * the new entry). Resolves to the ID of the entry the body became.
 */
export function useSaveEntry(editId?: string) {
  const queryClient = useQueryClient();
  const refresh = () => {
    for (const queryKey of entryQueryKeys)
      void queryClient.invalidateQueries({ queryKey });
  };
  return useMutation({
    mutationFn: async ({
      body,
      idempotencyKey,
    }: {
      body: CreateTransactionBody;
      idempotencyKey: string;
    }) => {
      if (editId === undefined)
        return (await createTransaction(body, idempotencyKey)).id;
      const edited = await editTransaction(editId, body);
      postEntryNotices(edited.replacement.id, edited.notices);
      return edited.replacement.id;
    },
    // Not awaited: the dialog closes at once and the views refetch behind it.
    onSuccess: refresh,
    // A refused edit usually means the entry changed elsewhere (undone in
    // another tab): show what it is now.
    onError: () => {
      if (editId !== undefined) refresh();
    },
  });
}
