import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from '@tanstack/react-router';
import { BracketButton } from '@/components/buttons';
import { errorMessage } from '@/lib/problem';
import { acceptInvite, inviteQuery } from '@/lib/session';
import { t } from '@/messages/t';
import { AccountForm } from './account-form.tsx';
import { isInvalidInvite } from './auth-model.ts';
import { AuthTile } from './auth-tile.tsx';

// Signing up with a single-use invite link from an administrator.
export function InviteScreen() {
  const { token = '' } = useParams({ strict: false });
  const invite = useQuery(inviteQuery(token));

  if (invite.isError) {
    const invalid = isInvalidInvite(invite.error);
    return (
      <AuthTile
        title={t('invite.invalidTitle')}
        intro={invalid ? t('invite.invalid') : errorMessage(invite.error)}
      >
        {invalid ? (
          <Link
            to="/sign-in"
            className="inline-flex min-h-hit items-center self-start text-small text-primary underline underline-offset-4"
          >
            {t('invite.signIn')}
          </Link>
        ) : (
          <BracketButton
            className="self-start"
            onPress={() => {
              void invite.refetch();
            }}
          >
            {t('errors.retry')}
          </BracketButton>
        )}
      </AuthTile>
    );
  }

  if (invite.data === undefined)
    return (
      <AuthTile title={t('invite.title')}>
        <p role="status" className="font-ui text-small text-text-muted">
          {t('invite.checking')}
        </p>
      </AuthTile>
    );

  return (
    <AuthTile title={t('invite.title')} intro={t('invite.intro')}>
      <AccountForm create={(body) => acceptInvite(token, body)} />
    </AuthTile>
  );
}
