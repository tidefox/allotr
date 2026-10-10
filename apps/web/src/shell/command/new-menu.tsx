import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState, type ComponentType } from 'react';
import {
  Menu,
  MenuTrigger,
  Popover,
  Button as AriaButton,
} from 'react-aria-components';
import { MenuItem } from '@/components/menu';
import { menuPresentation } from '@/components/menu-placement';
import { Sheet } from '@/components/sheet';
import { useFrameWidth } from '@/components/use-frame-width';
import {
  IconAddLine,
  IconArrowDownLine,
  IconArrowLeftRightLine,
  IconArrowUpLine,
  IconBillLine,
  IconCalendarLine,
  IconGroupLine,
  IconScales3Line,
  type IconProps,
} from '@/generated/icons';
import { cn } from '@/lib/utils';
import { accountsQuery, categoriesQuery } from '@/lib/ledger';
import { t } from '@/messages/t';
import { IouSheet } from '@/screens/budget/iou-sheets.tsx';
import { PaydaySheet } from '@/screens/budget/sheets/payday-sheet.tsx';
import { EntryFormSheet } from './entry-form.tsx';
import { loggedFromTransaction } from './logged.ts';
import {
  closeNewForm,
  NEW_FORM_KINDS,
  showLogged,
  openNewForm,
  useCommandState,
  type NewFormKind,
} from './store.ts';

const kindIcons: Record<NewFormKind, ComponentType<IconProps>> = {
  expense: IconArrowDownLine,
  income: IconArrowUpLine,
  transfer: IconArrowLeftRightLine,
  split: IconGroupLine,
  payday: IconCalendarLine,
  bill: IconBillLine,
  iou: IconScales3Line,
};

const triggerClass =
  'inline-flex min-h-hit min-w-hit items-center justify-center gap-1 bg-primary px-3 text-small font-semibold text-on-primary hover:brightness-110 pressed:brightness-90';

/** The filled **+ new** menu (docs/ui.md §3): a popover, or a sheet on phones. */
export function NewMenu() {
  const sheet = menuPresentation(useFrameWidth()) === 'sheet';
  const [open, setOpen] = useState(false);
  const face = (
    <>
      <IconAddLine className="size-3.5" />
      {t('shell.command.new')}
    </>
  );
  const items = NEW_FORM_KINDS.map((kind) => (
    <MenuItem
      key={kind}
      id={kind}
      label={t(`shell.command.kinds.${kind}`)}
      icon={kindIcons[kind]}
      onAction={() => {
        setOpen(false);
        openNewForm(kind);
      }}
    />
  ));
  const menu = (
    <Menu
      aria-label={t('shell.command.newTitle')}
      className={cn(
        'min-w-48 py-1 outline-none',
        sheet && '[&_[role^=menuitem]]:min-h-[2.75rem]',
      )}
    >
      {items}
    </Menu>
  );
  return (
    <>
      {sheet ? (
        <>
          <AriaButton
            aria-haspopup="menu"
            aria-expanded={open}
            onPress={() => {
              setOpen(true);
            }}
            className={triggerClass}
          >
            {face}
          </AriaButton>
          <Sheet
            isOpen={open}
            onOpenChange={setOpen}
            title={t('shell.command.newTitle')}
            closeLabel={t('shell.command.close')}
          >
            {menu}
          </Sheet>
        </>
      ) : (
        <MenuTrigger isOpen={open} onOpenChange={setOpen}>
          <AriaButton className={triggerClass}>{face}</AriaButton>
          <Popover
            placement="top end"
            className="enter-pop min-w-[var(--trigger-width)] border border-outline bg-chrome text-text"
          >
            {menu}
          </Popover>
        </MenuTrigger>
      )}
      <NewFormHost />
    </>
  );
}

/**
 * Where a + new item's form opens: the structured entry forms here, and the
 * payday and IOU sheets the Budget screen already has. A bill has no create
 * form yet, so it leads to the Bills tab.
 */
function NewFormHost() {
  const { newForm, newFormPreset, intoAccountId } = useCommandState();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQuery).data?.accounts;
  const categories = useQuery(categoriesQuery).data?.categories;

  useEffect(() => {
    if (newForm !== 'bill') return;
    closeNewForm();
    void navigate({ to: '/budget/$sub', params: { sub: 'bills' } });
  }, [newForm, navigate]);

  if (newForm === null || newForm === 'bill') return null;
  if (newForm === 'payday') return <PaydaySheet open onClose={closeNewForm} />;
  if (newForm === 'iou')
    return (
      <IouSheet
        flow={{ kind: 'loan' }}
        onClose={closeNewForm}
        onRecorded={(created) => {
          const logged = loggedFromTransaction(
            created.transaction,
            accounts ?? [],
            categories ?? [],
          );
          if (logged !== null) showLogged(logged);
        }}
      />
    );
  return (
    <EntryFormSheet
      key={newForm}
      kind={newForm}
      preset={newFormPreset}
      intoAccountId={intoAccountId}
    />
  );
}
