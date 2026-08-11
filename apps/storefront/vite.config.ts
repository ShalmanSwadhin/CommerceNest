import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Prefer TS source so Vite/Rollup can tree-shake named ESM exports
      // (package dist is CJS and breaks named-import analysis).
      '@commercenest/types/schemas/theme': path.resolve(
        __dirname,
        '../../packages/types/src/schemas/theme.ts',
      ),
      '@commercenest/types': path.resolve(
        __dirname,
        '../../packages/types/src/index.ts',
      ),
    },
  },
  server: {
    host: true,
    port: 5175,
    strictPort: true,
    allowedHosts: true,
    fs: { allow: [path.resolve(__dirname, '../..')] },
  },
  preview: { host: true, port: 5175, strictPort: true },
});
