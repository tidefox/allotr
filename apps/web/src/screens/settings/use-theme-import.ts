import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { checkDraft, draftFromFile } from '@/features/themes/draft.ts';
import { handOffDraft } from '@/features/themes/import-handoff.ts';
import {
  importThemeText,
  type ImportResult,
} from '@/features/themes/importers/index.ts';
import { failureText } from '@/features/themes/labels.ts';
import { ApiError } from '@/lib/api.ts';
import { createTheme, importThemeUrl, themesQuery } from '@/lib/appearance.ts';
import { describeProblem } from '@/lib/problem.ts';
import { t } from '@/messages/t.ts';

const urlReasons = {
  not_https: t('settings.appearance.urlReasons.not_https'),
  credentials: t('settings.appearance.urlReasons.credentials'),
  not_public: t('settings.appearance.urlReasons.not_public'),
  unresolved: t('settings.appearance.urlReasons.unresolved'),
  redirect: t('settings.appearance.urlReasons.redirect'),
  status: t('settings.appearance.urlReasons.status'),
  too_large: t('settings.appearance.urlReasons.too_large'),
  timeout: t('settings.appearance.urlReasons.timeout'),
  network: t('settings.appearance.urlReasons.network'),
} as const;

export type ImportRefusal = Readonly<{
  source: string;
  problems: readonly string[];
}>;

/** A refused or failed fetch says why in words; the server gives the reason at /url. */
function urlProblem(error: unknown): string {
  const [first] = error instanceof ApiError ? (error.problem.errors ?? []) : [];
  const reason = first?.path === '/url' ? first.message : undefined;
  return reason !== undefined && Object.hasOwn(urlReasons, reason)
    ? urlReasons[reason as keyof typeof urlReasons]
    : describeProblem(error).message;
}

/**
 * Importing a theme file or address (ADR 0016). One theme opens in the
 * editor; a family of flavours is checked and saved at once. Nothing is
 * saved when any flavour has a problem.
 */
export function useThemeImport(userId: string, room: number) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [refused, setRefused] = useState<ImportRefusal | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  async function accept(source: string, result: ImportResult) {
    if (!result.ok) {
      setRefused({ source, problems: result.problems });
      return;
    }
    const [single] = result.themes;
    if (result.themes.length === 1 && single !== undefined) {
      handOffDraft(draftFromFile(single));
      await navigate({ to: '/settings/themes/new' });
      return;
    }
    const checks = result.themes.map((theme) =>
      checkDraft(draftFromFile(theme)),
    );
    const problems = checks.flatMap((check, at) =>
      check.problems.map(
        ({ path, failure }) =>
          `${result.themes[at]?.name ?? ''} ${path}: ${failureText(failure)}`,
      ),
    );
    const bodies = checks.flatMap((check) =>
      check.body === null ? [] : [check.body],
    );
    if (problems.length > 0 || bodies.length > room) {
      setRefused({
        source,
        problems:
          problems.length > 0
            ? problems
            : [t('settings.appearance.noRoom', { count: bodies.length, room })],
      });
      return;
    }
    try {
      for (const body of bodies) await createTheme(body);
      setDone(
        t('settings.appearance.importedFamily', { count: bodies.length }),
      );
    } catch (error) {
      setRefused({ source, problems: [describeProblem(error).message] });
    } finally {
      await queryClient.invalidateQueries({
        queryKey: themesQuery(userId).queryKey,
      });
    }
  }

  async function run(source: string, read: () => Promise<ImportResult>) {
    setRefused(null);
    setDone('');
    setBusy(true);
    try {
      await accept(source, await read());
    } catch (error) {
      setRefused({ source, problems: [urlProblem(error)] });
    } finally {
      setBusy(false);
    }
  }

  return {
    refused,
    busy,
    done,
    clearDone: () => {
      setDone('');
    },
    fromFile: (file: File) =>
      run(file.name, async () => importThemeText(await file.text(), file.name)),
    fromUrl: (url: string) =>
      run(url, async () => ({ ok: true, ...(await importThemeUrl(url)) })),
  };
}
