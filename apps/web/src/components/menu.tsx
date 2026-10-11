import { useState, type ComponentType, type ReactNode } from 'react';
import {
  Button,
  Header,
  Menu as AriaMenu,
  MenuItem as AriaMenuItem,
  MenuSection as AriaMenuSection,
  MenuTrigger,
  Popover,
  Separator,
  type Selection,
} from 'react-aria-components';
import {
  IconArrowDownSLine,
  IconCheckLine,
  type IconProps,
} from '@/generated/icons';
import { cn } from '@/lib/utils';
import {
  Brackets,
  bracketClass,
  menuButtonClass,
  stripButtonClass,
} from './buttons.tsx';
import { menuPresentation } from './menu-placement.ts';
import { Sheet } from './sheet.tsx';
import { useFrameWidth } from './use-frame-width.ts';

// A menu is a popover from 600 px and a bottom sheet below (docs/ui.md §4).
// The items are the same React Aria menu in both. Rows are 30 px in
// popovers and 44 px in sheets. Nested fold groups are not implemented.

const rowClass =
  'press flex min-h-[1.875rem] items-center gap-2 px-3 text-small outline-none ';

export type MenuItemProps = {
  id: string;
  label: string;
  icon?: ComponentType<IconProps>;
  /** A key hint on the right, for example `f`. */
  hint?: string;
  destructive?: boolean;
  /** A subcategory-style row, set in from its parent. */
  indent?: boolean;
  onAction?: () => void;
};

export function MenuItem({
  id,
  label,
  icon: Icon,
  hint,
  destructive = false,
  indent = false,
  onAction,
}: MenuItemProps) {
  return (
    <AriaMenuItem
      id={id}
      textValue={label}
      {...(onAction === undefined ? {} : { onAction })}
      className={cn(
        rowClass,
        'focus:bg-card',
        destructive && 'text-negative',
        indent && 'pl-7',
      )}
    >
      {({ selectionMode, isSelected }) => (
        <>
          {selectionMode === 'none' ? null : (
            <span className="flex size-4 shrink-0 items-center justify-center">
              {isSelected ? <IconCheckLine className="size-4" /> : null}
            </span>
          )}
          {Icon === undefined ? null : (
            <Icon className="size-4 shrink-0 text-text-muted" />
          )}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {hint === undefined ? null : (
            <kbd className="shrink-0 text-tiny text-text-muted">{hint}</kbd>
          )}
        </>
      )}
    </AriaMenuItem>
  );
}

/** Checkbox row: use inside a menu with `selectionMode="multiple"`. */
export const MenuCheckItem = MenuItem;
/** Radio row: use inside a menu with `selectionMode="single"`. */
export const MenuRadioItem = MenuItem;

export function MenuSection({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <AriaMenuSection>
      {title === undefined ? null : (
        <Header className="px-3 pt-2 pb-1 text-tiny font-semibold tracking-wide text-text-muted uppercase">
          {title}
        </Header>
      )}
      {children}
    </AriaMenuSection>
  );
}

export function MenuSeparator() {
  return <Separator className="my-1 border-t border-outline-variant" />;
}

export type MenuButtonProps = {
  label: string;
  value?: string;
  icon?: ComponentType<IconProps>;
  /** Shows only the icon; the label stays as the accessible name. */
  iconOnly?: boolean;
  /** The sheet's title on phones. Defaults to the label. */
  title?: string;
  selectionMode?: 'none' | 'single' | 'multiple';
  /** Controls whether the menu is open, for a shortcut that opens it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  selectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  className?: string;
  /**
   * `bordered` (default): muted label, value and ▾ in a box (`ddb`). `strip`: a
   * full-height strip button showing icon, value and ▾, with the label as
   * its accessible name; the value hides on phones. `bracket`: `[⋮]`, the
   * icon in brackets with the label as its accessible name.
   */
  variant?: 'bordered' | 'strip' | 'bracket';
  /** Strip only: false leaves out the ▾ (the mockup's period and filter). */
  chevron?: boolean;
  /** Strip only: a filled count after the text, for example active filters. */
  badge?: string;
  /** Where the popover opens; the command line opens upwards. */
  placement?: 'bottom start' | 'top end';
  children: ReactNode;
};

/** A bordered `label value ▾` control (`ddb`) that opens a menu. */
export function MenuButton({
  label,
  value,
  icon: Icon,
  iconOnly = false,
  title,
  selectionMode = 'none',
  open: controlledOpen,
  onOpenChange,
  selectedKeys,
  onSelectionChange,
  className,
  variant = 'bordered',
  chevron = true,
  badge,
  placement = 'bottom start',
  children,
}: MenuButtonProps) {
  const presentation = menuPresentation(useFrameWidth());
  const [ownOpen, setOwnOpen] = useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = (next: boolean) => {
    setOwnOpen(next);
    onOpenChange?.(next);
  };

  const strip = variant === 'strip';
  const bracket = variant === 'bracket';
  // The strip face shows only the value, so the name carries both (the
  // visible text stays part of the name, WCAG 2.5.3).
  const stripName = [value === undefined ? label : `${label}: ${value}`, badge]
    .filter((part) => part !== undefined)
    .join(', ');
  const faceClass = strip
    ? stripButtonClass
    : bracket
      ? bracketClass
      : menuButtonClass;
  const named = strip
    ? { 'aria-label': stripName }
    : bracket
      ? { 'aria-label': label }
      : {};
  const face = bracket ? (
    <Brackets icon={Icon} />
  ) : strip ? (
    <>
      {Icon === undefined ? null : <Icon className="size-[1.15em] shrink-0" />}
      {/* With no value the label shows, as the filter's word does. */}
      <span className="min-w-0 truncate compact:hidden">{value ?? label}</span>
      {badge === undefined ? null : (
        <span className="bg-primary px-[5px] text-[0.6875rem] font-semibold text-on-primary">
          {badge}
        </span>
      )}
      {chevron ? (
        <IconArrowDownSLine className="size-[1.15em] shrink-0" />
      ) : null}
    </>
  ) : (
    <>
      {Icon === undefined ? null : <Icon className="size-3.5" />}
      <span
        className={cn(
          value !== undefined && 'text-text-muted',
          iconOnly && 'sr-only',
        )}
      >
        {label}
      </span>
      {value === undefined || iconOnly ? null : (
        <span className="min-w-0 truncate">{value}</span>
      )}
      {iconOnly ? null : <IconArrowDownSLine className="size-3.5 shrink-0" />}
    </>
  );
  const menu = (
    <AriaMenu
      aria-label={title ?? label}
      selectionMode={selectionMode}
      {...(selectedKeys === undefined ? {} : { selectedKeys })}
      {...(onSelectionChange === undefined && selectionMode !== 'single'
        ? {}
        : {
            onSelectionChange: (keys: Selection) => {
              onSelectionChange?.(keys);
              // A popover closes on a single choice by itself; a sheet does not.
              if (presentation === 'sheet' && selectionMode === 'single')
                setOpen(false);
            },
          })}
      {...(presentation === 'sheet' && selectionMode === 'none'
        ? {
            onAction: () => {
              setOpen(false);
            },
          }
        : {})}
      className={cn(
        'min-w-48 py-1 outline-none',
        presentation === 'sheet' && '[&_[role^=menuitem]]:min-h-[2.75rem]',
      )}
    >
      {children}
    </AriaMenu>
  );

  if (presentation === 'sheet') {
    return (
      <>
        <Button
          onPress={() => {
            setOpen(true);
          }}
          aria-haspopup="menu"
          aria-expanded={open}
          {...named}
          className={cn(faceClass, className)}
        >
          {face}
        </Button>
        <Sheet isOpen={open} onOpenChange={setOpen} title={title ?? label}>
          {menu}
        </Sheet>
      </>
    );
  }
  return (
    <MenuTrigger isOpen={open} onOpenChange={setOpen}>
      <Button {...named} className={cn(faceClass, className)}>
        {face}
      </Button>
      <Popover
        placement={placement}
        className="enter-pop max-h-[var(--visual-viewport-height)] min-w-[var(--trigger-width)] overflow-auto border border-outline bg-chrome text-text"
      >
        {menu}
      </Popover>
    </MenuTrigger>
  );
}
