import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode, type SyntheticEvent } from 'react';
import {
  Button,
  Input,
  Label,
  Link,
  Text,
  TextField as AriaTextField,
} from 'react-aria-components';
import type { UpdateLedgerSettingsBody } from '@allotr/shared';
import {
  BracketButton,
  PrimaryButton,
  menuButtonClass,
} from '@/components/buttons';
import { MenuButton, MenuRadioItem } from '@/components/menu';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sheet } from '@/components/sheet';
import { IconEditLine } from '@/generated/icons';
import { budgetQueryKeys } from '@/lib/budgets';
import { ledgerSettingsQuery } from '@/lib/ledger';
import { describeProblem, errorMessage } from '@/lib/problem';
import {
  figureQueryKeys,
  invalidate,
  updateLedgerSettings,
} from '@/lib/settings';
import { cn } from '@/lib/utils';
import { t } from '@/messages/t';

// The pieces the settings tabs are built from (docs/ui.md §6): every value
// row is a `label · value` control that opens a menu (choices) or a sheet
// (typed values). Nothing here is a native input styled as a control.

// Pieces the account and data tabs share (docs/ui.md §6, Settings): a value
// row with its control on the right, a confirm sheet for destructive actions,
// a secret text field and a download link in the bracket style.

// The label (which may be a menu button) keeps its full width when it fits;
// the hint gives way first.
const settingColumns: readonly RowColumn[] = [
  { width: 'minmax(0, max-content)' },
  { width: 'minmax(0, 1fr)', from: 'medium' },
  { width: 'auto' },
];

/** One line: a label, a muted hint from 600 px, and a control (menu or button). */
export function SettingRow({
  label,
  hint,
  value,
  control,
}: {
  /** Text, or a labelled menu button that is the row's control. */
  label: ReactNode;
  hint?: string | undefined;
  /** The current value, shown after the label in the interface font. */
  value?: ReactNode;
  control?: ReactNode;
}) {
  return (
    <Row
      columns={settingColumns}
      cells={[
        <span key="label" className="flex min-w-0 items-baseline gap-2">
          <span className="shrink-0">{label}</span>
          {value === undefined ? null : (
            <span className="min-w-0 truncate font-ui text-text-muted">
              {value}
            </span>
          )}
        </span>,
        <span key="hint" className="font-ui text-small text-text-muted">
          {hint}
        </span>,
        <span key="control" className="flex justify-end">
          {control}
        </span>,
      ]}
    />
  );
}

/** A message in a tile body: status, or an error with a retry. */
export function Notice({
  children,
  tone = 'muted',
  role,
}: {
  children: ReactNode;
  tone?: 'muted' | 'negative';
  role?: 'status' | 'alert';
}) {
  return (
    <p
      {...(role === undefined ? {} : { role })}
      className={cn(
        'px-3 py-2 font-ui text-small',
        tone === 'negative' ? 'text-negative' : 'text-text-muted',
      )}
    >
      {children}
    </p>
  );
}

/** A request's failure in words, or nothing. */
export function FailureLine({ error }: { error: unknown }) {
  if (error === null || error === undefined) return null;
  return (
    <p role="alert" className="text-small text-negative">
      {errorMessage(error)}
    </p>
  );
}

/** Confirms a destructive action in a sheet; the action is a `negative` bracket. */
export function ConfirmSheet({
  title,
  body,
  confirmLabel,
  workingLabel,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  body: string;
  confirmLabel: string;
  workingLabel: string;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      closeLabel={t('quickEntry.close')}
    >
      <div className="flex flex-col gap-3 p-3">
        <p className="font-ui text-small text-text-muted">{body}</p>
        <FailureLine error={error} />
        <div className="flex items-center justify-end gap-2">
          <BracketButton onPress={onClose}>
            {t('settingsAccount.cancel')}
          </BracketButton>
          <BracketButton
            tone="destructive"
            isDisabled={pending}
            onPress={onConfirm}
          >
            {pending ? workingLabel : confirmLabel}
          </BracketButton>
        </div>
      </div>
    </Sheet>
  );
}

/** A text field for a password, a one-time code or a read-only value. */
export function SecretField({
  label,
  hint,
  value,
  onChange,
  type = 'text',
  autoComplete,
  inputMode,
  readOnly = false,
  autoFocus = false,
  mono = false,
  name,
}: {
  label: string;
  hint?: string | undefined;
  value: string;
  onChange?: (value: string) => void;
  type?: 'text' | 'password';
  autoComplete?: string;
  inputMode?: 'numeric';
  readOnly?: boolean;
  autoFocus?: boolean;
  mono?: boolean;
  name?: string;
}) {
  return (
    <AriaTextField
      value={value}
      {...(onChange === undefined ? {} : { onChange })}
      type={type}
      isReadOnly={readOnly}
      autoFocus={autoFocus}
      {...(name === undefined ? {} : { name })}
      className="flex flex-col gap-1"
    >
      <Label className="text-small text-text-muted">{label}</Label>
      <Input
        {...(autoComplete === undefined ? {} : { autoComplete })}
        {...(inputMode === undefined ? {} : { inputMode })}
        {...(readOnly
          ? {
              onFocus: (event) => {
                event.currentTarget.select();
              },
            }
          : {})}
        className={cn(
          'h-8 w-full min-w-0 border border-outline bg-canvas px-2 text-small text-text',
          mono ? 'font-mono' : 'font-sans',
        )}
      />
      {hint === undefined ? null : (
        <Text slot="description" className="font-ui text-small text-text-muted">
          {hint}
        </Text>
      )}
    </AriaTextField>
  );
}

/** A download link styled like a `[bracket]` button. */
export function BracketLink({
  href,
  label,
  accessibleName,
  download = false,
}: {
  href: string;
  label: string;
  /** A fuller name when several links share the same visible label. */
  accessibleName?: string;
  download?: boolean;
}) {
  return (
    <Link
      href={href}
      {...(accessibleName === undefined
        ? {}
        : { 'aria-label': accessibleName })}
      {...(download ? { download: true } : {})}
      className="press inline-flex min-h-hit min-w-hit items-center gap-1 px-1 text-small text-primary"
    >
      <span aria-hidden="true" className="text-outline">
        [
      </span>
      <span>{label}</span>
      <span aria-hidden="true" className="text-outline">
        ]
      </span>
    </Link>
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
      label={
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
      label={
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
