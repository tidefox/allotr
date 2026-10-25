import { describe, expect, it } from 'vitest';
import { scrollToShow, stripEdges } from './strip-overflow.ts';

describe('stripEdges', () => {
  it('shows nothing when every tab fits', () => {
    expect(stripEdges(0, 390, 390)).toEqual({ start: false, end: false });
  });

  it('marks the end while tabs are hidden to the right', () => {
    expect(stripEdges(0, 300, 520)).toEqual({ start: false, end: true });
  });

  it('marks both edges in the middle and only the start at the end', () => {
    expect(stripEdges(100, 300, 520)).toEqual({ start: true, end: true });
    expect(stripEdges(220, 300, 520)).toEqual({ start: true, end: false });
  });

  it('ignores a pixel of rounding', () => {
    expect(stripEdges(0.5, 300, 300.5)).toEqual({ start: false, end: false });
  });
});

describe('scrollToShow', () => {
  it('leaves the scroll alone when the tab is in view', () => {
    expect(scrollToShow(50, 300, 100, 80)).toBe(50);
  });

  it('scrolls left to a tab hidden before the start', () => {
    expect(scrollToShow(200, 300, 120, 80)).toBe(120);
  });

  it('scrolls right just far enough to show a tab hidden after the end', () => {
    expect(scrollToShow(0, 300, 280, 100)).toBe(80);
  });

  it('lines a tab wider than the strip up with its start', () => {
    expect(scrollToShow(0, 100, 150, 200)).toBe(150);
  });
});
