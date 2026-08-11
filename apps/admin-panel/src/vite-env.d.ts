/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_STORE_SLUG?: string;
  readonly VITE_STORE_DASHBOARD_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv; }
