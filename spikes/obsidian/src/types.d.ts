// Ambient declarations for the pieces the spike imports without types.
declare module 'sql.js/dist/sql-wasm-browser.js' {
  import type { SqlJsStatic, SqlJsConfig } from 'sql.js';
  const init: (config?: SqlJsConfig) => Promise<SqlJsStatic>;
  export default init;
}
declare module 'virtual:wasm' {
  /** sql-wasm-browser.wasm as base64. */
  const base64: string;
  export default base64;
}
declare module 'virtual:migrations' {
  export const migrations: readonly { name: string; sql: string }[];
}
declare module 'virtual:css' {
  /** App CSS (selectors rewritten for the shadow root), without fonts. */
  export const appCss: string;
  /** @font-face rules with data: URLs; they go to document.head. */
  export const fontCss: string;
  /** @property rules; ignored inside shadow roots, so they go to document.head. */
  export const propertyCss: string;
}
declare module 'allotr:shadow-flag' {
  export function enableShadowDOM(): void;
}
