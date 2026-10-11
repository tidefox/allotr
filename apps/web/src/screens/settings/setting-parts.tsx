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
  SettingRowFace,
  settingRowClass,
} from '@/components/buttons';
import { MenuButton, MenuRadioItem, MenuSection } from '@/components/menu';
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

const settingColumns: readonly RowColumn[] = [
  { width: 'minmax(0, 1fr)' },
  { width: 'auto' },
  { width: '1.125rem' },
];

/**
 * One kv line (`r` with `minmax(0,1fr) auto 18px`): a muted label, then the
 * value or a control on the right. The hint is kept for assistive
 * technology and as a tooltip; the locked design shows one line per row.
 */
export function SettingRow({
  label,
  hint,
  value,
  control,
}: {
  label: ReactNode;
  hint?: string | undefined;
  /** The current value, in the interface font. */
  value?: ReactNode;
  control?: ReactNode;
}) {
  return (
    <div title={hint}>
      <Row
        columns={settingColumns}
        cells={[
          <span key="label" className="text-text-muted">
            {label}
            {hint === undefined ? null : (
              <span className="sr-only"> {hint}</span>
            )}
          </span>,
          <span
            key="value"
            className="flex items-center justify-end gap-2 font-ui"
          >
            {value}
            {control}
          </span>,
          <span key="end" />,
        ]}
      />
    </div>
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

/**
 * A row whose value is picked from a short list in an in-app menu. The
 * whole row is the control; the hint is the menu's first line.
 */
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
  const items = choices.map((choice) => (
    <MenuRadioItem key={choice.id} id={choice.id} label={choice.label} />
  ));
  return (
    <MenuButton
      variant="row"
      label={label}
      value={chosen?.label ?? value}
      selectionMode="single"
      selectedKeys={new Set([value])}
      onSelectionChange={(keys) => {
        const [first] = keys === 'all' ? [] : [...keys];
        if (first !== undefined && !disabled) onChange(String(first));
      }}
    >
      {hint === undefined ? (
        items
      ) : (
        <MenuSection title={hint} note>
          {items}
        </MenuSection>
      )}
    </MenuButton>
  );
}

/**
 * A row whose value is typed in a sheet. The whole row opens the sheet,
 * which carries the explanation.
 */
export function FormRow({
  label,
  value,
  onOpen,
}: {
  label: string;
  value: string;
  /** Kept for callers; the sheet shows its own explanation. */
  hint?: string | undefined;
  onOpen: () => void;
}) {
  return (
    <Button aria-haspopup="dialog" onPress={onOpen} className={settingRowClass}>
      <SettingRowFace label={label} value={value} />
    </Button>
  );
}

/** A row for a setting that is planned (ADR 0029): no control, tagged. */
export function PlannedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-h-row w-full grid-cols-[minmax(0,1fr)_auto_1.125rem] items-center gap-x-2.5 border-b px-3">
      <span className="min-w-0 truncate text-text-muted">
        {label}
        <PlannedTag />
      </span>
      <span className="min-w-0 truncate font-ui whitespace-nowrap text-text-muted">
        {value}
      </span>
      <span aria-hidden="true" />
    </div>
  );
}

/** The mockup's `planned` tag (`tagp`): a small warning-toned outline. */
export function PlannedTag() {
  return (
    <span className="ml-1.5 border border-current px-1 align-[1px] text-[0.625rem] leading-none text-warning">
      {t('settingsShell.planned')}
    </span>
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
