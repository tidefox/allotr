import { describe, expect, it } from 'vitest';
import { autoSelection } from './auto-select.ts';

const state = {
  wide: true,
  selected: undefined,
  first: 'a1',
  context: 'all',
  done: null,
};

describe('autoSelection', () => {
  it('selects the first row on a wide frame with nothing selected', () => {
    expect(autoSelection(state)).toBe('a1');
  });

  it('never selects below the wide width, where a selection opens a sheet', () => {
    expect(autoSelection({ ...state, wide: false })).toBeUndefined();
  });

  it('keeps an existing selection', () => {
    expect(autoSelection({ ...state, selected: 'a2' })).toBeUndefined();
  });

  it('waits for a first row', () => {
    expect(autoSelection({ ...state, first: undefined })).toBeUndefined();
  });

  it('does not put back a selection that was cleared in the same context', () => {
    expect(autoSelection({ ...state, done: 'all' })).toBeUndefined();
  });

  it('selects again once the list context changes', () => {
    expect(autoSelection({ ...state, done: 'all', context: 'credit' })).toBe(
      'a1',
    );
  });
});
