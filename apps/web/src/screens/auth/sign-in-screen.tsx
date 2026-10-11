import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState, type SyntheticEvent } from 'react';
import { Form } from 'react-aria-components';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { textField } from '@/lib/form';
import { errorMessage } from '@/lib/problem';
import { safeRedirect } from '@/lib/redirect';
import { signIn, verifySignInCode } from '@/lib/session';
import { t } from '@/messages/t';
import { AuthField, FormMessage } from './auth-fields.tsx';
import { CODE_PATTERN, endsCodeChallenge } from './auth-model.ts';
import { AuthTile } from './auth-tile.tsx';

// Sign-in (FR-W1): email and password, then a TOTP or backup code when the
// account has two-factor on. It lands where the visitor was heading
// (`redirect`, checked against the known routes) or on the Dashboard.
export function SignInScreen() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const search = useSearch({ strict: false });
  const next = safeRedirect(search.redirect) ?? '/';
  const deleted = search.deleted === true;
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function finish() {
    await queryClient.invalidateQueries();
    await navigate({ href: next });
  }

  function submitPassword(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const result = await signIn(
        textField(form, 'email'),
        textField(form, 'password'),
      );
      if (result === 'two-factor') setStep('code');
      else await finish();
    });
  }

  function submitCode(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      try {
        await verifySignInCode(textField(form, 'code'));
      } catch (caught) {
        if (endsCodeChallenge(caught)) setStep('password');
        throw caught;
      }
      await finish();
    });
  }

  if (step === 'code')
    return (
      <AuthTile title={t('signIn.codeTitle')} intro={t('signIn.codeIntro')}>
        {/* Keyed so the password step's inputs are not reused as the code
            step's. A TOTP code or a backup code, so no numeric keypad. */}
        <Form key="code" className="flex flex-col gap-3" onSubmit={submitCode}>
          <AuthField
            label={t('signIn.code')}
            hint={t('signIn.codeHint')}
            name="code"
            autoComplete="one-time-code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            pattern={CODE_PATTERN}
            isRequired
            autoFocus
            inputClassName="font-mono tracking-widest"
          />
          <FormMessage message={error} />
          <PrimaryButton type="submit" isDisabled={pending} className="w-full">
            {pending ? t('signIn.verifying') : t('signIn.verify')}
          </PrimaryButton>
          <BracketButton
            className="self-start"
            onPress={() => {
              setStep('password');
              setError(null);
            }}
          >
            {t('signIn.otherAccount')}
          </BracketButton>
        </Form>
      </AuthTile>
    );

  return (
    <AuthTile
      title={t('signIn.title')}
      intro={deleted ? t('signIn.deleted') : undefined}
    >
      <Form
        key="password"
        className="flex flex-col gap-3"
        onSubmit={submitPassword}
      >
        <AuthField
          label={t('signIn.email')}
          name="email"
          type="email"
          autoComplete="username"
          isRequired
          autoFocus
        />
        <AuthField
          label={t('signIn.password')}
          name="password"
          type="password"
          autoComplete="current-password"
          isRequired
        />
        <FormMessage message={error} />
        <PrimaryButton type="submit" isDisabled={pending} className="w-full">
          {pending ? t('signIn.submitting') : t('signIn.submit')}
        </PrimaryButton>
      </Form>
    </AuthTile>
  );
}
