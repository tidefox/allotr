import type { ReactNode } from 'react';
import {
  Input,
  Label,
  Link,
  Text,
  TextField as AriaTextField,
} from 'react-aria-components';
import { BracketButton } from '@/components/buttons';
import { Row } from '@/components/row';
import type { RowColumn } from '@/components/row-columns';
import { Sheet } from '@/components/sheet';
import { cn } from '@/lib/utils';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';

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
  hint?: string;
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
  hint?: string;
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
