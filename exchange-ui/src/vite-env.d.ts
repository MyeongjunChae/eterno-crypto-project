/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_E_TOKEN_TYPE_MAINNET?: string;
  readonly VITE_E_TOKEN_TYPE_TESTNET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
