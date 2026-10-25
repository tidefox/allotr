import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Input, TextField } from 'react-aria-components';
import { Amount } from '@/components/amount';
import { MenuButton, MenuRadioItem } from '@/components/menu';
import { ResultLine } from '@/components/states';
import {
  IconArrowDownLine,
  IconArrowLeftRightLine,
  IconArrowUpLine,
  IconWallet3Line,
} from '@/generated/icons';
import { iouQueryKeys } from '@/lib/ious';
import {
  accountsQuery,
  entryQueryKeys,
  reverseTransaction,
  todayQuery,
} from '@/lib/ledger';
import { useLedgerReady } from '@/lib/session';
import { t } from '@/messages/t';
import { NewMenu } from './command/new-menu.tsx';
import {
  dismissLogged,
  registerCommandInput,
  setIntoAccount,
  useCommandState,
} from './command/store.ts';
import { submitLine } from './command/submit.ts';

// The command line (docs/ui.md §3). Keyboard: `/` focuses the input through
// `focusCommandLine()` in ./command/store.ts. The root keeps the shell grid
// placement: the same row as the settings row, `--h-cmd` tall.
//
// A typed line becomes a draft the user confirms (rule 6); the parser
// endpoint is not there yet, so a submit answers with a note (submit.ts).
// The + new forms call `showLogged()` and get the result line below, with
// an undo that reverses the entry.

export function CommandLine() {
  const { intoAccountId, logged } = useCommandState();
  const ready = useLedgerReady();
  const accounts = useQuery({ ...accountsQuery, enabled: ready });
  const today = useQuery({ ...todayQuery, enabled: ready });
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [line, setLine] = useState('');
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    registerCommandInput(input.current);
    return () => {
      registerCommandInput(null);
    };
  }, []);

  const undo = useMutation({
    mutationFn: (id: string) => reverseTransaction(id),
    onSuccess: () => {
      dismissLogged();
      for (const queryKey of [...entryQueryKeys, ...iouQueryKeys])
        void queryClient.invalidateQueries({ queryKey });
    },
    onError: () => {
      setNote(t('shell.command.undoFailed'));
    },
  });

  const open = (accounts.data?.accounts ?? []).filter((a) => !a.archived);
  const into = open.find((a) => a.id === intoAccountId);

  return (
    <section
      aria-label={t('shell.slots.command')}
      data-slot="command"
      className="relative col-start-1 row-start-4 flex h-cmd items-stretch border-t border-seam bg-canvas medium:col-start-2"
    >
      {logged === null ? null : (
        <div className="absolute inset-x-0 bottom-full">
          <ResultLine
            icon={
              logged.kind === 'income' ? (
                <IconArrowUpLine className="size-4 shrink-0 text-positive" />
              ) : logged.kind === 'transfer' ? (
                <IconArrowLeftRightLine className="size-4 shrink-0" />
              ) : (
                <IconArrowDownLine className="size-4 shrink-0 text-negative" />
              )
            }
            amount={<Amount amount={logged.amount} kind={logged.kind} />}
            account={[logged.categoryLabel, logged.accountName]
              .filter((part) => part !== null)
              .join(' · ')}
            left={
              today.data === undefined ? null : (
                <>
                  <Amount amount={today.data.leftToday} />{' '}
                  <span className="text-text-muted">
                    {t('shell.command.left')}
                  </span>
                </>
              )
            }
            undoLabel={t('shell.command.undo')}
            onUndo={() => {
              undo.mutate(logged.id);
            }}
            onDismiss={dismissLogged}
          />
        </div>
      )}
      <form
        className="flex min-w-0 flex-1 items-stretch"
        onSubmit={(event) => {
          event.preventDefault();
          const outcome = submitLine(line);
          setNote(
            outcome.status === 'unavailable'
              ? t('shell.command.unavailable', { line: outcome.line })
              : null,
          );
        }}
      >
        <span
          aria-hidden="true"
          className="flex items-center pr-2 pl-3 font-bold text-primary"
        >
          ›
        </span>
        <TextField
          aria-label={t('shell.command.label')}
          value={line}
          onChange={(value) => {
            setLine(value);
            setNote(null);
          }}
          className="flex min-w-0 flex-1"
        >
          <Input
            ref={input}
            placeholder={t('shell.command.input')}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-full w-full min-w-0 truncate bg-canvas text-base outline-none placeholder:text-text-muted focus-visible:outline-2 focus-visible:outline-ring compact:text-[0.8125rem]"
          />
        </TextField>
        {note === null ? (
          <span
            data-key-hints
            className="hidden shrink-0 items-center pr-3 text-tiny whitespace-nowrap text-text-muted medium:flex"
          >
            {t('shell.command.hint')}
          </span>
        ) : (
          <span
            role="status"
            className="flex min-w-0 shrink items-center truncate pr-3 text-small text-text-muted"
          >
            {note}
          </span>
        )}
      </form>
      <div className="flex shrink-0 items-stretch">
        <MenuButton
          variant="strip"
          placement="top end"
          icon={IconWallet3Line}
          label={t('shell.command.into')}
          value={into?.name ?? t('shell.command.intoDefault')}
          title={t('shell.command.intoTitle')}
          selectionMode="single"
          selectedKeys={new Set([into?.id ?? 'default'])}
          onSelectionChange={(keys) => {
            const [first] = keys === 'all' ? [] : [...keys];
            setIntoAccount(
              typeof first === 'string' && first !== 'default' ? first : null,
            );
          }}
          className="max-w-48"
        >
          <MenuRadioItem id="default" label={t('shell.command.intoDefault')} />
          {open.map((account) => (
            <MenuRadioItem
              key={account.id}
              id={account.id}
              label={account.name}
            />
          ))}
        </MenuButton>
        <NewMenu />
      </div>
    </section>
  );
}
