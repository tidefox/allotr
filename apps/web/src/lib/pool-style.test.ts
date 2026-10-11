import { describe, expect, it } from 'vitest';
import { accountLook, glyph, poolLooks, positionalColour } from './pool-style';

const pool = (
  id: string,
  extra: {
    archived?: boolean;
    colour?: 'series-1' | 'series-7' | null;
    icon?: 'piggy-bank' | null;
  } = {},
) => ({
  id,
  archived: false,
  colour: null,
  icon: null,
  ...extra,
});

describe('positionalColour', () => {
  it('cycles the eight series', () => {
    expect(positionalColour(0)).toBe('series-1');
    expect(positionalColour(7)).toBe('series-8');
    expect(positionalColour(8)).toBe('series-1');
  });
});

describe('poolLooks', () => {
  it('colours open pools by place when nothing is stored', () => {
    const looks = poolLooks([pool('a'), pool('b'), pool('c')]);
    expect(looks.get('a')).toEqual({ colour: 'series-1', icon: null });
    expect(looks.get('b')).toEqual({ colour: 'series-2', icon: null });
    expect(looks.get('c')).toEqual({ colour: 'series-3', icon: null });
  });

  it('uses the stored colour and icon and leaves the others where they were', () => {
    const looks = poolLooks([
      pool('a'),
      pool('b', { colour: 'series-7', icon: 'piggy-bank' }),
      pool('c'),
    ]);
    expect(looks.get('b')).toEqual({ colour: 'series-7', icon: 'piggy-bank' });
    // c is still the third open pool.
    expect(looks.get('c')?.colour).toBe('series-3');
  });

  it('does not count archived pools in anyone place', () => {
    const looks = poolLooks([
      pool('a'),
      pool('gone', { archived: true }),
      pool('c'),
    ]);
    expect(looks.get('gone')?.colour).toBe('series-1');
    expect(looks.get('c')?.colour).toBe('series-2');
  });
});

describe('accountLook', () => {
  const looks = poolLooks([pool('a'), pool('b', { colour: 'series-7' })]);

  it('follows the pool and the kind when nothing is stored', () => {
    expect(
      accountLook(
        { kind: 'asset', poolId: 'b', colour: null, icon: null },
        looks,
      ),
    ).toEqual({ colour: 'series-7', icon: null });
  });

  it('draws credit in negative unless a colour is stored', () => {
    expect(
      accountLook(
        { kind: 'liability', poolId: 'a', colour: null, icon: null },
        looks,
      ).colour,
    ).toBe('negative');
    expect(
      accountLook(
        { kind: 'liability', poolId: 'a', colour: 'series-4', icon: 'wallet' },
        looks,
      ),
    ).toEqual({ colour: 'series-4', icon: 'wallet' });
  });

  it('has no colour without a pool', () => {
    expect(
      accountLook(
        { kind: 'asset', poolId: 'gone', colour: null, icon: null },
        looks,
      ).colour,
    ).toBeNull();
  });
});

describe('glyph', () => {
  const fallback = () => null;
  it('keeps the fallback without an icon and maps a stored key', () => {
    expect(glyph(null, fallback)).toBe(fallback);
    expect(glyph('piggy-bank', fallback)).not.toBe(fallback);
  });
});
