import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { entryQueryKeys, moveTransaction } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import { t } from '@/messages/t';
import type { Move } from './reorder-model.ts';

/**
 * Saves a move within a day and says what happened: a polite announcement
 * for the new place, and the server's reason when it refuses (for example a
 * move that would put timed entries out of time order).
 */
export function useDayMove(nameOf: (id: string) => string) {
  const queryClient = useQueryClient();
  const [announcement, setAnnouncement] = useState('');
  const save = useMutation({
    mutationFn: (move: Move) => moveTransaction(move.id, move.afterId),
    onMutate: () => {
      setAnnouncement('');
    },
    onSuccess: async (_order, move) => {
      setAnnouncement(
        t('transactions.reorder.moved', {
          name: nameOf(move.id),
          position: move.position,
          count: move.count,
        }),
      );
      await Promise.all(
        entryQueryKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  return {
    busy: save.isPending,
    announcement,
    problem: save.isError ? describeProblem(save.error).message : null,
    move: (move: Move) => {
      if (!save.isPending) save.mutate(move);
    },
  };
}
