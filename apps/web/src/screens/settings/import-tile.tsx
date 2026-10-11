import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { FileTrigger } from 'react-aria-components';
import { BracketButton, PrimaryButton } from '@/components/buttons';
import { Tile } from '@/components/layout';
import { Sheet } from '@/components/sheet';
import { ApiError, call } from '@/lib/api';
import { endpoints } from '@/lib/endpoints';
import { t } from '@/messages/t';
import { importedCounts, kilobytes, parseImportFile } from './account-model.ts';
import { FailureLine, SettingRow } from './setting-parts.tsx';

type Picked =
  | { kind: 'file'; name: string; bytes: number; value: unknown }
  | { kind: 'refused'; name: string; reason: 'tooLarge' | 'notJson' };

function ImportSheet({
  picked,
  onClose,
}: {
  picked: Picked;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: (value: unknown) =>
      call(endpoints.importBundle, { body: value }),
    onSuccess: async () => {
      // Everything the ledger shows may have changed.
      await queryClient.invalidateQueries();
    },
  });
  const problems =
    run.error instanceof ApiError ? (run.error.problem.errors ?? []) : [];
  const title = t('settingsData.import.sheetTitle', { name: picked.name });

  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={run.isSuccess ? t('settingsData.import.doneTitle') : title}
      closeLabel={t('quickEntry.close')}
    >
      <div className="flex flex-col gap-3 p-3">
        {picked.kind === 'refused' ? (
          <p role="alert" className="text-small text-negative">
            {t(`settingsData.import.${picked.reason}`)}
          </p>
        ) : run.isSuccess ? (
          <>
            <p className="font-ui text-small text-text-muted">
              {t('settingsData.import.doneBody', { name: picked.name })}
            </p>
            <ul
              aria-label={t('settingsData.import.doneTitle')}
              className="text-small"
            >
              {importedCounts(run.data).map(({ key, count }) => (
                <li
                  key={key}
                  className="flex justify-between gap-3 border-b py-1"
                >
                  <span>{t(`settingsData.import.counts.${key}`)}</span>
                  <span>{count}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="font-ui text-small text-text-muted">
              {t('settingsData.import.sheetBody')}
            </p>
            <p className="text-small">
              {t('settingsData.import.size', { kb: kilobytes(picked.bytes) })}
            </p>
            <FailureLine error={run.error} />
            {problems.length === 0 ? null : (
              <div className="text-small">
                <p className="text-text-muted">
                  {t('settingsData.import.problems')}
                </p>
                <ul>
                  {problems.slice(0, 5).map((problem) => (
                    <li key={`${problem.path}:${problem.message}`}>
                      {problem.path} {problem.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        <div className="flex items-center justify-end gap-2">
          {picked.kind === 'file' && !run.isSuccess ? (
            <>
              <BracketButton onPress={onClose}>
                {t('settingsData.cancel')}
              </BracketButton>
              <PrimaryButton
                isDisabled={run.isPending}
                onPress={() => {
                  run.mutate(picked.value);
                }}
              >
                {run.isPending
                  ? t('settingsData.import.working')
                  : t('settingsData.import.submit')}
              </PrimaryButton>
            </>
          ) : (
            <PrimaryButton onPress={onClose}>
              {t('settingsData.import.done')}
            </PrimaryButton>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** Import of a JSON backup into an empty ledger; the server validates it all. */
export function ImportTile() {
  const [picked, setPicked] = useState<Picked | null>(null);
  const [reading, setReading] = useState(false);

  const choose = (files: FileList | null) => {
    const file = files?.[0];
    if (file === undefined) return;
    setReading(true);
    file.text().then(
      (text) => {
        const parsed = parseImportFile(text, file.size);
        setPicked(
          parsed.ok
            ? {
                kind: 'file',
                name: file.name,
                bytes: file.size,
                value: parsed.value,
              }
            : { kind: 'refused', name: file.name, reason: parsed.reason },
        );
        setReading(false);
      },
      () => {
        setPicked({ kind: 'refused', name: file.name, reason: 'notJson' });
        setReading(false);
      },
    );
  };

  return (
    <Tile
      title={t('settingsData.import.title')}
      subtitle={t('settingsData.import.subtitle')}
      bodyClassName="px-0 pb-0"
    >
      <SettingRow
        label={t('settingsData.import.row')}
        hint={t('settingsData.import.rowHint')}
        control={
          <FileTrigger
            acceptedFileTypes={['application/json', '.json']}
            onSelect={choose}
          >
            <BracketButton isDisabled={reading}>
              {t('settingsData.import.choose')}
            </BracketButton>
          </FileTrigger>
        }
      />
      {picked === null ? null : (
        <ImportSheet
          picked={picked}
          onClose={() => {
            setPicked(null);
          }}
        />
      )}
    </Tile>
  );
}
