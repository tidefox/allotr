import type { ComponentProps } from 'react';
import {
  FieldError,
  Input,
  Label,
  Text,
  TextField as AriaTextField,
} from 'react-aria-components';
import { cn } from '@/lib/utils';

/**
 * A labelled text field for the auth forms. Values are read from the form's
 * `FormData`, so the field is uncontrolled and carries its own `name`; the
 * browser's constraints (`required`, `minLength`, `pattern`, email type)
 * validate on submit and React Aria shows the message under the field.
 */
export function AuthField({
  label,
  hint,
  inputClassName,
  autoCapitalize,
  autoCorrect,
  spellCheck,
  ...props
}: Omit<
  ComponentProps<typeof AriaTextField>,
  'children' | 'className' | 'autoCapitalize' | 'autoCorrect' | 'spellCheck'
> & {
  label: string;
  hint?: string | undefined;
  inputClassName?: string | undefined;
  autoCapitalize?: 'off' | undefined;
  autoCorrect?: 'off' | undefined;
  spellCheck?: boolean | undefined;
}) {
  return (
    <AriaTextField {...props} className="flex flex-col gap-1">
      <Label className="text-small text-text-muted">{label}</Label>
      <Input
        {...(autoCapitalize === undefined ? {} : { autoCapitalize })}
        {...(autoCorrect === undefined ? {} : { autoCorrect })}
        {...(spellCheck === undefined ? {} : { spellCheck })}
        className={cn(
          'h-8 w-full min-w-0 border border-outline bg-canvas px-2 font-sans text-small text-text aria-[invalid=true]:border-negative',
          inputClassName,
        )}
      />
      {hint === undefined ? null : (
        <Text slot="description" className="font-ui text-small text-text-muted">
          {hint}
        </Text>
      )}
      <FieldError className="text-small text-negative" />
    </AriaTextField>
  );
}

/** A failure under a form, announced when it appears. */
export function FormMessage({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <p role="alert" className="text-small text-negative">
      {message}
    </p>
  );
}
