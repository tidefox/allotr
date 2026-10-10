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
import { Grid, Stack, Tile } from '@/components/layout';
import { MenuButton, MenuItem, MenuSeparator } from '@/components/menu';
import { Row, TreeRow } from '@/components/row';
import { CategoryIcon, EmptyState } from '@/components/states';
import {
  CATEGORY_KINDS,
  categoryTree,
  type CategoryKind,
} from '@/features/settings/categories-model';
import { IconMore2Line } from '@/generated/icons';
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
import { reorder } from '../budget/cover-order-model.ts';
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

const columns = [
  { width: 'minmax(0,1fr)' },
  { width: '4.5rem' },
  { width: '5rem', from: 'medium' },
  { width: '2rem' },
] as const;

// Categories (docs/ui.md §6): a tree per kind, with tags beside it. Drag a
// row (press and hold on touch) or use the arrows to reorder it among its
// siblings; everything else is in the row's menu. The server decides what
// is allowed; the page only groups rows and numbers siblings.
export function CategoriesTab() {
  const categories = useQuery(categoriesQuery);
  const tags = useQuery(tagsQuery);
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
        <Tile title={t('settingsCategories.tiles.expense.title')}>
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

  return (
    <>
      <Grid>
        {CATEGORY_KINDS.map((kind) => (
          <KindTile
            key={kind}
            kind={kind}
            nodes={tree[kind]}
            styles={styles}
            failed={save.isError}
            onOpen={setOpen}
            onReorder={reorderTo}
          />
        ))}
        <TagsTile
          tags={tags.data?.tags}
          failed={tags.isError}
          retry={() => {
            void tags.refetch();
          }}
          onOpen={setOpen}
        />
      </Grid>
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

function KindTile({
  kind,
  nodes,
  styles,
  failed,
  onOpen,
  onReorder,
}: {
  kind: CategoryKind;
  nodes: ReturnType<typeof categoryTree>[CategoryKind];
  styles: ReadonlyMap<string, CategoryStyle>;
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
    <Tile
      title={t(`settingsCategories.tiles.${kind}.title`)}
      subtitle={t(`settingsCategories.tiles.${kind}.subtitle`)}
      span={kind === 'expense' ? 2 : 1}
      bodyClassName="px-0 pb-0"
      actions={
        <BracketButton
          onPress={() => {
            onOpen({ sheet: 'create', kind, parent: null });
          }}
        >
          {t('settingsCategories.add')}
        </BracketButton>
      }
    >
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
          <p className="px-3 py-2 font-sans text-small text-text-muted">
            {t('settingsCategories.hint')}
          </p>
          {failed ? (
            <p role="alert" className="px-3 pb-2 text-small text-negative">
              {t('settingsCategories.saveFailed')}
            </p>
          ) : null}
        </>
      )}
    </Tile>
  );
}

function CategoryRow({
  row,
  style,
  nodes,
  folded,
  onToggle,
  onOpen,
  onReorder,
}: {
  row: CategoryRowModel;
  style: CategoryStyle | undefined;
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
      {style?.icon === null || style === undefined ? (
        <span
          aria-hidden="true"
          className="size-2 shrink-0"
          style={{
            backgroundColor: colourVar(style?.colour ?? 'series-1'),
          }}
        />
      ) : (
        <CategoryIcon name={style.icon} color={seriesNumber(style.colour)} />
      )}
      <span className="truncate font-sans">{category.name}</span>
      {category.isPaycheck ? (
        <Tag>{t('settingsCategories.paycheckTag')}</Tag>
      ) : null}
    </span>
  );
  const addSub =
    row.role === 'parent' ? (
      <BracketButton
        aria-label={t('settingsCategories.addSubOf', { name: category.name })}
        onPress={() => {
          onOpen({ sheet: 'create', kind: category.kind, parent: category });
        }}
      >
        {t('settingsCategories.addSub')}
      </BracketButton>
    ) : null;
  const arrows = (
    <span className="flex items-center justify-end">
      <BracketButton
        aria-label={t('settingsCategories.up', { name: category.name })}
        isDisabled={up === null}
        onPress={() => {
          if (up !== null) onReorder(nodes, category, up);
        }}
      >
        ↑
      </BracketButton>
      <BracketButton
        aria-label={t('settingsCategories.down', { name: category.name })}
        isDisabled={down === null}
        onPress={() => {
          if (down !== null) onReorder(nodes, category, down);
        }}
      >
        ↓
      </BracketButton>
    </span>
  );
  const menu = (
    <MenuButton
      iconOnly
      icon={IconMore2Line}
      label={t('settingsCategories.actionsOf', { name: category.name })}
      title={category.name}
      className="size-8 justify-center"
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
  const cells = [name, addSub, arrows, menu];
  if (row.role === 'parent' && !row.foldable) {
    // Nothing to fold: an empty lead keeps the names aligned.
    return (
      <Row
        columns={[{ width: '1.5rem' }, ...columns]}
        cells={[
          null,
          <strong key="n" className="font-semibold">
            {name}
          </strong>,
          addSub,
          arrows,
          menu,
        ]}
      />
    );
  }
  return (
    <TreeRow
      role={row.role}
      expanded={!folded}
      onToggle={onToggle}
      label={t('settingsCategories.foldOf', { name: category.name })}
      columns={columns}
      cells={cells}
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
