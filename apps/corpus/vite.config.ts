import { fileURLToPath, URL } from 'node:url';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { localQueries } from './local-query.js';
import { searchApi } from '../../packages/corpus/src/search-api.js';

const queryDirectory = resolve(
  process.env.SIGNALS_QUERY_DIRECTORY || '.signals/queries',
).replaceAll('\\', '/');
if (['[', ']', '{', '}', '*', '?', '!'].some((character) => queryDirectory.includes(character)))
  throw new Error('Private query directory must be a literal path.');

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: '/signals-ai/',
  plugins: [
    react(),
    localQueries(),
    {
      name: 'signals-workbench',
      transformIndexHtml(html, context) {
        return context.server
          ? html.replace('<head>', '<head><script>window.__SIGNALS_LOCAL__=true;</script>')
          : html;
      },
      configureServer(server) {
        const api = searchApi();
        server.middlewares.use((request, response, next) => {
          void api(request, response)
            .then((handled) => {
              if (!handled) next();
            })
            .catch(next);
        });
      },
    },
  ],
  server: {
    host: '127.0.0.1',
    port: 5178,
    strictPort: true,
    fs: {
      deny: [
        '.env',
        '.env.*',
        '.npmrc',
        '.yarnrc.yml',
        '*.{crt,pem,key,p12,pfx,cer,der}',
        '**/.git/**',
        '**/.signals/**',
        '**/.context-ai/lock.json',
        '**/.codex/**',
        `${queryDirectory}/**`,
      ],
    },
  },
  publicDir: fileURLToPath(new URL('../../dist/public-data', import.meta.url)),
  build: {
    outDir: fileURLToPath(new URL('../../dist/public-site', import.meta.url)),
    emptyOutDir: true,
  },
  preview: { host: '127.0.0.1', port: 4178, strictPort: true },
});
