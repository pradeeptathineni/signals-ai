import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/signals-ai/',
  plugins: [react()],
  publicDir: fileURLToPath(new URL('../../dist/public-data', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('../../dist/public-site', import.meta.url)),
    emptyOutDir: true,
  },
  preview: { host: '127.0.0.1', port: 4178, strictPort: true },
});
