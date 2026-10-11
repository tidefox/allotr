import type { ComponentType } from 'react';
import type { CategoryIcon } from '@allotr/shared';
import { categoryIconComponents, type IconProps } from '@/generated/icons';

/** The stored icon key as a Remix glyph, else `fallback`. */
export function Glyph({
  icon,
  fallback: Fallback,
  ...props
}: IconProps & {
  icon: CategoryIcon | null;
  fallback: ComponentType<IconProps>;
}) {
  if (icon === null) return <Fallback {...props} />;
  const Icon = categoryIconComponents[icon];
  return <Icon {...props} />;
}
