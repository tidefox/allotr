import type { ReactNode } from 'react';

// The text field and choice menu moved to `@/components/form-fields`; they are
// re-exported here so existing imports keep working.
export { ChoiceField, TextField } from '@/components/form-fields';
export type { Choice } from '@/components/form-fields';

export function FormRow({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 items-end gap-2">{children}</div>;
}
