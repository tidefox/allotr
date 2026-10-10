import { createFirstAccount } from '@/lib/session';
import { t } from '@/messages/t';
import { AccountForm } from './account-form.tsx';
import { AuthTile } from './auth-tile.tsx';

// The first account on a fresh instance (FR-W7): it becomes the
// administrator. Setup follows on the Dashboard route.
export function OnboardingScreen() {
  return (
    <AuthTile title={t('onboarding.title')} intro={t('onboarding.intro')}>
      <AccountForm create={createFirstAccount} />
    </AuthTile>
  );
}
