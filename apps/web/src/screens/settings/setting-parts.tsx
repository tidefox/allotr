import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import { Button } from 'react-aria-components';
import type { UpdateLedgerSettingsBody } from '@allotr/shared';
import {
  BracketButton,
  PrimaryButton,
  menuButtonClass,
} from '@/components/buttons';
import { MenuButton, MenuRadioItem } from '@/components/menu';
import { Row } from '@/components/row';
import { Sheet } from '@/components/sheet';
import { IconEditLine } from '@/generated/icons';
import { budgetQueryKeys } from '@/lib/budgets';
import { ledgerSettingsQuery } from '@/lib/ledger';
import { describeProblem } from '@/lib/problem';
import {
  figureQueryKeys,
  invalidate,
  updateLedgerSettings,
} from '@/lib/settings';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';

// The pieces both settings tabs are built from (docs/ui.md §6): every value
// row is a `label · value` control that opens a menu (choices) or a sheet
// (typed values). Nothing here is a native input styled as a control.

const rowColumns = [
  { width: 'minmax(0,1fr)' },
  { width: 'minmax(0,1fr)', from: 'medium' },
] as const;

/** A settings row: the control, and a muted hint from 600 px. */
export function SettingRow({
  control,
  hint,
}: {
  control: ReactNode;
  hint?: string | undefined;
}) {
  return (
    <Row
      columns={rowColumns}
      cells={[
        control,
        <span key="h" className="font-ui text-small text-text-muted">
          {hint}
        </span>,
      ]}
    />
  );
}

export type SettingChoice = Readonly<{ id: string; label: string }>;

/** A row whose value is picked from a short list in an in-app menu. */
export function ChoiceRow({
  label,
  value,
  choices,
  hint,
  disabled = false,
  onChange,
}: {
  label: string;
  value: string;
  choices: readonly SettingChoice[];
  hint?: string | undefined;
  disabled?: boolean;
  onChange: (id: string) => void;
}) {
  const chosen = choices.find((c) => c.id === value);
  return (
    <SettingRow
      hint={hint}
      control={
        <MenuButton
          label={label}
          value={chosen?.label ?? value}
          selectionMode="single"
          selectedKeys={new Set([value])}
          onSelectionChange={(keys) => {
            const [first] = keys === 'all' ? [] : [...keys];
            if (first !== undefined && !disabled) onChange(String(first));
          }}
        >
          {choices.map((choice) => (
            <MenuRadioItem
              key={choice.id}
              id={choice.id}
              label={choice.label}
            />
          ))}
        </MenuButton>
      }
    />
  );
}

/** A row whose value is typed in a sheet; the button shows it and an edit mark. */
export function FormRow({
  label,
  value,
  hint,
  onOpen,
}: {
  label: string;
  value: string;
  hint?: string | undefined;
  onOpen: () => void;
}) {
  return (
    <SettingRow
      hint={hint}
      control={
        <Button
          aria-haspopup="dialog"
          onPress={onOpen}
          className={menuButtonClass}
        >
          <span className="text-text-muted">{label}</span>
          <span aria-hidden="true" className="text-text-muted">
            ·
          </span>
          <span className="min-w-0 truncate">{value}</span>
          <IconEditLine className="size-3.5 shrink-0" />
        </Button>
      }
    />
  );
}

/** A muted explanation under the rows of a tile. */
export function Note({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'warning';
}) {
  return (
    <p
      className={cn(
        'px-3 py-2 font-ui text-small',
        tone === 'warning' ? 'text-text' : 'text-text-muted',
      )}
    >
      {children}
    </p>
  );
}

/** A save that failed, announced next to the rows it came from. */
export function SaveError({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  return (
    <p role="alert" className="px-3 py-2 text-small text-negative">
      {describeProblem(error).message}
    </p>
  );
}

/** A tile body for a failed read, with a retry. */
export function Failed({ retry }: { retry: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 px-3 py-2 text-small">
      <span className="text-negative">
        {t('settingsMoney.common.loadFailed')}
      </span>
      <BracketButton onPress={retry}>
        {t('settingsMoney.common.retry')}
      </BracketButton>
    </div>
  );
}

/**
 * Saves part of the ledger settings. The reply replaces the cached
 * settings, and every figure that depends on them is refetched.
 */
export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateLedgerSettingsBody) => updateLedgerSettings(body),
    onSuccess: (next) => {
      queryClient.setQueryData(ledgerSettingsQuery.queryKey, next);
      void invalidate(queryClient, [...figureQueryKeys, ...budgetQueryKeys]);
    },
  });
}

/**
 * A sheet around one small form: a title, the fields, the error, and
 * cancel / save. `onSubmit` runs when the form is sent.
 */
export function EditSheet({
  title,
  onClose,
  onSubmit,
  pending = false,
  error,
  submitLabel = t('settingsMoney.common.save'),
  extra,
  children,
}: {
  title: string;
  onClose: () => void;
  onSubmit: () => void;
  pending?: boolean;
  error?: unknown;
  submitLabel?: string;
  /** Another action beside save, for example a clear. */
  extra?: ReactNode;
  children: ReactNode;
}) {
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    onSubmit();
  };
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      closeLabel={t('settingsMoney.common.close')}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        {children}
        {error === undefined || error === null ? null : (
          <p role="alert" className="text-small text-negative">
            {describeProblem(error).message}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          {extra}
          <BracketButton onPress={onClose}>
            {t('settingsMoney.common.cancel')}
          </BracketButton>
          <PrimaryButton type="submit" isDisabled={pending}>
            {pending ? t('settingsMoney.common.saving') : submitLabel}
          </PrimaryButton>
        </div>
      </form>
    </Sheet>
  );
}

/** Sheet state for a form that saves part of the settings, then closes. */
export function useSheet<T = true>() {
  const [open, setOpen] = useState<T | null>(null);
  return [
    open,
    (value: T) => {
      setOpen(value);
    },
    () => {
      setOpen(null);
    },
  ] as const;
}
