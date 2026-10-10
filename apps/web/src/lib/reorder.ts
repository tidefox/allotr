/**
 * The order after dropping `keys` (kept in their current order) before or
 * after `target`. A drop onto the dragged rows themselves changes nothing.
 */
export function reorder(
  list: readonly string[],
  keys: ReadonlySet<string>,
  target: string,
  position: 'before' | 'after',
): string[] {
  if (keys.has(target)) return [...list];
  const moved = list.filter((id) => keys.has(id));
  const rest = list.filter((id) => !keys.has(id));
  const at = rest.indexOf(target);
  if (at < 0) return [...list];
  rest.splice(position === 'before' ? at : at + 1, 0, ...moved);
  return rest;
}
