import { exportFormatSchema } from '@allotr/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { BracketButton } from '@/components/buttons';
import { Grid, Tile } from '@/components/layout';
import { sessionQuery } from '@/lib/session';
import { t } from '@/messages/t';
import { DeleteAccountTile } from './delete-account-tile.tsx';
import { ImportTile } from './import-tile.tsx';
import { BracketLink, Notice, SettingRow } from './settings-parts.tsx';

const formats = exportFormatSchema.options;

function ExportTile() {
  return (
    <Tile
      title={t('settingsData.export.title')}
      subtitle={t('settings.export.intro')}
      bodyClassName="px-0 pb-0"
    >
      {formats.map((format) => (
        <SettingRow
          key={format}
          label={t(`settingsData.export.formats.${format}`)}
          hint={t(`settings.export.${format}.hint`)}
          control={
            <BracketLink
              download
              href={`/v1/export?format=${format}`}
              label={t('settingsData.export.download')}
              accessibleName={t(`settings.export.${format}.label`)}
            />
          }
        />
      ))}
    </Tile>
  );
}

/** Until they enrol in two-factor, the server refuses everything else. */
function HeldTile() {
  const navigate = useNavigate();
  return (
    <Tile title={t('settingsData.export.title')} bodyClassName="px-0 pb-0">
      <Notice role="status">{t('settingsData.held')}</Notice>
      <div className="px-3 pb-2">
        <BracketButton
          onPress={() => {
            void navigate({ to: '/settings/$sub', params: { sub: 'account' } });
          }}
        >
          {t('settingsData.heldAction')}
        </BracketButton>
      </div>
    </Tile>
  );
}

/**
 * Settings, data (docs/ui.md §6): export, import, delete account. For a user
 * held to two-factor enrolment it makes no ledger request at all.
 */
export function DataTab() {
  const session = useQuery(sessionQuery).data;
  if (session === null || session === undefined) return null;
  return (
    <Grid>
      {session.twoFactorRequired ? (
        <HeldTile />
      ) : (
        <>
          <ExportTile />
          <ImportTile />
        </>
      )}
      <DeleteAccountTile session={session} />
    </Grid>
  );
}
