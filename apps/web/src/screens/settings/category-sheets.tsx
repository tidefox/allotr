import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type SyntheticEvent } from 'react';
import {
  incomeClassSchema,
  type CategoryColour,
  type CategoryIcon as CategoryIconKey,
  type CategoryView,
  type IncomeClass,
  type TagView,
} from '@allotr/shared';
import {
  BracketButton,
  PrimaryButton,
  ToggleGroup,
} from '@/components/buttons';
import { Sheet } from '@/components/sheet';
import { ColourField, IconField } from '@/components/style-fields';
import {
  mergeTargets,
  type CategoryKind,
} from '@/features/settings/categories-model';
import { ApiError } from '@/lib/api';
import { describeProblem } from '@/lib/problem';
import {
  categoryQueryKeys,
  createCategory,
  createTag,
  deleteCategory,
  invalidate,
  renameTag,
  tagQueryKeys,
  updateCategory,
} from '@/lib/settings';
import { t } from '@/messages/t';
import { ChoiceField, TextField } from '../transactions/detail/fields.tsx';
import { lastPosition, moveParents } from './categories-layout-model.ts';

const MAX_NAME = 100;
const TOP = '__top';

function useWrite<A, R>(
  run: (args: A) => Promise<R>,
  keys: typeof categoryQueryKeys | typeof tagQueryKeys,
  onDone: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: async () => {
      await invalidate(queryClient, keys);
      onDone();
    },
  });
}

function Actions({
  onCancel,
  pending,
  label,
  working,
  disabled = false,
}: {
  onCancel: () => void;
  pending: boolean;
  label: string;
  working: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <BracketButton onPress={onCancel}>
        {t('settingsCategories.cancel')}
      </BracketButton>
      <PrimaryButton type="submit" isDisabled={pending || disabled}>
        {pending ? working : label}
      </PrimaryButton>
    </div>
  );
}

function Failure({ message }: { message: string | null }) {
  return message === null ? null : (
    <p role="alert" className="text-small text-negative">
      {message}
    </p>
  );
}

function CategorySheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={title}
      closeLabel={t('quickEntry.close')}
    >
      {children}
    </Sheet>
  );
}

function validName(value: string): string | undefined {
  if (value === '') return t('settingsCategories.create.nameRequired');
  if (value.length > MAX_NAME) return t('settingsCategories.create.nameLong');
  return undefined;
}

/**
 * What an income category is: earned and passive income count as earnings,
 * gifts and refunds are other inflows. Not offered for a paycheck category,
 * which is always earned.
 */
function IncomeClassField({
  value,
  onChange,
}: {
  value: IncomeClass;
  onChange: (value: IncomeClass) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ToggleGroup
        label={t('settingsCategories.create.incomeClass')}
        options={incomeClassSchema.options.map((id) => ({
          id,
          label: t(`settingsCategories.incomeClasses.${id}`),
        }))}
        value={value}
        onChange={onChange}
        className="flex-wrap self-start"
      />
      <p className="font-sans text-small text-text-muted">
        {t('settingsCategories.create.incomeClass')}
        {': '}
        {t('settingsCategories.create.incomeClassHint')}
      </p>
    </div>
  );
}

/** A new top-level category of a kind, or a subcategory of a parent. */
export function CreateSheet({
  kind,
  parent,
  onClose,
}: {
  kind: CategoryKind;
  parent: CategoryView | null;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [paycheck, setPaycheck] = useState<'yes' | 'no'>('no');
  const [incomeClass, setIncomeClass] = useState<IncomeClass>(
    parent?.incomeClass ?? 'earned',
  );
  const [error, setError] = useState<string | undefined>();
  const save = useWrite(createCategory, categoryQueryKeys, onClose);
  const problem = save.isError ? describeProblem(save.error) : null;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const value = name.trim();
    const invalid = validName(value);
    setError(invalid);
    if (invalid !== undefined) return;
    save.mutate({
      name: value,
      ...(parent === null ? { kind } : { parentId: parent.id }),
      isPaycheck: kind === 'income' && paycheck === 'yes',
      ...(kind === 'income' && paycheck === 'no' ? { incomeClass } : {}),
    });
  };
  return (
    <CategorySheet
      title={
        parent === null
          ? t('settingsCategories.create.title', {
              kind: t(`settingsCategories.kinds.${kind}`).toLowerCase(),
            })
          : t('settingsCategories.create.titleSub', { name: parent.name })
      }
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <TextField
          label={t('settingsCategories.create.name')}
          value={name}
          onChange={setName}
          error={error ?? problem?.fields.name}
          autoFocus
        />
        {kind === 'income' ? (
          <div className="flex flex-col gap-1">
            <ToggleGroup
              label={t('settingsCategories.create.paycheck')}
              options={[
                { id: 'no', label: t('settingsCategories.create.paycheckNo') },
                {
                  id: 'yes',
                  label: t('settingsCategories.create.paycheckYes'),
                },
              ]}
              value={paycheck}
              onChange={setPaycheck}
              className="self-start"
            />
            <p className="font-sans text-small text-text-muted">
              {t('settingsCategories.create.paycheck')}
              {': '}
              {t('settingsCategories.create.paycheckHint')}
            </p>
          </div>
        ) : null}
        {kind === 'income' && paycheck === 'no' ? (
          <IncomeClassField value={incomeClass} onChange={setIncomeClass} />
        ) : null}
        <Failure
          message={
            problem === null ? null : t('settingsCategories.create.failed')
          }
        />
        <Actions
          onCancel={onClose}
          pending={save.isPending}
          label={t('settingsCategories.create.save')}
          working={t('settingsCategories.create.saving')}
        />
      </form>
    </CategorySheet>
  );
}

/** Renames a category; an income one also says whether it is the paycheck. */
export function RenameSheet({
  category,
  onClose,
}: {
  category: CategoryView;
  onClose: () => void;
}) {
  const [name, setName] = useState(category.name);
  const [paycheck, setPaycheck] = useState<'yes' | 'no'>(
    category.isPaycheck ? 'yes' : 'no',
  );
  const [incomeClass, setIncomeClass] = useState<IncomeClass>(
    category.incomeClass,
  );
  const [error, setError] = useState<string | undefined>();
  const save = useWrite(
    (body: {
      name?: string;
      isPaycheck?: boolean;
      incomeClass?: IncomeClass;
    }) => updateCategory(category.id, body),
    categoryQueryKeys,
    onClose,
  );
  const problem = save.isError ? describeProblem(save.error) : null;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const value = name.trim();
    const invalid = validName(value);
    setError(invalid);
    if (invalid !== undefined) return;
    const isPaycheck = paycheck === 'yes';
    // A paycheck category is always earned; the server sets that itself.
    const nextClass = isPaycheck ? category.incomeClass : incomeClass;
    if (
      value === category.name &&
      isPaycheck === category.isPaycheck &&
      nextClass === category.incomeClass
    ) {
      onClose();
      return;
    }
    save.mutate({
      ...(value === category.name ? {} : { name: value }),
      ...(isPaycheck === category.isPaycheck ? {} : { isPaycheck }),
      ...(isPaycheck || nextClass === category.incomeClass
        ? {}
        : { incomeClass: nextClass }),
    });
  };
  return (
    <CategorySheet
      title={t('settingsCategories.rename.title', { name: category.name })}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <TextField
          label={t('settingsCategories.create.name')}
          value={name}
          onChange={setName}
          error={error ?? problem?.fields.name}
          autoFocus
        />
        {category.kind === 'income' ? (
          <div className="flex flex-col gap-1">
            <ToggleGroup
              label={t('settingsCategories.create.paycheck')}
              options={[
                { id: 'no', label: t('settingsCategories.create.paycheckNo') },
                {
                  id: 'yes',
                  label: t('settingsCategories.create.paycheckYes'),
                },
              ]}
              value={paycheck}
              onChange={setPaycheck}
              className="self-start"
            />
            <p className="font-sans text-small text-text-muted">
              {t('settingsCategories.create.paycheck')}
              {': '}
              {t('settingsCategories.create.paycheckHint')}
            </p>
          </div>
        ) : null}
        {category.kind === 'income' && paycheck === 'no' ? (
          <IncomeClassField value={incomeClass} onChange={setIncomeClass} />
        ) : null}
        <Failure
          message={
            problem === null ? null : t('settingsCategories.rename.failed')
          }
        />
        <Actions
          onCancel={onClose}
          pending={save.isPending}
          label={t('settingsCategories.rename.save')}
          working={t('settingsCategories.rename.saving')}
        />
      </form>
    </CategorySheet>
  );
}

/** The icon and colour of a category; either can be cleared back to auto. */
export function StyleSheet({
  category,
  onClose,
}: {
  category: CategoryView;
  onClose: () => void;
}) {
  const [colour, setColour] = useState(category.colour);
  const [icon, setIcon] = useState(category.icon);
  const save = useWrite(
    (body: { colour?: CategoryColour | null; icon?: CategoryIconKey | null }) =>
      updateCategory(category.id, body),
    categoryQueryKeys,
    onClose,
  );
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (colour === category.colour && icon === category.icon) {
      onClose();
      return;
    }
    save.mutate({
      ...(colour === category.colour ? {} : { colour }),
      ...(icon === category.icon ? {} : { icon }),
    });
  };
  return (
    <CategorySheet
      title={t('settingsCategories.style.title', { name: category.name })}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <ColourField value={colour} onChange={setColour} />
        <p className="font-sans text-small text-text-muted">
          {t('settingsCategories.style.colourHint')}
        </p>
        <IconField value={icon} colour={colour} onChange={setIcon} />
        <Failure
          message={save.isError ? t('settingsCategories.style.failed') : null}
        />
        <Actions
          onCancel={onClose}
          pending={save.isPending}
          label={t('settingsCategories.style.save')}
          working={t('settingsCategories.style.saving')}
        />
      </form>
    </CategorySheet>
  );
}

/** Moves a category under another top-level one of its kind, or to the top. */
export function MoveSheet({
  category,
  categories,
  onClose,
}: {
  category: CategoryView;
  categories: readonly CategoryView[];
  onClose: () => void;
}) {
  const parents = moveParents(category, categories);
  const hasChildren = categories.some(
    (c) => c.parentId === category.id && c.mergedIntoId === null,
  );
  const choices = [
    ...(category.parentId === null
      ? []
      : [{ id: TOP, label: t('settingsCategories.move.topLevel') }]),
    ...parents.map((p) => ({ id: p.id, label: p.name })),
  ];
  const [target, setTarget] = useState('');
  const save = useWrite(
    (parentId: string | null) =>
      updateCategory(category.id, {
        parentId,
        position: lastPosition(categories, parentId, category.kind),
      }),
    categoryQueryKeys,
    onClose,
  );
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (target === '') return;
    save.mutate(target === TOP ? null : target);
  };
  const problem = save.isError ? describeProblem(save.error) : null;
  return (
    <CategorySheet
      title={t('settingsCategories.move.title', { name: category.name })}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-sans text-small text-text-muted">
          {hasChildren
            ? t('settingsCategories.move.hasChildren')
            : choices.length === 0
              ? t('settingsCategories.move.noParents')
              : t('settingsCategories.move.intro')}
        </p>
        {choices.length === 0 ? null : (
          <ChoiceField
            label={t('settingsCategories.move.under')}
            value={target}
            choices={choices}
            placeholder={t('settingsCategories.move.choose')}
            onChange={setTarget}
          />
        )}
        <Failure message={problem?.message ?? null} />
        <Actions
          onCancel={onClose}
          pending={save.isPending}
          disabled={target === ''}
          label={t('settingsCategories.move.save')}
          working={t('settingsCategories.move.saving')}
        />
      </form>
    </CategorySheet>
  );
}

/**
 * Archives a category, or merges it into another. Entries keep pointing at
 * a merged category, so one that entries use has to name where they go; the
 * server says so with `category_in_use` and the sheet then asks.
 */
export function ArchiveSheet({
  category,
  categories,
  mode,
  onClose,
}: {
  category: CategoryView;
  categories: readonly CategoryView[];
  mode: 'archive' | 'merge';
  onClose: () => void;
}) {
  const [asking, setAsking] = useState(mode === 'merge');
  const [inUse, setInUse] = useState(false);
  const [target, setTarget] = useState('');
  const [missing, setMissing] = useState(false);
  const targets = mergeTargets(category, categories);
  const hasChildren = categories.some(
    (c) => c.parentId === category.id && c.mergedIntoId === null,
  );
  const remove = useWrite(
    (mergeInto: string | undefined) => deleteCategory(category.id, mergeInto),
    categoryQueryKeys,
    onClose,
  );
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!asking) {
      remove.mutate(undefined, {
        onError: (error) => {
          if (
            error instanceof ApiError &&
            error.problem.code === 'category_in_use'
          ) {
            remove.reset();
            setInUse(true);
            setAsking(true);
          }
        },
      });
      return;
    }
    if (target === '') {
      setMissing(true);
      return;
    }
    remove.mutate(target);
  };
  const problem = remove.isError ? describeProblem(remove.error) : null;
  return (
    <CategorySheet
      title={t(
        mode === 'merge'
          ? 'settingsCategories.archive.mergeTitle'
          : 'settingsCategories.archive.title',
        { name: category.name },
      )}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <p className="font-sans text-small text-text-muted">
          {hasChildren
            ? t('settingsCategories.archive.hasChildren')
            : inUse
              ? t('settingsCategories.archive.inUse', { name: category.name })
              : asking
                ? t('settingsCategories.archive.mergeIntro')
                : t('settingsCategories.archive.intro')}
        </p>
        {!asking || hasChildren ? null : targets.length === 0 ? (
          <p className="font-sans text-small">
            {t('settingsCategories.archive.noTargets', {
              kind: t(
                `settingsCategories.kinds.${category.kind}`,
              ).toLowerCase(),
            })}
          </p>
        ) : (
          <ChoiceField
            label={t('settingsCategories.archive.into')}
            value={target}
            choices={targets}
            placeholder={t('settingsCategories.archive.choose')}
            onChange={(id) => {
              setTarget(id);
              setMissing(false);
            }}
            error={
              missing ? t('settingsCategories.archive.chooseTarget') : undefined
            }
          />
        )}
        <Failure
          message={
            problem === null ? null : t('settingsCategories.archive.failed')
          }
        />
        <Actions
          onCancel={onClose}
          pending={remove.isPending}
          disabled={hasChildren || (asking && targets.length === 0)}
          label={t(
            asking
              ? 'settingsCategories.archive.merge'
              : 'settingsCategories.archive.archive',
          )}
          working={t('settingsCategories.archive.working')}
        />
      </form>
    </CategorySheet>
  );
}

/** Adds a tag, or renames one. */
export function TagSheet({
  tag,
  onClose,
}: {
  tag: TagView | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(tag?.name ?? '');
  const [error, setError] = useState<string | undefined>();
  const save = useWrite(
    (value: string) =>
      tag === null ? createTag(value) : renameTag(tag.id, value),
    tagQueryKeys,
    onClose,
  );
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const value = name.trim();
    const invalid = validName(value);
    setError(invalid);
    if (invalid !== undefined) return;
    if (tag !== null && value === tag.name) {
      onClose();
      return;
    }
    save.mutate(value);
  };
  return (
    <CategorySheet
      title={
        tag === null
          ? t('settingsCategories.tags.newTitle')
          : t('settingsCategories.tags.renameTitle', { name: tag.name })
      }
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 p-3">
        <TextField
          label={t('settingsCategories.tags.name')}
          value={name}
          onChange={setName}
          error={error}
          autoFocus
        />
        <Failure
          message={save.isError ? t('settingsCategories.tags.failed') : null}
        />
        <Actions
          onCancel={onClose}
          pending={save.isPending}
          label={t('settingsCategories.tags.save')}
          working={t('settingsCategories.tags.saving')}
        />
      </form>
    </CategorySheet>
  );
}
