import type { ComponentType } from 'react';
import {
  categoryColours,
  type AccountView,
  type CategoryColour,
  type CategoryIcon,
  type PoolView,
} from '@allotr/shared';
import { categoryIconComponents, type IconProps } from '@/generated/icons';

// How a pool or an account looks (docs/domain.md "Look of pools and
// accounts"): the colour and icon the user stored, else the default every
// screen used before they could choose. A pool's default colour is the
// series at its place among the open pools; an account follows its pool; a
// debt is drawn in `negative`. Stored values never move other pools'
// defaults.

export type SeriesColour = CategoryColour;

/** The default series colour of the pool at `index` among the open pools. */
export function positionalColour(index: number): SeriesColour {
  return categoryColours[index % categoryColours.length] ?? 'series-1';
}

/** What a screen needs to draw a pool. */
export type PoolLook = Readonly<{
  colour: SeriesColour;
  /** Null shows the pool kind's own icon. */
  icon: CategoryIcon | null;
}>;

type Styled = Pick<PoolView, 'id' | 'archived' | 'colour' | 'icon'>;

/**
 * Each pool's look by id. Archived pools are not placed, so they take the
 * stored colour or the first series.
 */
export function poolLooks(
  pools: readonly Styled[],
): ReadonlyMap<string, PoolLook> {
  let place = 0;
  return new Map(
    pools.map((pool) => {
      const colour =
        pool.colour ?? (pool.archived ? 'series-1' : positionalColour(place));
      if (!pool.archived) place += 1;
      return [pool.id, { colour, icon: pool.icon }] as const;
    }),
  );
}

/** What a screen needs to draw an account. */
export type AccountLook = Readonly<{
  /** The stored colour, else the pool's, else `negative` for credit. */
  colour: SeriesColour | 'negative' | null;
  /** Null shows the kind's own icon. */
  icon: CategoryIcon | null;
}>;

/**
 * An account's look: its own colour or icon when stored. Otherwise the colour
 * is `negative` for credit and the pool's colour for the rest (null with no
 * pool), and the icon is the kind's.
 */
export function accountLook(
  account: Pick<AccountView, 'kind' | 'poolId' | 'colour' | 'icon'>,
  looks: ReadonlyMap<string, PoolLook>,
): AccountLook {
  const fallback =
    account.kind === 'liability'
      ? 'negative'
      : (looks.get(account.poolId)?.colour ?? null);
  return { colour: account.colour ?? fallback, icon: account.icon };
}

/** The stored icon's glyph, else `fallback`. */
export function glyph(
  icon: CategoryIcon | null,
  fallback: ComponentType<IconProps>,
): ComponentType<IconProps> {
  return icon === null ? fallback : categoryIconComponents[icon];
}
