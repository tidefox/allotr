import type { ReactNode } from 'react';
import { Frame } from '@/components/layout';
import { t } from '@/messages/t';

/**
 * The signed-out pages (sign-in, onboarding, invite) and the router's error
 * and not-found pages: a single tile centred on `canvas`, with the product
 * name on its title bar. The frame is still the container the responsive
 * variants query.
 */
export function AuthTile({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <Frame className="grid min-h-dvh place-items-center px-3 py-6">
      <main
        id="content"
        className="flex w-full max-w-[26rem] min-w-0 flex-col border bg-canvas"
      >
        <header className="flex h-bar min-w-0 items-center gap-2 border-b bg-chrome px-3">
          <h1 className="min-w-0 truncate text-base font-semibold">{title}</h1>
          <span className="ml-auto shrink-0 text-small text-text-muted">
            {t('app.name')}
          </span>
        </header>
        <div className="flex flex-col gap-3 px-3 py-3">
          {intro === undefined ? null : (
            <p className="font-ui text-small text-text-muted">{intro}</p>
          )}
          {children}
        </div>
      </main>
    </Frame>
  );
}
