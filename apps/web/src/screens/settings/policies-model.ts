// Pure helpers for the Policies tab.

/** A whole number within bounds from typed text, or null. */
export function parseWhole(
  text: string,
  min: number,
  max: number,
): number | null {
  const value = text.trim();
  if (!/^\d{1,6}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/** Tag names as the server stores them: trimmed, 1 to 100 characters. */
export function parseTagName(text: string): string | null {
  const name = text.trim();
  return name === '' || name.length > 100 ? null : name;
}
