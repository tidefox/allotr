import type { ReactNode } from 'react';
import { AuthTile } from './auth/auth-tile.tsx';

/**
 * The router's error and not-found pages share the sign-in tile: a heading
 * and whatever the caller puts under it.
 */
export function AuthPlaceholder({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return <AuthTile title={title}>{children}</AuthTile>;
}
