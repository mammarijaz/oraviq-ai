/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Oraviq API origin, without /api/v1. Default http://localhost:3000. */
  readonly VITE_API_URL?: string;
  /** Hauler sites app origin, used for the live website preview. Default http://localhost:4321. */
  readonly VITE_SITES_URL?: string;
  /** Widgets origin (w.js, chat.html, book.html). Default http://localhost:5175. */
  readonly VITE_WIDGETS_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}
