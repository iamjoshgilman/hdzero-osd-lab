// Build-time injected constants. Values are populated by vite.config.ts's
// `define` block and substituted at build as string literals. Declared here
// so strict TS can reference them without an import.

/** App version — read from package.json at build time. */
declare const __APP_VERSION__: string;
