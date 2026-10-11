import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import {
  Button,
  DropIndicator,
  GridList,
  GridListItem,
  useDragAndDrop,
} from 'react-aria-components';
import type { CategoryView, TagView } from '@allotr/shared';
import { SkeletonTile } from '@/components/bars';
import { BracketButton, Tag } from '@/components/buttons';
import { Grid, SectionTitle, Stack, Tile } from '@/components/layout';
import { MenuButton, MenuItem, MenuSeparator } from '@/components/menu';
import { Row } from '@/components/row';
import { CategoryIcon, EmptyState } from '@/components/states';
import {
  CATEGORY_KINDS,
  categoryTree,
  type CategoryKind,
} from '@/features/settings/categories-model';
import {
  IconAddLine,
  IconArrowDownSLine,
  IconArrowRightSLine,
  IconMore2Line,
  IconNodeTree,
} from '@/generated/icons';
import { budgetsQuery } from '@/lib/budgets';
import { formatMoney } from '@/lib/format-money';
import { cn } from '@/lib/utils';
import {
  categoryStyles,
  colourVar,
  seriesNumber,
  type CategoryStyle,
} from '@/lib/category-style';
import { categoriesQuery, tagsQuery } from '@/lib/ledger';
import { categoryQueryKeys, invalidate, updateCategory } from '@/lib/settings';
import { t } from '@/messages/t';
import { TileFailed } from '../dashboard/tiles/tile-failed.tsx';
import { reorder } from '@/lib/reorder';
import {
  categoryRows,
  positionChanges,
  siblingIds,
  stepOrder,
  withPositions,
  type CategoryRowModel,
} from './categories-layout-model.ts';
import {
  ArchiveSheet,
  CreateSheet,
  MoveSheet,
  RenameSheet,
  StyleSheet,
  TagSheet,
} from './category-sheets.tsx';

type Open =
  | Readonly<{
      sheet: 'create';
      kind: CategoryKind;
      parent: CategoryView | null;
    }>
  | Readonly<{
      sheet: 'rename' | 'style' | 'move';
      category: CategoryView;
    }>
  | Readonly<{ sheet: 'archive' | 'merge'; category: CategoryView }>
  | Readonly<{ sheet: 'tag'; tag: TagView | null }>;

// Categories (docs/ui.md §6): a tree per kind, with tags beside it. Drag a
// row (press and hold on touch) or use the arrows to reorder it among its
// siblings; everything else is in the row's menu. The server decides what
// is allowed; the page only groups rows and numbers siblings.
export function CategoriesTab() {
  const categories = useQuery(categoriesQuery);
  const tags = useQuery(tagsQuery);
  const budgets = useQuery(budgetsQuery);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Open | null>(null);
  // Positions shown while a reorder is being saved, so a move feels instant.
  const [pending, setPending] = useState<ReadonlyMap<string, number>>(
    new Map(),
  );
  const save = useMutation({
    mutationFn: (changes: readonly { id: string; position: number }[]) =>
      Promise.all(
        changes.map(({ id, position }) => updateCategory(id, { position })),
      ),
    onSettled: async () => {
      await invalidate(queryClient, categoryQueryKeys);
      setPending(new Map());
    },
  });
  const all = useMemo(
    () => withPositions(categories.data?.categories ?? [], pending),
    [categories.data, pending],
  );
  const styles = useMemo(() => categoryStyles(all), [all]);
  const tree = useMemo(() => categoryTree(all), [all]);

  if (categories.isError) {
    return (
      <Stack className="h-full">
        <Tile title={t('settingsCategories.title')}>
          <TileFailed
            retry={() => {
              void categories.refetch();
            }}
          />
        </Tile>
      </Stack>
    );
  }
  if (categories.data === undefined) {
    return (
      <Grid>
        <SkeletonTile span={2} rows={5} />
        <SkeletonTile rows={4} />
        <SkeletonTile rows={3} />
      </Grid>
    );
  }

  const reorderTo = (
    nodes: (typeof tree)[CategoryKind],
    category: CategoryView,
    order: readonly string[],
  ) => {
    const siblings = siblingIds(nodes, category)
      .map((id) => all.find((c) => c.id === id))
      .filter((c): c is CategoryView => c !== undefined);
    const changes = positionChanges(siblings, order);
    if (changes.length === 0) return;
    setPending(new Map(changes.map((c) => [c.id, c.position])));
    save.mutate(changes);
  };

  const total = CATEGORY_KINDS.reduce(
    (sum, kind) =>
      sum + tree[kind].reduce((n, node) => n + 1 + node.children.length, 0),
    0,
  );
  const parents = CATEGORY_KINDS.reduce(
    (sum, kind) =>
      sum + tree[kind].filter((node) => node.children.length > 0).length,
    0,
  );
  const budgetOf = new Map<string, string>();
  for (const budget of budgets.data?.budgets ?? []) {
    if (budget.target.kind === 'category')
      budgetOf.set(
        budget.target.categoryId,
        t('settingsCategories.budget', { amount: formatMoney(budget.amount) }),
      );
  }

  return (
    <>
      <Stack className="min-h-full">
        <Tile
          title={t('settingsCategories.title')}
          icon={IconNodeTree}
          subtitle={t('settingsCategories.count', { total, parents })}
          bodyClassName="px-0 pb-0"
          actions={
            <BracketButton
              icon={IconAddLine}
              onPress={() => {
                setOpen({ sheet: 'create', kind: 'expense', parent: null });
              }}
            >
              {t('settingsCategories.add')}
            </BracketButton>
          }
        >
          <p className="px-3 pt-2 pb-2 font-ui text-text-muted">
            {t('settingsCategories.hint')}
          </p>
          {CATEGORY_KINDS.map((kind) => (
            <KindList
              key={kind}
              kind={kind}
              nodes={tree[kind]}
              styles={styles}
              budgetOf={budgetOf}
              failed={save.isError}
              onOpen={setOpen}
              onReorder={reorderTo}
            />
          ))}
        </Tile>
        <TagsTile
          tags={tags.data?.tags}
          failed={tags.isError}
          retry={() => {
            void tags.refetch();
          }}
          onOpen={setOpen}
        />
      </Stack>
      {open === null ? null : (
        <Sheets
          open={open}
          categories={all}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
    </>
  );
}

function Sheets({
  open,
  categories,
  onClose,
}: {
  open: Open;
  categories: readonly CategoryView[];
  onClose: () => void;
}) {
  switch (open.sheet) {
    case 'create':
      return (
        <CreateSheet kind={open.kind} parent={open.parent} onClose={onClose} />
      );
    case 'rename':
      return <RenameSheet category={open.category} onClose={onClose} />;
    case 'style':
      return <StyleSheet category={open.category} onClose={onClose} />;
    case 'move':
      return (
        <MoveSheet
          category={open.category}
          categories={categories}
          onClose={onClose}
        />
      );
    case 'archive':
    case 'merge':
      return (
        <ArchiveSheet
          category={open.category}
          categories={categories}
          mode={open.sheet}
          onClose={onClose}
        />
      );
    case 'tag':
      return <TagSheet tag={open.tag} onClose={onClose} />;
  }
}

function KindList({
  kind,
  nodes,
  styles,
  budgetOf,
  failed,
  onOpen,
  onReorder,
}: {
  kind: CategoryKind;
  nodes: ReturnType<typeof categoryTree>[CategoryKind];
  styles: ReadonlyMap<string, CategoryStyle>;
  budgetOf: ReadonlyMap<string, string>;
  failed: boolean;
  onOpen: (open: Open) => void;
  onReorder: (
    nodes: ReturnType<typeof categoryTree>[CategoryKind],
    category: CategoryView,
    order: readonly string[],
  ) => void;
}) {
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set());
  const rows = categoryRows(nodes, folded);
  const byId = new Map(rows.map((row) => [row.category.id, row]));
  // The group of the row being dragged: a drop is only offered among its
  // siblings, as the order is per parent.
  const dragging = useRef<string | null>(null);
  const toggle = (id: string) => {
    setFolded((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };
  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) => [...keys].map((key) => ({ 'text/plain': String(key) })),
    onDragStart: (event) => {
      const [key] = [...event.keys];
      dragging.current =
        key === undefined ? null : (byId.get(String(key))?.group ?? null);
    },
    onDragEnd: () => {
      dragging.current = null;
    },
    getDropOperation: (target) =>
      target.type === 'item' &&
      target.dropPosition !== 'on' &&
      byId.get(String(target.key))?.group === dragging.current
        ? 'move'
        : 'cancel',
    renderDropIndicator: (target) => (
      <DropIndicator
        target={target}
        className="h-0 data-[drop-target]:h-0.5 data-[drop-target]:bg-primary"
      />
    ),
    onReorder: (event) => {
      const target = byId.get(String(event.target.key));
      const [key] = [...event.keys];
      const moved = key === undefined ? undefined : byId.get(String(key));
      if (target === undefined || moved === undefined) return;
      if (target.group !== moved.group) return;
      onReorder(
        nodes,
        moved.category,
        reorder(
          siblingIds(nodes, moved.category),
          new Set([moved.category.id]),
          target.category.id,
          event.target.dropPosition === 'before' ? 'before' : 'after',
        ),
      );
    },
  });

  return (
    <>
      {kind === 'expense' ? null : (
        <div className="flex items-center justify-between gap-2 border-t px-3">
          <SectionTitle>{t(`settingsCategories.kinds.${kind}`)}</SectionTitle>
          <BracketButton
            icon={IconAddLine}
            onPress={() => {
              onOpen({ sheet: 'create', kind, parent: null });
            }}
          >
            {t('settingsCategories.add')}
          </BracketButton>
        </div>
      )}
      {rows.length === 0 ? (
        <EmptyState
          title={t('settingsCategories.none')}
          hint={t('settingsCategories.noneHint')}
        />
      ) : (
        <>
          <GridList
            aria-label={t(`settingsCategories.lists.${kind}`)}
            selectionMode="none"
            keyboardNavigationBehavior="tab"
            dragAndDropHooks={dragAndDropHooks}
          >
            {rows.map((row) => (
              <GridListItem
                key={row.category.id}
                id={row.category.id}
                textValue={row.category.name}
                className="outline-none focus-visible:bg-card data-[dragging]:bg-card"
              >
                <CategoryRow
                  row={row}
                  style={styles.get(row.category.id)}
                  budget={
                    row.role === 'parent' && row.foldable
                      ? t('settingsCategories.rollsUp')
                      : (budgetOf.get(row.category.id) ?? '—')
                  }
                  subCount={
                    row.role === 'parent'
                      ? (nodes.find((n) => n.category.id === row.category.id)
                          ?.children.length ?? 0)
                      : 0
                  }
                  nodes={nodes}
                  folded={folded.has(row.category.id)}
                  onToggle={() => {
                    toggle(row.category.id);
                  }}
                  onOpen={onOpen}
                  onReorder={onReorder}
                />
              </GridListItem>
            ))}
          </GridList>
          {failed ? (
            <p role="alert" className="px-3 py-2 text-small text-negative">
              {t('settingsCategories.saveFailed')}
            </p>
          ) : null}
        </>
      )}
    </>
  );
}

const rowColumns = [
  { width: '1.5rem' },
  { width: '1.125rem' },
  { width: 'minmax(0,1fr)' },
  { width: '14ch', from: 'medium' },
  { width: 'auto' },
  { width: 'auto' },
] as const;

function CategoryRow({
  row,
  style,
  budget,
  subCount,
  nodes,
  folded,
  onToggle,
  onOpen,
  onReorder,
}: {
  row: CategoryRowModel;
  style: CategoryStyle | undefined;
  budget: string;
  subCount: number;
  nodes: ReturnType<typeof categoryTree>[CategoryKind];
  folded: boolean;
  onToggle: () => void;
  onOpen: (open: Open) => void;
  onReorder: (
    nodes: ReturnType<typeof categoryTree>[CategoryKind],
    category: CategoryView,
    order: readonly string[],
  ) => void;
}) {
  const { category } = row;
  const order = siblingIds(nodes, category);
  const up = stepOrder(order, category.id, -1);
  const down = stepOrder(order, category.id, 1);
  const parent = row.role === 'parent';
  const lead = parent ? (
    row.foldable ? (
      <button
        type="button"
        aria-label={t('settingsCategories.foldOf', { name: category.name })}
        aria-expanded={!folded}
        onClick={onToggle}
        className="flex size-hit items-center justify-center text-text-muted"
      >
        {folded ? (
          <IconArrowRightSLine className="size-4" />
        ) : (
          <IconArrowDownSLine className="size-4" />
        )}
      </button>
    ) : null
  ) : (
    <span aria-hidden="true" className="block w-6 text-center text-outline">
      {row.role === 'last-child' ? '└' : '├'}
    </span>
  );
  const icon =
    style?.icon === null || style === undefined ? (
      <span
        aria-hidden="true"
        className="block size-2 shrink-0"
        style={{ backgroundColor: colourVar(style?.colour ?? 'series-1') }}
      />
    ) : (
      <CategoryIcon name={style.icon} color={seriesNumber(style.colour)} />
    );
  const name = (
    <span className="flex min-w-0 items-center gap-2">
      {/* Keyboard and screen reader users pick a row up with this; it shows
          only while it has focus, so there is no drag handle to see. */}
      <Button
        slot="drag"
        className="sr-only focus-visible:not-sr-only focus-visible:text-small focus-visible:text-primary"
      >
        ⠿
      </Button>
      <span className={cn('truncate font-ui', parent && 'font-semibold')}>
        {category.name}
        {parent && subCount > 0 ? (
          <span className="font-normal text-text-muted">
            {' '}
            {t('settingsCategories.subCount', { count: subCount })}
          </span>
        ) : null}
      </span>
      {category.isPaycheck ? (
        <Tag>{t('settingsCategories.paycheckTag')}</Tag>
      ) : null}
    </span>
  );
  const addSub = parent ? (
    <BracketButton
      icon={IconAddLine}
      aria-label={t('settingsCategories.addSubOf', { name: category.name })}
      onPress={() => {
        onOpen({ sheet: 'create', kind: category.kind, parent: category });
      }}
    >
      {t('settingsCategories.addSub')}
    </BracketButton>
  ) : null;
  const menu = (
    <MenuButton
      variant="bracket"
      icon={IconMore2Line}
      label={t('settingsCategories.actionsOf', { name: category.name })}
      title={category.name}
    >
      <MenuItem
        id="rename"
        label={t('settingsCategories.menu.rename')}
        onAction={() => {
          onOpen({ sheet: 'rename', category });
        }}
      />
      <MenuItem
        id="style"
        label={t('settingsCategories.menu.style')}
        onAction={() => {
          onOpen({ sheet: 'style', category });
        }}
      />
      <MenuSeparator />
      <MenuItem
        id="up"
        label={t('settingsCategories.menu.moveUp')}
        onAction={() => {
          if (up !== null) onReorder(nodes, category, up);
        }}
      />
      <MenuItem
        id="down"
        label={t('settingsCategories.menu.moveDown')}
        onAction={() => {
          if (down !== null) onReorder(nodes, category, down);
        }}
      />
      <MenuItem
        id="move"
        label={t('settingsCategories.menu.move')}
        onAction={() => {
          onOpen({ sheet: 'move', category });
        }}
      />
      <MenuSeparator />
      <MenuItem
        id="merge"
        label={t('settingsCategories.menu.merge')}
        onAction={() => {
          onOpen({ sheet: 'merge', category });
        }}
      />
      <MenuItem
        id="archive"
        destructive
        label={t('settingsCategories.menu.archive')}
        onAction={() => {
          onOpen({ sheet: 'archive', category });
        }}
      />
    </MenuButton>
  );
  return (
    <Row
      columns={rowColumns}
      cells={[
        lead,
        icon,
        name,
        <span key="budget" className="text-text-muted">
          {budget}
        </span>,
        addSub,
        menu,
      ]}
    />
  );
}

function TagsTile({
  tags,
  failed,
  retry,
  onOpen,
}: {
  tags: readonly TagView[] | undefined;
  failed: boolean;
  retry: () => void;
  onOpen: (open: Open) => void;
}) {
  return (
    <Tile
      title={t('settingsCategories.tags.title')}
      subtitle={t('settingsCategories.tags.subtitle')}
      bodyClassName="px-0 pb-0"
      actions={
        <BracketButton
          onPress={() => {
            onOpen({ sheet: 'tag', tag: null });
          }}
        >
          {t('settingsCategories.tags.add')}
        </BracketButton>
      }
    >
      {failed ? (
        <TileFailed retry={retry} />
      ) : tags === undefined ? null : tags.length === 0 ? (
        <EmptyState
          title={t('settingsCategories.tags.none')}
          hint={t('settingsCategories.tags.noneHint')}
        />
      ) : (
        <div role="list" aria-label={t('settingsCategories.tags.list')}>
          {tags.map((tag) => (
            <div key={tag.id} role="listitem">
              <Row
                columns={[{ width: 'minmax(0,1fr)' }, { width: 'auto' }]}
                cells={[
                  <span key="n" className="font-sans">
                    {tag.name}
                  </span>,
                  <BracketButton
                    key="r"
                    aria-label={t('settingsCategories.tags.renameOf', {
                      name: tag.name,
                    })}
                    onPress={() => {
                      onOpen({ sheet: 'tag', tag });
                    }}
                  >
                    {t('settingsCategories.tags.rename')}
                  </BracketButton>,
                ]}
              />
            </div>
          ))}
        </div>
      )}
    </Tile>
  );
}
