import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// The text scale in styles.css replaces Tailwind's sizes. tailwind-merge
// must know these names are sizes, or it reads `text-small` as a colour and
// drops it when a colour such as `text-text-muted` follows.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: [
        'base',
        'small',
        'tiny',
        'big',
        'stat',
        'stat-sub',
        'hero',
        'hero-sub',
        'pulse',
        'title',
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
