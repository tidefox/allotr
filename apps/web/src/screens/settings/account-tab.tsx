import type { SessionView } from '@allotr/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { BracketButton } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { sessionQuery, signOut } from '@/lib/session';
import { t } from '@/messages/t';
import { InstanceTile, InvitesTile } from './instance-tiles.tsx';
import { FailureLine, SettingRow } from './setting-parts.tsx';
import { SessionsTile } from './sessions-tile.tsx';
import { TwoFactorTile } from './two-factor-tile.tsx';
import { useRegion } from './use-region.ts';

function SignInTile({ session }: { session: SessionView }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  return (
    <Tile title={t('settingsAccount.signIn.title')} bodyClassName="px-0 pb-0">
      <SettingRow
        label={t('settingsAccount.signIn.email')}
        value={session.user.email}
        hint={t('settingsAccount.signIn.emailHint')}
      />
      <SettingRow
        label={t('settingsAccount.signIn.role')}
        value={t(`settingsAccount.signIn.roles.${session.user.role}`)}
        hint={t('settingsAccount.signIn.roleHint')}
      />
      <SettingRow
        label={t('settingsAccount.signIn.signOut')}
        hint={t('settingsAccount.signIn.signOutHint')}
        control={
          <BracketButton
            isDisabled={pending}
            onPress={() => {
              setPending(true);
              setError(null);
              signOut(queryClient).then(
                () => navigate({ to: '/sign-in' }),
                (cause: unknown) => {
                  setPending(false);
                  setError(cause);
                },
              );
            }}
          >
            {t('settingsAccount.signIn.signOutAction')}
          </BracketButton>
        }
      />
      <div className="px-3 empty:hidden">
        <FailureLine error={error} />
      </div>
    </Tile>
  );
}

/**
 * Settings, account (docs/ui.md §6): sign-in, two-factor, sessions, and for
 * administrators the instance settings and invites. It needs only the
 * session, so it also works while the instance holds a user to enrolment.
 */
export function AccountTab() {
  const session = useQuery(sessionQuery).data;
  const admin = session?.user.role === 'admin' && !session.twoFactorRequired;
  const { locale, timeZone } = useRegion(session?.twoFactorRequired === false);
  if (session === null || session === undefined) return null;
  return (
    <Grid>
      <SignInTile session={session} />
      <TwoFactorTile session={session} />
      <SessionsTile locale={locale} timeZone={timeZone} />
      {admin ? <InstanceTile /> : null}
      {admin ? <InvitesTile locale={locale} timeZone={timeZone} /> : null}
    </Grid>
  );
}
