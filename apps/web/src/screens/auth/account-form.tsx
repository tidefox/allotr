import { MIN_PASSWORD_LENGTH, type SignUpBody } from '@allotr/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState, type SyntheticEvent } from 'react';
import { Form } from 'react-aria-components';
import { PrimaryButton } from '@/components/buttons';
import { textField } from '@/lib/form';
import { errorMessage } from '@/lib/problem';
import { t } from '@/messages/t';
import { AuthField, FormMessage } from './auth-fields.tsx';

/**
 * Name, email and password for a new account, shared by onboarding (the
 * first account) and the invite page. `create` makes the account; success
 * refreshes everything and lands on the Dashboard, where setup catches a
 * new user.
 */
export function AccountForm({
  create,
}: {
  create: (body: SignUpBody) => Promise<unknown>;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await create({
        name: textField(form, 'name'),
        email: textField(form, 'email'),
        password: textField(form, 'password'),
      });
      await queryClient.invalidateQueries();
      await navigate({ to: '/' });
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  }

  return (
    <Form
      className="flex flex-col gap-3"
      onSubmit={(event) => void submit(event)}
    >
      <AuthField
        label={t('onboarding.name')}
        name="name"
        autoComplete="name"
        isRequired
        maxLength={100}
        autoFocus
      />
      <AuthField
        label={t('onboarding.email')}
        name="email"
        type="email"
        autoComplete="email"
        isRequired
      />
      <AuthField
        label={t('onboarding.password')}
        name="password"
        type="password"
        autoComplete="new-password"
        isRequired
        minLength={MIN_PASSWORD_LENGTH}
        hint={t('onboarding.passwordHint', { min: MIN_PASSWORD_LENGTH })}
      />
      <FormMessage message={error} />
      <PrimaryButton type="submit" isDisabled={pending} className="w-full">
        {pending ? t('onboarding.submitting') : t('onboarding.submit')}
      </PrimaryButton>
    </Form>
  );
}
