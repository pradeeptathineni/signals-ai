import type { Plugin } from 'vite';
import { loadPublicCorpus } from '../../packages/corpus/src/public-corpus.js';
import { researchQuery } from '../../packages/domain/src/research-query.js';
import { saveQuery } from '../../packages/corpus/src/research-store.js';

/** The development server saves private questions; Pages remains a public read-only view. */
export function localQueries(): Plugin {
  return {
    name: 'signals-local-queries',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split('?')[0] !== '/signals-ai/__signals/query') return next();
        const handle = async () => {
          response.setHeader('content-type', 'application/json');
          response.setHeader('cache-control', 'no-store');
          if (
            request.method !== 'POST' ||
            request.headers.origin !== `http://${request.headers.host}` ||
            request.headers['content-type'] !== 'application/json'
          ) {
            response.statusCode = 403;
            response.end(JSON.stringify({ error: 'Same-origin JSON requests only.' }));
            return;
          }
          const chunks: Buffer[] = [];
          let length = 0;
          for await (const chunk of request) {
            const bytes = Buffer.from(chunk as Uint8Array);
            length += bytes.length;
            if (length > 8192) {
              response.statusCode = 413;
              response.end(JSON.stringify({ error: 'Question exceeds byte budget.' }));
              return;
            }
            chunks.push(bytes);
          }
          const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
            string,
            unknown
          >;
          if (Object.keys(value).join(',') !== 'question' || typeof value.question !== 'string')
            throw new Error('Supply a question.');
          const result = await researchQuery((await loadPublicCorpus()).options, value.question);
          const file = await saveQuery(result, process.env.SIGNALS_QUERY_DIRECTORY);
          response.end(JSON.stringify({ saved: true, id: file.split('/').at(-1) }));
        };
        void handle().catch(() => {
          response.statusCode = 400;
          response.end(JSON.stringify({ error: 'Question could not be saved.' }));
        });
      });
    },
  };
}
